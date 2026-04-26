// ─── Cities ────────────────────────────────────────────────
export type Region = "na" | "sa" | "la" | "eu" | "me" | "mea" | "af" | "as" | "oc";
export type CityTier = 1 | 2 | 3 | 4;

export interface City {
  code: string;               // IATA
  name: string;
  region: Region;
  regionName: string;
  tier: CityTier;
  tourism: number;            // Q1 base tourism/day
  business: number;           // Q1 base business/day
  amplifier: number;          // route multiplier
  tourismGrowth: number;      // annual %
  businessGrowth: number;     // annual %
  lon: number;
  lat: number;
  character: string;
}

// ─── Aircraft ──────────────────────────────────────────────
export type AircraftFamily = "passenger" | "cargo";
export type CabinConfig = "default" | "economy-only" | "business-heavy" | "custom";

export interface AircraftSpec {
  id: string;
  name: string;                  // e.g. "Airbus A320neo"
  family: AircraftFamily;
  unlockQuarter: number;         // 1 for starters, 5 for A380, etc.
  seats: { first: number; business: number; economy: number }; // default config
  cargoTonnes?: number;          // for cargo family
  rangeKm: number;
  fuelBurnPerKm: number;         // L/km
  buyPriceUsd: number;
  leasePerQuarterUsd: number;
  ecoUpgradeUsd: number;         // cost to add eco engine
  /** Per-quarter production cap once unlocked. Once a queue forms,
   *  only `productionCapPerQuarter` units are delivered each round
   *  (FIFO across teams). Defaults to 8 for standard aircraft and 5
   *  for premium ($80M+) airframes. May be overridden by facilitator. */
  productionCapPerQuarter?: number;
  note?: string;
}

/** Engine retrofits selected at purchase time. Inspired by Air Tycoon's
 *  Upgrade Center. Multiplicative effects on fuel burn / range / speed.
 *  - "fuel"  : +10% range, -10% fuel burn
 *  - "power" : +10% speed
 *  - "super" : combines fuel + power (cost = sum)
 *  - null    : stock engine */
export type EngineUpgrade = null | "fuel" | "power" | "super";

/** Custom per-instance cabin seat allocation. The total "seat-equivalents"
 *  for an aircraft is fixed: 1 First seat = 3 Economy units, 1 Business = 2.
 *  An A380 default of 14F + 76C + 460Y has 654 equivalents — flipping all to
 *  Economy gives 654 economy seats; all-business gives ~327 business seats. */
export interface CustomCabin {
  first: number;
  business: number;
  economy: number;
}

export interface FleetAircraft {
  id: string;                    // instance id
  specId: string;
  status: "active" | "ordered" | "grounded" | "leased" | "retired";
  acquisitionType: "buy" | "lease";
  purchaseQuarter: number;       // when ordered (arrives +1)
  purchasePrice: number;
  bookValue: number;
  leaseQuarterly: number | null;
  ecoUpgrade: boolean;
  ecoUpgradeQuarter: number | null;
  ecoUpgradeCost: number;
  cabinConfig: CabinConfig;
  /** Optional override of the spec.seats default. When set, replaces the
   *  spec default for capacity calculations. */
  customSeats?: CustomCabin;
  /** Engine retrofit selected at purchase time. */
  engineUpgrade?: EngineUpgrade;
  /** Optional fuselage coating retrofit at purchase: -10% fuel burn (stacks). */
  fuselageUpgrade?: boolean;
  routeId: string | null;        // assigned route or null
  /** Quarter at which the aircraft retires (purchaseQuarter + 16 for passenger). */
  retirementQuarter: number;
  /** Accumulated maintenance deficit from low Ops slider (PRD B2/C4). */
  maintenanceDeficit: number;
  /** When set and status is "grounded", the aircraft auto-reactivates at the
   *  end of the named quarter (PRD F3: 1-quarter renovation downtime). */
  renovationCompleteQuarter?: number;
  /** Per-plane passenger satisfaction 0..100 (PRD update). Drifts toward
   *  60 baseline; modified by age (newer = higher), eco upgrade (+5),
   *  recent renovation (+15 fading), maintenance slider (high = up,
   *  low = down). Below 30 triggers a soft demand penalty on routes
   *  this plane flies. */
  satisfactionPct: number;
}

// ─── Insurance (PRD E5) ──────────────────────────────────
export type InsurancePolicy = "none" | "low" | "medium" | "high";

// ─── Routes ───────────────────────────────────────────────
export type PricingTier = "budget" | "standard" | "premium" | "ultra";

export interface Route {
  id: string;
  originCode: string;
  destCode: string;
  distanceKm: number;
  aircraftIds: string[];
  dailyFrequency: number;        // 1..24
  pricingTier: PricingTier;

  /** Per-class fare overrides (USD per seat). null = use base tier formula. */
  econFare: number | null;
  busFare: number | null;
  firstFare: number | null;
  /** Cargo route override for $/tonne. null = use base tier formula
   *  ($3.50 short-haul / $5.50 long-haul × pricing-tier multiplier).
   *  Mirrors how passenger routes use econFare/busFare/firstFare. */
  cargoRatePerTonne: number | null;

  status: "active" | "pending" | "closed" | "suspended";
  openQuarter: number;
  avgOccupancy: number;          // 0..1
  quarterlyRevenue: number;
  quarterlyFuelCost: number;
  quarterlySlotCost: number;
  /** Fully-loaded route cost = direct fuel + the route's revenue-share
   *  allocation of every other team-level cost (slot lease, staff,
   *  maintenance, marketing, depreciation, interest, taxes, etc).
   *  Populated each quarter by runQuarterClose so the Routes panel can
   *  show a "Q profit" that reconciles back to the team financials,
   *  rather than a misleadingly-fat margin from revenue − fuel only. */
  quarterlyAllocatedCost?: number;

  /** True if route carries cargo instead of passengers. */
  isCargo?: boolean;

  /** Quarters the route has been operating (for Legacy Bonus E8.1). */
  consecutiveQuartersActive: number;
  /** Quarters in a row this route has been loss-making (for PRD G2 badge). */
  consecutiveLosingQuarters: number;

  /** Human-readable reason this route is still pending after the most
   *  recent close — e.g. "held 0@LHR / 14@SIN, need 14/wk". Lets the
   *  Routes panel surface the blocker any time, not just via the
   *  one-shot toast that fires at quarter close. Cleared on activation. */
  pendingReason?: string;
  /** Bids the player committed to when opening this route as PENDING.
   *  Persists across quarter closes so the route auto re-bids each
   *  auction until it activates OR the player cancels manually. Cleared
   *  once the route activates. Keyed by airport code. */
  pendingBidPrices?: Record<string, number>;
  /** Slot count to bid for at each airport (defaults to current
   *  shortfall). Persisted alongside pendingBidPrices. */
  pendingBidSlots?: Record<string, number>;
}

// ─── Sliders ──────────────────────────────────────────────
export type SliderLevel = 0 | 1 | 2 | 3 | 4 | 5; // Very Low → Extreme

export interface Sliders {
  staff: SliderLevel;
  marketing: SliderLevel;
  service: SliderLevel;
  rewards: SliderLevel;
  operations: SliderLevel;
  customerService: SliderLevel;     // PRD E1/F1 — global airport service quality
}

// ─── Financials ──────────────────────────────────────────
export interface LoanInstrument {
  id: string;
  principalUsd: number;
  ratePct: number;
  originQuarter: number;
  remainingPrincipal: number;
  govBacked: boolean;
}

// ─── Scenarios (board decisions) ─────────────────────────
export type ScenarioId = `S${number}`;

export interface ScenarioDecision {
  scenarioId: ScenarioId;
  quarter: number;
  optionId: string;             // A/B/C/D/E
  submittedAt: number;          // epoch ms
  lockInQuarters?: number;      // S16 only
}

export interface DeferredEvent {
  id: string;
  sourceScenario: ScenarioId;
  sourceOption: string;
  targetQuarter: number;
  probability: number;          // 0..1, 1 = certain (plot twist)
  effectJson: string;           // serialized OptionEffect (avoids circular import)
  noteAtQueue?: string;
  resolved?: boolean;
  resolvedOutcome?: "triggered" | "missed";
  resolvedAtQuarter?: number;
}

// ─── World News ──────────────────────────────────────────
export type NewsImpact =
  | "tourism"
  | "business"
  | "cargo"
  | "ops"
  | "brand"
  | "fuel"
  | "none";

/** Demand category a news modifier targets. "all" hits every category. */
export type NewsCategory =
  | "tourism"
  | "business"
  | "cargo"
  | "all";

/** Structured per-city demand modifier parsed from master ref `→ CITY: ±N%
 *  category · X rounds` lines. The engine applies these deterministically
 *  when computing route demand instead of regex-scraping the headline text. */
export interface NewsModifier {
  /** City code (e.g. "DXB") or "ALL" for a global modifier. */
  city: string;
  /** Demand category being moved. */
  category: NewsCategory;
  /** Percentage delta — +25 means +25% over baseline, -40 means down 40%. */
  pct: number;
  /** Rounds the modifier persists for. 1 = current round only.
   *  99 = permanent for the rest of the campaign. */
  rounds: number;
}

export interface NewsItem {
  id: string;
  quarter: number;
  icon: string;
  impact: NewsImpact;
  headline: string;
  detail: string;
  /** Per-city demand modifiers attached to this headline. The engine
   *  scans the active set every round and applies them to route demand. */
  modifiers?: NewsModifier[];
  /** Global fuel-index delta — % of baseline (e.g. -22 = fuel index 78). */
  fuelIndexAtBaseline?: number;
  /** Global travel-index delta — multiplies overall demand (e.g. 110 =
   *  +10% baseline demand worldwide for the round). */
  travelIndex?: number;
}

// ─── Team / Airline ──────────────────────────────────────
export type DoctrineId =
  | "budget-expansion"
  | "premium-service"
  | "cargo-dominance"
  | "safety-first";

export type TeamRole = "CEO" | "CFO" | "CMO" | "CHRO";

export interface TeamMember {
  role: TeamRole;
  name: string;
  mvpPts: number;                      // running tally across live sims
  cards: string[];                     // "Integrity Leader", "Maverick", etc.
}

export interface Team {
  id: string;
  name: string;                  // airline name
  code: string;                  // IATA-style, 2-3 letters
  color: string;                 // hex for map arcs
  hubCode: string;
  secondaryHubCodes: string[];   // additional hubs added after Q3 at 2× fee
  doctrine: DoctrineId;
  isPlayer: boolean;             // player (single-team demo) vs mocked rival
  /** When set, this team is run by an AI bot at the configured
   *  difficulty. Drives quarterly route opening, fleet ordering, slot
   *  bidding, and scenario decisions in the engine. Player teams have
   *  this null/undefined. */
  botDifficulty?: "easy" | "medium" | "hard";
  members: TeamMember[];         // CEO/CFO/CMO/CHRO with MVP tally

  // Q1 Brand Building profile (PRD §13.2) — saved for reference + flavour
  tagline: string;
  marketFocus: "passenger" | "cargo" | "balanced";
  geographicPriority: "north-america" | "europe" | "asia-pacific" | "middle-east" | "global";
  pricingPhilosophy: "budget" | "standard" | "premium" | "ultra";
  salaryPhilosophy: "below" | "at" | "above";
  marketingLevel: "low" | "medium" | "high" | "aggressive";
  csrTheme: "environment" | "community" | "employees" | "none";

  // Finances
  cashUsd: number;
  totalDebtUsd: number;
  loans: LoanInstrument[];

  // Assets
  fleet: FleetAircraft[];
  routes: Route[];

  // Scores
  brandPts: number;
  opsPts: number;
  customerLoyaltyPct: number;    // 0..100
  brandValue: number;            // 0..100 composite

  // Ops form
  sliders: Sliders;
  sliderStreaks: Record<keyof Sliders, { level: SliderLevel; quarters: number }>;

  // Scenarios
  decisions: ScenarioDecision[];
  flags: Set<string>;            // gov_board_card, trusted_operator, ...
  deferredEvents: DeferredEvent[];

  /** Active route service obligations from accepted scenarios (e.g. S5
   *  "Government Lifeline" requires service to Lagos + Casablanca for 2
   *  years). The engine charges `finePerQuarterUsd` at quarter close
   *  for every obligation city the team isn't actively serving. */
  routeObligations?: Array<{
    /** Identifier for tooling / display (matches the originating scenario id). */
    id: string;
    /** City codes that must each be served by an active route (any
     *  endpoint counts — the route doesn't have to originate at hub). */
    cities: string[];
    /** First quarter the obligation is active. */
    activeFromQuarter: number;
    /** Last quarter the obligation applies (inclusive). */
    activeUntilQuarter: number;
    /** Fine per missed city per quarter. */
    finePerQuarterUsd: number;
    /** Human-readable label for the dashboard / news feed. */
    label: string;
  }>;

  // Revolving Credit Facility (A8)
  rcfBalanceUsd: number;

  // Tax loss carry-forward (PRD B5): 5-quarter expiry
  taxLossCarryForward: Array<{ quarter: number; amount: number }>;

  // Insurance policy (PRD E5)
  insurancePolicy: InsurancePolicy;

  // Fuel Storage (PRD E2) — litres capacity + current stored + avg cost
  fuelTanks: { small: number; medium: number; large: number };
  fuelStorageLevelL: number;
  fuelStorageAvgCostPerL: number;

  // Slots held at each airport (PRD G10).
  // LEGACY field — Model A interpretation (one-time auction price). Kept
  // for save migration; new mechanics read airportLeases instead.
  slotsByAirport: Record<string, number>;
  /** Slot leases per airport (PRD update — Model B recurring fees).
   *  Each lease tracks count + total weekly fee blend across slots
   *  acquired at different prices. */
  airportLeases: Record<string, AirportLease>;

  // Airports where cargo storage has been activated (PRD C9 setup cost paid)
  cargoStorageActivations: string[];

  // Hub infrastructure investments (PRD D4)
  hubInvestments: {
    fuelReserveTankHubs: string[];       // 15% fuel cost reduction at these hubs
    maintenanceDepotHubs: string[];      // 20% maintenance reduction for planes based here
    premiumLoungeHubs: string[];         // +8% F/C occupancy on routes through these hubs
    opsExpansionSlots: number;           // extra route capacity (+5 per unit)
  };

  // Labour Relations Score (PRD E8.3)
  labourRelationsScore: number;          // 0..100

  // Milestones earned (PRD E8.9)
  milestones: string[];
  /** Running count of consecutive profitable quarters; resets on a loss.
   *  Used by the "Profit Streak" milestone and the boardroom narrative. */
  consecutiveProfitableQuarters: number;

  // Sealed auction bids queued for the next slot release (admin-auctioned per quarter)
  pendingSlotBids: Array<{
    airportCode: string;
    slots: number;
    pricePerSlot: number;
    quarterSubmitted: number;
  }>;

  // History
  financialsByQuarter: Array<{
    quarter: number;
    cash: number;
    debt: number;
    revenue: number;
    /** Optional split — older saves may not have these. */
    passengerRevenue?: number;
    cargoRevenue?: number;
    costs: number;
    insuranceCost?: number;
    netProfit: number;
    brandPts: number;
    opsPts: number;
    loyalty: number;
    brandValue: number;
  }>;
}

// ─── Cargo contracts (PRD E8.6) ──────────────────────────
export interface CargoContract {
  id: string;
  teamId: string;                // team that holds this contract
  originCode: string;
  destCode: string;
  guaranteedTonnesPerWeek: number;
  ratePerTonneUsd: number;
  quartersRemaining: number;     // decremented each quarter close
  source: string;                // free text, e.g. "Dubai Expo 2040"
}

// ─── Second-hand aircraft market (A13) ───────────────────
export interface SecondHandListing {
  id: string;
  specId: string;                // AircraftSpec id
  askingPriceUsd: number;
  listedAtQuarter: number;
  sellerTeamId: string | "admin";
  ecoUpgrade: boolean;
  cabinConfig: CabinConfig;
  manufactureQuarter: number;    // for remaining lifespan calc
  retirementQuarter: number;
}

// ─── Game phase ──────────────────────────────────────────
export type GamePhase =
  | "idle"          // pre-setup
  | "onboarding"    // Q1 brand building
  | "playing"       // Q2+
  | "quarter-closing"
  | "endgame";

export interface GameState {
  phase: GamePhase;
  currentQuarter: number;         // 1..20
  fuelIndex: number;              // 100 = baseline
  baseInterestRatePct: number;    // e.g. 3.5
  teams: Team[];
  playerTeamId: string | null;

  // Quarter timer (A12)
  quarterTimerSecondsRemaining: number | null; // null = not started / paused
  quarterTimerPaused: boolean;

  // Second-hand aircraft listings (A13)
  secondHandListings: SecondHandListing[];

  // Active cargo contracts (PRD E8.6)
  cargoContracts: CargoContract[];

  /** Per-airport slot capacity (PRD slot bidding system).
   *  Each airport accumulates slots over the 20-quarter game; slots are
   *  awarded to the highest bidder via end-of-quarter resolution. */
  airportSlots: Record<string, AirportSlotState>;

  /** City code that hosts the World Cup (rounds 19-24 window). Picked
   *  once at game init from tier 1-2 cities that are NOT a hub of any
   *  team. Demand boost only applies to routes touching this city. */
  worldCupHostCode: string | null;
  /** City code that hosts the Olympics (rounds 29-32 window). Same rules
   *  as worldCupHostCode — tier 1-2, not a player/rival hub. */
  olympicHostCode: string | null;

  /** 4-digit join code generated by the facilitator. Players enter this
   *  on /join along with their company name to take a seat. Null when no
   *  facilitated session is active. */
  sessionCode: string | null;
  /** When true, the facilitator has locked the session — no NEW seats
   *  can be claimed via /join. Existing players can still reconnect by
   *  re-entering the same company name (rejoin path). Default false. */
  sessionLocked: boolean;
  /** Slots reserved by the facilitator for players to claim. Each entry
   *  represents an unclaimed seat — once a player joins with the session
   *  code, one of these slots binds to their team. */
  sessionSlots: Array<{
    /** Stable id for this seat. */
    id: string;
    /** Whether a player has joined and bound to this seat. */
    claimed: boolean;
    /** The team id created when this seat is claimed. Null until claim. */
    teamId: string | null;
    /** Player's company name once they join. */
    companyName: string | null;
  }>;

  /** Aircraft pre-order queue. FIFO across all teams, per-spec.
   *  Each round at quarter-close, up to spec.productionCapPerQuarter (or
   *  facilitator override in `productionCapOverrides[specId]`) entries
   *  are dequeued in order and delivered to their respective teams. */
  preOrders: PreOrder[];

  /** Facilitator-set per-quarter production cap overrides. When set,
   *  overrides spec.productionCapPerQuarter for that spec for ALL future
   *  delivery batches. Used to cool off or surge supply. */
  productionCapOverrides: Record<string, number>;
}

/** Aircraft pre-order entry. Pre-orders open 2 rounds before unlock
 *  (announcement window) and continue past unlock as the manufacturing
 *  queue forms. Each FIFO entry is one aircraft slot — orders for
 *  multiple units fan out to multiple PreOrder rows so the queue can
 *  partially fill (5 of 8 ordered → 5 delivered now, 3 next round).
 *
 *  Lifecycle:
 *    queued    → placed, deposit charged
 *    delivered → balance charged at delivery, FleetAircraft created
 *    cancelled → 15% of deposit kept as penalty, 85% refunded
 */
export interface PreOrder {
  id: string;
  teamId: string;
  specId: string;
  /** Quarter the order was placed (FIFO key). */
  orderedAtQuarter: number;
  /** 20% of total cost held as deposit when queued. */
  depositUsd: number;
  /** Total list price (incl. upgrades) committed at order time. */
  totalPriceUsd: number;
  /** Acquisition mode — buy or lease. Lease deposit = 1Q lease fee. */
  acquisitionType: "buy" | "lease";
  cabinConfig: CabinConfig;
  customSeats?: CustomCabin;
  engineUpgrade?: EngineUpgrade;
  fuselageUpgrade?: boolean;
  status: "queued" | "delivered" | "cancelled";
  /** When the engine actually delivered this slot (status=delivered). */
  deliveredAtQuarter?: number;
  /** Fleet instance id created on delivery (so the order can link back). */
  deliveredAircraftId?: string;
}

/** Slot bidding state for a single airport. Players bid in pendingSlotBids
 *  and the engine resolves at quarter-close: highest pricePerSlot wins,
 *  unsold slots roll forward. Yearly random opens add to `available`. */
export interface AirportSlotState {
  /** Slots currently available for bidding next quarter. */
  available: number;
  /** Slots scheduled to open at the next yearly tick (visible to all
   *  airlines so they can plan bids). */
  nextOpening: number;
  /** Quarter at which the next yearly tick fires (Q5/Q9/Q13/Q17/Q21). */
  nextTickQuarter: number;
}

/** A single team's slot lease at one airport (PRD update — Model B
 *  recurring fees). The bid price won at auction becomes the recurring
 *  weekly fee per slot, charged for as long as the team holds the slot.
 *  When a team wins more slots at a different price, totalWeeklyCost
 *  blends them so quarterly cost is exact. */
export interface AirportLease {
  /** Number of slots held at this airport. */
  slots: number;
  /** Sum of weekly per-slot prices across all slots held (so
   *  totalWeeklyCost = sum(price[i]) for i in slots). Quarterly cost =
   *  totalWeeklyCost × 13. */
  totalWeeklyCost: number;
}
