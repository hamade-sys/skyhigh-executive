// ============================================================
// SkyHigh Executive — Canvas Renderer
// Web adapter: renders map + overlays to HTML5 Canvas.
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.Renderer = (() => {
  'use strict';

  let canvas, ctx;
  let worldData = null;
  let countryFeatures = []; // [{iso, name, info, feature, path: Path2D}]
  let animFrame = null;
  let t = 0;
  let camDirty = true;
  let homeCountryIso = null; // set from ui.js after game start

  const floatingDeltas = [];
  let crisisMode = false;
  let crisisIntensity = 0;

  const API = {

    async init(canvasEl) {
      canvas = canvasEl;
      ctx = canvas.getContext('2d');
      API.resize();
      window.addEventListener('resize', API.resize);

      try {
        const resp = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json');
        const topo = await resp.json();
        worldData = topo;
        API._buildCountryFeatures(topo);
      } catch(e) {
        console.warn('Could not load world atlas.', e);
      }

      API.startLoop();
    },

    resize() {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      SkyHigh.MapEngine.setDimensions(canvas.width, canvas.height);
      camDirty = true;
    },

    setHomeCountry(iso) {
      homeCountryIso = iso ? parseInt(iso) : null;
    },

    startLoop() {
      function loop() {
        const dirty = SkyHigh.MapEngine.tick();
        if (dirty) camDirty = true;
        if (camDirty && countryFeatures.length) {
          API._rebuildPaths();
          camDirty = false;
        }
        API.draw();
        t++;
        animFrame = requestAnimationFrame(loop);
      }
      loop();
    },

    stopLoop() {
      if (animFrame) cancelAnimationFrame(animFrame);
    },

    // ── POLYGON HIT TEST (pixel-perfect country detection) ───
    getCountryAtPoint(px, py) {
      if (!countryFeatures.length) return null;
      for (let i = countryFeatures.length - 1; i >= 0; i--) {
        const cf = countryFeatures[i];
        if (cf.path && ctx.isPointInPath(cf.path, px, py)) return cf;
      }
      return null;
    },

    spawnDelta(amount, screenX, screenY) {
      floatingDeltas.push({
        amount, x: screenX, y: screenY,
        alpha: 1, life: 90,
        dy: -(1.2 + Math.random() * 0.8),
        positive: amount >= 0,
      });
    },

    setCrisisMode(active) {
      crisisMode = active;
      if (active) crisisIntensity = 0.01;
    },

    // ── BUILD COUNTRY FEATURES FROM TOPOJSON ─────────────────
    _buildCountryFeatures(topo) {
      if (!window.topojson) return;
      const countries = topojson.feature(topo, topo.objects.countries);
      countryFeatures = countries.features
        .filter(f => parseInt(f.id) !== 10)  // exclude Antarctica
        .map(feature => {
        const iso  = parseInt(feature.id);
        const info = SkyHigh.WORLD_COUNTRIES?.[iso] ||
                     { name: `Country #${iso}`, region: 'Unknown', risk: 'MEDIUM', tier: 'MEDIUM', emoji: '🌍' };
        return { iso, name: info.name, info, feature, path: null };
      });
      API._rebuildPaths();
      camDirty = false;
    },

    _rebuildPaths() {
      if (!countryFeatures.length) return;
      const ME = SkyHigh.MapEngine;

      countryFeatures.forEach(cf => {
        const path2d = new Path2D();
        const { coordinates, type } = cf.feature.geometry;

        const drawRing = (ring) => {
          if (!ring.length) return;
          let prevLon = ring[0][0];
          const first = ME.project(ring[0][1], prevLon);
          path2d.moveTo(first.x, first.y);
          for (let i = 1; i < ring.length; i++) {
            const lon = ring[i][0];
            const lat = ring[i][1];
            // Antimeridian crossing: longitude jumps >180° → lift pen to avoid giant diagonal
            if (Math.abs(lon - prevLon) > 180) {
              const p = ME.project(lat, lon);
              path2d.moveTo(p.x, p.y);
            } else {
              const p = ME.project(lat, lon);
              path2d.lineTo(p.x, p.y);
            }
            prevLon = lon;
          }
          path2d.closePath();
        };

        if (type === 'Polygon')      coordinates.forEach(drawRing);
        else if (type === 'MultiPolygon') coordinates.forEach(poly => poly.forEach(drawRing));

        cf.path = path2d;
      });
    },

    // ── MAIN DRAW ─────────────────────────────────────────────
    draw() {
      const W = canvas.width, H = canvas.height;
      const T = SkyHigh.TOKENS.color;
      const sel   = SkyHigh.MapEngine.getSelection();
      const state = SkyHigh.CoreSim?.getState?.();

      ctx.clearRect(0, 0, W, H);

      API._drawOcean(W, H, T);

      if (countryFeatures.length) {
        API._drawCountries(W, H, T, sel, state);
      } else {
        API._drawFallbackGrid(W, H, T);
      }

      API._drawGrid(W, H, T);

      if (state) {
        API._drawNpcRoutes(T);
        API._drawRoutes(state, T, sel);
      }

      if (sel.originAirport && !sel.destAirport) API._drawPulse(sel.originAirport, T.primary, t);
      if (sel.originAirport && sel.destAirport)  API._drawPendingArc(sel.originAirport, sel.destAirport, T);

      API._drawAirports(T, sel, state);

      if (crisisMode) {
        crisisIntensity = Math.min(1, crisisIntensity + 0.02);
        API._drawCrisisOverlay(W, H, T);
      } else {
        crisisIntensity = Math.max(0, crisisIntensity - 0.03);
        if (crisisIntensity > 0) API._drawCrisisOverlay(W, H, T);
      }

      API._drawAtmosphere(W, H, T);
      API._drawFloatingDeltas(T);
    },

    // ── OCEAN ─────────────────────────────────────────────────
    _drawOcean(W, H) {
      const grad = ctx.createRadialGradient(W/2, H*0.4, 0, W/2, H/2, Math.max(W,H)*0.7);
      grad.addColorStop(0,   '#0E1E2E');
      grad.addColorStop(0.5, '#0A1520');
      grad.addColorStop(1,   '#060D14');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    },

    // ── COUNTRIES (polygon fill + outline) ───────────────────
    _drawCountries(W, H, T, sel) {
      const selectedIso = sel.selectedCountry?.iso || null;
      const hoveredIso  = sel.hoveredCountry?.iso  || null;

      countryFeatures.forEach(cf => {
        if (!cf.path) return;
        const isHome     = cf.iso === homeCountryIso;
        const isSelected = cf.iso === selectedIso;
        const isHovered  = cf.iso === hoveredIso;

        let fill = T.mapLand || '#16241A';
        if (isHome)     fill = 'rgba(200,147,58,0.10)';
        if (isHovered)  fill = 'rgba(200,147,58,0.20)';
        if (isSelected) fill = 'rgba(200,147,58,0.28)';

        ctx.fillStyle = fill;
        ctx.fill(cf.path);

        ctx.strokeStyle = isSelected ? T.primary :
                          isHovered  ? 'rgba(200,147,58,0.6)' :
                          isHome     ? 'rgba(200,147,58,0.35)' :
                          T.mapBorder || 'rgba(100,180,120,0.25)';
        ctx.lineWidth = isSelected || isHovered ? 1.5 : 0.5;
        ctx.stroke(cf.path);
      });

      // Draw selected outline on top with glow
      if (selectedIso) {
        const cf = countryFeatures.find(c => c.iso === selectedIso);
        if (cf?.path) {
          ctx.strokeStyle = T.primary;
          ctx.lineWidth = 2.5;
          ctx.shadowColor = T.primary;
          ctx.shadowBlur = 8;
          ctx.stroke(cf.path);
          ctx.shadowBlur = 0;
        }
      }
    },

    _drawFallbackGrid(W, H) {
      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let lon = -180; lon <= 180; lon += 30) {
        const { x } = SkyHigh.MapEngine.project(90, lon);
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      }
    },

    // ── GRID ──────────────────────────────────────────────────
    _drawGrid(W, H, T) {
      ctx.strokeStyle = T.mapGrid || 'rgba(255,255,255,0.04)';
      ctx.lineWidth = 0.5;
      const zoom = SkyHigh.MapEngine.getCamera().zoom;
      const step = zoom > 3 ? 10 : zoom > 1.5 ? 20 : 30;

      for (let lon = -180; lon <= 180; lon += step) {
        const p1 = SkyHigh.MapEngine.project(85, lon);
        const p2 = SkyHigh.MapEngine.project(-85, lon);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }
      for (let lat = -80; lat <= 80; lat += step) {
        const p1 = SkyHigh.MapEngine.project(lat, -180);
        const p2 = SkyHigh.MapEngine.project(lat, 180);
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      const eq1 = SkyHigh.MapEngine.project(0, -180);
      const eq2 = SkyHigh.MapEngine.project(0, 180);
      ctx.beginPath(); ctx.moveTo(eq1.x, eq1.y); ctx.lineTo(eq2.x, eq2.y); ctx.stroke();
    },

    // ── NPC BACKGROUND ROUTES (world traffic feel) ───────────
    _drawNpcRoutes(T) {
      if (!SkyHigh.MAP_DATA?.npcRoutes) return;

      SkyHigh.MAP_DATA.npcRoutes.forEach(([originId, destId], idx) => {
        const origin = SkyHigh.GeoUtils.getAirport(originId);
        const dest   = SkyHigh.GeoUtils.getAirport(destId);
        if (!origin || !dest) return;

        const arc = SkyHigh.MapEngine.getArcPoints(origin.lat, origin.lon, dest.lat, dest.lon);

        ctx.beginPath();
        ctx.moveTo(arc.p1.x, arc.p1.y);
        ctx.quadraticCurveTo(arc.cp.x, arc.cp.y, arc.p2.x, arc.p2.y);
        ctx.strokeStyle = 'rgba(58,90,106,0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.stroke();

        // Slow dim dot staggered per route
        const tt = ((t * 0.18 + idx * 19) % 100) / 100;
        const bx = (1-tt)*(1-tt)*arc.p1.x + 2*(1-tt)*tt*arc.cp.x + tt*tt*arc.p2.x;
        const by = (1-tt)*(1-tt)*arc.p1.y + 2*(1-tt)*tt*arc.cp.y + tt*tt*arc.p2.y;
        ctx.beginPath();
        ctx.arc(bx, by, 1.5, 0, Math.PI*2);
        ctx.fillStyle = 'rgba(70,120,155,0.55)';
        ctx.fill();
      });
    },

    // ── PLAYER ROUTES (amber glow) ────────────────────────────
    _drawRoutes(state, T) {
      if (!state.routes) return;

      state.routes.forEach(route => {
        const origin = SkyHigh.GeoUtils.getAirport(route.originId);
        const dest   = SkyHigh.GeoUtils.getAirport(route.destId);
        if (!origin || !dest) return;

        const arc        = SkyHigh.MapEngine.getArcPoints(origin.lat, origin.lon, dest.lat, dest.lon);
        const profitable = route.lastProfit > 0;
        const loss       = route.lastProfit < 0;
        const tt         = ((t * 0.5) % 100) / 100;

        // Wide glow pass
        ctx.beginPath();
        ctx.moveTo(arc.p1.x, arc.p1.y);
        ctx.quadraticCurveTo(arc.cp.x, arc.cp.y, arc.p2.x, arc.p2.y);
        ctx.strokeStyle = profitable ? 'rgba(200,147,58,0.22)' :
                          loss ? 'rgba(231,76,60,0.15)' : 'rgba(90,84,72,0.2)';
        ctx.lineWidth = 8;
        if (profitable) { ctx.shadowColor = T.primary; ctx.shadowBlur = 14; }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Core line
        ctx.beginPath();
        ctx.moveTo(arc.p1.x, arc.p1.y);
        ctx.quadraticCurveTo(arc.cp.x, arc.cp.y, arc.p2.x, arc.p2.y);
        ctx.strokeStyle = profitable ? T.primary :
                          loss ? T.routeLoss : T.routeIdle;
        ctx.lineWidth = profitable ? 2.5 : 1.5;
        ctx.setLineDash([]);
        ctx.stroke();

        // Moving dot
        if (profitable || loss) {
          const bx = (1-tt)*(1-tt)*arc.p1.x + 2*(1-tt)*tt*arc.cp.x + tt*tt*arc.p2.x;
          const by = (1-tt)*(1-tt)*arc.p1.y + 2*(1-tt)*tt*arc.cp.y + tt*tt*arc.p2.y;
          ctx.beginPath();
          ctx.arc(bx, by, profitable ? 3.5 : 2, 0, Math.PI*2);
          ctx.fillStyle  = profitable ? T.accent : T.routeLoss;
          ctx.shadowColor = profitable ? T.accent : T.routeLoss;
          ctx.shadowBlur  = profitable ? 10 : 4;
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      });

      ctx.setLineDash([]);
    },

    // ── PENDING ARC ───────────────────────────────────────────
    _drawPendingArc(origin, dest, T) {
      const arc = SkyHigh.MapEngine.getArcPoints(origin.lat, origin.lon, dest.lat, dest.lon);
      const dashOffset = -(t * 0.5) % 20;

      ctx.beginPath();
      ctx.moveTo(arc.p1.x, arc.p1.y);
      ctx.quadraticCurveTo(arc.cp.x, arc.cp.y, arc.p2.x, arc.p2.y);
      ctx.strokeStyle = T.primary;
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.lineDashOffset = dashOffset;
      ctx.shadowColor = T.primary;
      ctx.shadowBlur = 10;
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.setLineDash([]);

      API._drawPulse(origin, T.primary, t);
      API._drawPulse(dest, T.accent, t + 20);
    },

    _drawPulse(airport, color, clock) {
      const pos   = SkyHigh.MapEngine.project(airport.lat, airport.lon);
      const pulse = (Math.sin(clock * 0.08) + 1) / 2;
      const r     = 8 + pulse * 8;
      const hex   = Math.round((0.6 - pulse * 0.4) * 255).toString(16).padStart(2, '0');

      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color + hex;
      ctx.lineWidth = 2;
      ctx.stroke();
    },

    // ── AIRPORT MARKERS ───────────────────────────────────────
    _drawAirports(T, sel, state) {
      const zoom = SkyHigh.MapEngine.getCamera().zoom;

      SkyHigh.MAP_DATA.airports.forEach(airport => {
        if (zoom < 1.2 && airport.hubLevel < 4) return;
        if (zoom < 2   && airport.hubLevel < 3) return;

        const pos  = SkyHigh.MapEngine.project(airport.lat, airport.lon);
        const size = SkyHigh.MapEngine.markerSize(airport.hubLevel);

        if (pos.x < -size || pos.x > canvas.width + size ||
            pos.y < -size || pos.y > canvas.height + size) return;

        const isOrigin = sel.originAirport?.id === airport.id;
        const isDest   = sel.destAirport?.id   === airport.id;
        const isHover  = sel.hoveredAirport?.id === airport.id;
        const hasRoute = state?.routes?.some(r => r.originId === airport.id || r.destId === airport.id);
        const isHub    = state?.hubAirportId === airport.id;

        const markerColor = isOrigin ? T.primary :
                            isDest   ? T.accent :
                            isHub    ? T.accent :
                            hasRoute ? T.success :
                            isHover  ? T.textPrimary : '#6A8A7A';

        if (isHover || isOrigin || isDest || isHub) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size + 6, 0, Math.PI * 2);
          ctx.fillStyle = (isOrigin || isHub) ? T.primaryGlow : T.accentSoft;
          ctx.fill();
        }

        if (airport.hubLevel >= 4) {
          ctx.save();
          ctx.translate(pos.x, pos.y);
          ctx.rotate(Math.PI / 4);
          if (isHub) { ctx.shadowColor = T.accent; ctx.shadowBlur = 12; }
          ctx.fillStyle = markerColor;
          ctx.fillRect(-size/2, -size/2, size, size);
          ctx.shadowBlur = 0;
          ctx.restore();
        } else {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size, 0, Math.PI * 2);
          ctx.fillStyle = markerColor;
          ctx.fill();
        }

        if (airport.hubLevel === 5) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, size + 3, 0, Math.PI * 2);
          ctx.strokeStyle = markerColor + '80';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        if (zoom >= 2.5 || (zoom >= 1.5 && airport.hubLevel >= 4)) {
          ctx.fillStyle = T.textPrimary;
          ctx.font = `bold ${Math.round(9 + zoom)}px ${SkyHigh.TOKENS.font.data}`;
          ctx.textAlign = 'center';
          ctx.fillText(airport.id, pos.x, pos.y - size - 5);
        } else if (zoom >= 1.0 && airport.hubLevel === 5) {
          ctx.fillStyle = T.textPrimary + 'AA';
          ctx.font = `9px ${SkyHigh.TOKENS.font.data}`;
          ctx.textAlign = 'center';
          ctx.fillText(airport.id, pos.x, pos.y - size - 4);
        }

        // ── Route count badge ─────────────────────────────────
        if (hasRoute && zoom >= 1.5) {
          const routeCount = state?.routes?.filter(r => r.originId === airport.id || r.destId === airport.id).length || 0;
          if (routeCount > 0) {
            const bx = pos.x + size + 2;
            const by = pos.y - size - 2;
            const br = 6;
            ctx.beginPath();
            ctx.arc(bx, by, br, 0, Math.PI * 2);
            ctx.fillStyle = hasRoute ? 'rgba(46,204,113,0.9)' : 'rgba(200,147,58,0.9)';
            ctx.fill();
            ctx.fillStyle = '#08080F';
            ctx.font = `bold 7px ${SkyHigh.TOKENS.font.data}`;
            ctx.textAlign = 'center';
            ctx.fillText(String(routeCount), bx, by + 2.5);
          }
        }
      });
    },

    // ── CRISIS OVERLAY ────────────────────────────────────────
    _drawCrisisOverlay(W, H, T) {
      const pulse = (Math.sin(t * 0.05) + 1) / 2;
      const grad = ctx.createRadialGradient(W/2, H/2, H*0.3, W/2, H/2, Math.max(W,H)*0.8);
      grad.addColorStop(0, 'transparent');
      grad.addColorStop(1, `rgba(192,57,43,${crisisIntensity * 0.35 + pulse * 0.1})`);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);

      const edgeW = 8 + pulse * 6;
      ctx.strokeStyle = `rgba(231,76,60,${crisisIntensity * 0.7 + pulse * 0.2})`;
      ctx.lineWidth = edgeW;
      ctx.strokeRect(edgeW/2, edgeW/2, W - edgeW, H - edgeW);

      if (crisisIntensity > 0.5) {
        const alpha = Math.min(1, (crisisIntensity - 0.5) * 2);
        ctx.fillStyle = `rgba(231,76,60,${alpha * 0.15})`;
        ctx.font = `bold 120px ${SkyHigh.TOKENS.font.display}`;
        ctx.textAlign = 'center';
        ctx.fillText('CRISIS', W/2, H/2 + 60);
      }
    },

    // ── ATMOSPHERE ────────────────────────────────────────────
    _drawAtmosphere(W, H) {
      const vig = ctx.createRadialGradient(W/2, H/2, H*0.35, W/2, H/2, Math.max(W,H)*0.65);
      vig.addColorStop(0, 'transparent');
      vig.addColorStop(1, 'rgba(6,8,15,0.55)');
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, W, H);

      const topGlow = ctx.createLinearGradient(0, 0, 0, H * 0.12);
      topGlow.addColorStop(0, 'rgba(30,100,160,0.12)');
      topGlow.addColorStop(1, 'transparent');
      ctx.fillStyle = topGlow;
      ctx.fillRect(0, 0, W, H * 0.12);
    },

    // ── FLOATING CASH DELTAS ──────────────────────────────────
    _drawFloatingDeltas(T) {
      for (let i = floatingDeltas.length - 1; i >= 0; i--) {
        const d = floatingDeltas[i];
        d.y += d.dy;
        d.life--;
        d.alpha = d.life / 90;
        if (d.life <= 0) { floatingDeltas.splice(i, 1); continue; }

        const color  = d.positive ? T.success : T.danger;
        const prefix = d.positive ? '+' : '';
        const text   = `${prefix}$${Math.abs(d.amount) >= 1e6 ?
          (d.amount/1e6).toFixed(1)+'M' : Math.abs(d.amount).toLocaleString()}`;

        ctx.globalAlpha = d.alpha;
        ctx.font = `bold 16px ${SkyHigh.TOKENS.font.data}`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.fillText(text, d.x, d.y);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    },
  };

  return API;
})();
