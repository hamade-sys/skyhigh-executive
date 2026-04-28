/**
 * POST /api/games/start — host/facilitator advances a lobby to playing.
 *
 * Body: { gameId: string, actorSessionId: string }
 *
 * The route doesn't enforce host/facilitator role here — that's a
 * client-side gate for now (only the host's button is rendered).
 * Server-side role enforcement comes in Step 5 once the
 * facilitator console migration lands.
 */

import { NextRequest, NextResponse } from "next/server";
import { startGame } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { gameId, actorSessionId } = body ?? {};
    if (typeof gameId !== "string" || typeof actorSessionId !== "string") {
      return NextResponse.json({ error: "gameId + actorSessionId required" }, { status: 400 });
    }
    const result = await startGame({ gameId, actorSessionId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ game: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
