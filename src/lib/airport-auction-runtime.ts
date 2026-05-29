/**
 * ════════════════════════════════════════════════════════════════════
 *  AIRPORT SYSTEM V2 — Phase 4 runtime (privatization auction + gauntlet)
 * ════════════════════════════════════════════════════════════════════
 *
 * The pure scoring/auction math lives in `airport-system-v2.ts` (§6.1–6.3:
 * computeGap, resolveSealedAuction, demandCostMultiplier, …). This module is
 * the *runtime glue* between that math and live game state: it assembles the
 * GapInputs from a Team + airport, decides which airport the government
 * releases each privatization cycle, generates the approval-gauntlet demands,
 * and lets a bot rival decide whether (and how much) to bid.
 *
 * Everything here is pure (no store access, no Math.random hidden in scoring —
 * the one stochastic helper takes an explicit `rng`), so the store can call it
 * deterministically and it stays unit-testable. GATED: only ever reached when
 * `session.airportSystemV2 === true`; V1 games never touch it.
 */

import { CITIES, CITIES_BY_CODE, countryForCode } from "@/data/cities";
import type {
  Team,
  AirportSlotState,
  AirportActiveDemand,
} from "@/types/game";
import {
  type AirportLadder,
  type AirportDemandType,
  airportLadder,
  computeGap,
  type GapInputs,
  type GapBreakdown,
  AIRPORT_RESERVE_FLOOR,
  AIRPORT_GAP_QUALIFY,
  AIRPORT_APPROVAL,
  AIRPORT_DEMAND_DEFS,
  AIRPORT_SPECIALIZATIONS,
  AIRPORT_DEFAULT_FEES_BY_LADDER,
  AIRPORT_OPEX_RATIO_BASELINE,
  AIRPORT_NON_AERO_YIELD_PER_PAX,
  AIRPORT_QUARTER_WEEKS,
  demandCostMultiplier,
  privatizationCycleIndex,
  computeAirportRevenue,
  type AirportTraffic,
  type AirportRevenueBreakdown,
  type AirportFeeSchedule,
} from "@/lib/airport-system-v2";
import { computeBrandValue, computeNetEquityUsd, QUARTER_DAYS } from "@/lib/engine";

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// ─── Airport demand percentile (drives GAP scrutiny + demand cost) ──────────

/** Raw demand score for an airport: tourism + business pull of its city. */
function airportDemandScore(code: string): number {
  const c = CITIES_BY_CODE[code];
  if (!c) return 0;
  return (c.tourism ?? 0) + (c.business ?? 0);
}

// Precompute the sorted demand scores once so percentile lookups are O(log n).
const SORTED_DEMAND_SCORES: number[] = CITIES.map((c) =>
  (c.tourism ?? 0) + (c.business ?? 0),
).sort((a, b) => a - b);

/** Demand rank of an airport across the whole map, 0..1 (1 = busiest). */
export function airportDemandPercentile(code: string): number {
  const score = airportDemandScore(code);
  const n = SORTED_DEMAND_SCORES.length;
  if (n <= 1) return 0.5;
  // Count how many cities this one is at-least-as-busy-as.
  let lo = 0;
  let hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (SORTED_DEMAND_SCORES[mid] <= score) lo = mid + 1;
    else hi = mid;
  }
  return clamp01((lo - 1) / (n - 1));
}

// ─── GapInputs assembly ─────────────────────────────────────────────────────

/** Count outstanding safety/incident flags on a team (each −5 GAP). */
function countSafetyFlags(team: Team): number {
  let n = 0;
  for (const f of team.flags) {
    if (/safety|incident|crash|grounded_fleet|audit_fail/.test(f)) n += 1;
  }
  return n;
}

/** debt / (debt + equity)-style leverage ratio, clamped 0..1. */
function debtRatio(team: Team): number {
  const debt = (team.totalDebtUsd ?? 0) + (team.rcfBalanceUsd ?? 0);
  const equity = Math.max(1, computeNetEquityUsd(team));
  return clamp01(debt / (debt + equity));
}

/** Airports a team currently owns (anti-monopoly penalty input). */
export function ownedAirportCount(
  allSlots: Record<string, AirportSlotState>,
  teamId: string,
): number {
  let n = 0;
  for (const code of Object.keys(allSlots)) {
    if (allSlots[code]?.ownerTeamId === teamId) n += 1;
  }
  return n;
}

/** Assemble the pure GAP inputs from live state for one (team, airport, bid). */
export function buildGapInputs(args: {
  team: Team;
  airportCode: string;
  slotState: AirportSlotState | undefined;
  bidAmountUsd: number;
  allSlots: Record<string, AirportSlotState>;
  /** Demands already accepted this acquisition (0 at bid time). */
  demandsAccepted?: number;
}): GapInputs {
  const { team, airportCode, slotState, bidAmountUsd, allSlots } = args;
  const ladder = airportLadder(airportCode, slotState?.ladder);
  return {
    ladder,
    brandRating: Math.max(0, Math.min(100, team.brandValue ?? computeBrandValue(team))),
    cashUsd: team.cashUsd,
    debtRatio: debtRatio(team),
    opsNormalized: clamp01((team.opsPts ?? 50) / 100),
    safetyFlags: countSafetyFlags(team),
    nationalAlignment:
      !!team.hubCode &&
      countryForCode(team.hubCode) != null &&
      countryForCode(team.hubCode) === countryForCode(airportCode),
    demandsAccepted: args.demandsAccepted ?? 0,
    isGlobalNetwork: team.doctrine === "global-network",
    ownedAirportCount: ownedAirportCount(allSlots, team.id),
    demandPercentile: airportDemandPercentile(airportCode),
    bidAmountUsd,
  };
}

/** Convenience: GAP breakdown for a (team, airport, bid). */
export function gapFor(args: Parameters<typeof buildGapInputs>[0]): GapBreakdown {
  return computeGap(buildGapInputs(args));
}

// ─── Airport selection per privatization cycle ──────────────────────────────

/** City tier the government releases at this auction cycle. Early cycles sell
 *  smaller fields (Regional/National); later cycles release flagship
 *  International gateways. Returns a *city tier* (1=biggest..4). */
function targetCityTierForCycle(cycle: number): number {
  if (cycle <= 0) return 3; // Regional-class first
  if (cycle === 1) return 2; // National
  if (cycle === 2) return 2;
  return 1; // International flagship from cycle 3 on
}

/** Pick the airport the government privatizes this round (or null). Chooses the
 *  busiest still-public airport in the cycle's target tier band, skipping any
 *  already owned or currently mid-auction. Deterministic given the inputs. */
export function selectAirportToPrivatize(args: {
  round: number;
  campaignMode: "half" | "full";
  allSlots: Record<string, AirportSlotState>;
  /** Airport codes that already have an open/approval auction. */
  inFlightCodes: Set<string>;
}): string | null {
  const cycle = privatizationCycleIndex(args.round, args.campaignMode);
  if (cycle < 0) return null;
  const targetTier = targetCityTierForCycle(cycle);

  const isAvailable = (code: string) =>
    !args.allSlots[code]?.ownerTeamId && !args.inFlightCodes.has(code);

  // Prefer the target tier; widen the band outward if nothing is available.
  const tierOrder = [targetTier, targetTier - 1, targetTier + 1, targetTier - 2, targetTier + 2]
    .filter((t) => t >= 1 && t <= 4);
  for (const tier of tierOrder) {
    const candidates = CITIES.filter((c) => c.tier === tier && isAvailable(c.code))
      .sort((a, b) => airportDemandScore(b.code) - airportDemandScore(a.code));
    if (candidates.length > 0) return candidates[0].code;
  }
  return null;
}

// ─── Approval-gauntlet demand generation ────────────────────────────────────

const ALL_DEMAND_TYPES = Object.keys(AIRPORT_DEMAND_DEFS) as AirportDemandType[];

/** Base magnitude (pre-multiplier) for a demand, by shape. Cash shapes are USD;
 *  premium/equity are fractions; operational are round counts / city counts. */
function baseDemandMagnitude(type: AirportDemandType): number {
  switch (type) {
    case "carbon-offset": return 20_000_000;        // one-time cash
    case "infrastructure": return 60_000_000;        // one-time cash
    case "employment-guarantee": return 2_500_000;   // recurring / quarter
    case "concession-premium": return 0.08;          // fraction of winning bid
    case "local-stake-retention": return 0.12;       // equity fraction kept by gov
    case "government-lobbying": return 5_000_000;     // cheap one-time, sets flag
    case "capacity-expansion": return 100;            // slots to add
    case "route-service-obligation": return 3;        // underserved cities to serve
    default: return 0;
  }
}

/**
 * Generate the demands the government issues for a won auction. Count is drawn
 * from the ladder's demand band; types are sampled without replacement. Cash /
 * recurring / premium magnitudes scale by demandCostMultiplier (busier + bigger
 * airports demand more). Operational demands carry a dueRound.
 */
export function generateApprovalDemands(args: {
  ladder: AirportLadder;
  airportCode: string;
  openedRound: number;
  deadlineRound: number;
  rng: () => number;
}): AirportActiveDemand[] {
  const { ladder, airportCode, openedRound, deadlineRound, rng } = args;
  const band = AIRPORT_APPROVAL[ladder].demands;
  const count = band[0] + Math.floor(rng() * (band[1] - band[0] + 1));
  if (count <= 0) return [];

  const percentile = airportDemandPercentile(airportCode);
  const mult = demandCostMultiplier(ladder, percentile);

  // Sample `count` distinct demand types.
  const pool = [...ALL_DEMAND_TYPES];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, Math.min(count, pool.length));

  return chosen.map((type) => {
    const def = AIRPORT_DEMAND_DEFS[type];
    const base = baseDemandMagnitude(type);
    let magnitude = base;
    let dueRound: number | undefined;
    switch (def.shape) {
      case "one-time":
      case "recurring":
        magnitude = Math.round(base * mult);
        break;
      case "premium":
        magnitude = clamp01(base * mult); // fraction, capped at 1
        break;
      case "equity":
        magnitude = Math.min(0.20, base * (1 + ladder * 0.1)); // 12%..~20%
        break;
      case "operational":
        magnitude = Math.max(1, Math.round(base));
        dueRound = deadlineRound + AIRPORT_APPROVAL[ladder].rounds[1] + 2;
        break;
      case "flag":
        magnitude = Math.round(base * (1 + ladder * 0.2));
        break;
    }
    void openedRound;
    return { type, magnitude, accepted: false, dueRound };
  });
}

// ─── Bot bidding ────────────────────────────────────────────────────────────

export interface BotBidDecision {
  amountUsd: number;
  gap: number;
}

/** Decide whether a bot rival bids on an open auction, and how much. Returns
 *  null if the bot passes (can't afford the reserve, or wouldn't qualify even
 *  at a stretch bid). Difficulty scales aggression. */
export function planBotSealedBid(args: {
  team: Team;
  airportCode: string;
  slotState: AirportSlotState | undefined;
  allSlots: Record<string, AirportSlotState>;
  difficulty: "easy" | "medium" | "hard" | undefined;
  rng: () => number;
}): BotBidDecision | null {
  const { team, airportCode, slotState, allSlots, rng } = args;
  const ladder = airportLadder(airportCode, slotState?.ladder);
  const floor = AIRPORT_RESERVE_FLOOR[ladder];

  // Need real liquidity headroom over the reserve to even consider bidding.
  if (team.cashUsd < floor * 1.15) return null;

  const aggression =
    args.difficulty === "hard" ? 0.55 :
    args.difficulty === "easy" ? 0.20 : 0.38;

  // Bid = reserve scaled up by aggression + jitter, capped to a safe fraction
  // of the bot's cash so it never bankrupts itself on a single airport.
  const stretch = 1 + aggression * (0.6 + rng() * 0.8); // ~1.12 .. ~1.99
  const cashCap = team.cashUsd * (0.35 + aggression * 0.35);
  const amountUsd = Math.round(Math.min(floor * stretch, Math.max(floor, cashCap)));
  if (amountUsd < floor) return null;

  const gap = computeGap(
    buildGapInputs({ team, airportCode, slotState, bidAmountUsd: amountUsd, allSlots }),
  ).gap;

  // Bots only file a bid they believe clears qualification (with a small
  // tolerance so a borderline hard bot still gambles).
  const tolerance = args.difficulty === "hard" ? 4 : 0;
  if (gap + tolerance < AIRPORT_GAP_QUALIFY[ladder]) return null;

  return { amountUsd, gap };
}

// ─── §7.1 Owner revenue (engine-side aggregation) ───────────────────────

/** Sum a route's quarterly passenger throughput from the per-class daily
 *  pax fields (each is per-flight daily; quarter = × QUARTER_DAYS × freq). */
function routeQuarterlyPax(r: {
  quarterlyFirstPax?: number;
  quarterlyBusPax?: number;
  quarterlyEconPax?: number;
  dailyFrequency: number;
}): number {
  const perFlightDaily =
    (r.quarterlyFirstPax ?? 0) + (r.quarterlyBusPax ?? 0) + (r.quarterlyEconPax ?? 0);
  return perFlightDaily * QUARTER_DAYS * Math.max(0, r.dailyFrequency);
}

/** Aggregate one quarter of traffic at `airportCode` across every team's
 *  active routes plus the airport's simulated background carriers. Movements
 *  are landings (one per daily frequency per day, both endpoints); departing
 *  pax is half a route's throughput (the half originating here); non-aero
 *  throughput counts every passenger that touches the airport once.
 *
 *  Slot usage comes from each team's `airportLeases[code].slots`; the owner's
 *  own lease is tracked separately so the self-discount lands only on it. */
export function aggregateAirportTraffic(args: {
  teams: Team[];
  airportCode: string;
  slotState: AirportSlotState;
  ownerTeamId: string;
}): AirportTraffic {
  const { teams, airportCode, slotState, ownerTeamId } = args;
  const player = { slotsUsed: 0, movements: 0, departingPax: 0, throughputPax: 0 };
  let ownerSlotsUsed = 0;

  for (const t of teams) {
    const lease = t.airportLeases?.[airportCode];
    if (lease && lease.slots > 0) {
      player.slotsUsed += lease.slots;
      if (t.id === ownerTeamId) ownerSlotsUsed += lease.slots;
    }
    for (const r of t.routes ?? []) {
      if (r.status !== "active") continue;
      if (r.originCode !== airportCode && r.destCode !== airportCode) continue;
      // Movements: one landing per daily frequency per day at this endpoint.
      player.movements += Math.max(0, r.dailyFrequency) * QUARTER_DAYS;
      if (!r.isCargo) {
        const qPax = routeQuarterlyPax(r);
        player.departingPax += qPax / 2;
        player.throughputPax += qPax;
      }
    }
  }

  // Background traffic — derive plausible movements / pax from the airport's
  // background-occupied slots (each ≈ one weekly schedule; ~150 pax/flight at
  // typical load). Keeps non-aero meaningful even at a freshly-bought airport.
  const bgSlots = slotState.backgroundSlotsUsed ?? 0;
  const bgFlightsPerQuarter = bgSlots * AIRPORT_QUARTER_WEEKS;
  const BG_PAX_PER_FLIGHT = 150;
  const background = {
    slotsUsed: bgSlots,
    movements: bgFlightsPerQuarter,
    departingPax: bgFlightsPerQuarter * BG_PAX_PER_FLIGHT,
    throughputPax: bgFlightsPerQuarter * BG_PAX_PER_FLIGHT * 2,
  };

  return { player, background, ownerSlotsUsed };
}

/** Per-quarter ongoing demand obligations (recurring + operational + equity
 *  dividends approximated as a small revenue share) for an owned airport. */
function ongoingDemandCostsUsd(
  slotState: AirportSlotState,
  grossEstimateUsd: number,
): number {
  let cost = 0;
  for (const d of slotState.activeDemands ?? []) {
    if (!d.accepted) continue;
    const def = AIRPORT_DEMAND_DEFS[d.type];
    if (!def) continue;
    if (def.shape === "recurring") {
      cost += d.magnitude; // already a per-quarter USD figure
    } else if (def.shape === "equity") {
      // Government equity draws proportional dividends from gross.
      cost += grossEstimateUsd * d.magnitude;
    }
    // one-time / premium were charged at acquisition; operational / flag are
    // non-cash here (they constrain operations / set lobbying exposure).
  }
  return cost;
}

/** Full owner-revenue computation for one owned airport this quarter. Pure
 *  glue over `computeAirportRevenue`: pulls the owner's posted fees (falling
 *  back to the ladder default), retail level, specialization modifier, opex
 *  ratio and self-discount off the slot state, aggregates traffic, and
 *  returns the breakdown. Returns null if the airport isn't owner-held. */
export function computeOwnedAirportRevenue(args: {
  teams: Team[];
  airportCode: string;
  slotState: AirportSlotState;
}): AirportRevenueBreakdown | null {
  const { teams, airportCode, slotState } = args;
  const ownerTeamId = slotState.ownerTeamId;
  if (!ownerTeamId) return null;

  const ladder: AirportLadder = airportLadder(airportCode, slotState.ladder);
  const marketFees = AIRPORT_DEFAULT_FEES_BY_LADDER[ladder];
  const fees: AirportFeeSchedule = {
    slotFeeUsd: slotState.slotFeeUsd ?? marketFees.slotFeeUsd,
    landingFeeUsd: slotState.landingFeeUsd ?? marketFees.landingFeeUsd,
    passengerChargeUsd: slotState.passengerChargeUsd ?? marketFees.passengerChargeUsd,
  };

  const traffic = aggregateAirportTraffic({ teams, airportCode, slotState, ownerTeamId });

  const specModifier = slotState.specialization
    ? AIRPORT_SPECIALIZATIONS[slotState.specialization]?.nonAeroModifier ?? 1
    : 1;

  // Rough gross estimate for the equity-dividend demand (avoids a circular
  // dependency: equity draws a share of gross, so estimate gross sans demand
  // costs first, then feed it in).
  const grossEstimate =
    (traffic.player.throughputPax + traffic.background.throughputPax) *
    AIRPORT_NON_AERO_YIELD_PER_PAX;

  return computeAirportRevenue(traffic, {
    fees,
    marketFees,
    retailLevel: slotState.retailDevelopmentLevel ?? 1,
    specializationModifier: specModifier,
    opexRatio: slotState.airportOpexRatio ?? AIRPORT_OPEX_RATIO_BASELINE,
    ongoingDemandCostsUsd: ongoingDemandCostsUsd(slotState, grossEstimate),
    selfDiscountPct: slotState.ownerSelfDiscountPct ?? 0,
  });
}
