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
import { NEWS_BY_QUARTER } from "@/data/world-news";
import { cityEventImpact } from "./city-events";
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

// ─── Global Travel Index (PRD E6) — master demand multiplier ──
/** Per-quarter macro demand multiplier, aligned to PRD world-news narrative. */
export const TRAVEL_INDEX: Record<number, number> = {
  1: 100, 2: 103, 3: 98, 4: 106, 5: 93, 6: 118, 7: 112, 8: 89,
  9: 104, 10: 128, 11: 97, 12: 91, 13: 72, 14: 76, 15: 90, 16: 110,
  17: 105, 18: 122, 19: 126, 20: 130,
};

/** Seasonal multipliers (PRD D5) indexed by quarter-within-game-year. */
export function seasonalMultiplier(
  quarter: number,
): { tourism: number; business: number } {
  const qInYear = ((quarter - 1) % 4) + 1;
  // Q1 winter, Q2 spring/summer, Q3 peak summer, Q4 holiday
  if (qInYear === 1) return { tourism: 0.85, business: 1.05 };
  if (qInYear === 2) return { tourism: 1.10, business: 1.00 };
  if (qInYear === 3) return { tourism: 1.20, business: 0.90 };
  return { tourism: 1.05, business: 1.05 };
}

// ─── Physics-based flight frequency (PRD D1/F2) ────────────
/** Aircraft cruise speed in km/h by id prefix. Engine retrofit "power"
 *  / "super" boosts cruise speed by 10%. */
export function cruiseSpeedKmh(
  specId: string,
  engineUpgrade?: "fuel" | "power" | "super" | null,
): number {
  let base: number;
  if (/^A319|^A320|^A321|^B737/.test(specId)) base = 840;
  else if (/^B757|^B767|^A330/.test(specId)) base = 870;
  else base = 900; // wide-body large: 777, 747, A380, 787, A350
  if (engineUpgrade === "power" || engineUpgrade === "super") {
    base = Math.round(base * 1.1);
  }
  return base;
}

/** Max weekly schedules for a single aircraft on a given route (D1 formula). */
export function maxWeeklyRotations(specId: string, routeDistanceKm: number): number {
  const oneWayHrs = routeDistanceKm / cruiseSpeedKmh(specId);
  const turnaround = 2.0;
  const roundTrip = oneWayHrs * 2 + turnaround * 2;
  const daily = Math.max(1, Math.floor(24 / roundTrip));
  return daily * 7;
}

/** Helper: max daily frequency across all planes on a route. */
export function maxRouteDailyFrequency(
  specIds: string[],
  routeDistanceKm: number,
): number {
  const weeklyTotal = specIds.reduce(
    (sum, id) => sum + maxWeeklyRotations(id, routeDistanceKm), 0,
  );
  return Math.floor(weeklyTotal / 7);
}

// ─── Hub attractiveness bonus (PRD E7) ─────────────────────
/** Returns multiplier (e.g. 1.18 for primary hub) for a route touching a team's hub. */
export function hubAttractivenessBonus(
  team: { hubCode: string; secondaryHubCodes: string[] },
  origin: string,
  dest: string,
): number {
  if (team.hubCode === origin || team.hubCode === dest) return 1.18;
  if (team.secondaryHubCodes?.includes(origin) || team.secondaryHubCodes?.includes(dest))
    return 1.10;
  return 1.0;
}

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

// ─── Route demand (PRD §5.2 + E6 + D5 + A1 events) ──────────
export function routeDemandPerDay(
  origin: string,
  dest: string,
  quarter: number,
): { tourism: number; business: number; total: number; amplifier: number } {
  const a = CITIES_BY_CODE[origin];
  const b = CITIES_BY_CODE[dest];
  if (!a || !b) return { tourism: 0, business: 0, total: 0, amplifier: 1 };
  const amplifier = Math.min(a.amplifier, b.amplifier);

  const eventA = cityEventImpact(origin, quarter).pct / 100;
  const eventB = cityEventImpact(dest, quarter).pct / 100;

  // Global Travel Index master multiplier (PRD E6)
  const travelIdx = (TRAVEL_INDEX[quarter] ?? 100) / 100;
  // Seasonal multiplier (PRD D5)
  const season = seasonalMultiplier(quarter);

  const tourism =
    (cityTourismAtQuarter(a, quarter) * (1 + eventA) +
     cityTourismAtQuarter(b, quarter) * (1 + eventB)) *
    amplifier * travelIdx * season.tourism;
  const business =
    (cityBusinessAtQuarter(a, quarter) * (1 + eventA) +
     cityBusinessAtQuarter(b, quarter) * (1 + eventB)) *
    amplifier * travelIdx * season.business;
  return { tourism, business, total: tourism + business, amplifier };
}

// ─── Pricing multipliers (PRD §5.5 + §17) ──────────────────
export const PRICE_TIER: Record<PricingTier, number> = {
  // PRD-correct tier multipliers per user spec.
  budget: 0.5,
  standard: 1.0,
  premium: 1.5,
  ultra: 2.0,
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
  0: "Bare Min",
  1: "Lean",
  2: "Standard",
  3: "Premium",
  4: "Extra High",
  5: "Maximum",
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
  // Marketing & Rewards merged (PRD update). Drives both brand pts and
  // loyalty. Effects represent the combined cost of campaign spend +
  // frequent-flyer benefits.
  marketing: {
    0: { brandPts: -3, loyalty: -4 },
    1: { brandPts: -1, loyalty: -1 },
    2: { brandPts: 0, loyalty: 1 },
    3: { brandPts: 3, loyalty: 4 },
    4: { brandPts: 6, loyalty: 7 },
    5: { brandPts: 10, loyalty: 11 },
  },
  service: {
    0: { brandPts: -4, loyalty: -5 },
    1: { brandPts: -2, loyalty: -2 },
    2: { brandPts: 0, loyalty: 0 },
    3: { brandPts: 3, loyalty: 4 },
    4: { brandPts: 6, loyalty: 7 },
    5: { brandPts: 10, loyalty: 12 },
  },
  // Rewards retained as a no-op shape so existing saves don't crash; engine
  // no longer reads it (sliderKeys excludes "rewards"). Will be removed in
  // a future migration once all saves have rolled forward.
  rewards: {
    0: { brandPts: 0, loyalty: 0 },
    1: { brandPts: 0, loyalty: 0 },
    2: { brandPts: 0, loyalty: 0 },
    3: { brandPts: 0, loyalty: 0 },
    4: { brandPts: 0, loyalty: 0 },
    5: { brandPts: 0, loyalty: 0 },
  },
  operations: {
    0: { brandPts: -3, loyalty: 0, opsPts: -5 },
    1: { brandPts: -1, loyalty: 0, opsPts: -2 },
    2: { brandPts: 0, loyalty: 0, opsPts: 0 },
    3: { brandPts: 0, loyalty: 0, opsPts: 3 },
    4: { brandPts: 0, loyalty: 0, opsPts: 6 },
    5: { brandPts: 0, loyalty: 0, opsPts: 10 },
  },
  customerService: {
    // PRD E1 — 0% / 2% / 5% / 8% / 12% / 18% of revenue
    0: { brandPts: -2, loyalty: -4 },          // Very Low
    1: { brandPts: -1, loyalty: -2 },          // Low
    2: { brandPts: 0, loyalty: 0 },            // Standard
    3: { brandPts: 2, loyalty: 2 },            // High
    4: { brandPts: 4, loyalty: 5 },            // Very High
    5: { brandPts: 7, loyalty: 8 },            // Extreme
  },
};

/** Customer Service slider % of revenue (PRD E1, distinct from the core sliders). */
export const CS_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0, 1: 0.02, 2: 0.05, 3: 0.08, 4: 0.12, 5: 0.18,
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

// Service score from sliders. PRD §5.3 — when staff ↔ service gap is large
// (≥3 levels), the customer-perceived score caps at 60 because passengers
// notice the dissonance: great food + dreadful crew, or the inverse.
export function serviceScoreFromSliders(s: Sliders): number {
  const raw = ((s.service + s.rewards) / 2 / 5) * 100;
  const gap = Math.abs(s.staff - s.service);
  if (gap >= 3) return Math.min(60, raw);
  return raw;
}

/** Customer Service slider → occupancy multiplier (PRD E1).
 *  Higher CS retains more passengers, lower causes leakage even at low fares. */
export function customerServiceOccupancyMultiplier(s: Sliders): number {
  const cs = s.customerService ?? 2;
  return [0.92, 0.96, 1.0, 1.03, 1.06, 1.10][cs] ?? 1.0;
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
  rivals?: Team[],
): RouteEconomics {
  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  if (!origin || !dest)
    return blankEconomics(route.distanceKm);

  const distanceKm = route.distanceKm || haversineKm(origin, dest);
  const rawDemand = routeDemandPerDay(route.originCode, route.destCode, quarter);
  const loyaltyFactor = loyaltyRetentionFactor(team.customerLoyaltyPct);

  // PRD §5.4 — competitor pressure on shared markets.
  // When rivals have hubs at our route endpoints, they capture some of the
  // demand pool. Player's own brand strength resists this pressure.
  let competitorPressure = 1.0;
  if (rivals && rivals.length > 0) {
    let pressure = 0;
    for (const rv of rivals) {
      const rvHubs = new Set([rv.hubCode, ...(rv.secondaryHubCodes ?? [])]);
      // Direct-hub rival at either endpoint = strongest pressure
      if (rvHubs.has(origin.code) || rvHubs.has(dest.code)) {
        // Brand-weighted: a stronger rival takes a bigger bite
        const rvAttractiveness = (rv.brandPts / 100) * 0.5 + (rv.customerLoyaltyPct / 100) * 0.5;
        pressure += rvAttractiveness * 0.12;
      }
    }
    // Player's own attractiveness mitigates the pressure
    const ownAttractiveness =
      (team.brandPts / 100) * 0.5 + (team.customerLoyaltyPct / 100) * 0.5;
    competitorPressure = Math.max(0.55, 1 - pressure + ownAttractiveness * 0.15);
  }

  const demand = {
    ...rawDemand,
    total: rawDemand.total * loyaltyFactor * competitorPressure,
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
    // Cargo demand = min of the two cities' business demand (A4).
    // Cargo-focused doctrine adds 15% on top.
    const cargoFocusBonus = team.marketFocus === "cargo" ? 1.15 : 1.0;
    const cargoDemandT = Math.min(
      cityBusinessAtQuarter(origin, quarter),
      cityBusinessAtQuarter(dest, quarter),
    ) * cargoFocusBonus;
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
      // Stack engine retrofit + eco + fuselage coating multiplicatively.
      // fuel/super engine = -10%, eco engine = -10%, fuselage coating = -10%
      const fuelMult =
        (p.ecoUpgrade ? 0.9 : 1.0) *
        (p.engineUpgrade === "fuel" || p.engineUpgrade === "super" ? 0.9 : 1.0) *
        (p.fuselageUpgrade ? 0.9 : 1.0);
      return sum + spec.fuelBurnPerKm * fuelMult * distanceKm;
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
    // Honor per-instance custom seat allocation (set at purchase order).
    // Falls back to spec defaults when no override.
    const seats = p.customSeats ?? spec.seats;
    seatsPerFlight.first += seats.first;
    seatsPerFlight.bus += seats.business;
    seatsPerFlight.econ += seats.economy;
  }
  const totalSeatsPerFlight =
    seatsPerFlight.first + seatsPerFlight.bus + seatsPerFlight.econ;
  const dailyCapacity = totalSeatsPerFlight * route.dailyFrequency;

  // Hub attractiveness bonus (PRD E7): home carrier captures more demand
  const hubBonus = hubAttractivenessBonus(team, route.originCode, route.destCode);
  // Customer service slider amplifies retained demand (PRD E1)
  const csMultiplier = customerServiceOccupancyMultiplier(team.sliders);
  // Premium lounge at hub: small business/first-class demand uplift
  const hubInv = team.hubInvestments;
  const hasLounge =
    hubInv?.premiumLoungeHubs?.includes(route.originCode) ||
    hubInv?.premiumLoungeHubs?.includes(route.destCode);
  const loungeBonus = hasLounge ? 1.04 : 1.0;

  // PRD §13.2 — onboarding choices propagate as gentle demand multipliers.
  // Match-rewarded ("focus matches the route"), but never punitive.
  let onboardingBonus = 1.0;
  if (team.marketFocus === "passenger" && !route.isCargo) onboardingBonus *= 1.05;
  // CSR theme — environment leans loyalty (already wired via flags), but the
  // community theme nudges short-haul familiarity, employees nudges ops,
  // both expressed as a small demand bonus on tier 2-4 cities (less obvious
  // than a hub bonus, more like local goodwill).
  if (team.csrTheme === "community" && (origin.tier >= 2 && dest.tier >= 2)) {
    onboardingBonus *= 1.03;
  }
  // Geographic priority — both endpoints in the priority region get the bump
  const geoMatch =
    team.geographicPriority === "global" ||
    (team.geographicPriority === "north-america" && origin.region === "na" && dest.region === "na") ||
    (team.geographicPriority === "europe" && origin.region === "eu" && dest.region === "eu") ||
    (team.geographicPriority === "asia-pacific" && (origin.region === "as" || origin.region === "oc") && (dest.region === "as" || dest.region === "oc")) ||
    (team.geographicPriority === "middle-east" && (origin.region === "me" || origin.region === "mea") && (dest.region === "me" || dest.region === "mea"));
  if (geoMatch && team.geographicPriority !== "global") onboardingBonus *= 1.08;

  // Cabin condition penalty (PRD update). If any plane on this route has
  // satisfactionPct < 30, knock 8% off demand. Below 50, knock 4%. Above 80
  // bonus 2%. Multiple planes pick the WORST condition (passengers
  // remember the bad flight).
  let cabinPenalty = 1.0;
  if (planes.length > 0) {
    const worstSat = Math.min(...planes.map((p) => p.satisfactionPct ?? 75));
    if (worstSat < 30) cabinPenalty = 0.92;
    else if (worstSat < 50) cabinPenalty = 0.96;
    else if (worstSat >= 80) cabinPenalty = 1.02;
  }

  const effectiveDemand = demand.total * hubBonus * csMultiplier * loungeBonus * onboardingBonus * cabinPenalty;

  const dailyPax = Math.min(dailyCapacity, effectiveDemand);
  let occupancy =
    dailyCapacity > 0 ? Math.min(0.98, dailyPax / dailyCapacity) : 0;

  // World Cup load factor override (PRD §10.3 / S10 winner):
  //   - global_brand flag set when team won S10 sealed bid + L6 pitch
  //   - Q10 + Q11: 100% load factor on all routes
  //   - Q12: +50% demand uplift over baseline (additive bonus capped at 0.98)
  // Without the flag, no effect.
  if (team.flags?.has("global_brand")) {
    if (quarter === 10 || quarter === 11) {
      occupancy = 0.98;
    } else if (quarter === 12) {
      occupancy = Math.min(0.98, occupancy * 1.5);
    }
  }

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
    // Stack engine retrofit + eco + fuselage coating multiplicatively.
    const fuelMult =
      (p.ecoUpgrade ? 0.9 : 1.0) *
      (p.engineUpgrade === "fuel" || p.engineUpgrade === "super" ? 0.9 : 1.0) *
      (p.fuselageUpgrade ? 0.9 : 1.0);
    const burn = spec.fuelBurnPerKm * fuelMult * distanceKm;
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
  // Fuel reserve tank at the origin hub: 5% fuel discount on routes from there
  const hasFuelTank =
    team.hubInvestments?.fuelReserveTankHubs?.includes(route.originCode);
  const fuelTankDiscount = hasFuelTank ? 0.95 : 1.0;

  const quarterlyFuelCost =
    totalFuelBurnPerFlight * fuelPricePerL *
    route.dailyFrequency * QUARTER_DAYS * hedge * fuelTankDiscount;

  // Slot fees (PRD update — Model B): the per-route slot cost is now zero
  // because slot fees are charged ONCE per quarter at the team level (sum
  // of all leased slots × weekly rent × 13 weeks). The route still
  // "consumes" weekly_freq slots at each endpoint but that's a capacity
  // check against team.airportLeases, not a per-route fee.
  const quarterlySlotCost = 0;

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
  // Lenders price against book equity, not brand-multiplied valuation
  const equity = computeNetEquityUsdSafe(team);
  const debtRatio = equity > 0 ? team.totalDebtUsd / equity : 1;
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
  // Against book equity, not brand-multiplied valuation
  const v = computeNetEquityUsdSafe(team);
  return Math.max(0, v * 0.6 - team.totalDebtUsd);
}

/** Forward declaration used before computeNetEquityUsd exists in the file. */
function computeNetEquityUsdSafe(team: Team): number {
  const fleetValue = team.fleet.reduce((s, f) => s + (f.bookValue ?? 0), 0);
  return team.cashUsd + fleetValue - team.totalDebtUsd;
}

// ─── Airline Value + Brand multiplier (merged per user feedback) ────
// Brand, loyalty, ops are now a hidden multiplier on the balance-sheet value —
// so the player sees one "Airline Value" number in dollars, which can rise or
// fall based on brand strength independently of cash/debt.
export function computeBrandMultiplier(team: Team): number {
  // Brand score 0..100 from internal signals
  const brandScore = Math.min(100, team.brandPts / 2);
  const opsScore = Math.min(100, team.opsPts);
  const loyalty = team.customerLoyaltyPct;
  const composite =
    brandScore * 0.5 + loyalty * 0.3 + opsScore * 0.2;
  // Map composite 0..100 → multiplier 0.40..1.80 (linear around 50 = 1.00)
  // At 50: 1.0, at 100: 1.8, at 0: 0.4
  return 0.40 + (composite / 100) * 1.40;
}

export function computeNetEquityUsd(team: Team): number {
  const fleetValue = team.fleet.reduce((s, f) => s + (f.bookValue ?? 0), 0);
  return team.cashUsd + fleetValue - team.totalDebtUsd;
}

/** Player-facing Airline Value — net equity × brand multiplier. */
export function computeAirlineValue(team: Team): number {
  const equity = computeNetEquityUsd(team);
  const mult = computeBrandMultiplier(team);
  return equity * mult;
}

/** A letter grade for the brand multiplier — shown instead of raw Brand Pts. */
export function brandRating(team: Team): { grade: string; color: string } {
  const m = computeBrandMultiplier(team);
  if (m >= 1.6) return { grade: "A+", color: "var(--positive)" };
  if (m >= 1.4) return { grade: "A",  color: "var(--positive)" };
  if (m >= 1.2) return { grade: "B+", color: "var(--primary)" };
  if (m >= 1.0) return { grade: "B",  color: "var(--primary)" };
  if (m >= 0.8) return { grade: "C",  color: "var(--warning)" };
  if (m >= 0.6) return { grade: "D",  color: "var(--warning)" };
  return { grade: "F", color: "var(--negative)" };
}

// ─── End-game card modifiers (PRD G9) ──────────────────────
export interface EndgameAward {
  card: string;
  source: string;
  effect: string;
  airlineValueMult: number;       // multiplier applied at the end
  brandBoost: number;              // flat +/- Brand Value pts
}

/** Resolve every end-game card the team qualifies for, with the PRD G9 effects. */
export function resolveEndgameAwards(team: Team): EndgameAward[] {
  const out: EndgameAward[] = [];
  const has = (f: string) => team.flags.has(f);

  if (has("premium_airline"))
    out.push({ card: "Premium Airline", source: "S11-A Olympic official carrier",
      effect: "×1.08 airline value", airlineValueMult: 1.08, brandBoost: 0 });
  if (has("global_brand"))
    out.push({ card: "Global Brand", source: "S10 World Cup winner",
      effect: "+15 Brand Value", airlineValueMult: 1, brandBoost: 15 });
  if (has("green_leader"))
    out.push({ card: "Green Leader", source: "S17-C SAF investment",
      effect: "×1.10 brand health", airlineValueMult: 1.05, brandBoost: 5 });
  if (has("trusted_operator"))
    out.push({ card: "Trusted Operator", source: "S1-A self-reported",
      effect: "+8 Ops Health", airlineValueMult: 1, brandBoost: 4 });
  if (has("safety_leader"))
    out.push({ card: "Safety Leader", source: "S16-A before declaration",
      effect: "+5 Ops Health", airlineValueMult: 1, brandBoost: 2.5 });
  if (has("people_first"))
    out.push({ card: "People First", source: "S13-C reskill programme",
      effect: "+10 Brand, +20 Staff Commitment", airlineValueMult: 1, brandBoost: 10 });
  if (has("trusted_employer"))
    out.push({ card: "Trusted Employer", source: "S15-C held headcount through recession",
      effect: "×1.05 loyalty", airlineValueMult: 1.03, brandBoost: 0 });
  if (has("efficient_capital"))
    out.push({ card: "Efficient Capital", source: "S6 refinancing taken",
      effect: "+5 Financial Health", airlineValueMult: 1, brandBoost: 2.5 });
  if (has("fleet_uniformity"))
    out.push({ card: "Fleet Uniformity", source: "E8.2 — 80%+ one aircraft family",
      effect: "+5 Ops Health end-game", airlineValueMult: 1, brandBoost: 2.5 });
  if ((team.milestones?.length ?? 0) >= 4)
    out.push({ card: "Grand Slam", source: `${team.milestones.length} milestones earned`,
      effect: `+${team.milestones.length * 2} Brand Value`, airlineValueMult: 1,
      brandBoost: team.milestones.length * 2 });
  // Negative flags
  if (has("anti_environment"))
    out.push({ card: "Anti-Environment", source: "S17-D failed legal challenge",
      effect: "-15 Brand Value (already applied) — no further penalty", airlineValueMult: 1, brandBoost: 0 });
  if (has("distracted_airline"))
    out.push({ card: "Distracted Airline", source: "S9-C split budget",
      effect: "-5 Ops Health end-game", airlineValueMult: 1, brandBoost: -2.5 });
  if (has("no_vision"))
    out.push({ card: "No Vision", source: "S9-D paid dividend",
      effect: "-5 Brand Value end-game", airlineValueMult: 0.98, brandBoost: -5 });
  return out;
}

/** Apply end-game awards to the base Brand Value. */
export function finalBrandValueWithAwards(
  baseBrandValue: number,
  awards: EndgameAward[],
): number {
  let bv = baseBrandValue + awards.reduce((s, a) => s + a.brandBoost, 0);
  const mult = awards.reduce((m, a) => m * a.airlineValueMult, 1);
  bv *= mult;
  return Math.max(0, Math.min(120, bv));
}

// ─── Brand Value (PRD §5.9) ────────────────────────────────
export interface BrandValueBreakdown {
  cashRatio: number;
  debtRatioScore: number;
  revGrowth: number;
  financialHealth: number;

  brandPtsScore: number;
  customerLoyalty: number;
  reputationEvents: number;
  brandHealth: number;

  opsPtsScore: number;
  fleetEfficiency: number;
  staffCommitment: number;
  operationsHealth: number;

  composite: number;
}

/** Returns the full breakdown of how Brand Value is constructed.
 *  Same arithmetic as computeBrandValue, exposed for the dashboard card. */
export function computeBrandValueBreakdown(team: Team): BrandValueBreakdown {
  const cashRatio =
    team.cashUsd + team.totalDebtUsd > 0
      ? team.cashUsd / (team.cashUsd + team.totalDebtUsd)
      : 0.5;
  const airlineValue = computeAirlineValue(team);
  const debtRatioScore =
    100 - Math.min(100, airlineValue > 0 ? (team.totalDebtUsd / airlineValue) * 100 : 100);
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
    return spec && spec.unlockQuarter >= 8;
  }).length;
  const fleetEfficiency =
    activeFleet.length > 0 ? (modernFleetCount / activeFleet.length) * 100 : 0;
  const staffCommitment = Math.min(100, team.sliders.staff * 10 + 50);

  const operationsHealth =
    opsPtsScore * 0.4 + fleetEfficiency * 0.35 + staffCommitment * 0.25;

  const composite =
    financialHealth * 0.35 + brandHealth * 0.5 + operationsHealth * 0.15;

  return {
    cashRatio: cashRatio * 100,
    debtRatioScore,
    revGrowth,
    financialHealth,
    brandPtsScore,
    customerLoyalty,
    reputationEvents,
    brandHealth,
    opsPtsScore,
    fleetEfficiency,
    staffCommitment,
    operationsHealth,
    composite,
  };
}

export function computeBrandValue(team: Team): number {
  return computeBrandValueBreakdown(team).composite;
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
  // Variable staff-cost savings (e.g. S15 Recession Gamble). Scales with
  // the team's actual quarterly staff bill rather than a hardcoded $.
  // Two quarters' worth × the percentage gets credited as cash.
  let extraCash = 0;
  if (effect.staffSavingsPct !== undefined && effect.staffSavingsPct > 0) {
    const quarterlyStaff = quarterlyStaffCost(team);
    extraCash += quarterlyStaff * 2 * effect.staffSavingsPct;
  }
  const next: Team = {
    ...team,
    cashUsd: team.cashUsd + (effect.cash ?? 0) + extraCash,
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

/**
 * Estimate the team's CURRENT quarterly staff cost — used to scale
 * staffSavingsPct effects without re-running the full quarter close.
 * Mirrors the formula used at quarter-close (baselineStaffCostUsd ×
 * STAFF_MULTIPLIER[slider.staff]).
 */
export function quarterlyStaffCost(team: Team): number {
  const base = baselineStaffCostUsd(team);
  const mult = STAFF_MULTIPLIER[team.sliders.staff] ?? 1.0;
  return base * mult;
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
  /** Passenger ticket revenue (sub-component of `revenue`). */
  passengerRevenue: number;
  /** Cargo freight revenue (sub-component of `revenue`). */
  cargoRevenue: number;
  fuelCost: number;
  slotCost: number;
  staffCost: number;
  otherSliderCost: number;
  maintenanceCost: number;
  /** Aircraft insurance premium for the quarter (PRD §E5). */
  insuranceCost: number;
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
  /** Pre-close team metrics so the digest can show deltas without bookkeeping. */
  prevCashUsd: number;
  prevBrandPts: number;
  prevOpsPts: number;
  prevLoyalty: number;
  prevBrandValue: number;
  /** Milestones earned during THIS quarter close (not all-time). */
  milestonesEarnedThisQuarter: string[];
  /** News items mentioning the player's network this quarter, with city impacts. */
  newsImpacts: Array<{
    headline: string;
    outlet: string;
    quarter: number;
    cities: Array<{ code: string; name: string; pct: number }>;
  }>;
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
  /** Other teams (rivals) — used by route economics for competitor pressure. */
  rivals?: Team[];
  /** Global cargo contracts active this quarter for this team (PRD E8.6). */
  cargoContracts?: Array<{
    id: string;
    teamId: string;
    originCode: string;
    destCode: string;
    guaranteedTonnesPerWeek: number;
    ratePerTonneUsd: number;
    quartersRemaining: number;
  }>;
}

export function runQuarterClose(
  team: Team,
  ctx: QuarterCloseContext,
): QuarterCloseResult {
  const notes: string[] = [];
  // Snapshot pre-close metrics so the digest can show clean deltas.
  const prevCashUsd = team.cashUsd;
  const prevBrandPts = team.brandPts;
  const prevOpsPts = team.opsPts;
  const prevLoyalty = team.customerLoyaltyPct;
  const prevBrandValue = computeBrandValue(team);
  const milestonesBefore = new Set(team.milestones ?? []);

  const next: Team = {
    ...team,
    flags: new Set(team.flags),
    deferredEvents: [...(team.deferredEvents ?? [])],
    rcfBalanceUsd: team.rcfBalanceUsd ?? 0,
  };

  // ─ Route economics ──────────────────────────────────────
  const routeBreakdown: QuarterCloseResult["routeBreakdown"] = [];
  let revenue = 0;
  let passengerRevenue = 0;
  let cargoRevenue = 0;
  let fuelCost = 0;
  let slotCost = 0;
  let totalPassengers = 0;
  for (const r of next.routes) {
    if (r.status === "active") {
      // Route Legacy Bonus (PRD E8.1) — +12% after 4+ consecutive active quarters
      const legacyBonus = r.consecutiveQuartersActive >= 4 ? 1.12 : 1.0;
      // First-Mover Bonus (PRD E8.8) — +20% for first 2 quarters (simplified: opening quarter + 1)
      const firstMoverBonus = ctx.quarter - r.openQuarter < 2 ? 1.20 : 1.0;

      const econ = computeRouteEconomics(next, r, ctx.quarter, ctx.fuelIndex, ctx.rivals);
      const boostedRevenue = econ.quarterlyRevenue * legacyBonus * firstMoverBonus;
      revenue += boostedRevenue;
      if (r.isCargo) cargoRevenue += boostedRevenue;
      else passengerRevenue += boostedRevenue;
      fuelCost += econ.quarterlyFuelCost;
      slotCost += econ.quarterlySlotCost;
      totalPassengers += econ.dailyPax * QUARTER_DAYS;
      routeBreakdown.push({
        routeId: r.id,
        revenue: boostedRevenue,
        fuelCost: econ.quarterlyFuelCost,
        slotCost: econ.quarterlySlotCost,
        profit: boostedRevenue - econ.quarterlyFuelCost - econ.quarterlySlotCost,
        occupancy: econ.occupancy,
      });
      r.avgOccupancy = econ.occupancy;
      r.quarterlyRevenue = boostedRevenue;
      r.quarterlyFuelCost = econ.quarterlyFuelCost;
      r.quarterlySlotCost = econ.quarterlySlotCost;
      // Increment Legacy counter
      r.consecutiveQuartersActive = (r.consecutiveQuartersActive ?? 0) + 1;
      // Route profitability streak (PRD G2 / F11.3)
      const routeProfit = boostedRevenue - econ.quarterlyFuelCost - econ.quarterlySlotCost;
      if (routeProfit < 0) {
        r.consecutiveLosingQuarters = (r.consecutiveLosingQuarters ?? 0) + 1;
      } else {
        r.consecutiveLosingQuarters = 0;
      }
    } else if (r.status === "suspended") {
      // Suspended routes — slots remain leased (you keep paying), but no
      // route-specific holding cost is added; the recurring lease fee
      // below covers it.
    }
  }

  // PRD update — Model B recurring slot fees. Sum across all leased
  // airports: totalWeeklyCost × 13 weeks per quarter. Player who wants
  // to stop paying for slots they don't use must explicitly release them
  // via releaseSlots(), which returns the slots to the airport pool.
  for (const code of Object.keys(next.airportLeases ?? {})) {
    const lease = next.airportLeases?.[code];
    if (!lease || lease.slots === 0) continue;
    slotCost += lease.totalWeeklyCost * 13;
  }

  // ─ Cargo contracts (PRD E8.6) — guaranteed revenue on matching routes
  if (ctx.cargoContracts && ctx.cargoContracts.length > 0) {
    for (const cc of ctx.cargoContracts) {
      if (cc.teamId !== next.id) continue;
      if (cc.quartersRemaining <= 0) continue;
      const hasRoute = next.routes.some((r) =>
        r.isCargo && r.status === "active" &&
        ((r.originCode === cc.originCode && r.destCode === cc.destCode) ||
         (r.originCode === cc.destCode && r.destCode === cc.originCode)),
      );
      if (hasRoute) {
        // 13 weeks × tonnes/week × rate
        const qRevenue = cc.guaranteedTonnesPerWeek * 13 * cc.ratePerTonneUsd;
        revenue += qRevenue;
        notes.push(`Cargo contract ${cc.originCode}↔${cc.destCode}: +$${(qRevenue / 1e6).toFixed(1)}M (guaranteed ${cc.guaranteedTonnesPerWeek}T/wk, ${cc.quartersRemaining}Q left)`);
      }
    }
  }

  // ─ Hub Investments: Fuel Reserve Tank reduces fuel cost at that hub's routes
  if (next.hubInvestments?.fuelReserveTankHubs.length > 0) {
    let fuelSavings = 0;
    for (const r of next.routes.filter((r) => r.status === "active")) {
      const touchesInvestedHub =
        next.hubInvestments.fuelReserveTankHubs.includes(r.originCode) ||
        next.hubInvestments.fuelReserveTankHubs.includes(r.destCode);
      if (touchesInvestedHub) {
        fuelSavings += r.quarterlyFuelCost * 0.15;
      }
    }
    if (fuelSavings > 0) {
      fuelCost -= fuelSavings;
      notes.push(`Fuel Reserve Tank saved $${(fuelSavings / 1e6).toFixed(1)}M`);
    }
  }

  // ─ Fuel Storage reconciliation (PRD E2) ────────────────
  // Route economics computed fuel at market; draw from storage first if any.
  if ((next.fuelStorageLevelL ?? 0) > 0 && fuelCost > 0) {
    const marketPricePerL = (ctx.fuelIndex / 100) * 0.18;
    if (marketPricePerL > 0) {
      const litresBurned = fuelCost / marketPricePerL;
      const fromStorage = Math.min(next.fuelStorageLevelL, litresBurned);
      const fromMarket = litresBurned - fromStorage;
      const storageCostUsed = fromStorage * next.fuelStorageAvgCostPerL;
      const marketCost = fromMarket * marketPricePerL;
      const savings = fuelCost - (storageCostUsed + marketCost);
      fuelCost = storageCostUsed + marketCost;
      next.fuelStorageLevelL = next.fuelStorageLevelL - fromStorage;
      if (next.fuelStorageLevelL === 0) next.fuelStorageAvgCostPerL = 0;
      if (savings > 0)
        notes.push(`Fuel storage saved $${(savings / 1e6).toFixed(1)}M this quarter`);
    }
  }

  // ─ Fuel tank maintenance (PRD E2) ──────────────────────
  const fuelTankMaint =
    (next.fuelTanks?.small ?? 0) * 150_000 +
    (next.fuelTanks?.medium ?? 0) * 350_000 +
    (next.fuelTanks?.large ?? 0) * 600_000;

  // ─ Staff (A3) ───────────────────────────────────────────
  const staffBase = baselineStaffCostUsd(next);
  const staffCost = staffBase * STAFF_MULTIPLIER[next.sliders.staff];

  // ─ Other sliders as % of revenue (A2) ──────────────────
  // Rewards merged into marketing per PRD update — 4 sliders contribute cost.
  const sliderPctKeys: (keyof Sliders)[] = [
    "marketing", "service", "operations",
  ];
  const otherSliderCost = sliderPctKeys.reduce(
    (sum, k) => sum + revenue * SLIDER_PCT_REVENUE[next.sliders[k]], 0)
    // PRD E1 Customer Service slider (distinct % of revenue ladder)
    + revenue * CS_PCT_REVENUE[next.sliders.customerService];

  // ─ Maintenance (PRD E4 age-scaled + Ops-discount) ──────
  const opsPtsDiscount = Math.min(0.40, next.opsPts / 250);
  let maintenanceCost = 0;
  for (const f of next.fleet) {
    if (f.status !== "active") continue;
    const ageQ = Math.max(0, ctx.quarter - f.purchaseQuarter);
    const basePct =
      ageQ < 20 ? 0.008 :
      ageQ < 40 ? 0.012 :
      ageQ < 60 ? 0.018 : 0.025;
    const effectivePct = basePct * (1 - opsPtsDiscount);
    maintenanceCost += f.purchasePrice * effectivePct;
  }
  if (next.flags.has("aging_fleet")) maintenanceCost += 15_000_000;

  // Maintenance deficit accumulation (PRD B2/C4 — 80/20 Ops/Staff split)
  const opsContribByLvl: Record<number, number> = {
    0: -2.0, 1: -0.5, 2: 1.0, 3: 1.5, 4: 2.0, 5: 2.5,
  };
  const opsContribution = (opsContribByLvl[next.sliders.operations] ?? 0) * 0.8;
  const staffContribution = (next.sliders.staff / 5) * 0.5 * 0.2;
  const maintContribution = opsContribution + staffContribution;
  next.fleet = next.fleet.map((f) => {
    if (f.status !== "active") return f;
    let deficit = f.maintenanceDeficit ?? 0;
    if (maintContribution < 0) deficit += Math.abs(maintContribution);
    else if (deficit > 0) {
      const catchUp = Math.max(0, maintContribution - 1.0);
      deficit = Math.max(0, deficit - catchUp);
    }
    return { ...f, maintenanceDeficit: deficit };
  });

  // ─ Hub terminal fees (§4.2 + §4.4 2× for secondary) ────
  const primaryHubFee = hubTerminalFeeUsd(next.hubCode);
  const secondaryHubFees = (next.secondaryHubCodes ?? []).reduce(
    (sum, code) => sum + hubTerminalFeeUsd(code) * 2, 0,
  );
  const hubFee = primaryHubFee + secondaryHubFees;
  maintenanceCost += hubFee;

  // Fuel tank maintenance (PRD E2)
  maintenanceCost += fuelTankMaint;

  // Hub Maintenance Depot (PRD D4): 20% fleet maintenance reduction per depot
  const depotCount = next.hubInvestments?.maintenanceDepotHubs.length ?? 0;
  if (depotCount > 0) {
    const reduction = Math.min(0.5, depotCount * 0.2);
    const saved = maintenanceCost * reduction;
    maintenanceCost -= saved;
    notes.push(`Maintenance Depot saved $${(saved / 1e6).toFixed(1)}M`);
  }

  // Fleet Uniformity Bonus (PRD E8.2): 80%+ same family → maintenance ×0.95, ops +3
  const activeFleet = next.fleet.filter((f) => f.status === "active");
  if (activeFleet.length >= 5) {
    const families: Record<string, number> = {};
    for (const f of activeFleet) {
      const family = f.specId.split("-")[0]; // crude family bucket
      families[family] = (families[family] ?? 0) + 1;
    }
    const maxFamilyShare = Math.max(...Object.values(families)) / activeFleet.length;
    if (maxFamilyShare >= 0.8) {
      maintenanceCost *= 0.95;
      next.flags.add("fleet_uniformity");
      notes.push("Fleet uniformity (80%+ one family): maintenance ×0.95, Ops +3/Q");
    } else {
      next.flags.delete("fleet_uniformity");
    }
  }

  // Insurance premium (PRD E5)
  const insurancePremiumPct: Record<string, number> = {
    low: 0.0015, medium: 0.003, high: 0.005, none: 0,
  };
  const fleetMarketValue = next.fleet.reduce((sum, f) => sum + f.purchasePrice, 0);
  const insurancePremium = fleetMarketValue * (insurancePremiumPct[next.insurancePolicy] ?? 0);
  // Insurance is now its own line item in the result (player-visible),
  // NOT bundled into maintenance. Engine still adds it to total operating
  // cost via the route-level totals below; UI breaks it out.
  // (maintenanceCost no longer absorbs insurance.)

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
  // Carbon levy (PRD S17): activated by the player's S17 decision
  // outcome, NOT by quarter alone. The engine only applies the levy
  // when the team holds the carbon_levy_active flag — this flag is set
  // when:
  //   - Player picks S17 option A (comply) at Q17, OR
  //   - Player picks S17 option D (legal challenge) and the deferred
  //     event fails (70% chance)
  // S17 option C (lead green transition) earns green_leader → 40%
  //   reduced rate from Q19.
  // S17 option B (absorb) earns sustainability_signal → 5% reduction.
  // Without the flag (e.g. challenge-success or scenario not yet
  // resolved), no levy is charged.
  let carbonLevy = 0;
  const levyActive =
    next.flags.has("carbon_levy_active") ||
    next.flags.has("green_leader") ||
    next.flags.has("sustainability_signal");
  if (ctx.quarter >= 17 && levyActive) {
    const pricePerL = (ctx.fuelIndex / 100) * 0.18;
    const totalLiters = pricePerL > 0 ? fuelCost / pricePerL : 0;
    const tonnesCO2 = (totalLiters * 0.12) / 1000;
    carbonLevy = tonnesCO2 * 45;
    if (next.flags.has("green_leader") && ctx.quarter >= 19) {
      carbonLevy *= 0.6;
    }
    if (next.flags.has("sustainability_signal")) {
      carbonLevy *= 0.95;
    }
  }

  // ─ Pre-tax profit ───────────────────────────────────────
  const pretax =
    revenue - fuelCost - slotCost - staffCost - otherSliderCost -
    maintenanceCost - depreciation - interest - rcfInterest -
    passengerTax - fuelExcise - carbonLevy;

  // ─ Tax loss carry-forward (PRD B5): 5-quarter expiry ───
  // Clean expired entries (older than 5 quarters)
  const carryFwd = (next.taxLossCarryForward ?? [])
    .filter((entry) => ctx.quarter - entry.quarter < 5);
  const availableLossOffset = carryFwd.reduce((sum, e) => sum + e.amount, 0);
  let taxBase = pretax;
  if (pretax > 0 && availableLossOffset > 0) {
    const applied = Math.min(pretax, availableLossOffset);
    taxBase = pretax - applied;
    // Consume carry-forward from oldest first
    let remaining = applied;
    for (const entry of carryFwd) {
      const use = Math.min(entry.amount, remaining);
      entry.amount -= use;
      remaining -= use;
      if (remaining <= 0) break;
    }
  }
  // ─ Corporate tax (A15): 20% on positive taxable base ───
  const tax = taxBase > 0 ? taxBase * 0.2 : 0;
  // If loss this quarter, enqueue for future offset
  if (pretax < 0) {
    carryFwd.push({ quarter: ctx.quarter, amount: -pretax });
  }
  next.taxLossCarryForward = carryFwd.filter((e) => e.amount > 0);
  let netProfit = pretax - tax;

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
    // PRD §5.10: ECL ceiling = 20% of current Airline Value
    const rcfCeiling = Math.max(0, airlineValue * 0.20);
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
  // Rewards merged into marketing per PRD update — 5 sliders effective.
  const sliderKeys: (keyof Sliders)[] = [
    "staff", "marketing", "service", "operations", "customerService",
  ];
  let brandDelta = 0;
  let loyaltyDelta = 0;
  let opsDelta = 0;
  for (const k of sliderKeys) {
    const level = next.sliders[k];
    // Defensive: persisted saves from older versions may be missing entries
    // for newer slider keys. Treat missing as a fresh streak at the current level.
    const streak = next.sliderStreaks[k] ?? { level, quarters: 0 };
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

  // Service dissonance penalty (PRD B6): Staff ↔ In-Flight Service gap ≥ 3 levels
  const staffLvl = next.sliders.staff;
  const serviceLvl = next.sliders.service;
  let dissonanceBrandPenalty = 0;
  let dissonanceLoyaltyPenalty = 0;
  const gap = Math.abs(staffLvl - serviceLvl);
  if (gap >= 3) {
    if (staffLvl < serviceLvl) {
      dissonanceBrandPenalty = -3;
      dissonanceLoyaltyPenalty = -2;
      notes.push(`Service dissonance: Staff (${staffLvl}) << Service (${serviceLvl}) — passengers notice mismatch. −3 Brand, −2% Loyalty.`);
    } else {
      dissonanceBrandPenalty = -2;
      dissonanceLoyaltyPenalty = -1;
      notes.push(`Service dissonance: Service (${serviceLvl}) << Staff (${staffLvl}) — great crew, underwhelming offering. −2 Brand, −1% Loyalty.`);
    }
  }

  const newBrandPts = Math.max(0, next.brandPts + brandDelta + dissonanceBrandPenalty);
  const newOpsPts = Math.max(0, next.opsPts + opsDelta);
  // Loyalty drifts toward 50 slightly, plus slider delta
  const drift = (50 - next.customerLoyaltyPct) * 0.03;
  const newLoyalty = clamp(
    0, 100, next.customerLoyaltyPct + loyaltyDelta + drift + dissonanceLoyaltyPenalty,
  );

  // Update team state for Brand Value calc
  next.cashUsd = newCashUsd;
  next.brandPts = newBrandPts;
  next.opsPts = newOpsPts;
  next.customerLoyaltyPct = newLoyalty;

  // ─ Milestone Cards (PRD E8.9) ──────────────────────────
  const milestonesEarned = new Set(next.milestones ?? []);
  let milestoneBrand = 0;
  let milestoneOps = 0;
  let milestoneLoyalty = 0;
  const activeRoutes = next.routes.filter((r) => r.status === "active");

  function earn(id: string, ops: number, brand: number, loyalty: number) {
    if (!milestonesEarned.has(id)) {
      milestonesEarned.add(id);
      milestoneOps += ops;
      milestoneBrand += brand;
      milestoneLoyalty += loyalty;
      notes.push(`Milestone: ${id}`);
    }
  }

  if (activeRoutes.some((r) => r.isCargo))
    earn("First Cargo Route", 5, 0, 0);
  if (activeRoutes.length >= 10)
    earn("10 Active Routes", 0, 5, 2);
  if (activeFleet.some((f) => (AIRCRAFT_BY_ID[f.specId]?.seats.first ?? 0) > 0))
    earn("First Class Service Active", 0, 3, 0);
  if (activeFleet.length >= 10)
    earn("Fleet of 10", 5, 0, 0);
  const continents = new Set(activeRoutes.flatMap((r) => [
    CITIES_BY_CODE[r.originCode]?.region, CITIES_BY_CODE[r.destCode]?.region,
  ].filter(Boolean)));
  if (continents.size >= 3)
    earn("International Network", 0, 8, 0);

  // Eco Pioneer: at least half the active fleet on eco engines
  const ecoCount = activeFleet.filter((f) => f.ecoUpgrade).length;
  if (activeFleet.length >= 4 && ecoCount * 2 >= activeFleet.length)
    earn("Eco Pioneer", 0, 3, 2);

  // Profitability streak (uses the running counter we update right below)
  const willCount = (next.consecutiveProfitableQuarters ?? 0) + (netProfit > 0 ? 1 : 0);
  if (netProfit > 0 && willCount >= 4)
    earn("Profit Streak", 0, 5, 3);

  // Network Builder: 25+ active routes
  if (activeRoutes.length >= 25)
    earn("Network Builder", 0, 5, 5);

  // Premium Pioneer: 5+ routes at ultra tier
  if (activeRoutes.filter((r) => r.pricingTier === "ultra").length >= 5)
    earn("Premium Pioneer", 0, 8, 3);

  // Loyal Following: 80%+ loyalty (check post-deltas)
  if (next.customerLoyaltyPct >= 80)
    earn("Loyal Following", 0, 5, 0);

  // Hub & Spoke: 3+ secondary hubs
  if ((next.secondaryHubCodes?.length ?? 0) >= 3)
    earn("Hub & Spoke", 10, 5, 0);

  next.milestones = Array.from(milestonesEarned);
  next.brandPts = Math.max(0, next.brandPts + milestoneBrand);
  next.opsPts = Math.max(0, next.opsPts + milestoneOps);
  next.customerLoyaltyPct = clamp(0, 100, next.customerLoyaltyPct + milestoneLoyalty);

  // Now that brand/ops/loyalty are settled, check the brand-rating milestone
  // (it depends on the post-milestone-bonus values).
  if (brandRating(next).grade === "A+" && !next.milestones.includes("Brand A+")) {
    next.milestones = [...next.milestones, "Brand A+"];
    next.opsPts += 5;
    next.customerLoyaltyPct = clamp(0, 100, next.customerLoyaltyPct + 5);
    notes.push("Milestone: Brand A+");
  }

  // Update profitability streak counter for next quarter's check
  next.consecutiveProfitableQuarters = netProfit > 0
    ? (next.consecutiveProfitableQuarters ?? 0) + 1
    : 0;

  // Fleet uniformity ops bonus (PRD E8.2)
  if (next.flags.has("fleet_uniformity")) {
    next.opsPts = Math.max(0, next.opsPts + 3);
  }

  // Labour Relations Score accumulation (PRD E8.3)
  const lrsDeltaByStaff: Record<number, number> = {
    0: -3, 1: -1, 2: 0, 3: 1, 4: 2, 5: 3,
  };
  const lrsDelta = lrsDeltaByStaff[next.sliders.staff] ?? 0;
  // Flags that affect LRS directly
  if (next.flags.has("people_first")) next.labourRelationsScore += 2;
  if (next.flags.has("trusted_employer")) next.labourRelationsScore += 2;
  if (next.flags.has("talent_shortage")) next.labourRelationsScore -= 3;
  next.labourRelationsScore = clamp(0, 100, next.labourRelationsScore + lrsDelta);
  // High LRS → +3 Loyalty/Q bonus (E8.3)
  if (next.labourRelationsScore >= 75) {
    next.customerLoyaltyPct = clamp(0, 100, next.customerLoyaltyPct + 3);
    notes.push(`High Labour Relations (${next.labourRelationsScore.toFixed(0)}): +3% Loyalty this quarter`);
  } else if (next.labourRelationsScore <= 30) {
    notes.push(`Low Labour Relations (${next.labourRelationsScore.toFixed(0)}): labour scenarios will hit harder`);
  }

  // PRD E8.3 — Crew strike risk. Probabilistic disruption when labour
  // relations crater. Pay-below-market amplifies the chance.
  const lrs = next.labourRelationsScore;
  const isPaidBelow = next.sliders.staff <= 1;
  let strikeChance = 0;
  if (lrs <= 15) strikeChance = isPaidBelow ? 0.55 : 0.35;
  else if (lrs <= 30) strikeChance = isPaidBelow ? 0.30 : 0.15;
  else if (lrs <= 45 && isPaidBelow) strikeChance = 0.10;

  // Deterministic-ish RNG so a given quarter+team yields a stable outcome
  // (avoids flickering during dev hot-reload).
  const seed = (ctx.quarter * 9301 + lrs * 49297) % 233280;
  const roll = (seed / 233280);
  if (strikeChance > 0 && roll < strikeChance) {
    // Strike: 1 quarter of disrupted ops applied retroactively
    const severity = lrs <= 15 ? "major" : "wildcat";
    const revenuePenalty = severity === "major" ? 0.12 : 0.06;
    const lostRevenue = revenue * revenuePenalty;
    revenue -= lostRevenue;
    netProfit -= lostRevenue;
    newCashUsd -= lostRevenue * 0.7;  // already booked partly via tax
    next.cashUsd = newCashUsd;        // re-commit after late penalty
    next.brandPts = Math.max(0, next.brandPts - (severity === "major" ? 5 : 3));
    next.customerLoyaltyPct = clamp(0, 100, next.customerLoyaltyPct - (severity === "major" ? 6 : 3));
    next.labourRelationsScore = clamp(0, 100, next.labourRelationsScore - 5);
    notes.push(
      `⚠ Crew ${severity === "major" ? "general strike" : "wildcat action"}: ` +
      `−${(revenuePenalty * 100).toFixed(0)}% revenue, brand and loyalty hit. ` +
      `Raise the salary slider and address grievances.`,
    );
  }

  const newBrandValue = computeBrandValue(next);

  notes.push(`Revenue: $${(revenue / 1e6).toFixed(1)}M across ${routeBreakdown.length} routes`);
  notes.push(`Fuel index ${ctx.fuelIndex} → ${(fuelCost / 1e6).toFixed(1)}M fuel cost`);
  if (tax > 0) notes.push(`Corporate tax: ${(tax / 1e6).toFixed(1)}M`);
  if (carbonLevy > 0) notes.push(`Carbon levy: ${(carbonLevy / 1e6).toFixed(1)}M`);
  if (interest > 0) notes.push(`Debt interest: $${(interest / 1e6).toFixed(1)}M`);

  // ─ News impact summary for the digest ──────────────────
  // Find each news item this quarter, then for each, list the cities on the
  // player's network that the item references with a non-zero impact %.
  const networkCodes = new Set<string>([
    next.hubCode,
    ...next.secondaryHubCodes,
    ...next.routes.flatMap((r) => [r.originCode, r.destCode]),
  ]);
  const newsThisQuarter = NEWS_BY_QUARTER[ctx.quarter] ?? [];
  const OUTLETS = ["Sky News", "Bloomberg", "Reuters", "FT", "The Air Reporter", "AP", "BBC World", "WSJ", "Al Arabiya", "Nikkei Asia"];
  const outletForId = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return OUTLETS[Math.abs(h) % OUTLETS.length];
  };
  const newsImpacts: QuarterCloseResult["newsImpacts"] = [];
  for (const n of newsThisQuarter) {
    const cities: { code: string; name: string; pct: number }[] = [];
    for (const code of networkCodes) {
      const impact = cityEventImpact(code, ctx.quarter);
      if (impact.pct === 0) continue;
      if (!impact.items.some((it) => it.id === n.id)) continue;
      const city = CITIES_BY_CODE[code];
      if (!city) continue;
      cities.push({ code, name: city.name, pct: impact.pct });
    }
    if (cities.length > 0) {
      newsImpacts.push({
        headline: n.headline,
        outlet: outletForId(n.id),
        quarter: n.quarter,
        cities: cities.slice(0, 5),
      });
    }
  }

  // Milestones earned strictly during this quarter close
  const milestonesEarnedThisQuarter = (next.milestones ?? []).filter(
    (m) => !milestonesBefore.has(m),
  );

  return {
    quarter: ctx.quarter,
    revenue,
    passengerRevenue,
    cargoRevenue,
    fuelCost,
    slotCost,
    staffCost,
    otherSliderCost,
    maintenanceCost,
    insuranceCost: insurancePremium,
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
    prevCashUsd,
    prevBrandPts,
    prevOpsPts,
    prevLoyalty,
    prevBrandValue,
    milestonesEarnedThisQuarter,
    newsImpacts,
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
      const seats = f.customSeats ?? spec.seats;
      return sum + seats.first + seats.business + seats.economy;
    }, 0);
}

export function fleetCount(fleet: FleetAircraft[]): number {
  return fleet.filter((f) => f.status === "active").length;
}
