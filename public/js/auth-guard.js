/**
 * FDMST - Flores-Dizon Dental Clinic Management System
 * auth-guard.js — Client-side route protection
 *
 * Depends on Auth (from utils.js).  Must be loaded AFTER utils.js.
 *
 * Rules enforced:
 *   1. Any page under /dashboard/ requires an active session.
 *      Unauthenticated visitors are redirected to /login.html.
 *   2. Authenticated users who land on /login.html or /register.html
 *      are forwarded to their role-specific dashboard.
 *   3. Authenticated users who land on a dashboard page that does NOT
 *      match their role are forwarded to the correct dashboard.
 */

'use strict';

(function () {

  /* ── Role → dashboard path mapping ─────────────────────────────── */

  const ROLE_DASHBOARDS = {
    admin:   '/dashboard/admin.html',
    staff:   '/dashboard/staff.html',
    patient: '/dashboard/patient.html',
  };

  const LOGIN_PAGE    = '/login.html';
  const REGISTER_PAGE = '/register.html';

  /* ── Path helpers ───────────────────────────────────────────────── */

  const currentPath = window.location.pathname;

  function isOnDashboard() {
    return currentPath.includes('/dashboard/');
  }

  function isOnAuthPage() {
    return currentPath.endsWith(LOGIN_PAGE) ||
           currentPath.endsWith(REGISTER_PAGE) ||
           currentPath === '/' ||                // root often serves login
           currentPath.endsWith('/index.html');
  }

  /**
   * Returns the dashboard path for the given role.
   * Falls back to the patient dashboard for unknown roles.
   * @param {string} role
   * @returns {string}
   */
  function dashboardFor(role) {
    return ROLE_DASHBOARDS[role] ?? ROLE_DASHBOARDS.patient;
  }

  /* ── Guard logic ────────────────────────────────────────────────── */

  function runGuard() {
    const loggedIn = Auth.isLoggedIn();
    const user     = Auth.getUser();
    const role     = user?.role ?? null;

    // ── Case 1: Dashboard page, not authenticated → send to login
    if (isOnDashboard() && !loggedIn) {
      // Preserve the attempted URL so we can redirect back after login
      const returnTo = encodeURIComponent(window.location.href);
      window.location.replace(`${LOGIN_PAGE}?returnTo=${returnTo}`);
      return;
    }

    // ── Case 2: Auth page (login / register), already authenticated
    //            → forward to the user's own dashboard
    if (isOnAuthPage() && loggedIn && role) {
      window.location.replace(dashboardFor(role));
      return;
    }

    // ── Case 3: On a dashboard page but the role doesn't match the URL
    //            e.g. a patient manually navigating to /dashboard/admin.html
    if (isOnDashboard() && loggedIn && role) {
      const expectedDashboard = dashboardFor(role);

      // Normalise for comparison: strip any query string / hash
      const normalise = (path) => path.split('?')[0].split('#')[0].toLowerCase();

      if (!normalise(currentPath).endsWith(normalise(expectedDashboard))) {
        window.location.replace(expectedDashboard);
      }
    }
  }

  /* ── Public API ─────────────────────────────────────────────────── */

  /**
   * Returns the currently stored user object, or null.
   * Convenience wrapper so pages don't need to import Auth directly.
   * @returns {object|null}
   */
  function getCurrentUser() {
    return Auth.getUser();
  }

  // Make getCurrentUser available globally
  window.getCurrentUser = getCurrentUser;

  /* ── Run immediately on script evaluation ───────────────────────── */
  runGuard();

})();
