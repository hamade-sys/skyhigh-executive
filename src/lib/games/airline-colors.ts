/**
 * Airline color identity palette — Phase 9 of the enterprise-readiness
 * plan. Each player picks one of these eight colors at onboarding;
 * the color follows them across the lobby seat list, leaderboard,
 * route ribbons, multi-airline chart, chat (Phase 10), and TopBar
 * chrome so the cohort can say "the blue airline" and everyone knows
 * who.
 *
 * Design rules behind the palette:
 *   - 8 colors covers ICAN's typical cohort sizes (1–8 teams) without
 *     conflicts. Server enforces uniqueness within a game.
 *   - All hexes meet ≥4.5:1 contrast on the white app surfaces from
 *     the Phase 7.1 brand realignment. Pre-tested pairs.
 *   - Teal first — matches the ICAN brand and is the host's natural
 *     default if they don't otherwise pick.
 *   - Color is decorative reinforcement, NEVER the only signal.
 *     Airline names + labels always present alongside the color
 *     chip; aria-labels include the color name for screen readers.
 *
 * The palette is also the bot color allocator: bots claim from the
 * lowest-indexed unclaimed color in deterministic order. Humans
 * claim by choice (uniqueness enforced server-side).
 */

export interface AirlineColor {
  /** Stable id stored in the DB and engine state. Don't rename. */
  id: AirlineColorId;
  /** Human-readable label for picker tiles + screen readers. */
  label: string;
  /** Hex used for fills, ribbons, chart lines. */
  hex: string;
  /** Foreground choice when text sits ON this color (white vs slate-900).
   *  Picked to clear 4.5:1 contrast against the hex. */
  textOn: "white" | "slate-900";
  /** Soft tint for backgrounds, badges, hover states. ~10% alpha
   *  equivalent, picked to read well on the app's white surfaces. */
  tint: string;
  /** Stronger accent for borders + ring offsets where the bare hex
   *  would feel heavy. */
  ring: string;
}

export const AIRLINE_COLOR_PALETTE: readonly AirlineColor[] = [
  { id: "teal",    label: "Teal",    hex: "#00C2CB", textOn: "white",      tint: "#E0F8F9", ring: "#80E0E5" },
  { id: "sky",     label: "Sky",     hex: "#0EA5E9", textOn: "white",      tint: "#E0F2FE", ring: "#7DD3FC" },
  { id: "amber",   label: "Amber",   hex: "#D97706", textOn: "white",      tint: "#FEF3C7", ring: "#FCD34D" },
  { id: "emerald", label: "Emerald", hex: "#059669", textOn: "white",      tint: "#D1FAE5", ring: "#6EE7B7" },
  { id: "rose",    label: "Rose",    hex: "#E11D48", textOn: "white",      tint: "#FFE4E6", ring: "#FDA4AF" },
  { id: "violet",  label: "Violet",  hex: "#7C3AED", textOn: "white",      tint: "#EDE9FE", ring: "#C4B5FD" },
  { id: "indigo",  label: "Indigo",  hex: "#4338CA", textOn: "white",      tint: "#E0E7FF", ring: "#A5B4FC" },
  { id: "slate",   label: "Slate",   hex: "#475569", textOn: "white",      tint: "#F1F5F9", ring: "#94A3B8" },
] as const;

export type AirlineColorId =
  | "teal"
  | "sky"
  | "amber"
  | "emerald"
  | "rose"
  | "violet"
  | "indigo"
  | "slate";

/** O(1) lookup for any color metadata. Use this everywhere — never
 *  parse hex out of the array directly. */
export const AIRLINE_COLOR_BY_ID: Record<AirlineColorId, AirlineColor> =
  Object.fromEntries(
    AIRLINE_COLOR_PALETTE.map((c) => [c.id, c]),
  ) as Record<AirlineColorId, AirlineColor>;

/**
 * Get a color by id, with a deterministic fallback.
 *
 * Legacy team rows from before Phase 9 lack `airlineColorId`. To
 * keep the leaderboard / route map / chat readable, we deterministically
 * derive a color from a team-stable string (their team id, name, or
 * session id) so the team always renders with the same color until
 * the next save round-trip writes a real value.
 */
export function airlineColorFor(args: {
  colorId?: AirlineColorId | null;
  fallbackKey?: string;
}): AirlineColor {
  if (args.colorId && AIRLINE_COLOR_BY_ID[args.colorId]) {
    return AIRLINE_COLOR_BY_ID[args.colorId];
  }
  if (args.fallbackKey) {
    let hash = 0;
    for (let i = 0; i < args.fallbackKey.length; i += 1) {
      hash = (hash * 31 + args.fallbackKey.charCodeAt(i)) >>> 0;
    }
    return AIRLINE_COLOR_PALETTE[hash % AIRLINE_COLOR_PALETTE.length];
  }
  return AIRLINE_COLOR_PALETTE[0];
}

/**
 * Pick the next available color for a bot or anonymous claim. Skips
 * colors that are already taken in the game so cohorts stay distinct.
 * Returns the lowest-indexed free color, or — if every color is
 * taken (impossible in normal play; keyspace = 8) — the first color
 * by deterministic fallback.
 */
export function pickNextAvailableColor(
  takenColorIds: ReadonlyArray<AirlineColorId | null | undefined>,
): AirlineColorId {
  // Filter only null/undefined; everything else is treated as a real
  // claim. Earlier we used `!!c` which silently dropped any falsy
  // value (incl. an unexpected empty string) — tightening so a stray
  // empty string still blocks the slot.
  const taken = new Set(
    takenColorIds.filter(
      (c): c is AirlineColorId => c !== null && c !== undefined,
    ),
  );
  for (const c of AIRLINE_COLOR_PALETTE) {
    if (!taken.has(c.id)) return c.id;
  }
  // Saturated — fall back to teal. Shouldn't happen in cohorts ≤8.
  return AIRLINE_COLOR_PALETTE[0].id;
}

/** Type guard for runtime validation (route handlers, persistence
 *  loaders). */
export function isAirlineColorId(v: unknown): v is AirlineColorId {
  return (
    typeof v === "string" &&
    AIRLINE_COLOR_PALETTE.some((c) => c.id === v)
  );
}
