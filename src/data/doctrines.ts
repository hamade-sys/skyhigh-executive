import type { DoctrineId } from "@/types/game";
import {
  Zap, Gem, PackageCheck, Globe2, type LucideIcon,
} from "lucide-react";

export interface Doctrine {
  id: DoctrineId;
  /** Lucide icon component for the doctrine card. Each pick is meant
   *  to read at-a-glance for the strategy:
   *    - Budget Airline      → Zap          (speed + lean cost-efficiency)
   *    - Premium Airline     → Gem          (luxury, high-yield positioning)
   *    - Cargo Dominance     → PackageCheck (freight, parcel handling)
   *    - Global Network      → Globe2       (interconnected world map)
   *  Renderers wrap the icon in a tinted ring tile (ICAN brand
   *  pattern: 4px ring + 50-tone fill + 700-tone stroke). */
  Icon: LucideIcon;
  /** Hex/CSS color for the icon's tint pad. Drives the ring + fill.
   *  Pulled from the project's existing accent palette so the
   *  doctrine cards stay visually cohesive with the rest of the
   *  game UI. */
  iconAccent: "amber" | "violet" | "emerald" | "cyan";
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
    Icon: Zap,
    iconAccent: "amber",
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
    Icon: Gem,
    iconAccent: "violet",
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
    Icon: PackageCheck,
    iconAccent: "emerald",
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
    Icon: Globe2,
    iconAccent: "cyan",
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

/** Tailwind class strings for the icon pad (background fill + ring +
 *  stroke color). Resolves the doctrine's `iconAccent` to the actual
 *  classes used by the renderers. Centralised here so both the
 *  onboarding card and the OverviewPanel review modal pick up the
 *  same palette without copy-pasting class strings. */
export const DOCTRINE_ICON_TINT: Record<Doctrine["iconAccent"], string> = {
  amber:   "bg-amber-50 text-amber-700 ring-amber-100",
  violet:  "bg-violet-50 text-violet-700 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  cyan:    "bg-cyan-50 text-cyan-700 ring-cyan-100",
};

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
