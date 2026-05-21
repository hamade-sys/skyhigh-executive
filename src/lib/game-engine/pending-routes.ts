/**
 * Pure pending-route + slot-auction helpers (server-safe).
 * Single source of truth for auto-rebid and pending→active activation.
 */

import { CITIES_BY_CODE } from "@/data/cities";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import type { Route, Team } from "@/types/game";

export type AutoRebidByAirport = Record<string, { slots: number; price: number }>;

/** Build auto-rebids for all pending routes on a team (both endpoints + escalation). */
export function buildAutoRebidsForTeam(
  team: Team,
  currentQuarter: number,
): AutoRebidByAirport {
  const autoRebidsByAirport: AutoRebidByAirport = {};
  for (const r of team.routes) {
    if (r.status !== "pending") continue;
    const endpoints = new Set<string>([r.originCode, r.destCode]);
    for (const code of Object.keys(r.pendingBidPrices ?? {})) {
      endpoints.add(code);
    }
    for (const code of endpoints) {
      const slotsHeld = team.airportLeases?.[code]?.slots ?? 0;
      const usedAtCode = team.routes
        .filter(
          (rt) =>
            rt.id !== r.id &&
            (rt.status === "active" || rt.status === "suspended") &&
            (rt.originCode === code || rt.destCode === code),
        )
        .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
      const intendedWeekly = r.dailyFrequency * 7;
      const stillNeeded = Math.max(0, intendedWeekly + usedAtCode - slotsHeld);
      if (stillNeeded <= 0) continue;

      let basePrice = r.pendingBidPrices?.[code];
      if (basePrice == null || !Number.isFinite(basePrice) || basePrice <= 0) {
        const tier = (CITIES_BY_CODE[code]?.tier ?? 1) as 1 | 2 | 3 | 4;
        basePrice = BASE_SLOT_PRICE_BY_TIER[tier] ?? 35_000;
      }
      const quartersPending = Math.max(0, currentQuarter - r.openQuarter);
      const escalationFactor = Math.min(3, 1 + 0.15 * quartersPending);
      const escalatedPrice = Math.round(basePrice * escalationFactor);
      const cur = autoRebidsByAirport[code];
      autoRebidsByAirport[code] = {
        slots: (cur?.slots ?? 0) + stillNeeded,
        price: Math.max(cur?.price ?? 0, escalatedPrice),
      };
    }
  }
  return autoRebidsByAirport;
}

/** Merge auto-rebids into a team's pendingSlotBids for the current quarter. */
export function mergeAutoRebidsIntoTeam(
  team: Team,
  autoRebidsByAirport: AutoRebidByAirport,
  currentQuarter: number,
): Team {
  if (Object.keys(autoRebidsByAirport).length === 0) return team;
  const pendingSlotBids = [...(team.pendingSlotBids ?? [])];
  for (const code of Object.keys(autoRebidsByAirport)) {
    const rebid = autoRebidsByAirport[code];
    const existing = pendingSlotBids.find((b) => b.airportCode === code);
    if (existing) {
      existing.slots = Math.max(existing.slots, rebid.slots);
      existing.pricePerSlot = Math.max(existing.pricePerSlot, rebid.price);
    } else {
      pendingSlotBids.push({
        airportCode: code,
        slots: rebid.slots,
        pricePerSlot: rebid.price,
        quarterSubmitted: currentQuarter,
      });
    }
  }
  return { ...team, pendingSlotBids };
}

export interface ActivatePendingResult {
  team: Team;
  activatedCount: number;
  stillPendingDiagnostics: string[];
}

/** Flip pending routes to active when both endpoints have enough weekly slots. */
export function activatePendingRoutes(
  team: Team,
  surfaceDiagnostics: boolean,
): ActivatePendingResult {
  if (!team.routes.some((r) => r.status === "pending")) {
    return { team, activatedCount: 0, stillPendingDiagnostics: [] };
  }

  let activatedCount = 0;
  const stillPendingDiagnostics: string[] = [];
  const newRoutes: Route[] = [];

  for (const r of team.routes) {
    if (r.status !== "pending") {
      newRoutes.push(r);
      continue;
    }
    const slotsO = team.airportLeases?.[r.originCode]?.slots ?? 0;
    const slotsD = team.airportLeases?.[r.destCode]?.slots ?? 0;
    const usedO = team.routes
      .filter(
        (rt) =>
          rt.id !== r.id &&
          (rt.status === "active" || rt.status === "suspended") &&
          (rt.originCode === r.originCode || rt.destCode === r.originCode),
      )
      .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
    const usedD = team.routes
      .filter(
        (rt) =>
          rt.id !== r.id &&
          (rt.status === "active" || rt.status === "suspended") &&
          (rt.originCode === r.destCode || rt.destCode === r.destCode),
      )
      .reduce((sum, rt) => sum + rt.dailyFrequency * 7, 0);
    const availO = Math.max(0, slotsO - usedO);
    const availD = Math.max(0, slotsD - usedD);
    const intendedWeekly = r.dailyFrequency * 7;
    const effectiveWeekly = Math.min(intendedWeekly, availO, availD);
    if (effectiveWeekly < 1) {
      const reason =
        `held ${slotsO}@${r.originCode} / ${slotsD}@${r.destCode}, ` +
        `${usedO}/${usedD} used, ${availO}/${availD} free, ` +
        `need ${intendedWeekly}/wk`;
      if (surfaceDiagnostics) {
        stillPendingDiagnostics.push(`${r.originCode}→${r.destCode}: ${reason}`);
      }
      newRoutes.push({ ...r, pendingReason: reason });
      continue;
    }
    if (surfaceDiagnostics) activatedCount += 1;
    newRoutes.push({
      ...r,
      status: "active",
      dailyFrequency: Math.max(1 / 7, effectiveWeekly / 7),
      pendingReason: undefined,
      pendingBidPrices: undefined,
      pendingBidSlots: undefined,
    });
  }

  return {
    team: { ...team, routes: newRoutes },
    activatedCount,
    stillPendingDiagnostics,
  };
}
