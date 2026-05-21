/**
 * POST /api/games/create — host creates a new game.
 *
 * Host session id is derived from the authenticated user — never from
 * the request body — so snapshot/admin checks align with game_members.
 */

import { NextRequest, NextResponse } from "next/server";
import { createGame } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      mode,
      visibility,
      maxTeams,
      gameMasterSessionId,
      beGameMaster,
      totalRounds,
      quarterTimerSeconds,
      boardDecisionsEnabled,
      plannedSeats,
      initialState,
    } = body ?? {};

    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Game name is required." }, { status: 400 });
    }
    if (mode !== "facilitated" && mode !== "self_guided") {
      return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
    }
    if (visibility !== "public" && visibility !== "private") {
      return NextResponse.json({ error: "Invalid visibility." }, { status: 400 });
    }
    if (typeof maxTeams !== "number" || maxTeams < 1 || maxTeams > 12) {
      return NextResponse.json({ error: "Max teams must be 1-12." }, { status: 400 });
    }
    if (totalRounds !== undefined && (typeof totalRounds !== "number" || totalRounds < 4 || totalRounds > 80)) {
      return NextResponse.json({ error: "Total rounds must be 4-80." }, { status: 400 });
    }
    if (
      quarterTimerSeconds !== undefined &&
      (typeof quarterTimerSeconds !== "number" ||
        quarterTimerSeconds < 0 ||
        quarterTimerSeconds > 14_400)
    ) {
      return NextResponse.json(
        { error: "Quarter timer must be 0-14400 seconds (0-4 hours)." },
        { status: 400 },
      );
    }
    if (initialState === undefined || initialState === null) {
      return NextResponse.json(
        { error: "Initial state required." },
        { status: 400 },
      );
    }

    const result = await createGame({
      name: name.trim().slice(0, 80),
      mode,
      visibility,
      maxTeams,
      hostSessionId: userId,
      gameMasterSessionId:
        typeof gameMasterSessionId === "string" ? gameMasterSessionId : undefined,
      beGameMaster: typeof beGameMaster === "boolean" ? beGameMaster : undefined,
      totalRounds,
      quarterTimerSeconds:
        typeof quarterTimerSeconds === "number" ? quarterTimerSeconds : undefined,
      boardDecisionsEnabled:
        typeof boardDecisionsEnabled === "boolean" ? boardDecisionsEnabled : undefined,
      plannedSeats: Array.isArray(plannedSeats) ? plannedSeats : undefined,
      initialState,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      game: result.data.game,
      state: result.data.state,
      joinCode: result.data.game.join_code,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
