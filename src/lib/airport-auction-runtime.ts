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
  AIRPORT_PRICE_DISCRIMINATION_LIMIT,
  AIRPORT_USE_IT_OR_LOSE_IT_ROUNDS,
  AIRPORT_REGULATORY_FINE_PCT,
  demandCostMultiplier,
  privatizationCycleIndex,
  computeAirportRevenue,
  forkEffect,
  type AirportTraffic,
  type AirportTrafficSegment,
  type AirportRevenueBreakdown,
  type AirportFeeSchedule,
} from "@/lib/airport-system-v2";
import { computeBrandValue, computeNetEquityUsd, routeQuarterlyFuelBurnL, QUARTER_DAYS } from "@/lib/engine";

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

/** Estimated jet fuel litres uplifted (burned) at the airport this quarter
 *  across EVERY airline plus background carriers. Fuel is uplifted at the
 *  departure airport, so player burn counts routes whose ORIGIN is this code
 *  (mirroring the cityQuarterlyBurnL convention in the engine). Background
 *  departures derive from the airport's occupied background slots × a typical
 *  narrowbody per-flight uplift. Drives the Cargo Fuel Farm fork's margin. */
const BG_FUEL_PER_DEPARTURE_L = 11_000;

export function fuelFarmLitresBurned(args: {
  teams: Team[];
  airportCode: string;
  slotState: AirportSlotState;
}): number {
  const { teams, airportCode, slotState } = args;
  let litres = 0;
  for (const t of teams) {
    for (const r of t.routes ?? []) {
      if (r.status !== "active") continue;
      if (r.originCode !== airportCode) continue;
      litres += routeQuarterlyFuelBurnL(t, r);
    }
  }
  const bgSlots = slotState.backgroundSlotsUsed ?? 0;
  const bgDepartures = bgSlots * AIRPORT_QUARTER_WEEKS;
  litres += bgDepartures * BG_FUEL_PER_DEPARTURE_L;
  return litres;
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

  // §8 fork levers tune the specialization in a concrete direction.
  const fe = forkEffect(slotState.specializationFork);

  // Background-traffic forks (Free Trade Zone, High-Density Apron, Biometric)
  // scale the simulated carrier traffic the airport draws.
  if (fe.backgroundTrafficMult !== 1) {
    const m = fe.backgroundTrafficMult;
    const bg: AirportTrafficSegment = {
      slotsUsed: traffic.background.slotsUsed * m,
      movements: traffic.background.movements * m,
      departingPax: traffic.background.departingPax * m,
      throughputPax: traffic.background.throughputPax * m,
    };
    traffic.background = bg;
  }

  const baseSpecModifier = slotState.specialization
    ? AIRPORT_SPECIALIZATIONS[slotState.specialization]?.nonAeroModifier ?? 1
    : 1;
  const specModifier = baseSpecModifier * fe.nonAeroMult;
  const opexRatio = (slotState.airportOpexRatio ?? AIRPORT_OPEX_RATIO_BASELINE) + fe.opexDelta;

  // Cargo Fuel Farm: margin × every litre burned at the airport by anyone.
  const fuelFarmMarginUsdPerL = fe.fuelFarmMarginUsdPerL;
  const fuelLitresBurned =
    fuelFarmMarginUsdPerL > 0 ? fuelFarmLitresBurned({ teams, airportCode, slotState }) : 0;

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
    opexRatio,
    ongoingDemandCostsUsd: ongoingDemandCostsUsd(slotState, grossEstimate),
    selfDiscountPct: slotState.ownerSelfDiscountPct ?? 0,
    fuelFarmMarginUsdPerL,
    fuelLitresBurned,
  });
}

// ─── §9 Regulatory enforcement ──────────────────────────────────────────────
//
// Run once per owned airport at quarter close. Pure: takes the live state and
// an `rng`, returns the slot patch + side-effects (cash fine, brand hit,
// reclaimed slots) for the store to apply and narrate. Three independent
// mechanisms (an airport can trip more than one in a round):
//
//  1. Price discrimination — self-vs-rival fee gap beyond the 15% legal edge
//     triggers a review: a fine (% of airport revenue) + forced equal pricing
//     for N rounds; the third strike forces partial divestment.
//  2. Use-it-or-lose-it — slots held but flown by no owner route for 4
//     consecutive rounds are reclaimed to the public pool.
//  3. Lobbying scandal — a latent corruption flag (set when the lobbying
//     demand was accepted) can surface as a world-news event: brand hit + fine.

/** How many rounds equal pricing is enforced after a discrimination finding. */
export const AIRPORT_FORCED_EQUAL_PRICING_ROUNDS = 4;
/** Strike count at which the regulator forces partial divestment. */
export const AIRPORT_REGULATORY_DIVEST_STRIKE = 3;
/** Fraction of capacity reclaimed on a forced partial divestment. */
export const AIRPORT_DIVEST_CAPACITY_FRACTION = 0.25;
/** Per-round probability a standing lobbying-exposure flag erupts into a
 *  corruption scandal. Low — it is a latent tail risk, not a recurring tax. */
export const AIRPORT_LOBBYING_SCANDAL_CHANCE = 0.08;
/** Brand-value hit (0..100 scale) from a lobbying corruption scandal. */
export const AIRPORT_LOBBYING_SCANDAL_BRAND_HIT = 6;

export interface RegulatoryOutcome {
  /** Fields to merge onto the airport's slot state. */
  slotPatch: Partial<AirportSlotState>;
  /** USD fine charged to the owner (≥0). */
  fineUsd: number;
  /** Brand-value points to subtract from the owner (≥0). */
  brandHit: number;
  /** Slots returned to the public pool (use-it-or-lose-it / divestment). */
  reclaimedSlots: number;
  /** True when this round forced a partial divestment. */
  divested: boolean;
  /** Player-facing notices (only surfaced when the owner is the player). */
  notices: Array<{ kind: "discrimination" | "use-it-or-lose-it" | "scandal"; title: string; body: string }>;
}

/** Does the owner actually fly through this airport this round? Drives the
 *  use-it-or-lose-it counter — an owner that hoards slots to wall out rivals
 *  but flies nothing loses the block. */
function ownerUsesAirport(team: Team | undefined, airportCode: string): boolean {
  if (!team) return false;
  if (team.hubCode === airportCode) return true;
  if ((team.secondaryHubCodes ?? []).includes(airportCode)) return true;
  for (const r of team.routes ?? []) {
    if (r.status !== "active") continue;
    if (r.originCode === airportCode || r.destCode === airportCode) return true;
  }
  return false;
}

export function assessAirportRegulatory(args: {
  teams: Team[];
  airportCode: string;
  slotState: AirportSlotState;
  round: number;
  cityName: string;
  rng?: () => number;
}): RegulatoryOutcome {
  const { teams, airportCode, slotState, round, cityName } = args;
  const rng = args.rng ?? Math.random;
  const out: RegulatoryOutcome = {
    slotPatch: {},
    fineUsd: 0,
    brandHit: 0,
    reclaimedSlots: 0,
    divested: false,
    notices: [],
  };
  const ownerTeamId = slotState.ownerTeamId;
  if (!ownerTeamId) return out;
  const owner = teams.find((t) => t.id === ownerTeamId);

  // Airport quarterly revenue — basis for fines.
  const breakdown = computeOwnedAirportRevenue({ teams, airportCode, slotState });
  const airportRevenue = Math.max(0, breakdown?.net ?? 0);

  // ── 1. Price discrimination ────────────────────────────────────────────
  // The owner bills itself `selfDiscountPct` below the rival rate. The store
  // clamps player input to the 15% legal edge, but a bot (or a stale save)
  // can exceed it — and that is exactly what the regulator polices.
  const gap = slotState.ownerSelfDiscountPct ?? 0;
  if (gap > AIRPORT_PRICE_DISCRIMINATION_LIMIT) {
    const strikes = (slotState.regulatoryStrikes ?? 0) + 1;
    const fine = Math.round(airportRevenue * AIRPORT_REGULATORY_FINE_PCT);
    out.fineUsd += fine;
    out.slotPatch.regulatoryStrikes = strikes;
    // Forced equal pricing — strip the discount and lock it out for N rounds.
    out.slotPatch.ownerSelfDiscountPct = 0;
    out.slotPatch.regulatedUntilRound = round + AIRPORT_FORCED_EQUAL_PRICING_ROUNDS;
    if (strikes >= AIRPORT_REGULATORY_DIVEST_STRIKE) {
      // Repeat offender → forced partial divestment: a slice of capacity is
      // reclaimed to the public pool and the offence counter resets.
      const cap = slotState.totalCapacity ?? 0;
      const reclaimed = Math.round(cap * AIRPORT_DIVEST_CAPACITY_FRACTION);
      if (reclaimed > 0) {
        out.reclaimedSlots += reclaimed;
        out.slotPatch.totalCapacity = Math.max(0, cap - reclaimed);
        out.slotPatch.available = (slotState.available ?? 0) + reclaimed;
      }
      out.slotPatch.regulatoryStrikes = 0;
      out.divested = true;
      out.notices.push({
        kind: "discrimination",
        title: `Forced divestment · ${cityName}`,
        body: `Repeat self-dealing at ${airportCode}. The regulator fined you ${fmtUsdShort(fine)}, reclaimed ${reclaimed} slots to the public pool, and locked equal pricing for ${AIRPORT_FORCED_EQUAL_PRICING_ROUNDS} quarters.`,
      });
    } else {
      out.notices.push({
        kind: "discrimination",
        title: `Regulatory review · ${cityName}`,
        body: `Your self-discount at ${airportCode} exceeded the 15% legal edge. Fine ${fmtUsdShort(fine)}; equal pricing enforced for ${AIRPORT_FORCED_EQUAL_PRICING_ROUNDS} quarters (strike ${strikes} of ${AIRPORT_REGULATORY_DIVEST_STRIKE}).`,
      });
    }
  }

  // ── 2. Use-it-or-lose-it ────────────────────────────────────────────────
  if (ownerUsesAirport(owner, airportCode)) {
    if ((slotState.unusedSlotRoundCount ?? 0) !== 0) out.slotPatch.unusedSlotRoundCount = 0;
  } else {
    const count = (slotState.unusedSlotRoundCount ?? 0) + 1;
    if (count >= AIRPORT_USE_IT_OR_LOSE_IT_ROUNDS && (slotState.reservedSlotPct ?? 0) > 0) {
      // Reclaim the idle reservation back to the public pool.
      const cap = out.slotPatch.totalCapacity ?? slotState.totalCapacity ?? 0;
      const reclaimed = Math.round(cap * (slotState.reservedSlotPct ?? 0));
      out.slotPatch.reservedSlotPct = 0;
      out.slotPatch.unusedSlotRoundCount = 0;
      if (reclaimed > 0) {
        out.reclaimedSlots += reclaimed;
        const avail = out.slotPatch.available ?? slotState.available ?? 0;
        out.slotPatch.available = avail + reclaimed;
      }
      out.notices.push({
        kind: "use-it-or-lose-it",
        title: `Slots reclaimed · ${cityName}`,
        body: `Your reserved block at ${airportCode} sat unused for ${AIRPORT_USE_IT_OR_LOSE_IT_ROUNDS} quarters. The regulator returned ${reclaimed} slots to the public pool.`,
      });
    } else {
      out.slotPatch.unusedSlotRoundCount = count;
    }
  }

  // ── 3. Lobbying scandal ─────────────────────────────────────────────────
  if ((slotState.lobbyingExposure ?? 0) > 0 && rng() < AIRPORT_LOBBYING_SCANDAL_CHANCE) {
    const fine = Math.round(airportRevenue * AIRPORT_REGULATORY_FINE_PCT);
    out.fineUsd += fine;
    out.brandHit += AIRPORT_LOBBYING_SCANDAL_BRAND_HIT;
    // The flag is spent once the scandal breaks — a one-time latent risk.
    out.slotPatch.lobbyingExposure = undefined;
    out.notices.push({
      kind: "scandal",
      title: `Corruption scandal · ${cityName}`,
      body: `The lobbying that smoothed your ${airportCode} acquisition surfaced in the press. Brand −${AIRPORT_LOBBYING_SCANDAL_BRAND_HIT} and a ${fmtUsdShort(fine)} fine.`,
    });
  }

  return out;
}

/** Compact USD formatter for regulatory notices (e.g. "$12.4M"). */
function fmtUsdShort(usd: number): string {
  const abs = Math.abs(usd);
  if (abs >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}
