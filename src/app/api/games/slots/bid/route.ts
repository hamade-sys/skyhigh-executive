/**
 * POST /api/games/slots/bid — authoritative slot bid mutation.
 */

import { NextRequest, NextResponse } from "next/server";
import { runServerStoreMutation } from "@/lib/game-engine/server-mutation";
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
    const { gameId, expectedVersion, airportCode, slots, pricePerSlot } = body ?? {};

    if (typeof gameId !== "string" || typeof expectedVersion !== "number") {
      return NextResponse.json(
        { error: "gameId and expectedVersion required." },
        { status: 400 },
      );
    }
    if (typeof airportCode !== "string" || typeof slots !== "number" || typeof pricePerSlot !== "number") {
      return NextResponse.json({ error: "Invalid bid payload." }, { status: 400 });
    }

    const { useGame } = await import("@/store/game");

    const result = await runServerStoreMutation({
      gameId,
      userId,
      expectedVersion,
      eventType: "player.slotBidSubmitted",
      eventPayload: { airportCode, slots, pricePerSlot },
      action: () => useGame.getState().submitSlotBid(airportCode, slots, pricePerSlot),
      isOk: (r) => r.ok === true,
      errorMessage: (r) => (!r.ok ? r.error : undefined),
    });

    if (!result.ok) {
      const status = result.error.includes("Stale") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      state: result.data.state,
      bidResult: result.data.result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
