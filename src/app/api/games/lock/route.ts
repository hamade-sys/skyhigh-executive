/**
 * POST /api/games/lock — host/facilitator locks or unlocks a lobby.
 *
 * Body: { gameId: string, locked: boolean }
 *
 * IMPORTANT (Phase 1 hardening): the caller's identity is derived
 * SERVER-SIDE from the cookie-bound auth session. The body parameter
 * `actorSessionId` is no longer accepted — trusting it allowed any
 * browser holding a `gameId` to lock/unlock other people's games.
 *
 * Authorization: caller must be the host (creator) or facilitator
 * (Game Master) of the game. Plain members get 403.
 *
 * Locked lobbies still allow existing members to reconnect (the join
 * helper checks for an existing member row before refusing).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertHostOrFacilitator, setLocked } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to lock or unlock a lobby." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId, locked } = body ?? {};
    if (typeof gameId !== "string" || typeof locked !== "boolean") {
      return NextResponse.json(
        { error: "gameId + locked (bool) required" },
        { status: 400 },
      );
    }

    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }

    const result = await setLocked({
      gameId,
      actorSessionId: userId,
      locked,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ game: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
