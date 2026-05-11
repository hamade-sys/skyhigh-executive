import { NextRequest, NextResponse } from "next/server";
import { assertHostOrFacilitator } from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";
import { ensureSupabaseRuntimeMigrations } from "@/lib/supabase/runtime-migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireGameAdmin(gameId: string, userId: string) {
  const auth = await assertHostOrFacilitator(gameId, userId);
  if (!auth.ok) return auth;
  return auth;
}

export async function GET(req: NextRequest) {
  try {
    const migration = await ensureSupabaseRuntimeMigrations();
    if (!migration.ok) {
      return NextResponse.json({ error: migration.error }, { status: 503 });
    }
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const url = new URL(req.url);
    const gameId = url.searchParams.get("gameId");
    const snapshotId = url.searchParams.get("snapshotId");
    if (!gameId) {
      return NextResponse.json({ error: "gameId required." }, { status: 400 });
    }
    const auth = await requireGameAdmin(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    if (snapshotId) {
      const { data, error } = await supa
        .from("game_snapshots")
        .select("*")
        .eq("game_id", gameId)
        .eq("id", snapshotId)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ snapshot: data ?? null });
    }

    const { data, error } = await supa
      .from("game_snapshots")
      .select("id, game_id, quarter, saved_by_user_id, label, quarter_label, team_count, created_at, updated_at")
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ snapshots: data ?? [] });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const migration = await ensureSupabaseRuntimeMigrations();
    if (!migration.ok) {
      return NextResponse.json({ error: migration.error }, { status: 503 });
    }
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const body = await req.json();
    const {
      gameId,
      quarter,
      label,
      quarterLabel,
      teamCount,
      stateJson,
    } = body ?? {};
    if (
      typeof gameId !== "string" ||
      typeof quarter !== "number" ||
      typeof label !== "string" ||
      typeof quarterLabel !== "string" ||
      typeof teamCount !== "number" ||
      stateJson === undefined
    ) {
      return NextResponse.json({ error: "Invalid snapshot payload." }, { status: 400 });
    }
    const auth = await requireGameAdmin(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const payload = {
      game_id: gameId,
      quarter,
      saved_by_user_id: userId,
      label,
      quarter_label: quarterLabel,
      team_count: teamCount,
      state_json: stateJson,
    };
    const { data, error } = await supa
      .from("game_snapshots")
      .upsert(payload, { onConflict: "game_id,quarter" })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ snapshot: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const migration = await ensureSupabaseRuntimeMigrations();
    if (!migration.ok) {
      return NextResponse.json({ error: migration.error }, { status: 503 });
    }
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json({ error: "Sign-in required." }, { status: 401 });
    }
    const body = await req.json();
    const { gameId, snapshotId } = body ?? {};
    if (typeof gameId !== "string" || typeof snapshotId !== "string") {
      return NextResponse.json({ error: "gameId and snapshotId required." }, { status: 400 });
    }
    const auth = await requireGameAdmin(gameId, userId);
    if (!auth.ok) {
      const status = auth.error.includes("not found") ? 404 : 403;
      return NextResponse.json({ error: auth.error }, { status });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { error } = await supa
      .from("game_snapshots")
      .delete()
      .eq("game_id", gameId)
      .eq("id", snapshotId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
