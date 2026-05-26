/**
 * GET /api/cron/stale-games — Phase C M1.
 *
 * Daily Vercel cron (04:00 UTC = 07:00 UAE). Surfaces games that
 * have been stuck in `status='playing'` with no state update for
 * 7+ days — most likely abandoned cohorts that won't naturally end.
 *
 * Action policy is **observational only** (current iteration):
 *   - Log the stale game id, name, last-update timestamp, member
 *     count to the function log (lands in Vercel observability).
 *   - Return JSON listing them so the operator (or a follow-up
 *     /api/admin endpoint) can review.
 *   - Do NOT auto-end games. A multi-week workshop cohort that
 *     takes a real break between sessions would lose state.
 *     Operator-in-the-loop is the right policy until we have a
 *     more confident signal (e.g. all members heartbeat-stale,
 *     visible status decision from facilitator).
 *
 * Auth via `CRON_SECRET` shared header, constant-time compared.
 * Returns 401 on missing/wrong secret.
 *
 * Hobby plan caps at 2 crons / daily minimum interval, so this
 * sits in the daily slot. If the project ever needs a second
 * cron, piggyback on this one rather than adding a new schedule.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STALE_DAYS = 7;

export async function GET(req: NextRequest) {
  // Verify CRON_SECRET via constant-time comparison. Vercel sends
  // the secret in the Authorization header as `Bearer <secret>` per
  // its cron docs.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured." },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  if (!constantTimeEqual(auth, expected)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;

    const cutoffMs = Date.now() - STALE_DAYS * 24 * 60 * 60 * 1000;
    const cutoffIso = new Date(cutoffMs).toISOString();

    const { data: games, error } = await supa
      .from("games")
      .select("id, name, status, current_quarter, updated_at, max_teams")
      .eq("status", "playing")
      .lt("updated_at", cutoffIso)
      .order("updated_at", { ascending: true });

    if (error) {
      console.error("[cron/stale-games] query failed:", error.message);
      return NextResponse.json(
        { error: "Failed to query stale games." },
        { status: 500 },
      );
    }

    const staleGames = (games ?? []) as Array<{
      id: string;
      name: string;
      status: string;
      current_quarter: number;
      updated_at: string;
      max_teams: number;
    }>;

    // Log every stale game so the Vercel function log surfaces them
    // to the operator. Daily review of this output is the current
    // ops policy.
    if (staleGames.length === 0) {
      console.info("[cron/stale-games] no stale games found");
    } else {
      console.warn(`[cron/stale-games] found ${staleGames.length} stale games:`);
      for (const g of staleGames) {
        const daysStale = Math.round(
          (Date.now() - new Date(g.updated_at).getTime()) / (24 * 60 * 60 * 1000),
        );
        console.warn(
          `[cron/stale-games]   ${g.id} (${g.name}) — Q${g.current_quarter}/${g.max_teams}t — ${daysStale} days stale`,
        );
      }
    }

    return NextResponse.json({
      ok: true,
      cutoffIso,
      staleDays: STALE_DAYS,
      count: staleGames.length,
      games: staleGames.map((g) => ({
        id: g.id,
        name: g.name,
        currentQuarter: g.current_quarter,
        updatedAt: g.updated_at,
        daysStale: Math.round(
          (Date.now() - new Date(g.updated_at).getTime()) / (24 * 60 * 60 * 1000),
        ),
      })),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    console.error("[cron/stale-games] internal error:", detail);
    return NextResponse.json(
      { error: "Internal error in stale-games cron." },
      { status: 500 },
    );
  }
}

/**
 * Constant-time string comparison to defeat timing attacks on the
 * CRON_SECRET check. A simple `a === b` lets an attacker probe the
 * secret one byte at a time using response-time differences. Always
 * compare every byte regardless of mismatch.
 */
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
