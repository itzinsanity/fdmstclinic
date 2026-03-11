/**
 * FDMST — Flores-Dizon Dental Clinic Management System
 * dashboard-admin.js — Admin Dashboard Logic
 *
 * Depends on globals: window.Auth, window.API, window.UI (utils.js)
 * and Chart (Chart.js v4 loaded globally).
 *
 * Powers: public/dashboard/admin.html
 */

'use strict';

/* ─────────────────────────────────────────────
   CONSTANTS & MODULE STATE
   ───────────────────────────────────────────── */

const COLORS = [
  '#0891b2', '#22c55e', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#10b981', '#f97316',
  '#3b82f6', '#ec4899', '#14b8a6', '#a78bfa',
];

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Holds active Chart.js instances keyed by canvas id
window._charts = window._charts || {};

// Convenience alias so inline templates can use escHtml() instead of UI.sanitizeHTML()
const escHtml = (s) => UI.sanitizeHTML(String(s ?? ''));

// Builds initials string from a full name
const buildInitials = (name) => {
  const parts = String(name || '').trim().split(/\s+/);
  return (parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '');
};

// Debounce timers
let _patientSearchTimer   = null;
let _recordSearchTimer    = null;
let _apptSearchTimer      = null;
let _invSearchTimer       = null;
let _feedbackSearchTimer  = null;

// Pagination state
let _apptPage    = 1;
let _patientPage = 1;
let _invPage     = 1;
let _usersPage   = 1;

// Current edit inventory item id
let _editInvId   = null;

// BAM period and trash state
let _bamPeriod         = 'monthly';
let _currentTrashType  = 'feedback';
let _trashPage         = 1;

// Currently selected patient userId for teeth record editing
let _teethRecordUserId = null;

/* ─────────────────────────────────────────────
   UTILITY HELPERS
   ───────────────────────────────────────────── */

/**
 * Format a date value to a short Philippine locale string.
 * @param {string|Date} d
 * @returns {string}
 */
function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Format a date-time value.
 * @param {string|Date} d
 * @returns {string}
 */
function formatDateTime(d) {
  if (!d) return '—';
  const date = new Date(d);
  if (isNaN(date)) return '—';
  return date.toLocaleString('en-PH', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Calculate age from date of birth string.
 * @param {string} dob
 * @returns {number|string}
 */
function calcAge(dob) {
  if (!dob) return '—';
  const birth = new Date(dob);
  if (isNaN(birth)) return '—';
  const diff = Date.now() - birth.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
}

/**
 * Render filled/empty star icons for a rating from 1-5.
 * @param {number} n
 * @returns {string} HTML string
 */
function stars(n) {
  const rating = Math.round(n) || 0;
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += i <= rating
      ? '<span style="color:#f59e0b;font-size:1rem;">&#9733;</span>'
      : '<span style="color:#d1d5db;font-size:1rem;">&#9733;</span>';
  }
  return html;
}

/**
 * Open a modal overlay by adding .active class.
 * @param {string} id
 */
function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

/**
 * Close a modal overlay by removing .active class.
 * @param {string} id
 */
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

/**
 * Toggle password input visibility.
 * @param {string} inputId
 * @param {string} iconId
 */
function togglePwd(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon  = document.getElementById(iconId);
  if (!input) return;
  const hidden = input.type === 'password';
  input.type   = hidden ? 'text' : 'password';
  if (icon) {
    icon.innerHTML = hidden
      ? '&#128065;&#xFE0F;' // eye with slash equivalent
      : '&#128065;';
  }
}

/**
 * Generic debounce wrapper.
 * @param {Function} fn
 * @param {number}   ms
 * @returns {Function}
 */
function debounce(fn, ms) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), ms);
  };
}

/**
 * Render pagination controls.
 * @param {string}   containerId
 * @param {number}   total
 * @param {number}   page
 * @param {number}   pages
 * @param {Function} callback  Called with the new page number
 */
function renderPagination(containerId, total, page, pages, callback) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!pages || pages <= 1) { container.innerHTML = ''; return; }

  let html = `<div class="pagination">`;
  html += `<button class="page-btn" ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">&laquo; Prev</button>`;

  const startPage = Math.max(1, page - 2);
  const endPage   = Math.min(pages, page + 2);

  if (startPage > 1) {
    html += `<button class="page-btn" data-page="1">1</button>`;
    if (startPage > 2) html += `<span class="page-ellipsis">…</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    html += `<button class="page-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }

  if (endPage < pages) {
    if (endPage < pages - 1) html += `<span class="page-ellipsis">…</span>`;
    html += `<button class="page-btn" data-page="${pages}">${pages}</button>`;
  }

  html += `<button class="page-btn" ${page === pages ? 'disabled' : ''} data-page="${page + 1}">Next &raquo;</button>`;
  html += `<span class="page-info">Page ${page} of ${pages} (${total} total)</span>`;
  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.page-btn:not([disabled])').forEach(btn => {
    btn.addEventListener('click', () => callback(parseInt(btn.dataset.page, 10)));
  });
}

/**
 * Destroy a chart if it exists, then create a new one.
 * Stores the instance in window._charts[id].
 * @param {string}  id     Canvas element id
 * @param {object}  config Chart.js config object
 * @returns {Chart|null}
 */
function destroyAndCreate(id, config) {
  const canvas = document.getElementById(id);
  if (!canvas) return null;
  if (window._charts[id]) {
    window._charts[id].destroy();
    delete window._charts[id];
  }
  const ctx = canvas.getContext('2d');
  window._charts[id] = new Chart(ctx, config);
  return window._charts[id];
}

/**
 * Build initials avatar HTML.
 * @param {string} firstName
 * @param {string} lastName
 * @param {number} [size=36]
 * @returns {string}
 */
function avatarHtml(firstName, lastName, size = 36) {
  const initials = UI.getInitials(firstName || '', lastName || '');
  const colors   = ['#0891b2','#22c55e','#8b5cf6','#f59e0b','#ef4444'];
  const color    = colors[(initials.charCodeAt(0) || 0) % colors.length];
  return `<div class="avatar-initials" style="width:${size}px;height:${size}px;background:${color};border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:${Math.round(size * 0.4)}px;">${UI.sanitizeHTML(initials)}</div>`;
}

/**
 * Get priority badge HTML.
 * @param {string} priority
 * @returns {string}
 */
function priorityBadge(priority) {
  const map = {
    routine:    { label: 'Routine',    cls: 'badge--info'    },
    urgent:     { label: 'Urgent',     cls: 'badge--warning' },
    emergency:  { label: 'Emergency',  cls: 'badge--danger'  },
  };
  const entry = map[(priority || '').toLowerCase()] || { label: UI.capitalize(priority || 'Routine'), cls: 'badge--info' };
  return `<span class="badge ${entry.cls}">${entry.label}</span>`;
}

/**
 * Get category badge HTML for inventory.
 * @param {string} category
 * @returns {string}
 */
function categoryBadge(category) {
  const colorMap = {
    'consumables':    '#0891b2',
    'equipment':      '#8b5cf6',
    'medication':     '#22c55e',
    'instruments':    '#f59e0b',
    'protective':     '#06b6d4',
    'sterilization':  '#10b981',
  };
  const color = colorMap[(category || '').toLowerCase()] || '#6b7280';
  return `<span class="badge" style="background:${color};color:#fff;">${UI.sanitizeHTML(UI.capitalize(category || ''))}</span>`;
}

/* ─────────────────────────────────────────────
   INITIALIZATION
   ───────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {
  // ── Set user info ─────────────────────────
  const user = Auth.getUser();
  if (!user) { Auth.logout(); return; }

  const firstN = user.firstName || '';
  const lastN  = user.lastName  || '';
  const fullName = `${firstN} ${lastN}`.trim() || user.email || 'Admin';

  const userNameEl = document.getElementById('userName');
  if (userNameEl) userNameEl.textContent = fullName;

  const userAvatarEl = document.getElementById('userAvatar');
  if (userAvatarEl) userAvatarEl.innerHTML = avatarHtml(firstN, lastN, 36);

  const topbarAvatarEl = document.getElementById('topbarAvatar');
  if (topbarAvatarEl) {
    topbarAvatarEl.textContent = UI.getInitials(firstN, lastN) || 'A';
  }

  const profileDropNameEl   = document.getElementById('profileDropName');
  const profileDropAvatarEl = document.getElementById('profileDropAvatar');
  if (profileDropNameEl)   profileDropNameEl.textContent   = fullName;
  if (profileDropAvatarEl) profileDropAvatarEl.textContent = UI.getInitials(firstN, lastN) || 'A';

  initDarkMode();
  initSidebarCollapse();

  // ── Set today's date ──────────────────────
  const topbarDateEl = document.getElementById('topbarDate');
  if (topbarDateEl) {
    topbarDateEl.textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  // ── Set year / period selectors ───────────────────────
  const analyticsYearEl = document.getElementById('analyticsYear');
  if (analyticsYearEl) analyticsYearEl.addEventListener('change', () => {
    loadAnalytics();
    const activePane = document.querySelector('.analytics-tab-pane[data-pane="revenue"].active');
    if (activePane) loadBAM();
  });
  const analyticsPeriodEl = document.getElementById('analyticsPeriod');
  if (analyticsPeriodEl) analyticsPeriodEl.addEventListener('change', () => {
    loadAnalytics();
    const activePane = document.querySelector('.analytics-tab-pane[data-pane="revenue"].active');
    if (activePane) loadBAM();
  });

  // ── Sidebar navigation ────────────────────
  document.querySelectorAll('[data-section]').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      switchSection(link.dataset.section);
      // Close mobile sidebar
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebarOverlay');
      if (sidebar) sidebar.classList.remove('open');
      if (overlay) overlay.classList.remove('active');
    });
  });

  // ── Mobile sidebar toggle ─────────────────
  const sidebarToggle = document.getElementById('sidebarToggle');
  const sidebarClose  = document.getElementById('sidebarClose');
  const sidebarOverlay = document.getElementById('sidebarOverlay');
  const sidebar       = document.getElementById('sidebar');

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
      if (sidebar)       sidebar.classList.toggle('open');
      if (sidebarOverlay) sidebarOverlay.classList.toggle('active');
    });
  }
  if (sidebarClose) {
    sidebarClose.addEventListener('click', () => {
      if (sidebar)       sidebar.classList.remove('open');
      if (sidebarOverlay) sidebarOverlay.classList.remove('active');
    });
  }
  if (sidebarOverlay) {
    sidebarOverlay.addEventListener('click', () => {
      if (sidebar)       sidebar.classList.remove('open');
      sidebarOverlay.classList.remove('active');
    });
  }

  // ── Logout ────────────────────────────────
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      try { await API.post('/auth/logout', {}); } catch (_) { /* ignore */ }
      Auth.logout();
    });
  }

  // ── Appointment filter listeners ──────────
  const apptStatusFilter = document.getElementById('apptStatusFilter');
  const apptDateFilter   = document.getElementById('apptDateFilter');
  if (apptStatusFilter) apptStatusFilter.addEventListener('change', () => { _apptPage = 1; loadAppointments(); });
  if (apptDateFilter)   apptDateFilter.addEventListener('change',   () => { _apptPage = 1; loadAppointments(); });

  // ── Patient search ────────────────────────
  const patientSearch = document.getElementById('patientSearch');
  if (patientSearch) {
    patientSearch.addEventListener('input', debouncePatientSearch);
  }

  // ── Record search ─────────────────────────
  const recordSearch = document.getElementById('recordSearch');
  if (recordSearch) {
    recordSearch.addEventListener('input', debounceRecordSearch);
  }

  // ── Inventory filters ─────────────────────
  const invCategoryFilter = document.getElementById('invCategoryFilter');
  const lowStockFilter    = document.getElementById('lowStockFilter');
  if (invCategoryFilter) invCategoryFilter.addEventListener('change', () => { _invPage = 1; loadInventory(); });
  if (lowStockFilter)    lowStockFilter.addEventListener('change',    () => { _invPage = 1; loadInventory(); });

  // ── Global modal close on overlay click ───
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal(overlay.id);
    });
  });

  // ── Load default section ──────────────────
  switchSection('analytics');

  loadNotifications();
  document.addEventListener('click', e => {
    const notifW   = document.getElementById('notifWrapper');
    const profileW = document.getElementById('profileWrapper');
    if (notifW   && !notifW.contains(e.target))   closeNotifDropdown();
    if (profileW && !profileW.contains(e.target)) closeProfileDropdown();
  });
});

/* ─────────────────────────────────────────────
   SIDEBAR NAVIGATION
   ───────────────────────────────────────────── */

const SECTION_TITLES = {
  analytics:   'Analytics Overview',
  calendar:    'Today\'s Schedule',
  appointments:'Appointments',
  patients:    'Patients',
  records:     'Teeth Records',
  inventory:   'Inventory Management',
  feedback:    'Patient Feedback',
  users:       'User Management',
  bam:         'Business Analytics',
  trash:       'Recently Deleted',
  promotions:  'Promotions & Subscribers',
};

/**
 * Switch the visible dashboard section.
 * @param {string} name  Section identifier
 */
function switchSection(name) {
  // Hide all sections
  document.querySelectorAll('.content-section').forEach(sec => {
    sec.classList.remove('active');
  });

  // Show target section
  const target = document.getElementById(`section-${name}`);
  if (target) target.classList.add('active');

  // Update sidebar active state
  document.querySelectorAll('.sidebar-item').forEach(item => {
    item.classList.toggle('active', item.dataset.section === name);
  });

  // Update topbar title
  const topbarTitle = document.getElementById('topbarTitle');
  if (topbarTitle) topbarTitle.textContent = SECTION_TITLES[name] || name;

  // Load section data
  switch (name) {
    case 'analytics':    loadAnalytics();    break;
    case 'calendar':     loadTodaySchedule(); break;
    case 'appointments': loadAppointments(); break;
    case 'patients':     loadPatients();     break;
    case 'records':      loadRecordPatients(); break;
    case 'inventory':    loadInventory(); loadInventorySummary(); break;
    case 'feedback':     loadFeedback();     break;
    case 'users':        loadUsers();        break;
    case 'bam':          loadBAM();          break;
    case 'trash':        switchTrashTab(_currentTrashType); break;
    case 'promotions':   loadPromoSection(); break;
  }
}

/* ─────────────────────────────────────────────
   3. ANALYTICS
   ───────────────────────────────────────────── */

async function loadAnalytics() {
  try {
    const year = (document.getElementById('analyticsYear') || {}).value || new Date().getFullYear();

    const [overview, trend, services, demographics, feedbackData, inventoryData] = await Promise.all([
      API.get(`/analytics/overview?year=${year}`),
      API.get(`/analytics/appointments-trend?year=${year}`),
      API.get(`/analytics/services-breakdown?year=${year}`),
      API.get(`/analytics/patient-demographics`),
      API.get(`/analytics/feedback-summary`),
      API.get(`/analytics/inventory-summary`),
    ]);

    // ── KPI Cards ──────────────────────────────
    const data = overview.data || overview;

    const kpiPatients = document.getElementById('kpiPatients');
    if (kpiPatients) kpiPatients.textContent = (data.patients && data.patients.total != null) ? data.patients.total : '—';

    const kpiPatientGrowth = document.getElementById('kpiPatientGrowth');
    if (kpiPatientGrowth && data.patients) {
      const growth = data.patients.growth || 0;
      const arrow  = growth >= 0 ? '&#8593;' : '&#8595;';
      const color  = growth >= 0 ? '#22c55e' : '#ef4444';
      kpiPatientGrowth.innerHTML = `<span style="color:${color}">${arrow} ${Math.abs(growth).toFixed(1)}%</span>`;
    }

    const byStatus = (data.appointments && data.appointments.byStatus) || {};

    const kpiAppts = document.getElementById('kpiAppts');
    if (kpiAppts) kpiAppts.textContent = (data.appointments && data.appointments.total != null) ? data.appointments.total : '—';

    const kpiApptToday = document.getElementById('kpiApptToday');
    if (kpiApptToday) kpiApptToday.textContent = `Today: ${(data.appointments && data.appointments.today) || 0}`;

    const kpiCompleted = document.getElementById('kpiCompleted');
    if (kpiCompleted) kpiCompleted.textContent = byStatus.completed || 0;

    const kpiPending = document.getElementById('kpiPending');
    if (kpiPending) kpiPending.textContent = byStatus.pending || 0;

    const kpiCancelled = document.getElementById('kpiCancelled');
    if (kpiCancelled) kpiCancelled.textContent = byStatus.cancelled || 0;

    const feedbackSummary = feedbackData.data || feedbackData;
    const kpiRating = document.getElementById('kpiRating');
    if (kpiRating) {
      const avg = feedbackSummary.avgRating;
      kpiRating.textContent = avg != null ? parseFloat(avg).toFixed(1) : 'N/A';
    }

    const pendingCount = byStatus.pending || 0;
    const pendingBadge = document.getElementById('pendingBadge');
    if (pendingBadge) pendingBadge.textContent = pendingCount;

    const invSummary   = inventoryData.data || inventoryData;
    const lowStockCount = invSummary.lowStock || 0;
    const lowStockBadge = document.getElementById('lowStockBadge');
    if (lowStockBadge) {
      lowStockBadge.textContent = lowStockCount;
      lowStockBadge.style.display = lowStockCount > 0 ? 'inline-flex' : 'none';
    }

    // ── Render Charts ──────────────────────────
    renderAllCharts(
      trend.data || trend,
      services.data || services,
      demographics.data || demographics,
      feedbackSummary,
      invSummary,
    );

    // ── Low Stock Table ────────────────────────
    renderLowStockTable(invSummary);

  } catch (err) {
    console.error('loadAnalytics error:', err);
    UI.showToast(err.message || 'Failed to load analytics data.', 'error');
  }
}

/**
 * Render all dashboard charts.
 */
function renderAllCharts(trend, services, demographics, feedback, inventory) {
  try { renderChartTrend(trend); }        catch (e) { console.error('chartTrend:', e); }
  try { renderChartStatus(trend); }       catch (e) { console.error('chartStatus:', e); }
  try { renderChartServices(services); }  catch (e) { console.error('chartServices:', e); }
  try { renderChartAge(demographics); }   catch (e) { console.error('chartAge:', e); }
  try { renderChartGender(demographics); } catch (e) { console.error('chartGender:', e); }
  try { renderChartRegistrations(demographics); } catch (e) { console.error('chartRegistrations:', e); }
  try { renderChartRating(feedback); }    catch (e) { console.error('chartRating:', e); }
  try { renderChartInventory(inventory); } catch (e) { console.error('chartInventory:', e); }
}

function renderChartTrend(trend) {
  const records = Array.isArray(trend) ? trend : (trend.monthly || trend.records || []);

  const totalArr    = new Array(12).fill(0);
  const completedArr = new Array(12).fill(0);
  const cancelledArr = new Array(12).fill(0);
  const pendingArr   = new Array(12).fill(0);

  records.forEach(item => {
    const month = (item._id && item._id.month != null) ? item._id.month : item.month;
    const idx   = (parseInt(month, 10) || 1) - 1;
    if (idx >= 0 && idx < 12) {
      totalArr[idx]     += item.total     || item.count || 0;
      completedArr[idx] += item.completed || 0;
      cancelledArr[idx] += item.cancelled || 0;
      pendingArr[idx]   += item.pending   || 0;
    }
  });

  destroyAndCreate('chartTrend', {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        {
          label: 'Total',
          data: totalArr,
          borderColor: '#0891b2',
          backgroundColor: 'rgba(8,145,178,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          pointBackgroundColor: '#0891b2',
        },
        {
          label: 'Completed',
          data: completedArr,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.08)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointBackgroundColor: '#22c55e',
        },
        {
          label: 'Cancelled',
          data: cancelledArr,
          borderColor: '#ef4444',
          backgroundColor: 'rgba(239,68,68,0.08)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointBackgroundColor: '#ef4444',
        },
        {
          label: 'Pending',
          data: pendingArr,
          borderColor: '#f59e0b',
          backgroundColor: 'rgba(245,158,11,0.08)',
          tension: 0.4,
          fill: false,
          pointRadius: 4,
          pointBackgroundColor: '#f59e0b',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { precision: 0 },
        },
        x: { grid: { color: 'rgba(0,0,0,0.05)' } },
      },
    },
  });
}

function renderChartStatus(trend) {
  const records = Array.isArray(trend) ? trend : (trend.monthly || trend.records || []);

  const counts = { pending: 0, confirmed: 0, completed: 0, cancelled: 0, no_show: 0 };
  records.forEach(item => {
    counts.pending   += item.pending   || 0;
    counts.confirmed += item.confirmed || 0;
    counts.completed += item.completed || 0;
    counts.cancelled += item.cancelled || 0;
    counts.no_show   += item.no_show   || item.noShow || 0;
  });

  // Fallback: use statusCounts if provided
  if (trend.statusCounts) {
    Object.assign(counts, trend.statusCounts);
  }

  destroyAndCreate('chartStatus', {
    type: 'doughnut',
    data: {
      labels: ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No Show'],
      datasets: [{
        data: [counts.pending, counts.confirmed, counts.completed, counts.cancelled, counts.no_show],
        backgroundColor: ['#f59e0b', '#0891b2', '#22c55e', '#ef4444', '#8b5cf6'],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'bottom' },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${ctx.parsed}`,
          },
        },
      },
    },
  });
}

function renderChartServices(services) {
  const records = Array.isArray(services) ? services : (services.breakdown || services.records || []);

  const labels = records.map(s => s._id || s.service || s.name || 'Unknown');
  const counts = records.map(s => s.count || s.total || 0);

  destroyAndCreate('chartServices', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Appointments',
        data: counts,
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { precision: 0 },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderChartAge(demographics) {
  const ageData  = demographics.ageGroups || demographics.age || {};
  const groups   = ['Under 18', '18-29', '30-39', '40-49', '50-59', '60+'];
  const keys     = ['under18', '18-29', '30-39', '40-49', '50-59', '60plus'];
  const counts   = keys.map(k => {
    if (ageData[k] != null) return ageData[k];
    // try alternative keys
    return ageData[k.replace('-','_')] || ageData[k.replace('-','to')] || 0;
  });

  destroyAndCreate('chartAge', {
    type: 'bar',
    data: {
      labels: groups,
      datasets: [{
        label: 'Patients',
        data: counts,
        backgroundColor: COLORS,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { precision: 0 },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderChartGender(demographics) {
  const genderData = demographics.genderDistribution || demographics.gender || {};
  const labels     = ['Male', 'Female', 'Other', 'Prefer not to say'];
  const keys       = ['male', 'female', 'other', 'prefer_not_to_say'];
  const counts     = keys.map(k => genderData[k] || 0);

  destroyAndCreate('chartGender', {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#0891b2', '#ec4899', '#8b5cf6', '#94a3b8'],
        borderWidth: 2,
        borderColor: '#fff',
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
    },
  });
}

function renderChartRegistrations(demographics) {
  const regData = Array.isArray(demographics.registrationByMonth)
    ? demographics.registrationByMonth
    : (demographics.monthlyRegistrations || new Array(12).fill(0));

  // Ensure 12 slots
  const counts = new Array(12).fill(0);
  regData.forEach((val, idx) => { if (idx < 12) counts[idx] = val || 0; });

  destroyAndCreate('chartRegistrations', {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'New Patients',
        data: counts,
        backgroundColor: 'rgba(8,145,178,0.7)',
        borderColor: '#0891b2',
        borderWidth: 1,
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: { precision: 0 },
        },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderChartRating(feedback) {
  const monthlyAvg = feedback.monthlyAvg || feedback.monthly || [];
  const data = new Array(12).fill(null);

  monthlyAvg.forEach(item => {
    const month = (item._id && item._id.month != null) ? item._id.month : item.month;
    const idx   = (parseInt(month, 10) || 1) - 1;
    if (idx >= 0 && idx < 12) {
      data[idx] = parseFloat(item.avg || item.avgRating || 0).toFixed(2);
    }
  });

  destroyAndCreate('chartRating', {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'Avg Rating',
        data,
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.15)',
        tension: 0.4,
        fill: true,
        pointRadius: 5,
        pointBackgroundColor: '#f59e0b',
        spanGaps: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          min: 0,
          max: 5,
          grid: { color: 'rgba(0,0,0,0.05)' },
        },
        x: { grid: { color: 'rgba(0,0,0,0.05)' } },
      },
    },
  });
}

function renderChartInventory(inventory) {
  const byCategory = inventory.byCategory || inventory.categories || [];
  const labels = byCategory.map(c => UI.capitalize(c._id || c.category || 'Other'));
  const values = byCategory.map(c => parseFloat(c.totalValue || c.value || 0).toFixed(2));

  destroyAndCreate('chartInventory', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Total Value (₱)',
        data: values,
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: 'rgba(0,0,0,0.05)' },
          ticks: {
            callback: val => '₱' + Number(val).toLocaleString('en-PH'),
          },
        },
        y: { grid: { display: false } },
      },
    },
  });
}

/** Render low stock table in #lowStockTable */
function renderLowStockTable(inventory) {
  const tbody = document.getElementById('lowStockTable');
  if (!tbody) return;

  const items = inventory.lowStockItems || inventory.items || [];
  const lowItems = items.filter(i => i.quantity <= i.reorderPoint);

  if (lowItems.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280;padding:1.5rem;">No low stock items.</td></tr>';
    return;
  }

  tbody.innerHTML = lowItems.map(item => `
    <tr>
      <td>${UI.sanitizeHTML(item.name || '')}</td>
      <td>${categoryBadge(item.category)}</td>
      <td style="color:#ef4444;font-weight:700;">${item.quantity}</td>
      <td>${item.reorderPoint}</td>
      <td>${UI.sanitizeHTML(item.unit || '')}</td>
    </tr>
  `).join('');
}

/* ─────────────────────────────────────────────
   4. TODAY'S SCHEDULE
   ───────────────────────────────────────────── */

async function loadTodaySchedule() {
  const container = document.getElementById('todayAppointments');
  const dateLabel = document.getElementById('todayDateLabel');

  if (dateLabel) {
    dateLabel.textContent = new Date().toLocaleDateString('en-PH', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }

  if (container) container.innerHTML = '<p class="loading-text">Loading today\'s schedule…</p>';

  try {
    const res   = await API.get('/analytics/appointments-today');
    const appts = res.data || res.appointments || (Array.isArray(res) ? res : []);

    if (!appts.length) {
      container.innerHTML = '<div class="empty-state"><p>No appointments scheduled for today.</p></div>';
      return;
    }

    container.innerHTML = `<div class="schedule-list">${appts.map(appt => {
      const patient   = appt.patient || {};
      const firstName = patient.firstName || '';
      const lastName  = patient.lastName  || '';
      const fullName  = `${firstName} ${lastName}`.trim() || 'Unknown Patient';
      const service   = appt.serviceType || appt.service || '—';
      const timeStart = appt.timeSlot?.start || (typeof appt.timeSlot === 'string' ? appt.timeSlot : appt.time) || '—';
      const status    = appt.status || 'pending';

      let actionBtns = '';
      if (status === 'pending') {
        actionBtns += `<button class="btn btn-sm btn-primary" onclick="updateApptStatus('${appt._id}','confirmed')">Confirm</button> `;
      }
      if (status === 'confirmed') {
        actionBtns += `<button class="btn btn-sm btn-success" onclick="openCompleteModal('${appt._id}')">Complete</button> `;
      }
      actionBtns += `<button class="btn btn-sm btn-outline" onclick="openApptModal(${JSON.stringify(appt).replace(/"/g,'&quot;')})">Details</button>`;

      return `
        <div class="schedule-card schedule-card--${status}">
          <div class="schedule-card__avatar">${avatarHtml(firstName, lastName, 38)}</div>
          <div class="schedule-card__info">
            <div class="schedule-card__name">${UI.sanitizeHTML(fullName)}</div>
            <div class="schedule-card__service">${UI.sanitizeHTML(service)}</div>
          </div>
          <div class="schedule-card__meta">
            <div class="schedule-card__time">${UI.sanitizeHTML(timeStart)}</div>
            ${UI.getStatusBadge(status)}
          </div>
          <div class="schedule-card__actions">${actionBtns}</div>
        </div>
      `;
    }).join('')}</div>`;

  } catch (err) {
    console.error('loadTodaySchedule error:', err);
    UI.showToast(err.message || 'Failed to load today\'s schedule.', 'error');
    if (container) container.innerHTML = '<p class="error-text">Failed to load schedule.</p>';
  }
}

/* ─────────────────────────────────────────────
   5. APPOINTMENTS
   ───────────────────────────────────────────── */

async function loadAppointments() {
  const tbody  = document.getElementById('apptTableBody');
  const status = (document.getElementById('apptStatusFilter') || {}).value || '';
  const date   = (document.getElementById('apptDateFilter')   || {}).value || '';
  const search = (document.getElementById('apptSearch')       || {}).value || '';

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Loading…</td></tr>';

  try {
    const params = new URLSearchParams({ page: _apptPage, limit: 20 });
    if (status) params.set('status', status);
    if (date)   { params.set('from', date); params.set('to', date); }
    if (search) params.set('search', search);

    const res   = await API.get(`/appointments?${params}`);
    const appts = res.data || res.appointments || (Array.isArray(res) ? res : []);
    const total = res.total || appts.length;
    const pages = res.pages || Math.ceil(total / 20);

    if (!tbody) return;

    if (!appts.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b7280;">No appointments found.</td></tr>';
      renderPagination('apptPagination', 0, 1, 0, () => {});
      return;
    }

    tbody.innerHTML = appts.map(appt => {
      const patient    = appt.patient || {};
      const fullName   = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—';
      const service    = appt.serviceType || appt.service || '—';
      const apptDate   = formatDate(appt.appointmentDate || appt.date);
      const timeSlot   = appt.timeSlot || appt.time || '—';
      const statusBadge = UI.getStatusBadge(appt.status);
      const prioBadge  = priorityBadge(appt.priority);

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:.5rem;">
              ${avatarHtml(patient.firstName, patient.lastName, 30)}
              <span>${UI.sanitizeHTML(fullName)}</span>
            </div>
          </td>
          <td>${UI.sanitizeHTML(service)}</td>
          <td>${apptDate}</td>
          <td>${UI.sanitizeHTML(timeSlot)}</td>
          <td>${statusBadge}</td>
          <td>${prioBadge}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick='openApptModal(${JSON.stringify(appt)})'>View</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('apptPagination', total, _apptPage, pages, (p) => {
      _apptPage = p;
      loadAppointments();
    });

  } catch (err) {
    console.error('loadAppointments error:', err);
    UI.showToast(err.message || 'Failed to load appointments.', 'error');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error-text">Failed to load.</td></tr>';
  }
}

/** @param {object} appt */
function openApptModal(appt) {
  if (typeof appt === 'string') { try { appt = JSON.parse(appt); } catch (_) { return; } }

  const body   = document.getElementById('apptModalBody');
  const footer = document.getElementById('apptModalFooter');
  if (!body) return;

  const patient  = appt.patient || {};
  const fullName = `${patient.firstName || ''} ${patient.lastName || ''}`.trim() || '—';

  body.innerHTML = `
    <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;">
      <div class="detail-item" style="grid-column:1/-1;display:flex;align-items:center;gap:1rem;padding:1rem;background:#f8fafc;border-radius:.5rem;">
        ${avatarHtml(patient.firstName, patient.lastName, 52)}
        <div>
          <div style="font-size:1.1rem;font-weight:700;">${UI.sanitizeHTML(fullName)}</div>
          <div style="color:#6b7280;">${UI.sanitizeHTML(patient.email || '—')}</div>
          <div style="color:#6b7280;">${UI.sanitizeHTML(patient.phone || patient.contactNumber || '—')}</div>
        </div>
      </div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Appointment ID</span><div style="font-weight:600;">${UI.sanitizeHTML(String(appt._id || '').slice(-8))}</div></div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Service</span><div style="font-weight:600;">${UI.sanitizeHTML(appt.serviceType || appt.service || '—')}</div></div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Date</span><div style="font-weight:600;">${formatDate(appt.appointmentDate || appt.date)}</div></div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Time Slot</span><div style="font-weight:600;">${UI.sanitizeHTML(appt.timeSlot || appt.time || '—')}</div></div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Status</span><div>${UI.getStatusBadge(appt.status)}</div></div>
      <div><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Priority</span><div>${priorityBadge(appt.priority)}</div></div>
      <div style="grid-column:1/-1;"><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Notes</span><div style="font-weight:600;">${UI.sanitizeHTML(appt.notes || '—')}</div></div>
      ${appt.treatmentSummary ? `<div style="grid-column:1/-1;"><span class="detail-label" style="color:#6b7280;font-size:.8rem;">Treatment Summary</span><div style="font-weight:600;background:#f0fdf4;padding:.75rem;border-radius:.375rem;">${UI.sanitizeHTML(appt.treatmentSummary)}</div></div>` : ''}
    </div>
  `;

  if (footer) {
    let actions = `<button class="btn btn-outline" onclick="closeModal('apptModal')">Close</button>`;
    const s = appt.status;

    if (s === 'pending') {
      actions += ` <button class="btn btn-primary" onclick="updateApptStatus('${appt._id}','confirmed')">Confirm</button>`;
      actions += ` <button class="btn btn-danger" onclick="updateApptStatus('${appt._id}','cancelled')">Cancel</button>`;
    }
    if (s === 'confirmed') {
      actions += ` <button class="btn btn-success" onclick="openCompleteModal('${appt._id}')">Mark Complete</button>`;
      actions += ` <button class="btn btn-danger" onclick="updateApptStatus('${appt._id}','cancelled')">Cancel</button>`;
    }
    if (s === 'confirmed' || s === 'pending') {
      actions += ` <button class="btn btn-warning" onclick="updateApptStatus('${appt._id}','no_show')">No Show</button>`;
    }

    footer.innerHTML = actions;
  }

  openModal('apptModal');
}

/** @param {string} apptId  Shows complete modal with treatment summary textarea */
function openCompleteModal(apptId) {
  closeModal('apptModal');
  const body = document.getElementById('completeModalBody');
  if (body) {
    body.innerHTML = `
      <div style="margin-bottom:1rem;">
        <label style="display:block;margin-bottom:.375rem;font-weight:600;">Treatment Summary</label>
        <textarea id="treatmentSummaryInput" rows="4" style="width:100%;padding:.625rem;border:1px solid #d1d5db;border-radius:.375rem;font-size:.9rem;" placeholder="Enter treatment notes, procedures performed, medications prescribed…"></textarea>
      </div>
    `;
    const confirmBtn = document.getElementById('completeConfirmBtn');
    if (confirmBtn) {
      confirmBtn.onclick = () => {
        const summary = (document.getElementById('treatmentSummaryInput') || {}).value || '';
        updateApptStatus(apptId, 'completed', { treatmentSummary: summary });
      };
    }
  }
  openModal('completeModal');
}

/**
 * PATCH appointment status.
 * @param {string} id
 * @param {string} status
 * @param {object} [extra]
 */
async function updateApptStatus(id, status, extra = {}) {
  try {
    await API.patch(`/appointments/${id}/status`, { status, ...extra });
    UI.showToast(`Appointment ${status} successfully.`, 'success');
    closeModal('apptModal');
    closeModal('completeModal');

    // Refresh pending badge
    try {
      const res = await API.get('/analytics/overview');
      const data = res.data || res;
      const pendingBadge = document.getElementById('pendingBadge');
      if (pendingBadge && data.appointments && data.appointments.byStatus) {
        pendingBadge.textContent = data.appointments.byStatus.pending || 0;
      }
    } catch (_) { /* ignore */ }

    loadAppointments();

    // Reload today's schedule if visible
    const calSection = document.getElementById('section-calendar');
    if (calSection && calSection.classList.contains('active')) {
      loadTodaySchedule();
    }
  } catch (err) {
    console.error('updateApptStatus error:', err);
    UI.showToast(err.message || 'Failed to update appointment status.', 'error');
  }
}

/* ─────────────────────────────────────────────
   6. PATIENTS
   ───────────────────────────────────────────── */

function debounceApptSearch() {
  clearTimeout(_apptSearchTimer);
  _apptSearchTimer = setTimeout(() => { _apptPage = 1; loadAppointments(); }, 400);
}

function debouncePatientSearch() {
  clearTimeout(_patientSearchTimer);
  _patientSearchTimer = setTimeout(() => { _patientPage = 1; loadPatients(); }, 400);
}

async function loadPatients() {
  const tbody  = document.getElementById('patientTableBody');
  const search = (document.getElementById('patientSearch') || {}).value || '';

  if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="loading-text">Loading…</td></tr>';

  try {
    const params = new URLSearchParams({ page: _patientPage, limit: 20 });
    if (search) params.set('search', search);

    const res      = await API.get(`/patients?${params}`);
    const patients = res.data || res.patients || (Array.isArray(res) ? res : []);
    const total    = res.total || patients.length;
    const pages    = res.pages || Math.ceil(total / 20);

    if (!tbody) return;

    if (!patients.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:2rem;color:#6b7280;">No patients found.</td></tr>';
      renderPagination('patientPagination', 0, 1, 0, () => {});
      return;
    }

    tbody.innerHTML = patients.map(p => {
      const firstName = p.firstName || '';
      const lastName  = p.lastName  || '';
      const fullName  = `${firstName} ${lastName}`.trim() || '—';
      const shortId   = String(p._id || '').slice(-6).toUpperCase();

      return `
        <tr>
          <td><code style="font-size:.75rem;color:#6b7280;">#${shortId}</code></td>
          <td>
            <div style="display:flex;align-items:center;gap:.5rem;">
              ${avatarHtml(firstName, lastName, 32)}
              <span style="font-weight:600;">${UI.sanitizeHTML(fullName)}</span>
            </div>
          </td>
          <td>${UI.sanitizeHTML(p.email || '—')}</td>
          <td>${UI.sanitizeHTML(p.phone || p.contactNumber || '—')}</td>
          <td>${UI.capitalize(p.gender || '—')}</td>
          <td>${formatDate(p.createdAt)}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick='openPatientModal(${JSON.stringify(p)})'>View</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('patientPagination', total, _patientPage, pages, (p) => {
      _patientPage = p;
      loadPatients();
    });

  } catch (err) {
    console.error('loadPatients error:', err);
    UI.showToast(err.message || 'Failed to load patients.', 'error');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="error-text">Failed to load.</td></tr>';
  }
}

/** @param {object} patient */
function openPatientModal(patient) {
  if (typeof patient === 'string') { try { patient = JSON.parse(patient); } catch (_) { return; } }

  const body = document.getElementById('patientModalBody');
  if (!body) return;

  const firstName = patient.firstName || '';
  const lastName  = patient.lastName  || '';
  const fullName  = `${firstName} ${lastName}`.trim() || '—';
  const record    = patient.patientRecord || patient.record || {};
  const emergency = record.emergencyContact || {};
  const lastAppt  = patient.lastAppointment || null;

  body.innerHTML = `
    <div style="text-align:center;padding:1.5rem 0 1rem;">
      ${avatarHtml(firstName, lastName, 72)}
      <h3 style="margin:.75rem 0 .25rem;">${UI.sanitizeHTML(fullName)}</h3>
      <div style="color:#6b7280;font-size:.9rem;">${UI.sanitizeHTML(patient.email || '—')}</div>
    </div>

    <div class="detail-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:.5rem 0;">
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Phone</span><strong>${UI.sanitizeHTML(patient.phone || patient.contactNumber || '—')}</strong></div>
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Gender</span><strong>${UI.capitalize(patient.gender || '—')}</strong></div>
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Date of Birth</span><strong>${formatDate(patient.dateOfBirth)}</strong></div>
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Age</span><strong>${calcAge(patient.dateOfBirth)}</strong></div>
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Blood Type</span><strong>${UI.sanitizeHTML(record.bloodType || '—')}</strong></div>
      <div><span style="color:#6b7280;font-size:.8rem;display:block;">Registered</span><strong>${formatDate(patient.createdAt)}</strong></div>
    </div>

    ${record.allergies && record.allergies.length ? `
    <div style="margin:.75rem 0;padding:.75rem;background:#fef2f2;border-radius:.375rem;border-left:3px solid #ef4444;">
      <span style="color:#6b7280;font-size:.8rem;display:block;margin-bottom:.25rem;">Allergies</span>
      <strong style="color:#ef4444;">${UI.sanitizeHTML(Array.isArray(record.allergies) ? record.allergies.join(', ') : record.allergies)}</strong>
    </div>` : ''}

    ${emergency.name ? `
    <div style="margin:.75rem 0;padding:.75rem;background:#f0f9ff;border-radius:.375rem;">
      <span style="color:#6b7280;font-size:.8rem;display:block;margin-bottom:.25rem;">Emergency Contact</span>
      <strong>${UI.sanitizeHTML(emergency.name)}</strong>
      <span style="color:#6b7280;"> — ${UI.sanitizeHTML(emergency.relationship || '')} — ${UI.sanitizeHTML(emergency.phone || '')}</span>
    </div>` : ''}

    ${lastAppt ? `
    <div style="margin:.75rem 0;padding:.75rem;background:#f8fafc;border-radius:.375rem;">
      <span style="color:#6b7280;font-size:.8rem;display:block;margin-bottom:.25rem;">Last Appointment</span>
      <strong>${formatDate(lastAppt.appointmentDate || lastAppt.date)}</strong>
      <span style="color:#6b7280;"> — ${UI.sanitizeHTML(lastAppt.serviceType || lastAppt.service || '—')}</span>
      <span style="margin-left:.5rem;">${UI.getStatusBadge(lastAppt.status)}</span>
    </div>` : ''}

    <div style="margin-top:1rem;display:flex;justify-content:flex-end;">
      <button class="btn btn-primary" onclick="loadTeethRecord('${patient._id || patient.userId}');closeModal('patientModal');switchSection('records');">
        View Teeth Record
      </button>
    </div>
  `;

  openModal('patientModal');
}

/* ─────────────────────────────────────────────
   7. TEETH RECORDS (FDI)
   ───────────────────────────────────────────── */

const FDI_UPPER = [18,17,16,15,14,13,12,11, 21,22,23,24,25,26,27,28];
const FDI_LOWER = [48,47,46,45,44,43,42,41, 31,32,33,34,35,36,37,38];

const TOOTH_CONDITION_COLORS = {
  healthy:          '#22c55e',
  decayed:          '#ef4444',
  filled:           '#3b82f6',
  missing:          '#94a3b8',
  crowned:          '#f59e0b',
  implant:          '#8b5cf6',
  bridge:           '#06b6d4',
  veneer:           '#ec4899',
  needs_treatment:  '#f97316',
};

const TOOTH_CONDITIONS = [
  { value: 'healthy',          label: 'Healthy'          },
  { value: 'decayed',          label: 'Decayed'          },
  { value: 'filled',           label: 'Filled'           },
  { value: 'missing',          label: 'Missing'          },
  { value: 'crowned',          label: 'Crowned'          },
  { value: 'implant',          label: 'Implant'          },
  { value: 'bridge',           label: 'Bridge'           },
  { value: 'veneer',           label: 'Veneer'           },
  { value: 'needs_treatment',  label: 'Needs Treatment'  },
];

function toothCell(num, condition, notes, editable) {
  const cond   = condition || 'healthy';
  const color  = TOOTH_CONDITION_COLORS[cond] || '#22c55e';
  const title  = `Tooth ${num} – ${UI.capitalize(cond.replace(/_/g,' '))}${notes ? ': ' + notes : ''}`;
  const cursor = editable ? 'cursor:pointer;' : '';
  const onclick = editable ? `onclick="openToothModal(${num})"` : '';
  return `
    <div class="tooth-cell ${cond}" title="${UI.sanitizeHTML(title)}" ${onclick}
         style="display:flex;flex-direction:column;align-items:center;gap:2px;padding:2px;${cursor}">
      <span class="tooth-number" style="font-size:.6rem;color:#6b7280;font-weight:600;">${num}</span>
      <div class="tooth-shape" style="width:24px;height:28px;background:${color};border-radius:50% 50% 40% 40%;border:2px solid rgba(0,0,0,.12);"></div>
    </div>
  `;
}

function renderTeethChart(record, containerId, editable) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const chartMap = {};
  if (record && record.dentalChart) {
    const dc = record.dentalChart;
    if (typeof dc === 'object') {
      Object.keys(dc).forEach(key => {
        const entry = dc[key];
        chartMap[parseInt(key, 10)] = {
          condition: (entry && entry.condition) || 'healthy',
          notes:     (entry && entry.notes)     || '',
        };
      });
    }
  }

  const upperHtml = FDI_UPPER.map(n => toothCell(n, (chartMap[n]||{}).condition, (chartMap[n]||{}).notes, editable)).join('');
  const lowerHtml = FDI_LOWER.map(n => toothCell(n, (chartMap[n]||{}).condition, (chartMap[n]||{}).notes, editable)).join('');

  const legendHtml = Object.entries(TOOTH_CONDITION_COLORS).map(([cond, color]) => `
    <div style="display:flex;align-items:center;gap:.35rem;font-size:.72rem;">
      <div style="width:12px;height:12px;background:${color};border-radius:50%;flex-shrink:0;"></div>
      <span>${UI.capitalize(cond.replace(/_/g,' '))}</span>
    </div>
  `).join('');

  container.innerHTML = `
    <div class="teeth-chart-wrapper" style="background:#fff;border-radius:.5rem;padding:1.25rem;box-shadow:0 1px 4px rgba(0,0,0,.08);">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
        <h4 style="margin:0;color:#0f172a;">FDI Dental Chart</h4>
        <span style="font-size:.8rem;color:#6b7280;">Click a tooth to edit${editable ? '' : ' (read-only)'}</span>
      </div>
      <div style="text-align:center;font-size:.72rem;color:#6b7280;margin-bottom:.35rem;letter-spacing:.04em;text-transform:uppercase;">Upper Jaw</div>
      <div class="teeth-arch" style="display:flex;justify-content:center;gap:2px;margin-bottom:.5rem;flex-wrap:nowrap;overflow-x:auto;padding:.25rem 0;">
        ${upperHtml}
      </div>
      <div style="border-top:2px dashed #e2e8f0;margin:.5rem auto;width:80%;"></div>
      <div class="teeth-arch" style="display:flex;justify-content:center;gap:2px;margin-top:.5rem;flex-wrap:nowrap;overflow-x:auto;padding:.25rem 0;">
        ${lowerHtml}
      </div>
      <div style="text-align:center;font-size:.72rem;color:#6b7280;margin-top:.35rem;letter-spacing:.04em;text-transform:uppercase;">Lower Jaw</div>
      <div class="tooth-legend" style="display:flex;flex-wrap:wrap;gap:.5rem 1rem;margin-top:1rem;padding-top:.75rem;border-top:1px solid #e2e8f0;">
        ${legendHtml}
      </div>
    </div>
  `;
}

async function loadTeethRecord(userId) {
  const container = document.getElementById('recordsContent');
  if (!container) return;
  _teethRecordUserId = userId;
  container.innerHTML = '<p class="loading-text">Loading teeth record…</p>';

  try {
    const res    = await API.get(`/records/${userId}`);
    const record = res.data || res.record || res;

    const patient   = record.patientUser || record.patient || {};
    const firstName = patient.firstName || '';
    const lastName  = patient.lastName  || '';
    const fullName  = `${firstName} ${lastName}`.trim() || '—';
    const history   = record.treatmentHistory || [];

    container.innerHTML = `
      <div style="margin-bottom:1rem;">
        <button class="btn btn-outline btn-sm" onclick="loadRecordPatients(document.getElementById('recordSearch')?.value||'')">
          <i class="fa-solid fa-arrow-left"></i> Back to Patients
        </button>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;margin-bottom:1.25rem;">
        <div style="display:flex;align-items:center;gap:1rem;">
          ${avatarHtml(firstName, lastName, 56)}
          <div>
            <h2 style="margin:0 0 .2rem;">${UI.sanitizeHTML(fullName)}</h2>
            <div style="color:#6b7280;font-size:.85rem;">${UI.sanitizeHTML(patient.email || '—')}</div>
          </div>
        </div>
        <button class="btn btn-primary" onclick="openAddTreatmentModal('${userId}')">+ Add Treatment Note</button>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;margin-bottom:1.25rem;">
        <div style="padding:.875rem 1rem;background:#fff;border-radius:.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #22c55e;">
          <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;">Oral Hygiene</div>
          <div style="font-size:1.15rem;font-weight:700;color:#0891b2;">${UI.sanitizeHTML(record.oralHygieneRating || '—')}</div>
        </div>
        <div style="padding:.875rem 1rem;background:#fff;border-radius:.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #8b5cf6;">
          <div style="font-size:.75rem;color:#6b7280;text-transform:uppercase;">Periodontal</div>
          <div style="font-size:1.15rem;font-weight:700;color:#8b5cf6;">${UI.sanitizeHTML(record.periodontalStatus || '—')}</div>
        </div>
        ${record.allergiesNotes ? `
        <div style="padding:.875rem 1rem;background:#fef2f2;border-radius:.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #ef4444;">
          <div style="font-size:.75rem;color:#ef4444;text-transform:uppercase;">Allergies</div>
          <div style="font-size:.9rem;font-weight:600;color:#ef4444;">${UI.sanitizeHTML(record.allergiesNotes)}</div>
        </div>` : ''}
        ${record.pharmacyNotes ? `
        <div style="padding:.875rem 1rem;background:#fffbeb;border-radius:.5rem;box-shadow:0 1px 4px rgba(0,0,0,.08);border-left:4px solid #f59e0b;">
          <div style="font-size:.75rem;color:#b45309;text-transform:uppercase;">Pharmacy Notes</div>
          <div style="font-size:.9rem;font-weight:600;color:#b45309;">${UI.sanitizeHTML(record.pharmacyNotes)}</div>
        </div>` : ''}
      </div>

      <div id="teethChartContainer" style="margin-bottom:1.25rem;"></div>

      <h3 style="margin-bottom:.75rem;">Treatment History</h3>
      ${history.length ? `
      <div style="overflow-x:auto;">
        <table class="data-table" style="width:100%;border-collapse:collapse;">
          <thead>
            <tr>
              <th style="padding:.75rem;background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">Date</th>
              <th style="padding:.75rem;background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">Service</th>
              <th style="padding:.75rem;background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">Dentist</th>
              <th style="padding:.75rem;background:#f8fafc;text-align:left;border-bottom:2px solid #e2e8f0;">Notes</th>
            </tr>
          </thead>
          <tbody>
            ${history.map(h => {
              const dentist = h.dentist || {};
              const dentistName = typeof dentist === 'object'
                ? `${dentist.firstName||''} ${dentist.lastName||''}`.trim() || '—'
                : String(dentist || '—');
              return `
                <tr style="border-bottom:1px solid #f1f5f9;">
                  <td style="padding:.75rem;">${formatDate(h.date || h.createdAt)}</td>
                  <td style="padding:.75rem;font-weight:600;">${UI.sanitizeHTML(h.service || h.serviceType || '—')}</td>
                  <td style="padding:.75rem;">${UI.sanitizeHTML(dentistName)}</td>
                  <td style="padding:.75rem;color:#6b7280;">${UI.sanitizeHTML(h.notes || '—')}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<p style="color:#6b7280;text-align:center;padding:2rem;">No treatment history on record.</p>'}
    `;

    // Render the FDI chart (editable)
    renderTeethChart(record, 'teethChartContainer', true);

  } catch (err) {
    console.error('loadTeethRecord error:', err);
    UI.showToast(err.message || 'Failed to load teeth record.', 'error');
    container.innerHTML = '<p class="error-text">Failed to load teeth record. Patient may not have a record yet.</p>';
  }
}

function openToothModal(toothNum) {
  if (!_teethRecordUserId) { UI.showToast('No patient selected.', 'warning'); return; }

  const toothNumEl = document.getElementById('toothModalNum');
  const condEl     = document.getElementById('toothCondition');
  const notesEl    = document.getElementById('toothNotes');

  if (toothNumEl) toothNumEl.textContent = `Tooth ${toothNum}`;
  if (notesEl)   notesEl.value = '';

  // Pre-fill from current chart if available
  const wrapper = document.getElementById('teethChartContainer');
  const cell = wrapper && wrapper.querySelector(`[title^="Tooth ${toothNum}"]`);
  if (cell) {
    const titleStr = cell.getAttribute('title') || '';
    const condMatch = titleStr.match(/– ([^:]+)/);
    if (condMatch && condEl) {
      const condLabel = condMatch[1].trim().toLowerCase().replace(/ /g,'_');
      condEl.value = TOOTH_CONDITIONS.find(c=>c.label.toLowerCase()===condLabel.replace(/_/g,' '))?.value || 'healthy';
    }
    const notesMatch = titleStr.match(/: (.+)$/);
    if (notesMatch && notesEl) notesEl.value = notesMatch[1].trim();
  }

  const confirmBtn = document.getElementById('toothModalSaveBtn');
  if (confirmBtn) {
    confirmBtn.onclick = () => saveToothCondition(toothNum);
  }

  openModal('toothModal');
}

async function saveToothCondition(toothNum) {
  if (!_teethRecordUserId) return;
  const condition = (document.getElementById('toothCondition') || {}).value || 'healthy';
  const notes     = (document.getElementById('toothNotes')     || {}).value || '';

  try {
    const currentRes = await API.get(`/records/${_teethRecordUserId}`);
    const record = currentRes.data || currentRes.record || currentRes;

    const dentalChart = {};
    if (record.dentalChart && typeof record.dentalChart === 'object') {
      Object.keys(record.dentalChart).forEach(k => {
        dentalChart[k] = record.dentalChart[k];
      });
    }
    dentalChart[String(toothNum)] = { condition, notes };

    await API.patch(`/records/${_teethRecordUserId}`, { dentalChart });
    UI.showToast(`Tooth ${toothNum} updated.`, 'success');
    closeModal('toothModal');
    loadTeethRecord(_teethRecordUserId);
  } catch (err) {
    console.error('saveToothCondition error:', err);
    UI.showToast(err.message || 'Failed to save tooth condition.', 'error');
  }
}

function debounceRecordSearch() {
  clearTimeout(_recordSearchTimer);
  _recordSearchTimer = setTimeout(runRecordSearch, 400);
}

async function runRecordSearch() {
  const search = document.getElementById('recordSearch')?.value || '';
  loadRecordPatients(search, 1);
}

async function loadRecordPatients(search = '', page = 1) {
  const container = document.getElementById('recordsContent');
  if (!container) return;
  container.innerHTML = '<p class="loading-text"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading patients…</p>';
  try {
    const params = new URLSearchParams({ page, limit: 15 });
    if (search.trim()) params.set('search', search.trim());
    const res = await API.get(`/patients?${params}`);
    const patients = res.data || [];
    const total    = res.total || 0;
    const pages    = res.pages || 1;

    if (!patients.length) {
      container.innerHTML = `<div class="empty-state"><i class="fa-solid fa-tooth"></i><p>${search ? 'No patients match your search.' : 'No patients found.'}</p></div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-card">
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr>
              <th>Patient</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Action</th>
            </tr></thead>
            <tbody>
              ${patients.map(p => {
                const fullName = `${p.firstName || ''} ${p.lastName || ''}`.trim() || '—';
                return `
                  <tr>
                    <td>
                      <div style="display:flex;align-items:center;gap:.75rem;">
                        ${avatarHtml(p.firstName, p.lastName, 36)}
                        <span style="font-weight:600;color:var(--text-primary)">${escHtml(fullName)}</span>
                      </div>
                    </td>
                    <td style="color:var(--text-secondary)">${escHtml(p.email || '—')}</td>
                    <td style="color:var(--text-secondary)">${escHtml(p.phone || '—')}</td>
                    <td>
                      <button class="btn btn-sm btn-primary" onclick="loadTeethRecord('${p._id}')">
                        <i class="fa-solid fa-tooth"></i> View Record
                      </button>
                    </td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>
        <div class="pagination-bar" id="recordsPagination"></div>
      </div>`;

    renderPagination('recordsPagination', total, page, pages, (p) => loadRecordPatients(document.getElementById('recordSearch')?.value || '', p));
  } catch (err) {
    console.error('loadRecordPatients error:', err);
    container.innerHTML = '<p class="error-text">Failed to load patients. Please try again.</p>';
  }
}

function openAddTreatmentModal(patientId) {
  const body = document.getElementById('treatmentModalBody');
  if (body) {
    body.innerHTML = `
      <input type="hidden" id="treatmentPatientId" value="${patientId}">
      <div style="display:grid;gap:1rem;">
        <div>
          <label style="display:block;margin-bottom:.25rem;font-weight:600;">Service / Procedure</label>
          <input type="text" id="treatmentService" placeholder="e.g. Tooth Extraction" style="width:100%;padding:.625rem;border:1px solid #d1d5db;border-radius:.375rem;">
        </div>
        <div>
          <label style="display:block;margin-bottom:.25rem;font-weight:600;">Date</label>
          <input type="date" id="treatmentDate" value="${new Date().toISOString().split('T')[0]}" style="width:100%;padding:.625rem;border:1px solid #d1d5db;border-radius:.375rem;">
        </div>
        <div>
          <label style="display:block;margin-bottom:.25rem;font-weight:600;">Practitioner</label>
          <input type="text" id="treatmentPractitioner" placeholder="Dentist name" style="width:100%;padding:.625rem;border:1px solid #d1d5db;border-radius:.375rem;">
        </div>
        <div>
          <label style="display:block;margin-bottom:.25rem;font-weight:600;">Notes</label>
          <textarea id="treatmentNotes" rows="4" style="width:100%;padding:.625rem;border:1px solid #d1d5db;border-radius:.375rem;" placeholder="Treatment notes…"></textarea>
        </div>
      </div>
    `;
  }
  openModal('treatmentModal');
}

async function submitTreatmentNote() {
  const patientId   = (document.getElementById('treatmentPatientId') || {}).value;
  const service     = (document.getElementById('treatmentService')    || {}).value || '';
  const date        = (document.getElementById('treatmentDate')       || {}).value || '';
  const notes       = (document.getElementById('treatmentNotes')      || {}).value || '';
  const practitioner = (document.getElementById('treatmentPractitioner') || {}).value || '';

  if (!service.trim()) { UI.showToast('Please enter a service or procedure.', 'warning'); return; }

  try {
    await API.post(`/records/${patientId}/treatment`, { service, date, notes, practitioner });
    UI.showToast('Treatment note added successfully.', 'success');
    closeModal('treatmentModal');
    loadTeethRecord(patientId);
  } catch (err) {
    console.error('submitTreatmentNote error:', err);
    UI.showToast(err.message || 'Failed to add treatment note.', 'error');
  }
}

/* ─────────────────────────────────────────────
   8. INVENTORY
   ───────────────────────────────────────────── */

function debounceInvSearch() {
  clearTimeout(_invSearchTimer);
  _invSearchTimer = setTimeout(() => { _invPage = 1; loadInventory(); }, 400);
}

async function loadInventory() {
  const tbody = document.getElementById('invTableBody');
  const category  = (document.getElementById('invCategoryFilter') || {}).value || '';
  const lowStock  = (document.getElementById('lowStockFilter')    || {}).checked || false;
  const search    = (document.getElementById('invSearch')         || {}).value || '';

  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="loading-text">Loading…</td></tr>';

  try {
    const params = new URLSearchParams({ page: _invPage, limit: 25 });
    if (category) params.set('category', category);
    if (lowStock) params.set('lowStock', 'true');
    if (search)   params.set('search', search);

    const res   = await API.get(`/inventory?${params}`);
    const items = res.data || res.items || (Array.isArray(res) ? res : []);
    const total = res.total || items.length;
    const pages = res.pages || Math.ceil(total / 25);

    if (!tbody) return;

    if (!items.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:2rem;color:#6b7280;">No inventory items found.</td></tr>';
      renderPagination('invPagination', 0, 1, 0, () => {});
      return;
    }

    tbody.innerHTML = items.map(item => {
      const qty = item.quantity != null ? item.quantity : (item.qty || 0);
      const reorderPt = item.reorderPoint || 0;
      const isLow     = qty <= reorderPt;
      const isWarn    = qty <= reorderPt * 1.5;
      const qtyColor  = isLow ? '#ef4444' : (isWarn ? '#f59e0b' : 'inherit');

      let statusBadge;
      if (qty === 0)    statusBadge = '<span class="badge badge--danger">Out of Stock</span>';
      else if (isLow)   statusBadge = '<span class="badge badge--danger">Low Stock</span>';
      else              statusBadge = '<span class="badge badge--success">Adequate</span>';

      const totalValue = (parseFloat(item.unitCost || item.cost || 0) * qty).toFixed(2);

      return `
        <tr>
          <td style="font-weight:600;">${UI.sanitizeHTML(item.name || '')}</td>
          <td>${categoryBadge(item.category)}</td>
          <td style="color:${qtyColor};font-weight:${isLow ? '700' : '400'};">${qty}</td>
          <td>${UI.sanitizeHTML(item.unit || '')}</td>
          <td>${reorderPt}</td>
          <td>${UI.formatCurrency(item.unitCost || item.cost || 0)}</td>
          <td>${statusBadge}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick='openEditInvModal(${JSON.stringify(item)})'>Edit</button>
            <button class="btn btn-sm btn-primary" onclick='openAdjustStockModal(${JSON.stringify(item)})'>Adjust</button>
            <button class="btn btn-sm btn-danger" onclick="deleteInventoryItem('${item._id}')">Delete</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('invPagination', total, _invPage, pages, (p) => {
      _invPage = p;
      loadInventory();
    });

  } catch (err) {
    console.error('loadInventory error:', err);
    UI.showToast(err.message || 'Failed to load inventory.', 'error');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="error-text">Failed to load.</td></tr>';
  }
}

async function loadInventorySummary() {
  try {
    const res  = await API.get('/analytics/inventory-summary');
    const data = res.data || res;

    const invSummary = document.getElementById('invSummary');
    if (!invSummary) return;

    invSummary.innerHTML = `
      <div class="kpi-card kpi-teal">
        <div class="kpi-icon"><i class="fa-solid fa-boxes-stacked"></i></div>
        <div class="kpi-data">
          <span class="kpi-value">${data.totalItems || 0}</span>
          <span class="kpi-label">Total Items</span>
        </div>
      </div>
      <div class="kpi-card kpi-green">
        <div class="kpi-icon"><i class="fa-solid fa-peso-sign"></i></div>
        <div class="kpi-data">
          <span class="kpi-value">${UI.formatCurrency(data.totalValue || 0)}</span>
          <span class="kpi-label">Total Value</span>
        </div>
      </div>
      <div class="kpi-card kpi-red">
        <div class="kpi-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div class="kpi-data">
          <span class="kpi-value">${data.lowStock || 0}</span>
          <span class="kpi-label">Low Stock Items</span>
        </div>
      </div>
      <div class="kpi-card kpi-purple">
        <div class="kpi-icon"><i class="fa-solid fa-tags"></i></div>
        <div class="kpi-data">
          <span class="kpi-value">${(data.byCategory || []).length}</span>
          <span class="kpi-label">Categories</span>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('loadInventorySummary error:', err);
  }
}

function openAddInventoryModal() {
  _editInvId = null;
  const title = document.getElementById('invModalTitle');
  if (title) title.textContent = 'Add Inventory Item';

  const form = document.getElementById('invForm');
  if (form) form.reset();

  openModal('invModal');
}

/** @param {object} item */
function openEditInvModal(item) {
  if (typeof item === 'string') { try { item = JSON.parse(item); } catch (_) { return; } }
  _editInvId = item._id;

  const title = document.getElementById('invModalTitle');
  if (title) title.textContent = 'Edit Inventory Item';

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
  set('invName',        item.name);
  set('invCategory',    item.category);
  set('invQuantity',    item.quantity != null ? item.quantity : (item.qty != null ? item.qty : ''));
  set('invUnit',        item.unit);
  set('invReorderPoint', item.reorderPoint);
  set('invUnitCost',    item.unitCost || item.cost);
  set('invSupplier',    item.supplier);
  set('invNotes',       item.notes);

  openModal('invModal');
}

async function submitInventoryForm() {
  const get = id => (document.getElementById(id) || {}).value || '';

  const payload = {
    name:         get('invName').trim(),
    category:     get('invCategory'),
    quantity:     parseInt(get('invQuantity'), 10) || 0,
    unit:         get('invUnit').trim(),
    reorderPoint: parseInt(get('invReorderPoint'), 10) || 0,
    unitCost:     parseFloat(get('invUnitCost')) || 0,
    supplier:     get('invSupplier').trim(),
    notes:        get('invNotes').trim(),
  };

  if (!payload.name) { UI.showToast('Item name is required.', 'warning'); return; }

  try {
    if (_editInvId) {
      await API.put(`/inventory/${_editInvId}`, payload);
      UI.showToast('Inventory item updated.', 'success');
    } else {
      await API.post('/inventory', payload);
      UI.showToast('Inventory item added.', 'success');
    }
    closeModal('invModal');
    loadInventory();
    loadInventorySummary();
  } catch (err) {
    console.error('submitInventoryForm error:', err);
    UI.showToast(err.message || 'Failed to save inventory item.', 'error');
  }
}

/** @param {object} item */
function openAdjustStockModal(item) {
  if (typeof item === 'string') { try { item = JSON.parse(item); } catch (_) { return; } }

  const idEl   = document.getElementById('adjustItemId');
  const nameEl = document.getElementById('adjustItemName');
  const qtyEl  = document.getElementById('adjustCurrentQty');
  const adjEl  = document.getElementById('adjustQuantity');

  if (idEl)   idEl.value   = item._id;
  if (nameEl) nameEl.textContent = item.name || '';
  if (qtyEl)  qtyEl.textContent = item.quantity != null ? item.quantity : (item.qty || 0);
  if (adjEl)  adjEl.value  = '';

  openModal('adjustStockModal');
}

async function submitStockAdjust() {
  const id     = (document.getElementById('adjustItemId')  || {}).value;
  const adjust = parseInt((document.getElementById('adjustQuantity') || {}).value, 10);
  const reason = (document.getElementById('adjustReason') || {}).value || '';

  if (!id) { UI.showToast('Invalid item.', 'warning'); return; }
  if (isNaN(adjust)) { UI.showToast('Please enter a valid adjustment amount.', 'warning'); return; }

  try {
    await API.patch(`/inventory/${id}/adjust`, { action: (document.getElementById('adjustAction')||{}).value||'restock', quantity: Math.abs(parseInt((document.getElementById('adjustQty')||{}).value,10)||1), notes: (document.getElementById('adjustNotes')||{}).value||'' });
    UI.showToast(`Stock adjusted by ${adjust > 0 ? '+' : ''}${adjust}.`, 'success');
    closeModal('adjustStockModal');
    loadInventory();
    loadInventorySummary();
  } catch (err) {
    console.error('submitStockAdjust error:', err);
    UI.showToast(err.message || 'Failed to adjust stock.', 'error');
  }
}

async function deleteInventoryItem(id) {
  const confirmed = await UI.showConfirm('Are you sure you want to delete this inventory item? This action cannot be undone.', 'Delete Item');
  if (!confirmed) return;

  try {
    await API.delete(`/inventory/${id}`);
    UI.showToast('Inventory item deleted.', 'success');
    loadInventory();
    loadInventorySummary();
  } catch (err) {
    console.error('deleteInventoryItem error:', err);
    UI.showToast(err.message || 'Failed to delete item.', 'error');
  }
}

/* ─────────────────────────────────────────────
   9. FEEDBACK
   ───────────────────────────────────────────── */

async function loadFeedback() {
  const statsEl      = document.getElementById('feedbackStats');
  const gridEl       = document.getElementById('feedbackGrid');
  const ratingFilter = (document.getElementById('feedbackRatingSort') || {}).value || '';
  const sortBy       = (document.getElementById('feedbackSortBy')     || {}).value || 'recent';
  const nameSearch   = ((document.getElementById('feedbackSearch')    || {}).value || '').trim().toLowerCase();

  if (gridEl) gridEl.innerHTML = '<p class="loading-text">Loading feedback…</p>';

  try {
    const res    = await API.get('/feedback');
    let feedback = res.data || res.feedback || (Array.isArray(res) ? res : []);

    if (!feedback.length) {
      if (gridEl) gridEl.innerHTML = '<div class="empty-state"><p>No feedback received yet.</p></div>';
      return;
    }

    // Stats are calculated from the full unfiltered set
    const allCount  = feedback.length;
    const allAvg    = feedback.reduce((s, f) => s + (f.overallRating || 0), 0) / allCount;
    const allRec    = feedback.filter(f => f.wouldRecommend === true).length;
    const allRecPct = Math.round((allRec / allCount) * 100);

    // Filter by patient name search
    if (nameSearch) {
      feedback = feedback.filter(f => {
        if (f.isAnonymous) return false;
        const p = f.patient || f.userId || {};
        const fullName = ((p.firstName || '') + ' ' + (p.lastName || '')).toLowerCase();
        return fullName.includes(nameSearch) || (p.email || '').toLowerCase().includes(nameSearch);
      });
    }

    // Filter by star rating
    if (ratingFilter) {
      const targetRating = parseInt(ratingFilter, 10);
      feedback = feedback.filter(f => Math.round(f.overallRating || 0) === targetRating);
    }

    // Sort
    if (sortBy === 'rating-highest') {
      feedback.sort((a, b) => (b.overallRating || 0) - (a.overallRating || 0));
    } else if (sortBy === 'rating-lowest') {
      feedback.sort((a, b) => (a.overallRating || 0) - (b.overallRating || 0));
    } else {
      feedback.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    if (statsEl) {
      statsEl.innerHTML =
        `<div class="kpi-card kpi-orange">
          <div class="kpi-icon"><i class="fa-solid fa-star"></i></div>
          <div class="kpi-data">
            <span class="kpi-value">${allAvg.toFixed(1)}</span>
            <span class="kpi-label">Avg Rating</span>
          </div>
        </div>` +
        `<div class="kpi-card kpi-blue">
          <div class="kpi-icon"><i class="fa-solid fa-comment-dots"></i></div>
          <div class="kpi-data">
            <span class="kpi-value">${allCount}</span>
            <span class="kpi-label">Total Reviews</span>
          </div>
        </div>` +
        `<div class="kpi-card kpi-green">
          <div class="kpi-icon"><i class="fa-solid fa-thumbs-up"></i></div>
          <div class="kpi-data">
            <span class="kpi-value">${allRecPct}%</span>
            <span class="kpi-label">Would Recommend</span>
          </div>
        </div>`;
    }

    if (gridEl) {
      if (!feedback.length) {
        gridEl.innerHTML = '<div class="empty-state"><p>No feedback matches your search/filter.</p></div>';
      } else {
        gridEl.innerHTML = feedback.map(f => renderFeedbackCard(f)).join('');
      }
    }

  } catch (err) {
    console.error('loadFeedback error:', err);
    UI.showToast(err.message || 'Failed to load feedback.', 'error');
    if (gridEl) gridEl.innerHTML = '<p class="error-text">Failed to load feedback.</p>';
  }
}

/** @param {object} f Feedback object @returns {string} HTML */
function renderFeedbackCard(f) {
  const patient = f.patient || f.userId || {};
  const firstName = patient.firstName || '';
  const lastName  = patient.lastName  || '';
  const fullName  = f.isAnonymous ? 'Anonymous' : (`${firstName} ${lastName}`.trim() || 'Unknown Patient');
  const rating    = f.overallRating || 0;

  const categoryRatings = f.categoryRatings || {};
  const catHtml = Object.keys(categoryRatings).length ? `
    <div class="feedback-cat-grid">
      ${Object.entries(categoryRatings).map(([key, val]) => `
        <div class="feedback-cat-item">
          <div class="feedback-cat-label">${UI.sanitizeHTML(key.replace(/_/g,' '))}</div>
          <div>${stars(val)}</div>
        </div>
      `).join('')}
    </div>
  ` : '';

  const adminResponseHtml = f.adminResponse ? `
    <div class="feedback-admin-response">
      <div class="feedback-admin-label">Admin Response</div>
      <p>${UI.sanitizeHTML(f.adminResponse)}</p>
    </div>
  ` : '';

  const feedbackId = f._id;

  return `
    <div class="feedback-card">
      <div class="feedback-card__header">
        <div class="feedback-card__author">
          ${!f.isAnonymous ? avatarHtml(firstName, lastName, 36) : '<div class="user-avatar sm" style="background:#9ca3af;">?</div>'}
          <div>
            <div class="feedback-card__name">${UI.sanitizeHTML(fullName)}</div>
            <div class="feedback-card__date">${formatDate(f.createdAt)}</div>
          </div>
        </div>
        <div class="feedback-card__rating">
          <div>${stars(rating)}</div>
          ${f.wouldRecommend ? '<span class="badge badge-success">Would Recommend</span>' : ''}
        </div>
      </div>

      ${f.comment ? `<p class="feedback-card__comment">${UI.sanitizeHTML(f.comment)}</p>` : ''}

      ${catHtml}
      ${adminResponseHtml}

      <div class="feedback-card__actions">
        ${!f.adminResponse ? `
          <button class="btn btn-sm btn-outline" onclick="toggleRespondArea('${feedbackId}')"><i class="fa-solid fa-reply"></i> Respond</button>
        ` : ''}
        <button class="btn btn-sm btn-danger" onclick="deleteFeedback('${feedbackId}')" title="Delete feedback"><i class="fa-solid fa-trash"></i></button>
      </div>
      ${!f.adminResponse ? `
        <div id="respond-${feedbackId}" class="feedback-respond-area" style="display:none;">
          <textarea id="respondText-${feedbackId}" rows="3" class="form-control" style="margin-bottom:.625rem;" placeholder="Enter your response…"></textarea>
          <button class="btn btn-sm btn-primary" onclick="submitFeedbackResponse('${feedbackId}')">Submit Response</button>
        </div>
      ` : ''}
    </div>
  `;
}

function toggleRespondArea(feedbackId) {
  const area = document.getElementById(`respond-${feedbackId}`);
  if (area) area.style.display = area.style.display === 'none' ? 'block' : 'none';
}

async function submitFeedbackResponse(feedbackId) {
  const response = (document.getElementById(`respondText-${feedbackId}`) || {}).value || '';
  if (!response.trim()) { UI.showToast('Please enter a response.', 'warning'); return; }

  try {
    await API.post(`/feedback/${feedbackId}/respond`, { message: response });
    UI.showToast('Response submitted.', 'success');
    loadFeedback();
  } catch (err) {
    console.error('submitFeedbackResponse error:', err);
    UI.showToast(err.message || 'Failed to submit response.', 'error');
  }
}

async function deleteFeedback(feedbackId) {
  const confirmed = await UI.showConfirm('Are you sure you want to delete this feedback? It will be moved to the trash bin.', 'Delete Feedback');
  if (!confirmed) return;
  try {
    await API.delete(`/feedback/${feedbackId}`);
    UI.showToast('Feedback deleted and moved to trash.', 'success');
    loadFeedback();
  } catch (err) {
    console.error('deleteFeedback error:', err);
    UI.showToast(err.message || 'Failed to delete feedback.', 'error');
  }
}

/* ─────────────────────────────────────────────
   10. BUSINESS ANALYTICS MODULE (BAM)
   ───────────────────────────────────────────── */

let _bamYear = new Date().getFullYear();

async function loadBAM() {
  try {
    // Read from the shared analyticsYear / analyticsPeriod selectors
    const yearEl   = document.getElementById('analyticsYear');
    const periodEl = document.getElementById('analyticsPeriod');
    if (yearEl)   _bamYear  = parseInt(yearEl.value)   || _bamYear;
    if (periodEl) _bamPeriod = periodEl.value           || _bamPeriod;

    const [kpis, trend, byService, peakHours, peakDays, behavior, funnel, newReturn] = await Promise.all([
      API.get('/analytics/revenue-kpis'),
      API.get(`/analytics/revenue-trend?period=${_bamPeriod}&year=${_bamYear}`),
      API.get(`/analytics/revenue-by-service?year=${_bamYear}`),
      API.get(`/analytics/peak-hours?year=${_bamYear}`),
      API.get(`/analytics/peak-days?year=${_bamYear}`),
      API.get('/analytics/patient-behavior'),
      API.get('/analytics/completion-funnel'),
      API.get(`/analytics/new-vs-returning?year=${_bamYear}`),
    ]);

    const k = kpis.data || kpis;

    const setKpi = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setKpi('bamTotalRev',    '₱' + Number(k.totalRevenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setKpi('bamMonthRev',    '₱' + Number(k.monthlyRevenue || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setKpi('bamAvgRev',      '₱' + Number(k.avgRevenuePerVisit || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    setKpi('bamCompleted',   k.totalCompleted || 0);

    const growthEl = document.getElementById('bamRevGrowth');
    if (growthEl) {
      const g = k.revenueGrowth || 0;
      const arrow = g >= 0 ? '▲' : '▼';
      growthEl.innerHTML = `<span style="color:${g >= 0 ? '#22c55e' : '#ef4444'}">${arrow} ${Math.abs(g).toFixed(1)}%</span>`;
    }

    const topSvcEl = document.getElementById('bamTopService');
    if (topSvcEl && k.topService) {
      topSvcEl.innerHTML = `${UI.sanitizeHTML(k.topService.name || '—')} <small style="color:#6b7280;">(₱${Number(k.topService.revenue || 0).toLocaleString('en-PH')})</small>`;
    }

    const beh = behavior.data || behavior;
    setKpi('bamRetention',   (beh.retentionRate || 0) + '%');
    setKpi('bamCancelRate',  (beh.cancellationRate || 0) + '%');
    setKpi('bamNewPatients', beh.newPatients || 0);

    // Render charts
    renderBamRevTrend(trend.data || trend);
    renderBamRevService((byService.data || byService).slice ? (byService.data || byService) : []);
    renderBamPeakHours(peakHours.data || peakHours);
    renderBamPeakDays(peakDays.data || peakDays);
    renderBamNewReturn(newReturn.data || newReturn);
    renderBamFunnel(funnel.data || funnel);

  } catch (err) {
    console.error('loadBAM error:', err);
    UI.showToast(err.message || 'Failed to load business analytics.', 'error');
  }
}

function switchBamPeriod(period) {
  _bamPeriod = period;
  document.querySelectorAll('.bam-period-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.period === period);
  });
  API.get(`/analytics/revenue-trend?period=${period}&year=${_bamYear}`)
    .then(res => renderBamRevTrend(res.data || res))
    .catch(err => console.error('switchBamPeriod error:', err));
}

function renderBamRevTrend(data) {
  const records = Array.isArray(data) ? data : [];
  const isWeekly = _bamPeriod === 'weekly';
  let labels, revenue, count;

  if (isWeekly) {
    const maxWeek = 52;
    labels  = Array.from({ length: maxWeek }, (_, i) => `W${i + 1}`);
    revenue = new Array(maxWeek).fill(0);
    count   = new Array(maxWeek).fill(0);
    records.forEach(r => {
      const w = (r._id && r._id.week != null ? r._id.week : r.week || 1) - 1;
      if (w >= 0 && w < maxWeek) { revenue[w] = r.revenue || 0; count[w] = r.count || 0; }
    });
  } else {
    labels  = MONTH_LABELS;
    revenue = new Array(12).fill(0);
    count   = new Array(12).fill(0);
    records.forEach(r => {
      const m = (r._id && r._id.month != null ? r._id.month : r.month || 1) - 1;
      if (m >= 0 && m < 12) { revenue[m] = r.revenue || 0; count[m] = r.count || 0; }
    });
  }

  destroyAndCreate('bamChartRevTrend', {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Revenue (₱)',
          data: revenue,
          borderColor: '#22c55e',
          backgroundColor: 'rgba(34,197,94,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 4,
          yAxisID: 'yRev',
        },
        {
          label: 'Appointments',
          data: count,
          borderColor: '#0891b2',
          backgroundColor: 'rgba(8,145,178,0.08)',
          tension: 0.4,
          fill: false,
          pointRadius: 3,
          yAxisID: 'yCount',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        yRev:   { beginAtZero: true, position: 'left',  grid: { color: 'rgba(0,0,0,.04)' }, ticks: { callback: v => '₱' + Number(v).toLocaleString('en-PH') } },
        yCount: { beginAtZero: true, position: 'right', grid: { display: false }, ticks: { precision: 0 } },
        x: { grid: { color: 'rgba(0,0,0,.04)' } },
      },
    },
  });
}

function renderBamRevService(data) {
  const top10   = data.slice(0, 10);
  const labels  = top10.map(r => r._id || r.service || 'Unknown');
  const revenue = top10.map(r => r.totalRevenue || 0);

  destroyAndCreate('bamChartRevService', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Revenue (₱)',
        data: revenue,
        backgroundColor: COLORS.slice(0, labels.length),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { beginAtZero: true, ticks: { callback: v => '₱' + Number(v).toLocaleString('en-PH') }, grid: { color: 'rgba(0,0,0,.04)' } },
        y: { grid: { display: false } },
      },
    },
  });
}

function renderBamPeakHours(data) {
  const records = Array.isArray(data) ? data : [];
  const hours   = Array.from({ length: 24 }, (_, i) => i);
  const counts  = new Array(24).fill(0);
  records.forEach(r => { const h = r.hour != null ? r.hour : r._id; if (h != null) counts[h] = r.count || 0; });

  destroyAndCreate('bamChartPeakHours', {
    type: 'bar',
    data: {
      labels: hours.map(h => `${h}:00`),
      datasets: [{
        label: 'Appointments',
        data: counts,
        backgroundColor: counts.map(v => {
          const max = Math.max(...counts, 1);
          const ratio = v / max;
          return `rgba(8,145,178,${0.2 + ratio * 0.8})`;
        }),
        borderRadius: 3,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,.04)' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderBamPeakDays(data) {
  const records  = Array.isArray(data) ? data : [];
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const counts   = new Array(7).fill(0);
  records.forEach(r => {
    const dow = (r.dayOfWeek != null ? r.dayOfWeek : r._id);
    if (dow != null && dow >= 1 && dow <= 7) counts[dow - 1] = r.count || 0;
  });

  destroyAndCreate('bamChartPeakDays', {
    type: 'bar',
    data: {
      labels: dayNames,
      datasets: [{
        label: 'Appointments',
        data: counts,
        backgroundColor: COLORS.slice(0, 7),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,.04)' } },
        x: { grid: { display: false } },
      },
    },
  });
}

function renderBamNewReturn(data) {
  const records = Array.isArray(data) ? data : [];
  const newPts  = new Array(12).fill(0);
  const retPts  = new Array(12).fill(0);
  records.forEach(r => {
    const m = (r.month != null ? r.month : r._id?.month || 1) - 1;
    if (m >= 0 && m < 12) {
      newPts[m] = r.newPatients || 0;
      retPts[m] = r.returningPatients || 0;
    }
  });

  destroyAndCreate('bamChartNewReturn', {
    type: 'bar',
    data: {
      labels: MONTH_LABELS,
      datasets: [
        { label: 'New', data: newPts, backgroundColor: '#0891b2', borderRadius: 3, stack: 'pts' },
        { label: 'Returning', data: retPts, backgroundColor: '#22c55e', borderRadius: 3, stack: 'pts' },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: {
        y: { beginAtZero: true, stacked: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,.04)' } },
        x: { stacked: true, grid: { display: false } },
      },
    },
  });
}

function renderBamFunnel(data) {
  const records = Array.isArray(data) ? data : [];
  const labels  = records.map(r => r.stage || '');
  const counts  = records.map(r => r.count || 0);
  const rates   = records.map(r => r.rate  || 0);

  destroyAndCreate('bamChartFunnel', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Count',
        data: counts,
        backgroundColor: ['#0891b2', '#22c55e', '#f59e0b', '#8b5cf6'],
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.parsed.x} (${rates[ctx.dataIndex]}%)`,
          },
        },
      },
      scales: {
        x: { beginAtZero: true, ticks: { precision: 0 }, grid: { color: 'rgba(0,0,0,.04)' } },
        y: { grid: { display: false } },
      },
    },
  });
}

/* ─────────────────────────────────────────────
   11. TRASH BIN
   ───────────────────────────────────────────── */

function switchTrashTab(type, btnEl) {
  _currentTrashType = type || 'feedback';
  _trashPage = 1;

  document.querySelectorAll('.trash-tab').forEach(t => t.classList.remove('active'));
  if (btnEl) {
    btnEl.classList.add('active');
  } else {
    const btn = document.querySelector(`.trash-tab[data-type="${_currentTrashType}"]`);
    if (btn) btn.classList.add('active');
  }

  loadTrash(_currentTrashType, 1);
}

async function loadTrash(type, page) {
  _currentTrashType = type || _currentTrashType;
  _trashPage        = page || 1;

  const container = document.getElementById('trashList');
  const paginEl   = document.getElementById('trashPagination');
  if (container) container.innerHTML = '<p class="loading-text">Loading trash…</p>';

  try {
    const params = new URLSearchParams({ type: _currentTrashType, page: _trashPage, limit: 15 });
    const res    = await API.get(`/trash?${params}`);
    const items  = res.data || (Array.isArray(res) ? res : []);
    const total  = res.total || items.length;
    const pages  = res.pages || Math.ceil(total / 15);

    const emptyMsgs = {
      feedback:     'No deleted feedback items.',
      appointments: 'No deleted appointments.',
      inventory:    'No deleted inventory items.',
      patients:     'No deleted patient records.',
    };

    if (!container) return;

    if (!items.length) {
      container.innerHTML = `<div class="empty-state" style="padding:3rem;text-align:center;color:#6b7280;"><i class="fa-solid fa-trash-can" style="font-size:2rem;display:block;margin-bottom:.75rem;opacity:.4;"></i>${emptyMsgs[_currentTrashType] || 'Trash is empty.'}</div>`;
      if (paginEl) paginEl.innerHTML = '';
      return;
    }

    container.innerHTML = items.map(item => renderTrashItem(item, _currentTrashType)).join('');

    if (paginEl) {
      renderPagination('trashPagination', total, _trashPage, pages, (p) => loadTrash(_currentTrashType, p));
    }

  } catch (err) {
    console.error('loadTrash error:', err);
    UI.showToast(err.message || 'Failed to load trash.', 'error');
    if (container) container.innerHTML = '<p class="error-text">Failed to load trash.</p>';
  }
}

function renderTrashItem(item, type) {
  let title = '—';
  let subtitle = '';

  if (type === 'feedback') {
    const p = item.patient || {};
    title    = item.isAnonymous ? 'Anonymous Feedback' : `${p.firstName||''} ${p.lastName||''}`.trim() || '—';
    subtitle = `Rating: ${item.overallRating || '?'}/5`;
  } else if (type === 'appointments') {
    const p  = item.patient || {};
    title    = `${p.firstName||''} ${p.lastName||''}`.trim() || '—';
    subtitle = `${item.service || item.serviceType || '—'} — ${formatDate(item.appointmentDate || item.date)}`;
  } else if (type === 'inventory') {
    title    = item.name || '—';
    subtitle = `${UI.capitalize(item.category || '')} — Qty: ${item.quantity ?? '?'}`;
  } else if (type === 'patients') {
    const u  = item.user || {};
    title    = `${u.firstName||''} ${u.lastName||''}`.trim() || u.email || '—';
    subtitle = u.email || '';
  }

  const deletedBy   = item.deletedBy ? `${item.deletedBy.firstName || ''} ${item.deletedBy.lastName || ''}`.trim() || 'Unknown' : 'Unknown';
  const deletedDate = formatDateTime(item.deletedAt);

  return `
    <div class="trash-item-card">
      <div class="trash-item-info">
        <div class="trash-item-title">${UI.sanitizeHTML(title)}</div>
        <div class="trash-item-sub">${UI.sanitizeHTML(subtitle)}</div>
        <div class="trash-item-meta">Deleted by <strong>${UI.sanitizeHTML(deletedBy)}</strong> on ${deletedDate}</div>
      </div>
      <div class="trash-item-actions">
        <button class="btn btn-sm btn-success" onclick="restoreTrashItem('${item._id}','${type}')">
          <i class="fa-solid fa-rotate-left"></i> Restore
        </button>
        <button class="btn btn-sm btn-danger" onclick="purgeTrashItem('${item._id}','${type}')">
          <i class="fa-solid fa-trash-can"></i> Delete Forever
        </button>
      </div>
    </div>
  `;
}

async function restoreTrashItem(id, type) {
  try {
    await API.post('/trash/restore', { type, id });
    UI.showToast(`${UI.capitalize(type.replace(/s$/, ''))} restored successfully.`, 'success');
    loadTrash(type, _trashPage);
  } catch (err) {
    console.error('restoreTrashItem error:', err);
    UI.showToast(err.message || 'Failed to restore item.', 'error');
  }
}

async function purgeTrashItem(id, type) {
  const confirmed = await UI.showConfirm('Permanently delete this item? This CANNOT be undone.', 'Delete Forever');
  if (!confirmed) return;
  try {
    await API.delete('/trash/purge', { type, id });
    UI.showToast('Item permanently deleted.', 'success');
    loadTrash(type, _trashPage);
  } catch (err) {
    console.error('purgeTrashItem error:', err);
    UI.showToast(err.message || 'Failed to permanently delete item.', 'error');
  }
}

async function confirmPurgeAll() {
  const type = _currentTrashType;
  const confirmed = await UI.showConfirm(`Permanently delete ALL deleted ${type}? This CANNOT be undone.`, 'Empty Trash');
  if (!confirmed) return;
  try {
    await API.delete('/trash/purge-all', { type });
    UI.showToast(`All deleted ${type} permanently removed.`, 'success');
    loadTrash(type, 1);
  } catch (err) {
    console.error('confirmPurgeAll error:', err);
    UI.showToast(err.message || 'Failed to empty trash.', 'error');
  }
}

/* ─────────────────────────────────────────────
   12. USER MANAGEMENT
   ───────────────────────────────────────────── */

async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="loading-text">Loading…</td></tr>';

  try {
    const params = new URLSearchParams({ page: _usersPage, limit: 20 });
    const res    = await API.get(`/users?${params}`);
    const users  = res.data || res.users || (Array.isArray(res) ? res : []);
    const total  = res.total || users.length;
    const pages  = res.pages || Math.ceil(total / 20);

    if (!tbody) return;

    if (!users.length) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:2rem;color:#6b7280;">No users found.</td></tr>';
      renderPagination('usersPagination', 0, 1, 0, () => {});
      return;
    }

    tbody.innerHTML = users.map(u => {
      const firstName = u.firstName || '';
      const lastName  = u.lastName  || '';
      const fullName  = `${firstName} ${lastName}`.trim() || u.email || '—';

      const roleBadge = {
        admin:     '<span class="badge badge--danger">Admin</span>',
        dentist:   '<span class="badge badge--primary">Dentist</span>',
        staff:     '<span class="badge badge--info">Staff</span>',
        patient:   '<span class="badge badge--success">Patient</span>',
      }[u.role] || `<span class="badge badge--secondary">${UI.capitalize(u.role || 'Unknown')}</span>`;

      const activeLabel = u.isActive ? 'Active' : 'Inactive';
      const activeCls   = u.isActive ? 'badge--success' : 'badge--secondary';
      const toggleLabel = u.isActive ? 'Deactivate' : 'Activate';

      return `
        <tr>
          <td>
            <div style="display:flex;align-items:center;gap:.5rem;">
              ${avatarHtml(firstName, lastName, 32)}
              <span style="font-weight:600;">${UI.sanitizeHTML(fullName)}</span>
            </div>
          </td>
          <td>${UI.sanitizeHTML(u.email || '—')}</td>
          <td>${roleBadge}</td>
          <td><span class="badge ${activeCls}">${activeLabel}</span></td>
          <td>${u.lastLogin ? formatDateTime(u.lastLogin) : '—'}</td>
          <td>
            <button class="btn btn-sm btn-outline" onclick='openEditUserModal(${JSON.stringify(u)})' style="margin-right:.25rem;">Edit</button>
            <button class="btn btn-sm btn-outline" onclick="toggleUserStatus('${u._id}', ${!u.isActive})">${toggleLabel}</button>
          </td>
        </tr>
      `;
    }).join('');

    renderPagination('usersPagination', total, _usersPage, pages, (p) => {
      _usersPage = p;
      loadUsers();
    });

  } catch (err) {
    console.error('loadUsers error:', err);
    UI.showToast(err.message || 'Failed to load users.', 'error');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="error-text">Failed to load.</td></tr>';
  }
}

function openAddUserModal() {
  const form = document.getElementById('addUserForm');
  if (form) form.reset();
  openModal('addUserModal');
}

async function submitAddUser() {
  const get = id => (document.getElementById(id) || {}).value || '';

  const payload = {
    firstName: get('newUserFirstName').trim(),
    lastName:  get('newUserLastName').trim(),
    email:     get('newUserEmail').trim(),
    password:  get('newUserPassword'),
    role:      get('newUserRole'),
    phone:     get('newUserPhone').trim(),
  };

  if (!payload.firstName || !payload.email || !payload.password) {
    UI.showToast('First name, email, and password are required.', 'warning');
    return;
  }

  if (!UI.sanitizeHTML) {
    // sanity check
  }

  try {
    await API.post('/users', payload);
    UI.showToast('User created successfully.', 'success');
    closeModal('addUserModal');
    loadUsers();
  } catch (err) {
    console.error('submitAddUser error:', err);
    UI.showToast(err.message || 'Failed to create user.', 'error');
  }
}

/**
 * Toggle user active/inactive status.
 * @param {string}  id
 * @param {boolean} active
 */
async function toggleUserStatus(id, active) {
  try {
    await API.patch(`/users/${id}/status`, { isActive: active });
    UI.showToast(`User ${active ? 'activated' : 'deactivated'} successfully.`, 'success');
    loadUsers();
  } catch (err) {
    console.error('toggleUserStatus error:', err);
    UI.showToast(err.message || 'Failed to update user status.', 'error');
  }
}


/* ─────────────────────────────────────────────
   11. EDIT USER
   ───────────────────────────────────────────── */

function openEditUserModal(user) {
  if (typeof user === 'string') { try { user = JSON.parse(user); } catch (_) { return; } }
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val != null ? val : ''; };
  set('editUserId',    user._id       || '');
  set('editUserFirst', user.firstName || '');
  set('editUserLast',  user.lastName  || '');
  set('editUserEmail', user.email     || '');
  set('editUserPhone', user.phone     || '');
  const roleEl = document.getElementById('editUserRole');
  if (roleEl) roleEl.value = ['staff', 'admin'].includes(user.role) ? user.role : 'staff';
  const pwdEl = document.getElementById('editUserPwd');
  if (pwdEl) pwdEl.value = '';
  openModal('editUserModal');
}

async function submitEditUser() {
  const get = id => (document.getElementById(id) || {}).value || '';
  const id = get('editUserId');
  if (!id) { UI.showToast('Invalid user.', 'warning'); return; }
  const firstName = get('editUserFirst').trim();
  const email     = get('editUserEmail').trim();
  if (!firstName) { UI.showToast('First name is required.', 'warning'); return; }
  if (!email)     { UI.showToast('Email is required.', 'warning'); return; }
  const payload = {
    firstName,
    lastName: get('editUserLast').trim(),
    email,
    phone:    get('editUserPhone').trim(),
    role:     get('editUserRole'),
  };
  const password = get('editUserPwd');
  if (password) {
    if (password.length < 8) { UI.showToast('Password must be at least 8 characters.', 'warning'); return; }
    payload.password = password;
  }
  try {
    await API.patch(`/users/${id}`, payload);
    UI.showToast('User updated successfully.', 'success');
    closeModal('editUserModal');
    loadUsers();
  } catch (err) {
    console.error('submitEditUser error:', err);
    UI.showToast(err.message || 'Failed to update user.', 'error');
  }
}

function debounceLoadFeedback() {
  clearTimeout(_feedbackSearchTimer);
  _feedbackSearchTimer = setTimeout(() => loadFeedback(), 400);
}

/* ─────────────────────────────────────────────
   DARK MODE
   ───────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────
   SIDEBAR COLLAPSE
   ───────────────────────────────────────────── */

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

/* ─────────────────────────────────────────────
   NOTIFICATIONS
   ───────────────────────────────────────────── */

async function loadNotifications() {
  const notifs = [];
  try {
    const r = await API.get('/analytics/appointments-today');
    const pending = r.data?.pending ?? 0;
    if (pending > 0) notifs.push({ icon: 'fa-clock', color: '#f59e0b', text: `${pending} pending appointment${pending > 1 ? 's' : ''} today` });
  } catch (_) {}
  try {
    const r = await API.get('/analytics/overview');
    const ls = r.data?.inventory?.lowStock ?? 0;
    if (ls > 0) notifs.push({ icon: 'fa-boxes-stacked', color: '#ef4444', text: `${ls} inventory item${ls > 1 ? 's' : ''} at low stock` });
  } catch (_) {}
  try {
    const types = ['appointments', 'feedback', 'inventory', 'patients'];
    let totalDeleted = 0;
    for (const t of types) {
      const r = await API.get(`/trash?type=${t}&page=1&limit=1`);
      if (r.success) totalDeleted += r.total ?? 0;
    }
    if (totalDeleted > 0) notifs.push({ icon: 'fa-trash-can', color: '#8b5cf6', text: `${totalDeleted} item${totalDeleted > 1 ? 's' : ''} in trash (recently deleted)` });
  } catch (_) {}
  const badge = document.getElementById('notifBadge');
  const list  = document.getElementById('notifList');
  if (badge) { badge.textContent = notifs.length; badge.style.display = notifs.length > 0 ? 'flex' : 'none'; }
  if (list)  list.innerHTML = notifs.length
    ? notifs.map(n => `<div class="notif-item"><div class="notif-icon" style="color:${n.color}"><i class="fa-solid ${n.icon}"></i></div><div class="notif-body"><div class="notif-text">${escHtml(n.text)}</div></div></div>`).join('')
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

/* ─────────────────────────────────────────────
   ANALYTICS INNER TABS
   ───────────────────────────────────────────── */

function switchAnalyticsTab(tab) {
  document.querySelectorAll('.analytics-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.tab === tab)
  );
  document.querySelectorAll('.analytics-tab-pane').forEach(p =>
    p.classList.toggle('active', p.dataset.pane === tab)
  );
  if (tab === 'revenue') loadBAM();
}

/* ─────────────────────────────────────────────
   EXPOSE GLOBALS for inline HTML onclick handlers
   ───────────────────────────────────────────── */

window.switchSection           = switchSection;
window.loadAnalytics           = loadAnalytics;
window.loadTodaySchedule       = loadTodaySchedule;
window.loadAppointments        = loadAppointments;
window.openApptModal           = openApptModal;
window.openCompleteModal       = openCompleteModal;
window.updateApptStatus        = updateApptStatus;
window.loadPatients            = loadPatients;
window.openPatientModal        = openPatientModal;
window.debouncePatientSearch   = debouncePatientSearch;
window.debounceRecordSearch    = debounceRecordSearch;
window.selectRecordPatient     = selectRecordPatient;
window.loadTeethRecord         = loadTeethRecord;
window.loadRecordPatients      = loadRecordPatients;
window.renderTeethChart        = renderTeethChart;
window.openToothModal          = openToothModal;
window.saveToothCondition      = saveToothCondition;
window.openAddTreatmentModal   = openAddTreatmentModal;
window.submitTreatmentNote     = submitTreatmentNote;
window.loadInventory           = loadInventory;
window.loadInventorySummary    = loadInventorySummary;
window.openAddInventoryModal   = openAddInventoryModal;
window.openEditInvModal        = openEditInvModal;
window.submitInventoryForm     = submitInventoryForm;
window.openAdjustStockModal    = openAdjustStockModal;
window.submitStockAdjust       = submitStockAdjust;
window.deleteInventoryItem     = deleteInventoryItem;
window.loadFeedback            = loadFeedback;
window.toggleRespondArea       = toggleRespondArea;
window.submitFeedbackResponse  = submitFeedbackResponse;
window.deleteFeedback          = deleteFeedback;
window.loadBAM                 = loadBAM;
window.switchBamPeriod         = switchBamPeriod;
window.loadTrash               = loadTrash;
window.switchTrashTab          = switchTrashTab;
window.restoreTrashItem        = restoreTrashItem;
window.purgeTrashItem          = purgeTrashItem;
window.confirmPurgeAll         = confirmPurgeAll;
window.loadUsers               = loadUsers;
window.openAddUserModal        = openAddUserModal;
window.submitAddUser           = submitAddUser;
window.toggleUserStatus        = toggleUserStatus;
window.openEditUserModal       = openEditUserModal;
window.submitEditUser          = submitEditUser;
window.debounceApptSearch      = debounceApptSearch;
window.debounceInvSearch       = debounceInvSearch;
window.debounceLoadFeedback    = debounceLoadFeedback;
window.openModal               = openModal;
window.closeModal              = closeModal;
window.togglePwd               = togglePwd;
window.formatDate              = formatDate;
window.stars                   = stars;
window.toggleDarkMode          = toggleDarkMode;
window.toggleSidebarCollapse   = toggleSidebarCollapse;
window.toggleNotifDropdown     = toggleNotifDropdown;
window.toggleProfileDropdown   = toggleProfileDropdown;
window.closeNotifDropdown      = closeNotifDropdown;
window.closeProfileDropdown    = closeProfileDropdown;
window.markAllNotifsRead       = markAllNotifsRead;
window.switchAnalyticsTab      = switchAnalyticsTab;

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

/* ─────────────────────────────── MISSING EXPORTS (modal functions) ─────── */
window.openCompleteModal      = openCompleteModal;
window.openAddTreatmentModal  = openAddTreatmentModal;
window.submitTreatmentNote    = submitTreatmentNote;

/* ═════════════════════════════════════════════════════════════════════════
   11. PROMOTIONS & SUBSCRIBERS MODULE
   ═════════════════════════════════════════════════════════════════════════ */

let _subPage       = 1;
let _subSearch     = '';
let _subSearchTimer;
let _currentPromoTab = 'subscribers';

/** Load KPI stats, then the active sub-tab data */
async function loadPromoSection() {
  loadPromoStats();
  switchPromoTab(_currentPromoTab);
}

/** Load KPI numbers + populate subscriber badge in sidebar */
async function loadPromoStats() {
  try {
    const r = await API.get('/promotions/subscriber-stats');
    const d = r.data || r;

    const total  = d.totalSubscribers  ?? 0;
    const active = d.activeSubscribers ?? 0;
    const top    = d.serviceInterest?.[0]?._id || '—';

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('promoTotalSubs',   total.toLocaleString());
    set('promoActiveSubs',  active.toLocaleString());
    set('promoTopService',  top);

    // Update sidebar badge
    const badge = document.getElementById('subscribersBadge');
    if (badge) { badge.textContent = total; badge.style.display = total > 0 ? 'inline-flex' : 'none'; }

    // Render service interest chart
    renderServiceInterestChart(d.serviceInterest || []);
    renderSubscriberGrowthChart(d.monthlyGrowth  || []);
  } catch (_) {}

  // Also get active promotions count
  try {
    const r = await API.get('/promotions?status=active&limit=1');
    const el = document.getElementById('promoActivePromos');
    if (el) el.textContent = (r.total ?? 0).toLocaleString();
  } catch (_) {}
}

/** Switch the sub-tab inside the Promotions section */
function switchPromoTab(tab) {
  _currentPromoTab = tab;
  document.querySelectorAll('.analytics-tab[data-promo-tab]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.promoTab === tab);
  });
  document.querySelectorAll('.promo-tab-pane').forEach(pane => {
    pane.classList.toggle('active', pane.id === `promoPane-${tab}`);
  });
  if (tab === 'subscribers') { _subPage = 1; loadSubscribers(); }
  if (tab === 'promotions')  loadPromotions();
}

/* ─── SUBSCRIBERS ──────────────────────────────────────────────────────── */

function debounceSubSearch() {
  clearTimeout(_subSearchTimer);
  _subSearchTimer = setTimeout(() => { _subPage = 1; loadSubscribers(); }, 400);
}

async function loadSubscribers() {
  const search = (document.getElementById('subSearch')       || {}).value?.trim() || '';
  const status = (document.getElementById('subStatusFilter') || {}).value || '';
  const tbody  = document.getElementById('subsTableBody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="7" class="loading-cell"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</td></tr>';

  try {
    const params = new URLSearchParams({ page: _subPage, limit: 20 });
    if (search) params.set('search', search);
    if (status) params.set('status', status);

    const r = await API.get(`/promotions/subscribers?${params}`);
    const rows = (r.data || []);

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state-cell">No subscribers found.</td></tr>';
      document.getElementById('subsPagination').innerHTML = '';
      return;
    }

    tbody.innerHTML = rows.map(s => `
      <tr>
        <td>${escHtml(s.name)}</td>
        <td>${escHtml(s.email)}</td>
        <td>${escHtml(s.phone || '—')}</td>
        <td>${s.services?.length ? s.services.map(sv => `<span class="badge badge-info">${escHtml(sv)}</span>`).join(' ') : '<span class="text-muted">—</span>'}</td>
        <td><span class="badge ${s.isActive ? 'badge-success' : 'badge-secondary'}">${s.isActive ? 'Active' : 'Inactive'}</span></td>
        <td>${formatDate(s.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="toggleSub('${s._id}', ${!s.isActive})">${s.isActive ? 'Deactivate' : 'Activate'}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteSub('${s._id}')">Remove</button>
        </td>
      </tr>`).join('');

    // Pagination
    const pages = r.pages || 1;
    renderPagination('subsPagination', r.total || 0, _subPage, pages, p => { _subPage = p; loadSubscribers(); });
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="error-cell">${escHtml(err.message || 'Failed to load subscribers.')}</td></tr>`;
  }
}

async function toggleSub(id, active) {
  try {
    await API.patch(`/promotions/subscribers/${id}`, { isActive: active });
    UI.showToast(`Subscriber ${active ? 'activated' : 'deactivated'}.`, 'success');
    loadSubscribers();
    loadPromoStats();
  } catch (err) {
    UI.showToast(err.message || 'Failed to update subscriber.', 'error');
  }
}

async function deleteSub(id) {
  const ok = await UI.showConfirm('Remove this subscriber from the list?', 'Remove Subscriber');
  if (!ok) return;
  try {
    await API.delete(`/promotions/subscribers/${id}`);
    UI.showToast('Subscriber removed.', 'success');
    loadSubscribers();
    loadPromoStats();
  } catch (err) {
    UI.showToast(err.message || 'Failed to remove subscriber.', 'error');
  }
}

/* ─── PROMOTIONS ───────────────────────────────────────────────────────── */

async function loadPromotions() {
  const grid = document.getElementById('promoCardsGrid');
  if (!grid) return;
  grid.innerHTML = '<div class="loading-placeholder"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading…</div>';

  try {
    const r    = await API.get('/promotions?limit=50');
    const list = r.data || [];

    if (!list.length) {
      grid.innerHTML = '<div class="empty-state"><i class="fa-solid fa-bullhorn"></i><p>No promotions yet.<br>Click <strong>Create Promotion</strong> to add one.</p></div>';
      return;
    }

    grid.innerHTML = list.map(p => buildPromoCard(p)).join('');
  } catch (err) {
    grid.innerHTML = `<div class="error-text">${escHtml(err.message || 'Failed to load promotions.')}</div>`;
  }
}

function buildPromoCard(p) {
  const statusBadge = p.isActive
    ? '<span class="badge badge-success">Active</span>'
    : '<span class="badge badge-secondary">Inactive</span>';
  const validRange = p.validFrom
    ? `${formatDate(p.validFrom)}${p.validTo ? ' – ' + formatDate(p.validTo) : ' onwards'}`
    : '';

  return `
    <div class="promo-card ${p.isActive ? '' : 'promo-card-inactive'}">
      <div class="promo-card-header">
        ${p.badgeText ? `<span class="promo-badge-chip">${escHtml(p.badgeText)}</span>` : ''}
        ${statusBadge}
      </div>
      <h4 class="promo-card-title">${escHtml(p.title)}</h4>
      ${p.description ? `<p class="promo-card-desc">${escHtml(p.description)}</p>` : ''}
      ${validRange    ? `<div class="promo-card-date"><i class="fa-regular fa-calendar"></i> ${escHtml(validRange)}</div>` : ''}
      <div class="promo-card-actions">
        <button class="btn btn-sm btn-outline" onclick='openEditPromoModal(${JSON.stringify(JSON.stringify(p))})'>
          <i class="fa-solid fa-pen"></i> Edit
        </button>
        <button class="btn btn-sm btn-danger" onclick="deletePromo('${p._id}')">
          <i class="fa-solid fa-trash"></i> Delete
        </button>
      </div>
    </div>`;
}

function openCreatePromoModal() {
  const titleEl = document.getElementById('promoModalTitle');
  const editId  = document.getElementById('promoEditId');
  const form    = document.getElementById('promoForm');
  if (form)    form.reset();
  if (titleEl) titleEl.textContent = 'Create Promotion';
  if (editId)  editId.value = '';
  // Default valid from to today
  const vf = document.getElementById('promoValidFrom');
  if (vf) vf.value = new Date().toISOString().split('T')[0];
  openModal('promoModal');
}

function openEditPromoModal(jsonStr) {
  let p;
  try { p = typeof jsonStr === 'string' ? JSON.parse(jsonStr) : jsonStr; } catch (_) { return; }

  const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
  const titleEl = document.getElementById('promoModalTitle');
  if (titleEl) titleEl.textContent = 'Edit Promotion';
  set('promoEditId',     p._id             || '');
  set('promoTitle',      p.title           || '');
  set('promoDescription',p.description     || '');
  set('promoBadgeText',  p.badgeText       || '');
  set('promoIsActive',   p.isActive ? 'true' : 'false');
  set('promoValidFrom',  p.validFrom ? p.validFrom.split('T')[0] : '');
  set('promoValidTo',    p.validTo   ? p.validTo.split('T')[0]   : '');
  openModal('promoModal');
}

async function submitPromoForm() {
  const title  = (document.getElementById('promoTitle')       || {}).value?.trim() || '';
  const editId = (document.getElementById('promoEditId')      || {}).value?.trim() || '';
  if (!title) { UI.showToast('Promotion title is required.', 'warning'); return; }

  const payload = {
    title,
    description: (document.getElementById('promoDescription') || {}).value?.trim() || '',
    badgeText:   (document.getElementById('promoBadgeText')   || {}).value?.trim() || '',
    isActive:    (document.getElementById('promoIsActive')    || {}).value === 'true',
    validFrom:   (document.getElementById('promoValidFrom')   || {}).value || null,
    validTo:     (document.getElementById('promoValidTo')     || {}).value || null,
  };

  try {
    if (editId) {
      await API.patch(`/promotions/${editId}`, payload);
      UI.showToast('Promotion updated.', 'success');
    } else {
      await API.post('/promotions', payload);
      UI.showToast('Promotion created.', 'success');
    }
    closeModal('promoModal');
    loadPromotions();
    loadPromoStats();
  } catch (err) {
    UI.showToast(err.message || 'Failed to save promotion.', 'error');
  }
}

async function deletePromo(id) {
  const ok = await UI.showConfirm('Delete this promotion?', 'Delete Promotion');
  if (!ok) return;
  try {
    await API.delete(`/promotions/${id}`);
    UI.showToast('Promotion deleted.', 'success');
    loadPromotions();
    loadPromoStats();
  } catch (err) {
    UI.showToast(err.message || 'Failed to delete promotion.', 'error');
  }
}

/* ─── INSIGHTS CHARTS ──────────────────────────────────────────────────── */

function renderServiceInterestChart(data) {
  if (!data.length) return;
  const labels = data.map(d => d._id);
  const counts = data.map(d => d.count);
  destroyAndCreate('serviceInterestChart', {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Subscribers',
        data:  counts,
        backgroundColor: 'rgba(8,145,178,0.75)',
        borderRadius: 6,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false, indexAxis: 'y',
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

function renderSubscriberGrowthChart(data) {
  const monthData = new Array(12).fill(0);
  data.forEach(d => { if (d._id >= 1 && d._id <= 12) monthData[d._id - 1] = d.count; });
  destroyAndCreate('subscriberGrowthChart', {
    type: 'line',
    data: {
      labels: MONTH_LABELS,
      datasets: [{
        label: 'New Subscribers',
        data:  monthData,
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.1)',
        tension: 0.4, fill: true,
        pointRadius: 4, pointBackgroundColor: '#8b5cf6',
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'top' } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

/* ─── PROMOTIONS WINDOW EXPORTS ────────────────────────────────────────── */
window.loadPromoSection       = loadPromoSection;
window.switchPromoTab         = switchPromoTab;
window.loadSubscribers        = loadSubscribers;
window.debounceSubSearch      = debounceSubSearch;
window.toggleSub              = toggleSub;
window.deleteSub              = deleteSub;
window.loadPromotions         = loadPromotions;
window.openCreatePromoModal   = openCreatePromoModal;
window.openEditPromoModal     = openEditPromoModal;
window.submitPromoForm        = submitPromoForm;
window.deletePromo            = deletePromo;
