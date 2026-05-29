/** Format a USD value. Abbreviates at $1M and $1B.
 *
 * Default precision rules tuned for SkyForce display copy: aircraft
 * prices and operating costs are mostly clean millions (e.g. "$80M"),
 * so we drop the decimal when the amount is a whole million. The
 * decimal still shows when the value is fractional ("$32.5M",
 * "$1.5B"). Pass `decimals` explicitly to override.
 */
export function fmtMoney(n: number, opts?: { decimals?: number; compact?: boolean }): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const compact = opts?.compact ?? true;
  if (!compact) {
    return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  // Smart-rounding helper: if the value is a whole-unit (e.g. exactly
  // 80M with the M divisor), show no decimal; otherwise show 1.
  function smart(v: number, divisor: number, suffix: string): string {
    const scaled = v / divisor;
    const explicit = opts?.decimals;
    const decimals =
      explicit !== undefined
        ? explicit
        : Math.abs(scaled - Math.round(scaled)) < 0.05
          ? 0
          : 1;
    return `${sign}$${scaled.toFixed(decimals)}${suffix}`;
  }
  if (abs >= 1_000_000_000) return smart(abs, 1_000_000_000, "B");
  if (abs >= 1_000_000) return smart(abs, 1_000_000, "M");
  if (abs >= 1_000) return smart(abs, 1_000, "K");
  return `${sign}$${abs.toFixed(0)}`;
}

export function fmtPct(n: number, decimals = 0): string {
  return `${n.toFixed(decimals)}%`;
}

export function fmtDelta(n: number, decimals = 1): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n.toFixed(decimals)}` : `−${Math.abs(n).toFixed(decimals)}`;
}

/**
 * In-game calendar.
 *
 * Each round = 1 real calendar quarter. Two campaign lengths exist:
 *   · Half campaign — 60 quarters, Q1 2015 → Q4 2029 (the default).
 *   · Full campaign — 120 quarters, Q1 2000 → Q4 2029.
 *
 * Aircraft availability is gated directly on real EIS year via
 * effectiveUnlockQuarter (see engine) — the calendar runs in real
 * time now, so there is no year-compression mapping. The legacy
 * 40-round / 2:1-compression model was removed.
 *
 * TOTAL_GAME_ROUNDS is only a fallback default for legacy saves that
 * pre-date the configurable session.totalRounds field. Live code reads
 * the count via getTotalRounds(state).
 */
export const TOTAL_GAME_ROUNDS = 60;
const GAME_START_YEAR = 2015;

/**
 * Read the configured total round count from the game's session.
 * Falls back to the hardcoded 40 default for legacy single-player
 * saves that pre-date the configurable session field.
 *
 * Phase 3 of the enterprise-readiness plan: every UI surface that
 * displays "Round X of Y" or gates on "have we reached the last
 * round?" must use this helper rather than the constant. Otherwise
 * 8/16/24-round games never end and show wrong progress copy.
 */
export function getTotalRounds(state: { session?: { totalRounds?: number } | null }): number {
  const t = state?.session?.totalRounds;
  return typeof t === "number" && t > 0 ? t : TOTAL_GAME_ROUNDS;
}

/**
 * Calendar start year for a game. Full-campaign games begin in 2000
 * (120 quarters → 2000-2029); every other session begins in 2015
 * (60 quarters → 2015-2029). Pass the resulting year into fmtQuarter so
 * the in-game date label reflects the chosen era.
 */
export const FULL_CAMPAIGN_START_YEAR = 2000;
export function getCampaignStartYear(
  state: { session?: { campaignMode?: "half" | "full" } | null } | null | undefined,
): number {
  return state?.session?.campaignMode === "full" ? FULL_CAMPAIGN_START_YEAR : GAME_START_YEAR;
}

/**
 * Render a 1-based quarter index as "Q# YYYY". The optional `startYear`
 * controls the calendar era — defaults to the half-campaign 2015 start;
 * pass FULL_CAMPAIGN_START_YEAR (2000) for full-campaign games. Derive
 * it from session via getCampaignStartYear().
 */
export function fmtQuarter(q: number, startYear: number = GAME_START_YEAR): string {
  const idx = Math.max(0, q - 1);
  const year = startYear + Math.floor(idx / 4);
  const quarterOfYear = (idx % 4) + 1;
  return `Q${quarterOfYear} ${year}`;
}

/** Short progress tag shown under the Q# YYYY headline. The user
 *  asked us to stop calling time-units "rounds" in player-facing
 *  copy — quarters carry the date label and the campaign progress
 *  reads better as "Quarter N of M". The optional `totalRounds`
 *  arg defaults to the legacy 40-round constant for any caller
 *  that hasn't been migrated yet. */
export function fmtQuarterShort(q: number, totalRounds: number = TOTAL_GAME_ROUNDS): string {
  return `Quarter ${q} of ${totalRounds}`;
}

/** Format a span in quarters as "Y & Q" — e.g. 9 → "2Y 1Q", 4 → "1Y",
 *  3 → "3Q". Used for aircraft age and remaining lifespan in the fleet
 *  + market UIs so the player reads them in human terms instead of
 *  raw quarter counts. */
export function fmtAgeYQ(quarters: number): string {
  const q = Math.max(0, Math.round(quarters));
  if (q === 0) return "0Q";
  const years = Math.floor(q / 4);
  const remQ = q % 4;
  if (years === 0) return `${remQ}Q`;
  if (remQ === 0) return `${years}Y`;
  return `${years}Y ${remQ}Q`;
}
