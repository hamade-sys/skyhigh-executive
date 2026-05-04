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

    // Step 2: find the most recent active game among those.
    // Phase 8 — also pull current_quarter + max_teams so the
    // ActiveGameRibbon can render a rich subline ("Round 7 / 16",
    // "3/6 joined") without a follow-up roundtrip.
    const { data: game, error: gameErr } = await supa
      .from("games")
      .select("id, status, name, current_quarter, max_teams")
      .in("id", gameIds)
      .in("status", ["lobby", "playing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gameErr || !game) {
      return NextResponse.json({ game: null });
    }

    // Step 3: count members for the ribbon. Excludes spectator and
    // facilitator roles since those don't fill a playable seat.
    const { count: memberCount } = await supa
      .from("game_members")
      .select("session_id", { count: "exact", head: true })
      .eq("game_id", (game as { id: string }).id)
      .neq("role", "spectator")
      .neq("role", "facilitator");

    // Step 4: pull totalRounds from the game state (it's stored in
    // session.totalRounds on the state JSON, not on the games row).
    // Best-effort — if the lookup fails we just omit the round
    // total from the ribbon.
    let totalRounds: number | null = null;
    try {
      const { data: stateRow } = await supa
        .from("game_state")
        .select("state_json")
        .eq("game_id", (game as { id: string }).id)
        .maybeSingle();
      const session = (stateRow?.state_json as { session?: { totalRounds?: number } } | null)?.session;
      if (session && typeof session.totalRounds === "number") {
        totalRounds = session.totalRounds;
      }
    } catch { /* ignore */ }

    return NextResponse.json({
      game: {
        ...game,
        member_count: memberCount ?? 0,
        total_rounds: totalRounds,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, game: null }, { status: 500 });
  }
}
