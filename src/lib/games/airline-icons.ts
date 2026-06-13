import {
  Plane,
  PlaneTakeoff,
  Send,
  Navigation,
  Rocket,
  Globe,
  Compass,
  Orbit,
  Waypoints,
  Bird,
  Feather,
  Sun,
  Sunrise,
  Cloud,
  Mountain,
  Wind,
  Star,
  Crown,
  Gem,
  Shield,
  type LucideIcon,
} from "lucide-react";

/**
 * Airline logo / emblem set (D-007). A player optionally picks one of
 * these 20 Lucide marks as their airline's logo at onboarding; it then
 * renders everywhere the brand mark appears — TopBar, leaderboard, route
 * map, chat, the endgame podium — colored by the airline's chosen color.
 *
 * Why this shape, mirroring `airline-colors.ts`:
 *   - Lucide only (ICAN brand rule: vector, themeable, no emoji/raster).
 *   - 20 distinct silhouettes that stay legible at ~16px, themed around
 *     aviation, the sky, the world, and prestige — the language airlines
 *     actually brand with (a jet, an ascent, a globe, a bird, a crown).
 *   - The logo is DECORATIVE reinforcement layered on the color, never the
 *     only signal: the airline name + IATA code are always present nearby,
 *     and unlike color the logo carries NO uniqueness constraint — two
 *     airlines may share an emblem because their color tells them apart.
 *   - There is no deterministic fallback emblem. A team with no chosen
 *     logo (legacy rows, bots, players who skip) falls back to its IATA
 *     CODE LETTERS in the mark — the pre-D-007 look — so nothing regresses.
 *
 * Stable ids are stored in the DB + engine state; don't rename them.
 */

export type AirlineIconId =
  | "plane"
  | "takeoff"
  | "send"
  | "navigation"
  | "rocket"
  | "globe"
  | "compass"
  | "orbit"
  | "waypoints"
  | "bird"
  | "feather"
  | "sun"
  | "sunrise"
  | "cloud"
  | "mountain"
  | "wind"
  | "star"
  | "crown"
  | "gem"
  | "shield";

export interface AirlineIcon {
  /** Stable id stored in the DB and engine state. Don't rename. */
  id: AirlineIconId;
  /** Human-readable label for picker tiles + screen readers. */
  label: string;
  /** The Lucide component to render. */
  Icon: LucideIcon;
}

export const AIRLINE_ICON_SET: readonly AirlineIcon[] = [
  { id: "plane",      label: "Jet",      Icon: Plane },
  { id: "takeoff",    label: "Ascent",   Icon: PlaneTakeoff },
  { id: "send",       label: "Arrow",    Icon: Send },
  { id: "navigation", label: "Delta",    Icon: Navigation },
  { id: "rocket",     label: "Rocket",   Icon: Rocket },
  { id: "globe",      label: "Globe",    Icon: Globe },
  { id: "compass",    label: "Compass",  Icon: Compass },
  { id: "orbit",      label: "Orbit",    Icon: Orbit },
  { id: "waypoints",  label: "Network",  Icon: Waypoints },
  { id: "bird",       label: "Bird",     Icon: Bird },
  { id: "feather",    label: "Feather",  Icon: Feather },
  { id: "sun",        label: "Sun",      Icon: Sun },
  { id: "sunrise",    label: "Sunrise",  Icon: Sunrise },
  { id: "cloud",      label: "Cloud",    Icon: Cloud },
  { id: "mountain",   label: "Summit",   Icon: Mountain },
  { id: "wind",       label: "Wind",     Icon: Wind },
  { id: "star",       label: "Star",     Icon: Star },
  { id: "crown",      label: "Crown",    Icon: Crown },
  { id: "gem",        label: "Gem",      Icon: Gem },
  { id: "shield",     label: "Shield",   Icon: Shield },
] as const;

export const AIRLINE_ICON_BY_ID: Record<AirlineIconId, AirlineIcon> =
  AIRLINE_ICON_SET.reduce(
    (acc, i) => {
      acc[i.id] = i;
      return acc;
    },
    {} as Record<AirlineIconId, AirlineIcon>,
  );

/**
 * Resolve a chosen logo by id. Returns null when no logo is set (or the
 * id is unknown) — callers fall back to the airline's IATA code letters,
 * which keeps legacy/bot airlines looking exactly as before.
 */
export function airlineIconFor(
  iconId: AirlineIconId | null | undefined,
): AirlineIcon | null {
  if (iconId && AIRLINE_ICON_BY_ID[iconId]) return AIRLINE_ICON_BY_ID[iconId];
  return null;
}

/** Type guard for runtime validation (route handlers, persistence
 *  loaders, store actions). */
export function isAirlineIconId(v: unknown): v is AirlineIconId {
  return (
    typeof v === "string" && AIRLINE_ICON_SET.some((i) => i.id === v)
  );
}

/**
 * Deterministic emblem for a bot (or any team that didn't pick one but
 * should still get a logo, e.g. lobby-seeded rivals). Unlike colors,
 * icons carry no uniqueness constraint, so we just hash a team-stable
 * key across the 20-icon set — same key always yields the same emblem,
 * and the spread keeps a cohort visually varied without a taken-set.
 */
export function pickIconForKey(key: string): AirlineIconId {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return AIRLINE_ICON_SET[hash % AIRLINE_ICON_SET.length].id;
}
