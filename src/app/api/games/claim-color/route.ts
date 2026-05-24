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
 *   - **Atomic uniqueness** (Phase B — D4 hardening). Database-
 *     enforced via the unique partial index
 *     `game_members_airline_color_per_game_key` on
 *     `(game_id, airline_color_id) WHERE airline_color_id IS NOT NULL`
 *     (shipped in migration 0004). Pre-fix the route did a
 *     SELECT-then-UPDATE TOCTOU race: two players claiming the same
 *     color in the same ~1ms window could both pass the peek and
 *     both write, leaving the index violated in legacy DBs OR
 *     surfacing as a 500 in modern ones. Now we attempt the UPDATE
 *     directly and translate the PG 23505 unique violation into a
 *     clean 409 "Color already taken." Postgres serialises the
 *     constraint check; only one writer ever wins.
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

    // Phase B — D4: atomic claim. Postgres enforces uniqueness via
    // the partial index on (game_id, airline_color_id). We attempt
    // the UPDATE directly. If two players race for the same color,
    // exactly one UPDATE succeeds; the other receives a 23505
    // unique-violation which we translate to a 409.
    //
    // No peek-before-write — the peek was the TOCTOU race itself.
    // The DB is the only source of truth that's safe under
    // concurrent writes.
    const { error: writeErr } = await supa
      .from("game_members")
      .update({ airline_color_id: colorId })
      .eq("game_id", gameId)
      .eq("session_id", userId);

    if (writeErr) {
      const msg = writeErr.message ?? "";
      const code = writeErr.code ?? "";

      // 23505 = unique_violation. The partial index
      // game_members_airline_color_per_game_key forbids two members
      // of the same game holding the same color, so this means
      // another player claimed it microseconds ago.
      if (
        code === "23505" ||
        msg.toLowerCase().includes("duplicate key") ||
        msg.toLowerCase().includes("unique constraint")
      ) {
        return NextResponse.json(
          { error: "Color already taken by another airline." },
          { status: 409 },
        );
      }

      // Migration 0004 not applied — column doesn't exist on this DB.
      // Surface as a clean operator-actionable diagnostic rather than
      // a raw PG message.
      if (
        msg.toLowerCase().includes("airline_color_id") ||
        msg.toLowerCase().includes("does not exist") ||
        msg.toLowerCase().includes("undefined column")
      ) {
        return NextResponse.json(
          {
            error:
              "Color sync is offline — the airline_color_id column is missing on game_members. Operator action: apply migration 0004_airline_colors.sql against Supabase, then this endpoint comes online.",
          },
          { status: 503 },
        );
      }

      // Anything else — log server-side, return generic message to
      // the client (don't leak Supabase / PG error strings).
      console.error("[/api/games/claim-color] write failed:", msg, code);
      return NextResponse.json(
        { error: "Could not claim color. Please retry." },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, colorId });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    console.error("[/api/games/claim-color] internal error:", detail);
    return NextResponse.json(
      { error: "Internal error claiming color." },
      { status: 500 },
    );
  }
}
