/**
 * GET /api/games/load?gameId=... — fetch a game's row, members, and
 * (during play) the engine state snapshot.
 *
 * Used by /games/[gameId]/lobby on every poll and by /games/[gameId]/play
 * for the initial hydration. The state JSON is heavy; the lobby page
 * doesn't need it, but we ship the row + members on every call and
 * let the play page re-fetch the state when it needs it.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadGame } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const gameId = url.searchParams.get("gameId");
    const includeState = url.searchParams.get("includeState") === "1";
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }
    const result = await loadGame(gameId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    return NextResponse.json({
      game: result.data.game,
      members: result.data.members,
      state: includeState ? result.data.state : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
