import type { Team, CrisisKind, CrisisOptionId } from "@/types/game";

/**
 * Macro-shock board calls (W1.8).
 *
 * When live conditions cross a severe threshold at quarter close, the
 * simulation raises a one-time strategic decision instead of silently
 * applying a demand/fuel modifier. The board splits the room three ways:
 *
 *   • Defensive  — protect cash now (hedge / ground), accept some pain.
 *   • Fly through — eat the cost, defend the franchise, bet on loyalty.
 *   • Pivot cargo — chase the freight upside the disruption creates.
 *
 * Each option has an IMMEDIATE effect (applied the moment the player
 * decides) and a DEFERRED payoff that settles two quarters later in the
 * digest — the "watch the bet land" moment. Magnitudes scale with fleet
 * size so the call matters at any airline scale, and the cargo options
 * scale harder with the number of freighter routes so cargo-doctrine
 * carriers are genuinely rewarded for the pivot.
 *
 * Pure module — no store/DOM access — so the store applies it and the
 * CrisisBoard renders it from the same source of truth, and it stays
 * probe-testable.
 */

/** Fuel index at/above which a fuel-spike board call is raised. Matches the
 *  existing `fuelStress` knee in the engine (0.5 stress at index 150). */
export const FUEL_SPIKE_THRESHOLD = 150;
/** Travel index at/below which a demand-collapse board call is raised. A
 *  normal market sits ~80–100; a pandemic/deep recession drops it under 50. */
export const DEMAND_COLLAPSE_THRESHOLD = 50;
/** Minimum quarters between board calls so a sustained shock doesn't raise a
 *  fresh decision every quarter it stays severe. */
export const CRISIS_COOLDOWN_QUARTERS = 6;
/** Quarters until a resolved crisis's deferred payoff settles. */
export const CRISIS_PAYOFF_DELAY = 2;

/** Per-aircraft cash unit the option magnitudes are built from. Keeps the
 *  board call material — a shock should move the needle — without dwarfing a
 *  well-run airline's balance sheet. */
const PER_PLANE_USD = 1_200_000;

export interface CrisisEffect {
  cashUsd: number;
  brandPts: number;
  loyaltyPct: number;
}

export interface CrisisOption {
  id: CrisisOptionId;
  label: string;
  /** What the player is choosing — board-room framing, second person. */
  blurb: string;
  immediate: CrisisEffect;
  deferred: CrisisEffect;
  /** Surfaced in the digest when the deferred payoff settles. */
  deferredHeadline: string;
  deferredDetail: string;
}

export interface CrisisMeta {
  /** Short tag, e.g. "Fuel shock". */
  eyebrow: string;
  title: string;
  /** The board-room situation framing. */
  situation: string;
}

/** Active aircraft + freighter-route count used to scale the option effects. */
function fleetScale(team: Team): { planes: number; freighters: number } {
  const planes = Math.max(3, (team.fleet ?? []).length);
  const freighters = (team.routes ?? []).filter(
    (r) => r.isCargo && r.status === "active",
  ).length;
  return { planes, freighters };
}

export function crisisMeta(
  kind: CrisisKind,
  fuelIndex: number,
  travelIndex: number,
): CrisisMeta {
  if (kind === "fuel-spike") {
    return {
      eyebrow: "Fuel shock",
      title: "Jet fuel has spiked",
      situation: `The fuel index just hit ${Math.round(
        fuelIndex,
      )} — roughly ${Math.max(
        0,
        Math.round(fuelIndex - 100),
      )}% above baseline. Every block hour now costs more. The board wants your call before the next schedule locks.`,
    };
  }
  return {
    eyebrow: "Demand shock",
    title: "Travel demand has collapsed",
    situation: `The travel index has crashed to ${Math.round(
      travelIndex,
    )} — flyers are staying home. Aircraft are leaving with empty seats. The board needs a survival posture, now.`,
  };
}

/**
 * The three options for a given crisis, with effects scaled to the team's
 * fleet. Immediate effects are applied at decision time; deferred effects
 * become a CrisisPayoff that settles `CRISIS_PAYOFF_DELAY` quarters later.
 */
export function crisisOptions(kind: CrisisKind, team: Team): CrisisOption[] {
  const { planes, freighters } = fleetScale(team);
  const u = PER_PLANE_USD;

  if (kind === "fuel-spike") {
    return [
      {
        id: "defensive",
        label: "Hedge & trim",
        blurb:
          "Lock a fuel hedge at today's elevated price and park your thinnest-margin aircraft until the spike passes.",
        immediate: { cashUsd: -Math.round(u * planes * 0.4), brandPts: -2, loyaltyPct: 0 },
        deferred: { cashUsd: Math.round(u * planes * 1.2), brandPts: 0, loyaltyPct: 0 },
        deferredHeadline: "Fuel hedge paid off",
        deferredDetail:
          "Your hedge capped the fuel bill while rivals bought spot at the peak.",
      },
      {
        id: "fly-through",
        label: "Absorb it",
        blurb:
          "Keep the whole network flying and eat the higher fuel bill. Flyers remember the airline that never blinked.",
        immediate: { cashUsd: -Math.round(u * planes * 0.8), brandPts: 0, loyaltyPct: 3 },
        deferred: { cashUsd: Math.round(u * planes * 0.7), brandPts: 3, loyaltyPct: 4 },
        deferredHeadline: "Reliability rewarded",
        deferredDetail:
          "You held the schedule through the spike — share and loyalty climbed as the index eased.",
      },
      {
        id: "pivot-cargo",
        label: "Shift to cargo",
        blurb:
          "Redirect belly capacity and freighters toward freight, where rates rise fastest when fuel disrupts the market.",
        immediate: { cashUsd: -Math.round(u * planes * 0.2), brandPts: 0, loyaltyPct: 0 },
        deferred: {
          cashUsd: Math.round(u * planes * 0.6 + freighters * u * 1.5),
          brandPts: 0,
          loyaltyPct: 0,
        },
        deferredHeadline: "Caught the freight surge",
        deferredDetail:
          "Freight rates spiked with the disruption — your cargo lift cashed in.",
      },
    ];
  }

  // demand-collapse (pandemic / deep recession)
  return [
    {
      id: "defensive",
      label: "Ground the fleet",
      blurb:
        "Park ~40% of capacity and slash burn. You preserve cash through the trough but leave some flyers stranded.",
      immediate: { cashUsd: Math.round(u * planes * 0.5), brandPts: -4, loyaltyPct: -3 },
      deferred: { cashUsd: Math.round(u * planes * 0.6), brandPts: 0, loyaltyPct: 0 },
      deferredHeadline: "Lean posture held the line",
      deferredDetail:
        "Grounding early preserved the cash that carried you through the trough.",
    },
    {
      id: "fly-through",
      label: "Keep flying",
      blurb:
        "Fly for the people who still need to travel. It burns cash on near-empty aircraft — but builds loyalty you can't buy.",
      immediate: { cashUsd: -Math.round(u * planes * 1.2), brandPts: 4, loyaltyPct: 6 },
      deferred: { cashUsd: Math.round(u * planes * 1.6), brandPts: 0, loyaltyPct: 3 },
      deferredHeadline: "Loyal flyers came back first",
      deferredDetail:
        "When demand returned, the flyers you never abandoned rebooked with you first.",
    },
    {
      id: "pivot-cargo",
      label: "Convert to cargo",
      blurb:
        "Strip cabins and fly freight, repatriation and medical lift while passengers stay home.",
      immediate: { cashUsd: -Math.round(u * planes * 0.3), brandPts: 0, loyaltyPct: 0 },
      deferred: {
        cashUsd: Math.round(u * planes * 1.0 + freighters * u * 1.2),
        brandPts: 0,
        loyaltyPct: 0,
      },
      deferredHeadline: "Rode the cargo boom",
      deferredDetail:
        "Belly-to-cargo conversions caught the freight boom while the passenger market was shut.",
    },
  ];
}
