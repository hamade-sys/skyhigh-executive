"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { CITIES_BY_CODE } from "@/data/cities";
import { SCENARIOS_BY_QUARTER, type OptionEffect } from "@/data/scenarios";
import {
  applyOptionEffect,
  computeBrandValue,
  distanceBetween,
  runQuarterClose,
  serializeEffect,
  type QuarterCloseResult,
} from "@/lib/engine";
import type {
  DeferredEvent,
  DoctrineId,
  FleetAircraft,
  GameState,
  LoanInstrument,
  PricingTier,
  ScenarioDecision,
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
  }): void;

  setSliders(sliders: Partial<Sliders>): void;

  orderAircraft(args: {
    specId: string;
    acquisitionType: "buy" | "lease";
  }): { ok: boolean; error?: string };

  addEcoUpgrade(aircraftId: string): { ok: boolean; error?: string };

  decommissionAircraft(aircraftId: string): void;

  openRoute(args: {
    originCode: string;
    destCode: string;
    aircraftIds: string[];
    dailyFrequency: number;
    pricingTier: PricingTier;
  }): { ok: boolean; error?: string };

  closeRoute(routeId: string): void;

  submitDecision(args: {
    scenarioId: string;
    optionId: "A" | "B" | "C" | "D" | "E";
    lockInQuarters?: number;
  }): void;

  borrowCapital(amount: number): { ok: boolean; error?: string };

  closeQuarter(): void;
  advanceToNext(): void;
  resetGame(): void;

  addSecondaryHub(cityCode: string): { ok: boolean; error?: string };
  removeSecondaryHub(cityCode: string): void;
  claimFlashDeal(count: number): { ok: boolean; error?: string };

  // Quarter timer (A12)
  startQuarterTimer(seconds?: number): void;
  pauseQuarterTimer(): void;
  resumeQuarterTimer(): void;
  extendQuarterTimer(seconds: number): void;
  tickQuarterTimer(deltaSeconds: number): void;
}

const INITIAL_SLIDERS: Sliders = {
  staff: 2, marketing: 2, service: 2, rewards: 2, operations: 2,
};

function emptyStreaks() {
  const out: Team["sliderStreaks"] = {
    staff: { level: 2, quarters: 0 },
    marketing: { level: 2, quarters: 0 },
    service: { level: 2, quarters: 0 },
    rewards: { level: 2, quarters: 0 },
    operations: { level: 2, quarters: 0 },
  };
  return out;
}

function mkId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function makeStartingTeam(args: {
  airlineName: string;
  code: string;
  doctrine: DoctrineId;
  hubCode: string;
  isPlayer: boolean;
  color: string;
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
    financialsByQuarter: [],
  };
}

function ensureStreaks(t: Team): Team {
  if (!t.sliderStreaks) return { ...t, sliderStreaks: emptyStreaks() };
  return t;
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

      startNewGame: ({ airlineName, code, doctrine, hubCode, teamCount = 5 }) => {
        const player = makeStartingTeam({
          airlineName, code, doctrine, hubCode,
          isPlayer: true, color: "#14355E",
        });

        // Seed: give player 2× A320 to start (PRD says seed planes post-Q1, but
        // single-team demo launches directly into ops — gives them something to fly).
        const starter1: FleetAircraft = {
          id: mkId("ac"), specId: "A320", status: "active",
          acquisitionType: "buy", purchaseQuarter: 1,
          purchasePrice: 25_000_000, bookValue: 25_000_000,
          leaseQuarterly: null, ecoUpgrade: false, ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
          cabinConfig: "default", routeId: null,
          retirementQuarter: 1 + 16, // 20 real years → 16 quarters
        };
        const starter2: FleetAircraft = { ...starter1, id: mkId("ac") };
        player.fleet = [starter1, starter2];

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
          const r = makeStartingTeam({
            airlineName: meta.name, code: meta.code, doctrine: "budget-expansion",
            hubCode: hub, isPlayer: false, color: meta.color,
          });
          // Give rivals some routes/fleet to make leaderboard plausible
          r.brandPts = 40 + Math.floor(Math.random() * 30);
          r.customerLoyaltyPct = 45 + Math.floor(Math.random() * 20);
          r.cashUsd = 120_000_000 + Math.floor(Math.random() * 80_000_000);
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
        });
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

      orderAircraft: ({ specId, acquisitionType }) => {
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
          cabinConfig: "default", routeId: null,
          retirementQuarter: s.currentQuarter + 16,
        };

        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, cashUsd: t.cashUsd - price, fleet: [...t.fleet, plane] }
              : t,
          ),
        });
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

      decommissionAircraft: (aircraftId) => {
        const s = get();
        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              fleet: t.fleet.filter((f) => f.id !== aircraftId),
              routes: t.routes.map((r) =>
                r.aircraftIds.includes(aircraftId)
                  ? { ...r, aircraftIds: r.aircraftIds.filter((id) => id !== aircraftId) }
                  : r),
            },
          ),
        });
      },

      openRoute: ({ originCode, destCode, aircraftIds, dailyFrequency, pricingTier }) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (originCode === destCode) return { ok: false, error: "Same origin and destination" };
        if (!CITIES_BY_CODE[originCode] || !CITIES_BY_CODE[destCode])
          return { ok: false, error: "Unknown city" };
        if (aircraftIds.length === 0)
          return { ok: false, error: "Assign at least one aircraft" };
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
        if (dailyFrequency < 1 || dailyFrequency > 10)
          return { ok: false, error: "Daily frequency 1–10" };

        const route = {
          id: mkId("route"),
          originCode,
          destCode,
          distanceKm: dist,
          aircraftIds,
          dailyFrequency,
          pricingTier,
          status: "active" as const,
          openQuarter: s.currentQuarter,
          avgOccupancy: 0,
          quarterlyRevenue: 0,
          quarterlyFuelCost: 0,
          quarterlySlotCost: 0,
        };

        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              routes: [...t.routes, route],
              fleet: t.fleet.map((f) =>
                aircraftIds.includes(f.id)
                  ? { ...f, status: "active", routeId: route.id }
                  : f),
            },
          ),
        });
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

      closeQuarter: () => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;

        // Transition ordered → active planes, and retire aircraft whose
        // retirementQuarter has been reached (A13).
        const teamReady: Team = {
          ...ensureStreaks(player),
          fleet: player.fleet.map((f) => {
            const retiring = f.retirementQuarter !== undefined && s.currentQuarter >= f.retirementQuarter;
            if (retiring) return { ...f, status: "retired" as const, routeId: null };
            if (f.status === "ordered") return { ...f, status: "active" as const };
            return f;
          }),
          routes: player.routes.map((r) => {
            // Drop retired aircraft from routes
            const stillFlying = r.aircraftIds.filter((id) => {
              const f = player.fleet.find((x) => x.id === id);
              return f && (f.retirementQuarter === undefined || s.currentQuarter < f.retirementQuarter);
            });
            return { ...r, aircraftIds: stillFlying };
          }),
          flags: new Set(player.flags),
          sliderStreaks: { ...player.sliderStreaks },
        };

        const result = runQuarterClose(teamReady, {
          baseInterestRatePct: s.baseInterestRatePct,
          fuelIndex: s.fuelIndex,
          quarter: s.currentQuarter,
        });

        // Commit result back to team
        const closed: Team = {
          ...teamReady,
          cashUsd: result.newCashUsd,
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

        // Update rivals with plausible drift
        const rivals = s.teams.filter((t) => !t.isPlayer).map((r) => {
          const driftBrand = (Math.random() - 0.5) * 6;
          const driftLoyalty = (Math.random() - 0.5) * 4;
          const updated = {
            ...r,
            brandPts: Math.max(0, r.brandPts + driftBrand),
            customerLoyaltyPct: Math.max(0, Math.min(100, r.customerLoyaltyPct + driftLoyalty)),
            cashUsd: Math.max(0, r.cashUsd + (Math.random() - 0.45) * 20_000_000),
          };
          return { ...updated, brandValue: computeBrandValue(updated) };
        });

        set({
          teams: [closed, ...rivals],
          lastCloseResult: result,
          phase: "quarter-closing",
          // Fuel index drifts
          fuelIndex: Math.max(70, Math.min(160, s.fuelIndex + (Math.random() - 0.5) * 10)),
        });
      },

      advanceToNext: () => {
        const s = get();
        if (s.currentQuarter >= 20) {
          set({ phase: "endgame", lastCloseResult: null });
          return;
        }
        set({
          currentQuarter: s.currentQuarter + 1,
          phase: "playing",
          lastCloseResult: null,
        });
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
        });
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
        set({ quarterTimerSecondsRemaining: next });
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
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;
        state.teams = state.teams.map((t) => ({
          ...t,
          flags: new Set(Array.isArray(t.flags) ? t.flags : Array.from(t.flags ?? [])),
          deferredEvents: t.deferredEvents ?? [],
          rcfBalanceUsd: t.rcfBalanceUsd ?? 0,
          secondaryHubCodes: t.secondaryHubCodes ?? [],
          fleet: t.fleet.map((f) => ({
            ...f,
            retirementQuarter: f.retirementQuarter ?? f.purchaseQuarter + 16,
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
