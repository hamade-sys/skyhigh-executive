/**
 * Shared starting-team factory.
 *
 * Replaces the inline init code that lived in `startNewGame` (solo
 * onboarding) and the hand-rolled team factory at `claimSeatFromCode`
 * (legacy /join page). Both now call `createInitializedTeamFromOnboarding`
 * so a player joining a multiplayer lobby gets the same starter
 * fleet, slots, Q1 snapshot, and brand application as a solo run.
 *
 * What this function does NOT do:
 *
 *   - Mutate the global game state. The caller (`startNewGame` or
 *     a server-side claim API route) is responsible for placing the
 *     team into `state.teams` and updating `playerTeamId` / the
 *     lobby seat.
 *   - Generate rivals. Rival cohort seeding stays in `startNewGame`
 *     because it depends on the chosen team count + hub-collision
 *     avoidance. A future "fill empty seats with bots" mutation
 *     will use a separate `createBotRival` factory.
 *
 * Design note: the function takes a single object instead of
 * positional args because the call sites have wildly different
 * arg sources (onboarding form, claimSeat API request body), and
 * a single shape lets each caller adapt without re-ordering.
 */

import { mkId } from "@/lib/id";
import { CITIES_BY_CODE } from "@/data/cities";
import {
  hubPriceUsd,
  ONBOARDING_TOTAL_BUDGET_USD,
} from "@/lib/hub-pricing";
import type {
  Team,
  FleetAircraft,
  DoctrineId,
  SliderLevel,
} from "@/types/game";
import type { AirlineColorId } from "@/lib/games/airline-colors";

export interface CreateInitializedTeamArgs {
  /** Airline display name. */
  airlineName: string;
  /** 2-3 letter IATA-style code. Used in route labels and the team
   *  card on the lobby/leaderboard. */
  code: string;
  /** Strategic doctrine chosen during onboarding. Drives engine
   *  multipliers (premium-service vs budget-expansion etc). */
  doctrine: DoctrineId;
  /** Origin airport — paid out of the $350M onboarding budget at
   *  the tier-priced rate (premium gateway $300M / T1 $200M /
   *  T2 $100M / T3 $50M). */
  hubCode: string;
  /** Hex color for map arcs. The caller picks from a palette
   *  (solo flow uses a fixed brand color; lobby flow rotates
   *  through 10 distinct rival colors). */
  color: string;

  // ── Onboarding profile (PRD §13.2) ───────────────────────
  tagline?: string;
  marketFocus?: Team["marketFocus"];
  geographicPriority?: Team["geographicPriority"];
  pricingPhilosophy?: Team["pricingPhilosophy"];
  salaryPhilosophy?: Team["salaryPhilosophy"];
  marketingLevel?: Team["marketingLevel"];
  csrTheme?: Team["csrTheme"];

  // ── Multiplayer-aware fields ──────────────────────────────
  /** "human" for player-claimed seats, "bot" for rival/AI seats.
   *  Defaults to "human" when omitted; the bot rival seeder calls
   *  this function with explicit "bot". */
  controlledBy?: "human" | "bot";
  /** Stable browser/session id of the claimer, when known. Used
   *  by panels/HUD to determine "you" via session match instead of
   *  the legacy `isPlayer` flag. Null in solo runs (the activeTeamId
   *  binding handles solo) and in bot rival creation. */
  claimedBySessionId?: string | null;
  /** Player's display name — usually equal to airlineName but kept
   *  separate so the lobby can show "Sarah K." next to the airline
   *  brand. Null for bots. */
  playerDisplayName?: string | null;

  /** Phase 9 — visual identity color id. Picked by the player at
   *  onboarding (humans) or assigned by the bot allocator (bots).
   *  When null, the team renders with `airlineColorFor({ fallbackKey })`
   *  derived from the team id — kept for legacy saves. */
  airlineColorId?: AirlineColorId | null;
}

/**
 * Build a fully-initialized `Team` ready to drop into game state.
 * The team carries:
 *
 *   - The onboarding-derived doctrine + brand profile
 *   - $350M starting budget minus the hub cost (per `hubPriceUsd`)
 *   - 50 brand pts, 50 ops pts, 50 customer loyalty (baseline)
 *   - 2× A320 starter fleet (active, ready to fly Q2)
 *   - 30 free slots at the hub's nearest popular destinations
 *     (per the HUB_STARTER_DESTINATIONS table below)
 *   - A Q1 financials backfill row so charts/sparklines render
 *     a real starting point instead of an empty axis
 *   - Sliders nudged from marketingLevel / salaryPhilosophy
 *
 * Also wires the multiplayer fields (`controlledBy`,
 * `claimedBySessionId`, `playerDisplayName`) and keeps the legacy
 * `isPlayer` flag in sync — `true` when controlledBy === "human",
 * `false` for bots — so the 30+ legacy callsites that still read
 * `isPlayer` continue to work through Step 7.
 */
export function createInitializedTeamFromOnboarding(
  args: CreateInitializedTeamArgs,
): Team {
  const controlledBy = args.controlledBy ?? "human";
  const isPlayer = controlledBy === "human";
  const code = args.code.trim().slice(0, 3).toUpperCase().padEnd(2, "X");

  // Hub-cost deduction. The same $350M onboarding budget the solo
  // flow uses; multiplayer claimers get the same starting position
  // so the leaderboard is fair.
  const hubCity = CITIES_BY_CODE[args.hubCode];
  const hubCost = hubCity ? hubPriceUsd(hubCity) : 0;
  const startingCash = ONBOARDING_TOTAL_BUDGET_USD - hubCost;

  // Slider nudges from the brand profile. These match what
  // startNewGame did inline before the extraction.
  const baseSliders = {
    staff: 2 as SliderLevel,
    marketing: 2 as SliderLevel,
    service: 2 as SliderLevel,
    rewards: 2 as SliderLevel,
    operations: 2 as SliderLevel,
    customerService: 2 as SliderLevel,
  };
  if (args.marketingLevel) {
    const lvl: Record<NonNullable<CreateInitializedTeamArgs["marketingLevel"]>, SliderLevel> = {
      low: 1, medium: 2, high: 3, aggressive: 4,
    };
    baseSliders.marketing = lvl[args.marketingLevel];
  }
  if (args.salaryPhilosophy) {
    baseSliders.staff =
      args.salaryPhilosophy === "below" ? 1 :
      args.salaryPhilosophy === "above" ? 3 : 2;
  }

  // Phase 5.2 — doctrine-aware starter fleet. Previously every player
  // (including cargo-dominance players + cargo-dominance bots) started
  // with 2× A320. A cargo-doctrine player thus had ZERO cargo aircraft
  // until Q3 — playing against their doctrine for the first two
  // quarters. The fix: cargo-dominance starts with 1× A320 (so they
  // can serve passenger routes from day one too) + 1× B737-300F
  // (so they can play cargo from Q1). Other doctrines retain the
  // legacy 2× A320 baseline. Bot rivals who pick cargo-dominance via
  // the random doctrine assignment also get the mixed starter.
  function starterTemplate(specId: string, price: number): FleetAircraft {
    return {
      id: mkId("ac"),
      specId,
      status: "active",
      acquisitionType: "buy",
      purchaseQuarter: 1,
      purchasePrice: price,
      bookValue: price,
      leaseQuarterly: null,
      ecoUpgrade: false,
      ecoUpgradeQuarter: null,
      ecoUpgradeCost: 0,
      cabinConfig: "default",
      routeId: null,
      retirementQuarter: 1 + 28,
      maintenanceDeficit: 0,
      satisfactionPct: 75,
    };
  }
  const starterFleet: FleetAircraft[] =
    args.doctrine === "cargo-dominance"
      ? [
          // 1 passenger workhorse for any narrowbody-range city pair
          starterTemplate("A320", 25_000_000),
          // 1 dedicated cargo plane that's available at Q1
          // (B737-300F: 18 tonnes capacity, narrowbody freighter).
          starterTemplate("B737-300F", 60_000_000),
        ]
      : [
          starterTemplate("A320", 25_000_000),
          starterTemplate("A320", 25_000_000),
        ];

  // Starter slot grants. Free 30 slots at the hub + 30 each at the
  // five nearest popular destinations. Lets the player open routes
  // in Q2 without waiting for the first auction.
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
  const starterDests = STARTER_DESTINATIONS_BY_HUB[args.hubCode] ??
    ["LHR", "JFK", "SIN", "CDG", "DXB"];
  const slotsByAirport: Record<string, number> = { [args.hubCode]: 50 };
  const airportLeases: Record<string, { slots: number; totalWeeklyCost: number }> = {
    [args.hubCode]: { slots: 50, totalWeeklyCost: 0 },
  };
  for (const dest of starterDests) {
    if (dest === args.hubCode) continue;
    slotsByAirport[dest] = 30;
    airportLeases[dest] = { slots: 30, totalWeeklyCost: 0 };
  }

  const team: Team = {
    id: mkId("team"),
    name: args.airlineName,
    code,
    color: args.color,
    hubCode: args.hubCode,
    secondaryHubCodes: [],
    doctrine: args.doctrine,
    isPlayer,
    controlledBy,
    claimedBySessionId: args.claimedBySessionId ?? null,
    playerDisplayName: args.playerDisplayName ?? (isPlayer ? args.airlineName : null),
    airlineColorId: args.airlineColorId ?? null,
    members: [
      { role: "CEO",  name: isPlayer ? "Your CEO"  : `${code} CEO`,  mvpPts: 0, cards: [] },
      { role: "CFO",  name: isPlayer ? "Your CFO"  : `${code} CFO`,  mvpPts: 0, cards: [] },
      { role: "CMO",  name: isPlayer ? "Your CMO"  : `${code} CMO`,  mvpPts: 0, cards: [] },
      { role: "CHRO", name: isPlayer ? "Your CHRO" : `${code} CHRO`, mvpPts: 0, cards: [] },
    ],
    tagline: args.tagline ?? "",
    marketFocus: args.marketFocus ?? "balanced",
    geographicPriority: args.geographicPriority ?? "global",
    pricingPhilosophy: args.pricingPhilosophy ?? "standard",
    salaryPhilosophy: args.salaryPhilosophy ?? "at",
    marketingLevel: args.marketingLevel ?? "medium",
    csrTheme: args.csrTheme ?? "none",
    cashUsd: startingCash,
    totalDebtUsd: 0,
    rcfBalanceUsd: 0,
    loans: [],
    taxLossCarryForward: [],
    insurancePolicy: "none",
    fleet: starterFleet,
    routes: [],
    decisions: [],
    deferredEvents: [],
    timedModifiers: [],
    routeObligations: [],
    flags: new Set<string>(),
    financialsByQuarter: [
      // Q1 brand-building snapshot — costs / revenue 0 because Q1 is
      // identity, not operations. Sparklines render an honest start.
      {
        quarter: 1,
        cash: startingCash,
        debt: 0,
        revenue: 0,
        costs: 0,
        netProfit: 0,
        brandPts: 50,
        opsPts: 50,
        loyalty: 50,
        brandValue: 50,
      },
    ],
    brandPts: 50,
    opsPts: 50,
    customerLoyaltyPct: 50,
    brandValue: 50,
    fuelTanks: { small: 0, medium: 0, large: 0 },
    fuelStorageLevelL: 0,
    fuelStorageAvgCostPerL: 0,
    slotsByAirport,
    airportLeases,
    pendingSlotBids: [],
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
    sliders: baseSliders,
    sliderStreaks: {
      staff:           { level: baseSliders.staff,           quarters: 0 },
      marketing:       { level: baseSliders.marketing,       quarters: 0 },
      service:         { level: baseSliders.service,         quarters: 0 },
      rewards:         { level: baseSliders.rewards,         quarters: 0 },
      operations:      { level: baseSliders.operations,      quarters: 0 },
      customerService: { level: baseSliders.customerService, quarters: 0 },
    },
  };

  return team;
}
