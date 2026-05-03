/**
 * GET /api/games/load?gameId=...&includeState=1 — fetch a game's row,
 * members, and (when permitted) the engine state snapshot.
 *
 * IMPORTANT (Phase 1 hardening): the previous version returned every
 * caller the full game row + every member's session_id + the full
 * state JSON, with no auth gating. Anyone with a `gameId` could read
 * private game state and harvest other players' identifiers. The
 * fixed version:
 *
 *   - Public lobbies in `status='lobby'`: any caller (signed-in or
 *     anonymous) gets game row + redacted members (display name +
 *     role only, NO session_id). State is NEVER returned to non-members.
 *   - Private lobbies, or any game in `status='playing'` / `'ended'`:
 *     caller MUST be signed in AND a member (or host/facilitator).
 *     Members get state + a members list with their OWN session_id
 *     unredacted; other members' session_ids are still redacted.
 *     Host/facilitator additionally see all session_ids unredacted
 *     (they need them to administer the cohort).
 *
 * The lobby + play page contracts changed to handle the redacted
 * shape — they only need their own session_id (which auth gives
 * them) and other members' display names + roles.
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

    // Public lobbies in 'lobby' status are browsable — but ONLY the
    // game row + redacted members are returned to non-members. The
    // engine state is never exposed to non-members regardless of
    // visibility / status.
    const isPublicBrowsable =
      game.visibility === "public" && game.status === "lobby";

    if (!isMember && !isPrivileged && !isPublicBrowsable) {
      return NextResponse.json(
        { error: "Not authorised to view this game." },
        { status: 403 },
      );
    }

    const redacted = redactMembers(members, userId, isPrivileged);

    // State JSON is only returned to members + host/facilitator.
    // Non-member browsers viewing a public lobby see the seat count
    // and a redacted member list, nothing else.
    const stateForCaller =
      includeState && (isMember || isPrivileged) ? state : undefined;

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
