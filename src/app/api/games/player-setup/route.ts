/**
 * POST /api/games/player-setup — player saves their airline customisation
 * before the game starts.
 *
 * Body: {
 *   gameId:      string,
 *   airlineName: string,
 *   code:        string,   // 2-3 letter IATA-style
 *   hub:         string,   // airport code e.g. "IST"
 *   doctrine:    string,   // "premium-service" | "budget-expansion" | ...
 * }
 *
 * IMPORTANT (Phase 1 hardening): identity is server-derived from the
 * cookie-bound auth session. The body parameter `sessionId` is no
 * longer accepted — trusting it allowed any browser to overwrite
 * other players' airline configs. The setup is keyed by the
 * authenticated user's id only, and we use optimistic CAS to prevent
 * concurrent writes from clobbering each other.
 *
 * Authorization: caller must be a member of the game (assertMembership).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertMembership, submitStateMutation } from "@/lib/games/api";
import { getServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { isAirlineColorId } from "@/lib/games/airline-colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_DOCTRINES = [
  "premium-service",
  "budget-expansion",
  "cargo-dominance",
  "global-network",
];

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to save your airline setup." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId, airlineName, code, hub, doctrine, airlineColorId } = body ?? {};

    if (!gameId || !airlineName || !code || !hub || !doctrine) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!VALID_DOCTRINES.includes(doctrine)) {
      return NextResponse.json({ error: "Invalid doctrine." }, { status: 400 });
    }
    // Phase 9 — airlineColorId is optional but if provided must be valid.
    // The picker writes via /api/games/claim-color first (server enforces
    // uniqueness in game_members.airline_color_id); player-setup just
    // mirrors that into the engine state for rendering.
    if (airlineColorId !== undefined && airlineColorId !== null && !isAirlineColorId(airlineColorId)) {
      return NextResponse.json({ error: "Invalid airlineColorId." }, { status: 400 });
    }
    if (airlineName.trim().length < 2) {
      return NextResponse.json({ error: "Airline name too short." }, { status: 400 });
    }
    if (code.trim().length < 2 || code.trim().length > 3) {
      return NextResponse.json({ error: "Code must be 2-3 characters." }, { status: 400 });
    }

    // Verify membership before any write — non-members cannot set a
    // player_setups entry (would let an attacker stuff fake setups
    // into a public lobby they haven't joined).
    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // Read-modify-write with CAS so two concurrent player-setup saves
    // (or a player-setup + state-update race) don't lose updates.
    const { data: stateRow, error: loadErr } = await supa
      .from("game_state")
      .select("state_json, version")
      .eq("game_id", gameId)
      .single();

    if (loadErr || !stateRow) {
      return NextResponse.json({ error: "Game state not found." }, { status: 404 });
    }

    const stateJson = (stateRow.state_json as Record<string, unknown>) ?? {};
    const existingSetups = (stateJson.playerSetups as Record<string, unknown>) ?? {};

    const updated = {
      ...stateJson,
      playerSetups: {
        ...existingSetups,
        // Key the setup by the AUTHENTICATED userId — never a body
        // param. Each user can only write to their own slot.
        [userId]: {
          airlineName: airlineName.trim(),
          code: code.trim().toUpperCase().slice(0, 3),
          hub: hub.trim().toUpperCase(),
          doctrine,
          airlineColorId: airlineColorId ?? null,
        },
      },
    };

    const result = await submitStateMutation({
      gameId,
      expectedVersion: (stateRow.version as number) ?? 1,
      newState: updated,
      actorSessionId: userId,
      actorTeamId: membership.data.team_id ?? undefined,
      eventType: "player.setupSaved",
      eventPayload: {
        userId,
        doctrine,
        hub: hub.trim().toUpperCase(),
      },
    });
    if (!result.ok) {
      const status = result.error.toLowerCase().includes("stale state") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
