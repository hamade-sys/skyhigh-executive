/**
 * Next.js 16 Routing Middleware (file renamed from middleware.ts → proxy.ts).
 *
 * Single job: force the canonical custom domain on production. Players who
 * land on the auto-generated `*.vercel.app` URL — usually because Supabase
 * Auth redirected them there after OAuth, or because a bookmark / link
 * carried over from a deploy preview — get bounced to `sim.icanmena.com`
 * with a 308 (permanent, preserves method + body) on the same path.
 *
 * Why we care: the `*.vercel.app` URL has Vercel deployment protection
 * enabled, which gates non-Vercel-authenticated users behind an SSO
 * challenge. Workshop participants who follow a `.vercel.app` link from
 * a stale Supabase-Auth Site-URL setting hit a 401, can't sign in, and
 * report the game as broken. Anchoring everything to `sim.icanmena.com`
 * fixes this at the platform layer regardless of how someone got the
 * `.vercel.app` URL.
 *
 * Scope guards:
 *   - Only fires on VERCEL_ENV === "production". Preview deployments
 *     (deploy-hash URLs) stay reachable for branch testing.
 *   - Skips localhost so `npm run dev` is unaffected.
 *   - Skips a small list of paths (Next internals, static assets, /api)
 *     to avoid double-bouncing API callers and asset CDNs.
 */

import { NextRequest, NextResponse } from "next/server";

const CANONICAL_HOST = "sim.icanmena.com";

// Paths that should never be redirected — Vercel internals, Next.js
// build assets, and the auth callback (which Supabase calls with a
// code on whichever domain it has configured; we want THAT request
// to land on whichever domain Supabase used so the cookies stay on
// the right origin).
const BYPASS_PREFIXES = [
  "/_next/",
  "/_vercel/",
  "/api/health",
  "/auth/callback",
  "/favicon",
  "/apple-touch-icon",
  "/robots.txt",
  "/sitemap.xml",
];

export function proxy(req: NextRequest): NextResponse | undefined {
  // Dev mode + preview deploys: leave alone.
  if (process.env.VERCEL_ENV !== "production") return;

  const host = req.headers.get("host") ?? "";
  // Already on the canonical host — pass through.
  if (host === CANONICAL_HOST) return;

  // Only redirect aliases of the production app — anything else
  // (custom domains added later, etc.) we trust as intentional.
  // Conservative match: any host ending in `.vercel.app` that
  // belongs to this project.
  if (!host.endsWith(".vercel.app")) return;

  // Skip Next internals / asset paths so the redirect doesn't break
  // streaming / static fetches when the ALIAS domain is in use.
  const url = new URL(req.url);
  if (BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;

  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  // 308: permanent redirect that preserves the HTTP method + body
  // (vs. 301/302 which can downgrade POST → GET).
  return NextResponse.redirect(url, 308);
}

export const config = {
  // Match everything; the function itself fast-paths via env + host
  // checks. Cheaper than a complex matcher pattern.
  matcher: "/:path*",
};
