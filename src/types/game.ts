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
  /** Round at which new orders for this airframe close. After cutoff:
   *   - "Order new" disappears from the market for this spec
   *   - Existing aircraft keep flying indefinitely (no forced retirement)
   *   - Maintenance starts escalating per the bracket schedule
   *   - Secondary market still trades the spec freely
   *  Undefined = still in production at end of campaign. */
  cutoffRound?: number;
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
  /** Lease deposit paid at order time (15% of spec buy price). Used so
   *  the player can see the up-front capital cost vs the per-quarter
   *  fee, and so a buy-out at end of term can credit it correctly. */
  leaseDepositUsd?: number;
  /** Quarter the 12-quarter lease ends. After this quarter the
   *  aircraft returns to the lessor unless the player exercises the
   *  buy-out option (25% of original buy price). */
  leaseTermEndsAtQuarter?: number;
  /** Spec buy price at the moment of leasing — captured so the buy-out
   *  residual is calculable even if catalogue prices later change. */
  leaseBuyoutBasisUsd?: number;
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
  /** Quarter at which the aircraft retires (newly purchased airframes use +28Q). */
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
  /** Cabin amenities chosen at purchase order. Each adds a satisfaction
   *  bump and a small per-flight operating cost. Stack — a plane can
   *  carry multiple amenities. The cost is captured per-aircraft at
   *  order time and added to the airframe's operating cost line. */
  cabinAmenities?: CabinAmenities;
  /** Cargo belly upgrade for passenger aircraft. Standard adds the
   *  baseline tonnage (per seat-count tier); Expanded adds 1.5× of
   *  that. The plane consumes from cargo demand on every route it
   *  flies. Cargo planes (`spec.family === "cargo"`) ignore this
   *  field — they use `spec.cargoTonnes` directly. */
  cargoBelly?: CargoBellyTier;
  /** Lifespan retrofit flag. When the player pays 30% of the original
   *  purchase price on an aging plane (≤4Q from retirement), this is
   *  set true and `retirementQuarter` jumps +14Q (50% of the base
   *  28Q lifespan). One retrofit per airframe so it's a real
   *  decision, not an indefinite escape hatch — the plane still
   *  retires eventually. */
  lifespanExtended?: boolean;
}

/** Optional cabin amenities a player can toggle at purchase order.
 *  Each individually costs a fixed % of the spec buyPrice and bumps
 *  passenger satisfaction by a small amount. Picked once per
 *  airframe at order; not retro-fittable in the current build. */
export interface CabinAmenities {
  wifi?: boolean;             // +5 satisfaction · 1% of spec buy price
  premiumSeating?: boolean;   // +8 satisfaction · 3% of spec buy price
  entertainment?: boolean;    // +5 satisfaction · 1.5% of spec buy price
  foodService?: boolean;      // +6 satisfaction · 2% of spec buy price
}

/** Cargo belly tier on a passenger airframe.
 *    none      - no belly cargo
 *    standard  - tier-baseline tonnage @ 10% of spec buy price
 *    expanded  - 1.5× standard tonnage @ 20% of spec buy price */
export type CargoBellyTier = "none" | "standard" | "expanded";

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
  /** Display-only counterparty name. Persisted on the loan so the
   *  same lender shows up on every panel (Financials list, Endgame
   *  debrief, etc.) instead of being randomly re-rolled per render.
   *  Older saves may omit; UI falls back to "Bank loan #X". */
  lenderName?: string;
  /** Loan kind — surfaces "overdraft consolidation" loans in the UI
   *  so the player remembers why they took it. */
  source?: "borrowing" | "overdraft-refi";
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

export type TimedScenarioModifierKind =
  | "digital-full"
  | "digital-phased"
  | "digital-reskill"
  | "aging-operations"
  | "blue-ocean-first"
  | "blue-ocean-deepen"
  | "blue-ocean-split"
  | "political-favour-full"
  | "political-favour-partial"
  | "political-favour-subsidy";

export interface TimedScenarioModifier {
  id: string;
  kind: TimedScenarioModifierKind;
  activeFromQuarter: number;
  activeUntilQuarter: number;
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
  | "global-network"
  /** Legacy saves used this id before the network doctrine replaced it. */
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
  timedModifiers?: TimedScenarioModifier[];

  /** Audit log of every aircraft that has exited the fleet — sold
   *  on the secondary market, retired (auto-scrapped on lifespan
   *  end), returned to a lessor at end of lease term, or crashed.
   *  Surfaced in a History panel under Fleet so the player can
   *  account for vanished tail numbers. Optional for back-compat
   *  with persisted saves predating this field. */
  retiredHistory?: Array<{
    id: string;
    specId: string;
    specName: string;
    acquiredAtQuarter: number;
    exitQuarter: number;
    exitReason: "retired" | "sold" | "lease-returned" | "crashed";
    proceedsUsd: number;
    acquisitionType: "buy" | "lease";
  }>;

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

  /** Non-aviation subsidiary businesses owned by the airline.
   *  Each subsidiary generates quarterly revenue, appreciates over
   *  time, and can be sold to another airline (or to the open market
   *  as a generic counterparty if no other airline is interested).
   *  Some types ALSO grant operational benefits (maintenance hub
   *  reduces costs at its city, fuel storage enables bulk buying,
   *  premium lounge raises F/C occupancy at its airport). */
  subsidiaries?: Subsidiary[];

  // Labour Relations Score (PRD E8.3)
  labourRelationsScore: number;          // 0..100

  /** Recurring percent-point surcharge on quarterly staff cost.
   *  Applied as `staffCost × (1 + pct)` every quarter for the rest of
   *  the campaign. Set by the S14 talent-heist "Full Counter Offer"
   *  option (default 10%); the facilitator can adjust it from the
   *  AdminPanel staff-cost section. 0 = no surcharge. */
  recurringStaffSurchargePct?: number;

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

  // History — full P&L line items per closed quarter so the
  // Financials tab can render a real income statement (not just the
  // projected next quarter) and so charts have real series to plot.
  financialsByQuarter: Array<{
    quarter: number;
    cash: number;
    debt: number;
    revenue: number;
    passengerRevenue?: number;
    cargoRevenue?: number;
    /** Net airport-ownership revenue this quarter (slot fees collected
     *  from operating airlines minus 30% opex minus own intra-company
     *  fees). Surfaced as a separate P&L line. */
    airportRevenue?: number;
    /** Subsidiary revenue (hotel, limo, lounge, MRO, fuel storage,
     *  catering, training academy) summed across all owned holdings. */
    subsidiaryRevenue?: number;
    costs: number;
    /** Operating cost breakdown (optional — older saves may omit). */
    fuelCost?: number;
    slotCost?: number;
    staffCost?: number;
    /** Quarterly lease fees on every active leased aircraft this round
     *  (7.5% × spec buy price). Earlier rolled into "Other slider"; now
     *  a distinct P&L line so the player sees the lease drag clearly. */
    leaseFeesUsd?: number;
    otherSliderCost?: number;
    /** Operating cost split — Marketing / Service / Operations / Customer-Service
     *  sliders broken out so the Financials tab can show what's inside the
     *  "Other slider spend" line. Older saves may omit; UI must fall back. */
    marketingCost?: number;
    serviceCost?: number;
    operationsCost?: number;
    customerServiceCost?: number;
    maintenanceCost?: number;
    insuranceCost?: number;
    depreciation?: number;
    interest?: number;
    /** Taxes & Government Levies bucket. Combines income tax + carbon
     *  levy + passenger departure tax + fuel excise + service-route
     *  obligation fines (S5 etc). One row in the P&L UI. */
    taxesAndLevies?: number;
    /** Subset of taxesAndLevies — the regulatory fines specifically,
     *  surfaced as a sub-line so the player can see WHY their tax bill
     *  spiked (S5 obligation, future regulatory penalties, etc.). */
    obligationFinesUsd?: number;
    netProfit: number;
    brandPts: number;
    opsPts: number;
    loyalty: number;
    brandValue: number;
    /** Leaderboard rank at this quarter's close (1 = leader). Set by
     *  the closeQuarter action after every team has run. Used by the
     *  Leaderboard panel to show Q/Q movement (▲ ▼ arrows + delta). */
    rank?: number;
    /** Airline value at this quarter's close. Snapshotted so the
     *  leaderboard can show "gap to next rank" and trend without
     *  re-deriving from cash + brandValue alone. */
    airlineValue?: number;
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

  /** Pending + historical airport-acquisition bids. Players submit a
   *  bid via `submitAirportBid`; cash is escrowed immediately and the
   *  bid sits here as `pending` until the facilitator approves or
   *  rejects (or 2 quarters pass and it auto-expires). Approved bids
   *  transfer ownership; rejected/expired bids refund the held cash. */
  airportBids?: AirportBid[];

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

  /** Per-quarter snapshot of the three macro indices (fuel / travel /
   *  base interest rate) so the Reports tab can render real charts of
   *  market vitals over the campaign. Appended at every quarter close;
   *  a new game starts with a single Q1 baseline entry. Optional for
   *  back-compat with persisted saves predating this field. */
  marketHistory?: Array<{
    quarter: number;
    fuelIndex: number;
    travelIndex: number;
    baseRatePct: number;
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

/** Subsidiary business types — each one is a non-aviation revenue
 *  asset the airline can build at one of its hubs/network cities. */
export type SubsidiaryType =
  | "hotel"             // 5-star airport hotel — premium revenue
  | "limo"              // limo / chauffeur service for premium pax
  | "lounge"            // premium lounge — also boosts F/C occupancy
  | "maintenance-hub"   // MRO facility — reduces fleet maintenance cost
  | "fuel-storage"      // bulk-buy depot — enables 25% off fuel buys
  | "catering"          // in-flight catering — small revenue, ops bonus
  | "training-academy"; // pilot/crew academy — ops slider boost

/** A single subsidiary instance owned by a team. The airline can hold
 *  multiple subsidiaries of the same type at different cities. Each
 *  appreciates ~2% per quarter (toward a 1.5× ceiling) and pays its
 *  configured `revenuePerQuarterUsd` × condition factor each round.
 *  Selling cashes out at the current `marketValue` minus a 5% broker
 *  fee, mirroring how aircraft second-hand listings work. */
export interface Subsidiary {
  id: string;
  type: SubsidiaryType;
  /** City code where this subsidiary operates. Drives the operational
   *  bonus eligibility (e.g. fuel-storage at hub X reduces fuel for
   *  routes from X). */
  cityCode: string;
  /** Quarter the subsidiary was acquired/built. */
  acquiredAtQuarter: number;
  /** Original cost paid (matches the catalog setupCostUsd at build time). */
  purchaseCostUsd: number;
  /** Current market value — appreciates toward 1.5× over the campaign
   *  unless cancelled or condition collapses. Drives the sell-back price. */
  marketValueUsd: number;
  /** 0..1 condition multiplier on revenue. Default 1.0; future events
   *  (fire, strike, regional shock) can knock it down. */
  conditionPct: number;
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
 *    cancelled → 50% of deposit kept as penalty, 50% refunded
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
  /** Cabin amenities chosen at purchase order. Carry-through to the
   *  delivered FleetAircraft. */
  cabinAmenities?: CabinAmenities;
  /** Cargo belly tier on a passenger frame. Carry-through to delivery. */
  cargoBelly?: CargoBellyTier;
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
  /** Team id of the airline that has acquired the airport outright
   *  (Sprint 10). When set, bidding at this airport is disabled — the
   *  owner sets a fixed slot rate (`ownerSlotRatePerWeekUsd`) that any
   *  team flying through here pays directly to the owner. The owner
   *  also collects the per-slot revenue and pays operating costs;
   *  selling the airport reverses everything. Undefined = unowned,
   *  default bidding system applies. */
  ownerTeamId?: string;
  /** Owner-imposed weekly fee per slot. Replaces the auction-cleared
   *  price when ownerTeamId is set. */
  ownerSlotRatePerWeekUsd?: number;
  /** Effective tier override after a government-funded upgrade (Sprint 11).
   *  When set, the engine reads this instead of CITY.tier for demand
   *  growth + storage cost lookups. Only assigned when an upgrade
   *  actually fired — owned airports skip the auto-upgrade and the
   *  override stays undefined. */
  tierOverride?: number;
  /** Total runway capacity at the airport — the cap on
   *  Σ(team slot leases) + available. Capacity grows in +200 chunks
   *  via owner-funded expansions. Undefined = "default" (the engine
   *  treats this as effectively unlimited for the auction path). */
  totalCapacity?: number;
  /** Quarter the airport was acquired (drives appreciation + history). */
  acquiredAtQuarter?: number;
  /** Original purchase price paid (for cost-basis display). */
  purchaseCostUsd?: number;
}

/** Pending bid to acquire an airport outright. Submitted by a player
 *  team and held in escrow (cash already deducted) until the
 *  facilitator/admin approves or rejects, or the 2-quarter approval
 *  window expires (auto-reject + refund). Real-world airports require
 *  government approval for transfer of operating control; in-game the
 *  facilitator plays the role of the regulator. */
export interface AirportBid {
  /** Stable id, "abid_<random>". */
  id: string;
  /** IATA code of the airport being bid on. */
  airportCode: string;
  /** Team submitting the bid (cash already escrowed from this team). */
  bidderTeamId: string;
  /** Price the bidder is willing to pay. Defaults to the live asking
   *  price at submission time but the bidder could overbid in future. */
  bidPriceUsd: number;
  /** Lifecycle. `pending` = awaiting facilitator decision. `approved` =
   *  ownership transferred + held cash committed. `rejected` = held
   *  cash returned to bidder. `expired` = 2Q passed with no decision,
   *  treated as rejection. */
  status: "pending" | "approved" | "rejected" | "expired";
  /** Quarter the bid was submitted (used for the 2Q expiry window). */
  submittedQuarter: number;
  /** Quarter the bid was resolved (approved/rejected/expired). */
  resolvedQuarter?: number;
  /** Optional facilitator-supplied reason on reject. Stored for audit
   *  and surfaced in the player's notification. */
  resolutionNote?: string;
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
