/**
 * Maps every aircraft spec ID to a realistic glTF 2.0 model in
 * /public/plane-models/.
 *
 * Models are sourced from two open flight-tracker model sets:
 *   - FlightAirMap  (github.com/Ysurac/FlightAirMap-3dmodels, glTF2/)
 *   - BelugaProject (github.com/amnesica/BelugaProject-3D-Models)
 * Both are GPL-licensed community model sets (see NOTICE in
 * /public/plane-models/). 27 base models cover all 70 airframes by
 * mapping each variant to its closest real-world silhouette.
 *
 * Resolution: exact spec id → mapped model → null (procedural fallback,
 * used for the Boom Overture which has no community model).
 */

// Every model file shipped in /public/plane-models/.
const AVAILABLE = new Set<string>([
  "A319", "A320", "A321", "A220", "A332", "A333", "A350", "A380",
  "ATR72", "B736", "B737", "B738", "B739", "B747", "B748", "B757",
  "B767", "B772", "B773", "B788", "B789", "CRJ7", "CRJ9", "DH8A",
  "E170", "E175", "E190",
]);

/** spec id → model file (without .glb). Closest real silhouette wins. */
const SPEC_TO_MODEL: Record<string, string> = {
  // ── Airbus narrowbody ───────────────────────────────────────
  "A319": "A319", "A320": "A320", "A321": "A321",
  "A319neo": "A319", "A320neo": "A320", "A321neo": "A321",
  "A321XLR": "A321", "A321P2F": "A321",
  "A220-300": "A220", "A220-500": "A220", "A220-500F": "A220",
  // ── Airbus widebody ─────────────────────────────────────────
  "A300-600F": "A332",
  "A330-200": "A332", "A330-300": "A333",
  "A330-200F": "A332", "A330-300P2F": "A333", "A330-900neo": "A333",
  "A350-900": "A350", "A350-1000": "A350",
  "A380-800": "A380", "A380F": "A380",
  // ── Boeing 737 family ───────────────────────────────────────
  "B737-300": "B736", "B737-400": "B738", "B737-500": "B736",
  "B737-600": "B736", "B737-700": "B737", "B737-800": "B738",
  "B737-900": "B739", "B737-300F": "B736", "B737-800BCF": "B738",
  "B737-MAX-8": "B738", "B737-MAX-9": "B739", "B737-MAX-10": "B739",
  // ── Boeing 757 / 767 / 797 ─────────────────────────────────
  "B757-200": "B757", "B757-200F": "B757",
  "B767-300ER": "B767", "B767-300F": "B767",
  "B797": "B767", "B797F": "B767",
  // ── Boeing 777 ──────────────────────────────────────────────
  "B777-200": "B772", "B777-200ER": "B772", "B777-200LR": "B772",
  "B777-300ER": "B773", "B777F": "B773",
  "B777X-8": "B772", "B777X-9": "B773", "B777-8F": "B773",
  // ── Boeing 787 ──────────────────────────────────────────────
  "B787-8": "B788", "B787-9": "B789", "B787-10": "B789",
  // ── Boeing 747 ──────────────────────────────────────────────
  "B747-400": "B747", "B747-400F": "B747",
  "B747-8": "B748", "B747-8F": "B748",
  // ── Embraer ─────────────────────────────────────────────────
  "E170": "E170", "E175": "E175", "E190": "E190", "E195": "E190",
  "E175-E2": "E175", "E190-E2": "E190", "E195-E2": "E190",
  // ── Regional / turboprop ────────────────────────────────────
  "CRJ-700": "CRJ7", "CRJ-900": "CRJ9",
  "Dash-8-400": "DH8A",
  "ATR-72-500": "ATR72", "ATR-72-600": "ATR72",
  "ATR-72-600F": "ATR72", "ATR-EVO": "ATR72",
  // ── COMAC (A320-class stand-in) ─────────────────────────────
  "C919": "A320",
  // ── Boom Overture → no community model → procedural delta wing
};

/**
 * Public URL for an aircraft's GLB model, or null when none is mapped
 * (viewer then renders the procedural mesh — currently only BoomO).
 */
export function planeModelPath(specId: string): string | null {
  const file = SPEC_TO_MODEL[specId];
  if (file && AVAILABLE.has(file)) return `/plane-models/${file}.glb`;
  return null;
}
