'use strict';

/* ───────────────────────────── GLOBALS / STATE ───────────────────────────── */
window._charts = window._charts || {};
let _preFillFeedbackApptId = null;
let _bookCurrentStep = 1;
let _selectedServiceName = '';
let _starValues = {};
let _recommendValue = null;
let _searchDebounce = null;

const SERVICES = [
  { name: 'Dental Radiographs',              icon: 'fa-x-ray'           },
  { name: 'Oral Surgery',                    icon: 'fa-syringe'         },
  { name: 'Veneers',                         icon: 'fa-teeth'           },
  { name: 'Tooth Sealant',                   icon: 'fa-shield-halved'   },
  { name: 'Fluoride Treatment',              icon: 'fa-flask'           },
  { name: 'Braces / Orthodontic Treatment',  icon: 'fa-ruler-combined'  },
  { name: 'Tooth Extraction',                icon: 'fa-tooth'           },
  { name: 'Dental Restoration',              icon: 'fa-fill-drip'       },
  { name: 'Crowns / Caps',                   icon: 'fa-crown'           },
  { name: 'Fixed Partial Dentures (FPD)',    icon: 'fa-teeth-open'      },
  { name: 'Dentures',                        icon: 'fa-circle-dot'      },
  { name: 'Oral Prophylaxis / Cleaning',     icon: 'fa-hand-sparkles'   },
  { name: 'Root Canal Therapy (RCT)',        icon: 'fa-stethoscope'     },
  { name: 'Oral Check-up',                   icon: 'fa-magnifying-glass' }
];

/* ─────────────────────────────── INIT ──────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  const user = Auth.getUser();
  if (!user || user.role !== 'patient') { Auth.logout(); return; }

  // populate sidebar user info
  const firstN   = user.firstName || '';
  const lastN    = user.lastName  || '';
  const initials = (firstN[0] || '') + (lastN[0] || '');
  const fullName = `${firstN} ${lastN}`.trim() || user.email || 'Patient';
  const el = (id) => document.getElementById(id);
  if (el('userAvatar'))   el('userAvatar').textContent = initials.toUpperCase() || 'PT';
  if (el('topbarAvatar')) el('topbarAvatar').textContent = initials.toUpperCase() || 'PT';
  if (el('userName'))     el('userName').textContent    = fullName;

  const profileDropNameElP   = document.getElementById('profileDropName');
  const profileDropAvatarElP = document.getElementById('profileDropAvatar');
  if (profileDropNameElP)   profileDropNameElP.textContent   = fullName;
  if (profileDropAvatarElP) profileDropAvatarElP.textContent = initials.toUpperCase() || 'PT';

  initDarkMode();
  initSidebarCollapse();

  // today in topbar
  if (el('topbarDate')) {
    el('topbarDate').textContent = new Date().toLocaleDateString('en-PH', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  }

  // sidebar nav
  document.querySelectorAll('.sidebar-item[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchSection(link.dataset.section);
    });
  });

  // mobile sidebar
  const sidebarEl  = document.getElementById('sidebar');
  const overlay    = document.getElementById('sidebarOverlay');
  const toggleBtn  = document.getElementById('sidebarToggle');
  const closeBtn   = document.getElementById('sidebarClose');

  if (toggleBtn) toggleBtn.addEventListener('click', () => {
    sidebarEl.classList.add('open'); overlay.classList.add('active');
  });
  if (closeBtn)  closeBtn.addEventListener('click',  closeSidebar);
  if (overlay)   overlay.addEventListener('click',   closeSidebar);

  function closeSidebar() {
    sidebarEl.classList.remove('open'); overlay.classList.remove('active');
  }

  // logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());

  // initialize sub-features
  initServiceGrid();
  initStarRatings();
  setupCancelModal();
  setupProfileForms();
  setupFeedbackForm();
  setupBookingForm();

  // set min date on booking date picker to today
  const bookDateInput = document.getElementById('bookDate');
  if (bookDateInput) {
    const today = new Date().toISOString().split('T')[0];
    bookDateInput.min = today;
  }

  loadOverview();

  loadPatientNotifications();
  document.addEventListener('click', e => {
    const notifW   = document.getElementById('notifWrapper');
    const profileW = document.getElementById('profileWrapper');
    if (notifW   && !notifW.contains(e.target))   closeNotifDropdown();
    if (profileW && !profileW.contains(e.target)) closeProfileDropdown();
  });
});

/* ─────────────────────────────── SECTION SWITCH ───────────────────────────── */
function switchSection(name) {
  document.querySelectorAll('.content-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.sidebar-item[data-section]').forEach(l => l.classList.remove('active'));

  const section = document.getElementById('section-' + name);
  if (section) section.classList.add('active');

  const link = document.querySelector(`.sidebar-item[data-section="${name}"]`);
  if (link) link.classList.add('active');

  const titles = {
    overview:     'Overview',
    book:         'Book Appointment',
    appointments: 'My Appointments',
    records:      'My Teeth Record',
    feedback:     'Give Feedback',
    profile:      'My Profile'
  };
  const titleEl = document.getElementById('topbarTitle');
  if (titleEl) titleEl.textContent = titles[name] || 'Patient Portal';

  // close mobile sidebar
  document.getElementById('sidebar').classList.remove('open');
  const overlay = document.getElementById('sidebarOverlay');
  if (overlay) overlay.classList.remove('active');

  if (name === 'appointments') loadMyAppointments();
  if (name === 'records')      loadMyRecord();
  if (name === 'feedback')     loadFeedbackForm();
  if (name === 'profile')      loadProfile();
}

/* ─────────────────────────────── OVERVIEW ──────────────────────────────────── */
async function loadOverview() {
  const user = Auth.getUser();
  const welcomeEl = document.getElementById('welcomeMsg');
  const dateEl    = document.getElementById('overviewDate');

  if (welcomeEl) welcomeEl.textContent = 'Welcome back, ' + user.firstName + '!';
  if (dateEl)    dateEl.textContent    = new Date().toLocaleDateString('en-PH', { weekday:'long', year:'numeric', month:'long', day:'numeric' });

  try {
    const res = await API.get('/appointments?limit=100');
    if (!res.success) return;

    const all    = res.data || [];
    const now    = new Date();
    const upcoming  = all.filter(a => ['pending','confirmed'].includes(a.status) && new Date(a.appointmentDate) >= now);
    const completed = all.filter(a => a.status === 'completed');
    const pending   = all.filter(a => a.status === 'pending');

    const el = (id) => document.getElementById(id);
    if (el('kpiUpcoming'))  el('kpiUpcoming').textContent  = upcoming.length;
    if (el('kpiCompleted')) el('kpiCompleted').textContent = completed.length;
    if (el('kpiPending'))   el('kpiPending').textContent   = pending.length;

    // next appointment card
    const sorted = upcoming.sort((a,b) => new Date(a.appointmentDate) - new Date(b.appointmentDate));
    const nextCard = document.getElementById('nextApptCard');
    const nextBody = document.getElementById('nextApptBody');

    if (sorted.length > 0 && nextCard && nextBody) {
      const n = sorted[0];
      nextCard.style.display = 'block';
      nextBody.innerHTML = `
        <div class="next-appt-details">
          <div class="next-appt-row">
            <span class="next-appt-label"><i class="fa-solid fa-tooth"></i> Service</span>
            <strong>${sanitize(n.service)}</strong>
          </div>
          <div class="next-appt-row">
            <span class="next-appt-label"><i class="fa-solid fa-calendar"></i> Date</span>
            <strong>${formatDate(n.appointmentDate)}</strong>
          </div>
          <div class="next-appt-row">
            <span class="next-appt-label"><i class="fa-solid fa-clock"></i> Time</span>
            <strong>${formatTime(n.timeSlot?.start || '')}</strong>
          </div>
          <div class="next-appt-row">
            <span class="next-appt-label"><i class="fa-solid fa-circle-info"></i> Status</span>
            ${statusBadge(n.status)}
          </div>
        </div>
        ${['pending','confirmed'].includes(n.status) ? `
        <div class="next-appt-actions">
          <button class="btn btn-sm btn-outline" onclick="openCancelModal('${n._id}')">
            <i class="fa-solid fa-xmark"></i> Cancel
          </button>
        </div>` : ''}
      `;
    } else if (nextCard) {
      nextCard.style.display = 'none';
    }
  } catch (err) {
    console.error('loadOverview error:', err);
  }
}

/* ─────────────────────────────── BOOKING ───────────────────────────────────── */
function initServiceGrid() {
  const grid = document.getElementById('serviceGrid');
  if (!grid) return;
  grid.innerHTML = SERVICES.map(s => `
    <div class="service-option service-select-item" onclick="selectService(this, '${s.name.replace(/'/g,"\\'")}')">
      <i class="fa-solid ${s.icon}"></i>
      <span>${s.name}</span>
    </div>
  `).join('');
}

function selectService(el, name) {
  document.querySelectorAll('.service-select-item').forEach(i => i.classList.remove('selected'));
  el.classList.add('selected');
  _selectedServiceName = name;
  const hidden = document.getElementById('selectedService');
  if (hidden) hidden.value = name;
  document.getElementById('serviceError').textContent = '';
}

function setBookStep(n) {
  _bookCurrentStep = n;
  document.querySelectorAll('.book-step').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(n === 'Done' ? 'bookStepDone' : 'bookStep' + n);
  if (target) target.classList.add('active');

  // Update booking progress bar
  const stepNum = n === 'Done' ? 4 : parseInt(n);
  ['bookProg1','bookProg2','bookProg3'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('done', 'active');
    if (n === 'Done') { el.classList.add('done'); }
    else if (i + 1 < stepNum) { el.classList.add('done'); }
    else if (i + 1 === stepNum) { el.classList.add('active'); }
  });
  ['bookProgLine1','bookProgLine2'].forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('done', n === 'Done' || stepNum > i + 1);
  });
  const progressBar = document.getElementById('bookProgress');
  if (progressBar) progressBar.style.display = n === 'Done' ? 'none' : 'flex';

  if (n === 2) {
    const dateInput = document.getElementById('bookDate');
    if (dateInput) dateInput.min = new Date().toLocaleDateString('en-CA');
  }
}

function bookNext(step) {
  if (step === 1) {
    if (!_selectedServiceName) {
      document.getElementById('serviceError').textContent = 'Please select a service to continue.';
      return;
    }
    setBookStep(2);
  } else if (step === 2) {
    const dateVal = document.getElementById('bookDate').value;
    document.getElementById('dateError').textContent = '';
    document.getElementById('slotError').textContent = '';
    if (!dateVal) {
      document.getElementById('dateError').textContent = 'Please select a date.';
      return;
    }
    if (dateVal < new Date().toLocaleDateString('en-CA')) {
      document.getElementById('dateError').textContent = 'Please select today or a future date.';
      return;
    }
    if (!document.getElementById('selectedSlot').value) {
      document.getElementById('slotError').textContent = 'Please select a time slot.';
      return;
    }
    updateBookingSummary();
    setBookStep(3);
  }
}

function bookPrev(step) {
  setBookStep(step - 1);
}

const ALL_SLOTS = [
  '08:00','08:30','09:00','09:30','10:00','10:30','11:00','11:30',
  '13:00','13:30','14:00','14:30','15:00','15:30','16:00','16:30'
];

async function loadSlots() {
  const dateVal = document.getElementById('bookDate').value;
  const slotsEl = document.getElementById('timeSlots');
  if (!dateVal || !slotsEl) return;

  const slotHidden = document.getElementById('selectedSlot');
  if (slotHidden) slotHidden.value = '';

  const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
  if (dateVal < todayStr) {
    slotsEl.innerHTML = '<p class="hint-text" style="color:var(--danger)">Cannot book a past date.</p>';
    return;
  }

  slotsEl.innerHTML = '<p class="hint-text"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading slots...</p>';

  try {
    const res = await API.get('/appointments/available-slots?date=' + dateVal);
    if (!res.success) {
      slotsEl.innerHTML = '<p class="hint-text" style="color:var(--danger)">Failed to load slots. Try again.</p>';
      return;
    }

    const available = new Set(res.data);
    const now = new Date();
    const isToday = dateVal === todayStr;

    const buttons = ALL_SLOTS.map(slot => {
      const isAvailable = available.has(slot);
      if (!isAvailable) return ''; // already booked — hide

      if (isToday) {
        const [h, m] = slot.split(':').map(Number);
        const slotTime = new Date();
        slotTime.setHours(h, m, 0, 0);
        // need at least 30 min ahead
        if (now.getTime() + 30 * 60 * 1000 > slotTime.getTime()) {
          return `<button type="button" class="time-slot taken" disabled title="This time has already passed">${formatTime(slot)}</button>`;
        }
      }

      return `<button type="button" class="time-slot" onclick="selectSlot(this, '${slot}')">${formatTime(slot)}</button>`;
    }).filter(Boolean).join('');

    slotsEl.innerHTML = buttons || '<p class="hint-text">No available slots for this date. Please choose another.</p>';
  } catch {
    slotsEl.innerHTML = '<p class="hint-text" style="color:var(--danger)">Failed to load slots. Try again.</p>';
  }
}

function selectSlot(btn, slot) {
  document.querySelectorAll('.time-slot').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const hidden = document.getElementById('selectedSlot');
  if (hidden) hidden.value = slot;
  document.getElementById('slotError').textContent = '';
}

function updateBookingSummary() {
  const dateVal = document.getElementById('bookDate').value;
  const slotVal = document.getElementById('selectedSlot').value;
  const priority = document.getElementById('bookPriority')?.value || 'routine';
  const el = document.getElementById('bookingSummary');
  if (!el) return;
  el.innerHTML = `
    <table class="summary-table">
      <tr><td><strong>Service</strong></td><td>${sanitize(_selectedServiceName)}</td></tr>
      <tr><td><strong>Date</strong></td><td>${formatDate(dateVal)}</td></tr>
      <tr><td><strong>Time</strong></td><td>${formatTime(slotVal)}</td></tr>
      <tr><td><strong>Priority</strong></td><td style="text-transform:capitalize">${priority}</td></tr>
    </table>
  `;
}

function setupBookingForm() {
  const form = document.getElementById('bookForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const service  = _selectedServiceName;
    const dateVal  = document.getElementById('bookDate').value;
    const slotVal  = document.getElementById('selectedSlot').value;
    const priority = document.getElementById('bookPriority')?.value || 'routine';
    const symptoms = document.getElementById('bookSymptoms')?.value.trim() || '';

    const bookAlert = document.getElementById('bookAlert');
    if (bookAlert) bookAlert.style.display = 'none';

    if (!service || !dateVal || !slotVal) {
      if (bookAlert) { bookAlert.className = 'alert alert-error'; bookAlert.textContent = 'Please complete all required fields.'; bookAlert.style.display = 'block'; }
      return;
    }

    const btn = document.getElementById('submitBookBtn');
    if (btn) { btn.querySelector('.btn-text').style.display = 'none'; btn.querySelector('.btn-spinner').style.display = 'inline'; btn.disabled = true; }

    try {
      const res = await API.post('/appointments', {
        service,
        appointmentDate: new Date(dateVal).toISOString(),
        timeSlot: { start: slotVal },
        priority,
        symptoms: symptoms || undefined
      });

      if (res.success) {
        const details = document.getElementById('bookingDoneDetails');
        if (details) {
          details.innerHTML = `
            <div class="booking-summary" style="margin:1rem 0">
              <table class="summary-table">
                <tr><td><strong>Service</strong></td><td>${sanitize(res.data.service)}</td></tr>
                <tr><td><strong>Date</strong></td><td>${formatDate(res.data.appointmentDate)}</td></tr>
                <tr><td><strong>Time</strong></td><td>${formatTime(res.data.timeSlot?.start || '')}</td></tr>
                <tr><td><strong>Status</strong></td><td>${statusBadge(res.data.status)}</td></tr>
              </table>
            </div>
          `;
        }
        setBookStep('Done');
        UI.showToast('Appointment booked successfully!', 'success');
      } else {
        const msg = res.errors ? res.errors.map(e => e.msg).join(' ') : (res.message || 'Booking failed.');
        if (bookAlert) { bookAlert.className = 'alert alert-error'; bookAlert.textContent = msg; bookAlert.style.display = 'block'; }
        setBookStep(3);
      }
    } catch (err) {
      if (bookAlert) { bookAlert.className = 'alert alert-error'; bookAlert.textContent = err.message || 'Connection error. Try again.'; bookAlert.style.display = 'block'; }
      setBookStep(3);
    } finally {
      if (btn) { btn.querySelector('.btn-text').style.display = 'inline'; btn.querySelector('.btn-spinner').style.display = 'none'; btn.disabled = false; }
    }
  });
}

/* ─────────────────────────────── MY APPOINTMENTS ───────────────────────────── */
async function loadMyAppointments() {
  const filter = document.getElementById('myApptFilter')?.value || '';
  const container = document.getElementById('myApptList');
  if (!container) return;

  container.innerHTML = '<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';

  try {
    const url = '/appointments' + (filter ? '?status=' + filter : '?limit=50');
    const res = await API.get(url);

    if (!res.success || !res.data.length) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-calendar-xmark"></i>
          <p>No appointments found.</p>
          <button class="btn btn-primary btn-sm" onclick="switchSection('book')">
            <i class="fa-solid fa-calendar-plus"></i> Book your first visit
          </button>
        </div>`;
      return;
    }

    const sorted = res.data.sort((a,b) => new Date(b.appointmentDate) - new Date(a.appointmentDate));
    container.innerHTML = sorted.map(appt => `
      <div class="appt-card">
        <div class="appt-card-header">
          ${statusBadge(appt.status)}
          ${priorityBadge(appt.priority)}
        </div>
        <div class="appt-card-body">
          <h3>${sanitize(appt.service)}</h3>
          <p><i class="fa-solid fa-calendar-days"></i> ${formatDate(appt.appointmentDate)}</p>
          <p><i class="fa-solid fa-clock"></i> ${formatTime(appt.timeSlot?.start || '')}</p>
          ${appt.symptoms ? `<p class="appt-symptoms"><i class="fa-solid fa-notes-medical"></i> "${sanitize(appt.symptoms)}"</p>` : ''}
          ${appt.treatmentSummary ? `<p class="appt-treatment"><i class="fa-solid fa-clipboard-check"></i> ${sanitize(appt.treatmentSummary)}</p>` : ''}
        </div>
        <div class="appt-card-footer">
          ${['pending','confirmed'].includes(appt.status) ? `
            <button class="btn btn-sm btn-outline" onclick="openCancelModal('${appt._id}')">
              <i class="fa-solid fa-xmark"></i> Cancel
            </button>` : ''}
          ${appt.status === 'completed' ? `
            <button class="btn btn-sm btn-primary" onclick="goToFeedback('${appt._id}')">
              <i class="fa-solid fa-star"></i> Leave Feedback
            </button>` : ''}
        </div>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Failed to load appointments.</p></div>';
  }
}

function goToFeedback(apptId) {
  _preFillFeedbackApptId = apptId;
  switchSection('feedback');
}

/* Cancel modal */
function openCancelModal(apptId) {
  const hidden = document.getElementById('cancelApptId');
  const reason = document.getElementById('cancelReason');
  if (hidden) hidden.value = apptId;
  if (reason) reason.value = '';
  openModal('cancelModal');
}

async function confirmCancelAppt() {
  const id     = document.getElementById('cancelApptId')?.value;
  const reason = document.getElementById('cancelReason')?.value.trim();
  if (!id) return;

  try {
    const res = await API.delete('/appointments/' + id, { reason });
    if (res.success) {
      UI.showToast('Appointment cancelled.', 'success');
      closeModal('cancelModal');
      loadMyAppointments();
      loadOverview();
    } else {
      UI.showToast(res.message || 'Failed to cancel.', 'error');
    }
  } catch (err) {
    UI.showToast(err.message || 'Connection error.', 'error');
  }
}

function setupCancelModal() {
  // attached in HTML via onclick, just expose globally
  window.openCancelModal   = openCancelModal;
  window.confirmCancelAppt = confirmCancelAppt;
}

/* ─────────────────────────────── TEETH RECORD (FDI) — READ-ONLY ─────────────── */

const FDI_UPPER_P = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const FDI_LOWER_P = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

const TOOTH_COLORS_P = {
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

function toothCellPatient(num, condition, notes) {
  const cond  = condition || 'healthy';
  const label = cond.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const title = sanitize(`Tooth ${num} – ${label}${notes ? ': ' + notes : ''}`);
  return `<div class="tooth-btn ${cond}" title="${title}" style="cursor:default;">${num}</div>`;
}

function renderTeethChartPatient(record, containerId) {
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

  const upperHtml = FDI_UPPER_P.map(n => toothCellPatient(n, (chartMap[n] || {}).condition, (chartMap[n] || {}).notes)).join('');
  const lowerHtml = FDI_LOWER_P.map(n => toothCellPatient(n, (chartMap[n] || {}).condition, (chartMap[n] || {}).notes)).join('');

  const legendHtml = Object.entries(TOOTH_COLORS_P).map(([cond, color]) => `
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

async function loadMyRecord() {
  const container = document.getElementById('myTeethRecord');
  if (!container) return;
  container.innerHTML = '<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>';

  try {
    const res = await API.get('/patients/my/profile');
    if (!res.success) {
      container.innerHTML = '<div class="empty-state"><p>Unable to load record.</p></div>';
      return;
    }

    const { user, patientRecord, teethRecord } = res.data;
    const record   = teethRecord || {};
    const history  = record.treatmentHistory || [];

    const statsHtml = `
      <div class="kpi-grid" style="margin-bottom:1.25rem;">
        <div class="kpi-card kpi-green">
          <div class="kpi-icon"><i class="fa-solid fa-tooth"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:1rem;">${sanitize(record.oralHygieneRating || '—')}</span>
            <span class="kpi-label">Oral Hygiene</span>
          </div>
        </div>
        <div class="kpi-card kpi-purple">
          <div class="kpi-icon"><i class="fa-solid fa-heart-pulse"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:1rem;">${sanitize(record.periodontalStatus || '—')}</span>
            <span class="kpi-label">Periodontal Status</span>
          </div>
        </div>
        ${record.allergiesNotes ? `
        <div class="kpi-card kpi-red">
          <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div class="kpi-data">
            <span class="kpi-value" style="font-size:.9rem;">${sanitize(record.allergiesNotes)}</span>
            <span class="kpi-label">Allergies</span>
          </div>
        </div>` : ''}
      </div>`;

    const historyHtml = history.length ? `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Service</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h => {
                const dateStr = h.date || h.createdAt
                  ? new Date(h.date || h.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
                  : '—';
                return `
                  <tr>
                    <td>${dateStr}</td>
                    <td><strong>${sanitize(h.service || h.serviceType || '—')}</strong></td>
                    <td class="text-muted">${sanitize(h.notes || '—')}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '<div class="empty-state" style="padding:2rem;"><i class="fa-solid fa-clipboard-list"></i><p>No treatment history recorded yet.</p></div>';

    container.innerHTML = `
      ${statsHtml}
      <div id="patientTeethChartContainer" style="margin-bottom:1.25rem;"></div>
      <h3 style="margin:0 0 .875rem;font-size:1rem;font-weight:700;color:var(--text-primary);letter-spacing:-.015em;">Treatment History</h3>
      ${historyHtml}
      <p class="hint-text" style="margin-top:1rem;padding-top:.875rem;border-top:1px solid var(--border);">
        <i class="fa-solid fa-circle-info" style="color:var(--primary);margin-right:.3rem;"></i>
        For complete clinical charts, x-rays, and detailed dental records, please visit the clinic directly.
      </p>`;

    renderTeethChartPatient(record, 'patientTeethChartContainer');

  } catch (err) {
    console.error('loadMyRecord error:', err);
    container.innerHTML = '<div class="empty-state"><i class="fa-solid fa-circle-exclamation"></i><p>Failed to load teeth record.</p></div>';
  }
}

/* ─────────────────────────────── FEEDBACK ──────────────────────────────────── */
function initStarRatings() {
  document.querySelectorAll('.star-rating[data-target]').forEach(container => {
    const targetId = container.dataset.target;
    _starValues[targetId] = 0;
    container.innerHTML = '';

    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.className = 'star';
      star.innerHTML = '★';
      star.dataset.val = i;

      star.addEventListener('mouseover', () => highlightStars(container, i));
      star.addEventListener('mouseout',  () => highlightStars(container, _starValues[targetId] || 0));
      star.addEventListener('click',     () => {
        _starValues[targetId] = i;
        const hidden = document.getElementById(targetId);
        if (hidden) hidden.value = i;
        highlightStars(container, i);
        container.dataset.selected = i;
      });

      container.appendChild(star);
    }
  });
}

function highlightStars(container, value) {
  container.querySelectorAll('.star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= value);
  });
}

function setRecommend(val) {
  _recommendValue = val;
  const hidden = document.getElementById('wouldRecommend');
  if (hidden) hidden.value = val;
  document.getElementById('recYes')?.classList.toggle('active', val === true);
  document.getElementById('recNo')?.classList.toggle('active',  val === false);
}

async function loadFeedbackForm() {
  const select = document.getElementById('feedbackAppt');
  if (!select) return;

  try {
    const res = await API.get('/appointments?status=completed&limit=30');
    select.innerHTML = '<option value="">-- Select appointment (optional) --</option>';
    if (res.success && res.data.length) {
      res.data.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a._id;
        opt.textContent = a.service + ' — ' + formatDate(a.appointmentDate);
        select.appendChild(opt);
      });
    }
    if (_preFillFeedbackApptId) {
      select.value = _preFillFeedbackApptId;
      _preFillFeedbackApptId = null;
    }
  } catch (_) {}
}

function setupFeedbackForm() {
  const form = document.getElementById('feedbackForm');
  if (!form) return;

  window.setRecommend = setRecommend;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('feedbackAlert');
    if (alertEl) alertEl.style.display = 'none';

    const overallRating = parseInt(document.getElementById('overallRating')?.value);
    if (!overallRating || overallRating < 1) {
      if (alertEl) { alertEl.className = 'alert alert-error'; alertEl.textContent = 'Please rate your overall experience.'; alertEl.style.display = 'block'; }
      return;
    }

    const btn = document.getElementById('submitFeedbackBtn');
    if (btn) { btn.querySelector('.btn-text').style.display = 'none'; btn.querySelector('.btn-spinner').style.display = 'inline'; btn.disabled = true; }

    const payload = {
      overallRating,
      staffRating:       parseInt(document.getElementById('staffRating')?.value)       || undefined,
      facilitiesRating:  parseInt(document.getElementById('facilitiesRating')?.value)  || undefined,
      waitTimeRating:    parseInt(document.getElementById('waitTimeRating')?.value)     || undefined,
      serviceRating:     parseInt(document.getElementById('serviceRating')?.value)     || undefined,
      comment:           document.getElementById('feedbackComment')?.value.trim()       || undefined,
      appointment:       document.getElementById('feedbackAppt')?.value                || undefined,
      wouldRecommend:    _recommendValue !== null ? _recommendValue : undefined,
      isAnonymous:       document.getElementById('feedbackAnon')?.checked || false
    };

    try {
      const res = await API.post('/feedback', payload);
      if (res.success) {
        UI.showToast('Thank you for your feedback!', 'success');
        form.reset();
        _starValues = {};
        _recommendValue = null;
        document.querySelectorAll('.star-rating').forEach(c => highlightStars(c, 0));
        document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
        initStarRatings();
      } else {
        if (alertEl) { alertEl.className = 'alert alert-error'; alertEl.textContent = res.message || 'Submission failed.'; alertEl.style.display = 'block'; }
      }
    } catch (err) {
      if (alertEl) { alertEl.className = 'alert alert-error'; alertEl.textContent = err.message || 'Connection error.'; alertEl.style.display = 'block'; }
    } finally {
      if (btn) { btn.querySelector('.btn-text').style.display = 'inline'; btn.querySelector('.btn-spinner').style.display = 'none'; btn.disabled = false; }
    }
  });
}

/* ─────────────────────────────── PROFILE ───────────────────────────────────── */
async function loadProfile() {
  try {
    const res = await API.get('/patients/my/profile');
    if (!res.success) return;
    const { user, patientRecord } = res.data;

    const el = (id) => document.getElementById(id);
    if (el('profileFirst'))  el('profileFirst').value  = user.firstName || '';
    if (el('profileLast'))   el('profileLast').value   = user.lastName  || '';
    if (el('profilePhone'))  el('profilePhone').value  = user.phone     || '';
    if (el('profileGender')) el('profileGender').value = user.gender    || '';
    if (el('profileCity'))   el('profileCity').value   = user.address?.city || '';

    const fullName = user.firstName + ' ' + user.lastName;
    const initials = (user.firstName[0] + user.lastName[0]).toUpperCase();
    if (el('profileName'))   el('profileName').textContent  = fullName;
    if (el('profileAvatar')) el('profileAvatar').textContent = initials;
    if (el('profileId'))     el('profileId').textContent    = 'Patient ID: #' + (user._id || '').slice(-6).toUpperCase();
    if (el('topbarAvatar'))  el('topbarAvatar').textContent = initials;
    if (el('userAvatar'))    el('userAvatar').textContent   = initials;
  } catch (err) {
    UI.showToast('Failed to load profile.', 'error');
  }
}

function setupProfileForms() {
  const profileForm = document.getElementById('profileForm');
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        firstName: document.getElementById('profileFirst')?.value.trim(),
        lastName:  document.getElementById('profileLast')?.value.trim(),
        phone:     document.getElementById('profilePhone')?.value.trim() || undefined,
        gender:    document.getElementById('profileGender')?.value       || undefined,
        address:   { city: document.getElementById('profileCity')?.value.trim() || undefined }
      };
      try {
        const res = await API.put('/patients/my/profile', payload);
        if (res.success) {
          UI.showToast('Profile updated successfully.', 'success');
          // update stored user name
          const stored = Auth.getUser();
          if (stored) {
            stored.firstName = payload.firstName || stored.firstName;
            stored.lastName  = payload.lastName  || stored.lastName;
            Auth.setUser(stored);
            const initials = (stored.firstName[0] + stored.lastName[0]).toUpperCase();
            const el = (id) => document.getElementById(id);
            if (el('userAvatar'))    el('userAvatar').textContent    = initials;
            if (el('topbarAvatar'))  el('topbarAvatar').textContent  = initials;
            if (el('userName'))      el('userName').textContent      = stored.firstName + ' ' + stored.lastName;
            if (el('profileName'))   el('profileName').textContent   = stored.firstName + ' ' + stored.lastName;
            if (el('profileAvatar')) el('profileAvatar').textContent = initials;
          }
        } else {
          UI.showToast(res.message || 'Update failed.', 'error');
        }
      } catch (err) {
        UI.showToast(err.message || 'Connection error.', 'error');
      }
    });
  }

  const changePwdForm = document.getElementById('changePwdForm');
  if (changePwdForm) {
    changePwdForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPwd    = document.getElementById('currentPwd')?.value;
      const newPwd        = document.getElementById('newPwd')?.value;
      const confirmNewPwd = document.getElementById('confirmNewPwd')?.value;

      if (newPwd !== confirmNewPwd) {
        UI.showToast('New passwords do not match.', 'error'); return;
      }
      if (newPwd.length < 8 || !/[A-Z]/.test(newPwd) || !/[a-z]/.test(newPwd) || !/\d/.test(newPwd)) {
        UI.showToast('Password must have uppercase, lowercase, and a number (min 8 chars).', 'error'); return;
      }

      try {
        const res = await API.post('/auth/change-password', { currentPassword: currentPwd, newPassword: newPwd });
        if (res.success) {
          UI.showToast('Password updated successfully.', 'success');
          changePwdForm.reset();
        } else {
          UI.showToast(res.message || 'Failed to update password.', 'error');
        }
      } catch (err) {
        UI.showToast(err.message || 'Connection error.', 'error');
      }
    });
  }
}

/* ─────────────────────────────── MODAL HELPERS ────────────────────────────── */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add('active');
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove('active');
}

function togglePwd(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input || !icon) return;
  const isPassword = input.type === 'password';
  input.type = isPassword ? 'text' : 'password';
  icon.className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
}

/* ─────────────────────────────── FORMATTERS ───────────────────────────────── */
function formatDate(d) {
  if (!d) return 'N/A';
  return new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatTime(t) {
  if (!t) return 'N/A';
  const [h, m] = t.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const disp = ((h % 12) || 12) + ':' + String(m || 0).padStart(2, '0') + ' ' + ampm;
  return disp;
}

function sanitize(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function statusBadge(status) {
  const map = {
    pending:   ['badge-pending',   'Pending'],
    confirmed: ['badge-confirmed', 'Confirmed'],
    completed: ['badge-completed', 'Completed'],
    cancelled: ['badge-cancelled', 'Cancelled'],
    no_show:   ['badge-noshow',    'No Show']
  };
  const [cls, label] = map[status] || ['badge-pending', status];
  return `<span class="badge ${cls}">${label}</span>`;
}

function priorityBadge(priority) {
  if (!priority || priority === 'routine') return '';
  const cls   = priority === 'emergency' ? 'badge-danger' : 'badge-warning';
  const label = priority.charAt(0).toUpperCase() + priority.slice(1);
  return `<span class="badge ${cls}">${label}</span>`;
}

/* ─────────────────────────────── DARK MODE ───────────────────────────────── */
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

/* ─────────────────────────────── SIDEBAR COLLAPSE ─────────────────────────── */
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

/* ─────────────────────────────── NOTIFICATIONS ─────────────────────────────── */
async function loadPatientNotifications() {
  const notifs = [];
  try {
    const r = await API.get('/appointments?status=confirmed&limit=5');
    const items = r.data?.appointments || r.data || [];
    const upcoming = items.filter(a => new Date(a.appointmentDate || a.date) >= new Date());
    if (upcoming.length > 0) notifs.push({ icon: 'fa-calendar-check', color: '#0891b2', text: `You have ${upcoming.length} upcoming confirmed appointment${upcoming.length > 1 ? 's' : ''}` });
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

/* ─────────────────────────────── EXPOSE GLOBALS ───────────────────────────── */
window.switchSection    = switchSection;
window.selectService    = selectService;
window.bookNext         = bookNext;
window.bookPrev         = bookPrev;
window.loadSlots        = loadSlots;
window.selectSlot       = selectSlot;
window.loadMyAppointments = loadMyAppointments;
window.goToFeedback     = goToFeedback;
window.loadMyRecord     = loadMyRecord;
window.loadProfile      = loadProfile;
window.closeModal       = closeModal;
window.openModal        = openModal;
window.togglePwd        = togglePwd;
window.toggleDarkMode       = toggleDarkMode;
window.toggleSidebarCollapse = toggleSidebarCollapse;
window.toggleNotifDropdown  = toggleNotifDropdown;
window.toggleProfileDropdown = toggleProfileDropdown;
window.closeNotifDropdown   = closeNotifDropdown;
window.closeProfileDropdown = closeProfileDropdown;
window.markAllNotifsRead    = markAllNotifsRead;

/* ─────────────────────────────── NOTIFICATION SETTINGS ─────────────────────── */
function openNotifSettings() {
  ['email', 'sms', 'reminders', 'push'].forEach(key => {
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
