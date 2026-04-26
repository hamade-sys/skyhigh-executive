import type { SubsidiaryType } from "@/types/game";

/**
 * Catalog of subsidiary businesses an airline can build at any of its
 * network cities. Each entry defines:
 *  - setup cost (paid up-front)
 *  - quarterly revenue at full condition
 *  - operational bonus (if any) the engine applies elsewhere
 *
 * The intent: replace the "weak Network" placeholder with a real
 * Investments tab full of options for diversifying revenue beyond
 * aviation. Some subsidiaries (maintenance hub, fuel storage,
 * lounge) also grant the original PRD hub-investment bonuses; those
 * stack via team.hubInvestments which is set when the subsidiary is
 * built and unset when it's sold.
 *
 * Pricing follows a "gateway then operating leverage" curve:
 *  - Hotel:           $40M setup → $1.5M/qtr  (4% net yield)
 *  - Limo service:    $8M setup  → $0.6M/qtr  (7.5% — operational asset)
 *  - Lounge:          $12M setup → $0.8M/qtr  + F/C occupancy bonus
 *  - Maintenance hub: $50M setup → break-even revenue, 20% maint discount
 *  - Fuel storage:    $20M setup → enables bulk-buy 25% discount
 *  - Catering:        $15M setup → $1.0M/qtr  + small ops bonus
 *  - Training academy: $30M setup → $0.9M/qtr + ops bonus
 *
 * Numbers are per-asset; some types grant a stronger benefit when
 * placed at a hub vs a secondary city — the engine handles that
 * selectively (e.g. maintenance hub bonus only fires for fleet based
 * at the city, fuel storage only for routes departing that city).
 */
export interface SubsidiaryCatalogEntry {
  type: SubsidiaryType;
  name: string;
  description: string;
  /** One-line elevator pitch shown on the investment card. */
  pitch: string;
  setupCostUsd: number;
  /** Revenue per quarter at condition 1.0. */
  revenuePerQuarterUsd: number;
  /** Short label describing the operational bonus, if any. */
  operationalBonus?: string;
  /** Lucide icon name (rendered by the UI). */
  icon: "BuildingMarket" | "Car" | "Coffee" | "Wrench" | "Fuel" | "Utensils" | "GraduationCap";
}

export const SUBSIDIARY_CATALOG: SubsidiaryCatalogEntry[] = [
  {
    type: "hotel",
    name: "Airport Hotel",
    description: "Premium 5-star airport hotel under the airline's brand. Captures business-traveller layover revenue and reinforces the loyalty programme.",
    pitch: "Diversify earnings beyond ticket sales. Hotel revenue compounds steadily through downturns.",
    setupCostUsd: 40_000_000,
    revenuePerQuarterUsd: 1_500_000,
    icon: "BuildingMarket",
  },
  {
    type: "limo",
    name: "Limo & Chauffeur Service",
    description: "Door-to-door luxury ground transfer service for first and business class passengers in selected cities.",
    pitch: "Higher-value passengers stay longer in your loyalty programme.",
    setupCostUsd: 8_000_000,
    revenuePerQuarterUsd: 600_000,
    operationalBonus: "+2% F/C loyalty retention at this city",
    icon: "Car",
  },
  {
    type: "lounge",
    name: "Premium Lounge",
    description: "Branded business and first-class lounge at the city's main airport. Improves F/C cabin yield on routes through this airport.",
    pitch: "Owns the premium experience end-to-end. Subsidy + occupancy uplift.",
    setupCostUsd: 12_000_000,
    revenuePerQuarterUsd: 800_000,
    operationalBonus: "+8% F/C occupancy on routes touching this airport",
    icon: "Coffee",
  },
  {
    type: "maintenance-hub",
    name: "Maintenance Hub (MRO)",
    description: "Owned-and-operated heavy-maintenance base at the city. Reduces costs for any of your aircraft based here.",
    pitch: "Best ROI when 8+ aircraft are based here. Token revenue, big cost savings.",
    setupCostUsd: 50_000_000,
    revenuePerQuarterUsd: 250_000,
    operationalBonus: "−20% maintenance for fleet based at this city",
    icon: "Wrench",
  },
  {
    type: "fuel-storage",
    name: "Fuel Reserve Depot",
    description: "Bulk Jet A1 storage at the city. Unlocks bulk-buy 25% off market fuel and a 15% fuel discount on routes from this city.",
    pitch: "Hedge fuel volatility and capture below-market pricing.",
    setupCostUsd: 20_000_000,
    revenuePerQuarterUsd: 0,
    operationalBonus: "Bulk fuel @ 25% off + 15% fuel discount on routes from here",
    icon: "Fuel",
  },
  {
    type: "catering",
    name: "Catering Kitchen",
    description: "Owned in-flight catering operation at the city. Small standalone revenue plus operational efficiency for departing flights.",
    pitch: "Steady margin, captures the catering markup that would otherwise go to a third party.",
    setupCostUsd: 15_000_000,
    revenuePerQuarterUsd: 1_000_000,
    operationalBonus: "+1 ops point per quarter while owned",
    icon: "Utensils",
  },
  {
    type: "training-academy",
    name: "Training Academy",
    description: "Pilot, cabin crew and engineer training school. Generates third-party revenue while ensuring your own crews are world-class.",
    pitch: "Professional revenue + ops uplift. Looks great in the prospectus.",
    setupCostUsd: 30_000_000,
    revenuePerQuarterUsd: 900_000,
    operationalBonus: "+2 ops points per quarter while owned",
    icon: "GraduationCap",
  },
];

export const SUBSIDIARY_BY_TYPE: Record<SubsidiaryType, SubsidiaryCatalogEntry> =
  Object.fromEntries(SUBSIDIARY_CATALOG.map((s) => [s.type, s])) as Record<SubsidiaryType, SubsidiaryCatalogEntry>;

/** Quarterly appreciation rate while held — value approaches a 1.5×
 *  ceiling vs the original purchase price. Mirrors how a real-world
 *  asset compound while in operation. Resells happen at this market
 *  value minus a 5% broker fee. */
export const SUBSIDIARY_QUARTERLY_APPRECIATION = 0.02;
export const SUBSIDIARY_VALUE_CEILING_MULT = 1.5;
export const SUBSIDIARY_BROKER_FEE_PCT = 0.05;
