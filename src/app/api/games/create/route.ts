/**
 * POST /api/games/create — host creates a new game.
 *
 * Body shape (validated below):
 *   {
 *     name:         string         // 1-80 chars
 *     mode:         'facilitated' | 'self_guided'
 *     visibility:   'public' | 'private'
 *     maxTeams:     number          // 1-12
 *     initialState: GameState       // post-onboarding seeded state
 *   }
 *
 * Returns: { game: GameRow, state: GameStateRow, joinCode?: string }
 *
 * Auth (Phase A — security hotfix S1):
 *   The host's user id is now ALWAYS derived from the cookie-bound
 *   auth session via getCookieClient(). Previously the route accepted
 *   `hostSessionId` from the request body and trusted it — which let
 *   any caller create games owned by any other user:
 *     POST {hostSessionId:"victim-uuid", gameMasterSessionId:"attacker-uuid"}
 *     → victim-owned game with attacker as facilitator.
 *
 *   The body's `hostSessionId` and `gameMasterSessionId` fields are
 *   now ignored — both are forced to the authenticated user's id.
 *   `beGameMaster` still controls whether THAT user gets GM powers,
 *   but a user can never create a game where someone ELSE holds GM.
 *
 *   Anonymous Supabase sessions are rejected (must be a real account):
 *   hosting a game costs the org money/quota and bills against the
 *   creator's identity, so it requires a real account. Guests can
 *   still join existing games by code or via the public lobby.
 */

import { NextRequest, NextResponse } from "next/server";
import { createGame } from "@/lib/games/api";
import { getCookieClient } from "@/lib/supabase/server-auth";
import { assertSameOrigin } from "@/lib/csrf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // ── CSRF: same-origin gate (Phase A — S4) ───────────────
    if (!assertSameOrigin(req)) {
      return NextResponse.json(
        { error: "Forbidden — cross-origin request." },
        { status: 403 },
      );
    }

    // ── Auth gate ───────────────────────────────────────────
    // Read the authenticated user from the request cookies; reject
    // unauthenticated AND anonymous-session callers. We use the full
    // getUser() (server-revalidated) here, not the fast getSession(),
    // because this is a billable mutation surface that creates a row
    // in the games table — the extra ~150ms is worth it.
    const supa = await getCookieClient();
    const { data, error } = await supa.auth.getUser();
    if (error || !data.user) {
      return NextResponse.json(
        { error: "Not signed in. Please log in to host a game." },
        { status: 401 },
      );
    }
    if (data.user.is_anonymous) {
      return NextResponse.json(
        {
          error:
            "Anonymous guest accounts can't host games. Sign in with Google, Microsoft, or email to continue.",
        },
        { status: 403 },
      );
    }
    const authUserId = data.user.id;

    const body = await req.json();
    const {
      name,
      mode,
      visibility,
      maxTeams,
      beGameMaster,
      totalRounds,
      campaignMode,
      quarterTimerSeconds,
      boardDecisionsEnabled,
      plannedSeats,
      initialState,
    } = body ?? {};

    // Note: `hostSessionId` and `gameMasterSessionId` are intentionally
    // NOT destructured from the body. They are derived from `authUserId`
    // below — accepting them from the body was the S1 vulnerability.

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
    // Cap is 120 to admit the full campaign (120 quarters · 2000–2029).
    if (totalRounds !== undefined && (typeof totalRounds !== "number" || totalRounds < 4 || totalRounds > 120)) {
      return NextResponse.json({ error: "Total rounds must be 4-120." }, { status: 400 });
    }
    if (campaignMode !== undefined && campaignMode !== "half" && campaignMode !== "full") {
      return NextResponse.json({ error: "Invalid campaign mode." }, { status: 400 });
    }
    // Quarter timer: 0 means "no timer" (Game Master closes manually).
    // Range cap at 4 hours per quarter to prevent typos that would
    // otherwise create games that never end.
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

    // ── Derive ownership from auth, NOT from body ──────────
    // Both fields are pinned to the authenticated user. The
    // `beGameMaster` boolean still controls whether the new game
    // wires up GM powers — but the GM is always the creator, never
    // a third party.
    const hostSessionId = authUserId;
    const wantGameMaster = typeof beGameMaster === "boolean" ? beGameMaster : false;
    const gameMasterSessionId = wantGameMaster ? authUserId : undefined;

    const result = await createGame({
      name: name.trim().slice(0, 80),
      mode,
      visibility,
      maxTeams,
      hostSessionId,
      gameMasterSessionId,
      beGameMaster: wantGameMaster,
      totalRounds,
      campaignMode: campaignMode === "full" ? "full" : "half",
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
    // Don't leak DB error strings to the client — log server-side,
    // return a generic message + status so the client doesn't see
    // raw Postgres / Supabase error text.
    const detail = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/games/create] internal error:", detail);
    return NextResponse.json({ error: "Failed to create game." }, { status: 500 });
  }
}
