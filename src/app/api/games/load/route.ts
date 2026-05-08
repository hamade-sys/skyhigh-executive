/**
 * GET /api/games/load?gameId=...&includeState=1 — fetch a game's row,
 * members, and (when permitted) the engine state snapshot.
 *
 * Visibility rules:
 *
 *   - Public games (any status): browsable by ANY caller, signed in
 *     or not. Members + host/facilitator additionally get state JSON
 *     (and full session_ids for the privileged roles); non-members
 *     get state JSON for spectator mode but with all session_ids
 *     redacted except their own (when signed in). Spectators can
 *     watch — they just can't mutate (no chat send, no claim color,
 *     no forfeit, no state push; those endpoints all assert
 *     membership separately).
 *   - Private games (any status): caller MUST be signed in AND a
 *     member (or host/facilitator). 403 otherwise. Members get state
 *     + their own session_id; host/facilitator also see all
 *     session_ids unredacted so they can administer the cohort.
 *
 * The lobby + play pages handle the spectator shape (no team claim,
 * no mutation buttons) — see GameCanvas's `isObserver` branch.
 */

import { NextRequest, NextResponse } from "next/server";
import { loadGame } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import type { GameMemberRow } from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RedactedMember {
  game_id: string;
  // session_id is replaced with `null` for other members; only the
  // caller's own session_id is returned. Host/facilitator clients
  // still see real session_ids so they can route admin actions to
  // specific members.
  session_id: string | null;
  role: GameMemberRow["role"];
  team_id: string | null;
  display_name: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
}

function redactMembers(
  members: GameMemberRow[],
  callerUserId: string | null,
  callerCanSeeAll: boolean,
): RedactedMember[] {
  return members.map((m) => ({
    game_id: m.game_id,
    session_id:
      callerCanSeeAll || (callerUserId !== null && m.session_id === callerUserId)
        ? m.session_id
        : null,
    role: m.role,
    team_id: m.team_id ?? null,
    display_name: m.display_name ?? null,
    connected_at: m.connected_at ?? null,
    last_seen_at: m.last_seen_at ?? null,
  }));
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const gameId = url.searchParams.get("gameId");
    const includeState = url.searchParams.get("includeState") === "1";
    if (!gameId) {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }

    const userId = await getAuthenticatedUserId();
    const result = await loadGame(gameId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    const { game, members, state } = result.data;

    const isMember = userId !== null && members.some((m) => m.session_id === userId);
    const isHost = userId !== null && game.created_by_session_id === userId;
    const isFacilitator =
      userId !== null && game.facilitator_session_id === userId;
    const isPrivileged = isHost || isFacilitator;

    // Public games (any status, including playing/ended) are
    // browsable by anyone — non-members get spectator access. They
    // see state JSON so the canvas / leaderboard / map render in
    // observer mode, but session_ids stay redacted (only caller's
    // own + privileged are unredacted) and mutation endpoints
    // (chat/send, claim-color, forfeit, state-update) still
    // assert membership separately.
    const isPublicBrowsable = game.visibility === "public";

    if (!isMember && !isPrivileged && !isPublicBrowsable) {
      return NextResponse.json(
        { error: "Not authorised to view this game." },
        { status: 403 },
      );
    }

    const redacted = redactMembers(members, userId, isPrivileged);

    // State JSON is returned to members, host/facilitator, AND
    // spectators of public games — observers need state to render
    // the canvas. Mutation paths still gate on membership at their
    // own endpoints, so spectators can watch but not act.
    const canSeeState = isMember || isPrivileged || isPublicBrowsable;
    const stateForCaller = includeState && canSeeState ? state : undefined;

    return NextResponse.json({
      game,
      members: redacted,
      state: stateForCaller,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
