// ============================================================
// SkyHigh Executive — Entry Point
// ============================================================
window.SkyHigh = window.SkyHigh || {};

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI
  SkyHigh.UI.init();

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
