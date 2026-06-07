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
 *  - Hotel:           $40M setup → $1.5M/qtr  (4% net yield) + city-side demand pull
 *  - Limo service:    $8M setup  → $0.6M/qtr  (7.5%) + city-side business demand pull
 *  - Lounge:          $12M setup → $0.8M/qtr  + strongest city-side demand pull
 *  - Maintenance hub: $50M setup → break-even revenue, 20% maint discount
 *  - Fuel storage:    $20M setup → enables bulk-buy 25% discount
 *  - Catering:        $15M setup → $1.0M/qtr  + small per-route demand pull
 *  - Training academy: $30M setup → $0.9M/qtr + ops bonus
 *
 * TIERS (basic → premium → flagship):
 *  Each upgrade pays +50% of the original setupCost and multiplies
 *  revenue (1.0× / 1.6× / 2.8×) AND the demand-side bonus (1.0× /
 *  1.3× / 1.7×). Total invested at flagship = 2.0× setupCost.
 *  At flagship, marginal ROI is roughly 2.4× the base build's ROI —
 *  intentionally so "expand existing flagship" is the dominant
 *  late-game move once the network has stabilised.
 *
 * Numbers are per-asset; some types grant a stronger benefit when
 * placed at a hub vs a secondary city — the engine handles that
 * selectively (e.g. maintenance hub bonus only fires for fleet based
 * at the city, fuel storage only for routes departing that city).
 */
/** Investment grouping for the redesigned Investments panel:
 *  - "operations": cost-leverage infrastructure you build & run (MRO,
 *    catering, training, fuel). Framed as operational upgrades.
 *  - "assets": brand & revenue assets tied to cities you fly (lounge,
 *    chauffeur, hotel). Leveled up basic → premium → flagship.
 *  (A third category, dynamic Subsidiary M&A, is a separate system —
 *  time-boxed acquisition opportunities, not catalogue builds.) */
export type InvestmentCategory = "operations" | "assets";

export interface SubsidiaryCatalogEntry {
  type: SubsidiaryType;
  name: string;
  category: InvestmentCategory;
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
    category: "assets",
    name: "Airport Hotel",
    description: "Premium 5-star airport hotel under the airline's brand. Captures business-traveller layover revenue and quietly steers loyalty programme members onto YOUR flights when they fly out of this city.",
    pitch: "Steady non-aviation income + a real demand pull on every route through this airport. Flagship hotels at both endpoints can push +6% revenue on the OD.",
    setupCostUsd: 40_000_000,
    revenuePerQuarterUsd: 1_500_000,
    operationalBonus: "+1.8% × tier × condition route revenue through this city",
    icon: "BuildingMarket",
  },
  {
    type: "limo",
    category: "assets",
    name: "Limo & Chauffeur Service",
    description: "Door-to-door luxury ground transfer for business and first class passengers. Real edge against rivals on shared OD pairs — high-yield travellers will swap carriers for a $0 limo home.",
    pitch: "Cheapest demand-side bet in the catalogue. Pairs especially well with a Premium Lounge at the same city.",
    setupCostUsd: 8_000_000,
    revenuePerQuarterUsd: 600_000,
    operationalBonus: "+1.5% × tier × condition route revenue through this city",
    icon: "Car",
  },
  {
    type: "lounge",
    category: "assets",
    name: "Premium Lounge",
    description: "Branded business and first-class lounge at the city's main airport. Premium passengers preferentially route through hubs with a strong lounge — Emirates DXB and Qatar DOH anchor their carrier's share this way.",
    pitch: "Strongest demand pull in the catalogue. Flagship lounge at both endpoints = +8.5% revenue on the OD.",
    setupCostUsd: 12_000_000,
    revenuePerQuarterUsd: 800_000,
    operationalBonus: "+2.5% × tier × condition route revenue through this city",
    icon: "Coffee",
  },
  {
    type: "maintenance-hub",
    category: "operations",
    name: "Maintenance Hub (MRO)",
    description: "Owned-and-operated heavy-maintenance base at the city. Reduces costs for any of your aircraft based here.",
    pitch: "Best ROI when 8+ aircraft are based here. Token revenue, big cost savings.",
    setupCostUsd: 50_000_000,
    revenuePerQuarterUsd: 250_000,
    operationalBonus: "−20% maintenance for fleet based at this city",
    icon: "Wrench",
  },
  {
    type: "catering",
    category: "operations",
    name: "Catering Kitchen",
    description: "Owned in-flight catering at the city. Drops third-party markups, lifts perceived service quality, gives every route through this city a small demand pull.",
    pitch: "Cheap, broad-stroke uplift. Small per-route bump that adds up across a 5+ route network.",
    setupCostUsd: 15_000_000,
    revenuePerQuarterUsd: 1_000_000,
    operationalBonus: "+1% × tier × condition route revenue through this city",
    icon: "Utensils",
  },
  {
    type: "training-academy",
    category: "operations",
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
