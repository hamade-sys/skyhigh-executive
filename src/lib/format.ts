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

/** Campaign-mode profile — round count, calendar start year, and the
 *  maintenance-bracket size used when an aircraft type passes its
 *  cutoff round. The brief's bracket rule is
 *  `bracket_size = campaign_rounds / 10` (6 for 60r, 12 for 120r);
 *  the 40r legacy mode keeps its 6-round bracket to match historical
 *  saves. */
type CampaignModeKey = "40r" | "60r" | "120r";
const CAMPAIGN_PROFILES: Record<
  CampaignModeKey,
  { totalRounds: number; startYear: number; maintenanceBracketSize: number }
> = {
  "40r":  { totalRounds: 40,  startYear: 2015, maintenanceBracketSize: 6 },
  "60r":  { totalRounds: 60,  startYear: 2015, maintenanceBracketSize: 6 },
  "120r": { totalRounds: 120, startYear: 2000, maintenanceBracketSize: 12 },
};

type CampaignModeState = {
  session?: { totalRounds?: number; campaignMode?: CampaignModeKey } | null;
};

/** Resolve the campaign mode from session state.
 *  Falls back to "40r" when the session field is missing (legacy
 *  saves) OR present but unrecognised. The fallback keeps the legacy
 *  2:1-compressed 40-round behavior intact for any save that pre-dates
 *  the campaign-mode rollout. */
export function getCampaignMode(state: CampaignModeState): CampaignModeKey {
  const m = state?.session?.campaignMode;
  if (m === "40r" || m === "60r" || m === "120r") return m;
  return "40r";
}

/** Calendar start year for the campaign. Half campaign (60r) starts
 *  Q1 2015 to match the legacy 40r product line; Full campaign (120r)
 *  starts Q1 2000 so the player lives through the 2000–2014 backstory
 *  (dot-com bust, 9/11, SARS, Beijing Olympics, GFC, …) before reaching
 *  the present day. */
export function getCampaignStartYear(state: CampaignModeState): number {
  return CAMPAIGN_PROFILES[getCampaignMode(state)].startYear;
}

/** Maintenance bracket width used by the cutoff-escalation curve.
 *  Engine: rounds-since-cutoff ≤ 1× bracket → +5%, ≤ 2× → +7.5%,
 *  ≤ 3× → +10%, beyond → +15% permanent flatline (eco upgrade halves
 *  every rate). The product spec scales the bracket so escalation
 *  feels equivalent regardless of campaign length. */
export function getMaintenanceBracketSize(state: CampaignModeState): number {
  return CAMPAIGN_PROFILES[getCampaignMode(state)].maintenanceBracketSize;
}

/**
 * Read the configured total round count from the game's session.
 *
 * Resolution order:
 *   1. Explicit `session.totalRounds` value (legacy presets 8/16/24/40
 *      still honoured for old saves).
 *   2. Campaign-mode default (60r → 60, 120r → 120, 40r → 40).
 *   3. The legacy 40 constant.
 *
 * Phase 3 of the enterprise-readiness plan: every UI surface that
 * displays "Round X of Y" or gates on "have we reached the last
 * round?" must use this helper rather than the constant. Otherwise
 * 8/16/24-round games never end and show wrong progress copy.
 */
export function getTotalRounds(state: CampaignModeState): number {
  const t = state?.session?.totalRounds;
  if (typeof t === "number" && t > 0) return t;
  return CAMPAIGN_PROFILES[getCampaignMode(state)].totalRounds;
}

/** Format a game round number as a calendar quarter.
 *
 *  Pass `state` (the whole game store, or any object with
 *  `session.campaignMode`) to honour the campaign's start year.
 *  Without state, defaults to the legacy 2015 anchor — matches
 *  every legacy callsite that didn't know about start-year shift.
 *  Once the 120r full-campaign UI lands, panels rendering historical
 *  quarters should pass state so 2000-era dates render correctly.
 */
export function fmtQuarter(q: number, state?: CampaignModeState): string {
  const idx = Math.max(0, q - 1);
  const startYear = state ? getCampaignStartYear(state) : GAME_START_YEAR;
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
