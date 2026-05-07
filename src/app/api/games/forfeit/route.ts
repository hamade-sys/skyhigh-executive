/**
 * POST /api/games/forfeit — player walks away from a game.
 *
 * Body: { gameId: string }
 *
 * Behavior (Phase 8.2 of enterprise-readiness plan):
 *
 *   - For a member of a 'playing' game: their team is flipped to bot
 *     control (preserves accumulated state so the cohort can keep
 *     playing), the game_members row is deleted, and a `game.forfeited`
 *     audit event is appended. If they were the last human, the engine
 *     short-circuits the game to status='ended' immediately.
 *
 *   - For a member of a 'lobby' game: the row is just deleted (no team
 *     to flip yet). If the lobby is now empty, the whole game is torn
 *     down so /lobby doesn't show ghost rows.
 *
 *   - For the HOST of a not-yet-started lobby: this endpoint refuses
 *     and instructs the client to call /api/games/delete instead.
 *     Hosts abandoning a lobby is a tear-down, not a forfeit.
 *
 * Identity is server-derived via `getAuthenticatedUserId` (Phase 1
 * hardening). The caller must be a member of the game.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertMembership,
  forfeitMember,
} from "@/lib/games/api";
import { getServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to forfeit." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: 403 });
    }

    // Host special case — if this caller is the host of a not-yet-
    // started lobby, route them to /api/games/delete instead of
    // forfeit. Tearing down the lobby is more honest than leaving an
    // empty husk.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { data: game } = await supa
      .from("games")
      .select("created_by_session_id, status")
      .eq("id", gameId)
      .maybeSingle();
    if (
      game &&
      (game as { status: string }).status === "lobby" &&
      (game as { created_by_session_id: string }).created_by_session_id ===
        userId
    ) {
      return NextResponse.json({
        ok: false,
        redirectToDelete: true,
        error: "Hosts must delete the lobby instead of forfeiting.",
      });
    }

    const result = await forfeitMember({ gameId, sessionId: userId });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    // Phase 8.3 — tell peer browsers the team flipped (so they
    // refetch state without waiting for their poll cycle). When the
    // game auto-ended (last human gone), emit a second event so
    // /games/[id]/play can route to /endgame immediately.
    await broadcastGameEvent({
      gameId,
      event: "team.forfeited",
      payload: {
        bySessionId: userId,
        replacedByBot: result.data.replacedByBot,
        remainingHumans: result.data.remainingHumans,
      },
    });
    if (result.data.gameEnded) {
      await broadcastGameEvent({
        gameId,
        event: "game.autoEnded",
        payload: { reason: "all_human_players_forfeited" },
      });
    }

    return NextResponse.json({ ok: true, ...result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
