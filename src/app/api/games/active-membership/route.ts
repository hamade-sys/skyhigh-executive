/**
 * GET /api/games/active-membership
 *
 * Returns the most recent game the AUTHENTICATED user is a member of
 * that is still active (status "lobby" or "playing").
 *
 * Used by the home page to redirect returning players straight back
 * into their game — replaces the old browser-stored "skyforce:activeGame"
 * key which only worked on the same device/browser.
 *
 * Auth (Phase A — security hotfix S2):
 *   The user id is now derived from the cookie-bound auth session.
 *   Pre-fix the route took `sessionId` from the URL query string
 *   with no auth check — an attacker could iterate user UUIDs and
 *   learn what game any user was in (a privacy-leaking IDOR).
 *
 *   Read path → uses `getSessionUserId()` (fast cookie-only check,
 *   no network round-trip to Supabase Auth). The cost-benefit on
 *   reads doesn't justify the ~150ms `getUser()` call.
 *
 * Response shapes:
 *   { game: { id, status, name, ... } }  — active game found
 *   { game: null }                       — no auth OR no active game
 */

import { NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { getSessionUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Derive the session id from the auth cookie — NEVER from the
    // URL. Returning `{ game: null }` (200) rather than a 401 is
    // intentional: the home page calls this on every load including
    // anonymous lobby visits, and the ribbon just doesn't render
    // when game is null. A 401 here would cascade into UI noise.
    const sessionId = await getSessionUserId();
    if (!sessionId) {
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
    // Don't leak raw error strings to the client — log server-side,
    // return a generic message. The home-page ribbon treats any
    // non-200 as "no active game", which is the safe default.
    const detail = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/games/active-membership] internal error:", detail);
    return NextResponse.json({ game: null }, { status: 500 });
  }
}
