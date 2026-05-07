/**
 * AI bot players for SkyForce — scripted playbooks per phase × difficulty.
 *
 * KEY DESIGN PRINCIPLES
 * ─────────────────────
 * 1. Bots always act — actionProbability is 1.0. Volume is controlled by
 *    ROUTE_QUOTA and ORDER_QTY tables keyed by (phase × difficulty).
 *
 * 2. Game phases (based on % of total rounds completed):
 *      startup   0 – 25 %   conservative — build the fleet, open first hubs
 *      growth   25 – 55 %   aggressive  — rapid network + fleet expansion
 *      mid      55 – 80 %   optimise    — prune losers, counter rivals
 *      endgame  80 – 100%   protect     — defend revenue, avoid risk
 *
 * 3. Aircraft ordering is generous: bots need many planes to open many
 *    routes. Without enough aircraft the route quota is meaningless.
 *    orderAircraftCashRatio is intentionally low so bots spend money.
 *
 * 4. Doctrine shapes route style — budget bots prioritise short+freq,
 *    premium bots go long+low-freq, cargo bots prefer freighter ODs.
 *
 * 5. Fuel spike response — when fuelIndex > 140 bots scale back openings.
 *    Hard bots scale less; easy bots scale the most.
 *
 * 6. Leaderboard awareness — trailing bots get more aggressive (higher
 *    effective quota); leading bots become slightly more conservative.
 *
 * 7. Route pruning — pruneBotRoutes() returns IDs of routes that have
 *    been losing money for 2+ consecutive quarters. Called before new
 *    route openings so freed aircraft can immediately be re-deployed.
 *
 * 8. Multi-bot OD coordination — planBotRoutes accepts a `claimedODs`
 *    set filled by earlier bots this same quarter, applying a heavy
 *    penalty so bots spread across different markets.
 */

import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { canLeaseSpec, leaseTermsFor } from "@/lib/lease";
import { distanceBetween, maxRouteDailyFrequency, baseFareForDistance } from "@/lib/engine";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import type { Team, FleetAircraft, PricingTier, Route } from "@/types/game";

export type BotDifficulty = "easy" | "medium" | "hard";

// ─────────────────────────────────────────────────────────────────────────────
// Phase helpers
// ─────────────────────────────────────────────────────────────────────────────

type GamePhase = "startup" | "growth" | "mid" | "endgame";

function gamePhase(quarter: number, totalRounds: number): GamePhase {
  const pct = quarter / Math.max(1, totalRounds);
  if (pct < 0.25) return "startup";
  if (pct < 0.55) return "growth";
  if (pct < 0.80) return "mid";
  return "endgame";
}

// ─────────────────────────────────────────────────────────────────────────────
// Scripted quotas & ordering cadence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MAX routes the bot will open this quarter. Actual count is
 * min(quota, idleAircraft). Quotas are intentionally high so the
 * idle-aircraft count is the real throttle, not an artificial cap.
 */
const ROUTE_QUOTA: Record<BotDifficulty, Record<GamePhase, number>> = {
  //         startup  growth  mid  endgame
  easy:   {  s: 1,   g: 2,   m: 2,  e: 1  } as unknown as Record<GamePhase, number>,
  medium: {  s: 2,   g: 4,   m: 3,  e: 2  } as unknown as Record<GamePhase, number>,
  hard:   {  s: 3,   g: 6,   m: 5,  e: 3  } as unknown as Record<GamePhase, number>,
};

// Typed properly:
const _RQ: Record<BotDifficulty, Record<GamePhase, number>> = {
  easy:   { startup: 1, growth: 2, mid: 2, endgame: 1 },
  medium: { startup: 2, growth: 4, mid: 3, endgame: 2 },
  hard:   { startup: 3, growth: 6, mid: 5, endgame: 3 },
};

/**
 * How many aircraft to ORDER this quarter (before cash check).
 * Higher = more aircraft arrive next quarter = more idle planes = more routes.
 */
const ORDER_QTY: Record<BotDifficulty, Record<GamePhase, number>> = {
  easy:   { startup: 1, growth: 1, mid: 1, endgame: 0 },
  medium: { startup: 2, growth: 3, mid: 2, endgame: 1 },
  hard:   { startup: 3, growth: 4, mid: 3, endgame: 2 },
};

// ─────────────────────────────────────────────────────────────────────────────
// Per-difficulty base profile
// ─────────────────────────────────────────────────────────────────────────────

interface BotProfile {
  /** Cash multiple required to buy (1.0 = buy when you have exactly the price). */
  orderAircraftCashRatio: number;
  slotBidMultiplier: number;
  /** −1 budget, 0 standard, +1 premium */
  pricingBias: number;
  debtTolerance: number;
  scenarioPicks: Record<string, string>;
}

const PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    orderAircraftCashRatio: 2.0,   // needs 2× price in cash (cautious)
    slotBidMultiplier: 1.0,
    pricingBias: 0,
    debtTolerance: 0,
    scenarioPicks: {
      S1: "A", S2: "A", S3: "C", S4: "B", S5: "B",
      S6: "B", S7: "D", S8: "B", S9: "C", S10: "C",
      S11: "B", S12: "A", S13: "B", S14: "B", S15: "B",
      S16: "A", S17: "B", S18: "A",
    },
  },
  medium: {
    orderAircraftCashRatio: 1.4,
    slotBidMultiplier: 1.25,
    pricingBias: 0,
    debtTolerance: 0.4,
    scenarioPicks: {
      S1: "A", S2: "A", S3: "D", S4: "D",
      S5: "A", S6: "A", S7: "B", S8: "A",
      S9: "A", S10: "B", S11: "A", S12: "B",
      S13: "C", S14: "C", S15: "B", S16: "B",
      S17: "C", S18: "A",
    },
  },
  hard: {
    orderAircraftCashRatio: 1.0,   // buy immediately once you can afford it
    slotBidMultiplier: 1.6,
    pricingBias: 1,
    debtTolerance: 0.7,
    scenarioPicks: {
      S1: "B", S2: "C", S3: "A", S4: "A",
      S5: "A", S6: "A", S7: "A", S8: "A",
      S9: "A", S10: "A", S11: "A", S12: "C",
      S13: "A", S14: "A", S15: "A", S16: "B",
      S17: "C", S18: "D",
    },
  },
};

/** Decide what option a bot picks for a given scenario. */
export function botPickScenarioOption(difficulty: BotDifficulty, scenarioId: string): string {
  return PROFILES[difficulty].scenarioPicks[scenarioId] ?? "A";
}

// ─────────────────────────────────────────────────────────────────────────────
// Route pruning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns IDs of routes the bot should close this quarter.
 *
 * Pruning rules (difficulty-scaled):
 *  - Hard:   close after 2 consecutive losing quarters
 *  - Medium: close after 3 consecutive losing quarters
 *  - Easy:   never prunes (stays stuck with bad routes — intentional weakness)
 *
 * A "losing quarter" is tracked by `consecutiveLosingQuarters` on the Route.
 * We also close routes where the aircraft has sat on a route with 0 revenue
 * for 3+ quarters (bot opened and forgot about it — shouldn't happen but
 * defensive cleanup).
 */
export function pruneBotRoutes(team: Team, difficulty: BotDifficulty): string[] {
  if (difficulty === "easy") return []; // easy bots don't prune

  const threshold = difficulty === "hard" ? 2 : 3;
  const toClose: string[] = [];

  for (const r of team.routes) {
    if (r.status !== "active") continue;
    if ((r.consecutiveLosingQuarters ?? 0) >= threshold) {
      toClose.push(r.id);
    }
  }

  return toClose;
}

// ─────────────────────────────────────────────────────────────────────────────
// Route planning
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plan route openings for this quarter.
 *
 * @param claimedODs  OD keys already picked by earlier bots this same quarter
 *                    (odSorted format: "AAA|BBB"). Passed from the sequential
 *                    reduce in closeQuarter so bots spread across markets.
 * @param leaderboardRank  1 = leading; higher = trailing. Trailing bots get
 *                         a +30 % quota bonus to simulate desperation.
 * @param fuelIndex   Current fuel index (100 = baseline). Above 140 bots
 *                    scale back openings.
 */
export function planBotRoutes(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
  rivals: Team[] = [],
  totalRounds = 20,
  claimedODs: Set<string> = new Set(),
  leaderboardRank = 1,
  fuelIndex = 100,
): Array<{
  origin: string;
  dest: string;
  aircraftId: string;
  weeklyFreq: number;
  pricingTier: PricingTier;
}> {
  const profile = PROFILES[difficulty];
  const phase = gamePhase(currentQuarter, totalRounds);

  // Base quota from the scripted table
  let quota = _RQ[difficulty][phase];

  // Leaderboard awareness: trailing bots push harder
  const totalBots = rivals.filter(r => r.botDifficulty).length + 1;
  if (leaderboardRank > Math.ceil(totalBots / 2)) {
    quota = Math.ceil(quota * 1.3); // +30% when in the bottom half
  } else if (leaderboardRank === 1 && phase !== "startup") {
    quota = Math.max(1, quota - 1); // leader plays slightly safer
  }

  // Fuel spike: high fuel = fewer new routes (thinner margins)
  if (fuelIndex > 140) {
    const fuelPenalty = difficulty === "hard" ? 0.8 : difficulty === "medium" ? 0.6 : 0.4;
    quota = Math.max(0, Math.round(quota * fuelPenalty));
  }

  if (quota === 0) return [];

  // Idle aircraft available for new routes
  const idle = team.fleet.filter(f => f.status === "active" && !f.routeId);
  if (idle.length === 0) return [];

  // Existing route OD set (avoid duplicates)
  const existing = new Set<string>();
  for (const r of team.routes) {
    if (r.status !== "closed") {
      existing.add(`${r.originCode}-${r.destCode}`);
      existing.add(`${r.destCode}-${r.originCode}`);
    }
  }

  const odSorted = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Competitor count per OD (for saturation penalty)
  const odCompetitorCount: Record<string, number> = {};
  for (const rv of rivals) {
    if (rv.id === team.id) continue;
    for (const r of rv.routes) {
      if (r.status !== "active" && r.status !== "pending") continue;
      const k = odSorted(r.originCode, r.destCode);
      odCompetitorCount[k] = (odCompetitorCount[k] ?? 0) + 1;
    }
  }

  // Hard bot: human OD bonus — compete directly on profitable human routes
  const humanOdRevenue: Record<string, number> = {};
  if (difficulty === "hard") {
    for (const rv of rivals) {
      if (rv.controlledBy !== "human") continue;
      for (const r of rv.routes) {
        if (r.status !== "active") continue;
        const k = odSorted(r.originCode, r.destCode);
        humanOdRevenue[k] = (humanOdRevenue[k] ?? 0) + (r.quarterlyRevenue ?? r.dailyFrequency * 7);
      }
    }
  }

  // Easy bot mistake mode: ~30% chance to score low-demand cities highly
  const easyMistakeMode = difficulty === "easy" && Math.random() < 0.3;

  // Doctrine pricing and distance preferences
  const docPremium = team.doctrine === "premium-service";
  const docBudget  = team.doctrine === "budget-expansion";
  const docCargo   = team.doctrine === "cargo-dominance";

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
    const isCargo = spec.family === "cargo";

    // Doctrine filter: cargo-doctrine bots prefer cargo aircraft on cargo routes
    if (docCargo && !isCargo && idle.some(f => AIRCRAFT_BY_ID[f.specId]?.family === "cargo" && !f.routeId)) {
      continue; // skip passenger planes if a cargo plane is also idle
    }

    for (const origin of hubs) {
      const originCity = CITIES_BY_CODE[origin];
      if (!originCity) continue;

      for (const dest of CITIES) {
        if (dest.code === origin) continue;
        const dist = distanceBetween(origin, dest.code);
        if (dist > spec.rangeKm) continue;
        if (existing.has(`${origin}-${dest.code}`)) continue;

        // Yield sanity filter (bots won't open routes that bleed cash on day 1)
        if (!isCargo) {
          const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
          const dailyRev = seats * 0.6 * (baseFareForDistance(dist) / 1.4);
          const dailyFuel = (spec.fuelBurnPerKm ?? 4) * dist * 0.85;
          const margin =
            difficulty === "hard" ? 1.1 :
            difficulty === "easy" ? 1.5 : 1.25;
          if (dailyRev < dailyFuel * margin) continue;
        }

        const baseDemand = (originCity.tourism + originCity.business)
          + (dest.tourism + dest.business);
        const tierBonus = dest.tier === 1 ? 1.5 : dest.tier === 2 ? 1.2 : 1.0;

        // Doctrine distance fit:
        //   premium → long-haul wides or medium narrowbody preferred
        //   budget  → short-haul preferred
        //   cargo   → medium range
        const isWide = spec.seats.first + spec.seats.business + spec.seats.economy > 250;
        let distFit: number;
        if (docPremium) {
          distFit = isWide
            ? Math.min(1, dist / 7000)               // wides love long
            : Math.max(0.4, 1 - Math.abs(dist - 5000) / 6000);
        } else if (docBudget) {
          distFit = Math.max(0.3, 1 - dist / 10000); // short preferred
        } else {
          distFit = isWide
            ? Math.min(1, dist / 8000)
            : Math.max(0.3, 1 - Math.abs(dist - 4000) / 6000);
        }

        // Saturation penalty
        const compCount = odCompetitorCount[odSorted(origin, dest.code)] ?? 0;
        const baseSat = compCount === 0 ? 1.0 : compCount === 1 ? 0.7 : compCount === 2 ? 0.5 : 0.35;
        const satPenalty = difficulty === "hard" ? 1 - (1 - baseSat) * 0.5 : baseSat;

        // Multi-bot OD deconfliction: heavy penalty if another bot already
        // claimed this OD this quarter (not a hard block — they can still
        // pick it but it scores much lower).
        const alreadyClaimed = claimedODs.has(odSorted(origin, dest.code)) ? 0.2 : 1.0;

        // Hard bot counter-compete bonus
        const odKey = odSorted(origin, dest.code);
        const counterBonus =
          difficulty === "hard" && humanOdRevenue[odKey]
            ? Math.min(2.0, 1 + humanOdRevenue[odKey] / 5_000_000)
            : 1.0;

        // Easy mistake: invert demand scoring 30% of the time
        const demandScore = easyMistakeMode
          ? 1 / Math.max(1, baseDemand)
          : baseDemand * tierBonus;

        const score = demandScore * distFit * satPenalty * alreadyClaimed * counterBonus;
        candidates.push({ origin, dest: dest.code, aircraft: plane, score });
      }
    }
  }

  // Sort by score desc; dedupe by aircraft id; take up to quota
  candidates.sort((a, b) => b.score - a.score);
  const usedPlanes = new Set<string>();
  const picks: typeof candidates = [];
  for (const c of candidates) {
    if (usedPlanes.has(c.aircraft.id)) continue;
    picks.push(c);
    usedPlanes.add(c.aircraft.id);
    if (picks.length >= quota) break;
  }

  return picks.map(p => {
    const dist = distanceBetween(p.origin, p.dest);
    const maxWeeklyFreq = Math.max(
      1,
      Math.round(maxRouteDailyFrequency([p.aircraft.specId], dist, [{
        specId: p.aircraft.specId,
        engineUpgrade: p.aircraft.engineUpgrade ?? null,
        cargoBelly: p.aircraft.cargoBelly,
        doctrine: team.doctrine,
      }]) * 7),
    );

    // Utilisation: hard bots maximise frequency; easy underfly
    const util = difficulty === "hard" ? 0.9 : difficulty === "easy" ? 0.5 : 0.7;
    const weeklyFreq = Math.max(1, Math.round(maxWeeklyFreq * util));

    // Pricing by doctrine + difficulty
    let tier: PricingTier = "standard";
    if (difficulty === "hard") {
      const odKey = odSorted(p.origin, p.dest);
      // Undercut humans on their profitable routes; premium everywhere else
      tier = humanOdRevenue[odKey] ? "budget" : "premium";
    } else if (docPremium) {
      tier = "premium";
    } else if (docBudget) {
      tier = "budget";
    } else {
      tier = profile.pricingBias > 0 ? "premium" : profile.pricingBias < 0 ? "budget" : "standard";
    }

    return { origin: p.origin, dest: p.dest, aircraftId: p.aircraft.id, weeklyFreq, pricingTier: tier };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aircraft ordering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Plan an aircraft purchase/lease for this quarter.
 * Returns null if the bot can't afford anything or the quota is 0.
 */
export function planBotAircraftOrder(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
  totalRounds = 20,
): { specId: string; quantity: number; acquisitionType: "buy" | "lease" } | null {
  const profile = PROFILES[difficulty];
  const phase = gamePhase(currentQuarter, totalRounds);
  const targetQty = ORDER_QTY[difficulty][phase];
  if (targetQty === 0) return null;

  const availableSpecs = AIRCRAFT.filter(a => a.unlockQuarter <= currentQuarter);
  if (availableSpecs.length === 0) return null;

  const fleetCount = team.fleet.filter(f => f.status !== "retired").length;
  const wideCount  = team.fleet.filter(f => {
    const s = AIRCRAFT_BY_ID[f.specId];
    return f.status !== "retired" && s?.family === "passenger" &&
      s.seats.first + s.seats.business + s.seats.economy > 250;
  }).length;
  const cargoCount = team.fleet.filter(f => {
    const s = AIRCRAFT_BY_ID[f.specId];
    return f.status !== "retired" && s?.family === "cargo";
  }).length;

  const wantsWide  = fleetCount >= 4 && wideCount < fleetCount * 0.35;
  const cargoThreshold = difficulty === "hard" ? 3 : 5;
  const wantsCargo = fleetCount >= cargoThreshold && cargoCount === 0;

  const candidates = availableSpecs.filter(spec => {
    if (wantsCargo && spec.family !== "cargo") return false;
    if (!wantsCargo && spec.family !== "passenger") return false;
    if (spec.family === "passenger") {
      const isWide = spec.seats.first + spec.seats.business + spec.seats.economy > 250;
      if (wantsWide !== isWide && fleetCount > 0) return false;
    }
    const canBuy   = team.cashUsd >= spec.buyPriceUsd * profile.orderAircraftCashRatio;
    const canLease = canLeaseSpec(spec, AIRCRAFT, currentQuarter)
      && team.cashUsd >= leaseTermsFor(spec).depositUsd;
    return canBuy || canLease;
  });
  if (candidates.length === 0) return null;

  // Diversity scoring (avoid monoculture fleets)
  const classify = (s: typeof availableSpecs[number]) => {
    if (s.family === "cargo") return "cargo";
    const seats = s.seats.first + s.seats.business + s.seats.economy;
    return seats < 100 ? "regional" : seats > 250 ? "wide" : "narrow";
  };
  const buckets: Record<string, number> = {};
  for (const f of team.fleet) {
    if (f.status === "retired") continue;
    const s = AIRCRAFT_BY_ID[f.specId];
    if (!s) continue;
    buckets[classify(s)] = (buckets[classify(s)] ?? 0) + 1;
  }
  const total = Math.max(1, Object.values(buckets).reduce((a, b) => a + b, 0));
  const wantsRegional = fleetCount >= 8 && !wantsCargo && !wantsWide && !buckets["regional"];

  const scored = candidates.map(c => {
    const b = classify(c);
    const diversityBonus = (1 - (buckets[b] ?? 0) / total) * 0.5;
    const regionalBonus  = wantsRegional && b === "regional" ? 0.4 : 0;
    const base = difficulty === "hard"
      ? c.unlockQuarter / 40
      : -c.buyPriceUsd / 200_000_000;
    return { spec: c, score: base + diversityBonus + regionalBonus };
  });
  scored.sort((a, b) => b.score - a.score);
  const pick = scored[0].spec;

  // How many can we actually afford?
  const cashRatio = team.cashUsd / Math.max(1, pick.buyPriceUsd);
  const acquisitionType: "buy" | "lease" =
    difficulty === "hard"   && cashRatio < 3 ? "lease" :
    difficulty === "medium" && cashRatio < 2 ? "lease" : "buy";

  const costPerPlane = acquisitionType === "buy"
    ? pick.buyPriceUsd * profile.orderAircraftCashRatio
    : leaseTermsFor(pick).depositUsd;

  const maxAffordable = Math.floor(team.cashUsd / Math.max(1, costPerPlane));
  const quantity = Math.max(1, Math.min(targetQty, maxAffordable));

  return { specId: pick.id, quantity, acquisitionType };
}

// ─────────────────────────────────────────────────────────────────────────────
// Slot bidding
// ─────────────────────────────────────────────────────────────────────────────

/** Bid price per slot. Hard bots also tactically bid at rivals' hubs. */
export function botSlotBidPrice(difficulty: BotDifficulty, airportCode: string): number {
  const profile = PROFILES[difficulty];
  const city = CITIES_BY_CODE[airportCode];
  const tier = (city?.tier ?? 1) as 1 | 2 | 3 | 4;
  return Math.round(BASE_SLOT_PRICE_BY_TIER[tier] * profile.slotBidMultiplier);
}

/**
 * Hard bots: return airport codes at human/rival hubs where the bot
 * should place blocking bids (more slots than needed, to limit rivals).
 * Called alongside normal slot bidding so the hard bot competes at
 * opponent hubs even if it has no route there yet.
 */
export function hardBotBlockingBidCodes(
  team: Team,
  rivals: Team[],
  currentSlotsByAirport: Record<string, number>,
): string[] {
  if (!team.botDifficulty || team.botDifficulty !== "hard") return [];
  const codes: string[] = [];
  for (const rv of rivals) {
    if (rv.id === team.id) continue;
    if (rv.controlledBy !== "human" && rv.botDifficulty !== "medium") continue;
    // Bid at any T1/T2 rival hub we don't already dominate
    const hubCode = rv.hubCode;
    const rvCity = CITIES_BY_CODE[hubCode];
    if (!rvCity || rvCity.tier > 2) continue;
    const ourSlots = currentSlotsByAirport[hubCode] ?? 0;
    const theirSlots = (rv.airportLeases?.[hubCode]?.slots ?? 0);
    // Only bid if they have more slots at their hub than we do
    if (theirSlots > ourSlots) codes.push(hubCode);
  }
  return codes;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fuel spike response
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns route IDs the bot should SUSPEND (not close) during a fuel spike.
 * Only medium + hard bots respond to fuel. Easy bots keep flying inefficiently.
 * Routes get suspended not closed so they resume when fuel normalises.
 */
export function fuelSpikeRoutesToSuspend(
  team: Team,
  difficulty: BotDifficulty,
  fuelIndex: number,
): string[] {
  if (difficulty === "easy") return [];
  if (fuelIndex <= 140) return [];

  const threshold = difficulty === "hard" ? 160 : 145;
  if (fuelIndex <= threshold) return [];

  // Suspend long-haul routes first (most fuel-intensive)
  return team.routes
    .filter(r => r.status === "active" && r.distanceKm > 6000)
    .sort((a, b) => b.distanceKm - a.distanceKm)
    .slice(0, difficulty === "hard" ? 1 : 2)
    .map(r => r.id);
}

/**
 * Returns route IDs the bot should RESUME when fuel has normalised.
 */
export function fuelNormalRoutesToResume(
  team: Team,
  difficulty: BotDifficulty,
  fuelIndex: number,
): string[] {
  if (difficulty === "easy") return [];
  if (fuelIndex > 130) return []; // still elevated — don't resume yet
  return team.routes.filter(r => r.status === "suspended").map(r => r.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Labels
// ─────────────────────────────────────────────────────────────────────────────

export const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, { label: string; description: string }> = {
  easy:   { label: "Easy",   description: "Cautious. Slow expansion. Stays with bad routes. Light slot bids." },
  medium: { label: "Medium", description: "Balanced. 2–4 routes/quarter. Pauses on fuel spikes. PRD scenario picks." },
  hard:   { label: "Hard",   description: "Aggressive. Max fleet. Undercuts humans on shared routes. Blocks rival hubs." },
};
