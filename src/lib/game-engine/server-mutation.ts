/**
 * Run a store action on authoritative server state and persist via CAS.
 */

import {
  assertMembership,
  loadGame,
  submitStateMutation,
  type ApiResult,
} from "@/lib/games/api";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";
import {
  serializeGameStateForPersistence,
  type PersistedEngineState,
} from "@/lib/game-engine/serialize-state";
import type { GameStateRow } from "@/lib/supabase/types";

export async function runServerStoreMutation<T>(args: {
  gameId: string;
  userId: string;
  expectedVersion: number;
  eventType: string;
  eventPayload?: unknown;
  action: () => T;
  isOk: (result: T) => boolean;
  errorMessage: (result: T) => string | undefined;
}): Promise<ApiResult<{ state: GameStateRow; result: T }>> {
  const membership = await assertMembership(args.gameId, args.userId);
  if (!membership.ok) return membership;

  const loaded = await loadGame(args.gameId);
  if (!loaded.ok) return loaded;

  const row = loaded.data.state;
  if (row.version !== args.expectedVersion) {
    return {
      ok: false,
      error:
        "Stale state — someone else modified the game. Refresh and try again.",
    };
  }

  const stateJson = row.state_json as Record<string, unknown>;
  const teams =
    (stateJson.teams as Array<{ id: string; claimedBySessionId?: string | null }>) ??
    [];
  const memberTeamId = membership.data.team_id ?? null;
  const claimedTeamId =
    teams.find((t) => t.claimedBySessionId === args.userId)?.id ?? memberTeamId;
  if (!claimedTeamId) {
    return { ok: false, error: "No team claimed for this session." };
  }

  const { useGame, setServerAuthoritativeWrite } = await import("@/store/game");
  setServerAuthoritativeWrite(true);
  try {
    useGame.getState().hydrateFromServerState({
      stateJson,
      mySessionId: args.userId,
      fallbackTeamId: memberTeamId,
      dbVersion: row.version,
    });
    useGame.setState({
      isObserver: false,
      playerTeamId: claimedTeamId,
      activeTeamId: claimedTeamId,
      localSessionId: args.userId,
      serverStateVersion: row.version,
    });

    const result = args.action();
    if (!args.isOk(result)) {
      return {
        ok: false,
        error: args.errorMessage(result) ?? "Action rejected.",
      };
    }

    const newState = serializeGameStateForPersistence(
      useGame.getState() as PersistedEngineState,
    ) as Record<string, unknown>;

    const written = await submitStateMutation({
      gameId: args.gameId,
      expectedVersion: row.version,
      newState,
      actorSessionId: args.userId,
      actorTeamId: claimedTeamId,
      eventType: args.eventType,
      eventPayload: args.eventPayload,
    });
    if (!written.ok) return written;

    await broadcastGameEvent({
      gameId: args.gameId,
      event: "game.stateChanged",
      payload: {
        eventType: args.eventType,
        version: written.data.version,
      },
    });

    return { ok: true, data: { state: written.data, result } };
  } finally {
    setServerAuthoritativeWrite(false);
  }
}
