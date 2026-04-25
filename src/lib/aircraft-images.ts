/**
 * Maps aircraft spec IDs to their 3-view illustration in /public/plane-images.
 *
 * The image folder uses inconsistent naming (some have spaces, some don't,
 * cargo variants reuse passenger silhouettes). This map keeps the mapping
 * explicit so a missing image returns `null` and the UI can fall back to
 * an icon, instead of trying to guess a URL at runtime.
 *
 * If you add a new aircraft spec, add a row here too.
 */

const SPEC_TO_IMAGE: Record<string, string> = {
  // Q1 narrow-body passenger
  "A319":         "A319/A319_3view.png",
  "A320":         "A320/A320_3view.png",
  "A321":         "A321/A321_3view.png",
  "B737-700":     "B737-700/B737-700_3view.png",
  "B737-800":     "B737-800/B737-800_3view.png",
  "B757-200":     "B757-200/B757-200_3view.png",

  // Q1 wide-body passenger
  "B767-300ER":   "B767-300/B767-300_3view.png",      // ER variant uses base 3-view
  "A330-200":     "A330-200/A330-200_3view.png",
  "B777-200ER":   "B777-200ER/B777-200ER_3view.png",
  "B747-400":     "B747-400/B747-400_3view.png",

  // Q1 cargo (cargo variants reuse the passenger silhouette where available)
  "B737-300F":    "B737-300/B737-300_3view.png",
  "B757-200F":    "B757-200/B757-200_3view.png",
  "B767-300F":    "B767-300F/B767-300F_3view.png",
  "B747-400F":    "B747-400F/B747-400F_3view.png",

  // Unlocks (real EIS dates 2007-2026 mapped to game quarters)
  "A380-800":     "A380-800/A380-800_3view.png",
  "B787-8":       "B787-8/B787-8_3view.png",
  "B787-9":       "B787-9/B787-9_3view.png",
  "B787-10":      "B787-10/B787-10_3view.png",
  "A350-900":     "A350-900/A350-900_3view.png",
  "A350-1000":    "A350-1000/A350-1000_3view.png",
  "A320neo":      "A320neo/A320neo_3view.png",
  "A321neo":      "A321neo/A321neo_3view.png",
  "A330-900neo":  "A330-900neo/A330-900neo_3view.png",
  "A220-300":     "A220-300/A220-300_3view.png",
  "B737-MAX-8":   "B737 MAX 8/B737 MAX 8_3view.png",
  "B777X-9":      "B777X-9/B777X-9_3view.png",
  "A321XLR":      "A321XLR/A321XLR_3view.png",
};

/** Returns a URL-safe path under /plane-images/, or null if no image. */
export function planeImagePath(specId: string): string | null {
  const rel = SPEC_TO_IMAGE[specId];
  if (!rel) return null;
  // Encode spaces (folder "B737 MAX 8") for safe URL.
  return `/plane-images/${rel.split("/").map(encodeURIComponent).join("/")}`;
}
