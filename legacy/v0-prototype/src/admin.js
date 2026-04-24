// ============================================================
// SkyHigh Executive — Admin Dashboard
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.Admin = (() => {
  'use strict';

  let _tab = 'overview';
  let _allUsers = [];

  const ADM = {

    // ── ADMIN LOGIN MODAL ─────────────────────────────────────
    _LOCAL_CREDS: { username: 'skyhigh_admin', password: 'SkyHigh@2025' },

    showLogin() {
      const overlay = document.getElementById('admin-login-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => document.getElementById('adm-login-user')?.focus(), 50);
      }
      ['adm-login-user', 'adm-login-pass'].forEach(id => {
        document.getElementById(id)?.addEventListener('keydown', e => {
          if (e.key === 'Enter') ADM.submitLogin();
        });
      });
    },

    hideLogin() {
      const overlay = document.getElementById('admin-login-overlay');
      if (overlay) overlay.style.display = 'none';
      const err = document.getElementById('adm-login-error');
      if (err) err.style.display = 'none';
      document.getElementById('adm-login-user') && (document.getElementById('adm-login-user').value = '');
      document.getElementById('adm-login-pass') && (document.getElementById('adm-login-pass').value = '');
    },

    async submitLogin() {
      const username = document.getElementById('adm-login-user')?.value.trim();
      const password = document.getElementById('adm-login-pass')?.value;
      const errEl    = document.getElementById('adm-login-error');

      if (SkyHigh.Auth?.isEnabled?.() && SkyHigh.Auth?.isLoggedIn?.()) {
        const isAdmin = await SkyHigh.Auth.checkIsAdmin();
        if (isAdmin) {
          ADM.hideLogin();
          ADM._open(SkyHigh.Auth.getUser()?.username || 'Admin');
          return;
        }
      }

      const { username: u, password: p } = ADM._LOCAL_CREDS;
      if (username === u && password === p) {
        ADM.hideLogin();
        ADM._open('skyhigh_admin');
      } else {
        if (errEl) { errEl.textContent = 'Incorrect username or password.'; errEl.style.display = 'block'; }
        const passEl = document.getElementById('adm-login-pass');
        if (passEl) { passEl.value = ''; passEl.focus(); }
      }
    },

    _open(adminName) {
      const adminUser = document.getElementById('adm-admin-user');
      if (adminUser) adminUser.textContent = adminName;
      SkyHigh.UI.showScreen('admin');
      ADM.switchTab('overview');
    },

    async open() {
      if (SkyHigh.Auth?.isEnabled?.() && SkyHigh.Auth?.isLoggedIn?.()) {
        const ok = await SkyHigh.Auth.checkIsAdmin();
        if (ok) { ADM._open(SkyHigh.Auth.getUser()?.username || 'Admin'); return; }
      }
      ADM.showLogin();
    },

    exit() {
      SkyHigh.UI.showScreen('splash');
    },

    switchTab(tab) {
      _tab = tab;
      document.querySelectorAll('.adm-tab-content').forEach(el => el.style.display = 'none');
      document.querySelectorAll('.adm-nav-btn').forEach(el => el.classList.remove('active'));
      const content = document.getElementById(`adm-tab-${tab}`);
      if (content) content.style.display = 'block';
      document.querySelector(`.adm-nav-btn[data-tab="${tab}"]`)?.classList.add('active');

      if (tab === 'overview')  ADM.loadOverview();
      if (tab === 'users')     ADM.loadUsers();
      if (tab === 'analytics') ADM.loadAnalytics();
    },

    // ── OVERVIEW ──────────────────────────────────────────────
    async loadOverview() {
      const el = document.getElementById('adm-overview-stats');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Loading stats…</div>';
      const stats = await SkyHigh.Auth.adminGetStats();
      el.innerHTML = `
        <div class="adm-stat-grid">
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.totalUsers ?? '—'}</div>
            <div class="adm-stat-label">Total Players</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.activeGames ?? '—'}</div>
            <div class="adm-stat-label">Active Games</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.bannedUsers ?? '—'}</div>
            <div class="adm-stat-label">Banned Users</div>
          </div>
        </div>
        <div class="adm-section-title" style="margin-top:1.5rem">Quick Actions</div>
        <div class="adm-quick-actions">
          <button class="adm-action-btn" onclick="SkyHigh.Admin.switchTab('users')">👥 Manage Users</button>
          <button class="adm-action-btn" onclick="SkyHigh.Admin.switchTab('analytics')">📈 Analytics</button>
        </div>`;
    },

    // ── USERS ─────────────────────────────────────────────────
    async loadUsers(query = '') {
      const el = document.getElementById('adm-users-table');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Loading users…</div>';
      _allUsers = await SkyHigh.Auth.adminListUsers(query);
      ADM._renderUsersTable(_allUsers);
    },

    _renderUsersTable(users) {
      const el = document.getElementById('adm-users-table');
      if (!el) return;
      if (!users.length) { el.innerHTML = '<div class="adm-empty">No users found</div>'; return; }
      el.innerHTML = `
        <table class="adm-table">
          <thead><tr>
            <th>Username</th><th>Email</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr data-uid="${u.uid}" class="${u.banned ? 'adm-row-banned' : ''}">
                <td><span class="adm-username">${u.username || '—'}</span>${u.isAdmin ? ' <span class="adm-badge-admin">ADMIN</span>' : ''}</td>
                <td class="adm-email">${u.email || '—'}</td>
                <td>${u.banned ? '<span class="adm-status-banned">Banned</span>' : '<span class="adm-status-ok">Active</span>'}</td>
                <td class="adm-actions">
                  <button class="adm-btn adm-btn-sm" onclick="SkyHigh.Admin.toggleBan('${u.uid}', ${!u.banned})">${u.banned ? 'Unban' : 'Ban'}</button>
                  <button class="adm-btn adm-btn-sm adm-btn-gold" onclick="SkyHigh.Admin.toggleAdmin('${u.uid}', ${!u.isAdmin})">${u.isAdmin ? 'Revoke Admin' : 'Make Admin'}</button>
                  <button class="adm-btn adm-btn-sm adm-btn-danger" onclick="SkyHigh.Admin.deleteUser('${u.uid}', '${u.username || u.email}')">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    async toggleBan(uid, ban) {
      const result = await SkyHigh.Auth.adminUpdateUser(uid, { banned: ban, bannedAt: ban ? new Date().toISOString() : null });
      if (result.ok) {
        SkyHigh.UI.toast(ban ? 'User banned' : 'User unbanned', 'success', 2000);
        ADM.loadUsers();
      } else {
        SkyHigh.UI.toast(result.reason || 'Failed', 'error');
      }
    },

    async toggleAdmin(uid, makeAdmin) {
      if (!confirm(`${makeAdmin ? 'Grant' : 'Revoke'} admin access for this user?`)) return;
      const result = await SkyHigh.Auth.adminUpdateUser(uid, { isAdmin: makeAdmin });
      if (result.ok) {
        SkyHigh.UI.toast(makeAdmin ? 'Admin granted' : 'Admin revoked', 'success', 2000);
        ADM.loadUsers();
      } else {
        SkyHigh.UI.toast(result.reason || 'Failed', 'error');
      }
    },

    async deleteUser(uid, name) {
      if (!confirm(`Permanently delete user "${name}"? This cannot be undone.`)) return;
      const result = await SkyHigh.Auth.adminDeleteUser(uid);
      if (result.ok) {
        SkyHigh.UI.toast('User deleted', 'success', 2000);
        ADM.loadUsers();
      } else {
        SkyHigh.UI.toast(result.reason || 'Delete failed', 'error');
      }
    },

    // ── ANALYTICS ─────────────────────────────────────────────
    async loadAnalytics() {
      const el = document.getElementById('adm-analytics-content');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Crunching numbers…</div>';
      const users = await SkyHigh.Auth.adminListUsers('', 500);

      const banned   = users.filter(u => u.banned).length;
      const admins   = users.filter(u => u.isAdmin).length;
      const active   = users.length - banned;

      el.innerHTML = `
        <div class="adm-analytics-grid">
          <div class="adm-analytics-card">
            <div class="adm-analytics-title">Player Status</div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Active</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-green" style="width:${users.length ? Math.round(active/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${active}</span>
            </div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Banned</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-red" style="width:${users.length ? Math.round(banned/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${banned}</span>
            </div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Admins</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-gold" style="width:${users.length ? Math.round(admins/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${admins}</span>
            </div>
          </div>
        </div>`;
    },

    // ── MODAL ─────────────────────────────────────────────────
    _showModal(html) {
      let overlay = document.getElementById('adm-modal-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'adm-modal-overlay';
        overlay.className = 'adm-modal-overlay';
        overlay.addEventListener('click', e => { if (e.target === overlay) ADM._closeModal(); });
        document.body.appendChild(overlay);
      }
      overlay.innerHTML = `<div class="adm-modal">${html}</div>`;
      overlay.style.display = 'flex';
    },

    _closeModal() {
      const o = document.getElementById('adm-modal-overlay');
      if (o) o.style.display = 'none';
    },
  };

  return ADM;
})();
