// ============================================================
// SkyHigh Executive — Entry Point
// ============================================================
window.SkyHigh = window.SkyHigh || {};

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  SkyHigh.UI.init();

  // Check for existing save and show Continue button
  if (SkyHigh.UI.hasSave?.()) {
    const saveEl = document.getElementById('splash-continue');
    if (saveEl) saveEl.style.display = 'flex';
    const save = SkyHigh.UI.loadGame?.();
    const infoEl = document.getElementById('save-info-label');
    if (infoEl && save) {
      const d = new Date(save.savedAt);
      infoEl.textContent = `${save.profile?.airlineName || 'Unknown Airline'} · Q${save.state?.round} · ${d.toLocaleDateString()}`;
    }
  }

  // Continue Campaign button
  document.getElementById('btn-continue-game')?.addEventListener('click', () => {
    const save = SkyHigh.UI.loadGame?.();
    if (!save) { SkyHigh.UI.toast('No save found.', 'error'); return; }
    SkyHigh.CoreSim.init(save.profile);
    Object.assign(SkyHigh.CoreSim.getState(), save.state);
    SkyHigh.UI.showScreen('game');
    setTimeout(() => SkyHigh.UI._initGame(), 300);
  });

  // Animate splash
  setTimeout(() => {
    document.getElementById('splash-cta')?.classList.add('fadeInUp');
  }, 1200);

  // Splash CTA
  document.getElementById('btn-new-game')?.addEventListener('click', () => {
    SkyHigh.UI.showScreen('setup');
  });

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
    // Force advance if not auto-advancing
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

  console.log('🛫 SkyHigh Executive initialized.');
});
