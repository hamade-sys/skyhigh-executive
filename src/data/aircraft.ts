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

  // ─── Unlocks (real-world EIS years mapped to game quarters via
  //     gameQuarterFromYear, 1.3 yrs/Q anchored at 2000) ───────────
  // A380 EIS 2007 → Q6 (~2006.5)
  { id: "A380-800", name: "Airbus A380-800", family: "passenger", unlockQuarter: 6,
    seats: { first: 14, business: 76, economy: 465 }, rangeKm: 15_200,
    fuelBurnPerKm: 11.0, buyPriceUsd: 200_000_000, leasePerQuarterUsd: 1_640_000,
    ecoUpgradeUsd: 20_000_000, note: "Mega-capacity (EIS 2007). Economics depend entirely on load factor." },
  // 787-8 EIS 2011 → Q9 (~2010.4)
  { id: "B787-8", name: "Boeing 787-8 Dreamliner", family: "passenger", unlockQuarter: 9,
    seats: { first: 0, business: 32, economy: 210 }, rangeKm: 13_620,
    fuelBurnPerKm: 3.8, buyPriceUsd: 70_000_000, leasePerQuarterUsd: 575_000,
    ecoUpgradeUsd: 7_000_000, note: "First composite-airframe widebody (EIS 2011). 20% fuel saving." },
  // 787-9 EIS 2014 → Q12 (~2014.3)
  { id: "B787-9", name: "Boeing 787-9 Dreamliner", family: "passenger", unlockQuarter: 12,
    seats: { first: 0, business: 48, economy: 248 }, rangeKm: 14_140,
    fuelBurnPerKm: 4.2, buyPriceUsd: 80_000_000, leasePerQuarterUsd: 655_000,
    ecoUpgradeUsd: 8_000_000, note: "Stretched 787 (EIS 2014). Opens thin long-haul with premium yields." },
  // A320neo EIS 2016 → Q13 (~2015.6)
  { id: "A320neo", name: "Airbus A320neo", family: "passenger", unlockQuarter: 13,
    seats: { first: 0, business: 24, economy: 156 }, rangeKm: 6500,
    fuelBurnPerKm: 2.8, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 230_000,
    ecoUpgradeUsd: 2_800_000, note: "EIS 2016. 18% fuel saving over A320ceo. Modern-fleet flag." },
  // A350-900 EIS 2015 → Q12 (~2015.6 but rounds to 12)
  { id: "A350-900", name: "Airbus A350-900 XWB", family: "passenger", unlockQuarter: 12,
    seats: { first: 0, business: 48, economy: 267 }, rangeKm: 15_000,
    fuelBurnPerKm: 4.0, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 738_000,
    ecoUpgradeUsd: 9_000_000, note: "EIS 2015. 25% fuel saving. Best long-haul economics." },
  // A220-300 EIS 2016 (as CSeries) → Q13
  { id: "A220-300", name: "Airbus A220-300", family: "passenger", unlockQuarter: 13,
    seats: { first: 0, business: 12, economy: 118 }, rangeKm: 6300,
    fuelBurnPerKm: 2.5, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "EIS 2016 (as CSeries). Right-size for thin regional." },
  // 737 MAX 8 EIS 2017 → Q14 (~2016.9)
  { id: "B737-MAX-8", name: "Boeing 737 MAX 8", family: "passenger", unlockQuarter: 14,
    seats: { first: 0, business: 20, economy: 158 }, rangeKm: 6570,
    fuelBurnPerKm: 2.9, buyPriceUsd: 26_000_000, leasePerQuarterUsd: 215_000,
    ecoUpgradeUsd: 2_600_000, note: "EIS 2017. 14% fuel saving over 737-800." },
  // A350-1000 EIS 2018 → Q14 (~2016.9 in 1.3-yr mapping, use 15)
  { id: "A350-1000", name: "Airbus A350-1000", family: "passenger", unlockQuarter: 15,
    seats: { first: 4, business: 56, economy: 327 }, rangeKm: 16_000,
    fuelBurnPerKm: 4.4, buyPriceUsd: 110_000_000, leasePerQuarterUsd: 905_000,
    ecoUpgradeUsd: 11_000_000, note: "EIS 2018. Long-haul flagship, A380-killer for thin routes." },
  // A321neo EIS 2017 → Q14
  { id: "A321neo", name: "Airbus A321neo", family: "passenger", unlockQuarter: 14,
    seats: { first: 0, business: 28, economy: 192 }, rangeKm: 7400,
    fuelBurnPerKm: 3.0, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 265_000,
    ecoUpgradeUsd: 3_200_000, note: "EIS 2017. Stretched A320neo with longer range." },
  // A330neo EIS 2018 → Q15
  { id: "A330-900neo", name: "Airbus A330-900neo", family: "passenger", unlockQuarter: 15,
    seats: { first: 0, business: 36, economy: 252 }, rangeKm: 13_300,
    fuelBurnPerKm: 4.1, buyPriceUsd: 85_000_000, leasePerQuarterUsd: 700_000,
    ecoUpgradeUsd: 8_500_000, note: "EIS 2018. 14% fuel saving over A330ceo." },
  // 787-10 EIS 2018 → Q15
  { id: "B787-10", name: "Boeing 787-10 Dreamliner", family: "passenger", unlockQuarter: 15,
    seats: { first: 0, business: 56, economy: 280 }, rangeKm: 11_730,
    fuelBurnPerKm: 4.5, buyPriceUsd: 95_000_000, leasePerQuarterUsd: 780_000,
    ecoUpgradeUsd: 9_500_000, note: "EIS 2018. Largest Dreamliner variant." },
  // A321XLR EIS 2024 → Q19
  { id: "A321XLR", name: "Airbus A321XLR", family: "passenger", unlockQuarter: 19,
    seats: { first: 0, business: 24, economy: 196 }, rangeKm: 8700,
    fuelBurnPerKm: 3.4, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 265_000,
    ecoUpgradeUsd: 3_200_000, note: "EIS 2024. Transatlantic single-aisle." },
  // 777X-9 EIS 2026 → Q20 (just barely available end-game)
  { id: "B777X-9", name: "Boeing 777X-9", family: "passenger", unlockQuarter: 20,
    seats: { first: 8, business: 68, economy: 350 }, rangeKm: 13_940,
    fuelBurnPerKm: 5.0, buyPriceUsd: 180_000_000, leasePerQuarterUsd: 1_475_000,
    ecoUpgradeUsd: 18_000_000, note: "EIS 2026. 12% fuel saving over 777-200ER." },
];

export const AIRCRAFT_BY_ID: Record<string, AircraftSpec> = AIRCRAFT.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<string, AircraftSpec>,
);
