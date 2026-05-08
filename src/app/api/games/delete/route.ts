/**
 * POST /api/games/delete — host or facilitator deletes a game.
 *
 * Body: { gameId: string, force?: boolean }
 *
 * IMPORTANT (Phase 1 hardening): identity is server-derived from
 * the cookie-bound auth session. The body parameter `sessionId` is
 * ignored for identity. Authorization uses `assertHostOrFacilitator`.
 *
 * Default behaviour: only LOBBY or ENDED games can be deleted (so a
 * mid-play tear-down doesn't strand other players).
 *
 * `force: true`: extends to PLAYING games as well — used by the
 * Game Master's "End game for everyone" path. Instead of a hard
 * DELETE, force-end flips status to 'ended' + sets phase 'endgame'
 * in state_json so peers see the endgame screen on their next
 * Realtime refresh, then deletes member rows but preserves the
 * game_state row for the recap. The game row itself stays so
 * /endgame can still load history; we just mark it ended.
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
    const { gameId, force } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    const isForce = force === true;

    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }
    // `force: true` = Game Master cohort-wide end. Restrict to the
    // facilitator role (not just the host) so an over-eager host
    // doesn't accidentally end-game a workshop they're not running.
    if (isForce && !auth.data.isFacilitator) {
      return NextResponse.json(
        { error: "Only the Game Master can end a game in progress." },
        { status: 403 },
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    const { data: game } = await supa
      .from("games")
      .select("status")
      .eq("id", gameId)
      .single();
    const status = (game as { status: string } | null)?.status;

    // Default rule: only LOBBY or ENDED games can be deleted.
    // PLAYING games require force=true.
    if (status === "playing" && !isForce) {
      return NextResponse.json(
        {
          error:
            "Cannot delete a game that is currently in progress. Use force=true (Game Master only) to end it for everyone.",
        },
        { status: 400 },
      );
    }

    if (status === "playing" && isForce) {
      // Force-end: flip the game to ended + set phase=endgame in
      // state_json so peer browsers route to /endgame on their next
      // Realtime refresh. KEEP the game_state row so /endgame can
      // load the recap. Delete member rows so the lobby/active-
      // membership lookups don't show ghost games.
      const { data: stateRow } = await supa
        .from("game_state")
        .select("state_json, version")
        .eq("game_id", gameId)
        .maybeSingle();
      if (stateRow) {
        const stateJson =
          typeof stateRow.state_json === "object" && stateRow.state_json !== null
            ? (stateRow.state_json as Record<string, unknown>)
            : {};
        const next = { ...stateJson, phase: "endgame" };
        await supa
          .from("game_state")
          .update({
            state_json: next,
            version: (stateRow.version as number) + 1,
          })
          .eq("game_id", gameId);
      }
      await supa
        .from("games")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", gameId);
      await supa.from("game_members").delete().eq("game_id", gameId);
      await supa.from("game_events").insert({
        game_id: gameId,
        actor_session_id: userId,
        type: "game.forceEnded",
        payload_json: { reason: "facilitator_force_end" },
      });
      return NextResponse.json({ ok: true, forceEnded: true });
    }

    // Default path — full tear-down for lobby/ended.
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
