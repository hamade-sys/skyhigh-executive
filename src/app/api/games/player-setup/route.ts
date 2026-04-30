/**
 * POST /api/games/player-setup — player saves their airline customisation
 * before the game starts.
 *
 * Body: {
 *   gameId:      string,
 *   sessionId:   string,
 *   airlineName: string,
 *   code:        string,   // 2-3 letter IATA-style
 *   hub:         string,   // airport code e.g. "IST"
 *   doctrine:    string,   // "premium-service" | "budget-expansion" | ...
 * }
 *
 * Stores the setup in game_state.state_json.playerSetups[sessionId] so
 * the start route can use real player choices when seeding teams instead
 * of auto-generated defaults.
 *
 * Uses a read-modify-write without CAS because each player only writes
 * to their own key — concurrent updates from different players don't
 * conflict on the same key.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

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
    const body = await req.json();
    const { gameId, sessionId, airlineName, code, hub, doctrine } = body ?? {};

    if (!gameId || !sessionId || !airlineName || !code || !hub || !doctrine) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }
    if (!VALID_DOCTRINES.includes(doctrine)) {
      return NextResponse.json({ error: "Invalid doctrine." }, { status: 400 });
    }
    if (airlineName.trim().length < 2) {
      return NextResponse.json({ error: "Airline name too short." }, { status: 400 });
    }
    if (code.trim().length < 2 || code.trim().length > 3) {
      return NextResponse.json({ error: "Code must be 2-3 characters." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    // Load current state
    const { data: stateRow, error: loadErr } = await supa
      .from("game_state")
      .select("state_json")
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
        [sessionId]: {
          airlineName: airlineName.trim(),
          code: code.trim().toUpperCase().slice(0, 3),
          hub: hub.trim().toUpperCase(),
          doctrine,
        },
      },
    };

    const { error: writeErr } = await supa
      .from("game_state")
      .update({ state_json: updated })
      .eq("game_id", gameId);

    if (writeErr) {
      return NextResponse.json({ error: writeErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
