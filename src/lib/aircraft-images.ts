/**
 * Maps aircraft spec IDs to their 3-view illustration in /public/plane-images.
 *
 * The image folder uses inconsistent naming (some have spaces, some don't,
 * cargo variants reuse passenger silhouettes). This map keeps the mapping
 * explicit so a missing image returns `null` and the UI can fall back to
 * an icon, instead of trying to guess a URL at runtime.
 *
 * Where a freighter doesn't have its own folder yet, the map points at the
 * passenger silhouette (clearly marked TEMP FALLBACK) so the UI shows
 * something meaningful until the user provides the dedicated freighter art.
 */

const SPEC_TO_IMAGE: Record<string, string> = {
  // ─── R1 passenger starters ─────────────────────────────────
  "A319":         "A319/A319_3view.png",
  "A320":         "A320/A320_3view.png",
  "A321":         "A321/A321_3view.png",
  "A330-200":     "A330-200/A330-200_3view.png",
  "A330-300":     "A330-300/A330-300_3view.png",
  "B737-300":     "B737-300/B737-300_3view.png",
  "B737-400":     "B737-400/B737-400_3view.png",
  "B737-500":     "B737-500/B737-500_3view.png",
  "B737-600":     "B737-500/B737-500_3view.png",       // TEMP FALLBACK → 737-500 silhouette
  "B737-700":     "B737-700/B737-700_3view.png",
  "B737-800":     "B737-800/B737-800_3view.png",
  "B737-900":     "B737-900/B737-900_3view.png",
  "B747-400":     "B747-400/B747-400_3view.png",
  "B757-200":     "B757-200/B757-200_3view.png",
  "B767-300ER":   "B767-300/B767-300_3view.png",
  "B777-200":     "B777-200/B777-200_3view.png",
  "B777-200ER":   "B777-200ER/B777-200ER_3view.png",
  "B777-200LR":   "B777-200LR/B777-200LR_3view.png",
  "CRJ-700":      "CRJ-700/CRJ-700_3view.png",
  "CRJ-900":      "CRJ-900/CRJ-900_3view.png",
  "Dash-8-400":   "Dash 8-400/Dash 8-400_3view.png",
  "E170":         "E175/E175_3view.png",                // TEMP FALLBACK → E175
  "E175":         "E175/E175_3view.png",
  "E195":         "E195/E195_3view.png",
  "ATR-72-500":   "ATR 72-500/ATR 72-500_3view.png",

  // ─── R1 cargo starters ─────────────────────────────────────
  "B737-300F":    "B737-300/B737-300_3view.png",       // TEMP FALLBACK → passenger silhouette
  "B757-200F":    "B757-200/B757-200_3view.png",       // TEMP FALLBACK
  "B767-300F":    "B767-300F/B767-300F_3view.png",
  "B747-400F":    "B747-400F/B747-400F_3view.png",
  "B777F":        "B777F/B777F_3view.png",
  "A300-600F":    "A300-600F/A300-600F_3view.png",
  "A330-200F":    "A330-200/A330-200_3view.png",       // TEMP FALLBACK → passenger silhouette

  // ─── R5 (Q1 2016) ──────────────────────────────────────────
  "B777-300ER":   "B777-300ER/B777-300ER_3view.png",
  "E190":         "E190/E190_3view.png",

  // ─── R9 (Q1 2017) ──────────────────────────────────────────
  "A380-800":     "A380-800/A380-800_3view.png",

  // ─── R12 (Q4 2017) ─────────────────────────────────────────
  "B787-8":       "B787-8/B787-8_3view.png",
  "ATR-72-600":   "ATR 72-600/ATR 72-600_3view.png",

  // ─── R16 (Q4 2018) ─────────────────────────────────────────
  "B747-8":       "B747-8/B747-8_3view.png",
  "E190-E2":      "E190-E2/E190-E2_3view.png",

  // ─── R20 (Q4 2019) ─────────────────────────────────────────
  "B787-9":       "B787-9/B787-9_3view.png",
  "A350-900":     "A350-900/A350-900_3view.png",

  // ─── R21 (Q1 2020) — neo / MAX wave ───────────────────────
  "A220-300":     "A220-300/A220-300_3view.png",
  "A319neo":      "A319neo/A319neo_3view.png",
  "A320neo":      "A320neo/A320neo_3view.png",
  "A321neo":      "A321neo/A321neo_3view.png",
  "B737-MAX-8":   "B737 MAX 8/B737 MAX 8_3view.png",
  "B737-MAX-9":   "B737 MAX 9/B737 MAX 9_3view.png",

  // ─── R25 (Q1 2021) — late-gen widebodies + E2 ────────────
  "A350-1000":    "A350-1000/A350-1000_3view.png",
  "A330-900neo":  "A330-900neo/A330-900neo_3view.png",
  "B787-10":      "B787-10/B787-10_3view.png",
  "E195-E2":      "E195-E2/E195-E2_3view.png",

  // ─── R28 (Q4 2021) — endgame catalogue ──────────────────
  "A321XLR":      "A321XLR/A321XLR_3view.png",
  "B777X-9":      "B777X-9/B777X-9_3view.png",
  "C919":         "C919/C919_3view.png",

  // ─── Staggered cargo unlocks (R9, R12, R16, R25, R29, R32) ───
  "A380F":        "A380-800/A380-800_3view.png",       // TEMP FALLBACK → passenger A380
  "A330-300P2F":  "A330-300/A330-300_3view.png",       // TEMP FALLBACK
  "B747-8F":      "B747-8F/B747-8F_3view.png",
  "B737-800BCF":  "B737-800/B737-800_3view.png",       // TEMP FALLBACK
  "A321P2F":      "A321/A321_3view.png",               // TEMP FALLBACK
  "B777-8F":      "B777X-9/B777X-9_3view.png",         // TEMP FALLBACK → 777X silhouette
  "ATR-72-600F":  "ATR 72-600/ATR 72-600_3view.png",   // TEMP FALLBACK

  // ─── R32 / R34 user-override unlocks ──────────────────────
  "B777X-8":      "B777X-9/B777X-9_3view.png",         // TEMP FALLBACK → 777X-9 silhouette
  "B737-MAX-10":  "B737 MAX 9/B737 MAX 9_3view.png",   // TEMP FALLBACK → MAX 9 silhouette
  "E175-E2":      "E190-E2/E190-E2_3view.png",         // TEMP FALLBACK → E190-E2 silhouette
};

/** Returns a URL-safe path under /plane-images/, or null if no image. */
export function planeImagePath(specId: string): string | null {
  const rel = SPEC_TO_IMAGE[specId];
  if (!rel) return null;
  // Encode spaces (folder "B737 MAX 8") for safe URL.
  return `/plane-images/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
