/**
 * Server-side Supabase client. Uses the SERVICE-ROLE key — bypasses
 * RLS — so it's the canonical mutation path for the lobby. Only
 * callable from API routes / server actions / server components.
 * Never imported from a "use client" file.
 *
 * Every server-mediated write goes through this client + an explicit
 * version check (game_state.version compare-and-swap) so two browsers
 * can't clobber each other's submission.
 */

import { createClient } from "@supabase/supabase-js";
import { getPublicSupabaseUrl } from "@/lib/config/site";

let serviceClient: ReturnType<typeof createClient> | null = null;

/** Server-only client. Throws (rather than returning null) because the
 *  server flow has no fallback — if Supabase env is missing, the API
 *  routes should 500 loudly so the operator notices, not silently
 *  swallow writes.
 *
 *  Untyped — see browser.ts comment. The lib/games/api.ts helpers
 *  cast results to GameRow/etc. at the boundary so callers still
 *  get full type safety on the data shape. */
export function getServerClient() {
  if (serviceClient) return serviceClient;
  const url = getPublicSupabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "[supabase/server] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "The lobby API needs both. Configure them in Vercel env or .env.local.",
    );
  }
  serviceClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
