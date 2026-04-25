"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { CITIES_BY_CODE } from "@/data/cities";
import { SCENARIOS, SCENARIOS_BY_QUARTER, type OptionEffect } from "@/data/scenarios";
import {
  applyOptionEffect,
  computeBrandValue,
  distanceBetween,
  runQuarterClose,
  serializeEffect,
  type QuarterCloseResult,
} from "@/lib/engine";
import {
  applyYearlyTickIfDue,
  makeInitialAirportSlots,
  resolveSlotAuctions,
  type BidEntry,
} from "@/lib/slots";
import { toast } from "./toasts";
import { fmtQuarter } from "@/lib/format";
import { planBotAircraftOrder, planBotRoutes } from "@/lib/ai-bots";
import type {
  AirportLease,
  CabinConfig,
  CargoContract,
  DeferredEvent,
  DoctrineId,
  FleetAircraft,
  GameState,
  LoanInstrument,
  PricingTier,
  Route,
  ScenarioDecision,
  SecondHandListing,
  SliderLevel,
  Sliders,
  Team,
} from "@/types/game";

// ─── Mocked competitor names for single-team leaderboard ────
const MOCK_COMPETITOR_NAMES: Array<{ name: string; code: string; color: string; hub: string }> = [
  { name: "Aurora Airways",    code: "AUR", color: "#2B6B88", hub: "SIN" },
  { name: "Sundial Carriers",  code: "SND", color: "#7A4B2E", hub: "LHR" },
  { name: "Meridian Air",      code: "MRD", color: "#1E6B5C", hub: "DXB" },
  { name: "Pacific Crest",     code: "PCC", color: "#C38A1E", hub: "NRT" },
  { name: "Transit Nordique",  code: "TND", color: "#4A6480", hub: "CPH" },
  { name: "Solstice Wings",    code: "SOL", color: "#9A7D3D", hub: "JNB" },
  { name: "Vermilion Air",     code: "VML", color: "#C23B1F", hub: "GRU" },
  { name: "Firth Pacific",     code: "FTH", color: "#6B5F88", hub: "HKG" },
  { name: "Anchor Continental", code: "ACT", color: "#4B7A2E", hub: "ORD" },
];

// ─── Game store ─────────────────────────────────────────────
export interface GameStore extends GameState {
  // Last quarter close result (for the modal)
  lastCloseResult: QuarterCloseResult | null;

  // ── Actions ───────────────────────────────────────────────
  startNewGame(args: {
    airlineName: string;
    code: string;
    doctrine: DoctrineId;
    hubCode: string;
    teamCount?: number;        // 2..10, default 5

    // Optional Q1 Brand Building profile (defaults applied if omitted)
    tagline?: string;
    marketFocus?: "passenger" | "cargo" | "balanced";
    geographicPriority?: "north-america" | "europe" | "asia-pacific" | "middle-east" | "global";
    pricingPhilosophy?: "budget" | "standard" | "premium" | "ultra";
    salaryPhilosophy?: "below" | "at" | "above";
    marketingLevel?: "low" | "medium" | "high" | "aggressive";
    csrTheme?: "environment" | "community" | "employees" | "none";

    /** Simulated L0 rank (1-5) → cash injection + brand multiplier. */
    l0Rank?: 1 | 2 | 3 | 4 | 5;
  }): void;

  setSliders(sliders: Partial<Sliders>): void;

  orderAircraft(args: {
    specId: string;
    acquisitionType: "buy" | "lease";
    cabinConfig?: CabinConfig;
    /** Number of identical aircraft to order in this transaction (default 1). */
    quantity?: number;
    /** Custom seat allocation. Must satisfy seat-equivalence:
     *  first × 3 + business × 2 + economy ≤ spec.totalEquivalents. */
    customSeats?: { first: number; business: number; economy: number };
    /** Engine retrofit at purchase: "fuel" / "power" / "super" / null. */
    engineUpgrade?: "fuel" | "power" | "super" | null;
    /** Fuselage coating retrofit at purchase. */
    fuselageUpgrade?: boolean;
  }): { ok: boolean; error?: string };

  addEcoUpgrade(aircraftId: string): { ok: boolean; error?: string };

  /** Retrofit an existing aircraft's engine. Costs same as at-purchase
   *  upgrade. Aircraft must be active or grounded; can't retrofit while
   *  ordered or retired. */
  retrofitEngine(
    aircraftId: string,
    kind: "fuel" | "power" | "super",
  ): { ok: boolean; error?: string };

  /** Retrofit fuselage coating on an existing aircraft. */
  retrofitFuselage(aircraftId: string): { ok: boolean; error?: string };

  decommissionAircraft(aircraftId: string): void;

  renovateAircraft(aircraftId: string, newCabin: CabinConfig):
    { ok: boolean; error?: string };

  openRoute(args: {
    originCode: string;
    destCode: string;
    aircraftIds: string[];
    dailyFrequency: number;
    pricingTier: PricingTier;
    econFare?: number | null;
    busFare?: number | null;
    firstFare?: number | null;
    isCargo?: boolean;
    /** Optional auto-bids for slot shortfalls. Each entry submits a slot
     *  bid AT route-open time so the player doesn't have to leave the
     *  modal. The route is created in "pending" status and activates at
     *  next quarter-close with effective frequency = min(intended,
     *  slots_won_at_each_endpoint). */
    slotBids?: Array<{ airportCode: string; pricePerSlot: number; slots?: number }>;
  }): { ok: boolean; error?: string };

  closeRoute(routeId: string): void;

  /** Cancel a pending route (one whose status is "pending"). Frees its
   *  aircraft to idle, removes the route. Pending bids for the airports
   *  remain queued — release them via Slot Market if you want a refund
   *  on the auction. */
  cancelPendingRoute(routeId: string): { ok: boolean; error?: string };
  updateRoute(routeId: string, patch: {
    dailyFrequency?: number;
    pricingTier?: PricingTier;
    econFare?: number | null;
    busFare?: number | null;
    firstFare?: number | null;
    aircraftIds?: string[];
  }): { ok: boolean; error?: string };

  submitDecision(args: {
    scenarioId: string;
    optionId: "A" | "B" | "C" | "D" | "E";
    lockInQuarters?: number;
  }): void;

  borrowCapital(amount: number): { ok: boolean; error?: string };
  repayLoan(loanId: string): { ok: boolean; error?: string };
  refinanceLoan(loanId: string): { ok: boolean; error?: string };

  closeQuarter(): void;
  advanceToNext(): void;
  resetGame(): void;

  /** Facilitator-only: switch which team the main UI views as. Pivots
   *  `playerTeamId` so all selectors that derive from it follow the
   *  switch. Pure UI helper — does not modify any team's data. */
  setActiveTeam(teamId: string): void;

  /** Facilitator: generate a 4-digit join code and reserve N seats for
   *  players. Each seat is unclaimed until a player visits /join. Wipes
   *  any previous session. */
  startFacilitatedSession(seatCount: number): { code: string };
  /** Player: join an active session with code + company name. Claims an
   *  unbound seat, creates a team for them, and pivots playerTeamId. */
  joinSessionWithCode(args: {
    code: string;
    companyName: string;
    hubCode: string;
  }): { ok: boolean; error?: string };

  /** Facilitator: apply a live-simulation outcome to a team. Used for
   *  L0 Brand Building, L1 Strike, L2 Talent Heist, L3 Whistleblower,
   *  L4 Podium, L5 Project Aurora, L6 FIFA Elevator, L7 Crisis Ops.
   *  Each delta is applied directly; mvp points credit per role; flags
   *  are set/cleared as named. */
  applyLiveSimOutcome(args: {
    teamId: string;
    simId: "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
    cashDelta?: number;
    brandPtsDelta?: number;
    opsPtsDelta?: number;
    loyaltyDelta?: number;
    mvpByRole?: Partial<Record<"CEO" | "CFO" | "CMO" | "CHRO", number>>;
    setFlags?: string[];
    clearFlags?: string[];
    notes?: string;
  }): { ok: boolean; error?: string };

  addSecondaryHub(cityCode: string): { ok: boolean; error?: string };
  removeSecondaryHub(cityCode: string): void;
  claimFlashDeal(count: number): { ok: boolean; error?: string };

  /** Admin: clear a submitted decision so the player can re-submit. */
  adminClearDecision(scenarioId: string, quarter: number): void;
  /** Admin: force-apply a new option for a scenario, replacing any prior decision. */
  adminOverrideDecision(
    scenarioId: string,
    newOptionId: "A" | "B" | "C" | "D" | "E",
  ): { ok: boolean; error?: string };

  /** Admin: award MVP points + optional card to a specific role. */
  awardMvp(role: "CEO" | "CFO" | "CMO" | "CHRO", pts: number, card?: string): void;
  /** Admin: rename a team member. */
  renameMember(role: "CEO" | "CFO" | "CMO" | "CHRO", name: string): void;

  /** Set the player team's insurance policy (PRD E5). */
  setInsurancePolicy(policy: "none" | "low" | "medium" | "high"): void;

  /** Fuel Storage (PRD E2) */
  buyFuelTank(size: "small" | "medium" | "large"): { ok: boolean; error?: string };
  buyBulkFuel(litres: number): { ok: boolean; error?: string };
  sellStoredFuel(litres: number): { ok: boolean; error?: string };

  /** Slot auction (PRD G10) */
  submitSlotBid(airportCode: string, slots: number, pricePerSlot: number):
    { ok: boolean; error?: string };
  cancelSlotBid(airportCode: string): void;
  /** Release N slots back to the airport pool. Stops the recurring weekly
   *  fee on those slots and frees airport capacity. PRD update Model B. */
  releaseSlots(airportCode: string, slotsToRelease: number):
    { ok: boolean; error?: string };
  /** Admin: release N slots at an airport, resolving queued bids highest-first. */
  adminReleaseSlots(airportCode: string, slots: number): void;

  /** Hub Infrastructure (PRD D4) */
  buyHubInvestment(
    kind: "fuelReserveTank" | "maintenanceDepot" | "premiumLounge" | "opsExpansion",
    hubCode?: string,
  ): { ok: boolean; error?: string };

  /** Suspend an active route (PRD E8.5/G11). */
  suspendRoute(routeId: string): { ok: boolean; error?: string };
  resumeRoute(routeId: string): { ok: boolean; error?: string };

  /** List an aircraft on the second-hand market (A13). */
  listSecondHand(aircraftId: string, askingPriceUsd: number): { ok: boolean; error?: string };
  /** Buy from the second-hand market. */
  buySecondHand(listingId: string): { ok: boolean; error?: string };
  /** Admin: inject a new listing from the system. */
  adminInjectSecondHand(specId: string, askingPriceUsd: number): void;

  /** Admin: award a cargo contract to the current player team (PRD E8.6). */
  adminGrantCargoContract(args: {
    originCode: string;
    destCode: string;
    tonnesPerWeek: number;
    ratePerTonneUsd: number;
    quarters: number;
    source: string;
  }): void;

  /** Admin: refund 50% of slot fees on a grounded route for the current quarter (PRD G6). */
  adminGroundStopRefund(routeId: string): void;

  /** Admin: fire a queued deferred event on the player team immediately,
   *  bypassing its rolled probability. Useful for facilitator-driven plot
   *  twists in live sessions (PRD §10.7). */
  adminTriggerDeferred(eventId: string): void;

  /** Admin: shock the market — apply a fuel index spike that decays over
   *  three quarters. Used for facilitator-driven crises. */
  adminFuelShock(magnitude: number): void;

  /** Start the simulation with pre-seeded demo data (PRD §24). */
  startDemo(): void;

  // Quarter timer (A12)
  startQuarterTimer(seconds?: number): void;
  pauseQuarterTimer(): void;
  resumeQuarterTimer(): void;
  extendQuarterTimer(seconds: number): void;
  tickQuarterTimer(deltaSeconds: number): void;
}

const INITIAL_SLIDERS: Sliders = {
  staff: 2, marketing: 2, service: 2, rewards: 2, operations: 2, customerService: 2,
};

function emptyStreaks() {
  const out: Team["sliderStreaks"] = {
    staff: { level: 2, quarters: 0 },
    marketing: { level: 2, quarters: 0 },
    service: { level: 2, quarters: 0 },
    rewards: { level: 2, quarters: 0 },
    operations: { level: 2, quarters: 0 },
    customerService: { level: 2, quarters: 0 },
  };
  return out;
}

function mkId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function fmtMoneyPlain(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function makeStartingTeam(args: {
  airlineName: string;
  code: string;
  doctrine: DoctrineId;
  hubCode: string;
  isPlayer: boolean;
  color: string;
  tagline?: string;
  marketFocus?: Team["marketFocus"];
  geographicPriority?: Team["geographicPriority"];
  pricingPhilosophy?: Team["pricingPhilosophy"];
  salaryPhilosophy?: Team["salaryPhilosophy"];
  marketingLevel?: Team["marketingLevel"];
  csrTheme?: Team["csrTheme"];
}): Team {
  return {
    id: mkId("team"),
    name: args.airlineName,
    code: args.code,
    color: args.color,
    hubCode: args.hubCode,
    secondaryHubCodes: [],
    doctrine: args.doctrine,
    isPlayer: args.isPlayer,
    members: [
      { role: "CEO",  name: args.isPlayer ? "Your CEO"  : `${args.code} CEO`,  mvpPts: 0, cards: [] },
      { role: "CFO",  name: args.isPlayer ? "Your CFO"  : `${args.code} CFO`,  mvpPts: 0, cards: [] },
      { role: "CMO",  name: args.isPlayer ? "Your CMO"  : `${args.code} CMO`,  mvpPts: 0, cards: [] },
      { role: "CHRO", name: args.isPlayer ? "Your CHRO" : `${args.code} CHRO`, mvpPts: 0, cards: [] },
    ],
    tagline: args.tagline ?? "",
    marketFocus: args.marketFocus ?? "balanced",
    geographicPriority: args.geographicPriority ?? "global",
    pricingPhilosophy: args.pricingPhilosophy ?? "standard",
    salaryPhilosophy: args.salaryPhilosophy ?? "at",
    marketingLevel: args.marketingLevel ?? "medium",
    csrTheme: args.csrTheme ?? "none",
    cashUsd: 150_000_000,
    totalDebtUsd: 0,
    loans: [],
    fleet: [],
    routes: [],
    brandPts: 50,
    opsPts: 50,
    customerLoyaltyPct: 50,
    brandValue: 50,
    sliders: INITIAL_SLIDERS,
    sliderStreaks: emptyStreaks(),
    decisions: [],
    flags: new Set<string>(),
    deferredEvents: [],
    rcfBalanceUsd: 0,
    taxLossCarryForward: [],
    insurancePolicy: "none",
    fuelTanks: { small: 0, medium: 0, large: 0 },
    fuelStorageLevelL: 0,
    fuelStorageAvgCostPerL: 0,
    // PRD G10 — each team starts with 50 slots at their hub (free,
    // grandfathered baked into the hub terminal fee). Legacy field
    // kept for save migration; airportLeases is the active bookkeeping
    // model now.
    slotsByAirport: { [args.hubCode]: 50 },
    // PRD update — Model B recurring slot fees. Hub seed is free so
    // totalWeeklyCost is 0; new slots won via auction add their weekly
    // rent to the lease.
    airportLeases: { [args.hubCode]: { slots: 50, totalWeeklyCost: 0 } },
    pendingSlotBids: [],
    // PRD C9 — hub auto-activated for cargo (bundled with hub terminal fee)
    cargoStorageActivations: [args.hubCode],
    hubInvestments: {
      fuelReserveTankHubs: [],
      maintenanceDepotHubs: [],
      premiumLoungeHubs: [],
      opsExpansionSlots: 0,
    },
    labourRelationsScore: 50,
    milestones: [],
    consecutiveProfitableQuarters: 0,
    financialsByQuarter: [],
  };
}

function ensureStreaks(t: Team): Team {
  // Backfill ALL slider streaks defensively. Old saves are missing keys that
  // newer engine code reads (e.g. customerService, rewards) and would crash on.
  const empty = emptyStreaks();
  const merged = { ...empty, ...(t.sliderStreaks ?? {}) };
  // Make sure each entry is itself a valid {level, quarters} record
  for (const k of Object.keys(empty) as Array<keyof typeof empty>) {
    if (!merged[k] || typeof (merged[k] as { level?: unknown }).level !== "number") {
      merged[k] = empty[k];
    }
  }
  return { ...t, sliderStreaks: merged };
}

export const useGame = create<GameStore>()(
  persist(
    (set, get) => ({
      phase: "idle",
      currentQuarter: 1,
      fuelIndex: 100,
      baseInterestRatePct: 3.5,
      teams: [],
      playerTeamId: null,
      lastCloseResult: null,
      quarterTimerSecondsRemaining: null,
      quarterTimerPaused: false,
      secondHandListings: [],
      cargoContracts: [],
      airportSlots: {},
      sessionCode: null,
      sessionSlots: [],

      startNewGame: (args) => {
        const {
          airlineName, code, doctrine, hubCode, teamCount = 5,
          tagline, marketFocus, geographicPriority, pricingPhilosophy,
          salaryPhilosophy, marketingLevel, csrTheme, l0Rank,
        } = args;

        const player = makeStartingTeam({
          airlineName, code, doctrine, hubCode,
          isPlayer: true, color: "#14355E",
          tagline, marketFocus, geographicPriority, pricingPhilosophy,
          salaryPhilosophy, marketingLevel, csrTheme,
        });

        // Apply pricing philosophy to initial sliders as a nudge
        if (marketingLevel) {
          const lvl: Record<typeof marketingLevel, SliderLevel> = {
            low: 1, medium: 2, high: 3, aggressive: 4,
          };
          player.sliders.marketing = lvl[marketingLevel];
        }
        if (salaryPhilosophy) {
          player.sliders.staff = salaryPhilosophy === "below" ? 1
            : salaryPhilosophy === "above" ? 3 : 2;
        }

        // PRD §13.2 L0 cash injection based on presentation rank (1-5)
        // 1st = +$80M, 2nd = +$60M, 3rd = +$40M, 4th = +$20M, 5th = +$0
        const cashInjection = l0Rank === 1 ? 80_000_000
          : l0Rank === 2 ? 60_000_000
          : l0Rank === 3 ? 40_000_000
          : l0Rank === 4 ? 20_000_000
          : 0;
        player.cashUsd = 150_000_000 + cashInjection;
        // Brand pts multiplier: 10× / 7× / 5× / 3× / 2× baseline 50 (scaled down)
        const brandBonus = l0Rank === 1 ? 20
          : l0Rank === 2 ? 14
          : l0Rank === 3 ? 10
          : l0Rank === 4 ? 6
          : 4;
        player.brandPts = 50 + brandBonus;

        // Seed: give player 2× A320 to start. Onboarding *is* the PRD's Q1
        // brand-building phase — the player commits to doctrine, market focus,
        // pricing, salary, marketing and CSR there, then walks into Q2 with
        // the resulting cash injection and brand bonus already baked in.
        const starter1: FleetAircraft = {
          id: mkId("ac"), specId: "A320", status: "active",
          acquisitionType: "buy", purchaseQuarter: 1,
          purchasePrice: 25_000_000, bookValue: 25_000_000,
          leaseQuarterly: null, ecoUpgrade: false, ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
          cabinConfig: "default", routeId: null,
          retirementQuarter: 1 + 16, // 20 real years → 16 quarters
          maintenanceDeficit: 0, satisfactionPct: 75,
        };
        const starter2: FleetAircraft = { ...starter1, id: mkId("ac") };
        player.fleet = [starter1, starter2];

        // PRD update — give the player a small grant of free starter slots
        // at their hub's nearest popular destinations so they can open
        // routes in Q2 without waiting for the first auction round.
        // Per-airport allocation: 30 free slots, no recurring fee.
        const STARTER_DESTINATIONS_BY_HUB: Record<string, string[]> = {
          DXB: ["LHR", "JFK", "SIN", "CDG", "BOM"],
          LHR: ["JFK", "DXB", "CDG", "FRA", "AMS"],
          JFK: ["LHR", "CDG", "LAX", "MIA", "ORD"],
          SIN: ["HKG", "BKK", "KUL", "BOM", "SYD"],
          NRT: ["HKG", "SIN", "LAX", "ICN", "PVG"],
          HKG: ["NRT", "SIN", "BKK", "PVG", "SYD"],
          CDG: ["LHR", "JFK", "FRA", "AMS", "MAD"],
          FRA: ["LHR", "CDG", "JFK", "AMS", "ZRH"],
          ORD: ["JFK", "LAX", "SFO", "LHR", "FRA"],
          LAX: ["JFK", "ORD", "SFO", "NRT", "SYD"],
        };
        const starterDests = STARTER_DESTINATIONS_BY_HUB[hubCode] ??
          ["LHR", "JFK", "SIN", "CDG", "DXB"];
        for (const dest of starterDests) {
          player.slotsByAirport[dest] = 30;
          player.airportLeases[dest] = { slots: 30, totalWeeklyCost: 0 };
        }

        // Backfill a Q1 "brand-building" snapshot so charts/sparklines have
        // an honest starting point. Costs/revenue are 0 — Q1 was about
        // identity, not operations.
        player.financialsByQuarter = [{
          quarter: 1,
          cash: player.cashUsd,
          debt: 0,
          revenue: 0,
          costs: 0,
          netProfit: 0,
          brandPts: player.brandPts,
          opsPts: player.opsPts,
          loyalty: player.customerLoyaltyPct,
          brandValue: player.brandValue,
        }];

        // Mock competitors
        const rivals: Team[] = [];
        const rivalCount = Math.max(0, Math.min(9, teamCount - 1));
        for (let i = 0; i < rivalCount; i++) {
          const meta = MOCK_COMPETITOR_NAMES[i];
          if (!meta) break;
          // Make sure competitor hub doesn't collide with player hub
          const hub = meta.hub === hubCode
            ? MOCK_COMPETITOR_NAMES[(i + 5) % MOCK_COMPETITOR_NAMES.length].hub
            : meta.hub;
          // Spread rival doctrines so the leaderboard has visible diversity
          // of strategies competing on revenue/margin/fuel sensitivity.
          const rivalDoctrines: ("budget-expansion" | "premium-service" | "cargo-dominance" | "safety-first")[] = [
            "premium-service", "budget-expansion", "cargo-dominance",
            "safety-first", "premium-service", "budget-expansion",
            "cargo-dominance", "safety-first", "premium-service",
          ];
          const doctrine = rivalDoctrines[i % rivalDoctrines.length];
          const r = makeStartingTeam({
            airlineName: meta.name, code: meta.code, doctrine,
            hubCode: hub, isPlayer: false, color: meta.color,
          });
          // All AI rivals run as Medium-difficulty bots by default — they
          // open routes, order aircraft, and bid for slots each quarter.
          // Facilitator can override per-team via the admin console.
          r.botDifficulty = "medium";
          // Give rivals some routes/fleet to make leaderboard plausible
          r.brandPts = 40 + Math.floor(Math.random() * 30);
          r.customerLoyaltyPct = 45 + Math.floor(Math.random() * 20);
          r.cashUsd = 120_000_000 + Math.floor(Math.random() * 80_000_000);
          // Same Q1 backfill as the player so leaderboard charts align
          r.financialsByQuarter = [{
            quarter: 1,
            cash: r.cashUsd,
            debt: 0,
            revenue: 0,
            costs: 0,
            netProfit: 0,
            brandPts: r.brandPts,
            opsPts: r.opsPts,
            loyalty: r.customerLoyaltyPct,
            brandValue: r.brandValue,
          }];

          // Plausible rival route network — 4-6 destinations from their hub
          // to other major cities. Used for per-route competitor display
          // and for the engine's competitor-pressure factor.
          const RIVAL_DESTINATIONS: Record<string, string[]> = {
            SIN: ["HKG", "BKK", "KUL", "BOM", "SYD", "NRT"],
            LHR: ["JFK", "DXB", "CDG", "FRA", "HKG", "LAX"],
            DXB: ["LHR", "JFK", "NRT", "BOM", "CDG", "JNB"],
            NRT: ["HKG", "SIN", "LAX", "SFO", "ICN", "PVG"],
            CPH: ["ARN", "OSL", "LHR", "JFK", "FRA"],
            JNB: ["LHR", "DXB", "NBO", "CDG"],
            GRU: ["EZE", "MIA", "LIM", "JFK", "CDG"],
            HKG: ["NRT", "SIN", "BKK", "PVG", "SYD", "LAX"],
            ORD: ["JFK", "LAX", "SFO", "LHR", "CDG", "FRA"],
          };
          const dests = (RIVAL_DESTINATIONS[hub] ?? ["JFK", "LHR", "SIN", "DXB"]).slice(0, 4 + (i % 3));
          // Assign a single workhorse aircraft per rival route
          const rivalSpec = doctrine === "premium-service" ? "B777-200ER"
            : doctrine === "cargo-dominance" ? "B767-300F"
            : doctrine === "budget-expansion" ? "A320"
            : "A330-200";
          const rivalSpecPrice = AIRCRAFT_BY_ID[rivalSpec]?.buyPriceUsd ?? 30_000_000;
          for (const destCode of dests) {
            const destCity = CITIES_BY_CODE[destCode];
            if (!destCity) continue;
            const dist = distanceBetween(hub, destCode);
            const planeId = mkId("ac");
            r.fleet.push({
              id: planeId, specId: rivalSpec, status: "active",
              acquisitionType: "buy", purchaseQuarter: 1,
              purchasePrice: rivalSpecPrice, bookValue: rivalSpecPrice * 0.9,
              leaseQuarterly: null, ecoUpgrade: false,
              ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
              cabinConfig: "default", routeId: null,
              retirementQuarter: 1 + 16,
              maintenanceDeficit: 0, satisfactionPct: 70,
            });
            const dailyFreq = doctrine === "budget-expansion" ? 4
              : doctrine === "premium-service" ? 2 : 3;
            const tier = doctrine === "premium-service" ? "premium" as const
              : doctrine === "budget-expansion" ? "budget" as const
              : "standard" as const;
            const isCargo = doctrine === "cargo-dominance";
            const route = {
              id: mkId("route"),
              originCode: hub,
              destCode,
              distanceKm: dist,
              aircraftIds: [planeId],
              dailyFrequency: dailyFreq,
              pricingTier: tier,
              econFare: null, busFare: null, firstFare: null,
              status: "active" as const,
              openQuarter: 1,
              avgOccupancy: 0.55 + Math.random() * 0.25,
              quarterlyRevenue: dailyFreq * 7 * (isCargo ? 100_000 : 250_000),
              quarterlyFuelCost: dailyFreq * 7 * 30_000,
              quarterlySlotCost: dailyFreq * 7 * 12_000,
              isCargo,
              consecutiveQuartersActive: 1,
              consecutiveLosingQuarters: 0,
            };
            r.routes.push(route);
            // Link aircraft to route
            const planeIdx = r.fleet.findIndex((f) => f.id === planeId);
            if (planeIdx >= 0) r.fleet[planeIdx].routeId = route.id;
          }
          // Backfill rival airport leases for the airports they fly to,
          // so their existing routes are valid against the slot system.
          // Free starter slots (no recurring fee) for incumbents.
          const usage: Record<string, number> = {};
          for (const r2 of r.routes) {
            const wf = r2.dailyFrequency * 7;
            usage[r2.originCode] = (usage[r2.originCode] ?? 0) + wf;
            usage[r2.destCode] = (usage[r2.destCode] ?? 0) + wf;
          }
          for (const code of Object.keys(usage)) {
            r.airportLeases[code] = { slots: usage[code], totalWeeklyCost: 0 };
            r.slotsByAirport[code] = usage[code];
          }
          rivals.push(r);
        }

        set({
          phase: "playing",
          currentQuarter: 2, // skip Q1 brand-building for single-team demo
          fuelIndex: 108,
          baseInterestRatePct: 3.5,
          teams: [player, ...rivals],
          playerTeamId: player.id,
          lastCloseResult: null,
          airportSlots: makeInitialAirportSlots(),
        });

        if (l0Rank && l0Rank <= 3) {
          toast.accent(
            `L0 Brand Building · Rank ${l0Rank}`,
            `Cash injection +${fmtMoneyPlain(cashInjection)} · Brand +${brandBonus}`,
          );
        } else if (l0Rank) {
          toast.info(
            `L0 Brand Building · Rank ${l0Rank}`,
            cashInjection > 0
              ? `Cash injection +${fmtMoneyPlain(cashInjection)}`
              : "No cash injection — make your Q2 decisions count.",
          );
        }
      },

      setSliders: (sliders) => {
        const s = get();
        if (!s.playerTeamId) return;
        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, sliders: { ...t.sliders, ...sliders } }
              : t,
          ),
        });
      },

      orderAircraft: ({
        specId, acquisitionType, cabinConfig = "default",
        quantity = 1, customSeats, engineUpgrade = null, fuselageUpgrade = false,
      }) => {
        const s = get();
        const spec = AIRCRAFT_BY_ID[specId];
        if (!spec) return { ok: false, error: "Unknown aircraft" };
        if (spec.unlockQuarter > s.currentQuarter) {
          return { ok: false, error: `Not yet available — unlocks Q${spec.unlockQuarter}` };
        }
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const qty = Math.max(1, Math.floor(quantity));

        // Engine + fuselage upgrade pricing (Air-Tycoon-style retrofit fees).
        // These are per-aircraft costs added on top of the base buy/lease price.
        const ENGINE_FUEL_COST = 24_900_000;
        const ENGINE_POWER_COST = 24_900_000;
        const ENGINE_SUPER_COST = 49_800_000;
        const FUSELAGE_COST = 24_900_000;
        const upgradeCostPerPlane =
          (engineUpgrade === "fuel" ? ENGINE_FUEL_COST :
           engineUpgrade === "power" ? ENGINE_POWER_COST :
           engineUpgrade === "super" ? ENGINE_SUPER_COST : 0) +
          (fuselageUpgrade ? FUSELAGE_COST : 0);

        // Validate custom seat allocation against the seat-equivalence cap:
        //   first × 3 + business × 2 + economy ≤ defaultEquivalents.
        // (Cargo aircraft skip — they have no seats.)
        const defaultEquivalents =
          spec.seats.first * 3 + spec.seats.business * 2 + spec.seats.economy;
        if (customSeats && spec.family === "passenger") {
          const customEquivalents =
            customSeats.first * 3 + customSeats.business * 2 + customSeats.economy;
          if (customEquivalents > defaultEquivalents + 1) {
            return {
              ok: false,
              error: `Custom cabin exceeds airframe capacity ` +
                `(${customEquivalents} > ${defaultEquivalents} seat-equivalents)`,
            };
          }
        }

        const basePrice = acquisitionType === "buy" ? spec.buyPriceUsd : spec.leasePerQuarterUsd;
        const totalPerPlane = basePrice + upgradeCostPerPlane;
        const totalCost = totalPerPlane * qty;
        if (player.cashUsd < totalCost) {
          return {
            ok: false,
            error: `Insufficient cash — need ${fmtMoneyPlain(totalCost)} for ` +
              `${qty} × ${spec.name}${upgradeCostPerPlane > 0 ? " w/ upgrades" : ""}`,
          };
        }

        const planes: FleetAircraft[] = Array.from({ length: qty }, () => ({
          id: mkId("ac"), specId, status: "ordered" as const,
          acquisitionType, purchaseQuarter: s.currentQuarter,
          purchasePrice: acquisitionType === "buy" ? totalPerPlane : 0,
          bookValue: acquisitionType === "buy" ? totalPerPlane : 0,
          leaseQuarterly: acquisitionType === "lease" ? spec.leasePerQuarterUsd : null,
          ecoUpgrade: false, ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
          cabinConfig, routeId: null,
          customSeats: customSeats && spec.family === "passenger" ? customSeats : undefined,
          engineUpgrade: engineUpgrade ?? null,
          fuselageUpgrade: !!fuselageUpgrade,
          retirementQuarter: s.currentQuarter + 16,
          maintenanceDeficit: 0, satisfactionPct: 75,
        }));

        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, cashUsd: t.cashUsd - totalCost, fleet: [...t.fleet, ...planes] }
              : t,
          ),
        });
        toast.success(
          `${qty}× ${spec.name} ${acquisitionType === "buy" ? "purchased" : "leased"}`,
          `${fmtMoneyPlain(totalCost)} total · arrives Q${s.currentQuarter + 1}` +
            (upgradeCostPerPlane > 0
              ? ` · upgrades: ${[engineUpgrade, fuselageUpgrade && "fuselage"].filter(Boolean).join(", ")}`
              : ""),
        );
        return { ok: true };
      },

      addEcoUpgrade: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        const spec = AIRCRAFT_BY_ID[plane.specId];
        if (!spec) return { ok: false, error: "Spec missing" };
        if (plane.ecoUpgrade) return { ok: false, error: "Already upgraded" };
        if (player.cashUsd < spec.ecoUpgradeUsd)
          return { ok: false, error: "Insufficient cash" };

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd - spec.ecoUpgradeUsd,
              fleet: t.fleet.map((f) => f.id === aircraftId
                ? { ...f, ecoUpgrade: true, ecoUpgradeQuarter: s.currentQuarter, ecoUpgradeCost: spec.ecoUpgradeUsd }
                : f),
            },
          ),
        });
        return { ok: true };
      },

      retrofitEngine: (aircraftId, kind) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.status !== "active" && plane.status !== "grounded") {
          return { ok: false, error: `Cannot retrofit ${plane.status} aircraft` };
        }
        if (plane.engineUpgrade && plane.engineUpgrade !== null) {
          return {
            ok: false,
            error: `Engine already retrofitted (${plane.engineUpgrade}). Decommission and re-order to change.`,
          };
        }
        const cost =
          kind === "fuel" ? 24_900_000 :
          kind === "power" ? 24_900_000 :
          49_800_000;
        if (player.cashUsd < cost)
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash` };

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd - cost,
              fleet: t.fleet.map((f) =>
                f.id === aircraftId ? { ...f, engineUpgrade: kind } : f,
              ),
            },
          ),
        });
        toast.success(
          `Engine retrofit installed`,
          `${AIRCRAFT_BY_ID[plane.specId]?.name} · ${kind} · −${fmtMoneyPlain(cost)}`,
        );
        return { ok: true };
      },

      retrofitFuselage: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.status !== "active" && plane.status !== "grounded") {
          return { ok: false, error: `Cannot retrofit ${plane.status} aircraft` };
        }
        if (plane.fuselageUpgrade) {
          return { ok: false, error: "Fuselage coating already applied" };
        }
        const cost = 24_900_000;
        if (player.cashUsd < cost)
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash` };

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd - cost,
              fleet: t.fleet.map((f) =>
                f.id === aircraftId ? { ...f, fuselageUpgrade: true } : f,
              ),
            },
          ),
        });
        toast.success(
          `Fuselage coating applied`,
          `${AIRCRAFT_BY_ID[plane.specId]?.name} · −10% fuel burn · −${fmtMoneyPlain(cost)}`,
        );
        return { ok: true };
      },

      renovateAircraft: (aircraftId, newCabin) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.acquisitionType !== "buy")
          return { ok: false, error: "Only owned aircraft can be renovated" };
        // PRD F3: 20% of current book value, floor 5% of original purchase price
        const cost = Math.max(plane.bookValue * 0.2, plane.purchasePrice * 0.05);
        if (player.cashUsd < cost)
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash` };

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - cost,
            fleet: t.fleet.map((f) => f.id === aircraftId
              ? {
                  ...f,
                  cabinConfig: newCabin,
                  status: "grounded" as const,
                  routeId: null,
                  // +8 quarters lifespan extension
                  retirementQuarter: f.retirementQuarter + 8,
                  // Auto-reactivates at end of next quarter (PRD F3 — 1Q downtime)
                  renovationCompleteQuarter: s.currentQuarter + 1,
                }
              : f),
            routes: t.routes.map((r) => ({
              ...r,
              aircraftIds: r.aircraftIds.filter((id) => id !== aircraftId),
            })),
          }),
        });
        toast.info("Renovation started", `${AIRCRAFT_BY_ID[plane.specId]?.name ?? "Aircraft"} · 1Q downtime · +2 years lifespan`);
        return { ok: true };
      },

      decommissionAircraft: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return;

        // PRD §6.4 — lease early-termination penalty.
        // Owned aircraft sell for 75% of book value (insurance / market resale).
        // Leased aircraft pay a penalty if returned before 4 quarters: 2 quarters
        // of lease cost as early termination, no resale proceeds.
        let cashDelta = 0;
        let toastTitle = "Aircraft retired";
        let toastDetail = "";
        if (plane.acquisitionType === "buy") {
          cashDelta = plane.bookValue * 0.75;
          toastTitle = "Aircraft sold";
          toastDetail = `${AIRCRAFT_BY_ID[plane.specId]?.name ?? "Aircraft"} · +${fmtMoneyPlain(cashDelta)} (75% of book)`;
        } else if (plane.acquisitionType === "lease") {
          const quartersHeld = s.currentQuarter - plane.purchaseQuarter;
          const minTerm = 4;
          const lease = plane.leaseQuarterly ?? 0;
          if (quartersHeld < minTerm && lease > 0) {
            const penalty = lease * 2;
            cashDelta = -penalty;
            toastTitle = "Lease terminated early — penalty applied";
            toastDetail = `${minTerm}Q minimum · returned at Q${quartersHeld + 1} of term · −${fmtMoneyPlain(penalty)} penalty`;
          } else {
            toastTitle = "Leased aircraft returned";
            toastDetail = `${AIRCRAFT_BY_ID[plane.specId]?.name ?? "Aircraft"} · clean handback`;
          }
        }

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd + cashDelta,
              fleet: t.fleet.filter((f) => f.id !== aircraftId),
              routes: t.routes.map((r) =>
                r.aircraftIds.includes(aircraftId)
                  ? { ...r, aircraftIds: r.aircraftIds.filter((id) => id !== aircraftId) }
                  : r),
            },
          ),
        });
        if (cashDelta < 0) toast.warning(toastTitle, toastDetail);
        else toast.info(toastTitle, toastDetail);
      },

      openRoute: ({ originCode: rawOrigin, destCode: rawDest, aircraftIds, dailyFrequency, pricingTier, econFare, busFare, firstFare, isCargo, slotBids }) => {
        // Cargo routes require cargo-storage activation at both endpoints (PRD C9)
        const cargoStorageCost = (code: string): number => {
          const c = CITIES_BY_CODE[code];
          if (!c) return 0;
          return c.tier === 1 ? 8_000_000 : c.tier === 2 ? 4_000_000 : c.tier === 3 ? 2_000_000 : 800_000;
        };
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (rawOrigin === rawDest) return { ok: false, error: "Same origin and destination" };
        if (!CITIES_BY_CODE[rawOrigin] || !CITIES_BY_CODE[rawDest])
          return { ok: false, error: "Unknown city" };
        if (aircraftIds.length === 0)
          return { ok: false, error: "Assign at least one aircraft" };
        // Hub-first normalization: a route DXB↔LHR is the same airline
        // operation whether the player picks DXB→LHR or LHR→DXB. Always
        // place the player's hub (or first secondary hub) on the origin
        // side so duplicate detection works and downstream code can rely
        // on a canonical orientation.
        let originCode = rawOrigin;
        let destCode = rawDest;
        const hubs = new Set([player.hubCode, ...player.secondaryHubCodes]);
        if (hubs.has(rawDest) && !hubs.has(rawOrigin)) {
          originCode = rawDest;
          destCode = rawOrigin;
        } else if (hubs.has(rawDest) && hubs.has(rawOrigin)) {
          // Both endpoints are hubs — keep the primary hub on the origin.
          if (rawOrigin !== player.hubCode && rawDest === player.hubCode) {
            originCode = rawDest;
            destCode = rawOrigin;
          }
        }
        // Duplicate-route guard: an active or pending route between the
        // same two endpoints (in either direction) is the same route.
        const duplicate = player.routes.find((r) =>
          r.status !== "closed" &&
          ((r.originCode === originCode && r.destCode === destCode) ||
           (r.originCode === destCode && r.destCode === originCode)),
        );
        if (duplicate) {
          return {
            ok: false,
            error: `You already operate ${duplicate.originCode} ↔ ${duplicate.destCode}. Edit the existing route to add capacity instead of opening a duplicate.`,
          };
        }
        // Network rule: origin must be your hub, a secondary hub, or a city
        // already connected to your network via an active/suspended route.
        const isInNetwork = (code: string): boolean => {
          if (code === player.hubCode) return true;
          if (player.secondaryHubCodes.includes(code)) return true;
          return player.routes.some(
            (r) =>
              r.status !== "closed" &&
              (r.originCode === code || r.destCode === code),
          );
        };
        if (!isInNetwork(originCode)) {
          return {
            ok: false,
            error: "Origin not in your network. Add it as a secondary hub or open a route to it first.",
          };
        }
        const dist = distanceBetween(originCode, destCode);
        const planes = aircraftIds
          .map((id) => player.fleet.find((f) => f.id === id))
          .filter((p): p is FleetAircraft => !!p);
        for (const p of planes) {
          const spec = AIRCRAFT_BY_ID[p.specId];
          if (!spec) return { ok: false, error: "Spec missing" };
          if (dist > spec.rangeKm)
            return { ok: false, error: `${spec.name} cannot reach ${destCode} (${Math.round(dist)} km > ${spec.rangeKm} km)` };
        }
        // Engine stores daily; UI works in weekly. Cap at 24/day (168/wk)
        // — that's well past anything achievable with current aircraft physics.
        if (dailyFrequency < 1 || dailyFrequency > 24)
          return { ok: false, error: "Frequency must be at least 1/week" };

        // PRD slot capacity check (Model B). Total weekly schedules at each
        // airport across all active routes (touching either origin or dest)
        // must be ≤ team's leased slots at that airport.
        const weeklyFreqNew = dailyFrequency * 7;
        const weeklyAtOriginExisting = player.routes
          .filter(
            (r) =>
              r.status === "active" &&
              (r.originCode === originCode || r.destCode === originCode),
          )
          .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
        const weeklyAtDestExisting = player.routes
          .filter(
            (r) =>
              r.status === "active" &&
              (r.originCode === destCode || r.destCode === destCode),
          )
          .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
        const slotsAtOrigin = player.airportLeases?.[originCode]?.slots ?? 0;
        const slotsAtDest = player.airportLeases?.[destCode]?.slots ?? 0;
        // Capacity shortfalls per endpoint. If the player attached
        // slotBids[], we auto-submit bids here AND let the route be
        // created in "pending" status (it'll activate next quarter at
        // min(intended freq, slots actually won)). Without bids, hard error.
        const shortAtOrigin = Math.max(0, weeklyAtOriginExisting + weeklyFreqNew - slotsAtOrigin);
        const shortAtDest = Math.max(0, weeklyAtDestExisting + weeklyFreqNew - slotsAtDest);
        const hasShortfall = shortAtOrigin > 0 || shortAtDest > 0;
        const wantsAutoBid = (slotBids ?? []).length > 0;

        if (hasShortfall && !wantsAutoBid) {
          if (shortAtOrigin > 0) {
            return {
              ok: false,
              error: `Need ${shortAtOrigin} more slots at ${originCode}. ` +
                `Hold ${slotsAtOrigin}, ${weeklyAtOriginExisting} already used. Bid inline or via Slot Market.`,
            };
          }
          return {
            ok: false,
            error: `Need ${shortAtDest} more slots at ${destCode}. ` +
              `Hold ${slotsAtDest}, ${weeklyAtDestExisting} already used. Bid inline or via Slot Market.`,
          };
        }

        // Submit any inline bids the player attached (one per shortfall airport).
        // The route is created as PENDING so it doesn't fly until the auction
        // resolves at next quarter close.
        // CRITICAL: bids MUST CUMULATE across multiple pending routes
        // touching the same airport. submitSlotBid replaces the bid by
        // airport, so opening two pending routes that share an airport
        // would silently drop the first route's slot demand. We compute
        // the cumulative need from the player's other still-pending
        // routes and submit the total.
        const willBePending = hasShortfall && wantsAutoBid;
        if (wantsAutoBid) {
          const player = get().teams.find((t) => t.id === get().playerTeamId);
          for (const bid of slotBids ?? []) {
            const need = bid.airportCode === originCode ? shortAtOrigin :
              bid.airportCode === destCode ? shortAtDest : 0;
            if (need <= 0) continue;
            const requested = Math.max(need, bid.slots ?? need);
            // Cumulate with any pending bid already queued at this
            // airport (from a sibling pending route the player just
            // opened in the same quarter).
            const existingBid = (player?.pendingSlotBids ?? []).find(
              (b) => b.airportCode === bid.airportCode,
            );
            // If the player previously bid at this airport at a
            // DIFFERENT price, take the higher to avoid reducing the
            // earlier route's chances.
            const cumulativeSlots = (existingBid?.slots ?? 0) + requested;
            const finalPrice = Math.max(
              existingBid?.pricePerSlot ?? 0,
              bid.pricePerSlot,
            );
            const r = get().submitSlotBid(
              bid.airportCode,
              cumulativeSlots,
              finalPrice,
            );
            if (!r.ok) {
              return { ok: false, error: `Bid at ${bid.airportCode} failed: ${r.error}` };
            }
          }
        }

        // Persist the bid prices on a pending route so the auction can
        // auto re-submit them every quarter close until the route either
        // activates OR the player cancels. Without this, a single
        // outbid+0-slot result leaves the route stuck pending forever.
        const pendingBidPrices: Record<string, number> = {};
        const pendingBidSlots: Record<string, number> = {};
        if (willBePending) {
          for (const bid of slotBids ?? []) {
            const need = bid.airportCode === originCode ? shortAtOrigin :
              bid.airportCode === destCode ? shortAtDest : 0;
            if (need <= 0) continue;
            pendingBidPrices[bid.airportCode] = bid.pricePerSlot;
            pendingBidSlots[bid.airportCode] = Math.max(need, bid.slots ?? need);
          }
        }
        const route = {
          id: mkId("route"),
          originCode,
          destCode,
          distanceKm: dist,
          aircraftIds,
          dailyFrequency,
          pricingTier,
          econFare: econFare ?? null,
          busFare: busFare ?? null,
          firstFare: firstFare ?? null,
          // Pending if we're awaiting auction resolution for slot shortfall;
          // active otherwise. Pending routes don't earn revenue this quarter
          // — they activate at next quarter-close once slots resolve.
          status: willBePending ? ("pending" as const) : ("active" as const),
          openQuarter: s.currentQuarter,
          avgOccupancy: 0,
          quarterlyRevenue: 0,
          quarterlyFuelCost: 0,
          quarterlySlotCost: 0,
          isCargo: isCargo ?? false,
          consecutiveQuartersActive: 0,
          pendingBidPrices: willBePending ? pendingBidPrices : undefined,
          pendingBidSlots: willBePending ? pendingBidSlots : undefined,
          consecutiveLosingQuarters: 0,
        };

        // Activation cost for cargo routes (PRD C9)
        let setupCost = 0;
        const newActivations: string[] = [];
        if (isCargo) {
          for (const code of [originCode, destCode]) {
            if (!player.cargoStorageActivations.includes(code)) {
              setupCost += cargoStorageCost(code);
              newActivations.push(code);
            }
          }
          if (setupCost > player.cashUsd)
            return { ok: false, error: `Cargo storage setup requires $${(setupCost / 1_000_000).toFixed(1)}M` };
        }

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd - setupCost,
              routes: [...t.routes, route],
              fleet: t.fleet.map((f) =>
                aircraftIds.includes(f.id)
                  ? { ...f, status: "active", routeId: route.id }
                  : f),
              cargoStorageActivations: [...t.cargoStorageActivations, ...newActivations],
            },
          ),
        });
        if (setupCost > 0) {
          toast.info("Cargo storage activated",
            `${newActivations.join(" + ")} · $${(setupCost / 1_000_000).toFixed(1)}M one-time`);
        }
        if (willBePending) {
          toast.warning(
            `Route pending: ${originCode} → ${destCode}`,
            `Bid submitted — auction resolves at end of quarter. Route activates ` +
            `at min(intended freq, slots won) if your bid wins. First revenue ` +
            `appears at the quarter close AFTER activation.`,
          );
        } else {
          toast.success(
            `Route opened: ${originCode} → ${destCode}`,
            `${Math.round(dist).toLocaleString()} km · ${dailyFrequency}/day · ${pricingTier}. ` +
            `Flights start running this quarter; first revenue shows at quarter close.`,
          );
        }
        return { ok: true };
      },

      closeRoute: (routeId) => {
        const s = get();
        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              routes: t.routes.filter((r) => r.id !== routeId),
              fleet: t.fleet.map((f) => f.routeId === routeId
                ? { ...f, status: "active", routeId: null } : f),
            },
          ),
        });
      },

      cancelPendingRoute: (routeId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const route = player.routes.find((r) => r.id === routeId);
        if (!route) return { ok: false, error: "Route not found" };
        if (route.status !== "pending") {
          return { ok: false, error: "Only pending routes can be cancelled here" };
        }
        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              routes: t.routes.filter((r) => r.id !== routeId),
              fleet: t.fleet.map((f) =>
                f.routeId === routeId
                  ? { ...f, status: "active" as const, routeId: null }
                  : f,
              ),
            },
          ),
        });
        toast.info(
          `Pending route cancelled`,
          `${route.originCode} → ${route.destCode} · aircraft returned to idle. ` +
            `Slot bids stay queued — release in Slot Market if you don't want them.`,
        );
        return { ok: true };
      },

      updateRoute: (routeId, patch) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const route = player.routes.find((r) => r.id === routeId);
        if (!route) return { ok: false, error: "Route not found" };
        if (patch.dailyFrequency !== undefined &&
            (patch.dailyFrequency < 1 || patch.dailyFrequency > 24))
          return { ok: false, error: "Daily frequency 1–24" };

        // If aircraft reassigned, validate range + availability
        const newAircraftIds = patch.aircraftIds ?? route.aircraftIds;
        if (patch.aircraftIds) {
          const planes = newAircraftIds
            .map((id) => player.fleet.find((f) => f.id === id));
          for (const p of planes) {
            if (!p) return { ok: false, error: "Aircraft not found" };
            const spec = AIRCRAFT_BY_ID[p.specId];
            if (!spec) return { ok: false, error: "Spec missing" };
            if (spec.rangeKm < route.distanceKm)
              return { ok: false, error: `${spec.name} out of range` };
            // Must be idle or already on this route
            if (p.routeId && p.routeId !== routeId)
              return { ok: false, error: `${spec.name} already on another route` };
          }
        }

        // PRD update — clamp dailyFrequency to the new aircraft set's
        // physics cap. Removing a plane from the assignment must drop
        // the route's max frequency automatically.
        const finalDaily = patch.dailyFrequency ?? route.dailyFrequency;
        const newSpecIds = newAircraftIds
          .map((id) => player.fleet.find((f) => f.id === id)?.specId)
          .filter((x): x is string => !!x);
        const physicsCap = newSpecIds.length > 0
          ? newSpecIds.reduce((sum, sid) => {
              const oneWayHrs = route.distanceKm / (
                /^A319|^A320|^A321|^B737/.test(sid) ? 840 :
                /^B757|^B767|^A330/.test(sid) ? 870 : 900);
              return sum + Math.max(1, Math.floor(24 / (oneWayHrs * 2 + 4)));
            }, 0)
          : 0;
        const clampedDaily =
          physicsCap > 0 ? Math.min(finalDaily, physicsCap) : 1;

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            routes: t.routes.map((r) => r.id !== routeId ? r : {
              ...r,
              dailyFrequency: clampedDaily,
              pricingTier: patch.pricingTier ?? r.pricingTier,
              econFare: patch.econFare !== undefined ? patch.econFare : r.econFare,
              busFare: patch.busFare !== undefined ? patch.busFare : r.busFare,
              firstFare: patch.firstFare !== undefined ? patch.firstFare : r.firstFare,
              aircraftIds: newAircraftIds,
            }),
            fleet: t.fleet.map((f) => {
              if (patch.aircraftIds) {
                if (patch.aircraftIds.includes(f.id)) {
                  return { ...f, status: "active" as const, routeId };
                }
                if (f.routeId === routeId) {
                  return { ...f, status: "active" as const, routeId: null };
                }
              }
              return f;
            }),
          }),
        });
        return { ok: true };
      },

      submitDecision: ({ scenarioId, optionId, lockInQuarters }) => {
        const s = get();
        const scenario = SCENARIOS_BY_QUARTER[s.currentQuarter]?.find(
          (sc) => sc.id === scenarioId);
        if (!scenario) return;
        const option = scenario.options.find((o) => o.id === optionId);
        if (!option) return;
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;

        const decision: ScenarioDecision = {
          scenarioId: scenarioId as ScenarioDecision["scenarioId"],
          quarter: s.currentQuarter,
          optionId,
          submittedAt: Date.now(),
          lockInQuarters,
        };

        const updated = applyOptionEffect(player, option.effect);
        updated.decisions = [...updated.decisions, decision];

        // Debt assumption (e.g. S7 Full Acquisition's $180M of inherited
        // liabilities). Materializes as a real LoanInstrument at the
        // current base rate so the player decides when to repay — we do
        // NOT silently deduct from cash. The player sees +$180M in
        // totalDebtUsd and a new entry in their loans list.
        if (option.effect.debtAssumed && option.effect.debtAssumed > 0) {
          const principal = option.effect.debtAssumed;
          const loan: LoanInstrument = {
            id: mkId("loan"),
            principalUsd: principal,
            ratePct: s.baseInterestRatePct,
            originQuarter: s.currentQuarter,
            remainingPrincipal: principal,
            govBacked: false,
          };
          updated.loans = [...updated.loans, loan];
          updated.totalDebtUsd = updated.totalDebtUsd + principal;
          toast.warning(
            `+${fmtMoneyPlain(principal)} debt assumed`,
            `Inherited from ${scenario.title}. Loan at ${s.baseInterestRatePct.toFixed(1)}% — ` +
            `repay anytime via Financials or just service the interest each quarter.`,
          );
        }

        // S7 Hungry Neighbour — fleet acquisition presets. Materialize
        // aircraft into the player's fleet at favourable terms (already
        // depreciated, ~8 quarters of useful life remaining). Routes are
        // NOT auto-created — the player picks how to deploy these planes.
        if (option.effect.acquireFleet) {
          const preset = option.effect.acquireFleet;
          const acquiredSpecs =
            preset === "S7_FULL"
              ? [
                  // 4 narrow-body + 4 wide-body
                  "A320", "A320", "B737-800", "B737-800",
                  "A330-200", "A330-200", "B767-300ER", "B767-300ER",
                ]
              : preset === "S7_PARTIAL"
                ? ["A320", "A320", "B737-800", "B737-800"]
                : [];
          if (acquiredSpecs.length > 0) {
            const acquiredPlanes: FleetAircraft[] = acquiredSpecs.map((specId) => {
              const spec = AIRCRAFT_BY_ID[specId];
              const bookValue = spec ? spec.buyPriceUsd * 0.4 : 0;
              return {
                id: mkId("ac"),
                specId,
                // Arrive grounded for repaint — back online next quarter.
                status: "grounded" as const,
                acquisitionType: "buy" as const,
                purchaseQuarter: s.currentQuarter,
                purchasePrice: bookValue,
                bookValue,
                leaseQuarterly: null,
                ecoUpgrade: false,
                ecoUpgradeQuarter: null,
                ecoUpgradeCost: 0,
                cabinConfig: "default" as const,
                routeId: null,
                // 8Q life remaining (used aircraft from a failed carrier).
                retirementQuarter: s.currentQuarter + 8,
                maintenanceDeficit: 0,
                satisfactionPct: 65,
                // Auto-reactivate at next close (1Q downtime for repaint).
                renovationCompleteQuarter: s.currentQuarter + 1,
              };
            });
            updated.fleet = [...updated.fleet, ...acquiredPlanes];
            toast.accent(
              `${acquiredPlanes.length} aircraft transferred from administrator`,
              `${acquiredPlanes.length} planes added to fleet · grounded for ` +
              `repaint, available next quarter. Book value ` +
              `${fmtMoneyPlain(acquiredPlanes.reduce((sum, p) => sum + p.bookValue, 0))} ` +
              `(40% of new). Open routes for them in the Routes panel.`,
            );
          }
        }

        toast.success(
          `Decision submitted: ${scenarioId} · ${optionId}`,
          option.label,
        );

        // Enqueue deferred event if the option has one
        if (option.effect.deferred) {
          const d = option.effect.deferred;
          const ev: DeferredEvent = {
            id: mkId("ev"),
            sourceScenario: scenarioId as ScenarioDecision["scenarioId"],
            sourceOption: optionId,
            targetQuarter: d.quarter,
            probability: d.probability ?? 1,
            effectJson: serializeEffect(d.effect),
            noteAtQueue: `${scenario.title} · Option ${optionId}`,
          };
          updated.deferredEvents = [...(updated.deferredEvents ?? []), ev];
        }

        set({
          teams: s.teams.map((t) => t.id === player.id ? updated : t),
        });
      },

      borrowCapital: (amount) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const loan: LoanInstrument = {
          id: mkId("loan"),
          principalUsd: amount,
          ratePct: s.baseInterestRatePct,
          originQuarter: s.currentQuarter,
          remainingPrincipal: amount,
          govBacked: false,
        };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd + amount,
            totalDebtUsd: t.totalDebtUsd + amount,
            loans: [...t.loans, loan],
          }),
        });
        return { ok: true };
      },

      repayLoan: (loanId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const loan = player.loans.find((l) => l.id === loanId);
        if (!loan) return { ok: false, error: "Loan not found" };
        if (player.cashUsd < loan.remainingPrincipal)
          return { ok: false, error: `Need ${fmtMoneyPlain(loan.remainingPrincipal)} cash` };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - loan.remainingPrincipal,
            totalDebtUsd: Math.max(0, t.totalDebtUsd - loan.remainingPrincipal),
            loans: t.loans.filter((l) => l.id !== loanId),
          }),
        });
        toast.success(
          `Loan repaid · ${fmtMoneyPlain(loan.remainingPrincipal)}`,
          `Saved ${loan.ratePct.toFixed(1)}% interest going forward.`,
        );
        return { ok: true };
      },

      refinanceLoan: (loanId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const loan = player.loans.find((l) => l.id === loanId);
        if (!loan) return { ok: false, error: "Loan not found" };
        const newRate = s.baseInterestRatePct;
        if (newRate >= loan.ratePct - 0.25)
          return { ok: false, error: "New rate isn't enough lower (need ≥0.25% saving)" };
        const fee = loan.remainingPrincipal * 0.01;  // 1% refi fee
        if (player.cashUsd < fee)
          return { ok: false, error: `Need ${fmtMoneyPlain(fee)} for 1% refi fee` };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - fee,
            loans: t.loans.map((l) => l.id !== loanId ? l : {
              ...l,
              ratePct: newRate,
              originQuarter: s.currentQuarter,
            }),
          }),
        });
        toast.info(
          `Loan refinanced · ${loan.ratePct.toFixed(1)}% → ${newRate.toFixed(1)}%`,
          `1% origination fee applied (${fmtMoneyPlain(fee)}).`,
        );
        return { ok: true };
      },

      closeQuarter: () => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;

        // Insurance coverage (PRD E5) — paid out on mandatory retirement at end of lifespan
        const coverageByPolicy = { none: 0, low: 0.3, medium: 0.5, high: 0.8 } as const;
        const coveragePct = coverageByPolicy[player.insurancePolicy];
        let insuranceProceeds = 0;

        // Transition ordered → active planes, and retire aircraft whose
        // retirementQuarter has been reached (A13).
        const updatedFleet = player.fleet.map((f) => {
          const retiring = f.retirementQuarter !== undefined && s.currentQuarter >= f.retirementQuarter;
          if (retiring) {
            // PRD D6 / E5: 75% of book value baseline, reduced to configured coverage
            const payoutBase = f.bookValue * 0.75;
            const payout = payoutBase * coveragePct;
            insuranceProceeds += payout;
            return { ...f, status: "retired" as const, routeId: null };
          }
          if (f.status === "ordered") return { ...f, status: "active" as const };
          if (f.status === "grounded") return { ...f, status: "active" as const };
          return f;
        });

        if (insuranceProceeds > 0 && coveragePct > 0) {
          const retiredCount = updatedFleet.filter((f) => f.status === "retired" && !player.fleet.find((p) => p.id === f.id && p.status === "retired")).length;
          toast.info(`Aircraft insurance proceeds`,
            `${retiredCount} retirement${retiredCount === 1 ? "" : "s"} · +${fmtMoneyPlain(insuranceProceeds)} at ${(coveragePct * 100).toFixed(0)}% coverage`);
        }
        // PRD update — Per-plane satisfaction drift each quarter.
        // Mean-reverts toward 60. Modified by ops slider, eco upgrade,
        // recent renovation, and aircraft age.
        const opsLvl = player.sliders.operations;
        const opsSatBonus =
          opsLvl >= 4 ? +3 :
          opsLvl >= 3 ? +1 :
          opsLvl >= 2 ? 0 :
          opsLvl === 1 ? -1 : -3;
        const updatedFleetWithSat = updatedFleet.map((f) => {
          if (f.status !== "active") return f;
          const ageQ = s.currentQuarter - f.purchaseQuarter;
          const ageDecay = Math.min(2, ageQ / 8);  // up to -2/Q on very old planes
          const ecoBonus = f.ecoUpgrade ? 0.5 : 0;
          const recentReno = f.renovationCompleteQuarter !== undefined &&
            s.currentQuarter - f.renovationCompleteQuarter < 4 ? 2 : 0;
          const cur = f.satisfactionPct ?? 75;
          const meanRevert = (60 - cur) * 0.05;  // gentle pull
          const next = Math.max(0, Math.min(100,
            cur + opsSatBonus + ecoBonus + recentReno - ageDecay + meanRevert,
          ));
          return { ...f, satisfactionPct: next };
        });
        const finalFleet = updatedFleetWithSat;

        // Fleet flag detection (PRD §7.2)
        const activeModern = updatedFleet.filter(
          (f) => f.status === "active" && AIRCRAFT_BY_ID[f.specId]?.unlockQuarter >= 8,
        ).length;
        const newFlags = new Set(player.flags);
        if (activeModern >= 10) newFlags.add("modern_fleet");
        else newFlags.delete("modern_fleet");
        // Aging fleet: 0 planes ordered in current quarter + average fleet age high
        const ordersThisQuarter = updatedFleet.filter(
          (f) => f.purchaseQuarter === s.currentQuarter,
        ).length;
        const averageAge = updatedFleet.length > 0
          ? updatedFleet.reduce((sum, f) => sum + (s.currentQuarter - f.purchaseQuarter), 0) / updatedFleet.length
          : 0;
        if (ordersThisQuarter === 0 && averageAge >= 10) {
          newFlags.add("aging_fleet");
        }
        const teamReady: Team = {
          ...ensureStreaks(player),
          fleet: finalFleet,
          routes: player.routes.map((r) => {
            const stillFlying = r.aircraftIds.filter((id) => {
              const f = player.fleet.find((x) => x.id === id);
              return f && (f.retirementQuarter === undefined || s.currentQuarter < f.retirementQuarter);
            });
            return { ...r, aircraftIds: stillFlying };
          }),
          flags: newFlags,
          sliderStreaks: { ...player.sliderStreaks },
        };

        const result = runQuarterClose(teamReady, {
          baseInterestRatePct: s.baseInterestRatePct,
          fuelIndex: s.fuelIndex,
          quarter: s.currentQuarter,
          rivals: s.teams.filter((t) => t.id !== player.id),
          cargoContracts: s.cargoContracts ?? [],
        });

        // Decrement remaining quarters on each contract; drop expired
        const updatedCargoContracts = (s.cargoContracts ?? [])
          .map((cc) => cc.teamId === player.id
            ? { ...cc, quartersRemaining: cc.quartersRemaining - 1 }
            : cc)
          .filter((cc) => cc.quartersRemaining > 0);

        // Commit result back to team + add any insurance proceeds on top
        const closed: Team = {
          ...teamReady,
          cashUsd: result.newCashUsd + insuranceProceeds,
          rcfBalanceUsd: result.newRcfBalance,
          brandPts: result.newBrandPts,
          opsPts: result.newOpsPts,
          customerLoyaltyPct: result.newLoyalty,
          brandValue: result.newBrandValue,
          financialsByQuarter: [...teamReady.financialsByQuarter, {
            quarter: s.currentQuarter,
            cash: result.newCashUsd,
            debt: teamReady.totalDebtUsd,
            revenue: result.revenue,
            passengerRevenue: result.passengerRevenue,
            cargoRevenue: result.cargoRevenue,
            costs: result.revenue - result.netProfit,
            insuranceCost: result.insuranceCost,
            netProfit: result.netProfit,
            brandPts: result.newBrandPts,
            opsPts: result.newOpsPts,
            loyalty: result.newLoyalty,
            brandValue: result.newBrandValue,
          }],
        };

        // ── AI bot turns ──────────────────────────────────────
        // Before the procedural rival simulation, give every bot-flagged
        // team a chance to make REAL decisions: open routes, order
        // aircraft, bid for slots. The procedural revenue logic that
        // follows still drives the leaderboard, but bots now build a
        // visible network the player sees on the map and competes
        // against on shared routes.
        const teamsAfterBotTurns = s.teams.map((t) => {
          if (!t.botDifficulty) return t;
          let updated = { ...t };

          // Aircraft order — bot may add a fresh purchase
          const order = planBotAircraftOrder(updated, t.botDifficulty, s.currentQuarter);
          if (order) {
            const spec = AIRCRAFT_BY_ID[order.specId];
            if (spec) {
              const totalCost = spec.buyPriceUsd * order.quantity;
              if (updated.cashUsd >= totalCost) {
                const newPlanes: FleetAircraft[] = Array.from({ length: order.quantity }, () => ({
                  id: mkId("ac"),
                  specId: order.specId,
                  status: "ordered",
                  acquisitionType: "buy",
                  purchaseQuarter: s.currentQuarter,
                  purchasePrice: spec.buyPriceUsd,
                  bookValue: spec.buyPriceUsd,
                  leaseQuarterly: null,
                  ecoUpgrade: false,
                  ecoUpgradeQuarter: null,
                  ecoUpgradeCost: 0,
                  cabinConfig: "default",
                  routeId: null,
                  retirementQuarter: s.currentQuarter + 16,
                  maintenanceDeficit: 0,
                  satisfactionPct: 75,
                }));
                updated = {
                  ...updated,
                  cashUsd: updated.cashUsd - totalCost,
                  fleet: [...updated.fleet, ...newPlanes],
                };
              }
            }
          }

          // Route openings — bot may start a few new routes from idle planes
          const routePlans = planBotRoutes(updated, t.botDifficulty, s.currentQuarter);
          for (const rp of routePlans) {
            const dist = distanceBetween(rp.origin, rp.dest);
            const dailyFreq = Math.max(1, Math.round(rp.weeklyFreq / 7));
            const route: Route = {
              id: mkId("route"),
              originCode: rp.origin,
              destCode: rp.dest,
              distanceKm: dist,
              aircraftIds: [rp.aircraftId],
              dailyFrequency: dailyFreq,
              pricingTier: rp.pricingTier,
              econFare: null,
              busFare: null,
              firstFare: null,
              status: "active",
              openQuarter: s.currentQuarter,
              avgOccupancy: 0,
              quarterlyRevenue: 0,
              quarterlyFuelCost: 0,
              quarterlySlotCost: 0,
              isCargo: false,
              consecutiveQuartersActive: 0,
              consecutiveLosingQuarters: 0,
            };
            updated = {
              ...updated,
              routes: [...updated.routes, route],
              fleet: updated.fleet.map((f) =>
                f.id === rp.aircraftId
                  ? { ...f, status: "active" as const, routeId: route.id }
                  : f,
              ),
            };
          }
          return updated;
        });
        // Replace s.teams reference for downstream rival processing
        Object.assign(s, { teams: teamsAfterBotTurns });

        // Strategy-driven rival quarter-close.
        // Each rival has a doctrine that shapes their revenue model:
        //   budget-expansion → high-volume low-margin
        //   premium-service  → low-volume high-margin (bigger fuel sensitivity)
        //   cargo-focus      → steady cargo revenue, low fuel sensitivity
        //   hub-spoke        → balanced
        //   alliance         → +10% revenue from network
        // Revenue/profit are generated procedurally so the leaderboard moves
        // believably without us simulating their full network.
        const fuelStress = Math.max(0, (s.fuelIndex - 100) / 100);  // 0 at index 100, 0.5 at 150
        const quarterMaturity = Math.min(1, (s.currentQuarter - 1) / 12);  // ramps up over Y1-Y3
        const rivals = s.teams.filter((t) => !t.isPlayer).map((r) => {
          // Stable per-team noise so the rival has a "personality" curve
          const seed = (r.id.charCodeAt(0) * 31 + s.currentQuarter * 7) % 100;
          const personalityNoise = (seed / 100 - 0.5) * 0.18;  // ±9%

          // Doctrine-shaped revenue model
          let baseRevenue = 35_000_000;
          let marginPct = 0.07;
          let fuelSensitivity = 1.0;
          switch (r.doctrine) {
            case "premium-service":
              baseRevenue = 28_000_000; marginPct = 0.13; fuelSensitivity = 1.3; break;
            case "budget-expansion":
              baseRevenue = 42_000_000; marginPct = 0.05; fuelSensitivity = 1.1; break;
            case "cargo-dominance":
              baseRevenue = 32_000_000; marginPct = 0.10; fuelSensitivity = 0.6; break;
            case "safety-first":
              baseRevenue = 33_000_000; marginPct = 0.09; fuelSensitivity = 0.95; break;
            default:
              baseRevenue = 34_000_000; marginPct = 0.08; fuelSensitivity = 1.0; break;
          }

          // Brand pts amplify revenue (50 brand = 1.0x, 80 = 1.15x, 100 = 1.25x)
          const brandMul = 0.85 + (r.brandPts / 100) * 0.4;
          const maturityMul = 1 + quarterMaturity * 0.45;
          const revenue = baseRevenue * brandMul * maturityMul * (1 + personalityNoise);
          const fuelDrag = fuelStress * fuelSensitivity * revenue * 0.18;
          const adjustedMargin = marginPct - fuelStress * 0.04;
          const netProfit = revenue * adjustedMargin - fuelDrag;

          // Brand drift — successful rivals build brand, losing rivals erode it
          const driftBrand = netProfit > 0 ? 1 + Math.random() * 1.5 : -1 - Math.random();
          const driftLoyalty = netProfit > 0 ? 0.5 + Math.random() : -0.5 - Math.random() * 0.8;

          const newBrand = Math.max(0, Math.min(100, r.brandPts + driftBrand));
          const newLoyalty = Math.max(0, Math.min(100, r.customerLoyaltyPct + driftLoyalty));
          const newCash = Math.max(0, r.cashUsd + netProfit);

          const updated: Team = {
            ...r,
            brandPts: newBrand,
            customerLoyaltyPct: newLoyalty,
            cashUsd: newCash,
            financialsByQuarter: [
              ...r.financialsByQuarter,
              {
                quarter: s.currentQuarter,
                cash: newCash,
                debt: r.totalDebtUsd,
                revenue,
                costs: revenue - netProfit,
                netProfit,
                brandPts: newBrand,
                opsPts: r.opsPts,
                loyalty: newLoyalty,
                brandValue: 0,  // computed below
              },
            ],
          };
          updated.brandValue = computeBrandValue(updated);
          // patch the just-pushed financials row's brandValue
          const lastIdx = updated.financialsByQuarter.length - 1;
          updated.financialsByQuarter[lastIdx] = {
            ...updated.financialsByQuarter[lastIdx],
            brandValue: updated.brandValue,
          };
          return updated;
        });

        // Resolve slot auctions across all airports (PRD slot bidding).
        // Group every team's pendingSlotBids by airport, sort by price desc,
        // award winners, charge cash, add to slotsByAirport.
        const bidsByAirport: Record<string, BidEntry[]> = {};
        for (const t of [closed, ...rivals]) {
          // CRITICAL: auto re-bid for pending routes whose stored
          // pendingBidPrices indicate the player committed to a price.
          // Without this, a pending route gets ONE auction attempt and
          // then the bid is gone — the route sits forever pending. Now
          // every quarter close re-issues those bids until the route
          // either activates OR the player cancels manually.
          const autoRebidsByAirport: Record<string, { slots: number; price: number }> = {};
          for (const r of t.routes) {
            if (r.status !== "pending") continue;
            if (!r.pendingBidPrices) continue;
            for (const code of Object.keys(r.pendingBidPrices)) {
              const slotsHeld = t.airportLeases?.[code]?.slots ?? 0;
              const usedAtCode = t.routes
                .filter((rt) =>
                  rt.id !== r.id &&
                  (rt.status === "active" || rt.status === "suspended") &&
                  (rt.originCode === code || rt.destCode === code),
                )
                .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
              const intendedWeekly = r.dailyFrequency * 7;
              const stillNeeded = Math.max(0, intendedWeekly + usedAtCode - slotsHeld);
              if (stillNeeded <= 0) continue;
              const price = r.pendingBidPrices[code];
              const cur = autoRebidsByAirport[code];
              autoRebidsByAirport[code] = {
                slots: (cur?.slots ?? 0) + stillNeeded,
                price: Math.max(cur?.price ?? 0, price),
              };
            }
          }
          // Merge auto-rebids into the team's pendingSlotBids before
          // the auction so they participate.
          for (const code of Object.keys(autoRebidsByAirport)) {
            const existing = (t.pendingSlotBids ?? []).find((b) => b.airportCode === code);
            if (existing) {
              existing.slots = Math.max(existing.slots, autoRebidsByAirport[code].slots);
              existing.pricePerSlot = Math.max(existing.pricePerSlot, autoRebidsByAirport[code].price);
            } else {
              (t.pendingSlotBids ??= []).push({
                airportCode: code,
                slots: autoRebidsByAirport[code].slots,
                pricePerSlot: autoRebidsByAirport[code].price,
                quarterSubmitted: s.currentQuarter,
              });
            }
          }
          for (const b of (t.pendingSlotBids ?? [])) {
            (bidsByAirport[b.airportCode] ??= []).push({
              teamId: t.id,
              airportCode: b.airportCode,
              slots: b.slots,
              pricePerSlot: b.pricePerSlot,
              quarterSubmitted: b.quarterSubmitted,
            });
          }
        }
        // Backstop: if any airport in the bidsByAirport set is MISSING
        // from airportSlots (old save migration gap), seed it with a
        // fresh tier-default pool so the bid actually resolves instead
        // of being silently skipped by resolveSlotAuctions.
        const slotsForAuction = { ...(s.airportSlots ?? {}) };
        const fresh = makeInitialAirportSlots();
        for (const code of Object.keys(bidsByAirport)) {
          if (!slotsForAuction[code] && fresh[code]) {
            slotsForAuction[code] = fresh[code];
          }
        }
        const { slots: slotsAfterAuction, awards } = resolveSlotAuctions(
          slotsForAuction,
          bidsByAirport,
        );
        // Apply awards to teams (Model B — recurring fees, no upfront pay).
        // Each won slot adds `weeklyPricePerSlot` to the team's airport lease
        // total weekly cost; the slots count rises by slotsWon. Quarterly
        // expense accrues based on this lease state at the next close.
        const teamsWithAwards = [closed, ...rivals].map((t) => {
          const won = awards.filter((a) => a.teamId === t.id && a.slotsWon > 0);
          if (won.length === 0) {
            return { ...t, pendingSlotBids: [] };
          }
          const newLeases: Record<string, AirportLease> = { ...(t.airportLeases ?? {}) };
          const newSlots: Record<string, number> = { ...t.slotsByAirport };
          for (const w of won) {
            const cur = newLeases[w.airportCode] ?? { slots: 0, totalWeeklyCost: 0 };
            newLeases[w.airportCode] = {
              slots: cur.slots + w.slotsWon,
              totalWeeklyCost: cur.totalWeeklyCost + w.slotsWon * w.weeklyPricePerSlot,
            };
            // Keep legacy mirror in sync for any code still reading it
            newSlots[w.airportCode] = (newSlots[w.airportCode] ?? 0) + w.slotsWon;
          }
          return {
            ...t,
            airportLeases: newLeases,
            slotsByAirport: newSlots,
            pendingSlotBids: [],
          };
        });

        // Surface auction outcomes to the player only (not rivals).
        const playerWins = awards.filter((a) => a.teamId === closed.id && a.slotsWon > 0);
        if (playerWins.length > 0) {
          const total = playerWins.reduce((sum, w) => sum + w.slotsWon, 0);
          toast.success(
            `Won ${total} airport slots`,
            playerWins.map((w) => `${w.airportCode}: ${w.slotsWon}`).join(" · "),
          );
        }
        const playerLosses = awards.filter((a) => a.teamId === closed.id && a.slotsWon === 0);
        if (playerLosses.length > 0) {
          toast.warning(
            `Lost ${playerLosses.length} slot bid${playerLosses.length > 1 ? "s" : ""}`,
            "Higher bidders won. Try again next quarter.",
          );
        }

        set({
          teams: teamsWithAwards,
          cargoContracts: updatedCargoContracts,
          lastCloseResult: result,
          phase: "quarter-closing",
          airportSlots: slotsAfterAuction,
          // Fuel index drifts
          fuelIndex: Math.max(70, Math.min(160, s.fuelIndex + (Math.random() - 0.5) * 10)),
        });
      },

      advanceToNext: () => {
        const s = get();
        if (s.currentQuarter >= 20) {
          set({ phase: "endgame", lastCloseResult: null });
          toast.accent("Final quarter complete", "Your legacy is sealed.");
          return;
        }
        const nextQ = s.currentQuarter + 1;

        // PRD G4 — 787 Dreamliner delivery delay triggered at Q9 open
        // Any B787-9 ordered at Q8 gets pushed back 2 quarters (Q9 → Q11).
        let delayedTeams = s.teams;
        if (nextQ === 9) {
          let delayedCount = 0;
          delayedTeams = s.teams.map((t) => ({
            ...t,
            fleet: t.fleet.map((f) => {
              if (f.specId === "B787-9" && f.status === "ordered" && f.purchaseQuarter === 8) {
                delayedCount += 1;
                // Keep status as "ordered" and bump purchaseQuarter forward so it
                // only activates at Q11 quarter-close
                return { ...f, purchaseQuarter: 10 };
              }
              return f;
            }),
          }));
          if (delayedCount > 0) {
            toast.warning(
              `Boeing 787 Dreamliner delivery delay`,
              `${delayedCount} aircraft pushed from Q9 → Q11 due to manufacturing issues`,
            );
          }
        }

        // PRD F3 — Renovation auto-restore: aircraft grounded for renovation
        // come back online at the start of their renovationCompleteQuarter.
        let renoCount = 0;
        delayedTeams = delayedTeams.map((t) => ({
          ...t,
          fleet: t.fleet.map((f) => {
            if (
              f.status === "grounded" &&
              f.renovationCompleteQuarter !== undefined &&
              f.renovationCompleteQuarter <= nextQ
            ) {
              renoCount += 1;
              return {
                ...f,
                status: "active" as const,
                renovationCompleteQuarter: undefined,
              };
            }
            return f;
          }),
        }));
        if (renoCount > 0) {
          toast.success(
            `${renoCount} aircraft back from renovation`,
            "Refreshed cabins, +2 yrs lifespan, available for routes.",
          );
        }

        // Apply yearly slot opens at Q5 / Q9 / Q13 / Q17 (PRD slot bidding).
        // Each airport adds its previously-announced nextOpening to available
        // and rolls the next year's batch.
        const { slots: tickedSlots, ticked } = applyYearlyTickIfDue(
          s.airportSlots ?? {},
          nextQ,
        );
        if (ticked) {
          toast.accent(
            `New airport slots open · Year ${Math.ceil(nextQ / 4)}`,
            "Submit bids in the Slot Market. Winners announced at quarter close.",
          );
        }

        // Activate pending routes (PRD update — explicit-bid flow). Each
        // pending route now evaluates effective weekly freq against slots
        // actually held at both endpoints. Three outcomes:
        //   - Won enough slots → goes ACTIVE at min(intended, slots-available)
        //   - Won zero / insufficient slots → CANCELLED; aircraft freed
        //   - Pending route's outbid info shown to the player.
        let playerActivations = 0;
        let playerStillPending = 0;
        // Diagnostic per route: the player needs to know WHY it didn't
        // activate (slots held, used, available, needed) so they can
        // re-bid intelligently next quarter.
        const stillPendingDiagnostics: string[] = [];
        const teamsWithPendingResolved = delayedTeams.map((t) => {
          if (!t.routes.some((r) => r.status === "pending")) return t;
          const newRoutes: typeof t.routes = [];
          for (const r of t.routes) {
            if (r.status !== "pending") {
              newRoutes.push(r);
              continue;
            }
            const slotsO = t.airportLeases?.[r.originCode]?.slots ?? 0;
            const slotsD = t.airportLeases?.[r.destCode]?.slots ?? 0;
            const usedO = t.routes
              .filter((rt) =>
                rt.id !== r.id &&
                (rt.status === "active" || rt.status === "suspended") &&
                (rt.originCode === r.originCode || rt.destCode === r.originCode),
              )
              .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
            const usedD = t.routes
              .filter((rt) =>
                rt.id !== r.id &&
                (rt.status === "active" || rt.status === "suspended") &&
                (rt.originCode === r.destCode || rt.destCode === r.destCode),
              )
              .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
            const availO = Math.max(0, slotsO - usedO);
            const availD = Math.max(0, slotsD - usedD);
            const intendedWeekly = r.dailyFrequency * 7;
            const effectiveWeekly = Math.min(intendedWeekly, availO, availD);
            if (effectiveWeekly < 1) {
              // PRD update: do NOT auto-delete pending routes that fail to
              // activate. Keep them as "pending" so the player can either
              // re-bid for the missing slots next quarter, or cancel them
              // manually via the Routes detail. Auto-deletion was wiping
              // out 3+ routes with no recourse — destructive UX.
              if (t.id === s.playerTeamId) {
                playerStillPending += 1;
                stillPendingDiagnostics.push(
                  `${r.originCode}→${r.destCode}: held ${slotsO}@${r.originCode}/${slotsD}@${r.destCode}, ` +
                  `${usedO}/${usedD} used, ${availO}/${availD} free, need ${intendedWeekly}/wk`,
                );
              }
              newRoutes.push(r); // keep pending
              continue;
            }
            if (t.id === s.playerTeamId) playerActivations += 1;
            newRoutes.push({
              ...r,
              status: "active" as const,
              dailyFrequency: Math.max(1, Math.round(effectiveWeekly / 7)),
              // Clear stored bid commitments — the route is now active and
              // shouldn't auto-rebid next quarter.
              pendingBidPrices: undefined,
              pendingBidSlots: undefined,
            });
          }
          // No automatic fleet release — pending routes still hold their
          // aircraft. Player can free them by manually cancelling the
          // pending route via the Routes detail modal.
          return { ...t, routes: newRoutes };
        });
        if (playerActivations > 0) {
          toast.success(
            `${playerActivations} pending route${playerActivations > 1 ? "s" : ""} now active`,
            "Bid won at quarter close — flying at the highest frequency the slots allow.",
          );
        }
        if (playerStillPending > 0) {
          toast.warning(
            `${playerStillPending} route${playerStillPending > 1 ? "s" : ""} still pending`,
            stillPendingDiagnostics.join(" · ") +
            ". Re-bid in the Slot Market for the missing slots, or cancel the route manually in Routes.",
          );
        }

        set({
          teams: teamsWithPendingResolved,
          currentQuarter: nextQ,
          phase: "playing",
          lastCloseResult: null,
          airportSlots: tickedSlots,
          // Reset quarter timer for next cycle
          quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining !== null ? 1800 : null,
          quarterTimerPaused: false,
        });
        // Player-facing label: "Round 10/20" headline with the calendar
        // quarter as the detail line. The internal round number is Q1..Q20;
        // calendar quarters are Q1 2026..Q4 2030 derived from that.
        toast.accent(
          `Round ${nextQ}/20`,
          fmtQuarter(nextQ),
        );
      },

      setActiveTeam: (teamId) => {
        const s = get();
        if (!s.teams.some((t) => t.id === teamId)) return;
        set({ playerTeamId: teamId });
      },

      startFacilitatedSession: (seatCount) => {
        // 4-digit code, leading zeros allowed (e.g. "0421")
        const code = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
        const safeSeatCount = Math.max(2, Math.min(10, Math.floor(seatCount)));
        set({
          sessionCode: code,
          sessionSlots: Array.from({ length: safeSeatCount }, () => ({
            id: mkId("seat"),
            claimed: false,
            teamId: null,
            companyName: null,
          })),
        });
        toast.accent(
          `Session code: ${code}`,
          `Share with ${safeSeatCount} player${safeSeatCount === 1 ? "" : "s"}. They join via /join.`,
        );
        return { code };
      },

      joinSessionWithCode: ({ code, companyName, hubCode }) => {
        const s = get();
        if (!s.sessionCode || s.sessionCode !== code.trim()) {
          return { ok: false, error: "Code doesn't match the active session." };
        }
        if (!companyName.trim()) {
          return { ok: false, error: "Pick a company name." };
        }
        const seat = s.sessionSlots.find((x) => !x.claimed);
        if (!seat) {
          return { ok: false, error: "All seats already claimed for this session." };
        }
        if (!CITIES_BY_CODE[hubCode]) {
          return { ok: false, error: "Pick a valid hub airport." };
        }
        // Hub collision check (PRD §7.1): no two teams may share a hub.
        // The PRD spec calls for a blind-bid resolution; in this single-
        // facilitator flow we surface the conflict and let the player
        // pick another city instead. The facilitator can override later
        // via the admin console if they want to allow it for testing.
        const hubTaken = s.teams.find((t) => t.hubCode === hubCode);
        if (hubTaken) {
          return {
            ok: false,
            error: `${hubCode} is already ${hubTaken.name}'s hub. Pick another city — no two teams may share a hub.`,
          };
        }
        // Claim the seat: create a team for this company and bind it.
        // We re-use the existing initial-team setup (cash, slots, fleet
        // etc.) by piggybacking on the startGame action's spec so the
        // joining player gets the same starting position as a solo run.
        const teamId = mkId("team");
        const code2 = companyName.trim().slice(0, 3).toUpperCase().padEnd(3, "X");
        const newTeam: Team = {
          id: teamId,
          name: companyName.trim(),
          code: code2,
          color: ["#1E6B5C", "#2B6B88", "#7A4B2E", "#C38A1E", "#4A6480", "#9A7D3D", "#C23B1F", "#6B5F88", "#4B7A2E", "#2E5C7A"][s.teams.length % 10],
          isPlayer: true,
          hubCode,
          secondaryHubCodes: [],
          doctrine: "premium-service",
          tagline: "",
          marketFocus: "balanced",
          geographicPriority: "global",
          pricingPhilosophy: "standard",
          salaryPhilosophy: "at",
          marketingLevel: "medium",
          csrTheme: "none",
          cashUsd: 150_000_000,
          totalDebtUsd: 0,
          rcfBalanceUsd: 0,
          loans: [],
          taxLossCarryForward: [],
          insurancePolicy: "none",
          fleet: [],
          routes: [],
          decisions: [],
          deferredEvents: [],
          flags: new Set(),
          financialsByQuarter: [],
          brandPts: 50,
          opsPts: 50,
          customerLoyaltyPct: 50,
          brandValue: 50,
          fuelTanks: { small: 0, medium: 0, large: 0 },
          fuelStorageLevelL: 0,
          fuelStorageAvgCostPerL: 0,
          slotsByAirport: { [hubCode]: 50 },
          airportLeases: { [hubCode]: { slots: 50, totalWeeklyCost: 0 } },
          pendingSlotBids: [],
          cargoStorageActivations: [hubCode],
          hubInvestments: {
            fuelReserveTankHubs: [],
            maintenanceDepotHubs: [],
            premiumLoungeHubs: [],
            opsExpansionSlots: 0,
          },
          labourRelationsScore: 50,
          milestones: [],
          consecutiveProfitableQuarters: 0,
          sliders: {
            staff: 2, marketing: 2, service: 2, rewards: 2, operations: 2, customerService: 2,
          },
          sliderStreaks: {
            staff:           { level: 2, quarters: 0 },
            marketing:       { level: 2, quarters: 0 },
            service:         { level: 2, quarters: 0 },
            rewards:         { level: 2, quarters: 0 },
            operations:      { level: 2, quarters: 0 },
            customerService: { level: 2, quarters: 0 },
          },
          members: [
            { role: "CEO", name: "CEO", mvpPts: 0, cards: [] },
            { role: "CFO", name: "CFO", mvpPts: 0, cards: [] },
            { role: "CMO", name: "CMO", mvpPts: 0, cards: [] },
            { role: "CHRO", name: "CHRO", mvpPts: 0, cards: [] },
          ],
        };
        set({
          teams: [...s.teams, newTeam],
          playerTeamId: teamId,
          sessionSlots: s.sessionSlots.map((x) =>
            x.id === seat.id ? { ...x, claimed: true, teamId, companyName: companyName.trim() } : x,
          ),
          phase: s.phase === "idle" ? "playing" : s.phase,
        });
        toast.success(
          `Welcome, ${newTeam.name}`,
          `You're in seat ${s.sessionSlots.findIndex((x) => x.id === seat.id) + 1} of ${s.sessionSlots.length}. Hub ${hubCode}.`,
        );
        return { ok: true };
      },

      applyLiveSimOutcome: (args) => {
        const s = get();
        const team = s.teams.find((t) => t.id === args.teamId);
        if (!team) return { ok: false, error: "Team not found" };

        set({
          teams: s.teams.map((t) => {
            if (t.id !== args.teamId) return t;
            const updated: Team = {
              ...t,
              cashUsd: t.cashUsd + (args.cashDelta ?? 0),
              brandPts: Math.max(0, t.brandPts + (args.brandPtsDelta ?? 0)),
              opsPts: Math.max(0, t.opsPts + (args.opsPtsDelta ?? 0)),
              customerLoyaltyPct: Math.max(0, Math.min(100,
                t.customerLoyaltyPct + (args.loyaltyDelta ?? 0))),
              flags: new Set(t.flags),
            };
            // Set/clear flags
            for (const f of args.setFlags ?? []) updated.flags.add(f);
            for (const f of args.clearFlags ?? []) updated.flags.delete(f);
            // MVP points per role
            if (args.mvpByRole) {
              updated.members = t.members.map((m) => {
                const delta = args.mvpByRole?.[m.role as keyof typeof args.mvpByRole];
                if (!delta) return m;
                return { ...m, mvpPts: m.mvpPts + delta };
              });
            }
            return updated;
          }),
        });

        toast.accent(
          `${args.simId} outcome applied — ${team.name}`,
          [
            args.cashDelta ? `Cash ${args.cashDelta >= 0 ? "+" : ""}${(args.cashDelta / 1_000_000).toFixed(1)}M` : null,
            args.brandPtsDelta ? `Brand ${args.brandPtsDelta >= 0 ? "+" : ""}${args.brandPtsDelta}` : null,
            args.opsPtsDelta ? `Ops ${args.opsPtsDelta >= 0 ? "+" : ""}${args.opsPtsDelta}` : null,
            args.loyaltyDelta ? `Loyalty ${args.loyaltyDelta >= 0 ? "+" : ""}${args.loyaltyDelta}%` : null,
            args.notes,
          ].filter(Boolean).join(" · "),
        );
        return { ok: true };
      },

      resetGame: () => {
        set({
          phase: "idle",
          currentQuarter: 1,
          fuelIndex: 100,
          baseInterestRatePct: 3.5,
          teams: [],
          playerTeamId: null,
          lastCloseResult: null,
          quarterTimerSecondsRemaining: null,
          quarterTimerPaused: false,
          secondHandListings: [],
          cargoContracts: [],
          airportSlots: {},
        });
      },

      // ── Fuel Storage (PRD E2) ──────────────────────────────
      buyFuelTank: (size) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const specs = {
          small:  { cost: 3_000_000,  capacity: 25_000_000 },
          medium: { cost: 8_000_000,  capacity: 75_000_000 },
          large:  { cost: 15_000_000, capacity: 150_000_000 },
        } as const;
        const spec = specs[size];
        if (player.cashUsd < spec.cost)
          return { ok: false, error: `Need ${fmtMoneyPlain(spec.cost)}` };
        const currentCapL =
          player.fuelTanks.small * specs.small.capacity +
          player.fuelTanks.medium * specs.medium.capacity +
          player.fuelTanks.large * specs.large.capacity;
        if (currentCapL + spec.capacity > 300_000_000)
          return { ok: false, error: "300M L maximum storage reached" };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - spec.cost,
            fuelTanks: { ...t.fuelTanks, [size]: t.fuelTanks[size] + 1 },
          }),
        });
        toast.success(`${size[0].toUpperCase() + size.slice(1)} fuel tank installed`,
          `+${(spec.capacity / 1_000_000).toFixed(0)}M litres capacity · $${(spec.cost / 1_000_000).toFixed(1)}M`);
        return { ok: true };
      },

      buyBulkFuel: (litres) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const specs = {
          small: { capacity: 25_000_000 },
          medium: { capacity: 75_000_000 },
          large: { capacity: 150_000_000 },
        };
        const capL =
          player.fuelTanks.small * specs.small.capacity +
          player.fuelTanks.medium * specs.medium.capacity +
          player.fuelTanks.large * specs.large.capacity;
        const room = capL - player.fuelStorageLevelL;
        if (litres > room) return { ok: false, error: `Only ${(room / 1_000_000).toFixed(1)}M L free` };
        const bulkPrice = (s.fuelIndex / 100) * 0.18 * 0.75; // 25% discount
        const cost = litres * bulkPrice;
        if (player.cashUsd < cost) return { ok: false, error: `Need $${(cost / 1_000_000).toFixed(1)}M` };
        const newTotal = player.fuelStorageLevelL + litres;
        const newAvgCost =
          newTotal > 0
            ? (player.fuelStorageLevelL * player.fuelStorageAvgCostPerL + litres * bulkPrice) /
              newTotal
            : 0;
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - cost,
            fuelStorageLevelL: newTotal,
            fuelStorageAvgCostPerL: newAvgCost,
          }),
        });
        toast.success(`Bulk fuel purchased`,
          `${(litres / 1_000_000).toFixed(1)}M L @ $${bulkPrice.toFixed(3)}/L (25% off market)`);
        return { ok: true };
      },

      sellStoredFuel: (litres) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        if (litres > player.fuelStorageLevelL)
          return { ok: false, error: `Only ${(player.fuelStorageLevelL / 1_000_000).toFixed(1)}M L in storage` };
        const sellPrice = (s.fuelIndex / 100) * 0.18 * 0.75;
        const proceeds = litres * sellPrice;
        const newTotal = player.fuelStorageLevelL - litres;
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd + proceeds,
            fuelStorageLevelL: newTotal,
            fuelStorageAvgCostPerL: newTotal > 0 ? t.fuelStorageAvgCostPerL : 0,
          }),
        });
        toast.info("Sold stored fuel",
          `${(litres / 1_000_000).toFixed(1)}M L @ $${sellPrice.toFixed(3)}/L → $${(proceeds / 1_000_000).toFixed(1)}M proceeds`);
        return { ok: true };
      },

      // ── Hub infrastructure (PRD D4) ────────────────────────
      buyHubInvestment: (kind, hubCode) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const code = hubCode ?? player.hubCode;
        const costs = {
          fuelReserveTank: 8_000_000,
          maintenanceDepot: 12_000_000,
          premiumLounge: 5_000_000,
          opsExpansion: 5_000_000,
        };
        const cost = costs[kind];
        if (player.cashUsd < cost)
          return { ok: false, error: `Need $${(cost / 1_000_000).toFixed(1)}M` };

        set({
          teams: s.teams.map((t) => {
            if (t.id !== player.id) return t;
            const h = t.hubInvestments;
            const next = { ...h };
            if (kind === "fuelReserveTank") {
              if (h.fuelReserveTankHubs.includes(code))
                return t;
              next.fuelReserveTankHubs = [...h.fuelReserveTankHubs, code];
            } else if (kind === "maintenanceDepot") {
              if (h.maintenanceDepotHubs.includes(code))
                return t;
              next.maintenanceDepotHubs = [...h.maintenanceDepotHubs, code];
            } else if (kind === "premiumLounge") {
              if (h.premiumLoungeHubs.includes(code))
                return t;
              next.premiumLoungeHubs = [...h.premiumLoungeHubs, code];
            } else if (kind === "opsExpansion") {
              next.opsExpansionSlots = h.opsExpansionSlots + 5;
            }
            return { ...t, cashUsd: t.cashUsd - cost, hubInvestments: next };
          }),
        });
        const labels = {
          fuelReserveTank: "Fuel Reserve Tank",
          maintenanceDepot: "Maintenance Depot",
          premiumLounge: "Premium Lounge",
          opsExpansion: "Hub Ops Expansion",
        };
        toast.success(`${labels[kind]} installed at ${code}`, `−$${(cost / 1_000_000).toFixed(0)}M capital`);
        return { ok: true };
      },

      suspendRoute: (routeId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            routes: t.routes.map((r) => r.id === routeId
              ? { ...r, status: "suspended" as const, consecutiveQuartersActive: 0 }
              : r),
            fleet: t.fleet.map((f) => f.routeId === routeId
              ? { ...f, status: "active" as const, routeId: null }
              : f),
          }),
        });
        toast.info("Route suspended", "Slots retained, 20% holding fee applies.");
        return { ok: true };
      },

      resumeRoute: (routeId) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            routes: t.routes.map((r) => r.id === routeId
              ? { ...r, status: "active" as const }
              : r),
          }),
        });
        toast.success("Route resumed");
        return { ok: true };
      },

      // ── Slot auction (PRD G10) ─────────────────────────────
      submitSlotBid: (airportCode, slots, pricePerSlot) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        if (!CITIES_BY_CODE[airportCode]) return { ok: false, error: "Unknown airport" };
        if (slots < 1) return { ok: false, error: "At least 1 slot required" };
        const city = CITIES_BY_CODE[airportCode];
        const basePrice =
          city.tier === 1 ? 120_000 : city.tier === 2 ? 80_000 : city.tier === 3 ? 40_000 : 20_000;
        if (pricePerSlot < basePrice)
          return { ok: false, error: `Minimum $${(basePrice / 1_000).toFixed(0)}K/slot at Lvl ${city.tier}` };
        const maxCost = slots * pricePerSlot;
        if (player.cashUsd < maxCost)
          return { ok: false, error: `Need $${(maxCost / 1_000_000).toFixed(1)}M cash to commit` };
        const existing = (player.pendingSlotBids ?? []).filter(
          (b) => b.airportCode !== airportCode,
        );
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            pendingSlotBids: [
              ...existing,
              { airportCode, slots, pricePerSlot, quarterSubmitted: s.currentQuarter },
            ],
          }),
        });
        toast.info(`Slot bid queued at ${airportCode}`,
          `${slots} slots × $${(pricePerSlot / 1000).toFixed(0)}K = $${(maxCost / 1_000_000).toFixed(1)}M max`);
        return { ok: true };
      },

      releaseSlots: (airportCode, slotsToRelease) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const lease = player.airportLeases?.[airportCode];
        if (!lease || lease.slots === 0)
          return { ok: false, error: "No slots held at this airport" };
        if (slotsToRelease > lease.slots)
          return { ok: false, error: `Only ${lease.slots} slots held` };

        // Capacity check: route demand at this airport must still be met
        // after release. Total weekly schedules at this airport across all
        // active routes ≤ remaining slots.
        const usedAtAirport = player.routes
          .filter(
            (r) =>
              r.status === "active" &&
              (r.originCode === airportCode || r.destCode === airportCode),
          )
          .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
        const remainingAfter = lease.slots - slotsToRelease;
        if (remainingAfter < usedAtAirport) {
          return {
            ok: false,
            error: `${usedAtAirport} weekly flights still touch ${airportCode}; can keep at most ${slotsToRelease - (usedAtAirport - remainingAfter)} more before disrupting routes`,
          };
        }

        // Proportional release: weekly cost reduces by avg-price × released
        const avgPrice = lease.totalWeeklyCost / lease.slots;
        const releasedWeeklyCost = avgPrice * slotsToRelease;

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            airportLeases: {
              ...t.airportLeases,
              [airportCode]: {
                slots: remainingAfter,
                totalWeeklyCost: Math.max(0, lease.totalWeeklyCost - releasedWeeklyCost),
              },
            },
            slotsByAirport: {
              ...t.slotsByAirport,
              [airportCode]: Math.max(0, (t.slotsByAirport[airportCode] ?? 0) - slotsToRelease),
            },
          }),
          // Return slots to the airport pool so other airlines can bid
          airportSlots: {
            ...s.airportSlots,
            [airportCode]: {
              ...(s.airportSlots[airportCode] ?? { available: 0, nextOpening: 0, nextTickQuarter: 99 }),
              available:
                (s.airportSlots[airportCode]?.available ?? 0) + slotsToRelease,
            },
          },
        });
        toast.info(
          `Released ${slotsToRelease} slots at ${airportCode}`,
          `Stops ~${fmtMoneyPlain(releasedWeeklyCost * 13)}/Q in fees. Slots return to the airport pool.`,
        );
        return { ok: true };
      },

      cancelSlotBid: (airportCode) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            pendingSlotBids: (t.pendingSlotBids ?? []).filter((b) => b.airportCode !== airportCode),
          }),
        });
      },

      adminReleaseSlots: (airportCode, slots) => {
        const s = get();
        // Collect all teams' bids on this airport, highest price first
        const bids: Array<{
          teamId: string;
          slots: number;
          pricePerSlot: number;
        }> = [];
        for (const t of s.teams) {
          for (const b of t.pendingSlotBids ?? []) {
            if (b.airportCode === airportCode) {
              bids.push({ teamId: t.id, slots: b.slots, pricePerSlot: b.pricePerSlot });
            }
          }
        }
        bids.sort((a, b) => b.pricePerSlot - a.pricePerSlot);

        let remaining = slots;
        const awards: Record<string, { slots: number; paid: number }> = {};
        for (const bid of bids) {
          if (remaining <= 0) break;
          const take = Math.min(bid.slots, remaining);
          remaining -= take;
          awards[bid.teamId] = awards[bid.teamId]
            ? { slots: awards[bid.teamId].slots + take, paid: awards[bid.teamId].paid + take * bid.pricePerSlot }
            : { slots: take, paid: take * bid.pricePerSlot };
        }

        set({
          teams: s.teams.map((t) => {
            const award = awards[t.id];
            const filteredBids = (t.pendingSlotBids ?? []).filter((b) => b.airportCode !== airportCode);
            if (!award) return { ...t, pendingSlotBids: filteredBids };
            return {
              ...t,
              cashUsd: t.cashUsd - award.paid,
              slotsByAirport: {
                ...t.slotsByAirport,
                [airportCode]: (t.slotsByAirport[airportCode] ?? 0) + award.slots,
              },
              pendingSlotBids: filteredBids,
            };
          }),
        });

        const winnerCount = Object.keys(awards).length;
        toast.accent(
          `${slots} slots released at ${airportCode}`,
          `${winnerCount} airline${winnerCount === 1 ? "" : "s"} won allocations`,
        );
      },

      // ── Insurance policy (PRD E5) ──────────────────────────
      setInsurancePolicy: (policy) => {
        const s = get();
        const labels: Record<typeof policy, string> = {
          none: "None", low: "Level 1 (30% coverage)",
          medium: "Level 2 (50% coverage)", high: "Level 3 (80% coverage)",
        };
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            insurancePolicy: policy,
          }),
        });
        toast.info(`Insurance policy: ${labels[policy]}`);
      },

      // ── Second-hand aircraft market (A13) ──────────────────
      listSecondHand: (aircraftId, askingPriceUsd) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.acquisitionType !== "buy") return { ok: false, error: "Only owned aircraft" };
        if (askingPriceUsd < plane.bookValue)
          return { ok: false, error: `Minimum ${fmtMoneyPlain(plane.bookValue)} (book value)` };
        if (askingPriceUsd > plane.bookValue * 1.5)
          return { ok: false, error: `Max ${fmtMoneyPlain(plane.bookValue * 1.5)} (1.5× book)` };
        const listing: SecondHandListing = {
          id: mkId("sh"),
          specId: plane.specId,
          askingPriceUsd,
          listedAtQuarter: s.currentQuarter,
          sellerTeamId: player.id,
          ecoUpgrade: plane.ecoUpgrade,
          cabinConfig: plane.cabinConfig,
          manufactureQuarter: plane.purchaseQuarter,
          retirementQuarter: plane.retirementQuarter,
        };
        set({
          secondHandListings: [...s.secondHandListings, listing],
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            fleet: t.fleet.filter((f) => f.id !== aircraftId),
            routes: t.routes.map((r) => ({
              ...r,
              aircraftIds: r.aircraftIds.filter((id) => id !== aircraftId),
            })),
          }),
        });
        toast.info(`Listed for sale: ${AIRCRAFT_BY_ID[plane.specId]?.name ?? plane.specId}`,
          `Asking ${fmtMoneyPlain(askingPriceUsd)}`);
        return { ok: true };
      },

      buySecondHand: (listingId) => {
        const s = get();
        const listing = s.secondHandListings.find((l) => l.id === listingId);
        if (!listing) return { ok: false, error: "Listing not found" };
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        if (player.cashUsd < listing.askingPriceUsd)
          return { ok: false, error: `Need ${fmtMoneyPlain(listing.askingPriceUsd)}` };
        const spec = AIRCRAFT_BY_ID[listing.specId];
        if (!spec) return { ok: false, error: "Unknown spec" };

        const plane: FleetAircraft = {
          id: mkId("ac"),
          specId: listing.specId,
          status: "active",
          acquisitionType: "buy",
          purchaseQuarter: s.currentQuarter,
          purchasePrice: listing.askingPriceUsd,
          bookValue: listing.askingPriceUsd,
          leaseQuarterly: null,
          ecoUpgrade: listing.ecoUpgrade,
          ecoUpgradeQuarter: listing.ecoUpgrade ? s.currentQuarter : null,
          ecoUpgradeCost: 0,
          cabinConfig: listing.cabinConfig,
          routeId: null,
          retirementQuarter: listing.retirementQuarter,
          maintenanceDeficit: 0, satisfactionPct: 75,
        };
        set({
          secondHandListings: s.secondHandListings.filter((l) => l.id !== listingId),
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - listing.askingPriceUsd,
            fleet: [...t.fleet, plane],
          }),
        });
        toast.success(`Acquired ${spec.name}`, `Remaining lifespan ${Math.max(0, listing.retirementQuarter - s.currentQuarter)}Q`);
        return { ok: true };
      },

      adminInjectSecondHand: (specId, askingPriceUsd) => {
        const s = get();
        const spec = AIRCRAFT_BY_ID[specId];
        if (!spec) return;
        const listing: SecondHandListing = {
          id: mkId("sh"),
          specId,
          askingPriceUsd,
          listedAtQuarter: s.currentQuarter,
          sellerTeamId: "admin",
          ecoUpgrade: false,
          cabinConfig: "default",
          manufactureQuarter: Math.max(1, s.currentQuarter - 4),
          retirementQuarter: s.currentQuarter + 12,
        };
        set({ secondHandListings: [...s.secondHandListings, listing] });
        toast.accent(`Admin listed ${spec.name}`, `Asking ${fmtMoneyPlain(askingPriceUsd)}`);
      },

      // ── Cargo contract (PRD E8.6) ──────────────────────────
      adminGrantCargoContract: ({
        originCode, destCode, tonnesPerWeek, ratePerTonneUsd, quarters, source,
      }) => {
        const s = get();
        if (!s.playerTeamId) return;
        const contract: CargoContract = {
          id: mkId("cc"),
          teamId: s.playerTeamId,
          originCode,
          destCode,
          guaranteedTonnesPerWeek: tonnesPerWeek,
          ratePerTonneUsd,
          quartersRemaining: quarters,
          source,
        };
        set({ cargoContracts: [...s.cargoContracts, contract] });
        toast.accent(
          `Cargo contract · ${originCode} → ${destCode}`,
          `${tonnesPerWeek}T/wk @ $${(ratePerTonneUsd).toLocaleString()}/T for ${quarters}Q · ${source}`,
        );
      },

      // ── Ground-stop slot refund (PRD G6) ───────────────────
      adminGroundStopRefund: (routeId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;
        const route = player.routes.find((r) => r.id === routeId);
        if (!route) return;
        const refund = route.quarterlySlotCost * 0.5;
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd + refund,
          }),
        });
        toast.info(
          `Slot fee refund · ${route.originCode} → ${route.destCode}`,
          `+${fmtMoneyPlain(refund)} (50% ground-stop refund)`,
        );
      },

      // ── Admin: trigger deferred event NOW (plot twist) ─────
      adminTriggerDeferred: (eventId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;
        const event = (player.deferredEvents ?? []).find((e) => e.id === eventId);
        if (!event || event.resolved) return;
        let eff: ReturnType<typeof JSON.parse>;
        try {
          eff = JSON.parse(event.effectJson);
        } catch {
          toast.negative("Cannot parse deferred event effect");
          return;
        }
        const newCash = player.cashUsd + (eff.cash ?? 0);
        const newBrand = Math.max(0, player.brandPts + (eff.brandPts ?? 0));
        const newOps = Math.max(0, player.opsPts + (eff.opsPts ?? 0));
        const newLoyalty = Math.max(0, Math.min(100, player.customerLoyaltyPct + (eff.loyaltyDelta ?? 0)));
        const newFlags = new Set(player.flags);
        for (const f of (eff.setFlags ?? [])) newFlags.add(f);
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: newCash,
            brandPts: newBrand,
            opsPts: newOps,
            customerLoyaltyPct: newLoyalty,
            flags: newFlags,
            deferredEvents: (t.deferredEvents ?? []).map((e) => e.id === eventId
              ? { ...e, resolved: true, resolvedOutcome: "triggered" as const, resolvedAtQuarter: s.currentQuarter }
              : e),
          }),
        });
        toast.warning(
          `Plot twist · ${event.sourceScenario}-${event.sourceOption} triggered`,
          event.noteAtQueue ?? "Effects applied immediately",
        );
      },

      // ── Admin: fuel shock (multi-quarter market disruption) ─
      adminFuelShock: (magnitude) => {
        const s = get();
        const newIndex = Math.max(50, Math.min(220, s.fuelIndex + magnitude));
        set({ fuelIndex: newIndex });
        toast.warning(
          `Fuel market shock · Δ${magnitude > 0 ? "+" : ""}${magnitude}`,
          `Fuel index now ${newIndex.toFixed(0)}. All teams pay more this quarter.`,
        );
      },

      // ── Demo mode (PRD §24) ────────────────────────────────
      startDemo: () => {
        // Start a standard new game and advance a few quarters with realistic state
        const startNewGame = get().startNewGame;
        startNewGame({
          airlineName: "Meridian Air",
          code: "MRD",
          doctrine: "premium-service",
          hubCode: "DXB",
          teamCount: 5,
        });
        // Open a few demo routes from the hub
        setTimeout(() => {
          const g = get();
          const player = g.teams.find((t) => t.id === g.playerTeamId);
          if (!player || player.fleet.length < 2) return;
          g.openRoute({
            originCode: "DXB", destCode: "LHR",
            aircraftIds: [player.fleet[0].id],
            dailyFrequency: 2, pricingTier: "premium",
          });
          const p2 = get().teams.find((t) => t.id === g.playerTeamId);
          if (p2 && p2.fleet[1]) {
            g.openRoute({
              originCode: "DXB", destCode: "CDG",
              aircraftIds: [p2.fleet[1].id],
              dailyFrequency: 1, pricingTier: "standard",
            });
          }
          toast.info("Demo mode ready", "Meridian Air · DXB hub · 2 routes flying");
        }, 50);
      },

      // ── Secondary hubs (§4.4) ──────────────────────────────
      addSecondaryHub: (cityCode) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (s.currentQuarter < 3) return { ok: false, error: "Secondary hubs unlock Q3" };
        if (cityCode === player.hubCode) return { ok: false, error: "Already your primary hub" };
        if (player.secondaryHubCodes.includes(cityCode)) return { ok: false, error: "Already a secondary hub" };
        if (!CITIES_BY_CODE[cityCode]) return { ok: false, error: "Unknown city" };
        // One-time activation cost: 1× terminal fee as deposit
        const spec = CITIES_BY_CODE[cityCode];
        if (!spec) return { ok: false, error: "Unknown city" };
        const activationCost =
          spec.tier === 1 ? 30_000_000 :
          spec.tier === 2 ? 22_000_000 :
          spec.tier === 3 ? 12_000_000 : 6_000_000;
        if (player.cashUsd < activationCost) return { ok: false, error: `Need ${activationCost / 1e6}M activation cost` };
        set({
          teams: s.teams.map((t) => t.id === player.id ? {
            ...t,
            cashUsd: t.cashUsd - activationCost,
            secondaryHubCodes: [...t.secondaryHubCodes, cityCode],
          } : t),
        });
        return { ok: true };
      },

      removeSecondaryHub: (cityCode) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id === s.playerTeamId ? {
            ...t,
            secondaryHubCodes: t.secondaryHubCodes.filter((c) => c !== cityCode),
          } : t),
        });
      },

      // ── Flash Deal (§6.3, S3) ──────────────────────────────
      claimFlashDeal: (count) => {
        const s = get();
        if (s.currentQuarter !== 13) return { ok: false, error: "Flash Deal only at Q13" };
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const deposit = 4_000_000 * count;
        if (player.cashUsd < deposit) return { ok: false, error: "Insufficient cash for deposit" };
        if (count < 1 || count > 10) return { ok: false, error: "Flash Deal max 10 per team" };
        // Eco-engine A320neos (unlocks Q12 so available at Q13)
        const planes: FleetAircraft[] = Array.from({ length: count }, () => ({
          id: mkId("ac"), specId: "A320neo", status: "ordered",
          acquisitionType: "buy", purchaseQuarter: s.currentQuarter,
          purchasePrice: 28_000_000, bookValue: 28_000_000,
          leaseQuarterly: null, ecoUpgrade: true, ecoUpgradeQuarter: s.currentQuarter, ecoUpgradeCost: 0,
          cabinConfig: "default", routeId: null,
          retirementQuarter: s.currentQuarter + 16,
          maintenanceDeficit: 0, satisfactionPct: 75,
        }));
        set({
          teams: s.teams.map((t) => t.id === player.id ? {
            ...t,
            cashUsd: t.cashUsd - deposit,
            fleet: [...t.fleet, ...planes],
            flags: new Set([...Array.from(t.flags), "flash_deal_claimed", "modern_fleet"]),
          } : t),
        });
        return { ok: true };
      },

      // ── Admin decision controls (PRD §10.3) ────────────────
      adminClearDecision: (scenarioId, quarter) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            decisions: t.decisions.filter((d) =>
              !(d.scenarioId === scenarioId && d.quarter === quarter)),
          }),
        });
        toast.warning(`Decision ${scenarioId} cleared`, "Slot reopened for resubmission.");
      },

      adminOverrideDecision: (scenarioId, newOptionId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        const scenario = SCENARIOS.find((sc) => sc.id === scenarioId);
        if (!scenario) return { ok: false, error: "Unknown scenario" };
        const option = scenario.options.find((o) => o.id === newOptionId);
        if (!option) return { ok: false, error: "Unknown option" };

        const cleanedDecisions = player.decisions.filter(
          (d) => d.scenarioId !== scenarioId,
        );
        const updated = applyOptionEffect(
          { ...player, decisions: cleanedDecisions },
          option.effect,
        );
        updated.decisions = [
          ...cleanedDecisions,
          {
            scenarioId: scenarioId as ScenarioDecision["scenarioId"],
            quarter: scenario.quarter,
            optionId: newOptionId,
            submittedAt: Date.now(),
          },
        ];
        if (option.effect.deferred) {
          const d = option.effect.deferred;
          updated.deferredEvents = [
            ...(updated.deferredEvents ?? []),
            {
              id: mkId("ev"),
              sourceScenario: scenarioId as ScenarioDecision["scenarioId"],
              sourceOption: newOptionId,
              targetQuarter: d.quarter,
              probability: d.probability ?? 1,
              effectJson: serializeEffect(d.effect),
              noteAtQueue: `${scenario.title} · Option ${newOptionId} (admin override)`,
            },
          ];
        }
        set({
          teams: s.teams.map((t) => t.id === player.id ? updated : t),
        });
        toast.accent(
          `Admin override: ${scenarioId} → ${newOptionId}`,
          `${option.label}. Prior effects remain in state; use state adjusters to rebalance.`,
        );
        return { ok: true };
      },

      // ── MVP scoring (PRD §15) ──────────────────────────────
      awardMvp: (role, pts, card) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            members: t.members.map((m) => m.role === role ? {
              ...m,
              mvpPts: m.mvpPts + pts,
              cards: card && !m.cards.includes(card) ? [...m.cards, card] : m.cards,
            } : m),
          }),
        });
        toast.accent(
          `${role} earned ${pts} MVP${pts === 1 ? "" : " pts"}${card ? ` + ${card}` : ""}`,
        );
      },

      renameMember: (role, name) => {
        const s = get();
        set({
          teams: s.teams.map((t) => t.id !== s.playerTeamId ? t : {
            ...t,
            members: t.members.map((m) => m.role === role ? { ...m, name } : m),
          }),
        });
      },

      // ── Quarter timer (A12) ────────────────────────────────
      startQuarterTimer: (seconds = 1800) => {
        set({ quarterTimerSecondsRemaining: seconds, quarterTimerPaused: false });
      },
      pauseQuarterTimer: () => {
        set({ quarterTimerPaused: true });
      },
      resumeQuarterTimer: () => {
        set({ quarterTimerPaused: false });
      },
      extendQuarterTimer: (seconds) => {
        const s = get();
        if (s.quarterTimerSecondsRemaining === null) return;
        set({ quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining + seconds });
      },
      tickQuarterTimer: (deltaSeconds) => {
        const s = get();
        if (s.quarterTimerSecondsRemaining === null || s.quarterTimerPaused) return;
        const next = Math.max(0, s.quarterTimerSecondsRemaining - deltaSeconds);
        const wasRunning = s.quarterTimerSecondsRemaining > 0;
        set({ quarterTimerSecondsRemaining: next });

        // Auto-submit + auto-close when timer transitions to 0 (PRD A5)
        if (wasRunning && next === 0) {
          const player = s.teams.find((t) => t.id === s.playerTeamId);
          if (!player) return;
          const scenariosThisQuarter = SCENARIOS_BY_QUARTER[s.currentQuarter] ?? [];
          const unsubmitted = scenariosThisQuarter.filter(
            (sc) => !player.decisions.some(
              (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
            ),
          );
          for (const sc of unsubmitted) {
            // Auto-submit the PRD-defined worst outcome
            const fallback = sc.autoSubmitOptionId;
            get().submitDecision({
              scenarioId: sc.id,
              optionId: fallback,
            });
            toast.negative(
              `Timeout: ${sc.id} auto-submitted`,
              `Defaulted to option ${fallback} (worst outcome per PRD §A5)`,
            );
          }
          if (unsubmitted.length > 0) {
            toast.warning(
              `${unsubmitted.length} decision${unsubmitted.length > 1 ? "s" : ""} auto-submitted`,
              "Timer expired. Closing quarter automatically.",
            );
          } else {
            toast.warning("Quarter timer expired", "Closing quarter automatically.");
          }
          // Auto-close quarter
          setTimeout(() => get().closeQuarter(), 400);
        }
      },
    }),
    {
      name: "skyforce-game-v1",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        phase: s.phase,
        currentQuarter: s.currentQuarter,
        fuelIndex: s.fuelIndex,
        baseInterestRatePct: s.baseInterestRatePct,
        teams: s.teams.map((t) => ({
          ...t,
          flags: Array.from(t.flags) as unknown as Set<string>,
        })),
        playerTeamId: s.playerTeamId,
        quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining,
        quarterTimerPaused: s.quarterTimerPaused,
        secondHandListings: s.secondHandListings,
        cargoContracts: s.cargoContracts,
        airportSlots: s.airportSlots,
        sessionCode: s.sessionCode,
        sessionSlots: s.sessionSlots,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        // If we crashed mid-close last session, the phase will be "quarter-closing"
        // but lastCloseResult isn't persisted — surface no-op modal won't open and
        // the user thinks the UI is frozen. Force back to "playing" so buttons work.
        if (state.phase === "quarter-closing") {
          state.phase = "playing";
          state.lastCloseResult = null;
        }
        if (!state.cargoContracts) state.cargoContracts = [];
        // Migration: older saves don't have airportSlots — initialize fresh
        // so existing routes continue to work (slots = unconstrained from
        // their existing in-game allocation in slotsByAirport).
        if (!state.airportSlots || Object.keys(state.airportSlots).length === 0) {
          state.airportSlots = makeInitialAirportSlots();
        } else {
          // CRITICAL: ensure every CITY has an airportSlots entry. Older
          // saves had a partial map (only the cities that existed in the
          // first city list). When we expanded to ~380 cities, bids at
          // newly-added airports silently failed because the auction
          // resolver skips airports with no `state` entry. Backfill any
          // missing cities with fresh tier-default pools.
          const fresh = makeInitialAirportSlots();
          for (const code of Object.keys(fresh)) {
            if (!state.airportSlots[code]) {
              state.airportSlots[code] = fresh[code];
            }
          }
        }
        state.teams = state.teams.map((t) => {
          const flags = new Set(Array.isArray(t.flags) ? t.flags : Array.from(t.flags ?? []));
          // One-time testing grant: give Meridian Air $900M cash so the
          // owner (Hamade) can validate aircraft purchases. Guarded by a
          // flag so it only fires once per team — re-rehydrating doesn't
          // double-grant. Remove this block once testing is complete.
          let cashUsd = t.cashUsd;
          if (
            t.isPlayer &&
            (t.name?.toLowerCase().includes("meridian") || t.id === "team-player") &&
            !flags.has("testing-cash-grant-900M-applied")
          ) {
            cashUsd += 900_000_000;
            flags.add("testing-cash-grant-900M-applied");
            // Defer the toast to the next tick so the store has fully
            // rehydrated before we touch the UI layer.
            setTimeout(() => {
              toast.accent(
                "Testing cash grant: +$900M",
                "Granted to Meridian Air for aircraft-purchase validation.",
              );
            }, 600);
          }
          return ({
          ...t,
          cashUsd,
          flags,
          deferredEvents: t.deferredEvents ?? [],
          rcfBalanceUsd: t.rcfBalanceUsd ?? 0,
          taxLossCarryForward: t.taxLossCarryForward ?? [],
          secondaryHubCodes: t.secondaryHubCodes ?? [],
          sliders: {
            ...t.sliders,
            customerService: t.sliders?.customerService ?? 2,
          },
          members: t.members && t.members.length > 0 ? t.members : [
            { role: "CEO",  name: "Your CEO",  mvpPts: 0, cards: [] },
            { role: "CFO",  name: "Your CFO",  mvpPts: 0, cards: [] },
            { role: "CMO",  name: "Your CMO",  mvpPts: 0, cards: [] },
            { role: "CHRO", name: "Your CHRO", mvpPts: 0, cards: [] },
          ],
          fleet: t.fleet.map((f) => {
            // Sweep stale routeIds — if the aircraft is pointed at a route
            // that no longer exists (or is closed), treat it as idle so it
            // shows up in the route-setup picker again.
            const stale = f.routeId
              ? !((t.routes ?? []).some((r) => r.id === f.routeId && r.status !== "closed"))
              : false;
            return {
              ...f,
              retirementQuarter: f.retirementQuarter ?? f.purchaseQuarter + 16,
              maintenanceDeficit: f.maintenanceDeficit ?? 0,
              satisfactionPct: f.satisfactionPct ?? 75,
              ecoUpgrade: f.ecoUpgrade ?? false,
              ecoUpgradeQuarter: f.ecoUpgradeQuarter ?? null,
              ecoUpgradeCost: f.ecoUpgradeCost ?? 0,
              routeId: stale ? null : f.routeId,
            };
          }),
          insurancePolicy: t.insurancePolicy ?? "none",
          tagline: t.tagline ?? "",
          marketFocus: t.marketFocus ?? "balanced",
          geographicPriority: t.geographicPriority ?? "global",
          pricingPhilosophy: t.pricingPhilosophy ?? "standard",
          salaryPhilosophy: t.salaryPhilosophy ?? "at",
          marketingLevel: t.marketingLevel ?? "medium",
          csrTheme: t.csrTheme ?? "none",
          fuelTanks: t.fuelTanks ?? { small: 0, medium: 0, large: 0 },
          fuelStorageLevelL: t.fuelStorageLevelL ?? 0,
          fuelStorageAvgCostPerL: t.fuelStorageAvgCostPerL ?? 0,
          slotsByAirport: t.slotsByAirport ?? { [t.hubCode]: 30 },
          // Migration: backfill airportLeases from any existing routes so
          // pre-Model-B saves can still operate. Each airport that the team
          // is flying to/from receives slots equal to its existing weekly
          // schedule load (so capacity check doesn't immediately break).
          // No fee charged on backfilled slots — pretend they're grandfathered.
          airportLeases: t.airportLeases ?? (() => {
            const leases: Record<string, AirportLease> = {};
            const usage: Record<string, number> = {};
            for (const r of (t.routes ?? [])) {
              if (r.status === "closed") continue;
              const wf = r.dailyFrequency * 7;
              usage[r.originCode] = (usage[r.originCode] ?? 0) + wf;
              usage[r.destCode] = (usage[r.destCode] ?? 0) + wf;
            }
            // Plus the legacy slotsByAirport hub seed so the team has hub capacity
            for (const code of Object.keys(t.slotsByAirport ?? {})) {
              const seed = t.slotsByAirport[code] ?? 0;
              usage[code] = Math.max(usage[code] ?? 0, seed);
            }
            for (const code of Object.keys(usage)) {
              leases[code] = { slots: usage[code], totalWeeklyCost: 0 };
            }
            return leases;
          })(),
          pendingSlotBids: t.pendingSlotBids ?? [],
          cargoStorageActivations: t.cargoStorageActivations ?? [t.hubCode],
          hubInvestments: t.hubInvestments ?? {
            fuelReserveTankHubs: [],
            maintenanceDepotHubs: [],
            premiumLoungeHubs: [],
            opsExpansionSlots: 0,
          },
          labourRelationsScore: t.labourRelationsScore ?? 50,
          milestones: t.milestones ?? [],
          consecutiveProfitableQuarters: t.consecutiveProfitableQuarters ?? 0,
          routes: (t.routes ?? []).map((r) => ({
            ...r,
            econFare: r.econFare ?? null,
            busFare: r.busFare ?? null,
            firstFare: r.firstFare ?? null,
            isCargo: r.isCargo ?? false,
            consecutiveQuartersActive: r.consecutiveQuartersActive ?? 0,
            consecutiveLosingQuarters: r.consecutiveLosingQuarters ?? 0,
          })),
        });
        });
      },
    },
  ),
);

// ─── Selectors ──────────────────────────────────────────────
export function selectPlayer(s: GameStore): Team | null {
  return s.teams.find((t) => t.id === s.playerTeamId) ?? null;
}

export function selectRivals(s: GameStore): Team[] {
  return s.teams.filter((t) => !t.isPlayer);
}
