# SkyHigh Executive — Component Specifications

## Art Bible Summary

**Visual Genre:** Neo-Aviation Executive Noir  
**Emotional Arc:**
- Stage 1 — Optimism / clean / expansive (green tints, open space)
- Stage 2 — Pressure / denser UI / tension cues (amber warnings)  
- Stage 3 — Strain / heavy data / social stress (orange-red alerts)
- Stage 4 — Prestige / ceremonial / verdict (deep gold, solemn)

**Texture strategy:** Flat dark surfaces with subtle gold edge accents. Glass effect only on map overlay cards.  
**Lighting:** Ambient dark with directional amber glow on primary elements. Crisis = red edge pulse.

---

## Buttons

### Primary Button
- Shape: `border-radius: 8px`
- Background: `linear-gradient(135deg, #C8933A, #E8B050)`
- Text: `#08080F` (near-black on gold — high contrast)
- Font: Inter Semibold 600, 0.875rem, tracking 0.04em
- Shadow: `0 2px 8px rgba(200,147,58,0.3)`
- Hover: `translateY(-1px)`, `shadow 0 4px 16px rgba(200,147,58,0.5)`
- Active: `scale(0.97)`, 120ms spring
- Disabled: `opacity: 0.4`, no hover effects

### Secondary Button
- Background: transparent
- Border: `1px solid rgba(200,147,58,0.2)` → hover: `rgba(200,147,58,0.6)`
- Text: `#EDE8D8`

### Danger Button  
- Background: `linear-gradient(135deg, #C0392B, #E74C3C)`
- Text: white
- Shadow: `0 2px 8px rgba(231,76,60,0.3)`

### Ghost Button
- Background: transparent, border: `1px solid rgba(255,255,255,0.06)`
- Text: `#9A9080` → hover `#EDE8D8`

---

## Cards

### Standard Card
- Background: `#15151F`
- Border: `1px solid rgba(255,255,255,0.06)` → hover `rgba(200,147,58,0.2)`
- Border-radius: `12px`
- Padding: `16px`
- Shadow: `0 4px 12px rgba(0,0,0,0.5)` on elevated state
- Entry animation: `fadeInUp 0.3s ease`

### Metric Card (KPI display)
- Border-left: `3px solid [semantic color]`
- Stat value: JetBrains Mono, 1.5rem, bold, accent color
- Label: Inter 0.65rem, uppercase, letter-spacing 0.15em, `#9A9080`

---

## Competency Bars

- Track: `rgba(255,255,255,0.08)`, height 4px, border-radius 99px
- Board fill: `linear-gradient(90deg, #C8933A, #F0D060)`
- Safety fill: `linear-gradient(90deg, #2980B9, #3498DB)`
- Crew fill: `linear-gradient(90deg, #27AE60, #2ECC71)`
- Prestige fill: `linear-gradient(90deg, #8E44AD, #C39BD3)`
- Transition: `width 0.6s cubic-bezier(0.16,1,0.3,1)`
- Value label: JetBrains Mono 0.75rem, `#9A9080`

**State cues:**
- < 30: danger red pulsing glow
- 30-50: warning amber
- 50-75: normal fill
- > 75: bright fill + subtle glow
- > 90: milestone unlock glow

---

## Crisis Modal

- Border: `1.5px solid rgba(231,76,60,0.6)` (crisis crimson)
- Box-shadow: `0 8px 24px rgba(0,0,0,0.6), 0 0 40px rgba(231,76,60,0.4)`
- Entry animation: `crisisShake 0.4s + fadeInScale 0.4s spring`
- Backdrop: `rgba(0,0,0,0.7)` with blur 8px
- Severity badge: uppercase, 0.7rem, `#E74C3C`, crimson border ring
- Teaser: italic, left border `3px solid #E74C3C`, bg `rgba(231,76,60,0.06)`
- Choices: hover `translateX(4px)`, border turns to `#C8933A`
- Effect tags: `0.65rem` monospace, green/red background pills

**Boss event special:**
- Entry: additional `crisisShake` keyframe
- Phase dots: 3 dots, active = `#E74C3C` glow
- Title includes phase number

---

## Airport Marker (Canvas)

| Zoom Level | Hub 1-2 | Hub 3 | Hub 4 | Hub 5 |
|------------|---------|-------|-------|-------|
| L1 (< 1.5x)| hidden  | hidden| diamond 6px | diamond 8px + ring |
| L2 (1.5-3x)| hidden  | circle 4px | diamond 7px | diamond 9px + ring |
| L3 (> 3x)  | circle 3px | circle 5px | diamond 8px | diamond 10px + ring + label |

**Colors:**
- Default: `#6A8A7A`
- Has route: `#2ECC71` (success green)
- Selected (origin): `#C8933A` (primary gold)
- Selected (dest): `#F0D060` (accent)
- Hub (player's): `#F0D060` star

**Hover:** outer glow ring `rgba(200,147,58,0.25)`, radius +6px

---

## Route Arcs (Canvas)

| Route State | Color | Line width | Extra |
|-------------|-------|-----------|-------|
| Profitable  | `#2ECC71` | 2.5px | 5px glow shadow, moving dot |
| Loss-making | `#E74C3C` | 1.5px | — |
| Idle (no data) | `#5A5448` | 1.5px | — |
| Pending     | `#C8933A` dashed | 2px | Animated dash offset |

**Arc geometry:** Quadratic bezier, control point lifted `arcHeight = min(0.4, distKm/25000)` of chord length above midpoint.

**Moving dot:** Bezier parametric at `t = (frame * 0.5) % 100 / 100`, `#F0D060` 3px circle with glow.

---

## Map Overlay Cards (Country / Airport)

- Background: `rgba(16,16,26,0.97)` with `backdrop-filter: blur(12px)`
- Border: `1px solid rgba(200,147,58,0.2)`
- Border-radius: `16px`
- Shadow: `0 8px 24px rgba(0,0,0,0.6)`
- Entry: `fadeInUp 0.25s dramatic easing`
- Min-width: 240px, max-width: 300px
- Position: offset from click point, clamped to viewport

**Country card shows:**
- Name (Cinzel, 1rem, gold)
- Region (0.75rem muted)
- Risk level (colored semantic)
- Market tier (colored semantic)
- Market description (italic, 0.74rem muted)

**Airport card shows:**
- Airport name + code
- Hub level (star display ★★★★☆)
- Demand (JetBrains Mono)
- Action buttons: Set Origin / Set Destination / Zoom In / Close

---

## Route Projection Panel

- Position: `bottom: 20px, left: 50%, transform: translateX(-50%)`
- 3-stat grid: Revenue (+green) / Cost (-red) / Profit (+/- conditional)
- Plane selector: 3 tabs with emoji + model name, selected = gold border
- CTA: "Open Route" primary button full width
- Feasibility: if out of range, profit shows "OUT OF RANGE" in danger red, CTA disabled

---

## Report Card

- Full-screen backdrop, blur 12px
- Scrollable inner card, max-width 600px
- Episode label: 0.7rem, uppercase, muted, letter-spacing 0.3em
- Title: Cinzel 1.6rem, gold
- Ticker text: italic, left border 3px primary, bg amber-tinted
- Board quote: italic, left border 3px primary, bg amber 6% tint
- Route table: staggered entry (0.08s delay per item)

---

## End Game Screen

- Radial gradient background: `#1A1A10 → #08080F` (warmer amber tone)
- Legacy title: Cinzel 3rem bold, gold, 80px glow shadow
- Stats grid: 3 columns, frosted card look
- "An Ozuna Interactive Production" footer credit

---

## Map (Canvas Visual Guide)

**Ocean:** `radial-gradient(#0E1E2E center → #060D14 edges)`  
**Land (no GeoJSON):** `#16241A` fill, `rgba(100,180,120,0.25)` borders  
**Grid:** `rgba(255,255,255,0.04)` lines at 30° intervals  
**Equator:** slightly brighter `rgba(255,255,255,0.08)`  
**Atmosphere vignette:** radial gradient edges fade to `rgba(6,8,15,0.55)`  
**Top glow:** subtle `rgba(30,100,160,0.12)` top edge (stratospheric)  
**Crisis overlay:** red radial vignette + edge stroke pulse, "CRISIS" watermark

---

## Stage Visual Progression

| Stage | UI Density | Color temperature | Alert cues |
|-------|-----------|------------------|-----------|
| 1 | Minimal, open | Green accents | None |
| 2 | Medium, data visible | Amber temperature | Soft warnings |
| 3 | Dense, crowded | Red-amber | Competency pulsing at low values |
| 4 | Ceremonial | Pure gold | Full prestige mode |

*Implementation: stage-pill color changes automatically. Future enhancement: modify CSS custom properties based on `state.stage` for deeper theming.*
