# PORTING.md — SkyHigh Executive Portability Guide

## Architecture Overview

SkyHigh Executive is built with three clean layers:

```
┌─────────────────────────────────────┐
│   Platform Layer (Web/Native/Desktop)│  ← swap this
│   - Input gestures                  │
│   - Renderer (Canvas/WebGL/Native)  │
└──────────────────┬──────────────────┘
                   │  contracts
┌──────────────────▼──────────────────┐
│   Map Engine (map-engine.js)        │  ← platform-agnostic
│   - Camera state                    │
│   - Geo projection (Mercator)       │
│   - Hit testing                     │
│   - Route arc geometry              │
└──────────────────┬──────────────────┘
                   │  contracts
┌──────────────────▼──────────────────┐
│   Core Sim (core-sim.js)            │  ← fully agnostic
│   - Game state machine              │
│   - Economy calculations            │
│   - Crisis resolution               │
│   - Route management                │
└──────────────────┬──────────────────┘
                   │  pure data
┌──────────────────▼──────────────────┐
│   Game Data (map-data.js, game-data.js) │
│   - Static geo/game content         │
│   - No platform references          │
└─────────────────────────────────────┘
```

**Rule:** `core-sim.js` and `map-engine.js` must never import DOM, Canvas, or platform APIs.
The renderer and UI layer are the only files that touch platform APIs.

---

## Porting to React Native (Mobile)

### What to Reuse Unchanged
- `src/core-sim.js` — copy verbatim (no DOM refs)
- `src/map-engine.js` — copy verbatim; replace `window.SkyHigh` with module exports
- `src/map-data.js` — copy verbatim
- `src/game-data.js` — copy verbatim
- `docs/design-tokens.json` — import into a React Native StyleSheet

### What to Replace

| Web file         | React Native replacement                          |
|------------------|---------------------------------------------------|
| `renderer.js`    | `MapRendererRN.js` using `react-native-skia` or `expo-gl` |
| `ui.js`          | React components + React Navigation               |
| `styles/main.css`| `StyleSheet.create()` from design-tokens.json     |
| `styles/animations.css` | Reanimated 3 or Moti animations            |

### Gesture Layer (React Native Gesture Handler)

```javascript
// Replace map-container mouse events with:
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

const pan = Gesture.Pan()
  .onUpdate(e => MapEngine.pan(e.translationX - prevX, e.translationY - prevY));

const pinch = Gesture.Pinch()
  .onUpdate(e => MapEngine.zoomAt(e.scale, e.focalX, e.focalY));

const tap = Gesture.Tap()
  .onEnd(e => MapEngine.handleClick(e.x, e.y));
```

### Canvas Renderer (Skia)

```javascript
// MapRendererRN.js
import { Canvas, Path, Circle } from '@shopify/react-native-skia';

function MapCanvas({ state }) {
  // Same draw logic, but use Skia Path instead of ctx.beginPath()
  // MapEngine.project() works unchanged
  return (
    <Canvas style={{ flex: 1 }}>
      {/* countries, airports, routes using Skia primitives */}
    </Canvas>
  );
}
```

### Module Exports (convert from globals)

```javascript
// In each file, replace:
window.SkyHigh.CoreSim = { ... }
// With:
export const CoreSim = { ... }
// Or use a shared context via React Context / Zustand
```

### Navigation Structure (React Navigation)
```
Stack Navigator:
  - SplashScreen
  - SetupScreen
  - GameScreen (Tab Navigator)
      - MapTab (primary gameplay)
      - RoutesTab
      - FleetTab
  - EndGameScreen
```

---

## Porting to Electron / Tauri (Desktop)

### Electron

The web build works in Electron with **zero changes** since Electron uses Chromium.

```javascript
// main.js (Electron main process)
const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 1440, height: 900,
    webPreferences: { nodeIntegration: false }
  });
  win.loadFile('index.html');
});
```

**Enhancements for desktop:**
- Add native menus via `Menu` API
- Use `fs` module for save/load game state
- Use `ipcMain`/`ipcRenderer` for cross-process save dialog

### Tauri (Rust backend)

```bash
# Wrap existing web build
npm create tauri-app
# Point Tauri to existing index.html
```

In `tauri.conf.json`:
```json
{
  "build": {
    "distDir": "../",
    "devPath": "../"
  },
  "tauri": {
    "windows": [{ "width": 1440, "height": 900, "title": "SkyHigh Executive" }]
  }
}
```

**Save/Load via Tauri:**
```javascript
// Replace localStorage with Tauri fs plugin
import { writeTextFile, readTextFile } from '@tauri-apps/plugin-fs';

async function saveGame(state) {
  await writeTextFile('skyhigh-save.json', JSON.stringify(state));
}
```

---

## Preserving Geo Data & Interaction Contracts Across Platforms

### Geo Data Contract (`map-data.js`)

All platforms consume the same data shape:
```typescript
interface Airport {
  id: string;        // IATA code
  countryId: string;
  city: string;
  name: string;
  lat: number;       // -90 to 90
  lon: number;       // -180 to 180
  hubLevel: number;  // 1-5
  demand: number;    // passengers/quarter baseline
}

interface Country {
  id: string;
  name: string;
  region: string;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  tier: 'PREMIUM' | 'HIGH' | 'MEDIUM' | 'LOW';
  bounds: { s: number; n: number; w: number; e: number };
  centroid: [number, number];
}
```

### Projection Contract (`map-engine.js`)

The projection functions are pure math — no platform dependency:

```typescript
// These work identically on all platforms:
MapEngine.project(lat: number, lon: number): { x: number, y: number }
MapEngine.unproject(x: number, y: number): { lat: number, lon: number }
MapEngine.zoomAt(factor: number, cx: number, cy: number): void
MapEngine.pan(dx: number, dy: number): void
MapEngine.getAirportAt(px: number, py: number): Airport | null
```

Only `canvasW`/`canvasH` need to be updated when the renderer initialises:
```javascript
MapEngine.setDimensions(screenWidth, screenHeight);
```

### Core Sim Contract (`core-sim.js`)

```typescript
// Game state: pure serialisable object — safe for JSON save/load on any platform
CoreSim.init(profile): GameState
CoreSim.getState(): GameState
CoreSim.openRoute(origin, dest, plane): RouteResult
CoreSim.resolveCrisis(decisionId): CrisisResult
CoreSim.endCommandPhase(): PhaseResult
CoreSim.projectRoute(origin, dest, plane): RouteProjection
```

All methods are synchronous and side-effect-free (except state mutation).

---

## Save/Load State

Game state is a plain serialisable object:
```javascript
// Web
localStorage.setItem('skyhigh-save', JSON.stringify(CoreSim.getState()));
const saved = JSON.parse(localStorage.getItem('skyhigh-save'));

// React Native
await AsyncStorage.setItem('skyhigh-save', JSON.stringify(state));

// Electron/Tauri
await fs.writeFile('save.json', JSON.stringify(state));
```

---

## Performance Notes

- **60fps target:** `MapEngine.tick()` uses lerp (12% per frame) — smooth on all platforms
- **Hit testing:** Debounced in renderer loop — no expensive per-event recalculation  
- **Country paths:** Rebuilt each frame (cheap on Canvas 2D); on mobile, cache to SkiaPath objects
- **Marker clustering:** Implemented via `hubLevel` threshold in `renderer.js` — portable to any renderer
