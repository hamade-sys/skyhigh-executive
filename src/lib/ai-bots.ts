/**
 * AI bot players for SkyForce.
 *
 * Three difficulty profiles drive every quarterly decision:
 *
 *   EASY    — random / passive. Doesn't always order aircraft, opens
 *             a few routes haphazardly, picks safe scenario options,
 *             never bids aggressively. Mostly a punching bag.
 *
 *   MEDIUM  — balanced strategist. Orders ~1-2 aircraft when cash >= 2x
 *             buy price, opens 1-2 routes per quarter, prices at market,
 *             bids floor+25% on slots, picks PRD's recommended scenario
 *             options where defined. Default difficulty for facilitated
 *             test runs.
 *
 *   HARD    — aggressive optimizer. Orders aircraft whenever ROI looks
 *             positive, opens routes opportunistically, prices to
 *             undercut leader on price-sensitive routes / overprice
 *             on brand-sensitive, bids floor+60% on contested slots,
 *             picks revenue-maximizing scenario options.
 *
 * Bots run during quarter close — runBotTurn(team, ctx) is called for
 * every non-player team that has been flagged with `botDifficulty`.
 * The function returns a list of state mutations the engine applies.
 */

import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { distanceBetween, maxRouteDailyFrequency, baseFareForDistance } from "@/lib/engine";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import type { Team, FleetAircraft, Route, City, PricingTier } from "@/types/game";

export type BotDifficulty = "easy" | "medium" | "hard";

interface BotProfile {
  // Cash thresholds for actions, as multiplier of aircraft price
  orderAircraftCashRatio: number;
  // Probability the bot takes any action this quarter at all
  actionProbability: number;
  // How aggressively to expand network: max routes opened per quarter
  routesOpenedPerQuarter: number;
  // Slot bid multiplier above floor
  slotBidMultiplier: number;
  // Pricing tendency: -1 budget, 0 standard, +1 premium
  pricingBias: number;
  // How willing to take on debt to expand (0 = avoid, 1 = aggressive)
  debtTolerance: number;
  // Scenario picks for known scenarios (option ID by scenario ID)
  scenarioPicks: Record<string, string>;
}

const PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    orderAircraftCashRatio: 3,
    actionProbability: 0.55,
    routesOpenedPerQuarter: 1,
    slotBidMultiplier: 1.0,
    pricingBias: 0,
    debtTolerance: 0,
    scenarioPicks: {
      // Easy bots tend to pick safe / cautious options
      S1: "A", // Self-report (safest)
      S2: "A", // Reroute (safest)
      S3: "C", // Decline flash deal
      S4: "B", // 6-month partial hedge
      S5: "B", // Take partial gov deal
      S6: "B", // Decline refinancing
      S7: "D", // Codeshare (passive)
      S8: "B", // Negotiate 3
      S9: "C", // Split budget
      S10: "C", // Small bid
      S11: "B", // National team only
      S12: "A", // Terminate ambassador
      S13: "B", // Conservative AI rollout
      S14: "B", // Counter cap
      S15: "B", // Temporary measures
      S16: "A", // Lock in defensive
      S17: "B", // Comply
      S18: "A", // Pay premium (safest, keep brand)
    },
  },
  medium: {
    orderAircraftCashRatio: 2,
    actionProbability: 0.85,
    routesOpenedPerQuarter: 2,
    slotBidMultiplier: 1.25,
    pricingBias: 0,
    debtTolerance: 0.4,
    scenarioPicks: {
      // PRD-recommended balanced picks
      S1: "A",  S2: "A",  S3: "D",  S4: "D",
      S5: "A",  S6: "A",  S7: "B",  S8: "A",
      S9: "A",  S10: "B", S11: "A", S12: "B",
      S13: "C", S14: "C", S15: "B", S16: "B",
      S17: "C", S18: "A",
    },
  },
  hard: {
    orderAircraftCashRatio: 1.2,
    actionProbability: 0.95,
    routesOpenedPerQuarter: 3,
    slotBidMultiplier: 1.6,
    pricingBias: 1,
    debtTolerance: 0.7,
    scenarioPicks: {
      // Aggressive revenue/share-maximizing picks
      S1: "B",  S2: "C",  S3: "A",  S4: "A",
      S5: "A",  S6: "A",  S7: "A",  S8: "A",
      S9: "A",  S10: "A", S11: "A", S12: "C",
      S13: "A", S14: "A", S15: "A", S16: "B",
      S17: "C", S18: "D",
    },
  },
};

/** Decide what option a bot picks for a given scenario. */
export function botPickScenarioOption(
  difficulty: BotDifficulty,
  scenarioId: string,
): string {
  return PROFILES[difficulty].scenarioPicks[scenarioId] ?? "A";
}

/** Plan a bot's route-opening actions for this quarter. Returns up to N
 *  candidate routes the bot would like to open (origin, dest, plane,
 *  weekly freq, fares) — the caller validates + executes. */
export function planBotRoutes(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
): Array<{
  origin: string;
  dest: string;
  aircraftId: string;
  weeklyFreq: number;
  pricingTier: PricingTier;
}> {
  const profile = PROFILES[difficulty];
  if (Math.random() > profile.actionProbability) return [];

  // Find idle aircraft (active, no route assignment)
  const idle = team.fleet.filter(
    (f) => f.status === "active" && !f.routeId,
  );
  if (idle.length === 0) return [];

  // Existing route endpoints to avoid duplicates
  const existing = new Set<string>();
  for (const r of team.routes) {
    if (r.status !== "closed") {
      existing.add(`${r.originCode}-${r.destCode}`);
      existing.add(`${r.destCode}-${r.originCode}`);
    }
  }

  // Candidate destinations: hub + secondary hubs as origins, every other
  // city as dest. Score each by demand × amplifier × distance fit.
  const hubs = [team.hubCode, ...(team.secondaryHubCodes ?? [])];
  const candidates: Array<{
    origin: string;
    dest: string;
    aircraft: FleetAircraft;
    score: number;
  }> = [];

  for (const plane of idle) {
    const spec = AIRCRAFT_BY_ID[plane.specId];
    if (!spec) continue;
    for (const origin of hubs) {
      const originCity = CITIES_BY_CODE[origin];
      if (!originCity) continue;
      for (const dest of CITIES) {
        if (dest.code === origin) continue;
        const dist = distanceBetween(origin, dest.code);
        if (dist > spec.rangeKm) continue;
        if (existing.has(`${origin}-${dest.code}`)) continue;
        // Score: bigger total demand on shorter distance wins for narrow,
        // longer distance for wide-body. Tier-1 dests preferred.
        const baseDemand = (originCity.tourism + originCity.business)
          + (dest.tourism + dest.business);
        const tierBonus = dest.tier === 1 ? 1.5 : dest.tier === 2 ? 1.2 : 1.0;
        const isWide =
          spec.seats.first + spec.seats.business + spec.seats.economy > 250;
        const distFit = isWide
          ? Math.min(1, dist / 8000) // wides like long
          : Math.max(0.3, 1 - Math.abs(dist - 4000) / 6000); // narrows mid-range
        const score = baseDemand * tierBonus * distFit;
        candidates.push({ origin, dest: dest.code, aircraft: plane, score });
      }
    }
  }

  // Sort by score, dedupe by aircraft (one route per plane), take top N
  candidates.sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  const picks: typeof candidates = [];
  for (const c of candidates) {
    if (used.has(c.aircraft.id)) continue;
    picks.push(c);
    used.add(c.aircraft.id);
    if (picks.length >= profile.routesOpenedPerQuarter) break;
  }

  // Convert each pick into an opening proposal
  return picks.map((p) => {
    const dist = distanceBetween(p.origin, p.dest);
    const maxDailyFreq = maxRouteDailyFrequency([p.aircraft.specId], dist);
    // Bot opens at MAX possible freq for the plane (saturated route)
    const weeklyFreq = Math.max(1, maxDailyFreq * 7);
    const tier: PricingTier =
      profile.pricingBias > 0 ? "premium" :
      profile.pricingBias < 0 ? "budget" : "standard";
    return {
      origin: p.origin,
      dest: p.dest,
      aircraftId: p.aircraft.id,
      weeklyFreq,
      pricingTier: tier,
    };
  });
}

/** Plan an aircraft order for this quarter. Returns null if the bot
 *  doesn't want to order anything. */
export function planBotAircraftOrder(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
): { specId: string; quantity: number; acquisitionType: "buy" | "lease" } | null {
  const profile = PROFILES[difficulty];
  if (Math.random() > profile.actionProbability * 0.7) return null;

  // Available specs for this quarter
  const availableSpecs = AIRCRAFT.filter((a) => a.unlockQuarter <= currentQuarter);
  if (availableSpecs.length === 0) return null;

  // Pick a spec the bot can afford. Strategy:
  //  - Empty fleet: start with a narrow-body passenger (steady cashflow).
  //  - 4+ pax narrows and no wides: add a wide-body for long-haul.
  //  - 6+ planes total and zero cargo: add a cargo aircraft (yield diversification).
  //  - HARD bots prefer modern airframes (highest unlockQuarter).
  //  - Cash-constrained bots LEASE instead of buy.
  const fleetCount = team.fleet.filter((f) => f.status !== "retired").length;
  const wideCount = team.fleet.filter((f) => {
    const s = AIRCRAFT_BY_ID[f.specId];
    return f.status !== "retired" && s && s.family === "passenger" &&
      (s.seats.first + s.seats.business + s.seats.economy > 250);
  }).length;
  const cargoCount = team.fleet.filter((f) => {
    const s = AIRCRAFT_BY_ID[f.specId];
    return f.status !== "retired" && s && s.family === "cargo";
  }).length;
  const wantsWide = fleetCount >= 4 && wideCount < fleetCount * 0.4;
  // Cargo diversification: medium+ from fleet 6, hard from fleet 4
  const cargoThreshold = difficulty === "hard" ? 4 : 6;
  const wantsCargo = fleetCount >= cargoThreshold && cargoCount === 0;

  const candidates = availableSpecs.filter((spec) => {
    if (wantsCargo && spec.family !== "cargo") return false;
    if (!wantsCargo && spec.family !== "passenger") return false;
    if (spec.family === "passenger") {
      const isWide =
        spec.seats.first + spec.seats.business + spec.seats.economy > 250;
      if (wantsWide !== isWide && fleetCount > 0) return false;
    }
    return team.cashUsd >= spec.buyPriceUsd * profile.orderAircraftCashRatio;
  });
  if (candidates.length === 0) return null;

  // Diversification scoring — bots used to "pick the cheapest" or "pick
  // the most modern" which led to monoculture fleets (10× A320, 5× A380).
  // Now we score each candidate by:
  //   - base score (price for EASY/MEDIUM, modernity for HARD)
  //   - diversification bonus (under-represented sub-family)
  //   - regional preference (encourage the new turboprops + regional jets
  //     once the fleet is mature enough to support thin spokes)
  const classify = (s: typeof availableSpecs[number]): string => {
    if (s.family === "cargo") return "cargo";
    const seats = s.seats.first + s.seats.business + s.seats.economy;
    if (seats < 100) return "regional";
    if (seats > 250) return "wide";
    return "narrow";
  };
  const fleetBuckets: Record<string, number> = {};
  for (const f of team.fleet) {
    if (f.status === "retired") continue;
    const s = AIRCRAFT_BY_ID[f.specId];
    if (!s) continue;
    const b = classify(s);
    fleetBuckets[b] = (fleetBuckets[b] ?? 0) + 1;
  }
  const fleetTotal = Math.max(1, Object.values(fleetBuckets).reduce((s, n) => s + n, 0));
  // Mature fleets without any regional jet should consider one for thin
  // routes — handled as a soft bias rather than a hard filter so the
  // primary cargo / wide / narrow logic still wins where appropriate.
  const wantsRegional =
    fleetCount >= 8 &&
    !wantsCargo &&
    !wantsWide &&
    (fleetBuckets["regional"] ?? 0) === 0;
  const candidatesScored = candidates.map((c) => {
    const bucket = classify(c);
    const share = (fleetBuckets[bucket] ?? 0) / fleetTotal;
    // Under-represented buckets earn up to +0.5; saturated ones earn 0.
    const diversityBonus = (1 - share) * 0.5;
    const regionalBonus = wantsRegional && bucket === "regional" ? 0.4 : 0;
    const base =
      difficulty === "hard"
        ? c.unlockQuarter / 40                    // 0..1
        : -c.buyPriceUsd / 200_000_000;            // -1..0 (cheaper = higher)
    return { spec: c, score: base + diversityBonus + regionalBonus };
  });
  candidatesScored.sort((a, b) => b.score - a.score);
  const pick = candidatesScored[0].spec;

  // Quantity: 1 for easy, 1-2 for medium, 1-3 for hard. Cargo orders
  // are usually solo (one big freighter at a time).
  const maxQ = wantsCargo
    ? 1
    : difficulty === "hard" ? 3 : difficulty === "medium" ? 2 : 1;
  const affordableQty = Math.min(
    maxQ,
    Math.floor(team.cashUsd / (pick.buyPriceUsd * profile.orderAircraftCashRatio)),
  );

  // Lease vs buy: HARD bots lease aggressively early (better cash position
  // for slot bidding); EASY always buys; MEDIUM mixes by cash situation.
  const cashRatio = team.cashUsd / Math.max(1, pick.buyPriceUsd);
  const acquisitionType: "buy" | "lease" =
    difficulty === "hard" && cashRatio < 4 ? "lease" :
    difficulty === "medium" && cashRatio < 2 ? "lease" : "buy";

  return {
    specId: pick.id,
    quantity: Math.max(1, affordableQty),
    acquisitionType,
  };
}

/** Bid amount per slot for a bot. Returns price ≥ tier base. */
export function botSlotBidPrice(
  difficulty: BotDifficulty,
  airportCode: string,
): number {
  const profile = PROFILES[difficulty];
  const city = CITIES_BY_CODE[airportCode];
  const tier = (city?.tier ?? 1) as 1 | 2 | 3 | 4;
  // Pull from the canonical table in slots.ts so bot bids stay in
  // step with the player's validation floor (no more "$120K T1"
  // drift after the rebalance).
  const basePrice = BASE_SLOT_PRICE_BY_TIER[tier];
  return Math.round(basePrice * profile.slotBidMultiplier);
}

/** Difficulty label for UI. */
export const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, { label: string; description: string }> = {
  easy:   { label: "Easy",   description: "Cautious. Slow expansion. Light slot bids. Ignores edge opportunities." },
  medium: { label: "Medium", description: "Balanced. Opens 1–2 routes/quarter. Bids 25% above floor. PRD-aligned scenario picks." },
  hard:   { label: "Hard",   description: "Aggressive. Maxes out fleet. Bids 60% above floor. Revenue-maximizing scenario picks." },
};
