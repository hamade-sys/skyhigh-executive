import { CITIES_BY_CODE } from "@/data/cities";
import type { AirportSlotState, Team, AirportLease } from "@/types/game";

/**
 * Airport ownership economics (Sprint 10 / Q V2).
 *
 * Pricing model — per user spec:
 *   purchase_price = TIER_BASE_PRICE[tier]
 *                  + 4 × (current quarterly slot revenue at this airport)
 *
 * The "+4× quarterly slot revenue" represents the four-year payback on
 * existing slot fees the airport is currently extracting from operating
 * airlines. A high-value Tier-1 like LHR with $X / Q in slot revenue
 * costs base + 4× that.
 *
 * Capacity & expansion:
 *   - Each airport has a TOTAL_CAPACITY[tier] runway-slot ceiling.
 *   - Owner can fund +200-slot expansions until that ceiling is hit.
 *   - Each expansion costs EXPANSION_COST_PER_LEVEL[tier] and immediately
 *     adds 200 to availability (the slots open up for the owner to lease
 *     to themselves or to charge other airlines for at the owner-set rate).
 *
 * Slot rate (no bidding for owned airports):
 *   - The owner sets `ownerSlotRatePerWeekUsd` directly.
 *   - Every team's existing leases at this airport are recharged at the
 *     new rate at the next quarter close (no retroactive surcharge).
 *   - Owner collects the revenue; it surfaces in the team's quarterly
 *     P&L under "Subsidiary revenue" (rolled in with subsidiaries).
 */

/** Acquisition base price by airport tier — represents the
 *  "starting offer" before slot-revenue capitalisation. Tier 1 hubs
 *  are anchor assets ($1B+); regional airports are much cheaper. */
export const AIRPORT_BASE_PRICE_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 1_000_000_000,   // LHR / DXB / JFK / ORD class
  2:   400_000_000,
  3:   120_000_000,
  4:    40_000_000,
};

/** Maximum runway slot count an airport of this tier can ever reach,
 *  even with expansion investments. Used by the cap on +200 chunks. */
export const AIRPORT_MAX_CAPACITY_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 1_400, // big international hubs like LHR ~1,200 / qtr movement budget
  2:   900,
  3:   500,
  4:   220,
};

/** Default starting capacity for an unowned airport (used as a baseline
 *  before the owner has invested in any expansions). The auction-driven
 *  default flow doesn't actually need this number — only owners need to
 *  know how many slots are physically operable. */
export const AIRPORT_DEFAULT_CAPACITY_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 800,
  2: 500,
  3: 300,
  4: 140,
};

/** Cost to add +200 slots at the airport. Tier-1 expansions are
 *  expensive runway-or-terminal builds; tier-4 is mostly a tarmac
 *  re-stripe. Each call to expand consumes one bucket of cost. */
export const AIRPORT_EXPANSION_COST_PER_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 250_000_000,
  2:  90_000_000,
  3:  35_000_000,
  4:  12_000_000,
};

/** Slots added per expansion bucket. */
export const AIRPORT_EXPANSION_SLOTS = 200;

/** The owner's quarterly operating cost as a percentage of slot
 *  revenue — reflects ground crew, ATC, terminal upkeep. Net margin
 *  at full slot occupancy ends up around 60–70%, matching how real
 *  airport operators net their revenue. */
export const AIRPORT_OPEX_PCT_OF_REVENUE = 0.30;

/** Compute the current asking price to acquire a given airport based
 *  on the user's formula: base[tier] + 4 × current quarterly slot
 *  revenue at that airport (across every team's existing leases). */
export function airportAskingPriceUsd(
  airportCode: string,
  slotState: AirportSlotState | undefined,
  teams: Team[],
): number {
  const city = CITIES_BY_CODE[airportCode];
  if (!city) return 0;
  const tier = city.tier as 1 | 2 | 3 | 4;
  const base = AIRPORT_BASE_PRICE_BY_TIER[tier] ?? AIRPORT_BASE_PRICE_BY_TIER[4];
  // If already owned, asking price isn't really applicable — the airport
  // isn't on the market — but we surface base + cap-rate for display.
  // If unowned, sum the auction-cleared weekly fees across every team's
  // lease at this airport × 13 (weeks/quarter) to get current Q revenue.
  const quarterlyRevenue = teams.reduce((sum, t) => {
    const lease: AirportLease | undefined = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return sum;
    return sum + lease.totalWeeklyCost * 13;
  }, 0);
  // If the airport is owner-controlled, lease totalWeeklyCost reflects
  // the owner's set rate, so the math still applies.
  void slotState;
  return Math.round(base + 4 * quarterlyRevenue);
}

/** Quarterly slot revenue the airport's owner collects this round —
 *  exactly the team-side slot fee total, but credited to the owner. */
export function airportQuarterlySlotRevenueUsd(
  airportCode: string,
  teams: Team[],
): number {
  return teams.reduce((sum, t) => {
    const lease = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return sum;
    return sum + lease.totalWeeklyCost * 13;
  }, 0);
}

/** Reset all teams' lease weeklyCost at an owner-controlled airport
 *  so they pay the new owner-set rate. Returns updated `teams`.
 *  Used when the owner changes `ownerSlotRatePerWeekUsd`, and once
 *  during acquisition. The number of slots each team holds is
 *  unchanged — only the per-slot fee is rewritten. */
export function applyOwnerSlotRate(
  teams: Team[],
  airportCode: string,
  ratePerWeekUsd: number,
): Team[] {
  return teams.map((t) => {
    const lease = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return t;
    return {
      ...t,
      airportLeases: {
        ...t.airportLeases,
        [airportCode]: {
          slots: lease.slots,
          totalWeeklyCost: lease.slots * ratePerWeekUsd,
        },
      },
    };
  });
}

/** True if `team` currently owns the airport. */
export function isAirportOwner(
  team: Team,
  slotState: AirportSlotState | undefined,
): boolean {
  return !!slotState?.ownerTeamId && slotState.ownerTeamId === team.id;
}

/** Resolve an airport's effective capacity (post-expansions) for UI
 *  display + cap checks. Falls back to tier default when unowned. */
export function effectiveAirportCapacity(
  airportCode: string,
  slotState: AirportSlotState | undefined,
): number {
  if (slotState?.totalCapacity) return slotState.totalCapacity;
  const city = CITIES_BY_CODE[airportCode];
  if (!city) return AIRPORT_DEFAULT_CAPACITY_BY_TIER[4];
  return AIRPORT_DEFAULT_CAPACITY_BY_TIER[city.tier as 1 | 2 | 3 | 4] ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[4];
}
