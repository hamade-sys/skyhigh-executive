# SkyHigh Executive — Motion System Specification

## Philosophy

> Motion should feel **earned, not decorative**. Every animation either:
> 1. Communicates state change
> 2. Guides player attention
> 3. Delivers emotional payoff at key moments

Avoid excessive animation that slows decision-making. The player is making real-time strategy decisions — motion must inform, not distract.

---

## Timing Tokens

| Token | Value | When to use |
|-------|-------|-------------|
| `fast` | 120ms | Micro-interactions (button hover, tooltip) |
| `normal` | 220ms | UI state changes (panel transitions, badge updates) |
| `slow` | 400ms | Screen-level transitions, modals |
| `dramatic` | 700ms | Crisis entry, milestone reveal |
| `epic` | 1200ms | Legacy title reveal, game-over screen |

---

## Easing Tokens

| Token | Curve | Intent |
|-------|-------|--------|
| `snappy` | `cubic-bezier(0.4,0,0.2,1)` | Material-style, general purpose |
| `spring` | `cubic-bezier(0.34,1.56,0.64,1)` | Bouncy: rewards, confirmations, milestone |
| `dramatic` | `cubic-bezier(0.16,1,0.3,1)` | Fast start, slow settle: panels, modals |
| `easeIn` | `cubic-bezier(0.4,0,1,1)` | Elements leaving the screen |
| `easeOut` | `cubic-bezier(0,0,0.2,1)` | Elements entering the screen |

---

## Screen Transitions

### Splash → Setup
- Fade out splash: 300ms `easeIn`
- Fade in setup: 450ms `fadeInScale + dramatic`
- Between: 100ms black hold

### Setup → Game
- Fade to black: 300ms
- Map fade in: 500ms `fadeInScale`
- Header slides in from top: 400ms `dramatic`
- Sidebar slides in from right: 400ms `dramatic`

### Game screens (Result, Report overlays)
- Backdrop: `opacity 0→1` 250ms `snappy`
- Card: `scale(0.92)translateY(20px) → scale(1)` 350ms `dramatic`
- Exit: `scale(1) → scale(0.95)` 200ms `easeIn`

---

## Map Animations

### Camera Pan/Zoom
- Lerp factor: `0.12` per frame (smooth exponential decay)
- Effective duration: ~30 frames (~500ms) to reach target
- No easing function needed — lerp provides organic feel

### flyTo(lat, lon, zoom)
- Same lerp on all three values simultaneously
- Feels like "camera glide"

### Map on Crisis activation
- Red vignette fades in over 600ms
- Edge pulse: `crisisIntensity` ramps from 0→1 over ~50 frames
- Pulsing cycle: `sin(frame * 0.05)` — roughly 2-second period

### Crisis deactivation
- `crisisIntensity` decays at 0.03/frame (~33 frame fade out)

---

## Route Arc Animations

### Route Creation
1. Dashed arc draws from origin toward dest (CSS `lineDashOffset` animated)
2. At confirmation: dash removes, solid arc fades in over 400ms
3. Moving dot begins immediately at 0.5px/frame along bezier

### Profitable Route (ongoing)
- Moving dot: `t = (frame * 0.5) % 100 / 100` — full traversal every ~200 frames (3.3s at 60fps)
- Glow shadow: `shadowBlur: 8` on route line
- Pulsing done via canvas `shadowBlur` alternating with normal render

### Route Removal
- Line fades: `alpha 1→0` over 300ms
- Moving dot stops immediately

---

## Airport Marker Animations

### Hover
- Outer ring: appears in 120ms `snappy`
- Ring radius: `+6px` over 150ms `spring`

### Origin selection
- Pulse ring: `sin(frame * 0.08)` radius 8-16px oscillation
- Continuous while origin is set

### Zoom level transitions
- Markers scale up/down with camera zoom naturally (projected from lat/lon)
- New markers fade in as zoom crosses threshold: `alpha 0→1` 200ms

---

## Floating Cash Deltas

**Trigger:** End of Result phase, per profitable/loss route  
**Behaviour:**
- Spawn at route origin airport screen position
- Float upward: `dy = -(1.2 to 2.0)px/frame` (slight random variance)
- Fade: `alpha = life / 90` (90 frame life)
- Color: `#2ECC71` positive, `#E74C3C` negative
- Font: JetBrains Mono bold 16px
- Shadow: matching color glow, `shadowBlur: 8`

---

## Crisis Entry Sequence

1. `0ms` — backdrop begins fade-in (250ms)
2. `0ms` — game border begins red pulse (background CSS animation)
3. `100ms` — `crisisShake` keyframe (0.4s — shake the modal)
4. `100ms` — modal scales in (0.5s spring)
5. `600ms` — crisis choices stagger in (0.08s per item)

**Sound design hook (future):** Low drone on crisis entry, stinger on resolution.

---

## Round Intro Banner

1. Large quarter number fades in with blur: `opacity:0, scale:1.6, blur:20px → opacity:1, scale:1, blur:0` in 0.5s
2. Holds at full opacity for 0.4s
3. Fades out with scale down: `opacity:1, scale:1 → opacity:0, scale:0.8` in 0.3s
4. Total duration: 1.8s
5. Subtitle label: 0.4s delayed fade-in

---

## Milestone Reveal Banner

1. Banner scales in from 0.7 with spring: `scale(0.7)→scale(1.05)→scale(0.97)→scale(1)` in 600ms
2. Simultaneously: `opacity 0→1` in 200ms
3. Gold glow pulse: `box-shadow` oscillates `30px→80px→30px` over 2s, loops
4. Banner auto-dismisses after 4s with fade out (300ms easeIn)

---

## Competency Bar Updates

**On stat increase:**
- Bar fill transitions: `width` animates via CSS `0.6s cubic-bezier(0.16,1,0.3,1)`
- Slight overshoot feel due to `1,0.3,1` control point
- Value counter: JS counter from old to new value over 800ms

**On stat decrease:**
- Same width transition
- Value turns warning/danger color for 1.5s then fades back

---

## Board Quote Entry (Report phase)

- Delayed: `0.3s delay, fadeInUp 0.4s ease`
- Creates sense of board member "delivering verdict" after pause

---

## Button Interactions

All buttons use CSS transitions on `::after` pseudo-element:

| State | Effect | Duration |
|-------|--------|----------|
| Hover | `rgba(255,255,255,0.07)` overlay | 150ms |
| Active/press | `rgba(255,255,255,0.12)` + `scale(0.97)` | 120ms spring |
| Focus | Gold outline `0 0 0 3px rgba(200,147,58,0.25)` | 100ms |
| Disabled | `opacity: 0.4`, no transitions | — |

---

## What NOT to Animate

- Do NOT animate data table rows during active gameplay (distraction)
- Do NOT use looping animations on static informational text
- Do NOT add motion to tooltip appearance on mobile (causes layout shift)
- Do NOT run concurrent dramatic animations (crisis + milestone simultaneously creates chaos)
- Competency bar numbers should NOT bounce/overshoot — players are reading them as data

---

## Performance Notes

- All CSS animations use `transform` and `opacity` only (GPU composited)
- Canvas animations: all calculations in `renderer.js`, single `requestAnimationFrame` loop
- Route arcs: redrawn each frame (not DOM elements), no performance overhead from CSS
- Crisis overlay: single radial gradient recalculated each frame — acceptable at 60fps
- Floating deltas: max ~20 simultaneous (removed after 90 frames each)
- Blur effects (`backdrop-filter`): used sparingly — only on modal backdrops
