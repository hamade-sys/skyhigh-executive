import type { DoctrineId } from "@/types/game";

export interface Doctrine {
  id: DoctrineId;
  icon: string;
  name: string;
  tagline: string;
  description: string;
  effects: string[];
}

type VisibleDoctrineId = Exclude<DoctrineId, "safety-first">;

// Player-facing doctrine effect tags. These are intentionally
// qualitative — the actual numerical magnitudes live in the engine
// constants (engine.ts: doctrine bonuses) and stay invisible to the
// player so the card reads as a strategic choice, not a min-max
// optimisation puzzle. Engineers tune the numbers; players see
// "Lower crisis impact" not "−30% crisis impact".
export const DOCTRINES: Array<Doctrine & { id: VisibleDoctrineId }> = [
  {
    id: "budget-expansion",
    icon: "↘",
    name: "Budget Airline",
    tagline: "Fast turns, lean costs, wider reach.",
    description:
      "Build around access and efficiency. You reach more price-sensitive travelers through Tier 2 and Tier 3 airports, but downturns hit harder.",
    effects: [
      "Higher demand from secondary markets",
      "Lower staff cost",
      "Lower maintenance cost",
      "Faster ground turnaround",
      "Larger downside in negative demand shocks",
    ],
  },
  {
    id: "premium-service",
    icon: "★",
    name: "Premium Airline",
    tagline: "Protect yield and loyalty.",
    description:
      "Compete on service, brand trust, and cabin quality. You can price above the market and recover loyalty faster, with a heavier people-cost base.",
    effects: [
      "Higher fare ceiling",
      "Stronger positive loyalty gains",
      "Reduced damage from negative demand shocks",
      "Higher staff cost",
    ],
  },
  {
    id: "cargo-dominance",
    icon: "☐",
    name: "Cargo Dominance",
    tagline: "Make the network move freight.",
    description:
      "Use every connection as a logistics corridor. Cargo capacity and cargo turnarounds improve, while connected cities compound freight demand.",
    effects: [
      "Additional cargo capacity",
      "Faster cargo-fleet ground time",
      "No belly-cargo ground penalty",
      "Increased cargo demand for connected cities",
    ],
  },
  {
    id: "global-network",
    icon: "◉",
    name: "Global Network Airline",
    tagline: "Connectivity compounds demand.",
    description:
      "Grow a connected international system. Passenger demand rises across linked cities and crises hurt less, but mixed fleet brands become more expensive to maintain.",
    effects: [
      "Increased passenger demand for connected cities",
      "Lower crisis impact",
      "Stronger preference for premium cabins",
      "Higher maintenance cost when running mixed fleet brands",
    ],
  },
];

const visibleDoctrines = DOCTRINES.reduce(
  (acc, d) => {
    acc[d.id] = d;
    return acc;
  },
  {} as Record<Exclude<DoctrineId, "safety-first">, Doctrine>,
);

export const DOCTRINE_BY_ID: Record<DoctrineId, Doctrine> = {
  ...visibleDoctrines,
  "safety-first": {
    ...visibleDoctrines["global-network"],
    id: "safety-first",
  },
};
