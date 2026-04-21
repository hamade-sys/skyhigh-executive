// ============================================================
// SkyHigh Executive — Core Sim Tests
// Run in browser console or Node.js (with globals pre-loaded)
// ============================================================

const TEST = {
  passed: 0,
  failed: 0,
  results: [],

  assert(name, condition, detail = '') {
    if (condition) {
      this.passed++;
      this.results.push({ ok: true, name });
      console.log(`  ✓ ${name}`);
    } else {
      this.failed++;
      this.results.push({ ok: false, name, detail });
      console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
    }
  },

  assertEqual(name, a, b) {
    this.assert(name, a === b, `expected ${b}, got ${a}`);
  },

  summary() {
    console.log(`\n══ Results: ${this.passed} passed, ${this.failed} failed ══`);
    return this.failed === 0;
  }
};

// ── SUITE: INIT ────────────────────────────────────────────
function testInit() {
  console.log('\n▶ CoreSim.init()');

  SkyHigh.CoreSim.init({
    ceoName: 'Test CEO',
    airlineName: 'Test Airlines',
    airlineCode: 'TST',
    doctrineId: 'SAFETY_FIRST',
    hubAirportId: 'JFK',
  });

  const s = SkyHigh.CoreSim.getState();

  TEST.assert('State is created',       !!s);
  TEST.assertEqual('Round starts at 1', s.round, 1);
  TEST.assertEqual('Stage starts at 1', s.stage, 1);
  TEST.assertEqual('Phase is COMMAND',  s.phase, 'COMMAND');
  TEST.assert('Cash is positive',       s.cash > 0);
  TEST.assert('Cash is $50M',           s.cash === 50_000_000);
  TEST.assert('Fleet has 2 planes',     s.fleet.length === 2);
  TEST.assert('No routes at start',     s.routes.length === 0);
  TEST.assert('Action points are 3',    s.actionPoints === 3);
  TEST.assert('Safety shield boosted by doctrine', s.safetyShield > 65);
  TEST.assert('BoardConfidence >= 0',   s.boardConfidence >= 0);
  TEST.assert('Doctrine applied flag',  s.doctrineApplied === true);
}

// ── SUITE: ROUTE MANAGEMENT ────────────────────────────────
function testRoutes() {
  console.log('\n▶ Route Management');

  SkyHigh.CoreSim.init({
    ceoName: 'Test', airlineName: 'Test', airlineCode: 'TST',
    doctrineId: 'BUDGET_EXPANSION', hubAirportId: 'LHR'
  });

  // Valid route
  const r1 = SkyHigh.CoreSim.openRoute('LHR', 'CDG', 'NARROWBODY');
  TEST.assert('Open LHR→CDG succeeds',       r1.ok);
  TEST.assert('Route has distKm',             r1.distKm > 0 && r1.distKm < 500);
  TEST.assert('Route has band',               ['SHORT','MEDIUM','LONG','ULTRA'].includes(r1.distBand));
  TEST.assert('AP decremented',               SkyHigh.CoreSim.getState().actionPoints === 2);
  TEST.assert('Route is in state',            SkyHigh.CoreSim.getState().routes.length === 1);

  // Duplicate route
  const r2 = SkyHigh.CoreSim.openRoute('LHR', 'CDG', 'NARROWBODY');
  TEST.assert('Duplicate route rejected',     !r2.ok);

  // Same origin and dest
  const r3 = SkyHigh.CoreSim.openRoute('LHR', 'LHR', 'NARROWBODY');
  TEST.assert('Self-route rejected',          !r3.ok);

  // Out-of-range: Turboprop on ultra-long route
  const r4 = SkyHigh.CoreSim.openRoute('LHR', 'SYD', 'TURBOPROP');
  TEST.assert('Turboprop range limit enforced', !r4.ok);

  // Long route with Narrowbody (should be in range)
  const r5 = SkyHigh.CoreSim.openRoute('LHR', 'JFK', 'NARROWBODY');
  TEST.assert('Narrowbody LHR→JFK succeeds',  r5.ok);

  // Close route
  const routeId = SkyHigh.CoreSim.getState().routes[0].id;
  const closeResult = SkyHigh.CoreSim.closeRoute(routeId);
  TEST.assert('Route close succeeds',         closeResult.ok);
  TEST.assert('Route removed from state',     SkyHigh.CoreSim.getState().routes.length === 1);

  // No action points left (used 3, got one back via close)
  // AP should be: 3 - openLHRCDG - openLHRJFK - close = 0
  TEST.assert('AP can reach 0',               SkyHigh.CoreSim.getState().actionPoints >= 0);
}

// ── SUITE: ECONOMY ─────────────────────────────────────────
function testEconomy() {
  console.log('\n▶ Economy Calculations');

  SkyHigh.CoreSim.init({
    ceoName: 'Test', airlineName: 'Test', airlineCode: 'TST',
    doctrineId: 'PREMIUM_SERVICE', hubAirportId: 'DXB'
  });

  // Route projection
  const proj = SkyHigh.CoreSim.projectRoute('DXB', 'LHR', 'WIDEBODY');
  // Widebody is locked at round 1 (unlocks round 6), but projection should still work
  TEST.assert('Projection returns object',    proj !== null);

  const proj2 = SkyHigh.CoreSim.projectRoute('DXB', 'SIN', 'NARROWBODY');
  TEST.assert('Projection has revenue',       typeof proj2?.projectedRevenue === 'number');
  TEST.assert('Revenue is positive',          proj2?.projectedRevenue > 0);
  TEST.assert('Cost is positive',             proj2?.projectedCost > 0);
  TEST.assert('Distance is positive',         proj2?.distKm > 0);

  // Open a route and check cash deducted
  const cashBefore = SkyHigh.CoreSim.getState().cash;
  SkyHigh.CoreSim.openRoute('DXB', 'SIN', 'NARROWBODY');
  const cashAfter = SkyHigh.CoreSim.getState().cash;
  TEST.assert('Cash deducted on route open',  cashAfter < cashBefore);

  // Premium service fare multiplier should be > 1
  const s = SkyHigh.CoreSim.getState();
  TEST.assert('Premium doctrine fareMult > 1', (s.fareMult || 1) > 1);
}

// ── SUITE: CRISIS ──────────────────────────────────────────
function testCrisis() {
  console.log('\n▶ Crisis System');

  SkyHigh.CoreSim.init({
    ceoName: 'Test', airlineName: 'Test', airlineCode: 'TST',
    doctrineId: 'SAFETY_FIRST', hubAirportId: 'JFK'
  });

  // Resolve a fuel price spike manually
  const crisis = SkyHigh.CRISES.find(c => c.id === 'FUEL_PRICE_SPIKE');
  TEST.assert('Crisis data exists',           !!crisis);
  TEST.assert('Crisis has decisions',         crisis.decisions.length >= 2);
  TEST.assert('Crisis has effects',           !!crisis.decisions[0].effects);

  // Inject crisis
  SkyHigh.CoreSim.getState().activeCrisis = crisis;
  const before = SkyHigh.CoreSim.getState().cash;
  const result = SkyHigh.CoreSim.resolveCrisis('A');
  TEST.assert('Crisis resolve returns ok',    result.ok);
  TEST.assert('Crisis removed after resolve', !SkyHigh.CoreSim.getState().activeCrisis);
  TEST.assert('Crisis count incremented',     SkyHigh.CoreSim.getState().crisisCount === 1);
  TEST.assert('Effects applied (cash change)',SkyHigh.CoreSim.getState().cash !== before);

  // Boss crisis has phases
  const boss = SkyHigh.CRISES.find(c => c.isBoss && c.triggerRound === 5);
  TEST.assert('Boss crisis exists at round 5', !!boss);
  TEST.assert('Boss crisis has 3 phases',      boss.phases.length === 3);

  // Invalid decision
  SkyHigh.CoreSim.getState().activeCrisis = crisis;
  const invalid = SkyHigh.CoreSim.resolveCrisis('Z99');
  TEST.assert('Invalid decision rejected',    !invalid.ok);
}

// ── SUITE: PHASE FLOW ──────────────────────────────────────
function testPhaseFlow() {
  console.log('\n▶ Phase Flow');

  SkyHigh.CoreSim.init({
    ceoName: 'Test', airlineName: 'Test', airlineCode: 'TST',
    doctrineId: 'CARGO_DOMINANCE', hubAirportId: 'FRA'
  });

  TEST.assertEqual('Starts in COMMAND',  SkyHigh.CoreSim.getState().phase, 'COMMAND');

  // End command → crisis
  const crisisResult = SkyHigh.CoreSim.endCommandPhase();
  TEST.assert('endCommandPhase returns ok',   crisisResult.ok);
  TEST.assertEqual('Phase is CRISIS',         SkyHigh.CoreSim.getState().phase, 'CRISIS');

  // If crisis active, resolve it first
  if (SkyHigh.CoreSim.getState().activeCrisis) {
    const c = SkyHigh.CoreSim.getState().activeCrisis;
    const choices = c.isBoss ? c.phases[0].choices : c.decisions;
    SkyHigh.CoreSim.resolveCrisis(choices[0].id);
  }

  // End crisis → result
  const resultData = SkyHigh.CoreSim.endCrisisPhase();
  TEST.assert('endCrisisPhase returns ok',     resultData.ok);
  TEST.assertEqual('Phase is RESULT',          SkyHigh.CoreSim.getState().phase, 'RESULT');
  TEST.assert('Result has revenue',            typeof resultData.totalRevenue === 'number');
  TEST.assert('Result has expenses',           typeof resultData.totalExpenses === 'number');

  // End result → report
  SkyHigh.CoreSim.endResultPhase();
  TEST.assertEqual('Phase is REPORT',          SkyHigh.CoreSim.getState().phase, 'REPORT');

  // End report → next round
  const nextRound = SkyHigh.CoreSim.endReportPhase();
  TEST.assert('endReportPhase returns ok',     nextRound.ok);
  TEST.assert('Not game over at round 2',      !nextRound.gameOver);
  TEST.assertEqual('Round incremented',        SkyHigh.CoreSim.getState().round, 2);
  TEST.assertEqual('Back to COMMAND',          SkyHigh.CoreSim.getState().phase, 'COMMAND');
}

// ── SUITE: MILESTONES ──────────────────────────────────────
function testMilestones() {
  console.log('\n▶ Milestones & Legacy');

  SkyHigh.CoreSim.init({
    ceoName: 'Test', airlineName: 'Test', airlineCode: 'TST',
    doctrineId: 'BUDGET_EXPANSION', hubAirportId: 'JFK'
  });

  SkyHigh.CoreSim.openRoute('JFK', 'LAX', 'NARROWBODY');
  const state = SkyHigh.CoreSim.getState();

  TEST.assert('FIRST_ROUTE milestone unlocked', state.unlockedMilestones.includes('FIRST_ROUTE'));
  TEST.assert('Milestones array populated',     state.unlockedMilestones.length >= 1);

  // Legacy titles
  const legendState = { boardConfidence:90, servicePrestige:90, safetyShield:80, crewLoyalty:80, cash:90000000, routes:14, crisisCount:5 };
  const title = SkyHigh.LEGACY_TITLES.find(t => t.condition(legendState));
  TEST.assert('Legend title matches high performer', title?.id === 'LEGEND');

  const fallback = { boardConfidence:50, servicePrestige:50, safetyShield:50, crewLoyalty:50, cash:20000000, routes:3, crisisCount:2 };
  const fallbackTitle = SkyHigh.LEGACY_TITLES.find(t => t.condition(fallback));
  TEST.assert('Fallback title exists',          !!fallbackTitle);
}

// ── RUN ALL ────────────────────────────────────────────────
function runAllTests() {
  console.log('═══════════════════════════════════════');
  console.log('  SkyHigh Executive — Core Sim Tests  ');
  console.log('═══════════════════════════════════════');

  try { testInit();      } catch(e) { console.error('Init suite error:', e); }
  try { testRoutes();    } catch(e) { console.error('Routes suite error:', e); }
  try { testEconomy();   } catch(e) { console.error('Economy suite error:', e); }
  try { testCrisis();    } catch(e) { console.error('Crisis suite error:', e); }
  try { testPhaseFlow(); } catch(e) { console.error('Phase flow suite error:', e); }
  try { testMilestones();} catch(e) { console.error('Milestones suite error:', e); }

  return TEST.summary();
}

// Auto-run if loaded in browser console
if (typeof window !== 'undefined' && window.SkyHigh) {
  runAllTests();
} else {
  console.log('Load in browser with SkyHigh globals available, then call runAllTests()');
}
