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
import { SCENARIOS, type OptionEffect, type ScaledCashEffect, type Scenario } from "@/data/scenarios";
import { SUBSIDIARY_BY_TYPE as SUBSIDIARY_CATALOG_BY_TYPE } from "@/data/subsidiaries";
import { NEWS_BY_QUARTER, newsForQuarter } from "@/data/world-news";
import { cityEventImpact, newsItemImpactForCity } from "./city-events";
import { cargoBellyTonnes } from "./aircraft-upgrades";
import {
  activeBusinessDemandMultiplier,
  activeLoadFactorFloor,
  isStaffCostWaived,
  isTaxWaived,
  violatesMandatoryDomesticRoute,
} from "./underdog-boosts";
import type {
  AirportSlotState,
  City,
  DeferredEvent,
  FleetAircraft,
  PricingTier,
  Route,
  SliderLevel,
  Sliders,
  Team,
  CargoBellyTier,
  DoctrineId,
  FuelTankTier,
} from "@/types/game";
import {
  SUBSIDIARY_TIER_REV_MULT,
  SUBSIDIARY_TIER_OPS_MULT,
  SUBSIDIARY_DEMAND_BONUS_PER_ENDPOINT,
} from "@/types/game";
import {
  teamHubs,
  segmentGetsConnectingMultiplier,
} from "@/lib/airport-system-v2";
import { computeOwnedAirportRevenue } from "@/lib/airport-auction-runtime";

const M = 1_000_000;

/** Subsidiary route-revenue bonus. For every demand-side subsidiary
 *  the team owns at the route's origin or destination city, add the
 *  tier- and condition-scaled bonus. Stacks across subsidiaries —
 *  flagship hotel + lounge + limo at both endpoints creates a real
 *  competitive moat vs a rival flying the same OD without any
 *  city-side investment. Bonus is capped at +25% so a player who
 *  stacks 6+ flagships on one OD can't run away with the model. */
function subsidiaryDemandMultiplier(team: Team, route: Route): number {
  const subs = team.subsidiaries ?? [];
  if (subs.length === 0) return 1.0;
  let bonus = 0;
  for (const sub of subs) {
    if (sub.cityCode !== route.originCode && sub.cityCode !== route.destCode) continue;
    const perType = SUBSIDIARY_DEMAND_BONUS_PER_ENDPOINT[sub.type] ?? 0;
    if (perType === 0) continue;
    const tierMult = SUBSIDIARY_TIER_OPS_MULT[sub.tier ?? "basic"] ?? 1.0;
    bonus += perType * tierMult * sub.conditionPct;
  }
  return 1.0 + Math.min(0.25, bonus);
}

type ActiveDoctrineId = Exclude<DoctrineId, "safety-first">;

function activeDoctrineId(doctrine: DoctrineId | undefined): ActiveDoctrineId | null {
  if (!doctrine) return null;
  return doctrine === "safety-first" ? "global-network" : doctrine;
}

function isDoctrine(team: { doctrine?: DoctrineId }, doctrine: ActiveDoctrineId): boolean {
  return activeDoctrineId(team.doctrine) === doctrine;
}

/** Real-world Jet A1 sits in the $0.55–$0.85 / L range over the
 *  campaign's 2015–2024 window. The simulator uses $0.85/L at
 *  fuelIndex=100 (baseline) — the upper end of the band, which keeps
 *  fuel as a meaningful cost category against payroll & maintenance.
 *  Earlier the passenger path was at $0.18/L while the cargo path was
 *  at $0.55/L — passenger fuel landed ~3× too cheap, which is why a
 *  16-widebody fleet showed only $22.5M in fuel against $1.7B revenue.
 *  Both paths now share this constant. */
/** Undiscounted spot price for Jet A-1 at the airport ramp. This is
 *  the WHOLESALE-INTO-PLANE price an airline pays at retail (no
 *  hedging, no bulk-buy discount). Industry context:
 *    - IATA monthly Jet A-1 average (2022-25): $0.70-$1.05/L
 *    - Heathrow into-plane (post-handling fee): ~$0.90/L
 *    - $0.85 sits in the middle of the realistic band.
 *  Players REDUCE this via:
 *    - per-city fuel tanks: coverage-based discount (up to the tier max,
 *      8/12/15%) on every route departing a city with installed tanks —
 *      see FUEL_TANK_SPECS / cityFuelDiscounts
 *    - hedging flags: 100/fuelIndex multiplier
 *  So this constant is the UPPER bound; the engine consumes at this
 *  price minus any active discount stack.
 */
export const FUEL_BASELINE_USD_PER_L = 0.85;

/** Real-world fuel-burn calibration factor. The aircraft catalogue
 *  in `src/data/aircraft.ts` lists `fuelBurnPerKm` values that came
 *  from a mix of cruise-only sources; they sit well below real-world
 *  BLOCK-FUEL numbers (block fuel includes taxi, climb, descent,
 *  hold, and inefficient ATC routings — inflates L/km by 50-80% over
 *  cruise depending on stage length and congestion).
 *
 *  Workshop feedback iteration (May 2026):
 *  Round 1 (factor 1.6): fuel ~8% of cost — still too low. User flagged
 *     "8% on fuel is still very low... considering this is not
 *      discounted wholesale fuel."
 *  Round 2 (factor 2.5): fuel ~13-15% of cost — closer to the
 *     20-25% industry share US-domestic carriers report.
 *
 *  Going much higher (3.0+) would make narrowbody burn implausible
 *  even with the block-fuel pad (e.g. a 737 cruise spec of 3.0 L/km
 *  × 3.0 = 9 L/km which is widebody territory). Stops at 2.5 to keep
 *  per-aircraft numbers in a defensible range; the remaining gap to
 *  pure industry % is closed by trimming non-fuel costs (slot, hub).
 */
export const FUEL_BURN_REAL_WORLD_FACTOR = 2.5;

/** Per-city fuel tank infrastructure spec (redesign 2026-05).
 *
 *  The player installs tanks PER CITY they operate in: pick a tier
 *  (small/medium/large) and a count (1..10). Each tank carries a fixed
 *  quarterly fuel COVERAGE capacity (litres). The discount applied to
 *  every route departing that city is:
 *
 *    coverage = min(1, totalCityCapacityL / cityQuarterlyBurnL)
 *    discount = tierMaxDiscount × coverage
 *
 *  Recomputed every quarter against ACTUAL burn — tanks never deplete,
 *  there is no litre inventory and no spot-market timing game. Building
 *  out coverage as a city's network grows keeps the discount near max.
 *
 *  Sizing rationale: a narrowbody (~3.0 L/km cruise) on a 1,500 km route
 *  at 3 daily flights burns 3.0 × 2.5 × 1500 × 3 × 91 ≈ 3.07M L/quarter,
 *  so an early-game city with 2-4 routes burns ~6-12M L/qtr. Per-tank
 *  capacities are therefore single-digit millions so the 1..10 count
 *  scales meaningfully. Tunable after play-test. */
export const FUEL_TANK_SPECS: Record<
  FuelTankTier,
  {
    capacityL: number;      // quarterly coverage litres per tank
    maxDiscount: number;    // max fuel discount fraction at full coverage
    installUsd: number;     // one-time install cost per tank
    maintUsd: number;       // quarterly maintenance cost per tank
    tier1Only: boolean;     // installable only at Tier-1 airports
    label: string;
  }
> = {
  small:  { capacityL: 2_000_000,  maxDiscount: 0.08, installUsd: 1_500_000, maintUsd: 120_000, tier1Only: false, label: "Small" },
  medium: { capacityL: 5_000_000,  maxDiscount: 0.12, installUsd: 4_000_000, maintUsd: 300_000, tier1Only: false, label: "Medium" },
  large:  { capacityL: 10_000_000, maxDiscount: 0.15, installUsd: 8_000_000, maintUsd: 550_000, tier1Only: true,  label: "Large" },
};

/** Maximum tank count per city. */
export const FUEL_TANK_MAX_COUNT = 10;

/** Discontinued-type maintenance escalation (master ref Update 5).
 *  Once an aircraft type passes its `cutoffRound`, every still-flying
 *  example gets a maintenance penalty that climbs in 4-round brackets
 *  before flatlining at +15%:
 *    rounds  1- 4 after cutoff: +5%   (parts pipeline still warm)
 *    rounds  5- 8:               +7.5%
 *    rounds  9-12:               +10%
 *    rounds 13+:                 +15% (parts scarce, permanent)
 *  Eco-upgraded aircraft get the rate halved (modernisation hedge).
 *
 *  Returns a multiplier (1.0 = no escalation) so callers can stack it
 *  with the existing age-band base percentage and ops-points discount.
 */
export function discontinuedMaintenanceMultiplier(
  spec: { cutoffRound?: number } | undefined,
  currentQuarter: number,
  ecoUpgraded: boolean,
  campaignMode: "half" | "full" = "half",
): number {
  if (!spec || typeof spec.cutoffRound !== "number") return 1.0;
  // Full campaigns (2000 start) run on a +60-quarter offset vs the
  // half-campaign timeline the cutoffRounds were calibrated against, so
  // the parts-decline penalty must shift with it — otherwise an
  // in-production type gets penalised 15 years early.
  const cutoff = spec.cutoffRound + (campaignMode === "full" ? 60 : 0);
  const roundsSince = currentQuarter - cutoff;
  if (roundsSince <= 0) return 1.0;
  const fullRate =
    roundsSince <= 4  ? 0.05  :
    roundsSince <= 8  ? 0.075 :
    roundsSince <= 12 ? 0.10  :
                        0.15;
  const rate = ecoUpgraded ? fullRate / 2 : fullRate;
  return 1 + rate;
}

/** Bracket label for the FleetPanel badge (so the player sees WHY a
 *  given aircraft's maintenance jumped). Returns null when the spec
 *  isn't currently in escalation. */
export function discontinuedMaintenanceBracket(
  spec: { cutoffRound?: number } | undefined,
  currentQuarter: number,
  campaignMode: "half" | "full" = "half",
): { roundsSince: number; bracketLabel: string; pct: number; isMax: boolean } | null {
  if (!spec || typeof spec.cutoffRound !== "number") return null;
  const cutoff = spec.cutoffRound + (campaignMode === "full" ? 60 : 0);
  const roundsSince = currentQuarter - cutoff;
  if (roundsSince <= 0) return null;
  // Phase 2 (P1-8) — labels used to say "1 of 3", "2 of 3", "3 of 3"
  // and then mysteriously jumped to a +15% flatline with no label.
  // There are actually 4 brackets (+5% → +7.5% → +10% → max +15%).
  // Relabelled "Bracket 1/2/3 · Max +15%" so the player sees the
  // escalation ladder honestly.
  if (roundsSince <= 4) return { roundsSince, bracketLabel: "Bracket 1 · +5%", pct: 5, isMax: false };
  if (roundsSince <= 8) return { roundsSince, bracketLabel: "Bracket 2 · +7.5%", pct: 7.5, isMax: false };
  if (roundsSince <= 12) return { roundsSince, bracketLabel: "Bracket 3 · +10%", pct: 10, isMax: false };
  return { roundsSince, bracketLabel: "Max · +15%", pct: 15, isMax: true };
}

// ─── Global Travel Index (PRD E6) — master demand multiplier ──
/**
 * Per-quarter macro demand multiplier. TRAVEL_INDEX covers the 60-quarter
 * half campaign (Q1 2015 – Q4 2029); the full campaign uses
 * TRAVEL_INDEX_FULL_CAMPAIGN_2000 for R1-R60 (2000-2014) and reuses this
 * table shifted +60 for R61-R120 (2015-2029).
 */
/** Per-city event multiplier floor used by the passenger demand path.
 *  Even the worst stacked news shocks leave demand at 15% of baseline.
 *  Real-world calibration: peak COVID hit ~5-8% of normal pax volumes,
 *  but the sim can't model freighter conversions or cargo-by-belly
 *  proxy demand, so we sit a touch higher. */
export const DEMAND_FLOOR_PASSENGER = 0.15;

/** Cargo demand floor — freight is more shock-resilient than passenger
 *  travel (parts pipelines, medical supply, e-commerce orders all keep
 *  flowing even when passenger travel craters). */
export const DEMAND_FLOOR_CARGO = 0.25;

/** Global travel index floor. Catastrophic global pulses (full COVID
 *  lockdown set travelIndex: 18) still leave the global multiplier at
 *  20% so a stacked compound floor is ~3% of baseline. */
export const TRAVEL_INDEX_FLOOR = 0.20;

export const TRAVEL_INDEX: Record<number, number> = {
  1: 100, 2: 100,   // PRD Q1 — Market open. Baseline.
  3: 103, 4: 103,   // PRD Q2 — World Cup announced.
  5: 98,  6: 98,    // PRD Q3 — Fuel spike dampens.
  7: 106, 8: 106,   // PRD Q4 — Stabilising. Tech conference.
  9: 93,  10: 93,   // PRD Q5 — Moscow Signal panic.
  11: 118, 12: 118, // PRD Q6 — False alarm; pent-up summer.
  13: 112, 14: 112, // PRD Q7 — Olympics; war corridor unease.
  15: 89, 16: 89,   // PRD Q8 — War escalates.
  17: 104, 18: 104, // PRD Q9 — Recovery confirmed.
  19: 128, 20: 128, // PRD Q10 — World Cup peak.
  21: 97, 22: 97,   // PRD Q11 — Conflict; rate hikes.
  23: 91, 24: 91,   // PRD Q12 — Recession risk rising.
  25: 72, 26: 72,   // PRD Q13 — Recession declared.
  27: 76, 28: 76,   // PRD Q14 — Recession persists.
  29: 90, 30: 90,   // PRD Q15 — Olympics drives spike.
  31: 110, 32: 110, // PRD Q16 — Recession over.
  33: 105, 34: 105, // PRD Q17 — Carbon levy uncertainty.
  35: 122, 36: 122, // PRD Q18 — Full recovery; Dubai Expo.
  37: 126, 38: 126, // PRD Q19 — New trade corridors.
  39: 130, 40: 130, // PRD Q20 — Peak global aviation era.

  // ─── R41-R60 · Q1 2025 – Q4 2029 · Brief §9 extension ───
  41: 128, 42: 125, 43: 130, 44: 122, 45: 120,
  46: 135, 47: 140, 48: 125, 49: 115, 50: 118,
  51: 122, 52: 120, 53: 118, 54: 125, 55: 135,
  56: 128, 57: 120, 58: 138, 59: 132, 60: 128,
};

/**
 * Full-campaign Travel Index for R1-R60 (Q1 2000 – Q4 2014).
 * Brief Section 6. Used when `session.campaignMode === "full"`. For
 * R61-R120 the full campaign reuses the half-campaign TRAVEL_INDEX
 * values shifted by +60 (so R61 of the full campaign = R1 of the half
 * campaign).
 */
export const TRAVEL_INDEX_FULL_CAMPAIGN_2000: Record<number, number> = {
  1: 100,   // Q1 2000 — Dot-com peak. Baseline.
  2: 108,   // Q2 2000 — Sydney build, Euros 2000.
  3: 104,   // Q3 2000 — Dot-com correction signals.
  4: 96,    // Q4 2000 — Dot-com crash confirmed.
  5: 90,    // Q1 2001 — Recession fears.
  6: 88,    // Q2 2001 — Stagflation signals.
  7: 58,    // Q3 2001 — 9/11. Demand collapse.
  8: 65,    // Q4 2001 — Partial recovery.
  9: 72,    // Q1 2002 — Recovery, Salt Lake City Olympics.
  10: 95,   // Q2 2002 — World Cup Korea/Japan.
  11: 100,  // Q3 2002 — Post-WC normal.
  12: 98,   // Q4 2002 — Iraq war fears.
  13: 70,   // Q1 2003 — SARS outbreak.
  14: 75,   // Q2 2003 — SARS recovery.
  15: 88,   // Q3 2003 — Full SARS recovery, Athens build.
  16: 95,   // Q4 2003 — EU expansion.
  17: 100,  // Q1 2004 — Strong recovery.
  18: 108,  // Q2 2004 — Euro 2004 Portugal.
  19: 118,  // Q3 2004 — Athens 2004 peak.
  20: 110,  // Q4 2004 — Post-Olympics normality.
  21: 108,  // Q1 2005 — Steady growth.
  22: 112,  // Q2 2005 — M&A supercycle.
  23: 115,  // Q3 2005 — Katrina fuel spike.
  24: 118,  // Q4 2005 — Recovery, WC Germany build.
  25: 120,  // Q1 2006 — Turin Winter Olympics.
  26: 128,  // Q2 2006 — WC Germany peak.
  27: 122,  // Q3 2006 — Post-WC normality.
  28: 118,  // Q4 2006 — Stable boom.
  29: 115,  // Q1 2007 — Sub-prime signals.
  30: 118,  // Q2 2007 — Beijing build.
  31: 122,  // Q3 2007 — Euros 2008 preview.
  32: 116,  // Q4 2007 — Sub-prime crisis.
  33: 118,  // Q1 2008 — Beijing 6mo out.
  34: 128,  // Q2 2008 — Euros 2008 peak.
  35: 125,  // Q3 2008 — Beijing peak; crisis hits.
  36: 72,   // Q4 2008 — Lehman.
  37: 68,   // Q1 2009 — Crisis deepens.
  38: 72,   // Q2 2009 — Green shoots.
  39: 80,   // Q3 2009 — Vancouver build.
  40: 85,   // Q4 2009 — Recovery accelerating.
  41: 92,   // Q1 2010 — Vancouver Olympics.
  42: 105,  // Q2 2010 — World Cup South Africa.
  43: 110,  // Q3 2010 — Post-WC.
  44: 108,  // Q4 2010 — Stable.
  45: 100,  // Q1 2011 — Arab Spring + Japan quake.
  46: 102,  // Q2 2011 — Recovery, London build.
  47: 105,  // Q3 2011 — London build, Euros 2012 preview.
  48: 102,  // Q4 2011 — Eurozone stress.
  49: 108,  // Q1 2012 — London 6mo.
  50: 118,  // Q2 2012 — London 2012 peak.
  51: 110,  // Q3 2012 — Post-Olympics UK uplift.
  52: 106,  // Q4 2012 — Eurozone double-dip looming.
  53: 88,   // Q1 2013 — Double-dip declared.
  54: 82,   // Q2 2013 — Trough.
  55: 88,   // Q3 2013 — Sochi build.
  56: 90,   // Q4 2013 — Recession ending.
  57: 95,   // Q1 2014 — Sochi 2014.
  58: 108,  // Q2 2014 — WC Brazil opens.
  59: 115,  // Q3 2014 — Post-WC.
  60: 118,  // Q4 2014 — Stable strong growth, transitions to half-campaign R1.
};

/** Base commercial-debt interest rate over the 60-quarter half campaign,
 *  aligned with the same world-events arc that drives TRAVEL_INDEX.
 *  Earlier the rate was hardcoded at 3.5% and never moved — players
 *  flagged it as broken. The schedule below mirrors a realistic 2015–
 *  2024 macro cycle:
 *
 *    2015–2016 ZIRP era → 3.0–3.5% (cheap debt)
 *    2017 stabilising  → 3.5–4.0%
 *    2018 hawkish turn → 4.5–5.0%
 *    2019 dovish pivot → 4.0% (S6 Rate Window)
 *    2020 COVID cuts   → 1.5–2.5%
 *    2021 recovery     → 3.0%
 *    2022 inflation    → 5.5–7.0% (rapid hikes)
 *    2023 peak         → 7.0–7.5%
 *    2024 plateau      → 7.0%
 */
export const BASE_RATE_BY_QUARTER: Record<number, number> = {
  // Aviation-corporate spreads typically run +200–400bps over central
  // bank rates. The schedule here is the BORROWING rate the player
  // pays — already includes the airline-credit premium so debt
  // genuinely bites. $180M debt × 7%/yr ÷ 4 = $3.15M/Q interest, vs
  // the previous flat 3.5% which gave $1.575M/Q on the same debt.
  1: 5.5,  2: 5.5,   // Q1–Q2 2015 — campaign baseline
  3: 5.0,  4: 5.0,   // Q3–Q4 2015 — fuel-shock-driven easing
  5: 5.5,  6: 5.5,   // Q1–Q2 2016 — stabilising
  7: 6.0,  8: 6.0,   // Q3–Q4 2016 — tech-driven optimism, normalisation
  9: 6.5,  10: 7.0,  // Q1–Q2 2017 — geopolitical-risk premium
  11: 7.0, 12: 7.0,  // Q3–Q4 2017 — central banks tightening
  13: 7.5, 14: 7.5,  // Q1–Q2 2018 — hawkish turn (trade war risk-on)
  15: 7.5, 16: 7.0,  // Q3–Q4 2018 — first signs of cooling
  17: 6.5, 18: 6.5,  // Q1–Q2 2019 — S6 Rate Window dovish pivot
  19: 6.5, 20: 6.5,  // Q3–Q4 2019 — last pre-pandemic months
  21: 4.5, 22: 3.5,  // Q1–Q2 2020 — emergency COVID cuts
  23: 3.5, 24: 3.5,  // Q3–Q4 2020 — sustained low
  25: 4.0, 26: 4.5,  // Q1–Q2 2021 — early recovery
  27: 5.0, 28: 5.5,  // Q3–Q4 2021 — recovery confirmed
  29: 7.0, 30: 8.0,  // Q1–Q2 2022 — inflation surprise; rapid hikes
  31: 9.0, 32: 9.5,  // Q3–Q4 2022 — aggressive tightening
  33: 10.0, 34: 10.0, // Q1–Q2 2023 — peak rates, recession fears
  35: 10.5, 36: 10.5, // Q3–Q4 2023 — held high
  37: 9.5,  38: 9.5,  // Q1–Q2 2024 — early easing signals
  39: 9.0,  40: 9.0,  // Q3–Q4 2024 — plateau into endgame

  // ─── R41-R60 · Q1 2025 – Q4 2029 — Brief §9 extension ───
  // Macro narrative: 2025 modest easing as inflation normalises,
  // mid-cycle slowdown at R49, then steady through the LA 2028
  // Olympics into 2029 stable expansion.
  41: 8.5,  42: 8.0,  // 2025 — gradual easing
  43: 7.5,  44: 7.5,
  45: 7.0,  46: 6.5,  // 2026 — easing through World Cup
  47: 6.5,  48: 6.5,
  49: 7.0,  50: 7.0,  // 2027 — mid-cycle slowdown re-tightens
  51: 6.5,  52: 6.5,
  53: 6.0,  54: 6.0,  // 2028 — pre-Olympics monetary support
  55: 6.0,  56: 6.0,
  57: 5.5,  58: 5.5,  // 2029 — stable plateau into endgame
  59: 5.5,  60: 5.5,
};

/** Effective base rate at a given quarter — schedule lookup with a
 *  fallback chain (exact → previous quarter → 3.5% baseline).
 *
 *  In full-campaign mode the back half (R61-R120 = 2015-2029) reuses the
 *  authored 2015-2029 schedule via a -60 offset, mirroring
 *  effectiveTravelIndex. The front half (R1-R60 = 2000-2014) has no
 *  dedicated rate table yet, so it falls through the walk-back to the
 *  baseline — a safe placeholder until the early-era macro table lands. */
export function effectiveBaseRatePct(
  quarter: number,
  campaignMode: "half" | "full" = "half",
): number {
  const q = campaignMode === "full" && quarter > 60 ? quarter - 60 : quarter;
  if (q in BASE_RATE_BY_QUARTER) return BASE_RATE_BY_QUARTER[q];
  // Walk back to the most recent defined quarter so the chart stays
  // monotonic past the schedule's boundaries.
  for (let p = q - 1; p >= 1; p--) {
    if (p in BASE_RATE_BY_QUARTER) return BASE_RATE_BY_QUARTER[p];
  }
  return 3.5;
}

/** Seasonal multipliers (PRD D5) indexed by quarter-within-game-year.
 *
 *  Amplitude rebalanced: real airline seasonality runs 25-35% peak-to-
 *  trough at the network level; previous values gave only ~15% so player
 *  reports of "revenue too steady" were correct. Q3 tourism now spikes
 *  to 1.32 and Q1 tourism dips to 0.74 — half the spread comes from
 *  travelers, the other half from the global Travel Index curve. Cargo
 *  now has its own seasonality (Q4 holiday peak dominates; Q1 post-
 *  holiday slump) — previously cargo was treated as flat year-round
 *  which was technically wrong (Black Friday/December peak is the
 *  biggest single signal in air freight).
 */
export function seasonalMultiplier(
  quarter: number,
): { tourism: number; business: number; cargo: number } {
  const qInYear = ((quarter - 1) % 4) + 1;
  // Q1 winter post-holiday slump
  // Q2 spring/early-summer pickup
  // Q3 peak-summer travel, business slows (vacation)
  // Q4 holiday + return-to-office + freight peak
  if (qInYear === 1) return { tourism: 0.74, business: 1.06, cargo: 0.90 };
  if (qInYear === 2) return { tourism: 1.12, business: 1.02, cargo: 0.96 };
  if (qInYear === 3) return { tourism: 1.32, business: 0.85, cargo: 1.00 };
  return { tourism: 1.05, business: 1.07, cargo: 1.18 };
}

// ─── Physics-based flight frequency (PRD D1/F2) ────────────
/** Aircraft cruise speed in km/h by id prefix. Engine retrofit "power"
 *  / "super" boosts cruise speed by 10%. */
export function cruiseSpeedKmh(
  specId: string,
  engineUpgrade?: "fuel" | "power" | "super" | null,
): number {
  let base: number;
  // Boom Overture supersonic (Brief §10). Mach 1.7 at altitude ≈
  // 1,800 km/h. Round-trip therefore halves vs a subsonic widebody
  // on the same OD pair, doubling max rotations — exactly the
  // "2× daily rotations" the brief specifies.
  if (specId === "BoomO") base = 1800;
  else if (/^A319|^A320|^A321|^B737/.test(specId)) base = 840;
  else if (/^B757|^B767|^A330/.test(specId)) base = 870;
  else base = 900; // wide-body large: 777, 747, A380, 787, A350
  if (engineUpgrade === "power" || engineUpgrade === "super") {
    base = Math.round(base * 1.1);
  }
  return base;
}

/** Ground turnaround time at one endpoint. Regional/narrow-body aircraft
 *  can be turned faster than wide/heavy aircraft. Passenger aircraft with
 *  cargo belly loading need an extra hour on the ground at each end. */
export function groundTurnaroundHours(
  specId: string,
  cargoBelly?: CargoBellyTier,
  doctrine?: DoctrineId,
): number {
  const spec = AIRCRAFT_BY_ID[specId];
  const seats = spec
    ? spec.seats.first + spec.seats.business + spec.seats.economy
    : 0;
  const activeDoctrine = activeDoctrineId(doctrine);
  if (activeDoctrine === "cargo-dominance" && spec?.family === "cargo") {
    return 2;
  }
  const isWideOrHeavy =
    (spec?.family === "cargo" && (spec.cargoTonnes ?? 0) >= 45) ||
    seats >= 240 ||
    /^A330|^A340|^A350|^A380|^B747|^B767|^B777|^B787|^IL-96|^MD-11/.test(specId);
  const bellyPenalty =
    activeDoctrine === "cargo-dominance" ? 0 :
    cargoBelly && cargoBelly !== "none" ? 1 : 0;
  const base = (isWideOrHeavy ? 4 : 3) + bellyPenalty;
  return activeDoctrine === "budget-expansion" ? base * 0.5 : base;
}

/** Effective range after retrofits. The "fuel" and "super" engines
 *  ship a 10% range extension on top of the spec's published range —
 *  that bonus is now actually applied here so the route-distance
 *  check honours what the upgrade card promised. Without this helper
 *  the +10% range was dead text. */
export function effectiveRangeKm(
  spec: { rangeKm: number },
  engineUpgrade?: "fuel" | "power" | "super" | null,
): number {
  if (engineUpgrade === "fuel" || engineUpgrade === "super") {
    return Math.round(spec.rangeKm * 1.1);
  }
  return spec.rangeKm;
}

/** Effective fuel burn after retrofits. "fuel" / "super" engine = ×0.9
 *  (−10% burn). Anti-drag fuselage coating = ×0.9 (−10% burn). The two
 *  stack multiplicatively (×0.81 combined = −19% burn).
 *
 *  Applies the real-world block-fuel factor at the leaf so all
 *  callers (route forecasts, fleet detail, savings calculators) see
 *  the same number the quarter-close engine uses. */
export function effectiveFuelBurnPerKm(
  spec: { fuelBurnPerKm: number },
  engineUpgrade?: "fuel" | "power" | "super" | null,
  fuselageUpgrade?: boolean,
): number {
  let burn = spec.fuelBurnPerKm * FUEL_BURN_REAL_WORLD_FACTOR;
  if (engineUpgrade === "fuel" || engineUpgrade === "super") burn *= 0.9;
  if (fuselageUpgrade) burn *= 0.9;
  return burn;
}

/** Max weekly schedules for a single aircraft on a given route (D1 formula).
 *  Now honours the power/super engine boost — the cruise-speed bump
 *  was previously computed but never threaded into the rotations
 *  formula, so power/super was dead code. Pass the aircraft's
 *  engineUpgrade to actually feel the +10% speed → tighter schedule. */
export function maxWeeklyRotations(
  specId: string,
  routeDistanceKm: number,
  engineUpgrade?: "fuel" | "power" | "super" | null,
  cargoBelly?: CargoBellyTier,
  doctrine?: DoctrineId,
): number {
  const oneWayHrs = routeDistanceKm / cruiseSpeedKmh(specId, engineUpgrade);
  const turnaround = groundTurnaroundHours(specId, cargoBelly, doctrine);
  const roundTrip = oneWayHrs * 2 + turnaround * 2;
  return Math.max(1, Math.floor(168 / roundTrip));
}

/** Helper: max average daily frequency across all planes on a route. The
 *  physics cap is computed on a 168-hour week, not by multiplying a whole
 *  daily cap by 7. That allows realistic schedules like 8/wk or 22/wk when
 *  round-trip time does not divide evenly into a day.
 *
 *  When `aircraft` is provided, each plane's individual engine upgrade
 *  and cargo belly state are honoured. Power/super shortens the one-way
 *  time; cargo belly increases ground time. The bare-spec fallback is kept
 *  for paths that only know the spec id. */
export function maxRouteDailyFrequency(
  specIds: string[],
  routeDistanceKm: number,
  aircraft?: Array<{
    specId: string;
    engineUpgrade?: "fuel" | "power" | "super" | null;
    cargoBelly?: CargoBellyTier;
    doctrine?: DoctrineId;
  }>,
): number {
  if (aircraft && aircraft.length > 0) {
    const weeklyTotal = aircraft.reduce(
      (sum, a) => sum + maxWeeklyRotations(
        a.specId,
        routeDistanceKm,
        a.engineUpgrade,
        a.cargoBelly,
        a.doctrine,
      ),
      0,
    );
    return weeklyTotal / 7;
  }
  const weeklyTotal = specIds.reduce(
    (sum, id) => sum + maxWeeklyRotations(id, routeDistanceKm), 0,
  );
  return weeklyTotal / 7;
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

function connectedCityDemandBonus(team: Team, route: Route): number {
  const graph = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    if (!graph.has(a)) graph.set(a, new Set());
    if (!graph.has(b)) graph.set(b, new Set());
    graph.get(a)!.add(b);
    graph.get(b)!.add(a);
  };
  for (const r of team.routes) {
    if (r.status !== "active" && r.id !== route.id) continue;
    addEdge(r.originCode, r.destCode);
  }
  addEdge(route.originCode, route.destCode);

  const seen = new Set<string>();
  const queue = [route.originCode];
  while (queue.length > 0) {
    const code = queue.shift()!;
    if (seen.has(code)) continue;
    seen.add(code);
    for (const next of graph.get(code) ?? []) {
      if (!seen.has(next)) queue.push(next);
    }
  }
  return Math.min(0.25, seen.size * 0.05);
}

function negativeDemandShockShare(
  originCode: string,
  destCode: string,
  quarter: number,
  mode: "passenger" | "cargo",
  totalRounds: number = 60,
): number {
  // totalRounds > 60 ⟺ the 120-round full campaign → news/travel-index
  // lookups shift back 60 quarters to land on their real calendar year.
  const campaignMode = totalRounds > 60 ? "full" : "half";
  const travelDrop = Math.max(0, 1 - Math.max(TRAVEL_INDEX_FLOOR, effectiveTravelIndex(quarter, campaignMode) / 100));
  const originImpact = cityEventImpact(originCode, quarter, totalRounds);
  const destImpact = cityEventImpact(destCode, quarter, totalRounds);
  const categories =
    mode === "cargo"
      ? [originImpact.cargo, destImpact.cargo]
      : [
          originImpact.tourism,
          originImpact.business,
          destImpact.tourism,
          destImpact.business,
        ];
  const cityDrop = Math.max(
    0,
    ...categories.filter((pct) => pct < 0).map((pct) => Math.abs(pct) / 100),
  );
  return Math.min(0.8, travelDrop + cityDrop);
}

function shockAdjustmentMultiplier(
  team: Team,
  route: Route,
  quarter: number,
  mode: "passenger" | "cargo",
  totalRounds: number = 60,
): number {
  const shock = negativeDemandShockShare(route.originCode, route.destCode, quarter, mode, totalRounds);
  if (shock <= 0) return 1;

  let targetDropFactor = 1;
  if (isDoctrine(team, "budget-expansion")) targetDropFactor = 1.5;
  else if (isDoctrine(team, "premium-service")) targetDropFactor = 0.5;
  else if (isDoctrine(team, "global-network")) targetDropFactor = 0.7;

  if (targetDropFactor === 1) return 1;
  const baseMultiplier = Math.max(0.05, 1 - shock);
  const targetMultiplier = Math.max(0.05, 1 - shock * targetDropFactor);
  return targetMultiplier / baseMultiplier;
}

function tierTwoThreeDemandBonus(origin: City, dest: City): number {
  const endpointBonus =
    (origin.tier === 2 || origin.tier === 3 ? 0.10 : 0) +
    (dest.tier === 2 || dest.tier === 3 ? 0.10 : 0);
  return 1 + Math.min(0.20, endpointBonus);
}

function fleetBrandKey(specId: string): string {
  if (/^A\d|^A3|^A2/.test(specId)) return "Airbus";
  if (/^B\d|^B7/.test(specId)) return "Boeing";
  if (/^E\d|^E-/.test(specId)) return "Embraer";
  if (/^ATR/.test(specId)) return "ATR";
  return specId.replace(/[-\d].*$/, "") || specId;
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

/** Effective per-city demand for a quarter, after applying news event
 *  modifiers, the global travel index, and the seasonal multiplier.
 *  Used by read-only views (AirportDetailModal) so the player sees
 *  the same number the route engine works against. Returns the
 *  three categories separately because cargo runs on its own
 *  modifier track. */
export function cityEffectiveDemand(
  city: City,
  quarter: number,
  campaignMode: "half" | "full" = "half",
): {
  tourism: number;
  business: number;
  cargo: number;
  /** Q/Q % change vs the prior quarter, signed. Positive = demand up. */
  tourismDeltaPct: number;
  businessDeltaPct: number;
  cargoDeltaPct: number;
} {
  // Full campaign news/travel-index lookups shift back 60 quarters to
  // land on the real calendar year (see newsRoundForQuarter).
  const totalRounds = campaignMode === "full" ? 120 : 60;
  function compute(q: number): { t: number; b: number; c: number } {
    if (q < 1) return { t: 0, b: 0, c: 0 };
    const tourismBase = cityTourismAtQuarter(city, q);
    const businessBase = cityBusinessAtQuarter(city, q);
    const evt = cityEventImpact(city.code, q, totalRounds);
    const tMult = Math.max(DEMAND_FLOOR_PASSENGER, 1 + evt.tourism / 100);
    const bMult = Math.max(DEMAND_FLOOR_PASSENGER, 1 + evt.business / 100);
    const cMult = Math.max(DEMAND_FLOOR_CARGO, 1 + evt.cargo / 100);
    const travelIdx = Math.max(TRAVEL_INDEX_FLOOR, effectiveTravelIndex(q, campaignMode) / 100);
    const season = seasonalMultiplier(q);
    return {
      t: tourismBase * tMult * travelIdx * season.tourism,
      b: businessBase * bMult * travelIdx * season.business,
      // Cargo seasonality NOW applied — previously skipped, but Q4
      // holiday freight is the largest single seasonal pulse in real
      // air-cargo. season.cargo: Q4 1.18 / Q3 1.00 / Q2 0.96 / Q1 0.90.
      c: businessBase * cMult * travelIdx * season.cargo,
    };
  }
  const now = compute(quarter);
  const prev = compute(quarter - 1);
  function pctDelta(curr: number, p: number): number {
    if (p <= 0) return 0;
    return ((curr - p) / p) * 100;
  }
  return {
    tourism: now.t,
    business: now.b,
    cargo: now.c,
    tourismDeltaPct: pctDelta(now.t, prev.t),
    businessDeltaPct: pctDelta(now.b, prev.b),
    cargoDeltaPct: pctDelta(now.c, prev.c),
  };
}

// ─── Market Maturity Multiplier (Campaign Brief §12) ─────────
//
// Prevents early-game route-spam: at R1 only 15% of base demand is
// "active", scaling linearly to 100% by ~83% through the campaign.
// Workshop blocker observed May 2026: a player who opens LHR-JFK
// with 6 widebodies on Q1 prints money because base demand assumes
// a mature 2025 traveller, not a 2015 (or 2000) one. With maturity
// at 0.15, two A320s saturate a top-tier route — no benefit from
// stacking more capacity on a single OD pair.
//
// Generalisation note: the brief specifies "/49" (60R) and "/99"
// (120R). We support 8/16/24/40/60R via totalRounds, so the curve
// generalises with `plateauRound = max(8, floor(totalRounds × 0.83))`.
// 60R → R50, 120R → R100 (matches brief), 40R → R33, 24R → R20,
// 16R → R13, 8R → R7. By the last ~17% of any campaign, demand is
// fully mature.
export function marketMaturity(currentQuarter: number, totalRounds: number = 60): number {
  const plateauRound = Math.max(8, Math.floor(totalRounds * 0.83));
  if (currentQuarter >= plateauRound) return 1.0;
  if (currentQuarter <= 1) return 0.15;
  return Math.min(1.0, 0.15 + ((currentQuarter - 1) / (plateauRound - 1)) * 0.85);
}

// ─── Route demand (PRD §5.2 + E6 + D5 + A1 events + maturity §12) ──
export function routeDemandPerDay(
  origin: string,
  dest: string,
  quarter: number,
  totalRounds: number = 60,
): { tourism: number; business: number; total: number; amplifier: number } {
  const a = CITIES_BY_CODE[origin];
  const b = CITIES_BY_CODE[dest];
  if (!a || !b) return { tourism: 0, business: 0, total: 0, amplifier: 1 };
  const amplifier = Math.min(a.amplifier, b.amplifier);

  // Per-category event modifiers (tourism / business broken out separately
  // so a tourism-only news item doesn't inflate business demand and vice
  // versa). Each NewsItem in `world-news.ts` carries a structured
  // `modifiers: { city, category, pct, rounds }[]` array — see
  // `cityEventImpact()` for the rounds-window walker.
  // totalRounds > 60 ⟺ the 120-round full campaign → news lookups shift
  // back 60 quarters to land on their real calendar year.
  const campaignMode = totalRounds > 60 ? "full" : "half";
  const evA = cityEventImpact(origin, quarter, totalRounds);
  const evB = cityEventImpact(dest, quarter, totalRounds);
  const tourismEventA = evA.tourism / 100;
  const tourismEventB = evB.tourism / 100;
  const businessEventA = evA.business / 100;
  const businessEventB = evB.business / 100;

  // Global Travel Index master multiplier (PRD E6) — news items can
  // override this via `travelIndex` (e.g. recession/Olympics global pulses).
  const travelIdx = effectiveTravelIndex(quarter, campaignMode) / 100;
  // Seasonal multiplier (PRD D5)
  const season = seasonalMultiplier(quarter);

  // Demand floor — even the worst stacked news shocks should leave
  // SOME baseline demand. Constants exported so the AirportDetailModal
  // and other read-only views can compute effective demand using the
  // same clamps as the simulation.
  const tourismMultA = Math.max(DEMAND_FLOOR_PASSENGER, 1 + tourismEventA);
  const tourismMultB = Math.max(DEMAND_FLOOR_PASSENGER, 1 + tourismEventB);
  const businessMultA = Math.max(DEMAND_FLOOR_PASSENGER, 1 + businessEventA);
  const businessMultB = Math.max(DEMAND_FLOOR_PASSENGER, 1 + businessEventB);
  const travelIdxFloored = Math.max(TRAVEL_INDEX_FLOOR, travelIdx);

  // Market maturity — applied last, after all event/season/index
  // modifiers (Campaign Brief §12). Scales 0.15→1.0 over the first
  // ~83% of the campaign so early rounds can't be spam-saturated.
  const maturity = marketMaturity(quarter, totalRounds);

  const tourism =
    (cityTourismAtQuarter(a, quarter) * tourismMultA +
     cityTourismAtQuarter(b, quarter) * tourismMultB) *
    amplifier * travelIdxFloored * season.tourism * maturity;
  const business =
    (cityBusinessAtQuarter(a, quarter) * businessMultA +
     cityBusinessAtQuarter(b, quarter) * businessMultB) *
    amplifier * travelIdxFloored * season.business * maturity;
  return { tourism, business, total: tourism + business, amplifier };
}

/** Distance-aware cabin class share of an OD pair's daily passenger
 *  demand. Real-world long-haul routes carry a much higher business +
 *  first-class share than short-haul commuter routes — corporate
 *  travelers will pay for flat beds on a 12-hour flight, won't on
 *  a 90-minute hop. Source-of-truth: ICAO RPK premium-vs-economy
 *  split, IATA premium-economy reports.
 *
 *  Shares sum to 1.0:
 *    short-haul  (<1500km):  1% first / 12% bus / 87% econ
 *    domestic    (<4000km):  2% first / 16% bus / 82% econ
 *    medium      (<8000km):  4% first / 22% bus / 74% econ
 *    long-haul   (≥8000km):  6% first / 28% bus / 66% econ
 *
 *  Tier-1↔Tier-1 OD pairs (LHR-JFK, DXB-SIN, etc.) get a 1.20×
 *  lift on premium classes capped at 10% first / 40% business —
 *  global business hubs concentrate corporate trip volume. */
export function classDemandShares(
  distanceKm: number,
  originTier: number,
  destTier: number,
): { first: number; bus: number; econ: number } {
  let first: number, bus: number;
  if (distanceKm < 1500)       { first = 0.01; bus = 0.12; }
  else if (distanceKm < 4000)  { first = 0.02; bus = 0.16; }
  else if (distanceKm < 8000)  { first = 0.04; bus = 0.22; }
  else                          { first = 0.06; bus = 0.28; }
  if (originTier === 1 && destTier === 1) {
    first = Math.min(0.10, first * 1.20);
    bus   = Math.min(0.40, bus   * 1.20);
  }
  const econ = Math.max(0, 1 - first - bus);
  return { first, bus, econ };
}

/** Effective Travel Index for a given quarter — defaults to TRAVEL_INDEX
 *  but is overridden by any news item at that quarter that ships an
 *  explicit `travelIndex` value (e.g. recession dips, Olympics spikes).
 *  Multiple overrides at the same quarter are averaged so a +pulse and
 *  a −pulse on the same round don't unfairly stack.
 *
 *  Campaign-mode aware (Brief §1): when `campaignMode === "full"` and
 *  the quarter is R1-R60 (= 2000-2014 era), reads from the 2000-2014
 *  Travel Index table. R61-R120 of the full campaign maps to R1-R60
 *  of the half campaign with a -60 offset. */
export function effectiveTravelIndex(
  quarter: number,
  campaignMode: "half" | "full" = "half",
): number {
  // Scripted travelIndex overrides are authored on the 2015-start
  // (R1-R60) timeline. In the full campaign the live quarter sits 60
  // rounds ahead of that calendar, so the news lookup must shift back
  // by 60 — otherwise a 2001 quarter would wrongly read 2015-era news.
  const newsRound = campaignMode === "full" ? quarter - 60 : quarter;
  const news = NEWS_BY_QUARTER[newsRound] ?? [];
  const overrides = news
    .map((n) => n.travelIndex)
    .filter((v): v is number => typeof v === "number");
  if (overrides.length > 0) {
    const sum = overrides.reduce((a, b) => a + b, 0);
    return sum / overrides.length;
  }
  if (campaignMode === "full") {
    if (quarter <= 60) {
      return TRAVEL_INDEX_FULL_CAMPAIGN_2000[quarter] ?? 100;
    }
    // R61-R120 → R1-R60 of half campaign (offset 60).
    return TRAVEL_INDEX[quarter - 60] ?? 100;
  }
  return TRAVEL_INDEX[quarter] ?? 100;
}

/** Effective fuel index for a given quarter — defaults to whatever the
 *  game state holds, but news items with `fuelIndexAtBaseline` (relative
 *  to 100) hint the engine where the fuel index *should* be after the
 *  shock. The game state is the truth; this helper exposes the news
 *  expectation so dashboards can show "fuel news at quarter N expected
 *  +X% spike" alongside the player's actual current fuel index. */
export function newsFuelIndexHint(
  quarter: number,
  totalRounds = 60,
): number | null {
  const news = newsForQuarter(quarter, totalRounds);
  for (const n of news) {
    if (typeof n.fuelIndexAtBaseline === "number") {
      return n.fuelIndexAtBaseline;
    }
  }
  return null;
}

/** The quarter an airframe actually becomes orderable for a given campaign.
 *
 *  Every `unlockQuarter` in the catalogue was calibrated against the HALF
 *  campaign timeline (round N → calendar year 2015 + floor((N-1)/4)). In the
 *  FULL campaign (starts 2000) that same round maps to a much earlier year,
 *  so an unmodified `unlockQuarter` would let players order, say, an A350 in
 *  2005 — years before it existed. To prevent that, full-campaign games clamp
 *  the unlock to the quarter matching the airframe's real entry-into-service
 *  year: `(eisYear - 2000) * 4 + 1`. The later of the two bounds wins, so a
 *  spec whose half-campaign unlock is already past its EIS quarter keeps its
 *  designed pacing. Half campaigns ignore `eisYear` entirely (every spec had
 *  entered service by 2015). */
export function effectiveUnlockQuarter(
  spec: { unlockQuarter: number; eisYear?: number },
  campaignMode: "half" | "full" = "half",
): number {
  if (campaignMode === "full" && typeof spec.eisYear === "number") {
    const eisQuarter = (spec.eisYear - 2000) * 4 + 1;
    return Math.max(spec.unlockQuarter, eisQuarter);
  }
  return spec.unlockQuarter;
}

/** The round an airframe is discontinued (vanishes from the New-Build
 *  market) for a given campaign.
 *
 *  Like `unlockQuarter`, every `cutoffRound` in the catalogue was
 *  calibrated against the HALF campaign timeline, where round N maps to
 *  calendar year 2015 + floor((N-1)/4). The FULL campaign starts in 2000,
 *  so the SAME round number arrives 15 years (60 quarters) earlier — which
 *  was prematurely discontinuing in-production airframes (e.g. the A330
 *  disappeared from the Airbus tab barely a few years into a full
 *  campaign). Shifting the cutoff by +60 quarters in the full campaign
 *  preserves the original calendar-year discontinuation the half-campaign
 *  pacing intended (mirrors the +60 world-news offset). A defensive
 *  `max(..., effectiveUnlock)` guard guarantees a spec can never be
 *  discontinued before it has even unlocked. */
export function effectiveCutoffRound(
  spec: { unlockQuarter: number; eisYear?: number; cutoffRound?: number },
  campaignMode: "half" | "full" = "half",
): number | undefined {
  if (typeof spec.cutoffRound !== "number") return undefined;
  if (campaignMode !== "full") return spec.cutoffRound;
  const shifted = spec.cutoffRound + 60;
  return Math.max(shifted, effectiveUnlockQuarter(spec, campaignMode));
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

/** Per-class fare range (PRD A11). Returns {min, base, max} for a class.
 *
 *  Geometry contract (post-fix):
 *    - Standard tier (1.0× base) = the `base` value.
 *    - Slider min  = 0.5 × base  → matches Budget tier exactly.
 *    - Slider max  = 2.0 × base  → matches Ultra tier exactly.
 *  This puts `base` at slider midpoint and gives clean tier landmarks:
 *    Budget 0.5× → far left
 *    Standard 1.0× → midpoint
 *    Premium 1.5× → 50% to the right of midpoint (75% along)
 *    Ultra 2.0× → far right
 *  Previously first-class returned `min == base` (slider stuck on left)
 *  and the bands were asymmetric so base never sat at the midpoint. */
export interface FareRange { min: number; base: number; max: number }

// Per-class fare bases by stage length.
// Workshop iteration log:
//   v1 — bots spammed short-haul; huge demand pools at NYC/LA/LHR.
//   v2 — bumped LH/XLH +35% via 4-tier band tables. Still felt flat at XLH.
//   v3 — sharper band ratios.
//   v4 — user feedback: "rates should be exponential, not really linear".
//        Replaced the discrete 4-tier band tables with a continuous
//        power-law curve so there are no "step" jumps at band edges
//        and very long routes scale meaningfully faster than medium.
//
// Curve: fare = ANCHOR × (km / 1000)^EXPONENT
//   - anchor is the fare at 1,000 km (a long short-haul or short MH)
//   - exponent >1 produces super-linear (exponential-feel) growth.
//     Business and First use a slightly steeper exponent because
//     real-world premium yields scale harder with distance than
//     economy does (NYC-Sydney business is $10k-$15k, vs NYC-Boston
//     business ~$300 — that's a 30-50× ratio at the same anchor).
//
// Reference points (econ) at ANCHOR_USD=120, EXPONENT=1.05:
//     300 km →   $32   (regional hop, e.g. JFK-DCA)
//   1,000 km →  $120
//   2,500 km →  $314
//   5,500 km →  $691   (Trans-Atlantic, ≈ 5.8× short)
//  10,800 km → $1,410  (Trans-Pacific, ≈ 11.8× short)
//  16,000 km → $2,127  (NYC-Sydney, ≈ 17.7× short)
//
// Business class anchor $360 with steeper EXPONENT=1.12 lands at:
//   1,000 km →  $360
//   5,500 km → $2,415
//  16,000 km → $9,165   (matches real long-haul premium yields)
//
// A FLOOR keeps very short hops (<300 km) from getting silly $20 fares.
const ECON_CURVE_ANCHOR_USD = 120;
const BUS_CURVE_ANCHOR_USD  = 360;
const ECON_CURVE_EXPONENT   = 1.05;
const BUS_CURVE_EXPONENT    = 1.12;
const FARE_CURVE_ANCHOR_KM  = 1000;
const ECON_FARE_FLOOR_USD   = 50;
const BUS_FARE_FLOOR_USD    = 150;

function econBase(km: number): number {
  const raw = ECON_CURVE_ANCHOR_USD * Math.pow(km / FARE_CURVE_ANCHOR_KM, ECON_CURVE_EXPONENT);
  return Math.max(ECON_FARE_FLOOR_USD, Math.round(raw));
}
function busBase(km: number): number {
  const raw = BUS_CURVE_ANCHOR_USD * Math.pow(km / FARE_CURVE_ANCHOR_KM, BUS_CURVE_EXPONENT);
  return Math.max(BUS_FARE_FLOOR_USD, Math.round(raw));
}
/** First-class base = business base × 3.5 (PRD A11). */
function firstBase(km: number): number {
  return busBase(km) * 3.5;
}

export function classFareRange(
  km: number,
  cls: "econ" | "bus" | "first",
): FareRange {
  const base =
    cls === "econ"  ? econBase(km) :
    cls === "bus"   ? busBase(km) :
    firstBase(km);
  return {
    min: Math.round(base * 0.5),
    base,
    max: Math.round(base * 2.0),
  };
}

export function classFareRangeForDoctrine(
  km: number,
  cls: "econ" | "bus" | "first",
  doctrine?: DoctrineId,
): FareRange {
  const range = classFareRange(km, cls);
  if (activeDoctrineId(doctrine) !== "premium-service") return range;
  return {
    ...range,
    max: Math.round(range.max * 1.2),
  };
}

/** Tier multipliers used by the Budget/Standard/Premium/Ultra preset
 *  buttons. Kept in sync with PRICE_TIER below for the engine math. */
export const FARE_TIER_MULTIPLIER: Record<PricingTier, number> = {
  budget: 0.5,
  standard: 1.0,
  premium: 1.5,
  ultra: 2.0,
};

/** Inverse of applyTier — given a fare value relative to base, return the
 *  closest pricing tier. Used by the UI to auto-highlight the active
 *  tier button when the player nudges the per-class sliders directly.
 *  When no class fares match a tier exactly, returns the nearest tier
 *  by absolute multiplier distance. */
export function detectTierFromFares(
  base: number,
  value: number,
): PricingTier {
  if (base <= 0) return "standard";
  const ratio = value / base;
  let best: PricingTier = "standard";
  let bestDelta = Infinity;
  for (const t of Object.keys(FARE_TIER_MULTIPLIER) as PricingTier[]) {
    const delta = Math.abs(FARE_TIER_MULTIPLIER[t] - ratio);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = t;
    }
  }
  return best;
}

/** Average tier across multiple class fares. Each class contributes
 *  a `value/base` ratio; the average is mapped back to the closest
 *  tier landmark via {@link detectTierFromFares}. Returns "standard"
 *  if `entries` is empty. */
export function detectTierFromAverage(
  entries: Array<{ base: number; value: number }>,
): PricingTier {
  if (entries.length === 0) return "standard";
  let sum = 0;
  let n = 0;
  for (const e of entries) {
    if (e.base <= 0) continue;
    sum += e.value / e.base;
    n += 1;
  }
  if (n === 0) return "standard";
  // Use the same matching as detectTierFromFares but on the averaged ratio.
  const avg = sum / n;
  let best: PricingTier = "standard";
  let bestDelta = Infinity;
  for (const t of Object.keys(FARE_TIER_MULTIPLIER) as PricingTier[]) {
    const delta = Math.abs(FARE_TIER_MULTIPLIER[t] - avg);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = t;
    }
  }
  return best;
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
/** Legacy default ladder — kept for backwards compatibility (any older
 *  call sites still referencing SLIDER_PCT_REVENUE keep working). New
 *  code should use the per-slider maps below, which apply the
 *  user-specified caps:
 *    marketing       max 15%
 *    in-flight       1.5%–8%
 *    operations      2%–10%
 *    office capacity 1.5%–7% (customerService key) */
export const SLIDER_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0,
  1: 0.03,
  2: 0.06,
  3: 0.09,
  4: 0.12,
  5: 0.15,
};

/** Marketing slider — campaigns, PR, frequent-flyer rewards.
 *  Range 0% → 15% across levels 0-5. */
export const MARKETING_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0,
  1: 0.03,
  2: 0.06,
  3: 0.09,
  4: 0.12,
  5: 0.15,
};

/** In-Flight Service slider — food, amenities, cabin.
 *  Range 1.5% → 8% across levels 0-5 (level 0 still buys minimum service). */
export const SERVICE_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0.015,
  1: 0.027,
  2: 0.040,
  3: 0.053,
  4: 0.067,
  5: 0.080,
};

/** Operations slider — maintenance, engineering.
 *  Range 2% → 10% across levels 0-5. */
export const OPS_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0.02,
  1: 0.035,
  2: 0.050,
  3: 0.065,
  4: 0.082,
  5: 0.10,
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

/** Office Capacity slider — check-in, ground ops, contact centre
 *  (`customerService` key). Range 1.5% → 7% across levels 0-5. */
export const CS_PCT_REVENUE: Record<SliderLevel, number> = {
  0: 0.015,
  1: 0.026,
  2: 0.037,
  3: 0.048,
  4: 0.059,
  5: 0.07,
};

/** Compounding multiplier (PRD §3.2): 1.0 → 1.2× at 3Q → 1.5× at 6Q. */
export function streakMultiplier(quartersAtLevel: number): number {
  if (quartersAtLevel >= 6) return 1.5;
  if (quartersAtLevel >= 3) return 1.2;
  return 1.0;
}

// ─── Staff cost (A3) — rebuilt to your spec ───────────────
// Old formula was `fleetSize × $180K + routes × $45K + hub × $800K
// + $2M HQ`, which pinned a 40-aircraft / 40-route airline at ~$11M/Q
// payroll on $2.3B/Q revenue (~0.5%). Real airlines run 18-25% of
// revenue on labour. The new formula scales by:
//   1. number of hubs (primary + secondaries)
//   2. number of aircraft AND aircraft-type/capacity (regional /
//      narrow / wide / heavy-cargo) — bigger planes need bigger crews
//   3. weekly flight volume (ground crew + dispatch)
//   4. passenger volume + cargo tonnage offered (cabin + handling)
//   5. fleet-variety overhead (each unique type past 3 adds training,
//      parts certification, type-rated pilot pools)
//   6. cross-slider multipliers — service (heavy), customer-service,
//      and marketing all flex headcount in their domains.
// Plus the existing staff-slider STAFF_MULTIPLIER + doctrine + S14
// recurring surcharge applied at the engine call site.
//
// Calibration target: ~18% of revenue ±5% guardrail at steady state.
export function baselineStaffCostUsd(team: Team): number {
  const activeFleet = team.fleet.filter((f) => f.status === "active");
  const activeRoutes = team.routes.filter((r) => r.status === "active");
  const passengerRoutes = activeRoutes.filter((r) => !r.isCargo);
  const cargoRoutes = activeRoutes.filter((r) => r.isCargo);

  // 1. Hub overhead — primary HQ + per-secondary station ops.
  const primaryHubCost = 4_000_000;     // HQ + primary hub combined
  const secondaryHubCost = 1_500_000;   // per secondary hub
  const secondaries = team.secondaryHubCodes?.length ?? 0;
  const hubBaseline = primaryHubCost + secondaryHubCost * secondaries;

  // 2. Aircraft crew + maintenance-labour staffing — derived PER AIRCRAFT
  //    TYPE from its real crew complement, with ECONOMIES OF SCALE across a
  //    common-type fleet. Two parts:
  //      • Per-flight crew (cockpit + cabin) — pilots and flight attendants
  //        must staff every departure, so this is LINEAR in tail count: two
  //        A380s genuinely need twice the pilots and cabin crew of one.
  //      • Per-type fixed overhead (type-rating training program, spare-parts
  //        inventory, fleet/maintenance management) — SHARED across the fleet
  //        of that type, so each additional same-type tail adds only a small
  //        increment. This is the synergy the prior flat `factor` model
  //        missed: a 6-strong A350 fleet costs far less per tail to run than
  //        a single orphan A350.
  //    Crew complement is computed from the spec: cabin crew scale with the
  //    seat mix (premium cabins are crew-heavy — 1 per 12 first / 24 business
  //    / 50 economy, the real regulatory + service ratios), pilots step up
  //    for long- and ultra-long-haul (augmented crews), and maintenance
  //    technicians scale with airframe size. Salaries are fully loaded
  //    (benefits, training, per-diems, management allocation).
  // Fully-loaded quarterly cost per employed head: base pay + benefits +
  // training + per-diems + the station/ground/admin staff each flying
  // position carries (a full-service carrier employs ~300-400 people per
  // widebody once gate, ramp, ops-control, dispatch and management are
  // counted — far more than the cockpit + cabin alone). These rates roll
  // that support headcount into the per-crew figure so total labour lands
  // at a realistic ~16-20% of revenue rather than the ~10% the old flat
  // factor produced.
  const CREW_PILOT_Q = 150_000;  // per employed pilot (+ ops/dispatch support), per quarter
  const CREW_CABIN_Q = 40_000;   // per employed cabin-crew member (+ gate/ground), per quarter
  const CREW_MXTECH_Q = 52_000;  // per maintenance technician (+ engineering support), per quarter
  const CREW_RATIO = 5;          // employed crew per per-flight position (rotations/rest/reserves/leave)
  // Tally tails per type so scale economies can apply per type.
  const tailsByType = new Map<string, number>();
  for (const f of activeFleet) {
    tailsByType.set(f.specId, (tailsByType.get(f.specId) ?? 0) + 1);
  }
  let aircraftBaseline = 0;
  for (const [specId, count] of tailsByType) {
    const spec = AIRCRAFT_BY_ID[specId];
    if (!spec) continue;
    let pilotsPerFlight: number;
    let cabinPerFlight: number;
    let mxTechsPerTail: number;
    if (spec.family === "cargo") {
      const t = spec.cargoTonnes ?? 0;
      pilotsPerFlight = spec.rangeKm >= 9000 ? 3 : 2;
      cabinPerFlight = 1;                                   // loadmaster
      mxTechsPerTail = Math.max(3, Math.round(t / 12));
    } else {
      const s = spec.seats;
      cabinPerFlight = Math.max(
        2,
        Math.ceil(s.economy / 50 + s.business / 24 + s.first / 12),
      );
      pilotsPerFlight = spec.rangeKm >= 13000 ? 4 : spec.rangeKm >= 9000 ? 3 : 2;
      const totalSeats = s.first + s.business + s.economy;
      mxTechsPerTail = Math.max(3, Math.round(totalSeats / 40));
    }
    const perTailCrewQ =
      pilotsPerFlight * CREW_RATIO * CREW_PILOT_Q +
      cabinPerFlight * CREW_RATIO * CREW_CABIN_Q +
      mxTechsPerTail * CREW_MXTECH_Q;
    // Per-type fixed overhead — sized to the airframe (a widebody training
    // program + spares pool costs more than a narrowbody's).
    const typeFixedQ = 1_300_000 + perTailCrewQ * 0.35;
    // Economies of scale: the fixed overhead is mostly shared — each extra
    // same-type tail adds only 18% more fixed cost. Per-flight crew (above)
    // stays linear.
    const scaledFixedQ = typeFixedQ * (1 + (count - 1) * 0.18);
    aircraftBaseline += perTailCrewQ * count + scaledFixedQ;
  }

  // 3. Route ops — passenger and cargo route managers, plus per-flight
  //    ground crew that scales with weekly schedule density.
  const totalWeeklySchedules = activeRoutes.reduce(
    (sum, r) => sum + r.dailyFrequency * 7,
    0,
  );
  const routeOpsBaseline =
    passengerRoutes.length * 250_000 +
    cargoRoutes.length * 200_000 +
    totalWeeklySchedules * 12_000;

  // 4. Passenger-volume staffing — cabin crew, gate, check-in. Driven
  //    by the QUARTERLY pax CAPACITY (not realized pax, since we run
  //    payroll on the schedule, not the load factor) at an assumed
  //    80% planning load factor.
  let totalPaxCapacityPerQ = 0;
  for (const r of passengerRoutes) {
    const planes = r.aircraftIds
      .map((id) => team.fleet.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (planes.length === 0) continue;
    const seatsPerFlight = planes.reduce((s, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      const sm = p.customSeats ?? spec?.seats;
      return s + ((sm?.first ?? 0) + (sm?.business ?? 0) + (sm?.economy ?? 0));
    }, 0) / planes.length;
    totalPaxCapacityPerQ += seatsPerFlight * r.dailyFrequency * QUARTER_DAYS;
  }
  const expectedPaxQ = totalPaxCapacityPerQ * 0.80;
  const paxStaffBaseline = expectedPaxQ * 6.5;  // ~$6.50/pax served

  // 5. Cargo handling — warehouse + ramp staff per tonne moved.
  let totalCargoTonnesPerQ = 0;
  for (const r of cargoRoutes) {
    const planes = r.aircraftIds
      .map((id) => team.fleet.find((p) => p.id === id))
      .filter((p): p is NonNullable<typeof p> => !!p);
    if (planes.length === 0) continue;
    const tonnesPerFlight = planes.reduce((s, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      return s + (spec?.cargoTonnes ?? 0);
    }, 0) / planes.length;
    totalCargoTonnesPerQ += tonnesPerFlight * r.dailyFrequency * QUARTER_DAYS;
  }
  const cargoStaffBaseline = totalCargoTonnesPerQ * 0.80 * 90;  // ~$90/tonne handled

  const operationalBaseline =
    hubBaseline +
    aircraftBaseline +
    routeOpsBaseline +
    paxStaffBaseline +
    cargoStaffBaseline;

  // 6. Fleet-variety overhead — every unique active aircraft type
  //    past the 3rd adds training / parts / type-rating costs. Caps
  //    at +20% so a balanced 7-type fleet doesn't 2× payroll.
  const uniqueTypes = new Set(activeFleet.map((f) => f.specId)).size;
  const varietyOverheadPct = Math.min(0.20, Math.max(0, uniqueTypes - 3) * 0.05);

  // 7. Cross-slider multipliers — these capture "more service / more
  //    marketing / more office capacity = more headcount in those
  //    departments". The staff slider STAFF_MULTIPLIER stacks on top
  //    at the engine call site and represents the player's wages /
  //    hours lever. Service is the heaviest because cabin crew + IFE
  //    + lounges scale headcount fast.
  const serviceLevel = team.sliders.service ?? 2;
  const serviceMult = [0.85, 0.92, 1.00, 1.12, 1.28, 1.50][serviceLevel] ?? 1.0;
  const marketingLevel = team.sliders.marketing ?? 2;
  const marketingMult = [0.96, 0.98, 1.00, 1.04, 1.08, 1.13][marketingLevel] ?? 1.0;
  const csLevel = team.sliders.customerService ?? 2;
  const csMult = [0.93, 0.97, 1.00, 1.06, 1.13, 1.22][csLevel] ?? 1.0;

  return Math.max(
    1_500_000, // floor — even a 1-aircraft startup has minimum ops staff
    operationalBaseline *
      (1 + varietyOverheadPct) *
      serviceMult *
      marketingMult *
      csMult,
  );
}

export const STAFF_MULTIPLIER: Record<SliderLevel, number> = {
  0: 0.5, 1: 0.75, 2: 1.0, 3: 1.1, 4: 1.2, 5: 1.5,
};

// ─── Attractiveness + market share (PRD §6.7) ──────────
/**
 * Cabin-class-specific attractiveness weights:
 *   Economy (price-sensitive):   price 0.55 / brand 0.20 / loyalty 0.15 / service 0.10
 *   Business (brand-balanced):   price 0.35 / brand 0.35 / loyalty 0.20 / service 0.10
 *   First (brand-heavy):         price 0.25 / brand 0.45 / loyalty 0.20 / service 0.10
 * Cargo (price + ops + age):     priceScore 0.55 / opsScore 0.35 / ageFactor 0.10
 */
export type CabinClass = "econ" | "bus" | "first";

export function attractivenessByClass(
  cabinClass: CabinClass,
  args: {
    priceScore: number;
    brandPts: number;
    loyaltyPct: number;
    serviceScore: number; // 0..100
  },
): number {
  const brandScore = Math.min(100, args.brandPts / 2);
  const w =
    cabinClass === "econ"  ? { p: 0.55, b: 0.20, l: 0.15, s: 0.10 } :
    cabinClass === "bus"   ? { p: 0.35, b: 0.35, l: 0.20, s: 0.10 } :
                             { p: 0.25, b: 0.45, l: 0.20, s: 0.10 };
  return (
    args.priceScore * w.p +
    brandScore * w.b +
    args.loyaltyPct * w.l +
    args.serviceScore * w.s
  );
}

/**
 * Legacy blended attractiveness score (mid-weighting). Kept for places
 * that don't yet break out per-class economics. New code should prefer
 * attractivenessByClass for cabin-class-specific demand splits.
 */
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
export const QUARTER_DAYS = 91;

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
  occupancy: number;               // 0..1 (full 100% achievable on hot routes)
  dailyPax: number;
  ticketPrice: number;
  quarterlyRevenue: number;
  quarterlyFuelCost: number;
  quarterlySlotCost: number;
  quarterlyProfit: number;

  // ── Per-class drill-down (Phase 1A) ─────────────────────────────
  // Populated by computeRouteEconomics so the route detail modal can
  // show "First class 31 pax/day × $800 = $5.6M/Q" instead of one
  // opaque revenue number. All optional — preview callers may omit
  // them via blankEconomics. Cargo routes leave per-class fields at 0
  // and use the cargo path (see passengerRevenue=0, cargoRevenue=Σ).
  /** Daily passengers carried in each cabin (post-capacity-cap). */
  dailyPaxFirst?: number;
  dailyPaxBus?: number;
  dailyPaxEcon?: number;
  /** Per-class quarterly revenue contribution (USD). */
  quarterlyFirstRevenue?: number;
  quarterlyBusRevenue?: number;
  quarterlyEconRevenue?: number;
  /** Per-class occupancy (0..1) — load factor by cabin. */
  occupancyFirst?: number;
  occupancyBus?: number;
  occupancyEcon?: number;
  /** Belly cargo on a passenger route (USD revenue and daily tonnes). */
  bellyCargoRevenue?: number;
  bellyDailyTonnesUsed?: number;
  /** Clean revenue split — pax vs cargo (pax routes split fares vs
   *  belly cargo; cargo routes have passengerRevenue=0). */
  passengerRevenue?: number;
  cargoRevenue?: number;
  /** Per-class fares the engine landed on this quarter (USD/seat).
   *  Includes the yield-management lift on cabins under pressure. */
  fareFirst?: number;
  fareBus?: number;
  fareEcon?: number;
  /** Per-class seat capacity per flight (after custom-cabin overrides
   *  + cabin amenity multipliers). Mirrors the engine's internal
   *  seatsPerFlight/dailyCapacity shape. */
  seatsFirst?: number;
  seatsBus?: number;
  seatsEcon?: number;
  /** Per-class daily demand (post-loyalty-and-competition-pressure),
   *  before capacity-capping. Surfaced in the projection box so the
   *  player sees "50 first-class demand/day, only 12 seats configured". */
  dailyDemandFirst?: number;
  dailyDemandBus?: number;
  dailyDemandEcon?: number;
  /** Dollars saved this quarter from the hub fuel-tank discount.
   *  Equal to the difference between (no-discount fuel cost) and
   *  (discounted fuel cost). Zero for routes without a fuel tank
   *  at origin. Surfaced inline on the fuel cost line. */
  quarterlyFuelTankSavings?: number;
}

export function slotFeeUsd(tier: 1 | 2 | 3 | 4): number {
  return tier === 1 ? 42_500 : tier === 2 ? 28_500 : tier === 3 ? 15_000 : 7_500;
}

/** Cross-route cargo-pool context. Built once per team per quarter
 *  in the simulator: which OD pairs the team is serving with belly
 *  cargo (passenger jets) vs dedicated freighters. Used to split the
 *  OD's cargo demand 30% (parcels/mail → belly) vs 70% (full pallets
 *  → freighter), avoiding the 130%-of-pool double-count when both
 *  modes serve the same OD. UI preview callers can omit this. */
export interface CargoPoolContext {
  /** OD keys (sorted city-code pair "ABC|XYZ") where the team has
   *  passenger flights with cargo bellies. */
  hasBellyOD: Set<string>;
  /** OD keys where the team has dedicated freighter routes. */
  hasFreighterOD: Set<string>;
}

/** Sorted OD key — direction-agnostic. Cargo flows both ways equally
 *  well, so ABC→XYZ and XYZ→ABC share a pool. */
export function odKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** The set of cities an airline "operates in" — the union of its hub,
 *  any secondary hubs, the origin of every active/pending route, and
 *  every airport it leases slots at. Used to decide which cities can
 *  host fuel tanks. Returns sorted, de-duplicated city codes. */
export function operatedCities(team: Team): string[] {
  const set = new Set<string>();
  if (team.hubCode) set.add(team.hubCode);
  for (const c of team.secondaryHubCodes ?? []) set.add(c);
  for (const r of team.routes ?? []) {
    if (r.status === "active" || r.status === "pending") set.add(r.originCode);
  }
  for (const code of Object.keys(team.airportLeases ?? {})) set.add(code);
  return Array.from(set).filter((c) => !!CITIES_BY_CODE[c]).sort();
}

/** Quarterly fuel burn (litres) for a single route, independent of fuel
 *  price, hedging, and any discount. Mirrors the per-flight burn math
 *  inside computeRouteEconomics: average burn across the assigned ACTIVE
 *  planes × daily frequency × quarter days. Used to size per-city tank
 *  coverage at quarter close. */
export function routeQuarterlyFuelBurnL(team: Team, route: Route): number {
  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  if (!origin || !dest) return 0;
  const distanceKm = route.distanceKm || haversineKm(origin, dest);
  const planes = route.aircraftIds
    .map((id) => team.fleet.find((f) => f.id === id))
    .filter((x): x is FleetAircraft => !!x && x.status === "active");
  if (planes.length === 0) return 0;
  const burnSumPerFlight = planes.reduce((sum, p) => {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec) return sum;
    const fuelMult =
      (p.ecoUpgrade ? 0.9 : 1.0) *
      (p.engineUpgrade === "fuel" || p.engineUpgrade === "super" ? 0.9 : 1.0) *
      (p.fuselageUpgrade ? 0.9 : 1.0);
    return sum + spec.fuelBurnPerKm * FUEL_BURN_REAL_WORLD_FACTOR * fuelMult * distanceKm;
  }, 0);
  const burnPerFlight = burnSumPerFlight / planes.length;
  return burnPerFlight * route.dailyFrequency * QUARTER_DAYS;
}

/** Per-city quarterly fuel burn (litres), summed across all ACTIVE routes
 *  departing each city. */
export function cityQuarterlyBurnL(team: Team): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of team.routes) {
    if (r.status !== "active") continue;
    const burn = routeQuarterlyFuelBurnL(team, r);
    if (burn <= 0) continue;
    out[r.originCode] = (out[r.originCode] ?? 0) + burn;
  }
  return out;
}

/** Per-city fuel discount fraction (0..tierMaxDiscount) delivered by the
 *  installed tanks vs. that city's actual quarterly burn:
 *    coverage = min(1, totalCapacityL / burnL)
 *    discount = tierMaxDiscount × coverage
 *  A city with tanks but no active-route burn yet clamps coverage to 1
 *  (full tier max). Recomputed every quarter close so the discount tracks
 *  the network as it grows — tanks never deplete. */
export function cityFuelDiscounts(team: Team): Record<string, number> {
  const tanks = team.fuelTanksByCity ?? {};
  const burnByCity = cityQuarterlyBurnL(team);
  const out: Record<string, number> = {};
  for (const [code, cfg] of Object.entries(tanks)) {
    if (!cfg || cfg.count <= 0) continue;
    const spec = FUEL_TANK_SPECS[cfg.tier];
    if (!spec) continue;
    const capacityL = spec.capacityL * cfg.count;
    const burnL = burnByCity[code] ?? 0;
    const coverage = burnL > 0 ? Math.min(1, capacityL / burnL) : 1;
    out[code] = spec.maxDiscount * coverage;
  }
  return out;
}

export function computeRouteEconomics(
  team: Team,
  route: Route,
  quarter: number,
  fuelIndex: number,
  rivals?: Team[],
  worldCupHostCode?: string | null,
  olympicHostCode?: string | null,
  cargoPool?: CargoPoolContext,
  totalRounds: number = 60,
  /** Per-city fuel discount fraction (0..maxDiscount), keyed by city code.
   *  Precomputed once per quarter-close in runQuarterClose against actual
   *  network burn. UI preview callers pass nothing → no discount (0). */
  cityFuelDiscount?: Record<string, number>,
  /** Airport System V2 gate (§3): when true, the hub-and-spoke connecting
   *  multiplier applies to any non-Budget doctrine but ONLY on segments that
   *  touch a hub. Defaults false → legacy V1 doctrine-specific behavior. */
  airportSystemV2: boolean = false,
): RouteEconomics {
  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  if (!origin || !dest)
    return blankEconomics(route.distanceKm);

  const distanceKm = route.distanceKm || haversineKm(origin, dest);

  // §3 V2 hub-and-spoke connecting eligibility — true only when the V2 gate
  // is on, the doctrine is non-Budget, and this segment touches a hub. Used
  // below to gate the connecting demand-aggregation bonus on both the
  // passenger and cargo paths. V1 games leave this false and keep the legacy
  // doctrine-specific behavior unchanged.
  const v2Connecting =
    airportSystemV2 &&
    segmentGetsConnectingMultiplier(
      team.doctrine,
      teamHubs(team.hubCode, team.secondaryHubCodes ?? []),
      route.originCode,
      route.destCode,
    );

  const rawDemandBase = routeDemandPerDay(route.originCode, route.destCode, quarter, totalRounds);
  // Anchor Contract underdog boost (Campaign Brief §13 R30 standard) —
  // multiplies the business component of demand for the active team
  // while the boost window is open. Tourism unaffected.
  const bizMult = activeBusinessDemandMultiplier(team, quarter);
  const rawDemand = bizMult === 1.0 ? rawDemandBase : {
    ...rawDemandBase,
    business: rawDemandBase.business * bizMult,
    total: rawDemandBase.tourism + rawDemandBase.business * bizMult,
  };
  const loyaltyFactor = loyaltyRetentionFactor(team.customerLoyaltyPct);

  // PRD §5.4 — competitor pressure on shared markets.
  // Three signals, in increasing order of strength:
  //   (1) Hub-at-endpoint   — rival's hub touches our origin or dest.
  //                           Light pressure (legacy behavior).
  //   (2) Endpoint-overlap  — rival flies a route from one of our endpoints
  //                           but to a different city. Medium pressure.
  //   (3) OD-overlap        — rival flies the SAME origin→dest pair.
  //                           Strong pressure (we share the demand pool).
  //
  // Earlier this only checked (1), so a rival that opened a parallel
  // LHR↔DXB lane wasn't visible to the engine — the player's revenue
  // didn't move when a Hard bot started running the same lane. Now the
  // OD-overlap signal is dominant, and when a bot has zero recorded
  // routes (early-game / save migration) we still fall back on hub
  // pressure so the model stays continuous.
  const odK = odKey(route.originCode, route.destCode);
  let competitorPressure = 1.0;
  if (rivals && rivals.length > 0) {
    let pressure = 0;
    for (const rv of rivals) {
      const rvAttractiveness =
        (rv.brandPts / 100) * 0.5 + (rv.customerLoyaltyPct / 100) * 0.5;
      const rvHubs = new Set([rv.hubCode, ...(rv.secondaryHubCodes ?? [])]);
      // Only same-mode rival routes compete for the same demand pool:
      // a dedicated freighter does not split a passenger lane's pax
      // demand, and vice-versa. Belly cargo on passenger frames is
      // accounted for separately via the cargo-pool 70/30 split, so
      // the OD/endpoint signals here stay strictly passenger-vs-
      // passenger and cargo-vs-cargo.
      const rvActiveRoutes = rv.routes.filter(
        (r) =>
          (r.status === "active" || r.status === "pending") &&
          !!r.isCargo === !!route.isCargo,
      );
      // Direct OD overlap — the strongest signal. A rival flying our
      // exact LHR↔DXB lane splits the OD demand pool with us.
      const directOverlap = rvActiveRoutes.some(
        (r) => odKey(r.originCode, r.destCode) === odK,
      );
      // Endpoint touch — rival flies *from* one of our endpoints but to
      // a different city. Captures partial demand via connecting traffic.
      const endpointTouch =
        !directOverlap &&
        rvActiveRoutes.some(
          (r) =>
            r.originCode === origin.code ||
            r.destCode === origin.code ||
            r.originCode === dest.code ||
            r.destCode === dest.code,
        );
      const hubAtEndpoint = rvHubs.has(origin.code) || rvHubs.has(dest.code);

      if (directOverlap) {
        pressure += rvAttractiveness * 0.28; // strongest
      } else if (endpointTouch) {
        pressure += rvAttractiveness * 0.16;
      } else if (hubAtEndpoint) {
        // Legacy fallback when the rival has no recorded routes yet —
        // hub presence still signals competition.
        pressure += rvAttractiveness * 0.10;
      }
    }
    // Player's own attractiveness mitigates the pressure
    const ownAttractiveness =
      (team.brandPts / 100) * 0.5 + (team.customerLoyaltyPct / 100) * 0.5;
    competitorPressure = Math.max(0.45, 1 - pressure + ownAttractiveness * 0.15);
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
    const cargoCapacityMultiplier = isDoctrine(team, "cargo-dominance") ? 1.20 : 1.0;
    const tonnesSum = planes.reduce((sum, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      return sum + (spec?.cargoTonnes ?? 0) * cargoCapacityMultiplier;
    }, 0);
    const tonnesPerFlight = planes.length > 0 ? tonnesSum / planes.length : 0;
    const dailyCapacityT = tonnesPerFlight * route.dailyFrequency;
    // Cargo demand = min of the two cities' business demand (A4),
    // multiplied by per-city cargo-category event modifiers from the
    // structured news feed (e-commerce booms, port closures, etc.).
    const cargoFocusBonus = team.marketFocus === "cargo" ? 1.15 : 1.0;
    // V2: cargo network bonus applies on hub-touching segments for any
    //  non-Budget doctrine (v2Connecting). V1: cargo-dominance only.
    const applyCargoNetwork = airportSystemV2
      ? v2Connecting
      : isDoctrine(team, "cargo-dominance");
    const cargoNetworkBonus = applyCargoNetwork
      ? 1 + connectedCityDemandBonus(team, route)
      : 1.0;
    const cargoShockBonus = shockAdjustmentMultiplier(team, route, quarter, "cargo", totalRounds);
    const cargoEventA = cityEventImpact(route.originCode, quarter, totalRounds).cargo / 100;
    const cargoEventB = cityEventImpact(route.destCode, quarter, totalRounds).cargo / 100;
    // Cargo demand floor — see DEMAND_FLOOR_CARGO export at the top
    // of this file. Same logic as passenger but slightly higher
    // (25% vs 15%) because freight is more resilient to shocks.
    const cargoMultA = Math.max(DEMAND_FLOOR_CARGO, 1 + cargoEventA);
    const cargoMultB = Math.max(DEMAND_FLOOR_CARGO, 1 + cargoEventB);
    // Cargo seasonality (NEW): Q4 holiday peak +18%, Q1 post-holiday
    // -10%. Previously cargo was treated as flat year-round which
    // suppressed Q4 freight visibility — Black Friday/December peak
    // is the largest single seasonal pulse in real air freight.
    const cargoSeasonal = seasonalMultiplier(quarter).cargo;
    // Belly/freighter shared OD pool: when the team also has passenger
    // routes carrying belly cargo on this same OD, the freighter only
    // gets 70% of the pool (full pallets) and belly gets the remaining
    // 30% (parcels/mail). Avoids the 130%-of-pool double-count when
    // both modes are wired up. UI preview callers (no cargoPool ctx)
    // see the legacy "freighter takes all" behavior. `odK` is reused
    // from the competitorPressure block above — same key.
    const freighterPoolShare = cargoPool?.hasBellyOD.has(odK) ? 0.70 : 1.0;
    // Market maturity (§12) also dampens cargo, but more gently: the
    // floor for cargo is 35% at R1 (vs 15% for passenger) because
    // freight tends to track economic activity that already exists.
    // Same plateauRound as the passenger curve.
    const cargoMaturity = Math.max(0.35, marketMaturity(quarter, totalRounds));
    const cargoDemandT = Math.max(
      0,
      Math.min(
        cityBusinessAtQuarter(origin, quarter) * cargoMultA,
        cityBusinessAtQuarter(dest, quarter) * cargoMultB,
      ) * cargoFocusBonus * cargoNetworkBonus * cargoShockBonus * cargoSeasonal * freighterPoolShare * cargoMaturity,
    );
    const dailyTonnes = Math.max(0, Math.min(dailyCapacityT, cargoDemandT));
    const occupancy = dailyCapacityT > 0 ? Math.max(0, Math.min(1.0, dailyTonnes / dailyCapacityT)) : 0;
    // Cargo pricing now mirrors passenger fares — base $/tonne by haul
    // distance, scaled by the route's PricingTier (Budget/Standard/Premium/
    // Ultra → 0.5×/1.0×/1.5×/2.0×), and player-overridable per route via
    // route.cargoRatePerTonne. Previously cargo was a fixed $3.50/$5.50
    // with the Pricing Tier picker silently ignored — players asked
    // (rightly) where the fee control was.
    const baseCargoRate = distanceKm < 3000 ? 3.5 : 5.5;
    const tierMult = PRICE_TIER[route.pricingTier];
    const pricePerTonne = route.cargoRatePerTonne ?? baseCargoRate * tierMult;
    const quarterlyRevenue = dailyTonnes * pricePerTonne * 1000 * QUARTER_DAYS;
    // Storage cost instead of slot fees (A4)
    const storageCostByTier: Record<number, number> = { 1: 800_000, 2: 450_000, 3: 250_000, 4: 150_000 };
    const quarterlySlotCost =
      (storageCostByTier[origin.tier] ?? 150_000) +
      (storageCostByTier[dest.tier] ?? 150_000);

    // Fuel — see FUEL_BASELINE_USD_PER_L docstring; cargo + passenger
    // paths now share the same baseline.
    const fuelPricePerL = (fuelIndex / 100) * FUEL_BASELINE_USD_PER_L;
    const fuelBurnSumPerFlight = planes.reduce((sum, p) => {
      const spec = AIRCRAFT_BY_ID[p.specId];
      if (!spec) return sum;
      // Stack engine retrofit + eco + fuselage coating multiplicatively.
      // fuel/super engine = -10%, eco engine = -10%, fuselage coating = -10%
      // Real-world block-fuel factor applied at the leaf — see
      // FUEL_BURN_REAL_WORLD_FACTOR docstring.
      const fuelMult =
        (p.ecoUpgrade ? 0.9 : 1.0) *
        (p.engineUpgrade === "fuel" || p.engineUpgrade === "super" ? 0.9 : 1.0) *
        (p.fuselageUpgrade ? 0.9 : 1.0);
      return sum + spec.fuelBurnPerKm * FUEL_BURN_REAL_WORLD_FACTOR * fuelMult * distanceKm;
    }, 0);
    const totalFuelBurnPerFlight =
      planes.length > 0 ? fuelBurnSumPerFlight / planes.length : 0;
    // Per-city fuel tank coverage discount on cargo routes too — mirrors
    // the passenger path. Coverage-based discount precomputed per quarter
    // close (cityFuelDiscounts) and passed via `cityFuelDiscount`. UI
    // preview callers pass no map → 0 discount.
    const cargoCityDiscountFrac = cityFuelDiscount?.[route.originCode] ?? 0;
    const cargoFuelTankDiscount = 1 - cargoCityDiscountFrac;
    const cargoFuelBaselineCost =
      totalFuelBurnPerFlight * fuelPricePerL * route.dailyFrequency * QUARTER_DAYS;
    const quarterlyFuelCost = cargoFuelBaselineCost * cargoFuelTankDiscount;
    const cargoFuelTankSavings = cargoFuelBaselineCost - quarterlyFuelCost;

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
      // Per-class fields are zero for cargo routes (no passengers).
      dailyPaxFirst: 0,
      dailyPaxBus: 0,
      dailyPaxEcon: 0,
      quarterlyFirstRevenue: 0,
      quarterlyBusRevenue: 0,
      quarterlyEconRevenue: 0,
      occupancyFirst: 0,
      occupancyBus: 0,
      occupancyEcon: 0,
      // Cargo-only revenue split: all revenue is cargo, none passenger.
      // Belly fields stay 0 — cargo routes use the main hold, not the
      // belly of a passenger aircraft.
      bellyCargoRevenue: 0,
      bellyDailyTonnesUsed: 0,
      passengerRevenue: 0,
      cargoRevenue: quarterlyRevenue,
      fareFirst: 0,
      fareBus: 0,
      fareEcon: 0,
      seatsFirst: 0,
      seatsBus: 0,
      seatsEcon: 0,
      dailyDemandFirst: 0,
      dailyDemandBus: 0,
      dailyDemandEcon: 0,
      quarterlyFuelTankSavings: cargoFuelTankSavings,
    };
  }

  // ─ Passenger route (default) ───────────────────────────
  // Bug fix: previously summed seats across all planes and called the
  // result "seats per flight", then multiplied by dailyFrequency
  // (which is itself the sum of per-plane rotations / 7). With 2 planes
  // of 302 seats each at 7/wk apiece, that produced
  //   604 seats/flight × 2 flights/day = 1208 seats/day
  // when the truth is 302 × 2 = 604 seats/day. Each flight uses ONE
  // plane's seats, not all planes summed. Now we sum to get a fleet
  // total then divide by plane count to get an average seats-per-flight,
  // which is exact for homogeneous fleets and a reasonable
  // approximation for mixed.
  const seatsSum = { first: 0, bus: 0, econ: 0 };
  let seatedPlaneCount = 0;
  for (const p of planes) {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec) continue;
    // Honor per-instance custom seat allocation (set at purchase order).
    // Falls back to spec defaults when no override.
    const seats = p.customSeats ?? spec.seats;
    seatsSum.first += seats.first;
    seatsSum.bus += seats.business;
    seatsSum.econ += seats.economy;
    seatedPlaneCount += 1;
  }
  // Average seats-per-flight. Mix ratios are still computed from the
  // sum below — they're scale-invariant so they don't need this fix.
  const seatsPerFlight = seatedPlaneCount > 0
    ? {
        first: seatsSum.first / seatedPlaneCount,
        bus: seatsSum.bus / seatedPlaneCount,
        econ: seatsSum.econ / seatedPlaneCount,
      }
    : { first: 0, bus: 0, econ: 0 };
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

  let doctrineDemandBonus = shockAdjustmentMultiplier(team, route, quarter, "passenger", totalRounds);
  if (isDoctrine(team, "budget-expansion")) {
    doctrineDemandBonus *= tierTwoThreeDemandBonus(origin, dest);
  }
  // Hub-and-spoke connecting demand aggregation.
  //  V1: global-network only (legacy).
  //  V2: any non-Budget doctrine, but ONLY on hub-touching segments (v2Connecting).
  const applyConnectingPax = airportSystemV2
    ? v2Connecting
    : isDoctrine(team, "global-network");
  if (applyConnectingPax) {
    doctrineDemandBonus *= 1 + connectedCityDemandBonus(team, route);
  }
  if (isDoctrine(team, "global-network")) {
    const premiumCabinShare = totalSeatsPerFlight > 0
      ? (seatsPerFlight.first + seatsPerFlight.bus) / totalSeatsPerFlight
      : 0;
    doctrineDemandBonus *= 1 + 0.20 * premiumCabinShare;
  }

  // Cabin condition penalty (PRD update). If any plane on this route has
  // satisfactionPct < 30, knock 8% off demand. Below 50, knock 4%. Above 80
  // bonus 2%. Multiple planes pick the WORST condition (passengers
  // remember the bad flight).
  //
  // Cabin amenities (WiFi / Premium / Entertainment / Food) are
  // additive virtual bumps to each plane's effective satisfaction —
  // they don't drift like the base satisfactionPct does, so we add
  // them on top here rather than baking into the stored value.
  function effectiveSat(p: FleetAircraft): number {
    const base = p.satisfactionPct ?? 75;
    const a = p.cabinAmenities;
    if (!a) return base;
    let bump = 0;
    if (a.wifi) bump += 5;
    if (a.premiumSeating) bump += 8;
    if (a.entertainment) bump += 5;
    if (a.foodService) bump += 6;
    return Math.min(100, base + bump);
  }
  let cabinPenalty = 1.0;
  if (planes.length > 0) {
    const worstSat = Math.min(...planes.map(effectiveSat));
    if (worstSat < 30) cabinPenalty = 0.92;
    else if (worstSat < 50) cabinPenalty = 0.96;
    else if (worstSat >= 80) cabinPenalty = 1.02;
    // Premium-tier amenity stacking: when ALL planes on the route
    // have at least Premium Seating + Entertainment fitted, the
    // route earns a small additional uplift. Models the brand effect
    // of a consistent premium product across the fleet.
    const allPremium = planes.every(
      (p) => p.cabinAmenities?.premiumSeating && p.cabinAmenities?.entertainment,
    );
    if (allPremium) cabinPenalty *= 1.03;
  }

  // Defense-in-depth floor: demand can be flattened to zero by a stack
  // of negative news modifiers but should never go negative — there's
  // no such thing as anti-passengers. The upstream multiplier clamp
  // (computeRouteDemand) handles the common path; this catches any
  // future code that bypasses that helper.
  // Subsidiary demand premium — every demand-side subsidiary the player
  // owns at this route's endpoints lifts DEMAND (capped +25%). Earlier
  // this multiplied final revenue directly (`quarterlyRevenue *= subMult`),
  // which inflated takings even on a sold-out capacity-bound route where
  // extra demand can't translate to extra seats. A demand-side bonus must
  // lift demand and let the capacity clamp decide realized pax — exactly
  // the "multipliers drive demand, not revenue" principle.
  const subDemandMult = subsidiaryDemandMultiplier(team, route);
  const effectiveDemand = Math.max(
    0,
    demand.total * hubBonus * csMultiplier * loungeBonus * onboardingBonus *
      doctrineDemandBonus * cabinPenalty * subDemandMult,
  );

  // ── Per-class OD pools (Wave 3.2) ──────────────────────
  // Earlier the engine pooled all demand into one number, distributed
  // pax across cabins by seat-mix ratio, and reported a single load
  // factor. That hid two real-airline dynamics:
  //   1. Long-haul routes carry a higher business + first-class share
  //      than commuter routes — corporates pay for flat beds on a 12h
  //      flight, not on a 90min hop.
  //   2. Economy demand can't fill a first-class cabin, and vice versa.
  //      A long-haul widebody with too many first-class seats and a
  //      budget tier should leave the front empty, not magic-fill it.
  // Now each class has its own demand pool; capacity clamps per class;
  // yield management lifts each class's fare independently.
  const shares = classDemandShares(distanceKm, origin.tier, dest.tier);

  // Pricing-tier multiplier — hoisted above the demand pools so price
  // elasticity (below) can compare the chosen fare to the standard fare.
  const tier = PRICE_TIER[route.pricingTier];

  // ── Price elasticity of demand (realism fix — P1/P2) ───────
  // The model previously had yield management (fares rise when a cabin
  // is oversold) but NO elasticity (demand never fell when the player
  // raised fares). That let a player set Ultra pricing (2.0× the
  // standard fare) and STILL fill 100% of seats — doubling revenue for
  // free. Aggregate fuel collapsed to ~3% of revenue, net margins ran
  // ~47%, and a plane paid back its purchase in 1-2 quarters. Real
  // airlines lose passengers when they price above the market.
  //
  // We compare the player's chosen fare (pricing tier × distance curve,
  // or a manual per-route override) against the STANDARD-tier fare for
  // the same distance, and bend each cabin's demand by that ratio
  // raised to a negative elasticity exponent. Economy is the most
  // price-sensitive (leisure/price-shoppers), first the least
  // (corporate/last-minute). At STANDARD tier with no override the
  // ratio is exactly 1.0 → multiplier 1.0 → balanced play is untouched;
  // only fare-tier exploitation is disciplined. Clamped so a deep
  // discount can't manufacture infinite demand, nor a high fare zero it.
  const stdEconBase  = classFareRange(distanceKm, "econ").base;
  const stdBusBase   = classFareRange(distanceKm, "bus").base;
  const stdFirstBase = classFareRange(distanceKm, "first").base;
  const chosenEconBase  = route.econFare  ?? stdEconBase  * tier;
  const chosenBusBase   = route.busFare   ?? stdBusBase   * tier;
  const chosenFirstBase = route.firstFare ?? stdFirstBase * tier;
  const elasticityMult = (chosen: number, std: number, magnitude: number) =>
    std <= 0 || chosen <= 0 ? 1 : clamp(0.15, 3.0, Math.pow(chosen / std, -magnitude));

  // ── Dynamic elasticity magnitude (P1/P2 follow-up) ─────────
  // A fixed exponent was too crude: it punished a global-hub premium
  // carrier with fierce loyalty exactly as hard as a budget carrier on a
  // contested small-city leisure route. Real price tolerance is not a
  // constant. We keep the per-cabin BASE magnitudes (economy most
  // sensitive, first least) as a neutral mid-carrier baseline, then
  // modulate every cabin by five real signals. A factor < 1 means LESS
  // elastic (the airline can push Ultra fares and keep its seats); > 1
  // means MORE elastic (raising fares bleeds passengers fast).
  //
  //   1. City tier   — tier-1 hubs carry captive corporate/premium demand
  //                    (less elastic); tier-4 leisure markets price-shop
  //                    (more elastic). Averaged across origin + dest.
  //   2. Doctrine    — premium-service tolerates high fares (×0.65);
  //                    budget-expansion is hyper price-sensitive (×1.35);
  //                    global-network / cargo / connecting sit in the
  //                    middle (×1.0).
  //   3. Brand+loyalty — derived from the brand multiplier (which already
  //                    folds customer loyalty). At A+ (m≥1.6) tolerance
  //                    collapses to the floor → the airline "gets away
  //                    with" Ultra pricing; a weak brand is punished
  //                    harder than baseline.
  //   4. Haul        — long-haul has fewer substitutes and more corporate
  //                    demand (less elastic); short-haul competes with
  //                    rail/car/rival hops (more elastic).
  //   5. Competition — a contested route (low competitorPressure) gives
  //                    passengers alternatives → more elastic; a route the
  //                    airline owns outright → pricing power → less elastic.
  const avgCityTier = (origin.tier + dest.tier) / 2; // 1 (global) .. 4 (small)
  const cityTierFactor = clamp(0.80, 1.20, 0.70 + 0.12 * avgCityTier);

  const elasticDoctrine = activeDoctrineId(team.doctrine);
  const doctrineFactor =
    elasticDoctrine === "premium-service"  ? 0.65 :
    elasticDoctrine === "budget-expansion" ? 1.35 :
    1.0; // global-network / cargo / connecting / none → middle

  // Brand multiplier 0.40..1.80 → normalized 0..1 → tolerance 1.35..floor.
  // A+ (m≥1.6 ⇒ brandNorm≈0.86) lands on the 0.06 floor → near-immune to
  // fare hikes, exactly the "A+ loyalty can charge Ultra" intent.
  const brandNorm = clamp(0, 1, (computeBrandMultiplier(team) - 0.40) / 1.40);
  const brandToleranceFactor = clamp(0.06, 1.35, 1.35 - 1.50 * brandNorm);

  const haulFactor = clamp(0.90, 1.12, 1.10 - (distanceKm - 1500) / 30000);

  // competitorPressure: ~0.45 (fierce) .. ~1.15 (uncontested), computed
  // above in the demand block. Invert into elasticity space.
  const competitionFactor = clamp(0.85, 1.25, 1.0 + (1.0 - competitorPressure) * 0.60);

  //   6. Market thickness (flights to the city) — total weekly flights
  //      serving a city, frequency-weighted, across our own network AND
  //      rivals. The relationship is QUADRATIC, not linear:
  //        • Few flights → travelers are captive to a single point of
  //          travel; the one daily departure has no substitute, so the
  //          market is LESS elastic (a fare hike doesn't send them
  //          elsewhere — there is no elsewhere).
  //        • As flights multiply, options appear and demand spreads across
  //          them → MORE elastic (price-shopping between frequencies/
  //          carriers gets easy). The steepest sensitivity is at LOW
  //          counts — adding the 2nd daily flight matters far more than the
  //          40th.
  //        • At very high density, connecting travel swells the total pool
  //          (a thick city feeds onward journeys), which lifts volume and
  //          eases the elasticity back a touch off its peak — the inverted
  //          tail of the parabola.
  //      Averaged across origin + dest so the route's tolerance reflects
  //      the substitutes available at BOTH endpoints.
  const weeklyFlightsAt = (code: string): number => {
    let f = 0;
    for (const r of team.routes) {
      if (r.status === "closed") continue;
      if (r.originCode === code || r.destCode === code) f += r.dailyFrequency * 7;
    }
    if (rivals) {
      for (const rv of rivals) {
        for (const r of rv.routes) {
          if (r.status === "closed") continue;
          if (r.originCode === code || r.destCode === code) f += r.dailyFrequency * 7;
        }
      }
    }
    return f;
  };
  // REF ≈ 140 weekly flights (~20 daily departures touching the city) = a
  // thick, well-served market. x is the normalized market thickness 0..1.
  const FLIGHTS_REF = 140;
  const flightsX = clamp(
    0,
    1,
    (weeklyFlightsAt(route.originCode) + weeklyFlightsAt(route.destCode)) / 2 / FLIGHTS_REF,
  );
  // Quadratic: 0.85 + 1.10x − 0.70x²  → peaks ≈1.28 at x≈0.79, eases to 1.25
  // at full saturation (the connecting-volume tail). Floored captive markets
  // at 0.82, capped at 1.30.
  const flightsFactor = clamp(
    0.82,
    1.30,
    0.85 + 1.10 * flightsX - 0.70 * flightsX * flightsX,
  );

  const elasticityContext =
    cityTierFactor * doctrineFactor * brandToleranceFactor * haulFactor *
    competitionFactor * flightsFactor;

  // Per-cabin neutral baselines, scaled by the composite context and
  // floored so the exponent can't invert (a fare hike must never raise
  // demand) nor explode into an absurd cliff.
  const ELASTICITY_ECON  = clamp(0.03, 3.50, 1.3 * elasticityContext);
  const ELASTICITY_BUS   = clamp(0.03, 3.50, 0.6 * elasticityContext);
  const ELASTICITY_FIRST = clamp(0.03, 3.50, 0.4 * elasticityContext);

  const dailyDemandFirst = effectiveDemand * shares.first *
    elasticityMult(chosenFirstBase, stdFirstBase, ELASTICITY_FIRST);
  const dailyDemandBus   = effectiveDemand * shares.bus *
    elasticityMult(chosenBusBase, stdBusBase, ELASTICITY_BUS);
  const dailyDemandEcon  = effectiveDemand * shares.econ *
    elasticityMult(chosenEconBase, stdEconBase, ELASTICITY_ECON);

  const dailyCapacityFirst = seatsPerFlight.first * route.dailyFrequency;
  const dailyCapacityBus   = seatsPerFlight.bus   * route.dailyFrequency;
  const dailyCapacityEcon  = seatsPerFlight.econ  * route.dailyFrequency;

  // ── Achievable load-factor ceiling by pricing tier (2026-05 rebalance) ──
  // Pricing above the standard market fare EMPTIES seats even when raw
  // demand exceeds capacity. On hot routes the OD demand pool is many
  // times the cabin, so the demand-pool elasticity above never pulls
  // realized demand below the seats — the route stays sold out and
  // revenue scales linearly with the fare-tier multiplier (Ultra = 2×
  // fare = 2× revenue, a pure printer that paid an A380 back in <1 year).
  // Real carriers can't fill a cabin at 2× the going rate. This ceiling
  // caps the SELLABLE fraction of each cabin as a function of how far
  // above standard the player is pricing, so Ultra becomes a genuine
  // yield-vs-load-factor tradeoff. Premium cabins are far less load-
  // sensitive (corporate / last-minute pays); a strong brand and a
  // premium-service doctrine lift the ceiling (people still fly you at a
  // premium). Budget/Standard tiers are uncapped (ceiling 1.0).
  //   tier multiplier: budget 0.5 · standard 1.0 · premium 1.5 · ultra 2.0
  const loadCeil = (econBase: number, busBase: number, firstBase: number) => {
    // brandNorm (0..1) and elasticDoctrine are computed above.
    const brandLift = brandNorm * 0.16;
    const doctrineLift = elasticDoctrine === "premium-service" ? 0.06 : 0;
    return {
      econ:  clamp(0.30, 1, econBase  + brandLift + doctrineLift),
      bus:   clamp(0.30, 1, busBase   + brandLift + doctrineLift),
      first: clamp(0.30, 1, firstBase + brandLift + doctrineLift),
    };
  };
  const ceil =
    tier >= 2.0 ? loadCeil(0.50, 0.58, 0.66) :   // Ultra
    tier >= 1.5 ? loadCeil(0.72, 0.80, 0.84) :   // Premium
    { econ: 1, bus: 1, first: 1 };               // Standard / Budget — uncapped
  const sellableEcon  = dailyCapacityEcon  * ceil.econ;
  const sellableBus   = dailyCapacityBus   * ceil.bus;
  const sellableFirst = dailyCapacityFirst * ceil.first;

  let dailyPaxFirst = Math.max(0, Math.min(sellableFirst, dailyDemandFirst));
  let dailyPaxBus   = Math.max(0, Math.min(sellableBus,   dailyDemandBus));
  let dailyPaxEcon  = Math.max(0, Math.min(sellableEcon,  dailyDemandEcon));

  // Tournament demand boost (PRD §10.3): the World Cup and Olympics each
  // have a single neutral host city chosen at game start (tier 1-2,
  // never a player or rival hub). The boost applies ONLY to routes
  // touching that host city. The S10 winner ("global_brand") gets the
  // strongest version on the main rounds; other airlines flying that
  // city still get a smaller surge from event traffic. Boost lifts
  // per-class pax (clamped by per-class capacity) so a premium-heavy
  // carrier sees the front fill on World Cup routes too.
  const touchesWorldCup =
    worldCupHostCode &&
    (route.originCode === worldCupHostCode || route.destCode === worldCupHostCode);
  const touchesOlympic =
    olympicHostCode &&
    (route.originCode === olympicHostCode || route.destCode === olympicHostCode);

  function liftAllClasses(mult: number) {
    if (mult === Infinity) {
      dailyPaxFirst = dailyCapacityFirst;
      dailyPaxBus   = dailyCapacityBus;
      dailyPaxEcon  = dailyCapacityEcon;
    } else {
      dailyPaxFirst = Math.min(dailyCapacityFirst, dailyPaxFirst * mult);
      dailyPaxBus   = Math.min(dailyCapacityBus,   dailyPaxBus   * mult);
      dailyPaxEcon  = Math.min(dailyCapacityEcon,  dailyPaxEcon  * mult);
    }
  }

  if (touchesWorldCup && quarter >= 19 && quarter <= 24) {
    if (team.flags?.has("global_brand")) {
      if (quarter <= 22) liftAllClasses(Infinity);    // sealed at 100%
      else               liftAllClasses(1.5);
    } else {
      liftAllClasses(1.25);
    }
  }
  if (touchesOlympic && quarter >= 29 && quarter <= 32) {
    if (team.flags?.has("premium_airline")) {
      liftAllClasses(Infinity);                       // sealed at 100%
    } else {
      liftAllClasses(1.18);
    }
  }

  // Underdog Boost — load factor floor (Brief §13).
  //   Sneeeko (1.0)     → seal every seat for 4Q
  //   Documentary (1.2) → +20% lift on all routes for 3Q
  // Capacity-bounded: this is "fill the cabin", not "manufacture
  // passengers". Each class clamps to its own capacity in liftAllClasses.
  const underdogFloor = activeLoadFactorFloor(team, quarter);
  if (underdogFloor >= 1.0) {
    if (underdogFloor === 1.0) liftAllClasses(Infinity);
    else liftAllClasses(underdogFloor);
  }

  const dailyPax = dailyPaxFirst + dailyPaxBus + dailyPaxEcon;
  // Cap at 1.0 — earlier the engine clamped to 0.98 to reserve a
  // "no-show buffer" but the player saw "98%" on every hot route and
  // assumed it was a UI cap. Real overbooked flights routinely hit
  // 100%. Floor at 0 because load is a [0,1] ratio.
  const occupancy =
    dailyCapacity > 0 ? Math.max(0, Math.min(1.0, dailyPax / dailyCapacity)) : 0;

  // ─ Per-class fares (A7 + A11) ──────────────────────────
  // `tier` is hoisted above the demand pools (price elasticity needs it).
  let econFare = route.econFare ?? classFareRange(distanceKm, "econ").base * tier;
  let busFare = route.busFare ?? classFareRange(distanceKm, "bus").base * tier;
  let firstFare = route.firstFare ?? classFareRange(distanceKm, "first").base * tier;

  // ── Yield management (per-class) — when one cabin's demand exceeds
  //    its own capacity, real airlines lift THAT cabin's fare via
  //    last-minute inventory restriction. Earlier the engine used
  //    aggregate pressure, which lifted economy fares on a route
  //    where only first-class was hot, and vice versa. Now each cabin
  //    flexes independently. Premium cabins flex harder because
  //    corporate trips are less price-sensitive last-minute.
  function yieldLift(demand: number, capacity: number, max: number, slope: number): number {
    if (capacity <= 0 || demand <= capacity) return 1;
    const pressure = Math.min(2.0, demand / capacity);
    return 1 + Math.min(max, (pressure - 1.0) * slope);
  }
  econFare  *= yieldLift(dailyDemandEcon,  dailyCapacityEcon,  0.15, 0.30);
  busFare   *= yieldLift(dailyDemandBus,   dailyCapacityBus,   0.20, 0.40);
  firstFare *= yieldLift(dailyDemandFirst, dailyCapacityFirst, 0.25, 0.50);

  // Blended ticket price used by market share / demand sensitivity.
  // Weighted by seat mix so premium-heavy fleets surface a higher
  // average ticket price in the route summary.
  const seatMix = totalSeatsPerFlight > 0
    ? {
        f: seatsPerFlight.first / totalSeatsPerFlight,
        b: seatsPerFlight.bus / totalSeatsPerFlight,
        e: seatsPerFlight.econ / totalSeatsPerFlight,
      }
    : { f: 0, b: 0, e: 1 };
  const ticketPrice =
    firstFare * seatMix.f + busFare * seatMix.b + econFare * seatMix.e;

  // Revenue: per-class pax × per-class fare. Pax come from the
  // class-vs-class clamps above, NOT from a single pooled occupancy
  // distributed by seat-mix.
  const quarterlyFirstPax = dailyPaxFirst * QUARTER_DAYS;
  const quarterlyBusPax   = dailyPaxBus   * QUARTER_DAYS;
  const quarterlyEconPax  = dailyPaxEcon  * QUARTER_DAYS;
  // Subsidiary demand premium is applied to the DEMAND pool above
  // (`effectiveDemand`), not here — so on a sold-out route it can't
  // manufacture revenue beyond the seats actually available.
  let quarterlyRevenue =
    quarterlyFirstPax * firstFare +
    quarterlyBusPax * busFare +
    quarterlyEconPax * econFare;

  // ─ Cargo-belly contribution on passenger flights ──────────
  // Players can fit a Standard or Expanded cargo belly on each
  // passenger airframe at order time. The belly tonnage scales with
  // seat-class-equivalent capacity (5/10/20/25 tons depending on
  // total seats; expanded = 1.5×). Belly cargo CONSUMES from the
  // route's cargo demand (lower of demand & belly capacity), prices
  // at 80% of dedicated cargo fares (passenger jets carry mail and
  // small parcels, not full pallets), and adds to revenue with no
  // additional fuel cost since the airframes are already flying.
  let bellyCargoRevenue = 0;
  let bellyCargoTonnesUsed = 0;
  const bellyCapacityMultiplier = isDoctrine(team, "cargo-dominance") ? 1.20 : 1.0;
  // Belly cargo capacity must be AVERAGED across the assigned passenger
  // aircraft (the same pattern seats and fuel use above), NOT summed.
  // Each flight uses ONE plane's belly hold; multiplying by
  // route.dailyFrequency already accounts for the multi-flight scaling.
  // The previous version summed across planes AND multiplied by
  // frequency — on a 2-plane route this was 2× the real belly capacity
  // (and revenue), warping the cargo economy on every multi-aircraft
  // passenger route.
  let passengerPlaneCount = 0;
  const bellyTonnesSum = planes.reduce((sum, p) => {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec || spec.family !== "passenger") return sum;
    passengerPlaneCount += 1;
    const totalSeats = (p.customSeats?.first ?? spec.seats.first)
      + (p.customSeats?.business ?? spec.seats.business)
      + (p.customSeats?.economy ?? spec.seats.economy);
    return sum + cargoBellyTonnes(totalSeats, p.cargoBelly) * bellyCapacityMultiplier;
  }, 0);
  const totalBellyTonnesPerFlight = passengerPlaneCount > 0
    ? bellyTonnesSum / passengerPlaneCount
    : 0;
  if (totalBellyTonnesPerFlight > 0) {
    const bellyDailyCapacity = totalBellyTonnesPerFlight * route.dailyFrequency;
    // Cargo demand at this OD pair (re-using the cargo path's demand
    // formula) — clamps via DEMAND_FLOOR_CARGO so a belly never sees
    // a full zero on a route the engine is otherwise running.
    const cargoEventA = cityEventImpact(route.originCode, quarter, totalRounds).cargo / 100;
    const cargoEventB = cityEventImpact(route.destCode, quarter, totalRounds).cargo / 100;
    const bellyMultA = Math.max(DEMAND_FLOOR_CARGO, 1 + cargoEventA);
    const bellyMultB = Math.max(DEMAND_FLOOR_CARGO, 1 + cargoEventB);
    // Belly demand is the parcels/mail share (~30%) of full-cargo
    // demand on this OD. Belly cargo doesn't compete with a freighter's
    // pallet-sized hold for the same shipments — short parcels and
    // mail flow with passenger jets, full pallets flow with freighters.
    // Wave 3.2 paired this with the freighter path: when both modes
    // serve the same OD the freighter takes 70% of pool, belly takes
    // 30%. Without a freighter, belly is *still* capped at 30% (that's
    // the parcels-mail market — the rest of the demand is unmet by
    // belly alone, since shippers won't pay belly rates for full
    // pallets). Cargo seasonality (Q4 +18% / Q1 −10%) layers on top.
    const bellySeasonal = seasonalMultiplier(quarter).cargo;
    const cargoDemandT = Math.min(
      cityBusinessAtQuarter(origin, quarter) * bellyMultA,
      cityBusinessAtQuarter(dest, quarter) * bellyMultB,
    ) * 0.30 * bellySeasonal *
      ((airportSystemV2 ? v2Connecting : isDoctrine(team, "cargo-dominance"))
        ? 1 + connectedCityDemandBonus(team, route)
        : 1) *
      shockAdjustmentMultiplier(team, route, quarter, "cargo", totalRounds);
    const dailyTonnesUsed = Math.max(0, Math.min(bellyDailyCapacity, cargoDemandT));
    bellyCargoTonnesUsed = dailyTonnesUsed * QUARTER_DAYS;
    // Belly pricing: 80% of dedicated cargo rate (parcels/mail vs full
    // pallets), scaled by route pricing tier same as passenger fares.
    // Phase 1A: the player can OVERRIDE the belly rate via the same
    // route.cargoRatePerTonne field that the cargo-route slider uses.
    // On a passenger route, the slider's default lands at this 0.80×
    // tier-base value; setting a higher rate extracts more belly
    // revenue at the cost of suppressing belly tonnes vs rivals (the
    // dampening happens in the demand pool at routeDemandPerDay, so
    // it's already in place — no separate elasticity model needed for
    // this v1 of the editor).
    const baseCargoRate = distanceKm < 3000 ? 3.5 : 5.5;
    const tierMult = PRICE_TIER[route.pricingTier];
    const defaultBellyRate = baseCargoRate * tierMult * 0.80;
    const pricePerTonne = route.cargoRatePerTonne ?? defaultBellyRate;
    bellyCargoRevenue = bellyCargoTonnesUsed * pricePerTonne * 1000;
    quarterlyRevenue += bellyCargoRevenue;
  }

  // Fuel — calibrated to real-world Jet A1 ($0.55–$0.85/L). At
  // fuelIndex=100 (baseline) the price is FUEL_BASELINE_USD_PER_L.
  // Earlier passenger path used $0.18/L which made fuel a footnote
  // in the P&L; the cargo path was already at $0.55/L. Both paths
  // now share FUEL_BASELINE_USD_PER_L so a 10kL Atlantic crossing
  // shows a real $5,500 fuel bill instead of $1,800.
  const fuelPricePerL = (fuelIndex / 100) * FUEL_BASELINE_USD_PER_L;
  const fuelBurnSumPerFlight = planes.reduce((sum, p) => {
    const spec = AIRCRAFT_BY_ID[p.specId];
    if (!spec) return sum;
    // Stack engine retrofit + eco + fuselage coating multiplicatively.
    // Real-world block-fuel factor applied at the leaf — see
    // FUEL_BURN_REAL_WORLD_FACTOR docstring.
    const fuelMult =
      (p.ecoUpgrade ? 0.9 : 1.0) *
      (p.engineUpgrade === "fuel" || p.engineUpgrade === "super" ? 0.9 : 1.0) *
      (p.fuselageUpgrade ? 0.9 : 1.0);
    const burn = spec.fuelBurnPerKm * FUEL_BURN_REAL_WORLD_FACTOR * fuelMult * distanceKm;
    return sum + burn;
  }, 0);
  const totalFuelBurnPerFlight =
    planes.length > 0 ? fuelBurnSumPerFlight / planes.length : 0;
  // Apply S4 hedge if flag set
  const hedge = team.flags.has("hedged_12m")
    ? 100 / fuelIndex
    : team.flags.has("hedged_6m")
      ? 100 / fuelIndex
      : team.flags.has("hedged_50_50")
        ? (100 / fuelIndex + 1) / 2
        : 1;
  // Per-city fuel tanks (redesign 2026-05): the origin city's installed
  // tanks deliver a COVERAGE-based discount on every route departing it:
  //   discount = tierMaxDiscount × min(1, cityCapacityL / cityBurnL)
  // computed once per quarter-close (cityFuelDiscounts) and passed in via
  // `cityFuelDiscount`. Compute the un-discounted cost first so the route
  // detail modal can show the savings explicitly ("Fuel $1.8M (saved
  // $0.4M via city fuel tanks)"). UI preview callers pass no map → 0.
  const cityDiscountFrac = cityFuelDiscount?.[route.originCode] ?? 0;
  const fuelTankDiscount = 1 - cityDiscountFrac;
  const fuelBaselineCost =
    totalFuelBurnPerFlight * fuelPricePerL *
    route.dailyFrequency * QUARTER_DAYS * hedge;
  const quarterlyFuelCost = fuelBaselineCost * fuelTankDiscount;
  const fuelTankSavings = fuelBaselineCost - quarterlyFuelCost;

  // Slot fees (PRD update — Model B): the per-route slot cost is now zero
  // because slot fees are charged ONCE per quarter at the team level (sum
  // of all leased slots × weekly rent × 13 weeks). The route still
  // "consumes" weekly_freq slots at each endpoint but that's a capacity
  // check against team.airportLeases, not a per-route fee.
  const quarterlySlotCost = 0;

  const quarterlyProfit = quarterlyRevenue - quarterlyFuelCost - quarterlySlotCost;

  // ── Per-class quarterly revenue + occupancy (Phase 1A) ──────
  // Identical math to the blended `quarterlyRevenue` above, just kept
  // unaggregated so the route detail modal can render the breakdown.
  // We compute these AFTER the post-yield fares are finalised because
  // yield management can shift fares per cabin.
  const quarterlyFirstRevenue = quarterlyFirstPax * firstFare;
  const quarterlyBusRevenue   = quarterlyBusPax   * busFare;
  const quarterlyEconRevenue  = quarterlyEconPax  * econFare;
  const occupancyFirst =
    dailyCapacityFirst > 0
      ? Math.max(0, Math.min(1.0, dailyPaxFirst / dailyCapacityFirst))
      : 0;
  const occupancyBus =
    dailyCapacityBus > 0
      ? Math.max(0, Math.min(1.0, dailyPaxBus / dailyCapacityBus))
      : 0;
  const occupancyEcon =
    dailyCapacityEcon > 0
      ? Math.max(0, Math.min(1.0, dailyPaxEcon / dailyCapacityEcon))
      : 0;
  // Revenue split: passenger fares vs belly cargo. Net of any
  // refunds the engine would have surfaced (none today). Sums match
  // the headline `quarterlyRevenue` to the cent.
  const passengerRevenue =
    quarterlyFirstRevenue + quarterlyBusRevenue + quarterlyEconRevenue;
  // bellyCargoRevenue is already accumulated above; bellyCargoTonnesUsed
  // is in quarterly units. Expose the daily rate too because that's
  // the form the player intuitively reads ("8.4 t/day of belly").
  const bellyDailyTonnesUsed =
    QUARTER_DAYS > 0 ? bellyCargoTonnesUsed / QUARTER_DAYS : 0;

  return {
    distanceKm,
    dailyDemand: effectiveDemand,
    dailyCapacity,
    occupancy,
    dailyPax,
    ticketPrice,
    quarterlyRevenue,
    quarterlyFuelCost,
    quarterlySlotCost,
    quarterlyProfit,
    // Per-class drill-down (Phase 1A)
    dailyPaxFirst,
    dailyPaxBus,
    dailyPaxEcon,
    quarterlyFirstRevenue,
    quarterlyBusRevenue,
    quarterlyEconRevenue,
    occupancyFirst,
    occupancyBus,
    occupancyEcon,
    bellyCargoRevenue,
    bellyDailyTonnesUsed,
    passengerRevenue,
    cargoRevenue: bellyCargoRevenue,
    fareFirst: firstFare,
    fareBus: busFare,
    fareEcon: econFare,
    seatsFirst: seatsPerFlight.first,
    seatsBus: seatsPerFlight.bus,
    seatsEcon: seatsPerFlight.econ,
    dailyDemandFirst,
    dailyDemandBus,
    dailyDemandEcon,
    quarterlyFuelTankSavings: fuelTankSavings,
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
/**
 * Book value depreciation curve.
 *
 * Phase E (May 26 2026) — applied a steep first-quarter step-down
 * so "fresh planes" can't be flipped without realising a meaningful
 * loss. Pre-Phase-E the curve was a flat 1.25%/quarter compound
 * decay, meaning a 1-quarter-old plane was worth ~98.75% of its
 * purchase price — selling it back to the broker even at full
 * book value was nearly break-even. Players exploited this by
 * over-ordering and re-listing the surplus for almost no loss.
 *
 * The new curve mirrors real aircraft depreciation more honestly:
 *
 *   q=0   (just purchased)    100% of purchase
 *   q=1   (one quarter later)  80% of purchase  ← step-down ("drive off the lot")
 *   q=2   (two quarters later) ~78.8%
 *   q=N   (N quarters later)   80% × 0.985^(N-1), floored at 10%
 *
 * So a player who buys at $25M, lists for resale next quarter and
 * gets broker-bought at 75% of book = 0.75 × $20M = $15M proceeds
 * = $10M realised loss (40% of purchase price). That's the
 * "flipping is expensive" signal the previous curve missed.
 *
 * Aircraft older than ~25 quarters still hit the 10% floor (a
 * 28-quarter-old plane near retirement is worth scrap value
 * regardless). Nothing in the game economy assumes a higher
 * floor.
 */
export function depreciateBookValue(
  purchasePrice: number,
  quartersSincePurchase: number,
): number {
  const floor = purchasePrice * 0.1;
  // Brand-new (q=0): full purchase price.
  if (quartersSincePurchase <= 0) return purchasePrice;
  // First quarter: 20% drop ("new car" depreciation).
  // From q=1 onwards: 1.5% per quarter compounding on top of the
  // initial 80%.
  const firstQuarterValue = purchasePrice * 0.80;
  const decayed = firstQuarterValue * Math.pow(0.985, quartersSincePurchase - 1);
  return Math.max(floor, decayed);
}

/**
 * Broker resale economics (P6 — May 30 2026).
 *
 * The old model let the player pick any asking price on a slider (up to
 * 120% of new-build list), which made resale feel "VERY high" — a near-new
 * plane could be dumped for close to book and barely realise a loss.
 *
 * New model: no slider, no negotiation. The broker quotes ONE price, a
 * haircut off the airframe's CURRENT book value (broker margin + the
 * liquidity discount of an off-market quick sale). The player has exactly
 * two choices:
 *
 *   • Sell to broker  →  BROKER_RESALE_PCT × book. The broker takes the
 *                        plane to the open market (re-lists it for other
 *                        airlines to buy). Player cashes out now.
 *   • Salvage         →  half the broker quote (= 0.5 × BROKER_RESALE_PCT
 *                        × book). The airframe is scrapped — it never goes
 *                        on the market, so a rival can't pick it up cheap.
 *
 * 50% of book is a deliberate, legible discount: a one-quarter-old plane
 * (book ≈ 80% of purchase) fetches ≈ 40% of what was paid — flipping is
 * clearly a loss, holding-to-operate is the rational play.
 */
export const BROKER_RESALE_PCT = 0.5;
/** Salvage proceeds = this fraction of the broker quote (half). */
export const SALVAGE_FRACTION_OF_BROKER = 0.5;

/** The broker's one-and-only cash quote for an owned airframe. */
export function brokerResaleQuoteUsd(bookValueUsd: number): number {
  return Math.max(0, Math.round(bookValueUsd * BROKER_RESALE_PCT));
}
/** Salvage proceeds — half the broker quote, airframe leaves the game. */
export function salvageQuoteUsd(bookValueUsd: number): number {
  return Math.max(0, Math.round(brokerResaleQuoteUsd(bookValueUsd) * SALVAGE_FRACTION_OF_BROKER));
}

// ─── Interest (PRD §5.7) ───────────────────────────────────
export function effectiveBorrowingRate(team: Team, baseRatePct: number): number {
  // Lenders price against book equity, not brand-multiplied valuation
  const equity = computeNetEquityUsdSafe(team);
  const debtRatio = equity > 0 ? team.totalDebtUsd / equity : 1;
  let premium = 0.5;
  if (debtRatio >= 1.0) premium = 10.0;
  else if (debtRatio >= 0.85) premium = 7.0;
  else if (debtRatio >= 0.7) premium = 5.0;
  else if (debtRatio >= 0.5) premium = 3.0;
  else if (debtRatio >= 0.3) premium = 1.5;

  let brandAdj = 0;
  if (team.brandPts > 80) brandAdj = -0.5;
  else if (team.brandPts < 25) brandAdj = 2.0;
  else if (team.brandPts < 50) brandAdj = 1.0;

  return baseRatePct + premium + brandAdj;
}

export function quarterlyInterestUsd(team: Team, baseRatePct: number): number {
  const fallbackRate = effectiveBorrowingRate(team, baseRatePct);
  const tracked = (team.loans ?? []).reduce((acc, loan) => {
    const principal = Math.max(0, loan.remainingPrincipal ?? 0);
    const rate = Number.isFinite(loan.ratePct) ? loan.ratePct : fallbackRate;
    return {
      principal: acc.principal + principal,
      interest: acc.interest + principal * (rate / 100) / 4,
    };
  }, { principal: 0, interest: 0 });
  const untrackedDebt = Math.max(0, team.totalDebtUsd - tracked.principal);
  return tracked.interest + untrackedDebt * (fallbackRate / 100) / 4;
}

export function maxBorrowingUsd(team: Team): number {
  // Borrowing headroom is the strictest of book-equity and
  // player-facing value covenants. This keeps brand-inflated airline
  // value from turning debt into a free expansion exploit.
  const bookEquity = computeNetEquityUsdSafe(team);
  const airlineValue = computeAirlineValue(team);
  const bookCap = Math.max(0, bookEquity * 0.45);
  const valueCap = Math.max(0, airlineValue * 0.40);
  return Math.max(0, Math.min(bookCap, valueCap) - team.totalDebtUsd);
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
  const positiveCash = Math.max(0, team.cashUsd);
  const positiveDebt = Math.max(0, team.totalDebtUsd);
  const liquidityBase = positiveCash + positiveDebt;
  const cashRatioScore = liquidityBase > 0
    ? clamp(0, 100, (positiveCash / liquidityBase) * 100)
    : 50;
  const airlineValue = computeAirlineValue(team);
  const debtRatioScore = positiveDebt <= 0
    ? 100
    : clamp(
        0,
        100,
        airlineValue > 0 ? 100 - (positiveDebt / airlineValue) * 100 : 0,
      );
  const revGrowth = 50;

  const financialHealth = clamp(
    0,
    120,
    cashRatioScore * 0.3 + debtRatioScore * 0.35 + revGrowth * 0.35,
  );

  const brandPtsScore = Math.min(100, team.brandPts / 2);
  const customerLoyalty = team.customerLoyaltyPct;
  let reputationEvents = 100;
  if (team.flags.has("trusted_operator")) reputationEvents += 10;
  if (team.flags.has("green_leader")) reputationEvents += 15;
  if (team.flags.has("people_first")) reputationEvents += 8;
  if (team.flags.has("anti_environment")) reputationEvents -= 15;
  reputationEvents = Math.max(0, Math.min(120, reputationEvents));

  const brandHealth = clamp(
    0,
    120,
    brandPtsScore * 0.4 + customerLoyalty * 0.35 + reputationEvents * 0.25,
  );

  const opsPtsScore = Math.min(100, team.opsPts);
  const activeFleet = team.fleet.filter((f) => f.status === "active");
  const modernFleetCount = activeFleet.filter((f) => {
    const spec = AIRCRAFT_BY_ID[f.specId];
    return spec && spec.unlockQuarter >= 8;
  }).length;
  const fleetEfficiency =
    activeFleet.length > 0 ? (modernFleetCount / activeFleet.length) * 100 : 0;
  const staffCommitment = Math.min(100, team.sliders.staff * 10 + 50);

  const operationsHealth = clamp(
    0,
    120,
    opsPtsScore * 0.4 + fleetEfficiency * 0.35 + staffCommitment * 0.25,
  );

  const composite = clamp(
    0,
    120,
    financialHealth * 0.35 + brandHealth * 0.5 + operationsHealth * 0.15,
  );

  return {
    cashRatio: cashRatioScore,
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

export function scaledCashBasisUsd(team: Team, basis: ScaledCashEffect["basis"]): number {
  const financials = team.financialsByQuarter ?? [];
  const lastFinancial = financials[financials.length - 1];
  const routeRevenue = (team.routes ?? []).reduce(
    (sum, r) => sum + Math.max(0, r.quarterlyRevenue ?? 0),
    0,
  );
  const lastRevenueQ = Math.max(0, lastFinancial?.revenue ?? routeRevenue);
  const lastFuelCostQ = Math.max(
    0,
    lastFinancial?.fuelCost ??
      (team.routes ?? []).reduce((sum, r) => sum + Math.max(0, r.quarterlyFuelCost ?? 0), 0),
  );
  switch (basis) {
    case "lastRevenueQ": return lastRevenueQ;
    case "annualRevenue": return lastRevenueQ * 4;
    case "staffCostQ": return quarterlyStaffCost(team);
    case "fuelCostQ": return lastFuelCostQ;
    case "debt": return Math.max(0, team.totalDebtUsd);
    case "fleetValue":
      return (team.fleet ?? []).reduce(
        (sum, f) => f.status === "retired" ? sum : sum + Math.max(0, f.bookValue || f.purchasePrice || 0),
        0,
      );
    case "airlineValue": return Math.max(0, computeAirlineValue(team));
  }
}

export function scaledCashAmount(team: Team, scaled?: ScaledCashEffect): number {
  if (!scaled) return 0;
  const raw = scaledCashBasisUsd(team, scaled.basis) * scaled.multiplier;
  const lo = Math.min(scaled.min, scaled.max);
  const hi = Math.max(scaled.min, scaled.max);
  return clamp(lo, hi, raw);
}

// ─── Apply an option effect ────────────────────────────────
export function applyOptionEffect(
  team: Team,
  effect: OptionEffect,
  /** Current quarter — used to seed time-bounded effects like
   *  routeObligation.activeFromQuarter. Optional for back-compat;
   *  callers that omit it lose obligation start-quarter precision but
   *  the engine will still register the obligation as starting "now". */
  currentQuarter?: number,
): Team {
  // Variable staff-cost savings (e.g. S15 Recession Gamble). Scales with
  // the team's actual quarterly staff bill rather than a hardcoded $.
  // Two quarters' worth × the percentage gets credited as cash.
  let extraCash = 0;
  if (effect.staffSavingsPct !== undefined && effect.staffSavingsPct > 0) {
    const quarterlyStaff = quarterlyStaffCost(team);
    extraCash += quarterlyStaff * 2 * effect.staffSavingsPct;
  }
  extraCash += scaledCashAmount(team, effect.scaledCash);
  const next: Team = {
    ...team,
    cashUsd: team.cashUsd + (effect.cash ?? 0) + extraCash,
    brandPts: Math.max(0, team.brandPts + (effect.brandPts ?? 0)),
    opsPts: Math.max(0, team.opsPts + (effect.opsPts ?? 0)),
    customerLoyaltyPct: clamp(
      0, 100,
      team.customerLoyaltyPct + (effect.loyaltyDelta ?? 0),
    ),
    // Recurring staff-cost surcharge — talent heist "Full Counter
    // Offer" sets this to 0.10 (+10%). The engine reads it every
    // quarter close (see staffCost computation). The facilitator can
    // adjust it from the AdminPanel after submission.
    recurringStaffSurchargePct:
      effect.recurringStaffSurchargePct !== undefined
        ? Math.max(0, effect.recurringStaffSurchargePct)
        : team.recurringStaffSurchargePct,
    flags: new Set(team.flags),
    deferredEvents: [...(team.deferredEvents ?? [])],
    routeObligations: [...(team.routeObligations ?? [])],
    timedModifiers: [...(team.timedModifiers ?? [])],
  };
  if (effect.setFlags) {
    for (const f of effect.setFlags) next.flags.add(f);
  }
  if (effect.routeObligation) {
    const startQ = currentQuarter ?? 1;
    const finePerQuarterUsd = effect.routeObligation.fineScaled
      ? Math.abs(scaledCashAmount(team, effect.routeObligation.fineScaled))
      : effect.routeObligation.finePerQuarterUsd;
    next.routeObligations = [
      ...(next.routeObligations ?? []),
      {
        id: effect.routeObligation.id,
        cities: [...effect.routeObligation.cities],
        activeFromQuarter: startQ,
        activeUntilQuarter: startQ + effect.routeObligation.durationQuarters - 1,
        finePerQuarterUsd,
        label: effect.routeObligation.label,
      },
    ];
  }
  if (effect.timedModifier) {
    const startQ = currentQuarter ?? 1;
    const modifier = {
      id: effect.timedModifier.id,
      kind: effect.timedModifier.kind,
      activeFromQuarter: startQ,
      activeUntilQuarter: startQ + effect.timedModifier.durationQuarters - 1,
    };
    next.timedModifiers = [
      ...(next.timedModifiers ?? []).filter((m) => m.id !== modifier.id),
      modifier,
    ];
  }
  if (effect.opsExpansionSlots && effect.opsExpansionSlots !== 0) {
    const inv = next.hubInvestments ?? {
      fuelReserveTankHubs: [],
      maintenanceDepotHubs: [],
      premiumLoungeHubs: [],
      opsExpansionSlots: 0,
    };
    next.hubInvestments = {
      ...inv,
      opsExpansionSlots: Math.max(0, (inv.opsExpansionSlots ?? 0) + effect.opsExpansionSlots),
    };
  }
  return next;
}

/** At quarter close, charge fines for any active route obligation
 *  city the team is NOT serving. Returns the fine amount and a
 *  per-city breakdown so the close summary can list which cities
 *  triggered. Routes count as "served" when an active or pending
 *  route touches the city as either origin or destination. */
export function computeObligationFines(
  team: Team,
  currentQuarter: number,
): { totalFineUsd: number; missed: Array<{ obligationId: string; city: string; fine: number }> } {
  const out = { totalFineUsd: 0, missed: [] as Array<{ obligationId: string; city: string; fine: number }> };
  const obligations = team.routeObligations ?? [];
  if (obligations.length === 0) return out;
  const servedCities = new Set<string>();
  for (const r of team.routes) {
    if (r.status === "active" || r.status === "pending") {
      servedCities.add(r.originCode);
      servedCities.add(r.destCode);
    }
  }
  for (const ob of obligations) {
    if (currentQuarter < ob.activeFromQuarter) continue;
    if (currentQuarter > ob.activeUntilQuarter) continue;
    for (const city of ob.cities) {
      if (servedCities.has(city)) continue;
      out.totalFineUsd += ob.finePerQuarterUsd;
      out.missed.push({ obligationId: ob.id, city, fine: ob.finePerQuarterUsd });
    }
  }
  return out;
}

/**
 * Estimate the team's CURRENT quarterly staff cost — used to scale
 * staffSavingsPct effects without re-running the full quarter close.
 * Mirrors the quarter-close payroll base including doctrine and
 * recurring staff surcharges.
 */
export function quarterlyStaffCost(team: Team): number {
  const base = baselineStaffCostUsd(team);
  const mult = STAFF_MULTIPLIER[team.sliders.staff] ?? 1.0;
  let doctrineMult = 1.0;
  if (isDoctrine(team, "budget-expansion")) doctrineMult *= 0.80;
  if (isDoctrine(team, "premium-service")) doctrineMult *= 1.15;
  const surchargeMult = 1 + Math.max(0, team.recurringStaffSurchargePct ?? 0);
  return base * mult * doctrineMult * surchargeMult;
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
  /** Quarterly lease fees on every active leased aircraft this round.
   *  7.5% of the leased airframe's spec buy price, charged for 12
   *  quarters from delivery. Earlier the lease per-quarter rate was
   *  computed but never actually deducted — leases were silently free
   *  after the initial signing fee. */
  leaseFeesUsd: number;
  /** Net non-aviation revenue from owned subsidiaries (hotel, limo,
   *  lounge, MRO, fuel storage, catering, training academy) — sum
   *  of each subsidiary's revenuePerQuarterUsd × conditionPct. */
  subsidiaryRevenueUsd: number;
  /** Net revenue from owned airports — gross slot fees collected
   *  from every operating airline's leases minus the 30% opex and
   *  minus the airline's own intra-company slot fees. Earlier this
   *  rolled into `revenue` invisibly; now broken out so the P&L
   *  shows airport ownership as a distinct line. */
  airportRevenueUsd: number;
  otherSliderCost: number;
  /** Sub-components of `otherSliderCost` so the P&L UI can break out
   *  Marketing vs In-flight Service vs Operations vs Customer-Service
   *  spend (each a slider × revenue %). Earlier the four were merged
   *  into one opaque line. */
  marketingCost: number;
  serviceCost: number;
  operationsCost: number;
  customerServiceCost: number;
  /** Service-route obligation fine charged this quarter (e.g. S5
   *  Government Lifeline). Sums every active obligation × every missed
   *  city for the quarter. Surfaced as a sub-line under Taxes &
   *  Government Levies. Was previously folded into slotCost. */
  obligationFinesUsd: number;
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
  /** Net change in the team's RCF (revolving credit) balance this
   *  quarter. Positive = auto-drew more from the facility (cash was
   *  going negative); negative = auto-repaid (cash was positive,
   *  outstanding RCF cleared). Surfaced on the Quarter Close modal
   *  recon block so the player sees their financing activity itemised
   *  rather than buried under "Financing / other". */
  rcfDrawDelta: number;
  /** Non-operating cash inflow that lands during the quarter close
   *  but flows around the netProfit accounting line — scrap value
   *  from retired airframes, hull-insurance payouts on losses, etc.
   *  Engine returns 0; the store's closeQuarter overwrites with its
   *  own accumulator. Surfaced as its own row in the modal's "How
   *  cash changed" reconciliation block so the player sees the math
   *  add up (prevCash + netProfit + insuranceProceeds + rcfDrawDelta
   *  = newCashUsd). */
  insuranceProceeds: number;
  netProfit: number;
  newCashUsd: number;
  newRcfBalance: number;
  /** Updated fleet (depreciated bookValues, accumulated maintenanceDeficit)
   *  the close ran against. Must be persisted back to the team so future
   *  closes don't recompute depreciation from the original purchase price. */
  newFleet: FleetAircraft[];
  /** Updated routes (with quarterlyRevenue, quarterlyFuelCost,
   *  quarterlyAllocatedCost, avgOccupancy, etc) so the player UI shows
   *  the realised numbers from this close. */
  newRoutes: Route[];
  newBrandPts: number;
  newOpsPts: number;
  newLoyalty: number;
  newBrandValue: number;
  newFlags: string[];
  newDeferredEvents: DeferredEvent[];
  newRouteObligations: Team["routeObligations"];
  newTimedModifiers: NonNullable<Team["timedModifiers"]>;
  newHubInvestments: Team["hubInvestments"];
  newLabourRelationsScore: number;
  newMilestones: string[];
  newTaxLossCarryForward: Team["taxLossCarryForward"];
  newSubsidiaries: Team["subsidiaries"];
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
    /** Per-city impacts. `pct` is the blended (tourism+business+cargo)/3
     *  for backward compat. The split fields let the digest show the
     *  most-affected category — a cargo-only +50% news otherwise
     *  averaged to "+17% blended" and looked weaker than it was. */
    cities: Array<{
      code: string;
      name: string;
      pct: number;
      tourism?: number;
      business?: number;
      cargo?: number;
    }>;
  }>;
  routeBreakdown: Array<{
    routeId: string;
    revenue: number;
    fuelCost: number;
    slotCost: number;
    profit: number;
    occupancy: number;
    /** Set to true when the route is `active` but has no operating
     *  aircraft assigned — `dailyCapacity` is therefore 0 and all
     *  per-route metrics roll up to $0/0%. The player sees this as
     *  a "no aircraft" marker in the close digest, distinct from a
     *  route that's flying empty (which has positive fuel cost and
     *  shows up as a real loss). */
    noOperatingAircraft?: boolean;
  }>;
  /** City pairs of routes that ACTIVATED this quarter — i.e. went
   *  from `pending` to `active`. Surfaced in the close modal's
   *  Headline tab and used to render new-route badges on the map. */
  newRoutesActivatedThisQuarter: Array<{
    routeId: string;
    originCode: string;
    destCode: string;
    originName: string;
    destName: string;
    isCargo: boolean;
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
  /** Campaign mode → calendar mapping. "full" starts Q1 2000, anything else
   *  (the half campaign + short cohorts) starts Q1 2015. Used for era-gated
   *  costs like the carbon levy (real EU ETS aviation pricing began 2012).
   *  Defaults to "half" for back-compat with older callers. */
  campaignMode?: "half" | "full";
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
  /** Tier 1-2 city hosting the World Cup (rounds 19-24 demand surge).
   *  Demand boost only applies to routes touching this city. */
  worldCupHostCode?: string | null;
  /** Tier 1-2 city hosting the Olympics (rounds 29-32 demand surge). */
  olympicHostCode?: string | null;
  /** Every team in the simulation — used by airport-ownership revenue
   *  to enumerate every operating airline's slot fees at owned airports.
   *  Optional for back-compat: when absent, the engine skips airport
   *  ownership revenue (test paths can omit). */
  allTeams?: Team[];
  /** Snapshot of airportSlots (mirrors GameState.airportSlots) so the
   *  owner-revenue path can read ownerTeamId / totalCapacity etc. */
  airportSlots?: Record<string, AirportSlotState>;
  /** Whether the cohort opted into facilitated board decisions for
   *  this game. When `false`, the engine SKIPS both the scenario
   *  auto-resolve at the top of close AND the deferred-event resolve
   *  loop below — so a self-guided game never gets blindsided by a
   *  decision the player never saw. Defaults to true for back-compat. */
  boardDecisionsEnabled?: boolean;
  /** Total rounds in this campaign (60 for half, 120 for full, or any
   *  of 8/16/24/40 for shorter cohorts). Engine threads this through
   *  to `marketMaturity()` so early-round demand is correctly damped.
   *  Defaults to 60 for back-compat with persisted saves. */
  totalRounds?: number;
  /** Airport System V2 gate (§0). When true, route economics applies the
   *  V2 hub-and-spoke connecting multiplier (hub-touching segments only,
   *  never Budget). V1 games / persisted saves leave this undefined →
   *  legacy doctrine-specific connecting behavior. */
  airportSystemV2?: boolean;
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
  // Milestones-before baseline. The diff at the bottom of this fn
  // (`milestonesEarnedThisQuarter = next.milestones.filter(!before)`)
  // depends on this being correct.
  //
  // Defensive backstop: if `team.milestones` somehow shows up empty
  // BUT the team has previously closed a quarter (financialsByQuarter
  // has more than just the Q1 backfill), it's a near-certainty that
  // milestones were silently dropped somewhere upstream — every other
  // state field in financialsByQuarter rows persists fine. Rather
  // than hand the player a "you just earned First Cargo Route" toast
  // for the eighth time, we reconstruct the baseline from the team's
  // current state so already-true milestones are pre-seeded into
  // milestonesBefore. The UI ledger in QuarterCloseModal is a
  // separate safety net; this guard kills the bug at the source.
  const reconstructIfDropped = (): Set<string> => {
    const persisted = new Set(team.milestones ?? []);
    const prevClosedCount = (team.financialsByQuarter ?? []).filter(
      (q) => q.quarter < ctx.quarter && q.revenue > 0,
    ).length;
    if (persisted.size > 0 || prevClosedCount === 0) return persisted;
    // We've closed quarters before but milestones is empty — derive
    // the obvious state-based milestones from current fleet/routes
    // so the diff filter doesn't paint them as "freshly earned" this
    // quarter. Conservative subset: just the milestones whose earn()
    // condition is fully satisfiable from state we can read here.
    const reconstructed = new Set<string>();
    const activeRoutes = team.routes.filter((r) => r.status === "active");
    const activeFleet = team.fleet.filter((f) => f.status === "active");
    if (activeRoutes.some((r) => r.isCargo)) reconstructed.add("First Cargo Route");
    if (activeRoutes.length >= 10) reconstructed.add("10 Active Routes");
    if (activeRoutes.length >= 25) reconstructed.add("25 Active Routes");
    if (activeRoutes.length >= 50) reconstructed.add("Network Builder");
    if (activeFleet.length >= 10) reconstructed.add("Fleet of 10");
    if (activeFleet.length >= 25) reconstructed.add("Fleet of 25");
    // Cross-region routes → International Network
    const regions = new Set<string>();
    for (const r of activeRoutes) {
      const o = CITIES_BY_CODE[r.originCode];
      const d = CITIES_BY_CODE[r.destCode];
      if (o) regions.add(o.region);
      if (d) regions.add(d.region);
    }
    if (regions.size >= 3) reconstructed.add("International Network");
    if ((team.secondaryHubCodes?.length ?? 0) >= 3) reconstructed.add("Hub & Spoke");
    if ((team.customerLoyaltyPct ?? 0) >= 80) reconstructed.add("Loyal Following");
    return reconstructed;
  };
  const milestonesBefore = reconstructIfDropped();

  const next: Team = {
    ...team,
    flags: new Set(team.flags),
    deferredEvents: [...(team.deferredEvents ?? [])],
    timedModifiers: [...(team.timedModifiers ?? [])],
    rcfBalanceUsd: team.rcfBalanceUsd ?? 0,
  };
  const activeTimedModifiers = (next.timedModifiers ?? []).filter(
    (m) => ctx.quarter >= m.activeFromQuarter && ctx.quarter <= m.activeUntilQuarter,
  );
  const hasTimedModifier = (kind: (typeof activeTimedModifiers)[number]["kind"]) =>
    activeTimedModifiers.some((m) => m.kind === kind);

  // ─ Route economics ──────────────────────────────────────
  const routeBreakdown: QuarterCloseResult["routeBreakdown"] = [];
  // Lease fees charged this quarter — 7.5% of spec buy price for every
  // active leased aircraft whose 12-quarter term has not yet ended.
  // The lease term clock started at delivery (not at order), so an
  // aircraft delivered at q=12 is charged through q=23 inclusive.
  let leaseFeesUsd = 0;
  for (const f of next.fleet) {
    if (f.acquisitionType !== "lease") continue;
    if (f.status !== "active" && f.status !== "ordered") continue;
    if (typeof f.leaseTermEndsAtQuarter === "number" && ctx.quarter > f.leaseTermEndsAtQuarter) continue;
    if (typeof f.leaseQuarterly === "number" && f.leaseQuarterly > 0) {
      leaseFeesUsd += f.leaseQuarterly;
    }
  }

  let revenue = 0;
  let passengerRevenue = 0;
  let cargoRevenue = 0;
  let fuelCost = 0;
  let slotCost = 0;
  let totalPassengers = 0;

  // Cross-route cargo pool context (Wave 3.2): which OD pairs the
  // team is serving with belly cargo (passenger jets w/ belly fitted)
  // vs dedicated freighters. Lets computeRouteEconomics split the
  // OD's cargo demand 70% freighter / 30% belly when both modes are
  // wired up — avoids the 130%-of-pool double-count.
  const cargoPool: CargoPoolContext = {
    hasBellyOD: new Set<string>(),
    hasFreighterOD: new Set<string>(),
  };
  for (const r of next.routes) {
    if (r.status !== "active") continue;
    const k = odKey(r.originCode, r.destCode);
    if (r.isCargo) {
      cargoPool.hasFreighterOD.add(k);
    } else {
      // Has belly capacity if any active passenger plane on the route
      // ships any belly tonnage at all (any belly setting except none).
      const hasBelly = r.aircraftIds.some((id) => {
        const p = next.fleet.find((f) => f.id === id);
        if (!p || p.status !== "active") return false;
        const spec = AIRCRAFT_BY_ID[p.specId];
        if (!spec || spec.family !== "passenger") return false;
        const totalSeats = (p.customSeats?.first ?? spec.seats.first)
          + (p.customSeats?.business ?? spec.seats.business)
          + (p.customSeats?.economy ?? spec.seats.economy);
        return cargoBellyTonnes(totalSeats, p.cargoBelly) > 0;
      });
      if (hasBelly) cargoPool.hasBellyOD.add(k);
    }
  }

  // Per-city fuel tank coverage discount, precomputed once against the
  // network's actual quarterly burn (redesign 2026-05). Each operated
  // city's installed tanks deliver tierMaxDiscount × min(1, capacity/burn)
  // on every route departing it; recomputed each quarter so the discount
  // scales with the network and never "depletes". Passed into the econ
  // call below so both passenger + cargo fuel paths read the same map.
  const cityFuelDiscountMap = cityFuelDiscounts(next);

  for (const r of next.routes) {
    if (r.status === "active") {
      // Route Legacy Bonus (PRD E8.1) — +12% after 4+ consecutive active quarters
      const legacyBonus = r.consecutiveQuartersActive >= 4 ? 1.12 : 1.0;
      // First-Mover Bonus (PRD E8.8) — +20% for first 2 quarters (simplified: opening quarter + 1)
      const firstMoverBonus = ctx.quarter - r.openQuarter < 2 ? 1.20 : 1.0;

      const econ = computeRouteEconomics(
        next, r, ctx.quarter, ctx.fuelIndex, ctx.rivals,
        ctx.worldCupHostCode, ctx.olympicHostCode, cargoPool,
        ctx.totalRounds, cityFuelDiscountMap, ctx.airportSystemV2 ?? false,
      );
      const boostedRevenue = econ.quarterlyRevenue * legacyBonus * firstMoverBonus;
      revenue += boostedRevenue;
      // Cargo P&L line should reflect ALL cargo earnings — dedicated
      // freighters AND the belly cargo carried on passenger frames.
      // Previously belly revenue was silently folded into the
      // passenger line, so a player flying belly cargo saw $0 Cargo
      // on the Financials P&L despite earning it. Split it out here.
      if (r.isCargo) {
        cargoRevenue += boostedRevenue;
      } else {
        const boostedBelly = (econ.bellyCargoRevenue ?? 0) * legacyBonus * firstMoverBonus;
        cargoRevenue += boostedBelly;
        passengerRevenue += boostedRevenue - boostedBelly;
      }
      fuelCost += econ.quarterlyFuelCost;
      slotCost += econ.quarterlySlotCost;
      totalPassengers += econ.dailyPax * QUARTER_DAYS;
      // A route can be `active` but have no operating aircraft — the
      // player won the slots but never assigned planes (or the
      // assigned planes were retired/sold/grounded). dailyCapacity
      // collapses to 0 and the per-route P&L flat-lines at $0. Tag
      // these so the digest can show "no aircraft" rather than a
      // misleading $0 profit row.
      const hasOperatingAircraft = (r.aircraftIds ?? [])
        .map((id) => next.fleet.find((f) => f.id === id))
        .some((f) => f && f.status === "active");
      routeBreakdown.push({
        routeId: r.id,
        revenue: boostedRevenue,
        fuelCost: econ.quarterlyFuelCost,
        slotCost: econ.quarterlySlotCost,
        profit: boostedRevenue - econ.quarterlyFuelCost - econ.quarterlySlotCost,
        occupancy: econ.occupancy,
        noOperatingAircraft: !hasOperatingAircraft,
      });
      // Snapshot LAST quarter's direct contribution before this close
      // overwrites the quarterly fields — feeds the Routes panel Trend
      // column (Δ profit Q/Q). Undefined until the route has a real
      // prior quarter (first close would otherwise diff against zeros
      // and read as a huge fake improvement).
      r.prevQuarterProfitUsd = (r.consecutiveQuartersActive ?? 0) > 0
        ? (r.quarterlyRevenue ?? 0) - (r.quarterlyFuelCost ?? 0) - (r.quarterlySlotCost ?? 0)
        : undefined;
      r.avgOccupancy = econ.occupancy;
      r.quarterlyRevenue = boostedRevenue;
      r.quarterlyFuelCost = econ.quarterlyFuelCost;
      r.quarterlySlotCost = econ.quarterlySlotCost;

      // ── Per-class drill-down (Phase 1A) ────────────────────
      // Scale the per-class quarterly counts by the same Legacy +
      // First-Mover boosters that the headline revenue was scaled
      // by, so the breakdown reconciles back to the headline.
      const revBoost = legacyBonus * firstMoverBonus;
      r.quarterlyFirstPax = (econ.dailyPaxFirst ?? 0) * QUARTER_DAYS;
      r.quarterlyBusPax = (econ.dailyPaxBus ?? 0) * QUARTER_DAYS;
      r.quarterlyEconPax = (econ.dailyPaxEcon ?? 0) * QUARTER_DAYS;
      r.quarterlyFirstRevenue = (econ.quarterlyFirstRevenue ?? 0) * revBoost;
      r.quarterlyBusRevenue = (econ.quarterlyBusRevenue ?? 0) * revBoost;
      r.quarterlyEconRevenue = (econ.quarterlyEconRevenue ?? 0) * revBoost;
      r.occupancyFirst = econ.occupancyFirst;
      r.occupancyBus = econ.occupancyBus;
      r.occupancyEcon = econ.occupancyEcon;
      r.bellyDailyTonnesUsed = econ.bellyDailyTonnesUsed;
      r.bellyCargoRevenue = (econ.bellyCargoRevenue ?? 0) * revBoost;
      r.passengerRevenue = (econ.passengerRevenue ?? 0) * revBoost;
      r.cargoRevenue = r.isCargo
        ? boostedRevenue
        : (econ.cargoRevenue ?? 0) * revBoost;
      r.quarterlyFuelTankSavings = econ.quarterlyFuelTankSavings;
      // Subsidiary demand premium — surface on the route detail
      // modal as a line item so the player sees the moat working.
      // computeRouteEconomics already applied this multiplier inside
      // quarterlyRevenue; here we just store the multiplier for UI.
      const subMult = subsidiaryDemandMultiplier(next, r);
      r.lastQuarterSubsidiaryMult = subMult > 1.0001 ? subMult : undefined;

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

  // ─ Airport ownership revenue + opex (Sprint 10) ───────────
  // Now broken out as a distinct P&L line — `airportRevenueUsd` —
  // so the player can see the airport's contribution separately from
  // aviation revenue. Total `revenue` still includes it (slider math
  // and brand value reads from total) but the breakdown surfaces it.
  let airportRevenueUsd = 0;
  if (ctx.airportSlots) {
    for (const [code, slotState] of Object.entries(ctx.airportSlots)) {
      if (slotState.ownerTeamId !== next.id) continue;
      if (ctx.airportSystemV2) {
        // ─ V2 ownership economics (§7.1) — multi-engine revenue:
        // aeronautical (slot / landing / pax) + non-aero (retail), net of
        // opex and ongoing demand obligations, aggregated across every
        // airline's traffic plus background carriers. The owner's own slots
        // bill at the self-discounted rate (handled inside the helper).
        const breakdown = computeOwnedAirportRevenue({
          teams: ctx.allTeams ?? [next],
          airportCode: code,
          slotState,
        });
        if (breakdown) {
          airportRevenueUsd += breakdown.net;
          revenue += breakdown.net;
        }
        continue;
      }
      const grossRevenue = (ctx.allTeams ?? []).reduce((sum, t) => {
        const lease = t.airportLeases?.[code];
        if (!lease || lease.slots === 0) return sum;
        return sum + lease.totalWeeklyCost * 13;
      }, 0);
      const ownLease = next.airportLeases?.[code];
      const ownSlotFees = ownLease ? ownLease.totalWeeklyCost * 13 : 0;
      const netRevenue = grossRevenue - ownSlotFees;
      const opex = grossRevenue * 0.30;
      const airportNet = netRevenue - opex;
      airportRevenueUsd += airportNet;
      revenue += airportNet;
      // Refund our own slot fees from `slotCost` since we paid ourselves.
      slotCost -= ownSlotFees;
    }
  }

  // ─ Subsidiary quarterly revenue + appreciation ─────────────
  // Tracked separately as `subsidiaryRevenueUsd` so the P&L can
  // show non-aviation income as a distinct line; still folded into
  // total revenue so slider-%-of-revenue math is unaffected.
  let subsidiaryRevenueUsd = 0;
  if ((next.subsidiaries?.length ?? 0) > 0) {
    const updatedSubs = (next.subsidiaries ?? []).map((sub) => {
      const entry = SUBSIDIARY_CATALOG_BY_TYPE[sub.type];
      if (!entry) return sub;
      // Tier multiplier — basic (1.0) / premium (1.6) / flagship (2.4)
      // applies on top of conditionPct so a flagship hotel running at
      // 70% condition still out-earns a basic hotel at 100%.
      const tier = sub.tier ?? "basic";
      const tierMult = SUBSIDIARY_TIER_REV_MULT[tier] ?? 1.0;
      const subRevenue = entry.revenuePerQuarterUsd * sub.conditionPct * tierMult;
      subsidiaryRevenueUsd += subRevenue;
      revenue += subRevenue;
      // Appreciation: lerp toward the ceiling at the configured rate.
      // Ceiling tracks total invested (basic = 1.0×, premium = 1.5×,
      // flagship = 2.0× of original setupCost) so upgrades grow the
      // sellable asset value, not just the income.
      const tierCostMult = tier === "flagship" ? 2.0 : tier === "premium" ? 1.5 : 1.0;
      const ceiling = sub.purchaseCostUsd * tierCostMult * 1.5;
      const newValue = Math.min(
        ceiling,
        sub.marketValueUsd + (ceiling - sub.marketValueUsd) * 0.02,
      );
      // Condition decay — 2% per quarter. Refurbish action restores
      // to 1.0 for 15% of current market value. Workshop intent: turn
      // every subsidiary into a quarterly "expand · refurbish · sell"
      // decision rather than fire-and-forget rent collection.
      const newCondition = Math.max(0.4, sub.conditionPct - 0.02);
      return { ...sub, marketValueUsd: newValue, conditionPct: newCondition };
    });
    next.subsidiaries = updatedSubs;
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

  function addScenarioRevenueUplift(label: string, pct: number, minUsd: number, maxUsd: number) {
    if (revenue <= 0) return;
    const uplift = clamp(minUsd, maxUsd, revenue * pct);
    if (uplift <= 0) return;
    revenue += uplift;
    passengerRevenue += uplift;
    notes.push(`${label}: +$${(uplift / 1e6).toFixed(1)}M revenue`);
  }
  if (hasTimedModifier("blue-ocean-first")) {
    addScenarioRevenueUplift("Blue Ocean first-mover corridor", 0.07, 30 * M, 180 * M);
  }
  if (hasTimedModifier("blue-ocean-deepen")) {
    addScenarioRevenueUplift("Blue Ocean route densification", 0.04, 15 * M, 100 * M);
  }
  if (hasTimedModifier("blue-ocean-split")) {
    addScenarioRevenueUplift("Blue Ocean split-budget corridor", 0.025, 10 * M, 80 * M);
  }

  // ─ Route service obligations (S5 Government Lifeline) ─────
  // For every active obligation city the team isn't serving via any
  // route endpoint this quarter, charge the per-city per-quarter fine.
  // The fine lands in `obligationFinesUsd` and rolls up into Taxes &
  // Government Levies in the P&L (NOT into slotCost — was a bug:
  // earlier the fine was added to slot fees which made the slot line
  // look inflated and hid where the cash actually went).
  const obligationFines = computeObligationFines(next, ctx.quarter);
  const obligationFinesUsd = obligationFines.totalFineUsd;
  if (obligationFinesUsd > 0) {
    const cityList = obligationFines.missed.map((m) => m.city).join(" + ");
    notes.push(
      `Service-obligation fine: −$${(obligationFinesUsd / 1e6).toFixed(1)}M ` +
      `· not serving ${cityList} this quarter`,
    );
  }

  // ─ Per-city fuel tanks (redesign 2026-05) ───────────────────────
  // The fuel discount itself is applied inside computeRouteEconomics via
  // the coverage-based `cityFuelDiscountMap` (no litre inventory, no
  // storage swap, no bulk-buy reconciliation). All that remains here is
  // the quarterly maintenance on the installed tanks: Σ count × maintUsd
  // across every city that has tanks. Folded into maintenanceCost below.
  const fuelTankMaint = Object.values(next.fuelTanksByCity ?? {}).reduce(
    (sum, cfg) => {
      if (!cfg || cfg.count <= 0) return sum;
      const spec = FUEL_TANK_SPECS[cfg.tier];
      return spec ? sum + cfg.count * spec.maintUsd : sum;
    },
    0,
  );

  // ─ Staff (A3) ───────────────────────────────────────────
  const staffBase = baselineStaffCostUsd(next);
  // Recurring surcharge — applied by S14 "Full Counter Offer" (talent
  // heist) which commits the team to retaining executives at a
  // permanent payroll premium for the rest of the campaign. The
  // facilitator can adjust the rate from the AdminPanel; default 10%.
  // Stored as a multiplier increment (0.10 = +10%).
  const staffSurchargeMult = 1 + Math.max(0, next.recurringStaffSurchargePct ?? 0);
  let doctrineStaffMult = 1.0;
  if (isDoctrine(next, "budget-expansion")) doctrineStaffMult *= 0.80;
  if (isDoctrine(next, "premium-service")) doctrineStaffMult *= 1.15;
  let staffCost =
    staffBase * STAFF_MULTIPLIER[next.sliders.staff] * staffSurchargeMult * doctrineStaffMult;
  // Underdog Boost — Government Tailwind (R20A) waives staff cost for
  // 3 rounds. Effect is "the package reimburses staff payroll costs
  // in full." Surface a clear note so the player sees why their P&L
  // changed.
  if (isStaffCostWaived(next, ctx.quarter)) {
    notes.push(`Staff cost waived this quarter (National Strategic Carrier package) · saved $${(staffCost / 1_000_000).toFixed(1)}M`);
    staffCost = 0;
  }
  let digitalStrikeChance = 0;
  let timedLabourRelationsDelta = 0;
  let digitalStaffSavings = 0;
  if (hasTimedModifier("digital-full")) {
    digitalStaffSavings += staffCost * 0.18;
    digitalStrikeChance += 0.30;
    timedLabourRelationsDelta -= 4;
  }
  if (hasTimedModifier("digital-phased")) {
    digitalStaffSavings += staffCost * 0.10;
    digitalStrikeChance += 0.10;
    timedLabourRelationsDelta -= 1;
  }
  if (hasTimedModifier("digital-reskill")) {
    digitalStaffSavings += staffCost * 0.06;
    timedLabourRelationsDelta += 1;
  }
  if (digitalStaffSavings > 0) {
    staffCost = Math.max(0, staffCost - digitalStaffSavings);
    notes.push(`Digital operating model saved $${(digitalStaffSavings / 1e6).toFixed(1)}M payroll this quarter`);
  }

  // ─ Other sliders as % of revenue (A2) — broken out ──────
  // Per-slider caps (user spec):
  //   Marketing       0-15% (was 0-20%)
  //   In-flight       1.5-8%
  //   Operations      2-10%
  //   Office Capacity 1.5-7% (customerService key)
  // Each is now reported separately so the P&L UI can label them
  // explicitly instead of bundling under "Other slider spend".
  const marketingCost = revenue * MARKETING_PCT_REVENUE[next.sliders.marketing];
  const serviceCost = revenue * SERVICE_PCT_REVENUE[next.sliders.service];
  const operationsCost = revenue * OPS_PCT_REVENUE[next.sliders.operations];
  const customerServiceCost = revenue * CS_PCT_REVENUE[next.sliders.customerService];
  let otherSliderCost =
    marketingCost + serviceCost + operationsCost + customerServiceCost;
  let politicalServiceCost = 0;
  if (hasTimedModifier("political-favour-full")) {
    politicalServiceCost += revenue > 0 ? clamp(3 * M, 18 * M, revenue * 0.012) : 0;
  }
  if (hasTimedModifier("political-favour-partial")) {
    politicalServiceCost += revenue > 0 ? clamp(1.5 * M, 10 * M, revenue * 0.007) : 0;
  }
  if (hasTimedModifier("political-favour-subsidy")) {
    politicalServiceCost = Math.max(0, politicalServiceCost * 0.35);
  }
  if (politicalServiceCost > 0) {
    otherSliderCost += politicalServiceCost;
    notes.push(`Political service package cost $${(politicalServiceCost / 1e6).toFixed(1)}M`);
  }
  if (hasTimedModifier("aging-operations")) {
    const agingCost = revenue > 0 ? clamp(5 * M, 45 * M, revenue * 0.02) : 0;
    if (agingCost > 0) {
      otherSliderCost += agingCost;
      next.opsPts = Math.max(0, next.opsPts - 2);
      notes.push(`Aging operations gap cost $${(agingCost / 1e6).toFixed(1)}M`);
    }
  }

  // ─ Maintenance (PRD §5.3 age bands, scaled to 20-round lifespan) ──
  // PRD bands assume an 80Q lifespan with bands at 0-5/5-10/10-15/15-20
  // calendar years. Our 20Q in-game lifespan compresses this proportionally
  // — each PRD year ≈ one game-quarter of life. Bands per game quarter:
  //   age 0–5Q  (newest 25%): 0.8% of original purchase price
  //   age 5–10Q (mid):        1.2%
  //   age 10–15Q (older):     1.8%
  //   age 15–20Q (end of life): 2.5%
  const opsPtsDiscount = Math.min(0.40, next.opsPts / 250);
  let maintenanceCost = 0;
  for (const f of next.fleet) {
    if (f.status !== "active") continue;
    const ageQ = Math.max(0, ctx.quarter - f.purchaseQuarter);
    const basePct =
      // Maintenance bands scaled to the 28Q (7-year) lifespan: 0-7 / 7-14
      // / 14-21 / 21+ replaces the old 0-5 / 5-10 / 10-15 / 15+. Same
      // four-tier shape, just stretched proportionally with the longer
      // life so the older-plane bands actually trigger before retirement.
      ageQ < 7  ? 0.008 :
      ageQ < 14 ? 0.012 :
      ageQ < 21 ? 0.018 : 0.025;
    const effectivePct = basePct * (1 - opsPtsDiscount);
    // Update 5 — discontinued-type maintenance escalation.
    // Brackets after cutoff: 1-4Q +5%, 5-8Q +7.5%, 9-12Q +10%, 13Q+ +15%.
    // Eco-upgraded aircraft get all rates halved (incentivises modernisation).
    const escalationMult = discontinuedMaintenanceMultiplier(
      AIRCRAFT_BY_ID[f.specId],
      ctx.quarter,
      !!f.ecoUpgrade,
      (ctx.totalRounds ?? 60) > 60 ? "full" : "half",
    );
    maintenanceCost += f.purchasePrice * effectivePct * escalationMult;
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

  // Hub Maintenance Depot (PRD D4): 20% fleet maintenance reduction per depot.
  // Phase C — C3: guard the inner array too. Legacy saves (or a
  // corrupt hydrate) can hand us `hubInvestments: {}` — outer ?. saves
  // us from .maintenanceDepotHubs being undefined, but accessing
  // .length on undefined throws. Belt and braces.
  const depotCount = next.hubInvestments?.maintenanceDepotHubs?.length ?? 0;
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

  if (isDoctrine(next, "budget-expansion")) {
    maintenanceCost *= 0.90;
  }
  if (isDoctrine(next, "global-network")) {
    const brandCount = new Set(activeFleet.map((f) => fleetBrandKey(f.specId))).size;
    const brandPenalty = Math.min(0.20, Math.max(0, brandCount - 1) * 0.10);
    if (brandPenalty > 0) {
      maintenanceCost *= 1 + brandPenalty;
      notes.push(`Global network fleet mix: maintenance +${(brandPenalty * 100).toFixed(0)}%`);
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
  // Period-only formula: purchasePrice × (0.9875^q − 0.9875^(q+1)).
  // This avoids relying on f.bookValue being persisted across quarters
  // (it isn't — runQuarterClose returns a result but the engine doesn't
  // mutate the player's team), which previously caused depreciation to
  // re-deduct the cumulative book-value loss every quarter and balloon
  // the line item to ~10× its real value.
  let depreciation = 0;
  next.fleet = next.fleet.map((f) => {
    if (f.acquisitionType !== "buy") return f;
    const qSince = Math.max(0, ctx.quarter - f.purchaseQuarter);
    const bookBefore = depreciateBookValue(f.purchasePrice, qSince);
    const bookAfter = depreciateBookValue(f.purchasePrice, qSince + 1);
    const periodDelta = Math.max(0, bookBefore - bookAfter);
    depreciation += periodDelta;
    return { ...f, bookValue: bookAfter };
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
  // Carbon levy — a REAL environmental cost on the P&L (not gated behind a
  // player decision). Mirrors EU ETS aviation carbon pricing, which began
  // phasing in for airlines in 2012, so it applies to every carrier from
  // calendar-year 2012 onward — it's simply a regulatory cost of flying.
  // Going green REDUCES the bill: an SAF / green-transition leader pays 40%
  // less; a carrier that signalled sustainability pays 5% less. Campaign-
  // aware: the full campaign starts 2000 (levy from quarter ~49) and the
  // half campaign starts 2015 (levy active from the first quarter).
  let carbonLevy = 0;
  const carbonStartYear = ctx.campaignMode === "full" ? 2000 : 2015;
  const calendarYear = carbonStartYear + Math.floor(Math.max(0, ctx.quarter - 1) / 4);
  if (calendarYear >= 2012) {
    const pricePerL = (ctx.fuelIndex / 100) * FUEL_BASELINE_USD_PER_L;
    const totalLiters = pricePerL > 0 ? fuelCost / pricePerL : 0;
    // Jet A-1 emits ~2.52 kg CO2 per litre burned (3.16 kg CO2 per kg of
    // fuel × ~0.8 kg/L). Priced at ~$45/tonne (a mid-range carbon price).
    const tonnesCO2 = (totalLiters * 2.52) / 1000;
    carbonLevy = tonnesCO2 * 45;
    if (next.flags.has("green_leader")) carbonLevy *= 0.6;        // SAF / green leader
    if (next.flags.has("sustainability_signal")) carbonLevy *= 0.95;
  }

  // ─ Pre-tax profit ───────────────────────────────────────
  // BUG FIX: insurancePremium was shown in financials but never
  // subtracted from pretax — net profit was overstated by the premium
  // amount every quarter (small-but-real, $9M+ on a $1.5B revenue team
  // with medium policy). Now part of the formula.
  const pretax =
    revenue - fuelCost - slotCost - staffCost - otherSliderCost -
    leaseFeesUsd -
    maintenanceCost - insurancePremium - depreciation -
    interest - rcfInterest -
    passengerTax - fuelExcise - carbonLevy -
    obligationFinesUsd;

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
  // Underdog Boost — Government Tailwind (R20A) waives corporate tax
  // for the active 3-round window.
  let tax = taxBase > 0 ? taxBase * 0.2 : 0;
  if (tax > 0 && isTaxWaived(next, ctx.quarter)) {
    notes.push(`Corporate tax waived this quarter (National Strategic Carrier package) · saved $${(tax / 1_000_000).toFixed(1)}M`);
    tax = 0;
  }
  // If loss this quarter, enqueue for future offset
  if (pretax < 0) {
    carryFwd.push({ quarter: ctx.quarter, amount: -pretax });
  }
  next.taxLossCarryForward = carryFwd.filter((e) => e.amount > 0);
  let netProfit = pretax - tax;

  // ─ Per-route cost allocation for display (PRD §A14 update) ─
  // The Routes panel previously showed Q profit = revenue − fuel only,
  // which produced misleading 99% margins because it ignored slot lease
  // totals, staff, maintenance, marketing, depreciation, interest and
  // taxes — costs that all hit the team-level financials. Here we
  // allocate every non-fuel team cost back to each active route in
  // proportion to its revenue share. Direct route fuel stays exact.
  // The sum of all route-level allocated profits ≈ team netProfit.
  const totalCostsAfterTax = Math.max(0, revenue - netProfit);
  const allocPool = Math.max(0, totalCostsAfterTax - fuelCost);
  const totalRevenueForAlloc = revenue;

  // ── Per-category allocation (Phase 1A) ──────────────────
  // Split the allocation across the team's cost categories so the
  // route detail modal can render line items rather than one opaque
  // number. Maintenance includes hubFee post-fold; we expose hubFee
  // as a separate display row using the pre-fold value, with the rest
  // of maintenance shown net. The other "taxes & levies" bucket
  // absorbs passengerTax + fuelExcise + carbonLevy + tax + fines.
  const maintenanceForAlloc = Math.max(0, maintenanceCost - hubFee);
  const taxesAndLeviesForAlloc =
    passengerTax + fuelExcise + carbonLevy + tax + obligationFinesUsd;
  // Re-derive interestForAlloc from `interest + rcfInterest`; this is
  // the line the player sees as "Interest" on the financials. RCF
  // interest is folded into it for the route allocation because the
  // player can't disentangle that from regular interest at the route
  // level.
  const interestForAlloc = interest + rcfInterest;
  for (const r of next.routes) {
    if (r.status !== "active") continue;
    const routeRev = r.quarterlyRevenue ?? 0;
    const revShare = totalRevenueForAlloc > 0 ? routeRev / totalRevenueForAlloc : 0;
    const allocatedNonFuel = allocPool * revShare;
    r.quarterlyAllocatedCost = (r.quarterlyFuelCost ?? 0) + allocatedNonFuel;

    // Per-category breakdown (Phase 1A) — uses the same revShare
    // weight that drives the aggregate `quarterlyAllocatedCost`. The
    // categories below sum to (allocPool × revShare) + insurancePremium
    // share + leaseFees share + hubFee share. We surface every line
    // so the modal's cost breakdown reconciles to the headline.
    r.allocatedStaff = staffCost * revShare;
    r.allocatedMarketing = marketingCost * revShare;
    r.allocatedService = serviceCost * revShare;
    r.allocatedOperations = operationsCost * revShare;
    r.allocatedCustomerService = customerServiceCost * revShare;
    r.allocatedMaintenance =
      (maintenanceForAlloc + insurancePremium + leaseFeesUsd) * revShare;
    r.allocatedHubFee = hubFee * revShare;
    r.allocatedDepreciation = depreciation * revShare;
    r.allocatedInterest = interestForAlloc * revShare;
    r.allocatedTaxes = taxesAndLeviesForAlloc * revShare;

    // Slot allocation: replaces the deprecated quarterlySlotCost (which
    // is always 0 post-v2 and was being rendered as the misleading "$0
    // slot" line). We allocate the team's slot-fee pool by the same
    // revenue-share weight used for the other cost categories. (Weekly-
    // frequency weighting would be more accurate; for the v1 of this
    // breakdown, revenue-share is consistent with how every other line
    // is allocated, so the math obviously ties out.)
    r.quarterlySlotCostAllocation = slotCost * revShare;

    // Demand-shock multiplier captured for the route detail modal's
    // "why did revenue dip" hint. cityEventImpact returns 0 (no event)
    // up to ±some percent — we surface the worse of origin/dest to
    // give the player a single number. Cargo routes read the cargo
    // dimension; passenger routes average tourism + business (same
    // shape as the upstream routeDemandPerDay blend).
    const evtA = cityEventImpact(r.originCode, ctx.quarter, ctx.totalRounds ?? 60);
    const evtB = cityEventImpact(r.destCode, ctx.quarter, ctx.totalRounds ?? 60);
    const eventA = r.isCargo
      ? evtA.cargo / 100
      : ((evtA.tourism + evtA.business) / 2) / 100;
    const eventB = r.isCargo
      ? evtB.cargo / 100
      : ((evtB.tourism + evtB.business) / 2) / 100;
    // Match the engine's clamp behavior (DEMAND_FLOOR for passenger /
    // cargo) so the display number is exactly what the engine used.
    const floor = r.isCargo ? DEMAND_FLOOR_CARGO : DEMAND_FLOOR_PASSENGER;
    const multA = Math.max(floor, 1 + eventA);
    const multB = Math.max(floor, 1 + eventB);
    // Use the worse-of-two ends — a route is suppressed by whichever
    // endpoint has the larger negative event.
    const shockMult = Math.min(multA, multB);
    if (Math.abs(shockMult - 1) > 0.01) {
      r.lastQuarterDemandShockMult = shockMult;
    } else {
      r.lastQuarterDemandShockMult = undefined;
    }
  }
  // Update routeBreakdown so anyone consuming it (digest, AI bots) sees
  // the allocated profit instead of revenue − fuel.
  for (const rb of routeBreakdown) {
    const r = next.routes.find((x) => x.id === rb.routeId);
    if (!r || r.quarterlyAllocatedCost === undefined) continue;
    rb.profit = rb.revenue - r.quarterlyAllocatedCost;
  }

  // ─ Cash flow + RCF auto-draw (A8) ──────────────────────
  // Depreciation is a NON-CASH expense. It legitimately drags net
  // profit (accrual P&L, matching principle) but the cash already
  // left the business when the aircraft was bought — the store
  // deducts the full purchase price from cash at buy time. So we add
  // depreciation back here to recover the real operating cash flow
  // (indirect method: cash flow = net income + D&A). Without this,
  // players watched their cash fall by the depreciation amount every
  // quarter for planes they had ALREADY paid for in full — a
  // double-count of the capital outflow. Leased aircraft never accrue
  // depreciation (the map above skips them), so this add-back only
  // ever reverses the non-cash charge on owned airframes.
  let newCashUsd = next.cashUsd + netProfit + depreciation;
  let newRcfBalance = next.rcfBalanceUsd;
  // Track the starting RCF balance so we can compute this quarter's
  // draw / repay delta and expose it as a separate line on the
  // QuarterCloseModal recon block. Without this, the modal lumped RCF
  // activity into a vague "Financing / other" row.
  const startingRcfBalance = newRcfBalance;
  // First, if cash is positive and RCF is drawn, auto-repay
  if (newCashUsd > 0 && newRcfBalance > 0) {
    const repay = Math.min(newCashUsd, newRcfBalance);
    newCashUsd -= repay;
    newRcfBalance -= repay;
  }
  // If cash is negative, auto-draw into RCF
  let rcfCeilingHitThisQuarter = false;
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
      rcfCeilingHitThisQuarter = true;
    } else if (drawAmount > 0) {
      notes.push(`RCF drew ${(drawAmount / 1e6).toFixed(1)}M at ${rcfRate.toFixed(1)}%`);
    }
  }

  // Phase 6 P0 — bankruptcy detection. When cash is still negative
  // after the RCF auto-draw clamped to its ceiling, the team is
  // operationally insolvent. Flag it ONCE (sticky) so the UI can
  // surface a workshop-appropriate "company bankruptcy" callout
  // without firing every quarter. The team keeps playing — the
  // facilitator may want to ride it out — but we record the quarter
  // it happened in for the endgame recap and hand off a new flag
  // that consequences/scenarios can branch on.
  const wasBankrupt = (next.flags ?? new Set<string>()).has("bankrupt");
  if (rcfCeilingHitThisQuarter && newCashUsd < 0 && !wasBankrupt) {
    notes.push(
      "BANKRUPTCY: cash negative + RCF maxed. The game master should review whether to continue or replace this team with a bot.",
    );
    // Mutate the in-progress next.flags set so closeQuarter's caller
    // captures the change. flags is always a Set on the engine path.
    if (next.flags && typeof (next.flags as Set<string>).add === "function") {
      (next.flags as Set<string>).add("bankrupt");
      (next.flags as Set<string>).add(`bankrupt_at_q${ctx.quarter}`);
    }
  }

  // ─ System-level plot twists ────────────────────────────────
  // Previously a stack of hard-coded `if (ctx.quarter === N)` blocks
  // for S4/S16/S15/S12. Those quarter constants drifted out of sync
  // with the 40-round campaign — some twists fired BEFORE the player
  // had even seen the scenario, others never fired. The consequences
  // now live as `deferred` entries on each scenario option in
  // `data/scenarios.ts` with `lagQuarters` (relative to the decision
  // quarter), and resolve through the standard deferred-event loop
  // above. Self-heals if scenarios move; one place to author the
  // narrative; no engine code per twist.
  // ─ Resolve deferred events targeting this quarter ──────
  const triggeredEvents: QuarterCloseResult["triggeredEvents"] = [];
  const remainingDeferred: DeferredEvent[] = [];
  // Gate the resolve loop on boardDecisionsEnabled (May 2026 workshop
  // fix). Self-guided cohorts that opted out of board decisions were
  // still getting blindsided by deferred-event outcomes from PREVIOUS
  // sessions or auto-applied defaults — "Earlier decision · resolved
  // this quarter: S2 War in the Corridor · fired -$30M" showing up
  // unexplained. With this gate, no-decision mode drops every queued
  // deferred event silently (cleared from team state below).
  const boardDecisionsEnabled = ctx.boardDecisionsEnabled !== false;
  for (const ev of next.deferredEvents) {
    if (ev.resolved) continue;
    if (ev.targetQuarter !== ctx.quarter) {
      remainingDeferred.push(ev);
      continue;
    }
    // When board decisions are disabled, mark as silently dropped and
    // don't apply the effect. The event won't appear in triggeredEvents
    // so the Quarter Close modal "Earlier decision" panel stays empty.
    if (!boardDecisionsEnabled) continue;
    const roll = Math.random();
    if (roll <= ev.probability) {
      const eff = deserializeEffect(ev.effectJson);
      const cashDelta = (eff.cash ?? 0) + scaledCashAmount(next, eff.scaledCash);
      newCashUsd += cashDelta;
      next.brandPts = Math.max(0, next.brandPts + (eff.brandPts ?? 0));
      next.opsPts = Math.max(0, next.opsPts + (eff.opsPts ?? 0));
      next.customerLoyaltyPct = clamp(
        0, 100, next.customerLoyaltyPct + (eff.loyaltyDelta ?? 0),
      );
      if (eff.setFlags) for (const f of eff.setFlags) next.flags.add(f);
      if (eff.timedModifier) {
        const modifier = {
          id: eff.timedModifier.id,
          kind: eff.timedModifier.kind,
          activeFromQuarter: ctx.quarter,
          activeUntilQuarter: ctx.quarter + eff.timedModifier.durationQuarters - 1,
        };
        next.timedModifiers = [
          ...(next.timedModifiers ?? []).filter((m) => m.id !== modifier.id),
          modifier,
        ];
      }
      if (eff.opsExpansionSlots && eff.opsExpansionSlots !== 0) {
        const inv = next.hubInvestments ?? {
          fuelReserveTankHubs: [],
          maintenanceDepotHubs: [],
          premiumLoungeHubs: [],
          opsExpansionSlots: 0,
        };
        next.hubInvestments = {
          ...inv,
          opsExpansionSlots: Math.max(0, (inv.opsExpansionSlots ?? 0) + eff.opsExpansionSlots),
        };
      }
      triggeredEvents.push({
        id: ev.id,
        scenario: ev.sourceScenario,
        outcome: "triggered",
        cashDelta,
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
  if (isDoctrine(next, "premium-service") && loyaltyDelta > 0) {
    loyaltyDelta *= 1.5;
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

  // Long-haul prestige brand bonus (May 2026 — anti-short-haul-spam).
  // Real flag carriers build brand on their trans-continental and
  // trans-oceanic network: BA's LHR-JFK, Singapore's SQ-22, Emirates'
  // DXB-LAX. Running long routes (>5000 km) signals capability and
  // attracts the high-yield premium traveller; short-haul shuttle
  // operations don't move the brand needle the same way. This bonus
  // gives the strategic player a reason to invest in widebodies and
  // 12+ hour routes even though they're operationally more expensive.
  //   +0.3 brand pts/Q per active route 5,000-10,000 km
  //   +0.6 brand pts/Q per active route >10,000 km (ultra-long-haul)
  // Caps at +6 brand pts/Q total so a player can't farm brand purely
  // by spam-opening 30 long-haul lossmakers.
  let longHaulBrandBonus = 0;
  for (const r of next.routes) {
    if (r.status !== "active") continue;
    if (r.isCargo) continue; // cargo brand bonus modeled separately
    if (r.distanceKm > 10_000) longHaulBrandBonus += 0.6;
    else if (r.distanceKm > 5_000) longHaulBrandBonus += 0.3;
  }
  longHaulBrandBonus = Math.min(6, longHaulBrandBonus);
  if (longHaulBrandBonus > 0) {
    notes.push(`Long-haul prestige: +${longHaulBrandBonus.toFixed(1)} brand pts`);
  }

  // Premium-Hub synergy (May 2026 amendment).
  // When a team owns 3+ subsidiaries at a single city, that city
  // graduates to "Premium Hub" status — additional brand + loyalty
  // bonuses that compound the per-subsidiary demand bonus already
  // baked into route revenue. Rewards focused capital deployment
  // (build out one city as a flagship hub) over thinly-spread
  // investment across the network.
  //   3 subs @ city → +0.4 brand pts/Q, +0.2 loyalty drift
  //   4 subs        → +0.7 brand pts/Q, +0.4 loyalty drift
  //   5+ subs       → +1.1 brand pts/Q, +0.7 loyalty drift
  // Multiple Premium Hubs stack; total capped at +5 brand pts / +3
  // loyalty drift to keep things bounded for the cohort.
  let synergyBrandBonus = 0;
  let synergyLoyaltyDelta = 0;
  if ((next.subsidiaries?.length ?? 0) >= 3) {
    const cityCount = new Map<string, number>();
    for (const sub of next.subsidiaries ?? []) {
      cityCount.set(sub.cityCode, (cityCount.get(sub.cityCode) ?? 0) + 1);
    }
    for (const [, count] of cityCount) {
      if (count >= 5)      { synergyBrandBonus += 1.1; synergyLoyaltyDelta += 0.7; }
      else if (count === 4){ synergyBrandBonus += 0.7; synergyLoyaltyDelta += 0.4; }
      else if (count === 3){ synergyBrandBonus += 0.4; synergyLoyaltyDelta += 0.2; }
    }
    synergyBrandBonus = Math.min(5, synergyBrandBonus);
    synergyLoyaltyDelta = Math.min(3, synergyLoyaltyDelta);
    if (synergyBrandBonus > 0) {
      notes.push(`Premium Hub synergy: +${synergyBrandBonus.toFixed(1)} brand pts, +${synergyLoyaltyDelta.toFixed(1)}% loyalty drift`);
    }
  }

  const newBrandPts = Math.max(
    0,
    next.brandPts + brandDelta + dissonanceBrandPenalty + longHaulBrandBonus + synergyBrandBonus,
  );
  const newOpsPts = Math.max(0, next.opsPts + opsDelta);
  // Loyalty drifts toward 50 slightly, plus slider delta + premium-
  // hub drift bonus (drift toward 100, not 50, since loyal customers
  // anchored by city-side investments don't decay to mean).
  const drift = (50 - next.customerLoyaltyPct) * 0.03;
  const premiumHubLoyaltyDrift = synergyLoyaltyDelta > 0
    ? (100 - next.customerLoyaltyPct) * 0.01 * synergyLoyaltyDelta
    : 0;
  const newLoyalty = clamp(
    0, 100,
    next.customerLoyaltyPct + loyaltyDelta + drift + premiumHubLoyaltyDrift + dissonanceLoyaltyPenalty,
  );

  // Update team state for Brand Value calc
  next.cashUsd = newCashUsd;
  next.brandPts = newBrandPts;
  next.opsPts = newOpsPts;
  next.customerLoyaltyPct = newLoyalty;

  // ─ Underdog Sovereign Rescue — mandatory domestic route check ──
  // Brief §13 R30B: "one domestic route from hub_city must remain
  // operational for 4 rounds. If team closes it: brand_value -= 15
  // pts and government_champion flag revoked." We proxy "domestic"
  // by same-region routes from the hub city — the City type has no
  // country field so region is the closest available signal.
  {
    const hubCity = CITIES_BY_CODE[next.hubCode];
    const sameRegionRoutesFromHub = next.routes.filter(
      (r) => r.status === "active" &&
        (r.originCode === next.hubCode || r.destCode === next.hubCode) &&
        CITIES_BY_CODE[r.originCode === next.hubCode ? r.destCode : r.originCode]?.region === hubCity?.region,
    ).length;
    if (
      violatesMandatoryDomesticRoute(
        next, ctx.quarter, hubCity?.region, sameRegionRoutesFromHub,
      )
    ) {
      next.brandPts = Math.max(0, next.brandPts - 15);
      next.flags.delete("government_champion");
      notes.push(
        `Sovereign Rescue condition violated — no domestic route from ${hubCity?.name ?? next.hubCode}. ` +
        `Brand −15 pts · government_champion flag revoked.`,
      );
    }
  }

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
  next.labourRelationsScore = clamp(
    0,
    100,
    next.labourRelationsScore + lrsDelta + timedLabourRelationsDelta,
  );
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
  strikeChance = clamp(0, 0.85, strikeChance + digitalStrikeChance);

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
  const newsThisQuarter = newsForQuarter(ctx.quarter, ctx.totalRounds ?? 60);
  const OUTLETS = ["Sky News", "Bloomberg", "Reuters", "FT", "The Air Reporter", "AP", "BBC World", "WSJ", "Al Arabiya", "Nikkei Asia"];
  const outletForId = (id: string) => {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) & 0xffffffff;
    return OUTLETS[Math.abs(h) % OUTLETS.length];
  };
  const newsImpacts: QuarterCloseResult["newsImpacts"] = [];
  for (const n of newsThisQuarter) {
    const cities: NonNullable<QuarterCloseResult["newsImpacts"][number]["cities"]> = [];
    for (const code of networkCodes) {
      // Use THIS news item's own contribution, not the city-wide blended
      // pct from `cityEventImpact()`. The city-wide path was returning
      // the sum of every active news (lockdown + Tokyo delay + ...)
      // which made e.g. "E-commerce booms" headline show -73% net on
      // passenger hubs because the older lockdown news was bleeding in.
      // Each headline in the digest now shows only its own modifier
      // delta on the player's network. Per-category split is also
      // surfaced so a cargo-only +50% boost doesn't get averaged into
      // a misleading "+17% blended" chip.
      const impact = newsItemImpactForCity(n, code, ctx.quarter, ctx.totalRounds ?? 60);
      if (!impact) continue;
      // Skip cities where the news truly has no effect across any
      // category. The blended `pct` averaging means a cargo-only +50%
      // news shows pct=17 and would have been kept under the old
      // `pct === 0` filter; now we check whether ANY per-category
      // value is non-zero.
      if (impact.tourism === 0 && impact.business === 0 && impact.cargo === 0) continue;
      const city = CITIES_BY_CODE[code];
      if (!city) continue;
      cities.push({
        code,
        name: city.name,
        pct: impact.pct,
        tourism: impact.tourism,
        business: impact.business,
        cargo: impact.cargo,
      });
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

  // Routes the player created during the round being closed —
  // surfaced in the close modal's Headline tab and used by the map
  // to badge city pairs as "new".
  const newRoutesActivatedThisQuarter: QuarterCloseResult["newRoutesActivatedThisQuarter"] =
    next.routes
      .filter((r) => r.openQuarter === ctx.quarter && r.status !== "closed")
      .map((r) => ({
        routeId: r.id,
        originCode: r.originCode,
        destCode: r.destCode,
        originName: CITIES_BY_CODE[r.originCode]?.name ?? r.originCode,
        destName: CITIES_BY_CODE[r.destCode]?.name ?? r.destCode,
        isCargo: !!r.isCargo,
      }));

  return {
    quarter: ctx.quarter,
    revenue,
    passengerRevenue,
    cargoRevenue,
    fuelCost,
    slotCost,
    staffCost,
    leaseFeesUsd,
    subsidiaryRevenueUsd,
    airportRevenueUsd,
    otherSliderCost,
    marketingCost,
    serviceCost,
    operationsCost,
    customerServiceCost,
    obligationFinesUsd,
    maintenanceCost,
    insuranceCost: insurancePremium,
    depreciation,
    interest,
    tax,
    carbonLevy,
    passengerTax,
    fuelExcise,
    rcfInterest,
    rcfDrawDelta: newRcfBalance - startingRcfBalance,
    // Engine doesn't know about scrap / hull-insurance payouts —
    // those land in closeQuarter (see store/game.ts insuranceProceeds
    // accumulator). The store overwrites this with its own number
    // right after the engine returns. Default 0 keeps the type
    // honest for any caller that doesn't pass through the store.
    insuranceProceeds: 0,
    netProfit,
    newCashUsd,
    newRcfBalance,
    newFleet: next.fleet,
    newRoutes: next.routes,
    newBrandPts,
    newOpsPts,
    newLoyalty,
    newBrandValue,
    newFlags: Array.from(next.flags),
    newDeferredEvents: next.deferredEvents,
    newRouteObligations: next.routeObligations ?? [],
    newTimedModifiers: (next.timedModifiers ?? []).filter((m) => ctx.quarter <= m.activeUntilQuarter),
    newHubInvestments: next.hubInvestments,
    newLabourRelationsScore: next.labourRelationsScore,
    newMilestones: next.milestones ?? [],
    newTaxLossCarryForward: next.taxLossCarryForward,
    newSubsidiaries: next.subsidiaries,
    prevCashUsd,
    prevBrandPts,
    prevOpsPts,
    prevLoyalty,
    prevBrandValue,
    milestonesEarnedThisQuarter,
    newsImpacts,
    routeBreakdown,
    newRoutesActivatedThisQuarter,
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
