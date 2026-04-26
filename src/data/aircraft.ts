import type { AircraftSpec } from "@/types/game";

/**
 * SkyForce aircraft catalogue — sourced from the user's master reference
 * doc + the follow-up Update Brief (Updates 1 + 2 + cutoff schedule).
 *
 *  - 25 R1 passenger starters
 *  - 7 R1 cargo starters
 *  - 24 mid-game passenger unlocks (R5–R34, with two user overrides:
 *      B777X-8 → R32 (was R36), B737 MAX 10 → R34 (was R37))
 *  - 7 mid-game cargo unlocks (R9–R32 staggered per the new brief)
 *
 * Total = 63 airframes, matching the brief's "Grand total ever in game".
 *
 * Prices in this file are PLACEHOLDERS pulled directly from the brief
 * tables — the user has flagged that several look low vs real-world
 * list prices (A380 should be ~$350M, etc.). A pricing audit pass will
 * overwrite these once the user shares confirmed numbers.
 *
 * Each spec also carries `cutoffRound` per Update 4. After the cutoff
 * round the "Order new" button disappears for that spec but the type
 * keeps flying and trading on the secondary market. Aircraft without a
 * `cutoffRound` are still in production at the end of the campaign.
 */

const AIRCRAFT: AircraftSpec[] = [
  // ═══════════════════════════════════════════════════════════════
  // R1 passenger starters (25 airframes)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "A319", name: "Airbus A319", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 12, economy: 110 },
    rangeKm: 6_950, fuelBurnPerKm: 2.7,
    buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000,
    cutoffRound: 36,
  },
  {
    id: "A320", name: "Airbus A320", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 12, economy: 138 },
    rangeKm: 6_100, fuelBurnPerKm: 3.0,
    buyPriceUsd: 32_000_000, leasePerQuarterUsd: 261_000,
    ecoUpgradeUsd: 3_200_000,
    cutoffRound: 36,
  },
  {
    id: "A321", name: "Airbus A321", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 184 },
    rangeKm: 5_950, fuelBurnPerKm: 3.2,
    buyPriceUsd: 38_000_000, leasePerQuarterUsd: 311_000,
    ecoUpgradeUsd: 3_800_000,
    cutoffRound: 36,
  },
  {
    id: "A330-200", name: "Airbus A330-200", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 36, economy: 217 },
    rangeKm: 13_450, fuelBurnPerKm: 5.5,
    buyPriceUsd: 92_000_000, leasePerQuarterUsd: 752_000,
    ecoUpgradeUsd: 9_200_000,
    cutoffRound: 24,
  },
  {
    id: "A330-300", name: "Airbus A330-300", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 36, economy: 263 },
    rangeKm: 11_750, fuelBurnPerKm: 5.7,
    buyPriceUsd: 100_000_000, leasePerQuarterUsd: 818_000,
    ecoUpgradeUsd: 10_000_000,
    cutoffRound: 18,
  },
  {
    id: "B737-300", name: "Boeing 737-300", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 128 },
    rangeKm: 4_400, fuelBurnPerKm: 2.9,
    buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000,
    cutoffRound: 11,
  },
  {
    id: "B737-400", name: "Boeing 737-400", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 146 },
    rangeKm: 5_000, fuelBurnPerKm: 3.0,
    buyPriceUsd: 24_000_000, leasePerQuarterUsd: 196_000,
    ecoUpgradeUsd: 2_400_000,
    cutoffRound: 11,
  },
  {
    id: "B737-500", name: "Boeing 737-500", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 122 },
    rangeKm: 5_200, fuelBurnPerKm: 2.8,
    buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000,
    cutoffRound: 11,
  },
  {
    id: "B737-600", name: "Boeing 737-600", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 110 },
    rangeKm: 5_648, fuelBurnPerKm: 3.0,
    buyPriceUsd: 16_000_000, leasePerQuarterUsd: 132_000,
    ecoUpgradeUsd: 1_600_000,
    cutoffRound: 11,
  },
  {
    id: "B737-700", name: "Boeing 737-700", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 12, economy: 126 },
    rangeKm: 6_200, fuelBurnPerKm: 2.9,
    buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000,
    cutoffRound: 28,
  },
  {
    id: "B737-800", name: "Boeing 737-800", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 160 },
    rangeKm: 5_800, fuelBurnPerKm: 3.2,
    buyPriceUsd: 35_000_000, leasePerQuarterUsd: 286_000,
    ecoUpgradeUsd: 3_500_000,
    cutoffRound: 28,
  },
  {
    id: "B737-900", name: "Boeing 737-900", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 24, economy: 165 },
    rangeKm: 6_082, fuelBurnPerKm: 3.4,
    buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000,
    cutoffRound: 20,
  },
  {
    id: "B747-400", name: "Boeing 747-400", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 12, business: 60, economy: 344 },
    rangeKm: 13_450, fuelBurnPerKm: 12.0,
    buyPriceUsd: 175_000_000, leasePerQuarterUsd: 1_432_000,
    ecoUpgradeUsd: 17_500_000,
    cutoffRound: 13,
  },
  {
    id: "B757-200", name: "Boeing 757-200", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 184 },
    rangeKm: 7_250, fuelBurnPerKm: 3.6,
    buyPriceUsd: 45_000_000, leasePerQuarterUsd: 368_000,
    ecoUpgradeUsd: 4_500_000,
    cutoffRound: 12,
  },
  {
    id: "B767-300ER", name: "Boeing 767-300ER", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 6, business: 36, economy: 224 },
    rangeKm: 11_070, fuelBurnPerKm: 4.7,
    buyPriceUsd: 80_000_000, leasePerQuarterUsd: 654_000,
    ecoUpgradeUsd: 8_000_000,
    cutoffRound: 16,
  },
  {
    id: "B777-200", name: "Boeing 777-200", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 8, business: 40, economy: 257 },
    rangeKm: 9_700, fuelBurnPerKm: 5.5,
    buyPriceUsd: 130_000_000, leasePerQuarterUsd: 1_063_000,
    ecoUpgradeUsd: 13_000_000,
    cutoffRound: 17,
  },
  {
    id: "B777-200ER", name: "Boeing 777-200ER", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 8, business: 42, economy: 251 },
    rangeKm: 13_080, fuelBurnPerKm: 5.7,
    buyPriceUsd: 135_000_000, leasePerQuarterUsd: 1_104_000,
    ecoUpgradeUsd: 13_500_000,
    cutoffRound: 18,
  },
  {
    id: "B777-200LR", name: "Boeing 777-200LR", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 8, business: 40, economy: 269 },
    rangeKm: 15_843, fuelBurnPerKm: 5.1,
    buyPriceUsd: 98_000_000, leasePerQuarterUsd: 802_000,
    ecoUpgradeUsd: 9_800_000,
    cutoffRound: 12,
  },
  {
    id: "CRJ-700", name: "Bombardier CRJ-700", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 70 },
    rangeKm: 3_780, fuelBurnPerKm: 2.2,
    buyPriceUsd: 15_000_000, leasePerQuarterUsd: 123_000,
    ecoUpgradeUsd: 1_500_000,
    cutoffRound: 24,
  },
  {
    id: "CRJ-900", name: "Bombardier CRJ-900", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 90 },
    rangeKm: 2_956, fuelBurnPerKm: 2.6,
    buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000,
    cutoffRound: 24,
  },
  {
    id: "Dash-8-400", name: "Bombardier Dash 8 Q400", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 78 },
    rangeKm: 2_040, fuelBurnPerKm: 1.9,
    buyPriceUsd: 16_000_000, leasePerQuarterUsd: 130_000,
    ecoUpgradeUsd: 1_600_000,
  },
  {
    id: "E170", name: "Embraer E170", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 70 },
    rangeKm: 3_734, fuelBurnPerKm: 2.0,
    buyPriceUsd: 14_000_000, leasePerQuarterUsd: 115_000,
    ecoUpgradeUsd: 1_400_000,
    cutoffRound: 16,
  },
  {
    id: "E175", name: "Embraer E175", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 80 },
    rangeKm: 3_735, fuelBurnPerKm: 2.1,
    buyPriceUsd: 16_000_000, leasePerQuarterUsd: 131_000,
    ecoUpgradeUsd: 1_600_000,
  },
  {
    id: "E195", name: "Embraer E195", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 118 },
    rangeKm: 4_260, fuelBurnPerKm: 2.2,
    buyPriceUsd: 18_000_000, leasePerQuarterUsd: 147_000,
    ecoUpgradeUsd: 1_800_000,
    cutoffRound: 12,
  },
  {
    id: "ATR-72-500", name: "ATR 72-500", family: "passenger",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 70 },
    rangeKm: 1_528, fuelBurnPerKm: 2.0,
    buyPriceUsd: 9_000_000, leasePerQuarterUsd: 74_000,
    ecoUpgradeUsd: 900_000,
    cutoffRound: 13,
  },

  // ═══════════════════════════════════════════════════════════════
  // R1 cargo starters (7 airframes)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B737-300F", name: "Boeing 737-300F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 18,
    rangeKm: 4_200, fuelBurnPerKm: 2.9,
    buyPriceUsd: 14_000_000, leasePerQuarterUsd: 114_000,
    ecoUpgradeUsd: 1_400_000,
    cutoffRound: 15,
  },
  {
    id: "B757-200F", name: "Boeing 757-200F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 39,
    rangeKm: 5_834, fuelBurnPerKm: 3.6,
    buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000,
    cutoffRound: 12,
  },
  {
    id: "B767-300F", name: "Boeing 767-300F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 52,
    rangeKm: 6_025, fuelBurnPerKm: 4.6,
    buyPriceUsd: 75_000_000, leasePerQuarterUsd: 613_000,
    ecoUpgradeUsd: 7_500_000,
  },
  {
    id: "B747-400F", name: "Boeing 747-400F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 113,
    rangeKm: 8_240, fuelBurnPerKm: 12.0,
    buyPriceUsd: 200_000_000, leasePerQuarterUsd: 1_636_000,
    ecoUpgradeUsd: 20_000_000,
    cutoffRound: 13,
  },
  {
    id: "B777F", name: "Boeing 777F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 103,
    rangeKm: 9_200, fuelBurnPerKm: 9.0,
    buyPriceUsd: 150_000_000, leasePerQuarterUsd: 1_200_000,
    ecoUpgradeUsd: 15_000_000,
  },
  {
    id: "A300-600F", name: "Airbus A300-600F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 52,
    rangeKm: 4_450, fuelBurnPerKm: 6.8,
    buyPriceUsd: 40_000_000, leasePerQuarterUsd: 330_000,
    ecoUpgradeUsd: 4_000_000,
    cutoffRound: 14,
  },
  {
    id: "A330-200F", name: "Airbus A330-200F", family: "cargo",
    unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 70,
    rangeKm: 7_400, fuelBurnPerKm: 7.2,
    buyPriceUsd: 95_000_000, leasePerQuarterUsd: 780_000,
    ecoUpgradeUsd: 9_500_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R5 (Q1 2016)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B777-300ER", name: "Boeing 777-300ER", family: "passenger",
    unlockQuarter: 5,
    seats: { first: 0, business: 42, economy: 354 },
    rangeKm: 13_650, fuelBurnPerKm: 6.2,
    buyPriceUsd: 145_000_000, leasePerQuarterUsd: 1_186_000,
    ecoUpgradeUsd: 14_500_000,
    cutoffRound: 30,
  },
  {
    id: "E190", name: "Embraer E190", family: "passenger",
    unlockQuarter: 5,
    seats: { first: 0, business: 0, economy: 100 },
    rangeKm: 4_537, fuelBurnPerKm: 2.2,
    buyPriceUsd: 18_000_000, leasePerQuarterUsd: 147_000,
    ecoUpgradeUsd: 1_800_000,
    cutoffRound: 16,
  },

  // ═══════════════════════════════════════════════════════════════
  // R9 (Q1 2017)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "A380-800", name: "Airbus A380-800", family: "passenger",
    unlockQuarter: 9,
    seats: { first: 14, business: 76, economy: 470 },
    rangeKm: 14_800, fuelBurnPerKm: 11.5,
    buyPriceUsd: 190_000_000, leasePerQuarterUsd: 1_555_000,
    ecoUpgradeUsd: 19_000_000,
    cutoffRound: 27,
  },
  {
    id: "A380F", name: "Airbus A380F", family: "cargo",
    unlockQuarter: 9,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 150,
    rangeKm: 10_400, fuelBurnPerKm: 12.0,
    buyPriceUsd: 430_000_000, leasePerQuarterUsd: 3_517_000,
    ecoUpgradeUsd: 43_000_000,
    cutoffRound: 27,
    note: "Highest cargo payload (150T). Tier-1 airports only.",
  },

  // ═══════════════════════════════════════════════════════════════
  // R12 (Q4 2017)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B787-8", name: "Boeing 787-8 Dreamliner", family: "passenger",
    unlockQuarter: 12,
    seats: { first: 0, business: 32, economy: 210 },
    rangeKm: 13_620, fuelBurnPerKm: 3.8,
    buyPriceUsd: 80_000_000, leasePerQuarterUsd: 654_000,
    ecoUpgradeUsd: 8_000_000,
  },
  {
    id: "ATR-72-600", name: "ATR 72-600", family: "passenger",
    unlockQuarter: 12,
    seats: { first: 0, business: 0, economy: 70 },
    rangeKm: 1_528, fuelBurnPerKm: 1.8,
    buyPriceUsd: 12_000_000, leasePerQuarterUsd: 98_000,
    ecoUpgradeUsd: 1_200_000,
  },
  {
    id: "A330-300P2F", name: "Airbus A330-300 P2F", family: "cargo",
    unlockQuarter: 12,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 61,
    rangeKm: 7_200, fuelBurnPerKm: 7.5,
    buyPriceUsd: 55_000_000, leasePerQuarterUsd: 450_000,
    ecoUpgradeUsd: 5_500_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R16 (Q4 2018)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B747-8", name: "Boeing 747-8 Intercontinental", family: "passenger",
    unlockQuarter: 16,
    seats: { first: 8, business: 92, economy: 365 },
    rangeKm: 14_320, fuelBurnPerKm: 11.6,
    buyPriceUsd: 215_000_000, leasePerQuarterUsd: 1_759_000,
    ecoUpgradeUsd: 21_500_000,
    cutoffRound: 33,
  },
  {
    id: "E190-E2", name: "Embraer E190-E2", family: "passenger",
    unlockQuarter: 16,
    seats: { first: 0, business: 0, economy: 104 },
    rangeKm: 4_800, fuelBurnPerKm: 1.9,
    buyPriceUsd: 20_000_000, leasePerQuarterUsd: 164_000,
    ecoUpgradeUsd: 2_000_000,
  },
  {
    id: "B747-8F", name: "Boeing 747-8F", family: "cargo",
    unlockQuarter: 16,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 134,
    rangeKm: 8_130, fuelBurnPerKm: 14.2,
    buyPriceUsd: 385_000_000, leasePerQuarterUsd: 3_148_000,
    ecoUpgradeUsd: 38_500_000,
    cutoffRound: 33,
  },
  {
    id: "B737-800BCF", name: "Boeing 737-800BCF", family: "cargo",
    unlockQuarter: 16,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 23,
    rangeKm: 5_765, fuelBurnPerKm: 3.4,
    buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R20 (Q4 2019)
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B787-9", name: "Boeing 787-9 Dreamliner", family: "passenger",
    unlockQuarter: 20,
    seats: { first: 0, business: 48, economy: 248 },
    rangeKm: 14_140, fuelBurnPerKm: 3.1,
    buyPriceUsd: 85_000_000, leasePerQuarterUsd: 695_000,
    ecoUpgradeUsd: 8_500_000,
  },
  {
    id: "A350-900", name: "Airbus A350-900", family: "passenger",
    unlockQuarter: 20,
    seats: { first: 0, business: 48, economy: 267 },
    rangeKm: 15_000, fuelBurnPerKm: 3.4,
    buyPriceUsd: 90_000_000, leasePerQuarterUsd: 736_000,
    ecoUpgradeUsd: 9_000_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R21 (Q1 2020) — neo / MAX wave
  // ═══════════════════════════════════════════════════════════════
  {
    id: "A220-300", name: "Airbus A220-300", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 0, economy: 135 },
    rangeKm: 6_300, fuelBurnPerKm: 2.3,
    buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000,
  },
  {
    id: "A319neo", name: "Airbus A319neo", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 12, economy: 110 },
    rangeKm: 6_950, fuelBurnPerKm: 2.4,
    buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000,
  },
  {
    id: "A320neo", name: "Airbus A320neo", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 12, economy: 138 },
    rangeKm: 6_500, fuelBurnPerKm: 2.6,
    buyPriceUsd: 32_000_000, leasePerQuarterUsd: 261_000,
    ecoUpgradeUsd: 3_200_000,
  },
  {
    id: "A321neo", name: "Airbus A321neo", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 16, economy: 184 },
    rangeKm: 7_400, fuelBurnPerKm: 2.7,
    buyPriceUsd: 38_000_000, leasePerQuarterUsd: 311_000,
    ecoUpgradeUsd: 3_800_000,
  },
  {
    id: "B737-MAX-8", name: "Boeing 737 MAX 8", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 16, economy: 162 },
    rangeKm: 6_570, fuelBurnPerKm: 2.6,
    buyPriceUsd: 27_000_000, leasePerQuarterUsd: 220_000,
    ecoUpgradeUsd: 2_700_000,
  },
  {
    id: "B737-MAX-9", name: "Boeing 737 MAX 9", family: "passenger",
    unlockQuarter: 21,
    seats: { first: 0, business: 24, economy: 169 },
    rangeKm: 6_110, fuelBurnPerKm: 2.9,
    buyPriceUsd: 29_000_000, leasePerQuarterUsd: 237_000,
    ecoUpgradeUsd: 2_900_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R25 (Q1 2021) — late-gen widebodies + E2 + first cargo P2F
  // ═══════════════════════════════════════════════════════════════
  {
    id: "A350-1000", name: "Airbus A350-1000", family: "passenger",
    unlockQuarter: 25,
    seats: { first: 0, business: 54, economy: 315 },
    rangeKm: 16_100, fuelBurnPerKm: 3.7,
    buyPriceUsd: 115_000_000, leasePerQuarterUsd: 940_000,
    ecoUpgradeUsd: 11_500_000,
  },
  {
    id: "A330-900neo", name: "Airbus A330-900neo", family: "passenger",
    unlockQuarter: 25,
    seats: { first: 0, business: 36, economy: 251 },
    rangeKm: 13_300, fuelBurnPerKm: 3.0,
    buyPriceUsd: 95_000_000, leasePerQuarterUsd: 777_000,
    ecoUpgradeUsd: 9_500_000,
  },
  {
    id: "B787-10", name: "Boeing 787-10 Dreamliner", family: "passenger",
    unlockQuarter: 25,
    seats: { first: 0, business: 44, economy: 279 },
    rangeKm: 11_910, fuelBurnPerKm: 3.6,
    buyPriceUsd: 90_000_000, leasePerQuarterUsd: 736_000,
    ecoUpgradeUsd: 9_000_000,
  },
  {
    id: "E195-E2", name: "Embraer E195-E2", family: "passenger",
    unlockQuarter: 25,
    seats: { first: 0, business: 0, economy: 146 },
    rangeKm: 4_815, fuelBurnPerKm: 2.0,
    buyPriceUsd: 24_000_000, leasePerQuarterUsd: 196_000,
    ecoUpgradeUsd: 2_400_000,
  },
  {
    id: "E175-E2", name: "Embraer E175-E2", family: "passenger",
    unlockQuarter: 25,
    seats: { first: 0, business: 0, economy: 80 },
    rangeKm: 3_735, fuelBurnPerKm: 1.9,
    buyPriceUsd: 20_000_000, leasePerQuarterUsd: 164_000,
    ecoUpgradeUsd: 2_000_000,
    cutoffRound: 35,
    note: "Programme cancellation announced R28; final orders accepted through R35 (10-round minimum).",
  },
  {
    id: "A321P2F", name: "Airbus A321 P2F", family: "cargo",
    unlockQuarter: 25,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 28,
    rangeKm: 5_950, fuelBurnPerKm: 3.9,
    buyPriceUsd: 35_000_000, leasePerQuarterUsd: 286_000,
    ecoUpgradeUsd: 3_500_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R28 (Q4 2021) — endgame catalogue
  // ═══════════════════════════════════════════════════════════════
  {
    id: "A321XLR", name: "Airbus A321XLR", family: "passenger",
    unlockQuarter: 28,
    seats: { first: 0, business: 16, economy: 184 },
    rangeKm: 8_700, fuelBurnPerKm: 2.7,
    buyPriceUsd: 42_000_000, leasePerQuarterUsd: 343_000,
    ecoUpgradeUsd: 4_200_000,
  },
  {
    id: "B777X-9", name: "Boeing 777X-9", family: "passenger",
    unlockQuarter: 28,
    seats: { first: 8, business: 64, economy: 354 },
    rangeKm: 13_500, fuelBurnPerKm: 4.5,
    buyPriceUsd: 165_000_000, leasePerQuarterUsd: 1_350_000,
    ecoUpgradeUsd: 16_500_000,
  },
  {
    id: "C919", name: "COMAC C919", family: "passenger",
    unlockQuarter: 28,
    seats: { first: 0, business: 8, economy: 150 },
    rangeKm: 5_555, fuelBurnPerKm: 2.8,
    buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R29 (Q1 2022) cargo
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B777-8F", name: "Boeing 777-8F", family: "cargo",
    unlockQuarter: 29,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 118,
    rangeKm: 8_165, fuelBurnPerKm: 8.1,
    buyPriceUsd: 430_000_000, leasePerQuarterUsd: 3_517_000,
    ecoUpgradeUsd: 43_000_000,
  },

  // ═══════════════════════════════════════════════════════════════
  // R32 — user override: B777X-8 here instead of brief's R36
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B777X-8", name: "Boeing 777X-8", family: "passenger",
    unlockQuarter: 32,
    seats: { first: 8, business: 52, economy: 335 },
    rangeKm: 16_090, fuelBurnPerKm: 4.3,
    buyPriceUsd: 185_000_000, leasePerQuarterUsd: 1_513_000,
    ecoUpgradeUsd: 18_500_000,
    note: "Longest-range airframe in the simulation.",
  },
  {
    id: "ATR-72-600F", name: "ATR 72-600F", family: "cargo",
    unlockQuarter: 32,
    seats: { first: 0, business: 0, economy: 0 },
    cargoTonnes: 8,
    rangeKm: 1_528, fuelBurnPerKm: 1.8,
    buyPriceUsd: 12_000_000, leasePerQuarterUsd: 98_000,
    ecoUpgradeUsd: 1_200_000,
    note: "Routes ≤ 1,600 km only (turboprop).",
  },

  // ═══════════════════════════════════════════════════════════════
  // R34 — user override: B737 MAX 10 here instead of brief's R37
  // ═══════════════════════════════════════════════════════════════
  {
    id: "B737-MAX-10", name: "Boeing 737 MAX 10", family: "passenger",
    unlockQuarter: 34,
    seats: { first: 0, business: 24, economy: 206 },
    rangeKm: 6_110, fuelBurnPerKm: 2.9,
    buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000,
    note: "Largest narrowbody in the simulation (230 seats default).",
  },
];

export { AIRCRAFT };
export const AIRCRAFT_BY_ID: Record<string, AircraftSpec> =
  Object.fromEntries(AIRCRAFT.map((a) => [a.id, a]));
