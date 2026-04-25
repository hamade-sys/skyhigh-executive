import type { AircraftSpec } from "@/types/game";

/** Specs from PRD §6.1–6.2. Unlock quarter from §6.2. */
export const AIRCRAFT: AircraftSpec[] = [
  // ─── Q1 passenger starts (narrow + wide body) ──────────────
  { id: "A319", name: "Airbus A319", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 108 }, rangeKm: 6850,
    fuelBurnPerKm: 3.2, buyPriceUsd: 20_000_000, leasePerQuarterUsd: 165_000,
    ecoUpgradeUsd: 2_000_000, note: "Regional workhorse. Narrow-body efficiency on thin routes." },
  { id: "A320", name: "Airbus A320", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 24, economy: 126 }, rangeKm: 6150,
    fuelBurnPerKm: 3.4, buyPriceUsd: 25_000_000, leasePerQuarterUsd: 205_000,
    ecoUpgradeUsd: 2_500_000, note: "Core medium-haul narrow-body. Industry workhorse." },
  { id: "A321", name: "Airbus A321", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 28, economy: 157 }, rangeKm: 5950,
    fuelBurnPerKm: 3.8, buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000, note: "Stretched A320. Best for dense regional routes." },
  { id: "B737-700", name: "Boeing 737-700", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 20, economy: 108 }, rangeKm: 6370,
    fuelBurnPerKm: 3.1, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Thin-route specialist. Lowest fuel burn in class." },
  { id: "B737-800", name: "Boeing 737-800", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 24, economy: 138 }, rangeKm: 5765,
    fuelBurnPerKm: 3.3, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 230_000,
    ecoUpgradeUsd: 2_800_000 },
  { id: "B757-200", name: "Boeing 757-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 26, economy: 174 }, rangeKm: 7250,
    fuelBurnPerKm: 3.9, buyPriceUsd: 38_000_000, leasePerQuarterUsd: 310_000,
    ecoUpgradeUsd: 3_800_000, note: "Transatlantic narrow-body. Opens thin long-haul routes." },
  { id: "B767-300ER", name: "Boeing 767-300ER", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 42, economy: 158 }, rangeKm: 11_093,
    fuelBurnPerKm: 4.8, buyPriceUsd: 55_000_000, leasePerQuarterUsd: 450_000,
    ecoUpgradeUsd: 5_500_000 },
  { id: "A330-200", name: "Airbus A330-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 17, business: 42, economy: 194 }, rangeKm: 12_500,
    fuelBurnPerKm: 4.6, buyPriceUsd: 75_000_000, leasePerQuarterUsd: 615_000,
    ecoUpgradeUsd: 7_500_000 },
  { id: "B777-200ER", name: "Boeing 777-200ER", family: "passenger", unlockQuarter: 1,
    seats: { first: 21, business: 52, economy: 240 }, rangeKm: 13_080,
    fuelBurnPerKm: 5.2, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 735_000,
    ecoUpgradeUsd: 9_000_000, note: "Long-haul heavy lifter. Premium cabin yields shine." },
  { id: "B747-400", name: "Boeing 747-400", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 58, economy: 340 }, rangeKm: 13_450,
    fuelBurnPerKm: 8.5, buyPriceUsd: 120_000_000, leasePerQuarterUsd: 980_000,
    ecoUpgradeUsd: 12_000_000, note: "Slot-constrained hub workhorse. Needs high load to profit." },
  // A330-300 EIS 1994 → R1 (pre-2000 → starter)
  { id: "A330-300", name: "Airbus A330-300", family: "passenger", unlockQuarter: 1,
    seats: { first: 12, business: 42, economy: 241 }, rangeKm: 11_750,
    fuelBurnPerKm: 5.1, buyPriceUsd: 82_000_000, leasePerQuarterUsd: 670_000,
    ecoUpgradeUsd: 8_200_000, note: "Higher-density A330 (real EIS 1994). Best mid-haul economics." },
  // Dash 8-400 EIS 2000 → R1 (turboprop regional)
  { id: "Dash-8-400", name: "Bombardier Dash 8 Q400", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 78 }, rangeKm: 2040,
    fuelBurnPerKm: 1.5, buyPriceUsd: 18_000_000, leasePerQuarterUsd: 150_000,
    ecoUpgradeUsd: 1_800_000, note: "Turboprop regional (real EIS 2000). Best on thin short-haul routes." },
  // ─── Early-1990s holdover narrow-bodies (still flying in fleets at game start) ──
  // 737-300 EIS 1984 → R1 (pre-2000)
  { id: "B737-300", name: "Boeing 737-300", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 12, economy: 116 }, rangeKm: 4400,
    fuelBurnPerKm: 3.0, buyPriceUsd: 18_000_000, leasePerQuarterUsd: 148_000,
    ecoUpgradeUsd: 1_800_000, note: "Classic 737 (real EIS 1984). Cheap entry narrow-body, ageing fast." },
  // 737-400 EIS 1988 → R1
  { id: "B737-400", name: "Boeing 737-400", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 130 }, rangeKm: 5000,
    fuelBurnPerKm: 3.2, buyPriceUsd: 21_000_000, leasePerQuarterUsd: 170_000,
    ecoUpgradeUsd: 2_100_000, note: "Stretched Classic 737 (real EIS 1988). Workhorse for European low-cost routes." },
  // 737-500 EIS 1990 → R1
  { id: "B737-500", name: "Boeing 737-500", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 8, economy: 100 }, rangeKm: 4400,
    fuelBurnPerKm: 2.9, buyPriceUsd: 17_000_000, leasePerQuarterUsd: 140_000,
    ecoUpgradeUsd: 1_700_000, note: "Shortest Classic 737 (real EIS 1990). Best for thin short-haul." },
  // 777-200 EIS 1995 → R1 (base 777, pre-ER)
  { id: "B777-200", name: "Boeing 777-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 14, business: 42, economy: 245 }, rangeKm: 9700,
    fuelBurnPerKm: 5.0, buyPriceUsd: 78_000_000, leasePerQuarterUsd: 640_000,
    ecoUpgradeUsd: 7_800_000, note: "Original 777 (real EIS 1995). Twin-engine widebody, shorter range than the ER." },

  // ─── Q1 cargo ───────────────────────────────────────────────
  { id: "B737-300F", name: "Boeing 737-300F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 20, rangeKm: 4200,
    fuelBurnPerKm: 3.4, buyPriceUsd: 18_000_000, leasePerQuarterUsd: 148_000,
    ecoUpgradeUsd: 1_800_000 },
  { id: "B757-200F", name: "Boeing 757-200F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 39, rangeKm: 7500,
    fuelBurnPerKm: 4.2, buyPriceUsd: 35_000_000, leasePerQuarterUsd: 285_000,
    ecoUpgradeUsd: 3_500_000 },
  { id: "B767-300F", name: "Boeing 767-300F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 52, rangeKm: 9100,
    fuelBurnPerKm: 6.5, buyPriceUsd: 50_000_000, leasePerQuarterUsd: 410_000,
    ecoUpgradeUsd: 5_000_000 },
  { id: "B747-400F", name: "Boeing 747-400F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 113, rangeKm: 8230,
    fuelBurnPerKm: 14.0, buyPriceUsd: 110_000_000, leasePerQuarterUsd: 900_000,
    ecoUpgradeUsd: 11_000_000 },

  // ─── Unlocks ────────────────────────────────────────────────
  // 40-round game (2015-2024 calendar) with 2:1 aircraft EIS
  // compression: real year 2000 → round 1, real year 2026 →
  // round 53 (clamped to 40). Formula: round = floor((eis-2000)/2)*4 + 1.
  // A380 EIS 2007 → round 13
  { id: "A380-800", name: "Airbus A380-800", family: "passenger", unlockQuarter: 13,
    seats: { first: 14, business: 76, economy: 465 }, rangeKm: 15_200,
    fuelBurnPerKm: 11.0, buyPriceUsd: 200_000_000, leasePerQuarterUsd: 1_640_000,
    ecoUpgradeUsd: 20_000_000, note: "Mega-capacity (real EIS 2007). Economics depend on load factor." },
  // 787-8 EIS 2011 → round 21
  { id: "B787-8", name: "Boeing 787-8 Dreamliner", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 32, economy: 210 }, rangeKm: 13_620,
    fuelBurnPerKm: 3.8, buyPriceUsd: 70_000_000, leasePerQuarterUsd: 575_000,
    ecoUpgradeUsd: 7_000_000, note: "First composite widebody (real EIS 2011). 20% fuel saving." },
  // 787-9 EIS 2014 → round 29
  { id: "B787-9", name: "Boeing 787-9 Dreamliner", family: "passenger", unlockQuarter: 29,
    seats: { first: 0, business: 48, economy: 248 }, rangeKm: 14_140,
    fuelBurnPerKm: 4.2, buyPriceUsd: 80_000_000, leasePerQuarterUsd: 655_000,
    ecoUpgradeUsd: 8_000_000, note: "Stretched 787 (real EIS 2014). Premium long-haul yields." },
  // A350-900 EIS 2015 → round 29
  { id: "A350-900", name: "Airbus A350-900 XWB", family: "passenger", unlockQuarter: 29,
    seats: { first: 0, business: 48, economy: 267 }, rangeKm: 15_000,
    fuelBurnPerKm: 4.0, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 738_000,
    ecoUpgradeUsd: 9_000_000, note: "Real EIS 2015. 25% fuel saving. Best long-haul economics." },
  // A220-300 EIS 2016 → round 33
  { id: "A220-300", name: "Airbus A220-300", family: "passenger", unlockQuarter: 33,
    seats: { first: 0, business: 12, economy: 118 }, rangeKm: 6300,
    fuelBurnPerKm: 2.5, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Real EIS 2016 (as CSeries). Best narrow-body economics." },
  // A320neo EIS 2016 → round 33
  { id: "A320neo", name: "Airbus A320neo", family: "passenger", unlockQuarter: 33,
    seats: { first: 0, business: 24, economy: 156 }, rangeKm: 6500,
    fuelBurnPerKm: 2.8, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 230_000,
    ecoUpgradeUsd: 2_800_000, note: "Real EIS 2016. 18% fuel saving over A320ceo." },
  // 737 MAX 8 EIS 2017 → round 33
  { id: "B737-MAX-8", name: "Boeing 737 MAX 8", family: "passenger", unlockQuarter: 33,
    seats: { first: 0, business: 20, economy: 158 }, rangeKm: 6570,
    fuelBurnPerKm: 2.9, buyPriceUsd: 26_000_000, leasePerQuarterUsd: 215_000,
    ecoUpgradeUsd: 2_600_000, note: "Real EIS 2017. 14% fuel saving over 737-800." },
  // A321neo EIS 2017 → round 33
  { id: "A321neo", name: "Airbus A321neo", family: "passenger", unlockQuarter: 33,
    seats: { first: 0, business: 28, economy: 192 }, rangeKm: 7400,
    fuelBurnPerKm: 3.0, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 265_000,
    ecoUpgradeUsd: 3_200_000, note: "Real EIS 2017. Stretched A320neo with longer range." },
  // A350-1000 EIS 2018 → round 37
  { id: "A350-1000", name: "Airbus A350-1000", family: "passenger", unlockQuarter: 37,
    seats: { first: 4, business: 56, economy: 327 }, rangeKm: 16_000,
    fuelBurnPerKm: 4.4, buyPriceUsd: 110_000_000, leasePerQuarterUsd: 905_000,
    ecoUpgradeUsd: 11_000_000, note: "Real EIS 2018. Long-haul flagship." },
  // A330-900neo EIS 2018 → round 37
  { id: "A330-900neo", name: "Airbus A330-900neo", family: "passenger", unlockQuarter: 37,
    seats: { first: 0, business: 36, economy: 252 }, rangeKm: 13_300,
    fuelBurnPerKm: 4.1, buyPriceUsd: 85_000_000, leasePerQuarterUsd: 700_000,
    ecoUpgradeUsd: 8_500_000, note: "Real EIS 2018. 14% fuel saving over A330ceo." },
  // 787-10 EIS 2018 → round 37
  { id: "B787-10", name: "Boeing 787-10 Dreamliner", family: "passenger", unlockQuarter: 37,
    seats: { first: 0, business: 56, economy: 280 }, rangeKm: 11_730,
    fuelBurnPerKm: 4.5, buyPriceUsd: 95_000_000, leasePerQuarterUsd: 780_000,
    ecoUpgradeUsd: 9_500_000, note: "Real EIS 2018. Largest Dreamliner variant." },
  // A321XLR EIS 2024 → round 40 (clamped)
  { id: "A321XLR", name: "Airbus A321XLR", family: "passenger", unlockQuarter: 40,
    seats: { first: 0, business: 24, economy: 196 }, rangeKm: 8700,
    fuelBurnPerKm: 3.4, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 265_000,
    ecoUpgradeUsd: 3_200_000, note: "Real EIS 2024. Transatlantic single-aisle. Late-game unlock." },
  // 777X-9 EIS 2026 → round 40 (clamped)
  { id: "B777X-9", name: "Boeing 777X-9", family: "passenger", unlockQuarter: 40,
    seats: { first: 8, business: 68, economy: 350 }, rangeKm: 13_940,
    fuelBurnPerKm: 5.0, buyPriceUsd: 180_000_000, leasePerQuarterUsd: 1_475_000,
    ecoUpgradeUsd: 18_000_000, note: "Real EIS 2026. Late-game unlock." },

  // ─── Mid-game unlocks: regional + alt brands ───────────────
  // CRJ-900 EIS 2003 → round 5
  { id: "CRJ-900", name: "Bombardier CRJ-900", family: "passenger", unlockQuarter: 5,
    seats: { first: 0, business: 12, economy: 78 }, rangeKm: 2876,
    fuelBurnPerKm: 2.6, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Real EIS 2003. Regional jet for short feeder routes." },
  // 777-300ER EIS 2004 → round 9
  { id: "B777-300ER", name: "Boeing 777-300ER", family: "passenger", unlockQuarter: 9,
    seats: { first: 8, business: 64, economy: 324 }, rangeKm: 13_650,
    fuelBurnPerKm: 6.2, buyPriceUsd: 105_000_000, leasePerQuarterUsd: 860_000,
    ecoUpgradeUsd: 10_500_000, note: "Real EIS 2004. Long-haul flagship of the 2000s." },
  // E190 EIS 2005 → round 9
  { id: "E190", name: "Embraer E190", family: "passenger", unlockQuarter: 9,
    seats: { first: 0, business: 12, economy: 88 }, rangeKm: 4537,
    fuelBurnPerKm: 2.7, buyPriceUsd: 24_000_000, leasePerQuarterUsd: 195_000,
    ecoUpgradeUsd: 2_400_000, note: "Real EIS 2005. Premium regional jet, fits thin business routes." },
  // ATR 72-600 EIS 2011 → round 21
  { id: "ATR-72-600", name: "ATR 72-600", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 0, economy: 70 }, rangeKm: 1528,
    fuelBurnPerKm: 1.4, buyPriceUsd: 21_000_000, leasePerQuarterUsd: 170_000,
    ecoUpgradeUsd: 2_100_000, note: "Real EIS 2011. Most fuel-efficient turboprop on short routes." },
  // 747-8 EIS 2012 → round 25
  { id: "B747-8", name: "Boeing 747-8 Intercontinental", family: "passenger", unlockQuarter: 25,
    seats: { first: 12, business: 70, economy: 386 }, rangeKm: 14_320,
    fuelBurnPerKm: 8.0, buyPriceUsd: 135_000_000, leasePerQuarterUsd: 1_100_000,
    ecoUpgradeUsd: 13_500_000, note: "Real EIS 2012. Final 747 evolution; high-capacity hub-to-hub." },
  // E195-E2 EIS 2019 → round 37
  { id: "E195-E2", name: "Embraer E195-E2", family: "passenger", unlockQuarter: 37,
    seats: { first: 0, business: 12, economy: 120 }, rangeKm: 4815,
    fuelBurnPerKm: 2.4, buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000, note: "Real EIS 2019. New-gen regional, beats narrow-body fuel burn." },
  // C919 EIS 2022 → round 40 (clamped)
  { id: "C919", name: "COMAC C919", family: "passenger", unlockQuarter: 40,
    seats: { first: 0, business: 18, economy: 140 }, rangeKm: 5555,
    fuelBurnPerKm: 3.1, buyPriceUsd: 25_000_000, leasePerQuarterUsd: 205_000,
    ecoUpgradeUsd: 2_500_000, note: "Real EIS 2022. China's narrow-body challenger to A320/737." },
];

export const AIRCRAFT_BY_ID: Record<string, AircraftSpec> = AIRCRAFT.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<string, AircraftSpec>,
);
