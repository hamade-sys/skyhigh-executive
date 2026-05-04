/**
 * POST /api/games/chat/delete — facilitator-only soft-delete of a
 * chat message. Phase 10.
 *
 * Body: { gameId: string, messageId: string }
 *
 * Sets `deleted_at` + `deleted_by_session_id` on the row. The body
 * is preserved server-side for audit; the /list endpoint redacts it
 * before returning to clients.
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
        { error: "Sign-in required." },
        { status: 401 },
      );
    }
    const body = await req.json();
    const { gameId, messageId } = body ?? {};
    if (typeof gameId !== "string" || typeof messageId !== "string") {
      return NextResponse.json(
        { error: "gameId and messageId required." },
        { status: 400 },
      );
    }

    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok || !auth.data.isFacilitator) {
      return NextResponse.json(
        { error: "Facilitator role required to moderate chat." },
        { status: 403 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { error } = await supa
      .from("game_chat_messages")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by_session_id: userId,
      })
      .eq("id", messageId)
      .eq("game_id", gameId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
