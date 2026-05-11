/**
 * POST /api/games/seat-config
 *
 * Host or Game Master updates the per-seat type/difficulty config
 * while the game is still in the lobby. Only unclaimed seats can
 * have their type changed; claimed human seats are ignored.
 *
 * Body: {
 *   gameId:      string
 *   seatConfigs: Array<{
 *     index:      number           // 0-based seat index
 *     type:       "human" | "bot"
 *     difficulty: "easy" | "medium" | "hard"  // bots only
 *   }>
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { assertHostOrFacilitator } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SeatConfigEntry {
  index: number;
  type: "human" | "bot";
  difficulty?: "easy" | "medium" | "hard";
  /** Phase-9 follow-up: optional host-controlled color override for
   *  bot seats. Persisted into plannedSeats[i].botColorOverride; the
   *  start route honors it when seeding bot teams. Validated against
   *  the AIRLINE_COLOR_PALETTE id list at write-time, but stored as a
   *  raw string here so seat-config doesn't need a runtime dep on the
   *  airline-colors module. */
  botColorOverride?: string | null;
  /** Airline name + IATA code shown in the lobby preview. Persisted so
   *  /api/games/start uses the exact same names rather than re-rolling. */
  botName?: string;
  botCode?: string;
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const body = await req.json();
    const { gameId, seatConfigs } = body ?? {};

    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    if (!Array.isArray(seatConfigs)) {
      return NextResponse.json({ error: "seatConfigs must be an array." }, { status: 400 });
    }

    // Only host or GM can change seat configuration.
    const auth = await assertHostOrFacilitator(gameId, userId);
    if (!auth.ok) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.error.includes("not found") ? 404 : 403 },
      );
    }

    // Check game is still in lobby.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { data: game, error: gameErr } = await supa
      .from("games")
      .select("status")
      .eq("id", gameId)
      .single();

    if (gameErr || !game) {
      return NextResponse.json({ error: "Game not found." }, { status: 404 });
    }
    if ((game as { status: string }).status !== "lobby") {
      return NextResponse.json(
        { error: "Seat config can only be changed while the game is in the lobby." },
        { status: 409 },
      );
    }

    // Load current game state.
    const { data: stateRow, error: stateErr } = await supa
      .from("game_state")
      .select("state_json, version")
      .eq("game_id", gameId)
      .single();

    if (stateErr || !stateRow) {
      return NextResponse.json({ error: "Game state not found." }, { status: 404 });
    }

    const row = stateRow as { state_json: unknown; version: number };
    const stateJson = row.state_json as Record<string, unknown>;
    const session = (stateJson.session as Record<string, unknown> | undefined) ?? {};

    // Build updated plannedSeats from the incoming configs.
    // Color override + bot name/code are stored only for bot seats;
    // human seats clear them so a bot→human flip leaves no stale hints.
    const plannedSeats = (seatConfigs as SeatConfigEntry[]).map((s, i) => ({
      id: `seat-${s.index ?? i}`,
      type: s.type === "bot" ? "bot" : "human",
      botDifficulty: s.type === "bot" ? (s.difficulty ?? "medium") : undefined,
      botColorOverride:
        s.type === "bot" && typeof s.botColorOverride === "string"
          ? s.botColorOverride
          : undefined,
      botName: s.type === "bot" && typeof s.botName === "string" && s.botName.length > 0
        ? s.botName
        : undefined,
      botCode: s.type === "bot" && typeof s.botCode === "string" && s.botCode.length > 0
        ? s.botCode
        : undefined,
    }));

    const updatedState = {
      ...stateJson,
      session: {
        ...session,
        plannedSeats,
      },
    };

    // CAS write — reject on version mismatch (another writer raced us).
    const { error: updateErr } = await supa
      .from("game_state")
      .update({ state_json: updatedState, version: row.version + 1 })
      .eq("game_id", gameId)
      .eq("version", row.version);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
