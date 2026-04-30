/**
 * POST /api/games/state-update — write a new engine state for a
 * multiplayer game with optimistic concurrency.
 *
 * Body: {
 *   gameId: string,
 *   expectedVersion: number,
 *   newState: unknown,                 // full engine state JSON
 *   actorSessionId: string,
 *   actorTeamId?: string,
 *   eventType: string,                 // e.g. "game.quarterClosed",
 *                                      //      "team.routeOpened"
 *   eventPayload?: unknown,
 * }
 *
 * Returns:
 *   200 { state: GameStateRow }       on success — caller bumps version
 *   409 { error: "stale state ..." }  on version mismatch — caller
 *                                     refreshes via /api/games/load
 *                                     and retries
 *   400 { error: "..." }              on bad input
 *   500 { error: "..." }              on Supabase fault
 *
 * The CAS guarantee comes from `submitStateMutation` in lib/games/api.ts:
 * the SQL UPDATE matches on `(game_id = $id AND version = $expected)`,
 * so two browsers can't clobber each other's writes — the second one
 * gets 0 rows back and we return 409.
 *
 * Audit: every successful write appends a row to `game_events` so the
 * facilitator + replay tools can reconstruct the round.
 */

import { NextRequest, NextResponse } from "next/server";
import { submitStateMutation } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      gameId,
      expectedVersion,
      newState,
      actorSessionId,
      actorTeamId,
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
    if (typeof actorSessionId !== "string") {
      return NextResponse.json(
        { error: "actorSessionId required" },
        { status: 400 },
      );
    }
    if (typeof eventType !== "string" || eventType.length === 0) {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }
    const result = await submitStateMutation({
      gameId,
      expectedVersion,
      newState,
      actorSessionId,
      actorTeamId: typeof actorTeamId === "string" ? actorTeamId : undefined,
      eventType,
      eventPayload,
    });
    if (!result.ok) {
      // submitStateMutation returns a stale-state error string when CAS
      // fails. Return 409 so callers can branch on status, not parse
      // free-text error messages.
      const status = result.error.toLowerCase().includes("stale state") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ state: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
