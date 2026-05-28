/**
 * Underdog Boost Events — Campaign Brief §13
 *
 * At fixed round positions (R10/R20/R30/R40 in a 60R cohort), the
 * last-place team by airline value gets a story-driven boost. Some
 * trigger rounds have an "alternate" variant that fires instead of
 * the standard one when the gap to second-to-last exceeds a $-threshold.
 *
 * Detection runs once per round at the END of close (after all teams'
 * airline values have updated). Effects are applied to the chosen
 * team's persisted state immediately, then read by the engine on
 * subsequent quarters via:
 *   - team.underdogBoosts.loadFactorFloor    → revenue calc
 *   - team.underdogBoosts.businessDemandMultiplier → routeDemandPerDay
 *   - team.flags (e.g. "sovereign_rescue")    → scoring/UI
 *
 * Workshop note (May 2026): the WHOLE point of this system is to keep
 * the last-place player engaged. The brief explicitly says other teams
 * SEE the headline and the boost name — that pressure is intentional.
 */

import type { Team } from "@/types/game";
import { CITIES_BY_CODE } from "@/data/cities";

/**
 * Round positions where boost events fire. In a 60R cohort these are
 * R10/R20/R30/R40. We generalise by relative position so other campaign
 * lengths get proportional triggers — a 120R full campaign fires at
 * R20/R40/R60/R80 (same arc position as 60R's R10/R20/R30/R40).
 */
export function underdogBoostRounds(totalRounds: number): number[] {
  // Relative positions: 1/6, 1/3, 1/2, 2/3 of the campaign.
  return [
    Math.max(2, Math.round(totalRounds / 6)),
    Math.max(4, Math.round(totalRounds / 3)),
    Math.max(6, Math.round(totalRounds / 2)),
    Math.max(8, Math.round((totalRounds * 2) / 3)),
  ];
}

/** Which underdog event index (0..3) corresponds to the current
 *  quarter, or -1 if no boost fires this round. */
export function underdogBoostIndexForRound(
  currentQuarter: number,
  totalRounds: number,
): number {
  const rounds = underdogBoostRounds(totalRounds);
  return rounds.indexOf(currentQuarter);
}

/** Gap thresholds scale with campaign length — bigger campaigns mean
 *  bigger team values, so the same $200M gap is much smaller relative
 *  to airline value in a 120R game. */
function gapThreshold(baseUsd: number, totalRounds: number): number {
  return baseUsd * (totalRounds / 60);
}

export interface UnderdogBoostResult {
  /** Team id that received the boost. */
  teamId: string;
  /** Boost variant identifier (matches the brief's labels). */
  variant:
    | "sneeeko"
    | "gov_tailwind"
    | "lawsuit"
    | "home_city_deal"
    | "debt_settlement"
    | "documentary";
  /** Headline shown to ALL teams (with airline name + city/country
   *  interpolated). */
  headline: string;
  /** Detail paragraph for the news-feed expansion. */
  detail: string;
  /** Cash injection applied (lawsuit only). */
  cashUsd: number;
  /** Debt cleared (sovereign rescue only). */
  debtClearedUsd: number;
  /** Brand pts added (one-time). */
  brandPtsDelta: number;
  /** Loyalty % added (one-time). */
  loyaltyPctDelta: number;
  /** Ops pts added (one-time). */
  opsPtsDelta: number;
  /** Flags written to team.flags. */
  flagsAdded: string[];
}

/**
 * Detect + compute the underdog boost for the current quarter, if any.
 * Returns `null` if no boost fires (wrong round, not enough teams,
 * already-applied this round to last place, etc.).
 *
 * Caller is responsible for mutating the chosen team's state with the
 * returned deltas + writing the headline to the news feed. We keep
 * the function pure so unit tests can exercise the decision logic
 * without state-mutation side effects.
 */
export function detectUnderdogBoost(
  teams: Team[],
  currentQuarter: number,
  totalRounds: number,
  computeAirlineValue: (t: Team) => number,
): UnderdogBoostResult | null {
  const idx = underdogBoostIndexForRound(currentQuarter, totalRounds);
  if (idx < 0) return null;
  const rounds = underdogBoostRounds(totalRounds);
  const boostRound = rounds[idx];

  // Need at least 2 teams in the comparison (otherwise "last place"
  // is also "first place" — no signal).
  const eligible = teams.filter((t) => t.controlledBy !== "observer" as never);
  if (eligible.length < 2) return null;

  const sorted = [...eligible].sort(
    (a, b) => computeAirlineValue(a) - computeAirlineValue(b),
  );
  const lastPlace = sorted[0];
  const secondLast = sorted[1];
  if (!lastPlace || !secondLast) return null;

  // Already received this round's boost — one-shot per team per round.
  if (lastPlace.underdogBoosts?.receivedAtRounds.includes(boostRound)) {
    return null;
  }

  const city = CITIES_BY_CODE[lastPlace.hubCode];
  const fields = {
    airline_name: lastPlace.name || "the airline",
    hub_city_name: city?.name ?? "the hub city",
    // City has no `country` field — `regionName` is the closest we
    // have (e.g. "Western Europe", "East Asia") and reads cleanly in
    // a "{region} government designates..." headline.
    hub_country_name: city?.regionName ?? "the host country",
  };

  const gap = computeAirlineValue(secondLast) - computeAirlineValue(lastPlace);

  // Pick the variant based on which round index fired.
  switch (idx) {
    case 0: // R10 in 60R → Sneeeko viral moment
      return {
        teamId: lastPlace.id,
        variant: "sneeeko",
        headline:
          `[BRAND] Instagram megastar "Sneeeko" (47M followers) posts mid-flight on ` +
          `${fields.airline_name} — "this airline just changed my life no notes" hits 8.1M likes`,
        detail:
          `Sneeeko's fans are notoriously loyal travel followers. Within 48 hours, ` +
          `${fields.airline_name} routes are trending in 14 countries. The airline didn't ` +
          `pay for this. They just happened to be in the right place.`,
        cashUsd: 0,
        debtClearedUsd: 0,
        brandPtsDelta: 15,
        loyaltyPctDelta: 12,
        opsPtsDelta: 0,
        flagsAdded: ["viral_moment"],
      };

    case 1: // R20 in 60R → gov tailwind OR lawsuit (gap > 200M scaled)
      if (gap > gapThreshold(200_000_000, totalRounds)) {
        return {
          teamId: lastPlace.id,
          variant: "lawsuit",
          headline:
            `[FINANCE] Court rules in favour of ${fields.airline_name} — class action ` +
            `dismissed after judge rules passengers cannot claim damages for arriving too punctually`,
          detail:
            `In the most unusual aviation ruling in a decade, a class action filed by ` +
            `14,000 passengers claiming ${fields.airline_name}'s excessive punctuality caused ` +
            `them to miss connections has been dismissed. The judge noted: "Arriving on time ` +
            `is not a tort." The $110M held in provisions is released to the balance sheet.`,
          cashUsd: 110_000_000,
          debtClearedUsd: 0,
          brandPtsDelta: 12,
          loyaltyPctDelta: 8,
          opsPtsDelta: 0,
          flagsAdded: ["lawsuit_victor"],
        };
      }
      return {
        teamId: lastPlace.id,
        variant: "gov_tailwind",
        headline:
          `[OPS] ${fields.hub_country_name} designates ${fields.airline_name} a National ` +
          `Strategic Carrier — tax holiday and staff cost waiver package announced this morning`,
        detail:
          `Following a parliamentary motion, ${fields.hub_country_name}'s transport ministry ` +
          `announces a 3-round support package for airlines deemed strategically significant ` +
          `to national connectivity. ${fields.airline_name}, as the home carrier of ` +
          `${fields.hub_city_name}, qualifies automatically.`,
        cashUsd: 0,
        debtClearedUsd: 0,
        brandPtsDelta: 10,
        loyaltyPctDelta: 0,
        opsPtsDelta: 8,
        flagsAdded: ["government_champion"],
      };

    case 2: // R30 in 60R → home city deal OR debt settlement (gap > 250M scaled)
      if (gap > gapThreshold(250_000_000, totalRounds)) {
        return {
          teamId: lastPlace.id,
          variant: "debt_settlement",
          headline:
            `[FINANCE] ${fields.hub_country_name} government assumes full debt of ` +
            `${fields.airline_name} in landmark strategic intervention — airline debt ` +
            `written to zero effective immediately`,
          detail:
            `In an extraordinary move, the government of ${fields.hub_country_name} ` +
            `has assumed 100% of ${fields.airline_name}'s outstanding debt obligations, ` +
            `citing national strategic interest. ${fields.airline_name} carries zero debt ` +
            `from this round.`,
          cashUsd: 0,
          debtClearedUsd: Number.POSITIVE_INFINITY,
          brandPtsDelta: 20,
          loyaltyPctDelta: 12,
          opsPtsDelta: 10,
          flagsAdded: ["sovereign_rescue", "government_champion"],
        };
      }
      return {
        teamId: lastPlace.id,
        variant: "home_city_deal",
        headline:
          `[BUSINESS] ${fields.hub_city_name}-headquartered sovereign investment group ` +
          `signs exclusive global corporate travel agreement with ${fields.airline_name} — ` +
          `executive travel mandated through the airline for 4 rounds`,
        detail:
          `One of ${fields.hub_city_name}'s largest employers — with operations across 34 ` +
          `countries — has signed an exclusive corporate travel agreement with ` +
          `${fields.airline_name}. Every employee in their global network must book through ` +
          `${fields.airline_name} for business travel.`,
        cashUsd: 0,
        debtClearedUsd: 0,
        brandPtsDelta: 10,
        loyaltyPctDelta: 10,
        opsPtsDelta: 0,
        flagsAdded: ["anchor_contract"],
      };

    case 3: // R40 in 60R → comeback documentary
      return {
        teamId: lastPlace.id,
        variant: "documentary",
        headline:
          `[BRAND] Streaming platform drops "Rising: The ${fields.airline_name} Story" — ` +
          `documentary goes #1 in 22 countries within 72 hours of release`,
        detail:
          `The documentary follows ${fields.airline_name} from their first aircraft order ` +
          `through every crisis, near-collapse, and recovery. Critics call it "the most ` +
          `compelling corporate story of the decade." The brand halo effect is immediate.`,
        cashUsd: 0,
        debtClearedUsd: 0,
        brandPtsDelta: 25,
        loyaltyPctDelta: 18,
        opsPtsDelta: 0,
        flagsAdded: ["underdog_icon"],
      };
  }

  return null;
}

/**
 * Apply a detected boost to the team's state, returning the updated
 * team object. Pure function — caller is responsible for slotting the
 * new team back into the array + emitting the headline.
 *
 * Effects summary by variant:
 *   - sneeeko       : brand+15, loyalty+12, load factor floor 1.0 × 4Q
 *   - gov_tailwind  : brand+10, ops+8 (staff/tax waivers deferred, see PR note)
 *   - lawsuit       : brand+12, loyalty+8, +$110M cash
 *   - home_city_deal: brand+10, loyalty+10, biz demand × 1.60 × 4Q
 *   - debt_settlement: brand+20, loyalty+12, ops+10, debt → 0
 *   - documentary   : brand+25, loyalty+18, load factor floor 1.20 × 3Q,
 *                     endgameBrandMultiplier 1.05
 */
export function applyUnderdogBoost(
  team: Team,
  boost: UnderdogBoostResult,
  currentQuarter: number,
): Team {
  const next: Team = {
    ...team,
    flags: new Set(team.flags),
    brandPts: team.brandPts + boost.brandPtsDelta,
    opsPts: team.opsPts + boost.opsPtsDelta,
    customerLoyaltyPct: Math.min(100, team.customerLoyaltyPct + boost.loyaltyPctDelta),
    cashUsd: team.cashUsd + boost.cashUsd,
    // Debt clear: wipe every active loan + RCF so the brief's "carries
    // zero debt" promise actually holds. The loans array carries the
    // outstanding principal; emptying it stops the next quarter's
    // interest/principal drain. RCF balance also wiped (otherwise the
    // player still pays 2× base on it next Q).
    loans: boost.debtClearedUsd === Number.POSITIVE_INFINITY ? [] : team.loans,
    rcfBalanceUsd: boost.debtClearedUsd === Number.POSITIVE_INFINITY ? 0 : team.rcfBalanceUsd,
    underdogBoosts: {
      receivedAtRounds: [
        ...(team.underdogBoosts?.receivedAtRounds ?? []),
        currentQuarter,
      ],
      loadFactorFloor: team.underdogBoosts?.loadFactorFloor,
      businessDemandMultiplier: team.underdogBoosts?.businessDemandMultiplier,
      endgameBrandMultiplier: team.underdogBoosts?.endgameBrandMultiplier,
    },
  };

  for (const flag of boost.flagsAdded) {
    next.flags.add(flag);
  }

  // Variant-specific duration effects.
  if (boost.variant === "sneeeko") {
    next.underdogBoosts!.loadFactorFloor = {
      value: 1.0,
      untilQuarter: currentQuarter + 4,
    };
  }
  if (boost.variant === "home_city_deal") {
    next.underdogBoosts!.businessDemandMultiplier = {
      value: 1.6,
      untilQuarter: currentQuarter + 4,
    };
  }
  if (boost.variant === "documentary") {
    next.underdogBoosts!.loadFactorFloor = {
      value: 1.2,
      untilQuarter: currentQuarter + 3,
    };
    next.underdogBoosts!.endgameBrandMultiplier = 1.05;
  }

  return next;
}

/** Read the currently active load-factor floor for a team, or 0 if
 *  none is active this quarter. Engine clamps occupancy up to this
 *  during revenue computation. Capped by capacity, not demand —
 *  this is "fill every seat" not "manufacture passengers". */
export function activeLoadFactorFloor(team: Team, currentQuarter: number): number {
  const lf = team.underdogBoosts?.loadFactorFloor;
  if (!lf) return 0;
  if (currentQuarter > lf.untilQuarter) return 0;
  return lf.value;
}

/** Read the currently active business-demand multiplier for a team
 *  (Anchor Contract R30A only), or 1.0 if none is active. Applied to
 *  business demand inside routeDemandPerDay. */
export function activeBusinessDemandMultiplier(team: Team, currentQuarter: number): number {
  const m = team.underdogBoosts?.businessDemandMultiplier;
  if (!m) return 1.0;
  if (currentQuarter > m.untilQuarter) return 1.0;
  return m.value;
}
