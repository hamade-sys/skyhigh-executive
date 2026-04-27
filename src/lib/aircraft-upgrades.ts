/**
 * Aircraft retrofit pricing — single source of truth shared by the
 * Purchase Order modal and the orderAircraft store action.
 *
 * Earlier the UI computed costs as 10% / 20% of buy price while the
 * store charged a flat $24.9M / $49.8M. A player would see "+$8M
 * fuselage" on a $80M Dreamliner, click Order, and get billed $24.9M
 * instead. Now both layers call these helpers.
 *
 * Pricing model: percentage-of-airframe so a $40M ATR doesn't pay the
 * same retrofit fee as a $400M A380. Floor of $2M to keep small-spec
 * upgrades non-trivial.
 */
export type EngineUpgradeKind = "fuel" | "power" | "super";

const ENGINE_PCT: Record<EngineUpgradeKind, number> = {
  fuel: 0.10,    // -10% fuel burn, +10% range
  power: 0.10,   // +10% cruise speed (raises rotation cap)
  super: 0.20,   // both — costs both fuel + power upgrades
};
const FUSELAGE_PCT = 0.10;
const FLOOR_USD = 2_000_000;

export function engineUpgradeCostUsd(buyPriceUsd: number, kind: EngineUpgradeKind): number {
  return Math.max(FLOOR_USD, Math.round(buyPriceUsd * ENGINE_PCT[kind]));
}

export function fuselageUpgradeCostUsd(buyPriceUsd: number): number {
  return Math.max(FLOOR_USD, Math.round(buyPriceUsd * FUSELAGE_PCT));
}

/** Sum of upgrade costs for a single airframe order config. Returns
 *  the total per-plane retrofit fee on top of the base buy/lease
 *  price. Used by both the Purchase Order preview and the store. */
export function totalUpgradeCostPerPlaneUsd(
  buyPriceUsd: number,
  engineUpgrade: EngineUpgradeKind | null | undefined,
  fuselageUpgrade: boolean,
): number {
  return (
    (engineUpgrade ? engineUpgradeCostUsd(buyPriceUsd, engineUpgrade) : 0) +
    (fuselageUpgrade ? fuselageUpgradeCostUsd(buyPriceUsd) : 0)
  );
}

// ─── Cabin amenities ────────────────────────────────────────────
// Each is a purchase-time toggle. Cost is a fraction of the spec buy
// price so the same percentages scale across narrow-body and widebody.
// Satisfaction bumps stack — a plane with all four amenities sits ~24
// satisfaction points above a stripped airframe.

export const AMENITY_PCT = {
  wifi: 0.010,           // 1% of buy price · +5 satisfaction
  premiumSeating: 0.030, // 3% of buy price · +8 satisfaction
  entertainment: 0.015,  // 1.5% of buy price · +5 satisfaction
  foodService: 0.020,    // 2% of buy price · +6 satisfaction
} as const;

export const AMENITY_SAT_BUMP = {
  wifi: 5,
  premiumSeating: 8,
  entertainment: 5,
  foodService: 6,
} as const;

export function amenityCostUsd(
  buyPriceUsd: number,
  amenities: { wifi?: boolean; premiumSeating?: boolean; entertainment?: boolean; foodService?: boolean } | undefined,
): number {
  if (!amenities) return 0;
  let total = 0;
  if (amenities.wifi) total += buyPriceUsd * AMENITY_PCT.wifi;
  if (amenities.premiumSeating) total += buyPriceUsd * AMENITY_PCT.premiumSeating;
  if (amenities.entertainment) total += buyPriceUsd * AMENITY_PCT.entertainment;
  if (amenities.foodService) total += buyPriceUsd * AMENITY_PCT.foodService;
  return Math.round(total);
}

// ─── Cargo belly upgrade for passenger planes ─────────────────────
// Player-spec'd: tonnage by seat count, expanded tier = 1.5×. Cost
// 10% of spec buy price for standard, 20% for expanded.

export const CARGO_BELLY_COST_PCT = {
  standard: 0.10,
  expanded: 0.20,
} as const;

/** Standard cargo-belly tonnage capacity by total seat count. */
export function cargoBellyStandardTonnes(totalSeats: number): number {
  if (totalSeats >= 400) return 25;
  if (totalSeats >= 300) return 20;
  if (totalSeats >= 200) return 10;
  if (totalSeats >= 100) return 5;
  return 0;  // sub-100-seat regional jets don't get a belly tier
}

/** Effective belly tonnage for a passenger airframe given its tier. */
export function cargoBellyTonnes(
  totalSeats: number,
  tier: "none" | "standard" | "expanded" | undefined,
): number {
  if (!tier || tier === "none") return 0;
  const base = cargoBellyStandardTonnes(totalSeats);
  if (tier === "standard") return base;
  return Math.round(base * 1.5);  // expanded
}

export function cargoBellyCostUsd(
  buyPriceUsd: number,
  tier: "none" | "standard" | "expanded" | undefined,
): number {
  if (!tier || tier === "none") return 0;
  return Math.round(buyPriceUsd * CARGO_BELLY_COST_PCT[tier]);
}
