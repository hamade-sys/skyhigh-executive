/**
 * /auth/callback — OAuth redirect target.
 *
 * Supabase Auth bounces the user here after Google/Microsoft sign-in
 * with a `code` query param. We exchange it for a session, then
 * redirect to the lobby (the natural next destination for SkyForce).
 *
 * Email-link sign-ups also land here once the user clicks the
 * confirmation in their inbox.
 */

import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  // Default to home page so returning players get smart-redirected
  // to their active game via the active-membership check there.
  const next = url.searchParams.get("next") || "/";
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url.origin));
  }

  const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supaUrl || !anonKey) {
    return NextResponse.redirect(new URL("/login?error=auth_not_configured", url.origin));
  }

  // Build a redirect response and pass its cookie store to the
  // Supabase server client so the session cookie lands on the
  // browser. Without this the OAuth round-trip drops the session.
  const response = NextResponse.redirect(new URL(next, url.origin));
  const supa = createServerClient(supaUrl, anonKey, {
    cookies: {
      getAll() {
        return request.headers.get("cookie")?.split("; ").map((c) => {
          const [name, ...rest] = c.split("=");
          return { name, value: rest.join("=") };
        }) ?? [];
      },
      setAll(items: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
        for (const { name, value, options } of items) {
          response.cookies.set({ name, value, ...(options ?? {}) });
        }
      },
    },
  });

  const { error } = await supa.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  return response;
}
