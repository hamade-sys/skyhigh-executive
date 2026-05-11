/**
 * GET /api/games/active-membership?sessionId=X
 *
 * Returns the most recent game this player (identified by their
 * Supabase user.id) is a member of that is still active (status
 * "lobby" or "playing").
 *
 * Used by the home page to redirect returning players straight back
 * into their game — replaces the old browser-stored "skyforce:activeGame"
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

    // Step 4: pull totalRounds + phase from the game state.
    //   - totalRounds is stored in session.totalRounds (not on the
    //     games row), used by the ribbon to render "Round 7 / 16".
    //   - phase guards against a stale "Resume game" CTA: if the
    //     engine has already moved into `phase === "endgame"` but the
    //     games.status flip didn't land (legacy games created before
    //     the submitStateMutation auto-flip shipped, or a writer that
    //     bypassed it), opportunistically flip status here AND return
    //     `game: null` so the home-page ribbon stops surfacing it.
    let totalRounds: number | null = null;
    let phase: string | null = null;
    try {
      const { data: stateRow } = await supa
        .from("game_state")
        .select("state_json")
        .eq("game_id", (game as { id: string }).id)
        .maybeSingle();
      const sj = (stateRow?.state_json as
        | { session?: { totalRounds?: number }; phase?: string }
        | null) ?? null;
      if (sj?.session && typeof sj.session.totalRounds === "number") {
        totalRounds = sj.session.totalRounds;
      }
      if (typeof sj?.phase === "string") {
        phase = sj.phase;
      }
    } catch { /* ignore */ }

    if (phase === "endgame") {
      // Auto-heal: flip the games row to ended so future calls take
      // the cheap path via the existing status filter, and return
      // null to hide the ribbon for THIS call too.
      await supa
        .from("games")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", (game as { id: string }).id)
        .neq("status", "ended");
      return NextResponse.json({ game: null });
    }

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
