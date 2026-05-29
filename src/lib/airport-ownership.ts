import { CITIES_BY_CODE } from "@/data/cities";
import type { AirportSlotState, Team, AirportLease } from "@/types/game";

/**
 * Airport ownership economics (Sprint 10 / Q V2).
 *
 * Pricing model — per user spec:
 *   purchase_price = TIER_BASE_PRICE[tier]
 *                  + 4 × (current quarterly slot revenue at this airport)
 *
 * The "+4× quarterly slot revenue" represents the four-year payback on
 * existing slot fees the airport is currently extracting from operating
 * airlines. A high-value Tier-1 like LHR with $X / Q in slot revenue
 * costs base + 4× that.
 *
 * Capacity & expansion:
 *   - Each airport has a TOTAL_CAPACITY[tier] runway-slot ceiling.
 *   - Owner can fund +200-slot expansions until that ceiling is hit.
 *   - Each expansion costs EXPANSION_COST_PER_LEVEL[tier] and immediately
 *     adds 200 to availability (the slots open up for the owner to lease
 *     to themselves or to charge other airlines for at the owner-set rate).
 *
 * Slot rate (no bidding for owned airports):
 *   - The owner sets `ownerSlotRatePerWeekUsd` directly.
 *   - Every team's existing leases at this airport are recharged at the
 *     new rate at the next quarter close (no retroactive surcharge).
 *   - Owner collects the revenue; it surfaces in the team's quarterly
 *     P&L under "Subsidiary revenue" (rolled in with subsidiaries).
 */

/** Acquisition base price by airport tier — represents the
 *  "starting offer" before slot-revenue capitalisation. Tier 1 hubs
 *  are anchor assets ($1B+); regional airports are much cheaper. */
export const AIRPORT_BASE_PRICE_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 1_000_000_000,   // LHR / DXB / JFK / ORD class
  2:   400_000_000,
  3:   120_000_000,
  4:    40_000_000,
};

/** Maximum runway slot count an airport of this tier can ever reach,
 *  even with expansion investments. Used by the cap on +200 chunks. */
export const AIRPORT_MAX_CAPACITY_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 1_400, // big international hubs like LHR ~1,200 / qtr movement budget
  2:   900,
  3:   500,
  4:   220,
};

/** Default starting capacity for an unowned airport (used as a baseline
 *  before the owner has invested in any expansions). The auction-driven
 *  default flow doesn't actually need this number — only owners need to
 *  know how many slots are physically operable. */
export const AIRPORT_DEFAULT_CAPACITY_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 800,
  2: 500,
  3: 300,
  4: 140,
};

/** Cost to add +200 slots at the airport. Tier-1 expansions are
 *  expensive runway-or-terminal builds; tier-4 is mostly a tarmac
 *  re-stripe. Each call to expand consumes one bucket of cost. */
export const AIRPORT_EXPANSION_COST_PER_LEVEL: Record<1 | 2 | 3 | 4, number> = {
  1: 250_000_000,
  2:  90_000_000,
  3:  35_000_000,
  4:  12_000_000,
};

/** Slots added per expansion bucket. */
export const AIRPORT_EXPANSION_SLOTS = 200;

/** The owner's quarterly operating cost as a percentage of slot
 *  revenue — reflects ground crew, ATC, terminal upkeep. Net margin
 *  at full slot occupancy ends up around 60–70%, matching how real
 *  airport operators net their revenue. */
export const AIRPORT_OPEX_PCT_OF_REVENUE = 0.30;

/** Compute the current asking price to acquire a given airport based
 *  on the user's formula: base[tier] + 4 × current quarterly slot
 *  revenue at that airport (across every team's existing leases). */
export function airportAskingPriceUsd(
  airportCode: string,
  slotState: AirportSlotState | undefined,
  teams: Team[],
): number {
  const city = CITIES_BY_CODE[airportCode];
  if (!city) return 0;
  const tier = city.tier as 1 | 2 | 3 | 4;
  const base = AIRPORT_BASE_PRICE_BY_TIER[tier] ?? AIRPORT_BASE_PRICE_BY_TIER[4];
  // If already owned, asking price isn't really applicable — the airport
  // isn't on the market — but we surface base + cap-rate for display.
  // If unowned, sum the auction-cleared weekly fees across every team's
  // lease at this airport × 13 (weeks/quarter) to get current Q revenue.
  const quarterlyRevenue = teams.reduce((sum, t) => {
    const lease: AirportLease | undefined = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return sum;
    return sum + lease.totalWeeklyCost * 13;
  }, 0);
  // If the airport is owner-controlled, lease totalWeeklyCost reflects
  // the owner's set rate, so the math still applies.
  void slotState;
  return Math.round(base + 4 * quarterlyRevenue);
}

/* ────────────────────────────────────────────────────────────────
 *  Self-guided bid adjudication (May 2026 play-test ask).
 *
 *  In a facilitated workshop a human GM approves/rejects airport bids.
 *  In a *self_guided* game (solo / auto mode) there is no GM, so bids
 *  used to escrow the player's cash and then silently auto-expire two
 *  quarters later — making it impossible to ever buy an airport.
 *
 *  `adjudicateAirportBid` lets the engine play the role of the airport
 *  authority. It weighs:
 *    • Bid premium  — how the offer compares to the authority's asking
 *                     valuation. Lowballs get declined outright.
 *    • Brand standing — a credible flag carrier is a more acceptable
 *                       concession-holder than an unknown.
 *    • Market positioning — a large, valuable airline reads as a safe
 *                       pair of hands even if brand is still building.
 *    • Rival bidding war — prestigious (tier-1/2) gateways attract a
 *                       competing carrier whose counter-offer the player
 *                       must beat, or lose the concession.
 *
 *  Deterministic: the same airport + quarter always produces the same
 *  rival behaviour, so a replayed close can't be gamed by re-rolling.
 * ──────────────────────────────────────────────────────────────── */

export interface AirportBidAdjudication {
  approved: boolean;
  /** The rival carrier's counter-offer, if a bidding war broke out. */
  rivalOfferUsd: number | null;
  /** Human-readable rationale for the toast + notification. */
  reason: string;
}

/** Tiny deterministic PRNG (mulberry32) seeded from a string hash so
 *  rival behaviour is reproducible per airport+quarter. */
function seededRandom(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Compact USD formatter for adjudication reason strings (kept local to
 *  avoid a dependency on the format module from this pure helper). */
function compactUsd(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  return `$${Math.round(n).toLocaleString("en-AE")}`;
}

export function adjudicateAirportBid(opts: {
  airportCode: string;
  quarter: number;
  bidAmountUsd: number;
  askingPriceUsd: number;
  /** Bidder brand rating, 0–100. */
  brandRating0to100: number;
  /** Bidder total airline value (market positioning). */
  airlineValueUsd: number;
}): AirportBidAdjudication {
  const { airportCode, quarter, bidAmountUsd, askingPriceUsd } = opts;
  const rng = seededRandom(`${airportCode}:${quarter}`);
  const tier = (CITIES_BY_CODE[airportCode]?.tier ?? 4) as 1 | 2 | 3 | 4;
  const premium = askingPriceUsd > 0 ? bidAmountUsd / askingPriceUsd : 1;

  // 1) Lowball guard — the authority won't sell below ~97% of its
  //    valuation no matter who's asking.
  if (premium < 0.97) {
    return {
      approved: false,
      rivalOfferUsd: null,
      reason: `Your offer of ${compactUsd(bidAmountUsd)} came in below the airport authority's valuation of ${compactUsd(askingPriceUsd)}. They declined to sell.`,
    };
  }

  // 2) Bidding war — prestigious gateways attract a rival carrier.
  //    Base odds rise with tier; lowish premiums invite competition,
  //    a strong over-bid scares rivals off.
  const baseWarProb = tier === 1 ? 0.55 : tier === 2 ? 0.4 : tier === 3 ? 0.25 : 0.12;
  const warProb = Math.max(
    0,
    Math.min(0.9, baseWarProb + (premium < 1.1 ? 0.2 : premium > 1.35 ? -0.2 : 0)),
  );
  let rivalOfferUsd: number | null = null;
  if (rng() < warProb) {
    // Rival aggression scales with how marquee the asset is.
    const rivalPremium = 1.05 + rng() * (tier === 1 ? 0.45 : tier === 2 ? 0.35 : 0.22);
    rivalOfferUsd = Math.round(askingPriceUsd * rivalPremium);
    if (bidAmountUsd < rivalOfferUsd) {
      return {
        approved: false,
        rivalOfferUsd,
        reason: `A rival carrier out-bid you with ${compactUsd(rivalOfferUsd)} for ${airportCode}. The authority awarded the concession to them — your escrow has been refunded.`,
      };
    }
  }

  // 3) Credibility — even after clearing the money bar, the authority
  //    wants a serious operator. A respectable brand, a heavyweight
  //    airline, or a decisive over-bid each clears the bar on its own.
  const brandOk = opts.brandRating0to100 >= 35;
  const positioningOk = opts.airlineValueUsd >= 2_000_000_000;
  const strongPremium = premium >= 1.15;
  if (brandOk || positioningOk || strongPremium) {
    const beat = rivalOfferUsd != null
      ? ` You beat a rival bid of ${compactUsd(rivalOfferUsd)}.`
      : "";
    return {
      approved: true,
      rivalOfferUsd,
      reason: `The airport authority accepted your ${compactUsd(bidAmountUsd)} offer for ${airportCode}.${beat}`,
    };
  }

  // 4) Weak brand, modest airline, at-asking offer — the authority
  //    hesitates. Player can re-bid higher or build brand first.
  return {
    approved: false,
    rivalOfferUsd,
    reason: `The airport authority wasn't convinced your airline has the standing to run ${airportCode}. Strengthen your brand or raise your offer — your escrow has been refunded.`,
  };
}

/** Quarterly slot revenue the airport's owner collects this round —
 *  exactly the team-side slot fee total, but credited to the owner. */
export function airportQuarterlySlotRevenueUsd(
  airportCode: string,
  teams: Team[],
): number {
  return teams.reduce((sum, t) => {
    const lease = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return sum;
    return sum + lease.totalWeeklyCost * 13;
  }, 0);
}

/** Reset all teams' lease weeklyCost at an owner-controlled airport
 *  so they pay the new owner-set rate. Returns updated `teams`.
 *  Used when the owner changes `ownerSlotRatePerWeekUsd`, and once
 *  during acquisition. The number of slots each team holds is
 *  unchanged — only the per-slot fee is rewritten. */
export function applyOwnerSlotRate(
  teams: Team[],
  airportCode: string,
  ratePerWeekUsd: number,
): Team[] {
  return teams.map((t) => {
    const lease = t.airportLeases?.[airportCode];
    if (!lease || lease.slots === 0) return t;
    return {
      ...t,
      airportLeases: {
        ...t.airportLeases,
        [airportCode]: {
          slots: lease.slots,
          totalWeeklyCost: lease.slots * ratePerWeekUsd,
        },
      },
    };
  });
}

/** True if `team` currently owns the airport. */
export function isAirportOwner(
  team: Team,
  slotState: AirportSlotState | undefined,
): boolean {
  return !!slotState?.ownerTeamId && slotState.ownerTeamId === team.id;
}

/** Resolve an airport's effective capacity (post-expansions) for UI
 *  display + cap checks. Falls back to tier default when unowned. */
export function effectiveAirportCapacity(
  airportCode: string,
  slotState: AirportSlotState | undefined,
): number {
  if (slotState?.totalCapacity) return slotState.totalCapacity;
  const city = CITIES_BY_CODE[airportCode];
  if (!city) return AIRPORT_DEFAULT_CAPACITY_BY_TIER[4];
  return AIRPORT_DEFAULT_CAPACITY_BY_TIER[city.tier as 1 | 2 | 3 | 4] ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[4];
}

/** Effective tier for an airport — honours the government-upgrade
 *  override if one has fired, otherwise falls back to the static city
 *  tier. Used by demand-growth and storage-cost lookups. */
export function effectiveAirportTier(
  airportCode: string,
  slotState: AirportSlotState | undefined,
): 1 | 2 | 3 | 4 {
  if (slotState?.tierOverride) return slotState.tierOverride as 1 | 2 | 3 | 4;
  const city = CITIES_BY_CODE[airportCode];
  return (city?.tier ?? 4) as 1 | 2 | 3 | 4;
}

/** Government-funded airport upgrade schedule. Each entry fires at
 *  `quarter` ONLY if the airport is still unowned at that point —
 *  player-owned airports skip the auto-upgrade and the player must
 *  fund their own +200-slot expansions. The 2-quarter announcement
 *  news fires regardless of ownership so the player has time to act. */
export interface AirportGovernmentUpgrade {
  airportCode: string;
  quarter: number;          // when the upgrade actually applies
  capacitySlotBump: number; // slots added on completion
  raiseTier: boolean;       // tier increases by 1 (capped at 1)
  projectName: string;      // shown in the news headline
  detail: string;           // body for the announcement + completion news
}

export const AIRPORT_GOVERNMENT_UPGRADES: AirportGovernmentUpgrade[] = [
  {
    airportCode: "PEK", quarter: 14, capacitySlotBump: 600, raiseTier: true,
    projectName: "Beijing Capital + Daxing dual-hub expansion",
    detail: "China announces $11.7B parallel expansion of Beijing Capital and the new Daxing International, lifting combined annual movements by 40%. Government funding closes the financing gap; new slots open for international airlines.",
  },
  {
    airportCode: "IST", quarter: 16, capacitySlotBump: 600, raiseTier: true,
    projectName: "Istanbul New Airport mega-hub opening",
    detail: "Türkiye opens the new $11B six-runway mega-hub on Istanbul's European side, replacing Atatürk for commercial operations. Initial capacity sized for 90M passengers; phase two reaches 200M by end of decade.",
  },
  {
    airportCode: "DOH", quarter: 18, capacitySlotBump: 400, raiseTier: true,
    projectName: "Hamad International expansion programme",
    detail: "Qatar's Civil Aviation Authority confirms the $5B Hamad International expansion, adding two new concourses and a second cargo apron ahead of regional sporting events. Slot inventory rises by 400.",
  },
  {
    airportCode: "ICN", quarter: 20, capacitySlotBump: 400, raiseTier: true,
    projectName: "Incheon Phase 4 — Terminal 2 commissioning",
    detail: "Korea's flagship gateway opens its long-promised Phase 4 expansion: Terminal 2 commissioning, additional concourses, and a fourth runway. Slot inventory rises by 400; Incheon promoted to a Tier-1 demand market.",
  },
  {
    airportCode: "ATL", quarter: 22, capacitySlotBump: 400, raiseTier: true,
    projectName: "Hartsfield-Jackson capacity programme",
    detail: "The City of Atlanta unveils a $6B capital programme covering Concourse G, taxiway optimisation, and a fifth runway. ATL — long the world's busiest airport by movements — gets a fresh demand uplift as it absorbs decade-long Sun Belt growth.",
  },
  {
    airportCode: "YYZ", quarter: 24, capacitySlotBump: 300, raiseTier: true,
    projectName: "Toronto Pearson Terminal 6 + Apron expansion",
    detail: "GTAA announces a $4B investment in Terminal 6, Apron VIII, and people-mover extensions. Pearson breaks Canadian transit volume records and is promoted to Tier-1 hub status in the demand model.",
  },
  {
    airportCode: "JED", quarter: 26, capacitySlotBump: 300, raiseTier: true,
    projectName: "King Abdulaziz International new terminal complex",
    detail: "Saudi Arabia commissions the new King Abdulaziz International terminal complex, lifting capacity to 80M passengers. Hajj-season throughput more than doubles; Jeddah advances from regional to major hub status.",
  },
  {
    airportCode: "BER", quarter: 27, capacitySlotBump: 300, raiseTier: true,
    projectName: "Berlin Brandenburg full commissioning",
    detail: "After years of delay, Berlin Brandenburg Airport officially completes phase-one commissioning and absorbs traffic from Tegel and Schönefeld. Germany's third-largest hub finally takes its expected demand profile.",
  },
  {
    airportCode: "DFW", quarter: 28, capacitySlotBump: 400, raiseTier: true,
    projectName: "DFW Terminal F + sixth-runway programme",
    detail: "Dallas-Fort Worth approves a $3.5B Terminal F build-out plus the long-deferred sixth runway. North Texas's hub-of-record consolidates further capacity in advance of expected sustained Sun Belt growth.",
  },
  {
    airportCode: "SVO", quarter: 29, capacitySlotBump: 300, raiseTier: true,
    projectName: "Sheremetyevo Terminal C + cargo precinct",
    detail: "The Russian government completes the long-running $2.4B Sheremetyevo Terminal C expansion plus a new dedicated cargo precinct. SVO is upgraded in the demand model from a regional hub to a major one.",
  },
  {
    airportCode: "SYD", quarter: 30, capacitySlotBump: 300, raiseTier: true,
    projectName: "Western Sydney International + Kingsford-Smith expansion",
    detail: "Australia opens Western Sydney International (Nancy-Bird Walton) plus a complementary expansion at Kingsford-Smith. The dual-airport model unlocks 300 additional slots and elevates Sydney to Tier-1 status in the demand model.",
  },
];

/** Map of upgrade quarter → entries fired at that quarter (lookup
 *  helper for the engine + news layer). */
export const AIRPORT_UPGRADES_BY_QUARTER: Record<number, AirportGovernmentUpgrade[]> =
  AIRPORT_GOVERNMENT_UPGRADES.reduce((acc, u) => {
    (acc[u.quarter] ??= []).push(u);
    return acc;
  }, {} as Record<number, AirportGovernmentUpgrade[]>);

/** Map of announcement quarter (= upgrade.quarter - 2) → entries.
 *  The announcement news fires regardless of ownership so the player
 *  has 2 quarters to acquire the airport before government funds it. */
export const AIRPORT_UPGRADES_ANNOUNCED_BY_QUARTER: Record<number, AirportGovernmentUpgrade[]> =
  AIRPORT_GOVERNMENT_UPGRADES.reduce((acc, u) => {
    const q = u.quarter - 2;
    (acc[q] ??= []).push(u);
    return acc;
  }, {} as Record<number, AirportGovernmentUpgrade[]>);

/** Apply a government upgrade to an airport's slot state — runs at
 *  the upgrade.quarter ONLY if the airport is currently unowned.
 *  Returns the new slot state plus a flag indicating whether the
 *  upgrade was actually applied (for news bookkeeping). */
export function applyGovernmentUpgrade(
  slotState: AirportSlotState | undefined,
  upgrade: AirportGovernmentUpgrade,
  cityTier: number,
): { slotState: AirportSlotState; applied: boolean } {
  const cur = slotState ?? { available: 0, nextOpening: 0, nextTickQuarter: 5 };
  if (cur.ownerTeamId) {
    // Player-owned: government doesn't subsidise private operators.
    // Player-funded +200 expansions remain the only growth path here.
    return { slotState: cur, applied: false };
  }
  const newTier = upgrade.raiseTier
    ? Math.max(1, cityTier - 1) as 1 | 2 | 3 | 4
    : cityTier as 1 | 2 | 3 | 4;
  const newCapacity = (cur.totalCapacity ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[newTier]) + upgrade.capacitySlotBump;
  return {
    slotState: {
      ...cur,
      tierOverride: upgrade.raiseTier ? newTier : cur.tierOverride,
      totalCapacity: newCapacity,
      available: cur.available + upgrade.capacitySlotBump,
    },
    applied: true,
  };
}
