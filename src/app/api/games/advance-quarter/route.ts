/**
 * POST /api/games/advance-quarter — advance after quarter-close digest.
 *
 * Body: {
 *   gameId: string,
 *   expectedVersion: number,
 *   fromQuarter?: number,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { runServerQuarterMutation } from "@/lib/game-engine/server-close";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const body = await req.json();
    const { gameId, expectedVersion, fromQuarter } = body ?? {};

    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    if (typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "expectedVersion required." }, { status: 400 });
    }

    const result = await runServerQuarterMutation({
      gameId,
      userId,
      expectedVersion,
      step: "advance",
      fromQuarter: typeof fromQuarter === "number" ? fromQuarter : undefined,
    });

    if (!result.ok) {
      const status =
        result.error.includes("Stale") ||
        result.error.includes("closing phase")
          ? 409
          : result.error.includes("member") ||
              result.error.includes("Facilitator")
            ? 403
            : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      state: result.data.state,
      advancedToQuarter: result.data.advancedToQuarter,
      alreadyApplied: result.data.alreadyApplied ?? false,
      snapshot: result.data.snapshot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
