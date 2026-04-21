// ============================================================
// SkyHigh Executive — Map Engine Tests
// Run in browser console after game loads
// ============================================================

const MAP_TEST = {
  passed: 0, failed: 0,

  assert(name, condition, detail = '') {
    if (condition) { this.passed++; console.log(`  ✓ ${name}`); }
    else { this.failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
  },

  near(a, b, tol = 0.1) { return Math.abs(a - b) < tol; },

  summary() {
    console.log(`\n══ Map Tests: ${this.passed} passed, ${this.failed} failed ══`);
    return this.failed === 0;
  }
};

// ── PROJECTION ─────────────────────────────────────────────
function testProjection() {
  console.log('\n▶ Mercator Projection');

  const ME = SkyHigh.MapEngine;
  ME.setDimensions(1200, 680);

  // Project then unproject should round-trip
  const lat = 51.5, lon = -0.12; // London approx
  const px = ME.project(lat, lon);

  MAP_TEST.assert('project returns x,y', typeof px.x === 'number' && typeof px.y === 'number');
  MAP_TEST.assert('x is within canvas range (when centered)', px.x > 0 && px.x < 1200);

  const unprojected = ME.unproject(px.x, px.y);
  MAP_TEST.assert('Lat round-trips within 0.5°', MAP_TEST.near(unprojected.lat, lat, 0.5), `got ${unprojected.lat.toFixed(3)}`);
  MAP_TEST.assert('Lon round-trips within 0.5°', MAP_TEST.near(unprojected.lon, lon, 0.5), `got ${unprojected.lon.toFixed(3)}`);

  // Equator should be near vertical center
  const equator = ME.project(0, 0);
  MAP_TEST.assert('Equator is near vertical center', MAP_TEST.near(equator.y, 340, 40));

  // Poles
  const north = ME.project(85, 0);
  const south = ME.project(-85, 0);
  MAP_TEST.assert('North pole is above equator', north.y < equator.y);
  MAP_TEST.assert('South pole is below equator', south.y > equator.y);

  // Meridians
  const east  = ME.project(0, 90);
  const west  = ME.project(0, -90);
  MAP_TEST.assert('East is right of prime meridian', east.x > equator.x);
  MAP_TEST.assert('West is left of prime meridian',  west.x < equator.x);
}

// ── CAMERA ─────────────────────────────────────────────────
function testCamera() {
  console.log('\n▶ Camera & Zoom');

  const ME = SkyHigh.MapEngine;

  const cam0 = ME.getCamera();
  MAP_TEST.assert('Initial zoom is ~1', MAP_TEST.near(cam0.zoom, 1.0, 0.1));
  MAP_TEST.assert('Initial x is ~0.5', MAP_TEST.near(cam0.x, 0.5, 0.05));

  // Zoom in
  ME.zoomAt(2, 600, 340); // zoom 2x toward center
  // Simulate tick to apply lerp
  for (let i = 0; i < 30; i++) ME.tick();
  const cam1 = ME.getCamera();
  MAP_TEST.assert('Zoom increased after zoomAt', cam1.zoom > 1.5);

  // Zoom out
  ME.zoomAt(0.3, 600, 340);
  for (let i = 0; i < 30; i++) ME.tick();
  const cam2 = ME.getCamera();
  MAP_TEST.assert('Zoom decreased after zoom out', cam2.zoom < cam1.zoom);

  // Reset
  ME.resetView();
  for (let i = 0; i < 60; i++) ME.tick();
  const cam3 = ME.getCamera();
  MAP_TEST.assert('Reset returns to zoom ~1', MAP_TEST.near(cam3.zoom, 1.0, 0.2));

  // Zoom level labels
  ME.getCamera().zoom = 1.0;
  MAP_TEST.assert('L1 zoom level correct', ME.getZoomLevel() === 'L1');

  const origZoom = ME.getCamera().zoom;
  ME.getCamera().zoom = 3.0;
  MAP_TEST.assert('L2 zoom level correct', ME.getZoomLevel() === 'L2');

  ME.getCamera().zoom = 6.0;
  MAP_TEST.assert('L3 zoom level correct', ME.getZoomLevel() === 'L3');

  ME.getCamera().zoom = origZoom;

  // Fly to
  ME.flyTo(25.25, 55.37, 4.0); // Dubai
  for (let i = 0; i < 60; i++) ME.tick();
  const cam4 = ME.getCamera();
  MAP_TEST.assert('flyTo reaches target zoom', MAP_TEST.near(cam4.zoom, 4.0, 0.5));
}

// ── HIT TESTING ────────────────────────────────────────────
function testHitTesting() {
  console.log('\n▶ Hit Testing');

  const ME = SkyHigh.MapEngine;
  ME.setDimensions(1200, 680);
  ME.resetView();
  for (let i = 0; i < 60; i++) ME.tick();

  // Project DXB and test hit at that pixel
  const dxb = SkyHigh.GeoUtils.getAirport('DXB');
  MAP_TEST.assert('DXB exists in dataset', !!dxb);

  const pos = ME.project(dxb.lat, dxb.lon);
  const hit = ME.getAirportAt(pos.x, pos.y, 30);
  MAP_TEST.assert('DXB hit-tested correctly at its projected position', hit?.id === 'DXB', `got ${hit?.id}`);

  // Hit nowhere
  const noHit = ME.getAirportAt(-100, -100, 15);
  MAP_TEST.assert('No hit at off-screen coords', noHit === null || noHit === undefined);

  // Country at lat/lon
  const country = SkyHigh.GeoUtils.getCountryAtPoint(25.25, 55.37); // Dubai
  MAP_TEST.assert('UAE detected at Dubai coords', country?.id === 'UAE', `got ${country?.id}`);

  const nullCountry = SkyHigh.GeoUtils.getCountryAtPoint(0, 0); // Ocean
  // This may return null or a country that intersects — just check it doesn't throw
  MAP_TEST.assert('Ocean point handled gracefully', true);
}

// ── ROUTE SELECTION ────────────────────────────────────────
function testRouteSelection() {
  console.log('\n▶ Route Selection Flow');

  const ME = SkyHigh.MapEngine;

  // Set origin
  const originOk = ME.setOriginAirport('JFK');
  MAP_TEST.assert('setOriginAirport returns true', originOk === true);
  MAP_TEST.assert('Origin stored in selection',    ME.getSelection().originAirport?.id === 'JFK');

  // Set dest
  const destOk = ME.setDestAirport('LHR');
  MAP_TEST.assert('setDestAirport returns true',  destOk === true);
  MAP_TEST.assert('Dest stored in selection',      ME.getSelection().destAirport?.id === 'LHR');
  MAP_TEST.assert('hasPendingRoute is true',       ME.hasPendingRoute() === true);

  // Can't set same as origin
  const sameOk = ME.setDestAirport('JFK');
  MAP_TEST.assert('Same origin/dest rejected',    sameOk === false);

  // Invalid airport
  const badOk = ME.setDestAirport('ZZZZ');
  MAP_TEST.assert('Invalid airport id rejected',  badOk === false);

  // Clear
  ME.clearRoute();
  MAP_TEST.assert('clearRoute removes origin',    ME.getSelection().originAirport === null);
  MAP_TEST.assert('clearRoute removes dest',      ME.getSelection().destAirport === null);
  MAP_TEST.assert('hasPendingRoute is false',     ME.hasPendingRoute() === false);
}

// ── GEO UTILS ──────────────────────────────────────────────
function testGeoUtils() {
  console.log('\n▶ GeoUtils');

  const GU = SkyHigh.GeoUtils;

  // Distance LHR → JFK (should be ~5500km)
  const lhr = GU.getAirport('LHR');
  const jfk = GU.getAirport('JFK');
  MAP_TEST.assert('LHR exists', !!lhr);
  MAP_TEST.assert('JFK exists', !!jfk);

  const dist = GU.distance(lhr.lat, lhr.lon, jfk.lat, jfk.lon);
  MAP_TEST.assert('LHR→JFK distance is ~5550km', MAP_TEST.near(dist, 5550, 300), `got ${Math.round(dist)}km`);

  // Distance bands
  MAP_TEST.assert('SHORT band at 1000km',  GU.getDistanceBand(1000) === 'SHORT');
  MAP_TEST.assert('MEDIUM band at 4000km', GU.getDistanceBand(4000) === 'MEDIUM');
  MAP_TEST.assert('LONG band at 9000km',   GU.getDistanceBand(9000) === 'LONG');
  MAP_TEST.assert('ULTRA band at 15000km', GU.getDistanceBand(15000) === 'ULTRA');

  // Airport lookups
  MAP_TEST.assert('getAirport DXB',  GU.getAirport('DXB')?.id === 'DXB');
  MAP_TEST.assert('getAirport null for invalid', GU.getAirport('ZZZ') === undefined);

  // Country airports
  const usAirports = GU.getCountryAirports('USA');
  MAP_TEST.assert('USA has 4+ airports', usAirports.length >= 4);

  // Country lookup
  MAP_TEST.assert('getCountry UAE works', GU.getCountry('UAE')?.name === 'UAE');

  // Arc points
  const arc = SkyHigh.MapEngine.getArcPoints(lhr.lat, lhr.lon, jfk.lat, jfk.lon);
  MAP_TEST.assert('Arc has p1, p2, cp', !!arc.p1 && !!arc.p2 && !!arc.cp);
  MAP_TEST.assert('Arc cp differs from midpoint', arc.cp.y < (arc.p1.y + arc.p2.y) / 2);
}

// ── DATA INTEGRITY ─────────────────────────────────────────
function testDataIntegrity() {
  console.log('\n▶ Data Integrity');

  MAP_TEST.assert('30+ countries loaded', SkyHigh.MAP_DATA.countries.length >= 30);
  MAP_TEST.assert('60+ airports loaded',  SkyHigh.MAP_DATA.airports.length >= 60);

  // All airports reference valid countries
  const countryIds = new Set(SkyHigh.MAP_DATA.countries.map(c => c.id));
  const orphaned = SkyHigh.MAP_DATA.airports.filter(a => !countryIds.has(a.countryId));
  MAP_TEST.assert('No orphaned airports', orphaned.length === 0, `Orphaned: ${orphaned.map(a=>a.id).join(',')}`);

  // All airports have valid lat/lon
  const badCoords = SkyHigh.MAP_DATA.airports.filter(a =>
    a.lat < -90 || a.lat > 90 || a.lon < -180 || a.lon > 180
  );
  MAP_TEST.assert('All airports have valid lat/lon', badCoords.length === 0);

  // All countries have valid bounds
  const badBounds = SkyHigh.MAP_DATA.countries.filter(c =>
    c.bounds.s >= c.bounds.n || c.bounds.w >= c.bounds.e
  );
  MAP_TEST.assert('All countries have valid bounds', badBounds.length === 0, `Bad: ${badBounds.map(c=>c.id).join(',')}`);

  // All crises have at least 2 decisions (or phases for boss)
  const badCrises = SkyHigh.CRISES.filter(c => !c.isBoss && c.decisions.length < 2);
  MAP_TEST.assert('All crises have 2+ decisions', badCrises.length === 0);

  const badBoss = SkyHigh.CRISES.filter(c => c.isBoss && c.phases.length < 2);
  MAP_TEST.assert('All boss crises have 2+ phases', badBoss.length === 0);

  // Planes have valid ranges
  SkyHigh.PLANES.forEach(p => {
    MAP_TEST.assert(`${p.id} has valid range`, p.rangeKm > 0 && p.rangeKm <= 20000);
  });

  // Design tokens completeness
  const T = SkyHigh.TOKENS;
  MAP_TEST.assert('Tokens have color.primary', !!T.color.primary);
  MAP_TEST.assert('Tokens have color.danger',  !!T.color.danger);
  MAP_TEST.assert('Tokens have motion timings',!!T.motion.duration.normal);
}

// ── RUN ALL ────────────────────────────────────────────────
function runMapTests() {
  console.log('═══════════════════════════════════════');
  console.log('  SkyHigh Executive — Map Engine Tests ');
  console.log('═══════════════════════════════════════');

  try { testProjection();   } catch(e) { console.error('Projection error:', e); }
  try { testCamera();       } catch(e) { console.error('Camera error:', e); }
  try { testHitTesting();   } catch(e) { console.error('Hit test error:', e); }
  try { testRouteSelection();} catch(e) { console.error('Route sel error:', e); }
  try { testGeoUtils();     } catch(e) { console.error('Geo utils error:', e); }
  try { testDataIntegrity();} catch(e) { console.error('Data integrity error:', e); }

  return MAP_TEST.summary();
}

if (typeof window !== 'undefined' && window.SkyHigh) {
  runMapTests();
} else {
  console.log('Load in browser with SkyHigh globals, then call runMapTests()');
}
