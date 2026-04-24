// ============================================================
// SkyHigh Executive — Game Content
// Planes | Events | Crises | Milestones | Doctrines
// ============================================================
window.SkyHigh = window.SkyHigh || {};

// ── PLANE CATALOG ───────────────────────────────────────────
// seats = total (for backward compat). economySeats/businessSeats/firstSeats = breakdown.
// costM = purchase price in $M. leaseMonthlyCostM = per-month lease cost in $M.
// lifespanQtrs = quarters before mandatory retirement. deliveryQtrs = quarters until delivery (0 = instant).
window.SkyHigh.PLANES = [

  // ── TURBOPROPS ──────────────────────────────────────────────
  {
    id: 'ATR42',           manufacturer: 'ATR',
    name: 'ATR 42-600',   shortName: 'ATR-42',   emoji: '🛩',
    seats: 48, economySeats: 48, businessSeats: 0, firstSeats: 0,
    rangeKm: 1320,  cruiseKmh: 510,  costM: 6,   leaseMonthlyCostM: 0.09,
    opCostPerKm: 0.75, fuelLitersPerKm: 2.6, crewRequired: 3, lifespanQtrs: 40, deliveryQtrs: 0,
    strength: 'Ultra-efficient for thin regional routes', weakness: 'Very limited range',
    unlockRound: 1, color: '#7A9A5A',
  },
  {
    id: 'TURBOPROP',       manufacturer: 'ATR',
    name: 'ATR 72-600',   shortName: 'ATR-72',   emoji: '🛩',
    seats: 70, economySeats: 70, businessSeats: 0, firstSeats: 0,
    rangeKm: 1600,  cruiseKmh: 510,  costM: 8,   leaseMonthlyCostM: 0.13,
    opCostPerKm: 0.9,  fuelLitersPerKm: 3.2, crewRequired: 4, lifespanQtrs: 40, deliveryQtrs: 0,
    strength: 'Efficient on short routes, low overhead', weakness: 'Range-limited, low volume',
    unlockRound: 1, color: '#8A9A6A',
  },
  {
    id: 'DASH8',           manufacturer: 'De Havilland',
    name: 'Dash 8 Q400',  shortName: 'Q400',     emoji: '🛩',
    seats: 78, economySeats: 78, businessSeats: 0, firstSeats: 0,
    rangeKm: 2040,  cruiseKmh: 556,  costM: 10,  leaseMonthlyCostM: 0.15,
    opCostPerKm: 0.85, fuelLitersPerKm: 3.5, crewRequired: 4, lifespanQtrs: 40, deliveryQtrs: 0,
    strength: 'Extended regional reach with reliability', weakness: 'Prop noise limits premium fares',
    unlockRound: 1, color: '#8A9A6A',
  },

  // ── REGIONAL JETS ────────────────────────────────────────────
  {
    id: 'E175',            manufacturer: 'Embraer',
    name: 'Embraer E175', shortName: 'E175',     emoji: '✈',
    seats: 80, economySeats: 76, businessSeats: 4, firstSeats: 0,
    rangeKm: 3000,  cruiseKmh: 828,  costM: 14,  leaseMonthlyCostM: 0.22,
    opCostPerKm: 1.1,  fuelLitersPerKm: 3.8, crewRequired: 4, lifespanQtrs: 44, deliveryQtrs: 1,
    strength: 'Jet speed for thin routes, slim cabin', weakness: 'High per-seat cost vs narrowbody',
    unlockRound: 2, color: '#6A9A8A',
  },
  {
    id: 'E190',            manufacturer: 'Embraer',
    name: 'Embraer E190-E2', shortName: 'E190-E2', emoji: '✈',
    seats: 106, economySeats: 98, businessSeats: 8, firstSeats: 0,
    rangeKm: 4500,  cruiseKmh: 828,  costM: 18,  leaseMonthlyCostM: 0.28,
    opCostPerKm: 1.3,  fuelLitersPerKm: 4.2, crewRequired: 5, lifespanQtrs: 44, deliveryQtrs: 1,
    strength: 'Flexible medium regional jet', weakness: 'Underperforms A320neo at scale',
    unlockRound: 2, color: '#6A9A8A',
  },

  // ── NARROWBODY — AIRBUS ───────────────────────────────────────
  {
    id: 'A319',            manufacturer: 'Airbus',
    name: 'Airbus A319neo', shortName: 'A319neo', emoji: '✈️',
    seats: 120, economySeats: 108, businessSeats: 12, firstSeats: 0,
    rangeKm: 6850,  cruiseKmh: 828,  costM: 20,  leaseMonthlyCostM: 0.30,
    opCostPerKm: 1.5,  fuelLitersPerKm: 4.5, crewRequired: 5, lifespanQtrs: 48, deliveryQtrs: 1,
    strength: 'Long range for a single-aisle, great for thinner mid-haul', weakness: 'Lower capacity than A320',
    unlockRound: 1, color: '#C8933A',
  },
  {
    id: 'NARROWBODY',      manufacturer: 'Airbus',
    name: 'Airbus A320neo', shortName: 'A320neo', emoji: '✈️',
    seats: 165, economySeats: 150, businessSeats: 15, firstSeats: 0,
    rangeKm: 6300,  cruiseKmh: 828,  costM: 25,  leaseMonthlyCostM: 0.38,
    opCostPerKm: 1.8,  fuelLitersPerKm: 5.4, crewRequired: 6, lifespanQtrs: 48, deliveryQtrs: 2,
    strength: 'Versatile workhorse, dominates medium-haul markets', weakness: 'Cannot serve ultra-long routes',
    unlockRound: 1, color: '#C8933A',
  },
  {
    id: 'A321',            manufacturer: 'Airbus',
    name: 'Airbus A321neo', shortName: 'A321neo', emoji: '✈️',
    seats: 196, economySeats: 176, businessSeats: 20, firstSeats: 0,
    rangeKm: 7400,  cruiseKmh: 828,  costM: 32,  leaseMonthlyCostM: 0.48,
    opCostPerKm: 2.0,  fuelLitersPerKm: 5.8, crewRequired: 6, lifespanQtrs: 48, deliveryQtrs: 2,
    strength: 'High-capacity narrowbody with excellent range', weakness: 'Expensive per-unit vs A320',
    unlockRound: 3, color: '#C8933A',
  },

  // ── NARROWBODY — BOEING ───────────────────────────────────────
  {
    id: 'B737MAX8',        manufacturer: 'Boeing',
    name: 'Boeing 737 MAX 8', shortName: '737 MAX 8', emoji: '✈️',
    seats: 162, economySeats: 148, businessSeats: 14, firstSeats: 0,
    rangeKm: 6570,  cruiseKmh: 839,  costM: 24,  leaseMonthlyCostM: 0.36,
    opCostPerKm: 1.75, fuelLitersPerKm: 5.2, crewRequired: 6, lifespanQtrs: 48, deliveryQtrs: 2,
    strength: 'Fuel-efficient Boeing workhorse', weakness: 'Slightly less range than A320neo',
    unlockRound: 2, color: '#2A5A8A',
  },
  {
    id: 'B737MAX10',       manufacturer: 'Boeing',
    name: 'Boeing 737 MAX 10', shortName: '737 MAX 10', emoji: '✈️',
    seats: 204, economySeats: 186, businessSeats: 18, firstSeats: 0,
    rangeKm: 6110,  cruiseKmh: 839,  costM: 30,  leaseMonthlyCostM: 0.44,
    opCostPerKm: 1.9,  fuelLitersPerKm: 5.6, crewRequired: 6, lifespanQtrs: 48, deliveryQtrs: 3,
    strength: 'Highest capacity narrowbody Boeing', weakness: 'Shorter range at full passenger load',
    unlockRound: 4, color: '#2A5A8A',
  },

  // ── WIDEBODY — AIRBUS ─────────────────────────────────────────
  {
    id: 'A330',            manufacturer: 'Airbus',
    name: 'Airbus A330-900neo', shortName: 'A330-900', emoji: '🛫',
    seats: 287, economySeats: 252, businessSeats: 30, firstSeats: 5,
    rangeKm: 13334, cruiseKmh: 912,  costM: 50,  leaseMonthlyCostM: 0.75,
    opCostPerKm: 2.8,  fuelLitersPerKm: 7.5, crewRequired: 10, lifespanQtrs: 52, deliveryQtrs: 3,
    strength: 'Cost-effective widebody, excellent long-range economics', weakness: 'Lower tech vs B787',
    unlockRound: 5, color: '#2A7A9A',
  },
  {
    id: 'A350',            manufacturer: 'Airbus',
    name: 'Airbus A350-900', shortName: 'A350-900', emoji: '🛫',
    seats: 325, economySeats: 280, businessSeats: 40, firstSeats: 5,
    rangeKm: 15000, cruiseKmh: 910,  costM: 70,  leaseMonthlyCostM: 1.05,
    opCostPerKm: 3.0,  fuelLitersPerKm: 8.5, crewRequired: 12, lifespanQtrs: 52, deliveryQtrs: 4,
    strength: 'Ultra-efficient flagship, lowest fuel burn per seat', weakness: 'High acquisition cost',
    unlockRound: 8, color: '#2A7A9A',
  },

  // ── WIDEBODY — BOEING ─────────────────────────────────────────
  {
    id: 'WIDEBODY',        manufacturer: 'Boeing',
    name: 'Boeing 787-9 Dreamliner', shortName: 'B787-9', emoji: '🛫',
    seats: 296, economySeats: 254, businessSeats: 36, firstSeats: 6,
    rangeKm: 14140, cruiseKmh: 900,  costM: 60,  leaseMonthlyCostM: 0.90,
    opCostPerKm: 3.2,  fuelLitersPerKm: 8.9, crewRequired: 12, lifespanQtrs: 52, deliveryQtrs: 3,
    strength: 'Premium long-haul, maximum revenue ceiling', weakness: 'Requires high load factor to profit',
    unlockRound: 6, color: '#2A7A9A',
  },
  {
    id: 'B777',            manufacturer: 'Boeing',
    name: 'Boeing 777-300ER', shortName: 'B777-300ER', emoji: '🛫',
    seats: 396, economySeats: 344, businessSeats: 48, firstSeats: 4,
    rangeKm: 13649, cruiseKmh: 905,  costM: 80,  leaseMonthlyCostM: 1.20,
    opCostPerKm: 3.8,  fuelLitersPerKm: 11.2, crewRequired: 14, lifespanQtrs: 52, deliveryQtrs: 4,
    strength: 'Massive capacity, ideal for high-yield trunk routes', weakness: 'Needs very high demand to fill',
    unlockRound: 10, color: '#2A7A9A',
  },

  // ── SUPERJUMBO ────────────────────────────────────────────────
  {
    id: 'A380',            manufacturer: 'Airbus',
    name: 'Airbus A380',  shortName: 'A380',     emoji: '🛬',
    seats: 555, economySeats: 480, businessSeats: 66, firstSeats: 9,
    rangeKm: 15200, cruiseKmh: 903,  costM: 120, leaseMonthlyCostM: 1.80,
    opCostPerKm: 5.2,  fuelLitersPerKm: 14.1, crewRequired: 22, lifespanQtrs: 60, deliveryQtrs: 6,
    strength: 'Unmatched capacity on mega-hub routes', weakness: 'Needs 90%+ load factor to break even',
    unlockRound: 14, color: '#6A4A9A',
  },
];

// ── AIRLINE LOGOS ────────────────────────────────────────────
window.SkyHigh.AIRLINE_LOGOS = [
  { id: 'EAGLE',    emoji: '🦅', name: 'Eagle Wing' },
  { id: 'STAR',     emoji: '⭐', name: 'Star Line' },
  { id: 'GLOBE',    emoji: '🌐', name: 'Global Air' },
  { id: 'CROWN',    emoji: '👑', name: 'Royal Class' },
  { id: 'THUNDER',  emoji: '⚡', name: 'Thunder Jet' },
  { id: 'DIAMOND',  emoji: '💎', name: 'Diamond Air' },
  { id: 'FLAME',    emoji: '🔥', name: 'Firebird' },
  { id: 'LEAF',     emoji: '🍃', name: 'Green Horizon' },
  { id: 'ROCKET',   emoji: '🚀', name: 'Apex Launch' },
  { id: 'SHIELD',   emoji: '🛡', name: 'Safe Skies' },
  { id: 'MOON',     emoji: '🌙', name: 'Midnight Air' },
  { id: 'SUN',      emoji: '☀️', name: 'Sunrise Express' },
];

// ── AIRPORT FACILITIES ───────────────────────────────────────
window.SkyHigh.AIRPORT_FACILITIES = [
  {
    id: 'FUEL_TANK', name: 'Fuel Tank', emoji: '⛽',
    costM: 5, monthlyCostM: 0.08,
    desc: 'Reduces fuel costs on all routes through this airport by 12%.',
    benefit: { fuelSavingPct: 0.12 },
  },
  {
    id: 'MAINT_BAY', name: 'Maintenance Bay', emoji: '🔧',
    costM: 8, monthlyCostM: 0.12,
    desc: 'Cuts maintenance costs 15% and adds +6 Safety Shield permanently.',
    benefit: { maintSavingPct: 0.15, safetyShield: 6 },
  },
  {
    id: 'CARGO_STORE', name: 'Cargo Storage', emoji: '📦',
    costM: 6, monthlyCostM: 0.10,
    desc: 'Increases cargo revenue on all routes from this airport by 25%.',
    benefit: { cargoRevBoostPct: 0.25 },
  },
  {
    id: 'CHECKIN', name: 'Check-in Counter', emoji: '🎫',
    costM: 3, monthlyCostM: 0.05,
    desc: 'Improves passenger flow, adding +4 Service Prestige.',
    benefit: { servicePrestige: 4 },
  },
  {
    id: 'OFFICE', name: 'Airline Office', emoji: '🏢',
    costM: 4, monthlyCostM: 0.06,
    desc: 'Unlocks +1 route slot at this airport.',
    benefit: { extraSlot: 1 },
  },
  {
    id: 'VIP_LOUNGE', name: 'VIP Lounge', emoji: '🥂',
    costM: 12, monthlyCostM: 0.20,
    desc: 'Adds 20% premium on business-class fares for routes through this airport.',
    benefit: { bizFarePremiumPct: 0.20 },
  },
  {
    id: 'HOTEL', name: 'Transit Hotel', emoji: '🏨',
    costM: 15, monthlyCostM: 0.25,
    desc: 'Generates $300K passive income per quarter from transit passengers.',
    benefit: { passiveIncomeQtr: 300_000 },
  },
  {
    id: 'LIMO', name: 'Limousine Service', emoji: '🚗',
    costM: 2, monthlyCostM: 0.04,
    desc: 'Boosts Service Prestige by +3 and reduces passenger complaints.',
    benefit: { servicePrestige: 3 },
  },
];

// ── DOCTRINES ────────────────────────────────────────────────
// Choose one at game start — shapes bonuses and playstyle
window.SkyHigh.DOCTRINES = [
  {
    id: 'BUDGET_EXPANSION',
    name: 'Budget Expansion',
    tagline: 'Volume is victory. Fill every seat at any price.',
    icon: '📈',
    bonuses: {
      demandMult: 1.20,   fareMult: 0.85,    safetyDrain: -0.05,
      crewLoyaltyMult: 0.90, boardConfMult: 0.95,
    },
    playstyle: 'Build massive route networks quickly. Revenue through volume.',
    color: '#2ECC71',
  },
  {
    id: 'PREMIUM_SERVICE',
    name: 'Premium Service',
    tagline: 'Every flight a first-class experience.',
    icon: '⭐',
    bonuses: {
      fareMult: 1.30,    demandMult: 0.90,  servicePrestigeMult: 1.15,
      boardConfMult: 1.10, crewCostMult: 1.15,
    },
    playstyle: 'Charge premium fares. Stronger prestige growth. Lower demand ceiling.',
    color: '#C8933A',
  },
  {
    id: 'CARGO_DOMINANCE',
    name: 'Cargo Dominance',
    tagline: 'When passenger demand dips, cargo never sleeps.',
    icon: '📦',
    bonuses: {
      cargoBonusRev: 0.25, crisisCashBuffer: 0.15, demandVolatilityMult: 0.80,
      boardConfMult: 0.90,
    },
    playstyle: 'Cargo revenue hedges against demand crashes. Resilient in crises.',
    color: '#8B5CF6',
  },
  {
    id: 'SAFETY_FIRST',
    name: 'Safety First',
    tagline: 'Zero incidents. Zero compromises. Zero bad press.',
    icon: '🛡',
    bonuses: {
      safetyShieldMult: 1.25, crisisChance: -0.20, fareMult: 1.10,
      opCostMult: 1.10, crewLoyaltyMult: 1.10,
    },
    playstyle: 'Reduced crisis frequency. Premium safety reputation. Higher ops cost.',
    color: '#3498DB',
  },
];

// ── CITY ARCHETYPES ───────────────────────────────────────────
// Used to flavor route descriptions
window.SkyHigh.ARCHETYPES = {
  HIGH_VOLUME:     { label: 'High-Volume Hub',    color: '#C8933A', demandVolatility: 0.10 },
  BUSINESS:        { label: 'Business Corridor',  color: '#3498DB', demandVolatility: 0.08 },
  LEISURE_SURGE:   { label: 'Leisure Surge',      color: '#2ECC71', demandVolatility: 0.25 },
  TOURISM:         { label: 'Tourism Destination',color: '#F39C12', demandVolatility: 0.20 },
  TRANSIT_HUB:     { label: 'Transit Hub',        color: '#9B59B6', demandVolatility: 0.12 },
  EMERGING:        { label: 'Emerging Market',    color: '#1ABC9C', demandVolatility: 0.35 },
  VOLATILE:        { label: 'Volatile Market',    color: '#E74C3C', demandVolatility: 0.40 },
  MEGA_VOLUME:     { label: 'Mega Volume',        color: '#FF6B35', demandVolatility: 0.15 },
  ULTRA_HIGH:      { label: 'Ultra-High Demand',  color: '#F0D060', demandVolatility: 0.08 },
  GROWING:         { label: 'Rapid Growth',       color: '#00B894', demandVolatility: 0.22 },
  ARCHIPELAGO:     { label: 'Archipelago Market', color: '#74B9FF', demandVolatility: 0.28 },
  SAFARI_NICHE:    { label: 'Niche/Safari',       color: '#A29BFE', demandVolatility: 0.45 },
  LARGE_DOMESTIC:  { label: 'Large Domestic',     color: '#FDCB6E', demandVolatility: 0.18 },
  HIGH_YIELD:      { label: 'High Yield',         color: '#55EFC4', demandVolatility: 0.12 },
  MIXED:           { label: 'Mixed Market',       color: '#B2BEC3', demandVolatility: 0.20 },
  TECH_BUSINESS:   { label: 'Tech/Business',      color: '#6C5CE7', demandVolatility: 0.10 },
  EXPLOSIVE:       { label: 'Explosive Growth',   color: '#E17055', demandVolatility: 0.30 },
};

// ── CRISIS EVENTS ─────────────────────────────────────────────
// severity: LOW | MEDIUM | HIGH | CATASTROPHIC
// phase: array of decisions for multi-step crises
window.SkyHigh.CRISES = [

  // ── MINOR CRISES (solo decision) ──────────────────────────
  {
    id: 'FUEL_PRICE_SPIKE',
    name: 'Fuel Price Spike',
    severity: 'MEDIUM',
    stage: [1,2,3,4],
    teaser: 'Crude oil futures spike 28% overnight. Your fuel hedges expire next week.',
    description: 'Global oil markets react to tensions in a major producing region. Fuel costs for all routes spike by 28% this quarter.',
    decisions: [
      { id:'A', label: 'Absorb the cost',       desc:'Maintain all routes. Take the hit. Board will question discipline.',
        effects: { cash: -4000000, boardConfidence: -5 } },
      { id:'B', label: 'Emergency surcharge',   desc:'Add fuel surcharge to all tickets. Risk demand dip.',
        effects: { cash: -1500000, demandMult: 0.90, servicePrestige: -4 } },
      { id:'C', label: 'Suspend 2 routes',      desc:'Ground your highest-cost routes temporarily.',
        effects: { cash: -800000, crewLoyalty: -6, boardConfidence: +3 } },
    ],
    affectedRegions: null,
    icon: '⛽',
  },
  {
    id: 'PILOT_STRIKE',
    name: 'Pilot Strike Threat',
    severity: 'HIGH',
    stage: [1,2,3,4],
    teaser: 'The pilot union has issued a 72-hour strike notice. Thousands of seats in jeopardy.',
    description: 'Your pilots\' union demands a 15% wage increase and improved rest regulations. Failure to respond will ground 40% of your fleet for 2 weeks.',
    decisions: [
      { id:'A', label: 'Grant full demands',    desc:'Costly, but ends the crisis. Crew Loyalty surges.',
        effects: { cash: -5000000, crewLoyalty: +12, boardConfidence: -4 } },
      { id:'B', label: 'Negotiate partial deal',desc:'Agree to 8% raise and a task force on rest rules.',
        effects: { cash: -2500000, crewLoyalty: +5, boardConfidence: -2 } },
      { id:'C', label: 'Reject and hold firm',  desc:'Public battle. Risk strike materialising next quarter.',
        effects: { cash: 0, crewLoyalty: -15, boardConfidence: +2, pendingCrisis: 'STRIKE_MATERIALISES' } },
    ],
    affectedRegions: null,
    icon: '✊',
  },
  {
    id: 'MEDIA_SCANDAL',
    name: 'Viral Passenger Incident',
    severity: 'MEDIUM',
    stage: [1,2,3,4],
    teaser: 'A passenger removal video goes viral with 40M views. Your brand is trending — badly.',
    description: 'A flight crew removed a passenger aggressively. The clip has gone viral. Bookings are already down 12% in impacted corridors.',
    decisions: [
      { id:'A', label: 'Public CEO apology',     desc:'Personal video statement. Costly but credibility wins.',
        effects: { servicePrestige: -8, boardConfidence: +4, cash: -200000, demandMult: 1.02 } },
      { id:'B', label: 'Legal defence posture',  desc:'Let lawyers handle it. Protects cash, worsens PR.',
        effects: { servicePrestige: -15, boardConfidence: -3, cash: -800000 } },
      { id:'C', label: '$1M compensation fund',  desc:'Win back public trust with direct action.',
        effects: { servicePrestige: +6, cash: -1000000, boardConfidence: +6 } },
    ],
    affectedRegions: null,
    icon: '📱',
  },
  {
    id: 'RUNWAY_CLOSURE',
    name: 'Major Hub Runway Closure',
    severity: 'MEDIUM',
    stage: [1,2,3,4],
    teaser: 'A crack detected in runway 09L at your busiest hub. 60-day closure ordered.',
    description: 'Emergency runway maintenance closes 1 of 2 runways at your top hub for 60 days. Flight capacity must be redistributed or reduced.',
    decisions: [
      { id:'A', label: 'Reroute via secondary hub', desc:'Absorb delay and cost, but keep all routes running.',
        effects: { cash: -2000000, boardConfidence: -2, servicePrestige: -4 } },
      { id:'B', label: 'Cancel 3 routes this quarter', desc:'Decisive action reduces losses.',
        effects: { cash: -500000, boardConfidence: +2, crewLoyalty: -5 } },
      { id:'C', label: 'Charter competitor slots', desc:'Expensive but seamless for passengers.',
        effects: { cash: -3500000, servicePrestige: +6, boardConfidence: +3 } },
    ],
    affectedRegions: null,
    icon: '🛤',
  },
  {
    id: 'CURRENCY_CRISIS',
    name: 'Emerging Market Currency Crash',
    severity: 'HIGH',
    stage: [2,3,4],
    teaser: 'A key emerging market currency collapses 40%. Your revenue on 3 routes is now worth half.',
    description: 'Currency devaluation in an emerging market makes your routes there effectively unprofitable. Fleet redeployment needed urgently.',
    decisions: [
      { id:'A', label: 'Suspend affected routes',  desc:'Take the short-term revenue hit; protect balance sheet.',
        effects: { cash: -1000000, boardConfidence: -4, crewLoyalty: -4 } },
      { id:'B', label: 'Hedge currency exposure',  desc:'Expensive but stabilises future exposure.',
        effects: { cash: -3500000, boardConfidence: +4 } },
      { id:'C', label: 'Double down — buy the dip', desc:'Aggressive move: expand while competitors retreat.',
        effects: { cash: -500000, demandMult: 1.15, boardConfidence: +6, safetyShield: -3 } },
    ],
    affectedRegions: ['South America', 'Africa'],
    icon: '💱',
  },
  {
    id: 'SAFETY_INCIDENT',
    name: 'Safety Incident Report',
    severity: 'HIGH',
    stage: [1,2,3,4],
    teaser: 'Regulator flags 3 maintenance anomalies. An audit has been ordered.',
    description: 'A routine audit reveals inadequate maintenance logs for your fleet. Fines and forced groundings are possible unless corrective action is immediate.',
    decisions: [
      { id:'A', label: 'Emergency compliance blitz', desc:'Ground fleet for 3 days, fix everything.',
        effects: { cash: -4000000, safetyShield: +12, boardConfidence: +4 } },
      { id:'B', label: 'PR managed disclosure',       desc:'Disclose selectively; stay operational.',
        effects: { cash: -1500000, safetyShield: -6, servicePrestige: -8 } },
      { id:'C', label: 'Hire external safety firm',   desc:'Independent audit and certification.',
        effects: { cash: -2500000, safetyShield: +8, boardConfidence: +8 } },
    ],
    affectedRegions: null,
    icon: '⚠️',
  },
  {
    id: 'NEW_COMPETITOR',
    name: 'Aggressive New Entrant',
    severity: 'MEDIUM',
    stage: [2,3,4],
    teaser: 'A well-funded startup just launched on your 5 most profitable routes — 30% below your fares.',
    description: 'OzAir Express has entered your top corridors with deep discounting. Load factors on those routes have dropped 18% in the first month.',
    decisions: [
      { id:'A', label: 'Price match aggressively', desc:'Enter a fare war. Win the route, lose the margin.',
        effects: { cash: -2000000, demandMult: 1.10, boardConfidence: -3 } },
      { id:'B', label: 'Focus on premium tier',    desc:'Let them have economy. Win on service.',
        effects: { servicePrestige: +8, fareMult: 1.12, demandMult: 0.92 } },
      { id:'C', label: 'Lobby for slot protection',desc:'Use industry relationships to constrain their slots.',
        effects: { cash: -1000000, boardConfidence: +3, crewLoyalty: -3 } },
    ],
    affectedRegions: null,
    icon: '🥊',
  },
  {
    id: 'TYPHOON_DISRUPTION',
    name: 'Typhoon Season Disruption',
    severity: 'MEDIUM',
    stage: [1,2,3,4],
    teaser: 'Super Typhoon Riku forces closure of 4 major Asia Pacific airports for 5 days.',
    description: 'Weather grounding across SE Asia has disrupted schedules and triggered 12,000 compensation claims. Reputational and financial impact imminent.',
    decisions: [
      { id:'A', label: 'Full refund + hotel vouchers', desc:'Go above-and-beyond. Expensive, builds loyalty.',
        effects: { cash: -3000000, servicePrestige: +8, crewLoyalty: +4 } },
      { id:'B', label: 'Minimum statutory compensation', desc:'Legal minimum. Saves cash, bad PR.',
        effects: { cash: -800000, servicePrestige: -10, boardConfidence: -3 } },
      { id:'C', label: 'Rebooking priority system',    desc:'Smart logistics: prioritise high-tier passengers.',
        effects: { cash: -1500000, servicePrestige: +4, boardConfidence: +2 } },
    ],
    affectedRegions: ['Asia Pacific'],
    icon: '🌀',
  },
  {
    id: 'TECH_OUTAGE',
    name: 'Reservation System Outage',
    severity: 'HIGH',
    stage: [2,3,4],
    teaser: 'Your booking system is down. 6 hours of chaos. 22,000 passengers stranded at terminals.',
    description: 'A catastrophic server failure has taken down your entire reservation and check-in infrastructure for 6 hours during peak travel.',
    decisions: [
      { id:'A', label: 'Emergency IT response',     desc:'Pull all engineers. Costly overtime. 6hr fix.',
        effects: { cash: -4500000, boardConfidence: -5, servicePrestige: -12 } },
      { id:'B', label: 'Failover to partner system', desc:'Backup contract costs more but restores faster.',
        effects: { cash: -6000000, servicePrestige: -6, boardConfidence: +2 } },
      { id:'C', label: 'Manual processing protocol', desc:'Old-school manual boarding — slow but functional.',
        effects: { cash: -1500000, servicePrestige: -18, crewLoyalty: -8 } },
    ],
    affectedRegions: null,
    icon: '💻',
  },
  {
    id: 'PANDEMIC_SCARE',
    name: 'Outbreak Travel Warning',
    severity: 'CATASTROPHIC',
    stage: [3,4],
    teaser: 'WHO issues Level 3 advisory for a region covering 8 of your routes. Bookings collapsing.',
    description: 'A novel respiratory illness has triggered WHO Level 3 travel advisory across Asia Pacific and Middle East. Passenger bookings for affected routes down 55%.',
    decisions: [
      { id:'A', label: 'Voluntary route suspension', desc:'Suspend affected routes proactively. Safety-first optics.',
        effects: { cash: -5000000, safetyShield: +15, servicePrestige: +8, boardConfidence: +6 } },
      { id:'B', label: 'Continue with health screening',desc:'Keep routes, add medical screening protocols.',
        effects: { cash: -3000000, safetyShield: +5, demandMult: 0.65, boardConfidence: -4 } },
      { id:'C', label: 'Emergency cargo pivot',         desc:'Convert passenger cabins to cargo for affected routes.',
        effects: { cash: +2000000, safetyShield: +8, servicePrestige: -5 } },
    ],
    affectedRegions: ['Asia Pacific', 'Middle East'],
    icon: '🦠',
  },
  {
    id: 'STRIKE_MATERIALISES',
    name: 'Strike Materialises',
    severity: 'CATASTROPHIC',
    stage: [1,2,3,4],
    teaser: 'They walked out. 40% of flights grounded. Every hour costs $800K.',
    description: 'The pilot strike is now real. 40% of your fleet is grounded. Each day costs $800K in lost revenue and has cascading loyalty effects.',
    decisions: [
      { id:'A', label: 'Emergency settlement',   desc:'Concede demands plus bonus to end it fast.',
        effects: { cash: -8000000, crewLoyalty: +18, boardConfidence: -8 } },
      { id:'B', label: 'Bring in temporary crew', desc:'Contract pilots. Expensive and risky for safety.',
        effects: { cash: -6000000, safetyShield: -10, crewLoyalty: -20 } },
    ],
    affectedRegions: null,
    icon: '🚨',
    isEscalated: true,
  },
  {
    id: 'GOVERNMENT_SANCTIONS',
    name: 'Route Sanctions',
    severity: 'HIGH',
    stage: [3,4],
    teaser: 'Bilateral air agreement suspended. You have 48 hours to halt operations to 2 countries.',
    description: 'Diplomatic breakdown forces suspension of bilateral air agreement with 2 key markets. Routes must be cancelled immediately or face heavy fines.',
    decisions: [
      { id:'A', label: 'Immediate full compliance', desc:'Halt routes. Comply fully. Minimal fines.',
        effects: { cash: -1000000, boardConfidence: +6, crewLoyalty: -5 } },
      { id:'B', label: 'Lobby for exemption',       desc:'Hire lobbyists. 30% chance of success.',
        effects: { cash: -2500000, boardConfidence: 0 } },
    ],
    affectedRegions: ['Middle East', 'Europe/Asia'],
    icon: '🚫',
  },

  // ── BOSS CRISES (multi-phase, at rounds 5,10,15,20) ────────
  {
    id: 'BOSS_CRASH_SCARE',
    name: 'Stage Boss: Near-Miss Incident',
    severity: 'CATASTROPHIC',
    stage: [1],
    isBoss: true,
    triggerRound: 5,
    teaser: '⚠️ BREAKING: Two of your aircraft had a near-collision over the Atlantic. Regulators are convening an emergency session.',
    description: 'A near-collision event has rocked your airline\'s safety reputation. The regulator, your board, the media, and affected families are all demanding answers — simultaneously.',
    phases: [
      {
        phase: 1,
        title: 'Phase 1: Media Storm',
        desc: 'Breaking news cycle. How do you respond in the first 12 hours?',
        choices: [
          { id:'A1', label:'CEO live press conference', desc:'High-stakes but controls the narrative.',
            effects: { boardConfidence: +5, servicePrestige: -5, cash: -500000 } },
          { id:'B1', label:'Written statement only',    desc:'Safer but signals defensiveness.',
            effects: { boardConfidence: -2, servicePrestige: -12, cash: -100000 } },
        ]
      },
      {
        phase: 2,
        title: 'Phase 2: Regulator Hearing',
        desc: 'You must testify. Transparency vs. legal risk.',
        choices: [
          { id:'A2', label:'Full transparency + data',  desc:'Co-operate fully. Credibility +. Fine likely.',
            effects: { safetyShield: +10, cash: -5000000, boardConfidence: +8 } },
          { id:'B2', label:'Lawyer-filtered testimony', desc:'Protect liability. Credibility suffers.',
            effects: { safetyShield: -5, cash: -1000000, boardConfidence: -8 } },
        ]
      },
      {
        phase: 3,
        title: 'Phase 3: Board Vote',
        desc: 'The board wants to vote on a restructuring. Do you accept or fight?',
        choices: [
          { id:'A3', label:'Accept restructuring',     desc:'Painful but retains CEO position.',
            effects: { boardConfidence: +12, crewLoyalty: -8, cash: -2000000 } },
          { id:'B3', label:'Reject — call for vote',   desc:'Risky. Could lose the boardroom.',
            effects: { boardConfidence: -15, servicePrestige: +5, cash: 0 } },
        ]
      },
    ],
    icon: '🚨',
  },
  {
    id: 'BOSS_MERGER_THREAT',
    name: 'Stage Boss: Hostile Takeover Bid',
    severity: 'CATASTROPHIC',
    stage: [2],
    isBoss: true,
    triggerRound: 10,
    teaser: '💼 ALERT: GlobalWing Airlines has made an unsolicited $2.4B bid for your airline. Your board is divided.',
    description: 'A global airline giant has launched a hostile bid. Your board is fractured. Your crew is anxious. Your passengers don\'t know it yet — but they might soon.',
    phases: [
      {
        phase: 1,
        title: 'Phase 1: Shareholder Communication',
        desc: 'Draft the official shareholder response.',
        choices: [
          { id:'A1', label:'Reject publicly with force', desc:'Strong stance. Rallies employees.',
            effects: { boardConfidence: -5, crewLoyalty: +10, servicePrestige: +4 } },
          { id:'B1', label:'Neutral holding statement',  desc:'Buys time. No immediate effect.',
            effects: { boardConfidence: +2, crewLoyalty: -3 } },
        ]
      },
      {
        phase: 2,
        title: 'Phase 2: White Knight Option',
        desc: 'A friendly investor offers partial buyout protection.',
        choices: [
          { id:'A2', label:'Accept white knight deal',   desc:'Independence preserved, some equity lost.',
            effects: { cash: +8000000, boardConfidence: +6, crewLoyalty: +5 } },
          { id:'B2', label:'Go it alone',               desc:'Higher risk; preserve full independence.',
            effects: { cash: -2000000, boardConfidence: -4, crewLoyalty: +8 } },
        ]
      },
      {
        phase: 3,
        title: 'Phase 3: Final Board Confidence Vote',
        desc: 'Board votes on your leadership. Your accumulated Board Confidence determines outcome.',
        choices: [
          { id:'A3', label:'Address the board personally',  desc:'Last chance to lock in votes.',
            effects: { boardConfidence: +8, cash: 0 } },
          { id:'B3', label:'Let your record speak',        desc:'Risky but authentic.',
            effects: { boardConfidence: -3, crewLoyalty: +6 } },
        ]
      },
    ],
    icon: '💼',
  },
  {
    id: 'BOSS_GEOPOLITICAL',
    name: 'Stage Boss: Geopolitical Grounding',
    severity: 'CATASTROPHIC',
    stage: [3],
    isBoss: true,
    triggerRound: 15,
    teaser: '🌐 CRITICAL: War erupts across 3 of your key corridors. Airspace closed. Fleet at risk.',
    description: 'Armed conflict has closed major airspace corridors. Planes are stranded. Crew is in danger zones. The world is watching how you respond.',
    phases: [
      {
        phase: 1,
        title: 'Phase 1: Emergency Evacuation Protocol',
        desc: 'Extract crew from affected regions.',
        choices: [
          { id:'A1', label:'Charter rescue flights',     desc:'Expensive but crew returns safely.',
            effects: { cash: -6000000, crewLoyalty: +20, safetyShield: +8 } },
          { id:'B1', label:'Instruct local dispersal',   desc:'Cheaper but risky. Crew morale tanks.',
            effects: { cash: -1000000, crewLoyalty: -15, safetyShield: -5 } },
        ]
      },
      {
        phase: 2,
        title: 'Phase 2: Fleet Rerouting',
        desc: 'Reroute 40% of your network around closed airspace.',
        choices: [
          { id:'A2', label:'Aggressive rerouting',       desc:'Costly fuel overrun but routes stay active.',
            effects: { cash: -4000000, boardConfidence: +4, demandMult: 0.90 } },
          { id:'B2', label:'Temporary route suspension', desc:'Lose revenue, preserve cash and safety.',
            effects: { cash: -500000, safetyShield: +6, boardConfidence: -6 } },
        ]
      },
      {
        phase: 3,
        title: 'Phase 3: Strategic Pivot',
        desc: 'Use the crisis as a strategic reshaping moment.',
        choices: [
          { id:'A3', label:'Enter new neutral corridor',  desc:'Open 2 non-conflicted routes.',
            effects: { cash: -3000000, demandMult: 1.12, boardConfidence: +8 } },
          { id:'B3', label:'Deep cost-cutting mode',      desc:'Preserve cash for post-crisis recovery.',
            effects: { cash: +5000000, boardConfidence: -5, servicePrestige: -8 } },
        ]
      },
    ],
    icon: '🌐',
  },
  {
    id: 'BOSS_LEGACY_VERDICT',
    name: 'Stage Boss: The Legacy Verdict',
    severity: 'CATASTROPHIC',
    stage: [4],
    isBoss: true,
    triggerRound: 20,
    teaser: '🏆 THE FINAL AUDIT: Your 5-year tenure as CEO ends today. The board, the press, and the industry are watching.',
    description: 'Five years of leadership come down to this moment. Every decision you\'ve made is being weighed. Your legacy — and the airline\'s future — is being decided.',
    phases: [
      {
        phase: 1,
        title: 'The Final Board Presentation',
        desc: 'Deliver your legacy statement to the board.',
        choices: [
          { id:'A1', label:'Lead with passenger outcomes',  desc:'Frame everything around service excellence.',
            effects: { servicePrestige: +10, boardConfidence: +6 } },
          { id:'B1', label:'Lead with financial results',   desc:'Pure shareholder-value framing.',
            effects: { boardConfidence: +12, servicePrestige: -4, crewLoyalty: -5 } },
        ]
      },
      {
        phase: 2,
        title: 'The Media Legacy Interview',
        desc: 'High-profile interview: your defining moment in the public eye.',
        choices: [
          { id:'A2', label:'Candid & reflective',           desc:'Honest about mistakes. Humanising.',
            effects: { servicePrestige: +12, safetyShield: +5 } },
          { id:'B2', label:'Victory lap tone',              desc:'Confident, but risks appearing arrogant.',
            effects: { boardConfidence: +6, crewLoyalty: -8 } },
        ]
      },
      {
        phase: 3,
        title: 'The Succession Decision',
        desc: 'Name your successor. This shapes your legacy and the airline\'s direction.',
        choices: [
          { id:'A3', label:'Promote from within',           desc:'Loyalty-first. Strong continuity signal.',
            effects: { crewLoyalty: +15, boardConfidence: +5 } },
          { id:'B3', label:'Hire external disruptor',       desc:'Bold move. Board respects it.',
            effects: { boardConfidence: +10, crewLoyalty: -10 } },
        ]
      },
    ],
    icon: '🏆',
  },

  // ── SKYFORCE BOARD DECISION SCENARIOS (S1-S18) ───────────────
  // Fixed-round scheduled events. isScheduledEvent: true means they override
  // the random crisis roll at their specific triggerRound.
  // Cash scaled to ~1/8 of SkyForce values (our airline starts at $50M vs their $500M).
  // Brand/Ops Pts map directly to servicePrestige / safetyShield / crewLoyalty (0-100).

  {
    id: 'SF_GHOST_FLEET',
    name: '"Ghost Fleet" — Safety vs. Survival',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 4,
    stage: [1,2,3,4],
    teaser: '⚙️ Your Head of Maintenance flags irregular nav-system readings in 38% of your fleet. The regulator doesn\'t know — yet.',
    description: 'Routine checks found electronic issues in navigation systems across 38% of your fleet. Grounding costs ~$7M this quarter. The aviation regulator hasn\'t been informed. You have 30 minutes before the board meeting.',
    icon: '⚙️',
    decisions: [
      { id:'A', label:'Self-report to regulator immediately',
        desc:'Ground 40% of fleet now. Transparent, expensive — but earns permanent regulatory trust and a "Trusted Operator" status.',
        effects: { cash:-7_000_000, servicePrestige:+15, safetyShield:+10, boardConfidence:-3, cascadeCard:'TRUSTED_OPERATOR' } },
      { id:'B', label:'Run internal review first — delay 2 rounds',
        desc:'Revenue protected short-term. 35-50% regulator discovery risk: fines + forced grounding + cover-up narrative.',
        effects: { cash:-1_500_000, servicePrestige:-5, safetyShield:-3, pendingCrisis:'SAFETY_INCIDENT' } },
      { id:'C', label:'Continue flying — monitor internally',
        desc:'No immediate cost. 30% chance of serious incident next quarter: massive fines, criminal liability, catastrophic brand damage.',
        effects: { cash:0, safetyShield:-10, servicePrestige:-3, cascadeCard:'AGING_OPERATIONS' } },
      { id:'D', label:'Quietly ground only the flagged routes',
        desc:'Saves $5M vs full report. 40% chance of media leak — forcing full grounding anyway plus -15 Brand Pts for the delay.',
        effects: { cash:-2_500_000, servicePrestige:-5, safetyShield:-5, boardConfidence:-2 } },
    ],
  },

  {
    id: 'SF_WAR_CORRIDOR',
    name: '"War in the Corridor" — No-Fly Zone Emergency',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 8,
    stage: [1,2,3,4],
    teaser: '🌐 Armed conflict has broken out under your 3rd most profitable international route. Three other airlines have already rerouted quietly.',
    description: 'Conflict is active under a corridor generating $4.5M/quarter. It\'s not an official no-fly zone yet. Your flights cross it twice daily. Competitors have rerouted. You have 30 minutes before the next departure cycle.',
    icon: '🌐',
    decisions: [
      { id:'A', label:'Reroute all flights immediately',
        desc:'Additional fuel cost $900K/year. Delays and missed connections. Safe — route retained.',
        effects: { cash:-900_000, servicePrestige:+8, safetyShield:-5, boardConfidence:+3 } },
      { id:'B', label:'Continue flying — not an official no-fly zone',
        desc:'No immediate cost. 25% chance of airspace closure next quarter: emergency diversions, -$3M, -20 Brand Pts.',
        effects: { cash:0, servicePrestige:-5, pendingCrisis:'GOVERNMENT_SANCTIONS' } },
      { id:'C', label:'Suspend the route entirely',
        desc:'$4.5M/quarter revenue at risk. Competitor claims your landing slots permanently.',
        effects: { cash:-1_500_000, servicePrestige:+10, safetyShield:-10, boardConfidence:-4 } },
      { id:'D', label:'Continue + purchase war-risk insurance ($400K)',
        desc:'Financial protection if incident occurs. Media risk: "airline insures against war deaths to protect profits."',
        effects: { cash:-400_000, servicePrestige:-8, boardConfidence:-2 } },
    ],
  },

  {
    id: 'SF_FLASH_DEAL',
    name: '"The Flash Deal" — Fleet Procurement Window',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 13,
    stage: [1,2,3,4],
    teaser: '✈️ A manufacturer rep arrives with 20 fuel-efficient planes at 18% discount — first-come-first-served. You have 30 minutes.',
    description: 'A senior aircraft manufacturer representative offers 20 brand-new, fuel-efficient planes at 18% discount. Each saves $85K/year in fuel. 20% deposit required immediately. This decision falls at interest-rate peak (6.5%). Teams with cash reserves have a decisive advantage.',
    icon: '✈️',
    decisions: [
      { id:'A', label:'Order maximum — up to 10 planes',
        desc:'Deposit $2M per plane. Annual fuel saving $85K per plane. If ≥5 planes: "Modern Fleet" card unlocked.',
        effects: { cash:-10_000_000, safetyShield:+8, crewLoyalty:+3, cascadeCard:'MODERN_FLEET' } },
      { id:'B', label:'Request 15-minute extension to review numbers',
        desc:'50% the rep agrees. 50% offer closed, treated as Decline. Other teams may commit while you deliberate.',
        effects: { cash:-5_000_000, safetyShield:+4, boardConfidence:+3 } },
      { id:'C', label:'Decline the offer',
        desc:'No cash risk. Aging fleet continues with rising maintenance. If other teams took all planes, offer never returns.',
        effects: { cash:0, safetyShield:-8, cascadeCard:'AGING_OPERATIONS' } },
      { id:'D', label:'Partial order — 3 to 5 planes only',
        desc:'Deposit $2M per plane. Lower commitment, moderate fuel saving. Subject to remaining inventory.',
        effects: { cash:-6_000_000, safetyShield:+4, boardConfidence:+2 } },
    ],
  },

  {
    id: 'SF_OIL_GAMBLE',
    name: '"The Oil Gamble" — Lock In or Wait It Out?',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 3,
    stage: [1,2,3,4],
    teaser: '⛽ Jet fuel is up 40% in 6 weeks. Your team can lock in today\'s elevated price for 12 months — or ride the market.',
    description: 'Middle East tensions pushed jet fuel +40%. Your procurement team can lock in today\'s elevated price for 12 months. If prices fall (OPEC supply decision expected next quarter), you overpay for a full year. Market could go either way.',
    icon: '⛽',
    decisions: [
      { id:'A', label:'Lock in a full 12-month contract at today\'s price',
        desc:'Cost certainty. If prices fall next quarter: you overpay by $3M vs market. If they rise further: you win.',
        effects: { cash:-1_500_000, safetyShield:+5, fuelMult:1.0 } },
      { id:'B', label:'Lock in a 6-month contract only',
        desc:'Partial hedge. Revisit in Q5. Less exposure, less protection. Manageable middle ground.',
        effects: { cash:-800_000, boardConfidence:+2 } },
      { id:'C', label:'Buy on the open market — no contract',
        desc:'Maximum flexibility, maximum volatility. If prices stay high or rise further: operating costs spiral.',
        effects: { cash:-200_000, safetyShield:-5, fuelPriceMultiplier:1.15 } },
      { id:'D', label:'50/50 split — half locked, half open market',
        desc:'"Structured Risk" hedge. +3 Ops Pts if your team articulates a deliberate framework for the split.',
        effects: { cash:-700_000, safetyShield:+3, boardConfidence:+3 } },
    ],
  },

  {
    id: 'SF_GOVERNMENT_LIFELINE',
    name: '"The Government Lifeline" — Bailout or Independence?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 6,
    stage: [1,2,3,4],
    teaser: '🏛️ Your airline needs emergency capital. The government offers $15M — but wants board seats and route obligations.',
    description: 'Emergency capital is needed or your credit rating will downgrade. Government offers $15M (next quarter) but wants 3 board seats, 6 loss-making regional routes (-$1M/yr), and a 2-round redundancy freeze. Private markets offer $10M at the same rate — arriving in 2 quarters.',
    icon: '🏛️',
    decisions: [
      { id:'A', label:'Accept the government deal as offered',
        desc:'+$15M next quarter. Three board seats, regional route obligation -$1M/yr, redundancy freeze 2 rounds. "Gov Board Card" issued — blocks aggressive labour options in S13/S15.',
        effects: { cash:+15_000_000, servicePrestige:+5, boardConfidence:-5, crewLoyalty:-3, cascadeCard:'GOVERNMENT_BOARD_CARD' } },
      { id:'B', label:'Negotiate — push for fewer constraints',
        desc:'Target: 1 board seat, softer obligations. 30% chance government walks away (must choose C or D immediately).',
        effects: { cash:+12_000_000, servicePrestige:+3, boardConfidence:-3 } },
      { id:'C', label:'Private capital — $10M, same rate, 2 quarters',
        desc:'$5M less. Full strategic independence. Bridge financing needed this quarter: -$400K one-time cost.',
        effects: { cash:+9_600_000, boardConfidence:+4, crewLoyalty:+2 } },
      { id:'D', label:'Emergency asset sale — divest cargo operations',
        desc:'Raises $9M immediately, no new debt. Permanently loses $1.5M/quarter in cargo revenue. No cascade strings attached.',
        effects: { cash:+9_000_000, crewLoyalty:-5, boardConfidence:-2, cascadeCard:'CARGO_DIVESTED' } },
    ],
  },

  {
    id: 'SF_RATE_WINDOW',
    name: '"The Rate Window" — Refinance Now or Hold?',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 10,
    stage: [1,2,3,4],
    teaser: '💳 Your bank offers to consolidate all loans at 4.0% — but breaking existing loans costs a fee. Rates will peak at 6.5% in 3 quarters.',
    description: 'At Q10 your bank offers to refinance all outstanding loans at 4.0%. Breaking existing loans triggers a 3.5% break fee. Teams with higher-rate debt save significantly. Teams with lower existing rates may not break even before game end.',
    icon: '💳',
    decisions: [
      { id:'A', label:'Refinance all debt at 4.0%',
        desc:'Pay 3.5% break fee today. Lock in lower rate for the rest of the game. Best for teams with high-rate debt.',
        effects: { cash:-2_000_000, boardConfidence:+8, safetyShield:+3 } },
      { id:'B', label:'Decline — bet that rates will drop further',
        desc:'No cost today. If rates rise to 6.5% in Q13 (they will), interest burden rises significantly.',
        effects: { cash:0, safetyShield:-5, boardConfidence:-3 } },
      { id:'C', label:'Refinance 50% of debt only',
        desc:'Half the fee, half the saving. Manageable for cash-strained teams. Safe middle ground.',
        effects: { cash:-1_000_000, boardConfidence:+3 } },
      { id:'D', label:'Seek a competing offer from another bank',
        desc:'May yield better rate (3.5% instead of 4.0%). 40% chance original offer expires while shopping.',
        effects: { cash:-500_000, boardConfidence:+5, safetyShield:+2 } },
    ],
  },

  {
    id: 'SF_HUNGRY_NEIGHBOUR',
    name: '"The Hungry Neighbour" — Acquire or Compete?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 9,
    stage: [1,2,3,4],
    teaser: '🤝 Your main regional competitor is quietly for sale. 3 profitable routes, 22 aircraft, $180M in debt. Asking price: $8M.',
    description: 'Your main regional competitor (40% your size) is in financial trouble. They operate 3 profitable routes you don\'t serve, have a loyal customer base and 22 aircraft. They also carry significant debt, aging planes, and tanked staff morale.',
    icon: '🤝',
    decisions: [
      { id:'A', label:'Full acquisition — buy the entire airline ($8M)',
        desc:'Gain 3 routes, loyal customers, fleet. Inherit debt, integration headaches, culture clash for 2 rounds.',
        effects: { cash:-8_000_000, servicePrestige:+10, safetyShield:-10, crewLoyalty:-8, boardConfidence:+4 } },
      { id:'B', label:'Buy only their routes and landing slots ($3M)',
        desc:'Cleaner. Get commercial assets without operational burden. Staff redundancy story hits brand.',
        effects: { cash:-3_000_000, servicePrestige:+5, safetyShield:-5, boardConfidence:+3 } },
      { id:'C', label:'Let them collapse — buy assets at liquidation',
        desc:'Wait 1-2 rounds. 60% chance a rival acquires them first, locking those routes away permanently.',
        effects: { cash:-500_000, servicePrestige:-5, boardConfidence:-3 } },
      { id:'D', label:'Propose a codeshare partnership ($750K/yr)',
        desc:'No ownership. Immediate revenue. Reversible. 30% chance partner acquired by rival in 2 rounds.',
        effects: { cash:-750_000, servicePrestige:+3, safetyShield:+5, boardConfidence:+2 } },
    ],
  },

  {
    id: 'SF_POLITICAL_FAVOUR',
    name: '"The Political Favour" — Serve or Resist?',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 11,
    stage: [1,2,3,4],
    teaser: '🏛️ The Minister of Transport "requests" you open 6 loss-making regional routes — in return for 10-year permit certainty and hub slot priority.',
    description: 'Opening 6 routes loses $2.5M/yr but earns $1.8M/yr in advantages from permit fast-tracking, 10-year renewal, and hub slot priority. Net: -$700K/yr but enormous long-term strategic value.',
    icon: '🏛️',
    decisions: [
      { id:'A', label:'Accept all 6 routes',
        desc:'Net -$700K/year. 10-year permit certainty. Full government goodwill. Hub slots secured permanently.',
        effects: { cash:-700_000, servicePrestige:+15, safetyShield:-8, boardConfidence:+5 } },
      { id:'B', label:'Negotiate — accept 3 routes only',
        desc:'Net -$300K/year. Partial benefits. Government may or may not accept the compromise.',
        effects: { cash:-300_000, servicePrestige:+8, safetyShield:-4, boardConfidence:+3 } },
      { id:'C', label:'Decline diplomatically',
        desc:'Save $2.5M/yr. Risk: permits face review, hub slot priority goes to competitor. "Permit Review" event triggered.',
        effects: { cash:0, servicePrestige:-10, safetyShield:+5, boardConfidence:-5, pendingCrisis:'GOVERNMENT_SANCTIONS' } },
      { id:'D', label:'Accept routes but push for a government subsidy per passenger',
        desc:'Bold: "We\'ll fly these routes if you co-fund the losses." 40% government agrees. 60% rejected — goodwill damaged.',
        effects: { cash:500_000, servicePrestige:+12, safetyShield:+5, boardConfidence:+4 } },
    ],
  },

  {
    id: 'SF_BLUE_OCEAN',
    name: '"The Blue Ocean" — Expand or Consolidate?',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 16,
    stage: [1,2,3,4],
    teaser: '🗺️ Two growth opportunities land simultaneously: Southeast Asia expansion ($4.5M) or deepening existing markets ($2M).',
    description: 'Southeast Asia is high-growth but unproven — setup $4.5M, profitable in 3 rounds. Deepening existing markets costs $2M, profitable within 2 rounds. You can fully fund one. Splitting risks underfunding both.',
    icon: '🗺️',
    decisions: [
      { id:'A', label:'Enter Southeast Asia aggressively ($4.5M)',
        desc:'High risk, high ceiling. 3 rounds to profitability. First-mover advantage if successful. "First Mover" card earned.',
        effects: { cash:-4_500_000, servicePrestige:+12, safetyShield:-5, boardConfidence:+6, cascadeCard:'FIRST_MOVER' } },
      { id:'B', label:'Deepen existing markets ($2M)',
        desc:'Lower risk, faster returns. Solidifies current position. Competitor may take the new market instead.',
        effects: { cash:-2_000_000, servicePrestige:+5, boardConfidence:+4, crewLoyalty:+3 } },
      { id:'C', label:'Split resources — $3M across both',
        desc:'"Distracted Airline" risk: neither strategy achieves full potential. -5 Ops for 2 rounds.',
        effects: { cash:-3_000_000, servicePrestige:+3, safetyShield:-5, boardConfidence:+2 } },
      { id:'D', label:'Neither — return capital to shareholders as dividend',
        desc:'Short-term board boost. No growth path. Analysts will question long-term vision publicly.',
        effects: { cash:0, servicePrestige:-5, boardConfidence:+10, crewLoyalty:-5 } },
    ],
  },

  {
    id: 'SF_WORLD_CUP_BET',
    name: '"The World Cup Bet" — Sponsorship Opportunity',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 2,
    stage: [1,2,3,4],
    teaser: '⚽ FIFA approaches your airline for "Official Regional Partner" of the next World Cup. Only one airline wins.',
    description: 'FIFA has offered one airline "Official Regional Airline Partner" of the next World Cup: logo across all host city airports, co-branding on team travel, preferred carrier for VIPs. Huge brand visibility. Only one airline wins — you\'re bidding competitively.',
    icon: '⚽',
    decisions: [
      { id:'A', label:'Commit maximum sponsorship bid ($4M)',
        desc:'Highest chance to win. If you win: "Global Brand" card, +$3M demand boost this quarter, +25 Brand Pts. If you lose: $0 cost (only winner pays).',
        effects: { cash:-4_000_000, servicePrestige:+25, demandMult:1.08, cascadeCard:'GLOBAL_BRAND' } },
      { id:'B', label:'Bid at mid-tier ($2M)',
        desc:'Balanced risk. Moderate win chance. If you win at $2M, you may be outbid by a competitor willing to pay more.',
        effects: { cash:-2_000_000, servicePrestige:+12, boardConfidence:+3 } },
      { id:'C', label:'Decline sponsorship — invest in performance marketing instead',
        desc:'$2M in measurable, targeted advertising. Higher direct return per dollar. No World Cup halo.',
        effects: { cash:-2_000_000, servicePrestige:+8, boardConfidence:+4, crewLoyalty:+4 } },
      { id:'D', label:'Run ambush marketing during the tournament ($750K)',
        desc:'Near-event activation without official partnership. 20% chance of FIFA legal action: -$500K + -15 Brand Pts.',
        effects: { cash:-750_000, servicePrestige:+8, boardConfidence:-2 } },
    ],
  },

  {
    id: 'SF_OLYMPIC_PLAY',
    name: '"The Olympic Play" — Prestige, Performance, or Pass?',
    severity: 'MEDIUM',
    isScheduledEvent: true,
    triggerRound: 7,
    stage: [1,2,3,4],
    teaser: '🏅 The IOC offers your airline "Official Carrier" status for the next Summer Olympics. Your CMO says yes. Your CFO says no.',
    description: 'Official Carrier status: your logo on aircraft alongside the Olympic rings, 3.5 billion viewers over 4 years, staff pride. No direct revenue guarantee. The host city is on one of your major routes.',
    icon: '🏅',
    decisions: [
      { id:'A', label:'Accept Official Carrier status ($3.5M over 4yr)',
        desc:'Long-term brand elevation. Staff morale boost. "Premium Airline" positioning. No direct revenue guarantee.',
        effects: { cash:-3_500_000, servicePrestige:+20, crewLoyalty:+10, boardConfidence:+5, customerLoyalty:+8 } },
      { id:'B', label:'Decline — invest $3.5M in performance marketing instead',
        desc:'Measurable, trackable ROI. Higher direct conversions. Less prestige. +$2.8M measurable revenue over 4yr.',
        effects: { cash:-3_500_000, servicePrestige:+10, boardConfidence:+6, customerLoyalty:+4 } },
      { id:'C', label:'Local-only activation ($1.8M)',
        desc:'Olympic logo rights, all activation focused on home market. Half the global reach for half the cost.',
        effects: { cash:-1_800_000, servicePrestige:+12, boardConfidence:+3, customerLoyalty:+3 } },
      { id:'D', label:'Sponsor a specific sport or national team ($900K)',
        desc:'Niche, authentic, potentially viral. 40% chance of a gold medal moment (+20 Brand). 60% underwhelming (+5 Brand).',
        effects: { cash:-900_000, servicePrestige:+8, boardConfidence:+2, customerLoyalty:+2 } },
      { id:'E', label:'Do nothing — allocate zero to this cycle',
        desc:'Capital retained. Competitors who invest gain brand separation. CFO dreams of this. CMO considers it defeat.',
        effects: { cash:0, servicePrestige:-8, boardConfidence:+8, customerLoyalty:-3 } },
    ],
  },

  {
    id: 'SF_BRAND_GRENADE',
    name: '"The Brand Grenade" — Ambassador Crisis',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 18,
    stage: [1,2,3,4],
    teaser: '📱 Your brand ambassador was secretly filmed joking about a real service failure on your airline. 6M views in 90 minutes. #NeverFlyingAgain trends.',
    description: 'Your celebrity brand ambassador made an accurate, funny joke about a real service failure at a private dinner. Someone filmed it. 6.1M views. Your logo is on their official profile. 14,000 passengers are sharing their own version of the same story. The worst part — they\'re not wrong.',
    icon: '📱',
    decisions: [
      { id:'A', label:'Terminate ambassador contract immediately ($500K exit fee)',
        desc:'"This is inconsistent with our brand values." The internet\'s response: "They fired someone for telling the truth." Ambassador\'s 32M followers notified.',
        effects: { cash:-500_000, servicePrestige:-15, boardConfidence:-3, customerLoyalty:-12 } },
      { id:'B', label:'Join the joke — post content owning it ($150K production)',
        desc:'CMO walks into the video scene: "We heard you. You\'re not wrong. Here\'s what we\'re doing." High risk, high reward. Best with high loyalty.',
        effects: { cash:-150_000, servicePrestige:+20, boardConfidence:+5, customerLoyalty:+8 } },
      { id:'C', label:'Issue formal customer apology — address service failures',
        desc:'Take accountability for the underlying problem. Say nothing about the ambassador. "Accountable Brand" signal.',
        effects: { cash:0, servicePrestige:+10, crewLoyalty:+5, customerLoyalty:+6 } },
      { id:'D', label:'Co-create a "We\'re Fixing It" redemption arc ($400K + 2 rounds)',
        desc:'Ambassador documents your visible improvements. Delayed payoff. Highest long-term brand outcome if improvements are real.',
        effects: { cash:-400_000, servicePrestige:+8, boardConfidence:+3, customerLoyalty:+12 } },
      { id:'E', label:'Say absolutely nothing — wait for the news cycle',
        desc:'70% of the time it fades. 30% a journalist runs "Airline silent as ambassador exposes failures" for 3 days.',
        effects: { cash:0, servicePrestige:-12, boardConfidence:-5, customerLoyalty:-5 } },
    ],
  },

  {
    id: 'SF_DIGITAL_GAMBLE',
    name: '"The Digital Gamble" — Automate or Stay Human?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 15,
    stage: [1,2,3,4],
    teaser: '🤖 Your CTO presents an AI platform that automates 1,800 jobs and saves $4.8M/year. Your airline is the largest private employer in the region.',
    description: 'An AI platform automates check-in, baggage, and customer service roles. Implementation costs $1.25M, saves $4.8M/yr. Deployment takes 2 rounds. Union has been briefed. Note: teams holding Gov Board Card (S5-A/B) cannot choose Option A.',
    icon: '🤖',
    decisions: [
      { id:'A', label:'Full rollout — implement now, make 1,800 redundant',
        desc:'Cost $1.25M. Saves $4.8M/yr from Round 17. 30% strike risk per round during transition. Blocked if Gov Board Card held.',
        effects: { cash:-1_250_000, servicePrestige:-10, crewLoyalty:-15, boardConfidence:+5, safetyShield:-3 } },
      { id:'B', label:'Phase over 3 rounds — natural attrition prioritised',
        desc:'Slower savings. 10% strike risk per round. Staff uncertainty prolonged but morale less hostile.',
        effects: { cash:-1_250_000, servicePrestige:-3, crewLoyalty:-6, boardConfidence:+3 } },
      { id:'C', label:'Reskill and redeploy all affected staff into new roles',
        desc:'Total investment $3.25M. Zero strike risk. "People-First" card earned. Full savings from Round 18.',
        effects: { cash:-3_250_000, servicePrestige:+15, crewLoyalty:+20, boardConfidence:+4, cascadeCard:'PEOPLE_FIRST' } },
      { id:'D', label:'Cancel the platform',
        desc:'$1.25M sunk if committed. Zero strike risk. Competitor gains a permanent $4.8M/yr cost advantage. "Aging Operations" activated.',
        effects: { cash:-1_250_000, servicePrestige:+5, crewLoyalty:+8, boardConfidence:-4, cascadeCard:'AGING_OPERATIONS' } },
    ],
  },

  {
    id: 'SF_TALENT_HEIST',
    name: '"The Talent Heist" — Counter-Offer or Let Them Go?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 12,
    stage: [1,2,3,4],
    teaser: '👥 Your Head of Revenue, Head of Ops, and Head of Digital have all been approached by a competitor. They haven\'t resigned — yet.',
    description: 'Three of your key executives have been discreetly approached. You have 30 minutes to respond. You can counter-offer — but you don\'t know what the competitor is paying, and you must decide without full information.',
    icon: '👥',
    decisions: [
      { id:'A', label:'Match any offer — blank cheque protection',
        desc:'Full protection. Cost unknown until competitor\'s offer is revealed. If competitor bid is high, very expensive.',
        effects: { cash:-3_000_000, crewLoyalty:+12, boardConfidence:+3 } },
      { id:'B', label:'Counter-offer up to 20% salary increase cap',
        desc:'Controlled cost. Protects against lower competitor bids. May not be enough if competitor bid high.',
        effects: { cash:-1_500_000, crewLoyalty:+6, boardConfidence:+2 } },
      { id:'C', label:'Decline to counter — promote internal successors',
        desc:'Zero additional cost. Executives at risk if competitor is aggressive. Internal promotion signal: morale +5.',
        effects: { cash:0, crewLoyalty:+5, servicePrestige:+3, boardConfidence:-2 } },
      { id:'D', label:'Counter-offer + fast-track a succession plan',
        desc:'Best governance posture. Retains talent AND builds depth. Full counter-offer cost plus time investment.',
        effects: { cash:-2_000_000, crewLoyalty:+15, boardConfidence:+8, servicePrestige:+5 } },
    ],
  },

  {
    id: 'SF_RECESSION_GAMBLE',
    name: '"The Recession Gamble" — Cut Now or Trust the Market?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 14,
    stage: [1,2,3,4],
    teaser: '📉 Leading economists agree: recession is coming. 25-30% demand drop for 4 quarters. Your CFO says cut 30% of staff now. Your CHRO disagrees.',
    description: 'A significant recession is forecast. Your CFO says cutting 30% of workforce saves $6M/year. Your CHRO argues historical patterns show airlines that cut aggressively can\'t rehire fast enough when demand recovers earlier than predicted. Note: Gov Board Card holders cannot choose Option A.',
    icon: '📉',
    decisions: [
      { id:'A', label:'Mass redundancies — cut 30% of workforce now',
        desc:'Saves $6M/yr. 4,500 jobs eliminated. Financially defensible if recession lasts 4 quarters as predicted. Blocked if Gov Board Card held.',
        effects: { cash:+2_000_000, crewLoyalty:-20, servicePrestige:-20, boardConfidence:+6, customerLoyalty:-10 } },
      { id:'B', label:'Temporary measures — pay cuts, reduced hours, voluntary leave',
        desc:'Saves $3M/yr. All staff retained. Morale recoverable. Best total financial outcome across the game arc.',
        effects: { cash:+1_000_000, crewLoyalty:-5, servicePrestige:-5, boardConfidence:+3 } },
      { id:'C', label:'Hold headcount — cut costs elsewhere (routes, marketing)',
        desc:'All staff retained. "Trusted Employer" card. Fully ready for demand recovery from day one.',
        effects: { cash:+500_000, crewLoyalty:+5, servicePrestige:+10, boardConfidence:-2, cascadeCard:'TRUSTED_OPERATOR' } },
      { id:'D', label:'Invest counter-cyclically — hire cheap talent, acquire at recession prices',
        desc:'Burn cash now, emerge stronger if recovery arrives. Highest risk, highest competitive potential.',
        effects: { cash:-2_000_000, crewLoyalty:+15, servicePrestige:+15, boardConfidence:+4, cascadeCard:'FIRST_MOVER' } },
    ],
  },

  {
    id: 'SF_MOSCOW_SIGNAL',
    name: '"The Moscow Signal" — Pandemic or Panic?',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 5,
    stage: [1,2,3,4],
    teaser: '🦠 A fast-spreading respiratory illness is detected in 14 countries via business travel. Summer season — your highest-revenue quarter — starts next round.',
    description: 'Novel respiratory illness spreading via business travel networks. WHO Observation Level 2 alert. Media projects worst-case scenarios. Two of your crew who worked Moscow routes report flu-like symptoms. Summer season starts next round. You have 30 minutes.',
    icon: '🦠',
    decisions: [
      { id:'A', label:'Aggressive response — suspend Russian and Eastern European routes',
        desc:'Suspends 10 routes, reduces crew 20%. Saves $1.4M/quarter. If illness proves minor (50% chance): misses full summer surge.',
        effects: { cash:+1_400_000, servicePrestige:-5, safetyShield:+8, crewLoyalty:-8, boardConfidence:+3 } },
      { id:'B', label:'Moderate response — reduce frequency 40% on affected routes',
        desc:'Reduces capacity on risk routes. No redundancies. Saves $700K/quarter. Recoverable if illness proves minor.',
        effects: { cash:+700_000, servicePrestige:-3, safetyShield:+5, crewLoyalty:-3, boardConfidence:+2 } },
      { id:'C', label:'Minimal response — enhanced health screening only ($75K)',
        desc:'All routes continue normally. Enhanced boarding protocols. No lock-in. Best positioned if illness proves minor.',
        effects: { cash:-75_000, servicePrestige:+5, safetyShield:+3, boardConfidence:+2 } },
      { id:'D', label:'Counter-position — increase marketing, claim vacated routes',
        desc:'"The airline still flying when others ran." Maximum reward if illness fizzles. Maximum damage if it doesn\'t.',
        effects: { cash:-400_000, servicePrestige:+15, demandMult:1.08, boardConfidence:+4, customerLoyalty:+5 } },
    ],
  },

  {
    id: 'SF_GREEN_ULTIMATUM',
    name: '"The Green Ultimatum" — Carbon Tax Response',
    severity: 'HIGH',
    isScheduledEvent: true,
    triggerRound: 17,
    stage: [1,2,3,4],
    teaser: '🌿 Government announces a carbon levy on aviation: $45/tonne CO₂. Adds $2.8M to your annual operating costs starting next quarter.',
    description: 'New carbon levy adds $2.8M/year immediately. No appeal period. All competitors face the same charge. How you respond operationally and publicly defines your environmental brand position — permanently.',
    icon: '🌿',
    decisions: [
      { id:'A', label:'Absorb the cost — do not raise fares',
        desc:'$2.8M annual hit. Brand signal: "we absorb the cost of doing right." Competitive advantage if rivals raise prices.',
        effects: { cash:-2_800_000, servicePrestige:+10, customerLoyalty:+8, boardConfidence:+3 } },
      { id:'B', label:'Pass to passengers — add carbon surcharge to all tickets',
        desc:'Revenue neutral. Passengers bear the cost. Risk: "profiteering on green policy" story if competitor absorbs instead.',
        effects: { cash:0, servicePrestige:-8, boardConfidence:+2 } },
      { id:'C', label:'Invest $4M in Sustainable Aviation Fuel (SAF) technology',
        desc:'Reduces carbon liability 40% within 2 rounds. "Green Leader" card earned. Significant upfront cash requirement.',
        effects: { cash:-4_000_000, servicePrestige:+20, safetyShield:+8, boardConfidence:+5, cascadeCard:'GREEN_LEADER' } },
      { id:'D', label:'Challenge the policy legally and publicly',
        desc:'Zero cost for 2 rounds. 30% success (tax delayed). 70% failure: full tax + -$400K legal + permanent "Anti-Environment" flag.',
        effects: { cash:-400_000, servicePrestige:-15, boardConfidence:-4, customerLoyalty:-8, cascadeCard:'ANTI_ENVIRONMENT' } },
    ],
  },

  {
    id: 'SF_CHOCOLATE_CRISIS',
    name: '"The Chocolate Crisis" — Supply Chain Disruption',
    severity: 'LOW',
    isScheduledEvent: true,
    triggerRound: 9,
    stage: [1,2,3,4],
    teaser: '🍫 The "Dubai Chocolate" trend has spiked cocoa prices 35%. Your in-flight chocolate supplier is calling. Your passengers rate it as one of your most memorable service touches.',
    description: 'Viral cocoa price spike means your signature cabin chocolate now costs 35% more. Your supplier will continue at +35% cost — or not at all. 55% of passengers mention it in post-flight surveys. Food bloggers have already posted about your chocolate 11,000 times.',
    icon: '🍫',
    decisions: [
      { id:'A', label:'Pay the premium — retain same chocolate (+35% sourcing cost, ~$210K/yr)',
        desc:'Passengers notice nothing. Loyalty preserved. CFO winces. CMO is relieved.',
        effects: { cash:-210_000, servicePrestige:+3, customerLoyalty:+2 } },
      { id:'B', label:'Drop the chocolate entirely — remove from service',
        desc:'Saves $600K/yr. Those 55% who specifically remember it will write about its absence. Post-flight scores drop.',
        effects: { cash:0, servicePrestige:-10, customerLoyalty:-8, crewLoyalty:-3 } },
      { id:'C', label:'Source from a new supplier — similar quality, no extra cost',
        desc:'No financial hit. Regulars will notice it\'s different. A vocal minority will post about it.',
        effects: { cash:0, servicePrestige:-5, customerLoyalty:-3 } },
      { id:'D', label:'Premium rebrand — source single-origin reserve (+$300K/yr)',
        desc:'Serve as curated cabin experience with story card. 70% lands authentically → +8 Brand. 30% feels like spin → -6 Brand.',
        effects: { cash:-300_000, servicePrestige:+8, customerLoyalty:+5, boardConfidence:+3 } },
    ],
  },

  // ── RUNWAY AIRSPACE CLOSURE — Special crisis (event-triggered) ──
  {
    id: 'RUNWAY_AIRSPACE_CLOSURE',
    name: 'Runway — Airspace Closure Crisis',
    severity: 'CATASTROPHIC',
    stage: [1,2,3,4],
    isBoss: true,
    isRunwayCrisis: true,        // ← special flag for risk-calculator UI
    triggerRound: null,          // ← not a fixed-round boss; event-triggered
    teaser: '🛫 ATC: "All departures suspended by government decree." Your aircraft is on the runway, engines running, 180 passengers aboard.',
    description: 'A sudden airspace closure has frozen all departures. Your aircraft sits at the runway threshold. Every decision you make in the next 3 minutes will define how your airline is remembered — by regulators, crew, and 180 very upset passengers.',
    phases: [
      {
        phase: 1,
        title: 'Phase 1 — Runway Operational Decision',
        desc: 'You have 90 seconds before ATC demands an answer. Your risk assessment:',
        isRunwayPhase: true,     // ← triggers the risk-calculator UI overlay
        choices: [
          {
            id: 'TAKE_OFF',
            label: 'Authorize Takeoff — Violate the NOTAM',
            risk: 'CRITICAL',
            desc: 'ATC will flag you immediately. $8M fine, possible license suspension, criminal liability exposure. The flight completes but at enormous regulatory cost.',
            effects: { cash: -8_000_000, safetyShield: -25, boardConfidence: -20, customerCare: 5 },
          },
          {
            id: 'HOLD_RUNWAY',
            label: 'Hold Position — Await Clearance',
            risk: 'MEDIUM',
            desc: 'Legal. Runway hold (max 3 hrs by regulation). Fuel burns, passengers grow restless, crew under pressure. Outcome depends entirely on how airspace resolves.',
            effects: { cash: -160_000, crewLoyalty: -4, customerCare: 0 },
          },
          {
            id: 'RETURN_GATE',
            label: 'Return to Gate — Cancel Departure',
            risk: 'LOW',
            desc: 'Full regulatory compliance. Full refunds required. Some passengers rebook elsewhere. Transparent and legally clean — but commercially painful.',
            effects: { cash: -380_000, safetyShield: +5, boardConfidence: -3, customerCare: 10 },
          },
        ],
      },
      {
        phase: 2,
        title: 'Phase 2 — Passenger Communication',
        desc: 'Cabin PA is open. 180 passengers demand an explanation. Your airline\'s voice right now will echo across social media within minutes. Choose your captain\'s words:',
        choices: [
          {
            id: 'HONEST_CALM',
            label: '"A government-issued airspace closure is in effect. We are fully complying with safety protocols and will update you every 15 minutes."',
            desc: 'Transparent, professional, and calm. Passengers are frustrated but trust the airline. This is the gold standard of crisis communication.',
            effects: { servicePrestige: +5, customerCare: 20 },
          },
          {
            id: 'VAGUE_POLITE',
            label: '"We are experiencing a brief operational delay. Our team is working to resolve this as quickly as possible."',
            desc: 'Polite but evasive. Passengers sense something bigger. Trust erodes when the truth emerges on their phone screens.',
            effects: { customerCare: 5 },
          },
          {
            id: 'NO_UPDATE',
            label: '(Crew instructed: no PA, no information, maintain normal cabin atmosphere)',
            desc: 'Silence. Within 8 minutes, every passenger has tweeted the flight number and "no explanation given." Your airline trends — badly.',
            effects: { servicePrestige: -8, boardConfidence: -5, customerCare: -20 },
          },
        ],
      },
      {
        phase: 3,
        title: 'Phase 3 — Customer Recovery',
        desc: '40% of passengers are demanding to deplane and rebook with a competitor. Gate is reopened. This is your service-recovery moment — and it will define your Customer Care score:',
        isRecoveryPhase: true,   // ← triggers customer care reveal UI
        choices: [
          {
            id: 'PREMIUM_CARE',
            label: 'Full refund + $300 hotel voucher + priority rebooking at airline expense',
            desc: 'Gold-standard recovery. Costly — but turns today\'s crisis into tomorrow\'s loyalty story. Customers who receive this level of care become your most vocal advocates.',
            effects: { cash: -520_000, servicePrestige: +12, boardConfidence: +5, customerCare: 30 },
          },
          {
            id: 'STANDARD_REFUND',
            label: 'Full refund + $25 meal voucher per passenger',
            desc: 'Policy-compliant and decent. The majority of passengers accept this as a fair response to an extraordinary situation.',
            effects: { cash: -185_000, servicePrestige: +3, customerCare: 12 },
          },
          {
            id: 'POLICY_ONLY',
            label: 'Refund per fare class rules only — invoke Force Majeure clause',
            desc: 'Legally airtight: the airspace closure is outside airline control. Financially conservative — but passengers feel abandoned and social media will not forget.',
            effects: { cash: -42_000, servicePrestige: -10, boardConfidence: -8, customerCare: -15 },
          },
        ],
      },
    ],
    icon: '🛫',
  },
];

// ── MILESTONES ────────────────────────────────────────────────
window.SkyHigh.MILESTONES = [
  { id:'FIRST_ROUTE',    title:'First Departure',   desc:'Open your first route',           reward:'Unlock Turboprop fleet expansion',      rewardType:'FLEET',     trigger:'routes >= 1',    round:null },
  { id:'FIVE_ROUTES',    title:'Network Builder',   desc:'Operate 5 simultaneous routes',   reward:'+10% demand on all routes for 1 quarter', rewardType:'BUFF',   trigger:'routes >= 5',    round:null },
  { id:'TEN_ROUTES',     title:'Global Footprint',  desc:'Operate 10 simultaneous routes',  reward:'Unlock Widebody plane class',           rewardType:'FLEET',     trigger:'routes >= 10',   round:null },
  { id:'FIRST_CRISIS',   title:'Steady Hands',      desc:'Survive your first crisis',        reward:'+5 Safety Shield',                     rewardType:'STAT',      trigger:'crises >= 1',    round:null },
  { id:'SAFETY_MASTER',  title:'Safety Champion',   desc:'Safety Shield reaches 85',         reward:'Crisis chance -15% permanently',       rewardType:'PERK',      trigger:'safetyShield>=85', round:null },
  { id:'PRESTIGE_APEX',  title:'Five-Star Brand',   desc:'Service Prestige reaches 90',      reward:'All fares +8% permanently',            rewardType:'PERK',      trigger:'servicePrestige>=90', round:null },
  { id:'CASH_50M',       title:'Half a Billion',    desc:'Cash reserve reaches $50M',        reward:'Unlock livery: Eclipse Gold',          rewardType:'LIVERY',    trigger:'cash >= 50000000', round:null },
  { id:'CASH_100M',      title:'Century Club',      desc:'Cash reserve reaches $100M',       reward:'Unlock livery: Midnight Obsidian',     rewardType:'LIVERY',    trigger:'cash >= 100000000', round:null },
  { id:'CREW_90',        title:'Crew Champion',     desc:'Crew Loyalty reaches 90',          reward:'Strike chance eliminated for 3 rounds', rewardType:'PERK',    trigger:'crewLoyalty >= 90', round:null },
  { id:'ROUND_10',       title:'Halfway Point',     desc:'Reach Round 10',                   reward:'Unlock scenario mutator: Turbulence', rewardType:'META',       trigger:null, round:10 },
  { id:'BOARD_MAX',      title:'Boardroom Legend',  desc:'Board Confidence reaches 95',      reward:'CEO perks: +$2M per round',           rewardType:'PERK',       trigger:'boardConfidence>=95', round:null },
  { id:'ROUND_20',       title:'The Verdict',       desc:'Complete all 20 rounds',           reward:'Career Rank + Legacy Title revealed', rewardType:'END',        trigger:null, round:20 },
];

// ── LIVERIES ─────────────────────────────────────────────────
window.SkyHigh.LIVERIES = [
  { id:'DEFAULT',         name:'Executive Standard', colors:['#C8933A','#1C1C28'], locked:false },
  { id:'ECLIPSE_GOLD',    name:'Eclipse Gold',       colors:['#F0D060','#0A0A0F'], locked:true,  unlockMilestone:'CASH_50M' },
  { id:'MIDNIGHT_OBSIDIAN',name:'Midnight Obsidian', colors:['#6A0080','#0A0A0F'], locked:true,  unlockMilestone:'CASH_100M' },
  { id:'ARCTIC_WHITE',    name:'Arctic White',       colors:['#E8E8F0','#1C1C28'], locked:true,  unlockMilestone:'SAFETY_MASTER' },
  { id:'CRIMSON_AUTHORITY',name:'Crimson Authority', colors:['#C0392B','#1C1C28'], locked:true,  unlockMilestone:'BOARD_MAX' },
  { id:'PRESTIGE_TEAL',   name:'Prestige Teal',      colors:['#00B4D8','#0A0A0F'], locked:true,  unlockMilestone:'PRESTIGE_APEX' },
];

// ── LEGACY TITLES ─────────────────────────────────────────────
window.SkyHigh.LEGACY_TITLES = [
  { id:'LEGEND',      title:'Aviation Legend',     condition: s => s.boardConfidence >= 85 && s.servicePrestige >= 85 && s.cash >= 80000000 },
  { id:'VISIONARY',   title:'Strategic Visionary', condition: s => s.boardConfidence >= 80 && s.routes >= 12 },
  { id:'SAFETY_LORD', title:'Guardian of the Skies',condition: s => s.safetyShield >= 85 && s.crisisCount >= 6 },
  { id:'CREW_HERO',   title:'Champion of the Crew', condition: s => s.crewLoyalty >= 88 },
  { id:'TYCOON',      title:'Airline Tycoon',       condition: s => s.cash >= 120000000 },
  { id:'SURVIVOR',    title:'The Resilient One',    condition: s => s.crisisCount >= 10 },
  { id:'MIDDLEGROUND',title:'Steady Operator',      condition: () => true }, // fallback
];

// ── ECONOMY CONSTANTS ─────────────────────────────────────────
window.SkyHigh.ECONOMY = {
  startingCash:         50_000_000,
  fuelPriceBase:        0.72,       // $/litre
  fuelVolatility:       0.15,
  demandSeasonality:    [1.0,1.1,1.15,0.95,0.90,1.05,1.2,1.2,1.05,0.95,0.90,1.0], // Q1-Q12 multiplier cycle
  crewCostBase:         180,        // $ per flight hour per crew member
  maintenancePctFleet:  0.04,       // 4% of fleet value per quarter
  ticketFareBase: {
    SHORT:  { economy:190,  business:480  },
    MEDIUM: { economy:350,  business:880  },
    LONG:   { economy:680,  business:1800 },
    ULTRA:  { economy:1100, business:3200 },
  },
  loadFactorBase:       0.78,
  loadFactorVariance:   0.12,
  maxRoutesPerPlane:    2,          // planes can handle 2 routes before degrading
  quarterlyFleetCost: (plane, count) => plane.opCostPerKm * 2500 * count * 4,  // rough fixed quarterly
};

// ── BOARD REACTIONS ───────────────────────────────────────────
// Flavor text for report phase
window.SkyHigh.BOARD_REACTIONS = {
  excellent: [
    '"These results exceed every projection. You have my full confidence." — Chairman Oduola',
    '"The market is taking notice. This management team is exceptional." — Director Chen',
    '"Outstanding quarter. I move to increase the CEO\'s strategic budget." — Director Svensson',
  ],
  good: [
    '"Solid execution. Keep this trajectory." — Chairman Oduola',
    '"The strategy is working. Minor adjustments needed in crew management." — Director Chen',
    '"Above expectations. The board is pleased." — Director Svensson',
  ],
  neutral: [
    '"Acceptable results, but we expect more. The pressure is building." — Chairman Oduola',
    '"The numbers are adequate. Not what we invested for." — Director Chen',
    '"Holding position. That\'s not a victory." — Director Svensson',
  ],
  poor: [
    '"This is deeply concerning. I expect answers by end of week." — Chairman Oduola',
    '"Safety metrics alone are not enough. Revenue must improve." — Director Chen',
    '"If this continues next quarter, we will be reviewing your mandate." — Director Svensson',
  ],
  crisis: [
    '"The board is convening an emergency session. Your position is under review." — Chairman Oduola',
    '"This is a structural failure of leadership, not just operations." — Director Chen',
    '"We cannot absorb another quarter like this." — Director Svensson',
  ],
};

// ── WORLD EVENTS (real-life demand shocks) ────────────────────
// trigger: round number (1-20). duration: quarters event lasts.
// demandImpact: multiplier on PAX demand for affected airports/regions.
// bizImpact: multiplier on business-class demand.
// cargoImpact: multiplier on cargo demand.
// fuelImpact: multiplier on fuel price (oil-supply events).
// type: SPORTS | POLITICAL | ECONOMIC | DISASTER | HEALTH | CULTURAL
window.SkyHigh.WORLD_EVENTS = [
  {
    id: 'WORLD_CUP_1990', name: 'FIFA World Cup — Italy', type: 'SPORTS',
    triggerRound: 2, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['FCO','MXP','MIL'],
    demandImpact: 1.35, bizImpact: 1.10, cargoImpact: 1.05, fuelImpact: 1.0,
    desc: 'Italy hosts the 1990 World Cup. Tourism demand to Rome and Milan surges 35%.',
    icon: '⚽', color: '#2ECC71',
  },
  {
    id: 'GULF_WAR_1991', name: 'Gulf War — Airspace Restrictions', type: 'POLITICAL',
    triggerRound: 3, duration: 2,
    affectedRegions: ['Middle East'], affectedAirports: ['KWI','BAH','RUH'],
    demandImpact: 0.45, bizImpact: 0.60, cargoImpact: 0.80, fuelImpact: 1.45,
    desc: 'Gulf War erupts. Middle East routes collapse and oil prices spike 45%.',
    icon: '🌐', color: '#E74C3C',
  },
  {
    id: 'BARCELONA_OLYMPICS_1992', name: 'Barcelona Olympics 1992', type: 'SPORTS',
    triggerRound: 4, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['BCN','MAD'],
    demandImpact: 1.42, bizImpact: 1.15, cargoImpact: 1.10, fuelImpact: 1.0,
    desc: 'Olympic Games in Barcelona. Tourism and media travel explode.',
    icon: '🏅', color: '#F0D060',
  },
  {
    id: 'ASIA_BOOM_1993', name: 'Asian Economic Miracle', type: 'ECONOMIC',
    triggerRound: 5, duration: 3,
    affectedRegions: ['Asia Pacific'], affectedAirports: null,
    demandImpact: 1.25, bizImpact: 1.40, cargoImpact: 1.35, fuelImpact: 1.0,
    desc: 'Tiger economies roar. Business travel and cargo across Asia surge.',
    icon: '📈', color: '#3498DB',
  },
  {
    id: 'RWANDA_CRISIS_1994', name: 'Rwanda Crisis — Africa Routes Disrupted', type: 'POLITICAL',
    triggerRound: 6, duration: 2,
    affectedRegions: ['Africa'], affectedAirports: ['NBO','ADD','JNB'],
    demandImpact: 0.65, bizImpact: 0.70, cargoImpact: 0.85, fuelImpact: 1.0,
    desc: 'Regional instability in Central Africa reduces cross-continental bookings.',
    icon: '⚠️', color: '#E74C3C',
  },
  {
    id: 'LOW_OIL_1994', name: 'Oil Glut — Fuel Price Collapse', type: 'ECONOMIC',
    triggerRound: 6, duration: 2,
    affectedRegions: null, affectedAirports: null,
    demandImpact: 1.05, bizImpact: 1.0, cargoImpact: 1.05, fuelImpact: 0.65,
    desc: 'Oversupply drives oil to multi-year lows. Fuel costs drop 35% globally.',
    icon: '⛽', color: '#2ECC71',
  },
  {
    id: 'FRANCE_WORLD_CUP_1998', name: 'FIFA World Cup — France 1998', type: 'SPORTS',
    triggerRound: 7, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['CDG','ORY','LYS','MRS'],
    demandImpact: 1.38, bizImpact: 1.12, cargoImpact: 1.08, fuelImpact: 1.0,
    desc: 'France hosts the World Cup. Transatlantic and intra-Europe demand peaks.',
    icon: '⚽', color: '#2ECC71',
  },
  {
    id: 'ASIAN_FINANCIAL_CRISIS', name: 'Asian Financial Crisis', type: 'ECONOMIC',
    triggerRound: 7, duration: 3,
    affectedRegions: ['Asia Pacific'], affectedAirports: ['BKK','KUL','CGK','MNL'],
    demandImpact: 0.58, bizImpact: 0.50, cargoImpact: 0.70, fuelImpact: 0.85,
    desc: 'Currency collapses across Southeast Asia decimate travel budgets.',
    icon: '📉', color: '#E74C3C',
  },
  {
    id: 'SYDNEY_OLYMPICS_2000', name: 'Sydney Olympics 2000', type: 'SPORTS',
    triggerRound: 9, duration: 1,
    affectedRegions: ['Asia Pacific'], affectedAirports: ['SYD','MEL','BNE'],
    demandImpact: 1.45, bizImpact: 1.20, cargoImpact: 1.12, fuelImpact: 1.0,
    desc: 'Australia\'s Olympics draw record international visitors to Sydney.',
    icon: '🏅', color: '#F0D060',
  },
  {
    id: 'OIL_SPIKE_2000', name: 'Oil Price Surge', type: 'ECONOMIC',
    triggerRound: 9, duration: 2,
    affectedRegions: null, affectedAirports: null,
    demandImpact: 0.94, bizImpact: 1.0, cargoImpact: 0.95, fuelImpact: 1.38,
    desc: 'OPEC production cuts push oil prices to decade highs.',
    icon: '⛽', color: '#F39C12',
  },
  {
    id: '9_11_AFTERMATH', name: 'Global Aviation Shock', type: 'DISASTER',
    triggerRound: 10, duration: 3,
    affectedRegions: null, affectedAirports: ['JFK','LAX','ORD','MIA','YYZ','LHR','CDG'],
    demandImpact: 0.52, bizImpact: 0.45, cargoImpact: 0.88, fuelImpact: 1.15,
    desc: 'Security crisis devastates transatlantic passenger confidence. Load factors collapse.',
    icon: '🚨', color: '#E74C3C',
  },
  {
    id: 'CHINA_WTO_BOOM', name: 'China WTO Entry — Cargo Explosion', type: 'ECONOMIC',
    triggerRound: 11, duration: 4,
    affectedRegions: ['Asia Pacific'], affectedAirports: ['PEK','PVG','CAN'],
    demandImpact: 1.20, bizImpact: 1.35, cargoImpact: 1.55, fuelImpact: 1.05,
    desc: 'China joins WTO. Business travel and cargo to China surge dramatically.',
    icon: '📦', color: '#3498DB',
  },
  {
    id: 'SARS_2003', name: 'SARS Outbreak — Asia Routes Collapse', type: 'HEALTH',
    triggerRound: 12, duration: 2,
    affectedRegions: ['Asia Pacific'], affectedAirports: ['HKG','PEK','PVG','SIN','NRT'],
    demandImpact: 0.38, bizImpact: 0.42, cargoImpact: 0.75, fuelImpact: 0.92,
    desc: 'SARS epidemic kills Asia Pacific travel demand. Borders close across the region.',
    icon: '🦠', color: '#E74C3C',
  },
  {
    id: 'ATHENS_OLYMPICS_2004', name: 'Athens Olympics 2004', type: 'SPORTS',
    triggerRound: 13, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['ATH'],
    demandImpact: 1.40, bizImpact: 1.15, cargoImpact: 1.10, fuelImpact: 1.0,
    desc: 'First summer games back in Greece. European tourism booms.',
    icon: '🏅', color: '#F0D060',
  },
  {
    id: 'OIL_SUPERCYCLE', name: 'Oil Super-Cycle Peak', type: 'ECONOMIC',
    triggerRound: 14, duration: 3,
    affectedRegions: null, affectedAirports: null,
    demandImpact: 0.92, bizImpact: 1.0, cargoImpact: 0.97, fuelImpact: 1.55,
    desc: 'Commodity supercycle drives oil above $100/barrel. Fuel surcharges spike.',
    icon: '⛽', color: '#E74C3C',
  },
  {
    id: 'GERMANY_WORLD_CUP_2006', name: 'FIFA World Cup — Germany 2006', type: 'SPORTS',
    triggerRound: 14, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['FRA','MUC','ARN','CDG','AMS'],
    demandImpact: 1.32, bizImpact: 1.08, cargoImpact: 1.05, fuelImpact: 1.0,
    desc: 'Germany World Cup floods intra-European routes with football fans.',
    icon: '⚽', color: '#2ECC71',
  },
  {
    id: 'BEIJING_OLYMPICS_2008', name: 'Beijing Olympics 2008', type: 'SPORTS',
    triggerRound: 15, duration: 1,
    affectedRegions: ['Asia Pacific'], affectedAirports: ['PEK','PVG','HKG'],
    demandImpact: 1.48, bizImpact: 1.22, cargoImpact: 1.15, fuelImpact: 1.0,
    desc: 'China\'s global moment. Flights to Beijing at record capacity.',
    icon: '🏅', color: '#F0D060',
  },
  {
    id: 'GLOBAL_FINANCIAL_CRISIS', name: 'Global Financial Crisis', type: 'ECONOMIC',
    triggerRound: 15, duration: 3,
    affectedRegions: null, affectedAirports: null,
    demandImpact: 0.62, bizImpact: 0.50, cargoImpact: 0.68, fuelImpact: 0.75,
    desc: 'Lehman Brothers collapse triggers global recession. Business travel halves.',
    icon: '📉', color: '#E74C3C',
  },
  {
    id: 'SOUTH_AFRICA_WORLD_CUP_2010', name: 'FIFA World Cup — South Africa 2010', type: 'SPORTS',
    triggerRound: 17, duration: 1,
    affectedRegions: ['Africa'], affectedAirports: ['JNB','CPT','DUR'],
    demandImpact: 1.50, bizImpact: 1.18, cargoImpact: 1.12, fuelImpact: 1.0,
    desc: 'First World Cup in Africa. Unprecedented international arrivals to South Africa.',
    icon: '⚽', color: '#2ECC71',
  },
  {
    id: 'ARAB_SPRING', name: 'Arab Spring Unrest', type: 'POLITICAL',
    triggerRound: 18, duration: 2,
    affectedRegions: ['Middle East','Africa'], affectedAirports: ['CAI','TUN','TRP','AMM'],
    demandImpact: 0.50, bizImpact: 0.55, cargoImpact: 0.72, fuelImpact: 1.20,
    desc: 'Political upheaval sweeps MENA. Tourism collapses, oil spiked by uncertainty.',
    icon: '🌐', color: '#E74C3C',
  },
  {
    id: 'LONDON_OLYMPICS_2012', name: 'London Olympics 2012', type: 'SPORTS',
    triggerRound: 19, duration: 1,
    affectedRegions: ['Europe'], affectedAirports: ['LHR','LGW','STN','LCY'],
    demandImpact: 1.44, bizImpact: 1.20, cargoImpact: 1.14, fuelImpact: 1.0,
    desc: 'London hosts the Olympics. Heathrow at record passenger volumes.',
    icon: '🏅', color: '#F0D060',
  },
  {
    id: 'SHALE_OIL_GLUT', name: 'Shale Oil Glut — Fuel Crash', type: 'ECONOMIC',
    triggerRound: 19, duration: 2,
    affectedRegions: null, affectedAirports: null,
    demandImpact: 1.04, bizImpact: 1.0, cargoImpact: 1.06, fuelImpact: 0.58,
    desc: 'US shale boom floods global oil markets. Jet fuel drops to 10-year lows.',
    icon: '⛽', color: '#2ECC71',
  },
];

// ── FINANCING SYSTEM ──────────────────────────────────────────
window.SkyHigh.FINANCING = {
  // Credit ratings — determined by debt-to-cash ratio and payment history
  creditRatings: [
    { id: 'AAA', label: 'AAA', spread: 0.005, maxLoanMultiple: 8,   color: '#2ECC71', desc: 'Pristine credit. Lowest rates.' },
    { id: 'AA',  label: 'AA',  spread: 0.010, maxLoanMultiple: 7,   color: '#27AE60', desc: 'Excellent credit.' },
    { id: 'A',   label: 'A',   spread: 0.015, maxLoanMultiple: 6,   color: '#F39C12', desc: 'Strong credit.' },
    { id: 'BBB', label: 'BBB', spread: 0.022, maxLoanMultiple: 5,   color: '#E67E22', desc: 'Investment grade. Acceptable risk.' },
    { id: 'BB',  label: 'BB',  spread: 0.035, maxLoanMultiple: 4,   color: '#E74C3C', desc: 'Speculative. Higher cost of debt.' },
    { id: 'B',   label: 'B',   spread: 0.055, maxLoanMultiple: 3,   color: '#C0392B', desc: 'High risk. Lenders are cautious.' },
    { id: 'CCC', label: 'CCC', spread: 0.090, maxLoanMultiple: 2,   color: '#8E44AD', desc: 'Near distress. Very expensive capital.' },
    { id: 'D',   label: 'D',   spread: 0.150, maxLoanMultiple: 1,   color: '#2C3E50', desc: 'Default territory. Emergency only.' },
  ],

  // Base interest rate changes each quarter (SkyForce timeline)
  // Index corresponds to round number (0-indexed, so index 0 = round 1)
  baseRateByRound: [
    0.035, 0.035, 0.038, 0.038, 0.032, // Rounds 1-5  (Q1 brand launch → fuel spike → pandemic signal)
    0.028, 0.025, 0.025, 0.030, 0.035, // Rounds 6-10 (summer surge → war corridor → World Cup)
    0.045, 0.055, 0.065, 0.065, 0.055, // Rounds 11-15 (rate hike cycle → recession peak at Q13-14)
    0.045, 0.038, 0.032, 0.030, 0.030, // Rounds 16-20 (recovery → green era → final scoring)
  ],

  // Loan types
  loanTypes: [
    {
      id: 'EQUIPMENT',
      name: 'Equipment Loan',
      desc: 'Finance a specific aircraft purchase. Secured against the asset.',
      icon: '✈',
      termOptions: [8, 12, 16, 20],    // quarters
      minAmount: 5_000_000,
      maxAmount: 200_000_000,
      spreadBonus: -0.005,             // equipment loans get a slight discount
    },
    {
      id: 'WORKING_CAPITAL',
      name: 'Working Capital Line',
      desc: 'Short-term revolving credit for fuel, ops, and runway gaps.',
      icon: '💼',
      termOptions: [2, 4, 8],
      minAmount: 1_000_000,
      maxAmount: 30_000_000,
      spreadBonus: 0.008,              // unsecured = premium
    },
    {
      id: 'FUEL_FORWARD',
      name: 'Fuel Forward Contract',
      desc: 'Borrow to lock in bulk fuel at today\'s price. Profit if prices rise.',
      icon: '⛽',
      termOptions: [4, 8],
      minAmount: 2_000_000,
      maxAmount: 50_000_000,
      spreadBonus: 0.003,
    },
    {
      id: 'EXPANSION',
      name: 'Network Expansion Bond',
      desc: 'Long-term debt for major network build-outs. Board-approved.',
      icon: '🌐',
      termOptions: [12, 16, 20],
      minAmount: 10_000_000,
      maxAmount: 500_000_000,
      spreadBonus: 0.000,
    },
  ],

  // Bulk fuel tiers
  fuelBulkTiers: [
    { id: 'SMALL',  label: '1M litres',  litres: 1_000_000,  discountPct: 0.03 },
    { id: 'MEDIUM', label: '5M litres',  litres: 5_000_000,  discountPct: 0.07 },
    { id: 'LARGE',  label: '15M litres', litres: 15_000_000, discountPct: 0.12 },
    { id: 'MEGA',   label: '50M litres', litres: 50_000_000, discountPct: 0.18 },
  ],
};

// ── CUSTOMER LOYALTY SYSTEM ──────────────────────────────────
// Tracks how loyal passengers are (0-100%). Starts at 50%.
// Affects how sensitive the airline is to demand shocks (positive & negative).
// High loyalty = cushioned in downturns, amplified in upturns.
window.SkyHigh.CUSTOMER_LOYALTY = {
  start: 50,

  // Multipliers applied to world event demand changes based on loyalty level
  // If event demand is NEGATIVE (event mod < 1.0):
  //   effectiveMod = 1 - (1 - rawMod) * negativeMultiplier
  // If event demand is POSITIVE (event mod > 1.0):
  //   effectiveMod = 1 + (rawMod - 1) * positiveMultiplier
  brackets: [
    { minLoyalty: 80, negativeMultiplier: 0.70, positiveMultiplier: 1.15, label: 'Fiercely Loyal',  color: '#2ECC71' },
    { minLoyalty: 65, negativeMultiplier: 0.85, positiveMultiplier: 1.05, label: 'Strong Loyalty',  color: '#27AE60' },
    { minLoyalty: 50, negativeMultiplier: 1.00, positiveMultiplier: 1.00, label: 'Baseline',         color: '#F39C12' },
    { minLoyalty: 35, negativeMultiplier: 1.20, positiveMultiplier: 0.85, label: 'Fragile Loyalty',  color: '#E67E22' },
    { minLoyalty:  0, negativeMultiplier: 1.40, positiveMultiplier: 0.70, label: 'Disloyal',         color: '#E74C3C' },
  ],

  // How brand point changes translate to loyalty changes
  brandToLoyalty: {
    perTenBrandUp:   +2,   // +10 Brand Pts → +2% loyalty
    perTenBrandDown: -3,   // -10 Brand Pts → -3% loyalty (harder to rebuild)
  },

  // Key event loyalty changes (per SkyForce reference)
  eventChanges: {
    strike_no_deal:       -15,
    brand_grenade_redemption: +15,
    olympic_carrier:      +8,
    mass_redundancies:    -10,
    cocoa_premium_rebrand: +5,
    world_cup_win:        +6,
    runway_crisis_excellent: +8,
    runway_crisis_poor:   -6,
  },
};

// ── CASCADE CARDS ─────────────────────────────────────────────
// Board decisions unlock or penalise cascade cards that persist through the game.
window.SkyHigh.CASCADE_CARDS = {
  TRUSTED_OPERATOR: {
    id: 'TRUSTED_OPERATOR',
    name: 'Trusted Operator',
    desc: 'Regulatory trust earned. No regulatory friction for 3 rounds. Unlocked by: S1-A or S15-C.',
    icon: '🛡️',
    color: '#2ECC71',
  },
  GOVERNMENT_BOARD_CARD: {
    id: 'GOVERNMENT_BOARD_CARD',
    name: 'Government Board Card',
    desc: 'Government holds 3 board seats. Aggressive labour options blocked in S13 and S15.',
    icon: '🏛️',
    color: '#E74C3C',
  },
  MODERN_FLEET: {
    id: 'MODERN_FLEET',
    name: 'Modern Fleet',
    desc: '+10% ops efficiency. No maintenance premium for new planes. Unlocked by: S3-A (≥5 planes).',
    icon: '✈️',
    color: '#3498DB',
  },
  PEOPLE_FIRST: {
    id: 'PEOPLE_FIRST',
    name: 'People-First Culture',
    desc: 'Long-term brand multiplier. Staff morale +20. Talent retention advantage. Unlocked by: S13-C.',
    icon: '👥',
    color: '#9B59B6',
  },
  GREEN_LEADER: {
    id: 'GREEN_LEADER',
    name: 'Green Leader',
    desc: 'ESG multiplier in end-game scoring. Future carbon levies applied at 60% rate. Unlocked by: S17-C.',
    icon: '🌿',
    color: '#1ABC9C',
  },
  ANTI_ENVIRONMENT: {
    id: 'ANTI_ENVIRONMENT',
    name: 'Anti-Environment Flag',
    desc: 'Permanent -15 Brand Pts applied. Service Prestige capped at 70. Triggered by: S17-D failure.',
    icon: '☠️',
    color: '#E74C3C',
    permanent: true,
  },
  AGING_OPERATIONS: {
    id: 'AGING_OPERATIONS',
    name: 'Aging Operations',
    desc: '+$2M maintenance/quarter penalty. Competitor AI advantage permanent. Triggered by: S3-C or S13-D.',
    icon: '⚙️',
    color: '#E67E22',
    permanent: true,
  },
  FIRST_MOVER: {
    id: 'FIRST_MOVER',
    name: 'First Mover',
    desc: '+20 bonus pts end-game if the new market grows as projected. Unlocked by: S9-A or S15-D.',
    icon: '🚀',
    color: '#F39C12',
  },
  GLOBAL_BRAND: {
    id: 'GLOBAL_BRAND',
    name: 'Global Brand',
    desc: 'World Cup partnership. +8% demand on all routes through Q12. Unlocked by: S10-A (if won).',
    icon: '🌐',
    color: '#C8933A',
  },
  CARGO_DIVESTED: {
    id: 'CARGO_DIVESTED',
    name: 'Cargo Division Sold',
    desc: 'Cargo demand uplifts from world events no longer apply. -$1.5M quarterly revenue, permanently.',
    icon: '📦',
    color: '#95A5A6',
    permanent: true,
  },
};

// ── QUARTERLY NARRATIVE HEADLINES ─────────────────────────────
window.SkyHigh.HEADLINES = {
  1:  'Runway: Your Journey Begins',
  2:  'First Turbulence: Testing Conviction',
  3:  'Building the Network',
  4:  'The Pressure Mounts',
  5:  'Stage Boss — Crisis at Altitude',
  6:  'Into the Second Chapter',
  7:  'Reputation Under Scrutiny',
  8:  'Network Wars: Competition Intensifies',
  9:  'The Cost of Ambition',
  10: 'Stage Boss — The Hostile Bid',
  11: 'Into the Storm',
  12: 'Leadership Tested',
  13: 'The Balance Sheet Truth',
  14: 'Loyalty and Betrayal',
  15: 'Stage Boss — Geopolitical Grounding',
  16: 'Final Moves',
  17: 'The Last Expansion Push',
  18: 'Counting the Cost',
  19: 'Preparing the Legacy',
  20: 'Stage Boss — The Legacy Verdict',
};
