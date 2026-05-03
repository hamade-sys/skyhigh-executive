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
 * Game runs 40 rounds covering 10 calendar years (2015 → end of 2024).
 * Each round = 1 real calendar quarter. Round 1 = Q1 2015,
 * Round 4 = Q4 2015, Round 40 = Q4 2024.
 *
 * Aircraft release timeline is INDEPENDENTLY compressed: aircraft EIS
 * year E in the real world maps to game round via a 2:1 compression
 * anchored at real-2000 = game-Q1-2015. This lets the player experience
 * the 2000–2026 aviation product cycle (A380 EIS 2007 → ~round 13,
 * 787-9 EIS 2014 → ~round 29) within the 10 calendar years of game time.
 * See gameQuarterFromYear below.
 */
export const TOTAL_GAME_ROUNDS = 40;
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

export function fmtQuarter(q: number): string {
  const idx = Math.max(0, q - 1);
  const year = GAME_START_YEAR + Math.floor(idx / 4);
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

/**
 * Convert a real-world EIS year (e.g. 2007 for the A380) to the GAME
 * round at which the aircraft becomes available.
 *
 * Mapping: 2:1 compression. Real year 2000 = Round 1 (Q1 2015).
 * Real year 2002 = Round 5 (Q1 2016). Real year 2026 = Round 53,
 * which is clamped back to 40 (last game round) — late aircraft
 * unlock right at the end of the simulation.
 *
 * Implementation:
 *   yearsFrom2000 = year - 2000
 *   gameYearsFromStart = yearsFrom2000 / 2     (compression)
 *   round = floor(gameYearsFromStart) * 4 + 1
 */
export function gameQuarterFromYear(year: number): number {
  if (year <= 2000) return 1;
  const yearsFromAnchor = year - 2000;
  const gameYearsFromStart = yearsFromAnchor / 2;
  const round = Math.floor(gameYearsFromStart) * 4 + 1;
  return Math.max(1, Math.min(TOTAL_GAME_ROUNDS, round));
}
