/**
 * GET /api/games/active-membership?sessionId=X
 *
 * Returns the most recent game this player (identified by their
 * Supabase user.id) is a member of that is still active (status
 * "lobby" or "playing").
 *
 * Used by the home page to redirect returning players straight back
 * into their game — replaces the old localStorage "skyforce:activeGame"
 * key which only worked on the same device/browser.
 *
 * Response shapes:
 *   { game: { id, status, name } }   — active game found
 *   { game: null }                   — no active game for this session
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sessionId = req.nextUrl.searchParams.get("sessionId");
    if (!sessionId || sessionId.length < 8) {
      return NextResponse.json({ game: null });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // Step 1: find all games this session is a member of
    const { data: memberships, error: memErr } = await supa
      .from("game_members")
      .select("game_id")
      .eq("session_id", sessionId);

    if (memErr || !memberships?.length) {
      return NextResponse.json({ game: null });
    }

    const gameIds = (memberships as { game_id: string }[]).map((m) => m.game_id);

    // Step 2: find the most recent active game among those
    const { data: game, error: gameErr } = await supa
      .from("games")
      .select("id, status, name")
      .in("id", gameIds)
      .in("status", ["lobby", "playing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gameErr) {
      return NextResponse.json({ game: null });
    }

    return NextResponse.json({ game: game ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, game: null }, { status: 500 });
  }
}
