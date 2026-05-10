/**
 * POST /api/games/heartbeat — bump `last_seen_at` for the calling
 * user's game_members row.
 *
 * Phase 6 P1 of the enterprise-readiness plan. Workshop-critical:
 * a player who closes their tab mid-quarter (or whose laptop went
 * to sleep) shouldn't block the cohort indefinitely. The heartbeat
 * endpoint is called every 30s by the play/lobby pages so peers
 * can see "away (Nm)" indicators and the facilitator can decide
 * whether to skip them.
 *
 * Fire-and-forget by design — if Supabase is briefly down, the
 * heartbeat just no-ops; the next call catches up. We don't surface
 * errors to the user because there's nothing they can do about a
 * heartbeat fault.
 *
 * Body: { gameId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
// High-frequency endpoint (every 30s per active player). Use the
// cookie-decode auth so we don't spend 100ms per heartbeat hitting
// GoTrue. Cheaper at scale; see server-auth.ts for security caveats.
import { getSessionUserId } from "@/lib/supabase/server-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const userId = await getSessionUserId();
    if (!userId) {
      // Anonymous heartbeat is a no-op — the row doesn't exist for
      // them anyway. Return 200 silently so the client's interval
      // doesn't surface noise.
      return NextResponse.json({ ok: true, anonymous: true });
    }

    const body = await req.json().catch(() => ({}));
    const { gameId } = body ?? {};
    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    // Single-row update with no select — we don't care about the
    // returned row. Membership existence implicitly gates the write
    // (no row, no update, no error).
    await supa
      .from("game_members")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("game_id", gameId)
      .eq("session_id", userId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    // Never fail loud — heartbeat noise on the client is worse than
    // a missed ping.
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg, ok: false }, { status: 500 });
  }
}
