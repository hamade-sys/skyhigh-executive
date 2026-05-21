/**
 * POST /api/games/routes/open — authoritative route open mutation.
 */

import { NextRequest, NextResponse } from "next/server";
import { runServerStoreMutation } from "@/lib/game-engine/server-mutation";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import type { GameStore } from "@/store/game";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type OpenRouteArgs = Parameters<GameStore["openRoute"]>[0];

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }

    const body = await req.json();
    const { gameId, expectedVersion, route } = body ?? {};

    if (typeof gameId !== "string" || typeof expectedVersion !== "number") {
      return NextResponse.json(
        { error: "gameId and expectedVersion required." },
        { status: 400 },
      );
    }
    if (!route || typeof route !== "object") {
      return NextResponse.json({ error: "route payload required." }, { status: 400 });
    }

    const routeArgs = route as OpenRouteArgs;
    const { useGame } = await import("@/store/game");

    const result = await runServerStoreMutation({
      gameId,
      userId,
      expectedVersion,
      eventType: "player.openedRoute",
      eventPayload: {
        originCode: routeArgs.originCode,
        destCode: routeArgs.destCode,
      },
      action: () => useGame.getState().openRoute(routeArgs),
      isOk: (r) => r.ok === true,
      errorMessage: (r) => (!r.ok ? r.error : undefined),
    });

    if (!result.ok) {
      const status =
        result.error.includes("Stale") ||
        result.error.includes("member")
          ? 409
          : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json({
      ok: true,
      state: result.data.state,
      routeResult: result.data.result,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
