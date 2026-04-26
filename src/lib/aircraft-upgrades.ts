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
