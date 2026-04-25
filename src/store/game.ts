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
  }): { ok: boolean; error?: string };

  addEcoUpgrade(aircraftId: string): { ok: boolean; error?: string };

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
  }): { ok: boolean; error?: string };

  closeRoute(routeId: string): void;
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
    // PRD G10 — each team starts with 30 slots at their hub.
    // Legacy field kept for save migration; airportLeases is the active
    // bookkeeping model now.
    slotsByAirport: { [args.hubCode]: 30 },
    // PRD update — Model B recurring slot fees. Hub starts free (sunk
    // capex baked into hub terminal fee) so totalWeeklyCost is 0 there.
    // Slots won via auction will populate this with their bid prices.
    airportLeases: { [args.hubCode]: { slots: 30, totalWeeklyCost: 0 } },
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

      orderAircraft: ({ specId, acquisitionType, cabinConfig = "default" }) => {
        const s = get();
        const spec = AIRCRAFT_BY_ID[specId];
        if (!spec) return { ok: false, error: "Unknown aircraft" };
        if (spec.unlockQuarter > s.currentQuarter) {
          return { ok: false, error: `Not yet available — unlocks Q${spec.unlockQuarter}` };
        }
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const price = acquisitionType === "buy" ? spec.buyPriceUsd : spec.leasePerQuarterUsd;
        if (player.cashUsd < price) return { ok: false, error: "Insufficient cash" };

        const plane: FleetAircraft = {
          id: mkId("ac"), specId, status: "ordered",
          acquisitionType, purchaseQuarter: s.currentQuarter,
          purchasePrice: acquisitionType === "buy" ? spec.buyPriceUsd : 0,
          bookValue: acquisitionType === "buy" ? spec.buyPriceUsd : 0,
          leaseQuarterly: acquisitionType === "lease" ? spec.leasePerQuarterUsd : null,
          ecoUpgrade: false, ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
          cabinConfig, routeId: null,
          retirementQuarter: s.currentQuarter + 16,
          maintenanceDeficit: 0, satisfactionPct: 75,
        };

        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, cashUsd: t.cashUsd - price, fleet: [...t.fleet, plane] }
              : t,
          ),
        });
        toast.success(
          `${spec.name} ${acquisitionType === "buy" ? "purchased" : "leased"}`,
          `Arrives Q${s.currentQuarter + 1}`,
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

      openRoute: ({ originCode, destCode, aircraftIds, dailyFrequency, pricingTier, econFare, busFare, firstFare, isCargo }) => {
        // Cargo routes require cargo-storage activation at both endpoints (PRD C9)
        const cargoStorageCost = (code: string): number => {
          const c = CITIES_BY_CODE[code];
          if (!c) return 0;
          return c.tier === 1 ? 8_000_000 : c.tier === 2 ? 4_000_000 : c.tier === 3 ? 2_000_000 : 800_000;
        };
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (originCode === destCode) return { ok: false, error: "Same origin and destination" };
        if (!CITIES_BY_CODE[originCode] || !CITIES_BY_CODE[destCode])
          return { ok: false, error: "Unknown city" };
        if (aircraftIds.length === 0)
          return { ok: false, error: "Assign at least one aircraft" };
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
          status: "active" as const,
          openQuarter: s.currentQuarter,
          avgOccupancy: 0,
          quarterlyRevenue: 0,
          quarterlyFuelCost: 0,
          quarterlySlotCost: 0,
          isCargo: isCargo ?? false,
          consecutiveQuartersActive: 0,
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
        toast.success(
          `Route opened: ${originCode} → ${destCode}`,
          `${Math.round(dist).toLocaleString()} km · ${dailyFrequency}/day · ${pricingTier}`,
        );
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
        let newAircraftIds = patch.aircraftIds ?? route.aircraftIds;
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

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            routes: t.routes.map((r) => r.id !== routeId ? r : {
              ...r,
              dailyFrequency: patch.dailyFrequency ?? r.dailyFrequency,
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
            costs: result.revenue - result.netProfit,
            netProfit: result.netProfit,
            brandPts: result.newBrandPts,
            opsPts: result.newOpsPts,
            loyalty: result.newLoyalty,
            brandValue: result.newBrandValue,
          }],
        };

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
        const { slots: slotsAfterAuction, awards } = resolveSlotAuctions(
          s.airportSlots ?? {},
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
            "Submit bids in the Ops form. Winners announced at quarter close.",
          );
        }

        set({
          teams: delayedTeams,
          currentQuarter: nextQ,
          phase: "playing",
          lastCloseResult: null,
          airportSlots: tickedSlots,
          // Reset quarter timer for next cycle
          quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining !== null ? 1800 : null,
          quarterTimerPaused: false,
        });
        toast.accent(
          `Q${nextQ} opens`,
          fmtQuarter(nextQ),
        );
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
        }
        state.teams = state.teams.map((t) => ({
          ...t,
          flags: new Set(Array.isArray(t.flags) ? t.flags : Array.from(t.flags ?? [])),
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
          fleet: t.fleet.map((f) => ({
            ...f,
            retirementQuarter: f.retirementQuarter ?? f.purchaseQuarter + 16,
            maintenanceDeficit: f.maintenanceDeficit ?? 0,
            satisfactionPct: f.satisfactionPct ?? 75,
          })),
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
        }));
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
