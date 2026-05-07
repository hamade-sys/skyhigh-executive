/**
 * POST /api/games/state-update — write a new engine state for a
 * multiplayer game with optimistic concurrency.
 *
 * Body: {
 *   gameId: string,
 *   expectedVersion: number,
 *   newState: unknown,                 // full engine state JSON
 *   eventType: string,                 // e.g. "game.quarterClosed"
 *   eventPayload?: unknown,
 * }
 *
 * IMPORTANT (Phase 1 hardening): the caller's identity is derived
 * SERVER-SIDE from the cookie-bound auth session. Body parameters
 * `actorSessionId` and `actorTeamId` are no longer accepted —
 * trusting them was the original vulnerability that let any browser
 * holding a `gameId` impersonate any member and corrupt their state.
 *
 * Authorization: the caller must be a member of `gameId`. Per-team
 * ownership of mutated teams is verified by diffing the incoming
 * `newState.teams[].claimedBySessionId` against the calling user;
 * facilitators are exempt and may mutate any team.
 *
 * Returns:
 *   200 { state: GameStateRow }       on success
 *   400 { error }                     on bad input
 *   401 { error }                     when not signed in
 *   403 { error }                     when not a member or mutating
 *                                     a team you don't own
 *   404 { error }                     when game not found
 *   409 { error }                     on stale state (CAS mismatch)
 *   500 { error }                     on Supabase fault
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertMembership,
  submitStateMutation,
} from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NewStateTeamShape {
  id?: unknown;
  claimedBySessionId?: unknown;
  controlledBy?: unknown;
}

interface NewStateShape {
  teams?: NewStateTeamShape[];
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to write game state." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      gameId,
      expectedVersion,
      newState,
      eventType,
      eventPayload,
    } = body ?? {};

    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }
    if (typeof expectedVersion !== "number") {
      return NextResponse.json(
        { error: "expectedVersion (number) required" },
        { status: 400 },
      );
    }
    if (typeof newState !== "object" || newState === null) {
      return NextResponse.json({ error: "newState (object) required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || eventType.length === 0) {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    // Verify membership before any write. assertMembership checks
    // game_members for (gameId, userId) — if no row, the caller is
    // either not in this game or has been kicked.
    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: 403 });
    }

    // Verify per-team ownership of any team mutations. Facilitators
    // (role === 'facilitator') are exempt — they can apply admin
    // overrides across all teams. Other roles can only modify teams
    // claimed by their own session.
    const isFacilitator = membership.data.role === "facilitator";
    if (!isFacilitator) {
      const teams = (newState as NewStateShape).teams ?? [];
      // We allow human teams claimed by THIS user to be mutated, plus
      // bot teams (controlledBy === "bot") because the local engine
      // runs bot turns on the active player's browser today. Human
      // teams claimed by OTHER users are off-limits.
      for (const t of teams) {
        if (t && typeof t === "object") {
          const claimedBy = typeof t.claimedBySessionId === "string"
            ? t.claimedBySessionId
            : null;
          const controlledBy = typeof t.controlledBy === "string"
            ? t.controlledBy
            : null;
          if (controlledBy === "bot") continue;
          if (claimedBy && claimedBy !== userId) {
            return NextResponse.json(
              {
                error:
                  "Cannot mutate a team you do not own. Facilitator role required for cross-team writes.",
              },
              { status: 403 },
            );
          }
        }
      }
    }

    const result = await submitStateMutation({
      gameId,
      expectedVersion,
      newState,
      // Identity is server-derived — pass the authenticated userId
      // so the audit log records the real actor, not a body param.
      actorSessionId: userId,
      actorTeamId: membership.data.team_id ?? undefined,
      eventType,
      eventPayload,
    });

    if (!result.ok) {
      const status = result.error.toLowerCase().includes("stale state") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    // Tell peer browsers the state changed. We send a tiny "go
    // refetch" payload (event type + version) rather than the full
    // state to keep websocket frames small and avoid leaking team
    // state into the broadcast pipe (peers re-call /api/games/load
    // which respects the membership-gated read policy).
    await broadcastGameEvent({
      gameId,
      event: "game.stateChanged",
      payload: { eventType, version: result.data.version },
    });

    return NextResponse.json({ state: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
