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
import type { AirportSlotState, CityTier } from "@/types/game";

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

/** Build the initial slot state for every city when a game starts. */
export function makeInitialAirportSlots(): Record<string, AirportSlotState> {
  const out: Record<string, AirportSlotState> = {};
  for (const city of CITIES) {
    const tier = city.tier as CityTier;
    out[city.code] = {
      available: STARTING_SLOTS_BY_TIER[tier],
      nextOpening: rollYearlyOpen(tier),
      nextTickQuarter: 5,
    };
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
 *  Adds the previously-announced nextOpening to available, rolls the next. */
export function applyYearlyTickIfDue(
  slots: Record<string, AirportSlotState>,
  currentQuarter: number,
): { slots: Record<string, AirportSlotState>; ticked: boolean } {
  if (!YEARLY_TICK_QUARTERS.includes(currentQuarter)) {
    return { slots, ticked: false };
  }
  const out: Record<string, AirportSlotState> = {};
  for (const code of Object.keys(slots)) {
    const city = CITIES_BY_CODE[code];
    if (!city) {
      out[code] = slots[code];
      continue;
    }
    const tier = city.tier as CityTier;
    const cur = slots[code];
    // Preserve ownership / capacity / acquisition fields. Earlier this
    // overwrote the entry with a fresh object literal which silently
    // wiped `ownerTeamId`, `ownerSlotRatePerWeekUsd`, `totalCapacity`,
    // `acquiredAtQuarter`, `purchaseCostUsd` on every yearly tick —
    // an owned airport would suddenly become "unowned" at Q5/Q9/Q13/Q17.
    out[code] = {
      ...cur,
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
