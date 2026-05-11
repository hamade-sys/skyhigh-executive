/**
 * POST /api/games/request-quarter-close
 *
 * Called when a player clicks "End Quarter →" in multiplayer self-guided
 * mode. This endpoint:
 *   1. Atomically marks the calling player's team ready (same CAS loop as
 *      /api/games/mark-ready).
 *   2. Broadcasts "player.quarterCloseRequested" with a 30-second deadline
 *      so every other browser shows a countdown banner ("X is closing in
 *      30s — close now or wait").
 *   3. Returns { allReady: boolean; deadlineAt: string } so the calling
 *      browser can skip the countdown and close immediately if it was
 *      actually the last human to mark ready.
 *
 * Body:  { gameId: string }
 * Returns:
 *   200 { allReady: boolean; deadlineAt: string }
 *   400 { error }   bad input
 *   401 { error }   not signed in
 *   403 { error }   not a member
 *   404 { error }   game state not found
 *   409 { error }   CAS conflict after retries
 *   500 { error }   server fault
 */

import { NextRequest, NextResponse } from "next/server";
import { assertMembership } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_RETRIES = 5;
/** How long peers have to react before the requesting browser auto-closes. */
const COUNTDOWN_SECONDS = 30;

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

    // CAS retry loop — atomically flip this player's readyForNextQuarter
    // and check if all human teams are now ready.
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

      // Find the team owned by this user and their display name.
      let myTeamName = "A player";
      let myTeamId = "";
      let found = false;
      const myTeamIdFromMembership = membership.data.team_id ?? null;
      const updatedTeams = teams.map((t) => {
        const matchesCaller =
          t.claimedBySessionId === userId ||
          (typeof t.id === "string" &&
            myTeamIdFromMembership !== null &&
            t.id === myTeamIdFromMembership);
        if (matchesCaller) {
          found = true;
          myTeamId = String(t.id ?? "");
          myTeamName = String(t.airlineName ?? t.name ?? "A player");
          return {
            ...t,
            readyForNextQuarter: true,
            readyForQuarter: currentQuarter,
          };
        }
        return t;
      });

      if (!found) {
        // Observer / GM — nothing to mark.
        return NextResponse.json({
          allReady: false,
          deadlineAt: new Date(Date.now() + COUNTDOWN_SECONDS * 1000).toISOString(),
        });
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
        // CAS conflict — retry with fresh read.
        if (attempt < MAX_RETRIES - 1) continue;
        return NextResponse.json(
          { error: "Concurrent write conflict after retries." },
          { status: 409 },
        );
      }

      // Check if all human teams are now ready (after our flag is set).
      const humanTeams = updatedTeams.filter(
        (t) => t.controlledBy === "human",
      );
      const allReady =
        humanTeams.length > 0 &&
        humanTeams.every(
          (t) =>
            t.readyForNextQuarter === true &&
            t.readyForQuarter === currentQuarter,
        );

      const deadlineAt = new Date(
        Date.now() + COUNTDOWN_SECONDS * 1000,
      ).toISOString();

      if (allReady) {
        // All players were already ready — just tell the caller to close
        // immediately (no countdown needed). Still broadcast stateChanged
        // so other browsers know to re-hydrate.
        await broadcastGameEvent({
          gameId,
          event: "game.stateChanged",
          payload: { eventType: "player.markedReady", version: written.version },
        });
      } else {
        // Broadcast the countdown event so every other browser shows the
        // "X is closing in 30s" banner.
        await broadcastGameEvent({
          gameId,
          event: "player.quarterCloseRequested",
          payload: {
            byTeamId: myTeamId,
            byTeamName: myTeamName,
            deadlineAt,
            version: written.version,
          },
        });
      }

      return NextResponse.json({ allReady, deadlineAt });
    }

    /* istanbul ignore next */
    return NextResponse.json({ error: "Unexpected loop exit." }, { status: 500 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
