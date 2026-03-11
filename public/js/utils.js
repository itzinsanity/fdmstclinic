/**
 * FDMST - Flores-Dizon Dental Clinic Management System
 * utils.js — Browser-side global utility module
 *
 * Exposes four global namespaces: Auth, API, UI, Form, Charts
 * No external dependencies except Chart.js (for Charts helpers).
 */

'use strict';

/* ─────────────────────────────────────────────
   AUTH — Token & user session management
   ───────────────────────────────────────────── */

const Auth = (() => {
  const TOKEN_KEY = 'fdmst_token';
  const USER_KEY  = 'fdmst_user';

  return {
    getToken() {
      return localStorage.getItem(TOKEN_KEY);
    },

    setToken(token) {
      localStorage.setItem(TOKEN_KEY, token);
    },

    removeToken() {
      localStorage.removeItem(TOKEN_KEY);
    },

    getUser() {
      try {
        const raw = localStorage.getItem(USER_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    },

    setUser(user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    },

    removeUser() {
      localStorage.removeItem(USER_KEY);
    },

    isLoggedIn() {
      return !!this.getToken();
    },

    getRole() {
      const user = this.getUser();
      return user ? user.role : null;
    },

    /** Clears all session data and redirects to the login page. */
    logout() {
      this.removeToken();
      this.removeUser();
      window.location.href = '/login.html';
    },
  };
})();


/* ─────────────────────────────────────────────
   API — Fetch wrapper with auth header injection
   ───────────────────────────────────────────── */

const API = (() => {
  const BASE_URL = '/api';

  /**
   * Core request helper.
   * @param {string}  method        HTTP verb (GET, POST, PUT, PATCH, DELETE)
   * @param {string}  endpoint      Path after BASE_URL, e.g. '/users'
   * @param {object}  [data]        Request body (JSON-serialised automatically)
   * @param {boolean} [requiresAuth=true]  Whether to attach the Bearer token
   * @returns {Promise<any>} Parsed JSON response
   * @throws {Error}  Carries { message, status } from the server error body when available
   */
  async function request(method, endpoint, data = null, requiresAuth = true) {
    const headers = { 'Content-Type': 'application/json' };

    if (requiresAuth) {
      const token = Auth.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }

    const options = { method, headers };
    if (data !== null) options.body = JSON.stringify(data);

    const response = await fetch(`${BASE_URL}${endpoint}`, options);

    // Handle 401 globally — token expired / invalid
    if (response.status === 401) {
      Auth.logout();
      return;
    }

    let json;
    try {
      json = await response.json();
    } catch {
      json = null;
    }

    if (!response.ok) {
      const err       = new Error(json?.message || `Request failed (${response.status})`);
      err.status      = response.status;
      err.data        = json;
      throw err;
    }

    return json;
  }

  return {
    BASE_URL,
    request,
    get   (endpoint)             { return request('GET',    endpoint);       },
    post  (endpoint, data)       { return request('POST',   endpoint, data); },
    put   (endpoint, data)       { return request('PUT',    endpoint, data); },
    patch (endpoint, data)       { return request('PATCH',  endpoint, data); },
    delete(endpoint, data = null){ return request('DELETE', endpoint, data); },
  };
})();


/* ─────────────────────────────────────────────
   UI — DOM / presentation helpers
   ───────────────────────────────────────────── */

const UI = (() => {
  // ── Toast ────────────────────────────────────

  /** Ensures a #toast-container exists in the DOM. */
  function ensureToastContainer() {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      // Positioned by CSS; fallback inline style
      container.style.cssText =
        'position:fixed;top:1.25rem;right:1.25rem;z-index:9999;display:flex;flex-direction:column;gap:.5rem;';
      document.body.appendChild(container);
    }
    return container;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {'success'|'error'|'warning'|'info'} [type='info']
   * @param {number} [duration=4000] ms before auto-dismiss
   */
  function showToast(message, type = 'info', duration = 4000) {
    const container = ensureToastContainer();

    const iconMap = {
      success: '<i class="fa-solid fa-circle-check"></i>',
      error:   '<i class="fa-solid fa-circle-xmark"></i>',
      warning: '<i class="fa-solid fa-triangle-exclamation"></i>',
      info:    '<i class="fa-solid fa-circle-info"></i>',
    };

    const toast = document.createElement('div');
    toast.className = `toast toast--${type}`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
      <span class="toast__icon">${iconMap[type] ?? iconMap.info}</span>
      <span class="toast__message">${UI.sanitizeHTML(message)}</span>
      <button class="toast__close" aria-label="Dismiss" data-toast-close>
        <i class="fa-solid fa-xmark"></i>
      </button>`;

    container.appendChild(toast);

    // Trigger CSS enter animation on next frame
    requestAnimationFrame(() => toast.classList.add('toast--visible'));

    const dismiss = () => {
      toast.classList.remove('toast--visible');
      toast.addEventListener('transitionend', () => toast.remove(), { once: true });
    };

    const timer = setTimeout(dismiss, duration);
    toast.querySelector('[data-toast-close]').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearTimeout(timer);
      dismiss();
    });
  }

  // ── Loading spinners ─────────────────────────

  function showLoading(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.setAttribute('data-loading-text', el.textContent);
    el.disabled = true;
    el.innerHTML = '<span class="spinner" aria-hidden="true"></span> Loading…';
  }

  function hideLoading(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.disabled = false;
    el.textContent = el.getAttribute('data-loading-text') ?? '';
    el.removeAttribute('data-loading-text');
  }

  // ── Modals ───────────────────────────────────

  function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.add('modal--open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('modal-open');
  }

  function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;
    modal.classList.remove('modal--open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('modal-open');
  }

  // ── Date / time formatters ───────────────────

  /**
   * Format a date string into a human-readable form.
   * @param {string} dateStr  Any value parseable by Date()
   * @param {Intl.DateTimeFormatOptions} [options]
   */
  function formatDate(dateStr, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-PH', options);
  }

  function formatDateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d)) return '—';
    return d.toLocaleString('en-PH', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  /** Returns a string like "3 minutes ago", "2 hours ago", "yesterday", etc. */
  function formatRelativeTime(dateStr) {
    if (!dateStr) return '—';
    const d    = new Date(dateStr);
    if (isNaN(d)) return '—';
    const diff = (Date.now() - d.getTime()) / 1000; // seconds

    if (diff < 60)          return 'just now';
    if (diff < 3600)        return `${Math.floor(diff / 60)} minute${Math.floor(diff / 60) !== 1 ? 's' : ''} ago`;
    if (diff < 86400)       return `${Math.floor(diff / 3600)} hour${Math.floor(diff / 3600) !== 1 ? 's' : ''} ago`;
    if (diff < 172800)      return 'yesterday';
    if (diff < 604800)      return `${Math.floor(diff / 86400)} days ago`;
    if (diff < 2592000)     return `${Math.floor(diff / 604800)} week${Math.floor(diff / 604800) !== 1 ? 's' : ''} ago`;
    return formatDate(dateStr);
  }

  // ── String helpers ───────────────────────────

  function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  }

  /**
   * Returns a debounced version of fn.
   * @param {Function} fn
   * @param {number}   ms
   */
  function debounce(fn, ms) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  /** Escapes HTML special characters to prevent XSS. */
  function sanitizeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g,  '&amp;')
      .replace(/</g,  '&lt;')
      .replace(/>/g,  '&gt;')
      .replace(/"/g,  '&quot;')
      .replace(/'/g,  '&#x27;');
  }

  /**
   * Returns a Bootstrap-style badge <span> for appointment statuses.
   * @param {string} status
   * @returns {string} HTML string
   */
  function getStatusBadge(status) {
    const map = {
      pending:   { label: 'Pending',   cls: 'badge--warning'  },
      confirmed: { label: 'Confirmed', cls: 'badge--primary'  },
      completed: { label: 'Completed', cls: 'badge--success'  },
      cancelled: { label: 'Cancelled', cls: 'badge--danger'   },
      no_show:   { label: 'No Show',   cls: 'badge--secondary'},
    };
    const entry = map[(status || '').toLowerCase()] ?? { label: capitalize(status || 'Unknown'), cls: 'badge--secondary' };
    return `<span class="badge ${entry.cls}">${entry.label}</span>`;
  }

  /**
   * Format a number as Philippine Peso currency.
   * @param {number|string} amount
   * @returns {string} e.g. "₱1,000.00"
   */
  function formatCurrency(amount) {
    const num = parseFloat(amount);
    if (isNaN(num)) return '₱0.00';
    return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /**
   * Returns the uppercase initials for a given first + last name.
   * @param {string} firstName
   * @param {string} lastName
   * @returns {string} e.g. "JD"
   */
  function getInitials(firstName = '', lastName = '') {
    return [(firstName[0] ?? ''), (lastName[0] ?? '')]
      .join('')
      .toUpperCase();
  }

  /**
   * Shows a custom confirm dialog and returns a Promise that resolves to true/false.
   * Falls back to window.confirm when the modal element is absent.
   * @param {string} message
   * @param {string} [title='Confirm']
   * @returns {Promise<boolean>}
   */
  function showConfirm(message, title = 'Confirm') {
    const modal = document.getElementById('confirm-modal');

    if (!modal) return Promise.resolve(window.confirm(message));

    return new Promise((resolve) => {
      const titleEl   = modal.querySelector('[data-confirm-title]');
      const messageEl = modal.querySelector('[data-confirm-message]');
      const yesBtn    = modal.querySelector('[data-confirm-yes]');
      const noBtn     = modal.querySelector('[data-confirm-no]');

      if (titleEl)   titleEl.textContent   = title;
      if (messageEl) messageEl.textContent = message;

      showModal('confirm-modal');

      const cleanup = (result) => {
        hideModal('confirm-modal');
        yesBtn?.removeEventListener('click', onYes);
        noBtn ?.removeEventListener('click', onNo);
        resolve(result);
      };

      const onYes = () => cleanup(true);
      const onNo  = () => cleanup(false);

      yesBtn?.addEventListener('click', onYes, { once: true });
      noBtn ?.addEventListener('click', onNo,  { once: true });
    });
  }

  /* ── Event delegation for toast close & modal backdrop close ── */

  document.addEventListener('click', (e) => {
    // Toast close
    if (e.target.closest('[data-toast-close]')) {
      const toast = e.target.closest('.toast');
      toast?.classList.remove('toast--visible');
      toast?.addEventListener('transitionend', () => toast.remove(), { once: true });
    }

    // Modal close via [data-modal-close] or clicking the backdrop
    const closeBtn = e.target.closest('[data-modal-close]');
    if (closeBtn) {
      const modalId = closeBtn.dataset.modalClose || closeBtn.closest('.modal')?.id;
      if (modalId) hideModal(modalId);
    }

    // Close modal on backdrop click
    if (e.target.classList.contains('modal--open') || e.target.classList.contains('modal__backdrop')) {
      const modal = e.target.closest('.modal');
      if (modal) hideModal(modal.id);
    }
  });

  return {
    showToast,
    showLoading,
    hideLoading,
    showModal,
    hideModal,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    capitalize,
    debounce,
    sanitizeHTML,
    getStatusBadge,
    formatCurrency,
    getInitials,
    showConfirm,
  };
})();


/* ─────────────────────────────────────────────
   FORM — Validation & data helpers
   ───────────────────────────────────────────── */

const Form = (() => {

  /**
   * Validates HTML5 constraint-validation rules on a form.
   * Highlights invalid fields via .is-invalid and shows .invalid-feedback.
   * @param {string} formId
   * @returns {boolean}
   */
  function validate(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    // Clear previous errors
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.invalid-feedback').forEach(el => (el.textContent = ''));

    const valid = form.checkValidity();
    if (!valid) {
      form.querySelectorAll(':invalid').forEach(el => {
        el.classList.add('is-invalid');
        const feedback = el.parentElement?.querySelector('.invalid-feedback');
        if (feedback) feedback.textContent = el.validationMessage;
      });
    }
    return valid;
  }

  /**
   * Collects all named form fields into a plain object.
   * Checkboxes return booleans; multi-selects return arrays.
   * @param {string} formId
   * @returns {object}
   */
  function getData(formId) {
    const form = document.getElementById(formId);
    if (!form) return {};

    const data = {};
    const fd   = new FormData(form);

    // Determine which fields are multi-select
    const multiSelects = new Set(
      [...form.querySelectorAll('select[multiple]')].map(s => s.name)
    );

    for (const [key, value] of fd.entries()) {
      if (multiSelects.has(key)) {
        data[key] = data[key] ? [...data[key], value] : [value];
      } else {
        data[key] = value;
      }
    }

    // Explicitly capture unchecked checkboxes as false
    form.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      if (!(cb.name in data)) data[cb.name] = false;
      else data[cb.name] = true;
    });

    return data;
  }

  /**
   * Displays server-returned validation errors beside their fields.
   * `errors` can be:
   *   - an object: { fieldName: 'Error message', ... }
   *   - an array:  [{ field, message }, ...]
   * @param {object|Array} errors
   */
  function setErrors(errors) {
    if (!errors) return;

    const errorMap = Array.isArray(errors)
      ? Object.fromEntries(errors.map(e => [e.field, e.message]))
      : errors;

    for (const [field, message] of Object.entries(errorMap)) {
      const input    = document.querySelector(`[name="${field}"]`);
      if (!input) continue;
      input.classList.add('is-invalid');
      const feedback = input.parentElement?.querySelector('.invalid-feedback');
      if (feedback) feedback.textContent = message;
    }
  }

  function reset(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    form.reset();
    form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
    form.querySelectorAll('.invalid-feedback').forEach(el => (el.textContent = ''));
  }

  /**
   * Toggles between password/text input type for a password field.
   * @param {string} inputId     ID of the <input type="password">
   * @param {string} toggleBtnId ID of the toggle button / icon element
   */
  function togglePasswordVisibility(inputId, toggleBtnId) {
    const input     = document.getElementById(inputId);
    const toggleBtn = document.getElementById(toggleBtnId);
    if (!input || !toggleBtn) return;

    const isHidden  = input.type === 'password';
    input.type      = isHidden ? 'text' : 'password';

    // Swap common icon classes (works with Font Awesome or similar)
    toggleBtn.classList.toggle('fa-eye',        isHidden);
    toggleBtn.classList.toggle('fa-eye-slash', !isHidden);
    toggleBtn.setAttribute('aria-label', isHidden ? 'Hide password' : 'Show password');
  }

  /** @param {string} email @returns {boolean} */
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  /**
   * Validates password strength.
   * @param {string} password
   * @returns {{ valid: boolean, strength: 'weak'|'fair'|'strong', message: string }}
   */
  function validatePassword(password) {
    const pwd = String(password);
    if (pwd.length < 8) return { valid: false, strength: 'weak',   message: 'Password must be at least 8 characters.' };

    const hasUpper  = /[A-Z]/.test(pwd);
    const hasLower  = /[a-z]/.test(pwd);
    const hasDigit  = /\d/.test(pwd);
    const hasSymbol = /[^A-Za-z0-9]/.test(pwd);
    const score     = [hasUpper, hasLower, hasDigit, hasSymbol].filter(Boolean).length;

    if (score <= 2) return { valid: false, strength: 'weak',   message: 'Password is too weak. Add uppercase letters, digits, and symbols.' };
    if (score === 3) return { valid: true,  strength: 'fair',   message: 'Password strength: fair.' };
    return               { valid: true,  strength: 'strong', message: 'Password strength: strong.' };
  }

  /**
   * Validates a Philippine mobile/landline number.
   * Accepts formats: 09XXXXXXXXX, +639XXXXXXXXX, 02-XXXX-XXXX
   * @param {string} phone
   * @returns {boolean}
   */
  function validatePhone(phone) {
    return /^(\+63|0)[\d\s\-]{9,14}$/.test(String(phone).trim());
  }

  return {
    validate,
    getData,
    setErrors,
    reset,
    togglePasswordVisibility,
    validateEmail,
    validatePassword,
    validatePhone,
  };
})();


/* ─────────────────────────────────────────────
   CHARTS — Chart.js configuration helpers
   ───────────────────────────────────────────── */

const Charts = (() => {
  // Intentionally distinct, accessible palette
  const colors = [
    '#4A90E2', // blue
    '#7ED321', // green
    '#F5A623', // amber
    '#D0021B', // red
    '#9B59B6', // purple
    '#1ABC9C', // teal
    '#E67E22', // orange
    '#2ECC71', // emerald
    '#3498DB', // sky-blue
    '#E74C3C', // coral
    '#F39C12', // gold
    '#8E44AD', // violet
  ];

  /** @returns {string[]} Abbreviated month names starting from January */
  function getMonthLabels() {
    return ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  }

  /**
   * Destroys an existing Chart.js instance attached to a canvas element.
   * Safe to call even when no chart exists on the canvas.
   * @param {string} chartId  The canvas element's id
   */
  function destroyChart(chartId) {
    const canvas = document.getElementById(chartId);
    if (!canvas) return;

    // Chart.js 3.x+ stores the instance on Chart.instances keyed by canvas id
    if (typeof Chart !== 'undefined') {
      const existing = Chart.getChart(canvas);
      if (existing) existing.destroy();
    }
  }

  return {
    colors,
    getMonthLabels,
    destroyChart,
  };
})();
