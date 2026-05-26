/**
 * Next.js 16 Routing Middleware (file renamed from middleware.ts → proxy.ts).
 *
 * Two jobs in priority order:
 *
 *   1. **Canonical domain redirect** — force production traffic onto
 *      the configured custom domain. Anyone landing on the auto-
 *      generated `*.vercel.app` URL (usually because a stale Supabase
 *      Auth Site URL redirected them, or a bookmark survived from a
 *      deploy preview) gets bounced to `sim.icanmena.com` with a 308
 *      (permanent, preserves method + body) on the same path. Without
 *      this they hit Vercel's deployment-protection SSO challenge and
 *      report the game as broken.
 *
 *   2. **CSRF defence** (Phase A — S4) — every mutating request to
 *      `/api/*` (POST / PATCH / PUT / DELETE) must carry an Origin
 *      or Referer matching our trusted origins (production domain,
 *      Vercel preview subdomains, or localhost in dev). Pre-fix the
 *      mutating API surface accepted cross-origin POSTs, so a hostile
 *      site could forge calls like `/api/games/forfeit`,
 *      `/api/games/delete?force=true`, `/api/games/state-update`,
 *      `/api/games/chat/send` on the victim's behalf — their Supabase
 *      session cookie was SameSite=lax, which is permissive enough
 *      for top-level cross-origin POSTs. Now blocked at the gateway.
 *
 * Scope guards:
 *   - Only canonical-redirects in VERCEL_ENV === "production".
 *   - Skips localhost so `npm run dev` is unaffected.
 *   - Skips Next internals / static assets / `/api/health` / OAuth
 *     callback.
 *   - CSRF check fires on `/api/*` only — page routes pass through.
 *   - CSRF check fires on POST/PATCH/PUT/DELETE only — GET/HEAD/
 *     OPTIONS pass through (browsers don't send credentialed
 *     cross-origin GETs by default in modern fetch).
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

// Methods that mutate server state and therefore need CSRF protection.
const MUTATING_METHODS = new Set(["POST", "PATCH", "PUT", "DELETE"]);

// Paths exempt from CSRF (none today, but reserved for future
// webhook endpoints that legitimately receive cross-origin calls
// authenticated via shared secret rather than session cookie).
const CSRF_EXEMPT_PREFIXES: string[] = [
  "/api/health",
];

export function proxy(req: NextRequest): NextResponse | undefined {
  // ── Step 1: Canonical-domain redirect (production only) ───────
  const redirect = maybeCanonicalRedirect(req);
  if (redirect) return redirect;

  // ── Step 2: CSRF on /api/* mutations ───────────────────────────
  const csrfBlock = maybeCsrfBlock(req);
  if (csrfBlock) return csrfBlock;

  // Pass through — no rewrite, no redirect. Returning undefined is
  // equivalent to NextResponse.next() and allows the route handler
  // to run normally.
  return;
}

/**
 * Production canonical-domain enforcement. Returns a 308 redirect
 * when the request lands on a `.vercel.app` alias of production,
 * or undefined otherwise.
 */
function maybeCanonicalRedirect(req: NextRequest): NextResponse | undefined {
  if (process.env.VERCEL_ENV !== "production") return;
  const host = req.headers.get("host") ?? "";
  if (host === CANONICAL_HOST) return;
  if (!host.endsWith(".vercel.app")) return;
  const url = new URL(req.url);
  if (BYPASS_PREFIXES.some((p) => url.pathname.startsWith(p))) return;
  url.host = CANONICAL_HOST;
  url.protocol = "https:";
  url.port = "";
  return NextResponse.redirect(url, 308);
}

/**
 * CSRF gate. Returns a 403 response when the request is a mutating
 * call to `/api/*` whose Origin/Referer doesn't match our allow-list.
 * Returns undefined to pass through.
 */
function maybeCsrfBlock(req: NextRequest): NextResponse | undefined {
  const method = req.method.toUpperCase();
  if (!MUTATING_METHODS.has(method)) return;

  const path = req.nextUrl.pathname;
  if (!path.startsWith("/api/")) return;
  if (CSRF_EXEMPT_PREFIXES.some((p) => path.startsWith(p))) return;

  if (assertSameOrigin(req)) return;

  // Block. Return JSON rather than empty 403 so the client gets a
  // readable error in DevTools — without leaking what was checked.
  return NextResponse.json(
    { error: "Forbidden — cross-origin request rejected." },
    { status: 403 },
  );
}

/**
 * Mirrors `src/lib/csrf.ts:assertSameOrigin` — but inlined here so
 * middleware doesn't import from `src/lib/` (Next.js middleware has
 * a smaller bundle ceiling and we want zero risk of dragging the
 * full server-auth deps in via transitive imports).
 *
 * Trusted origins:
 *   1. `NEXT_PUBLIC_APP_URL` (production domain).
 *   2. Any `*.vercel.app` (preview deploys — we can't enumerate).
 *   3. `http://localhost:*` / `http://127.0.0.1:*` in non-production.
 *   4. The request's own host (echo) — covers any other custom
 *      domain Vercel routes to this project.
 *
 * Returns false when both Origin and Referer are missing on a
 * mutating verb — modern browsers send Origin on every state-
 * changing same-origin request, so a missing one is itself a non-
 * browser signature.
 */
function assertSameOrigin(req: NextRequest): boolean {
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  if (!origin && !referer) return false;

  const allowed = new Set<string>();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      allowed.add(`${u.protocol}//${u.host}`);
    } catch {
      // Bad env — log via console (proxy runs in Node now per
      // Next 16) and continue with allow-list missing the prod
      // entry. The request will fall through to the host-echo
      // check below and likely be rejected, which is safe.
      console.warn("[proxy] NEXT_PUBLIC_APP_URL is not a valid URL:", appUrl);
    }
  }

  if (process.env.NODE_ENV !== "production") {
    allowed.add("http://localhost:3000");
    allowed.add("http://localhost:3001");
    allowed.add("http://localhost:3002");
    allowed.add("http://127.0.0.1:3000");
    allowed.add("http://127.0.0.1:3001");
  }

  const ownHost = req.headers.get("host");
  if (ownHost) {
    const proto =
      req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    allowed.add(`${proto}://${ownHost}`);
  }

  const candidate = origin ?? extractOriginFromReferer(referer);
  if (!candidate) return false;

  if (isVercelPreviewOrigin(candidate)) return true;

  return allowed.has(candidate);
}

function extractOriginFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

export const config = {
  // Match everything; the function itself fast-paths via env, host,
  // method, and path checks. Cheaper than a complex matcher pattern.
  matcher: "/:path*",
};
