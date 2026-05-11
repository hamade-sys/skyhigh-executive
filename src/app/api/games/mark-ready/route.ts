/**
 * POST /api/games/mark-ready — atomically sets readyForNextQuarter=true
 * for the calling player's team without clobbering other players' flags.
 *
 * WHY THIS EXISTS (not just pushStateToServer):
 * pushStateToServer sends the full Zustand store state from the browser.
 * In self-guided multiplayer each browser only knows its OWN ready flag —
 * Player A's browser has {A.ready:true, B.ready:false}, Player B has
 * {A.ready:false, B.ready:true}. Whichever push lands second overwrites
 * the first player's flag, so the server always ends up with one flag
 * true and one false. Neither browser ever sees both ready → deadlock.
 *
 * This endpoint fixes it with a server-side read-modify-write:
 *   1. Read the latest game_state (includes ALL teams' current flags)
 *   2. Flip ONLY the calling player's team's readyForNextQuarter to true
 *   3. Write back with CAS (version check) — retry on conflict
 *
 * With the retry loop, two simultaneous calls are serialised safely:
 * the loser re-reads the winner's state (which already has their flag
 * set) and merges its own flag on top. The final DB state has both true.
 *
 * Body:    { gameId: string }
 * Returns: { ok: true }
 */

import { NextRequest, NextResponse } from "next/server";
import { assertMembership } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RETRIES = 5;

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // CAS retry loop — if two players hit this endpoint simultaneously,
    // one will get a version conflict. The retry re-reads the fresh state
    // (which now includes the other player's flag) and applies its own
    // flag on top, guaranteeing both end up true with no lost writes.
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      const { data: row, error: loadErr } = await supa
        .from("game_state")
        .select("state_json, version")
        .eq("game_id", gameId)
        .single();

      if (loadErr || !row) {
        return NextResponse.json(
          { error: "Game state not found." },
          { status: 404 },
        );
      }

      const stateJson = row.state_json as Record<string, unknown>;
      const teams = (
        stateJson.teams as Array<Record<string, unknown>> | undefined
      ) ?? [];
      const currentQuarter = typeof stateJson.currentQuarter === "number"
        ? stateJson.currentQuarter
        : 0;

      // Only flip the flag for the team claimed by this user.
      // Every other team's flag is preserved exactly as it is in the DB.
      let found = false;
      const myTeamId = membership.data.team_id ?? null;
      const updatedTeams = teams.map((t) => {
        const matchesCaller =
          t.claimedBySessionId === userId ||
          (typeof t.id === "string" && myTeamId !== null && t.id === myTeamId);
        if (matchesCaller) {
          found = true;
          return {
            ...t,
            readyForNextQuarter: true,
            readyForQuarter: currentQuarter,
          };
        }
        return t;
      });

      if (!found) {
        // No claimed team — observer / GM. Nothing to mark.
        return NextResponse.json({ ok: true });
      }

      const { data: written, error: writeErr } = await supa
        .from("game_state")
        .update({
          state_json: { ...stateJson, teams: updatedTeams },
          version: row.version + 1,
        })
        .eq("game_id", gameId)
        .eq("version", row.version)
        .select("version")
        .maybeSingle();

      if (writeErr) {
        return NextResponse.json({ error: writeErr.message }, { status: 500 });
      }

      if (!written) {
        // CAS conflict — concurrent write beat us. Retry with fresh read.
        if (attempt < MAX_RETRIES - 1) continue;
        return NextResponse.json(
          { error: "Concurrent write conflict after retries." },
          { status: 409 },
        );
      }

      // Broadcast so every browser in the session re-hydrates immediately
      // and the all-ready check in hydrateFromServerState can fire.
      await broadcastGameEvent({
        gameId,
        event: "game.stateChanged",
        payload: { eventType: "player.markedReady", version: written.version },
      });

      return NextResponse.json({ ok: true });
    }

    /* istanbul ignore next */
    return NextResponse.json({ error: "Unexpected loop exit." }, { status: 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
