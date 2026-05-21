/**
 * Serialize in-memory GameStore state for Postgres / API persistence.
 */

import type { GameState, Team } from "@/types/game";

export type PersistedEngineState = GameState & {
  sessionCode?: string | null;
  sessionLocked?: boolean;
  sessionSlots?: unknown;
  preOrders?: unknown[];
  productionCapOverrides?: Record<string, number>;
  quarterCloseRequest?: unknown;
  marketHistory?: Array<{
    quarter: number;
    fuelIndex: number;
    travelIndex: number;
    baseRatePct: number;
  }>;
  lastCloseResult?: unknown;
};

export function serializeTeamForPersistence(team: Team): Team {
  return {
    ...team,
    flags: Array.from(team.flags) as unknown as Set<string>,
  };
}

export function serializeGameStateForPersistence(
  s: PersistedEngineState,
): Record<string, unknown> {
  const session = s.session;
  return {
    phase: s.phase,
    currentQuarter: s.currentQuarter,
    fuelIndex: s.fuelIndex,
    baseInterestRatePct: s.baseInterestRatePct,
    teams: s.teams.map(serializeTeamForPersistence),
    quarterTimerSecondsRemaining: s.quarterTimerSecondsRemaining,
    quarterTimerPaused: s.quarterTimerPaused,
    secondHandListings: s.secondHandListings,
    cargoContracts: s.cargoContracts,
    airportSlots: s.airportSlots,
    airportBids: s.airportBids,
    worldCupHostCode: s.worldCupHostCode,
    olympicHostCode: s.olympicHostCode,
    sessionCode: s.sessionCode,
    sessionLocked: s.sessionLocked,
    sessionSlots: s.sessionSlots,
    preOrders: s.preOrders,
    productionCapOverrides: s.productionCapOverrides,
    quarterCloseRequest: s.quarterCloseRequest,
    marketHistory: s.marketHistory,
    lastCloseResult: s.lastCloseResult,
    session: session ? { ...session, version: session.version + 1 } : null,
  };
}
