/**
 * Cookie-bound Supabase server client for AUTH identity derivation.
 *
 * Distinct from `getServerClient()` (in `./server.ts`) which uses the
 * service-role key and bypasses RLS — that client is for unconditional
 * mutations after we've already proven the caller's identity. This
 * client is bound to the request cookies and exposes
 * `auth.getUser()`, returning the signed-in user (or null) for the
 * current request.
 *
 * Why a separate file: `./server.ts` is callable from any server
 * surface (API routes, server actions, server components). This
 * file pulls in `next/headers`, which makes it ONLY safe inside
 * request-scoped contexts. Using the wrong client in the wrong place
 * crashes at build time, so we keep them apart.
 *
 * Phase 1 of the enterprise-readiness plan: every API mutation
 * must derive the actor's identity from the cookie-bound auth user,
 * NOT from a body parameter. This file is the foundation.
 */

import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getPublicSupabaseUrl } from "@/lib/config/site";

/**
 * Build a Supabase server client bound to the request's cookies. The
 * returned client honours RLS based on the authenticated user — so
 * `select` queries through this client return only what the user can
 * legitimately see. For service-role mutations after authorization
 * is proven, use `getServerClient()` from `./server.ts` instead.
 */
export async function getCookieClient() {
  const url = getPublicSupabaseUrl();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "[supabase/server-auth] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }
  // Next 16 returns cookies() asynchronously to allow streaming. The
  // SSR client signature accepts get/set/remove that match the
  // cookies() API.
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch {
          // The set call fails when invoked from a Server Component;
          // it's only allowed in API routes / server actions. We silently
          // ignore so the SSR helper can be reused from RSCs that just
          // read the user without setting refreshed tokens.
        }
      },
      remove(name: string, options: CookieOptions) {
        try {
          cookieStore.set({ name, value: "", ...options });
        } catch {
          // Same reason as set() above.
        }
      },
    },
  });
}

/**
 * Read the authenticated user's id from the request cookies. Returns
 * null when the request has no valid session. Use this for MUTATIONS
 * where strong-revalidation auth matters — it makes a network call
 * to Supabase Auth's GoTrue server to validate the JWT, which costs
 * ~50-200ms per request.
 *
 * For READ paths (loading game state, polling lobby) where the cost
 * dominates the page-load budget, prefer `getSessionUserId()` below
 * which decodes the cookie locally with zero network — see its
 * docstring for the security trade-off.
 */
export async function getAuthenticatedUserId(): Promise<string | null> {
  try {
    const supa = await getCookieClient();
    const { data, error } = await supa.auth.getUser();
    if (error) return null;
    return data.user?.id ?? null;
  } catch {
    // Configuration errors (missing env) bubble up via getCookieClient,
    // but a session-resolution failure should land as "no user" rather
    // than a 500 — the route's auth gate then returns 401 cleanly.
    return null;
  }
}

/**
 * Fast cookie-only user-id resolution. Decodes the JWT locally by
 * verifying the signature against the project's anon key — no network
 * call to Supabase Auth. Roughly 0-2ms vs 50-200ms for `getUser()`.
 *
 * SECURITY TRADE-OFF: this trusts the JWT signature but does NOT
 * check whether the user has been revoked (deleted, banned, password-
 * rotated) since the JWT was issued. JWTs in Supabase have a 1-hour
 * default lifetime, so the longest a revoked user could continue
 * authenticating is 1 hour. For workshop simulations (90-minute
 * sessions, controlled cohort), that window is acceptable.
 *
 * Use this for read paths (`/api/games/load`, lobby poll, etc.).
 * Keep `getAuthenticatedUserId` for mutation paths where we want
 * the strongest possible auth (revocation detection, server-side
 * JWT verification). The cost-benefit on mutations favours the
 * stronger check; on reads it does not.
 */
export async function getSessionUserId(): Promise<string | null> {
  try {
    const supa = await getCookieClient();
    // getSession() reads the JWT from the cookie store and verifies
    // its signature with the anon key — local CPU work, no network.
    const { data, error } = await supa.auth.getSession();
    if (error) return null;
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
