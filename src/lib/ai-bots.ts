/**
 * AI bot players for SkyForce.
 *
 * Three difficulty profiles drive every quarterly decision:
 *
 *   EASY    — scripted cautious player. Expands slowly in startup (Q1-Q5),
 *             plateaus mid-game, occasionally makes sub-optimal route picks
 *             (low-demand cities). Never bids aggressively for slots.
 *             Mostly a punching bag for new players.
 *
 *   MEDIUM  — scripted balanced strategist. Opens 1-2 routes every quarter,
 *             orders 1 aircraft per quarter when cash allows, bids floor+25%
 *             on slots, follows PRD-recommended scenario options. Good for
 *             competitive solo runs.
 *
 *   HARD    — scripted aggressive optimizer. Expands as fast as cash allows,
 *             reacts to the human's network (opens competing routes at lower
 *             price on the same OD when the human is making money there),
 *             bids floor+60%, picks revenue-maximizing scenario options.
 *             A genuine threat all game long.
 *
 * Behaviour is SCRIPTED per phase × difficulty — not random-probability:
 *   Phase 1 Startup   (0–25% of rounds)  : conservative expansion
 *   Phase 2 Growth    (25–55% of rounds) : steady fleet + route building
 *   Phase 3 Mid-game  (55–80% of rounds) : optimise + react to rivals
 *   Phase 4 Endgame   (80–100% of rounds): protect revenue, avoid risk
 *
 * actionProbability is now always 1.0 — bots always act; what changes per
 * difficulty is HOW MUCH they do each quarter, not WHETHER they act.
 *
 * Bots run during quarter close — every non-player team that has
 * `botDifficulty` set gets planBotRoutes + planBotAircraftOrder called.
 */

import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { canLeaseSpec, leaseTermsFor } from "@/lib/lease";
import { distanceBetween, maxRouteDailyFrequency, baseFareForDistance } from "@/lib/engine";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import type { Team, FleetAircraft, PricingTier } from "@/types/game";

export type BotDifficulty = "easy" | "medium" | "hard";

// ── Game-phase helpers ────────────────────────────────────────────────────────

type GamePhase = "startup" | "growth" | "mid" | "endgame";

/** Map a quarter + totalRounds to a named game phase. */
function gamePhase(quarter: number, totalRounds: number): GamePhase {
  const pct = quarter / Math.max(1, totalRounds);
  if (pct < 0.25) return "startup";
  if (pct < 0.55) return "growth";
  if (pct < 0.80) return "mid";
  return "endgame";
}

// ── Per-phase route quota (scripted, not random) ──────────────────────────────
//
// This is the MAXIMUM routes each difficulty opens per quarter at each phase.
// The actual number is min(quota, idle aircraft available).
const ROUTE_QUOTA: Record<BotDifficulty, Record<GamePhase, number>> = {
  easy:   { startup: 0, growth: 1, mid: 1, endgame: 0 },
  medium: { startup: 1, growth: 2, mid: 2, endgame: 1 },
  hard:   { startup: 2, growth: 3, mid: 3, endgame: 2 },
};

// Whether the bot orders aircraft this quarter (scripted cadence).
// Easy skips startup + endgame; medium always; hard always.
const ORDER_CADENCE: Record<BotDifficulty, Record<GamePhase, boolean>> = {
  easy:   { startup: false, growth: true,  mid: true,  endgame: false },
  medium: { startup: true,  growth: true,  mid: true,  endgame: true  },
  hard:   { startup: true,  growth: true,  mid: true,  endgame: true  },
};

// ── Static per-difficulty settings ───────────────────────────────────────────

interface BotProfile {
  orderAircraftCashRatio: number;
  // ALWAYS 1.0 — bots always act. Volume controlled by ROUTE_QUOTA.
  actionProbability: number;
  slotBidMultiplier: number;
  pricingBias: number;       // -1 budget, 0 standard, +1 premium
  debtTolerance: number;
  scenarioPicks: Record<string, string>;
}

const PROFILES: Record<BotDifficulty, BotProfile> = {
  easy: {
    orderAircraftCashRatio: 3,
    actionProbability: 1.0,
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
    orderAircraftCashRatio: 2,
    actionProbability: 1.0,
    slotBidMultiplier: 1.25,
    pricingBias: 0,
    debtTolerance: 0.4,
    scenarioPicks: {
      S1: "A",  S2: "A",  S3: "D",  S4: "D",
      S5: "A",  S6: "A",  S7: "B",  S8: "A",
      S9: "A",  S10: "B", S11: "A", S12: "B",
      S13: "C", S14: "C", S15: "B", S16: "B",
      S17: "C", S18: "A",
    },
  },
  hard: {
    orderAircraftCashRatio: 1.2,
    actionProbability: 1.0,
    slotBidMultiplier: 1.6,
    pricingBias: 1,
    debtTolerance: 0.7,
    scenarioPicks: {
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

// ── Route planning ────────────────────────────────────────────────────────────

/** Plan a bot's route-opening actions for this quarter.
 *
 *  Scripted quota per phase × difficulty (ROUTE_QUOTA table above).
 *  Hard bots additionally scan human/rival routes and add a bonus to
 *  routes that compete directly with the human's most profitable ODs —
 *  they muscle into the same markets rather than picking empty ones.
 *  Easy bots score LOW-demand cities first (~30% of the time) to
 *  simulate beginner mistakes that reduce their competitiveness. */
export function planBotRoutes(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
  rivals: Team[] = [],
  totalRounds = 20,
): Array<{
  origin: string;
  dest: string;
  aircraftId: string;
  weeklyFreq: number;
  pricingTier: PricingTier;
}> {
  const profile = PROFILES[difficulty];
  const phase = gamePhase(currentQuarter, totalRounds);
  const quota = ROUTE_QUOTA[difficulty][phase];
  if (quota === 0) return []; // scripted: this difficulty doesn't expand this phase

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

  // OD competitor count map — penalise saturated markets.
  const odSorted = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const odCompetitorCount: Record<string, number> = {};
  for (const rv of rivals) {
    if (rv.id === team.id) continue;
    for (const r of rv.routes) {
      if (r.status !== "active" && r.status !== "pending") continue;
      const k = odSorted(r.originCode, r.destCode);
      odCompetitorCount[k] = (odCompetitorCount[k] ?? 0) + 1;
    }
  }

  // Hard bot: build a "human OD bonus" map — the human's most-flown
  // OD pairs get a score bonus so the hard bot deliberately opens the
  // same routes (price competition). Detects human teams by controlledBy.
  const humanOdBonus: Record<string, number> = {};
  if (difficulty === "hard") {
    for (const rv of rivals) {
      if (rv.controlledBy !== "human") continue;
      for (const r of rv.routes) {
        if (r.status !== "active") continue;
        // Reward competes routes: bonus proportional to rival's weekly frequency
        const k = odSorted(r.originCode, r.destCode);
        humanOdBonus[k] = (humanOdBonus[k] ?? 0) + r.dailyFrequency * 7;
      }
    }
  }

  // Easy bot: occasionally "make a mistake" — score low-demand
  // destinations highly (simulates inexperienced routing). Only applies
  // ~30% of the time so easy bots are beatable but not completely random.
  const easyMistakeMode = difficulty === "easy" && Math.random() < 0.3;

  // Build candidates
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

        // Yield sanity filter
        const isCargo = spec.family === "cargo";
        if (!isCargo) {
          const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
          const dailyRev = seats * 0.6 * (baseFareForDistance(dist) / 1.4);
          const dailyFuel = (spec.fuelBurnPerKm ?? 4) * dist * 0.85;
          const margin =
            difficulty === "hard" ? 1.15 :
            difficulty === "easy" ? 1.6 : 1.35;
          if (dailyRev < dailyFuel * margin) continue;
        }

        const baseDemand = (originCity.tourism + originCity.business)
          + (dest.tourism + dest.business);
        const tierBonus = dest.tier === 1 ? 1.5 : dest.tier === 2 ? 1.2 : 1.0;
        const isWide =
          spec.seats.first + spec.seats.business + spec.seats.economy > 250;
        const distFit = isWide
          ? Math.min(1, dist / 8000)
          : Math.max(0.3, 1 - Math.abs(dist - 4000) / 6000);

        // Saturation penalty
        const compCount = odCompetitorCount[odSorted(origin, dest.code)] ?? 0;
        const baseSat = compCount === 0 ? 1.0
          : compCount === 1 ? 0.7
          : compCount === 2 ? 0.5
          : 0.35;
        const satPenalty = difficulty === "hard"
          ? 1 - (1 - baseSat) * 0.5
          : baseSat;

        // Hard bot counter-compete bonus: boost ODs the human is already flying.
        // The bonus is capped at 2× so it doesn't completely override the
        // yield filter — the hard bot won't open a money-losing route just
        // to harass the human.
        const odKey = odSorted(origin, dest.code);
        const counterBonus =
          difficulty === "hard" && humanOdBonus[odKey]
            ? Math.min(2.0, 1.0 + humanOdBonus[odKey] / 20)
            : 1.0;

        // Easy mistake mode: invert scoring for this pick so low-demand
        // cities float to the top.
        const demandScore = easyMistakeMode
          ? 1 / Math.max(1, baseDemand) // bad pick
          : baseDemand * tierBonus;

        const score = demandScore * distFit * satPenalty * counterBonus;
        candidates.push({ origin, dest: dest.code, aircraft: plane, score });
      }
    }
  }

  // Sort by score, dedupe by aircraft, take up to quota
  candidates.sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  const picks: typeof candidates = [];
  for (const c of candidates) {
    if (used.has(c.aircraft.id)) continue;
    picks.push(c);
    used.add(c.aircraft.id);
    if (picks.length >= quota) break;
  }

  return picks.map((p) => {
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
    // Use phase-based utilisation: easy bots under-fly, hard bots max out.
    const utilBase =
      difficulty === "hard" ? 0.9 :
      difficulty === "easy" ? 0.5 : 0.7;
    const weeklyFreq = Math.max(1, Math.round(maxWeeklyFreq * utilBase));

    // Hard bots undercut human pricing on contested routes, premium otherwise.
    // Medium standard. Easy uses whatever fits their low-bias profile.
    let tier: PricingTier = "standard";
    if (difficulty === "hard") {
      const odKey = odSorted(p.origin, p.dest);
      tier = humanOdBonus[odKey] ? "budget" : "premium"; // undercut if competing
    } else if (difficulty === "easy") {
      tier = "standard";
    }

    return {
      origin: p.origin,
      dest: p.dest,
      aircraftId: p.aircraft.id,
      weeklyFreq,
      pricingTier: tier,
    };
  });
}

// ── Aircraft ordering ─────────────────────────────────────────────────────────

/** Plan an aircraft order for this quarter.
 *
 *  Uses ORDER_CADENCE to decide whether to order at all (phase × difficulty).
 *  Ordering quantity and aircraft type scaled by difficulty. */
export function planBotAircraftOrder(
  team: Team,
  difficulty: BotDifficulty,
  currentQuarter: number,
  totalRounds = 20,
): { specId: string; quantity: number; acquisitionType: "buy" | "lease" } | null {
  const profile = PROFILES[difficulty];
  const phase = gamePhase(currentQuarter, totalRounds);
  if (!ORDER_CADENCE[difficulty][phase]) return null; // scripted: don't order this phase

  // Available specs for this quarter
  const availableSpecs = AIRCRAFT.filter((a) => a.unlockQuarter <= currentQuarter);
  if (availableSpecs.length === 0) return null;

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
    const canBuy =
      team.cashUsd >= spec.buyPriceUsd * profile.orderAircraftCashRatio;
    const leaseEligible = canLeaseSpec(spec, AIRCRAFT, currentQuarter);
    const canLease =
      leaseEligible && team.cashUsd >= leaseTermsFor(spec).depositUsd;
    return canBuy || canLease;
  });
  if (candidates.length === 0) return null;

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
  const wantsRegional =
    fleetCount >= 8 &&
    !wantsCargo &&
    !wantsWide &&
    (fleetBuckets["regional"] ?? 0) === 0;
  const candidatesScored = candidates.map((c) => {
    const bucket = classify(c);
    const share = (fleetBuckets[bucket] ?? 0) / fleetTotal;
    const diversityBonus = (1 - share) * 0.5;
    const regionalBonus = wantsRegional && bucket === "regional" ? 0.4 : 0;
    const base =
      difficulty === "hard"
        ? c.unlockQuarter / 40
        : -c.buyPriceUsd / 200_000_000;
    return { spec: c, score: base + diversityBonus + regionalBonus };
  });
  candidatesScored.sort((a, b) => b.score - a.score);
  const pick = candidatesScored[0].spec;

  // Scripted quantity: easy always 1, medium 1-2, hard 1-3 (phase dependent)
  const maxQ =
    wantsCargo ? 1 :
    difficulty === "hard" ? (phase === "startup" ? 1 : 3) :
    difficulty === "medium" ? (phase === "growth" ? 2 : 1) : 1;
  const affordableQty = Math.min(
    maxQ,
    Math.floor(team.cashUsd / (pick.buyPriceUsd * profile.orderAircraftCashRatio)),
  );

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
  const basePrice = BASE_SLOT_PRICE_BY_TIER[tier];
  return Math.round(basePrice * profile.slotBidMultiplier);
}

/** Difficulty label for UI. */
export const BOT_DIFFICULTY_LABEL: Record<BotDifficulty, { label: string; description: string }> = {
  easy:   { label: "Easy",   description: "Cautious. Slow expansion. Light slot bids. Ignores edge opportunities." },
  medium: { label: "Medium", description: "Balanced. Opens 1–2 routes/quarter. Bids 25% above floor. PRD-aligned scenario picks." },
  hard:   { label: "Hard",   description: "Aggressive. Maxes out fleet. Bids 60% above floor. Undercuts humans on shared routes." },
};
