import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";
import { assertHostOrFacilitator, assertMembership } from "@/lib/games/api";
import { ensureSupabaseRuntimeMigrations } from "@/lib/supabase/runtime-migrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function canAccessGame(gameId: string, userId: string): Promise<boolean> {
  const membership = await assertMembership(gameId, userId);
  if (membership.ok) return true;
  const host = await assertHostOrFacilitator(gameId, userId);
  return host.ok;
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
    const scope = url.searchParams.get("scope");
    const key = url.searchParams.get("key");
    const gameId = url.searchParams.get("gameId");
    if ((scope !== "user" && scope !== "game") || !key) {
      return NextResponse.json({ error: "scope and key are required." }, { status: 400 });
    }
    if (scope === "game") {
      if (!gameId) {
        return NextResponse.json({ error: "gameId required for game scope." }, { status: 400 });
      }
      if (!(await canAccessGame(gameId, userId))) {
        return NextResponse.json({ error: "Not authorised for this game." }, { status: 403 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    if (scope === "user") {
      const { data, error } = await supa
        .from("user_preferences")
        .select("value_json")
        .eq("user_id", userId)
        .eq("pref_key", key)
        .maybeSingle();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ value: data?.value_json ?? null });
    }

    const { data, error } = await supa
      .from("game_preferences")
      .select("value_json")
      .eq("game_id", gameId)
      .eq("user_id", userId)
      .eq("pref_key", key)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ value: data?.value_json ?? null });
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
    const { scope, key, value, gameId } = body ?? {};
    if ((scope !== "user" && scope !== "game") || typeof key !== "string" || key.length === 0) {
      return NextResponse.json({ error: "scope and key are required." }, { status: 400 });
    }
    if (scope === "game") {
      if (typeof gameId !== "string") {
        return NextResponse.json({ error: "gameId required for game scope." }, { status: 400 });
      }
      if (!(await canAccessGame(gameId, userId))) {
        return NextResponse.json({ error: "Not authorised for this game." }, { status: 403 });
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    if (scope === "user") {
      const { error } = await supa.from("user_preferences").upsert(
        { user_id: userId, pref_key: key, value_json: value ?? null },
        { onConflict: "user_id,pref_key" },
      );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { error } = await supa.from("game_preferences").upsert(
      { game_id: gameId, user_id: userId, pref_key: key, value_json: value ?? null },
      { onConflict: "game_id,user_id,pref_key" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
