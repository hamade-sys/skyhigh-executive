/**
 * Airport slot bidding system (PRD slot mechanic).
 *
 * Each airport has a finite number of weekly schedule slots. Slots are
 * awarded via end-of-quarter blind-bid auction:
 *  - Players submit bids of (airport, slots wanted, price/slot) any time.
 *  - At end of quarter, bids are sorted by price descending and slots are
 *    awarded to the highest bidder until `available` is exhausted.
 *  - Unsold slots roll forward. Each Q4/Q8/Q12/Q16 the airport opens a new
 *    batch of slots based on its tier.
 *
 * 1 weekly schedule = 1 slot at each endpoint (origin + destination).
 * So a 13/week route consumes 13 slots at origin AND 13 at destination.
 *
 * Tier targets per PRD user spec:
 *  - Tier 1 starts 200, ends ~1000 (40Q × ~40/Q = ~800 added)
 *  - Tier 2 starts 250, ends ~750 (~125/year added)
 *  - Tier 3 starts 50, ends ~300 (~63/year added)
 *  - Tier 4 (PRD doesn't specify, modelled as half of Tier 3)
 *
 * Pricing per PRD:
 *  - Tier 2 base = $80K
 *  - Tier 1 = $80K × 1.5 = $120K (50% premium)
 *  - Tier 3 = $80K × 0.5 = $40K (50% cheaper)
 *  - Tier 4 = $20K
 */

import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import type { AirportSlotState, CityTier, Team } from "@/types/game";
import {
  cityTierToLadder,
  AIRPORT_TIER_SPECS,
  playerAvailableSlots,
  backgroundSlotsUsed,
} from "@/lib/airport-system-v2";
import { AIRPORT_MAX_CAPACITY_BY_TIER } from "@/lib/airport-ownership";

/** Starting slot capacity per tier. */
export const STARTING_SLOTS_BY_TIER: Record<CityTier, number> = {
  1: 200,
  2: 250,
  3: 50,
  4: 25,
};

/** Approximate slots added per yearly tick per tier. End-of-game
 *  targets stay PRD-aligned (T1: ~1000, T2: ~750, T3: ~300, T4: ~150)
 *  but with 9 yearly ticks in the new 40-round game we add fewer per
 *  tick. */
export const YEARLY_SLOTS_BY_TIER: Record<CityTier, number> = {
  1: 90,  // 200 → ~1000 over 9 yearly ticks
  2: 56,  // 250 → ~750
  3: 28,  // 50  → ~300
  4: 14,  // 25  → ~150
};

/** Base price per slot at quarter-close auction (PRD scaling: T2 = anchor).
 *
 *  These are PER-WEEK rents. Workshop iteration log:
 *
 *  Round 0 (pre-rebalance): T1 $45K / T2 $30K / T3 $15K / T4 $7.5K
 *    Slot at 43% of route cost; fuel at 3%. Inverted vs real-world.
 *
 *  Round 1 (May 2026 first pass): T1 $10K / T2 $7K / T3 $3K / T4 $1.5K
 *    Slot at ~15% of cost; fuel at ~8%. User flag: "8% on fuel is
 *    still very low... considering this is not discounted wholesale
 *    fuel."
 *
 *  Round 2 (May 2026 second pass): T1 $5K / T2 $3.5K / T3 $1.5K / T4 $750
 *    Cut another 50%. Combined with fuel burn factor 1.6 → 2.5, the
 *    cost mix now targets: fuel ~13-15% · slot ~6-8% · staff ~22% ·
 *    maintenance ~16% · hub ~7% · rest ~30%. Slot is still 2-3× the
 *    real-world industry share (3-5%) but the gap is acceptable —
 *    workshop participants need slot bidding to be a meaningful lever
 *    in the strategy game, and a too-cheap slot model removes that
 *    tension.
 *
 *  Anchor reference: Heathrow's published recurring slot rent is
 *  ~$100K/year. T2 at $3.5K/wk = ~$182K/year per slot — 1.8× the
 *  real anchor. T1 hubs like JFK are nominally more expensive in
 *  reality so 2.7× makes sense at the top tier.
 */
export const BASE_SLOT_PRICE_BY_TIER: Record<CityTier, number> = {
  1: 5_000,  // 1.43× anchor
  2: 3_500,  // anchor
  3: 1_500,  // 0.43× anchor
  4: 750,    // 0.21× anchor
};

/** Yearly slot tick — once per calendar year (every 4 rounds in the
 *  40-round game). Round 5 = Q1 2016, round 9 = Q1 2017, etc. */
export const YEARLY_TICK_QUARTERS = [5, 9, 13, 17, 21, 25, 29, 33, 37];

export function nextTickQuarter(currentQuarter: number): number {
  return YEARLY_TICK_QUARTERS.find((q) => q > currentQuarter) ?? 99;
}

/** Build the initial slot state for every city when a game starts.
 *
 *  V1 (default): flat per-tier starting pool that grows on yearly ticks.
 *
 *  V2 (`opts.v2`, session.airportSystemV2 only): the airport's true size is
 *  its tier-spec `slotCeiling`; simulated background carriers occupy a large
 *  ladder-dependent share (see AIRPORT_BACKGROUND_PCT), leaving players a
 *  contested remainder. We seed `available` to that remainder at game start
 *  (progress 0), and stamp `ladder` + `totalCapacity` so the downstream
 *  acquisition/auction/ownership phases have their inputs. Gated: when
 *  `v2` is false the output is byte-identical to V1. */
export function makeInitialAirportSlots(
  opts?: { v2?: boolean },
): Record<string, AirportSlotState> {
  const v2 = opts?.v2 ?? false;
  const out: Record<string, AirportSlotState> = {};
  for (const city of CITIES) {
    const tier = city.tier as CityTier;
    if (v2) {
      const ladder = cityTierToLadder(tier);
      const ceiling = AIRPORT_TIER_SPECS[ladder].slotCeiling;
      out[city.code] = {
        // Contested remainder after background traffic at game start.
        available: playerAvailableSlots(ceiling, ladder, 0),
        // V2 capacity grows via slot-pack purchases (Phase 5), not the
        // V1 yearly drip — so no pre-announced opening.
        nextOpening: 0,
        nextTickQuarter: 5,
        ladder,
        totalCapacity: ceiling,
        backgroundSlotsUsed: backgroundSlotsUsed(ceiling, ladder, 0),
      };
    } else {
      out[city.code] = {
        available: STARTING_SLOTS_BY_TIER[tier],
        nextOpening: rollYearlyOpen(tier),
        nextTickQuarter: 5,
        // Capacity is a TRUE cap on Σ(leases) + available. It starts at the
        // tier's pool and grows on yearly ticks toward the tier max. Earlier
        // this was left undefined, which the type treats as "unlimited" — so
        // total leases could blow past the displayed capacity.
        totalCapacity: STARTING_SLOTS_BY_TIER[tier],
      };
    }
  }
  return out;
}

/** Random ±20% jitter around the tier baseline yearly add. Floor of 1. */
export function rollYearlyOpen(tier: CityTier): number {
  const base = YEARLY_SLOTS_BY_TIER[tier];
  const jitter = (Math.random() - 0.5) * 0.4; // ±20%
  return Math.max(1, Math.round(base * (1 + jitter)));
}

/** Apply yearly tick if currentQuarter has just hit one of the tick quarters.
 *  Adds the previously-announced nextOpening to available, rolls the next.
 *
 *  V2 (`opts.v2`): the yearly drip does not apply — V2 capacity grows only
 *  via owner-funded slot packs (Phase 5). A V2 airport just advances its
 *  tick marker; `available` and `nextOpening` (0) are left untouched so the
 *  contested-remainder model stays authoritative. Gated: when `v2` is false
 *  this is byte-identical to V1. */
export function applyYearlyTickIfDue(
  slots: Record<string, AirportSlotState>,
  currentQuarter: number,
  opts?: { v2?: boolean },
): { slots: Record<string, AirportSlotState>; ticked: boolean } {
  if (!YEARLY_TICK_QUARTERS.includes(currentQuarter)) {
    return { slots, ticked: false };
  }
  const v2 = opts?.v2 ?? false;
  const out: Record<string, AirportSlotState> = {};
  for (const code of Object.keys(slots)) {
    const city = CITIES_BY_CODE[code];
    if (!city) {
      out[code] = slots[code];
      continue;
    }
    const tier = city.tier as CityTier;
    const cur = slots[code];
    if (v2) {
      // V2: no yearly drip; just advance the tick marker.
      out[code] = { ...cur, nextTickQuarter: nextTickQuarter(currentQuarter) };
      continue;
    }
    // Preserve ownership / capacity / acquisition fields. Earlier this
    // overwrote the entry with a fresh object literal which silently
    // wiped `ownerTeamId`, `ownerSlotRatePerWeekUsd`, `totalCapacity`,
    // `acquiredAtQuarter`, `purchaseCostUsd` on every yearly tick —
    // an owned airport would suddenly become "unowned" at Q5/Q9/Q13/Q17.
    // Grow the true capacity ceiling by the opened batch (capped at the
    // tier max). `available` follows; reconcileAirportSlots re-derives it
    // from capacity − Σ(leases) at quarter close, so this stays consistent.
    const tierMax = AIRPORT_MAX_CAPACITY_BY_TIER[tier as 1 | 2 | 3 | 4];
    const grownCap = Math.min(
      tierMax,
      (cur.totalCapacity ?? STARTING_SLOTS_BY_TIER[tier]) + cur.nextOpening,
    );
    out[code] = {
      ...cur,
      totalCapacity: grownCap,
      available: cur.available + cur.nextOpening,
      nextOpening: rollYearlyOpen(tier),
      nextTickQuarter: nextTickQuarter(currentQuarter),
    };
  }
  return { slots: out, ticked: true };
}

/** Resolve all pending bids on every airport this quarter.
 *  Returns updated slot pool, awarded slots per team, and total cash spent
 *  per team. Highest pricePerSlot wins; ties resolve by submission order. */
export interface BidEntry {
  teamId: string;
  airportCode: string;
  slots: number;
  pricePerSlot: number;
  quarterSubmitted: number;
}

export interface ResolvedBid {
  teamId: string;
  airportCode: string;
  slotsWon: number;
  /** Weekly price per slot the team committed to (Model B recurring fee).
   *  Total quarterly cost added to this team's lease at this airport
   *  is `slotsWon × weeklyPricePerSlot × 13`. */
  weeklyPricePerSlot: number;
}

export function resolveSlotAuctions(
  slots: Record<string, AirportSlotState>,
  bidsByAirport: Record<string, BidEntry[]>,
): {
  slots: Record<string, AirportSlotState>;
  awards: ResolvedBid[];
  /** Per-airport "price to beat" — only present for airports that sold
   *  out (had at least one loser). It is the lowest WINNING price/slot at
   *  that airport: a loser must bid strictly above this to win next quarter.
   *  Airports that did NOT sell out are absent (any bid ≥ base wins, so
   *  there is nothing to "beat"). Surfaced to the player in the loss toast
   *  and on the pending route's `pendingReason` so they can counter-bid. */
  clearingPriceByAirport: Record<string, number>;
} {
  const out = { ...slots };
  const awards: ResolvedBid[] = [];
  const clearingPriceByAirport: Record<string, number> = {};
  for (const code of Object.keys(bidsByAirport)) {
    const bids = bidsByAirport[code];
    if (!bids || bids.length === 0) continue;
    const state = out[code];
    if (!state) continue;
    let remaining = state.available;
    // Sort by price desc, then submission order asc
    const sorted = [...bids].sort(
      (a, b) =>
        b.pricePerSlot - a.pricePerSlot ||
        a.quarterSubmitted - b.quarterSubmitted,
    );
    // Track the lowest winning price + whether anyone lost, so we can
    // report a "price to beat" only when the airport actually sold out.
    let lowestWinningPrice = Infinity;
    let hadLoser = false;
    for (const bid of sorted) {
      if (remaining <= 0) {
        // Loser — record as 0 win so caller can show feedback. NO charge.
        awards.push({
          teamId: bid.teamId,
          airportCode: code,
          slotsWon: 0,
          weeklyPricePerSlot: 0,
        });
        hadLoser = true;
        continue;
      }
      const won = Math.min(bid.slots, remaining);
      remaining -= won;
      if (bid.pricePerSlot < lowestWinningPrice) {
        lowestWinningPrice = bid.pricePerSlot;
      }
      awards.push({
        teamId: bid.teamId,
        airportCode: code,
        slotsWon: won,
        weeklyPricePerSlot: bid.pricePerSlot,
      });
    }
    if (hadLoser && lowestWinningPrice !== Infinity) {
      clearingPriceByAirport[code] = lowestWinningPrice;
    }
    out[code] = { ...state, available: remaining };
  }
  return { slots: out, awards, clearingPriceByAirport };
}

// ─────────────────────────────────────────────────────────────────────
//  Capacity reconciliation (2026-05)
//
//  The V1 slot model let total leases blow past the airport's nominal
//  capacity: `totalCapacity` was never set on V1 airports (so the type's
//  "undefined = unlimited" rule disabled the cap), while the `available`
//  pool grew unbounded via the yearly drip and bots hoarded slots over
//  many years. Result: a Tier-1 hub showing "800 / 1400" while four
//  tenants collectively held 1,114 slots — numbers that don't reconcile.
//
//  `reconcileAirportSlots` makes capacity a TRUE cap and is safe to run on
//  any save (one-time migration) and every quarter close (ongoing
//  enforcement). For each airport it:
//    1. Derives a real capacity: the tier's grown ceiling (starting slots
//       + the yearly opens that have fired by `currentQuarter`, capped at
//       the tier max), never below the slots the airlines' active routes
//       actually consume (`used`) so no one's operations get stranded.
//    2. If total leases exceed that capacity, trims the EXCESS (held −
//       used) proportionally, largest-excess first — never cutting a team
//       below what its routes need.
//    3. Sets `available = capacity − Σ(leases)` so the auction can never
//       re-over-allocate.
// ─────────────────────────────────────────────────────────────────────

/** Number of yearly slot openings that have fired on/before `quarter`. */
function yearlyTicksFired(quarter: number): number {
  return YEARLY_TICK_QUARTERS.filter((q) => q <= quarter).length;
}

/** The grown slot ceiling a tier-`tier` airport should have by `quarter`:
 *  starting slots + fired yearly openings (average), capped at the tier max. */
function grownCeiling(tier: CityTier, quarter: number): number {
  const start = STARTING_SLOTS_BY_TIER[tier];
  const grown = start + yearlyTicksFired(quarter) * YEARLY_SLOTS_BY_TIER[tier];
  const max = AIRPORT_MAX_CAPACITY_BY_TIER[tier as 1 | 2 | 3 | 4];
  return Math.min(max, Math.round(grown));
}

/** Weekly slot usage of a team's routes at a given airport (1 weekly
 *  schedule = 1 slot at each endpoint). Active, suspended and pending
 *  routes all reserve their slots. */
function teamUsedAt(team: Team, code: string): number {
  let used = 0;
  for (const r of team.routes) {
    if (r.status !== "active" && r.status !== "suspended" && r.status !== "pending") continue;
    if (r.originCode !== code && r.destCode !== code) continue;
    used += Math.round(r.dailyFrequency * 7);
  }
  return used;
}

export function reconcileAirportSlots(
  teams: Team[],
  airportSlots: Record<string, AirportSlotState>,
  currentQuarter: number,
): { teams: Team[]; airportSlots: Record<string, AirportSlotState>; changed: boolean } {
  // Every airport that has a slot-state entry OR any team lease.
  const codes = new Set<string>(Object.keys(airportSlots ?? {}));
  for (const t of teams) {
    for (const code of Object.keys(t.airportLeases ?? {})) codes.add(code);
  }

  // newHeld[code] -> Map(teamId -> newSlotCount), only for trimmed airports.
  const trimmed = new Map<string, Map<string, number>>();
  const capByCode = new Map<string, number>();
  let changed = false;

  for (const code of codes) {
    const city = CITIES_BY_CODE[code];
    if (!city) continue;
    const tier = city.tier as CityTier;
    const stored = airportSlots?.[code];

    const rows = teams.map((t) => {
      const held = t.airportLeases?.[code]?.slots ?? 0;
      const used = teamUsedAt(t, code);
      return { id: t.id, held, used, excess: Math.max(0, held - used) };
    });
    const totalHeld = rows.reduce((s, r) => s + r.held, 0);
    const totalUsed = rows.reduce((s, r) => s + r.used, 0);

    // Capacity: a stored cap wins (already migrated / owner-expanded);
    // otherwise reconstruct the grown ceiling. Never below committed usage,
    // never above the tier's physical max.
    const tierMax = AIRPORT_MAX_CAPACITY_BY_TIER[tier as 1 | 2 | 3 | 4];
    const base = stored?.totalCapacity ?? grownCeiling(tier, currentQuarter);
    const capacity = Math.min(tierMax, Math.max(base, totalUsed));
    capByCode.set(code, capacity);

    if (totalHeld <= capacity) continue; // already fits — only `available` updates

    // Over-allocated → remove the surplus from EXCESS only, proportionally.
    let toRemove = totalHeld - capacity;
    const totalExcess = rows.reduce((s, r) => s + r.excess, 0);
    if (totalExcess <= 0) continue; // nothing trimmable (all in use) — leave as-is
    toRemove = Math.min(toRemove, totalExcess);
    const cuts = rows.map((r) => {
      const raw = (r.excess / totalExcess) * toRemove;
      return { id: r.id, held: r.held, excess: r.excess, floor: Math.floor(raw), frac: raw - Math.floor(raw) };
    });
    let assigned = cuts.reduce((s, c) => s + c.floor, 0);
    // Distribute the rounding remainder to the largest fractions, bounded by excess.
    const order = [...cuts].sort((a, b) => b.frac - a.frac);
    for (const c of order) {
      if (assigned >= toRemove) break;
      if (c.floor < c.excess) { c.floor += 1; assigned += 1; }
    }
    const m = new Map<string, number>();
    for (const c of cuts) m.set(c.id, c.held - c.floor);
    trimmed.set(code, m);
    changed = true;
  }

  // Apply lease trims to teams (scale weekly cost with the new slot count,
  // keep slotsByAirport in sync).
  const newTeams = !changed ? teams : teams.map((t) => {
    let leases = t.airportLeases;
    let slotsBy = t.slotsByAirport;
    let touched = false;
    for (const [code, m] of trimmed) {
      const newHeld = m.get(t.id);
      if (newHeld == null) continue;
      const lease = t.airportLeases?.[code];
      const oldHeld = lease?.slots ?? 0;
      if (newHeld === oldHeld) continue;
      touched = true;
      const ratePerSlot = oldHeld > 0 ? (lease?.totalWeeklyCost ?? 0) / oldHeld : 0;
      leases = { ...leases, [code]: { slots: newHeld, totalWeeklyCost: Math.round(newHeld * ratePerSlot) } };
      slotsBy = { ...slotsBy, [code]: newHeld };
    }
    return touched ? { ...t, airportLeases: leases, slotsByAirport: slotsBy } : t;
  });

  // Recompute available = capacity − Σ(leases) and write the real capacity.
  const newSlots: Record<string, AirportSlotState> = { ...airportSlots };
  for (const code of codes) {
    const capacity = capByCode.get(code);
    if (capacity == null) continue;
    const leasedNow = newTeams.reduce((s, t) => s + (t.airportLeases?.[code]?.slots ?? 0), 0);
    const cur = newSlots[code] ?? { available: 0, nextOpening: 0, nextTickQuarter: 5 };
    const available = Math.max(0, capacity - leasedNow);
    if (cur.totalCapacity !== capacity || cur.available !== available) changed = true;
    newSlots[code] = { ...cur, totalCapacity: capacity, available };
  }

  return { teams: newTeams, airportSlots: newSlots, changed };
}
