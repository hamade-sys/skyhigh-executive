/**
 * POST /api/games/delete — host or facilitator deletes a game.
 *
 * Body: { gameId: string }
 *
 * IMPORTANT (Phase 1 hardening): identity is server-derived from
 * the cookie-bound auth session. The body parameter `sessionId` is
 * ignored for identity. Authorization uses `assertHostOrFacilitator`.
 *
 * Game must be in lobby or ended — active games cannot be deleted
 * mid-play to avoid stranding players.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertHostOrFacilitator } from "@/lib/games/api";
import { getServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to delete a game." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // Confirm not currently playing — we can't safely tear down a game
    // that has players actively running quarters.
    const { data: game } = await supa
      .from("games")
      .select("status")
      .eq("id", gameId)
      .single();
    if ((game as { status: string } | null)?.status === "playing") {
      return NextResponse.json(
        { error: "Cannot delete a game that is currently in progress." },
        { status: 400 },
      );
    }

    // Delete dependents first (FK constraints), then the game row.
    await supa.from("game_members").delete().eq("game_id", gameId);
    await supa.from("game_state").delete().eq("game_id", gameId);
    await supa.from("game_events").delete().eq("game_id", gameId);
    const { error: delErr } = await supa.from("games").delete().eq("id", gameId);

    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
