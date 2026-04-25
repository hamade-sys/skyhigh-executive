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

/** In-game calendar quarter — Round 1 = Q1 2026, Round 4 = Q4 2026,
 *  Round 5 = Q1 2027, … Round 20 = Q4 2030 (5-year simulation). */
export function fmtQuarter(q: number): string {
  const year = 2026 + Math.floor((q - 1) / 4);
  const quarterOfYear = ((q - 1) % 4) + 1;
  return `Q${quarterOfYear} ${year}`;
}

/** Short tag — "Round X of 20". */
export function fmtQuarterShort(q: number): string {
  return `Round ${q} of 20`;
}
