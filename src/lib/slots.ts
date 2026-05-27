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
 *  These are PER-WEEK rents. Workshop feedback (May 2026): the prior
 *  rates left routes consistently in the red because slot allocation
 *  was eating 40-45% of per-route operating cost vs the real-world
 *  industry share of 3-5% (US-domestic). A solo player with 105
 *  weekly slots at JFK (T1) at the old $45K/wk would owe ~$30M per
 *  quarter just for that one airport; on a $48M revenue route that's
 *  already 60%+ of the cost stack before fuel/staff/maintenance.
 *
 *  Rates now sit ~4× lower:
 *    T1 ~$520K/year per slot
 *    T2 ~$360K/year per slot
 *    T3 ~$155K/year per slot
 *    T4 ~$78K/year per slot
 *  Still 2-5× higher than Heathrow's published ~$100K/year recurring
 *  rent — leaves auction headroom for competitive overbidding without
 *  crushing the P&L. Combined with the fuel-burn bump in this release,
 *  cost mix lands at fuel ~7-9% / slot ~15% / staff ~22% / maintenance
 *  ~16%, which is closer to real-world without being slavishly so.
 *
 *  Previous: T1 $45K · T2 $30K · T3 $15K · T4 $7.5K
 *  Now:      T1 $10K · T2 $7K  · T3 $3K  · T4 $1.5K
 */
export const BASE_SLOT_PRICE_BY_TIER: Record<CityTier, number> = {
  1: 10_000, // 1.43× anchor
  2: 7_000,  // anchor
  3: 3_000,  // 0.43× anchor
  4: 1_500,  // 0.21× anchor
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
): { slots: Record<string, AirportSlotState>; awards: ResolvedBid[] } {
  const out = { ...slots };
  const awards: ResolvedBid[] = [];
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
    for (const bid of sorted) {
      if (remaining <= 0) {
        // Loser — record as 0 win so caller can show feedback. NO charge.
        awards.push({
          teamId: bid.teamId,
          airportCode: code,
          slotsWon: 0,
          weeklyPricePerSlot: 0,
        });
        continue;
      }
      const won = Math.min(bid.slots, remaining);
      remaining -= won;
      awards.push({
        teamId: bid.teamId,
        airportCode: code,
        slotsWon: won,
        weeklyPricePerSlot: bid.pricePerSlot,
      });
    }
    out[code] = { ...state, available: remaining };
  }
  return { slots: out, awards };
}
