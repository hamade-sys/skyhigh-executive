/**
 * Milestone catalog (PRD E8.9).
 *
 * The catalog is a single source of truth for both the engine (which
 * decides when to award a milestone) and the UI (which shows progress
 * toward un-earned milestones). Engine matches by `id`.
 *
 * Each milestone is small enough that the player feels each one as a
 * concrete achievement; together they shape long-term identity.
 */

export interface MilestoneSpec {
  /** Stable id used as the persisted string in Team.milestones. Must match
   *  exactly what `engine.runQuarterClose()` calls `earn()` with. */
  id: string;
  /** Short title shown in chips. */
  title: string;
  /** One-sentence flavor + what it rewards. */
  description: string;
  /** Hint shown for unearned milestones (what to do to get it). */
  hint: string;
  /** "Identity" milestones ship with the game; "operational" you grind toward. */
  category: "identity" | "operational" | "financial" | "fleet" | "service";
  /** Loose order — easier ones first. Used purely for display sorting. */
  difficulty: 1 | 2 | 3;
}

export const MILESTONES: MilestoneSpec[] = [
  {
    id: "First Cargo Route",
    title: "First Cargo Route",
    description: "Diversify revenue beyond passengers. +5 ops.",
    hint: "Open a route in cargo mode.",
    category: "operational",
    difficulty: 1,
  },
  {
    id: "First Class Service Active",
    title: "First-Class Service",
    description: "Operate at least one widebody flying first-class. +3 brand.",
    hint: "Add an aircraft with a first-class cabin and put it on a route.",
    category: "service",
    difficulty: 2,
  },
  {
    id: "Fleet of 10",
    title: "Fleet of 10",
    description: "Operate 10 active aircraft. +5 ops.",
    hint: "Buy or lease enough aircraft to reach 10 active.",
    category: "fleet",
    difficulty: 1,
  },
  {
    id: "10 Active Routes",
    title: "10 Active Routes",
    description: "Build a real network. +5 brand, +2% loyalty.",
    hint: "Operate ten routes simultaneously.",
    category: "operational",
    difficulty: 1,
  },
  {
    id: "International Network",
    title: "International Network",
    description: "Three continents in your active map. +8 brand.",
    hint: "Open routes touching cities in three different regions.",
    category: "identity",
    difficulty: 2,
  },
  {
    id: "Eco Pioneer",
    title: "Eco Pioneer",
    description: "Half your fleet on eco engines. +3 brand, +2% loyalty.",
    hint: "Eco-upgrade or eco-spec at least half of your active aircraft.",
    category: "fleet",
    difficulty: 2,
  },
  {
    id: "Profit Streak",
    title: "Profitability Streak",
    description: "Four consecutive profitable quarters. +5 brand, +3% loyalty.",
    hint: "Run four quarters in a row in the black.",
    category: "financial",
    difficulty: 2,
  },
  {
    id: "Brand A+",
    title: "Brand A+",
    description: "Reach the highest brand rating. +5 ops, +5% loyalty.",
    hint: "Push brand pts and loyalty high enough for an A+ grade.",
    category: "identity",
    difficulty: 3,
  },
  {
    id: "Network Builder",
    title: "Network Builder",
    description: "Twenty-five active routes. +5 brand, +5% loyalty.",
    hint: "Scale to 25 simultaneously active routes.",
    category: "operational",
    difficulty: 3,
  },
  {
    id: "Premium Pioneer",
    title: "Premium Pioneer",
    description: "Five routes priced at ultra. +8 brand, +3% loyalty.",
    hint: "Set five active routes to the ultra-premium price tier.",
    category: "service",
    difficulty: 3,
  },
  {
    id: "Loyal Following",
    title: "Loyal Following",
    description: "80%+ customer loyalty. +5 brand.",
    hint: "Drive customer loyalty above 80%.",
    category: "service",
    difficulty: 3,
  },
  {
    id: "Hub & Spoke",
    title: "Hub & Spoke",
    description: "Three secondary hubs activated. +10 ops, +5 brand.",
    hint: "Activate three secondary hubs after Q3.",
    category: "operational",
    difficulty: 3,
  },
];

export const MILESTONES_BY_ID: Record<string, MilestoneSpec> = MILESTONES.reduce(
  (acc, m) => {
    acc[m.id] = m;
    return acc;
  },
  {} as Record<string, MilestoneSpec>,
);
