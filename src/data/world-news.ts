import type { NewsItem, NewsModifier } from "@/types/game";

/**
 * World news for SkyForce — sourced from SkyForce_Master_Reference.md
 * (Section 2: World News — All 40 Rounds).
 *
 * The reference doc was authored against ~125 city codes; we run on a
 * curated 100-city database. Codes the doc references but our DB
 * doesn't carry have been REPLACED at authorship time per the
 * locked-in user-approved replacement map:
 *
 *   ALA→DXB · AUS→SEA · BHX→MAN · BIO→BCN · CHE→MAA · CUN→MEX
 *   EDI→MAN · EKB→SVO · FUK→KIX · GMP→ICN · GVA→ZRH · HYD→BOM
 *   KZN→SVO · LED→SVO · LEJ→FRA · LYS→CDG · MRS→CDG · NCE→CDG
 *   NGO→KIX · NTE→CDG · ORY→CDG · ROM→FCO · TSE→DXB · VCE→MXP
 *
 * Three cities were ADDED to the database to keep narrative anchors:
 *   BER (Berlin) · KBP (Kyiv) · BEY (Beirut)
 *
 * Per user content rule, the simulation never references Tel Aviv,
 * Israel, or the TLV airport code in any headline, detail, or
 * modifier. The Beirut market (BEY) carries any Levant-region
 * narrative that previously involved TLV.
 *
 * When multiple regional hosts collapsed onto a single city (e.g. four
 * French Euros hosts → CDG), the modifiers were summed/averaged into
 * a single boosted modifier and the headline rewritten so the player
 * sees one CDG line, not four.
 *
 * Each entry carries:
 *   - headline / detail / icon for display
 *   - structured `modifiers` array that the engine applies to route
 *     demand each round (city + category + pct + rounds-active)
 *   - optional global fuelIndexAtBaseline (overrides FUEL_INDEX_BY_QUARTER
 *     when present) and travelIndex (multiplies global demand).
 */

function n(opts: {
  quarter: number;
  id: string;
  icon: string;
  impact: NewsItem["impact"];
  headline: string;
  detail: string;
  modifiers?: NewsModifier[];
  fuelIndexAtBaseline?: number;
  travelIndex?: number;
}): NewsItem {
  return {
    id: `Q${opts.quarter}-${opts.id}`,
    quarter: opts.quarter,
    icon: opts.icon,
    impact: opts.impact,
    headline: opts.headline,
    detail: opts.detail,
    modifiers: opts.modifiers,
    fuelIndexAtBaseline: opts.fuelIndexAtBaseline,
    travelIndex: opts.travelIndex,
  };
}

/** Helper: build a list of identical modifiers for several cities. */
function spread(
  cities: string[],
  category: NewsModifier["category"],
  pct: number,
  rounds: number,
): NewsModifier[] {
  return cities.map((city) => ({ city, category, pct, rounds }));
}

export const WORLD_NEWS: NewsItem[] = [
  // ═══ R01 — Q1 2015 — Market Open + Expo Milan + Rugby WC ═══
  n({
    quarter: 1, id: "MILAN", icon: "🏛", impact: "tourism",
    headline: "Expo 2015 Milan opens — 'Feeding the Planet' draws 145 nations",
    detail: "Italy's greatest event since 1906. Northern Italy tourism season starts 3 months early. MXP slot pressure high.",
    modifiers: [
      { city: "MXP", category: "tourism", pct: 45, rounds: 3 },
      { city: "FCO", category: "tourism", pct: 20, rounds: 2 },
      { city: "MXP", category: "tourism", pct: 25, rounds: 2 },  // VCE → MXP
      { city: "ZRH", category: "tourism", pct: 15, rounds: 1 },
    ],
  }),
  n({
    quarter: 1, id: "RUGBY", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup 2015 England opens — 20 nations, 48 matches",
    detail: "London + Manchester at capacity. International fan travel intense.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 40, rounds: 2 },
      { city: "MAN", category: "tourism", pct: 45, rounds: 2 },  // BHX + EDI collapsed in
    ],
  }),
  n({
    quarter: 1, id: "BIZ", icon: "💼", impact: "business",
    headline: "Global business travel rebounds — GBTA forecasts $1.25T in 2015 corporate spend",
    detail: "Strongest since 2008. Premium cabin yields rising. Belt-tightening era over.",
    modifiers: spread(["LHR", "JFK"], "business", 15, 2)
      .concat(spread(["SIN", "HKG", "DXB"], "business", 12, 2)),
  }),
  n({
    quarter: 1, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude oil collapses to $48/barrel — OPEC refuses to cut",
    detail: "Best fuel window in 6 years. Fill storage tanks now.",
    fuelIndexAtBaseline: 78,
  }),
  n({
    quarter: 1, id: "MAQ", icon: "🍲", impact: "none",
    headline: "Maqlouba named world's best dish for 2015",
    detail: "Competition immediately appeals to UN Security Council. No game impact.",
  }),

  // ═══ R02 — Q2 2015 — Rugby Final + Expo Peak ═══
  n({
    quarter: 2, id: "RUGBY-FINAL", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup Final — New Zealand wins third title at Twickenham",
    detail: "Best tournament in history. London tourism at absolute peak. Post-event fans extending UK stays.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 60, rounds: 1 },
      { city: "MAN", category: "tourism", pct: 45, rounds: 1 },
    ],
    travelIndex: 105,
  }),
  n({
    quarter: 2, id: "MILAN-MID", icon: "🏛", impact: "tourism",
    headline: "Expo 2015 Milan passes 21M visitors at midpoint",
    detail: "Northern Italy at capacity. Mediterranean cruise-and-fly packages fully sold.",
    modifiers: [
      { city: "MXP", category: "tourism", pct: 55, rounds: 2 },
      { city: "FCO", category: "tourism", pct: 25, rounds: 1 },
    ],
  }),
  n({
    quarter: 2, id: "INDIA", icon: "🇮🇳", impact: "business",
    headline: "India overtakes China as fastest-growing major economy",
    detail: "Modi's 'Make in India' drives corporate investment surge. Permanent demand upgrade.",
    modifiers: [
      { city: "BLR", category: "business", pct: 30, rounds: 99 },
      { city: "BOM", category: "business", pct: 25, rounds: 99 },
      { city: "DEL", category: "business", pct: 25, rounds: 99 },
    ],
  }),
  n({
    quarter: 2, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Saudi Arabia signals continued high production — fuel index stays at 80",
    detail: "Sustained low-cost window. Ops-focused teams benefit most. Build storage.",
    fuelIndexAtBaseline: 80,
  }),
  n({
    quarter: 2, id: "EXPO-CALL", icon: "📞", impact: "none",
    headline: "Sources confirm 'quick call' between airline CEO and Expo organiser lasted 54 minutes",
    detail: "Both parties surprised. No game impact.",
  }),

  // ═══ R03 — Q3 2015 — China Crash + B777-300ER/E190 Announced ═══
  n({
    quarter: 3, id: "CHINA-CRASH", icon: "📉", impact: "business",
    headline: "Chinese stock market crashes — $4 trillion wiped in 3 weeks",
    detail: "Consumer confidence collapses across China and Hong Kong. China outbound tourism drops sharply.",
    modifiers: [
      { city: "PEK", category: "tourism", pct: -25, rounds: 2 },
      { city: "PEK", category: "business", pct: -20, rounds: 2 },
      { city: "PVG", category: "tourism", pct: -25, rounds: 2 },
      { city: "PVG", category: "business", pct: -20, rounds: 2 },
      { city: "HKG", category: "tourism", pct: -20, rounds: 2 },
      { city: "HKG", category: "business", pct: -15, rounds: 2 },
      { city: "CAN", category: "tourism", pct: -20, rounds: 2 },
    ],
    travelIndex: 97,
  }),
  n({
    quarter: 3, id: "MED", icon: "🏖", impact: "tourism",
    headline: "European summer peak despite Greek debt crisis — Mediterranean tourism at record",
    detail: "Greek banking crisis reduces ATH demand but Spain + Italy absorb diverted tourists.",
    modifiers: [
      { city: "BCN", category: "tourism", pct: 30, rounds: 1 },
      { city: "FCO", category: "tourism", pct: 25, rounds: 1 },
      { city: "MAD", category: "tourism", pct: 20, rounds: 1 },
      { city: "ATH", category: "tourism", pct: -20, rounds: 2 },
    ],
  }),
  n({
    quarter: 3, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude dips below $45/barrel on Chinese demand fears — multi-year low",
    detail: "Best moment to lock in storage for the next 4 rounds.",
    fuelIndexAtBaseline: 75,
  }),
  n({
    quarter: 3, id: "ANNOUNCE-R5", icon: "✈︎", impact: "ops",
    headline: "Boeing 777-300ER and Embraer E190 enter commercial availability — Q1 2016",
    detail: "777-300ER (354Y, 13,650km) substantial long-haul upgrade. E190 (98 seats) ideal for thin regional routes. Pre-orders open this round.",
  }),
  n({
    quarter: 3, id: "CARGO-CN", icon: "📦", impact: "cargo",
    headline: "Asia-Europe cargo lanes disrupted as Chinese manufacturing slows — air freight rates drop 12%",
    detail: "Cargo demand on Asia-Europe routes down. Opportunity on resilient markets.",
    modifiers: [
      { city: "PVG", category: "cargo", pct: -15, rounds: 2 },
      { city: "CAN", category: "cargo", pct: -15, rounds: 2 },
      { city: "HKG", category: "cargo", pct: -10, rounds: 2 },
    ],
  }),

  // ═══ R04 — Q4 2015 — Paris Attacks + COP21 + Cheap Fuel ═══
  n({
    quarter: 4, id: "PARIS", icon: "⚠", impact: "tourism",
    headline: "Paris terror attacks — 130 killed across Bataclan and restaurant sites",
    detail: "France declares state of emergency. European travel warnings issued. CDG worst affected.",
    modifiers: [
      { city: "CDG", category: "tourism", pct: -40, rounds: 3 },
      { city: "CDG", category: "business", pct: -25, rounds: 3 },
      { city: "MAD", category: "tourism", pct: -20, rounds: 2 },
      { city: "FRA", category: "tourism", pct: -15, rounds: 2 },
      { city: "AMS", category: "tourism", pct: -10, rounds: 1 },
      { city: "BCN", category: "tourism", pct: -15, rounds: 2 },
      { city: "FCO", category: "tourism", pct: -10, rounds: 1 },
    ],
    travelIndex: 92,
  }),
  n({
    quarter: 4, id: "COP21", icon: "🌱", impact: "brand",
    headline: "COP21 Paris Agreement signed — 196 nations commit to carbon-neutral aviation by 2050",
    detail: "Early signal for future carbon regulations. Operations-strong airlines accumulate brand advantage.",
  }),
  n({
    quarter: 4, id: "DXB-15M", icon: "🗽", impact: "tourism",
    headline: "Dubai breaks 15M international visitor milestone — UAE tourism investment accelerating",
    detail: "DXB demand permanently elevated. Dubai hotel rates now highest in world.",
    modifiers: [{ city: "DXB", category: "tourism", pct: 20, rounds: 99 }],
  }),
  n({
    quarter: 4, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude hits $36/barrel — lowest since 2009. Simulation low",
    detail: "Cheapest fuel in the simulation. If storage isn't full, fill it now.",
    fuelIndexAtBaseline: 72,
  }),
  n({
    quarter: 4, id: "UN", icon: "🇺🇳", impact: "none",
    headline: "UN General Assembly produces record communique",
    detail: "Delegates confirm 'alignment' achieved on 3 of 847 agenda items. No game impact.",
  }),

  // ═══ R05 — Q1 2016 — Euros Build-Up + Saudi Vision 2030 + B777-300ER & E190 Available ═══
  n({
    quarter: 5, id: "EURO", icon: "⚽", impact: "tourism",
    headline: "UEFA Euro 2016 France — 3 months out. Hotels fully sold through July",
    detail: "Pre-tournament demand surge across France. Paris terror-effect completely reversed by Euro excitement.",
    modifiers: [
      // BIO + LYS + MRS + NCE all collapsed into CDG (single boosted line)
      { city: "CDG", category: "tourism", pct: 60, rounds: 3 },
      { city: "BCN", category: "tourism", pct: 35, rounds: 2 },  // BIO → BCN
    ],
  }),
  n({
    quarter: 5, id: "SAUDI", icon: "🇸🇦", impact: "business",
    headline: "Saudi Arabia launches Vision 2030 — $500B Neom announced",
    detail: "Tourism and business travel infrastructure revolution begins. Permanent upward trajectory.",
    modifiers: [
      { city: "RUH", category: "business", pct: 35, rounds: 99 },
      { city: "RUH", category: "tourism", pct: 20, rounds: 99 },
      { city: "JED", category: "tourism", pct: 25, rounds: 99 },
      { city: "DXB", category: "business", pct: 10, rounds: 4 },
    ],
  }),
  n({
    quarter: 5, id: "RIO-PRE", icon: "🥇", impact: "tourism",
    headline: "Rio 2016 Olympics — 4 months out. Brazil completes final venues",
    detail: "GRU + GIG advance bookings underway. South America routes filling fast.",
    modifiers: [
      { city: "GRU", category: "tourism", pct: 40, rounds: 2 },
      { city: "GIG", category: "tourism", pct: 35, rounds: 2 },
      { city: "EZE", category: "tourism", pct: 20, rounds: 2 },
    ],
  }),
  n({
    quarter: 5, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude recovers to $42/barrel — fuel index climbs to 80",
    detail: "Cheap fuel window closing.",
    fuelIndexAtBaseline: 80,
  }),
  n({
    quarter: 5, id: "AVAIL-R5", icon: "✈︎", impact: "ops",
    headline: "B777-300ER and E190 now available for purchase",
    detail: "B777-300ER: 354Y, 13,650km, $145M. E190: 98 seats, 4,537km, $17M.",
  }),

  // ═══ R06 — Q2 2016 — Euros + Copa + Brexit ═══
  n({
    quarter: 6, id: "EURO-PEAK", icon: "⚽", impact: "tourism",
    headline: "UEFA Euro 2016 opens in Paris — 24 nations, 51 matches. Portugal wins final",
    detail: "France sees highest tourist numbers ever recorded in one month. All routes to France 95%+ occupancy.",
    modifiers: [{ city: "CDG", category: "tourism", pct: 90, rounds: 2 }],  // collapsed regionals
    travelIndex: 110,
  }),
  n({
    quarter: 6, id: "COPA", icon: "🏆", impact: "tourism",
    headline: "Copa América Centenario USA — first held outside South America",
    detail: "US stadium cities see Latin American travel surge. MIA, JFK busy.",
    modifiers: [
      { city: "JFK", category: "tourism", pct: 30, rounds: 1 },
      { city: "MIA", category: "tourism", pct: 35, rounds: 1 },
      { city: "ORD", category: "tourism", pct: 25, rounds: 1 },
      { city: "IAH", category: "tourism", pct: 30, rounds: 1 },
    ],
  }),
  n({
    quarter: 6, id: "BREXIT", icon: "⚠", impact: "business",
    headline: "Brexit referendum: UK votes 52% Leave — pound crashes 10%",
    detail: "Business investment frozen overnight. London business travel drops sharply. Dublin, Amsterdam, Frankfurt benefit immediately.",
    modifiers: [
      { city: "LHR", category: "business", pct: -20, rounds: 3 },
      { city: "LHR", category: "tourism", pct: -10, rounds: 3 },
      { city: "DUB", category: "business", pct: 25, rounds: 4 },
      { city: "AMS", category: "business", pct: 15, rounds: 4 },
      { city: "FRA", category: "business", pct: 15, rounds: 4 },
    ],
  }),
  n({
    quarter: 6, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude climbs to $50/barrel — OPEC production freeze talks",
    detail: "Fuel costs rising. Index 88.",
    fuelIndexAtBaseline: 88,
  }),
  n({
    quarter: 6, id: "BREXIT-TABLE", icon: "🪑", impact: "none",
    headline: "Brexit negotiators agree on negotiating table dimensions",
    detail: "Substantive talks expected 'imminently'. 'Imminently' remains undefined.",
  }),

  // ═══ R07 — Q3 2016 — Rio Olympics + A380 Family Announced ═══
  n({
    quarter: 7, id: "RIO", icon: "🥇", impact: "tourism",
    headline: "Rio 2016 Summer Olympics opens — 10,500 athletes, 206 nations. Perfect Games",
    detail: "South America at absolute peak. GRU + GIG flights at 98%+ occupancy. One of the highest-demand rounds in the simulation.",
    modifiers: [
      { city: "GRU", category: "tourism", pct: 130, rounds: 2 },
      { city: "GIG", category: "tourism", pct: 120, rounds: 2 },
      { city: "EZE", category: "tourism", pct: 60, rounds: 2 },
      { city: "BOG", category: "tourism", pct: 35, rounds: 2 },
      { city: "LIM", category: "tourism", pct: 30, rounds: 2 },
    ],
    travelIndex: 108,
  }),
  n({
    quarter: 7, id: "ANNOUNCE-R9", icon: "✈︎", impact: "ops",
    headline: "Airbus announces A380-800 + A380F — Q1 2017 commercial availability",
    detail: "A380-800: 555 seats, 15,200km. A380F: 150T payload, 10,400km. Both Tier 1 airports only. Pre-orders open.",
  }),
  n({
    quarter: 7, id: "PYEONG-PRE", icon: "🇰🇷", impact: "tourism",
    headline: "Pyeongchang 2018 Winter Olympics confirmed — South Korea announces $13B infrastructure",
    detail: "Korean aviation market entering pre-event growth cycle.",
    modifiers: [{ city: "ICN", category: "tourism", pct: 25, rounds: 6 }],
  }),
  n({
    quarter: 7, id: "FUEL", icon: "$", impact: "fuel",
    headline: "OPEC agrees informal production ceiling — crude climbs to $53/barrel",
    detail: "Fuel cost pressure returning. Index 92.",
    fuelIndexAtBaseline: 92,
  }),
  n({
    quarter: 7, id: "ECOM", icon: "📦", impact: "cargo",
    headline: "E-commerce surpasses traditional retail in five major markets — air cargo at record",
    detail: "Cargo demand on all T1-T2 hub routes surging.",
    modifiers: spread(["JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS"], "cargo", 20, 4),
  }),

  // ═══ R08 — Q4 2016 — Post-Olympics + Trump Election ═══
  n({
    quarter: 8, id: "TRUMP", icon: "🇺🇸", impact: "business",
    headline: "Donald Trump elected US President — global trade uncertainty",
    detail: "Business travel planning frozen across Fortune 500. JFK, ORD, DFW business drops.",
    modifiers: [
      { city: "JFK", category: "business", pct: -15, rounds: 2 },
      { city: "ORD", category: "business", pct: -12, rounds: 2 },
      { city: "DFW", category: "business", pct: -10, rounds: 2 },
      { city: "LAX", category: "business", pct: -10, rounds: 2 },
    ],
    travelIndex: 92,
  }),
  n({
    quarter: 8, id: "ASTANA-PRE", icon: "🌐", impact: "tourism",
    headline: "Expo 2017 Astana Kazakhstan confirmed — 'Future Energy', 115 nations, June 2017",
    detail: "Central Asian routes gaining commercial attention for first time.",
    modifiers: [{ city: "DXB", category: "tourism", pct: 35, rounds: 4 }],  // TSE → DXB
  }),
  n({
    quarter: 8, id: "FUEL", icon: "$", impact: "fuel",
    headline: "OPEC cuts production 1.2M barrels/day — first coordinated cut since 2008",
    detail: "Crude jumps to $58/barrel. Index 98.",
    fuelIndexAtBaseline: 98,
  }),
  n({
    quarter: 8, id: "XMAS", icon: "📦", impact: "cargo",
    headline: "Christmas e-commerce breaks records — 5.7B packages globally",
    detail: "Cargo demand surge on all T1-T2 routes. Cargo teams above-average this round.",
    modifiers: spread(["JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "MIA", "MEX"], "cargo", 25, 1),
  }),
  n({
    quarter: 8, id: "POST-TRUTH", icon: "📰", impact: "none",
    headline: "Industry report: 'post-truth' now affects airline scheduling promises",
    detail: "78% of frequent flyers confirm. No game impact.",
  }),

  // ═══ R09 — Q1 2017 — A380 Family Available + Expo Astana + Thailand Record ═══
  n({
    quarter: 9, id: "AVAIL-R9", icon: "✈︎", impact: "ops",
    headline: "A380-800 passenger and A380F cargo now available for purchase",
    detail: "A380-800: 555 seats, Tier 1 airports only. A380F: 150T payload — highest cargo capacity in catalogue.",
  }),
  n({
    quarter: 9, id: "ASTANA", icon: "🌐", impact: "tourism",
    headline: "Expo 2017 Astana opens — 'Future Energy', 115 nations across 93 days",
    detail: "Kazakhstan attracting first major international carrier attention. Central Asian gateway demand surges via DXB.",
    modifiers: [{ city: "DXB", category: "tourism", pct: 60, rounds: 3 }],  // ALA + TSE → DXB
  }),
  n({
    quarter: 9, id: "AUH", icon: "🏛", impact: "tourism",
    headline: "Abu Dhabi announces Louvre and Guggenheim opening — UAE cultural transformation",
    detail: "AUH premium tourism + business surge permanently.",
    modifiers: [
      { city: "AUH", category: "tourism", pct: 40, rounds: 99 },
      { city: "AUH", category: "business", pct: 20, rounds: 99 },
    ],
  }),
  n({
    quarter: 9, id: "THAILAND", icon: "🌴", impact: "tourism",
    headline: "Thailand tourism breaks 35M visitor record — BKK most visited city for 2nd year",
    detail: "BKK demand permanently elevated.",
    modifiers: [{ city: "BKK", category: "tourism", pct: 30, rounds: 99 }],
  }),
  n({
    quarter: 9, id: "FUEL", icon: "$", impact: "fuel",
    headline: "US shale output rises faster than OPEC cuts — crude drops to $50",
    detail: "Index stabilises at 90.",
    fuelIndexAtBaseline: 90,
  }),

  // ═══ R10 — Q2 2017 — B787-8/ATR-72-600/A330-300P2F Announced + Record Profits ═══
  n({
    quarter: 10, id: "AVIATION-PROFIT", icon: "📈", impact: "none",
    headline: "Global aviation reports record profits — $34.5B industry net profit",
    detail: "Best year in history. Stable growth environment.",
    travelIndex: 109,
  }),
  n({
    quarter: 10, id: "ANNOUNCE-R12", icon: "✈︎", impact: "ops",
    headline: "Boeing 787-8, ATR-72-600 and A330-300P2F all available from Q4 2017 (R12)",
    detail: "787-8: 242 seats, 13,620km. ATR-72-600: turboprop regional. A330-300P2F: 61T cargo conversion. Note: 787-8 supply chain pressure.",
  }),
  n({
    quarter: 10, id: "JAPAN-REC", icon: "🇯🇵", impact: "tourism",
    headline: "Japan tourism breaks 28M visitor record — 40M target by 2020",
    detail: "NRT, KIX routes at record load factors.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 25, rounds: 4 },
      { city: "KIX", category: "tourism", pct: 35, rounds: 4 },  // KIX + NGO collapsed
    ],
  }),
  n({
    quarter: 10, id: "TECH-1T", icon: "💼", impact: "business",
    headline: "Amazon, Google, Apple all approach $1T valuations — tech cluster business at decade highs",
    detail: "SFO, SEA, JFK, LHR business demand at record.",
    modifiers: [
      { city: "SFO", category: "business", pct: 20, rounds: 4 },
      { city: "SEA", category: "business", pct: 18, rounds: 4 },
    ],
  }),
  n({
    quarter: 10, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude holds at $53/barrel — balanced market",
    detail: "Index 93.",
    fuelIndexAtBaseline: 93,
  }),

  // ═══ R11 — Q3 2017 — Summer Peak + Pyeongchang Build ═══
  n({
    quarter: 11, id: "MED-PEAK", icon: "🏖", impact: "tourism",
    headline: "Mediterranean summer 2017 breaks all records — Spain world's #2 visited country",
    detail: "All Mediterranean T1-T2 airports at capacity.",
    modifiers: [
      { city: "BCN", category: "tourism", pct: 35, rounds: 1 },
      { city: "MAD", category: "tourism", pct: 30, rounds: 1 },
      { city: "FCO", category: "tourism", pct: 30, rounds: 1 },
      { city: "ATH", category: "tourism", pct: 40, rounds: 1 },
      { city: "LIS", category: "tourism", pct: 45, rounds: 1 },
    ],
    travelIndex: 112,
  }),
  n({
    quarter: 11, id: "PYEONG", icon: "🇰🇷", impact: "tourism",
    headline: "Pyeongchang 2018 — 5 months out. South Korea opens new KTX rail",
    detail: "ICN pre-event surge intensifying.",
    modifiers: [{ city: "ICN", category: "tourism", pct: 50, rounds: 3 }],  // GMP collapsed
  }),
  n({
    quarter: 11, id: "TECH-1T-CONFIRM", icon: "💼", impact: "business",
    headline: "Amazon, Google, Apple all exceed $1 trillion market cap — tech business at all-time high",
    detail: "Premium cabin yields up 18%.",
    modifiers: [
      { city: "SFO", category: "business", pct: 22, rounds: 2 },
      { city: "SEA", category: "business", pct: 20, rounds: 2 },
      { city: "JFK", category: "business", pct: 15, rounds: 2 },
      { city: "LHR", category: "business", pct: 12, rounds: 2 },
    ],
  }),
  n({
    quarter: 11, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Hurricane season disrupts Gulf of Mexico refining — crude rises",
    detail: "Index 98. Consider hedging.",
    fuelIndexAtBaseline: 98,
  }),
  n({
    quarter: 11, id: "MAQ-2017", icon: "🍲", impact: "none",
    headline: "Maqlouba named world's best dish for 2017",
    detail: "Culinary delegation dispatched to all 193 UN member states. No game impact.",
  }),

  // ═══ R12 — Q4 2017 — Aircraft Available + WC Russia Build + Crypto ═══
  n({
    quarter: 12, id: "AVAIL-R12", icon: "✈︎", impact: "ops",
    headline: "B787-8, ATR-72-600 and A330-300P2F now available for purchase",
    detail: "B787-8: $80M. ATR-72-600: $12M. A330-300P2F: $55M. Note: monitor R13 for 787-8 delivery news.",
  }),
  n({
    quarter: 12, id: "WC-RUSSIA-PRE", icon: "⚽", impact: "tourism",
    headline: "FIFA 2018 World Cup Russia — 6 months out. Advance ticket sales break records",
    detail: "Russian aviation market opening to international carriers. SVO + LED collapsed into SVO surge.",
    modifiers: [{ city: "SVO", category: "tourism", pct: 65, rounds: 3 }],  // SVO + LED + EKB → SVO
  }),
  n({
    quarter: 12, id: "CRYPTO", icon: "₿", impact: "business",
    headline: "Bitcoin reaches $19,783 — largest crypto boom in history",
    detail: "Blockchain conferences fill every major financial city.",
    modifiers: [
      { city: "SIN", category: "business", pct: 15, rounds: 1 },
      { city: "ZRH", category: "business", pct: 12, rounds: 1 },
      { city: "LHR", category: "business", pct: 10, rounds: 1 },
    ],
  }),
  n({
    quarter: 12, id: "FUEL", icon: "$", impact: "fuel",
    headline: "OPEC compliance highest since 2001 — crude climbs to $65/barrel",
    detail: "Index 108. Hedge book worth reviewing.",
    fuelIndexAtBaseline: 108,
  }),
  n({
    quarter: 12, id: "XMAS-ECOM", icon: "📦", impact: "cargo",
    headline: "Christmas e-commerce: 8B packages shipped globally",
    detail: "Cargo at absolute peak. Cargo teams earning premium rates.",
    modifiers: spread(["JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS"], "cargo", 30, 1),
  }),

  // ═══ R13 — Q1 2018 — Pyeongchang + Trade War + 787-8 DELAY ═══
  n({
    quarter: 13, id: "PYEONG-OPEN", icon: "🥇", impact: "tourism",
    headline: "Pyeongchang 2018 Winter Olympics opens — historic Korean détente",
    detail: "ICN at absolute demand peak. Asia-Pacific tourism surge.",
    modifiers: [
      { city: "ICN", category: "tourism", pct: 110, rounds: 2 },  // ICN + GMP merged
      { city: "NRT", category: "tourism", pct: 35, rounds: 2 },
      { city: "SIN", category: "tourism", pct: 25, rounds: 2 },
    ],
    travelIndex: 108,
  }),
  n({
    quarter: 13, id: "TRADE-WAR", icon: "⚠", impact: "business",
    headline: "US imposes $60B in tariffs on Chinese goods — trade war officially begins",
    detail: "Trans-Pacific business travel freezes. Cargo affected. 4 round impact.",
    modifiers: [
      { city: "JFK", category: "business", pct: -15, rounds: 4 },
      { city: "LAX", category: "business", pct: -15, rounds: 4 },
      { city: "PEK", category: "business", pct: -12, rounds: 4 },
      { city: "PVG", category: "business", pct: -12, rounds: 4 },
    ],
  }),
  n({
    quarter: 13, id: "787-DELAY", icon: "⚠", impact: "ops",
    headline: "Boeing confirms 787-8 Dreamliner delivery delays — all R12 orders pushed to R15",
    detail: "Manufacturing inspection backlog. R12 orders now arrive R15 (3-round push). R13+ orders normal.",
  }),
  n({
    quarter: 13, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude hits $70/barrel — geopolitical premium + trade war volatility",
    detail: "Index 118. Eco-upgraded fleets saving $0.8M-$2.4M/qtr vs un-upgraded.",
    fuelIndexAtBaseline: 118,
  }),
  n({
    quarter: 13, id: "WC-3MO", icon: "⚽", impact: "tourism",
    headline: "World Cup Russia — 3 months out. All 12 host cities at capacity",
    detail: "Russian host cities pre-event surge. Western fans routing through Middle East hubs.",
    modifiers: [
      { city: "SVO", category: "tourism", pct: 65, rounds: 2 },  // SVO + LED merged
      { city: "DXB", category: "tourism", pct: 15, rounds: 2 },
    ],
  }),

  // ═══ R14 — Q2 2018 — WC Russia Opens + B747-8/8F/737-800BCF Announced ═══
  n({
    quarter: 14, id: "WC-RUSSIA", icon: "⚽", impact: "tourism",
    headline: "FIFA World Cup Russia opens — 32 nations, 64 matches, France favoured",
    detail: "Russia host cities at absolute peak. Highest Russian aviation demand ever recorded.",
    modifiers: [{ city: "SVO", category: "tourism", pct: 110, rounds: 2 }],  // SVO + LED + EKB + KZN merged
    travelIndex: 115,
  }),
  n({
    quarter: 14, id: "ANNOUNCE-R16", icon: "✈︎", impact: "ops",
    headline: "B747-8 + B747-8F + B737-800BCF all available from Q4 2018 (R16)",
    detail: "B747-8: 467 seats, $180M. B747-8F: 134T cargo, $385M. B737-800BCF: 23T narrowbody freighter, $28M.",
  }),
  n({
    quarter: 14, id: "G7", icon: "⚠", impact: "business",
    headline: "G7 summit collapses over US tariffs — global trade uncertainty highest since 2008",
    detail: "European business travel freezes.",
    modifiers: [
      { city: "LHR", category: "business", pct: -12, rounds: 2 },
      { city: "CDG", category: "business", pct: -12, rounds: 2 },
      { city: "FRA", category: "business", pct: -10, rounds: 2 },
    ],
  }),
  n({
    quarter: 14, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude breaks $75/barrel — World Cup demand + Iran sanctions premium",
    detail: "Index 125. Stored fuel now extremely valuable.",
    fuelIndexAtBaseline: 125,
  }),
  n({
    quarter: 14, id: "FIFA-GOLF", icon: "⛳", impact: "none",
    headline: "FIFA President photographed on golf course for 365th consecutive day",
    detail: "Always in a BMW Club Car. Personal record confirmed. No game impact.",
  }),

  // ═══ R15 — Q3 2018 — WC Final + Commonwealth + Asian Games + 787-8 DELIVERY ═══
  n({
    quarter: 15, id: "WC-FINAL", icon: "🏆", impact: "tourism",
    headline: "France wins World Cup 2018 — 4-2 vs Croatia in Moscow. Greatest TV audience since 1966",
    detail: "World Cup Official Carrier (S10 winner): 100% load floor this round. SVO routes premium. French celebration.",
    modifiers: [
      { city: "SVO", category: "tourism", pct: 110, rounds: 1 },
      { city: "CDG", category: "tourism", pct: 45, rounds: 1 },
    ],
    travelIndex: 125,
  }),
  n({
    quarter: 15, id: "787-DELIVERY", icon: "✈︎", impact: "ops",
    headline: "Boeing 787-8 Dreamliner — first delayed deliveries finally arrive",
    detail: "Airlines who placed R12 orders receive their aircraft this round (3-round push). Quality inspections complete.",
  }),
  n({
    quarter: 15, id: "COMMONWEALTH", icon: "🏅", impact: "tourism",
    headline: "Commonwealth Games 2018 Gold Coast — 71 nations, 6,600 athletes",
    detail: "Largest event in Australian history. Australian cities surge.",
    modifiers: [
      { city: "BNE", category: "tourism", pct: 80, rounds: 2 },
      { city: "SYD", category: "tourism", pct: 30, rounds: 2 },
      { city: "MEL", category: "tourism", pct: 25, rounds: 2 },
    ],
  }),
  n({
    quarter: 15, id: "ASIAN-GAMES", icon: "🏅", impact: "tourism",
    headline: "Asian Games 2018 Jakarta and Palembang — 45 nations, 11,000 athletes",
    detail: "Indonesian cities at record demand.",
    modifiers: [
      { city: "CGK", category: "tourism", pct: 60, rounds: 2 },
      { city: "SUB", category: "tourism", pct: 40, rounds: 2 },
      { city: "SIN", category: "tourism", pct: 20, rounds: 2 },
      { city: "KUL", category: "tourism", pct: 20, rounds: 2 },
    ],
  }),
  n({
    quarter: 15, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Post-World Cup crude moderates to $72/barrel",
    detail: "Index 118. Still elevated but easing.",
    fuelIndexAtBaseline: 118,
  }),

  // ═══ R16 — Q4 2018 — B747-8 + B747-8F + B737-800BCF Available + Market Correction ═══
  n({
    quarter: 16, id: "AVAIL-R16", icon: "✈︎", impact: "ops",
    headline: "B747-8, B747-8F, B737-800BCF and E190-E2 now available for purchase",
    detail: "B747-8: $180M passenger. B747-8F: $385M cargo. B737-800BCF: $28M narrowbody freighter. E190-E2: $26M new-gen regional.",
  }),
  n({
    quarter: 16, id: "MARKET-CORRECTION", icon: "📉", impact: "business",
    headline: "Global stock markets in correction — Nasdaq -20%, Shanghai -25%, FTSE -15%",
    detail: "Business investment frozen globally.",
    modifiers: [
      { city: "JFK", category: "business", pct: -20, rounds: 2 },
      { city: "LHR", category: "business", pct: -18, rounds: 2 },
      { city: "HKG", category: "business", pct: -22, rounds: 2 },
      { city: "SIN", category: "business", pct: -15, rounds: 2 },
    ],
    travelIndex: 92,
  }),
  n({
    quarter: 16, id: "TRADE-WAR-2", icon: "⚠", impact: "business",
    headline: "US-China trade war intensifies — $267B total tariffs",
    detail: "Trans-Pacific demand suppressed further. Cargo rerouting to Vietnam, Thailand, Malaysia.",
    modifiers: [
      { city: "JFK", category: "business", pct: -15, rounds: 3 },
      { city: "PVG", category: "business", pct: -15, rounds: 3 },
      { city: "SGN", category: "cargo", pct: 30, rounds: 4 },
      { city: "BKK", category: "cargo", pct: 20, rounds: 4 },
    ],
  }),
  n({
    quarter: 16, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude crashes from $75 to $50 in 6 weeks — US shale record",
    detail: "Index drops to 88. Worth refilling storage.",
    fuelIndexAtBaseline: 88,
  }),
  n({
    quarter: 16, id: "XMAS", icon: "📦", impact: "cargo",
    headline: "Christmas e-commerce: $9.4B on Cyber Monday — air freight fully booked",
    detail: "Cargo demand at record despite trade war.",
    modifiers: spread(["JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS"], "cargo", 28, 1),
  }),

  // ═══ R17 — Q1 2019 — Recovery + Rugby WC Japan Build ═══
  n({
    quarter: 17, id: "RUGBY-JP-PRE", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup 2019 Japan — 6 months out. First Rugby WC in Asia",
    detail: "NRT, KIX pre-event surge begins.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 35, rounds: 3 },
      { city: "KIX", category: "tourism", pct: 45, rounds: 3 },  // KIX + FUK collapsed
    ],
    travelIndex: 110,
  }),
  n({
    quarter: 17, id: "TECH-IPO", icon: "💼", impact: "business",
    headline: "Tech IPO boom returns — Uber, Lyft, Airbnb file. SFO and JFK back to peak",
    detail: "Silicon Valley at maximum intensity.",
    modifiers: [
      { city: "SFO", category: "business", pct: 20, rounds: 2 },
      { city: "JFK", category: "business", pct: 15, rounds: 2 },
      { city: "LHR", category: "business", pct: 12, rounds: 2 },
    ],
  }),
  n({
    quarter: 17, id: "EXPO-DXB-PRE", icon: "🏛", impact: "business",
    headline: "Expo 2020 Dubai infrastructure complete — 192 nations registered",
    detail: "DXB tourism + business benefit. Pre-Expo conference wave beginning.",
    modifiers: [{ city: "DXB", category: "business", pct: 15, rounds: 4 }],
  }),
  n({
    quarter: 17, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude recovers to $63/barrel — demand recovering",
    detail: "Index 105.",
    fuelIndexAtBaseline: 105,
  }),
  n({
    quarter: 17, id: "VIETNAM", icon: "📦", impact: "cargo",
    headline: "Vietnam surpasses China for US electronics exports — SGN, HAN cargo critical",
    detail: "Vietnam cargo demand surge is permanent as companies diversify from China.",
    modifiers: [
      { city: "SGN", category: "cargo", pct: 40, rounds: 99 },
      { city: "HAN", category: "cargo", pct: 35, rounds: 99 },
    ],
  }),

  // ═══ R18 — Q2 2019 — Cricket WC + B787-9/A350-900 Announced + Hong Kong ═══
  n({
    quarter: 18, id: "CRICKET", icon: "🏏", impact: "tourism",
    headline: "ICC Cricket World Cup 2019 England and Wales — England wins first ever",
    detail: "UK tourism surge. Indian diaspora drives record India-UK bookings.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 50, rounds: 2 },
      { city: "MAN", category: "tourism", pct: 50, rounds: 2 },  // MAN + BHX collapsed
      { city: "BOM", category: "tourism", pct: 30, rounds: 2 },
      { city: "DEL", category: "tourism", pct: 30, rounds: 2 },
    ],
    travelIndex: 114,
  }),
  n({
    quarter: 18, id: "ANNOUNCE-R20", icon: "✈︎", impact: "ops",
    headline: "Boeing 787-9 and Airbus A350-900 XWB available from Q4 2019 (R20)",
    detail: "787-9: 296 seats, 14,140km, 3.1 L/km. A350-900: 315 seats, 15,000km, 3.4 L/km. Ultra-long-haul revolution.",
  }),
  n({
    quarter: 18, id: "HK-PROTESTS", icon: "⚠", impact: "business",
    headline: "Hong Kong protests escalate — 2M march in streets",
    detail: "Financial services firms activate contingency plans. SIN benefits immediately.",
    modifiers: [
      { city: "HKG", category: "tourism", pct: -35, rounds: 3 },
      { city: "HKG", category: "business", pct: -25, rounds: 3 },
      { city: "SIN", category: "business", pct: 20, rounds: 3 },
      { city: "TPE", category: "business", pct: 15, rounds: 3 },
    ],
  }),
  n({
    quarter: 18, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Saudi Aramco facility attacked by drones — 5.7M barrels/day halted for 2 weeks",
    detail: "Emergency fuel price spike this round only. Index 122.",
    fuelIndexAtBaseline: 122,
  }),
  n({
    quarter: 18, id: "MED-CAP", icon: "🏖", impact: "tourism",
    headline: "Mediterranean overcrowding crisis — tourism caps in Barcelona, Santorini, Dubrovnik",
    detail: "Demand shifts from capped cities to alternatives.",
    modifiers: [
      { city: "BCN", category: "tourism", pct: -10, rounds: 2 },
      { city: "ATH", category: "tourism", pct: 20, rounds: 2 },
    ],
  }),

  // ═══ R19 — Q3 2019 — Rugby WC Japan + Narrowbody Wave Announced ═══
  n({
    quarter: 19, id: "RUGBY-JP", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup 2019 Japan — 20 nations, 48 matches. South Africa wins",
    detail: "Japan tourism at absolute record. All airports at capacity.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 80, rounds: 2 },
      { city: "KIX", category: "tourism", pct: 88, rounds: 2 },  // KIX + FUK + NGO collapsed
    ],
    travelIndex: 112,
  }),
  n({
    quarter: 19, id: "ANNOUNCE-R21", icon: "✈︎", impact: "ops",
    headline: "Largest narrowbody refresh ever — A220, A319neo, A320neo, A321neo, B737 MAX 8/9 from R21",
    detail: "A220-300: $22M. A319neo: $24M. A320neo: $28M. A321neo: $32M. MAX-8: $26M. MAX-9: $30M. 14-18% fuel saving.",
  }),
  n({
    quarter: 19, id: "RECESSION-FEAR", icon: "⚠", impact: "business",
    headline: "Global recession fears — IMF warns of 'synchronized slowdown'",
    detail: "Trade war + Brexit + HK protests creating uncertainty. Premium cabin yields softening.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG", "ZRH", "NRT",
    ], "business", -8, 2),
  }),
  n({
    quarter: 19, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $67/barrel — trade deal optimism partially offsetting drone-strike premium",
    detail: "Index back to 112.",
    fuelIndexAtBaseline: 112,
  }),
  n({
    quarter: 19, id: "JAPAN-40M", icon: "🇯🇵", impact: "tourism",
    headline: "Japan tourism breaks 40M annual visitor target — 6 years ahead of schedule",
    detail: "Permanent demand upgrade confirmed.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 30, rounds: 99 },
      { city: "KIX", category: "tourism", pct: 30, rounds: 99 },
    ],
  }),

  // ═══ R20 — Q4 2019 — B787-9/A350-900 Available + Last Pre-COVID Quarter ═══
  n({
    quarter: 20, id: "AVAIL-R20", icon: "✈︎", impact: "ops",
    headline: "Boeing 787-9 and Airbus A350-900 XWB now available for purchase",
    detail: "B787-9: $85M, 14,140km. A350-900: $90M, 15,000km. Ultra-long-haul revolution begins.",
  }),
  n({
    quarter: 20, id: "AVIATION-PEAK", icon: "📈", impact: "none",
    headline: "Global aviation closes 2019 at record — 4.54B passengers, $26B industry profit",
    detail: "Best performing year in aviation history. All city demand at pre-COVID simulation peak.",
    travelIndex: 115,
  }),
  n({
    quarter: 20, id: "XMAS", icon: "🎄", impact: "tourism",
    headline: "Christmas + New Year travel 2019/2020 sets global records — 180M passengers",
    detail: "Holiday routes at 98%+ occupancy globally.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 20, rounds: 1 },
      { city: "JFK", category: "tourism", pct: 20, rounds: 1 },
      { city: "DXB", category: "tourism", pct: 25, rounds: 1 },
      { city: "SIN", category: "tourism", pct: 20, rounds: 1 },
    ],
  }),
  n({
    quarter: 20, id: "TRADE-DEAL", icon: "🤝", impact: "business",
    headline: "US-China Phase 1 trade deal signed — $200B in Chinese purchases committed",
    detail: "Trans-Pacific business cautiously resuming.",
    modifiers: [
      { city: "JFK", category: "business", pct: 12, rounds: 2 },
      { city: "LAX", category: "business", pct: 12, rounds: 2 },
      { city: "PVG", category: "business", pct: 10, rounds: 2 },
    ],
  }),
  n({
    quarter: 20, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $67/barrel — index at 112",
    detail: "+12% vs baseline.",
    fuelIndexAtBaseline: 112,
  }),

  // ═══ R21 — Q1 2020 — COVID-19 + Narrowbody Wave Available ═══
  n({
    quarter: 21, id: "COVID", icon: "🦠", impact: "tourism",
    headline: "COVID-19 declared global pandemic — 90% of global fleet grounded within 30 days",
    detail: "Demand collapse begins immediately. All Asian routes severely impacted.",
    modifiers: [
      { city: "PEK", category: "all", pct: -70, rounds: 4 },
      { city: "PVG", category: "all", pct: -70, rounds: 4 },
      { city: "HKG", category: "all", pct: -65, rounds: 4 },
      { city: "SIN", category: "all", pct: -50, rounds: 4 },
      { city: "ALL", category: "all", pct: -35, rounds: 4 },
    ],
    travelIndex: 65,
  }),
  n({
    quarter: 21, id: "AVAIL-R21", icon: "✈︎", impact: "ops",
    headline: "A220, A319neo, A320neo, A321neo, B737 MAX-8 & MAX-9 now available",
    detail: "Despite COVID, modern aircraft now at lowest acquisition cost in years — consider fleet modernisation.",
  }),
  n({
    quarter: 21, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude collapses to $20/barrel — OPEC in price war",
    detail: "Fuel index drops to 40. Cheapest fuel in simulation. Fill every storage tank.",
    fuelIndexAtBaseline: 40,
  }),
  n({
    quarter: 21, id: "MEDICAL-CARGO", icon: "📦", impact: "cargo",
    headline: "Medical supply cargo demand surges 300% — hospitals globally need PPE and ventilators",
    detail: "Airlines converting passenger jets to cargo.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG", "ZRH",
      "NRT", "KIX", "ICN", "PEK", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 120, 3),
  }),
  n({
    quarter: 21, id: "BAILOUTS", icon: "🏛", impact: "ops",
    headline: "Governments inject $220B into aviation sector globally",
    detail: "Survival grants, loans, nationalisations. Admin may apply special capital injections.",
  }),

  // ═══ R22 — Q2 2020 — Full COVID Lockdown ═══
  n({
    quarter: 22, id: "LOCKDOWN", icon: "🦠", impact: "tourism",
    headline: "Global lockdowns complete — 192 countries restrict travel",
    detail: "Aviation carrying 8% of normal passenger volumes. Demand at simulation minimum.",
    modifiers: [{ city: "ALL", category: "all", pct: -82, rounds: 4 }],
    travelIndex: 18,
  }),
  n({
    quarter: 22, id: "TOKYO-DELAY", icon: "🥇", impact: "tourism",
    headline: "Tokyo 2020 Olympics postponed to July 2021",
    detail: "IOC decision. Japan loses $4B in preparation costs.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: -60, rounds: 3 },
      { city: "KIX", category: "tourism", pct: -50, rounds: 3 },
    ],
  }),
  n({
    quarter: 22, id: "FUEL", icon: "$", impact: "fuel",
    headline: "WTI crude goes NEGATIVE for first time in history — storage full, demand zero",
    detail: "Fuel index 35. Absolute cheapest fuel in simulation.",
    fuelIndexAtBaseline: 35,
  }),
  n({
    quarter: 22, id: "CARGO-PEAK", icon: "📦", impact: "cargo",
    headline: "Cargo-only flights generate 6x normal revenue — passenger jets stripping seats",
    detail: "Cargo teams at record margins. Cargo is the only viable revenue channel.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG", "ZRH",
      "NRT", "KIX", "ICN", "PEK", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 200, 2),
  }),
  n({
    quarter: 22, id: "ZOOM", icon: "💻", impact: "none",
    headline: "Zoom reports 300M daily meetings — airlines calculate each lost $4,200 in business travel revenue",
    detail: "The math is accurate and devastating. No game impact.",
  }),

  // ═══ R23 — Q3 2020 — Travel Bubbles + R25 Aircraft Announced ═══
  n({
    quarter: 23, id: "BUBBLES", icon: "🫧", impact: "tourism",
    headline: "Travel bubbles open — Singapore-Hong Kong, Australia-NZ, Cyprus-Greece",
    detail: "Specific bubble routes at near-normal demand. Non-bubble routes still at near-zero.",
    modifiers: [
      { city: "SIN", category: "tourism", pct: 40, rounds: 2 },
      { city: "HKG", category: "tourism", pct: 35, rounds: 2 },
      { city: "SYD", category: "tourism", pct: 45, rounds: 2 },
      { city: "AKL", category: "tourism", pct: 45, rounds: 2 },
    ],
    travelIndex: 28,
  }),
  n({
    quarter: 23, id: "ANNOUNCE-R25", icon: "✈︎", impact: "ops",
    headline: "Five aircraft from Q1 2021 (R25): A350-1000, A330-900neo, B787-10, E195-E2 + A321P2F cargo",
    detail: "A350-1000: 369 seats, longest range. A330-900neo: 287 seats. B787-10: 323 seats. E195-E2: 146 seats. A321P2F: 28T cargo.",
  }),
  n({
    quarter: 23, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude recovers to $42/barrel on vaccine hopes — fuel index climbs to 72",
    detail: "Still very cheap. Fill storage.",
    fuelIndexAtBaseline: 72,
  }),
  n({
    quarter: 23, id: "ECOM-PERMANENT", icon: "📦", impact: "cargo",
    headline: "E-commerce at 5-year equivalent growth in 5 months — structural shift confirmed",
    detail: "Cargo demand permanently elevated above pre-COVID levels.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "PEK", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 50, 99),
  }),
  n({
    quarter: 23, id: "BANKRUPTCIES", icon: "📉", impact: "ops",
    headline: "IATA: 43 airlines in administration in 2020 — 1.2M aviation jobs lost",
    detail: "Slot availability improving at key airports.",
  }),

  // ═══ R24 — Q4 2020 — Second Wave + Vaccines Approved ═══
  n({
    quarter: 24, id: "SECOND-WAVE", icon: "🦠", impact: "tourism",
    headline: "COVID second wave forces new lockdowns — Europe, US, Brazil reimpose restrictions",
    detail: "Vaccines weeks away. Demand crashes again after partial bubble recovery.",
    modifiers: [{ city: "ALL", category: "all", pct: -72, rounds: 2 }],
    travelIndex: 25,
  }),
  n({
    quarter: 24, id: "EXPO-DELAY", icon: "🏛", impact: "tourism",
    headline: "Expo 2020 Dubai postponed to October 2021-March 2022",
    detail: "Name retained. UAE construction spend drives cargo.",
    modifiers: [
      { city: "DXB", category: "tourism", pct: -30, rounds: 2 },
      { city: "DXB", category: "cargo", pct: 25, rounds: 2 },
    ],
  }),
  n({
    quarter: 24, id: "VACCINES", icon: "💉", impact: "none",
    headline: "Pfizer-BioNTech vaccine approved — first mass vaccination programmes begin",
    detail: "Market expects aviation recovery H2 2021. Forward bookings surge for summer 2021.",
  }),
  n({
    quarter: 24, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $48/barrel — vaccine optimism offsets second wave",
    detail: "Index 82.",
    fuelIndexAtBaseline: 82,
  }),
  n({
    quarter: 24, id: "UNPRECEDENTED", icon: "📰", impact: "none",
    headline: "'Unprecedented' used 847 times in airline annual reports in 2020",
    detail: "Linguistic analysis confirms record. Previous record: 12. No game impact.",
  }),

  // ═══ R25 — Q1 2021 — Vaccine Rollout + Five Aircraft Available ═══
  n({
    quarter: 25, id: "AVAIL-R25", icon: "✈︎", impact: "ops",
    headline: "A350-1000, A330-900neo, B787-10, E195-E2 + A321P2F cargo now available",
    detail: "A350-1000: $115M. A330-900neo: $95M. B787-10: $90M. E195-E2: $24M. A321P2F: $35M cargo.",
  }),
  n({
    quarter: 25, id: "VACCINATED", icon: "💉", impact: "tourism",
    headline: "Mass vaccination underway in 45 countries — vaccinated corridors reopening",
    detail: "Routes between Lebanon, UK, US improving ahead of rest.",
    modifiers: [
      { city: "BEY", category: "tourism", pct: 80, rounds: 2 },      { city: "LHR", category: "tourism", pct: 30, rounds: 2 },
      { city: "JFK", category: "tourism", pct: 25, rounds: 2 },
    ],
    travelIndex: 32,
  }),
  n({
    quarter: 25, id: "OPEN-DESTS", icon: "🏖", impact: "tourism",
    headline: "Dubai, Mexico open without restrictions — 'COVID-free' destinations surge",
    detail: "DXB and MEX fully open at near-record demand while rest of world locked.",
    modifiers: [
      { city: "DXB", category: "tourism", pct: 60, rounds: 3 },
      { city: "MEX", category: "tourism", pct: 70, rounds: 3 },  // CUN → MEX
    ],
  }),
  n({
    quarter: 25, id: "SUEZ", icon: "📦", impact: "cargo",
    headline: "Suez Canal blocked by Ever Given for 6 days — $9.6B/day diverted to air freight",
    detail: "Single-round emergency premium.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 45, 1),
  }),
  n({
    quarter: 25, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude climbs to $60/barrel on vaccine optimism — index 100 first time since COVID",
    detail: "Back to baseline.",
    fuelIndexAtBaseline: 100,
  }),

  // ═══ R26 — Q2 2021 — Euro 2020 (Held 2021) + Endgame Aircraft Announced ═══
  n({
    quarter: 26, id: "EURO-2020", icon: "⚽", impact: "tourism",
    headline: "UEFA Euro 2020 (held 2021) — 11 host cities across Europe. Italy wins",
    detail: "European routes partially recovering. Vaccinated fans travel.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 40, rounds: 2 },
      { city: "FCO", category: "tourism", pct: 60, rounds: 1 },  // ROM → FCO
      { city: "AMS", category: "tourism", pct: 35, rounds: 2 },
      { city: "CPH", category: "tourism", pct: 40, rounds: 1 },
      { city: "FRA", category: "tourism", pct: 30, rounds: 1 },  // FRA + LEJ collapsed
    ],
    travelIndex: 42,
  }),
  n({
    quarter: 26, id: "ANNOUNCE-R28", icon: "✈︎", impact: "ops",
    headline: "Endgame aircraft announced for Q4 2021 (R28): A321XLR, B777X-9, C919 + 7 freighters",
    detail: "A321XLR: $35M, transatlantic narrowbody. B777X-9: $180M. C919: $24M. Plus all 7 cargo freighter unlocks consolidate at R28.",
  }),
  n({
    quarter: 26, id: "DELTA-VARIANT", icon: "⚠", impact: "tourism",
    headline: "Delta variant detected in 96 countries — partial recovery stalls",
    detail: "Borders re-tightening across Asia-Pacific.",
    modifiers: [{ city: "ALL", category: "all", pct: -15, rounds: 2 }],
  }),
  n({
    quarter: 26, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $72/barrel as recovery expectations rise — index climbs to 118",
    detail: "Eco-upgraded fleets advantaged again.",
    fuelIndexAtBaseline: 118,
  }),
  n({
    quarter: 26, id: "TECH-BOOM", icon: "💼", impact: "business",
    headline: "Tech sector boom — FAANG revenues double. Business travel returns first in tech corridors",
    detail: "SFO, SEA, JFK back at 70% of 2019 levels.",
    modifiers: [
      { city: "SFO", category: "business", pct: 45, rounds: 2 },
      { city: "SEA", category: "business", pct: 40, rounds: 2 },
      { city: "JFK", category: "business", pct: 35, rounds: 2 },
    ],
  }),

  // ═══ R27 — Q3 2021 — Tokyo Olympics (No Spectators) ═══
  n({
    quarter: 27, id: "TOKYO", icon: "🥇", impact: "tourism",
    headline: "Tokyo 2020 Olympics opens (1 year late) — 11,656 athletes, no spectators allowed",
    detail: "Zero foreign tourism benefit at NRT. Japan brand globally elevated for 2022 recovery.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: -40, rounds: 2 },
      { city: "KIX", category: "tourism", pct: -35, rounds: 2 },
    ],
    travelIndex: 58,
  }),
  n({
    quarter: 27, id: "REVENGE-TRAVEL", icon: "🌍", impact: "tourism",
    headline: "Revenge travel begins — vaccinated populations booking aggressively",
    detail: "Tourism surging in open markets. Airlines that maintained capacity through COVID rewarded.",
    modifiers: [{ city: "DXB", category: "tourism", pct: 45, rounds: 2 }],
  }),
  n({
    quarter: 27, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $73/barrel — OPEC+ controlled reopening",
    detail: "Index 120.",
    fuelIndexAtBaseline: 120,
  }),
  n({
    quarter: 27, id: "SUPPLY-CHAIN", icon: "📦", impact: "cargo",
    headline: "Global supply chain crisis — Christmas goods stuck in ports",
    detail: "Air freight emergency premium reaches $14/kg. Cargo at extreme peak.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 80, 2),
  }),
  n({
    quarter: 27, id: "AIRLINE-CONS", icon: "🤝", impact: "ops",
    headline: "Airline consolidation wave — Asian regionals merge",
    detail: "Slot opportunities emerging.",
  }),

  // ═══ R28 — Q4 2021 — Endgame Aircraft Available + Expo Dubai + Omicron ═══
  n({
    quarter: 28, id: "AVAIL-R28", icon: "✈︎", impact: "ops",
    headline: "A321XLR, B777X-9, C919 + 7 freighter unlocks now available — endgame catalogue complete",
    detail: "Passenger: A321XLR ($35M), B777X-9 ($180M), C919 ($24M). Cargo: A380F, A330-300P2F, B747-8F, B737-800BCF, A321P2F, B777-8F, ATR-72-600F.",
  }),
  n({
    quarter: 28, id: "EXPO-DXB", icon: "🏛", impact: "tourism",
    headline: "Expo 2020 Dubai finally opens — 192 nations, 4,000 events, 25M visitors expected",
    detail: "DXB at record. All routes to Dubai 95%+ occupancy. Arabian Gulf surging.",
    modifiers: [
      { city: "DXB", category: "tourism", pct: 120, rounds: 3 },
      { city: "AUH", category: "tourism", pct: 50, rounds: 3 },
      { city: "DOH", category: "tourism", pct: 30, rounds: 3 },
    ],
    travelIndex: 65,
  }),
  n({
    quarter: 28, id: "OMICRON", icon: "🦠", impact: "tourism",
    headline: "Omicron variant emerges — 50x more mutations than Delta. Borders close overnight",
    detail: "Demand drops again. Dubai Expo partially buffers effect.",
    modifiers: [
      { city: "ALL", category: "all", pct: -25, rounds: 2 },
      { city: "DXB", category: "tourism", pct: -10, rounds: 2 },
    ],
  }),
  n({
    quarter: 28, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude drops on Omicron — index falls to 108",
    detail: "+8% vs baseline.",
    fuelIndexAtBaseline: 108,
  }),
  n({
    quarter: 28, id: "DXB-PERMANENT", icon: "💼", impact: "business",
    headline: "Expo 2020 Dubai draws 1,000 business delegations in first month — UAE permanent meeting capital",
    detail: "DXB business demand structurally elevated.",
    modifiers: [{ city: "DXB", category: "business", pct: 40, rounds: 99 }],
  }),

  // ═══ R29 — Q1 2022 — Russia Invades Ukraine ═══
  n({
    quarter: 29, id: "UKRAINE", icon: "⚠", impact: "ops",
    headline: "Russia invades Ukraine — NATO closes airspace. 36 countries ban Russian aircraft",
    detail: "Russian aviation effectively isolated. European overflight routes disrupted. KBP routes suspended permanently.",
    modifiers: [
      { city: "SVO", category: "all", pct: -90, rounds: 99 },
      { city: "KBP", category: "all", pct: -85, rounds: 99 },
      { city: "ALL", category: "all", pct: -15, rounds: 2 },
    ],
    travelIndex: 78,
  }),
  n({
    quarter: 29, id: "FUEL", icon: "⚠", impact: "fuel",
    headline: "Energy crisis: Europe cuts Russian gas. Crude breaks $120/barrel. Jet fuel index at 185",
    detail: "+85% above baseline. Worst fuel cost in simulation. Eco-upgraded saving $3M-$8M/qtr.",
    fuelIndexAtBaseline: 185,
  }),
  n({
    quarter: 29, id: "WAR-TOURISM-DIVERT", icon: "🏖", impact: "tourism",
    headline: "Middle East, Asia-Pacific tourism boom as alternatives to war-affected Europe",
    detail: "Travellers divert from European uncertainty to safe open destinations.",
    modifiers: [
      { city: "DXB", category: "tourism", pct: 30, rounds: 3 },
      { city: "SIN", category: "tourism", pct: 25, rounds: 3 },
      { city: "BKK", category: "tourism", pct: 20, rounds: 3 },
    ],
  }),
  n({
    quarter: 29, id: "RUSSIA-EXIT", icon: "🏢", impact: "business",
    headline: "European companies evacuate Russia — 500+ multinationals exit",
    detail: "Western European hubs absorb relocated executives.",
    modifiers: [
      { city: "FRA", category: "business", pct: 15, rounds: 4 },
      { city: "AMS", category: "business", pct: 15, rounds: 4 },
      { city: "LHR", category: "business", pct: 12, rounds: 4 },
    ],
  }),

  // ═══ R30 — Q2 2022 — Revenge Travel Peak + Energy Crisis ═══
  n({
    quarter: 30, id: "REVENGE-PEAK", icon: "🌍", impact: "tourism",
    headline: "Revenge travel overwhelms aviation — Heathrow, Schiphol, Frankfurt cap daily passengers",
    detail: "Demand exceeds airline capacity. Occupancy 98%+ but delays dent satisfaction.",
    modifiers: [
      { city: "LHR", category: "tourism", pct: 60, rounds: 2 },
      { city: "AMS", category: "tourism", pct: 55, rounds: 2 },
      { city: "FRA", category: "tourism", pct: 50, rounds: 2 },
    ],
    travelIndex: 88,
  }),
  n({
    quarter: 30, id: "FUEL", icon: "⚠", impact: "fuel",
    headline: "Jet fuel at $150/barrel equivalent — energy crisis peak. Index 155",
    detail: "+55% above baseline. SAF carriers saving $4M-$10M/qtr vs non-SAF.",
    fuelIndexAtBaseline: 155,
  }),
  n({
    quarter: 30, id: "WC-QATAR-PRE", icon: "⚽", impact: "tourism",
    headline: "Qatar FIFA World Cup 2022 — 4 months out. First winter World Cup",
    detail: "DOH, DXB pre-event surge beginning.",
    modifiers: [
      { city: "DOH", category: "tourism", pct: 50, rounds: 3 },
      { city: "DXB", category: "tourism", pct: 30, rounds: 3 },
    ],
  }),
  n({
    quarter: 30, id: "BIZ-RECOVER", icon: "💼", impact: "business",
    headline: "Post-COVID business travel recovery complete in Americas and Middle East — Asia still -30%",
    detail: "Permanent confirmation.",
    modifiers: [
      { city: "JFK", category: "business", pct: 10, rounds: 99 },
      { city: "MIA", category: "business", pct: 10, rounds: 99 },
      { city: "DXB", category: "business", pct: 15, rounds: 99 },
    ],
  }),

  // ═══ R31 — Q3 2022 — Commonwealth Games + Japan Reopens ═══
  n({
    quarter: 31, id: "COMMONWEALTH-22", icon: "🏅", impact: "tourism",
    headline: "Commonwealth Games 2022 Birmingham — biggest UK multi-sport event since London 2012",
    detail: "UK summer 2022 exceptional.",
    modifiers: [
      { city: "MAN", category: "tourism", pct: 70, rounds: 2 },  // BHX + EDI + MAN merged
      { city: "LHR", category: "tourism", pct: 35, rounds: 2 },
    ],
    travelIndex: 102,
  }),
  n({
    quarter: 31, id: "JAPAN-REOPEN", icon: "🇯🇵", impact: "business",
    headline: "Japan removes all entry restrictions — 2.5 years of pent-up demand releases",
    detail: "Largest single-quarter tourism surge in NRT history.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 80, rounds: 3 },
      { city: "KIX", category: "tourism", pct: 75, rounds: 3 },
    ],
  }),
  n({
    quarter: 31, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude retreats to $95/barrel — demand-destruction from energy crisis",
    detail: "Index drops to 128.",
    fuelIndexAtBaseline: 128,
  }),
  n({
    quarter: 31, id: "SAUDI-100M", icon: "🇸🇦", impact: "tourism",
    headline: "Saudi Arabia tourism reaches 93M visitors in 2022 — 100M target on track",
    detail: "AlUla and NEOM attracting global coverage.",
    modifiers: [
      { city: "RUH", category: "tourism", pct: 45, rounds: 4 },
      { city: "JED", category: "tourism", pct: 40, rounds: 4 },
    ],
  }),
  n({
    quarter: 31, id: "WC-2026", icon: "📅", impact: "none",
    headline: "FIFA confirms World Cup 2026 — USA, Canada, Mexico. 48 teams, 104 matches",
    detail: "Beyond simulation timeline. No demand impact this round.",
  }),

  // ═══ R32 — Q4 2022 — Qatar World Cup ═══
  n({
    quarter: 32, id: "QATAR", icon: "⚽", impact: "tourism",
    headline: "FIFA World Cup Qatar 2022 — first winter World Cup, first in Middle East",
    detail: "DOH at absolute demand peak. Middle East at all-time high.",
    modifiers: [
      { city: "DOH", category: "tourism", pct: 200, rounds: 2 },
      { city: "DXB", category: "tourism", pct: 60, rounds: 2 },
      { city: "AUH", category: "tourism", pct: 50, rounds: 2 },
      { city: "RUH", category: "tourism", pct: 40, rounds: 2 },
    ],
    travelIndex: 115,
  }),
  n({
    quarter: 32, id: "S10-WINNER", icon: "🏆", impact: "brand",
    headline: "World Cup Official Carrier reports record revenue — Gulf routes premium for 8 weeks",
    detail: "S10 winner: 100% load factor all routes this round and next.",
  }),
  n({
    quarter: 32, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude drops to $82/barrel — recession fears + demand-destruction",
    detail: "Index 115.",
    fuelIndexAtBaseline: 115,
  }),
  n({
    quarter: 32, id: "ASIA-RECOVER", icon: "💼", impact: "business",
    headline: "Asia-Pacific business travel fully recovered — HKG, SIN, BKK, NRT above 2019 levels",
    detail: "Last major regional recovery complete.",
    modifiers: [
      { city: "HKG", category: "business", pct: 10, rounds: 99 },
      { city: "SIN", category: "business", pct: 10, rounds: 99 },
      { city: "BKK", category: "business", pct: 10, rounds: 99 },
    ],
  }),

  // ═══ R33 — Q1 2023 — SVB Banking + AI Revolution + Rugby France Build ═══
  n({
    quarter: 33, id: "SVB", icon: "📉", impact: "business",
    headline: "Silicon Valley Bank collapses — $200B in assets seized. Tech startup ecosystem frozen",
    detail: "1,500 companies affected. SFO, SEA tech business drops sharply.",
    modifiers: [
      { city: "SFO", category: "business", pct: -25, rounds: 2 },
      { city: "SEA", category: "business", pct: -20, rounds: 2 },  // SEA + AUS merged
    ],
    travelIndex: 108,
  }),
  n({
    quarter: 33, id: "CHATGPT", icon: "🤖", impact: "business",
    headline: "ChatGPT reaches 100M users in 60 days — fastest product adoption in history",
    detail: "AI revolution officially begins. New high-yield business travel segment.",
    modifiers: [
      { city: "SFO", category: "business", pct: 15, rounds: 4 },
      { city: "LHR", category: "business", pct: 12, rounds: 4 },
      { city: "SIN", category: "business", pct: 12, rounds: 4 },
      { city: "AMS", category: "business", pct: 10, rounds: 4 },
    ],
  }),
  n({
    quarter: 33, id: "RUGBY-FR-PRE", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup 2023 France — 4 months out",
    detail: "French cities pre-event surge beginning.",
    modifiers: [{ city: "CDG", category: "tourism", pct: 60, rounds: 2 }],  // CDG + LYS + MRS + NTE merged
  }),
  n({
    quarter: 33, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $80/barrel — banking crisis uncertainty",
    detail: "Index 108.",
    fuelIndexAtBaseline: 108,
  }),
  n({
    quarter: 33, id: "ECOM-2T", icon: "📦", impact: "cargo",
    headline: "Cross-border e-commerce hits $2T annually — air freight permanently 40% above pre-COVID",
    detail: "Structural demand shift confirmed.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 40, 99),
  }),

  // ═══ R34 — Q2 2023 — Cricket WC India + AI Boom + Saudi Milestone ═══
  n({
    quarter: 34, id: "CRICKET-IN", icon: "🏏", impact: "tourism",
    headline: "ICC Cricket World Cup 2023 India — largest cricket event ever staged",
    detail: "India cricket cities at record demand. Indian diaspora outbound at all-time high.",
    modifiers: [
      { city: "DEL", category: "tourism", pct: 80, rounds: 2 },
      { city: "BOM", category: "tourism", pct: 80, rounds: 2 },  // BOM + HYD merged
      { city: "BLR", category: "tourism", pct: 70, rounds: 2 },
      { city: "MAA", category: "tourism", pct: 70, rounds: 2 },  // CHE → MAA
      { city: "LHR", category: "tourism", pct: 30, rounds: 2 },
      { city: "DXB", category: "tourism", pct: 25, rounds: 2 },
    ],
    travelIndex: 112,
  }),
  n({
    quarter: 34, id: "AI-INVEST", icon: "🤖", impact: "business",
    headline: "AI investment hits $50B in first half 2023 — Microsoft, Google, Amazon each announce $10B+",
    detail: "Tech corridor business at record. Data centre construction driving cargo.",
    modifiers: [
      { city: "SFO", category: "business", pct: 25, rounds: 2 },
      { city: "SEA", category: "business", pct: 22, rounds: 2 },
      { city: "JFK", category: "business", pct: 18, rounds: 2 },
      { city: "SIN", category: "business", pct: 15, rounds: 2 },
    ],
  }),
  n({
    quarter: 34, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Saudi Arabia unilateral cut — 1M barrels/day removed. Crude climbs to $95",
    detail: "Index 122. Eco-fleet advantage significant.",
    fuelIndexAtBaseline: 122,
  }),
  n({
    quarter: 34, id: "SAUDI-EARLY", icon: "🇸🇦", impact: "tourism",
    headline: "Saudi Arabia reaches 100M tourist target 7 years early — 106M visitors",
    detail: "Vision 2030 aviation transformation confirmed.",
    modifiers: [
      { city: "RUH", category: "tourism", pct: 50, rounds: 99 },
      { city: "JED", category: "tourism", pct: 45, rounds: 99 },
    ],
  }),
  n({
    quarter: 34, id: "MAQ-2023", icon: "🍲", impact: "none",
    headline: "Maqlouba wins world's best dish for 2023",
    detail: "Online ceremony breaks streaming records. No game impact.",
  }),

  // ═══ R35 — Q3 2023 — Rugby France + Middle East Conflict ═══
  n({
    quarter: 35, id: "RUGBY-FR", icon: "🏉", impact: "tourism",
    headline: "Rugby World Cup 2023 France — South Africa wins fourth title",
    detail: "France at all-time tourism high. One of the highest CDG rounds in the simulation.",
    modifiers: [
      { city: "CDG", category: "tourism", pct: 100, rounds: 2 },  // CDG + LYS + MRS + NTE merged
      { city: "JNB", category: "tourism", pct: 35, rounds: 2 },
    ],
    travelIndex: 118,
  }),
  n({
    quarter: 35, id: "ME-CONFLICT", icon: "⚠", impact: "tourism",
    headline: "Regional escalation in the Levant — airlines suspend Beirut routes industry-wide",
    detail: "Beirut routes suspended industry-wide on regional anxiety. Effect 6 rounds.",
    modifiers: [
      { city: "BEY", category: "tourism", pct: -85, rounds: 6 },
      { city: "AMM", category: "tourism", pct: -20, rounds: 3 },  // FLAG-AMMAN: regional spillover
      { city: "CAI", category: "tourism", pct: -15, rounds: 3 },
      { city: "DXB", category: "tourism", pct: -10, rounds: 2 },
    ],
  }),
  n({
    quarter: 35, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Middle East conflict drives crude to $97/barrel — Suez Canal threat",
    detail: "Index 128. Stored fuel and eco-upgrades critical.",
    fuelIndexAtBaseline: 128,
  }),
  n({
    quarter: 35, id: "AI-DEPLOY", icon: "🤖", impact: "business",
    headline: "AI enterprise deployment wave — 500 Fortune 500 announce AI transformation programmes",
    detail: "Consulting, tech, financial services business at record.",
    modifiers: [
      { city: "LHR", category: "business", pct: 18, rounds: 3 },
      { city: "JFK", category: "business", pct: 20, rounds: 3 },
      { city: "SIN", category: "business", pct: 18, rounds: 3 },
    ],
  }),
  n({
    quarter: 35, id: "RED-SEA", icon: "📦", impact: "cargo",
    headline: "Red Sea shipping attacks begin — Houthi drones target commercial vessels",
    detail: "Air cargo rates surge. Routes avoiding Red Sea add 14 days by sea.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 35, 3),
  }),

  // ═══ R36 — Q4 2023 — Year-End Peak + Osaka Expo Announced ═══
  n({
    quarter: 36, id: "OSAKA-PRE", icon: "🏛", impact: "tourism",
    headline: "Expo 2025 Osaka Japan confirmed — 28M visitors expected",
    detail: "NRT, KIX tourism pre-event surge begins.",
    modifiers: [
      { city: "KIX", category: "tourism", pct: 50, rounds: 4 },  // KIX + NGO merged
      { city: "NRT", category: "tourism", pct: 20, rounds: 4 },
    ],
    travelIndex: 112,
  }),
  n({
    quarter: 36, id: "MENA-RECORD", icon: "🇦🇪", impact: "business",
    headline: "2023 closes as strongest year for MENA business travel in history — Dubai 500+ conferences",
    detail: "Arabian Gulf confirmed as global meeting capital.",
    modifiers: [
      { city: "DXB", category: "business", pct: 25, rounds: 2 },
      { city: "AUH", category: "business", pct: 20, rounds: 2 },
      { city: "DOH", category: "business", pct: 20, rounds: 2 },
      { city: "RUH", category: "business", pct: 30, rounds: 2 },
    ],
  }),
  n({
    quarter: 36, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Red Sea crisis adding 15% premium — crude at $82/barrel",
    detail: "Index 115.",
    fuelIndexAtBaseline: 115,
  }),
  n({
    quarter: 36, id: "XMAS", icon: "🎄", impact: "cargo",
    headline: "Christmas 2023: 11.4B packages shipped globally",
    detail: "T1-T2 cargo at seasonal peak.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG",
      "NRT", "KIX", "ICN", "BOM", "DEL", "MAA", "BLR",
    ], "cargo", 30, 1),
  }),
  n({
    quarter: 36, id: "CIRCLE-BACK", icon: "📰", impact: "none",
    headline: "'Let's circle back' declared official corporate language by three industry bodies",
    detail: "Circularity date unspecified. No game impact.",
  }),

  // ═══ R37 — Q1 2024 — Paris Olympics Build + F1 Record + Japan Expo Surge ═══
  n({
    quarter: 37, id: "PARIS-PRE", icon: "🥇", impact: "tourism",
    headline: "Paris 2024 Summer Olympics — 4 months out. All Paris hotels sold out through September",
    detail: "Final approach to highest-demand round of simulation.",
    modifiers: [{ city: "CDG", category: "tourism", pct: 75, rounds: 3 }],  // CDG + ORY + LYS + NCE collapsed
    travelIndex: 115,
  }),
  n({
    quarter: 37, id: "F1", icon: "🏎", impact: "tourism",
    headline: "Formula 1 2024 — record 24-race calendar",
    detail: "Las Vegas, Singapore, Abu Dhabi hospitality demand peaks.",
    modifiers: [
      { city: "LAS", category: "tourism", pct: 45, rounds: 1 },
      { city: "SIN", category: "tourism", pct: 40, rounds: 1 },
      { city: "AUH", category: "tourism", pct: 35, rounds: 1 },
    ],
  }),
  n({
    quarter: 37, id: "AI-INFRA", icon: "🤖", impact: "business",
    headline: "Global AI infrastructure build — Microsoft, Google, Amazon announce $300B in data centres",
    detail: "Data centre construction cargo surging.",
    modifiers: [
      { city: "DUB", category: "business", pct: 25, rounds: 4 },
      { city: "SIN", category: "business", pct: 20, rounds: 4 },
      { city: "BLR", category: "business", pct: 22, rounds: 4 },
    ],
  }),
  n({
    quarter: 37, id: "JAPAN-RECORD", icon: "🇯🇵", impact: "tourism",
    headline: "Japan tourism breaks 35M annual visitor record — Expo 2025 effect pulling demand forward",
    detail: "Japan routes at historic peak.",
    modifiers: [
      { city: "NRT", category: "tourism", pct: 35, rounds: 3 },
      { city: "KIX", category: "tourism", pct: 70, rounds: 3 },  // KIX + NGO merged
    ],
  }),
  n({
    quarter: 37, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Red Sea crisis subsiding — crude at $78/barrel",
    detail: "Index 108.",
    fuelIndexAtBaseline: 108,
  }),

  // ═══ R38 — Q2 2024 — UEFA Euro 2024 Germany ═══
  n({
    quarter: 38, id: "EURO-24", icon: "⚽", impact: "tourism",
    headline: "UEFA Euro 2024 Germany — Spain wins record 4th Euros, 2.7M attendance",
    detail: "German cities at record demand. Highest European demand round since 2006 World Cup Germany.",
    modifiers: [
      { city: "FRA", category: "tourism", pct: 95, rounds: 2 },
      { city: "MUC", category: "tourism", pct: 90, rounds: 2 },
      { city: "BER", category: "tourism", pct: 85, rounds: 2 },  // BER properly added
      { city: "HAM", category: "tourism", pct: 80, rounds: 2 },
      { city: "DUS", category: "tourism", pct: 80, rounds: 2 },
      { city: "FRA", category: "tourism", pct: 25, rounds: 2 },  // LEJ → FRA additional bump
    ],
    travelIndex: 120,
  }),
  n({
    quarter: 38, id: "PARIS-6W", icon: "🥇", impact: "tourism",
    headline: "Paris Olympics — 6 weeks out. 45,000 athletes and officials en route",
    detail: "Hotels sold 18 months ahead. Every Paris route 98%+.",
    modifiers: [{ city: "CDG", category: "tourism", pct: 65, rounds: 1 }],  // CDG + ORY collapsed
  }),
  n({
    quarter: 38, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Summer demand drives crude to $87/barrel — Olympics + Euros 15-year demand peak",
    detail: "Index 118.",
    fuelIndexAtBaseline: 118,
  }),
  n({
    quarter: 38, id: "EU-BIZ-PEAK", icon: "💼", impact: "business",
    headline: "European business travel at decade high — Euros boost + post-COVID recovery + AI conferences",
    detail: "FRA, LHR, AMS, CDG, ZRH at 5-year highs.",
    modifiers: [
      { city: "FRA", category: "business", pct: 20, rounds: 2 },
      { city: "LHR", category: "business", pct: 18, rounds: 2 },
      { city: "AMS", category: "business", pct: 18, rounds: 2 },
      { city: "ZRH", category: "business", pct: 15, rounds: 2 },
    ],
  }),
  n({
    quarter: 38, id: "OSAKA-CARGO", icon: "📦", impact: "cargo",
    headline: "Expo 2025 Osaka construction final sprint — air freight to Japan at record",
    detail: "KIX, NRT cargo demand extreme for Expo construction delivery.",
    modifiers: [
      { city: "KIX", category: "cargo", pct: 50, rounds: 2 },
      { city: "NRT", category: "cargo", pct: 35, rounds: 2 },
    ],
  }),

  // ═══ R39 — Q3 2024 — Paris Olympics ═══
  n({
    quarter: 39, id: "PARIS", icon: "🥇", impact: "tourism",
    headline: "Paris 2024 Summer Olympics opens — 10,714 athletes, opening ceremony on the Seine",
    detail: "Greatest Olympics ever staged. Paris at absolute demand peak.",
    modifiers: [
      { city: "CDG", category: "tourism", pct: 150, rounds: 2 },  // CDG + ORY + LYS + NCE all merged
      { city: "ZRH", category: "tourism", pct: 40, rounds: 2 },  // GVA → ZRH
      { city: "AMS", category: "tourism", pct: 30, rounds: 2 },
      { city: "LHR", category: "tourism", pct: 25, rounds: 2 },
    ],
    travelIndex: 132,
  }),
  n({
    quarter: 39, id: "S11-WINNER", icon: "🏆", impact: "brand",
    headline: "Olympic Official Carrier reports 99% occupancy — record revenue",
    detail: "S11 winner: 100% load floor this round and next. Highest brand value round in simulation.",
  }),
  n({
    quarter: 39, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Olympic travel demand peaks — crude at $88/barrel",
    detail: "Index 120.",
    fuelIndexAtBaseline: 120,
  }),
  n({
    quarter: 39, id: "OLYMPIC-BIZ", icon: "💼", impact: "business",
    headline: "Paris Olympics corporate hospitality — $8.2B spent on Olympic experiences",
    detail: "CDG business at record. Premium cabin yields at record.",
    modifiers: [
      { city: "CDG", category: "business", pct: 60, rounds: 2 },
      { city: "LHR", category: "business", pct: 20, rounds: 2 },
    ],
  }),
  n({
    quarter: 39, id: "OSAKA-6MO", icon: "🏛", impact: "tourism",
    headline: "Expo 2025 Osaka — 6 months out. Japan announces 30M+ visitor forecast",
    detail: "KIX, NRT routes at maximum forward demand.",
    modifiers: [
      { city: "KIX", category: "tourism", pct: 90, rounds: 3 },  // KIX + NGO merged
      { city: "NRT", category: "tourism", pct: 40, rounds: 3 },
    ],
  }),

  // ═══ R40 — Q4 2024 — Final Round ═══
  n({
    quarter: 40, id: "AVIATION-RECORD", icon: "📈", impact: "none",
    headline: "2024 closes as greatest year in commercial aviation history — 5.1B passengers",
    detail: "Highest industry profit ever recorded. All city demand at simulation peak.",
    travelIndex: 125,
  }),
  n({
    quarter: 40, id: "OSAKA-FINAL", icon: "🏛", impact: "tourism",
    headline: "Expo 2025 Osaka opens April 2025 — 161 nations, 28M visitors expected",
    detail: "From the next hypothetical round, KIX tourism would be at peak. Teams with KIX routes positioned optimally.",
    modifiers: [{ city: "KIX", category: "tourism", pct: 80, rounds: 1 }],
  }),
  n({
    quarter: 40, id: "BIZ-FINAL", icon: "💼", impact: "business",
    headline: "Global business travel 2024 — $1.48T corporate spend. All 2019 records broken",
    detail: "Business demand at simulation peak across all hubs.",
    modifiers: spread([
      "JFK", "LHR", "DXB", "SIN", "HKG", "FRA", "AMS", "CDG", "ZRH",
      "NRT", "KIX", "ICN", "PEK", "PVG", "BOM", "DEL", "BLR",
      "DOH", "AUH", "RUH",
    ], "business", 15, 1),
  }),
  n({
    quarter: 40, id: "FUEL", icon: "$", impact: "fuel",
    headline: "Crude at $75/barrel — stable close. SAF mandates cut effective fuel cost for green airlines",
    detail: "Index 105. SAF/Green Leader carriers effectively at index 88.",
    fuelIndexAtBaseline: 105,
  }),
  n({
    quarter: 40, id: "FINAL", icon: "✓", impact: "none",
    headline: "Final investor pitch and MVP awards ceremony commences",
    detail: "The simulation ends here. All metrics permanent. What an airline you built.",
  }),

  // ═══════════════════════════════════════════════════════════════
  // Aircraft discontinuation announcements (Update 4 — 16 events)
  // Each fires the round BEFORE the cutoffRound on the affected
  // specs, giving teams one final round to place orders. After
  // cutoff: Order New disappears, secondary market unaffected,
  // maintenance starts escalating per Update 5 brackets.
  // ═══════════════════════════════════════════════════════════════
  n({
    quarter: 10, id: "CUTOFF-737-CLASSIC", icon: "🛬", impact: "ops",
    headline: "Boeing closes the 737 Classic line — last orders for -300, -400, -500, -600 next round",
    detail: "After three decades, the original 737 family ends new production. Next-Generation variants assume the narrowbody role. Existing Classics remain airworthy. Last round to order: B737-300 / -400 / -500 / -600 — cutoff R11.",
  }),
  n({
    quarter: 11, id: "CUTOFF-757-LR-E195", icon: "🛬", impact: "ops",
    headline: "Boeing 757 family + 777-200LR retire from production · E195 superseded by E195-E2",
    detail: "Three simultaneous closures: the 757 (1,050 built), the 777-200LR (longest range of its day) and the original E195 (the E195-E2 takes over). Last round to order: B757-200, B757-200F, B777-200LR, E195 — cutoff R12.",
  }),
  n({
    quarter: 12, id: "CUTOFF-747-400-ATR500", icon: "🛬", impact: "ops",
    headline: "Boeing 747-400 Jumbo Jet retires from production · ATR 72-500 closes for the -600",
    detail: "The 747-400, most iconic widebody in history at 694 deliveries, ends new production. Both the passenger and -400F cargo variants close. Last round to order: B747-400, B747-400F, ATR 72-500 — cutoff R13.",
  }),
  n({
    quarter: 13, id: "CUTOFF-A300-600F", icon: "🛬", impact: "ops",
    headline: "Airbus A300-600F production ends — classic widebody freighter era closes after 35 years",
    detail: "The A300-600F takes its final order. A330-200F and B777F absorb its routes. Last round to order: A300-600F — cutoff R14.",
  }),
  n({
    quarter: 14, id: "CUTOFF-737-300F", icon: "🛬", impact: "ops",
    headline: "Boeing 737-300F closes · the 737-800BCF converted freighter is your replacement",
    detail: "The classic narrowbody freighter ends. The 737-800BCF (available now) offers better fuel economics on the same routes. Last round to order: B737-300F — cutoff R15. B737-800BCF now available.",
  }),
  n({
    quarter: 15, id: "CUTOFF-E170-767-E190", icon: "🛬", impact: "ops",
    headline: "Embraer E170, Boeing 767-300ER and original E190 all closing next quarter — E190-E2 ready",
    detail: "Three aircraft retire from new production. The E190-E2 unlocks the same round as the E190 cutoff — direct upgrade available immediately. Last round to order: E170, B767-300ER, E190 — cutoff R16.",
  }),
  n({
    quarter: 16, id: "CUTOFF-777-200", icon: "🛬", impact: "ops",
    headline: "Boeing 777-200 original ends production — first ETOPS twin retires from manufacturing",
    detail: "The 777-200, the aircraft that proved long-haul twin-engine operations, ends production after 88 deliveries. 777-200ER and 777-300ER continue. Last round to order: B777-200 — cutoff R17.",
  }),
  n({
    quarter: 17, id: "CUTOFF-A330-300-777-200ER", icon: "🛬", impact: "ops",
    headline: "Airbus A330-300 + Boeing 777-200ER closing next quarter — neo / 300ER take over",
    detail: "The A330-300 and 777-200ER close simultaneously. A330-900neo and 777-300ER cover all capacity requirements going forward. Last round to order: A330-300, B777-200ER — cutoff R18.",
  }),
  n({
    quarter: 19, id: "CUTOFF-737-900", icon: "🛬", impact: "ops",
    headline: "Boeing 737-900 closes · MAX 9 now certified and delivering",
    detail: "737-900 superseded by the 737 MAX 9. Final orders accepted this round. Last round to order: B737-900 — cutoff R20.",
  }),
  n({
    quarter: 23, id: "CUTOFF-CRJ-A330-200", icon: "🛬", impact: "ops",
    headline: "Bombardier exits commercial aviation — CRJ-700, CRJ-900 close · A330-200 also retires",
    detail: "Bombardier sells the CRJ programme; no new CRJ aircraft will ever be manufactured. The A330-200 is superseded by the A330-900neo. Last round to order: CRJ-700, CRJ-900, A330-200 — cutoff R24.",
  }),
  n({
    quarter: 26, id: "CUTOFF-A380", icon: "🛬", impact: "ops",
    headline: "Airbus officially announces A380 end of production — superjumbo era closes",
    detail: "Airbus confirms the last A380-800 will be delivered next quarter. The A380F cargo variant closes simultaneously. Both remain in service globally for years to come. Last round to order: A380-800 passenger, A380F cargo — cutoff R27.",
  }),
  n({
    quarter: 27, id: "CUTOFF-737NG", icon: "🛬", impact: "ops",
    headline: "Boeing 737-700 + 737-800 close — MAX family takes full narrowbody leadership",
    detail: "NG variants retire as MAX 7 and MAX 8 ramp deliveries. ~7,000 NGs remain airworthy. Last round to order: B737-700, B737-800 — cutoff R28.",
  }),
  n({
    quarter: 29, id: "CUTOFF-777-300ER", icon: "🛬", impact: "ops",
    headline: "Boeing 777-300ER ends production — 777X-9 fully certified as replacement",
    detail: "The 777-300ER, the most profitable widebody Boeing ever built, closes after 22 years and 800+ deliveries. Last round to order: B777-300ER — cutoff R30.",
  }),
  n({
    quarter: 32, id: "CUTOFF-747-8", icon: "🛬", impact: "ops",
    headline: "Boeing delivers final 747 — end of the jumbo jet era after 54 years",
    detail: "The 747 programme began in 1968. More than 1,500 747s remain in service globally. The 747-8F cargo variant closes simultaneously. Aviation will never see another four-engine commercial giant. Last round to order: B747-8, B747-8F — cutoff R33.",
  }),
  n({
    quarter: 34, id: "CUTOFF-E175-E2", icon: "🛬", impact: "ops",
    headline: "Embraer E175-E2 final production slot allocated — programme closure complete",
    detail: "The last committed E175-E2 order is fulfilled. No further new orders possible after next round. E195-E2 and E190-E2 carry the E2 family forward. Last round to order: E175-E2 — cutoff R35 (10-round minimum from R25 fulfilled).",
  }),
  n({
    quarter: 35, id: "CUTOFF-A320-FAMILY", icon: "🛬", impact: "ops",
    headline: "Airbus A319 / A320 / A321 originals close — neo family takes over from next round",
    detail: "The original A320 family, backbone of short/medium-haul aviation for 35 years and 8,000+ deliveries, closes for new orders. A319neo, A320neo and A321neo are the only Airbus narrowbody options going forward. Last round to order: A319, A320, A321 — cutoff R36.",
  }),
];

export const NEWS_BY_QUARTER: Record<number, NewsItem[]> = WORLD_NEWS.reduce(
  (acc, item) => {
    (acc[item.quarter] ??= []).push(item);
    return acc;
  },
  {} as Record<number, NewsItem[]>,
);

/**
 * Dynamic host-city headlines. The World Cup and Olympic host cities
 * are randomized per-game (tier 1-2, never a player or rival hub), so
 * they can't live in the static WORLD_NEWS array. This helper returns
 * any host-related headline that should fire for the given quarter.
 */
export function dynamicHostNews(
  quarter: number,
  worldCupHostCode: string | null | undefined,
  olympicHostCode: string | null | undefined,
  cityNameLookup: (code: string) => string | undefined,
): NewsItem[] {
  const out: NewsItem[] = [];

  if (worldCupHostCode) {
    const wcCity = cityNameLookup(worldCupHostCode) ?? worldCupHostCode;
    if (quarter === 3) {
      out.push({
        id: `Q${quarter}-WC-HOST-ANNOUNCED`,
        quarter, icon: "⚽", impact: "tourism",
        headline: `FIFA names ${wcCity} as official World Cup host city`,
        detail: `Routes touching ${wcCity} (${worldCupHostCode}) will see heavy demand surges in rounds 19-24. S10 sealed-bid carrier auction opens this quarter.`,
      });
    }
  }

  if (olympicHostCode) {
    const olCity = cityNameLookup(olympicHostCode) ?? olympicHostCode;
    if (quarter === 13) {
      out.push({
        id: `Q${quarter}-OL-HOST-ANNOUNCED`,
        quarter, icon: "🏅", impact: "tourism",
        headline: `IOC confirms ${olCity} for the upcoming Summer Olympics`,
        detail: `Demand surge expected on ${olCity} (${olympicHostCode}) routes through the rounds 29-32 window. S11 Olympic Play sponsorship slots open this quarter.`,
      });
    }
  }

  return out;
}
