// ============================================================
// SkyHigh Executive — Map Engine
// Camera state, geo transforms, hit-testing, interaction.
// UI-agnostic: no DOM access. Works with any renderer.
// ============================================================
window.SkyHigh = window.SkyHigh || {};

window.SkyHigh.MapEngine = (() => {
  'use strict';

  // ── CAMERA ──────────────────────────────────────────────────
  // mapX/mapY: pan offset in map-space [0,1] normalized
  // zoom: 1.0 = global view
  const camera = {
    x: 0.5,     // map-space center X (0=left, 1=right)
    y: 0.45,    // map-space center Y (0=top, 1=bottom)
    zoom: 1.0,  // 1.0 = full globe visible
    targetX: 0.5,
    targetY: 0.45,
    targetZoom: 1.0,
    animating: false,
  };

  // Zoom level thresholds
  const ZOOM_LEVELS = { L1: 1.0, L2: 2.5, L3: 5.0, MAX: 8.0, MIN: 0.8 };

  // ── SELECTION STATE ────────────────────────────────────────
  const selection = {
    hoveredAirport:  null,
    hoveredCountry:  null,
    selectedCountry: null,
    originAirport:   null,
    destAirport:     null,
  };

  // ── CANVAS SIZE (set by renderer) ─────────────────────────
  let canvasW = 1200, canvasH = 680;
  let _onSelect = null;         // callback (event, data)
  let _countryResolver = null;  // set by Renderer after init

  // ── ANIMATION CLOCK ────────────────────────────────────────
  const LERP_SPEED = 0.12;

  // ── PUBLIC API ─────────────────────────────────────────────
  const API = {

    // Set canvas dimensions (called when canvas resizes)
    setDimensions(w, h) { canvasW = w; canvasH = h; },

    onSelect(fn) { _onSelect = fn; },

    // Set by Renderer after init — enables polygon hit testing
    setCountryResolver(fn) { _countryResolver = fn; },

    getCamera() { return { ...camera }; },

    getSelection() { return { ...selection }; },

    getZoomLevel() {
      if (camera.zoom < ZOOM_LEVELS.L2) return 'L1';
      if (camera.zoom < ZOOM_LEVELS.L3) return 'L2';
      return 'L3';
    },

    // ── PROJECTION ──────────────────────────────────────────
    // Convert lat/lon → canvas pixel coordinates
    project(lat, lon) {
      // Mercator projection
      const mapX = (lon + 180) / 360;
      const latRad = lat * Math.PI / 180;
      const sinLat = Math.sin(latRad);
      const mapY = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);

      return {
        x: (mapX - camera.x) * canvasW * camera.zoom + canvasW / 2,
        y: (mapY - camera.y) * canvasH * camera.zoom + canvasH / 2,
      };
    },

    // Convert canvas pixel → lat/lon
    unproject(px, py) {
      const mapX = (px - canvasW / 2) / (canvasW * camera.zoom) + camera.x;
      const mapY = (py - canvasH / 2) / (canvasH * camera.zoom) + camera.y;

      const lon = mapX * 360 - 180;
      const n   = Math.PI - 2 * Math.PI * mapY;
      const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));

      return { lat, lon };
    },

    // Scale factor: how large is 1 degree in pixels
    degreeToPixels() {
      return (canvasW * camera.zoom) / 360;
    },

    // Airport marker size based on zoom and hub level
    markerSize(hubLevel) {
      const base = 3 + hubLevel * 1.2;
      const zoom = camera.zoom;
      if (zoom < 1.5) return base * 0.8;
      if (zoom < 3)   return base * 1.2;
      return base * 1.8;
    },

    // ── TICK (call every frame) ─────────────────────────────
    tick() {
      let dirty = false;
      if (Math.abs(camera.x - camera.targetX) > 0.0001) {
        camera.x += (camera.targetX - camera.x) * LERP_SPEED;
        dirty = true;
      }
      if (Math.abs(camera.y - camera.targetY) > 0.0001) {
        camera.y += (camera.targetY - camera.y) * LERP_SPEED;
        dirty = true;
      }
      if (Math.abs(camera.zoom - camera.targetZoom) > 0.001) {
        camera.zoom += (camera.targetZoom - camera.zoom) * LERP_SPEED;
        dirty = true;
      } else if (camera.animating) {
        camera.animating = false;
      }
      return dirty;
    },

    // ── PAN ────────────────────────────────────────────────
    pan(dx, dy) {
      // dx, dy in screen pixels → convert to map-space
      camera.targetX -= dx / (canvasW * camera.zoom);
      camera.targetY -= dy / (canvasH * camera.zoom);
      // Clamp Y (don't scroll past poles)
      camera.targetY = Math.max(0.05, Math.min(0.95, camera.targetY));
    },

    // ── ZOOM ───────────────────────────────────────────────
    zoomAt(factor, cx, cy) {
      // Zoom toward cursor position
      const newZoom = Math.max(ZOOM_LEVELS.MIN, Math.min(ZOOM_LEVELS.MAX, camera.zoom * factor));
      if (newZoom === camera.zoom) return;

      // Keep the point under cursor stationary
      const mapX = (cx - canvasW / 2) / (canvasW * camera.zoom) + camera.x;
      const mapY = (cy - canvasH / 2) / (canvasH * camera.zoom) + camera.y;

      camera.targetZoom = newZoom;
      camera.targetX = mapX - (cx - canvasW / 2) / (canvasW * newZoom);
      camera.targetY = mapY - (cy - canvasH / 2) / (canvasH * newZoom);
      camera.targetY = Math.max(0.05, Math.min(0.95, camera.targetY));
      camera.animating = true;
    },

    // Jump camera to lat/lon with zoom
    flyTo(lat, lon, targetZoom) {
      const latRad = lat * Math.PI / 180;
      const sinLat = Math.sin(latRad);
      camera.targetX = (lon + 180) / 360;
      camera.targetY = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
      camera.targetZoom = targetZoom || 4.0;
      camera.animating = true;
    },

    // Reset to global view
    resetView() {
      camera.targetX    = 0.5;
      camera.targetY    = 0.45;
      camera.targetZoom = 1.0;
      camera.animating  = true;
    },

    // ── HIT TESTING ────────────────────────────────────────
    // Returns the nearest airport to screen point (px, py) within hitRadius pixels
    getAirportAt(px, py, hitRadius) {
      const radius = hitRadius ?? Math.max(14, 20 / camera.zoom);
      let nearest = null;
      let minDist = Infinity;

      SkyHigh.MAP_DATA.airports.forEach(airport => {
        // Cluster small airports at low zoom
        if (camera.zoom < 1.5 && airport.hubLevel < 3) return;
        if (camera.zoom < 2.5 && airport.hubLevel < 2) return;

        const pos = API.project(airport.lat, airport.lon);
        const dist = Math.hypot(pos.x - px, pos.y - py);
        if (dist < radius && dist < minDist) {
          minDist = dist;
          nearest = airport;
        }
      });

      return nearest;
    },

    // Returns country at screen point using polygon hit testing
    getCountryAt(px, py) {
      if (!_countryResolver) return null;
      const cf = _countryResolver(px, py); // returns countryFeature from Renderer
      if (!cf) return null;
      return { iso: cf.iso, ...cf.info }; // {iso, name, region, risk, tier, emoji}
    },

    // Returns cached country info by ISO for a known airport
    _countryFromAirport(airport) {
      if (!airport?.countryIso) return null;
      const iso  = airport.countryIso;
      const info = SkyHigh.WORLD_COUNTRIES?.[iso] ||
                   { name: `Country #${iso}`, region: 'Unknown', risk: 'MEDIUM', tier: 'MEDIUM', emoji: '🌍' };
      return { iso, ...info };
    },

    // ── INTERACTION HANDLERS ───────────────────────────────
    handlePointerMove(px, py) {
      const airport = API.getAirportAt(px, py);
      const country = airport ? API._countryFromAirport(airport) : API.getCountryAt(px, py);

      let changed = false;
      if (airport?.id !== selection.hoveredAirport?.id) {
        selection.hoveredAirport = airport || null;
        changed = true;
      }
      if (country?.iso !== selection.hoveredCountry?.iso) {
        selection.hoveredCountry = country || null;
        changed = true;
      }
      return changed;
    },

    handleClick(px, py) {
      const airport = API.getAirportAt(px, py);
      if (airport) {
        selection.selectedCountry = API._countryFromAirport(airport);
        if (_onSelect) _onSelect('AIRPORT', airport);
        return { type: 'AIRPORT', data: airport };
      }

      const country = API.getCountryAt(px, py);
      if (country) {
        selection.selectedCountry = country;
        // Pass click coordinates so overlay can be positioned
        if (_onSelect) _onSelect('COUNTRY', { ...country, clickPx: px, clickPy: py });
        return { type: 'COUNTRY', data: country };
      }

      // Click void — deselect
      selection.selectedCountry = null;
      if (_onSelect) _onSelect('DESELECT', null);
      return { type: 'DESELECT' };
    },

    // ── ROUTE SELECTION FLOW ───────────────────────────────
    setOriginAirport(airportId) {
      const airport = SkyHigh.GeoUtils.getAirport(airportId);
      if (!airport) return false;
      selection.originAirport = airport;
      selection.destAirport   = null;
      return true;
    },

    setDestAirport(airportId) {
      const airport = SkyHigh.GeoUtils.getAirport(airportId);
      if (!airport) return false;
      if (selection.originAirport?.id === airportId) return false; // same as origin
      selection.destAirport = airport;
      return true;
    },

    clearRoute() {
      selection.originAirport = null;
      selection.destAirport   = null;
    },

    hasPendingRoute() {
      return !!(selection.originAirport && selection.destAirport);
    },

    // ── ARC GEOMETRY ───────────────────────────────────────
    // Returns bezier control point for a great-circle arc approximation
    getArcPoints(lat1, lon1, lat2, lon2) {
      const p1 = API.project(lat1, lon1);
      const p2 = API.project(lat2, lon2);

      // Great-circle midpoint
      const midLat = (lat1 + lat2) / 2;
      const midLon = (lon1 + lon2) / 2;

      // Arc height proportional to distance
      const distKm = SkyHigh.GeoUtils.distance(lat1, lon1, lat2, lon2);
      const arcHeightFactor = Math.min(0.4, distKm / 25000);

      // Control point lifted above the midpoint
      const pm = API.project(midLat, midLon);
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const len = Math.hypot(dx, dy);
      // Perpendicular to line, toward north
      const cpx = pm.x - (dy / len) * len * arcHeightFactor;
      const cpy = pm.y - Math.abs(dy / len - 1) * len * arcHeightFactor - len * arcHeightFactor * 0.5;

      return { p1, p2, cp: { x: cpx, y: cpy } };
    },

    // ── CRISIS HIGHLIGHT REGIONS ───────────────────────────
    // Returns screen bounding box for a region
    getRegionBounds(regionName) {
      const airports = SkyHigh.MAP_DATA.airports.filter(a => {
        const info = SkyHigh.WORLD_COUNTRIES?.[a.countryIso];
        return info && info.region.includes(regionName);
      });
      if (!airports.length) return null;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      airports.forEach(a => {
        const pos = API.project(a.lat, a.lon);
        minX = Math.min(minX, pos.x); minY = Math.min(minY, pos.y);
        maxX = Math.max(maxX, pos.x); maxY = Math.max(maxY, pos.y);
      });
      return { x: minX - 20, y: minY - 20, w: maxX - minX + 40, h: maxY - minY + 40 };
    },
  };

  return API;
})();
