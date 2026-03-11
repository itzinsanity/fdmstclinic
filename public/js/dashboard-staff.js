/**
 * FDMST – Staff Dashboard
 * Powered by: public/dashboard/staff.html
 * Globals: window.API, window.Auth, window.UI, Chart
 */

'use strict';

// ─── Chart Color Palette ──────────────────────────────────────────────────────
const COLORS = ['#0891b2', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

// ─── Chart Registry ───────────────────────────────────────────────────────────
window._charts = {};

// ─── State ────────────────────────────────────────────────────────────────────
let _apptPage        = 1;
let _patientPage     = 1;
let _invPage         = 1;
let _apptFilters     = { status: '', date: '', search: '' };
let _patientSearch   = '';
let _invFilters      = { category: '', search: '' };
let _currentSection  = 'overview';
let _staffTeethUserId = null;

// ─── Pagination Limit ─────────────────────────────────────────────────────────
const PAGE_LIMIT = 10;

// ═════════════════════════════════════════════════════════════════════════════
// 1. INITIALIZATION
// ═════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getUser();
  if (!user || (user.role !== 'staff' && user.role !== 'admin')) {
    Auth.logout();
    return;
  }

  // ── User Info ─────────────────────────────────────────────────────────────
  const fullName    = ((user.firstName || '') + ' ' + (user.lastName || '')).trim() || user.name || user.email || 'Staff';
  const initials    = buildInitials(fullName);
  const nameDisplay = fullName;

  setTextContent('#userAvatar', initials);
  setTextContent('#topbarAvatar', initials);
  setTextContent('#userName', nameDisplay);

  // ── Dates ─────────────────────────────────────────────────────────────────
  const todayStr = formatDate(new Date());
  setTextContent('#topbarDate', todayStr);
  setTextContent('#overviewDate', todayStr);

  // ── Sidebar Navigation ────────────────────────────────────────────────────
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchSection(link.dataset.section);
    });
  });

  // ── Mobile Sidebar Toggle ─────────────────────────────────────────────────
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
    });
  }

  // ── Logout ────────────────────────────────────────────────────────────────
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', e => {
      e.preventDefault();
      Auth.logout();
    });
  }

  // ── Record Search ─────────────────────────────────────────────────────────
  const recordInput = document.getElementById('recordSearchInput');
  if (recordInput) {
    recordInput.addEventListener('input', debounce(debounceRecordSearch, 400));
  }

  // ── Profile dropdown sync ─────────────────────────────────────────────────
  const profileDropNameElS   = document.getElementById('profileDropName');
  const profileDropAvatarElS = document.getElementById('profileDropAvatar');
  if (profileDropNameElS)   profileDropNameElS.textContent   = nameDisplay;
  if (profileDropAvatarElS) profileDropAvatarElS.textContent = initials;

  initDarkMode();
  initSidebarCollapse();

  // ── Default Section ───────────────────────────────────────────────────────
  loadOverview();

  loadNotifications();
  document.addEventListener('click', e => {
    const notifW   = document.getElementById('notifWrapper');
    const profileW = document.getElementById('profileWrapper');
    if (notifW   && !notifW.contains(e.target))   closeNotifDropdown();
    if (profileW && !profileW.contains(e.target)) closeProfileDropdown();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. SIDEBAR NAVIGATION
// ═════════════════════════════════════════════════════════════════════════════
const SECTION_TITLES = {
  overview:     'Overview',
  calendar:     "Today's Schedule",
  appointments: 'Appointments',
  patients:     'Patients',
  records:      'Teeth Records',
  inventory:    'Inventory',
};

function switchSection(name) {
  _currentSection = name;

  // Hide all sections
  document.querySelectorAll('.content-section').forEach(s => {
    s.style.display = 'none';
    s.classList.remove('active');
  });

  // Show target
  const target = document.getElementById('section-' + name);
  if (target) {
    target.style.display = 'block';
    target.classList.add('active');
  }

  // Update sidebar active state
  document.querySelectorAll('[data-section]').forEach(link => {
    link.classList.toggle('active', link.dataset.section === name);
  });

  // Update topbar title
  setTextContent('#topbarTitle', SECTION_TITLES[name] || name);

  // Close mobile sidebar
  const sidebar = document.getElementById('sidebar');
  if (sidebar) sidebar.classList.remove('open');

  // Load section data
  switch (name) {
    case 'overview':     loadOverview();         break;
    case 'calendar':     loadTodaySchedule();    break;
    case 'appointments': loadAppointments();     break;
    case 'patients':     loadPatients();         break;
    case 'records':      /* user searches */     break;
    case 'inventory':    loadInventory();        break;
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 3. OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════
async function loadOverview() {
  setTextContent('#overviewDate', formatDate(new Date()));

  try {
    // ── KPI: Appointments Today ───────────────────────────────────────────
    const todayResp = await API.get('/analytics/appointments-today');
    const todayData = todayResp.data || todayResp;

    const totalToday  = todayData.total        ?? (todayData.appointments ? todayData.appointments.length : 0);
    const pending     = todayData.pending       ?? countByStatus(todayData.appointments, 'pending');
    const confirmed   = todayData.confirmed     ?? countByStatus(todayData.appointments, 'confirmed');

    setTextContent('#kpiToday',     totalToday);
    setTextContent('#kpiPending',   pending);
    setTextContent('#kpiConfirmed', confirmed);

    // ── KPI: Low Stock ────────────────────────────────────────────────────
    try {
      const overviewResp = await API.get('/analytics/overview');
      const overviewData = overviewResp.data || overviewResp;
      setTextContent('#kpiLowStock', overviewData.inventory?.lowStock ?? overviewData.lowStock ?? overviewData.low_stock ?? 0);
    } catch (_) {
      setTextContent('#kpiLowStock', '–');
    }

    // ── Week Chart ────────────────────────────────────────────────────────
    await renderWeekChart();

    // ── Today Services Doughnut ───────────────────────────────────────────
    renderTodayServicesChart(todayData.appointments || todayData.byService || []);

  } catch (err) {
    console.error('loadOverview error:', err);
    UI.showToast('Failed to load overview data.', 'error');
  }
}

function countByStatus(arr, status) {
  if (!Array.isArray(arr)) return 0;
  return arr.filter(a => (a.status || '').toLowerCase() === status).length;
}

async function renderWeekChart() {
  const labels = [];
  const counts = [];
  const today = new Date();

  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    labels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
    counts.push(0);
  }

  try {
    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - 6);
    const from = startDate.toISOString().slice(0, 10);
    const to   = today.toISOString().slice(0, 10);

    const resp = await API.get(`/appointments?from=${from}&to=${to}&limit=500`);
    const appointments = resp.data || resp.appointments || resp || [];
    const list = Array.isArray(appointments) ? appointments : (appointments.appointments || []);

    list.forEach(appt => {
      const apptDate = new Date(appt.appointmentDate || appt.date || appt.appointment_date || appt.scheduledAt);
      const diffMs = today - apptDate;
      const diffDays = Math.floor(diffMs / 86400000);
      const idx = 6 - diffDays;
      if (idx >= 0 && idx < 7) counts[idx]++;
    });
  } catch (_) { /* use zeros */ }

  const canvas = document.getElementById('chartWeek');
  if (!canvas) return;

  destroyChart('chartWeek');
  window._charts['chartWeek'] = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Appointments',
        data: counts,
        backgroundColor: COLORS[0] + 'cc',
        borderColor: COLORS[0],
        borderWidth: 2,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: 'index' },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { stepSize: 1, precision: 0 },
          grid: { color: '#e2e8f0' },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderTodayServicesChart(source) {
  const canvas = document.getElementById('chartTodayServices');
  if (!canvas) return;

  let serviceMap = {};

  if (Array.isArray(source)) {
    source.forEach(item => {
      // Either an appointment object or a { service, count } summary
      const svc = item.service || item.serviceName || item.service_name || 'Other';
      const cnt = item.count ?? 1;
      serviceMap[svc] = (serviceMap[svc] || 0) + cnt;
    });
  } else if (source && typeof source === 'object') {
    serviceMap = source;
  }

  const labels = Object.keys(serviceMap);
  const data   = Object.values(serviceMap);

  if (labels.length === 0) {
    labels.push('No Data');
    data.push(1);
  }

  destroyChart('chartTodayServices');
  window._charts['chartTodayServices'] = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: COLORS,
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 14, padding: 16 } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed}` } },
      },
    },
  });
}

// ═════════════════════════════════════════════════════════════════════════════
// 4. TODAY'S SCHEDULE
// ═════════════════════════════════════════════════════════════════════════════
async function loadTodaySchedule() {
  setTextContent('#todayDateLabel', formatDate(new Date()));
  const container = document.getElementById('todayAppointments');
  if (!container) return;

  container.innerHTML = '<p class="loading-text">Loading schedule…</p>';

  try {
    const resp = await API.get('/analytics/appointments-today');
    const data = resp.data || resp;
    const appointments = data.appointments || data || [];
    const list = Array.isArray(appointments) ? appointments : [];

    if (list.length === 0) {
      container.innerHTML = '<p class="empty-state">No appointments scheduled for today.</p>';
      return;
    }

    // Sort by time
    list.sort((a, b) => {
      const ta = a.timeSlot?.start || a.time || a.appointment_time || '';
      const tb = b.timeSlot?.start || b.time || b.appointment_time || '';
      return ta.localeCompare(tb);
    });

    container.innerHTML = `<div class="schedule-list">${list.map(appt => buildScheduleCard(appt)).join('')}</div>`;

  } catch (err) {
    console.error('loadTodaySchedule error:', err);
    container.innerHTML = '<p class="error-state">Failed to load today\'s schedule.</p>';
  }
}

function buildScheduleCard(appt) {
  const id        = appt._id || appt.id;
  const time      = appt.timeSlot?.start || appt.time || appt.appointment_time || '—';
  const patient   = appt.patientName || appt.patient_name || (appt.patient && ((appt.patient.firstName || '') + ' ' + (appt.patient.lastName || '')).trim()) || 'Unknown Patient';
  const contact   = appt.patientPhone || appt.patient_phone || (appt.patient && appt.patient.phone) || '';
  const service   = appt.service || appt.serviceName || '—';
  const status    = (appt.status || 'pending').toLowerCase();
  const badge     = statusBadge(status);

  const actions = buildActionButtons(id, status, 'loadTodaySchedule');

  return `
    <div class="schedule-card schedule-card--${status}" data-id="${id}">
      <div class="schedule-card__time">${escHtml(time)}</div>
      <div class="schedule-card__info">
        <div class="schedule-card__patient">
          <span class="schedule-card__name">${escHtml(patient)}</span>
          ${contact ? `<span class="schedule-card__contact">${escHtml(contact)}</span>` : ''}
        </div>
        <div class="schedule-card__service">${escHtml(service)}</div>
      </div>
      <div class="schedule-card__meta">
        ${badge}
        <div class="schedule-card__actions">${actions}</div>
      </div>
    </div>`;
}

// ═════════════════════════════════════════════════════════════════════════════
// 5. APPOINTMENTS
// ═════════════════════════════════════════════════════════════════════════════
async function loadAppointments(page) {
  if (page !== undefined) _apptPage = page;
  const tbody = document.getElementById('apptTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>';

  // Bind filters
  const statusSel = document.getElementById('apptStatusFilter');
  const dateSel   = document.getElementById('apptDateFilter');
  const searchEl  = document.getElementById('apptSearch');
  if (statusSel) _apptFilters.status = statusSel.value;
  if (dateSel)   _apptFilters.date   = dateSel.value;
  if (searchEl)  _apptFilters.search = searchEl.value.trim();

  // Wire filter events once
  if (statusSel && !statusSel._bound) {
    statusSel.addEventListener('change', () => loadAppointments(1));
    statusSel._bound = true;
  }
  if (dateSel && !dateSel._bound) {
    dateSel.addEventListener('change', () => loadAppointments(1));
    dateSel._bound = true;
  }
  if (searchEl && !searchEl._bound) {
    searchEl.addEventListener('input', debounce(() => { _apptFilters.search = searchEl.value.trim(); loadAppointments(1); }, 400));
    searchEl._bound = true;
  }

  let url = `/appointments?page=${_apptPage}&limit=${PAGE_LIMIT}`;
  if (_apptFilters.status) url += `&status=${_apptFilters.status}`;
  if (_apptFilters.date)   url += `&date=${_apptFilters.date}`;
  if (_apptFilters.search) url += `&search=${encodeURIComponent(_apptFilters.search)}`;

  try {
    const resp = await API.get(url);
    const data        = resp.data || resp;
    const list        = Array.isArray(data) ? data : (data.appointments || data.data || []);
    const total       = data.total || list.length;
    const pages       = data.pages || Math.ceil(total / PAGE_LIMIT) || 1;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No appointments found.</td></tr>';
      renderPagination('apptPagination', total, _apptPage, pages, loadAppointments);
      return;
    }

    tbody.innerHTML = list.map(appt => buildApptRow(appt)).join('');
    renderPagination('apptPagination', total, _apptPage, pages, loadAppointments);
    updatePendingBadge(list);

  } catch (err) {
    console.error('loadAppointments error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to load appointments.</td></tr>';
  }
}

function buildApptRow(appt) {
  const id      = appt._id || appt.id;
  const patient = appt.patientName || appt.patient_name || (appt.patient && ((appt.patient.firstName || '') + ' ' + (appt.patient.lastName || '')).trim()) || '—';
  const service = appt.service || appt.serviceName || '—';
  const date    = appt.appointmentDate ? new Date(appt.appointmentDate).toLocaleDateString() : appt.date ? new Date(appt.date).toLocaleDateString() : '—';
  const time    = appt.timeSlot?.start || appt.time || appt.appointment_time || '—';
  const status  = (appt.status || 'pending').toLowerCase();

  return `
    <tr>
      <td>${escHtml(patient)}</td>
      <td>${escHtml(service)}</td>
      <td>${escHtml(date)}</td>
      <td>${escHtml(time)}</td>
      <td>${statusBadge(status)}</td>
      <td>
        <button class="btn btn--sm btn--outline" onclick="openApptModal('${id}')">View</button>
      </td>
    </tr>`;
}

async function openApptModal(id) {
  try {
    const resp = await API.get(`/appointments/${id}`);
    const appt = resp.data || resp;
    const status = (appt.status || 'pending').toLowerCase();

    const patient = appt.patientName || appt.patient_name || (appt.patient && ((appt.patient.firstName || '') + ' ' + (appt.patient.lastName || '')).trim()) || '—';
    const service = appt.service || appt.serviceName || '—';
    const date    = appt.appointmentDate ? new Date(appt.appointmentDate).toLocaleDateString() : appt.date ? new Date(appt.date).toLocaleDateString() : '—';
    const time    = appt.timeSlot?.start || appt.time || appt.appointment_time || '—';
    const notes   = appt.notes || appt.reason || '';

    const completeSummaryField = status !== 'completed' && status !== 'cancelled'
      ? `<div class="form-group" id="treatmentSummaryGroup" style="display:none">
           <label class="form-label">Treatment Summary</label>
           <textarea id="treatmentSummary" class="form-input" rows="3" placeholder="Enter treatment summary…"></textarea>
         </div>`
      : '';

    const bodyHtml = `
      <div class="appt-detail">
        <div class="detail-row"><span class="detail-label">Patient</span><span>${escHtml(patient)}</span></div>
        <div class="detail-row"><span class="detail-label">Service</span><span>${escHtml(service)}</span></div>
        <div class="detail-row"><span class="detail-label">Date</span><span>${escHtml(date)}</span></div>
        <div class="detail-row"><span class="detail-label">Time</span><span>${escHtml(time)}</span></div>
        <div class="detail-row"><span class="detail-label">Status</span><span>${statusBadge(status)}</span></div>
        ${notes ? `<div class="detail-row"><span class="detail-label">Notes</span><span>${escHtml(notes)}</span></div>` : ''}
        ${completeSummaryField}
        <div class="modal-actions">
          ${buildActionButtons(id, status, 'loadAppointments', true)}
        </div>
      </div>`;

    setInnerHTML('#apptModalBody', bodyHtml);
    setTextContent('#apptModalTitle', 'Appointment Details');
    openModal('apptModal');

  } catch (err) {
    console.error('openApptModal error:', err);
    UI.showToast('Failed to load appointment details.', 'error');
  }
}

function buildActionButtons(id, status, reloadFn, modal = false) {
  const closeCall = modal ? "closeModal('apptModal');" : '';

  switch (status) {
    case 'pending':
      return `
        <button class="btn btn--sm btn--primary" onclick="${closeCall}updateApptStatus('${id}','confirmed','${reloadFn}')">Confirm</button>
        <button class="btn btn--sm btn--danger"  onclick="${closeCall}cancelApptPrompt('${id}','${reloadFn}')">Cancel</button>`;
    case 'confirmed':
      return `
        <button class="btn btn--sm btn--success" onclick="showTreatmentSummaryField('${id}','${reloadFn}')">Complete</button>
        <button class="btn btn--sm btn--danger"  onclick="${closeCall}cancelApptPrompt('${id}','${reloadFn}')">Cancel</button>`;
    case 'completed':
    case 'cancelled':
      return `<span class="text-muted text-sm">${status === 'completed' ? 'Completed' : 'Cancelled'}</span>`;
    default:
      return '';
  }
}

function showTreatmentSummaryField(id, reloadFn) {
  const group = document.getElementById('treatmentSummaryGroup');
  if (group) {
    group.style.display = 'block';
    const actionsDiv = group.nextElementSibling;
    if (actionsDiv) {
      actionsDiv.innerHTML = `
        <button class="btn btn--sm btn--success" onclick="submitCompleteAppt('${id}','${reloadFn}')">Confirm Complete</button>
        <button class="btn btn--sm btn--outline" onclick="closeModal('apptModal')">Cancel</button>`;
    }
  }
}

async function submitCompleteAppt(id, reloadFn) {
  const summaryEl = document.getElementById('treatmentSummary');
  const summary   = summaryEl ? summaryEl.value.trim() : '';
  closeModal('apptModal');
  await updateApptStatus(id, 'completed', reloadFn, { treatmentSummary: summary });
}

function cancelApptPrompt(id, reloadFn) {
  if (confirm('Are you sure you want to cancel this appointment?')) {
    updateApptStatus(id, 'cancelled', reloadFn);
  }
}

async function updateApptStatus(id, status, reloadFn, extra = {}) {
  try {
    await API.patch(`/appointments/${id}/status`, { status, ...extra });
    UI.showToast(`Appointment marked as ${status}.`, 'success');

    if (reloadFn === 'loadAppointments') loadAppointments();
    else if (reloadFn === 'loadTodaySchedule') loadTodaySchedule();

    refreshPendingBadge();
  } catch (err) {
    console.error('updateApptStatus error:', err);
    UI.showToast('Failed to update appointment status.', 'error');
  }
}

async function refreshPendingBadge() {
  try {
    const resp = await API.get('/analytics/appointments-today');
    const data = resp.data || resp;
    const pending = data.pending ?? countByStatus(data.appointments, 'pending');
    const badge = document.getElementById('pendingBadge');
    if (badge) {
      badge.textContent = pending;
      badge.style.display = pending > 0 ? 'inline-flex' : 'none';
    }
  } catch (_) { /* silent */ }
}

function updatePendingBadge(list) {
  const pending = list.filter(a => (a.status || '').toLowerCase() === 'pending').length;
  const badge = document.getElementById('pendingBadge');
  if (badge) {
    badge.textContent = pending;
    badge.style.display = pending > 0 ? 'inline-flex' : 'none';
  }
}

function debounceApptSearch() {
  _apptFilters.search = (document.getElementById('apptSearch') || {}).value || '';
  _apptPage = 1;
  loadAppointments();
}

// ═════════════════════════════════════════════════════════════════════════════
// 6. PATIENTS
// ═════════════════════════════════════════════════════════════════════════════
async function loadPatients(page) {
  if (page !== undefined) _patientPage = page;
  const tbody = document.getElementById('patientTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>';

  const searchEl = document.getElementById('patientSearch');
  if (searchEl && !searchEl._bound) {
    searchEl.addEventListener('input', debounce(() => {
      _patientSearch = searchEl.value.trim();
      loadPatients(1);
    }, 400));
    searchEl._bound = true;
  }

  let url = `/patients?page=${_patientPage}&limit=${PAGE_LIMIT}`;
  if (_patientSearch) url += `&search=${encodeURIComponent(_patientSearch)}`;

  try {
    const resp = await API.get(url);
    const data    = resp.data || resp;
    const list    = Array.isArray(data) ? data : (data.patients || data.data || []);
    const total   = data.total || list.length;
    const pages   = data.pages || Math.ceil(total / PAGE_LIMIT) || 1;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No patients found.</td></tr>';
      renderPagination('patientPagination', total, _patientPage, pages, loadPatients);
      return;
    }

    tbody.innerHTML = list.map(p => buildPatientRow(p)).join('');
    renderPagination('patientPagination', total, _patientPage, pages, loadPatients);

  } catch (err) {
    console.error('loadPatients error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to load patients.</td></tr>';
  }
}

function buildPatientRow(patient) {
  const id         = patient._id || patient.id || '';
  const shortId    = id.slice(-6).toUpperCase();
  const name       = ((patient.firstName || '') + ' ' + (patient.lastName || '')).trim() || patient.name || patient.fullName || patient.full_name || '—';
  const email      = patient.email || '—';
  const phone      = patient.phone || patient.phoneNumber || '—';
  const gender     = patient.gender || '—';
  const registered = patient.createdAt || patient.created_at
    ? new Date(patient.createdAt || patient.created_at).toLocaleDateString()
    : '—';
  const initials   = buildInitials(name);

  return `
    <tr>
      <td class="text-muted text-sm">#${shortId}</td>
      <td>
        <div class="patient-cell">
          <span class="avatar avatar--sm">${initials}</span>
          <span>${escHtml(name)}</span>
        </div>
      </td>
      <td>${escHtml(email)}</td>
      <td>${escHtml(phone)}</td>
      <td>${escHtml(gender)}</td>
      <td>${escHtml(registered)}</td>
      <td>
        <button class="btn btn--sm btn--outline" onclick="openPatientModal(${JSON.stringify(JSON.stringify(patient))})">View</button>
      </td>
    </tr>`;
}

function openPatientModal(patientJson) {
  let patient;
  try {
    patient = typeof patientJson === 'string' ? JSON.parse(patientJson) : patientJson;
  } catch (_) { return; }

  const name       = ((patient.firstName || '') + ' ' + (patient.lastName || '')).trim() || patient.name || patient.fullName || '—';
  const email      = patient.email      || '—';
  const phone      = patient.phone      || patient.phoneNumber || '—';
  const gender     = patient.gender     || '—';
  const dob        = patient.dob        || patient.dateOfBirth
    ? new Date(patient.dob || patient.dateOfBirth).toLocaleDateString()
    : '—';
  const address    = patient.address    || '—';
  const bloodType  = patient.bloodType  || patient.blood_type  || '—';
  const allergies  = patient.allergies  || '—';
  const registered = patient.createdAt  || patient.created_at
    ? new Date(patient.createdAt || patient.created_at).toLocaleDateString()
    : '—';

  const bodyHtml = `
    <div class="patient-profile">
      <div class="patient-profile__header">
        <span class="avatar avatar--lg">${buildInitials(name)}</span>
        <div>
          <h3 class="patient-profile__name">${escHtml(name)}</h3>
          <p class="text-muted text-sm">Registered: ${escHtml(registered)}</p>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-row"><span class="detail-label">Email</span><span>${escHtml(email)}</span></div>
        <div class="detail-row"><span class="detail-label">Phone</span><span>${escHtml(phone)}</span></div>
        <div class="detail-row"><span class="detail-label">Gender</span><span>${escHtml(gender)}</span></div>
        <div class="detail-row"><span class="detail-label">Date of Birth</span><span>${escHtml(dob)}</span></div>
        <div class="detail-row"><span class="detail-label">Address</span><span>${escHtml(address)}</span></div>
        <div class="detail-row"><span class="detail-label">Blood Type</span><span>${escHtml(bloodType)}</span></div>
        <div class="detail-row"><span class="detail-label">Allergies</span><span>${escHtml(allergies)}</span></div>
      </div>
    </div>`;

  setInnerHTML('#patientModalBody', bodyHtml);
  setTextContent('#patientModalTitle', 'Patient Profile');
  openModal('patientModal');
}

// ═════════════════════════════════════════════════════════════════════════════
// 7. TEETH RECORDS (FDI) — READ-ONLY VIEW FOR STAFF
// ═════════════════════════════════════════════════════════════════════════════

const FDI_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const TOOTH_CONDITION_COLORS = {
  healthy:         '#22c55e',
  decayed:         '#ef4444',
  filled:          '#3b82f6',
  missing:         '#94a3b8',
  crowned:         '#f59e0b',
  implant:         '#8b5cf6',
  bridge:          '#06b6d4',
  veneer:          '#ec4899',
  needs_treatment: '#f97316',
};

function toothCellStaff(num, condition, notes, editable = false) {
  const cond  = condition || 'healthy';
  const label = cond.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const title = `Tooth ${num} – ${label}${notes ? ': ' + notes : ''}`;
  const onclick = editable ? `onclick="openToothModal(${num})"` : '';
  return `<div class="tooth-btn ${cond}" title="${escHtml(title)}" ${onclick}>${num}</div>`;
}

function renderTeethChartStaff(record, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const chartMap = {};
  if (record && record.dentalChart && typeof record.dentalChart === 'object') {
    Object.keys(record.dentalChart).forEach(key => {
      const entry = record.dentalChart[key];
      chartMap[parseInt(key, 10)] = {
        condition: (entry && entry.condition) || 'healthy',
        notes:     (entry && entry.notes)     || '',
      };
    });
  }

  const upperHtml = FDI_UPPER.map(n => toothCellStaff(n, (chartMap[n] || {}).condition, (chartMap[n] || {}).notes, true)).join('');
  const lowerHtml = FDI_LOWER.map(n => toothCellStaff(n, (chartMap[n] || {}).condition, (chartMap[n] || {}).notes, true)).join('');

  const legendHtml = Object.entries(TOOTH_CONDITION_COLORS).map(([cond, color]) => `
    <div class="legend-item">
      <div class="legend-dot" style="background:${color};"></div>
      <span>${cond.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="teeth-chart-container">
      <div class="teeth-chart-header">
        <span class="teeth-chart-title"><i class="fa-solid fa-tooth" style="color:var(--primary);margin-right:.5rem;"></i>FDI Dental Chart</span>
        <span class="text-sm text-muted">Hover a tooth to see its condition</span>
      </div>
      <div class="teeth-chart-body">
        <div class="teeth-arch">
          <div class="teeth-arch-label">Upper Jaw</div>
          <div class="teeth-row" style="justify-content:center;flex-wrap:nowrap;overflow-x:auto;">${upperHtml}</div>
        </div>
        <div style="border-top:2px dashed var(--border);margin:.75rem auto;width:90%;"></div>
        <div class="teeth-arch">
          <div class="teeth-row" style="justify-content:center;flex-wrap:nowrap;overflow-x:auto;">${lowerHtml}</div>
          <div class="teeth-arch-label" style="margin-top:.625rem;">Lower Jaw</div>
        </div>
        <div class="teeth-legend">${legendHtml}</div>
      </div>
    </div>`;
}

async function debounceRecordSearch() {
  const input    = document.getElementById('recordSearchInput');
  const dropdown = document.getElementById('recordSearchDropdown');
  if (!input || !dropdown) return;

  const query = input.value.trim();
  if (!query) {
    dropdown.innerHTML = '';
    dropdown.style.display = 'none';
    return;
  }

  try {
    const resp = await API.get(`/patients?search=${encodeURIComponent(query)}&limit=8`);
    const data  = resp.data || resp;
    const list  = Array.isArray(data) ? data : (data.patients || data.data || []);

    if (list.length === 0) {
      dropdown.innerHTML = '<div class="dropdown-item dropdown-item--empty">No patients found</div>';
      dropdown.style.display = 'block';
      return;
    }

    dropdown.innerHTML = list.map(p => {
      const id        = p._id || p.id;
      const firstName = p.firstName || '';
      const lastName  = p.lastName  || '';
      const name      = `${firstName} ${lastName}`.trim() || p.name || '—';
      return `<div class="dropdown-item" onclick="selectRecordPatient('${id}','${escHtml(name).replace(/'/g, "\\'")}')">
        ${escHtml(name)}
      </div>`;
    }).join('');
    dropdown.style.display = 'block';

  } catch (err) {
    console.error('debounceRecordSearch error:', err);
  }
}

function selectRecordPatient(userId, name) {
  const input    = document.getElementById('recordSearchInput');
  const dropdown = document.getElementById('recordSearchDropdown');
  if (input)    input.value = name;
  if (dropdown) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; }
  loadTeethRecord(userId);
}

async function loadTeethRecord(userId) {
  const container = document.getElementById('recordsContent');
  if (!container) return;

  _staffTeethUserId = userId;
  container.innerHTML = '<p class="loading-text">Loading teeth record…</p>';

  try {
    const resp   = await API.get(`/records/${userId}`);
    const record = resp.data || resp.record || resp;

    const patient   = record.patientUser || record.patient || {};
    const firstName = patient.firstName || '';
    const lastName  = patient.lastName  || '';
    const fullName  = `${firstName} ${lastName}`.trim() || '—';
    const history   = record.treatmentHistory || [];

    container.innerHTML = `
      <div class="record-patient-header">
        <div class="user-avatar user-avatar--lg">${escHtml(buildInitials(fullName))}</div>
        <div>
          <h2 class="record-patient-name">${escHtml(fullName)}</h2>
          <div class="record-patient-email text-muted">${escHtml(patient.email || '—')}</div>
        </div>
      </div>

      <div class="kpi-grid" style="margin-bottom:1.25rem;">
        <div class="kpi-card kpi-green">
          <div class="kpi-icon"><i class="fa-solid fa-tooth"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:1rem;">${escHtml(record.oralHygieneRating || '—')}</span>
            <span class="kpi-label">Oral Hygiene</span>
          </div>
        </div>
        <div class="kpi-card kpi-purple">
          <div class="kpi-icon"><i class="fa-solid fa-stethoscope"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:1rem;">${escHtml(record.periodontalStatus || '—')}</span>
            <span class="kpi-label">Periodontal</span>
          </div>
        </div>
        ${record.allergiesNotes ? `
        <div class="kpi-card kpi-red">
          <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:.875rem;">${escHtml(record.allergiesNotes)}</span>
            <span class="kpi-label">Allergies</span>
          </div>
        </div>` : ''}
      </div>

      <div id="teethChartContainerStaff" style="margin-bottom:1.25rem;"></div>

      <h3 class="section-sub-heading">Treatment History</h3>
      ${history.length ? `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Dentist</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h => {
                const dentist = h.dentist || {};
                const dentistName = typeof dentist === 'object'
                  ? `${dentist.firstName || ''} ${dentist.lastName || ''}`.trim() || '—'
                  : String(dentist || '—');
                const dateStr = h.date || h.createdAt
                  ? new Date(h.date || h.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : '—';
                return `
                  <tr>
                    <td>${dateStr}</td>
                    <td><strong>${escHtml(h.service || h.serviceType || '—')}</strong></td>
                    <td>${escHtml(dentistName)}</td>
                    <td class="text-muted">${escHtml(h.notes || '—')}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '<div class="empty-state"><i class="fa-solid fa-clock-rotate-left"></i><p>No treatment history on record.</p></div>'}
    `;

    renderTeethChartStaff(record, 'teethChartContainerStaff');

  } catch (err) {
    console.error('loadTeethRecord error:', err);
    container.innerHTML = '<p class="error-state">Failed to load teeth record. Patient may not have a record yet.</p>';
  }
}

// ─── Tooth Edit ───────────────────────────────────────────────────────────────
function openToothModal(toothNum) {
  if (!_staffTeethUserId) { UI.showToast('No patient selected.', 'warning'); return; }

  const labelEl  = document.getElementById('toothModalLabel');
  const condEl   = document.getElementById('toothCondition');
  const notesEl  = document.getElementById('toothNotes');

  if (labelEl) labelEl.textContent = `Edit Tooth ${toothNum}`;
  if (notesEl) notesEl.value = '';

  // Pre-fill from chart
  const container = document.getElementById('teethChartContainerStaff');
  const cell = container && container.querySelector(`[title^="Tooth ${toothNum}"]`);
  if (cell && condEl) {
    const titleStr  = cell.getAttribute('title') || '';
    const condMatch = titleStr.match(/–\s*([^:]+)/);
    if (condMatch) {
      const raw = condMatch[1].trim().toLowerCase().replace(/\s+/g, '_');
      condEl.value = raw;
    }
    const notesMatch = titleStr.match(/:\s*(.+)$/);
    if (notesMatch && notesEl) notesEl.value = notesMatch[1].trim();
  }

  const saveBtn = document.getElementById('toothModalSaveBtn');
  if (saveBtn) saveBtn.onclick = () => saveToothCondition(toothNum);

  openModal('toothModal');
}

async function saveToothCondition(toothNum) {
  if (!_staffTeethUserId) return;
  const condition = document.getElementById('toothCondition')?.value || 'healthy';
  const notes     = document.getElementById('toothNotes')?.value || '';

  try {
    const currentRes = await API.get(`/records/${_staffTeethUserId}`);
    const record = currentRes.data || currentRes.record || currentRes;

    const dentalChart = {};
    if (record.dentalChart && typeof record.dentalChart === 'object') {
      Object.keys(record.dentalChart).forEach(k => { dentalChart[k] = record.dentalChart[k]; });
    }
    dentalChart[String(toothNum)] = { condition, notes };

    await API.patch(`/records/${_staffTeethUserId}`, { dentalChart });
    UI.showToast(`Tooth ${toothNum} updated.`, 'success');
    closeModal('toothModal');
    loadTeethRecord(_staffTeethUserId);
  } catch (err) {
    console.error('saveToothCondition error:', err);
    UI.showToast(err.message || 'Failed to save tooth condition.', 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 8. INVENTORY
// ═════════════════════════════════════════════════════════════════════════════
async function loadInventory(page) {
  if (page !== undefined) _invPage = page;
  const tbody = document.getElementById('invTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell">Loading…</td></tr>';

  const catSel   = document.getElementById('invCategoryFilter');
  const searchEl = document.getElementById('invSearch');
  if (catSel   && !catSel._bound)   { catSel.addEventListener('change', () => loadInventory(1));   catSel._bound   = true; }
  if (searchEl && !searchEl._bound) { searchEl.addEventListener('input', debounce(() => { _invFilters.search = searchEl.value.trim(); loadInventory(1); }, 400)); searchEl._bound = true; }

  if (catSel)   _invFilters.category = catSel.value;
  if (searchEl) _invFilters.search   = searchEl.value.trim();

  let url = `/inventory?page=${_invPage}&limit=${PAGE_LIMIT}`;
  if (_invFilters.category) url += `&category=${encodeURIComponent(_invFilters.category)}`;
  if (_invFilters.search)   url += `&search=${encodeURIComponent(_invFilters.search)}`;

  // Wire Add button
  const addBtn = document.getElementById('addInventoryBtn');
  if (addBtn && !addBtn._bound) {
    addBtn.addEventListener('click', openAddInventoryModal);
    addBtn._bound = true;
  }

  try {
    const resp = await API.get(url);
    const data  = resp.data || resp;
    const list  = Array.isArray(data) ? data : (data.items || data.inventory || data.data || []);
    const total = data.total || list.length;
    const pages = data.pages || Math.ceil(total / PAGE_LIMIT) || 1;

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-cell">No inventory items found.</td></tr>';
      renderPagination('invPagination', total, _invPage, pages, loadInventory);
      return;
    }

    tbody.innerHTML = list.map(item => buildInvRow(item)).join('');
    renderPagination('invPagination', total, _invPage, pages, loadInventory);

  } catch (err) {
    console.error('loadInventory error:', err);
    tbody.innerHTML = '<tr><td colspan="7" class="error-cell">Failed to load inventory.</td></tr>';
  }
}

function buildInvRow(item) {
  const id          = item._id || item.id;
  const name        = item.name || '—';
  const category    = item.category || '—';
  const stock       = item.stock ?? item.quantity ?? 0;
  const unit        = item.unit || '—';
  const reorderPt   = item.reorderPoint || item.reorder_point || 0;
  const isLow       = stock <= reorderPt;
  const stockClass  = isLow ? 'text-danger' : stock <= reorderPt * 1.5 ? 'text-warning' : 'text-success';
  const statusBadgeHtml = isLow
    ? '<span class="badge badge--danger">Low Stock</span>'
    : '<span class="badge badge--success">Adequate</span>';

  return `
    <tr>
      <td>${escHtml(name)}</td>
      <td><span class="badge badge--blue">${escHtml(category)}</span></td>
      <td class="${stockClass} font-bold">${stock}</td>
      <td>${escHtml(unit)}</td>
      <td>${reorderPt}</td>
      <td>${statusBadgeHtml}</td>
      <td>
        <button class="btn btn--sm btn--outline" onclick="openAdjustStockModal(${JSON.stringify(JSON.stringify(item))})">Adjust Stock</button>
      </td>
    </tr>`;
}

function openAddInventoryModal(item = null) {
  const form    = document.getElementById('addInvForm');
  const idInput = document.getElementById('invItemId');
  const titleEl = document.getElementById('addInvTitle');

  if (form) form.reset();
  if (idInput) idInput.value = item ? (item._id || '') : '';
  if (titleEl) titleEl.textContent = item ? 'Edit Inventory Item' : 'Add Inventory Item';

  if (item) {
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    set('invName',     item.name     || '');
    set('invCategory', item.category || '');
    set('invQty',      item.quantity ?? 0);
    set('invUnit',     item.unit     || '');
    set('invMinStock', item.minimumStock ?? 5);
    set('invReorder',  item.reorderPoint ?? 10);
  }

  openModal('addInvModal');
}

async function submitInventoryForm() {
  const name     = (document.getElementById('invName')     || {}).value?.trim() || '';
  const category = (document.getElementById('invCategory') || {}).value?.trim() || '';
  const quantity = parseInt((document.getElementById('invQty')      || {}).value, 10) || 0;
  const unit     = (document.getElementById('invUnit')     || {}).value?.trim() || '';
  const minStock = parseInt((document.getElementById('invMinStock') || {}).value, 10) || 5;
  const reorder  = parseInt((document.getElementById('invReorder')  || {}).value, 10) || 10;
  const editId   = (document.getElementById('invItemId')   || {}).value?.trim() || '';

  if (!name)     { UI.showToast('Item name is required.',  'warning'); return; }
  if (!category) { UI.showToast('Category is required.',   'warning'); return; }

  const payload = { name, category, quantity, unit, minimumStock: minStock, reorderPoint: reorder };

  try {
    if (editId) {
      await API.put(`/inventory/${editId}`, payload);
      UI.showToast('Inventory item updated.', 'success');
    } else {
      await API.post('/inventory', payload);
      UI.showToast('Inventory item added.', 'success');
    }
    closeModal('addInvModal');
    loadInventory();
  } catch (err) {
    console.error('submitInventoryForm error:', err);
    UI.showToast(err.message || 'Failed to save inventory item.', 'error');
  }
}

function openAdjustStockModal(itemJson) {
  let item;
  try {
    item = typeof itemJson === 'string' ? JSON.parse(itemJson) : itemJson;
  } catch (_) { return; }

  const id    = item._id || item.id;
  const name  = item.name || '—';
  const stock = item.stock ?? item.quantity ?? 0;

  const bodyHtml = `
    <div class="detail-row"><span class="detail-label">Item</span><span>${escHtml(name)}</span></div>
    <div class="detail-row"><span class="detail-label">Current Stock</span><span class="font-bold">${stock}</span></div>
    <div class="form-group" style="margin-top:1rem">
      <label class="form-label">Adjustment Type</label>
      <select id="adjustType" class="form-input">
        <option value="add">Add Stock</option>
        <option value="remove">Remove Stock</option>
        <option value="set">Set Exact Value</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Quantity *</label>
      <input id="adjustQty" class="form-input" type="number" min="0" required placeholder="0" />
    </div>
    <div class="form-group">
      <label class="form-label">Reason</label>
      <input id="adjustReason" class="form-input" type="text" placeholder="Optional reason" />
    </div>
    <input type="hidden" id="adjustItemId" value="${id}" />
    <input type="hidden" id="adjustCurrentStock" value="${stock}" />
    <div class="modal-actions">
      <button class="btn btn--primary" onclick="submitStockAdjust()">Apply Adjustment</button>
      <button class="btn btn--outline" onclick="closeModal('adjustStockModal')">Cancel</button>
    </div>`;

  setInnerHTML('#adjustStockModalBody', bodyHtml);
  setTextContent('#adjustStockModalTitle', 'Adjust Stock – ' + name);
  openModal('adjustStockModal');
}

async function submitStockAdjust() {
  const id           = getValue('#adjustItemId');
  const currentStock = parseInt(getValue('#adjustCurrentStock'), 10) || 0;
  const type         = getValue('#adjustType');
  const qty          = parseInt(getValue('#adjustQty'), 10) || 0;
  const reason       = getValue('#adjustReason');

  let newStock;
  switch (type) {
    case 'add':    newStock = currentStock + qty; break;
    case 'remove': newStock = Math.max(0, currentStock - qty); break;
    case 'set':    newStock = qty; break;
    default:       newStock = currentStock;
  }

  try {
    await API.patch(`/inventory/${id}/adjust`, { action: type==='add'?'restock':type==='remove'?'use':'adjustment', quantity: qty, notes: reason });
    UI.showToast('Stock updated successfully.', 'success');
    closeModal('adjustStockModal');
    loadInventory();
  } catch (err) {
    console.error('submitStockAdjust error:', err);
    UI.showToast('Failed to update stock.', 'error');
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 9. HELPERS
// ═════════════════════════════════════════════════════════════════════════════

/** Open a modal by ID */
function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'flex';
  modal.classList.add('open');
  modal.setAttribute('aria-hidden', 'false');

  // Close on backdrop click
  if (!modal._backdropBound) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeModal(id);
    });
    modal._backdropBound = true;
  }
  document.body.style.overflow = 'hidden';
}

/** Close a modal by ID */
function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'none';
  modal.classList.remove('open');
  modal.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/** Toggle password visibility */
function togglePwd(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (icon) icon.textContent = '🙈';
  } else {
    input.type = 'password';
    if (icon) icon.textContent = '👁';
  }
}

/** Render pagination controls */
function renderPagination(containerId, total, page, pages, cb) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (pages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = `<div class="pagination">`;
  html += `<span class="pagination__info">Page ${page} of ${pages} (${total} total)</span>`;
  html += `<div class="pagination__controls">`;

  if (page > 1) {
    html += `<button class="btn btn--sm btn--outline" onclick="${cb.name}(${page - 1})">« Prev</button>`;
  }

  const start = Math.max(1, page - 2);
  const end   = Math.min(pages, page + 2);

  for (let i = start; i <= end; i++) {
    const active = i === page ? 'btn--primary' : 'btn--outline';
    html += `<button class="btn btn--sm ${active}" onclick="${cb.name}(${i})">${i}</button>`;
  }

  if (page < pages) {
    html += `<button class="btn btn--sm btn--outline" onclick="${cb.name}(${page + 1})">Next »</button>`;
  }

  html += `</div></div>`;
  container.innerHTML = html;
}

/** Debounce utility */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/** Format a Date to locale string */
function formatDate(d) {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Generate star rating HTML */
function stars(n) {
  const rating = Math.round(Math.max(0, Math.min(5, n)));
  return '★'.repeat(rating) + '☆'.repeat(5 - rating);
}

/** Escape HTML special chars */
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Build initials from a name string */
function buildInitials(name) {
  const parts = String(name || '').trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  if (parts.length === 1 && parts[0].length >= 2) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0] || 'U')[0].toUpperCase();
}

/** Status badge HTML */
function statusBadge(status) {
  const map = {
    pending:   'badge--warning',
    confirmed: 'badge--primary',
    completed: 'badge--success',
    cancelled: 'badge--danger',
    cancelled_by_patient: 'badge--danger',
  };
  const cls = map[status] || 'badge--neutral';
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `<span class="badge ${cls}">${escHtml(label)}</span>`;
}

/** Destroy a chart by canvas ID */
function destroyChart(canvasId) {
  if (window._charts && window._charts[canvasId]) {
    window._charts[canvasId].destroy();
    delete window._charts[canvasId];
  }
}

/** Set text content safely */
function setTextContent(selector, text) {
  const el = document.querySelector(selector);
  if (el) el.textContent = text ?? '';
}

/** Set innerHTML safely */
function setInnerHTML(selector, html) {
  const el = document.querySelector(selector);
  if (el) el.innerHTML = html ?? '';
}

/** Get value from form input by selector */
function getValue(selector) {
  const el = document.querySelector(selector);
  return el ? el.value : '';
}

// ─── Dark Mode ───────────────────────────────────────────────────────────────
function initDarkMode() {
  const saved = localStorage.getItem('fdmst-theme');
  if (saved === 'dark') applyDarkMode(true, false);
}
function toggleDarkMode() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  applyDarkMode(!isDark);
}
function applyDarkMode(dark, save = true) {
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  if (save) localStorage.setItem('fdmst-theme', dark ? 'dark' : 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.classList.toggle('active', dark);
}

// ─── Sidebar Collapse ─────────────────────────────────────────────────────────
function initSidebarCollapse() {
  const saved = localStorage.getItem('fdmst-sidebar');
  if (saved === 'collapsed') applySidebarState(true, false);
}
function toggleSidebarCollapse() {
  const s = document.getElementById('sidebar');
  if (!s) return;
  applySidebarState(!s.classList.contains('collapsed'));
}
function applySidebarState(collapsed, save = true) {
  const s    = document.getElementById('sidebar');
  const main = document.getElementById('dashboardMain');
  const icon = document.getElementById('collapseIcon');
  if (s)    s.classList.toggle('collapsed', collapsed);
  if (main) main.classList.toggle('sidebar-is-collapsed', collapsed);
  if (icon) icon.style.transform = collapsed ? 'rotate(180deg)' : 'rotate(0deg)';
  if (save) localStorage.setItem('fdmst-sidebar', collapsed ? 'collapsed' : 'expanded');
}

// ─── Notifications ────────────────────────────────────────────────────────────
async function loadNotifications() {
  const notifs = [];
  try {
    const r = await API.get('/analytics/appointments-today');
    const pending = r.data?.pending ?? 0;
    if (pending > 0) notifs.push({ icon: 'fa-clock', color: '#f59e0b', text: `${pending} pending appointment${pending > 1 ? 's' : ''} today` });
  } catch (_) {}
  try {
    const r = await API.get('/analytics/overview');
    const ls = r.data?.inventory?.lowStock ?? r.data?.lowStock ?? 0;
    if (ls > 0) notifs.push({ icon: 'fa-boxes-stacked', color: '#ef4444', text: `${ls} inventory item${ls > 1 ? 's' : ''} at low stock` });
  } catch (_) {}
  const badge = document.getElementById('notifBadge');
  const list  = document.getElementById('notifList');
  if (badge) { badge.textContent = notifs.length; badge.style.display = notifs.length > 0 ? 'flex' : 'none'; }
  if (list)  list.innerHTML = notifs.length
    ? notifs.map(n => `<div class="notif-item"><div class="notif-icon" style="color:${n.color}"><i class="fa-solid ${n.icon}"></i></div><div class="notif-body"><div class="notif-text">${n.text}</div></div></div>`).join('')
    : '<div class="notif-empty"><i class="fa-solid fa-bell-slash"></i><p>No new notifications</p></div>';
}
function toggleNotifDropdown() {
  closeProfileDropdown();
  document.getElementById('notifDropdown')?.classList.toggle('open');
}
function toggleProfileDropdown() {
  closeNotifDropdown();
  document.getElementById('profileDropdown')?.classList.toggle('open');
}
function closeNotifDropdown()  { document.getElementById('notifDropdown')?.classList.remove('open'); }
function closeProfileDropdown(){ document.getElementById('profileDropdown')?.classList.remove('open'); }
function markAllNotifsRead() {
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';
  document.querySelectorAll('.notif-item').forEach(el => el.classList.remove('unread'));
}

// ─── Expose functions globally for inline event handlers ─────────────────────
window.switchSection        = switchSection;
window.loadOverview         = loadOverview;
window.loadTodaySchedule    = loadTodaySchedule;
window.loadAppointments     = loadAppointments;
window.loadPatients         = loadPatients;
window.loadInventory        = loadInventory;
window.openApptModal        = openApptModal;
window.updateApptStatus     = updateApptStatus;
window.cancelApptPrompt     = cancelApptPrompt;
window.showTreatmentSummaryField = showTreatmentSummaryField;
window.submitCompleteAppt   = submitCompleteAppt;
window.openPatientModal     = openPatientModal;
window.selectRecordPatient  = selectRecordPatient;
window.loadTeethRecord      = loadTeethRecord;
window.openToothModal       = openToothModal;
window.saveToothCondition   = saveToothCondition;
window.debounceApptSearch   = debounceApptSearch;
window.openAddInventoryModal = openAddInventoryModal;
window.submitInventoryForm  = submitInventoryForm;
window.openAdjustStockModal = openAdjustStockModal;
window.submitStockAdjust    = submitStockAdjust;
window.openModal            = openModal;
window.closeModal           = closeModal;
window.togglePwd            = togglePwd;
window.formatDate           = formatDate;
window.stars                = stars;
window.toggleDarkMode       = toggleDarkMode;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.toggleNotifDropdown  = toggleNotifDropdown;
window.toggleProfileDropdown = toggleProfileDropdown;
window.closeNotifDropdown   = closeNotifDropdown;
window.closeProfileDropdown = closeProfileDropdown;
window.markAllNotifsRead    = markAllNotifsRead;

/* ─────────────────────────────── NOTIFICATION SETTINGS ─────────────────────── */
function openNotifSettings() {
  ['email', 'sms', 'push'].forEach(key => {
    const val    = localStorage.getItem('fdmst-notif-' + key);
    const toggle = document.getElementById('notif' + key.charAt(0).toUpperCase() + key.slice(1) + 'Toggle');
    if (toggle) toggle.classList.toggle('active', val !== 'false');
  });
  openModal('notifSettingsModal');
}

function toggleNotifPref(key) {
  const toggle = document.getElementById('notif' + key.charAt(0).toUpperCase() + key.slice(1) + 'Toggle');
  if (!toggle) return;
  const current = toggle.classList.contains('active');
  toggle.classList.toggle('active', !current);
  localStorage.setItem('fdmst-notif-' + key, String(!current));
}

window.openNotifSettings = openNotifSettings;
window.toggleNotifPref   = toggleNotifPref;
