/**
 * SkyForce simulation engine. Pure TS, UI-agnostic.
 *
 * Implements PRD §5 (demand, attractiveness, market share, revenue, costs,
 * loyalty, Brand Value), §6 (depreciation), §9 (quarter close orchestration),
 * addendum A3 (staff cost), A15 (taxes).
 *
 * Single-team MVP simplification: when only the player operates a route,
 * market_share = 1.0 capped by demand. Full multi-team attractiveness
 * competition is stubbed for competitor-mock data but the formulas are all
 * in place so when Supabase-backed multi-team lands, only the caller changes.
 */

import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { CITIES_BY_CODE } from "@/data/cities";
import { SCENARIOS, type OptionEffect, type Scenario } from "@/data/scenarios";
import type {
  City,
  DeferredEvent,
  FleetAircraft,
  PricingTier,
  Route,
  SliderLevel,
  Sliders,
  Team,
} from "@/types/game";

const M = 1_000_000;

// ─── Distance (Haversine, PRD A1) ──────────────────────────
const EARTH_RADIUS_KM = 6371;
export function haversineKm(a: City, b: City): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const aa =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(aa));
}

export function distanceBetween(origin: string, dest: string): number {
  const a = CITIES_BY_CODE[origin];
  const b = CITIES_BY_CODE[dest];
  if (!a || !b) return 0;
  return haversineKm(a, b);
}

// ─── City demand growth (PRD §5.1) ─────────────────────────
export function cityTourismAtQuarter(city: City, quarter: number): number {
  return city.tourism * Math.pow(1 + city.tourismGrowth / 100 / 4, quarter - 1);
}
export function cityBusinessAtQuarter(city: City, quarter: number): number {
  return city.business * Math.pow(1 + city.businessGrowth / 100 / 4, quarter - 1);
}

// ─── Route demand (PRD §5.2) ───────────────────────────────
export function routeDemandPerDay(
  origin: string,
  dest: string,
  quarter: number,
): { tourism: number; business: number; total: number; amplifier: number } {
  const a = CITIES_BY_CODE[origin];
  const b = CITIES_BY_CODE[dest];
  if (!a || !b) return { tourism: 0, business: 0, total: 0, amplifier: 1 };
  const amplifier = Math.min(a.amplifier, b.amplifier);
  const tourism =
    (cityTourismAtQuarter(a, quarter) + cityTourismAtQuarter(b, quarter)) *
    amplifier;
  const business =
    (cityBusinessAtQuarter(a, quarter) + cityBusinessAtQuarter(b, quarter)) *
    amplifier;
  return { tourism, business, total: tourism + business, amplifier };
}

// ─── Pricing multipliers (PRD §5.5 + §17) ──────────────────
export const PRICE_TIER: Record<PricingTier, number> = {
  budget: 0.8,
  standard: 1.0,
  premium: 1.25,
  ultra: 1.6,
};

/** Base fare per pax by distance band (PRD A11 economy base, blended). */
export function baseFareForDistance(km: number): number {
  if (km < 2000) return 120;
  if (km < 5000) return 350;
  if (km < 10_000) return 650;
  return 950;
}

/** Per-class fare range (PRD A11). Returns {min, base, max} for a class. */
export interface FareRange { min: number; base: number; max: number }

export function classFareRange(
  km: number,
  cls: "econ" | "bus" | "first",
): FareRange {
  if (cls === "econ") {
    if (km < 2000) return { min: 60, base: 120, max: 280 };
    if (km < 5000) return { min: 150, base: 350, max: 800 };
    if (km < 10_000) return { min: 300, base: 650, max: 1500 };
    return { min: 500, base: 950, max: 2200 };
  }
  if (cls === "bus") {
    if (km < 2000) return { min: 180, base: 360, max: 750 };
    if (km < 5000) return { min: 450, base: 1100, max: 2500 };
    if (km < 10_000) return { min: 900, base: 2200, max: 5000 };
    return { min: 1500, base: 3500, max: 8000 };
  }
  // first = business × 3.5 (PRD A11)
  const bus = classFareRange(km, "bus");
  return { min: bus.base * 3.5, base: bus.base * 3.5, max: bus.max * 3.5 };
}

// ─── Slider levels + impacts (PRD A2 + B1) ─────────────────
export const SLIDER_LABELS: Record<SliderLevel, string> = {
  0: "Very Low",
  1: "Low",
  2: "Standard",
  3: "High",
  4: "Very High",
  5: "Extreme",
};

/** Slider spend as % of revenue (A2). Staff is separate (A3). */
export const SLIDER_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0,
  1: 0.03,
  2: 0.06,
  3: 0.10,
  4: 0.15,
  5: 0.20,
};

/** Slider effects (per quarter) per category. Pulled from PRD §3.2 + B1. */
export const SLIDER_EFFECTS: Record<
  keyof Sliders,
  Record<SliderLevel, { brandPts: number; loyalty: number; opsPts?: number }>
> = {
  staff: {
    0: { brandPts: 0, loyalty: -3, opsPts: -5 },
    1: { brandPts: 0, loyalty: -1, opsPts: -2 },
    2: { brandPts: 0, loyalty: 0, opsPts: 0 },
    3: { brandPts: 0, loyalty: 2, opsPts: 3 },
    4: { brandPts: 0, loyalty: 4, opsPts: 6 },
    5: { brandPts: 5, loyalty: 7, opsPts: 10 },
  },
  marketing: {
    0: { brandPts: -4, loyalty: -2 },
    1: { brandPts: -1, loyalty: -1 },
    2: { brandPts: 0, loyalty: 0 },
    3: { brandPts: 3, loyalty: 1 },
    4: { brandPts: 6, loyalty: 3 },
    5: { brandPts: 10, loyalty: 6 },
  },
  service: {
    0: { brandPts: -4, loyalty: -5 },
    1: { brandPts: -2, loyalty: -2 },
    2: { brandPts: 0, loyalty: 0 },
    3: { brandPts: 3, loyalty: 4 },
    4: { brandPts: 6, loyalty: 7 },
    5: { brandPts: 10, loyalty: 12 },
  },
  rewards: {
    0: { brandPts: 0, loyalty: -5 },
    1: { brandPts: 0, loyalty: 0 },
    2: { brandPts: 0, loyalty: 2 },
    3: { brandPts: 0, loyalty: 5 },
    4: { brandPts: 2, loyalty: 8 },
    5: { brandPts: 4, loyalty: 12 },
  },
  operations: {
    0: { brandPts: -3, loyalty: 0, opsPts: -5 },
    1: { brandPts: -1, loyalty: 0, opsPts: -2 },
    2: { brandPts: 0, loyalty: 0, opsPts: 0 },
    3: { brandPts: 0, loyalty: 0, opsPts: 3 },
    4: { brandPts: 0, loyalty: 0, opsPts: 6 },
    5: { brandPts: 0, loyalty: 0, opsPts: 10 },
  },
};

/** Compounding multiplier (PRD §3.2): 1.0 → 1.2× at 3Q → 1.5× at 6Q. */
export function streakMultiplier(quartersAtLevel: number): number {
  if (quartersAtLevel >= 6) return 1.5;
  if (quartersAtLevel >= 3) return 1.2;
  return 1.0;
}

// ─── Staff cost (A3) ───────────────────────────────────────
export function baselineStaffCostUsd(team: Team): number {
  const fleetSize = team.fleet.filter((f) => f.status === "active").length;
  const activeRoutes = team.routes.filter((r) => r.status === "active").length;
  const hubCount = 1; // secondary hubs not yet modeled
  return (
    fleetSize * 180_000 +
    activeRoutes * 45_000 +
    hubCount * 800_000 +
    2_000_000 // HQ minimum
  );
}

export const STAFF_MULTIPLIER: Record<SliderLevel, number> = {
  0: 0.5, 1: 0.75, 2: 1.0, 3: 1.1, 4: 1.2, 5: 1.5,
};

// ─── Attractiveness + market share (PRD §5.3-5.4) ──────────
export function attractivenessScore(args: {
  priceScore: number;
  brandPts: number;
  loyaltyPct: number;
  serviceScore: number; // 0..100
}): number {
  const brandScore = Math.min(100, args.brandPts / 2);
  return (
    args.priceScore * 0.45 +
    brandScore * 0.25 +
    args.loyaltyPct * 0.20 +
    args.serviceScore * 0.10
  );
}

// Simple service score from sliders (avg of service + gifts-proxy + rewards)
export function serviceScoreFromSliders(s: Sliders): number {
  return ((s.service + s.rewards) / 2 / 5) * 100;
}

// ─── Route quarterly economics ─────────────────────────────
const QUARTER_DAYS = 91;

/** Quarterly hub terminal fee by tier (PRD §4.2). */
export function hubTerminalFeeUsd(cityCode: string): number {
  const c = CITIES_BY_CODE[cityCode];
  if (!c) return 0;
  if (c.tier === 1) return 15_000_000;
  if (c.tier === 2) return 12_000_000;
  if (c.tier === 3) return 6_000_000;
  return 3_000_000;
}

export interface RouteEconomics {
  distanceKm: number;
  dailyDemand: number;
  dailyCapacity: number;
  occupancy: number;               // 0..1 capped at 0.98
  dailyPax: number;
  ticketPrice: number;
  quarterlyRevenue: number;
  quarterlyFuelCost: number;
  quarterlySlotCost: number;
  quarterlyProfit: number;
}

export function slotFeeUsd(tier: 1 | 2 | 3 | 4): number {
  return tier === 1 ? 42_500 : tier === 2 ? 28_500 : tier === 3 ? 15_000 : 7_500;
}

export function computeRouteEconomics(
  team: Team,
  route: Route,
  quarter: number,
  fuelIndex: number,
): RouteEconomics {
  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  if (!origin || !dest)
    return blankEconomics(route.distanceKm);

  const distanceKm = route.distanceKm || haversineKm(origin, dest);
  const rawDemand = routeDemandPerDay(route.originCode, route.destCode, quarter);
  const loyaltyFactor = loyaltyRetentionFactor(team.customerLoyaltyPct);
  const demand = {
    ...rawDemand,
    total: rawDemand.total * loyaltyFactor,
  };

  const planes = route.aircraftIds
    .map((id) => team.fleet.find((f) => f.id === id))
    .filter((x): x is FleetAircraft => !!x && x.status === "active");

  // ─ Cargo route (A4) ────────────────────────────────────
  if (route.isCargo) {
    const tonnesPerFlight = planes.reduce((sum, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      return sum + (spec?.cargoTonnes ?? 0);
    }, 0);
    const dailyCapacityT = tonnesPerFlight * route.dailyFrequency;
    // Cargo demand = min of the two cities' business demand (A4)
    const cargoDemandT = Math.min(
      cityBusinessAtQuarter(origin, quarter),
      cityBusinessAtQuarter(dest, quarter),
    );
    const dailyTonnes = Math.min(dailyCapacityT, cargoDemandT);
    const occupancy = dailyCapacityT > 0 ? Math.min(0.98, dailyTonnes / dailyCapacityT) : 0;
    const pricePerTonne = distanceKm < 3000 ? 3.5 : 5.5;
    const quarterlyRevenue = dailyTonnes * pricePerTonne * 1000 * QUARTER_DAYS;
    // Storage cost instead of slot fees (A4)
    const storageCostByTier: Record<number, number> = { 1: 800_000, 2: 450_000, 3: 250_000, 4: 150_000 };
    const quarterlySlotCost =
      (storageCostByTier[origin.tier] ?? 150_000) +
      (storageCostByTier[dest.tier] ?? 150_000);

    // Fuel
    const fuelPricePerL = (fuelIndex / 100) * 0.18;
    const totalFuelBurnPerFlight = planes.reduce((sum, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      if (!spec) return sum;
      return sum + spec.fuelBurnPerKm * (p.ecoUpgrade ? 0.9 : 1.0) * distanceKm;
    }, 0);
    const quarterlyFuelCost =
      totalFuelBurnPerFlight * fuelPricePerL * route.dailyFrequency * QUARTER_DAYS;

    return {
      distanceKm,
      dailyDemand: cargoDemandT,
      dailyCapacity: dailyCapacityT,
      occupancy,
      dailyPax: dailyTonnes, // repurposed as tonnes/day
      ticketPrice: pricePerTonne,
      quarterlyRevenue,
      quarterlyFuelCost,
      quarterlySlotCost,
      quarterlyProfit: quarterlyRevenue - quarterlyFuelCost - quarterlySlotCost,
    };
  }

  // ─ Passenger route (default) ───────────────────────────
  const seatsPerFlight = {
    first: 0, bus: 0, econ: 0,
  };
  for (const p of planes) {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec) continue;
    seatsPerFlight.first += spec.seats.first;
    seatsPerFlight.bus += spec.seats.business;
    seatsPerFlight.econ += spec.seats.economy;
  }
  const totalSeatsPerFlight =
    seatsPerFlight.first + seatsPerFlight.bus + seatsPerFlight.econ;
  const dailyCapacity = totalSeatsPerFlight * route.dailyFrequency;

  const dailyPax = Math.min(dailyCapacity, demand.total);
  const occupancy =
    dailyCapacity > 0 ? Math.min(0.98, dailyPax / dailyCapacity) : 0;

  // ─ Per-class fares (A7 + A11) ──────────────────────────
  const tier = PRICE_TIER[route.pricingTier];
  const econFare = route.econFare ?? classFareRange(distanceKm, "econ").base * tier;
  const busFare = route.busFare ?? classFareRange(distanceKm, "bus").base * tier;
  const firstFare = route.firstFare ?? classFareRange(distanceKm, "first").base * tier;

  // Blended ticket price used by market share / demand sensitivity
  const seatMix = totalSeatsPerFlight > 0
    ? {
        f: seatsPerFlight.first / totalSeatsPerFlight,
        b: seatsPerFlight.bus / totalSeatsPerFlight,
        e: seatsPerFlight.econ / totalSeatsPerFlight,
      }
    : { f: 0, b: 0, e: 1 };
  const ticketPrice =
    firstFare * seatMix.f + busFare * seatMix.b + econFare * seatMix.e;

  // Revenue: pax × fare, per class (pax distributed proportionally to seat mix)
  const quarterlyFirstPax = seatsPerFlight.first * route.dailyFrequency * QUARTER_DAYS * occupancy;
  const quarterlyBusPax = seatsPerFlight.bus * route.dailyFrequency * QUARTER_DAYS * occupancy;
  const quarterlyEconPax = seatsPerFlight.econ * route.dailyFrequency * QUARTER_DAYS * occupancy;
  const quarterlyRevenue =
    quarterlyFirstPax * firstFare +
    quarterlyBusPax * busFare +
    quarterlyEconPax * econFare;

  // Fuel
  const fuelPricePerL = (fuelIndex / 100) * 0.18;
  const totalFuelBurnPerFlight = planes.reduce((sum, p) => {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec) return sum;
    const burn =
      spec.fuelBurnPerKm * (p.ecoUpgrade ? 0.9 : 1.0) * distanceKm;
    return sum + burn;
  }, 0);
  // Apply S4 hedge if flag set
  const hedge = team.flags.has("hedged_12m")
    ? 100 / fuelIndex
    : team.flags.has("hedged_6m")
      ? 100 / fuelIndex
      : team.flags.has("hedged_50_50")
        ? (100 / fuelIndex + 1) / 2
        : 1;
  const quarterlyFuelCost =
    totalFuelBurnPerFlight * fuelPricePerL *
    route.dailyFrequency * QUARTER_DAYS * hedge;

  // Slot fee
  const fee = slotFeeUsd(dest.tier);
  const quarterlySlotCost = fee * route.dailyFrequency * QUARTER_DAYS;

  const quarterlyProfit = quarterlyRevenue - quarterlyFuelCost - quarterlySlotCost;

  return {
    distanceKm,
    dailyDemand: demand.total,
    dailyCapacity,
    occupancy,
    dailyPax,
    ticketPrice,
    quarterlyRevenue,
    quarterlyFuelCost,
    quarterlySlotCost,
    quarterlyProfit,
  };
}

function blankEconomics(distanceKm: number): RouteEconomics {
  return {
    distanceKm,
    dailyDemand: 0,
    dailyCapacity: 0,
    occupancy: 0,
    dailyPax: 0,
    ticketPrice: 0,
    quarterlyRevenue: 0,
    quarterlyFuelCost: 0,
    quarterlySlotCost: 0,
    quarterlyProfit: 0,
  };
}

// ─── Depreciation (PRD §6.4) ───────────────────────────────
export function depreciateBookValue(
  purchasePrice: number,
  quartersSincePurchase: number,
): number {
  const floor = purchasePrice * 0.1;
  const decayed = purchasePrice * Math.pow(0.9875, quartersSincePurchase);
  return Math.max(floor, decayed);
}

// ─── Interest (PRD §5.7) ───────────────────────────────────
export function effectiveBorrowingRate(team: Team, baseRatePct: number): number {
  const airlineValue = computeAirlineValue(team);
  const debtRatio = airlineValue > 0 ? team.totalDebtUsd / airlineValue : 1;
  let premium = 0.5;
  if (debtRatio >= 0.7) premium = 5.0;
  else if (debtRatio >= 0.5) premium = 3.0;
  else if (debtRatio >= 0.3) premium = 1.5;

  let brandAdj = 0;
  if (team.brandPts > 80) brandAdj = -0.5;
  else if (team.brandPts < 25) brandAdj = 2.0;
  else if (team.brandPts < 50) brandAdj = 1.0;

  return baseRatePct + premium + brandAdj;
}

export function quarterlyInterestUsd(team: Team, baseRatePct: number): number {
  const rate = effectiveBorrowingRate(team, baseRatePct);
  return team.totalDebtUsd * (rate / 100) / 4;
}

export function maxBorrowingUsd(team: Team): number {
  const v = computeAirlineValue(team);
  return Math.max(0, v * 0.6 - team.totalDebtUsd);
}

// ─── Airline Value (= Net Equity, PRD §3.2 + §5.9) ─────────
export function computeAirlineValue(team: Team): number {
  const fleetValue = team.fleet.reduce((s, f) => s + (f.bookValue ?? 0), 0);
  return team.cashUsd + fleetValue - team.totalDebtUsd;
}

// ─── Brand Value (PRD §5.9) ────────────────────────────────
export function computeBrandValue(team: Team): number {
  const cashRatio =
    team.cashUsd + team.totalDebtUsd > 0
      ? team.cashUsd / (team.cashUsd + team.totalDebtUsd)
      : 0.5;
  const airlineValue = computeAirlineValue(team);
  const debtRatioScore =
    100 - Math.min(100, airlineValue > 0 ? (team.totalDebtUsd / airlineValue) * 100 : 100);
  // Revenue growth vs peers not available in single-team — default to 50
  const revGrowth = 50;

  const financialHealth =
    cashRatio * 100 * 0.3 + debtRatioScore * 0.35 + revGrowth * 0.35;

  const brandPtsScore = Math.min(100, team.brandPts / 2);
  const customerLoyalty = team.customerLoyaltyPct;
  let reputationEvents = 100;
  if (team.flags.has("trusted_operator")) reputationEvents += 10;
  if (team.flags.has("green_leader")) reputationEvents += 15;
  if (team.flags.has("people_first")) reputationEvents += 8;
  if (team.flags.has("anti_environment")) reputationEvents -= 15;
  reputationEvents = Math.max(0, Math.min(120, reputationEvents));

  const brandHealth =
    brandPtsScore * 0.4 + customerLoyalty * 0.35 + reputationEvents * 0.25;

  const opsPtsScore = Math.min(100, team.opsPts);
  const activeFleet = team.fleet.filter((f) => f.status === "active");
  const modernFleetCount = activeFleet.filter((f) => {
    const spec = AIRCRAFT_BY_ID[f.specId];
    return spec && spec.unlockQuarter >= 8; // modern family
  }).length;
  const fleetEfficiency =
    activeFleet.length > 0
      ? (modernFleetCount / activeFleet.length) * 100
      : 0;
  const staffCommitment = Math.min(100, team.sliders.staff * 10 + 50);

  const operationsHealth =
    opsPtsScore * 0.4 + fleetEfficiency * 0.35 + staffCommitment * 0.25;

  return (
    financialHealth * 0.35 + brandHealth * 0.5 + operationsHealth * 0.15
  );
}

// ─── Loyalty multiplier (PRD §5.8) ─────────────────────────
export function loyaltyDemandMultiplier(
  loyaltyPct: number,
  positive: boolean,
): number {
  if (loyaltyPct > 80) return positive ? 1.15 : 0.7;
  if (loyaltyPct > 65) return positive ? 1.05 : 0.85;
  if (loyaltyPct > 50) return 1.0;
  if (loyaltyPct > 35) return positive ? 0.85 : 1.2;
  return positive ? 0.7 : 1.4;
}

/** Pass-through loyalty scale for baseline demand (−5%..+5%). */
export function loyaltyRetentionFactor(loyaltyPct: number): number {
  // 0.95 at 30, 1.00 at 50, 1.05 at 80+
  if (loyaltyPct >= 80) return 1.05;
  if (loyaltyPct >= 65) return 1.03;
  if (loyaltyPct >= 50) return 1.0;
  if (loyaltyPct >= 35) return 0.97;
  return 0.93;
}

// ─── Apply an option effect ────────────────────────────────
export function applyOptionEffect(team: Team, effect: OptionEffect): Team {
  const next: Team = {
    ...team,
    cashUsd: team.cashUsd + (effect.cash ?? 0),
    brandPts: Math.max(0, team.brandPts + (effect.brandPts ?? 0)),
    opsPts: Math.max(0, team.opsPts + (effect.opsPts ?? 0)),
    customerLoyaltyPct: clamp(
      0, 100,
      team.customerLoyaltyPct + (effect.loyaltyDelta ?? 0),
    ),
    flags: new Set(team.flags),
    deferredEvents: [...(team.deferredEvents ?? [])],
  };
  if (effect.setFlags) {
    for (const f of effect.setFlags) next.flags.add(f);
  }
  return next;
}

/** Serialize an effect for queue persistence. */
export function serializeEffect(effect: OptionEffect): string {
  return JSON.stringify(effect);
}
export function deserializeEffect(json: string): OptionEffect {
  return JSON.parse(json) as OptionEffect;
}

export function clamp(lo: number, hi: number, n: number): number {
  return Math.max(lo, Math.min(hi, n));
}

// ─── Quarter close orchestration (PRD §9) ──────────────────
export interface QuarterCloseResult {
  quarter: number;
  revenue: number;
  fuelCost: number;
  slotCost: number;
  staffCost: number;
  otherSliderCost: number;
  maintenanceCost: number;
  depreciation: number;
  interest: number;
  tax: number;
  carbonLevy: number;
  passengerTax: number;
  fuelExcise: number;
  rcfInterest: number;
  netProfit: number;
  newCashUsd: number;
  newRcfBalance: number;
  newBrandPts: number;
  newOpsPts: number;
  newLoyalty: number;
  newBrandValue: number;
  routeBreakdown: Array<{
    routeId: string;
    revenue: number;
    fuelCost: number;
    slotCost: number;
    profit: number;
    occupancy: number;
  }>;
  triggeredEvents: Array<{
    id: string;
    scenario: string;
    outcome: "triggered" | "missed";
    cashDelta?: number;
    brandDelta?: number;
    note?: string;
  }>;
  notes: string[];
}

export interface QuarterCloseContext {
  baseInterestRatePct: number;
  fuelIndex: number;
  quarter: number;
}

export function runQuarterClose(
  team: Team,
  ctx: QuarterCloseContext,
): QuarterCloseResult {
  const notes: string[] = [];
  let next: Team = {
    ...team,
    flags: new Set(team.flags),
    deferredEvents: [...(team.deferredEvents ?? [])],
    rcfBalanceUsd: team.rcfBalanceUsd ?? 0,
  };

  // ─ Route economics ──────────────────────────────────────
  const routeBreakdown: QuarterCloseResult["routeBreakdown"] = [];
  let revenue = 0;
  let fuelCost = 0;
  let slotCost = 0;
  let totalPassengers = 0;
  for (const r of next.routes.filter((r) => r.status === "active")) {
    const econ = computeRouteEconomics(next, r, ctx.quarter, ctx.fuelIndex);
    revenue += econ.quarterlyRevenue;
    fuelCost += econ.quarterlyFuelCost;
    slotCost += econ.quarterlySlotCost;
    totalPassengers += econ.dailyPax * QUARTER_DAYS;
    routeBreakdown.push({
      routeId: r.id,
      revenue: econ.quarterlyRevenue,
      fuelCost: econ.quarterlyFuelCost,
      slotCost: econ.quarterlySlotCost,
      profit: econ.quarterlyProfit,
      occupancy: econ.occupancy,
    });
    r.avgOccupancy = econ.occupancy;
    r.quarterlyRevenue = econ.quarterlyRevenue;
    r.quarterlyFuelCost = econ.quarterlyFuelCost;
    r.quarterlySlotCost = econ.quarterlySlotCost;
  }

  // ─ Staff (A3) ───────────────────────────────────────────
  const staffBase = baselineStaffCostUsd(next);
  const staffCost = staffBase * STAFF_MULTIPLIER[next.sliders.staff];

  // ─ Other sliders as % of revenue (A2) ──────────────────
  const sliderPctKeys: (keyof Sliders)[] = [
    "marketing", "service", "rewards", "operations",
  ];
  const otherSliderCost = sliderPctKeys.reduce(
    (sum, k) => sum + revenue * SLIDER_PCT_REVENUE[next.sliders[k]], 0);

  // ─ Maintenance + aging flag ────────────────────────────
  let maintenanceCost = next.fleet.filter((f) => f.status === "active").length *
    500_000;
  if (next.flags.has("aging_fleet")) maintenanceCost += 15_000_000;

  // ─ Hub terminal fees (§4.2 + §4.4 2× for secondary) ────
  const primaryHubFee = hubTerminalFeeUsd(next.hubCode);
  const secondaryHubFees = (next.secondaryHubCodes ?? []).reduce(
    (sum, code) => sum + hubTerminalFeeUsd(code) * 2, 0,
  );
  const hubFee = primaryHubFee + secondaryHubFees;
  maintenanceCost += hubFee;

  // ─ Depreciation ─────────────────────────────────────────
  let depreciation = 0;
  next.fleet = next.fleet.map((f) => {
    if (f.acquisitionType !== "buy") return f;
    const qSince = Math.max(0, ctx.quarter - f.purchaseQuarter);
    const newBook = depreciateBookValue(f.purchasePrice, qSince + 1);
    const prev = f.bookValue ?? f.purchasePrice;
    const delta = Math.max(0, prev - newBook);
    depreciation += delta;
    return { ...f, bookValue: newBook };
  });

  // ─ Interest on debt + RCF interest (A8) ────────────────
  const interest = quarterlyInterestUsd(next, ctx.baseInterestRatePct);
  const rcfRate = ctx.baseInterestRatePct * 2;
  const rcfInterest = next.rcfBalanceUsd * (rcfRate / 100) / 4;

  // ─ Additional taxes (A15) ──────────────────────────────
  // Passenger departure tax: blended $16/pax (mix of economy $12, business $22, first $45)
  const passengerTax = totalPassengers * 16;
  // Fuel excise: 8% of fuel cost
  const fuelExcise = fuelCost * 0.08;
  // Carbon levy: from Q17 onwards (PRD S17), $45/tonne CO2 at ~0.12 kg CO2 / L fuel
  let carbonLevy = 0;
  if (ctx.quarter >= 17) {
    // Approximate fuel liters total = fuelCost / (fuelIndex/100 * 0.18)
    const pricePerL = (ctx.fuelIndex / 100) * 0.18;
    const totalLiters = pricePerL > 0 ? fuelCost / pricePerL : 0;
    const tonnesCO2 = (totalLiters * 0.12) / 1000; // kg → tonnes
    carbonLevy = tonnesCO2 * 45;
    if (next.flags.has("green_leader") && ctx.quarter >= 19) {
      carbonLevy *= 0.6; // PRD S17-C: levy drops 40% from Q19
    }
    if (next.flags.has("sustainability_signal")) {
      // Mild reduction for absorbing/committing at Q17
      carbonLevy *= 0.95;
    }
  }

  // ─ Pre-tax profit ───────────────────────────────────────
  const pretax =
    revenue - fuelCost - slotCost - staffCost - otherSliderCost -
    maintenanceCost - depreciation - interest - rcfInterest -
    passengerTax - fuelExcise - carbonLevy;

  // ─ Corporate tax (A15): 20% on positive pretax ─────────
  const tax = pretax > 0 ? pretax * 0.2 : 0;
  const netProfit = pretax - tax;

  // ─ Cash flow + RCF auto-draw (A8) ──────────────────────
  let newCashUsd = next.cashUsd + netProfit;
  let newRcfBalance = next.rcfBalanceUsd;
  // First, if cash is positive and RCF is drawn, auto-repay
  if (newCashUsd > 0 && newRcfBalance > 0) {
    const repay = Math.min(newCashUsd, newRcfBalance);
    newCashUsd -= repay;
    newRcfBalance -= repay;
  }
  // If cash is negative, auto-draw into RCF
  if (newCashUsd < 0) {
    const draw = -newCashUsd;
    const airlineValue = computeAirlineValue(next);
    const rcfCeiling = Math.max(0, airlineValue * 0.15);
    const roomLeft = Math.max(0, rcfCeiling - newRcfBalance);
    const drawAmount = Math.min(draw, roomLeft);
    newCashUsd += drawAmount;
    newRcfBalance += drawAmount;
    if (drawAmount < draw) {
      notes.push("RCF ceiling hit — cash remains negative. New routes & non-essential spending frozen.");
    } else if (drawAmount > 0) {
      notes.push(`RCF drew ${(drawAmount / 1e6).toFixed(1)}M at ${rcfRate.toFixed(1)}%`);
    }
  }

  // ─ System-level plot twists (reveal at specific quarters) ──
  // These depend on the player's prior decision, not on queued events.
  if (ctx.quarter === 4) {
    // S4 Oil Gamble twist: OPEC drop
    const s4 = team.decisions.find((d) => d.scenarioId === "S4");
    if (s4) {
      let twistDelta = 0;
      let twistNote = "";
      if (s4.optionId === "A") { twistDelta = -60 * M; twistNote = "S4 OPEC drop — locked high (−$60M)"; }
      else if (s4.optionId === "C") { twistDelta = 60 * M; twistNote = "S4 OPEC drop — open market wins (+$60M)"; }
      else if (s4.optionId === "D") { twistDelta = 30 * M; twistNote = "S4 OPEC drop — structured 50/50 (+$30M)"; }
      if (twistDelta !== 0) {
        newCashUsd += twistDelta;
        notes.push(twistNote);
      }
    }
  }
  if (ctx.quarter === 6) {
    // S16 Moscow Signal twist: false alarm — summer surge
    const s16 = team.decisions.find((d) => d.scenarioId === "S16");
    if (s16) {
      const lock = s16.lockInQuarters ?? 1;
      let twistDelta = 0;
      let twistLoyalty = 0;
      if (s16.optionId === "A" || s16.optionId === "B") {
        // PRD: missed revenue per locked quarter over 1
        if (lock > 1) {
          twistDelta = -65 * M * (lock - 1);
          twistLoyalty = -4 * (lock - 1);
          notes.push(`S16 false alarm — locked ${lock}Q missed summer surge`);
        }
      } else if (s16.optionId === "D") {
        twistDelta = 55 * M;
        notes.push("S16 counter-position captured competitor bookings (+$55M)");
      }
      if (twistDelta !== 0) newCashUsd += twistDelta;
      if (twistLoyalty !== 0)
        next.customerLoyaltyPct = clamp(0, 100, next.customerLoyaltyPct + twistLoyalty);
    }
  }
  if (ctx.quarter === 16) {
    // S15 Recession Gamble twist: recession ends early
    const s15 = team.decisions.find((d) => d.scenarioId === "S15");
    if (s15) {
      if (s15.optionId === "A") {
        newCashUsd -= 80 * M;
        next.flags.add("talent_shortage");
        next.opsPts = Math.max(0, next.opsPts - 10);
        notes.push("S15 twist — mass redundancy rehire cost $80M, talent shortage flag");
      } else if (s15.optionId === "D") {
        newCashUsd += 120 * M;
        notes.push("S15 twist — counter-cyclical advantage +$120M");
      }
    }
  }
  if (ctx.quarter === 18) {
    // S12 Brand Grenade twist: ambassador cleared
    const s12 = team.decisions.find((d) => d.scenarioId === "S12");
    if (s12) {
      if (s12.optionId === "A") {
        next.brandPts = Math.max(0, next.brandPts - 22);
        notes.push("S12 twist — ambassador cleared, A terminate looks reactive (−22 Brand)");
      } else if (s12.optionId === "D") {
        next.brandPts = Math.max(0, next.brandPts + 15);
        notes.push("S12 twist — redemption arc pays off (+15 Brand)");
      }
    }
  }

  // ─ Resolve deferred events targeting this quarter ──────
  const triggeredEvents: QuarterCloseResult["triggeredEvents"] = [];
  const remainingDeferred: DeferredEvent[] = [];
  for (const ev of next.deferredEvents) {
    if (ev.resolved) continue;
    if (ev.targetQuarter !== ctx.quarter) {
      remainingDeferred.push(ev);
      continue;
    }
    const roll = Math.random();
    if (roll <= ev.probability) {
      const eff = deserializeEffect(ev.effectJson);
      newCashUsd += eff.cash ?? 0;
      next.brandPts = Math.max(0, next.brandPts + (eff.brandPts ?? 0));
      next.opsPts = Math.max(0, next.opsPts + (eff.opsPts ?? 0));
      next.customerLoyaltyPct = clamp(
        0, 100, next.customerLoyaltyPct + (eff.loyaltyDelta ?? 0),
      );
      if (eff.setFlags) for (const f of eff.setFlags) next.flags.add(f);
      triggeredEvents.push({
        id: ev.id,
        scenario: ev.sourceScenario,
        outcome: "triggered",
        cashDelta: eff.cash,
        brandDelta: eff.brandPts,
        note: ev.noteAtQueue,
      });
      notes.push(
        `Deferred ${ev.sourceScenario}-${ev.sourceOption} TRIGGERED (p=${(ev.probability * 100).toFixed(0)}%)`,
      );
    } else {
      triggeredEvents.push({
        id: ev.id,
        scenario: ev.sourceScenario,
        outcome: "missed",
        note: ev.noteAtQueue,
      });
    }
    remainingDeferred.push({
      ...ev,
      resolved: true,
      resolvedAtQuarter: ctx.quarter,
      resolvedOutcome: roll <= ev.probability ? "triggered" : "missed",
    });
  }
  next.deferredEvents = remainingDeferred;

  // Slider → brand / loyalty / ops pts per-quarter
  const sliderKeys: (keyof Sliders)[] = [
    "staff", "marketing", "service", "rewards", "operations",
  ];
  let brandDelta = 0;
  let loyaltyDelta = 0;
  let opsDelta = 0;
  for (const k of sliderKeys) {
    const level = next.sliders[k];
    const streak = next.sliderStreaks[k];
    const mult = streak.level === level
      ? streakMultiplier(streak.quarters + 1)
      : 1.0;
    const e = SLIDER_EFFECTS[k][level];
    brandDelta += (e.brandPts ?? 0) * mult;
    loyaltyDelta += (e.loyalty ?? 0) * mult;
    opsDelta += (e.opsPts ?? 0) * mult;
    next.sliderStreaks[k] =
      streak.level === level
        ? { level, quarters: streak.quarters + 1 }
        : { level, quarters: 1 };
  }

  const newBrandPts = Math.max(0, next.brandPts + brandDelta);
  const newOpsPts = Math.max(0, next.opsPts + opsDelta);
  // Loyalty drifts toward 50 slightly, plus slider delta
  const drift = (50 - next.customerLoyaltyPct) * 0.03;
  const newLoyalty = clamp(
    0, 100, next.customerLoyaltyPct + loyaltyDelta + drift,
  );

  // Update team state for Brand Value calc
  next.cashUsd = newCashUsd;
  next.brandPts = newBrandPts;
  next.opsPts = newOpsPts;
  next.customerLoyaltyPct = newLoyalty;

  const newBrandValue = computeBrandValue(next);

  notes.push(`Revenue: $${(revenue / 1e6).toFixed(1)}M across ${routeBreakdown.length} routes`);
  notes.push(`Fuel index ${ctx.fuelIndex} → ${(fuelCost / 1e6).toFixed(1)}M fuel cost`);
  if (tax > 0) notes.push(`Corporate tax: ${(tax / 1e6).toFixed(1)}M`);
  if (carbonLevy > 0) notes.push(`Carbon levy: ${(carbonLevy / 1e6).toFixed(1)}M`);
  if (interest > 0) notes.push(`Debt interest: $${(interest / 1e6).toFixed(1)}M`);

  return {
    quarter: ctx.quarter,
    revenue,
    fuelCost,
    slotCost,
    staffCost,
    otherSliderCost,
    maintenanceCost,
    depreciation,
    interest,
    tax,
    carbonLevy,
    passengerTax,
    fuelExcise,
    rcfInterest,
    netProfit,
    newCashUsd,
    newRcfBalance,
    newBrandPts,
    newOpsPts,
    newLoyalty,
    newBrandValue,
    routeBreakdown,
    triggeredEvents,
    notes,
  };
}

// ─── Scenarios this quarter ────────────────────────────────
export function scenariosForQuarter(quarter: number): Scenario[] {
  return SCENARIOS.filter((s) => s.quarter === quarter);
}

// ─── Helpers for UI ────────────────────────────────────────
export function fleetSeatTotal(fleet: FleetAircraft[]): number {
  return fleet
    .filter((f) => f.status === "active")
    .reduce((sum, f) => {
      const spec = AIRCRAFT_BY_ID[f.specId];
      if (!spec) return sum;
      return sum + spec.seats.first + spec.seats.business + spec.seats.economy;
    }, 0);
}

export function fleetCount(fleet: FleetAircraft[]): number {
  return fleet.filter((f) => f.status === "active").length;
}
