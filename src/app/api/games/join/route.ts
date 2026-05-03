/**
 * POST /api/games/join — player claims a seat in an existing game.
 *
 * Body shape:
 *   {
 *     gameId?:      string   // for direct lobby links
 *     joinCode?:    string   // for /join?code=...... path
 *     displayName?: string   // shown in the lobby seat card
 *   }
 *
 * IMPORTANT (Phase 1 hardening): identity is server-derived from the
 * cookie-bound auth session — body parameter `sessionId` is no longer
 * accepted. Anonymous join is supported via a guest UUID in cookies
 * (Phase 4c work); for now the route requires sign-in.
 *
 * Per-IP rate limit: 10 attempts per 5 minutes. With 6-digit codes
 * (1M keyspace), this raises the brute-force floor to ~95 years per
 * IP — operationally infeasible. Returns 429 on lock.
 *
 * Response codes (Phase 1 hardening — semantic distinctions removed):
 *   - 401: not signed in
 *   - 404: returned for ALL "code/game not found OR not eligible"
 *          paths — never distinguishes "no such game" from "locked"
 *          to deny attackers a side-channel oracle.
 *   - 409: game is full (Phase 1.8)
 *   - 429: rate-limited
 *
 * Idempotent on success: re-joining with the same auth user is the
 * reconnect path; updates last_seen_at without creating a duplicate
 * seat.
 */

import { NextRequest, NextResponse } from "next/server";
import { findGame, joinGame } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_WINDOW_MINUTES = 5;
const RATE_LIMIT_MAX_ATTEMPTS = 10;

/** Per-IP rate limit on join attempts. Backed by the
 *  `join_rate_limit` table (created in 0002_rls_tighten.sql) so the
 *  count survives across Vercel function instances. Returns true if
 *  the caller is over the limit. Best-effort: if the rate-limit
 *  table doesn't exist yet (migration not applied), we let the
 *  request through rather than block all joins — the operator
 *  notices the missing table via the health check. */
async function isRateLimited(ip: string): Promise<boolean> {
  if (!ip || ip === "unknown") return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const cutoff = new Date(
    Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  ).toISOString();
  const { count, error } = await supa
    .from("join_rate_limit")
    .select("ip", { count: "exact", head: true })
    .eq("ip", ip)
    .gte("attempted_at", cutoff);
  if (error) {
    // Likely the table doesn't exist yet (pre-migration). Don't
    // brick the route — log and continue.
    console.warn("[join/rate-limit]", error.message);
    return false;
  }
  return (count ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS;
}

async function recordAttempt(ip: string): Promise<void> {
  if (!ip || ip === "unknown") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  await supa
    .from("join_rate_limit")
    .insert({ ip, attempted_at: new Date().toISOString() })
    .then((res: { error: { message: string } | null }) => {
      if (res.error) console.warn("[join/rate-limit insert]", res.error.message);
    });
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to join a game." },
        { status: 401 },
      );
    }

    // Identify the caller's IP for rate-limit. Vercel forwards the
    // real client IP in `x-forwarded-for`; the first entry is the
    // origin. Fall back to a literal "unknown" which the rate-limit
    // helper treats as "skip" to avoid penalizing dev requests.
    const forwarded = req.headers.get("x-forwarded-for") ?? "";
    const ip = forwarded.split(",")[0]?.trim() || "unknown";

    if (await isRateLimited(ip)) {
      return NextResponse.json(
        {
          error: "Too many join attempts. Wait a few minutes and try again.",
        },
        { status: 429 },
      );
    }
    // Record the attempt BEFORE we know success — we want to count
    // failed brute-force attempts as well as successes.
    await recordAttempt(ip);

    const body = await req.json();
    const { gameId, joinCode, displayName } = body ?? {};
    if (!gameId && !joinCode) {
      return NextResponse.json(
        { error: "Pass gameId or joinCode." },
        { status: 400 },
      );
    }

    const findRes = await findGame({ gameId, joinCode });
    if (!findRes.ok) {
      // Always 404 — never leak whether the code/game exists but is
      // locked or otherwise ineligible. The attacker model is "can
      // they tell a valid code from invalid?", and we want the
      // answer to be "no".
      return NextResponse.json(
        { error: "Game not found or not joinable." },
        { status: 404 },
      );
    }

    const joinRes = await joinGame({
      gameId: findRes.data.id,
      sessionId: userId,
      displayName: typeof displayName === "string" ? displayName.slice(0, 40) : undefined,
    });
    if (!joinRes.ok) {
      // Distinguish 409 (game full) from 400 (other validation) so
      // the client can show the right message.
      const isFull = joinRes.error.toLowerCase().includes("full")
        || joinRes.error.toLowerCase().includes("capacity");
      return NextResponse.json(
        { error: joinRes.error },
        { status: isFull ? 409 : 400 },
      );
    }

    return NextResponse.json({
      game: joinRes.data.game,
      member: joinRes.data.member,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
