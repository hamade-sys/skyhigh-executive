/**
 * Hub-pricing — onboarding hub selection cost.
 *
 * Player gets +$200M onboarding capital on top of the $150M base
 * (so $350M total to spend), and pays for their hub airport from
 * that pool. Bigger hubs cost more upfront but seed brand/route
 * advantages later. ALL playable cities (T1–T4) are pickable.
 *
 * Compressed price curve (workshop feedback May 2026): highest hub
 * is $100M, lowest is $20M, in $20M steps. Earlier the spread was
 * $300M → $25M which left Premium-hub players with ~$50M operating
 * cash and made the upfront fee dominate strategic differentiation.
 * The structural advantages of a high-tier hub (slot pool, demand
 * bonus, airport ownership economics — see `src/lib/slots.ts` and
 * `src/lib/airport-ownership.ts`) still strongly reward the bigger
 * pick; the upfront fee no longer needs to do that job alone.
 *
 * Premium hubs ($100M):  London (LHR), Paris (CDG), New York (JFK),
 *                        San Francisco (SFO), Dubai (DXB).
 * Tier 1  ($80M):        Other tier-1 hubs (HKG, LAX, ORD, SIN,
 *                        FRA, AMS, NRT — anything tier 1 not in the
 *                        premium list).
 * Tier 2  ($60M):        Tier-2 cities.
 * Tier 3  ($40M):        Tier-3 cities.
 * Tier 4  ($20M):        Smallest tier — niche / hometown bet.
 *
 * Effective starting cash = 150M base + 200M onboarding − hubCost.
 *   Premium hub:  $250M starting cash · best amplifier
 *   T1:           $270M starting cash
 *   T2:           $290M starting cash
 *   T3:           $310M starting cash
 *   T4:           $330M starting cash · cheapest, smallest market
 */

import type { City, CityTier, CampaignMode } from "@/types/game";

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

/** Hub price for the legacy 40r compressed campaign. Kept identical
 *  to the May-2026 workshop-feedback rebalance so live 40r games
 *  experience zero economic shift. */
const HUB_PRICE_LEGACY_40R: Record<"premium" | 1 | 2 | 3 | 4, number> = {
  premium: 100_000_000,
  1: 80_000_000,
  2: 60_000_000,
  3: 40_000_000,
  4: 20_000_000,
};

/** Hub price for the 60r / 120r campaigns (Campaign Expansion brief
 *  Section 2). Substantially lower — Premium $50M down from $100M.
 *  The L0 cash bonus (see l0CashBonusUsd) partially backfills for
 *  top-ranked players; the broader rationale is that 60-quarter
 *  campaigns generate enough operating profit downstream that the
 *  upfront cost no longer needs to throttle differentiation.
 *
 *  Tier 4 not in the brief — defaults to Tier 3's $5M so the
 *  picker still has every city available without a $0 freebie. */
const HUB_PRICE_CAMPAIGN: Record<"premium" | 1 | 2 | 3 | 4, number> = {
  premium: 50_000_000,
  1: 30_000_000,
  2: 15_000_000,
  3: 5_000_000,
  4: 5_000_000,
};

/** Hub purchase price for the selected city. Pricing varies by
 *  campaign mode: legacy 40r retains the existing ladder; 60r/120r
 *  use the brief's substantially-lower ladder paired with the L0
 *  cash bonus. Callers that don't yet thread `campaignMode` resolve
 *  to "40r" (default) and keep the existing prices. */
export function hubPriceUsd(city: City, campaignMode: CampaignMode = "40r"): number {
  const table =
    campaignMode === "60r" || campaignMode === "120r"
      ? HUB_PRICE_CAMPAIGN
      : HUB_PRICE_LEGACY_40R;
  if (PREMIUM_HUB_CODES.has(city.code)) return table.premium;
  switch (city.tier as CityTier) {
    case 1: return table[1];
    case 2: return table[2];
    case 3: return table[3];
    case 4: return table[4];
    default: return table[4];
  }
}

/** L0 cash bonus by rank. The Campaign Expansion brief grants the
 *  top-ranked player +$50M of operating cash at game start, with a
 *  $15M step down per rank to +$0M at 5th. Applied ONLY for 60r and
 *  120r campaigns (legacy 40r unchanged).
 *
 *  Rank is 1-indexed. Out-of-range ranks (0, 6+) return 0.
 *
 *  L0 itself (the assessment that produces the rank) is not yet
 *  implemented — the lobby currently assigns ranks by join order as
 *  a placeholder. A future PR will wire up a real pre-game
 *  ranking flow. */
export function l0CashBonusUsd(rank: number, campaignMode: CampaignMode): number {
  if (campaignMode === "40r") return 0;
  switch (rank) {
    case 1: return 50_000_000;
    case 2: return 35_000_000;
    case 3: return 20_000_000;
    case 4: return 10_000_000;
    case 5: return 0;
    default: return 0;
  }
}

/** Display label for the hub's price tier — qualitative, no
 *  multipliers, matches the doctrine card style. */
export function hubTierLabel(city: City): string {
  if (PREMIUM_HUB_CODES.has(city.code)) return "Premium gateway";
  if (city.tier === 1) return "Tier 1 hub";
  if (city.tier === 2) return "Tier 2 hub";
  if (city.tier === 3) return "Tier 3 hub";
  if (city.tier === 4) return "Tier 4 hub";
  return "Hub";
}

/** Every playable city is pickable as a hub (T1 through T4). Sorted
 *  by price desc then name asc inside each tier so premium hubs
 *  lead and ties resolve alphabetically. */
export function hubPickableCities(cities: City[]): City[] {
  return [...cities].sort((a, b) => {
    const ap = hubPriceUsd(a);
    const bp = hubPriceUsd(b);
    if (ap !== bp) return bp - ap;
    return a.name.localeCompare(b.name);
  });
}
