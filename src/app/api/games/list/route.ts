/**
 * GET /api/games/list — public lobby listing.
 *
 * Returns the public game-rows visible to anonymous players. Used
 * by /lobby on first paint and (later) on a realtime subscription
 * fallback. Filters: visibility=public, status != ended, newest
 * first, capped at 25.
 *
 * The Supabase env-vars guard returns a clear error rather than
 * throwing — the lobby page renders an empty-state when the
 * multiplayer surface isn't configured (dev/preview without a
 * Supabase project).
 */

import { NextResponse } from "next/server";
import { listPublicLobby } from "@/lib/games/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await listPublicLobby({ limit: 25 });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ games: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
