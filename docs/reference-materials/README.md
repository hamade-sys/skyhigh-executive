# SkyHigh Executive — Airline Strategy Tycoon

**An Ozuna Interactive Production**

Lead your airline through 20 quarters of strategic decisions, geopolitical crises, boardroom politics, and legacy-building — all played on a scrollable interactive world map.

---

## Quick Start

1. Open `index.html` in Chrome, Firefox, or Safari (internet required for map tiles and fonts)
2. Create your executive profile (CEO name, airline, doctrine, hub)
3. Use the world map to select origin → destination airports and open routes
4. Survive crises, grow your network, and build your legacy

---

## Controls

### Map Navigation
| Action | Mouse | Touch |
|--------|-------|-------|
| Pan | Click + Drag | One-finger drag |
| Zoom | Scroll wheel | Pinch |
| Select airport | Click | Tap |
| Reset view | `R` key / 🌍 button | Globe button |

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `R` | Reset map to global view |
| `Esc` | Close overlays, cancel route selection |

### Route Creation Flow
1. Click any airport on the map → "Set as Origin"
2. Click another airport → "Set as Destination"  
3. Review projected revenue/cost/profit in the route panel
4. Select plane class (Turboprop / Narrowbody / Widebody)
5. Click "Open Route" to confirm (costs 1 Action Point + opening fee)

---

## Game Loop

Each of the 20 quarters follows four phases:

```
COMMAND → CRISIS → RESULT → REPORT
```

| Phase | What happens |
|-------|-------------|
| **Command** | 3 Action Points: open/close routes, buy planes, invest in safety/crew |
| **Crisis** | Random event or stage boss (multi-phase) — make decisive choices |
| **Result** | Economy calculated, floating cash deltas on map, competency updates |
| **Report** | Narrative summary, board reaction, top route performance |

### Stage Boss Events (Rounds 5, 10, 15, 20)
Boss events are multi-phase crises with 3 sequential decisions. Each phase escalates in consequence. Bosses cannot be skipped.

---

## Competencies

| Display Name | Internal | What it governs |
|---|---|---|
| **Board Confidence** | Strategic | Board support, CEO mandate, strategic budget |
| **Safety Shield** | Risk | Crisis frequency, regulatory relationship, insurance |
| **Crew Loyalty** | People | Strike risk, service quality ceiling, HR costs |
| **Service Prestige** | Excellence | Load factor premium, fare multiplier, brand demand |

All competencies drift toward 70 each round. Invest to push them higher.

---

## Fleet

| Plane | Seats | Range | Cost | Best For |
|-------|-------|-------|------|---------|
| 🛩 ATR-72 Turboprop | 70 | 1,600km | $8M | Short regional hops |
| ✈️ A320neo Narrowbody | 165 | 6,300km | $25M | Core medium-haul network |
| 🛫 B787-9 Widebody | 296 | 14,140km | $60M | Premium long-haul (unlocks Round 6) |

---

## Doctrines

Chosen once at game start. Cannot be changed.

| Doctrine | Strength | Trade-off |
|----------|----------|-----------|
| 📈 Budget Expansion | +20% demand, build network fast | -15% fares, lower margins |
| ⭐ Premium Service | +30% fares, +15% prestige growth | -10% demand ceiling |
| 📦 Cargo Dominance | +25% cargo revenue, crisis hedging | Lower board confidence |
| 🛡 Safety First | -20% crisis frequency, +25% safety | +10% operating cost |

---

## Architecture

```
index.html              Entry point
src/
  design-tokens.js      Visual system constants
  map-data.js           37 countries, 68 airports (geo dataset)
  game-data.js          Planes, crises, milestones, doctrines, legacy titles
  core-sim.js           Game engine (UI-agnostic)
  map-engine.js         Mercator projection, camera, hit-testing
  renderer.js           Canvas 2D renderer
  ui.js                 UI controller (screens, modals, events)
  main.js               Entry point / bootstrap
styles/
  main.css              Component styles
  animations.css        Motion system
docs/
  PORTING.md            React Native + Electron/Tauri porting guide
  design-tokens.json    Design system (export-ready)
  component-specs.md    Component specifications
  motion-spec.md        Motion system specification
tests/
  test-core.js          Core sim unit tests
  test-map.js           Map engine unit tests
```

### Running Tests
Open browser console on `index.html`, then:
```javascript
// In console:
const s = document.createElement('script');
s.src = 'tests/test-core.js';
document.head.appendChild(s);
// Output: all test results with pass/fail

const s2 = document.createElement('script');
s2.src = 'tests/test-map.js';
document.head.appendChild(s2);
```

---

## External Dependencies (CDN, requires internet)

| Library | Version | Purpose |
|---------|---------|---------|
| topojson-client | 3.x | Parse world topology for country rendering |
| world-atlas | 2.x | Country outlines (countries-110m.json) |
| Google Fonts | — | Cinzel, Inter, JetBrains Mono |

---

## Extending the Game

### Add a New Crisis
In `src/game-data.js`, add to the `CRISES` array:
```javascript
{
  id: 'MY_CRISIS',
  name: 'My Custom Crisis',
  severity: 'MEDIUM',         // LOW | MEDIUM | HIGH | CATASTROPHIC
  stage: [2,3,4],             // Which stages can trigger this
  teaser: 'Short teaser text...',
  description: 'Longer description...',
  decisions: [
    { id:'A', label:'Option A', desc:'...', effects: { cash: -1000000, boardConfidence: +5 } },
    { id:'B', label:'Option B', desc:'...', effects: { crewLoyalty: -8 } },
  ],
  affectedRegions: ['Europe'],  // or null for global
  icon: '🎯',
}
```

### Add a New Airport
In `src/map-data.js`, add to the `airports` array:
```javascript
{ id:'NEW', countryId:'USA', city:'Denver', name:'Denver Intl', lat:39.86, lon:-104.67, hubLevel:3, demand:4500 },
```

### Swap the Renderer
The renderer is decoupled from the engine. Replace `src/renderer.js` with any Canvas/WebGL implementation that:
1. Calls `SkyHigh.MapEngine.project(lat, lon)` for geo→pixel conversion
2. Calls `SkyHigh.MapEngine.tick()` each frame
3. Calls `SkyHigh.MapEngine.setDimensions(w, h)` on resize

---

## Credits

**Design System:** Executive Noir + Amber Authority  
**Visual Genre:** Neo-Aviation Strategic Noir  
**Publisher:** Ozuna Interactive  
**Engine:** Custom JS game loop, Canvas 2D, Mercator projection
