/**
 * POST /api/games/join — player claims a seat in an existing game.
 *
 * Body shape:
 *   {
 *     gameId?:      string   // for direct lobby links
 *     joinCode?:    string   // for /join?code=1234 path
 *     sessionId:    string   // browser session id
 *     displayName?: string   // shown in the lobby seat card
 *   }
 *
 * One of gameId or joinCode is required. Returns the resolved game
 * row + the member row. Idempotent — re-joining with the same
 * session id is the reconnect path; updates last_seen_at without
 * creating a duplicate seat.
 */

import { NextRequest, NextResponse } from "next/server";
import { findGame, joinGame } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, joinCode, sessionId, displayName } = body ?? {};

    if (typeof sessionId !== "string" || sessionId.length < 8) {
      return NextResponse.json({ error: "Missing session id." }, { status: 400 });
    }
    if (!gameId && !joinCode) {
      return NextResponse.json(
        { error: "Pass gameId or joinCode." },
        { status: 400 },
      );
    }

    const findRes = await findGame({ gameId, joinCode });
    if (!findRes.ok) {
      return NextResponse.json({ error: findRes.error }, { status: 404 });
    }

    const joinRes = await joinGame({
      gameId: findRes.data.id,
      sessionId,
      displayName: typeof displayName === "string" ? displayName.slice(0, 40) : undefined,
    });
    if (!joinRes.ok) {
      return NextResponse.json({ error: joinRes.error }, { status: 400 });
    }

    return NextResponse.json({
      game: joinRes.data.game,
      member: joinRes.data.member,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
