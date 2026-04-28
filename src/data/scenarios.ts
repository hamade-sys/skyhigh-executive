import type { ScenarioId } from "@/types/game";

export interface ScaledCashEffect {
    basis:
      | "lastRevenueQ"
      | "annualRevenue"
      | "staffCostQ"
      | "fuelCostQ"
      | "debt"
      | "fleetValue"
      | "airlineValue";
    multiplier: number;
    min: number;
    max: number;
}

/**
 * Effect applied immediately on submission. Deferred events + plot twists
 * are kept as metadata for the engine to schedule; this file is the content
 * layer. Engine logic lives in lib/engine/scenarios.ts.
 */
export interface OptionEffect {
  cash?: number;
  /** Cash effect resolved at submission / trigger time against the
   *  current airline size. Positive = inflow/savings, negative = spend
   *  or disruption. `min` / `max` are signed bounds. */
  scaledCash?: ScaledCashEffect;
  brandPts?: number;
  opsPts?: number;
  loyaltyDelta?: number;      // percentage points
  setFlags?: string[];
  /** Time-bounded strategic effects applied during quarter close. */
  timedModifier?: {
    id: string;
    kind:
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
    durationQuarters: number;
  };
  /** Debt refinancing effect resolved by the store because it mutates
   *  loan instruments, not just headline cash. */
  refinanceDebt?: {
    portion: number;          // 1 = all current debt, 0.5 = half exposure
    breakFeePct: number;      // charged on refinanced principal
    rateMultiplier: number;   // e.g. 0.85 = 15% lower rate
    successProbability?: number;
  };
  /** One-off capacity benefit from a government / regulator deal. */
  opsExpansionSlots?: number;
  /**
   * Set the team's recurring quarterly staff-cost surcharge to this
   * value (replaces, not adds). Used by S14 talent heist "Full
   * Counter Offer" — committing to retain the executives at a
   * permanent payroll premium. 0.10 = +10% staff cost every quarter
   * for the rest of the campaign. The facilitator can later adjust
   * the rate from the AdminPanel staff-cost section.
   */
  recurringStaffSurchargePct?: number;
  /**
   * Variable cash bump computed at submission time as
   *   `staffSavingsPct × (current quarterly staff cost) × 2 quarters`.
   * Used by S15 Recession Gamble so that "mass redundancy" savings
   * scale with each airline's actual headcount instead of a hardcoded
   * dollar amount. 0..1 (e.g. 0.5 = save 50% of two quarters of staff).
   */
  staffSavingsPct?: number;
  /**
   * Acquisition presets that materialize aircraft + route credits when
   * a player picks an M&A option. The preset string is interpreted in
   * the engine (see applyOptionEffect → acquirePreset). Used by S7
   * Hungry Neighbour. Keep the IDs stable since they're persisted in
   * decisions[].
   */
  acquireFleet?: "S7_FULL" | "S7_PARTIAL";
  /**
   * Debt the player ASSUMES from a decision (e.g. S7 Full Acquisition's
   * $180M debt). Materialized as a real LoanInstrument at the current
   * base interest rate, repayable via the standard repayLoan action
   * whenever the player decides — not deducted from cash automatically.
   */
  debtAssumed?: number;
  /**
   * Service-route obligation. When picked, the team commits to keeping
   * an active route to each city in `cities` for `durationQuarters`
   * rounds. Engine charges `finePerQuarterUsd` per missed city per
   * quarter (any-endpoint match — route can originate anywhere).
   * Used by S5 Government Lifeline.
   */
  routeObligation?: {
    id: string;
    cities: string[];
    durationQuarters: number;
    finePerQuarterUsd: number;
    fineScaled?: ScaledCashEffect;
    label: string;
  };
  // Deferred consequence resolved at a future quarter close.
  // Use `lagQuarters` (relative to the decision quarter) to insulate
  // against scenario-quarter drift; `quarter` is kept for legacy
  // entries with absolute targets.
  deferred?: {
    /** Absolute target quarter (legacy). Use `lagQuarters` instead
     *  for new entries so the consequence stays aligned with the
     *  decision even if the scenario moves. */
    quarter?: number;
    /** Quarters AFTER the decision quarter that the consequence
     *  resolves. Computed at submit time → currentQuarter + lag.
     *  Wins over `quarter` if both are present. */
    lagQuarters?: number;
    probability?: number;     // 0..1; if undefined treat as 1
    effect: OptionEffect;
    /** Optional one-line note shown in the close digest. */
    note?: string;
  };
}

export interface ScenarioOption {
  id: "A" | "B" | "C" | "D" | "E";
  label: string;
  description: string;
  effect: OptionEffect;
  /** Display-only tags. Per PRD update, the boardroom decision UI
   *  surfaces only FINANCIAL tags (those starting with $, "Annual ",
   *  "Locked ", or with a +$/−$ prefix). Strategic-reveal tags
   *  ("Brand +3", "Loyalty −5%", "X% risk Q9") are kept for backwards
   *  compatibility but filtered out of the player-facing UI so the
   *  numbers don't give away the right answer. */
  effectTags?: string[];
  /** Flag name(s) that must NOT be set on the team for this option to be available. */
  blockedByFlags?: string[];
  /** When set, the option is only available if the team currently meets
   *  the named requirement. Engine + UI grey it out otherwise. */
  requires?: "cargo-fleet";
}

export interface Scenario {
  id: ScenarioId;
  title: string;
  quarter: number;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CATASTROPHIC";
  timeLimitMinutes: number;
  teaser: string;
  context: string;
  options: ScenarioOption[];
  autoSubmitOptionId: "A" | "B" | "C" | "D" | "E";
  notes?: string;
}

// Helper for compact definition
const M = 1_000_000;

export const SCENARIOS: Scenario[] = [
  {
    id: "S1", title: "The Ghost Fleet", quarter: 7, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Three aircraft have forged safety sign-offs. Your maintenance chief just called.",
    context:
      "A senior engineer has quietly reported that three of your wide-body aircraft have undocumented maintenance gaps covered by forged sign-offs. You have hours before the regulator learns independently. Self-report, quiet fix, or keep flying?",
    options: [
      { id: "A", label: "Self-report immediately",
        description: "Full disclosure, ground the aircraft, file with the regulator.",
        effect: { cash: -180 * M, brandPts: 15, opsPts: 10, setFlags: ["trusted_operator"] },
        effectTags: ["-$180M", "Brand +15", "Ops +10", "Trusted Operator"] },
      { id: "B", label: "Quiet internal review",
        description: "Fix it quietly. 42% chance regulator finds out next quarter.",
        effect: {
          cash: -45 * M, brandPts: -5,
          deferred: { quarter: 9, probability: 0.425, effect: { cash: -40 * M, brandPts: -25 } },
        },
        effectTags: ["-$45M", "Brand -5", "42% risk Q5"] },
      { id: "C", label: "Continue flying",
        description: "Keep the fleet active. 30% incident probability next quarter.",
        effect: {
          deferred: { quarter: 9, probability: 0.30, effect: { cash: -150 * M, brandPts: -50, opsPts: -20 } },
        },
        effectTags: ["30% catastrophic risk"] },
      { id: "D", label: "Quiet grounding",
        description: "Ground quietly under routine maintenance cover.",
        effect: { cash: -60 * M, brandPts: -5, opsPts: -5 },
        effectTags: ["-$60M", "Brand -5", "Ops -5"] },
    ],
    autoSubmitOptionId: "C",
    notes: "Most negligent default if team fails to submit.",
  },
  {
    id: "S2", title: "War in the Corridor", quarter: 15, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "A geopolitical corridor just closed. Three of your flights are airborne.",
    context:
      "A major conflict has closed airspace over a corridor that hosts $95M of your annual revenue. You have hours to decide on routing.",
    options: [
      { id: "A", label: "Reroute all flights",
        description: "Longer flight times, burn more fuel, annual revenue hit but reputation protected.",
        effect: { cash: -18 * M, brandPts: 8, opsPts: -5 },
        effectTags: ["Annual rev -$18M", "Brand +8", "Ops -5"] },
      { id: "B", label: "Continue current routing",
        description: "Ignore the warning. 25% chance of incident next quarter.",
        effect: {
          brandPts: -5,
          deferred: { quarter: 17, probability: 0.25, effect: { cash: -30 * M, brandPts: -20, opsPts: -10 } },
        },
        effectTags: ["Brand -5", "25% catastrophic risk"] },
      { id: "C", label: "Suspend corridor operations",
        description: "Lose the routes entirely. Slots may be forfeited.",
        effect: { cash: -95 * M, brandPts: 10, opsPts: -10, setFlags: ["route_slots_lost"] },
        effectTags: ["-$95M", "Brand +10", "Slots at risk"] },
      { id: "D", label: "Insurance only",
        description: "Buy emergency insurance, keep flying.",
        effect: {
          cash: -8 * M, brandPts: -8,
          deferred: { quarter: 17, probability: 0.25, effect: { cash: -30 * M, brandPts: -20 } },
        },
        effectTags: ["-$8M", "Brand -8", "25% risk Q9"] },
    ],
    autoSubmitOptionId: "B",
  },
  {
    id: "S3", title: "The Flash Deal", quarter: 25, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "20 next-gen aircraft available fleet-wide. First come, first served.",
    context:
      "Airbus offers a one-time deal: 20 new eco-engine aircraft across all airlines. First-come pool, $4M deposit each, $1.7M/year fuel saving per plane.",
    options: [
      { id: "A", label: "Commit full allocation",
        description: "Bid aggressively for multiple units.",
        effect: { cash: -16 * M, opsPts: 4 },
        effectTags: ["-$16M deposit", "Ops +4"] },
      { id: "B", label: "Request extension",
        description: "50% chance for delayed deal terms.",
        effect: { cash: -4 * M },
        effectTags: ["-$4M hold", "50% success"] },
      { id: "C", label: "Decline",
        description: "Keep the cash. Risk falling behind on fleet modernization.",
        effect: { brandPts: -2 }, effectTags: ["Brand -2"] },
      { id: "D", label: "Single unit only",
        description: "Minimum commit to preserve option value.",
        effect: { cash: -4 * M, opsPts: 1 }, effectTags: ["-$4M", "Ops +1"] },
    ],
    autoSubmitOptionId: "C",
  },
  {
    id: "S4", title: "The Oil Gamble", quarter: 5, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Analysts split on oil. Lock in a hedge or ride open market?",
    context:
      "Fuel is at index 115. Your finance team is split: energy desk says buy long, commodities say short-term dip incoming. Your quarterly fuel bill runs $60M.",
    options: [
      { id: "A", label: "12-month full hedge",
        description: "Annual fuel cost locked at $240M. Max protection.",
        effect: {
          opsPts: 5, setFlags: ["hedged_12m"],
          // OPEC drop reveal — locked-high carriers are stuck overpaying
          // when the spot market collapses (~3 quarters after the
          // hedge is set). Lag relative to decision so it tracks even
          // if the scenario quarter moves.
          deferred: {
            lagQuarters: 3,
            effect: { cash: -60_000_000 },
            note: "OPEC drop · locked-high hedge overpays (−$60M)",
          },
        },
        effectTags: ["Locked $240M/yr", "Ops +5"] },
      { id: "B", label: "6-month partial hedge",
        description: "Annual fuel cost $205M projected.",
        effect: { setFlags: ["hedged_6m"] },
        effectTags: ["Locked $205M/yr"] },
      { id: "C", label: "Open market",
        description: "Ride spot prices. Highest upside, highest downside.",
        effect: {
          opsPts: -5,
          // OPEC drop rewards the open-market position.
          deferred: {
            lagQuarters: 3,
            effect: { cash: 60_000_000 },
            note: "OPEC drop · spot-market position wins (+$60M)",
          },
        }, effectTags: ["Ops -5", "Spot exposure"] },
      { id: "D", label: "50/50 structured",
        description: "Hybrid hedge with structured-risk framework.",
        effect: {
          opsPts: 3, setFlags: ["hedged_50_50"],
          deferred: {
            lagQuarters: 3,
            effect: { cash: 30_000_000 },
            note: "OPEC drop · 50/50 captures partial upside (+$30M)",
          },
        },
        effectTags: ["Locked $220M/yr", "Ops +3"] },
    ],
    autoSubmitOptionId: "C",
    notes: "OPEC drop plot twist reveals 3 quarters after decision.",
  },
  {
    id: "S5", title: "The Government Lifeline", quarter: 11, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "Treasury offers $300M in emergency capital — with strings.",
    context:
      "Post-crisis recovery capital. Government will inject $300M if you commit to a 2-year service obligation: keep at least one active route to BOTH Lagos (LOS) and Casablanca (CMN) every quarter for 8 rounds. The route can originate from any of your cities — it does not have to be from your hub. Miss either city in a quarter and Treasury fines you $50M per missed city for that quarter.",
    options: [
      { id: "A", label: "Accept government deal",
        description: "$300M next quarter. Must service Lagos + Casablanca for 2 years; $50M/qtr fine per city missed.",
        effect: {
          opsPts: -2,
          setFlags: ["gov_board_card", "redundancy_freeze"],
          routeObligation: {
            id: "S5_GOV_LIFELINE",
            cities: ["LOS", "CMN"],
            durationQuarters: 8,
            finePerQuarterUsd: 50_000_000,
            label: "Government lifeline · Lagos + Casablanca service",
          },
        },
        effectTags: ["+$300M next quarter", "Service LOS + CMN · 2 yrs", "Fine -$50M/qtr per missed city"] },
      { id: "B", label: "Negotiate lighter terms",
        description: "70% chance the government still injects $300M next quarter; 30% chance they walk away and you get nothing.",
        effect: {
          setFlags: ["negotiating_gov"],
          // 70% chance the negotiation succeeds → +$300M next quarter.
          // 30% miss → zero cash, no obligation. Resolution outcome
          // is surfaced in the next quarter close digest so the
          // player isn't left wondering.
          deferred: {
            lagQuarters: 1,
            probability: 0.7,
            effect: { cash: 300_000_000 },
            note: "Government lifeline · negotiation result",
          },
        },
        effectTags: ["70% chance +$300M next quarter", "30% gov walks"] },
      { id: "C", label: "Private markets",
        description: "Slower, costlier, no strings.",
        effect: { cash: -8 * M },
        effectTags: ["+$200M in 2Q", "-$8M bridge"] },
      { id: "D", label: "Sell cargo division",
        description: "$180M this quarter. Cargo aircraft sold for proceeds; cargo revenue stops until you re-buy cargo aircraft on the market.",
        effect: { cash: 180 * M, opsPts: -10, setFlags: ["cargo_division_sold"] },
        effectTags: ["+$180M", "All cargo aircraft sold", "Ops -10"],
        requires: "cargo-fleet" },
    ],
    autoSubmitOptionId: "C",
  },
  {
    id: "S6", title: "The Rate Window", quarter: 19, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "Interest rates at a 3-year low. Refinance window is 30 minutes.",
    context:
      "Your treasurer has secured refinancing terms at the current rate window. Break fee 3.5% of current debt, locks new rate for remaining term.",
    options: [
      { id: "A", label: "Full refinance",
        description: "Refinance the full debt stack. Pay a break fee based on current debt, then lower rates for the remaining term.",
        effect: {
          setFlags: ["efficient_capital"],
          refinanceDebt: { portion: 1, breakFeePct: 0.035, rateMultiplier: 0.85 },
        },
        effectTags: ["Fee ≈ 3.5% of debt", "Rate optimized"] },
      { id: "B", label: "Decline",
        description: "Keep current rates. Risk rate hike next quarter.",
        effect: {}, effectTags: ["Rate risk next quarter"] },
      { id: "C", label: "Half refinance",
        description: "Hedge the rate window by refinancing roughly half the exposure.",
        effect: {
          refinanceDebt: { portion: 0.5, breakFeePct: 0.035, rateMultiplier: 0.85 },
        },
        effectTags: ["Fee ≈ 1.75% of debt", "50% rate optimized"] },
      { id: "D", label: "Counter-offer from competing bank",
        description: "60% success probability on better rate.",
        effect: {
          refinanceDebt: { portion: 1, breakFeePct: 0.02, rateMultiplier: 0.80, successProbability: 0.6 },
        },
        effectTags: ["60% success", "Fee ≈ 2% of debt if won"] },
    ],
    autoSubmitOptionId: "B",
  },
  {
    id: "S7", title: "The Hungry Neighbour", quarter: 17, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "A competing airline is collapsing. Buy, pick at the assets, or let it die?",
    context:
      "A regional competitor is entering administration with 12 active routes, 8 aircraft (mix of narrow- and wide-body), and $180M of outstanding debt. The administrator is accepting bids in three lots: full operation, route rights only, or a codeshare alliance. If you walk away, rivals get first pick.",
    options: [
      { id: "A", label: "Full acquisition",
        description:
          "Buy the whole airline. $350M cash + $180M debt assumed (you can repay on your own timeline). Eight aircraft transfer into your fleet (4 narrow + 4 wide) — they arrive grounded for repaint, then become idle in the fleet panel.",
        effect: { cash: -350 * M, debtAssumed: 180 * M, opsPts: -15, brandPts: 10, acquireFleet: "S7_FULL" },
        effectTags: ["−$350M", "+$180M debt"] },
      { id: "B", label: "Routes only",
        description:
          "Cherry-pick the profitable routes — you get 12 high-yield route rights and 4 narrow-body aircraft to fly them. The rest of the operation goes to rivals.",
        effect: { cash: -120 * M, brandPts: 5, acquireFleet: "S7_PARTIAL" },
        effectTags: ["−$120M"] },
      { id: "C", label: "Let them collapse",
        description: "Walk away. 60% chance the routes go to your rivals at quarter close.",
        effect: { brandPts: -5,
          deferred: { quarter: 19, probability: 0.6, effect: { setFlags: ["routes_lost_to_rivals"] } } },
        effectTags: [] },
      { id: "D", label: "Codeshare",
        description: "Preserve the airline as an alliance partner. Annual codeshare revenue, no fleet transfer.",
        effect: { opsPts: 5 }, effectTags: ["Codeshare revenue"] },
    ],
    autoSubmitOptionId: "C",
  },
  {
    id: "S8", title: "The Political Favour", quarter: 21, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "A minister is asking for a favour. So is a regulator.",
    context:
      "State request: open and maintain service to Casablanca plus two Tier 3 regional access cities for eight quarters. The routes will be thin, but the ministry is offering permit certainty and priority slot treatment. Decline and you risk regulatory friction.",
    options: [
      { id: "A", label: "Accept regional access package",
        description: "Commit to Casablanca, Amman, and Nairobi service for two years. Receive priority slot treatment and full government goodwill.",
        effect: {
          brandPts: 15,
          opsPts: -8,
          loyaltyDelta: 4,
          setFlags: ["government_ally"],
          opsExpansionSlots: 18,
          timedModifier: { id: "S8_POLITICAL_FULL", kind: "political-favour-full", durationQuarters: 8 },
          routeObligation: {
            id: "S8_POLITICAL_FAVOUR",
            cities: ["CMN", "AMM", "NBO"],
            durationQuarters: 8,
            finePerQuarterUsd: 12 * M,
            fineScaled: { basis: "lastRevenueQ", multiplier: 0.04, min: 8 * M, max: 60 * M },
            label: "Political favour · Casablanca + Tier 3 access service",
          },
        },
        effectTags: ["Cost scales with revenue", "Priority slots +18/wk"] },
      { id: "B", label: "Negotiate priority route only",
        description: "Commit to Casablanca service and a smaller regional-access package. Benefits are smaller, but the exposure is contained.",
        effect: {
          brandPts: 8,
          opsPts: -4,
          loyaltyDelta: 2,
          opsExpansionSlots: 8,
          timedModifier: { id: "S8_POLITICAL_PARTIAL", kind: "political-favour-partial", durationQuarters: 8 },
          routeObligation: {
            id: "S8_POLITICAL_FAVOUR_PARTIAL",
            cities: ["CMN"],
            durationQuarters: 8,
            finePerQuarterUsd: 8 * M,
            fineScaled: { basis: "lastRevenueQ", multiplier: 0.025, min: 5 * M, max: 35 * M },
            label: "Political favour · Casablanca service",
          },
        },
        effectTags: ["Cost scales with revenue", "Priority slots +8/wk"] },
      { id: "C", label: "Decline politely",
        description: "Keep independence. 40% chance of permit disruption.",
        effect: { brandPts: -10, opsPts: 5,
          deferred: {
            quarter: 25,
            probability: 0.4,
            effect: {
              scaledCash: { basis: "lastRevenueQ", multiplier: -0.08, min: -120 * M, max: -15 * M },
              opsPts: -10,
            },
          } },
        effectTags: ["Brand -10", "40% disruption risk"] },
      { id: "D", label: "Seek public subsidy",
        description: "40% success on public subsidy offsetting cost.",
        effect: {
          brandPts: 6,
          opsPts: 2,
          deferred: {
            quarter: 23,
            probability: 0.4,
            effect: {
              scaledCash: { basis: "annualRevenue", multiplier: 0.015, min: 10 * M, max: 90 * M },
              brandPts: 6,
              setFlags: ["subsidy_model"],
            },
          },
        }, effectTags: ["40% scaled subsidy success"] },
    ],
    autoSubmitOptionId: "C",
  },
  {
    id: "S9", title: "The Blue Ocean", quarter: 31, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "A new trans-regional corridor has opened. First mover or second?",
    context:
      "Diplomatic thaw has opened a previously restricted corridor. Early entrants capture market share; late entrants fight for scraps.",
    options: [
      { id: "A", label: "Enter new market",
        description: "Commit first. Investment scales with airline size; new-corridor revenue runs for the next two years.",
        effect: {
          scaledCash: { basis: "annualRevenue", multiplier: -0.035, min: -180 * M, max: -45 * M },
          opsPts: -5,
          setFlags: ["blue_ocean_first_mover"],
          timedModifier: { id: "S9_BLUE_OCEAN_FIRST", kind: "blue-ocean-first", durationQuarters: 8 },
        },
        effectTags: ["Investment scales with revenue", "Revenue uplift for 8 quarters"] },
      { id: "B", label: "Deepen existing routes",
        description: "Defend and densify existing markets. Smaller investment, smaller recurring uplift.",
        effect: {
          scaledCash: { basis: "annualRevenue", multiplier: -0.018, min: -100 * M, max: -20 * M },
          brandPts: 5,
          timedModifier: { id: "S9_BLUE_OCEAN_DEEPEN", kind: "blue-ocean-deepen", durationQuarters: 8 },
        },
        effectTags: ["Investment scales with revenue", "Revenue uplift for 8 quarters"] },
      { id: "C", label: "Split budget",
        description: "Half measure. Distraction flag.",
        effect: {
          scaledCash: { basis: "annualRevenue", multiplier: -0.025, min: -125 * M, max: -30 * M },
          opsPts: -5,
          setFlags: ["distracted_airline"],
          timedModifier: { id: "S9_BLUE_OCEAN_SPLIT", kind: "blue-ocean-split", durationQuarters: 6 },
        },
        effectTags: ["Investment scales with revenue", "Diluted uplift for 6 quarters"] },
      { id: "D", label: "Pay dividend",
        description: "Return cash to shareholders. No-vision flag.",
        effect: {
          scaledCash: { basis: "airlineValue", multiplier: -0.004, min: -80 * M, max: -10 * M },
          brandPts: -5,
          setFlags: ["no_vision"],
        },
        effectTags: ["Dividend outflow scales with value"] },
    ],
    autoSubmitOptionId: "C",
  },
  {
    id: "S10", title: "The World Cup Bet", quarter: 3, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Sealed bid to be the World Cup's official carrier. Top bid + pitch wins.",
    context:
      "FIFA is auctioning the official carrier slot for the upcoming World Cup. The host city has been announced — see the World News briefing for the city. Submit a sealed bid plus a 60-second pitch. The winner gets near-full loads on routes touching the host city through rounds 19-24, plus brand halo across the whole network. Losers still benefit from event traffic if they fly through the host city, but at a much smaller boost.",
    options: [
      { id: "A", label: "Aggressive bid — go to win",
        description: "Spend $80M now. Strong favourite to be picked. Pays back through 6 quarters of near-full loads on host-city routes if you build the schedule.",
        effect: { cash: -80 * M },
        effectTags: ["-$80M"] },
      { id: "B", label: "Moderate bid — stay in the race",
        description: "Spend $40M. You're a contender, not the favourite. Win is realistic if your pitch lands.",
        effect: { cash: -40 * M },
        effectTags: ["-$40M"] },
      { id: "C", label: "Token bid — keep the option open",
        description: "Spend $10M just to be in the room. Won't win unless rivals all fold.",
        effect: { cash: -10 * M },
        effectTags: ["-$10M"] },
      { id: "D", label: "Ambush marketing — skip the bid, run guerrilla",
        description: "Spend $15M on unofficial campaigns around the tournament. Brand +8. 20% chance FIFA's lawyers sue you ($5M and brand hit).",
        effect: { cash: -15 * M, brandPts: 8,
          deferred: { quarter: 5, probability: 0.20, effect: { cash: -5 * M, brandPts: -15 } } },
        effectTags: ["-$15M", "Brand +8", "20% legal risk"] },
    ],
    autoSubmitOptionId: "C",
    notes: "Winner resolved after L6 Elevator pitch (admin-entered).",
  },
  {
    id: "S11", title: "The Olympic Play", quarter: 13, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "Summer Olympics in four quarters. Pick your sponsorship tier — or pass.",
    context:
      "The host city for the upcoming Summer Olympics has been announced — see the World News for which city. The IOC is offering the airline four tiered sponsorship slots, each unlocking a different mix of brand uplift, loyalty gains, and demand boosts on routes touching the host city during rounds 29-32. Or pass entirely and let your rivals lock in the halo.",
    options: [
      { id: "A", label: "Official airline partner — top tier",
        description: "Spend $65M. You're the IOC's named carrier: best brand uplift, biggest loyalty bump, and locked 95% occupancy on every route that touches the host city through the Games.",
        effect: { cash: -65 * M, brandPts: 20, loyaltyDelta: 8, setFlags: ["premium_airline"] },
        effectTags: ["-$65M", "Brand +20", "Loyalty +8%", "Host-city load locked 95%"] },
      { id: "B", label: "Team performance sponsor — mid tier",
        description: "Spend $65M to back a national team. Solid brand boost from the partnership but no demand lock — you ride the same +18% surge on host-city routes that any non-partner gets.",
        effect: { cash: -65 * M, brandPts: 10, loyaltyDelta: 4 },
        effectTags: ["-$65M", "Brand +10", "Loyalty +4%"] },
      { id: "C", label: "Local carrier deal — regional tie-in",
        description: "Spend $35M for a regional partnership, not a global one. Cheaper, lower brand ceiling, but still gets you into the conversation.",
        effect: { cash: -35 * M, brandPts: 12, loyaltyDelta: 3 },
        effectTags: ["-$35M", "Brand +12", "Loyalty +3%"] },
      { id: "D", label: "Single-sport sponsor — coin flip",
        description: "Spend $18M backing one sport. 40% chance the team wins gold and you get a brand windfall (+15). 60% they don't and you got nothing.",
        effect: { cash: -18 * M },
        effectTags: ["-$18M", "40% brand win"] },
      { id: "E", label: "Pass — keep the cash",
        description: "Skip the Olympics entirely. No spend, no boost. Rivals who buy in pull ahead on brand and loyalty.",
        effect: { brandPts: -8, loyaltyDelta: -3 },
        effectTags: ["Brand -8 relative to peers", "Loyalty -3%"] },
    ],
    autoSubmitOptionId: "E",
  },
  {
    id: "S12", title: "The Brand Grenade", quarter: 35, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Your brand ambassador said something unforgivable live on air.",
    context:
      "Ambassador went off-script in a major media moment. Brand is mid-crisis. Terminate the contract, lean in, apologize, or disappear?",
    options: [
      { id: "A", label: "Terminate ambassador",
        description: "Corporate reflex. May backfire post-twist.",
        effect: {
          cash: -10 * M, brandPts: 5, loyaltyDelta: -12,
          // Ambassador is later cleared. Termination looked reactive
          // and damages the brand retrospectively.
          deferred: {
            lagQuarters: 4,
            effect: { brandPts: -22 },
            note: "Ambassador cleared · termination reads as reactive (Brand −22)",
          },
        },
        effectTags: ["-$10M", "Brand +5", "Loyalty -12%"] },
      { id: "B", label: "Join the joke",
        description: "Bold embrace. Loyalty gates the outcome.",
        effect: { cash: -3 * M },
        effectTags: ["-$3M", "Loyalty-gated outcome"] },
      { id: "C", label: "Formal apology",
        description: "Solid, safe recovery.",
        effect: { brandPts: 10, loyaltyDelta: 6 },
        effectTags: ["Brand +10", "Loyalty +6%"] },
      { id: "D", label: "Redemption arc",
        description: "Long-game narrative, earned media.",
        effect: {
          cash: -8 * M, loyaltyDelta: 15,
          // Long-arc storytelling pays off when the original incident
          // gets re-litigated and the brand is the redemption story.
          deferred: {
            lagQuarters: 4,
            effect: { brandPts: 15 },
            note: "Ambassador cleared · redemption arc lands (+Brand 15)",
          },
        },
        effectTags: ["-$8M", "Brand +38 over 2Q", "Loyalty +15%"] },
      { id: "E", label: "Silence",
        description: "Wait for the cycle to pass. 30% chance it doesn't.",
        effect: { brandPts: -5, loyaltyDelta: -5,
          deferred: { lagQuarters: 2, probability: 0.3, effect: { brandPts: -18 } } },
        effectTags: ["Brand -5", "Loyalty -5%", "30% downside"] },
    ],
    autoSubmitOptionId: "A",
  },
  {
    id: "S13", title: "The Digital Gamble", quarter: 29, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "AI changes the operating model. Three rollout paths, each with different cost.",
    context:
      "Your operations AI platform is ready. Savings and disruption should scale with your current payroll, fleet, and network footprint. Full rollout lowers staff cost fastest, but it creates material strike risk. Phase it, reskill, or let the operating model age.",
    options: [
      { id: "A", label: "Full rollout",
        description: "Fastest savings. Implementation cost scales with payroll and the strike-risk modifier is active for two years.",
        effect: {
          scaledCash: { basis: "staffCostQ", multiplier: -1.4, min: -150 * M, max: -20 * M },
          brandPts: -10,
          loyaltyDelta: -5,
          setFlags: ["digital_full_rollout"],
          timedModifier: { id: "S13_DIGITAL_FULL", kind: "digital-full", durationQuarters: 8 },
        },
        effectTags: ["Cost scales with payroll", "Payroll savings 8Q"],
        blockedByFlags: ["gov_board_card"],
      },
      { id: "B", label: "3-phase rollout",
        description: "Slower savings, lower strike risk.",
        effect: {
          scaledCash: { basis: "staffCostQ", multiplier: -0.95, min: -95 * M, max: -12 * M },
          brandPts: -3,
          timedModifier: { id: "S13_DIGITAL_PHASED", kind: "digital-phased", durationQuarters: 8 },
        },
        effectTags: ["Cost scales with payroll", "Ramping savings 8Q"] },
      { id: "C", label: "Reskill workforce",
        description: "People-first flag. Longer ramp.",
        effect: {
          scaledCash: { basis: "staffCostQ", multiplier: -2.1, min: -200 * M, max: -35 * M },
          brandPts: 15,
          loyaltyDelta: 8,
          setFlags: ["people_first", "digital_reskill_path"],
          timedModifier: { id: "S13_DIGITAL_RESKILL", kind: "digital-reskill", durationQuarters: 8 },
        },
        effectTags: ["Cost scales with payroll", "Safer savings 8Q"] },
      { id: "D", label: "Cancel rollout",
        description: "Competitor AI gap widens. Aging-ops flag.",
        effect: {
          setFlags: ["aging_operations"],
          timedModifier: { id: "S13_AGING_OPERATIONS", kind: "aging-operations", durationQuarters: 8 },
        },
        effectTags: ["Future cost scales with revenue"] },
    ],
    autoSubmitOptionId: "D",
    notes: "Option A blocked if gov_board_card flag is active.",
  },
  {
    id: "S14", title: "The Talent Heist", quarter: 23, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "A rival is poaching three executives. Counter or let them walk?",
    context:
      "Your head of revenue, ops, and digital all received offers from a competitor. Counter-offers burn cash; doing nothing burns two quarters of productivity.",
    options: [
      { id: "A", label: "Full Counter Offer",
        description: "Match every package and lock the team in. The cost depends on what the rival bid — the facilitator will set the figure based on what each retained executive's package ended up at.",
        // No cash hit at submission. Picking this option flags the
        // team as "awaiting facilitator-set counter cost" — the
        // admin then enters a USD amount in the AdminPanel and
        // applies it. Loyalty bumps now to reflect the verbal
        // commitment to retain everyone.
        effect: { setFlags: ["talent_heist_pending_full_counter"], loyaltyDelta: 5 },
        effectTags: ["Cost set by admin", "Loyalty +5%"] },
      { id: "B", label: "Apply Incremental Salary Increase 10%",
        description: "Permanent 10% bump on quarterly staff cost for the rest of the campaign. Loyalty rises but the recurring overhead is baked in.",
        // Recurring +10% on staff cost, applied every quarter close.
        // Facilitator can tune the rate per-team from the AdminPanel
        // if the table negotiates a different number.
        effect: { recurringStaffSurchargePct: 0.10, loyaltyDelta: 3 },
        effectTags: ["+10% staff cost / Q", "Loyalty +3%"] },
      { id: "C", label: "Decline to counter",
        description: "Promote internal successors.",
        effect: { opsPts: 5, loyaltyDelta: 2 },
        effectTags: ["Ops +5", "Loyalty +2%"] },
      { id: "D", label: "Conduct Executive Search",
        description: "Current executives have been around for too long — it's time to source some of the best experts in the industry to join our team. Retain a top search firm and refresh the leadership bench with outside hires.",
        // Cash outlay reflects search-firm fees + sign-on packages,
        // ops bump from sharper outside-perspective talent, brand bump
        // from the trade-press story of fresh leadership.
        effect: { cash: -8 * M, opsPts: 12, brandPts: 6, loyaltyDelta: -2 },
        effectTags: ["−$8M", "Ops +12", "Brand +6", "Loyalty −2%"] },
    ],
    autoSubmitOptionId: "C",
    notes: "Option A flags the team for facilitator-set counter cost; admin enters the figure in AdminPanel. Option B applies a recurring +10% staff cost surcharge tunable from AdminPanel.",
  },
  {
    id: "S15", title: "The Recession Gamble", quarter: 27, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Recession deepening. Cut deep, cut light, hold, or invest counter-cyclical?",
    context:
      "Demand is collapsing. Every airline is cutting. The choice is how deep to cut payroll — your headcount runs at quarterly staff cost, and savings here scale with the size of your operation.",
    options: [
      { id: "A", label: "Mass redundancy",
        description: "Cut deep — release ~50% of payroll for two quarters. Brand and loyalty take major hits.",
        effect: {
          staffSavingsPct: 0.5, brandPts: -20, loyaltyDelta: -10,
          // Recession ends earlier than expected — mass-redundancy
          // teams have to hire back at premium and earn the talent-
          // shortage flag, which weighs on ops downstream.
          deferred: {
            lagQuarters: 5,
            effect: {
              cash: -80_000_000, opsPts: -10,
              setFlags: ["talent_shortage"],
            },
            note: "Recession ends · forced rehire at premium (−$80M, ops penalty)",
          },
        },
        effectTags: ["Savings ≈ 50% of 2Q staff cost"],
        blockedByFlags: ["gov_board_card", "redundancy_freeze"] },
      { id: "B", label: "Temporary measures",
        description: "Furloughs, hiring freeze, OT cuts — release ~25% of payroll for two quarters. Full recovery when the recession breaks.",
        effect: { staffSavingsPct: 0.25, brandPts: -5, loyaltyDelta: -3 },
        effectTags: ["Savings ≈ 25% of 2Q staff cost"] },
      { id: "C", label: "Hold the team",
        description: "Don't cut anyone. No payroll savings — you're paying the full bill — but earn the trusted-employer flag for hiring upside later.",
        effect: { brandPts: 10, loyaltyDelta: 5, setFlags: ["trusted_employer"] },
        effectTags: [] },
      { id: "D", label: "Counter-cyclical",
        description: "Invest while rivals retreat. Future upside if demand snaps back.",
        effect: {
          cash: -30 * M, brandPts: 15, loyaltyDelta: 8,
          // Counter-cyclical pays off when recession ends and demand
          // snaps back — capacity built during the dip captures the
          // recovery premium.
          deferred: {
            lagQuarters: 5,
            effect: { cash: 120_000_000, brandPts: 5 },
            note: "Recession ends · counter-cyclical capacity captures recovery (+$120M)",
          },
        },
        effectTags: ["−$30M", "Future upside"] },
    ],
    autoSubmitOptionId: "A",
    notes: "Option A blocked if gov_board_card flag (redundancy freeze) is active. Savings on A/B are computed as staffSavingsPct × current quarterly staff cost × 2.",
  },
  {
    id: "S16", title: "The Moscow Signal", quarter: 9, severity: "HIGH", timeLimitMinutes: 30,
    teaser: "Intelligence signal: corridor may close. Lock in aggressive cuts or hold?",
    context:
      "Signal intelligence suggests the Moscow corridor may close. Commit to aggressive mitigation (lock-in 1-4 quarters), or trust it's a false alarm.",
    options: [
      { id: "A", label: "Aggressive — full shutdown",
        description: "Cut exposed flying hard. Near-term savings scale with your recent revenue; over-locking can miss the rebound.",
        effect: {
          scaledCash: { basis: "lastRevenueQ", multiplier: 0.06, min: 12 * M, max: 90 * M },
          opsPts: -2,
          // False-alarm reveal: aggressive cutters miss the summer
          // surge. Penalty scales with revenue.
          deferred: {
            lagQuarters: 4,
            effect: {
              scaledCash: { basis: "lastRevenueQ", multiplier: -0.10, min: -180 * M, max: -20 * M },
              loyaltyDelta: -4,
            },
            note: "False alarm · over-locked, missed summer surge (loyalty −4)",
          },
        }, effectTags: ["Savings scale with revenue", "Lock-in 1-4 quarters"] },
      { id: "B", label: "Moderate — partial",
        description: "Trim exposure without fully walking away from demand.",
        effect: {
          scaledCash: { basis: "lastRevenueQ", multiplier: 0.03, min: 6 * M, max: 50 * M },
          // Partial lock — moderate-cut teams also miss some upside.
          deferred: {
            lagQuarters: 4,
            effect: {
              scaledCash: { basis: "lastRevenueQ", multiplier: -0.05, min: -90 * M, max: -10 * M },
              loyaltyDelta: -2,
            },
            note: "False alarm · partial lock missed summer surge",
          },
        }, effectTags: ["Savings scale with revenue", "Lock-in 1-4 quarters"] },
      { id: "C", label: "Invest in protocols",
        description: "Prepare operations without cutting demand. Protocol cost scales with fleet size.",
        effect: {
          scaledCash: { basis: "fleetValue", multiplier: -0.004, min: -18 * M, max: -1.5 * M },
          brandPts: 5,
          loyaltyDelta: 2,
        },
        effectTags: ["Protocol cost scales with fleet"] },
      { id: "D", label: "Counter-position",
        description: "Grab competitor bookings. Aggressive upside.",
        effect: {
          scaledCash: { basis: "lastRevenueQ", multiplier: -0.025, min: -45 * M, max: -5 * M },
          brandPts: 15,
          loyaltyDelta: 8,
          // Counter-position carriers absorbed the summer surge that
          // aggressive cutters left on the table.
          deferred: {
            lagQuarters: 4,
            effect: {
              scaledCash: { basis: "lastRevenueQ", multiplier: 0.08, min: 15 * M, max: 120 * M },
            },
            note: "False alarm · counter-position captured competitor bookings",
          },
        },
        effectTags: ["Marketing push scales with revenue"] },
    ],
    autoSubmitOptionId: "A",
    notes: "False alarm reveal four quarters later. Lock-in teams miss the summer surge.",
  },
  {
    id: "S17", title: "The Green Ultimatum", quarter: 33, severity: "MEDIUM", timeLimitMinutes: 30,
    teaser: "Carbon levy lands this quarter. Absorb, pass through, invest in SAF, or challenge legally?",
    context:
      "A $45/tonne carbon levy takes effect this quarter. Annual cost $55M if unmitigated. Response defines your ESG posture for the rest of the game.",
    options: [
      { id: "A", label: "Absorb the cost",
        description: "Eat the levy. Hold pricing. Brand modestly positive.",
        effect: { brandPts: 10, loyaltyDelta: 4, setFlags: ["sustainability_signal", "carbon_levy_active"] },
        effectTags: ["Annual cost −$55M"] },
      { id: "B", label: "Pass-through surcharge",
        description: "Add a green surcharge to fares. Revenue-neutral, brand cost.",
        effect: { brandPts: -8, loyaltyDelta: -3, setFlags: ["carbon_levy_active"] },
        effectTags: [] },
      { id: "C", label: "Invest in SAF",
        description: "Sustainable aviation fuel program. Levy drops 40% after the transition period.",
        effect: { cash: -80 * M, brandPts: 20, loyaltyDelta: 8, setFlags: ["green_leader", "carbon_levy_active"] },
        effectTags: ["−$80M"] },
      { id: "D", label: "Legal challenge",
        description: "30% success — levy waived. 70% full levy applies + brand penalty.",
        effect: { cash: -8 * M,
          deferred: { quarter: 35, probability: 0.7,
            effect: { brandPts: -15, setFlags: ["anti_environment", "carbon_levy_active"] } } },
        effectTags: ["−$8M"] },
    ],
    autoSubmitOptionId: "D",
  },
  {
    id: "S18", title: "The Cocoa Crisis", quarter: 17, severity: "LOW", timeLimitMinutes: 30,
    teaser: "West African cocoa supply has collapsed and prices have tripled.",
    context:
      "Passengers onboard our flights have come to love the signature chocolate we serve in premium cabins — it's a small ritual that's quietly become part of why business and first-class travellers choose us. With the West African cocoa supply collapse, the program now costs triple. How do we respond without losing what made it special?",
    options: [
      { id: "A", label: "Pay the premium",
        description: "Hold the line on quality. Passengers won't notice anything changed.",
        effect: { brandPts: 3, loyaltyDelta: 2 },
        effectTags: ["Annual cost −$4.2M"] },
      { id: "B", label: "Drop chocolate service",
        description: "Cut the program entirely. The ritual disappears from the cabin.",
        effect: { brandPts: -10, loyaltyDelta: -8, opsPts: -3 },
        effectTags: ["Annual savings +$12M"] },
      { id: "C", label: "Switch to a budget supplier",
        description: "Keep something on the menu but at a lower grade. Passengers will notice the difference.",
        effect: { brandPts: -5, loyaltyDelta: -3 },
        effectTags: [] },
      { id: "D", label: "Rebrand as ethical, single-origin sourcing",
        description: "Reframe the moment as a values-led choice. The market may either reward or punish the spin.",
        effect: {}, effectTags: ["Annual cost −$6M"] },
    ],
    autoSubmitOptionId: "B",
  },
];

export const SCENARIOS_BY_QUARTER: Record<number, Scenario[]> = SCENARIOS.reduce(
  (acc, s) => {
    (acc[s.quarter] ??= []).push(s);
    return acc;
  },
  {} as Record<number, Scenario[]>,
);
