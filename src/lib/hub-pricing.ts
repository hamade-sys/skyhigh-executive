/**
 * Hub-pricing — onboarding hub selection cost.
 *
 * Player gets +$200M onboarding capital on top of the $150M base
 * (so $350M total to spend), and pays for their hub airport from
 * that pool. Bigger hubs cost more upfront but seed brand/route
 * advantages later. T4 cities are not pickable as hubs.
 *
 * Premium hubs ($300M):  London (LHR), Paris (CDG), New York (JFK),
 *                        San Francisco (SFO), Dubai (DXB).
 * Tier 1 ($200M):        Other tier-1 hubs (HKG, LAX, ORD, SIN,
 *                        FRA, AMS, NRT — anything tier 1 not in the
 *                        premium list).
 * Tier 2 ($100M):        Tier-2 cities.
 * Tier 3 ($50M):         Tier-3 cities.
 *
 * Effective starting cash = 150M base + 200M onboarding − hubCost.
 *   Premium hub:  $50M starting cash · best amplifier
 *   T1:          $150M starting cash
 *   T2:          $250M starting cash
 *   T3:          $300M starting cash · cheapest, smallest market
 */

import type { City, CityTier } from "@/types/game";

/** Hardcoded premium-hub list. These five sit a tier above the
 *  general tier-1 pool because of their global gateway role
 *  (yield curve, slot scarcity, business mix). */
export const PREMIUM_HUB_CODES: ReadonlySet<string> = new Set([
  "LHR", "CDG", "JFK", "SFO", "DXB",
]);

export const ONBOARDING_BASE_CASH_USD = 150_000_000;
export const ONBOARDING_HUB_BUDGET_USD = 200_000_000;
/** Total pool the onboarding hub picker spends from. */
export const ONBOARDING_TOTAL_BUDGET_USD =
  ONBOARDING_BASE_CASH_USD + ONBOARDING_HUB_BUDGET_USD;

export function hubPriceUsd(city: City): number {
  if (PREMIUM_HUB_CODES.has(city.code)) return 300_000_000;
  switch (city.tier as CityTier) {
    case 1: return 200_000_000;
    case 2: return 100_000_000;
    case 3: return 50_000_000;
    case 4:
    default: return Number.POSITIVE_INFINITY; // not pickable
  }
}

/** Display label for the hub's price tier — qualitative, no
 *  multipliers, matches the doctrine card style. */
export function hubTierLabel(city: City): string {
  if (PREMIUM_HUB_CODES.has(city.code)) return "Premium gateway";
  if (city.tier === 1) return "Tier 1 hub";
  if (city.tier === 2) return "Tier 2 hub";
  if (city.tier === 3) return "Tier 3 hub";
  return "Not pickable as hub";
}

/** Cities playable as a hub — any non-T4 city. Sorted by price desc
 *  then name asc inside each tier so premium hubs lead. */
export function hubPickableCities(cities: City[]): City[] {
  return cities
    .filter((c) => c.tier !== 4)
    .sort((a, b) => {
      const ap = hubPriceUsd(a);
      const bp = hubPriceUsd(b);
      if (ap !== bp) return bp - ap;
      return a.name.localeCompare(b.name);
    });
}
