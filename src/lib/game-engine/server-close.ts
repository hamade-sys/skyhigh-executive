/**
 * Server-side quarter close / advance via the shared Zustand engine.
 * Used by POST /api/games/close-quarter and /api/games/advance-quarter.
 */

import {
  assertFacilitator,
  assertHostOrFacilitator,
  assertMembership,
  loadGame,
  submitStateMutation,
  type ApiResult,
} from "@/lib/games/api";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";
import { fmtQuarter } from "@/lib/format";
import { getServerClient } from "@/lib/supabase/server";
import {
  serializeGameStateForPersistence,
  type PersistedEngineState,
} from "@/lib/game-engine/serialize-state";
import {
  allHumansReady,
  isReadyForQuarter,
} from "@/lib/game-engine/ready";
import type { GameStateRow } from "@/lib/supabase/types";
import type { Team } from "@/types/game";

export type CloseStep = "close" | "advance" | "close-and-advance";

export interface ServerCloseResult {
  state: GameStateRow;
  closedQuarter?: number;
  advancedToQuarter?: number;
  alreadyApplied?: boolean;
  snapshot?: { ok: boolean; error?: string };
}


function getDesignatedCloserTeamId(
  teams: Array<{ id: string; controlledBy?: string }>,
): string | null {
  const humanIds = teams
    .filter((t) => t.controlledBy === "human")
    .map((t) => t.id)
    .sort((a, b) => a.localeCompare(b));
  return humanIds[0] ?? null;
}

function staleSessionIds(
  members: Array<{ session_id: string; last_seen_at?: string | null }>,
): Set<string> {
  const stale = new Set<string>();
  const now = Date.now();
  const LONG_AWAY_MS = 5 * 60 * 1000;
  for (const m of members) {
    const ts = m.last_seen_at ? Date.parse(m.last_seen_at) : NaN;
    if (Number.isFinite(ts) && now - ts > LONG_AWAY_MS) {
      stale.add(m.session_id);
    }
  }
  return stale;
}

async function upsertQuarterSnapshot(args: {
  gameId: string;
  userId: string;
  quarter: number;
  stateJson: Record<string, unknown>;
  teamCount: number;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const auth = await assertHostOrFacilitator(args.gameId, args.userId);
    if (!auth.ok) {
      return { ok: false, error: auth.error };
    }
    const teams = (args.stateJson.teams as Team[] | undefined) ?? [];
    const playerTeam = teams.find((t) => t.isPlayer) ?? teams[0];
    const ctx = playerTeam
      ? `${args.teamCount} team${args.teamCount === 1 ? "" : "s"} · ${playerTeam.code}`
      : `${args.teamCount} teams`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { error } = await supa.from("game_snapshots").upsert(
      {
        game_id: args.gameId,
        quarter: args.quarter,
        saved_by_user_id: args.userId,
        label: ctx,
        quarter_label: fmtQuarter(args.quarter),
        team_count: args.teamCount,
        state_json: args.stateJson,
      },
      { onConflict: "game_id,quarter" },
    );
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Snapshot failed",
    };
  }
}

async function hydrateStoreForEngine(args: {
  stateJson: Record<string, unknown>;
  userId: string;
  memberTeamId: string | null;
  dbVersion: number;
  focusTeamId: string;
}): Promise<void> {
  const { useGame, setServerAuthoritativeWrite } = await import("@/store/game");
  setServerAuthoritativeWrite(true);
  useGame.getState().hydrateFromServerState({
    stateJson: args.stateJson,
    mySessionId: args.userId,
    fallbackTeamId: args.memberTeamId,
    dbVersion: args.dbVersion,
  });
  const store = useGame.getState();
  useGame.setState({
    isObserver: false,
    playerTeamId: args.focusTeamId,
    activeTeamId: args.focusTeamId,
    localSessionId: args.userId,
    serverStateVersion: args.dbVersion,
  });
  void store;
}

async function runEngineStep(
  step: "close" | "advance",
): Promise<void> {
  const { useGame } = await import("@/store/game");
  if (step === "close") {
    useGame.getState().closeQuarter();
  } else {
    useGame.getState().advanceToNext();
  }
}

function pickFocusTeam(
  teams: Array<{ id: string; controlledBy?: string; botDifficulty?: string | null }>,
  preferredTeamId: string | null,
): string | null {
  if (
    preferredTeamId &&
    teams.some((t) => t.id === preferredTeamId)
  ) {
    return preferredTeamId;
  }
  return (
    teams.find((t) => t.controlledBy === "human")?.id ??
    teams.find((t) => t.botDifficulty != null)?.id ??
    teams.find((t) => t.controlledBy === "bot")?.id ??
    teams[0]?.id ??
    null
  );
}

export async function authorizeQuarterMutation(args: {
  gameId: string;
  userId: string;
  step: CloseStep;
  facilitatorAdvance?: boolean;
}): Promise<
  ApiResult<{
    memberTeamId: string | null;
    isFacilitator: boolean;
  }>
> {
  if (args.facilitatorAdvance) {
    const fac = await assertFacilitator(args.gameId, args.userId);
    if (!fac.ok) return fac;
    return { ok: true, data: { memberTeamId: null, isFacilitator: true } };
  }

  const membership = await assertMembership(args.gameId, args.userId);
  if (!membership.ok) return membership;

  const loaded = await loadGame(args.gameId);
  if (!loaded.ok) return loaded;

  const stateJson = loaded.data.state.state_json as Record<string, unknown>;
  const teams =
    (stateJson.teams as Array<{
      id: string;
      controlledBy?: string;
      claimedBySessionId?: string | null;
      readyForNextQuarter?: boolean;
      readyForQuarter?: number;
    }>) ?? [];
  const currentQuarter =
    typeof stateJson.currentQuarter === "number" ? stateJson.currentQuarter : 0;
  const mode =
    (stateJson.session as { mode?: string } | undefined)?.mode ?? "self_guided";
  const humans = teams.filter((t) => t.controlledBy === "human");
  const memberTeamId = membership.data.team_id ?? null;

  if (mode === "self_guided" && humans.length >= 2) {
    const designated = getDesignatedCloserTeamId(teams);
    if (
      (args.step === "close" || args.step === "close-and-advance") &&
      memberTeamId !== designated
    ) {
      return {
        ok: false,
        error: "Only the designated closer may close the quarter for this cohort.",
      };
    }
    if (
      !args.facilitatorAdvance &&
      (args.step === "close" || args.step === "close-and-advance")
    ) {
      const stale = staleSessionIds(loaded.data.members);
      if (!allHumansReady(teams, currentQuarter, stale)) {
        return {
          ok: false,
          error: "Not all human teams are ready for quarter close.",
        };
      }
    }
  }

  return {
    ok: true,
    data: {
      memberTeamId,
      isFacilitator: membership.data.role === "facilitator",
    },
  };
}

export async function runServerQuarterMutation(args: {
  gameId: string;
  userId: string;
  expectedVersion: number;
  step: CloseStep;
  facilitatorAdvance?: boolean;
  fromQuarter?: number;
}): Promise<ApiResult<ServerCloseResult>> {
  const auth = await authorizeQuarterMutation({
    gameId: args.gameId,
    userId: args.userId,
    step: args.step,
    facilitatorAdvance: args.facilitatorAdvance,
  });
  if (!auth.ok) return auth;

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
  const currentQuarter =
    typeof stateJson.currentQuarter === "number" ? stateJson.currentQuarter : 0;
  const phase = stateJson.phase as string | undefined;

  if (
    typeof args.fromQuarter === "number" &&
    currentQuarter > args.fromQuarter
  ) {
    return {
      ok: true,
      data: {
        state: row,
        alreadyApplied: true,
        advancedToQuarter: currentQuarter,
      },
    };
  }

  if (args.step === "close" && phase === "quarter-closing") {
    return {
      ok: true,
      data: {
        state: row,
        alreadyApplied: true,
        closedQuarter: currentQuarter,
      },
    };
  }

  if (args.step === "advance" && phase !== "quarter-closing") {
    if (typeof args.fromQuarter === "number" && currentQuarter > args.fromQuarter) {
      return {
        ok: true,
        data: { state: row, alreadyApplied: true, advancedToQuarter: currentQuarter },
      };
    }
    return {
      ok: false,
      error: "Quarter is not in closing phase — close the quarter first.",
    };
  }

  const teams =
    (stateJson.teams as Array<{
      id: string;
      controlledBy?: string;
      botDifficulty?: string | null;
    }>) ?? [];
  const focusTeamId = pickFocusTeam(
    teams,
    auth.data.memberTeamId ?? getDesignatedCloserTeamId(teams),
  );
  if (!focusTeamId) {
    return { ok: false, error: "No teams in game state." };
  }

  try {
    await hydrateStoreForEngine({
      stateJson,
      userId: args.userId,
      memberTeamId: auth.data.memberTeamId,
      dbVersion: row.version,
      focusTeamId,
    });

    const closingQuarter = currentQuarter;

    if (args.step === "close" || args.step === "close-and-advance") {
      await runEngineStep("close");
    }
    if (args.step === "advance" || args.step === "close-and-advance") {
      await runEngineStep("advance");
    }

    const { useGame } = await import("@/store/game");
    const after = useGame.getState();
    const newState = serializeGameStateForPersistence(
      after as PersistedEngineState,
    ) as Record<string, unknown>;

    const eventType =
      args.step === "advance"
        ? "game.quarterAdvanced"
        : args.step === "close-and-advance"
          ? "game.quarterClosed"
          : "game.quarterClosing";

    const eventPayload =
      args.step === "close"
        ? {
            closedQuarter: closingQuarter,
            phase: "quarter-closing",
          }
        : {
            fromQuarter: closingQuarter,
            toQuarter: after.currentQuarter,
            facilitatorAdvance: args.facilitatorAdvance ?? false,
          };

    const written = await submitStateMutation({
      gameId: args.gameId,
      expectedVersion: row.version,
      newState,
      actorSessionId: args.userId,
      actorTeamId: focusTeamId,
      eventType,
      eventPayload,
    });

    if (!written.ok) return written;

    let snapshot: { ok: boolean; error?: string } | undefined;
    if (args.step === "advance" || args.step === "close-and-advance") {
      snapshot = await upsertQuarterSnapshot({
        gameId: args.gameId,
        userId: args.userId,
        quarter: after.currentQuarter,
        stateJson: newState,
        teamCount: after.teams.length,
      });
    }

    await broadcastGameEvent({
      gameId: args.gameId,
      event: "game.stateChanged",
      payload: {
        eventType,
        version: written.data.version,
      },
    });

    return {
      ok: true,
      data: {
        state: written.data,
        closedQuarter:
          args.step === "close" || args.step === "close-and-advance"
            ? closingQuarter
            : undefined,
        advancedToQuarter:
          args.step === "advance" || args.step === "close-and-advance"
            ? after.currentQuarter
            : undefined,
        snapshot,
      },
    };
  } finally {
    const { setServerAuthoritativeWrite } = await import("@/store/game");
    setServerAuthoritativeWrite(false);
  }
}
