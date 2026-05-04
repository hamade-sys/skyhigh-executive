/**
 * GET /api/games/chat/list?gameId=...&before=...&limit=50
 *
 * Phase 10. Returns the most recent N messages for a game's chat,
 * newest-first (the client renders them in reverse to show oldest at
 * top of the panel scroll). Soft-deleted messages are returned as
 * tombstones (body redacted, deleted_at set) so the panel can show
 * "(message removed by facilitator)" without losing reading context.
 *
 * Pagination — `before` is the ISO timestamp of the oldest message
 * the client has so far; the server returns messages older than that.
 * No `before` → return the latest page.
 */

import { NextRequest, NextResponse } from "next/server";
import { assertMembership } from "@/lib/games/api";
import { getServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to read chat." },
        { status: 401 },
      );
    }

    const gameId = req.nextUrl.searchParams.get("gameId");
    if (!gameId) {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    const before = req.nextUrl.searchParams.get("before");
    const limitRaw = req.nextUrl.searchParams.get("limit");
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(limitRaw ?? "", 10) || DEFAULT_LIMIT),
    );

    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    let q = supa
      .from("game_chat_messages")
      .select(
        "id, game_id, author_session_id, author_display_name, author_airline_color_id, is_facilitator_broadcast, body, created_at, deleted_at, deleted_by_session_id",
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (before) {
      q = q.lt("created_at", before);
    }

    const { data, error } = await q;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Tombstone deleted messages — return the row but redact the body
    // so a curious client can't read the deleted content via this API.
    interface ChatMessageRow {
      id: string;
      game_id: string;
      author_session_id: string;
      author_display_name: string;
      author_airline_color_id: string | null;
      is_facilitator_broadcast: boolean;
      body: string;
      created_at: string;
      deleted_at: string | null;
      deleted_by_session_id: string | null;
    }
    const messages = (data ?? []).map((row: ChatMessageRow) =>
      row.deleted_at
        ? { ...row, body: "" }
        : row,
    );

    return NextResponse.json({ messages });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
