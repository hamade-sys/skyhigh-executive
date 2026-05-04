"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { SCENARIOS, SCENARIOS_BY_QUARTER, scenariosForQuarter } from "@/data/scenarios";
import {
  applyOptionEffect,
  computeAirlineValue,
  computeBrandValue,
  computeRouteEconomics,
  distanceBetween,
  effectiveBorrowingRate,
  maxBorrowingUsd,
  maxRouteDailyFrequency,
  odKey,
  runQuarterClose,
  serializeEffect,
  type QuarterCloseResult,
} from "@/lib/engine";
import {
  BASE_SLOT_PRICE_BY_TIER,
  applyYearlyTickIfDue,
  makeInitialAirportSlots,
  resolveSlotAuctions,
  type BidEntry,
} from "@/lib/slots";
import { toast } from "./toasts";
import { fmtQuarter, getTotalRounds, TOTAL_GAME_ROUNDS } from "@/lib/format";
import {
  planBotAircraftOrder,
  planBotRoutes,
  botSlotBidPrice,
  botPickScenarioOption,
  type BotDifficulty,
} from "@/lib/ai-bots";
import {
  saveSnapshot as snapSave,
  loadSnapshot as snapLoad,
  deleteSnapshot as snapDelete,
} from "@/lib/snapshots";
import { FUEL_BASELINE_USD_PER_L, effectiveBaseRatePct, effectiveRangeKm, effectiveTravelIndex, newsFuelIndexHint } from "@/lib/engine";
import {
  totalUpgradeCostPerPlaneUsd,
  amenityCostUsd,
  cargoBellyCostUsd,
} from "@/lib/aircraft-upgrades";
import {
  PREORDER_DEPOSIT_PCT,
  PREORDER_CANCEL_PENALTY_PCT,
  effectiveProductionCap,
  isAnnouncementOpen,
  isReleased,
  queuedForSpec,
} from "@/lib/pre-orders";
import {
  SUBSIDIARY_BY_TYPE,
  SUBSIDIARY_BROKER_FEE_PCT,
  SUBSIDIARY_QUARTERLY_APPRECIATION,
  SUBSIDIARY_VALUE_CEILING_MULT,
} from "@/data/subsidiaries";
import {
  AIRPORT_DEFAULT_CAPACITY_BY_TIER,
  AIRPORT_EXPANSION_COST_PER_LEVEL,
  AIRPORT_EXPANSION_SLOTS,
  AIRPORT_MAX_CAPACITY_BY_TIER,
  AIRPORT_UPGRADES_BY_QUARTER,
  airportAskingPriceUsd,
  applyGovernmentUpgrade,
  applyOwnerSlotRate,
  type AirportGovernmentUpgrade,
} from "@/lib/airport-ownership";
import {
  LEASE_BUYOUT_RESIDUAL_PCT,
  canLeaseSpec,
  isLeaseExpired,
  leaseFleetRatio,
  leaseTermsFor,
  wouldExceedLeaseCap,
} from "@/lib/lease";
import { pickLenderName } from "@/lib/bank-names";
import {
  hubPriceUsd,
  ONBOARDING_TOTAL_BUDGET_USD,
} from "@/lib/hub-pricing";
import { createInitializedTeamFromOnboarding } from "@/lib/games/team-factory";
import { pickNextAvailableColor, type AirlineColorId } from "@/lib/games/airline-colors";
import type {
  AirportBid,
  AirportLease,
  AirportSlotState,
  CabinConfig,
  CargoContract,
  DeferredEvent,
  DoctrineId,
  FleetAircraft,
  GameState,
  LoanInstrument,
  PreOrder,
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

  /**
   * True while this browser is hydrated from a server-side multiplayer game.
   * Persisted so the custom storage can detect it and refuse to overwrite the
   * solo save slot while a multiplayer session is active. Reset to false by
   * startNewGame / resetGame so solo play never bleeds into multiplayer saves.
   */
  isMultiplayerSession: boolean;
  /** True when this browser is connected as a Game Master / facilitator.
   *  All state-mutating actions check this flag and return early so the
   *  GM can spectate freely without accidentally changing any team's state. */
  isObserver: boolean;

  // ── Actions ───────────────────────────────────────────────
  startNewGame(args: {
    airlineName: string;
    code: string;
    doctrine: DoctrineId;
    hubCode: string;
    /** Number of rival bots to seed alongside the player. Defaults
     *  to 5. Facilitator-only setting now — not exposed in player
     *  onboarding UI. */
    teamCount?: number;

    // Optional Q1 Brand Building profile (defaults applied if omitted)
    tagline?: string;
    marketFocus?: "passenger" | "cargo" | "balanced";
    geographicPriority?: "north-america" | "europe" | "asia-pacific" | "middle-east" | "global";
    pricingPhilosophy?: "budget" | "standard" | "premium" | "ultra";
    salaryPhilosophy?: "below" | "at" | "above";
    marketingLevel?: "low" | "medium" | "high" | "aggressive";
    csrTheme?: "environment" | "community" | "employees" | "none";
    /** Phase 9 — visual identity color the player picked at
     *  onboarding. Defaults to "teal" (first in the palette). Bot
     *  rivals fill the remaining colors deterministically. */
    airlineColorId?: import("@/lib/games/airline-colors").AirlineColorId;
  }): void;
  /** Phase 9 — set/change the player's airline color id. Used by the
   *  in-game settings menu so a player can re-tint mid-game without
   *  breaking continuity. Multiplayer flows go through
   *  /api/games/claim-color for uniqueness; solo flows write directly. */
  setAirlineColor(colorId: import("@/lib/games/airline-colors").AirlineColorId): void;

  setSliders(sliders: Partial<Sliders>): void;
  reviseDoctrineAtR20(doctrine: DoctrineId): { ok: boolean; error?: string };

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
    /** Cabin amenities chosen at purchase (WiFi / Premium / Entertainment /
     *  Food). Each adds a small cost % of buy price + a satisfaction bump. */
    cabinAmenities?: import("@/types/game").CabinAmenities;
    /** Cargo belly tier for passenger aircraft. Standard / expanded /
     *  none. Standard tonnage scales with seat count; expanded = 1.5×. */
    cargoBelly?: import("@/types/game").CargoBellyTier;
  }): { ok: boolean; error?: string; queuedCount?: number; deliveredCount?: number };

  /** Cancel a queued pre-order. Forfeits half the deposit as the
   *  cancellation penalty; the other half is refunded. Once
   *  delivered, an order can no longer be cancelled. */
  cancelPreOrder(orderId: string): { ok: boolean; error?: string };

  /** Facilitator-only: override the per-quarter production cap for a
   *  specific aircraft spec. Pass `null` to clear the override and
   *  fall back to spec.productionCapPerQuarter. */
  setProductionCapOverride(specId: string, cap: number | null): void;

  /** Facilitator-only: instant-deliver the next-in-line pre-order(s)
   *  for a spec, bypassing the queue cap. Used to clear backlogs or
   *  resolve disputes during a workshop. */
  forceDeliverPreOrders(specId: string, count: number): { delivered: number };

  /** Build a new subsidiary at the named city. Charges setup cost
   *  immediately. Some types also flip the corresponding flag in
   *  hubInvestments (maintenance hub / fuel-storage / lounge) so the
   *  existing engine bonus paths fire automatically. */
  buildSubsidiary(args: {
    type: import("@/types/game").SubsidiaryType;
    cityCode: string;
  }): { ok: boolean; error?: string };

  /** Sell an owned subsidiary back to the market. Returns 95% of its
   *  current marketValue (5% broker fee). If the subsidiary was the
   *  reason a hubInvestments entry existed, that entry is removed. */
  sellSubsidiary(subsidiaryId: string): { ok: boolean; error?: string; proceeds?: number };

  /** Offer an owned subsidiary to a specific rival airline at a chosen
   *  asking price. Rival auto-evaluates: accepts iff price ≤ 1.10 × the
   *  subsidiary's current market value AND they have the cash. P2P
   *  trades don't pay the 5% market broker fee — the seller pockets
   *  the full asking price. Buyer takes ownership including any
   *  hubInvestments operational bonuses. */
  offerSubsidiaryToRival(
    subsidiaryId: string,
    rivalTeamId: string,
    askingPriceUsd: number,
  ): { ok: boolean; error?: string; accepted?: boolean; proceeds?: number };

  /** Convert a leased aircraft to owned by paying the 25% buy-out
   *  residual (against the spec buy price captured at order time).
   *  Aircraft becomes acquisitionType="buy", lease fields cleared,
   *  bookValue set to the residual. Available any time during the
   *  12-quarter term and at end-of-term to keep the airframe. */
  buyOutLease(aircraftId: string): { ok: boolean; error?: string; cost?: number };

  /** Acquire an airport outright (Sprint 10). Price formula:
   *    base[tier] + 4 × current quarterly slot revenue at this airport.
   *  Bidding is disabled at an owned airport — the new owner sets a
   *  fixed weekly slot rate (default = current auction-cleared rate
   *  carried over from existing leases). Owner collects slot fees as
   *  Q revenue, pays an opex of 30% of revenue, and can fund +200
   *  slot expansions up to tier capacity. */
  buyAirport(airportCode: string): { ok: boolean; error?: string };

  /** Sell an owned airport back to the market. 5% broker fee on the
   *  current asking price. Restores bidding for that airport; existing
   *  team leases keep their slot counts (their weekly fee snaps back
   *  to the system's auction baseline at next close). */
  sellAirport(airportCode: string): { ok: boolean; error?: string; proceeds?: number };

  /** Submit a bid to acquire an airport. Real-world airport transfers
   *  require government regulatory approval — in-game the facilitator
   *  plays the regulator. Cash is escrowed immediately (deducted from
   *  bidder's cash and held in the pending bid). The bid sits as
   *  `pending` until the facilitator approves (`approveAirportBid`)
   *  or rejects (`rejectAirportBid`); if 2 quarters pass with no
   *  decision, the bid auto-expires and the cash is refunded.
   *  Returns the new bid id on success. */
  submitAirportBid(args: {
    airportCode: string;
    bidPriceUsd?: number;  // defaults to live asking price
  }): { ok: boolean; error?: string; bidId?: string };

  /** Facilitator/admin only: approve a pending airport bid. Transfers
   *  ownership to the bidder, sets the default slot rate (carried over
   *  from existing leases), and commits the escrowed cash. */
  approveAirportBid(bidId: string): { ok: boolean; error?: string };

  /** Facilitator/admin only: reject a pending airport bid. Refunds the
   *  escrowed cash to the bidder and notes the resolution reason for
   *  audit. */
  rejectAirportBid(bidId: string, reason?: string): { ok: boolean; error?: string };

  /** Facilitator/admin only: set a team's recurring quarterly staff-cost
   *  surcharge. Used to dial in the recurring rate after a team picks
   *  S14 option B "Apply Incremental Salary Increase 10%" — default 10%,
   *  but the table may negotiate a different number. Pass 0 to remove. */
  setRecurringStaffSurcharge(args: {
    teamId: string;
    pct: number;
  }): { ok: boolean; error?: string };

  /** Facilitator/admin only: settle the cost of an S14 "Full Counter
   *  Offer" pick by charging a one-time cash hit to the team. Clears
   *  the `talent_heist_pending_full_counter` flag so the admin sees the
   *  pending list shrink. Used to capture what the rival's package
   *  actually ended up at — table-negotiated number, no hard cap. */
  applyFullCounterOfferCost(args: {
    teamId: string;
    costUsd: number;
  }): { ok: boolean; error?: string };

  /** Owner-only: change the weekly slot fee for an airport you own.
   *  Effective immediately — every team's lease at this airport is
   *  re-priced. Charges owner a small admin fee for changing rates. */
  setAirportSlotRate(args: {
    airportCode: string;
    newRatePerWeekUsd: number;
  }): { ok: boolean; error?: string };

  /** Owner-only: invest in a +200-slot expansion. Costs the
   *  per-tier expansion fee from cash; capacity rises by 200 (capped
   *  at tier max). New slots become available for lease. */
  expandAirportCapacity(airportCode: string): { ok: boolean; error?: string };

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

  /** Major lifespan retrofit for an aging aircraft. Pay 30% of the
   *  original purchase price; gain +14 quarters of operational life
   *  (50% of the base 28Q lifespan). One retrofit per airframe — the
   *  plane still retires eventually, just later. */
  retrofitLifespan(aircraftId: string): { ok: boolean; error?: string };

  decommissionAircraft(aircraftId: string): void;

  renovateAircraft(aircraftId: string, newCabin: CabinConfig):
    { ok: boolean; error?: string };

  /** PRD §5.5 Quick Service: 5% of book value, no downtime, satisfaction
   *  restored to 80% of new-aircraft rating. Owned aircraft only. */
  quickServiceAircraft(aircraftId: string): { ok: boolean; error?: string };

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
    cargoRatePerTonne?: number | null;
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
  /** Convert a negative cash position into a fresh term loan at the
   *  current covenant-adjusted rate. No-op if cash >= 0. The new loan
   *  is tagged source: "overdraft-refi" so the UI can flag it. */
  refinanceOverdraft(): { ok: boolean; error?: string };

  closeQuarter(): void;
  advanceToNext(): void;
  resetGame(): void;

  /** Toggle this team's ready-for-next-quarter flag. In self-guided
   *  multiplayer the engine auto-advances when every active human
   *  team is ready; in facilitated mode the facilitator still drives
   *  the close but can see who's submitted. Solo runs ignore this —
   *  the existing Next Quarter button advances directly. */
  setActiveTeamReady(ready: boolean): void;

  /** True when every active human team has marked ready. Self-guided
   *  quarter-close gate. Always false in solo runs (one team only,
   *  but the player advances via Next Quarter, not ready-flag). */
  allActiveTeamsReady(): boolean;

  /** Quarter-versioned saves. The auto-save fires at the start of every
   *  new round; the facilitator can also trigger saves manually. Each
   *  snapshot carries the entire persisted game state so a restore
   *  fully resyncs the cohort to that moment. See lib/snapshots.ts. */
  saveQuarterSnapshot(): void;
  restoreQuarterSnapshot(snapshotId: string): { ok: boolean; error?: string };
  deleteQuarterSnapshot(snapshotId: string): void;

  /** Multiplayer hydrate path. Replaces the local store with the
   *  server-authoritative game state for this gameId, then binds
   *  `activeTeamId` to whichever team the local browser session
   *  has claimed. Used by /games/[gameId]/play on initial paint
   *  to render the engine for a returning player. Returns ok:false
   *  when the state JSON doesn't look like a fully-formed engine
   *  state (no teams, no currentQuarter) — caller should fall back
   *  to the lobby. */
  hydrateFromServerState(args: {
    stateJson: unknown;
    mySessionId: string;
  }): { ok: boolean; error?: string };

  /** Multiplayer write-back. POSTs the current local state to
   *  /api/games/state-update with optimistic concurrency (sends
   *  expectedVersion = session.version, bumps locally on success).
   *  Solo runs and runs without session.gameId skip silently.
   *  Fire-and-forget — never blocks the local engine; logs warnings
   *  on failure but doesn't unwind. Caller passes the eventType
   *  string + optional payload that lands in game_events for the
   *  audit trail. */
  pushStateToServer(
    eventType: string,
    eventPayload?: unknown,
  ): Promise<{ ok: true } | { ok: false; error: string; status?: number }>;
  /** Re-issue the session code without creating a new game state.
   *  Players reconnecting use the new code; existing saved snapshots
   *  are preserved. Useful after a facilitator restores a snapshot. */
  rebroadcastSessionCode(): { code: string };
  /** Lock the session so no NEW seats can be claimed. Existing players
   *  can still reconnect using their company name. Toggled on by the
   *  facilitator once the cohort has joined. */
  setSessionLocked(locked: boolean): void;

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

// Re-exported from src/lib/id.ts so the team-factory + future
// server API routes share the same id shape. Kept as a local
// const so the store's many call sites (mkId('ac') / mkId('route') /
// mkId('team') / etc.) need no edit.
import { mkId as mkIdShared } from "@/lib/id";
const mkId = mkIdShared;

function fmtMoneyPlain(n: number): string {
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

/** Pure helper that delivers a list of queued PreOrders. Charges the
 *  balance (price − deposit) on each team, builds the FleetAircraft
 *  rows, and returns updated `preOrders` + `teams` arrays. The caller
 *  performs the `set()` so this stays test-friendly and consistent with
 *  the immutable-update style of the rest of the store.
 *
 *  If a team can't pay the balance we still deliver the aircraft (the
 *  balance becomes negative cash — the team is in debt). This matches
 *  how the rest of the engine treats over-spend (loan deficit). The
 *  alternative (reverting the order + refunding the deposit) was
 *  considered but rejected because at quarter-close the player has
 *  already committed and is in middle of close — surprise reversals
 *  break the close transaction's economics. */
function deliverPreOrders(
  allPreOrders: PreOrder[],
  teams: Team[],
  toDeliver: PreOrder[],
  deliveryQuarter: number,
): { newPreOrders: PreOrder[]; teamUpdates: Team[] } {
  if (toDeliver.length === 0) {
    return { newPreOrders: allPreOrders, teamUpdates: teams };
  }
  // Group by team for a single cash debit per team per delivery batch.
  const planesByTeam = new Map<string, FleetAircraft[]>();
  const balanceByTeam = new Map<string, number>();
  const deliveredById = new Map<string, string>(); // orderId → fleet ac id

  for (const order of toDeliver) {
    const spec = AIRCRAFT_BY_ID[order.specId];
    if (!spec) continue;
    const totalPerPlane = order.totalPriceUsd;
    const balance = Math.max(0, totalPerPlane - order.depositUsd);
    const acId = mkId("ac");
    deliveredById.set(order.id, acId);
    const leaseTerms = leaseTermsFor(spec);
    const ac: FleetAircraft = {
      id: acId,
      specId: order.specId,
      status: "ordered",
      acquisitionType: order.acquisitionType,
      // PurchaseQuarter = delivery round (this is when the airframe
      // physically arrived). Existing fleet code reads purchaseQuarter
      // for arrival timing — that contract is preserved.
      purchaseQuarter: deliveryQuarter,
      purchasePrice: order.acquisitionType === "buy" ? totalPerPlane : 0,
      bookValue: order.acquisitionType === "buy" ? totalPerPlane : 0,
      leaseQuarterly: order.acquisitionType === "lease" ? leaseTerms.perQuarterUsd : null,
      // Lease term clock starts at DELIVERY (not at order placement) —
      // an airline doesn't pay the lessor for an airframe still being
      // built. Pre-orders placed during the announcement window mean
      // the term begins whenever the queue actually clears.
      leaseDepositUsd: order.acquisitionType === "lease" ? leaseTerms.depositUsd : undefined,
      leaseTermEndsAtQuarter: order.acquisitionType === "lease"
        ? deliveryQuarter + leaseTerms.termQuarters - 1
        : undefined,
      leaseBuyoutBasisUsd: order.acquisitionType === "lease" ? spec.buyPriceUsd : undefined,
      ecoUpgrade: false,
      ecoUpgradeQuarter: null,
      ecoUpgradeCost: 0,
      cabinConfig: order.cabinConfig,
      routeId: null,
      customSeats: order.customSeats,
      engineUpgrade: order.engineUpgrade ?? null,
      fuselageUpgrade: !!order.fuselageUpgrade,
      cabinAmenities: order.cabinAmenities,
      cargoBelly: spec.family === "passenger" ? (order.cargoBelly ?? "none") : undefined,
      retirementQuarter: deliveryQuarter + 28,
      maintenanceDeficit: 0,
      satisfactionPct: 75,
    };
    const existingPlanes = planesByTeam.get(order.teamId) ?? [];
    planesByTeam.set(order.teamId, [...existingPlanes, ac]);
    balanceByTeam.set(
      order.teamId,
      (balanceByTeam.get(order.teamId) ?? 0) + balance,
    );
  }

  const teamUpdates = teams.map((t) => {
    const planes = planesByTeam.get(t.id);
    if (!planes) return t;
    const debit = balanceByTeam.get(t.id) ?? 0;
    return {
      ...t,
      cashUsd: t.cashUsd - debit,
      fleet: [...t.fleet, ...planes],
    };
  });

  const deliveredIdSet = new Set(toDeliver.map((o) => o.id));
  const newPreOrders = allPreOrders.map((o) =>
    deliveredIdSet.has(o.id)
      ? {
          ...o,
          status: "delivered" as const,
          deliveredAtQuarter: deliveryQuarter,
          deliveredAircraftId: deliveredById.get(o.id),
        }
      : o,
  );

  return { newPreOrders, teamUpdates };
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
  /** Multiplayer-aware fields. When omitted, the team behaves the same
   *  as the legacy single-browser solo flow:
   *    - human team → controlledBy: "human", claimedBySessionId: null
   *      (the local session is bound at startNewGame via activeTeamId)
   *    - rival team → controlledBy: "bot" + a bot difficulty.
   *  Future lobby-driven creators can pass these explicitly. */
  controlledBy?: "human" | "bot";
  claimedBySessionId?: string | null;
  playerDisplayName?: string | null;
  /** Phase 9 — visual identity color id. */
  airlineColorId?: import("@/lib/games/airline-colors").AirlineColorId | null;
}): Team {
  // Derive controlledBy from isPlayer when not passed explicitly. In
  // legacy solo runs, isPlayer === true means "this browser's human"
  // and isPlayer === false means "rival bot". The new fields make
  // both cases explicit; isPlayer is kept in sync for the 30+ legacy
  // call sites that still read it.
  const controlledBy: "human" | "bot" =
    args.controlledBy ?? (args.isPlayer ? "human" : "bot");
  return {
    id: mkId("team"),
    name: args.airlineName,
    code: args.code,
    color: args.color,
    hubCode: args.hubCode,
    secondaryHubCodes: [],
    doctrine: args.doctrine,
    isPlayer: args.isPlayer,
    controlledBy,
    claimedBySessionId: args.claimedBySessionId ?? null,
    playerDisplayName: args.playerDisplayName ?? null,
    airlineColorId: args.airlineColorId ?? null,
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
    timedModifiers: [],
    routeObligations: [],
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
      baseInterestRatePct: 5.5, // Q1 2015 baseline (BASE_RATE_BY_QUARTER)
      teams: [],
      playerTeamId: null,
      lastCloseResult: null,
      quarterTimerSecondsRemaining: null,
      quarterTimerPaused: false,
      secondHandListings: [],
      cargoContracts: [],
      airportSlots: {},
      airportBids: [],
      worldCupHostCode: null,
      olympicHostCode: null,
      // Legacy session fields — kept synced with the new `session` block
      // so the existing /facilitator + /join surfaces keep reading them.
      // Will be retired in Step 5 of the multiplayer rollout once those
      // pages migrate to read `session` directly.
      sessionCode: null,
      sessionLocked: false,
      sessionSlots: [],
      // Multiplayer/lobby-aware state. `session` is null in legacy
      // single-browser solo runs (created via the existing onboarding
      // flow). Games created via /games/new always carry a session.
      // `activeTeamId` binds THIS browser to one team for the run;
      // panels/HUD branch on it instead of `team.isPlayer` so the
      // same engine state can render correctly for any human team.
      session: null,
      activeTeamId: null,
      localSessionId: null, // set to user.id during hydrateFromServerState; null in solo
      preOrders: [],
      productionCapOverrides: {},
      isMultiplayerSession: false,
      isObserver: false,

      startNewGame: (args) => {
        const {
          airlineName, code, doctrine, hubCode, teamCount = 5,
          tagline, marketFocus, geographicPriority, pricingPhilosophy,
          salaryPhilosophy, marketingLevel, csrTheme,
          airlineColorId,
        } = args;

        // Phase 9 — color allocation. Player picks at onboarding (or
        // defaults to teal — first in the palette). Bot rivals fill
        // the next available colors deterministically so a solo run
        // visually matches a multiplayer cohort: player teal, then
        // sky/amber/emerald/etc.
        const playerColorId = airlineColorId ?? "teal";

        // Player team — built via the shared factory so a solo run
        // produces the SAME starting position as a player joining a
        // multiplayer lobby. Every detail (hub-cost deduction, $350M
        // budget, 2× A320 starter fleet, 30 free slots at popular
        // dests, Q1 financials backfill, slider nudges from
        // marketingLevel/salaryPhilosophy) lives in the factory.
        // Lobby-driven creators just call the same function with
        // their own session id and display name.
        const player = createInitializedTeamFromOnboarding({
          airlineName, code, doctrine, hubCode,
          color: "#14355E",
          tagline, marketFocus, geographicPriority, pricingPhilosophy,
          salaryPhilosophy, marketingLevel, csrTheme,
          controlledBy: "human",
          airlineColorId: playerColorId,
        });

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
          const rivalDoctrines: DoctrineId[] = [
            "premium-service", "budget-expansion", "cargo-dominance",
            "global-network", "premium-service", "budget-expansion",
            "cargo-dominance", "global-network", "premium-service",
          ];
          const doctrine = rivalDoctrines[i % rivalDoctrines.length];
          // Phase 9 — assign rival color from the palette, skipping
          // the player's already-claimed slot. Deterministic so the
          // same-seed game shows the same cohort colors.
          const takenColorIds = [playerColorId, ...rivals.map((rt) => rt.airlineColorId)];
          const rivalColorId = pickNextAvailableColor(takenColorIds);
          const r = makeStartingTeam({
            airlineName: meta.name, code: meta.code, doctrine,
            hubCode: hub, isPlayer: false, color: meta.color,
            airlineColorId: rivalColorId,
          });
          // Spread rival difficulties so the cohort feels mixed: a 5-rival
          // game gets ~1 easy / 3 medium / 1 hard; a 9-rival game gets
          // ~2 easy / 5 medium / 2 hard. Facilitator can still override
          // per-team via the admin console.
          const RIVAL_DIFFICULTY_MIX: BotDifficulty[] = [
            "medium", "easy", "medium", "hard", "medium",
            "easy", "medium", "hard", "medium",
          ];
          r.botDifficulty = RIVAL_DIFFICULTY_MIX[i % RIVAL_DIFFICULTY_MIX.length];
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
              retirementQuarter: 1 + 28,
              maintenanceDeficit: 0, satisfactionPct: 70,
            });
            const plannedWeekly =
              doctrine === "budget-expansion" ? 10 + (i % 4) * 2
              : doctrine === "premium-service" ? 5 + (i % 3)
              : doctrine === "cargo-dominance" ? 4 + (i % 4)
              : 7 + (i % 5);
            const physicsWeekly = Math.max(
              1,
              Math.round(maxRouteDailyFrequency([rivalSpec], dist, [{
                specId: rivalSpec,
                doctrine,
              }]) * 7),
            );
            const weeklyFreq = Math.min(plannedWeekly, physicsWeekly);
            const dailyFreq = weeklyFreq / 7;
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
              cargoRatePerTonne: null,
              status: "active" as const,
              openQuarter: 1,
              avgOccupancy: 0.55 + Math.random() * 0.25,
              quarterlyRevenue: weeklyFreq * (isCargo ? 100_000 : 250_000),
              quarterlyFuelCost: weeklyFreq * 30_000,
              quarterlySlotCost: weeklyFreq * 12_000,
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

        // Pick neutral tier 1-2 host cities for the tournaments — must
        // not collide with any team's primary or secondary hub so no one
        // gets a free home-team load factor. World Cup runs rounds
        // 19-24, Olympics rounds 29-32. Two distinct cities.
        const allTeamHubs = new Set<string>();
        for (const t of [player, ...rivals]) {
          allTeamHubs.add(t.hubCode);
          for (const sh of t.secondaryHubCodes ?? []) allTeamHubs.add(sh);
        }
        const hostCandidates = CITIES
          .filter((c) => (c.tier === 1 || c.tier === 2) && !allTeamHubs.has(c.code))
          .map((c) => c.code);
        const pickHost = (exclude?: string | null): string | null => {
          const pool = hostCandidates.filter((c) => c !== exclude);
          if (pool.length === 0) return null;
          return pool[Math.floor(Math.random() * pool.length)];
        };
        const worldCupHostCode = pickHost();
        const olympicHostCode = pickHost(worldCupHostCode);

        set({
          phase: "playing",
          currentQuarter: 2, // skip Q1 brand-building for single-team demo
          fuelIndex: 108,
          baseInterestRatePct: 5.5, // Q1 2015 baseline (BASE_RATE_BY_QUARTER)
          teams: [player, ...rivals],
          playerTeamId: player.id,
          // Multiplayer-aware "you" binding. selectActiveTeam reads
          // activeTeamId first, falling back to playerTeamId for
          // legacy save compat. Solo runs get the same id in both
          // fields so panels can branch on whichever they prefer.
          activeTeamId: player.id,
          lastCloseResult: null,
          airportSlots: makeInitialAirportSlots(),
          airportBids: [],
          worldCupHostCode,
          olympicHostCode,
        });

        // Welcome toast — surface the hub purchase + remaining cash
        // so the player understands the trade-off they just made.
        // (`hubCity` and `hubCost` were locals in the old inline init;
        // re-derive from the city table now that the factory has
        // absorbed that logic.)
        const hubCityForToast = CITIES_BY_CODE[hubCode];
        const hubCostForToast = hubCityForToast ? hubPriceUsd(hubCityForToast) : 0;
        if (hubCityForToast) {
          toast.accent(
            `${hubCityForToast.name} (${hubCityForToast.code}) hub secured`,
            `Hub cost ${fmtMoneyPlain(hubCostForToast)} · ${fmtMoneyPlain(player.cashUsd)} cash to operate.`,
          );
        }
      },

      setSliders: (sliders) => {
        const s = get();
        if (s.isObserver || !s.playerTeamId) return;
        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, sliders: { ...t.sliders, ...sliders } }
              : t,
          ),
        });
        get().pushStateToServer("player.savedSliders", { sliders });
      },

      reviseDoctrineAtR20: (doctrine) => {
        const s = get();
        if (!s.playerTeamId) return { ok: false, error: "No player team" };
        // Mid-campaign trigger scales with the configured round count.
        // 40 rounds → midRound 20 (preserves legacy behavior). Shorter
        // cohort formats: 24 → 12, 16 → 8, 8 → 4. Function name kept
        // as `reviseDoctrineAtR20` to avoid breaking persisted UI bindings,
        // but the gate is now dynamic.
        const totalRounds = s.session?.totalRounds ?? 40;
        const midRound = Math.floor(totalRounds / 2);
        if (s.currentQuarter !== midRound) {
          return {
            ok: false,
            error: `Doctrine review only opens at round ${midRound}`,
          };
        }
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        // Both legacy (doctrine_revised_r20) + new (doctrine_revised_midgame)
        // flags lock out a second revision. Existing 40-round saves
        // from before the dynamic-mid-round change still gate correctly.
        if (
          player.flags.has("doctrine_revised_midgame") ||
          player.flags.has("doctrine_revised_r20")
        ) {
          return { ok: false, error: "Doctrine already revised this campaign" };
        }
        // Phase 5.1 — slider streaks reset on doctrine switch.
        // The audit verified that ALL doctrine multipliers in
        // engine.ts are live-readable from `team.doctrine`, so the
        // multiplier swap is clean. The one persistent state that
        // would drag old-doctrine momentum forward is sliderStreaks
        // (the +bonus a slider earns after holding a level for 3+
        // quarters). Resetting them on switch makes the player earn
        // streak bonuses fresh under the new doctrine — matches the
        // narrative intent of "a strategic reset" and prevents a
        // premium-doctrine player from inheriting cargo-era staff
        // discipline.
        const SLIDER_KEYS = ["staff", "marketing", "service", "rewards", "operations", "customerService"] as const;
        const resetStreaks = SLIDER_KEYS.reduce(
          (acc, k) => {
            acc[k] = { level: player.sliders[k] ?? 2, quarters: 0 };
            return acc;
          },
          {} as typeof player.sliderStreaks,
        );
        set({
          teams: s.teams.map((t) => {
            if (t.id !== player.id) return t;
            return {
              ...t,
              doctrine,
              sliderStreaks: resetStreaks,
              flags: new Set([
                ...(t.flags ?? []),
                "doctrine_revised_midgame",
              ]),
            };
          }),
        });
        toast.accent("Doctrine revised", "Your new operating model is active starting this round.");
        return { ok: true };
      },

      orderAircraft: ({
        specId, acquisitionType, cabinConfig = "default",
        quantity = 1, customSeats, engineUpgrade = null, fuselageUpgrade = false,
        cabinAmenities, cargoBelly,
      }) => {
        const s = get();
        // Game Master / spectator observers cannot edit team state. The
        // function signature requires the {ok, error?} envelope; an
        // early `return;` would yield `undefined` and break the type
        // contract (also surfaced by tsc and the playtest audit).
        if (s.isObserver) {
          return { ok: false, error: "Observer mode: cannot order aircraft" };
        }
        const spec = AIRCRAFT_BY_ID[specId];
        if (!spec) return { ok: false, error: "Unknown aircraft" };
        // Pre-orders open at unlockQuarter − 2 (announcement window per
        // master ref Section 1E). Before that the order is rejected.
        if (!isAnnouncementOpen(spec, s.currentQuarter)) {
          const announceQ = spec.unlockQuarter - 2;
          return {
            ok: false,
            error: `Pre-orders open Q${announceQ} (announcement) · unlocks Q${spec.unlockQuarter}`,
          };
        }
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const qty = Math.max(1, Math.floor(quantity));

        // Engine + fuselage upgrade pricing — shared with the Purchase
        // Order modal via totalUpgradeCostPerPlaneUsd(). Earlier the
        // store used flat constants ($24.9M / $49.8M) while the UI
        // showed 10% / 20% of buy price; on a cheap airframe the UI
        // looked affordable then the store rejected it as too costly.
        const enginePlusFuselageCost = totalUpgradeCostPerPlaneUsd(
          spec.buyPriceUsd,
          engineUpgrade,
          !!fuselageUpgrade,
        );
        // Cabin amenities + cargo belly are new at PurchaseOrderModal.
        // Each adds a small per-airframe cost. Cargo belly only applies
        // to passenger spec — `cargoBellyCostUsd` returns 0 for "none".
        const amenitiesCost = amenityCostUsd(spec.buyPriceUsd, cabinAmenities);
        const bellyCost = spec.family === "passenger"
          ? cargoBellyCostUsd(spec.buyPriceUsd, cargoBelly)
          : 0;
        const upgradeCostPerPlane = enginePlusFuselageCost + amenitiesCost + bellyCost;

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

        // Lease eligibility (top-7 passenger / top-3 cargo by stock) and
        // 50% fleet-ratio cap. Both gate lease orders only — buy is
        // unconstrained.
        if (acquisitionType === "lease") {
          if (!canLeaseSpec(spec, AIRCRAFT, s.currentQuarter)) {
            return {
              ok: false,
              error: `${spec.name} is not currently leasable. Lease is restricted to the top 7 passenger and top 3 cargo airframes by production stock.`,
            };
          }
          if (wouldExceedLeaseCap(player, qty)) {
            const ratio = leaseFleetRatio(player) * 100;
            return {
              ok: false,
              error: `Adding ${qty} leased aircraft would push your leased-fleet share above 50% (currently ${ratio.toFixed(0)}%). Buy or sell to rebalance.`,
            };
          }
        }

        // Lease vs buy pricing. Buy = full sticker. Lease = 15% deposit
        // up front and a per-quarter fee charged at every quarter close
        // for 12 quarters; total contract value = 105% of sticker, with
        // a 25% buy-out option at end of term.
        const leaseTerms = leaseTermsFor(spec);
        const totalPerPlane = acquisitionType === "buy"
          ? spec.buyPriceUsd + upgradeCostPerPlane
          : leaseTerms.depositUsd + upgradeCostPerPlane;
        const totalCost = totalPerPlane * qty;

        // Decide how many of `qty` can be delivered this round vs queued.
        // - Released: up to (cap − already-delivered-this-round) ship now.
        //   Earlier batches at quarter-close drained the queue first, so the
        //   "deliver instantly" path is reserved for end-of-round walk-ups.
        // - Pre-release: ALL units queue (they wait for unlock).
        // - Always: orders beyond the round's headroom go to the FIFO queue
        //   and pay 20% deposit upfront, balance at delivery.
        const released = isReleased(spec, s.currentQuarter);
        const cap = effectiveProductionCap(spec, s.productionCapOverrides);
        // How many of this spec have already been delivered in the current
        // round (either via instant orders or batch deliveries).
        const deliveredThisRound = s.preOrders.filter(
          (o) => o.specId === specId && o.deliveredAtQuarter === s.currentQuarter,
        ).length;
        // Queue depth ahead of any new order placed *now* — instant fulfilment
        // only happens if the queue is empty AND room remains in this round.
        const queueAhead = queuedForSpec(s.preOrders, specId).length;

        let instantQty = 0;
        if (released && queueAhead === 0) {
          instantQty = Math.min(qty, Math.max(0, cap - deliveredThisRound));
        }
        const queuedQty = qty - instantQty;

        // Cash check — instant units charge full price; queued units charge
        // 20% deposit only at order time. Total cash demanded = instant + deposits.
        const depositPerPlane = totalPerPlane * PREORDER_DEPOSIT_PCT;
        const cashNeeded = instantQty * totalPerPlane + queuedQty * depositPerPlane;
        if (player.cashUsd < cashNeeded) {
          return {
            ok: false,
            error: `Insufficient cash — need ${fmtMoneyPlain(cashNeeded)} ` +
              (queuedQty > 0
                ? `(${instantQty} delivered now + ${queuedQty} × 20% deposit)`
                : `for ${qty} × ${spec.name}`),
          };
        }

        // Build the FleetAircraft rows for instant deliveries (existing path).
        const planes: FleetAircraft[] = Array.from({ length: instantQty }, () => ({
          id: mkId("ac"), specId, status: "ordered" as const,
          acquisitionType, purchaseQuarter: s.currentQuarter,
          // For owned aircraft purchasePrice = sticker + upgrades; book
          // value depreciates from there. For leases, both stay at 0
          // because the airline never owns the airframe (and so the
          // P&L can't book depreciation against it).
          purchasePrice: acquisitionType === "buy" ? totalPerPlane : 0,
          bookValue: acquisitionType === "buy" ? totalPerPlane : 0,
          leaseQuarterly: acquisitionType === "lease" ? leaseTerms.perQuarterUsd : null,
          // 12-quarter lease term, 25% buy-out residual captured at
          // order time so future spec-price changes can't re-price the
          // contract mid-term.
          leaseDepositUsd: acquisitionType === "lease" ? leaseTerms.depositUsd : undefined,
          leaseTermEndsAtQuarter: acquisitionType === "lease"
            ? s.currentQuarter + leaseTerms.termQuarters - 1
            : undefined,
          leaseBuyoutBasisUsd: acquisitionType === "lease" ? spec.buyPriceUsd : undefined,
          ecoUpgrade: false, ecoUpgradeQuarter: null, ecoUpgradeCost: 0,
          cabinConfig, routeId: null,
          customSeats: customSeats && spec.family === "passenger" ? customSeats : undefined,
          engineUpgrade: engineUpgrade ?? null,
          fuselageUpgrade: !!fuselageUpgrade,
          // Cabin amenities + cargo belly carry through from order →
          // delivery. Cargo belly only on passenger frames; cargo
          // family already has spec.cargoTonnes.
          cabinAmenities: cabinAmenities,
          cargoBelly: spec.family === "passenger" ? (cargoBelly ?? "none") : undefined,
          retirementQuarter: s.currentQuarter + 28,
          maintenanceDeficit: 0, satisfactionPct: 75,
        }));

        // Build PreOrder rows for queued units. Each unit becomes its own
        // entry so the queue can partially fill (5 of 8 ordered → 5
        // delivered, 3 still waiting next round).
        const newPreOrders: PreOrder[] = Array.from({ length: queuedQty }, () => ({
          id: mkId("po"),
          teamId: s.playerTeamId!,
          specId,
          orderedAtQuarter: s.currentQuarter,
          depositUsd: depositPerPlane,
          totalPriceUsd: totalPerPlane,
          acquisitionType,
          cabinConfig,
          customSeats: customSeats && spec.family === "passenger" ? customSeats : undefined,
          engineUpgrade: engineUpgrade ?? null,
          fuselageUpgrade: !!fuselageUpgrade,
          cabinAmenities,
          cargoBelly: spec.family === "passenger" ? (cargoBelly ?? "none") : undefined,
          status: "queued",
        }));

        set({
          teams: s.teams.map((t) =>
            t.id === s.playerTeamId
              ? { ...t, cashUsd: t.cashUsd - cashNeeded, fleet: [...t.fleet, ...planes] }
              : t,
          ),
          preOrders: [...s.preOrders, ...newPreOrders],
        });

        if (instantQty > 0 && queuedQty === 0) {
          toast.success(
            `${qty}× ${spec.name} ${acquisitionType === "buy" ? "purchased" : "leased"}`,
            `${fmtMoneyPlain(totalCost)} total · arrives Q${s.currentQuarter + 1}` +
              (upgradeCostPerPlane > 0
                ? ` · upgrades: ${[engineUpgrade, fuselageUpgrade && "fuselage"].filter(Boolean).join(", ")}`
                : ""),
          );
        } else if (instantQty > 0 && queuedQty > 0) {
          toast.warning(
            `${qty}× ${spec.name} — partial`,
            `${instantQty} arriving Q${s.currentQuarter + 1}; ${queuedQty} queued ` +
              `(deposit ${fmtMoneyPlain(queuedQty * depositPerPlane)})`,
          );
        } else {
          // Pure queue. Tell the player what they'll wait for.
          const earliestRound = Math.max(s.currentQuarter + 1, spec.unlockQuarter);
          toast.accent(
            `${queuedQty}× ${spec.name} pre-ordered`,
            released
              ? `Queued behind ${queueAhead}; deposit ${fmtMoneyPlain(queuedQty * depositPerPlane)}; balance at delivery.`
              : `Holds your slot until unlock Q${spec.unlockQuarter}; deposit ${fmtMoneyPlain(queuedQty * depositPerPlane)}.`,
          );
          // earliestRound used by the toast subtitle below (silence linter).
          void earliestRound;
        }
        get().pushStateToServer("player.orderedAircraft", {
          specId, qty, acquisitionType,
        });
        return { ok: true, queuedCount: queuedQty, deliveredCount: instantQty };
      },

      cancelPreOrder: (orderId) => {
        const s = get();
        const order = s.preOrders.find((o) => o.id === orderId);
        if (!order) return { ok: false, error: "Pre-order not found" };
        if (order.status !== "queued") {
          return {
            ok: false,
            error: order.status === "delivered"
              ? "Already delivered — cannot cancel"
              : "Already cancelled",
          };
        }
        if (order.teamId !== s.playerTeamId) {
          return { ok: false, error: "Not your pre-order" };
        }
        const refund = order.depositUsd * (1 - PREORDER_CANCEL_PENALTY_PCT);
        const penalty = order.depositUsd * PREORDER_CANCEL_PENALTY_PCT;
        set({
          teams: s.teams.map((t) =>
            t.id === order.teamId ? { ...t, cashUsd: t.cashUsd + refund } : t,
          ),
          preOrders: s.preOrders.map((o) =>
            o.id === orderId ? { ...o, status: "cancelled" as const } : o,
          ),
        });
        const spec = AIRCRAFT_BY_ID[order.specId];
        toast.warning(
          `Cancelled · 1× ${spec?.name ?? order.specId}`,
          `Refunded ${fmtMoneyPlain(refund)} · ${fmtMoneyPlain(penalty)} cancellation penalty (15%)`,
        );
        return { ok: true };
      },

      setProductionCapOverride: (specId, cap) => {
        const s = get();
        const next = { ...s.productionCapOverrides };
        if (cap === null) {
          delete next[specId];
        } else {
          next[specId] = Math.max(1, Math.floor(cap));
        }
        set({ productionCapOverrides: next });
      },

      forceDeliverPreOrders: (specId, count) => {
        const s = get();
        const queue = queuedForSpec(s.preOrders, specId);
        const toDeliver = queue.slice(0, Math.max(0, Math.floor(count)));
        if (toDeliver.length === 0) return { delivered: 0 };
        const { newPreOrders, teamUpdates } = deliverPreOrders(
          s.preOrders, s.teams, toDeliver, s.currentQuarter,
        );
        set({ preOrders: newPreOrders, teams: teamUpdates });
        const spec = AIRCRAFT_BY_ID[specId];
        toast.accent(
          `Force-delivered ${toDeliver.length}× ${spec?.name ?? specId}`,
          "Facilitator override · queue cap bypassed.",
        );
        return { delivered: toDeliver.length };
      },

      buildSubsidiary: ({ type, cityCode }) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const entry = SUBSIDIARY_BY_TYPE[type];
        if (!entry) return { ok: false, error: "Unknown subsidiary type" };
        if (player.cashUsd < entry.setupCostUsd) {
          return {
            ok: false,
            error: `Need ${fmtMoneyPlain(entry.setupCostUsd)} cash to build`,
          };
        }
        // Cap one of each type per city so a player can't stack ten
        // hotels at DXB. Different cities are fine.
        const dup = (player.subsidiaries ?? []).some(
          (sub) => sub.type === type && sub.cityCode === cityCode,
        );
        if (dup) {
          return { ok: false, error: `${entry.name} already exists at ${cityCode}` };
        }

        const newSub = {
          id: mkId("sub"),
          type,
          cityCode,
          acquiredAtQuarter: s.currentQuarter,
          purchaseCostUsd: entry.setupCostUsd,
          marketValueUsd: entry.setupCostUsd,
          conditionPct: 1.0,
        };

        // Mirror the matching subsidiary types into hubInvestments so
        // the existing engine bonus paths fire automatically. We don't
        // duplicate the city if it's already in the list (manual
        // hub-investment + subsidiary at the same place is allowed).
        const inv = { ...player.hubInvestments };
        function add(arr: string[]): string[] {
          return arr.includes(cityCode) ? arr : [...arr, cityCode];
        }
        if (type === "maintenance-hub") inv.maintenanceDepotHubs = add(inv.maintenanceDepotHubs);
        if (type === "fuel-storage")    inv.fuelReserveTankHubs   = add(inv.fuelReserveTankHubs);
        if (type === "lounge")          inv.premiumLoungeHubs     = add(inv.premiumLoungeHubs);

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - entry.setupCostUsd,
            subsidiaries: [...(t.subsidiaries ?? []), newSub],
            hubInvestments: inv,
          }),
        });
        toast.success(
          `${entry.name} built at ${cityCode}`,
          `${fmtMoneyPlain(entry.setupCostUsd)} setup. ` +
            (entry.revenuePerQuarterUsd > 0
              ? `Earns ${fmtMoneyPlain(entry.revenuePerQuarterUsd)}/Q.`
              : "Operational asset (no direct revenue)."),
        );
        return { ok: true };
      },

      sellSubsidiary: (subsidiaryId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const sub = (player.subsidiaries ?? []).find((x) => x.id === subsidiaryId);
        if (!sub) return { ok: false, error: "Subsidiary not found" };
        const proceeds = Math.round(sub.marketValueUsd * (1 - SUBSIDIARY_BROKER_FEE_PCT));

        // Remove the matching hubInvestments entry IF no other
        // subsidiary of the same type at the same city remains. This
        // handles the multi-investment-at-one-city edge case.
        const remaining = (player.subsidiaries ?? []).filter((x) => x.id !== subsidiaryId);
        const soldType = sub.type;
        const soldCity = sub.cityCode;
        // If another subsidiary of the same type at this city exists,
        // keep the bonus. Otherwise drop the city from the list.
        function shouldKeep(arr: string[]): string[] {
          const stillHave = remaining.some(
            (x) => x.type === soldType && x.cityCode === soldCity,
          );
          return stillHave ? arr : arr.filter((c) => c !== soldCity);
        }
        const inv = { ...player.hubInvestments };
        if (soldType === "maintenance-hub") inv.maintenanceDepotHubs = shouldKeep(inv.maintenanceDepotHubs);
        if (soldType === "fuel-storage")    inv.fuelReserveTankHubs   = shouldKeep(inv.fuelReserveTankHubs);
        if (soldType === "lounge")          inv.premiumLoungeHubs     = shouldKeep(inv.premiumLoungeHubs);

        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd + proceeds,
            subsidiaries: remaining,
            hubInvestments: inv,
          }),
        });
        const entry = SUBSIDIARY_BY_TYPE[sub.type];
        toast.warning(
          `Sold · ${entry?.name ?? sub.type} @ ${sub.cityCode}`,
          `Proceeds ${fmtMoneyPlain(proceeds)} (5% broker fee). ` +
            (entry?.operationalBonus ? `Operational bonus removed.` : ""),
        );
        return { ok: true, proceeds };
      },

      offerSubsidiaryToRival: (subsidiaryId, rivalTeamId, askingPriceUsd) => {
        const s = get();
        const seller = s.teams.find((t) => t.id === s.playerTeamId);
        if (!seller) return { ok: false, error: "No player team" };
        const rival = s.teams.find((t) => t.id === rivalTeamId);
        if (!rival || rival.id === seller.id) {
          return { ok: false, error: "Pick a rival airline (not yourself)" };
        }
        const sub = (seller.subsidiaries ?? []).find((x) => x.id === subsidiaryId);
        if (!sub) return { ok: false, error: "Subsidiary not found" };

        // Rival evaluates the offer. Accept if asking price is at most
        // 1.10× the subsidiary's current market value AND they have the
        // cash. Otherwise the rival declines and the offer expires.
        const fairCeiling = sub.marketValueUsd * 1.10;
        const willingToPay = askingPriceUsd <= fairCeiling;
        if (!willingToPay) {
          toast.warning(
            "Offer declined",
            `${rival.name} declined the offer at ${fmtMoneyPlain(askingPriceUsd)} — they value the asset at ~${fmtMoneyPlain(sub.marketValueUsd)} and won't go above 110% of market.`,
          );
          return { ok: true, accepted: false };
        }
        if (rival.cashUsd < askingPriceUsd) {
          toast.warning(
            "Offer declined",
            `${rival.name} can't afford ${fmtMoneyPlain(askingPriceUsd)} right now (cash ${fmtMoneyPlain(rival.cashUsd)}).`,
          );
          return { ok: true, accepted: false };
        }

        // Move ownership: subtract from seller's subsidiaries and
        // hubInvestments side-table, add to rival's. Cash flows from
        // rival to seller at full asking price (no broker fee on P2P).
        const remainingSeller = (seller.subsidiaries ?? []).filter((x) => x.id !== subsidiaryId);
        const transferredSub = { ...sub };
        const subType = sub.type;
        const subCity = sub.cityCode;

        function flipInventory(team: Team, op: "add" | "remove"): Team["hubInvestments"] {
          const inv = { ...team.hubInvestments };
          function update(arr: string[], type: typeof subType): string[] {
            if (op === "add") return arr.includes(subCity) ? arr : [...arr, subCity];
            // Removal: only if no other subsidiary of same type at same city remains.
            const stillHave = (op === "remove" ? remainingSeller : team.subsidiaries ?? [])
              .some((x) => x.type === type && x.cityCode === subCity);
            return stillHave ? arr : arr.filter((c) => c !== subCity);
          }
          if (subType === "maintenance-hub") inv.maintenanceDepotHubs = update(inv.maintenanceDepotHubs, "maintenance-hub");
          if (subType === "fuel-storage")    inv.fuelReserveTankHubs   = update(inv.fuelReserveTankHubs, "fuel-storage");
          if (subType === "lounge")          inv.premiumLoungeHubs     = update(inv.premiumLoungeHubs, "lounge");
          return inv;
        }

        set({
          teams: s.teams.map((t) => {
            if (t.id === seller.id) {
              return {
                ...t,
                cashUsd: t.cashUsd + askingPriceUsd,
                subsidiaries: remainingSeller,
                hubInvestments: flipInventory(t, "remove"),
                retiredHistory: [
                  ...(t.retiredHistory ?? []),
                  {
                    id: subsidiaryId, specId: subType, specName: SUBSIDIARY_BY_TYPE[subType]?.name ?? subType,
                    acquiredAtQuarter: sub.acquiredAtQuarter, exitQuarter: s.currentQuarter,
                    exitReason: "sold" as const, proceedsUsd: askingPriceUsd, acquisitionType: "buy" as const,
                  },
                ],
              };
            }
            if (t.id === rival.id) {
              return {
                ...t,
                cashUsd: t.cashUsd - askingPriceUsd,
                subsidiaries: [...(t.subsidiaries ?? []), transferredSub],
                hubInvestments: flipInventory(t, "add"),
              };
            }
            return t;
          }),
        });

        const entry = SUBSIDIARY_BY_TYPE[subType];
        toast.success(
          `${rival.name} accepted the offer`,
          `Sold ${entry?.name ?? subType} @ ${subCity} for ${fmtMoneyPlain(askingPriceUsd)} (no broker fee on peer-to-peer).`,
        );
        return { ok: true, accepted: true, proceeds: askingPriceUsd };
      },

      buyOutLease: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.acquisitionType !== "lease") {
          return { ok: false, error: "Only leased aircraft can be bought out" };
        }
        const basis = plane.leaseBuyoutBasisUsd
          ?? AIRCRAFT_BY_ID[plane.specId]?.buyPriceUsd
          ?? 0;
        const cost = Math.round(basis * LEASE_BUYOUT_RESIDUAL_PCT);
        if (player.cashUsd < cost) {
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash for buy-out` };
        }
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd - cost,
            fleet: t.fleet.map((f) => f.id !== aircraftId ? f : {
              ...f,
              acquisitionType: "buy" as const,
              purchasePrice: cost,
              bookValue: cost,
              leaseQuarterly: null,
              leaseDepositUsd: undefined,
              leaseTermEndsAtQuarter: undefined,
              leaseBuyoutBasisUsd: undefined,
            }),
          }),
        });
        const spec = AIRCRAFT_BY_ID[plane.specId];
        toast.success(
          `Lease bought out · ${spec?.name ?? plane.specId}`,
          `${fmtMoneyPlain(cost)} (25% residual). Aircraft is now owned outright.`,
        );
        return { ok: true, cost };
      },

      // Legacy "buy now" entry point — superseded by the bid + approval
      // flow. Kept for old callers, but routes through `submitAirportBid`
      // so cash is escrowed and the facilitator approves.
      buyAirport: (airportCode) => {
        const r = get().submitAirportBid({ airportCode });
        return r.ok
          ? { ok: true }
          : { ok: false, error: r.error };
      },

      submitAirportBid: ({ airportCode, bidPriceUsd }) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const slotState = s.airportSlots?.[airportCode];
        if (slotState?.ownerTeamId) {
          return { ok: false, error: "Airport already owned" };
        }
        const city = CITIES_BY_CODE[airportCode];
        if (!city) return { ok: false, error: "Unknown airport" };

        // Block double-bidding: a team can have at most one pending bid
        // per airport at a time.
        const existingPending = (s.airportBids ?? []).find(
          (b) =>
            b.status === "pending" &&
            b.airportCode === airportCode &&
            b.bidderTeamId === player.id,
        );
        if (existingPending) {
          return {
            ok: false,
            error: "You already have a pending bid on this airport. Wait for the facilitator to approve or reject it.",
          };
        }

        const askingPrice = airportAskingPriceUsd(airportCode, slotState, s.teams);
        const price = Math.max(1, Math.round(bidPriceUsd ?? askingPrice));
        if (player.cashUsd < price) {
          return {
            ok: false,
            error: `Need ${fmtMoneyPlain(price)} cash to bid (will be held in escrow)`,
          };
        }

        const bidId = `abid_${Math.random().toString(36).slice(2, 10)}`;
        const newBid: AirportBid = {
          id: bidId,
          airportCode,
          bidderTeamId: player.id,
          bidPriceUsd: price,
          status: "pending",
          submittedQuarter: s.currentQuarter,
        };

        set({
          // Cash is escrowed immediately — deducted from bidder, held
          // by the bid record until approved (committed) or rejected
          // (refunded).
          teams: s.teams.map((t) =>
            t.id === player.id ? { ...t, cashUsd: t.cashUsd - price } : t,
          ),
          airportBids: [...(s.airportBids ?? []), newBid],
        });
        toast.accent(
          `Bid submitted · ${city.name} (${airportCode})`,
          `${fmtMoneyPlain(price)} held in escrow. Awaiting facilitator approval (auto-rejects after 2 quarters).`,
        );
        return { ok: true, bidId };
      },

      approveAirportBid: (bidId) => {
        const s = get();
        const bid = (s.airportBids ?? []).find((b) => b.id === bidId);
        if (!bid) return { ok: false, error: "Bid not found" };
        if (bid.status !== "pending") {
          return { ok: false, error: `Bid is already ${bid.status}` };
        }
        const slotState = s.airportSlots?.[bid.airportCode];
        if (slotState?.ownerTeamId) {
          // Race: airport got bought by another path between bid and
          // approval. Treat as reject + refund.
          return get().rejectAirportBid(bidId, "Airport already owned by another team");
        }
        const city = CITIES_BY_CODE[bid.airportCode];
        if (!city) return { ok: false, error: "Unknown airport" };

        // Existing-leases blend: preserve the current avg slot rate so
        // tenants don't see a price shock on day 1.
        const totalSlots = s.teams.reduce(
          (sum, t) => sum + (t.airportLeases?.[bid.airportCode]?.slots ?? 0),
          0,
        );
        const totalWeekly = s.teams.reduce(
          (sum, t) => sum + (t.airportLeases?.[bid.airportCode]?.totalWeeklyCost ?? 0),
          0,
        );
        const avgRate = totalSlots > 0 ? totalWeekly / totalSlots :
          BASE_SLOT_PRICE_BY_TIER[city.tier as 1 | 2 | 3 | 4] ?? 35_000;
        const newSlotState: AirportSlotState = {
          ...(slotState ?? { available: 0, nextOpening: 0, nextTickQuarter: 5 }),
          ownerTeamId: bid.bidderTeamId,
          ownerSlotRatePerWeekUsd: Math.round(avgRate),
          totalCapacity: AIRPORT_DEFAULT_CAPACITY_BY_TIER[city.tier as 1 | 2 | 3 | 4] ?? 140,
          acquiredAtQuarter: s.currentQuarter,
          purchaseCostUsd: bid.bidPriceUsd,
        };

        const bidder = s.teams.find((t) => t.id === bid.bidderTeamId);

        set({
          // Cash already deducted at bid-submit time; approval just
          // commits the escrow (no further movement of bidder's cash).
          airportBids: (s.airportBids ?? []).map((b) =>
            b.id === bidId
              ? { ...b, status: "approved" as const, resolvedQuarter: s.currentQuarter }
              : b,
          ),
          airportSlots: { ...s.airportSlots, [bid.airportCode]: newSlotState },
        });
        // Tailored notification: name the bidder explicitly so when the
        // toast is read back later in the notification center the
        // facilitator can tell which approval this was.
        toast.success(
          `Approved · ${city.name} (${bid.airportCode})`,
          `${bidder?.name ?? "Bidder"} acquires ${city.name} for ${fmtMoneyPlain(bid.bidPriceUsd)}. Slot fees now flow to the new owner from next quarter.`,
        );
        return { ok: true };
      },

      setRecurringStaffSurcharge: ({ teamId, pct }) => {
        const s = get();
        const team = s.teams.find((t) => t.id === teamId);
        if (!team) return { ok: false, error: "Team not found" };
        const clean = Math.max(0, pct);
        set({
          teams: s.teams.map((t) =>
            t.id === teamId ? { ...t, recurringStaffSurchargePct: clean } : t,
          ),
        });
        toast.info(
          `${team.name}: staff surcharge set to ${(clean * 100).toFixed(1)}%`,
          clean > 0
            ? `Quarterly staff cost will be multiplied by ${(1 + clean).toFixed(2)} until adjusted again.`
            : "Surcharge cleared. Staff cost returns to baseline next quarter close.",
        );
        return { ok: true };
      },

      applyFullCounterOfferCost: ({ teamId, costUsd }) => {
        const s = get();
        const team = s.teams.find((t) => t.id === teamId);
        if (!team) return { ok: false, error: "Team not found" };
        if (!team.flags.has("talent_heist_pending_full_counter")) {
          return {
            ok: false,
            error: `${team.name} has no pending Full Counter Offer to settle.`,
          };
        }
        const clean = Math.max(0, Math.round(costUsd));
        const nextFlags = new Set(team.flags);
        nextFlags.delete("talent_heist_pending_full_counter");
        // Track that we settled it so it doesn't re-appear or get
        // double-settled. Useful audit trail in the team's flag set.
        nextFlags.add("talent_heist_full_counter_settled");
        set({
          teams: s.teams.map((t) =>
            t.id === teamId
              ? { ...t, cashUsd: t.cashUsd - clean, flags: nextFlags }
              : t,
          ),
        });
        toast.warning(
          `${team.name}: Full Counter Offer settled`,
          `${fmtMoneyPlain(clean)} charged to cash. Executives retained.`,
        );
        return { ok: true };
      },

      rejectAirportBid: (bidId, reason) => {
        const s = get();
        const bid = (s.airportBids ?? []).find((b) => b.id === bidId);
        if (!bid) return { ok: false, error: "Bid not found" };
        if (bid.status !== "pending") {
          return { ok: false, error: `Bid is already ${bid.status}` };
        }
        const city = CITIES_BY_CODE[bid.airportCode];
        const bidder = s.teams.find((t) => t.id === bid.bidderTeamId);

        set({
          // Refund the escrowed cash to the bidder.
          teams: s.teams.map((t) =>
            t.id === bid.bidderTeamId ? { ...t, cashUsd: t.cashUsd + bid.bidPriceUsd } : t,
          ),
          airportBids: (s.airportBids ?? []).map((b) =>
            b.id === bidId
              ? {
                  ...b,
                  status: "rejected" as const,
                  resolvedQuarter: s.currentQuarter,
                  resolutionNote: reason,
                }
              : b,
          ),
        });
        toast.warning(
          `Rejected · ${city?.name ?? bid.airportCode}`,
          `${bidder?.name ?? "Bidder"}'s bid declined. ${fmtMoneyPlain(bid.bidPriceUsd)} refunded${reason ? ` — ${reason}` : ""}.`,
        );
        return { ok: true };
      },

      sellAirport: (airportCode) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const slotState = s.airportSlots?.[airportCode];
        if (!slotState?.ownerTeamId || slotState.ownerTeamId !== player.id) {
          return { ok: false, error: "You don't own this airport" };
        }
        const price = airportAskingPriceUsd(airportCode, slotState, s.teams);
        const proceeds = Math.round(price * 0.95);
        const newSlotState: AirportSlotState = {
          available: slotState.available,
          nextOpening: slotState.nextOpening,
          nextTickQuarter: slotState.nextTickQuarter,
          totalCapacity: slotState.totalCapacity,
        };
        set({
          teams: s.teams.map((t) =>
            t.id === player.id ? { ...t, cashUsd: t.cashUsd + proceeds } : t,
          ),
          airportSlots: { ...s.airportSlots, [airportCode]: newSlotState },
        });
        const city = CITIES_BY_CODE[airportCode];
        toast.warning(
          `Airport sold · ${city?.name ?? airportCode}`,
          `Proceeds ${fmtMoneyPlain(proceeds)} (5% broker fee). Bidding restored at this airport.`,
        );
        return { ok: true, proceeds };
      },

      setAirportSlotRate: ({ airportCode, newRatePerWeekUsd }) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const slotState = s.airportSlots?.[airportCode];
        if (!slotState?.ownerTeamId || slotState.ownerTeamId !== player.id) {
          return { ok: false, error: "You don't own this airport" };
        }
        const rate = Math.max(1_000, Math.round(newRatePerWeekUsd));
        const teams = applyOwnerSlotRate(s.teams, airportCode, rate);
        set({
          teams,
          airportSlots: {
            ...s.airportSlots,
            [airportCode]: { ...slotState, ownerSlotRatePerWeekUsd: rate },
          },
        });
        const city = CITIES_BY_CODE[airportCode];
        toast.accent(
          `Slot rate updated · ${city?.name ?? airportCode}`,
          `New rate ${fmtMoneyPlain(rate)}/wk per slot. Tenants charged from next quarter.`,
        );
        return { ok: true };
      },

      expandAirportCapacity: (airportCode) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const slotState = s.airportSlots?.[airportCode];
        if (!slotState?.ownerTeamId || slotState.ownerTeamId !== player.id) {
          return { ok: false, error: "You don't own this airport" };
        }
        const city = CITIES_BY_CODE[airportCode];
        if (!city) return { ok: false, error: "Unknown airport" };
        const tier = city.tier as 1 | 2 | 3 | 4;
        const max = AIRPORT_MAX_CAPACITY_BY_TIER[tier];
        const cap = slotState.totalCapacity ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[tier];
        if (cap >= max) {
          return { ok: false, error: "Airport already at maximum capacity" };
        }
        const cost = AIRPORT_EXPANSION_COST_PER_LEVEL[tier];
        if (player.cashUsd < cost) {
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash` };
        }
        const newCap = Math.min(max, cap + AIRPORT_EXPANSION_SLOTS);
        const addedSlots = newCap - cap;
        set({
          teams: s.teams.map((t) =>
            t.id === player.id ? { ...t, cashUsd: t.cashUsd - cost } : t,
          ),
          airportSlots: {
            ...s.airportSlots,
            [airportCode]: {
              ...slotState,
              totalCapacity: newCap,
              available: slotState.available + addedSlots,
            },
          },
        });
        toast.success(
          `+${addedSlots} slots at ${city.name}`,
          `${fmtMoneyPlain(cost)} expansion. Capacity now ${newCap}/${max}.`,
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

      retrofitLifespan: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.status !== "active" && plane.status !== "grounded") {
          return { ok: false, error: `Cannot retrofit ${plane.status} aircraft` };
        }
        if (plane.lifespanExtended) {
          return {
            ok: false,
            error: "This airframe has already had its lifespan retrofit. One per plane — replacement is the only option now.",
          };
        }
        // Cost = 30% of original purchase price (the actual cash paid
        // when this airframe was acquired). Falls back to spec
        // buyPriceUsd if a legacy save is missing purchasePrice.
        const spec = AIRCRAFT_BY_ID[plane.specId];
        const baselinePrice = plane.purchasePrice > 0
          ? plane.purchasePrice
          : (spec?.buyPriceUsd ?? 0);
        const cost = Math.round(baselinePrice * 0.30);
        if (player.cashUsd < cost) {
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash for retrofit` };
        }
        // +14 quarters = 50% of the base 28Q lifespan. Capped at 38Q
        // total beyond the original delivery so the plane can't run
        // forever even after the retrofit.
        const extension = 14;
        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              cashUsd: t.cashUsd - cost,
              fleet: t.fleet.map((f) =>
                f.id === aircraftId
                  ? {
                      ...f,
                      retirementQuarter: f.retirementQuarter + extension,
                      lifespanExtended: true,
                      // Renovation + maintenance bump because a major
                      // retrofit also refreshes the cabin. Adds a
                      // small satisfaction bump back so the player
                      // sees an immediate quality dividend.
                      satisfactionPct: Math.min(100, (f.satisfactionPct ?? 75) + 12),
                    }
                  : f,
              ),
            },
          ),
        });
        toast.success(
          `Lifespan retrofit applied`,
          `${spec?.name ?? "Aircraft"} · +${extension}Q operational life · −${fmtMoneyPlain(cost)}`,
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

      quickServiceAircraft: (aircraftId) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        const plane = player.fleet.find((f) => f.id === aircraftId);
        if (!plane) return { ok: false, error: "Aircraft not found" };
        if (plane.acquisitionType !== "buy")
          return { ok: false, error: "Only owned aircraft can be serviced" };
        if (plane.status !== "active")
          return { ok: false, error: `Cannot service ${plane.status} aircraft` };
        // PRD §5.5: 5% of current book value, no downtime, satisfaction
        // restored to 80% of new (a fresh plane is at 75% baseline +
        // satisfaction modifiers; we lift to 80 cleanly).
        const cost = plane.bookValue * 0.05;
        if (player.cashUsd < cost)
          return { ok: false, error: `Need ${fmtMoneyPlain(cost)} cash` };
        set({
          teams: s.teams.map((t) =>
            t.id !== player.id ? t : {
              ...t,
              cashUsd: t.cashUsd - cost,
              fleet: t.fleet.map((f) =>
                f.id === aircraftId
                  ? { ...f, satisfactionPct: 80 }
                  : f,
              ),
            },
          ),
        });
        toast.success(
          `Quick Service complete`,
          `${AIRCRAFT_BY_ID[plane.specId]?.name ?? "Aircraft"} · ` +
          `−${fmtMoneyPlain(cost)} · cabin satisfaction restored to 80%`,
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
        if (get().isObserver) return { ok: false, error: "Observer mode — no edits allowed" };
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
        // Duplicate-route detection.
        //
        // Cargo and passenger between the same OD pair are DIFFERENT
        // operations (tonnes vs cabin classes) and coexist as two
        // separate routes. We only treat as a duplicate when the OD
        // pair AND the cargo flag match.
        //
        // When a same-family duplicate IS found we DON'T block — we
        // MERGE: the player's freshly-picked aircraft are added to the
        // existing route's roster and the daily frequency is bumped to
        // leverage the new capacity. Any slot shortfall at the new
        // weekly schedule is queued as a bid via the same path as a
        // brand-new pending route.
        const wantsCargo = isCargo ?? false;
        const duplicate = player.routes.find((r) =>
          r.status !== "closed" &&
          (r.isCargo ?? false) === wantsCargo &&
          ((r.originCode === originCode && r.destCode === destCode) ||
           (r.originCode === destCode && r.destCode === originCode)),
        );
        if (duplicate) {
          // Same-family merge path. Compute the new combined fleet's
          // max physics-capped weekly frequency and use the LOWER of
          // (intended weekly = current sum) and (physics cap).
          const mergedAircraftIds = Array.from(new Set([
            ...duplicate.aircraftIds,
            ...aircraftIds,
          ]));
          const mergedSpecIds = mergedAircraftIds
            .map((id) => player.fleet.find((f) => f.id === id)?.specId)
            .filter((x): x is string => !!x);
          const mergedAircraftForPhysics = mergedAircraftIds
            .map((id) => {
              const f = player.fleet.find((plane) => plane.id === id);
              if (!f) return null;
              return {
                specId: f.specId,
                engineUpgrade: f.engineUpgrade ?? null,
                cargoBelly: f.cargoBelly,
                doctrine: player.doctrine,
              };
            })
            .filter((x): x is NonNullable<typeof x> => !!x);
          const mergedMaxDaily =
            mergedSpecIds.length > 0
              ? maxRouteDailyFrequency(
                  mergedSpecIds,
                  duplicate.distanceKm,
                  mergedAircraftForPhysics,
                )
              : duplicate.dailyFrequency;
          // Player asked for `dailyFrequency` (weekly/7); honor that as
          // a target up to the merged cap.
          const targetDaily = Math.max(duplicate.dailyFrequency, dailyFrequency);
          const newDaily = Math.min(targetDaily, mergedMaxDaily);
          const newWeekly = Math.round(newDaily * 7);
          // Capacity check at both endpoints — sum across player's
          // OTHER active routes touching each airport, plus this route's
          // new weekly load.
          const usedAtOriginOther = player.routes
            .filter((r) =>
              r.id !== duplicate.id && r.status === "active" &&
              (r.originCode === duplicate.originCode || r.destCode === duplicate.originCode))
            .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
          const usedAtDestOther = player.routes
            .filter((r) =>
              r.id !== duplicate.id && r.status === "active" &&
              (r.originCode === duplicate.destCode || r.destCode === duplicate.destCode))
            .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
          const slotsAtO = player.airportLeases?.[duplicate.originCode]?.slots ?? 0;
          const slotsAtD = player.airportLeases?.[duplicate.destCode]?.slots ?? 0;
          const mergeShortAtOrigin = Math.max(0, usedAtOriginOther + newWeekly - slotsAtO);
          const mergeShortAtDest   = Math.max(0, usedAtDestOther + newWeekly - slotsAtD);
          const mergeHasShortfall = mergeShortAtOrigin > 0 || mergeShortAtDest > 0;
          const mergeWantsAutoBid = (slotBids ?? []).length > 0;
          if (mergeHasShortfall && !mergeWantsAutoBid) {
            return {
              ok: false,
              error:
                `Adding these aircraft to ${duplicate.originCode} ↔ ${duplicate.destCode} ` +
                `would push you over your slot lease (need ${mergeShortAtOrigin} more at ` +
                `${duplicate.originCode}, ${mergeShortAtDest} more at ${duplicate.destCode}). ` +
                `Set an inline bid or release slots elsewhere first.`,
            };
          }
          // Submit any provided bids for the missing slots
          if (mergeWantsAutoBid) {
            for (const bid of slotBids ?? []) {
              const need =
                bid.airportCode === duplicate.originCode ? mergeShortAtOrigin :
                bid.airportCode === duplicate.destCode   ? mergeShortAtDest : 0;
              if (need <= 0) continue;
              const slotsToBid = Math.max(need, bid.slots ?? need);
              const r = get().submitSlotBid(bid.airportCode, slotsToBid, bid.pricePerSlot);
              if (!r.ok) {
                return { ok: false, error: `Bid at ${bid.airportCode} failed: ${r.error}` };
              }
            }
          }
          // Apply merge.
          set({
            teams: s.teams.map((t) =>
              t.id !== s.playerTeamId ? t : {
                ...t,
                routes: t.routes.map((r) =>
                  r.id === duplicate.id
                    ? { ...r, aircraftIds: mergedAircraftIds, dailyFrequency: newDaily }
                    : r,
                ),
                fleet: t.fleet.map((f) =>
                  aircraftIds.includes(f.id)
                    ? { ...f, status: "active" as const, routeId: duplicate.id }
                    : f,
                ),
              },
            ),
          });
          toast.success(
            `Capacity added to ${duplicate.originCode} ↔ ${duplicate.destCode}`,
            `${aircraftIds.length} aircraft joined the route · now ${newWeekly}/wk` +
              (mergeHasShortfall ? " (pending slot bids)" : ""),
          );
          return { ok: true };
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
          // Honour engine retrofit range bonus: fuel/super engines
          // ship a +10% range extension. Earlier this was advertised
          // in the upgrade card but never actually checked here, so
          // a player who paid for "+10% range" still got blocked
          // from routes the upgraded plane can physically reach.
          const effRange = effectiveRangeKm(spec, p.engineUpgrade ?? null);
          if (dist > effRange)
            return { ok: false, error: `${spec.name} cannot reach ${destCode} (${Math.round(dist)} km > ${effRange} km${p.engineUpgrade ? " w/ upgrade" : ""})` };
        }
        // Engine stores daily; UI works in weekly. The minimum is 1
        // weekly schedule = 1/7 daily ≈ 0.143. Earlier this rejected
        // anything < 1 daily so a player picking 3/wk in the modal
        // got a "must be at least 1/week" error from the store on
        // submit. Cap at 24/day (168/wk).
        if (dailyFrequency < 1 / 7 || dailyFrequency > 24)
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
          cargoRatePerTonne: null,
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
            `${Math.round(dist).toLocaleString()} km · ${Math.round(dailyFrequency * 7)}/wk · ${pricingTier}. ` +
            `Flights start running this quarter; first revenue shows at quarter close.`,
          );
        }
        get().pushStateToServer("player.openedRoute", {
          origin: originCode, dest: destCode,
        });
        return { ok: true };
      },

      closeRoute: (routeId) => {
        const s = get();
        if (s.isObserver) return;
        // Preserve closed-route history. Earlier this dropped the
        // route from the team's array entirely, so reports / endgame /
        // analytics lost any record of routes that ever existed.
        // Now we set status: "closed" and unlink the aircraft. Active-
        // route filters across the codebase already exclude
        // status === "closed", so this is a no-op for live calculations
        // — but the row stays in financialsByQuarter and can be shown
        // in retro views.
        set({
          teams: s.teams.map((t) =>
            t.id !== s.playerTeamId ? t : {
              ...t,
              routes: t.routes.map((r) =>
                r.id === routeId
                  ? {
                      ...r,
                      status: "closed" as const,
                      aircraftIds: [],
                      dailyFrequency: 0,
                    }
                  : r,
              ),
              fleet: t.fleet.map((f) => f.routeId === routeId
                ? { ...f, status: "active", routeId: null } : f),
            },
          ),
        });
        get().pushStateToServer("player.closedRoute", { routeId });
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
            (patch.dailyFrequency < 1 / 7 || patch.dailyFrequency > 24))
          return { ok: false, error: "Frequency must be 1–168 schedules/week" };

        // If aircraft reassigned, validate range + availability
        const newAircraftIds = patch.aircraftIds ?? route.aircraftIds;

        // Phase 4.5 — empty-aircraft guard. An active or pending route
        // with zero assigned aircraft consumes slots at both endpoints
        // but produces no revenue and no flights. The previous logic
        // clamped to 1/7 daily frequency, leaving phantom capacity
        // active. Now: reject the edit if it would result in an
        // empty active or pending route. Closing or suspending uses
        // the dedicated suspend/close store actions, not updateRoute.
        if (
          newAircraftIds.length === 0
          && (route.status === "active" || route.status === "pending")
        ) {
          return {
            ok: false,
            error:
              "An active route needs at least one aircraft. Add one, suspend the route, or close it.",
          };
        }
        if (patch.aircraftIds) {
          const planes = newAircraftIds
            .map((id) => player.fleet.find((f) => f.id === id));
          for (const p of planes) {
            if (!p) return { ok: false, error: "Aircraft not found" };
            const spec = AIRCRAFT_BY_ID[p.specId];
            if (!spec) return { ok: false, error: "Spec missing" };
            // Honour fuel/super engine +10% range upgrade.
            const effRange = effectiveRangeKm(spec, p.engineUpgrade ?? null);
            if (effRange < route.distanceKm)
              return { ok: false, error: `${spec.name} out of range (${Math.round(route.distanceKm)} km > ${effRange} km)` };
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
        const aircraftForPhysics = newAircraftIds
          .map((id) => {
            const f = player.fleet.find((plane) => plane.id === id);
            if (!f) return null;
            return {
              specId: f.specId,
              engineUpgrade: f.engineUpgrade ?? null,
              cargoBelly: f.cargoBelly,
              doctrine: player.doctrine,
            };
          })
          .filter((x): x is NonNullable<typeof x> => !!x);
        const physicsCap = newSpecIds.length > 0
          ? maxRouteDailyFrequency(newSpecIds, route.distanceKm, aircraftForPhysics)
          : 0;
        const clampedDaily =
          physicsCap > 0 ? Math.min(finalDaily, physicsCap) : 1 / 7;

        // Slot-capacity check on edit. Earlier updateRoute let a player
        // raise frequency or reassign aircraft without re-validating
        // slot leases at either endpoint, which let players bypass
        // the slot-market mechanic after a route was already open.
        // Now we sum every active/pending route's weekly slot use
        // EXCLUDING this route, then add the proposed new weekly demand
        // (clampedDaily × 7) and compare against airportLeases.
        const proposedWeekly = Math.round(clampedDaily * 7);
        for (const code of [route.originCode, route.destCode]) {
          const slotsHeld = player.airportLeases?.[code]?.slots ?? 0;
          const usedByOthers = player.routes
            .filter((r) =>
              r.id !== routeId &&
              (r.status === "active" || r.status === "suspended" || r.status === "pending") &&
              (r.originCode === code || r.destCode === code),
            )
            .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
          if (usedByOthers + proposedWeekly > slotsHeld) {
            const shortfall = usedByOthers + proposedWeekly - slotsHeld;
            return {
              ok: false,
              error: `Not enough slots at ${code} — ${shortfall} more weekly slot${shortfall === 1 ? "" : "s"} needed. Lower the frequency, drop an aircraft, or bid for more slots in the Slot Market first.`,
            };
          }
        }

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
              cargoRatePerTonne: patch.cargoRatePerTonne !== undefined
                ? patch.cargoRatePerTonne
                : r.cargoRatePerTonne,
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
        if (s.isObserver) return;
        // Phase 3: scenarios are scaled to the configured totalRounds
        // so 8/16/24/40-round games each see scenarios fire at the
        // correct PROPORTIONAL quarter, not always at the absolute
        // 40-round target.
        const scenario = scenariosForQuarter(s.currentQuarter, getTotalRounds(s)).find(
          (sc) => sc.id === scenarioId);
        if (!scenario) return;
        const option = scenario.options.find((o) => o.id === optionId);
        if (!option) return;
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;

        // Idempotency guard: a double-click, timer-race, or programmatic
        // re-call could otherwise apply the option's effect twice — duplicate
        // cash awards, doubled brand/loyalty deltas, two debt instruments
        // from one S7 acquisition. Skip silently if a decision for this
        // scenario+quarter already exists.
        const alreadyDecided = player.decisions.some(
          (d) => d.scenarioId === scenarioId && d.quarter === s.currentQuarter,
        );
        if (alreadyDecided) return;

        // Eligibility check on the chosen option — applies to direct
        // submits AND timer auto-submits. Earlier the auto-submit path
        // bypassed blockedByFlags / requires, so S15 timer-out applied
        // mass redundancy even when gov_board_card / redundancy_freeze
        // should have blocked it.
        if (option.blockedByFlags?.some((f) => player.flags.has(f))) {
          return;
        }
        if (option.requires === "cargo-fleet") {
          const hasCargo = player.fleet.some(
            (a) => a.status !== "retired" && AIRCRAFT_BY_ID[a.specId]?.family === "cargo",
          );
          if (!hasCargo) return;
        }

        const decision: ScenarioDecision = {
          scenarioId: scenarioId as ScenarioDecision["scenarioId"],
          quarter: s.currentQuarter,
          optionId,
          submittedAt: Date.now(),
          lockInQuarters,
        };

        const updated = applyOptionEffect(player, option.effect, s.currentQuarter);
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

        // S6 Rate Window — debt refinancing has to touch real loan
        // instruments, so it lives in the store rather than the pure
        // OptionEffect cash/flag helper. The half-refi option applies
        // half of the rate benefit across the debt stack, which avoids
        // having to split persisted loan rows.
        if (option.effect.refinanceDebt) {
          const refi = option.effect.refinanceDebt;
          const totalDebt = updated.loans.reduce(
            (sum, l) => sum + Math.max(0, l.remainingPrincipal),
            0,
          ) || Math.max(0, updated.totalDebtUsd);
          const portion = Math.max(0, Math.min(1, refi.portion));
          const principal = totalDebt * portion;
          if (principal <= 0) {
            toast.warning("No debt to refinance", "The team has no outstanding loan principal.");
          } else {
            const success =
              refi.successProbability === undefined ||
              Math.random() <= refi.successProbability;
            if (success) {
              const fee = principal * Math.max(0, refi.breakFeePct);
              const rateBenefit = 1 - (1 - refi.rateMultiplier) * portion;
              updated.cashUsd -= fee;
              updated.loans = updated.loans.map((loan) => ({
                ...loan,
                ratePct: Math.max(0.1, loan.ratePct * rateBenefit),
              }));
              updated.flags.add("efficient_capital");
              toast.success(
                "Debt refinanced",
                `${fmtMoneyPlain(fee)} break fee · loan rates multiplied by ${rateBenefit.toFixed(3)}.`,
              );
            } else {
              const diligenceFee = Math.min(8_000_000, Math.max(1_000_000, totalDebt * 0.005));
              updated.cashUsd -= diligenceFee;
              toast.warning(
                "Counter-offer failed",
                `${fmtMoneyPlain(diligenceFee)} advisory cost charged; existing loan rates remain unchanged.`,
              );
            }
          }
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
          // Resolve target quarter — `lagQuarters` (relative to the
          // decision quarter) is preferred over absolute `quarter`
          // because it self-heals if the scenario quarter moves.
          // Hard-coded plot twists at engine.ts:2806 used absolute
          // quarters that drifted out of sync with the 40-round
          // campaign; this is the correct architecture.
          const targetQuarter = typeof d.lagQuarters === "number"
            ? s.currentQuarter + d.lagQuarters
            : (d.quarter ?? s.currentQuarter + 1);
          const ev: DeferredEvent = {
            id: mkId("ev"),
            sourceScenario: scenarioId as ScenarioDecision["scenarioId"],
            sourceOption: optionId,
            targetQuarter,
            probability: d.probability ?? 1,
            effectJson: serializeEffect(d.effect),
            noteAtQueue: d.note ?? `${scenario.title} · Option ${optionId}`,
          };
          updated.deferredEvents = [...(updated.deferredEvents ?? []), ev];
        }

        set({
          teams: s.teams.map((t) => t.id === player.id ? updated : t),
        });
        get().pushStateToServer("player.submittedDecision", {
          scenarioId, optionId,
        });
      },

      borrowCapital: (amount) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (!Number.isFinite(amount) || amount < 1_000_000) {
          return { ok: false, error: "Minimum borrowing is $1M" };
        }
        const headroom = maxBorrowingUsd(player);
        if (amount > headroom) {
          return {
            ok: false,
            error: `Borrowing cap is ${fmtMoneyPlain(headroom)}. Repay debt or rebuild equity before taking more.`,
          };
        }
        // Borrowing rate honours the team's covenant pressure +
        // brand premium (effectiveBorrowingRate). Earlier this used
        // the bare baseRate, so high-debt airlines silently borrowed
        // at the same rate as healthy ones — covenant breach badge
        // showed but didn't bite.
        const ratePct = effectiveBorrowingRate(player, s.baseInterestRatePct);
        const loan: LoanInstrument = {
          id: mkId("loan"),
          principalUsd: amount,
          ratePct,
          originQuarter: s.currentQuarter,
          remainingPrincipal: amount,
          govBacked: false,
          lenderName: pickLenderName(
            player.loans.map((l) => l.lenderName ?? ""),
          ),
          source: "borrowing",
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

      // ── Refinance overdraft ──────────────────────────────
      // When cash goes negative, the airline is implicitly running
      // on overdraft (high penalty interest). This action converts
      // the negative balance into a regular term loan at the standard
      // covenant-adjusted rate, restoring cash to 0 and adding a new
      // entry to the loans list with an "overdraft-refi" tag so the
      // player remembers why they took it.
      refinanceOverdraft: () => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player team" };
        if (player.cashUsd >= 0)
          return { ok: false, error: "No overdraft to refinance — cash isn't negative." };
        const overdraftAmount = Math.ceil(-player.cashUsd / 1_000_000) * 1_000_000;
        // Borrowing cap respected so the team can't paper over a
        // collapse with infinite overdraft refis.
        const headroom = maxBorrowingUsd(player);
        if (headroom < overdraftAmount) {
          return {
            ok: false,
            error: `Overdraft is ${fmtMoneyPlain(overdraftAmount)} but borrowing cap leaves only ${fmtMoneyPlain(headroom)}. Trim debt first.`,
          };
        }
        const ratePct = effectiveBorrowingRate(player, s.baseInterestRatePct);
        const loan: LoanInstrument = {
          id: mkId("loan"),
          principalUsd: overdraftAmount,
          ratePct,
          originQuarter: s.currentQuarter,
          remainingPrincipal: overdraftAmount,
          govBacked: false,
          lenderName: pickLenderName(
            player.loans.map((l) => l.lenderName ?? ""),
          ),
          source: "overdraft-refi",
        };
        set({
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            cashUsd: t.cashUsd + overdraftAmount,
            totalDebtUsd: t.totalDebtUsd + overdraftAmount,
            loans: [...t.loans, loan],
          }),
        });
        toast.success(
          `Overdraft refinanced · ${fmtMoneyPlain(overdraftAmount)}`,
          `Cash restored to balance. New term loan at ${ratePct.toFixed(1)}% with ${loan.lenderName}.`,
        );
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
        const newRate = effectiveBorrowingRate(player, s.baseInterestRatePct);
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
        if (s.isObserver) return;

        // Phase 8.3 — defensive auto-end. If we're in a multiplayer
        // game (session.gameId is set) and zero human teams remain,
        // route straight to endgame. The forfeit API endpoint handles
        // this eagerly at write time, so this should rarely fire —
        // but it covers the offline-forfeit / local-only-mutation
        // path so a degenerate state doesn't loop bots forever.
        if (s.session?.gameId) {
          const humanCount = s.teams.filter(
            (t) => t.controlledBy === "human",
          ).length;
          if (humanCount === 0) {
            set({ phase: "endgame", lastCloseResult: null });
            toast.warning(
              "All players forfeited",
              "Game ended — no human players remain.",
            );
            return;
          }
        }

        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return;

        // Auto-submit pending board decisions (PRD fallback path).
        // Earlier the close button warned the player about open
        // decisions but advanced anyway, leaving the scenario silently
        // skipped — the worst-case option from the PRD never fired.
        // Now we walk every scenario for this quarter and submit the
        // first ELIGIBLE fallback option (skipping any blocked by flags
        // or the cargo-fleet requirement) for any scenario the player
        // didn't explicitly answer. Calls submitDecision so all the
        // dedup + eligibility logic from above also applies.
        {
          // Phase 3: pull scenarios from the scaled lookup so short-
          // format games see their proportional scenarios at the right
          // quarter (not always the absolute 40-round target).
          const pending = scenariosForQuarter(s.currentQuarter, getTotalRounds(s)).filter(
            (sc) => !player.decisions.some(
              (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
            ),
          );
          if (pending.length > 0) {
            for (const sc of pending) {
              // Pick the configured fallback first, but if it's blocked
              // for this team (S15 mass redundancy when redundancy_freeze
              // is active, etc), walk the option list and pick the next
              // eligible one. Tie-breaker: order ID alphabetical so the
              // fallback is deterministic.
              const eligibleOptions = sc.options.filter((o) => {
                if (o.blockedByFlags?.some((f) => player.flags.has(f))) return false;
                if (o.requires === "cargo-fleet") {
                  const hasCargo = player.fleet.some(
                    (a) => a.status !== "retired" && AIRCRAFT_BY_ID[a.specId]?.family === "cargo",
                  );
                  if (!hasCargo) return false;
                }
                return true;
              });
              if (eligibleOptions.length === 0) continue;
              const preferred = eligibleOptions.find((o) => o.id === sc.autoSubmitOptionId);
              const pick = preferred ?? eligibleOptions[0];
              get().submitDecision({
                scenarioId: sc.id,
                optionId: pick.id,
                lockInQuarters: 0,
              });
            }
            // Re-read team state after the auto-submits so the rest of
            // the close run uses the fresh decisions/flags/cash.
            const refreshed = get().teams.find((t) => t.id === s.playerTeamId);
            if (refreshed) Object.assign(player, refreshed);
          }
        }

        // Auto-expire pending airport bids that have sat for 2+ quarters
        // without a facilitator decision. Real-world airport-acquisition
        // approvals usually run on a regulatory clock; here we treat
        // 2 quarters as the regulatory window. Expired bids refund the
        // escrowed cash to the bidder team and are stamped with a
        // resolutionNote so the audit trail shows why.
        {
          const sNow = get();
          const expiringBids = (sNow.airportBids ?? []).filter(
            (b) =>
              b.status === "pending" &&
              sNow.currentQuarter - b.submittedQuarter >= 2,
          );
          if (expiringBids.length > 0) {
            // Refund each in turn — sum refunds per team so we touch
            // each team object once even if multiple bids expire.
            const refundByTeam: Record<string, number> = {};
            for (const b of expiringBids) {
              refundByTeam[b.bidderTeamId] = (refundByTeam[b.bidderTeamId] ?? 0) + b.bidPriceUsd;
            }
            const expiredIds = new Set(expiringBids.map((b) => b.id));
            set({
              teams: sNow.teams.map((t) =>
                refundByTeam[t.id]
                  ? { ...t, cashUsd: t.cashUsd + refundByTeam[t.id] }
                  : t,
              ),
              airportBids: (sNow.airportBids ?? []).map((b) =>
                expiredIds.has(b.id)
                  ? {
                      ...b,
                      status: "expired" as const,
                      resolvedQuarter: sNow.currentQuarter,
                      resolutionNote: "Approval window elapsed (2 quarters)",
                    }
                  : b,
              ),
            });
            for (const b of expiringBids) {
              const city = CITIES_BY_CODE[b.airportCode];
              if (b.bidderTeamId === sNow.playerTeamId) {
                toast.warning(
                  `Bid expired · ${city?.name ?? b.airportCode}`,
                  `${fmtMoneyPlain(b.bidPriceUsd)} refunded — facilitator didn't decide within the 2-quarter window.`,
                );
              }
            }
            // Re-pull player state after the cash refund so the rest
            // of the close run uses the fresh cash position.
            const refreshed = get().teams.find((t) => t.id === s.playerTeamId);
            if (refreshed) Object.assign(player, refreshed);
          }
        }

        // Insurance coverage (PRD E5) — paid out on mandatory retirement at end of lifespan
        const coverageByPolicy = { none: 0, low: 0.3, medium: 0.5, high: 0.8 } as const;
        const coveragePct = coverageByPolicy[player.insurancePolicy];
        let insuranceProceeds = 0;

        // Transition ordered → active planes, retire aircraft whose
        // retirementQuarter has been reached, AND auto-scrap any
        // retired airframes immediately so they don't clutter the
        // fleet table. Expired leases also return to the lessor here.
        let leaseReturnCount = 0;
        let scrapProceedsUsd = 0;
        type RetiredEntry = NonNullable<Team["retiredHistory"]>[number];
        const retiredHistory: RetiredEntry[] = [];
        const updatedFleet = player.fleet.map((f) => {
          const retiring = f.retirementQuarter !== undefined && s.currentQuarter >= f.retirementQuarter;
          if (retiring) {
            // PRD D6 / E5: 75% of book value baseline, reduced to configured coverage
            const payoutBase = f.bookValue * 0.75;
            const payout = payoutBase * coveragePct;
            insuranceProceeds += payout;
            // Auto-scrap on retirement — earlier retired aircraft sat
            // forever in `team.fleet` cluttering the fleet table while
            // showing in Total but not Used / Unused / Order columns.
            // Now they're sold for scrap (10% of book value) at retirement
            // and removed from the active list. The history record
            // surfaces in a History panel so the player can audit.
            const scrapValue = Math.round(f.bookValue * 0.10);
            scrapProceedsUsd += scrapValue;
            const spec = AIRCRAFT_BY_ID[f.specId];
            retiredHistory.push({
              id: f.id, specId: f.specId,
              specName: spec?.name ?? f.specId,
              acquiredAtQuarter: f.purchaseQuarter,
              exitQuarter: s.currentQuarter,
              exitReason: "retired" as const,
              proceedsUsd: scrapValue + payout,
              acquisitionType: f.acquisitionType,
            });
            return null; // signal removal
          }
          // Expired lease: airframe goes back to the lessor — no scrap
          // proceeds, no insurance payout. Logged in history.
          if (
            f.acquisitionType === "lease" &&
            typeof f.leaseTermEndsAtQuarter === "number" &&
            s.currentQuarter > f.leaseTermEndsAtQuarter
          ) {
            leaseReturnCount += 1;
            const spec = AIRCRAFT_BY_ID[f.specId];
            retiredHistory.push({
              id: f.id, specId: f.specId,
              specName: spec?.name ?? f.specId,
              acquiredAtQuarter: f.purchaseQuarter,
              exitQuarter: s.currentQuarter,
              exitReason: "lease-returned" as const,
              proceedsUsd: 0,
              acquisitionType: "lease",
            });
            return null;
          }
          if (f.status === "ordered") return { ...f, status: "active" as const };
          if (f.status === "grounded") return { ...f, status: "active" as const };
          return f;
        }).filter((f): f is NonNullable<typeof f> => f !== null);
        // Surface scrap proceeds to the player and merge history.
        if (scrapProceedsUsd > 0 || retiredHistory.length > 0) {
          insuranceProceeds += scrapProceedsUsd;
          // Use of `as any` here would be a code smell — instead the
          // type field is added to Team in types/game.ts. Falls back
          // to creating the array if it doesn't exist on the team yet.
          (player as { retiredHistory?: typeof retiredHistory }).retiredHistory =
            [...(player.retiredHistory ?? []), ...retiredHistory];
        }
        if (leaseReturnCount > 0) {
          toast.info(
            `${leaseReturnCount} lease${leaseReturnCount === 1 ? "" : "s"} returned`,
            `Term ended without buy-out — airframe${leaseReturnCount === 1 ? "" : "s"} returned to the lessor.`,
          );
        }

        if (insuranceProceeds > 0 && coveragePct > 0) {
          const retiredCount = updatedFleet.filter((f) => f.status === "retired" && !player.fleet.find((p) => p.id === f.id && p.status === "retired")).length;
          toast.info(`Aircraft insurance proceeds`,
            `${retiredCount} retirement${retiredCount === 1 ? "" : "s"} · +${fmtMoneyPlain(insuranceProceeds)} at ${(coveragePct * 100).toFixed(0)}% coverage`);
        }

        // PRD §5.2 — notify the player 2 rounds before mandatory
        // retirement so they can plan replacement orders.
        const approachingRetirement = updatedFleet.filter((f) =>
          f.status === "active" &&
          f.retirementQuarter !== undefined &&
          f.retirementQuarter - s.currentQuarter === 2,
        );
        if (approachingRetirement.length > 0) {
          const lines = approachingRetirement.slice(0, 5).map((f) => {
            const spec = AIRCRAFT_BY_ID[f.specId];
            return `${spec?.name ?? f.specId} (${f.id.slice(-6).toUpperCase()})`;
          });
          toast.warning(
            `${approachingRetirement.length} aircraft retiring in 2 rounds`,
            lines.join(" · ") +
              (approachingRetirement.length > 5 ? ` · +${approachingRetirement.length - 5} more` : "") +
              ". Order replacements now — they take 1 round to arrive.",
          );
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

        // Fleet flag detection (PRD §7.2). After the 40-round restructure
        // with 2:1 EIS compression, the "modern" threshold needed
        // recalibration — under the old 20-round game, unlockQuarter≥8
        // meant "post-2003" which was genuinely modern. In the 40-round
        // game, unlockQuarter≥21 lines up with 787-8/A350-era and later
        // (true new-gen widebodies + neo/MAX narrowbodies).
        const activeModern = updatedFleet.filter(
          (f) => f.status === "active" && AIRCRAFT_BY_ID[f.specId]?.unlockQuarter >= 21,
        ).length;
        const newFlags = new Set(player.flags);
        if (activeModern >= 10) newFlags.add("modern_fleet");
        else newFlags.delete("modern_fleet");
        // Aging fleet: no planes ordered this quarter AND average fleet
        // age exceeds 12Q (60% of the 20Q lifespan). Was 10Q which fired
        // too aggressively in the back half of the 40-round game.
        const ordersThisQuarter = updatedFleet.filter(
          (f) => f.purchaseQuarter === s.currentQuarter,
        ).length;
        const averageAge = updatedFleet.length > 0
          ? updatedFleet.reduce((sum, f) => sum + (s.currentQuarter - f.purchaseQuarter), 0) / updatedFleet.length
          : 0;
        // 60% of the 28Q lifespan = 17Q. The old 12Q threshold was set
        // when lifespan was 20Q and would now fire too early relative
        // to actual retirement timing.
        if (ordersThisQuarter === 0 && averageAge >= 17) {
          newFlags.add("aging_fleet");
        }
        const teamReadyPre: Team = {
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

        // ── Slot auctions + pending-route activation (run BEFORE revenue) ──
        // Sequence fix: routes that win their slot bids must activate THIS
        // quarter and contribute to revenue, otherwise aircraft sit idle for
        // an entire quarter after the player creates a route. We resolve
        // auctions and flip pending → active first, then `runQuarterClose`
        // sees the routes as flying and books their revenue.
        const earlyRivals = s.teams.filter((t) => t.id !== player.id);
        const earlyBidsByAirport: Record<string, BidEntry[]> = {};
        for (const t of [teamReadyPre, ...earlyRivals]) {
          // Auto re-bid for pending routes whose stored pendingBidPrices
          // indicate the player committed to a price.
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
            (earlyBidsByAirport[b.airportCode] ??= []).push({
              teamId: t.id,
              airportCode: b.airportCode,
              slots: b.slots,
              pricePerSlot: b.pricePerSlot,
              quarterSubmitted: b.quarterSubmitted,
            });
          }
        }
        // Backstop: seed missing airports from initial pool so bids resolve.
        const earlySlotsForAuction = { ...(s.airportSlots ?? {}) };
        const earlyFresh = makeInitialAirportSlots();
        for (const code of Object.keys(earlyBidsByAirport)) {
          if (!earlySlotsForAuction[code] && earlyFresh[code]) {
            earlySlotsForAuction[code] = earlyFresh[code];
          }
        }
        const earlyAuction = resolveSlotAuctions(earlySlotsForAuction, earlyBidsByAirport);
        const slotsAfterEarlyAuction = earlyAuction.slots;
        const earlyAwards = earlyAuction.awards;

        // Apply awards to player + rivals (Model B — recurring fees)
        const applyAwards = (t: Team): Team => {
          const won = earlyAwards.filter((a) => a.teamId === t.id && a.slotsWon > 0);
          if (won.length === 0) return { ...t, pendingSlotBids: [] };
          const newLeases: Record<string, AirportLease> = { ...(t.airportLeases ?? {}) };
          const newSlots: Record<string, number> = { ...t.slotsByAirport };
          for (const w of won) {
            const cur = newLeases[w.airportCode] ?? { slots: 0, totalWeeklyCost: 0 };
            newLeases[w.airportCode] = {
              slots: cur.slots + w.slotsWon,
              totalWeeklyCost: cur.totalWeeklyCost + w.slotsWon * w.weeklyPricePerSlot,
            };
            newSlots[w.airportCode] = (newSlots[w.airportCode] ?? 0) + w.slotsWon;
          }
          return { ...t, airportLeases: newLeases, slotsByAirport: newSlots, pendingSlotBids: [] };
        };

        const playerWithAwards = applyAwards(teamReadyPre);
        const rivalsWithAwards = earlyRivals.map(applyAwards);

        // Activate pending routes that now have enough slots at both endpoints.
        let earlyActivations = 0;
        const earlyStillPending: string[] = [];
        const activatePending = (t: Team, surfaceDiagnostics: boolean): Team => {
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
              const reason =
                `held ${slotsO}@${r.originCode} / ${slotsD}@${r.destCode}, ` +
                `${usedO}/${usedD} used, ${availO}/${availD} free, ` +
                `need ${intendedWeekly}/wk`;
              if (surfaceDiagnostics) {
                earlyStillPending.push(`${r.originCode}→${r.destCode}: ${reason}`);
              }
              // Persist the reason on the Route so the Routes panel can
              // show it any time (not just the one-shot toast at close).
              newRoutes.push({ ...r, pendingReason: reason });
              continue;
            }
            if (surfaceDiagnostics) earlyActivations += 1;
            newRoutes.push({
              ...r,
              status: "active" as const,
              // Preserve fractional daily so 1–6 won weekly slots
              // become 0.14–0.86 daily, not snapped up to 1 daily
              // (= 7 weekly) which would silently over-consume slots.
              dailyFrequency: Math.max(1 / 7, effectiveWeekly / 7),
              pendingReason: undefined,
              pendingBidPrices: undefined,
              pendingBidSlots: undefined,
            });
          }
          return { ...t, routes: newRoutes };
        };

        const teamReady = activatePending(playerWithAwards, true);
        const rivalsAfterActivation = rivalsWithAwards.map((t) => activatePending(t, false));

        if (earlyActivations > 0) {
          toast.success(
            `${earlyActivations} pending route${earlyActivations > 1 ? "s" : ""} now active`,
            "Bid won — flying this quarter and contributing to results.",
          );
        }
        if (earlyStillPending.length > 0) {
          toast.warning(
            `${earlyStillPending.length} route${earlyStillPending.length > 1 ? "s" : ""} still pending`,
            earlyStillPending.join(" · ") +
            ". Re-bid in the Slot Market for the missing slots, or cancel the route manually in Routes.",
          );
        }

        // Surface auction outcomes for the player only
        const earlyPlayerWins = earlyAwards.filter((a) => a.teamId === player.id && a.slotsWon > 0);
        if (earlyPlayerWins.length > 0) {
          const total = earlyPlayerWins.reduce((sum, w) => sum + w.slotsWon, 0);
          toast.success(
            `Won ${total} airport slots`,
            earlyPlayerWins.map((w) => `${w.airportCode}: ${w.slotsWon}`).join(" · "),
          );
        }
        const earlyPlayerLosses = earlyAwards.filter((a) => a.teamId === player.id && a.slotsWon === 0);
        if (earlyPlayerLosses.length > 0) {
          toast.warning(
            `Lost ${earlyPlayerLosses.length} slot bid${earlyPlayerLosses.length > 1 ? "s" : ""}`,
            "Higher bidders won. Try again next quarter.",
          );
        }

        const result = runQuarterClose(teamReady, {
          baseInterestRatePct: s.baseInterestRatePct,
          fuelIndex: s.fuelIndex,
          quarter: s.currentQuarter,
          rivals: rivalsAfterActivation,
          cargoContracts: s.cargoContracts ?? [],
          worldCupHostCode: s.worldCupHostCode,
          olympicHostCode: s.olympicHostCode,
          allTeams: s.teams,
          // P0 fix: thread the post-early-auction slot pool. Earlier this
          // was `s.airportSlots` (the pre-auction state), so slots
          // awarded in the early auction were invisible here AND to the
          // late auction below — capacity could be sold twice within
          // the same quarter close.
          airportSlots: slotsAfterEarlyAuction,
        });

        // Decrement remaining quarters on each contract; drop expired
        const updatedCargoContracts = (s.cargoContracts ?? [])
          .map((cc) => cc.teamId === player.id
            ? { ...cc, quartersRemaining: cc.quartersRemaining - 1 }
            : cc)
          .filter((cc) => cc.quartersRemaining > 0);

        // Commit result back to team + add any insurance proceeds on top.
        // CRITICAL: persist the post-close fleet + routes so future quarter
        // closes see depreciated bookValues, accumulated maintenance deficit,
        // and the newly-realised revenue/cost/occupancy numbers per route.
        const closed: Team = {
          ...teamReady,
          fleet: result.newFleet,
          routes: result.newRoutes,
          cashUsd: result.newCashUsd + insuranceProceeds,
          rcfBalanceUsd: result.newRcfBalance,
          brandPts: result.newBrandPts,
          opsPts: result.newOpsPts,
          customerLoyaltyPct: result.newLoyalty,
          brandValue: result.newBrandValue,
          flags: new Set(result.newFlags),
          deferredEvents: result.newDeferredEvents,
          routeObligations: result.newRouteObligations,
          timedModifiers: result.newTimedModifiers,
          hubInvestments: result.newHubInvestments,
          labourRelationsScore: result.newLabourRelationsScore,
          milestones: result.newMilestones,
          taxLossCarryForward: result.newTaxLossCarryForward,
          fuelStorageLevelL: result.newFuelStorageLevelL,
          fuelStorageAvgCostPerL: result.newFuelStorageAvgCostPerL,
          subsidiaries: result.newSubsidiaries,
          // Dedupe-on-push: drop any existing row for this quarter
          // before appending the fresh one. Earlier the array could
          // accumulate duplicates if the player restored a snapshot
          // and re-closed the same quarter — the Financials table
          // would then show "Q1 2020" twice with slightly different
          // numbers. The latest close always wins.
          financialsByQuarter: [
            ...teamReady.financialsByQuarter.filter((q) => q.quarter !== s.currentQuarter),
            {
            quarter: s.currentQuarter,
            cash: result.newCashUsd,
            debt: teamReady.totalDebtUsd,
            revenue: result.revenue,
            passengerRevenue: result.passengerRevenue,
            cargoRevenue: result.cargoRevenue,
            airportRevenue: result.airportRevenueUsd,
            subsidiaryRevenue: result.subsidiaryRevenueUsd,
            costs: result.revenue - result.netProfit,
            // Per-line operating cost breakdown so the Financials tab
            // can render a real income statement (not just a single
            // "Costs" total). Sliders broken out into Marketing /
            // Service / Operations / Customer-Service so the player
            // can see what's inside the Other Slider Spend bucket.
            fuelCost: result.fuelCost,
            slotCost: result.slotCost,
            staffCost: result.staffCost,
            leaseFeesUsd: result.leaseFeesUsd,
            otherSliderCost: result.otherSliderCost,
            marketingCost: result.marketingCost,
            serviceCost: result.serviceCost,
            operationsCost: result.operationsCost,
            customerServiceCost: result.customerServiceCost,
            maintenanceCost: result.maintenanceCost,
            insuranceCost: result.insuranceCost,
            depreciation: result.depreciation,
            interest: result.interest,
            // Taxes & Government Levies bucket = corp tax + carbon
            // levy + passenger departure tax + fuel excise + S5
            // route-obligation fines. UI rolls these up into one row.
            taxesAndLevies:
              result.tax + result.carbonLevy +
              result.passengerTax + result.fuelExcise +
              result.obligationFinesUsd,
            obligationFinesUsd: result.obligationFinesUsd,
            netProfit: result.netProfit,
            brandPts: result.newBrandPts,
            opsPts: result.newOpsPts,
            loyalty: result.newLoyalty,
            brandValue: result.newBrandValue,
            },
          ],
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

          // Transition bot aircraft from "ordered" → "active" once a
          // quarter has passed since purchase. Earlier the bot ordered
          // a plane (status: ordered), then `planBotRoutes` filtered
          // for status: active and found nothing, so the plane sat
          // perpetually ordered and the bot never opened a single
          // route. Mirrors the player path at the close-quarter step
          // where the same transition runs for the player team.
          updated = {
            ...updated,
            fleet: updated.fleet.map((f) =>
              f.status === "ordered" && f.purchaseQuarter < s.currentQuarter
                ? { ...f, status: "active" as const }
                : f,
            ),
          };

          // Aircraft order — bot may add a fresh purchase or lease.
          // Now goes through the same lease/buy plumbing as the player
          // so deposits, lease term/buy-out residual, production caps
          // etc. are all respected. Bots that lease ineligible specs
          // silently fall back to buy.
          const order = planBotAircraftOrder(updated, t.botDifficulty, s.currentQuarter);
          if (order) {
            const spec = AIRCRAFT_BY_ID[order.specId];
            if (spec) {
              // Lease eligibility check — if the chosen acquisition is
              // lease but the spec isn't in the top-7/top-3 list, fall
              // back to buy so the bot still acts.
              let acquisitionType = order.acquisitionType;
              if (acquisitionType === "lease" && !canLeaseSpec(spec, AIRCRAFT, s.currentQuarter)) {
                acquisitionType = "buy";
              }
              // Cash check + lease economics (15% deposit) vs buy (full).
              const leaseTerms = leaseTermsFor(spec);
              const perPlaneCost = acquisitionType === "buy"
                ? spec.buyPriceUsd
                : leaseTerms.depositUsd;
              const totalCost = perPlaneCost * order.quantity;
              if (updated.cashUsd >= totalCost) {
                const newPlanes: FleetAircraft[] = Array.from({ length: order.quantity }, () => ({
                  id: mkId("ac"),
                  specId: order.specId,
                  status: "ordered",
                  acquisitionType,
                  purchaseQuarter: s.currentQuarter,
                  purchasePrice: acquisitionType === "buy" ? spec.buyPriceUsd : 0,
                  bookValue: acquisitionType === "buy" ? spec.buyPriceUsd : 0,
                  leaseQuarterly: acquisitionType === "lease" ? leaseTerms.perQuarterUsd : null,
                  leaseDepositUsd: acquisitionType === "lease" ? leaseTerms.depositUsd : undefined,
                  leaseTermEndsAtQuarter: acquisitionType === "lease"
                    ? s.currentQuarter + leaseTerms.termQuarters - 1
                    : undefined,
                  leaseBuyoutBasisUsd: acquisitionType === "lease" ? spec.buyPriceUsd : undefined,
                  ecoUpgrade: false,
                  ecoUpgradeQuarter: null,
                  ecoUpgradeCost: 0,
                  cabinConfig: "default",
                  routeId: null,
                  retirementQuarter: s.currentQuarter + 28,
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

          // Route openings — bot may start a few new routes from idle planes.
          // Each route's cargo/passenger flag is derived from the aircraft
          // family so cargo-only fleets create cargo routes automatically.
          //
          // The planner now sees the full team list as `rivals` so it
          // penalises saturated ODs (player + other bots already there)
          // and applies a yield filter to drop fuel-bleeders before
          // they're even considered. See planBotRoutes JSDoc.
          const routePlans = planBotRoutes(
            updated,
            t.botDifficulty,
            s.currentQuarter,
            s.teams.filter((tm) => tm.id !== t.id),
          );
          // Slot bid accumulator — when a bot opens a route, it must bid
          // for any slots it doesn't already hold at both endpoints. The
          // auction phase below this block will pick these up via
          // `pendingSlotBids` and clear them against the airport's pool,
          // so a bot that wants 14 slots/wk at JFK actually competes
          // with the player and other bots for capacity.
          const newBids: Record<string, { slots: number; price: number }> = {};
          // Track committed-by-existing-routes slots so multiple new
          // routes opened the same quarter accumulate correctly (a bot
          // opening 3 routes that all want JFK should bid for 3× capacity).
          const committedSlotsAtCode: Record<string, number> = {};
          for (const code of Object.keys(updated.airportLeases ?? {})) {
            committedSlotsAtCode[code] = 0;
            for (const rt of updated.routes) {
              if (rt.status !== "active" && rt.status !== "pending") continue;
              if (rt.originCode === code || rt.destCode === code) {
                committedSlotsAtCode[code] += rt.dailyFrequency * 7;
              }
            }
          }
          for (const rp of routePlans) {
            const dist = distanceBetween(rp.origin, rp.dest);
            const dailyFreq = Math.max(1 / 7, rp.weeklyFreq / 7);
            const ac = updated.fleet.find((f) => f.id === rp.aircraftId);
            const acSpec = ac ? AIRCRAFT_BY_ID[ac.specId] : undefined;
            const isCargo = acSpec?.family === "cargo";
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
              cargoRatePerTonne: null,
              status: "active",
              openQuarter: s.currentQuarter,
              avgOccupancy: 0,
              quarterlyRevenue: 0,
              quarterlyFuelCost: 0,
              quarterlySlotCost: 0,
              isCargo,
              consecutiveQuartersActive: 0,
              consecutiveLosingQuarters: 0,
            };
            // Compute slot deficit at both endpoints. Bots already get
            // ~30 free slots at popular destinations from team-factory,
            // so most early routes don't need bids; longer-tail routes
            // and growth runs into capacity and starts competing.
            const weeklyNeed = dailyFreq * 7;
            for (const code of [rp.origin, rp.dest]) {
              const held = updated.airportLeases?.[code]?.slots ?? 0;
              const used = committedSlotsAtCode[code] ?? 0;
              const deficit = Math.max(0, used + weeklyNeed - held);
              committedSlotsAtCode[code] = used + weeklyNeed;
              if (deficit > 0) {
                const cur = newBids[code];
                const price = botSlotBidPrice(t.botDifficulty, code);
                newBids[code] = {
                  slots: (cur?.slots ?? 0) + Math.ceil(deficit),
                  price: Math.max(cur?.price ?? 0, price),
                };
              }
            }
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
          // Append accumulated slot bids to the team's pendingSlotBids.
          // The auction phase below clears these vs the player's bids.
          if (Object.keys(newBids).length > 0) {
            const newPending = [...(updated.pendingSlotBids ?? [])];
            for (const code of Object.keys(newBids)) {
              const existing = newPending.find((b) => b.airportCode === code);
              if (existing) {
                existing.slots = Math.max(existing.slots, newBids[code].slots);
                existing.pricePerSlot = Math.max(existing.pricePerSlot, newBids[code].price);
              } else {
                newPending.push({
                  airportCode: code,
                  slots: newBids[code].slots,
                  pricePerSlot: newBids[code].price,
                  quarterSubmitted: s.currentQuarter,
                });
              }
            }
            updated = { ...updated, pendingSlotBids: newPending };
          }
          return updated;
        });

        // ── Bot scenario resolution ───────────────────────────────
        // Earlier bots silently ignored every board scenario — the
        // procedural leaderboard hid the impact, but the activity feed
        // showed zero bot decisions and the rival's flags/decisions
        // arrays stayed empty regardless of strategy. Now each bot
        // walks every scenario for the current quarter, picks an option
        // via `botPickScenarioOption(difficulty, scenarioId)`, applies
        // the immediate effect (cash, brand, ops, loyalty, setFlags),
        // and records the decision row so the audit trail reflects
        // their choices. Deferred / acquire / refinance effects are
        // not yet wired for bots — those need more plumbing and aren't
        // needed for the leaderboard signal.
        const scenariosThisQuarter = scenariosForQuarter(s.currentQuarter, getTotalRounds(s));
        const teamsAfterBotScenarios = teamsAfterBotTurns.map((t) => {
          if (!t.botDifficulty) return t;
          if (scenariosThisQuarter.length === 0) return t;
          let updated = { ...t, flags: new Set(t.flags) };
          const newDecisions: ScenarioDecision[] = [];
          for (const sc of scenariosThisQuarter) {
            // Skip if already decided (defensive — bots shouldn't have
            // decisions yet, but guards against double-apply on
            // snapshot/restore replays).
            if (updated.decisions.some(
              (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
            )) continue;
            // Walk eligible options — skip blocked-by-flags and
            // cargo-fleet-required options the bot can't satisfy.
            const eligible = sc.options.filter((o) => {
              if (o.blockedByFlags?.some((f) => updated.flags.has(f))) return false;
              if (o.requires === "cargo-fleet") {
                const hasCargo = updated.fleet.some(
                  (a) => a.status !== "retired" && AIRCRAFT_BY_ID[a.specId]?.family === "cargo",
                );
                if (!hasCargo) return false;
              }
              return true;
            });
            if (eligible.length === 0) continue;
            const preferredId = botPickScenarioOption(t.botDifficulty, sc.id);
            const picked = eligible.find((o) => o.id === preferredId) ?? eligible[0];
            // Apply immediate, simple effects only.
            const e = picked.effect;
            if (typeof e.cash === "number") {
              updated.cashUsd = Math.max(0, updated.cashUsd + e.cash);
            }
            if (typeof e.brandPts === "number") {
              updated.brandPts = Math.max(0, Math.min(100, updated.brandPts + e.brandPts));
            }
            if (typeof e.opsPts === "number") {
              updated.opsPts = Math.max(0, Math.min(100, updated.opsPts + e.opsPts));
            }
            if (typeof e.loyaltyDelta === "number") {
              updated.customerLoyaltyPct = Math.max(0, Math.min(100, updated.customerLoyaltyPct + e.loyaltyDelta));
            }
            if (e.setFlags) {
              for (const f of e.setFlags) updated.flags.add(f);
            }
            newDecisions.push({
              scenarioId: sc.id as ScenarioDecision["scenarioId"],
              optionId: picked.id,
              quarter: s.currentQuarter,
              lockInQuarters: 0,
              submittedAt: Date.now(),
            });
          }
          if (newDecisions.length > 0) {
            updated = { ...updated, decisions: [...updated.decisions, ...newDecisions] };
          }
          return updated;
        });

        // Replace s.teams reference for downstream rival processing
        Object.assign(s, { teams: teamsAfterBotScenarios });

        // ── Rival activity toast ─────────────────────────────
        // Help the player FEEL the bots — surface the single most
        // notable new rival route this quarter as a toast. Notable =
        // touches the player's hub or one of their secondary hubs
        // (head-on competition); falls back to the highest-demand
        // brand-new route if no head-on overlap. Limited to one toast
        // per quarter to avoid noise. Skipped in pure-solo runs (no
        // bot rivals).
        const playerForToast = s.teams.find((t) => t.isPlayer);
        if (playerForToast) {
          const playerHubs = new Set([
            playerForToast.hubCode,
            ...(playerForToast.secondaryHubCodes ?? []),
          ]);
          type Notable = { rival: Team; route: Route; score: number };
          const notable: Notable[] = [];
          for (const t of teamsAfterBotScenarios) {
            if (!t.botDifficulty) continue;
            for (const r of t.routes) {
              if (r.openQuarter !== s.currentQuarter) continue;
              if (r.status !== "active") continue;
              const headOn = playerHubs.has(r.originCode) || playerHubs.has(r.destCode);
              const dist = r.distanceKm;
              // Score: head-on competition wins; longer distances win
              // tiebreakers (more visible on map, more revenue impact).
              const score = (headOn ? 1_000_000 : 0) + dist;
              notable.push({ rival: t, route: r, score });
            }
          }
          notable.sort((a, b) => b.score - a.score);
          const top = notable[0];
          if (top) {
            const headOn =
              playerHubs.has(top.route.originCode) ||
              playerHubs.has(top.route.destCode);
            const weeklyFreq = Math.round(top.route.dailyFrequency * 7);
            // accent for head-on (tactical signal); info for routine
            const fn = headOn ? toast.accent : toast.info;
            fn(
              `${top.rival.name} opened ${top.route.originCode}↔${top.route.destCode}`,
              `${weeklyFreq}/wk · ${headOn ? "competing on your hub" : "expanding their network"}`,
            );
          }
        }

        // Strategy-driven rival quarter-close.
        // Each rival has a doctrine that shapes their revenue model:
        //   budget-expansion → high-volume low-margin
        //   premium-service  → low-volume high-margin (bigger fuel sensitivity)
        //   cargo-dominance → steady cargo revenue, low fuel sensitivity
        //   global-network  → connected passenger demand, balanced margin
        // Revenue/profit are generated procedurally so the leaderboard moves
        // believably without us simulating their full network.
        const fuelStress = Math.max(0, (s.fuelIndex - 100) / 100);  // 0 at index 100, 0.5 at 150
        const quarterMaturity = Math.min(1, (s.currentQuarter - 1) / 12);  // ramps up over Y1-Y3

        // ── Wave 3.3 — Rivals' hybrid economics ────────────
        // Earlier rival revenue was pure procedural (doctrine baseline ×
        // brand × maturity × noise) — completely decoupled from the
        // player's network. So if the player carpet-bombed every rival
        // hub with overlapping routes, the rival's leaderboard line
        // didn't twitch.
        //
        // Now we couple two ways:
        //   (a) Network overlap pressure  — a rival flying the same
        //       OD as the player loses revenue (player+rival split the
        //       OD pool). Endpoint-only overlap is a weaker signal.
        //   (b) Hub-slot dominance        — the more slots the player
        //       holds at the rival's primary hub, the more the rival
        //       gets squeezed at home base.
        const playerTeamForRivals = s.teams.find((t) => t.isPlayer);
        const playerActiveRoutes = playerTeamForRivals?.routes.filter(
          (rt) => rt.status === "active",
        ) ?? [];
        const playerOdSet = new Set<string>();
        const playerEndpointSet = new Set<string>();
        for (const rt of playerActiveRoutes) {
          playerOdSet.add(odKey(rt.originCode, rt.destCode));
          playerEndpointSet.add(rt.originCode);
          playerEndpointSet.add(rt.destCode);
        }

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
            case "global-network":
              baseRevenue = 36_000_000; marginPct = 0.095; fuelSensitivity = 0.85; break;
            case "safety-first":
              baseRevenue = 36_000_000; marginPct = 0.095; fuelSensitivity = 0.85; break;
            default:
              baseRevenue = 34_000_000; marginPct = 0.08; fuelSensitivity = 1.0; break;
          }

          // Brand pts amplify revenue (50 brand = 1.0x, 80 = 1.15x, 100 = 1.25x)
          const brandMul = 0.85 + (r.brandPts / 100) * 0.4;
          const maturityMul = 1 + quarterMaturity * 0.45;

          // Network overlap signals — bind procedural revenue to the
          // rival's actual route list against the player's actual
          // routes. Skipped if the rival has no recorded routes (early
          // game / save migration).
          const rivalActiveRoutes = r.routes.filter((rt) => rt.status === "active");
          let directOverlap = 0;     // rival flies same OD as player
          let endpointOverlap = 0;   // rival just touches a player city
          for (const rt of rivalActiveRoutes) {
            const k = odKey(rt.originCode, rt.destCode);
            if (playerOdSet.has(k)) directOverlap += 1;
            else if (playerEndpointSet.has(rt.originCode) || playerEndpointSet.has(rt.destCode)) {
              endpointOverlap += 1;
            }
          }
          const totalRivalRoutes = Math.max(1, rivalActiveRoutes.length);
          const directShare = directOverlap / totalRivalRoutes;
          const endpointShare = endpointOverlap / totalRivalRoutes;
          // Direct overlap = strong pressure, endpoint = weak.
          // Capped so a player-everywhere strategy can't zero a rival.
          const overlapPenalty = Math.max(
            0.78,
            1 - directShare * 0.10 - endpointShare * 0.04,
          );

          // Hub-slot dominance — when the player holds more slots at
          // the rival's primary hub than the rival does themselves,
          // the rival gets squeezed at home (gates lost, peak waves
          // skewed). Capped at −12% even at 100% player dominance.
          let hubPenalty = 1.0;
          if (playerTeamForRivals && r.hubCode) {
            const playerSlots = playerTeamForRivals.airportLeases?.[r.hubCode]?.slots ?? 0;
            const rivalSlots = r.airportLeases?.[r.hubCode]?.slots ?? 0;
            const totalSlots = playerSlots + rivalSlots;
            if (totalSlots > 0) {
              const playerShare = playerSlots / totalSlots;
              hubPenalty = 1 - Math.min(0.12, playerShare * 0.20);
            }
          }

          // ── Wave 4 — Real route economics ──────────────────────
          // Earlier the rival's revenue/cost was 100% procedural and
          // their `route.quarterlyRevenue / quarterlyFuelCost / etc.`
          // fields stayed at 0 forever. Now we run computeRouteEconomics
          // on each of the rival's routes against the SAME engine the
          // player uses. Two consequences:
          //   (1) Rival route table data is real (occupancy, daily pax,
          //       per-route revenue, fuel) — facilitator console + the
          //       view-as-rival mode now show meaningful numbers.
          //   (2) Real route revenue replaces the procedural baseline
          //       once the rival has a non-trivial network. Procedural
          //       still applies in early game when route count is small,
          //       so the leaderboard doesn't flatline at quarter 1.
          const otherTeamsForEcon = s.teams.filter((tm) => tm.id !== r.id);
          const cargoPool = {
            hasBellyOD: new Set<string>(
              r.routes
                .filter((rt) => !rt.isCargo && rt.status === "active")
                .map((rt) => odKey(rt.originCode, rt.destCode)),
            ),
            hasFreighterOD: new Set<string>(
              r.routes
                .filter((rt) => rt.isCargo && rt.status === "active")
                .map((rt) => odKey(rt.originCode, rt.destCode)),
            ),
          };
          let realRouteRevenue = 0;
          let realRouteFuel = 0;
          let realRouteSlots = 0;
          const refreshedRoutes = r.routes.map((rt) => {
            if (rt.status !== "active") return rt;
            const econ = computeRouteEconomics(
              r,
              rt,
              s.currentQuarter,
              s.fuelIndex,
              otherTeamsForEcon,
              s.worldCupHostCode ?? null,
              s.olympicHostCode ?? null,
              cargoPool,
            );
            realRouteRevenue += econ.quarterlyRevenue;
            realRouteFuel += econ.quarterlyFuelCost;
            realRouteSlots += econ.quarterlySlotCost;
            return {
              ...rt,
              quarterlyRevenue: econ.quarterlyRevenue,
              quarterlyFuelCost: econ.quarterlyFuelCost,
              quarterlySlotCost: econ.quarterlySlotCost,
              avgOccupancy: econ.occupancy,
              consecutiveLosingQuarters:
                econ.quarterlyRevenue - econ.quarterlyFuelCost - econ.quarterlySlotCost < 0
                  ? rt.consecutiveLosingQuarters + 1
                  : 0,
              consecutiveQuartersActive: rt.consecutiveQuartersActive + 1,
            };
          });

          // Procedural baseline (unchanged math)
          const proceduralRevenue =
            baseRevenue * brandMul * maturityMul *
            (1 + personalityNoise) * overlapPenalty * hubPenalty;
          // Blend: lean on real route revenue once the rival has 4+
          // active routes (mature network); fade in over [0..4] route
          // count so early game still uses the procedural model.
          const networkSize = rivalActiveRoutes.length;
          const realWeight = Math.min(1, networkSize / 4);
          const blendedRevenue =
            realRouteRevenue * realWeight + proceduralRevenue * (1 - realWeight);

          // Lease + maintenance — every active aircraft costs money to
          // operate even when not flying. Lease quarterlies were never
          // deducted from rival cash before, so leased fleets ran free.
          // Maintenance is approx $200K per active narrowbody / $400K
          // wide / $300K freighter per quarter — light heuristic, not
          // the player's full 7-factor model, but enough to stop bots
          // from accumulating cash forever.
          let leaseAndMaintenance = 0;
          for (const f of r.fleet) {
            if (f.status !== "active") continue;
            if (f.acquisitionType === "lease" && f.leaseQuarterly) {
              leaseAndMaintenance += f.leaseQuarterly;
            }
            const spec = AIRCRAFT_BY_ID[f.specId];
            const seats = spec ? spec.seats.first + spec.seats.business + spec.seats.economy : 0;
            const maint =
              spec?.family === "cargo" ? 300_000 :
              seats > 250 ? 400_000 : 200_000;
            leaseAndMaintenance += maint;
          }

          const fuelDrag = fuelStress * fuelSensitivity * blendedRevenue * 0.18;
          const adjustedMargin = marginPct - fuelStress * 0.04;
          // Real route fuel/slot already capture some of this — when the
          // real path dominates, fold it in instead of stacking. We use
          // the real costs for the realWeight share and procedural
          // margin for the residual procedural share.
          const realCosts = realRouteFuel + realRouteSlots + leaseAndMaintenance;
          const proceduralCosts = proceduralRevenue * (1 - adjustedMargin) + fuelDrag;
          const blendedCosts = realCosts * realWeight + proceduralCosts * (1 - realWeight);
          const netProfit = blendedRevenue - blendedCosts;

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
            routes: refreshedRoutes,
            financialsByQuarter: [
              // Dedupe rivals' financials too so snapshot-restore +
              // re-close doesn't add a duplicate row on the rival
              // leaderboard chart.
              ...r.financialsByQuarter.filter((q) => q.quarter !== s.currentQuarter),
              {
                quarter: s.currentQuarter,
                cash: newCash,
                debt: r.totalDebtUsd,
                revenue: blendedRevenue,
                costs: blendedCosts,
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
        //
        // P0 fix: start the late-auction pool from `slotsAfterEarlyAuction`
        // not `s.airportSlots`. Otherwise capacity awarded in the early
        // auction is still "available" here and gets re-awarded.
        const slotsForAuction = { ...(slotsAfterEarlyAuction ?? {}) };
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

        // Fuel index drift — if next quarter has a fuel news event with
        // an explicit fuelIndexAtBaseline target, drift 70% of the way
        // toward that target plus a small random walk. Otherwise pure
        // random walk like before. This keeps the structured news as
        // the canonical fuel driver while preserving emergent variance.
        const nextQ = s.currentQuarter + 1;
        const fuelHint = newsFuelIndexHint(nextQ);
        const randomDrift = (Math.random() - 0.5) * 10;
        const newFuel = fuelHint != null
          ? s.fuelIndex + (fuelHint - s.fuelIndex) * 0.7 + randomDrift
          : s.fuelIndex + randomDrift;

        // Pre-order production batch — deliver up to per-spec cap from
        // the FIFO queue at quarter close, but only for specs that have
        // actually reached unlockQuarter. Pre-orders placed during the
        // announcement window (R-2) sit in the queue until unlock.
        const deliveriesToMake: PreOrder[] = [];
        const queuedNow = teamsWithAwards.length === 0
          ? s.preOrders
          : s.preOrders;
        const seenSpecs = new Set<string>();
        for (const order of queuedNow) {
          if (order.status !== "queued") continue;
          if (seenSpecs.has(order.specId)) continue;
          seenSpecs.add(order.specId);
          const spec = AIRCRAFT_BY_ID[order.specId];
          if (!spec) continue;
          // Only deliver from queue once spec has reached unlock — earlier
          // means the announcement window is open but production hasn't.
          if (s.currentQuarter < spec.unlockQuarter) continue;
          const cap = effectiveProductionCap(spec, s.productionCapOverrides);
          // Subtract anything already delivered this round (i.e. instant
          // walk-up orders fulfilled inline via orderAircraft).
          const alreadyThisRound = queuedNow.filter(
            (o) => o.specId === spec.id && o.deliveredAtQuarter === s.currentQuarter,
          ).length;
          const remainingCap = Math.max(0, cap - alreadyThisRound);
          if (remainingCap === 0) continue;
          const queueSlice = queuedForSpec(queuedNow, spec.id).slice(0, remainingCap);
          deliveriesToMake.push(...queueSlice);
        }
        const { newPreOrders: preOrdersAfterDelivery, teamUpdates: teamsAfterDelivery } =
          deliverPreOrders(s.preOrders, teamsWithAwards, deliveriesToMake, s.currentQuarter);
        if (deliveriesToMake.length > 0) {
          // Group by team for one toast per team.
          const byTeam = new Map<string, number>();
          for (const o of deliveriesToMake) {
            byTeam.set(o.teamId, (byTeam.get(o.teamId) ?? 0) + 1);
          }
          const playerCount = byTeam.get(s.playerTeamId ?? "") ?? 0;
          if (playerCount > 0) {
            toast.success(
              `${playerCount} aircraft delivered from queue`,
              `Balance charged · arriving Q${s.currentQuarter + 1}`,
            );
          }
        }

        // Base interest rate follows the BASE_RATE_BY_QUARTER macro
        // schedule (mirrors TRAVEL_INDEX). Earlier the rate was
        // hardcoded at 3.5% for the whole campaign so debt service
        // never moved with world events. The schedule covers cheap
        // 2015–17 debt, the 2022–23 hiking cycle, etc., so a heavily
        // leveraged airline genuinely struggles when the cycle turns.
        const newBaseRate = effectiveBaseRatePct(nextQ);
        const clampedFuel = Math.max(50, Math.min(220, newFuel));

        // Persist the closing-quarter snapshot of the three macro
        // indices so the Reports tab can chart fuel / travel / base
        // rate over the campaign. Append-once-per-quarter; on
        // snapshot-restore the dedup-on-push pattern keeps the array
        // monotonic.
        const newMarketHistory = [
          ...(s.marketHistory ?? []).filter((m) => m.quarter !== s.currentQuarter),
          {
            quarter: s.currentQuarter,
            fuelIndex: s.fuelIndex,
            travelIndex: effectiveTravelIndex(s.currentQuarter),
            baseRatePct: s.baseInterestRatePct,
          },
        ];

        // Snapshot leaderboard rank + airline value into every team's
        // just-closed financialsByQuarter row. Lets the Leaderboard
        // panel show Q/Q rank movement (▲ delta) without re-deriving
        // historical rank from cash/brand alone. Sort by airline
        // value desc; ties resolved arbitrarily by team id for
        // determinism across closes.
        const rankedTeams = [...teamsAfterDelivery]
          .map((t) => ({ id: t.id, av: computeAirlineValue(t) }))
          .sort((a, b) => b.av - a.av || a.id.localeCompare(b.id));
        const rankById = new Map<string, number>();
        const avById = new Map<string, number>();
        rankedTeams.forEach((r, i) => {
          rankById.set(r.id, i + 1);
          avById.set(r.id, r.av);
        });
        const teamsWithRank = teamsAfterDelivery.map((t) => {
          const lastIdx = t.financialsByQuarter.length - 1;
          if (lastIdx < 0) return t;
          const lastRow = t.financialsByQuarter[lastIdx];
          if (lastRow.quarter !== s.currentQuarter) return t;
          return {
            ...t,
            financialsByQuarter: [
              ...t.financialsByQuarter.slice(0, lastIdx),
              {
                ...lastRow,
                rank: rankById.get(t.id),
                airlineValue: avById.get(t.id),
              },
            ],
          };
        });

        set({
          teams: teamsWithRank,
          cargoContracts: updatedCargoContracts,
          lastCloseResult: result,
          phase: "quarter-closing",
          airportSlots: slotsAfterAuction,
          fuelIndex: clampedFuel,
          baseInterestRatePct: newBaseRate,
          preOrders: preOrdersAfterDelivery,
          marketHistory: newMarketHistory,
        });
      },

      advanceToNext: () => {
        const s = get();
        // Phase 3: respect the configured totalRounds so 8 / 16 / 24
        // round games end at their configured stop, not always at 40.
        const totalRounds = getTotalRounds(s);
        if (s.currentQuarter >= totalRounds) {
          set({ phase: "endgame", lastCloseResult: null });
          toast.accent("Final round complete", "Your legacy is sealed.");
          return;
        }
        const nextQ = s.currentQuarter + 1;

        // PRD G4 — 787 Dreamliner delivery delay event.
        // 787-8 unlocks at round 12 (Q4 2017). The delay event fires at
        // round 13 (Q1 2018) and pushes any round-12 orders to round 15
        // (Q3 2018) — a 3-round slip, matching the master reference doc:
        //   R12 → R15 ("first delayed deliveries finally arrive").
        // The R13 delay news + R15 delivery confirmation news already
        // ship in src/data/world-news.ts.
        let delayedTeams = s.teams;
        if (nextQ === 13) {
          let delayedCount = 0;
          delayedTeams = s.teams.map((t) => ({
            ...t,
            fleet: t.fleet.map((f) => {
              if (f.specId === "B787-8" && f.status === "ordered" && f.purchaseQuarter === 12) {
                delayedCount += 1;
                return { ...f, purchaseQuarter: 15 };
              }
              return f;
            }),
          }));
          if (delayedCount > 0) {
            toast.warning(
              `Boeing 787 Dreamliner delivery delay`,
              `${delayedCount} aircraft pushed back to R15 due to manufacturing issues`,
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
        const { slots: postYearlyTick, ticked } = applyYearlyTickIfDue(
          s.airportSlots ?? {},
          nextQ,
        );
        if (ticked) {
          toast.accent(
            `New airport slots open · Year ${Math.ceil(nextQ / 4)}`,
            "Submit bids in the Slot Market. Winners announced at quarter close.",
          );
        }

        // Government-funded airport upgrades (Sprint 11 / 11 airports
        // Q14–Q30). Each fires only if the airport is still UNOWNED at
        // its scheduled quarter; player-owned airports skip the auto-
        // upgrade and rely on the player-funded +200 expansion path.
        let tickedSlots = postYearlyTick;
        const upgradesThisQuarter = AIRPORT_UPGRADES_BY_QUARTER[nextQ] ?? [];
        const upgradesApplied: AirportGovernmentUpgrade[] = [];
        for (const upgrade of upgradesThisQuarter) {
          const cur = tickedSlots[upgrade.airportCode];
          const cityTier = (CITIES_BY_CODE[upgrade.airportCode]?.tier ?? 4);
          const { slotState: nextState, applied } =
            applyGovernmentUpgrade(cur, upgrade, cityTier);
          if (applied) {
            tickedSlots = { ...tickedSlots, [upgrade.airportCode]: nextState };
            upgradesApplied.push(upgrade);
          }
        }
        if (upgradesApplied.length > 0) {
          const names = upgradesApplied.map((u) => u.airportCode).join(", ");
          toast.accent(
            `Airport expansion: ${names}`,
            "Government-funded upgrade complete — new slots and demand uplift live this quarter.",
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
              // Preserve fractional daily — see the early-activation
              // path above for the rationale.
              dailyFrequency: Math.max(1 / 7, effectiveWeekly / 7),
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

        // Clear every team's readyForNextQuarter flag — the cohort is
        // now in a fresh round, so the next auto-advance gate has to
        // be re-met from scratch. Without this, multiplayer self-guided
        // games would auto-fire closeQuarter again on the very next
        // setActiveTeamReady() call (since flags would still be true).
        const teamsWithReadyCleared = teamsWithPendingResolved.map((t) =>
          t.readyForNextQuarter ? { ...t, readyForNextQuarter: false } : t,
        );

        set({
          teams: teamsWithReadyCleared,
          currentQuarter: nextQ,
          phase: "playing",
          lastCloseResult: null,
          airportSlots: tickedSlots,
          // Reset quarter timer for next cycle
          quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining !== null ? 1800 : null,
          quarterTimerPaused: false,
        });

        // Auto-snapshot at the start of every new round. Stored in a
        // separate localStorage namespace so the facilitator can roll
        // back, re-sync disconnected players, or export an archive
        // copy of any past round. Saving AFTER the set() above means
        // the snapshot represents the freshly-advanced state — i.e.
        // "the game at the start of round nextQ". One snapshot per
        // round (re-saving same round overwrites).
        try {
          get().saveQuarterSnapshot();
        } catch (err) {
          // Auto-save must never break the game flow. Surface a
          // soft warning if it failed but keep the round advancing.
          console.error("[snapshots] auto-save failed", err);
          toast.warning(
            "Save failed",
            "Could not write a snapshot for this round. Game continues.",
          );
        }

        // ── Multiplayer state write-back ─────────────────────
        // When the game is bound to a server-side gameId, push the
        // freshly-advanced state to /api/games/state-update with
        // optimistic concurrency. The server stores the new state
        // JSON + bumps the row's version atomically. On stale-state
        // conflict (someone else's close landed first) we log a
        // warning and rely on the next /api/games/load to bring this
        // browser back in sync — the engine doesn't unwind the
        // local close. Solo runs and runs without session.gameId
        // skip this entirely.
        get().pushStateToServer("game.quarterClosed", {
          fromQuarter: s.currentQuarter,
          toQuarter: nextQ,
        });

        // Player-facing label: "Round 13/N" headline with the calendar
        // quarter as the detail line. N comes from the game's session
        // (8 / 16 / 24 / 40) so short-format cohorts see the right total.
        toast.accent(
          `Round ${nextQ}/${getTotalRounds(s)}`,
          fmtQuarter(nextQ),
        );
      },

      setActiveTeam: (teamId) => {
        const s = get();
        if (!s.teams.some((t) => t.id === teamId)) return;
        set({ playerTeamId: teamId });
      },

      setAirlineColor: (colorId: AirlineColorId) => {
        const s = get();
        if (s.isObserver) return;
        const meId = s.activeTeamId ?? s.playerTeamId;
        if (!meId) return;
        set({
          teams: s.teams.map((t) =>
            t.id === meId ? { ...t, airlineColorId: colorId } : t,
          ),
        });
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
        const trimmedName = companyName.trim();
        if (!trimmedName) {
          return { ok: false, error: "Pick a company name." };
        }

        // ── Reconnect path ─────────────────────────────────────
        // If a seat is already claimed under THIS company name, treat
        // the join as a reconnect. We don't allocate a new team —
        // just pivot `playerTeamId` so this browser binds back to
        // the existing team. This is what fixes the "I refreshed and
        // lost my airline" scenario.
        const existingSeat = s.sessionSlots.find(
          (x) => x.claimed && x.companyName?.toLowerCase() === trimmedName.toLowerCase(),
        );
        if (existingSeat && existingSeat.teamId) {
          const team = s.teams.find((t) => t.id === existingSeat.teamId);
          if (team) {
            set({ playerTeamId: team.id });
            toast.accent("Reconnected", `Welcome back, ${team.name}.`);
            return { ok: true };
          }
          // Seat record exists but team is missing → corrupted state.
          // Fall through and let them claim a fresh seat below.
        }

        // ── Lock check (after reconnect path so existing players
        //    can always rejoin even when locked) ──
        if (s.sessionLocked) {
          return {
            ok: false,
            error: "Session is locked — no new seats can be claimed. Use the company name you joined with originally to reconnect.",
          };
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
        // Reject duplicate names — a new player can't use a company
        // name that's already in use (other than via the reconnect
        // path above, which short-circuits earlier).
        if (s.teams.some((t) => t.name.toLowerCase() === trimmedName.toLowerCase())) {
          return {
            ok: false,
            error: `"${trimmedName}" is already taken in this session. Pick a different name, or — if you're rejoining — use the exact name you joined with originally.`,
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
          // Multiplayer-aware fields. The legacy /join flow doesn't
          // know about the new `localSessionId` yet — Step 5 will wire
          // it through. For now claimedBySessionId stays null and
          // `displayName` carries the company name as the visible label.
          controlledBy: "human",
          claimedBySessionId: null,
          playerDisplayName: companyName.trim(),
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
          timedModifiers: [],
          routeObligations: [],
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
        // Clear the milestone-shown ledger so a fresh game's first
        // close lights up the relevant milestones again instead of
        // suppressing them as "already seen".
        // Clear the milestone-shown ledger so fresh milestones show again.
        if (typeof window !== "undefined") {
          try { window.localStorage.removeItem("skyforce:milestonesShown:v1"); } catch {}
        }
        // Active-game redirect is now handled via Supabase (game_members
        // table) — no localStorage key to clear.
        set({
          phase: "idle",
          currentQuarter: 1,
          fuelIndex: 100,
          baseInterestRatePct: 5.5, // Q1 2015 baseline (BASE_RATE_BY_QUARTER)
          teams: [],
          playerTeamId: null,
          activeTeamId: null,
          session: null,
          isMultiplayerSession: false,
          isObserver: false,
          lastCloseResult: null,
          quarterTimerSecondsRemaining: null,
          quarterTimerPaused: false,
          secondHandListings: [],
          cargoContracts: [],
          airportSlots: {},
          airportBids: [],
          sessionCode: null,
          sessionLocked: false,
          sessionSlots: [],
          preOrders: [],
          productionCapOverrides: {},
        });
      },

      // ── Multiplayer-aware ready flag ─────────────────────────
      // In self-guided runs each team flips this when they're done
      // configuring the next quarter. The engine advances when
      // allActiveTeamsReady() returns true. In facilitated runs the
      // flag is informational — facilitator console reads it to see
      // who's submitted but the close button still drives.
      //
      // Auto-advance: if THIS flip is the one that completes the cohort
      // (every human team now ready) AND the run is in self_guided
      // mode, fire closeQuarter() so the round advances without anyone
      // having to press a separate button. Solo runs skip the auto
      // path entirely (only one human team — they already pressed Next
      // Quarter to flip ready). Facilitated runs also skip — the
      // facilitator drives close.
      setActiveTeamReady: (ready) => {
        const s = get();
        if (s.isObserver) return;
        const meId = s.activeTeamId ?? s.playerTeamId;
        if (!meId) return;
        set({
          teams: s.teams.map((t) =>
            t.id === meId ? { ...t, readyForNextQuarter: ready } : t,
          ),
        });
        // Re-evaluate after the set so allActiveTeamsReady reads the
        // fresh team list. Only fire auto-advance when:
        //   - the flip was a "true" (player marked ready, not unmarked)
        //   - the game is multiplayer self-guided (session.mode)
        //   - more than one human team exists (solo doesn't auto-advance)
        //   - all human teams are now ready
        if (!ready) return;
        const after = get();
        const session = after.session;
        if (!session || session.mode !== "self_guided") return;
        const humans = after.teams.filter((t) => t.controlledBy === "human");
        if (humans.length < 2) return;
        if (!humans.every((t) => t.readyForNextQuarter === true)) return;
        // All humans ready — auto-close. The engine handles the rest
        // of the round close (procedural rivals, slot auctions, etc).
        get().closeQuarter();
      },

      allActiveTeamsReady: () => {
        const s = get();
        // Only humans count for the ready-gate. Bots fill empty
        // seats but don't have a "ready" decision to make — they
        // act in their own quarter-close hook.
        const humans = s.teams.filter((t) => t.controlledBy === "human");
        if (humans.length === 0) return false;
        return humans.every((t) => t.readyForNextQuarter === true);
      },

      // ── Quarter snapshots (V1.5: rollback + reconnect resync) ──
      saveQuarterSnapshot: () => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        const ctx = player
          ? `${s.teams.length} team${s.teams.length === 1 ? "" : "s"} · ${player.code} ${fmtMoneyPlain(player.cashUsd)}`
          : `${s.teams.length} team${s.teams.length === 1 ? "" : "s"}`;
        // Build the same payload shape that the persist's `partialize`
        // returns so a restore is byte-compatible with the rehydration
        // pipeline. flags get serialized as arrays (Sets don't survive
        // JSON), matching the partialize convention.
        const persistPayload = {
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
          airportBids: s.airportBids,
          worldCupHostCode: s.worldCupHostCode,
          olympicHostCode: s.olympicHostCode,
          sessionCode: s.sessionCode,
          sessionLocked: s.sessionLocked,
          sessionSlots: s.sessionSlots,
          preOrders: s.preOrders,
          productionCapOverrides: s.productionCapOverrides,
        };
        snapSave({
          quarter: s.currentQuarter,
          state: persistPayload,
          contextLabel: ctx,
          quarterLabel: fmtQuarter(s.currentQuarter),
          teamCount: s.teams.length,
        });
      },

      restoreQuarterSnapshot: (snapshotId) => {
        const payload = snapLoad(snapshotId);
        if (!payload) {
          return { ok: false, error: "Snapshot not found or unreadable." };
        }
        // The state shape matches the persist partialize, so we can
        // apply it via the same rehydration path the store already
        // uses. We do an in-place merge into the live store + run the
        // post-rehydrate fixups (flag Set conversion, slot backfill,
        // etc) by invoking a fresh hydrate.
        type Persisted = ReturnType<typeof get>;
        const restored = payload.state as Partial<Persisted>;
        try {
          // Convert flags arrays → Sets on each team (mirror of the
          // onRehydrateStorage hook, since we're skipping Zustand's
          // built-in rehydrate for this in-place restore).
          const teams = (restored.teams ?? []).map((t) => ({
            ...t,
            flags: new Set(
              Array.isArray(t.flags) ? t.flags : Array.from(t.flags ?? []),
            ),
          }));
          set({
            ...restored,
            teams,
            // Reset transient UI state — a restore is a hard reload of
            // the campaign, not a continuation.
            lastCloseResult: null,
            phase: restored.phase === "endgame" ? "endgame" : "playing",
          } as Partial<Persisted>);
          toast.accent(
            "Snapshot restored",
            `Game rolled back to ${fmtQuarter((restored as { currentQuarter?: number }).currentQuarter ?? 1)}.`,
          );
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "Restore failed",
          };
        }
      },

      deleteQuarterSnapshot: (id) => {
        snapDelete(id);
      },

      // ── Multiplayer hydrate ──────────────────────────────────
      // Server-authoritative state lands here when /games/[gameId]/play
      // hydrates on initial paint or after a remote mutation. The
      // shape mirrors the persist `partialize` payload so we can reuse
      // the rehydrate fixups (flag Set conversion, slot pool backfill)
      // that already exist for localStorage rehydration. ActiveTeamId
      // is set from whichever team has `claimedBySessionId === my
      // sessionId`; if no claim is found we leave activeTeamId null
      // and the player lands in spectator-y view-only mode (still
      // valuable for facilitators dropping in mid-game).
      hydrateFromServerState: ({ stateJson, mySessionId }) => {
        if (!stateJson || typeof stateJson !== "object") {
          return { ok: false, error: "Empty or invalid state payload." };
        }
        const restored = stateJson as Partial<GameStore> & {
          teams?: Array<Team & { flags?: string[] | Set<string> }>;
        };
        if (!Array.isArray(restored.teams) || restored.teams.length === 0) {
          return { ok: false, error: "State has no teams — game not yet seeded." };
        }
        if (typeof restored.currentQuarter !== "number") {
          return { ok: false, error: "State has no currentQuarter — game not yet started." };
        }
        try {
          // Mirror the onRehydrateStorage hook: flags arrays → Sets.
          const teams = restored.teams.map((t) => ({
            ...t,
            flags: new Set<string>(
              Array.isArray(t.flags)
                ? t.flags
                : t.flags
                  ? Array.from(t.flags)
                  : [],
            ),
          })) as Team[];

          // Bind activeTeamId to whichever team this session has claimed.
          // sessionId is always user.id (Supabase auth — real or anonymous),
          // so a single equality check is sufficient.
          const claimed = teams.find(
            (t) => t.claimedBySessionId === mySessionId,
          );
          const activeTeamId = claimed?.id ?? null;
          // Mirror activeTeamId into playerTeamId so the 75+ panel
          // surfaces that still read selectPlayer (legacy) resolve
          // to the same team. This is safe in multiplayer because
          // playerTeamId only drives "you" highlighting from THIS
          // browser's perspective; other browsers hydrate with their
          // own claim. Step 7 sweep migrated the critical surfaces
          // (TopBar, leaderboard, admin) but the panels still rely
          // on the legacy field.
          const playerTeamId = activeTeamId ?? restored.playerTeamId ?? null;

          set({
            ...restored,
            teams,
            activeTeamId,
            playerTeamId,
            // Store the authenticated session ID so pushStateToServer
            // can use it as actorSessionId without touching localStorage.
            localSessionId: mySessionId,
            // Reset transient UI — a fresh hydrate is a hard reload
            // of the campaign, not a continuation of a paused close.
            lastCloseResult: null,
            phase: restored.phase === "endgame" ? "endgame" : "playing",
            // Flag this browser as being in a multiplayer session.
            // The custom persist storage checks this flag and refuses to
            // write to the solo save slot, so solo saves are never
            // overwritten by multiplayer state.
            isMultiplayerSession: true,
            // No claimed team = Game Master / facilitator. All mutation
            // actions check this flag and return early so the GM can
            // spectate without accidentally changing any team's state.
            isObserver: !claimed,
          } as Partial<GameStore>);
          return { ok: true };
        } catch (err) {
          return {
            ok: false,
            error: err instanceof Error ? err.message : "Hydrate failed",
          };
        }
      },

      pushStateToServer: (eventType, eventPayload) => {
        const s = get();
        // Game Master is observer-only — never write state on their behalf.
        if (s.isObserver) return Promise.resolve({ ok: true as const });
        const session = s.session;
        // Solo runs (no session) and runs that haven't been bound to a
        // server-side gameId skip the write-back entirely. Returning
        // here is a no-op — the local engine has already advanced.
        if (!session?.gameId) return Promise.resolve({ ok: true as const });
        // Use the authenticated Supabase user.id stored during hydration.
        // This is always server-side identity — never a localStorage UUID.
        const sessionId = s.localSessionId;
        if (!sessionId) return Promise.resolve({ ok: true as const });
        const actorTeamId = s.activeTeamId ?? s.playerTeamId ?? undefined;

        // Build a partialize-compatible payload mirroring the persist
        // shape so a downstream `hydrateFromServerState` re-load lands
        // byte-equivalent. Sets are serialized as arrays (JSON-safe).
        const stateJson = {
          phase: s.phase,
          currentQuarter: s.currentQuarter,
          fuelIndex: s.fuelIndex,
          baseInterestRatePct: s.baseInterestRatePct,
          teams: s.teams.map((t) => ({
            ...t,
            flags: Array.from(t.flags) as unknown as Set<string>,
          })),
          playerTeamId: s.playerTeamId,
          activeTeamId: s.activeTeamId,
          quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining,
          quarterTimerPaused: s.quarterTimerPaused,
          secondHandListings: s.secondHandListings,
          cargoContracts: s.cargoContracts,
          airportSlots: s.airportSlots,
          airportBids: s.airportBids,
          worldCupHostCode: s.worldCupHostCode,
          olympicHostCode: s.olympicHostCode,
          sessionCode: s.sessionCode,
          sessionLocked: s.sessionLocked,
          sessionSlots: s.sessionSlots,
          preOrders: s.preOrders,
          productionCapOverrides: s.productionCapOverrides,
          // Mirror the session block forward so subsequent hydrates
          // pick up the bumped version + any session metadata changes.
          session: { ...session, version: session.version + 1 },
        };

        if (typeof fetch === "undefined") return Promise.resolve({ ok: true as const });
        const expectedVersion = session.version;
        const gameId = session.gameId;

        // Phase 4.1: returns a Promise so callers that want to await
        // (closeQuarter especially) can do so. Existing fire-and-forget
        // callers (open route, set sliders, etc.) continue to ignore
        // the return value and operate optimistically. On 409 we
        // auto-refetch the authoritative state via /api/games/load
        // and hydrate locally — the user gets a clear toast that
        // their last action was overridden by the cohort's lead and
        // a hint to retry.
        return fetch("/api/games/state-update", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            gameId,
            expectedVersion,
            newState: stateJson,
            // actorSessionId is server-derived (Phase 1 hardening),
            // but we still ship it for the audit log fallback when
            // the cookie session is missing in dev.
            actorSessionId: sessionId,
            actorTeamId,
            eventType,
            eventPayload,
          }),
        })
          .then(async (res) => {
            if (res.ok) {
              const cur = get();
              if (cur.session?.gameId === gameId) {
                set({
                  session: { ...cur.session, version: cur.session.version + 1 },
                });
              }
              return { ok: true as const };
            }
            const json = await res.json().catch(() => ({}));
            if (res.status === 409) {
              console.warn(
                `[state-update] stale write — server rejected event ${eventType}. ` +
                  `Auto-refetching authoritative state.`,
              );
              // Refetch + hydrate so this browser snaps to the cohort's
              // canonical state. The local mutation is lost; the user
              // sees a clear toast and retries.
              try {
                const loadRes = await fetch(
                  `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
                  { cache: "no-store" },
                );
                if (loadRes.ok) {
                  const loadJson = await loadRes.json();
                  if (loadJson?.state?.state_json) {
                    get().hydrateFromServerState({
                      stateJson: loadJson.state.state_json,
                      mySessionId: sessionId,
                    });
                  }
                }
              } catch (refetchErr) {
                console.warn("[state-update] refetch after 409 failed:", refetchErr);
              }
              toast.warning(
                "Game state out of sync",
                "The cohort advanced before your action landed. We've pulled the latest state — please retry your action.",
              );
              return { ok: false as const, error: "stale state", status: 409 };
            }
            console.warn(
              `[state-update] failed (${res.status}) on event ${eventType}:`,
              json.error,
            );
            return { ok: false as const, error: json.error ?? "Server error", status: res.status };
          })
          .catch((err) => {
            console.warn(`[state-update] network error on event ${eventType}:`, err);
            return { ok: false as const, error: err instanceof Error ? err.message : "Network error" };
          });
      },

      rebroadcastSessionCode: () => {
        // Generate a fresh 4-digit code — keeps the seat list intact
        // so disconnected players can rebind by company name without
        // losing their team data.
        const code = String(Math.floor(1000 + Math.random() * 9000));
        set({ sessionCode: code, sessionLocked: false });
        toast.accent("Session code reissued", `New code: ${code}`);
        return { code };
      },

      setSessionLocked: (locked) => {
        set({ sessionLocked: locked });
      },

      // ── Fuel Storage (PRD E2) ──────────────────────────────
      buyFuelTank: (size) => {
        const s = get();
        const player = s.teams.find((t) => t.id === s.playerTeamId);
        if (!player) return { ok: false, error: "No player" };
        if (typeof size !== "string" || !["small", "medium", "large"].includes(size))
          return { ok: false, error: "Invalid tank size" };
        const specs = {
          small:  { cost: 3_000_000,  capacity: 25_000_000 },
          medium: { cost: 8_000_000,  capacity: 75_000_000 },
          large:  { cost: 15_000_000, capacity: 150_000_000 },
        } as const;
        const spec = specs[size as "small" | "medium" | "large"];
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
        if (typeof litres !== "number" || !Number.isFinite(litres) || litres <= 0)
          return { ok: false, error: "Invalid litres amount" };
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
        const bulkPrice = (s.fuelIndex / 100) * FUEL_BASELINE_USD_PER_L * 0.75; // 25% discount
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
        if (typeof litres !== "number" || !Number.isFinite(litres) || litres <= 0)
          return { ok: false, error: "Invalid litres amount" };
        if (litres > player.fuelStorageLevelL)
          return { ok: false, error: `Only ${(player.fuelStorageLevelL / 1_000_000).toFixed(1)}M L in storage` };
        const sellPrice = (s.fuelIndex / 100) * FUEL_BASELINE_USD_PER_L * 0.75;
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
        // Pull the floor from the canonical slot-price table in
        // slots.ts so this validation never drifts again. Previously
        // hard-coded numbers here were stuck at the pre-rebalance
        // T1=$120K / T2=$80K and rejected bids that the auction
        // engine would happily clear at the new $45K / $30K floor.
        const basePrice = BASE_SLOT_PRICE_BY_TIER[city.tier as 1 | 2 | 3 | 4];
        if (pricePerSlot < basePrice)
          return { ok: false, error: `Minimum $${(basePrice / 1_000).toFixed(0)}K/slot at Tier ${city.tier}` };
        const maxCost = slots * pricePerSlot;
        if (player.cashUsd < maxCost) {
          // The auction holds the maximum bid in escrow until close —
          // we need real cash, not borrowing headroom. Explain WHY +
          // what to do, especially when the player is in overdraft
          // (where "need $X cash" sounds like a paradox to them).
          const need = (maxCost / 1_000_000).toFixed(1);
          if (player.cashUsd < 0) {
            const overdraft = (-player.cashUsd / 1_000_000).toFixed(1);
            return {
              ok: false,
              error: `Slot auctions hold the bid in escrow until close. You're $${overdraft}M overdrawn, so there's no cash to lock up. Refinance your overdraft (Financials → Borrowing) or borrow $${need}M+ first, then come back and bid.`,
            };
          }
          const shortfall = ((maxCost - player.cashUsd) / 1_000_000).toFixed(1);
          return {
            ok: false,
            error: `Slot auctions hold the bid in escrow until close. Need $${need}M available cash; you're $${shortfall}M short. Borrow or trim spend before bidding.`,
          };
        }
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
        // Listing bounds: floor at 20% of book value (fire-sale clearance),
        // ceiling at 120% of the airframe's current new-build list price.
        // Earlier the floor was the full book value (no fire-sale possible)
        // and the ceiling was 1.5× book — both bounds tied to a single
        // depreciated number, which made hot models like in-shortage
        // 777Xs un-listable above their depreciated book even though the
        // secondary market would gladly bear a premium.
        const spec = AIRCRAFT_BY_ID[plane.specId];
        const minPrice = Math.round(plane.bookValue * 0.20);
        const maxPrice = Math.round((spec?.buyPriceUsd ?? plane.bookValue) * 1.20);
        if (askingPriceUsd < minPrice)
          return { ok: false, error: `Minimum ${fmtMoneyPlain(minPrice)} (20% of book)` };
        if (askingPriceUsd > maxPrice)
          return { ok: false, error: `Max ${fmtMoneyPlain(maxPrice)} (120% of market list price)` };
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
        // Log the exit in retiredHistory so the History panel under
        // Fleet shows when this airframe left the company. Proceeds
        // are recorded once the buyer actually clears, not at listing
        // time — but we book the listing event with the asking price
        // for audit purposes (overwritten on actual sale clearance).
        const specName = AIRCRAFT_BY_ID[plane.specId]?.name ?? plane.specId;
        set({
          secondHandListings: [...s.secondHandListings, listing],
          teams: s.teams.map((t) => t.id !== player.id ? t : {
            ...t,
            fleet: t.fleet.filter((f) => f.id !== aircraftId),
            routes: t.routes.map((r) => ({
              ...r,
              aircraftIds: r.aircraftIds.filter((id) => id !== aircraftId),
            })),
            retiredHistory: [
              ...(t.retiredHistory ?? []),
              {
                id: aircraftId,
                specId: plane.specId,
                specName,
                acquiredAtQuarter: plane.purchaseQuarter,
                exitQuarter: s.currentQuarter,
                exitReason: "sold" as const,
                proceedsUsd: askingPriceUsd,
                acquisitionType: plane.acquisitionType,
              },
            ],
          }),
        });
        toast.info(`Listed for sale: ${specName}`,
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
          retirementQuarter: s.currentQuarter + 28,
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
          s.currentQuarter,
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
          // Match submitDecision's lag/quarter resolution rules.
          const targetQuarter = typeof d.lagQuarters === "number"
            ? s.currentQuarter + d.lagQuarters
            : (d.quarter ?? s.currentQuarter + 1);
          updated.deferredEvents = [
            ...(updated.deferredEvents ?? []),
            {
              id: mkId("ev"),
              sourceScenario: scenarioId as ScenarioDecision["scenarioId"],
              sourceOption: newOptionId,
              targetQuarter,
              probability: d.probability ?? 1,
              effectJson: serializeEffect(d.effect),
              noteAtQueue: d.note ?? `${scenario.title} · Option ${newOptionId} (admin override)`,
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
          const scenariosThisQuarter = scenariosForQuarter(s.currentQuarter, getTotalRounds(s));
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
      // Custom storage that protects the solo save from being overwritten
      // while a multiplayer session is active. Multiplayer state is always
      // re-hydrated from the server on play-page load, so there is nothing
      // useful to persist locally for multiplayer. The solo save is never
      // touched by a multiplayer game, and multiple multiplayer games
      // never interfere with each other.
      storage: createJSONStorage(() => ({
        getItem: (name: string) => {
          try { return localStorage.getItem(name); } catch { return null; }
        },
        setItem: (name: string, value: string) => {
          try {
            // Check the isMultiplayerSession flag embedded in the
            // partialize payload. If true, silently skip the write so the
            // solo save is left untouched.
            const parsed = JSON.parse(value) as {
              state?: { isMultiplayerSession?: boolean };
            };
            if (parsed?.state?.isMultiplayerSession === true) return;
            localStorage.setItem(name, value);
          } catch { /* ignore */ }
        },
        removeItem: (name: string) => {
          try { localStorage.removeItem(name); } catch { /* ignore */ }
        },
      })),
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
        airportBids: s.airportBids,
        worldCupHostCode: s.worldCupHostCode,
        olympicHostCode: s.olympicHostCode,
        sessionCode: s.sessionCode,
        sessionLocked: s.sessionLocked,
        sessionSlots: s.sessionSlots,
        preOrders: s.preOrders,
        productionCapOverrides: s.productionCapOverrides,
        marketHistory: s.marketHistory,
        // Included so the custom storage setItem can read it and decide
        // whether to skip the write. Not used by onRehydrateStorage.
        isMultiplayerSession: s.isMultiplayerSession,
        isObserver: s.isObserver,
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
        // Backfill tournament hosts on older saves so the new event logic
        // has somewhere to fire. Picks neutral tier 1-2 cities not used
        // as a hub by any team.
        if (state.worldCupHostCode === undefined) state.worldCupHostCode = null;
        if (state.olympicHostCode === undefined) state.olympicHostCode = null;
        // Older saves predate the session-lock toggle. Default to false
        // so existing facilitated cohorts can keep accepting new joiners.
        if (state.sessionLocked === undefined) state.sessionLocked = false;
        // Pre-order queue + production cap overrides are new in
        // SkyForce post-master-ref. Older saves get empty arrays so
        // delivery batches and cancel-penalty paths run safely.
        if (!state.preOrders) state.preOrders = [];
        if (!state.productionCapOverrides) state.productionCapOverrides = {};
        // Airport bids (regulator approval flow) are post-Sprint-12.
        // Older saves get an empty array so the bid inbox doesn't
        // crash on `airportBids?.filter(...)` paths.
        if (!state.airportBids) state.airportBids = [];
        if (!state.worldCupHostCode || !state.olympicHostCode) {
          const allTeamHubs = new Set<string>();
          for (const t of state.teams ?? []) {
            allTeamHubs.add(t.hubCode);
            for (const sh of t.secondaryHubCodes ?? []) allTeamHubs.add(sh);
          }
          const candidates = CITIES
            .filter((c) => (c.tier === 1 || c.tier === 2) && !allTeamHubs.has(c.code))
            .map((c) => c.code);
          const pickRandom = (excl?: string | null) => {
            const pool = candidates.filter((c) => c !== excl);
            return pool.length === 0 ? null : pool[Math.floor(Math.random() * pool.length)];
          };
          if (!state.worldCupHostCode) state.worldCupHostCode = pickRandom();
          if (!state.olympicHostCode) state.olympicHostCode = pickRandom(state.worldCupHostCode);
        }
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
          // (Removed: the debug "+$900M Meridian Air cash grant" used during
          // initial purchase-flow validation. It would otherwise fire on
          // every fresh rehydrate of a save without that flag set.)
          return ({
          ...t,
          cashUsd: t.cashUsd,
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
            // Aircraft lifespan migration: legacy 20Q saves get an
            // 8-quarter extension on rehydrate so the 7-year lifespan
            // applies retroactively. Heuristic: if retirement is
            // exactly purchase+20, this is a legacy plane → bump it.
            // Newer purchases (28Q) and any custom values are left alone.
            const legacy20Q = f.retirementQuarter !== undefined
              && f.retirementQuarter === f.purchaseQuarter + 20;
            const fixedRetirement =
              f.retirementQuarter === undefined
                ? f.purchaseQuarter + 28
                : legacy20Q
                  ? f.retirementQuarter + 8
                  : f.retirementQuarter;
            return {
              ...f,
              retirementQuarter: fixedRetirement,
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
          timedModifiers: t.timedModifiers ?? [],
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
            cargoRatePerTonne: r.cargoRatePerTonne ?? null,
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

/** Legacy "the player team" selector — works when there's a single
 *  human at the table (solo runs). In multiplayer-aware code prefer
 *  `selectActiveTeam` which returns the team this BROWSER controls,
 *  not "the team flagged isPlayer at any point in the run."
 *
 *  Kept until Step 7 of the multiplayer rollout migrates the 30+
 *  callsites that still read it. */
export function selectPlayer(s: GameStore): Team | null {
  return s.teams.find((t) => t.id === s.playerTeamId) ?? null;
}

/** "You" — the team the local browser controls. In solo runs this
 *  matches selectPlayer(). In multiplayer it's whichever team the
 *  user claimed at /games/[id]/lobby (bound via activeTeamId).
 *  Falls back to the legacy playerTeamId if activeTeamId hasn't
 *  been set yet, so existing single-browser solo runs keep working
 *  without a save migration. */
export function selectActiveTeam(s: GameStore): Team | null {
  const id = s.activeTeamId ?? s.playerTeamId;
  if (!id) return null;
  return s.teams.find((t) => t.id === id) ?? null;
}

/** "The other teams" from this browser's perspective. Replaces
 *  `selectRivals` for multiplayer surfaces — in a 4-player lobby
 *  with one bot, this returns 3 teams (humans + bot), all of which
 *  are rivals from THIS browser's seat. Legacy `selectRivals`
 *  filtered on `!isPlayer` and worked only because exactly one
 *  team had isPlayer=true; in multiplayer every claimed seat is
 *  isPlayer-ish. */
export function selectOtherTeams(s: GameStore): Team[] {
  const meId = s.activeTeamId ?? s.playerTeamId;
  if (!meId) return s.teams;
  return s.teams.filter((t) => t.id !== meId);
}

/** @deprecated Use selectOtherTeams. Kept until Step 7 sweeps the
 *  TopBar / LeaderboardPanel / RoutesPanel call sites. */
export function selectRivals(s: GameStore): Team[] {
  return s.teams.filter((t) => !t.isPlayer);
}

/** True when the given team is "you" — single source of truth for
 *  badges, highlights, and write gates. Replaces `team.isPlayer`
 *  in multiplayer-aware UI. */
export function isActiveTeam(s: GameStore, teamId: string): boolean {
  const id = s.activeTeamId ?? s.playerTeamId;
  return id !== null && id === teamId;
}
