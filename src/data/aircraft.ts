import type { AircraftSpec } from "@/types/game";

/**
 * Canonical aircraft catalogue. Specs derive from SkyForce_Master_Reference.md
 * (Section 1A–1D) with three explicit per-user overrides:
 *   - CRJ-900   → 0F/0C/90Y · 2.6 L/km · $22M
 *   - B777-300ER → 0F/42C/354Y · 6.2 L/km · $145M (no first cabin)
 *   - B787-8    → 0F/32C/210Y · 3.8 L/km · $80M (no first cabin)
 *
 * Unlock cadence (gameplay-tuned): R1, R5, R9, R12, R16, R20, R21, R25, R28.
 * No further unlocks after R28 — players need lead time to use late-game types
 * before the campaign ends at R40.
 *
 * Cargo: 7 R1 starters + 7 R28 unlocks per master ref Q1 directive.
 */
export const AIRCRAFT: AircraftSpec[] = [
  // ─── R1 PASSENGER STARTERS (24 specs, all in service before 2015) ──────────

  // — Airbus narrow-body (3) —
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

  // — Airbus wide-body classic (2) —
  { id: "A330-200", name: "Airbus A330-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 17, business: 42, economy: 194 }, rangeKm: 12_500,
    fuelBurnPerKm: 4.6, buyPriceUsd: 75_000_000, leasePerQuarterUsd: 615_000,
    ecoUpgradeUsd: 7_500_000 },
  { id: "A330-300", name: "Airbus A330-300", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 46, economy: 213 }, rangeKm: 11_750,
    fuelBurnPerKm: 4.9, buyPriceUsd: 80_000_000, leasePerQuarterUsd: 655_000,
    ecoUpgradeUsd: 8_000_000, note: "Higher-density A330 (real EIS 1994). Best mid-haul economics." },

  // — Boeing 737 Classic + NG family (6) —
  { id: "B737-300", name: "Boeing 737-300", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 16, economy: 112 }, rangeKm: 4400,
    fuelBurnPerKm: 3.2, buyPriceUsd: 18_000_000, leasePerQuarterUsd: 148_000,
    ecoUpgradeUsd: 1_800_000, note: "Classic 737 (real EIS 1984). Cheap entry narrow-body, ageing fast." },
  { id: "B737-400", name: "Boeing 737-400", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 20, economy: 128 }, rangeKm: 5000,
    fuelBurnPerKm: 3.4, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Stretched Classic 737 (real EIS 1988). Workhorse for European low-cost routes." },
  { id: "B737-500", name: "Boeing 737-500", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 12, economy: 100 }, rangeKm: 5200,
    fuelBurnPerKm: 3.0, buyPriceUsd: 16_000_000, leasePerQuarterUsd: 132_000,
    ecoUpgradeUsd: 1_600_000, note: "Shortest Classic 737 (real EIS 1990). Best for thin short-haul." },
  { id: "B737-700", name: "Boeing 737-700", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 20, economy: 108 }, rangeKm: 6370,
    fuelBurnPerKm: 3.1, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Thin-route specialist. Lowest fuel burn in class." },
  { id: "B737-800", name: "Boeing 737-800", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 24, economy: 138 }, rangeKm: 5765,
    fuelBurnPerKm: 3.3, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 230_000,
    ecoUpgradeUsd: 2_800_000 },
  // NEW — B737-900 (EIS 1997). Stretched 737NG, 189 seats, between 737-800 and MAX-9.
  { id: "B737-900", name: "Boeing 737-900", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 28, economy: 161 }, rangeKm: 5925,
    fuelBurnPerKm: 3.4, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 260_000,
    ecoUpgradeUsd: 3_200_000, note: "Stretched 737NG (real EIS 1997). Larger classic option below MAX-9." },

  // — Boeing wide-body classic (5) —
  { id: "B747-400", name: "Boeing 747-400", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 58, economy: 340 }, rangeKm: 13_450,
    fuelBurnPerKm: 8.5, buyPriceUsd: 120_000_000, leasePerQuarterUsd: 980_000,
    ecoUpgradeUsd: 12_000_000, note: "Slot-constrained hub workhorse. Needs high load to profit." },
  { id: "B757-200", name: "Boeing 757-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 26, economy: 174 }, rangeKm: 7250,
    fuelBurnPerKm: 3.9, buyPriceUsd: 38_000_000, leasePerQuarterUsd: 310_000,
    ecoUpgradeUsd: 3_800_000, note: "Transatlantic narrow-body. Opens thin long-haul routes." },
  { id: "B767-300ER", name: "Boeing 767-300ER", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 42, economy: 158 }, rangeKm: 11_093,
    fuelBurnPerKm: 4.8, buyPriceUsd: 55_000_000, leasePerQuarterUsd: 450_000,
    ecoUpgradeUsd: 5_500_000 },
  { id: "B777-200", name: "Boeing 777-200", family: "passenger", unlockQuarter: 1,
    seats: { first: 18, business: 49, economy: 231 }, rangeKm: 9700,
    fuelBurnPerKm: 5.0, buyPriceUsd: 82_000_000, leasePerQuarterUsd: 672_000,
    ecoUpgradeUsd: 8_200_000, note: "Original 777 (real EIS 1995). Twin-engine widebody, shorter range than the ER." },
  { id: "B777-200ER", name: "Boeing 777-200ER", family: "passenger", unlockQuarter: 1,
    seats: { first: 21, business: 52, economy: 240 }, rangeKm: 13_080,
    fuelBurnPerKm: 5.2, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 735_000,
    ecoUpgradeUsd: 9_000_000, note: "Long-haul heavy lifter. Premium cabin yields shine." },
  // NEW — B777-200LR (EIS 2006). World's longest-range twin in 2015.
  { id: "B777-200LR", name: "Boeing 777-200LR", family: "passenger", unlockQuarter: 1,
    seats: { first: 14, business: 42, economy: 261 }, rangeKm: 15_843,
    fuelBurnPerKm: 5.5, buyPriceUsd: 130_000_000, leasePerQuarterUsd: 1_065_000,
    ecoUpgradeUsd: 13_000_000, note: "Ultra-long-haul (real EIS 2006). World's longest-range twin in 2015 — Emirates JFK-DXB workhorse." },

  // — Regional jets + turboprops (8) —
  // NEW — CRJ-700 (EIS 2001). 70 seats — smaller feeder.
  { id: "CRJ-700", name: "Bombardier CRJ-700", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 70 }, rangeKm: 3045,
    fuelBurnPerKm: 2.3, buyPriceUsd: 17_000_000, leasePerQuarterUsd: 140_000,
    ecoUpgradeUsd: 1_700_000, note: "Smaller CRJ feeder (real EIS 2001). Opens very thin regional routes economically." },
  // CRJ-900 — explicit user override.
  { id: "CRJ-900", name: "Bombardier CRJ-900", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 90 }, rangeKm: 2876,
    fuelBurnPerKm: 2.6, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Real EIS 2003. All-economy regional jet for short feeder routes." },
  { id: "Dash-8-400", name: "Bombardier Dash 8 Q400", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 78 }, rangeKm: 2040,
    fuelBurnPerKm: 1.6, buyPriceUsd: 10_000_000, leasePerQuarterUsd: 82_000,
    ecoUpgradeUsd: 1_000_000, note: "Turboprop regional (real EIS 2000). Lowest cost entry into thin short-haul." },
  // NEW — E175 (EIS 2004). 80 seats — most popular regional jet globally.
  { id: "E175", name: "Embraer E175", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 80 }, rangeKm: 3889,
    fuelBurnPerKm: 2.0, buyPriceUsd: 15_000_000, leasePerQuarterUsd: 123_000,
    ecoUpgradeUsd: 1_500_000, note: "US scope-clause favourite (real EIS 2004). Bridges E170/E190." },
  // NEW — E195 (EIS 2006). 118 seats — fills E190/E195-E2 gap.
  { id: "E195", name: "Embraer E195", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 118 }, rangeKm: 3990,
    fuelBurnPerKm: 2.2, buyPriceUsd: 20_000_000, leasePerQuarterUsd: 164_000,
    ecoUpgradeUsd: 2_000_000, note: "Larger Embraer regional (real EIS 2006). Operated by Azul, JetBlue, LOT." },
  // NEW — ATR 72-500 (EIS 1997). Cheaper, older sister of -600.
  { id: "ATR-72-500", name: "ATR 72-500", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 70 }, rangeKm: 1500,
    fuelBurnPerKm: 2.0, buyPriceUsd: 10_000_000, leasePerQuarterUsd: 82_000,
    ecoUpgradeUsd: 1_000_000, note: "Older ATR 72 (real EIS 1997). Cheaper than -600, worse fuel burn." },
  // NEW — ATR 42-600 (EIS 2014). Smallest turboprop, very thin routes.
  { id: "ATR-42-600", name: "ATR 42-600", family: "passenger", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 50 }, rangeKm: 1560,
    fuelBurnPerKm: 1.5, buyPriceUsd: 14_000_000, leasePerQuarterUsd: 115_000,
    ecoUpgradeUsd: 1_400_000, note: "Smallest turboprop (real EIS 2014). Niche island-route operator." },

  // ─── R1 CARGO STARTERS (7 specs) ──────────────────────────
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
  // NEW — B777F (EIS 2009). High-capacity twin-engine freighter.
  { id: "B777F", name: "Boeing 777F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 103, rangeKm: 9200,
    fuelBurnPerKm: 9.0, buyPriceUsd: 150_000_000, leasePerQuarterUsd: 1_200_000,
    ecoUpgradeUsd: 15_000_000, note: "High-capacity twin-engine freighter (real EIS 2009). Best balance of payload + range." },
  // NEW — A300-600F (EIS 1994). Mid-range freighter.
  { id: "A300-600F", name: "Airbus A300-600F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 52, rangeKm: 4450,
    fuelBurnPerKm: 6.8, buyPriceUsd: 40_000_000, leasePerQuarterUsd: 330_000,
    ecoUpgradeUsd: 4_000_000, note: "Mid-range freighter (real EIS 1994). FedEx/UPS workhorse on regional cargo." },
  // NEW — A330-200F (EIS 2010). Modern mid-size freighter.
  { id: "A330-200F", name: "Airbus A330-200F", family: "cargo", unlockQuarter: 1,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 70, rangeKm: 7400,
    fuelBurnPerKm: 7.2, buyPriceUsd: 95_000_000, leasePerQuarterUsd: 780_000,
    ecoUpgradeUsd: 9_500_000, note: "Modern mid-size freighter (real EIS 2010). Etihad Cargo / Qatar Cargo standard." },

  // ─── R5 (Q1 2016) ──────────────────────────────────────────
  // B777-300ER — explicit user override (no first cabin, all-business + dense Y).
  { id: "B777-300ER", name: "Boeing 777-300ER", family: "passenger", unlockQuarter: 5,
    seats: { first: 0, business: 42, economy: 354 }, rangeKm: 13_650,
    fuelBurnPerKm: 6.2, buyPriceUsd: 145_000_000, leasePerQuarterUsd: 1_185_000,
    ecoUpgradeUsd: 14_500_000, note: "Real EIS 2004. Long-haul flagship — best premium-cabin economics on dense long-haul." },
  { id: "E190", name: "Embraer E190", family: "passenger", unlockQuarter: 5,
    seats: { first: 0, business: 0, economy: 98 }, rangeKm: 4537,
    fuelBurnPerKm: 2.0, buyPriceUsd: 17_000_000, leasePerQuarterUsd: 139_000,
    ecoUpgradeUsd: 1_700_000, note: "Real EIS 2005. Premium regional jet, fits thin business routes." },

  // ─── R9 (Q1 2017) ──────────────────────────────────────────
  { id: "A380-800", name: "Airbus A380-800", family: "passenger", unlockQuarter: 9,
    seats: { first: 14, business: 76, economy: 465 }, rangeKm: 15_200,
    fuelBurnPerKm: 9.5, buyPriceUsd: 200_000_000, leasePerQuarterUsd: 1_635_000,
    ecoUpgradeUsd: 20_000_000, note: "Mega-capacity (real EIS 2007). Tier 1 airports only. Economics depend on load factor." },

  // ─── R12 (Q4 2017) ─────────────────────────────────────────
  // B787-8 — explicit user override (no first cabin).
  { id: "B787-8", name: "Boeing 787-8 Dreamliner", family: "passenger", unlockQuarter: 12,
    seats: { first: 0, business: 32, economy: 210 }, rangeKm: 13_620,
    fuelBurnPerKm: 3.8, buyPriceUsd: 80_000_000, leasePerQuarterUsd: 654_000,
    ecoUpgradeUsd: 8_000_000, note: "First composite widebody (real EIS 2011). 20% fuel saving. Delivery delay event fires R13." },
  { id: "ATR-72-600", name: "ATR 72-600", family: "passenger", unlockQuarter: 12,
    seats: { first: 0, business: 0, economy: 78 }, rangeKm: 1528,
    fuelBurnPerKm: 1.8, buyPriceUsd: 12_000_000, leasePerQuarterUsd: 98_000,
    ecoUpgradeUsd: 1_200_000, note: "Real EIS 2011. Most fuel-efficient turboprop on short routes." },

  // ─── R16 (Q4 2018) ─────────────────────────────────────────
  { id: "B747-8", name: "Boeing 747-8 Intercontinental", family: "passenger", unlockQuarter: 16,
    seats: { first: 14, business: 48, economy: 405 }, rangeKm: 14_815,
    fuelBurnPerKm: 8.8, buyPriceUsd: 180_000_000, leasePerQuarterUsd: 1_472_000,
    ecoUpgradeUsd: 18_000_000, note: "Real EIS 2012. Final 747 evolution; high-capacity hub-to-hub." },
  // NEW — E190-E2 (EIS 2018). Bridge between E190 and E195-E2.
  { id: "E190-E2", name: "Embraer E190-E2", family: "passenger", unlockQuarter: 16,
    seats: { first: 0, business: 0, economy: 104 }, rangeKm: 5278,
    fuelBurnPerKm: 2.4, buyPriceUsd: 26_000_000, leasePerQuarterUsd: 213_000,
    ecoUpgradeUsd: 2_600_000, note: "New-gen Embraer (real EIS 2018). KLM Cityhopper, Wideroe operator." },

  // ─── R20 (Q4 2019) ─────────────────────────────────────────
  { id: "B787-9", name: "Boeing 787-9 Dreamliner", family: "passenger", unlockQuarter: 20,
    seats: { first: 8, business: 32, economy: 256 }, rangeKm: 14_140,
    fuelBurnPerKm: 3.1, buyPriceUsd: 85_000_000, leasePerQuarterUsd: 695_000,
    ecoUpgradeUsd: 8_500_000, note: "Stretched 787 (real EIS 2014). Premium long-haul yields." },
  { id: "A350-900", name: "Airbus A350-900 XWB", family: "passenger", unlockQuarter: 20,
    seats: { first: 16, business: 40, economy: 259 }, rangeKm: 15_000,
    fuelBurnPerKm: 3.4, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 736_000,
    ecoUpgradeUsd: 9_000_000, note: "Real EIS 2015. 25% fuel saving. Best long-haul economics." },

  // ─── R21 (Q1 2020) — neo / MAX / A220 wave ────────────────
  { id: "A220-300", name: "Airbus A220-300", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 12, economy: 118 }, rangeKm: 6300,
    fuelBurnPerKm: 2.2, buyPriceUsd: 22_000_000, leasePerQuarterUsd: 180_000,
    ecoUpgradeUsd: 2_200_000, note: "Real EIS 2016 (as CSeries). Best narrow-body economics." },
  { id: "A320neo", name: "Airbus A320neo", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 24, economy: 156 }, rangeKm: 6300,
    fuelBurnPerKm: 2.8, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000, note: "Real EIS 2016. 18% fuel saving over A320ceo." },
  // NEW — A319neo (EIS 2018). Smaller neo, fills A220/A320 gap.
  { id: "A319neo", name: "Airbus A319neo", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 16, economy: 124 }, rangeKm: 6950,
    fuelBurnPerKm: 2.5, buyPriceUsd: 24_000_000, leasePerQuarterUsd: 196_000,
    ecoUpgradeUsd: 2_400_000, note: "Real EIS 2018. 18% fuel saving. Niche commercial — but useful capacity step." },
  { id: "A321neo", name: "Airbus A321neo", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 28, economy: 192 }, rangeKm: 7400,
    fuelBurnPerKm: 3.2, buyPriceUsd: 32_000_000, leasePerQuarterUsd: 262_000,
    ecoUpgradeUsd: 3_200_000, note: "Real EIS 2017. Stretched A320neo with longer range." },
  { id: "B737-MAX-8", name: "Boeing 737 MAX 8", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 24, economy: 154 }, rangeKm: 6500,
    fuelBurnPerKm: 2.9, buyPriceUsd: 26_000_000, leasePerQuarterUsd: 213_000,
    ecoUpgradeUsd: 2_600_000, note: "Real EIS 2017. 14% fuel saving over 737-800." },
  // NEW — B737 MAX 9 (EIS 2018). 193 seats — bridges MAX-8 and A321neo.
  { id: "B737-MAX-9", name: "Boeing 737 MAX 9", family: "passenger", unlockQuarter: 21,
    seats: { first: 0, business: 28, economy: 165 }, rangeKm: 6570,
    fuelBurnPerKm: 3.0, buyPriceUsd: 30_000_000, leasePerQuarterUsd: 245_000,
    ecoUpgradeUsd: 3_000_000, note: "Real EIS 2018. Bridges MAX-8 and A321neo. United, Lion Air operator." },

  // ─── R25 (Q1 2021) — late-gen widebodies + E2 ────────────
  { id: "A350-1000", name: "Airbus A350-1000", family: "passenger", unlockQuarter: 25,
    seats: { first: 18, business: 46, economy: 305 }, rangeKm: 16_100,
    fuelBurnPerKm: 3.7, buyPriceUsd: 115_000_000, leasePerQuarterUsd: 940_000,
    ecoUpgradeUsd: 11_500_000, note: "Real EIS 2018. Long-haul flagship; longest range in catalogue." },
  { id: "A330-900neo", name: "Airbus A330-900neo", family: "passenger", unlockQuarter: 25,
    seats: { first: 8, business: 36, economy: 243 }, rangeKm: 13_100,
    fuelBurnPerKm: 4.1, buyPriceUsd: 95_000_000, leasePerQuarterUsd: 777_000,
    ecoUpgradeUsd: 9_500_000, note: "Real EIS 2018. 14% fuel saving over A330ceo." },
  { id: "B787-10", name: "Boeing 787-10 Dreamliner", family: "passenger", unlockQuarter: 25,
    seats: { first: 8, business: 40, economy: 275 }, rangeKm: 11_910,
    fuelBurnPerKm: 3.3, buyPriceUsd: 90_000_000, leasePerQuarterUsd: 736_000,
    ecoUpgradeUsd: 9_000_000, note: "Real EIS 2018. Largest Dreamliner variant." },
  { id: "E195-E2", name: "Embraer E195-E2", family: "passenger", unlockQuarter: 25,
    seats: { first: 0, business: 0, economy: 146 }, rangeKm: 4800,
    fuelBurnPerKm: 2.1, buyPriceUsd: 24_000_000, leasePerQuarterUsd: 196_000,
    ecoUpgradeUsd: 2_400_000, note: "Real EIS 2019. New-gen regional, beats narrow-body fuel burn." },

  // ─── R28 (Q4 2021) — endgame catalogue ──────────────────
  { id: "A321XLR", name: "Airbus A321XLR", family: "passenger", unlockQuarter: 28,
    seats: { first: 0, business: 28, economy: 192 }, rangeKm: 8700,
    fuelBurnPerKm: 3.0, buyPriceUsd: 35_000_000, leasePerQuarterUsd: 286_000,
    ecoUpgradeUsd: 3_500_000, note: "Real EIS 2024. Transatlantic single-aisle. Late-game unlock." },
  { id: "B777X-9", name: "Boeing 777X-9", family: "passenger", unlockQuarter: 28,
    seats: { first: 12, business: 52, economy: 362 }, rangeKm: 13_500,
    fuelBurnPerKm: 4.6, buyPriceUsd: 180_000_000, leasePerQuarterUsd: 1_472_000,
    ecoUpgradeUsd: 18_000_000, note: "Real EIS 2026. Folding wingtips, 12% fuel saving over 777-300ER." },
  { id: "C919", name: "COMAC C919", family: "passenger", unlockQuarter: 28,
    seats: { first: 0, business: 16, economy: 152 }, rangeKm: 6250,
    fuelBurnPerKm: 2.7, buyPriceUsd: 24_000_000, leasePerQuarterUsd: 196_000,
    ecoUpgradeUsd: 2_400_000, note: "Real EIS 2022. China's narrow-body challenger to A320/737." },

  // ─── R28 CARGO UNLOCKS (7) ────────────────────────────────
  // Per user direction: ALL freighter unlocks consolidated at R28
  // (originally A380F R9, A330-300P2F R12, B747-8F + B737-800BCF R16,
  // A321P2F R25, B777-8F R29, ATR-72-600F R32 in the doc).
  { id: "A380F", name: "Airbus A380F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 150, rangeKm: 10_400,
    fuelBurnPerKm: 12.0, buyPriceUsd: 430_000_000, leasePerQuarterUsd: 3_517_000,
    ecoUpgradeUsd: 43_000_000, note: "Largest payload in catalogue. Tier 1 airports only." },
  { id: "A330-300P2F", name: "Airbus A330-300 P2F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 61, rangeKm: 7200,
    fuelBurnPerKm: 7.5, buyPriceUsd: 55_000_000, leasePerQuarterUsd: 450_000,
    ecoUpgradeUsd: 5_500_000, note: "Passenger-to-freighter conversion. Lower cost than new-build." },
  { id: "B747-8F", name: "Boeing 747-8F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 134, rangeKm: 8130,
    fuelBurnPerKm: 14.2, buyPriceUsd: 385_000_000, leasePerQuarterUsd: 3_148_000,
    ecoUpgradeUsd: 38_500_000, note: "Second-highest payload after A380F. Four engines." },
  { id: "B737-800BCF", name: "Boeing 737-800BCF", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 23, rangeKm: 5765,
    fuelBurnPerKm: 3.4, buyPriceUsd: 28_000_000, leasePerQuarterUsd: 229_000,
    ecoUpgradeUsd: 2_800_000, note: "Narrowbody e-commerce specialist. Converted freighter." },
  { id: "A321P2F", name: "Airbus A321 P2F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 28, rangeKm: 5950,
    fuelBurnPerKm: 3.9, buyPriceUsd: 35_000_000, leasePerQuarterUsd: 286_000,
    ecoUpgradeUsd: 3_500_000, note: "High-frequency e-commerce cargo. Passenger-to-freighter conversion." },
  { id: "B777-8F", name: "Boeing 777-8F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 118, rangeKm: 8165,
    fuelBurnPerKm: 8.1, buyPriceUsd: 430_000_000, leasePerQuarterUsd: 3_517_000,
    ecoUpgradeUsd: 43_000_000, note: "Most fuel-efficient per tonne in catalogue. Built on 777X platform." },
  { id: "ATR-72-600F", name: "ATR 72-600F", family: "cargo", unlockQuarter: 28,
    seats: { first: 0, business: 0, economy: 0 }, cargoTonnes: 8, rangeKm: 1528,
    fuelBurnPerKm: 1.8, buyPriceUsd: 12_000_000, leasePerQuarterUsd: 98_000,
    ecoUpgradeUsd: 1_200_000, note: "Turboprop regional freighter. Routes ≤1,600 km only — engine enforces." },
];

export const AIRCRAFT_BY_ID: Record<string, AircraftSpec> = AIRCRAFT.reduce(
  (acc, a) => {
    acc[a.id] = a;
    return acc;
  },
  {} as Record<string, AircraftSpec>,
);
