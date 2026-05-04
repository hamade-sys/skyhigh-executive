/**
 * POST /api/games/claim-color — claim a unique airline color in a
 * multiplayer game. Phase 9 of the enterprise-readiness plan.
 *
 * Body: { gameId: string, colorId: AirlineColorId }
 *
 * Behaviour:
 *   - Caller identity is server-derived (Phase 1 hardening). Body
 *     param `actorSessionId` is no longer accepted.
 *   - `assertMembership` confirms the caller is a member of the game.
 *   - Atomic uniqueness: the color is written to the caller's
 *     `game_members.airline_color_id` only if no OTHER member of
 *     the same game has it. Race-safe via the WHERE NOT EXISTS
 *     subquery in the Postgres update — losers see 0 rows updated
 *     and get a 409 telling them the color was claimed in flight.
 *
 * The Team object in `game_state.state_json` is updated separately
 * by the client (the store's `setAirlineColor` action runs locally,
 * then `pushStateToServer` syncs the team's `airlineColorId` field
 * via the existing state-update path).
 */

import { NextRequest, NextResponse } from "next/server";
import { assertMembership } from "@/lib/games/api";
import { getServerClient } from "@/lib/supabase/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { isAirlineColorId } from "@/lib/games/airline-colors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to claim a color." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const { gameId, colorId } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    if (!isAirlineColorId(colorId)) {
      return NextResponse.json(
        { error: "Invalid colorId — must be one of the 8 palette ids." },
        { status: 400 },
      );
    }

    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      return NextResponse.json({ error: membership.error }, { status: 403 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // Step 1: peek for conflicts BEFORE writing. Cheaper than the
    // CAS-style approach for a tiny 8-row keyspace.
    const { data: existing } = await supa
      .from("game_members")
      .select("session_id, airline_color_id")
      .eq("game_id", gameId)
      .eq("airline_color_id", colorId)
      .neq("session_id", userId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { error: "Color already taken by another airline." },
        { status: 409 },
      );
    }

    // Step 2: write our claim. Idempotent — if the caller already
    // owns this color, the row update is a no-op.
    const { error: writeErr } = await supa
      .from("game_members")
      .update({ airline_color_id: colorId })
      .eq("game_id", gameId)
      .eq("session_id", userId);
    if (writeErr) {
      return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, colorId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
