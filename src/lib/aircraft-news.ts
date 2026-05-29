import { AIRCRAFT } from "@/data/aircraft";
import { effectiveUnlockQuarter } from "@/lib/engine";
import type { AircraftSpec, NewsItem } from "@/types/game";

/**
 * Catalogue-driven aircraft-availability headlines for the 2000-2014 era
 * of the FULL campaign (live quarters 1-60).
 *
 * Why this exists: WORLD_NEWS is authored against the 2015-start, 60-round
 * timeline, so in a full game it only covers live quarters 61-120 (see the
 * -60 news offset in `newsForQuarter`). Quarters 1-60 (years 2000-2014)
 * carry no scripted news at all — which means a player flying through 2005
 * or 2006 never hears that the E175, E190, E195 or 777-200LR have entered
 * service, even though those airframes ARE orderable (the market modal
 * gates correctly on `effectiveUnlockQuarter`). The releases happened
 * silently. This generator closes that gap by deriving the announcements
 * straight from the catalogue, so they can never drift out of sync with
 * the unlock schedule.
 *
 * For every OTHER era/mode this returns `[]`: the half campaign and the
 * 2015-2029 half of the full campaign already get hand-authored "now
 * available for purchase" headlines from WORLD_NEWS, and emitting here too
 * would double up.
 */
const fmtPriceM = (usd: number) => `$${Math.round(usd / 1_000_000)}M`;

/** "A", "A and B", "A, B and C" */
function joinNames(specs: AircraftSpec[]): string {
  const names = specs.map((s) => s.name);
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function describe(spec: AircraftSpec): string {
  const price = fmtPriceM(spec.buyPriceUsd);
  if (spec.family === "cargo") {
    return `${spec.name}: ${price} freighter, ${spec.rangeKm.toLocaleString("en-AE")}km range`;
  }
  const seats =
    (spec.seats?.first ?? 0) +
    (spec.seats?.business ?? 0) +
    (spec.seats?.economy ?? 0);
  return `${spec.name}: ${price}, ${seats} seats, ${spec.rangeKm.toLocaleString("en-AE")}km range`;
}

export function dynamicAircraftReleaseNews(
  quarter: number,
  campaignMode: "half" | "full" | undefined,
): NewsItem[] {
  // Only the uncovered 2000-2014 window of the full campaign.
  if (campaignMode !== "full") return [];
  if (quarter < 1 || quarter > 60) return [];

  const releasing: AircraftSpec[] = [];
  const announcing: AircraftSpec[] = [];
  for (const a of AIRCRAFT) {
    const unlock = effectiveUnlockQuarter(a, "full");
    // Skip the day-1 starter catalogue — those aren't "new releases".
    if (unlock <= 1) continue;
    if (unlock === quarter) releasing.push(a);
    else if (unlock - 2 === quarter) announcing.push(a);
  }

  const out: NewsItem[] = [];

  if (announcing.length > 0) {
    const verb = announcing.length > 1 ? "enter service" : "enters service";
    out.push({
      id: `Q${quarter}-AC-ANNOUNCE`,
      quarter,
      icon: "🛫",
      impact: "ops",
      headline: `${joinNames(announcing)} ${verb} in 2 quarters — pre-orders open now`,
      detail: `${announcing.map(describe).join(". ")}. Reserve a delivery slot now; the airframe${announcing.length > 1 ? "s" : ""} can be deployed once delivered.`,
    });
  }

  if (releasing.length > 0) {
    const verb = releasing.length > 1 ? "are" : "is";
    out.push({
      id: `Q${quarter}-AC-RELEASE`,
      quarter,
      icon: "✈️",
      impact: "ops",
      headline: `${joinNames(releasing)} now available for purchase`,
      detail: `${releasing.map(describe).join(". ")}. ${releasing.length > 1 ? "These airframes" : "This airframe"} ${verb} now orderable in the aircraft market.`,
    });
  }

  return out;
}
