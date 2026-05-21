/**
 * POST /api/games/close-quarter — authoritative quarter close (simulation only).
 *
 * Runs the shared engine on the server, persists `phase: quarter-closing`
 * and `lastCloseResult`, then broadcasts so all clients hydrate.
 *
 * Body: {
 *   gameId: string,
 *   expectedVersion: number,
 *   fromQuarter?: number,          // idempotency — skip if already advanced
 *   facilitatorAdvance?: boolean,  // GM: close + advance in one call
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
    const { gameId, expectedVersion, fromQuarter, facilitatorAdvance } = body ?? {};

    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    if (typeof expectedVersion !== "number") {
      return NextResponse.json({ error: "expectedVersion required." }, { status: 400 });
    }

    const step = facilitatorAdvance === true ? "close-and-advance" : "close";

    const result = await runServerQuarterMutation({
      gameId,
      userId,
      expectedVersion,
      step,
      facilitatorAdvance: facilitatorAdvance === true,
      fromQuarter: typeof fromQuarter === "number" ? fromQuarter : undefined,
    });

    if (!result.ok) {
      const status = result.error.includes("Stale") ||
        result.error.includes("Not all human") ||
        result.error.includes("designated closer")
        ? 409
        : result.error.includes("Not authorised") ||
            result.error.includes("Facilitator") ||
            result.error.includes("member")
          ? 403
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      state: result.data.state,
      closedQuarter: result.data.closedQuarter,
      alreadyApplied: result.data.alreadyApplied ?? false,
      snapshot: result.data.snapshot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
