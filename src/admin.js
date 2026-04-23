// ============================================================
// SkyHigh Executive — Admin Dashboard
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.Admin = (() => {
  'use strict';

  let _tab = 'overview';
  let _allUsers = [];
  let _allTeams = [];

  const ADM = {

    // ── ADMIN LOGIN MODAL ─────────────────────────────────────
    // Hardcoded local credentials (works without Firebase)
    _LOCAL_CREDS: { username: 'skyhigh_admin', password: 'SkyHigh@2025' },

    showLogin() {
      const overlay = document.getElementById('admin-login-overlay');
      if (overlay) {
        overlay.style.display = 'flex';
        setTimeout(() => document.getElementById('adm-login-user')?.focus(), 50);
      }
      // Enter key support
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

      // Try Firebase admin first (if enabled and logged in)
      if (SkyHigh.Auth?.isEnabled?.() && SkyHigh.Auth?.isLoggedIn?.()) {
        const isAdmin = await SkyHigh.Auth.checkIsAdmin();
        if (isAdmin) {
          ADM.hideLogin();
          ADM._open(SkyHigh.Auth.getUser()?.username || 'Admin');
          return;
        }
      }

      // Fall back to local credentials
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
      // Firebase admin button (splash logged-in row) → verify then open
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
      if (tab === 'teams')     ADM.loadTeams();
      if (tab === 'lobbies')   ADM.loadLobbies();
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
            <div class="adm-stat-label">Total Users</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.totalTeams ?? '—'}</div>
            <div class="adm-stat-label">Total Teams</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.activeGames ?? '—'}</div>
            <div class="adm-stat-label">Games in Progress</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.lobbyCount ?? '—'}</div>
            <div class="adm-stat-label">Open Lobbies</div>
          </div>
          <div class="adm-stat-card">
            <div class="adm-stat-value">${stats.totalMembers ?? '—'}</div>
            <div class="adm-stat-label">Players in Teams</div>
          </div>
        </div>
        <div class="adm-section-title" style="margin-top:1.5rem">Quick Actions</div>
        <div class="adm-quick-actions">
          <button class="adm-action-btn" onclick="SkyHigh.Admin.switchTab('users')">👥 Manage Users</button>
          <button class="adm-action-btn" onclick="SkyHigh.Admin.switchTab('teams')">🏆 Manage Teams</button>
          <button class="adm-action-btn" onclick="SkyHigh.Admin.switchTab('lobbies')">🎮 Lobby Browser</button>
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
            <th>Username</th><th>Email</th><th>Role</th><th>Team</th><th>Status</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${users.map(u => `
              <tr data-uid="${u.uid}" class="${u.banned ? 'adm-row-banned' : ''}">
                <td><span class="adm-username">${u.username || '—'}</span>${u.isAdmin ? ' <span class="adm-badge-admin">ADMIN</span>' : ''}</td>
                <td class="adm-email">${u.email || '—'}</td>
                <td>${u.role ? `<span class="adm-role-tag">${u.role}</span>` : '—'}</td>
                <td>${u.teamId ? `<code class="adm-code">${u.teamId.slice(0,8)}…</code>` : '—'}</td>
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

    // ── TEAMS ─────────────────────────────────────────────────
    async loadTeams() {
      const el = document.getElementById('adm-teams-table');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Loading teams…</div>';
      _allTeams = await SkyHigh.Auth.adminListTeams();
      ADM._renderTeamsTable(_allTeams);
    },

    _renderTeamsTable(teams) {
      const el = document.getElementById('adm-teams-table');
      if (!el) return;
      if (!teams.length) { el.innerHTML = '<div class="adm-empty">No teams found</div>'; return; }
      el.innerHTML = `
        <table class="adm-table">
          <thead><tr>
            <th>Team Name</th><th>Invite Code</th><th>Status</th><th>Members</th><th>Type</th><th>Actions</th>
          </tr></thead>
          <tbody>
            ${teams.map(t => `
              <tr>
                <td><strong>${t.teamName || '—'}</strong></td>
                <td><code class="adm-code adm-code-gold">${t.inviteCode || '—'}</code></td>
                <td>${ADM._statusBadge(t.status)}</td>
                <td>
                  <div class="adm-members-list">
                    ${(t.members || []).map(m => `<span class="adm-member-chip" title="${m.role}">${m.username}</span>`).join('')}
                    ${(t.members || []).length === 0 ? '<span class="adm-empty-sm">Empty</span>' : ''}
                  </div>
                </td>
                <td>${t.isPrivate ? '<span class="adm-badge-private">Private</span>' : '<span class="adm-badge-public">Public</span>'}</td>
                <td class="adm-actions">
                  <button class="adm-btn adm-btn-sm" onclick="SkyHigh.Admin.viewTeam('${t.teamId}')">View</button>
                  <button class="adm-btn adm-btn-sm adm-btn-danger" onclick="SkyHigh.Admin.deleteTeam('${t.teamId}', '${(t.teamName||'').replace(/'/g,'')}')">Delete</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;
    },

    _statusBadge(status) {
      const map = { lobby: 'adm-badge-lobby', playing: 'adm-badge-playing', done: 'adm-badge-done' };
      return `<span class="adm-status-badge ${map[status] || ''}">${status || 'unknown'}</span>`;
    },

    viewTeam(teamId) {
      const team = _allTeams.find(t => t.teamId === teamId);
      if (!team) return;
      const members = (team.members || []).map(m =>
        `<tr><td>${m.username}</td><td><span class="adm-role-tag">${m.role}</span></td><td>${m.online ? '🟢 Online' : '⚫ Offline'}</td></tr>`
      ).join('');
      ADM._showModal(`
        <div class="adm-modal-header">🏆 ${team.teamName}</div>
        <div class="adm-modal-meta">
          <div>Code: <code class="adm-code adm-code-gold">${team.inviteCode}</code></div>
          <div>Status: ${ADM._statusBadge(team.status)}</div>
          <div>Type: ${team.isPrivate ? 'Private' : 'Public'}</div>
          ${team.notes ? `<div>Notes: ${team.notes}</div>` : ''}
        </div>
        <table class="adm-table" style="margin-top:0.75rem">
          <thead><tr><th>Player</th><th>Role</th><th>Presence</th></tr></thead>
          <tbody>${members || '<tr><td colspan="3">No members</td></tr>'}</tbody>
        </table>
        ${team.gameState ? '<div class="adm-modal-note">⚠ Active game save in Firestore</div>' : ''}
      `);
    },

    async deleteTeam(teamId, name) {
      if (!confirm(`Delete team "${name}"? All members will be removed from the team.`)) return;
      const result = await SkyHigh.Auth.adminDeleteTeam(teamId);
      if (result.ok) {
        SkyHigh.UI.toast('Team deleted', 'success', 2000);
        ADM.loadTeams();
      } else {
        SkyHigh.UI.toast(result.reason || 'Delete failed', 'error');
      }
    },

    // ── LOBBIES ───────────────────────────────────────────────
    async loadLobbies() {
      const el = document.getElementById('adm-lobbies-list');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Loading lobbies…</div>';
      const teams = await SkyHigh.Auth.adminListTeams();
      const lobbies = teams.filter(t => t.status === 'lobby');
      if (!lobbies.length) {
        el.innerHTML = '<div class="adm-empty">No active lobbies</div>';
        return;
      }
      el.innerHTML = lobbies.map(t => `
        <div class="adm-lobby-card ${t.isPrivate ? 'adm-lobby-private' : ''}">
          <div class="adm-lobby-header">
            <span class="adm-lobby-name">${t.teamName}</span>
            ${t.isPrivate ? '<span class="adm-badge-private">Private</span>' : '<span class="adm-badge-public">Public</span>'}
          </div>
          <div class="adm-lobby-code">Code: <code class="adm-code-gold">${t.inviteCode}</code></div>
          <div class="adm-lobby-members">
            ${(t.members || []).map(m => `<span class="adm-member-chip">${m.username} (${m.role})</span>`).join('') || '<span class="adm-empty-sm">No players yet</span>'}
            <span class="adm-lobby-capacity">${(t.members||[]).length}/${t.maxPlayers || 4}</span>
          </div>
          ${t.notes ? `<div class="adm-lobby-notes">${t.notes}</div>` : ''}
          <div class="adm-lobby-actions">
            <button class="adm-btn adm-btn-sm adm-btn-danger" onclick="SkyHigh.Admin.deleteTeam('${t.teamId}','${(t.teamName||'').replace(/'/g,'')}')">Delete Lobby</button>
          </div>
        </div>`).join('');
    },

    createPrivateLobby() {
      ADM._showModal(`
        <div class="adm-modal-header">🎮 Create Private Lobby</div>
        <div class="adm-form-group">
          <label class="adm-form-label">Lobby Name</label>
          <input id="adm-lobby-name" class="adm-form-input" type="text" placeholder="e.g. Admin Test Lobby" maxlength="40">
        </div>
        <div class="adm-form-group">
          <label class="adm-form-label">Max Players</label>
          <select id="adm-lobby-max" class="adm-form-input">
            <option value="2">2 players</option>
            <option value="3">3 players</option>
            <option value="4" selected>4 players</option>
            <option value="5">5 players</option>
          </select>
        </div>
        <div class="adm-form-group">
          <label class="adm-form-label">Visibility</label>
          <select id="adm-lobby-visibility" class="adm-form-input">
            <option value="private">Private (invite code only)</option>
            <option value="public">Public (visible in lobby browser)</option>
          </select>
        </div>
        <div class="adm-form-group">
          <label class="adm-form-label">Notes (shown to admin only)</label>
          <input id="adm-lobby-notes" class="adm-form-input" type="text" placeholder="Optional admin notes" maxlength="100">
        </div>
        <div class="adm-modal-actions">
          <button class="adm-btn adm-btn-gold" onclick="SkyHigh.Admin._confirmCreateLobby()">Create Lobby</button>
          <button class="adm-btn" onclick="SkyHigh.Admin._closeModal()">Cancel</button>
        </div>
      `);
    },

    async _confirmCreateLobby() {
      const name       = document.getElementById('adm-lobby-name')?.value.trim();
      const maxPlayers = parseInt(document.getElementById('adm-lobby-max')?.value) || 4;
      const isPrivate  = document.getElementById('adm-lobby-visibility')?.value === 'private';
      const notes      = document.getElementById('adm-lobby-notes')?.value.trim();
      if (!name) { SkyHigh.UI.toast('Enter a lobby name', 'warning'); return; }
      const result = await SkyHigh.Auth.adminCreateLobby({ teamName: name, isPrivate, maxPlayers, notes });
      ADM._closeModal();
      if (result.ok) {
        SkyHigh.UI.toast(`Lobby created — Code: ${result.inviteCode}`, 'success', 5000);
        ADM.loadLobbies();
      } else {
        SkyHigh.UI.toast(result.reason || 'Failed', 'error');
      }
    },

    // ── ANALYTICS ─────────────────────────────────────────────
    async loadAnalytics() {
      const el = document.getElementById('adm-analytics-content');
      if (!el) return;
      el.innerHTML = '<div class="adm-loading">Crunching numbers…</div>';
      const [users, teams] = await Promise.all([
        SkyHigh.Auth.adminListUsers('', 500),
        SkyHigh.Auth.adminListTeams(),
      ]);

      // Compute analytics
      const roleCount = {};
      teams.forEach(t => (t.members || []).forEach(m => { roleCount[m.role] = (roleCount[m.role]||0) + 1; }));
      const statusCount = { lobby: 0, playing: 0, done: 0 };
      teams.forEach(t => { if (statusCount[t.status] !== undefined) statusCount[t.status]++; });
      const usersWithTeams = users.filter(u => u.teamId).length;
      const soloUsers      = users.length - usersWithTeams;

      const maxRole = Math.max(...Object.values(roleCount), 1);
      const maxStatus = Math.max(...Object.values(statusCount), 1);

      el.innerHTML = `
        <div class="adm-analytics-grid">
          <div class="adm-analytics-card">
            <div class="adm-analytics-title">Role Distribution</div>
            ${Object.entries(roleCount).map(([role, count]) => `
              <div class="adm-bar-row">
                <span class="adm-bar-label">${role}</span>
                <div class="adm-bar-track"><div class="adm-bar-fill" style="width:${Math.round(count/maxRole*100)}%"></div></div>
                <span class="adm-bar-val">${count}</span>
              </div>`).join('') || '<div class="adm-empty">No data</div>'}
          </div>

          <div class="adm-analytics-card">
            <div class="adm-analytics-title">Team Status</div>
            ${Object.entries(statusCount).map(([s, count]) => `
              <div class="adm-bar-row">
                <span class="adm-bar-label">${s}</span>
                <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-blue" style="width:${Math.round(count/maxStatus*100)}%"></div></div>
                <span class="adm-bar-val">${count}</span>
              </div>`).join('')}
          </div>

          <div class="adm-analytics-card">
            <div class="adm-analytics-title">Player Engagement</div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">In Teams</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-green" style="width:${users.length ? Math.round(usersWithTeams/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${usersWithTeams}</span>
            </div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Solo</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-muted" style="width:${users.length ? Math.round(soloUsers/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${soloUsers}</span>
            </div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Banned</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-red" style="width:${users.length ? Math.round(users.filter(u=>u.banned).length/users.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${users.filter(u=>u.banned).length}</span>
            </div>
          </div>

          <div class="adm-analytics-card">
            <div class="adm-analytics-title">Private vs Public Teams</div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Private</span>
              <div class="adm-bar-track"><div class="adm-bar-fill adm-bar-gold" style="width:${teams.length ? Math.round(teams.filter(t=>t.isPrivate).length/teams.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${teams.filter(t=>t.isPrivate).length}</span>
            </div>
            <div class="adm-bar-row">
              <span class="adm-bar-label">Public</span>
              <div class="adm-bar-track"><div class="adm-bar-fill" style="width:${teams.length ? Math.round(teams.filter(t=>!t.isPrivate).length/teams.length*100) : 0}%"></div></div>
              <span class="adm-bar-val">${teams.filter(t=>!t.isPrivate).length}</span>
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
