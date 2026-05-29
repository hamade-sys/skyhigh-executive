import { CITIES_BY_CODE } from "@/data/cities";
import type { CityTier, DoctrineId } from "@/types/game";

/**
 * ════════════════════════════════════════════════════════════════════
 *  AIRPORT OWNERSHIP & HUB SYSTEM — V2 (Agent Build Specification)
 * ════════════════════════════════════════════════════════════════════
 *
 * This module is the self-contained spec layer for the redesigned airport
 * system: hub allowance, network topology, the 6-rung airport ladder, slot
 * scarcity / background traffic, the privatization auction + GAP scoring +
 * approval gauntlet, ownership economics, specializations/forks, and the
 * regulatory limiters.
 *
 * ── Gating ──────────────────────────────────────────────────────────
 * The V2 system applies ONLY to games created after it ships
 * (`session.airportSystemV2 === true`). In-flight games and every existing
 * save keep the V1 airport system untouched — zero disruption to live
 * workshops. Nothing in this module changes V1 behaviour; it is only
 * reached when the engine/store/UI branch on the V2 flag.
 *
 * ── Tier representation ─────────────────────────────────────────────
 * The spec names six tiers, T4 Local (smallest) … TX Mega Gateway
 * (largest). The live game already numbers *city* tiers 1..4 where tier 1
 * is the BIGGEST. To honour "keep the current numbering" we DO NOT renumber
 * cities. Instead we use an internal **ladder index 0..5** that runs
 * smallest→largest, and map the city tier onto the bottom four rungs:
 *
 *      ladder 0  →  Local         (city tier 4 — smallest)
 *      ladder 1  →  Regional      (city tier 3)
 *      ladder 2  →  National      (city tier 2)
 *      ladder 3  →  International (city tier 1 — biggest STARTING tier)
 *      ladder 4  →  Major Hub     (upgrade-only — above every starting city)
 *      ladder 5  →  Mega Gateway  (upgrade-only — the infrastructure endgame)
 *
 * So a brand-new game never starts with anything above "International"
 * (ladder 3 = city tier 1); Major Hub and Mega Gateway are reached only by
 * a player funding tier upgrades. The spec's "tier_index" (T4=0..TX=5) is
 * exactly this ladder index.
 */

// ─── Tier ladder ──────────────────────────────────────────────────────

/** Internal smallest→largest ladder index. */
export type AirportLadder = 0 | 1 | 2 | 3 | 4 | 5;

export const AIRPORT_LADDER_NAME: Record<AirportLadder, string> = {
  0: "Local",
  1: "Regional",
  2: "National",
  3: "International",
  4: "Major Hub",
  5: "Mega Gateway",
};

/** Short spec label (T4..TX) for debugging / facilitator views. */
export const AIRPORT_LADDER_CODE: Record<AirportLadder, string> = {
  0: "T4", 1: "T3", 2: "T2", 3: "T1", 4: "T0", 5: "TX",
};

/** City tier (1=biggest..4=smallest) → ladder index (0=smallest..5). */
export function cityTierToLadder(tier: CityTier | number): AirportLadder {
  switch (tier) {
    case 1: return 3; // International
    case 2: return 2; // National
    case 3: return 1; // Regional
    default: return 0; // Local (tier 4 or unknown)
  }
}

/** Resolve an airport's current ladder index. A V2 airport stores its own
 *  `ladder` once upgraded; before any upgrade it derives from the city
 *  tier. Falls back to Local for unknown codes. */
export function airportLadder(
  airportCode: string,
  storedLadder: number | null | undefined,
): AirportLadder {
  if (typeof storedLadder === "number" && storedLadder >= 0 && storedLadder <= 5) {
    return storedLadder as AirportLadder;
  }
  const city = CITIES_BY_CODE[airportCode];
  return cityTierToLadder(city?.tier ?? 4);
}

// ─── §4.1 Tier table: ceilings, slot-pack & upgrade costs ───────────────

export interface AirportTierSpec {
  ladder: AirportLadder;
  name: string;
  slotCeiling: number;
  /** Cost to buy one +100 slot pack within this tier. */
  slotPackCostPer100: number;
  /** Lump cost to upgrade to the next ladder rung (null at max). */
  upgradeCostUsd: number | null;
  /** Build time in rounds for the tier upgrade (null at max). */
  upgradeRounds: number | null;
}

export const AIRPORT_TIER_SPECS: Record<AirportLadder, AirportTierSpec> = {
  0: { ladder: 0, name: "Local",         slotCeiling:  100, slotPackCostPer100:  15_000_000, upgradeCostUsd:  80_000_000, upgradeRounds: 3 },
  1: { ladder: 1, name: "Regional",      slotCeiling:  500, slotPackCostPer100:  25_000_000, upgradeCostUsd: 150_000_000, upgradeRounds: 4 },
  2: { ladder: 2, name: "National",      slotCeiling:  750, slotPackCostPer100:  40_000_000, upgradeCostUsd: 280_000_000, upgradeRounds: 5 },
  3: { ladder: 3, name: "International", slotCeiling: 1000, slotPackCostPer100:  60_000_000, upgradeCostUsd: 500_000_000, upgradeRounds: 6 },
  4: { ladder: 4, name: "Major Hub",     slotCeiling: 2000, slotPackCostPer100:  90_000_000, upgradeCostUsd: 900_000_000, upgradeRounds: 8 },
  5: { ladder: 5, name: "Mega Gateway",  slotCeiling: 2500, slotPackCostPer100: 130_000_000, upgradeCostUsd: null,        upgradeRounds: null },
};

/** Slots delivered per slot-pack purchase, and build time in rounds. */
export const AIRPORT_SLOT_PACK_SIZE = 100;
export const AIRPORT_SLOT_PACK_BUILD_ROUNDS = 2;

// ─── §4.2 Tier gating: aircraft size class & route eligibility ──────────

/** Body-size class derived from an AircraftSpec. The catalogue only labels
 *  family ("passenger" | "cargo"), so we derive a size class from seats /
 *  cargo tonnage — the dimension the tier table gates on (T4 regional only,
 *  T3 adds narrowbody, T2 adds widebody, T1+ all). */
export type AircraftSizeClass = "regional" | "narrowbody" | "widebody";

/** Seat / tonnage thresholds for the size-class derivation. Calibrated to the
 *  live catalogue: CRJ/E-jets/Dash/ATR (≤110 seats) → regional; A319/320/321,
 *  737 family, 757 (≤230) → narrowbody; A330/767/777/747/A380 (>230) →
 *  widebody. Cargo frames split on payload tonnes. */
export const AIRCRAFT_REGIONAL_SEAT_MAX = 110;
export const AIRCRAFT_NARROWBODY_SEAT_MAX = 230;
export const AIRCRAFT_REGIONAL_CARGO_T_MAX = 25;
export const AIRCRAFT_NARROWBODY_CARGO_T_MAX = 65;

/** Minimal AircraftSpec shape this module needs (avoids importing the whole
 *  type and keeps the helper testable with plain objects). */
export interface AircraftSizeInput {
  family: "passenger" | "cargo";
  seats: { first: number; business: number; economy: number };
  cargoTonnes?: number;
}

/** Derive the body-size class used for tier gating. */
export function aircraftSizeClass(spec: AircraftSizeInput): AircraftSizeClass {
  if (spec.family === "cargo") {
    const t = spec.cargoTonnes ?? 0;
    if (t <= AIRCRAFT_REGIONAL_CARGO_T_MAX) return "regional";
    if (t <= AIRCRAFT_NARROWBODY_CARGO_T_MAX) return "narrowbody";
    return "widebody";
  }
  const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
  if (seats > AIRCRAFT_NARROWBODY_SEAT_MAX) return "widebody";
  if (seats <= AIRCRAFT_REGIONAL_SEAT_MAX) return "regional";
  return "narrowbody";
}

/** Haul-length thresholds (km) for route eligibility by tier. */
export const AIRPORT_SHORT_HAUL_KM = 3000;
export const AIRPORT_MEDIUM_HAUL_KM = 7000;

/** Can an airport at `ladder` physically handle this aircraft size class?
 *  T4 Local (0): regional/turboprop only. T3 Regional (1): + narrowbody.
 *  T2 National (2): + (limited) widebody. T1+ (3..5): all. */
export function aircraftAllowedAtLadder(
  cls: AircraftSizeClass,
  ladder: AirportLadder,
): boolean {
  if (ladder <= 0) return cls === "regional";
  if (ladder === 1) return cls === "regional" || cls === "narrowbody";
  return true; // ladder 2+ accepts widebody and below
}

/** Can an airport at `ladder` serve a route of this haul length?
 *  T4 (0): domestic only. T3 (1): domestic + short international.
 *  T2 (2): up to international medium-haul. T1+ (3..5): full long-haul. */
export function routeAllowedAtLadder(
  distanceKm: number,
  sameCountry: boolean,
  ladder: AirportLadder,
): boolean {
  if (ladder <= 0) return sameCountry;
  if (ladder === 1) return sameCountry || distanceKm <= AIRPORT_SHORT_HAUL_KM;
  if (ladder === 2) return sameCountry || distanceKm <= AIRPORT_MEDIUM_HAUL_KM;
  return true; // ladder 3+ : long-haul allowed
}

export interface RouteTierGateInput {
  originLadder: AirportLadder;
  destLadder: AirportLadder;
  sizeClass: AircraftSizeClass;
  distanceKm: number;
  sameCountry: boolean;
}

export interface RouteTierGateResult {
  ok: boolean;
  reason?: string;
}

/** Combined endpoint gate: both the origin and destination airport tiers must
 *  independently admit the aircraft size class AND the route's haul length.
 *  The binding (lower) endpoint is reported in the failure reason. */
export function checkRouteTierGate(input: RouteTierGateInput): RouteTierGateResult {
  const { originLadder, destLadder, sizeClass, distanceKm, sameCountry } = input;
  const endpoints: Array<{ label: string; ladder: AirportLadder }> = [
    { label: "origin", ladder: originLadder },
    { label: "destination", ladder: destLadder },
  ];
  for (const { ladder } of endpoints) {
    if (!aircraftAllowedAtLadder(sizeClass, ladder)) {
      const need =
        sizeClass === "widebody" ? "National (T2) or higher" : "Regional (T3) or higher";
      return {
        ok: false,
        reason: `A ${AIRPORT_LADDER_NAME[ladder]} airport can't handle ${sizeClass} aircraft — needs ${need}. Upgrade the airport tier or assign a smaller type.`,
      };
    }
    if (!routeAllowedAtLadder(distanceKm, sameCountry, ladder)) {
      const haul = sameCountry
        ? "this route"
        : distanceKm <= AIRPORT_SHORT_HAUL_KM
          ? "short international"
          : distanceKm <= AIRPORT_MEDIUM_HAUL_KM
            ? "medium-haul international"
            : "long-haul international";
      return {
        ok: false,
        reason: `A ${AIRPORT_LADDER_NAME[ladder]} airport can't serve ${haul} flights — upgrade the airport tier.`,
      };
    }
  }
  return { ok: true };
}

// ─── §5 Background traffic & slot scarcity ──────────────────────────────

/** Baseline share of total slots consumed by simulated non-player
 *  (background) carriers, per ladder. Scaled UP over the game by the
 *  market-maturity curve so scarcity intensifies (see backgroundSlotsUsed).
 *  Available-to-players = total × (1 − pct). */
export const AIRPORT_BACKGROUND_PCT: Record<AirportLadder, number> = {
  0: 0.40, 1: 0.60, 2: 0.67, 3: 0.72, 4: 0.75, 5: 0.76,
};

/** Market-maturity multiplier on background occupancy. Early game the
 *  background fills slightly less than the baseline; late game it pushes
 *  toward saturation, squeezing the contested player remainder. `progress`
 *  is round/totalRounds in [0,1]. Capped so players always keep a sliver. */
export function backgroundOccupancyFactor(progress: number): number {
  const p = Math.max(0, Math.min(1, progress));
  // 0.85 at game start → 1.12 at the finish (clamped against ceiling later).
  return 0.85 + 0.27 * p;
}

/** Background slots consumed at an airport this round, given total slots,
 *  ladder, and campaign progress. Always leaves ≥1 player slot. */
export function backgroundSlotsUsed(
  totalSlots: number,
  ladder: AirportLadder,
  progress: number,
): number {
  const pct = AIRPORT_BACKGROUND_PCT[ladder] * backgroundOccupancyFactor(progress);
  const used = Math.round(totalSlots * Math.min(0.95, pct));
  return Math.max(0, Math.min(totalSlots - 1, used));
}

/** Slots available to player airlines (contested remainder). */
export function playerAvailableSlots(
  totalSlots: number,
  ladder: AirportLadder,
  progress: number,
): number {
  return Math.max(0, totalSlots - backgroundSlotsUsed(totalSlots, ladder, progress));
}

// ─── §6.1 GAP — Government Acceptance Probability ───────────────────────

/** Base acceptance and minimum-GAP qualification threshold per ladder. */
export const AIRPORT_GAP_BASE: Record<AirportLadder, number> = {
  0: 75, 1: 60, 2: 45, 3: 30, 4: 18, 5: 8,
};
export const AIRPORT_GAP_QUALIFY: Record<AirportLadder, number> = {
  0: 25, 1: 30, 2: 40, 3: 50, 4: 60, 5: 70,
};

/** Per-airport, per-airline inputs the GAP score consumes. The engine
 *  assembles these from Team + airport state so this stays pure. */
export interface GapInputs {
  ladder: AirportLadder;
  /** Bidder brand rating, 0..100. */
  brandRating: number;
  /** Liquid cash on hand, USD. */
  cashUsd: number;
  /** debt / (debt + equity)-style ratio, 0..1. */
  debtRatio: number;
  /** Operations strength normalized 0..1. */
  opsNormalized: number;
  /** Count of outstanding safety flags (each −5 GAP). */
  safetyFlags: number;
  /** True if the airline's primary-hub country == the airport's country. */
  nationalAlignment: boolean;
  /** Government demands already accepted (across this acquisition), +8 each. */
  demandsAccepted: number;
  /** True for the Global Network doctrine (+5). */
  isGlobalNetwork: boolean;
  /** Airports the airline already owns (−25 each, anti-monopoly). */
  ownedAirportCount: number;
  /** This airport's demand rank among all airports, 0..1 (1 = busiest). */
  demandPercentile: number;
  /** The bid amount, USD (drives the liquidity sub-score). */
  bidAmountUsd: number;
}

export interface GapBreakdown {
  base: number;
  brandFactor: number;
  financialFactor: number;
  operationalFactor: number;
  nationalAlignment: number;
  demandsAcceptedBonus: number;
  doctrineBonus: number;
  monopolyPenalty: number;
  demandScrutiny: number;
  /** Final clamped [0,95] score. */
  gap: number;
}

/** Compute GAP with a full term breakdown (for the UI confidence meter). */
export function computeGap(input: GapInputs): GapBreakdown {
  const base = AIRPORT_GAP_BASE[input.ladder];
  const brandFactor = (Math.max(0, Math.min(100, input.brandRating)) / 100) * 20;

  const liquidity = input.bidAmountUsd > 0
    ? Math.min(1, input.cashUsd / (2 * input.bidAmountUsd))
    : 1;
  const leverage = Math.max(0, 1 - input.debtRatio / 0.8);
  const financialFactor = ((liquidity + leverage) / 2) * 18;

  const operationalFactor = Math.max(0, Math.min(1, input.opsNormalized)) * 15
    - input.safetyFlags * 5;

  const nationalAlignment = input.nationalAlignment ? 15 : 0;
  const demandsAcceptedBonus = Math.min(40, input.demandsAccepted * 8);
  const doctrineBonus = input.isGlobalNetwork ? 5 : 0;
  const monopolyPenalty = input.ownedAirportCount * 25;
  const demandScrutiny = Math.max(0, Math.min(1, input.demandPercentile)) * 25;

  const raw = base + brandFactor + financialFactor + operationalFactor
    + nationalAlignment + demandsAcceptedBonus + doctrineBonus
    - monopolyPenalty - demandScrutiny;

  return {
    base,
    brandFactor,
    financialFactor,
    operationalFactor,
    nationalAlignment,
    demandsAcceptedBonus,
    doctrineBonus,
    monopolyPenalty,
    demandScrutiny,
    gap: Math.max(0, Math.min(95, raw)),
  };
}

/** True if this bidder clears the tier qualification threshold. */
export function qualifiesToBid(gap: number, ladder: AirportLadder): boolean {
  return gap >= AIRPORT_GAP_QUALIFY[ladder];
}

// ─── §6.2 Sealed-bid auction ────────────────────────────────────────────

/** Reserve price floor per ladder — prevents token sales. */
export const AIRPORT_RESERVE_FLOOR: Record<AirportLadder, number> = {
  0:   120_000_000,
  1:   250_000_000,
  2:   500_000_000,
  3:   900_000_000,
  4: 1_600_000_000,
  5: 2_500_000_000,
};

export interface SealedBid {
  teamId: string;
  amountUsd: number;
  gap: number;
}

export interface AuctionResult {
  winner: SealedBid | null;
  /** All bids that cleared qualification + reserve, scored. */
  scored: Array<SealedBid & { moneyScore: number; confidenceScore: number; composite: number }>;
  /** Bids rejected for failing qualification or reserve. */
  rejected: Array<SealedBid & { reason: "below-reserve" | "unqualified" }>;
}

/** Resolve a sealed-bid privatization auction. Money is half the decision
 *  (bid / highest × 50) and government confidence (GAP/95 × 50) the other
 *  half, so a richer bidder can lose to a more reputable rival. */
export function resolveSealedAuction(
  ladder: AirportLadder,
  bids: SealedBid[],
): AuctionResult {
  const floor = AIRPORT_RESERVE_FLOOR[ladder];
  const qualify = AIRPORT_GAP_QUALIFY[ladder];
  const rejected: AuctionResult["rejected"] = [];
  const qualified: SealedBid[] = [];
  for (const b of bids) {
    if (b.amountUsd < floor) { rejected.push({ ...b, reason: "below-reserve" }); continue; }
    if (b.gap < qualify) { rejected.push({ ...b, reason: "unqualified" }); continue; }
    qualified.push(b);
  }
  if (qualified.length === 0) {
    return { winner: null, scored: [], rejected };
  }
  const highest = Math.max(...qualified.map((b) => b.amountUsd));
  const scored = qualified.map((b) => {
    const moneyScore = (b.amountUsd / highest) * 50;
    const confidenceScore = (b.gap / 95) * 50;
    return { ...b, moneyScore, confidenceScore, composite: moneyScore + confidenceScore };
  }).sort((a, b) => b.composite - a.composite);
  return { winner: scored[0], scored, rejected };
}

// ─── §6.3 Approval gauntlet ─────────────────────────────────────────────

/** Approval period (rounds) and demand-count band per ladder. */
export const AIRPORT_APPROVAL: Record<AirportLadder, { rounds: [number, number]; demands: [number, number] }> = {
  0: { rounds: [1, 1], demands: [0, 1] },
  1: { rounds: [2, 2], demands: [1, 2] },
  2: { rounds: [2, 3], demands: [2, 3] },
  3: { rounds: [3, 4], demands: [3, 4] },
  4: { rounds: [4, 5], demands: [4, 5] },
  5: { rounds: [5, 6], demands: [5, 6] },
};

/** Fraction of issued demands the airline must accept to close (rounded up). */
export const AIRPORT_APPROVAL_ACCEPT_FRACTION = 0.7;

/** Deposit forfeited if the acquisition collapses (rejected too many demands). */
export const AIRPORT_APPROVAL_DEPOSIT_PCT = 0.10;

export type AirportDemandType =
  | "carbon-offset"
  | "capacity-expansion"
  | "infrastructure"
  | "employment-guarantee"
  | "concession-premium"
  | "government-lobbying"
  | "route-service-obligation"
  | "local-stake-retention";

export interface AirportDemandDef {
  type: AirportDemandType;
  label: string;
  /** One-line description shown on the demand card. */
  blurb: string;
  /** Cost shape: a one-time cash hit, a recurring quarterly drag, an
   *  operational constraint, a permanent revenue share, or a flag set. */
  shape: "one-time" | "recurring" | "operational" | "equity" | "premium" | "flag";
}

export const AIRPORT_DEMAND_DEFS: Record<AirportDemandType, AirportDemandDef> = {
  "carbon-offset": {
    type: "carbon-offset", label: "Carbon Offset Commitment", shape: "one-time",
    blurb: "A one-time environmental payment (or a binding eco-fleet / SAF pledge), heavier on high-traffic airports.",
  },
  "capacity-expansion": {
    type: "capacity-expansion", label: "Capacity Expansion Mandate", shape: "operational",
    blurb: "Commit to add slots within a set number of rounds — the government wants the airport to grow.",
  },
  "infrastructure": {
    type: "infrastructure", label: "Infrastructure Investment", shape: "one-time",
    blurb: "A large one-time payment toward terminals, a rail link, or road access.",
  },
  "employment-guarantee": {
    type: "employment-guarantee", label: "Employment Guarantee", shape: "recurring",
    blurb: "A recurring quarterly cost guaranteeing local jobs — an ongoing drag.",
  },
  "concession-premium": {
    type: "concession-premium", label: "Concession Premium", shape: "premium",
    blurb: "An additional percentage added on top of the winning bid — pure cost.",
  },
  "government-lobbying": {
    type: "government-lobbying", label: "Government Lobbying", shape: "flag",
    blurb: "A cheap payment to smooth approval — but it sets a scandal-risk flag for later.",
  },
  "route-service-obligation": {
    type: "route-service-obligation", label: "Route Service Obligation", shape: "operational",
    blurb: "Must serve several underserved domestic cities for a number of rounds.",
  },
  "local-stake-retention": {
    type: "local-stake-retention", label: "Local Stake Retention", shape: "equity",
    blurb: "The government keeps 10–20% equity and draws proportional dividends — permanent revenue share.",
  },
};

/** Spec §6.3: demand_cost_multiplier = 1 + ladder×0.4 + demandPercentile×0.6.
 *  A busy Mega Gateway demand can cost several times a quiet Local field's. */
export function demandCostMultiplier(ladder: AirportLadder, demandPercentile: number): number {
  return 1 + ladder * 0.4 + Math.max(0, Math.min(1, demandPercentile)) * 0.6;
}

/** Minimum number of issued demands that must be accepted to close. */
export function minDemandsToAccept(issued: number): number {
  return Math.ceil(issued * AIRPORT_APPROVAL_ACCEPT_FRACTION);
}

// ─── §2.4 / §2.5 Hub allowance, costs & gates ───────────────────────────

/** Canonical doctrine buckets used across the V2 hub + topology rules. */
export type DoctrineBucket = "budget" | "global" | "premium" | "cargo";

export function doctrineBucket(doctrine: DoctrineId): DoctrineBucket {
  switch (doctrine) {
    case "budget-expansion": return "budget";
    case "global-network": return "global";
    case "safety-first": return "global"; // legacy alias
    case "premium-service": return "premium";
    case "cargo-dominance": return "cargo";
    default: return "global";
  }
}

/** Max secondary hubs allowed by doctrine (Budget = unlimited). */
export function maxSecondaryHubs(doctrine: DoctrineId): number {
  switch (doctrineBucket(doctrine)) {
    case "budget": return Infinity;
    case "global": return 4;
    default: return 2; // premium, cargo
  }
}

/** Establishment cost for the n-th secondary hub (1-indexed). 5th+ is
 *  Budget-only and repeats the flat 3rd-hub price. */
export function secondaryHubCost(n: number): number {
  if (n <= 1) return 60_000_000;
  if (n === 2) return 120_000_000;
  if (n === 3) return 200_000_000;
  if (n === 4) return 280_000_000;
  return 200_000_000;
}

/** Fleet-size gate to unlock the n-th secondary hub (1-indexed). 5th+
 *  needs +20 aircraft each beyond the 4th (tunable guardrail). */
export function secondaryHubFleetGate(n: number): number {
  if (n <= 1) return 15;
  if (n === 2) return 35;
  if (n === 3) return 60;
  if (n === 4) return 85;
  return 85 + (n - 4) * 20;
}

/** Whether the n-th secondary hub is available to this doctrine.
 *  Premium/Cargo cap at 2, Global at 4, Budget unlimited. */
export function secondaryHubAvailable(doctrine: DoctrineId, n: number): boolean {
  return n <= maxSecondaryHubs(doctrine);
}

/** §2.2 Primary hub relocation cost: MAX($50M, fleet × $5M). */
export function primaryHubMoveCostUsd(fleetSize: number): number {
  return Math.max(50_000_000, fleetSize * 5_000_000);
}

// ─── §3 Network topology ────────────────────────────────────────────────

/** All hubs (primary + secondary) for a team. */
export function teamHubs(primaryHub: string, secondaryHubs: string[]): string[] {
  return [primaryHub, ...(secondaryHubs ?? [])];
}

/**
 * §3.1 Route legality: every city served must sit within 2 flight legs of
 * one of the airline's hubs. A direct city pair (A,B) is legal if:
 *   - either endpoint IS a hub (hub↔spoke or hub↔hub), OR
 *   - either endpoint is DIRECTLY connected (1 leg) to one of the hubs,
 *     i.e. the airline already flies hub→that-endpoint (the outer
 *     spoke-to-spoke leg is then 2 legs from the hub).
 * Standalone spoke-to-spoke (neither end a hub, neither end hub-adjacent)
 * is never allowed.
 *
 * `directHubNeighbors` is the set of cities the airline already flies
 * non-stop from any hub (the engine builds this from active routes).
 */
export function isRouteLegalV2(
  hubs: string[],
  directHubNeighbors: Set<string>,
  cityA: string,
  cityB: string,
): boolean {
  if (hubs.includes(cityA) || hubs.includes(cityB)) return true;
  if (directHubNeighbors.has(cityA) || directHubNeighbors.has(cityB)) return true;
  return false;
}

/**
 * §3.2 / §3.3 Connecting multiplier eligibility for a segment. The
 * hub-and-spoke demand-aggregation bonus applies only on segments that
 * directly touch a hub or secondary hub — and never for Budget, which is
 * pure point-to-point on every leg.
 */
export function segmentGetsConnectingMultiplier(
  doctrine: DoctrineId,
  hubs: string[],
  origin: string,
  destination: string,
): boolean {
  if (doctrineBucket(doctrine) === "budget") return false;
  return hubs.includes(origin) || hubs.includes(destination);
}

// ─── §8 Specializations & forks ─────────────────────────────────────────

export type AirportSpecialization =
  | "passenger-mega-hub"
  | "cargo-logistics"
  | "premium-gateway"
  | "low-cost-base";

export type AirportSpecializationFork =
  // Passenger Mega-Hub
  | "volume" | "experience"
  // Cargo & Logistics
  | "fuel-farm" | "free-trade-zone"
  // Premium Gateway
  | "vip-terminal" | "biometric-fast-track"
  // Low-Cost Efficiency Base
  | "ground-handling-automation" | "high-density-apron";

export interface SpecializationDef {
  id: AirportSpecialization;
  name: string;
  optimizedFor: string;
  paysOffIf: string;
  underperformsIf: string;
  forks: Array<{ id: AirportSpecializationFork; name: string; blurb: string }>;
  /** Non-aero yield multiplier this specialization applies (the primary
   *  mechanic). Cargo specializations depress passenger non-aero yield. */
  nonAeroModifier: number;
}

export const AIRPORT_SPECIALIZATIONS: Record<AirportSpecialization, SpecializationDef> = {
  "passenger-mega-hub": {
    id: "passenger-mega-hub",
    name: "Passenger Mega-Hub",
    optimizedFor: "Throughput, retail, connections",
    paysOffIf: "Heavy passenger and connecting traffic flows through",
    underperformsIf: "Cargo-dominated or low-volume environment",
    nonAeroModifier: 1.25,
    forks: [
      { id: "volume", name: "Volume", blurb: "Maximize slot throughput and retail breadth — more passengers, lower spend each." },
      { id: "experience", name: "Experience", blurb: "Premium terminals and lounges — fewer passengers, higher non-aero spend each, plus an own-passenger satisfaction synergy." },
    ],
  },
  "cargo-logistics": {
    id: "cargo-logistics",
    name: "Cargo & Logistics Hub",
    optimizedFor: "Freight capacity and cargo demand",
    paysOffIf: "Cargo booms (e-commerce / pharma world-news fires)",
    underperformsIf: "Cargo softens or rivals route freight elsewhere",
    nonAeroModifier: 0.85,
    forks: [
      { id: "fuel-farm", name: "Fuel Farm", blurb: "Own the fuel supply — capture margin on every litre every airline burns here, including rivals and background traffic." },
      { id: "free-trade-zone", name: "Free Trade Zone", blurb: "Attract e-commerce fulfilment and permanently raise the airport's cargo demand." },
    ],
  },
  "premium-gateway": {
    id: "premium-gateway",
    name: "Premium Gateway",
    optimizedFor: "High-yield premium traffic, lounges, VIP",
    paysOffIf: "Premium demand holds and economy stays strong",
    underperformsIf: "A recession scenario craters premium demand",
    nonAeroModifier: 1.35,
    forks: [
      { id: "vip-terminal", name: "VIP Terminal", blurb: "High-margin private-aviation revenue." },
      { id: "biometric-fast-track", name: "Biometric Fast-Track", blurb: "Passenger throughput and satisfaction at scale." },
    ],
  },
  "low-cost-base": {
    id: "low-cost-base",
    name: "Low-Cost Efficiency Base",
    optimizedFor: "High-volume rapid turnarounds, low opex",
    paysOffIf: "Budget-carrier volume fills the airport",
    underperformsIf: "Volume does not materialize; thin margins do not cover cost",
    nonAeroModifier: 0.95,
    forks: [
      { id: "ground-handling-automation", name: "Ground Handling Automation", blurb: "Lower opex further and raise satisfaction." },
      { id: "high-density-apron", name: "High-Density Apron", blurb: "Support more simultaneous narrowbody turns (higher effective slot utilization)." },
    ],
  },
};

/** Cost to reconfigure (switch) an airport's specialization later, plus the
 *  build period before the new specialization takes effect. */
export const AIRPORT_SPECIALIZATION_SWITCH_COST = 250_000_000;
export const AIRPORT_SPECIALIZATION_SWITCH_ROUNDS = 3;

// ─── §7 Ownership economics defaults ────────────────────────────────────

/** Baseline operating-cost ratio (gross airport revenue → opex). Reduced by
 *  the Operational Efficiency investment / Ground Handling Automation fork. */
export const AIRPORT_OPEX_RATIO_BASELINE = 0.45;
export const AIRPORT_OPEX_RATIO_FLOOR = 0.30;
export const AIRPORT_OPEX_EFFICIENCY_INVESTMENT_COST = 120_000_000;
export const AIRPORT_OPEX_EFFICIENCY_REDUCTION = 0.07;

/** Retail development level bounds (raised by commercial investment). It is
 *  the highest-ROI lever because it compounds with EVERY passenger. */
export const AIRPORT_RETAIL_MIN = 0.5;
export const AIRPORT_RETAIL_MAX = 1.5;
export const AIRPORT_RETAIL_INVESTMENT_COST = 90_000_000;
export const AIRPORT_RETAIL_INVESTMENT_STEP = 0.2;

/** Non-aero revenue yield per passenger (USD), before retail level and
 *  specialization modifiers. Tuned single-digit so non-aero is a real but
 *  not dominant engine relative to slot/landing/pax fees. */
export const AIRPORT_NON_AERO_YIELD_PER_PAX = 6;

/** Owner self-advantage caps (§7.3). */
export const AIRPORT_OWNER_RESERVE_PCT_MAX = 0.40;
export const AIRPORT_OWNER_SELF_DISCOUNT_MAX = 0.15;

// ─── §7.1 Default government fee schedule (public airports) ─────────────
// Per-quarter fees an unowned (publicly run) airport charges. Owners may
// reprice within elasticity bounds; these are the starting / fallback rates.

export interface AirportFeeSchedule {
  /** Per slot, per quarter. */
  slotFeeUsd: number;
  /** Per aircraft movement. */
  landingFeeUsd: number;
  /** Per departing passenger. */
  passengerChargeUsd: number;
}

export const AIRPORT_DEFAULT_FEES_BY_LADDER: Record<AirportLadder, AirportFeeSchedule> = {
  0: { slotFeeUsd:  30_000, landingFeeUsd:  600, passengerChargeUsd:  8 },
  1: { slotFeeUsd:  55_000, landingFeeUsd:  900, passengerChargeUsd: 11 },
  2: { slotFeeUsd:  85_000, landingFeeUsd: 1_300, passengerChargeUsd: 14 },
  3: { slotFeeUsd: 130_000, landingFeeUsd: 1_900, passengerChargeUsd: 18 },
  4: { slotFeeUsd: 190_000, landingFeeUsd: 2_600, passengerChargeUsd: 23 },
  5: { slotFeeUsd: 250_000, landingFeeUsd: 3_300, passengerChargeUsd: 28 },
};

/** §7.2 Fee elasticity: above the market rate, player traffic routes away
 *  proportionally to the overage; background traffic is partially elastic.
 *  Returns a 0..1 retention multiplier on the affected traffic. */
export function feeRetention(
  chargedFee: number,
  marketFee: number,
  kind: "player" | "background",
): number {
  if (marketFee <= 0) return 1;
  const overage = Math.max(0, chargedFee / marketFee - 1);
  if (overage <= 0) return 1;
  // Players are fully elastic, background only partially.
  const elasticity = kind === "player" ? 1.0 : 0.35;
  return Math.max(0.1, 1 - overage * elasticity);
}

// ─── §9 Regulatory limiters ─────────────────────────────────────────────

/** Pricing-discrimination tolerance (self vs rival fee). Beyond this gap a
 *  regulatory review triggers (fine / forced equal pricing / divestment). */
export const AIRPORT_PRICE_DISCRIMINATION_LIMIT = 0.15;

/** Owned slots unused for this many consecutive rounds are reclaimed. */
export const AIRPORT_USE_IT_OR_LOSE_IT_ROUNDS = 4;

/** Regulatory fine as a fraction of the airport's quarterly revenue. */
export const AIRPORT_REGULATORY_FINE_PCT = 0.25;

// ─── §10 Privatization timeline ─────────────────────────────────────────

/** First auction round and recurrence interval, by campaign mode. */
export function privatizationSchedule(campaignMode: "half" | "full"): { first: number; interval: number } {
  return campaignMode === "full"
    ? { first: 36, interval: 12 }
    : { first: 18, interval: 8 };
}

/** Is `round` a privatization-auction round for this campaign? */
export function isPrivatizationRound(round: number, campaignMode: "half" | "full"): boolean {
  const { first, interval } = privatizationSchedule(campaignMode);
  return round >= first && (round - first) % interval === 0;
}

/** Index of this auction cycle (0-based), or -1 if not an auction round.
 *  Used to deterministically pick which airport/tier is released. */
export function privatizationCycleIndex(round: number, campaignMode: "half" | "full"): number {
  if (!isPrivatizationRound(round, campaignMode)) return -1;
  const { first, interval } = privatizationSchedule(campaignMode);
  return (round - first) / interval;
}
