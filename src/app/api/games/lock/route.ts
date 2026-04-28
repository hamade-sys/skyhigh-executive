/**
 * POST /api/games/lock — host/facilitator locks or unlocks a lobby.
 *
 * Body: { gameId: string, actorSessionId: string, locked: boolean }
 *
 * Locked lobbies still allow existing members to reconnect (the
 * join helper checks for an existing member row before refusing).
 */

import { NextRequest, NextResponse } from "next/server";
import { setLocked } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, actorSessionId, locked } = body ?? {};
    if (
      typeof gameId !== "string" ||
      typeof actorSessionId !== "string" ||
      typeof locked !== "boolean"
    ) {
      return NextResponse.json(
        { error: "gameId + actorSessionId + locked (bool) required" },
        { status: 400 },
      );
    }
    const result = await setLocked({ gameId, actorSessionId, locked });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ game: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
