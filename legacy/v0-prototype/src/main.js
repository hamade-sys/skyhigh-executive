// ============================================================
// SkyHigh Executive — Entry Point
// ============================================================
window.SkyHigh = window.SkyHigh || {};

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  SkyHigh.UI.init();

  // ── AUTH: Always show login row; restore session if Firebase on ──
  let restoredUser = null;
  // Always show the auth row (login shows limited-mode when Firebase off)
  const authRow = document.getElementById('splash-auth-row');
  if (authRow) authRow.style.display = 'flex';

  if (SkyHigh.Auth?.isEnabled?.()) {
    restoredUser = await SkyHigh.Auth.restoreSession();
    if (restoredUser) {
      SkyHigh.UI._updateSplashUserPill?.(restoredUser);
    }
  }

  // ── ADMIN: Show admin button (Firebase admin or local dev PIN) ───
  // Local dev admin: hold Shift and click the "⚙" area, or use PIN
  if (restoredUser && SkyHigh.Auth?.isEnabled?.()) {
    SkyHigh.Auth.checkIsAdmin?.().then(isAdmin => {
      if (isAdmin) {
        const adminBtn = document.getElementById('btn-go-admin');
        if (adminBtn) adminBtn.style.display = 'inline-flex';
        const adminUser = document.getElementById('adm-admin-user');
        if (adminUser) adminUser.textContent = restoredUser.username;
      }
    });
  }

  // ── SAVE: Check for existing save ───────────────────────
  // Try cloud save first if logged in, else fall back to localStorage
  let cloudSave = null;
  if (restoredUser && SkyHigh.Auth?.isEnabled?.()) {
    try { cloudSave = await SkyHigh.Auth.cloudLoad(); } catch(_) {}
  }

  const hasSave = cloudSave || SkyHigh.UI.hasSave?.();
  if (hasSave) {
    const saveEl = document.getElementById('splash-continue');
    if (saveEl) saveEl.style.display = 'flex';
    const save = cloudSave || SkyHigh.UI.loadGame?.();
    const infoEl = document.getElementById('save-info-label');
    if (infoEl && save) {
      const d = save.savedAt ? new Date(save.savedAt) : null;
      const dateStr = d ? d.toLocaleDateString() : '';
      const airline = save.profile?.airlineName || cloudSave?.airlineName || 'Unknown Airline';
      const round   = save.state?.round || cloudSave?.round || '?';
      infoEl.textContent = `${airline} · Q${round}${dateStr ? ' · ' + dateStr : ''}`;
    }
  }

  // ── SPLASH BUTTONS ───────────────────────────────────────

  // New Game
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    SkyHigh.UI.showScreen('setup');
  });

  // Continue Campaign
  document.getElementById('btn-continue-game')?.addEventListener('click', async () => {
    let save = cloudSave || SkyHigh.UI.loadGame?.();
    if (!save) { SkyHigh.UI.toast('No save found.', 'error'); return; }

    // Cloud save may be raw gameState — normalize
    let profile = save.profile;
    let state   = save.state;
    if (!profile && save.round) {
      // Came from cloudLoad() as raw gameState
      state   = save;
      profile = { airlineName: save.airlineName, ceoName: save.ceoName,
                  airlineCode: save.airlineCode, hubAirportId: save.hubAirportId,
                  doctrineId: save.doctrineId };
    }

    SkyHigh.CoreSim.init(profile);
    Object.assign(SkyHigh.CoreSim.getState(), state);
    SkyHigh.UI.showScreen('game');
    setTimeout(() => SkyHigh.UI._initGame(), 300);
  });

  // Go to Login
  document.getElementById('btn-go-login')?.addEventListener('click', () => {
    SkyHigh.UI.showScreen('auth');
    SkyHigh.UI.authShowTab('login');
  });

  // Logout from splash
  document.getElementById('btn-auth-logout')?.addEventListener('click', () => {
    SkyHigh.UI.authLogout?.();
  });

  // Admin dashboard
  document.getElementById('btn-go-admin')?.addEventListener('click', () => {
    SkyHigh.Admin.open();
  });

  // ── AUTH SCREEN: Enter key support ───────────────────────
  // (buttons already have onclick in HTML; just add keyboard shortcuts)
  ['auth-login-email','auth-login-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') SkyHigh.UI.authLogin();
    });
  });
  ['auth-reg-username','auth-reg-email','auth-reg-pass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') SkyHigh.UI.authRegister();
    });
  });
  // ── GAME SCREEN BUTTONS ──────────────────────────────────

  // Return to global view button
  document.getElementById('btn-global-view')?.addEventListener('click', () => {
    SkyHigh.MapEngine.resetView();
  });

  // Modal close buttons
  document.querySelectorAll('[data-close-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.closeModal;
      document.getElementById(modalId)?.classList.remove('open');
    });
  });

  // Result panel next button
  document.getElementById('btn-result-next')?.addEventListener('click', () => {
    document.getElementById('result-overlay')?.classList.remove('visible');
    const s = SkyHigh.CoreSim.getState();
    if (s?.phase === 'RESULT') SkyHigh.UI._showReportPhase();
  });

  // Report advance button
  document.getElementById('btn-report-next')?.addEventListener('click', () => {
    SkyHigh.UI.advanceFromReport();
  });

  // Play again
  document.getElementById('btn-play-again')?.addEventListener('click', () => {
    SkyHigh.UI.showScreen('setup');
  });

  // Buy plane modal trigger
  document.getElementById('btn-buy-plane')?.addEventListener('click', () => {
    SkyHigh.UI._showBuyPlaneModal();
  });

  // Plane selector in route projection
  document.querySelectorAll('.plane-opt').forEach(el => {
    el.addEventListener('click', () => {
      SkyHigh.UI.selectPlane(el.dataset.plane);
    });
  });

  // Animate splash
  setTimeout(() => {
    document.getElementById('splash-cta')?.classList.add('fadeInUp');
  }, 1200);

  console.log('🛫 SkyHigh Executive initialized.');
});
