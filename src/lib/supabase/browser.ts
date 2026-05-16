"use client";

/**
 * Browser-side Supabase client. Uses the anon key — RLS gates what
 * any logged-out player can read (public game listings, their own
 * game state via id, audit events). Writes go through server API
 * routes that use the service-role key.
 *
 * Lobby pages should import `getBrowserClient()` rather than
 * instantiating directly so we hit the singleton; multiple
 * instances would each open their own realtime connection.
 */

import { createBrowserClient } from "@supabase/ssr";
import { getPublicSupabaseUrl } from "@/lib/config/site";

let client: ReturnType<typeof createBrowserClient> | null = null;

/** Lazily-initialised singleton. Returns null when env vars are
 *  missing — callers should fall back to local-storage solo behavior
 *  in that case so the app still boots in dev / preview without
 *  Supabase configured.
 *
 *  Untyped on purpose: the strict Database generic in
 *  @supabase/supabase-js v12 fights hand-rolled schema types. The
 *  lobby-API helpers in lib/games/api.ts cast at the boundary using
 *  `GameRow` / `GameInsert` from lib/supabase/types.ts so callers
 *  still get full type safety on the data shape. A future
 *  `supabase gen types typescript` pass will replace the boundary
 *  cast with the canonical generic. */
export function getBrowserClient() {
  if (client) return client;
  const url = getPublicSupabaseUrl();
  // Support both the legacy anon key and the new publishable key env var names
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !key) return null;
  try {
    client = createBrowserClient(url, key);
    return client;
  } catch (e) {
    // Key format rejected by SDK — log clearly so it shows in Vercel logs
    console.error("[Supabase] Failed to initialise browser client:", e);
    return null;
  }
}

/** True when the lobby/multiplayer surface is available — i.e. the
 *  app was built with Supabase env vars wired up. Pages call this
 *  before navigating to /lobby or /games/new and surface a clear
 *  "multiplayer not configured" empty state when false. */
export function isMultiplayerAvailable(): boolean {
  const hasUrl = getPublicSupabaseUrl().length > 0;
  const hasKey =
    (typeof process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY === "string" &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY.length > 0) ||
    (typeof process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY === "string" &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY.length > 0);
  return hasUrl && hasKey;
}
