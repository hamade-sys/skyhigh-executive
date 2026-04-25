/** Format a USD value. Abbreviates at $1M and $1B. */
export function fmtMoney(n: number, opts?: { decimals?: number; compact?: boolean }): string {
  const sign = n < 0 ? "−" : "";
  const abs = Math.abs(n);
  const d = opts?.decimals ?? 1;
  const compact = opts?.compact ?? true;
  if (!compact) {
    return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(d)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(d)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(d)}K`;
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
 * In-game calendar — the simulation compresses 26 real years (2000–2026)
 * into 20 game quarters. Each game quarter ≈ 1.3 real years. Aircraft
 * unlock dates are anchored to their real-world entry-into-service year
 * via this same mapping (see src/lib/aircraft-unlock.ts).
 *
 * Round 1  → Q1 2000   (game start)
 * Round 5  → Q3 2005
 * Round 9  → Q1 2010
 * Round 13 → Q3 2015
 * Round 17 → Q1 2020
 * Round 20 → Q1 2024
 */
const YEARS_PER_GAME_Q = 1.3;
const GAME_START_YEAR = 2000;

export function fmtQuarter(q: number): string {
  const yearsElapsed = (q - 1) * YEARS_PER_GAME_Q;
  const totalMonths = Math.floor(yearsElapsed * 12);
  const year = GAME_START_YEAR + Math.floor(totalMonths / 12);
  const monthOfYear = totalMonths % 12;
  const quarterOfYear = Math.floor(monthOfYear / 3) + 1;
  return `Q${quarterOfYear} ${year}`;
}

/** Short tag — "Round X of 20". */
export function fmtQuarterShort(q: number): string {
  return `Round ${q} of 20`;
}

/** Convert a real-world EIS year (e.g. 2007 for the A380) to the game
 *  quarter at which the aircraft becomes available. Anchored to the
 *  same 2000 / 1.3-yr-per-Q mapping as fmtQuarter. */
export function gameQuarterFromYear(year: number): number {
  if (year <= GAME_START_YEAR) return 1;
  const elapsed = year - GAME_START_YEAR;
  return Math.max(1, Math.ceil(elapsed / YEARS_PER_GAME_Q));
}
