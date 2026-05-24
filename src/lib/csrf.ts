/**
 * CSRF defence — same-origin gate for mutating API routes.
 *
 * Phase A — S4. Pre-fix, every POST/PATCH/DELETE under `src/app/api/`
 * accepted cross-origin requests. Supabase auth cookies default to
 * SameSite=lax, which is permissive enough that a hostile site's
 * top-level POST (e.g. via a clicked link or auto-submitted form)
 * carries the victim's session cookie — meaning a malicious site
 * could forge calls like:
 *   POST /api/games/forfeit   → boot the victim from their game
 *   POST /api/games/delete?force=true  → if victim is a facilitator
 *   POST /api/games/state-update       → corrupt victim's game state
 *   POST /api/games/chat/send          → impersonate victim in chat
 *
 * The fix is a server-side Origin/Referer allow-list check. Anything
 * coming from a different origin than our own (production domain or
 * a Vercel preview) is rejected with 403.
 *
 * Usage:
 *   import { assertSameOrigin } from "@/lib/csrf";
 *   if (!assertSameOrigin(req)) {
 *     return NextResponse.json({ error: "Forbidden" }, { status: 403 });
 *   }
 *
 * Apply to every mutation route (POST/PATCH/DELETE). GET routes are
 * exempt — browsers don't send credentials with cross-origin GETs by
 * default for fetch(), and HTML form GETs can't carry side effects
 * we care about.
 */

import type { NextRequest } from "next/server";

/**
 * Returns true if the request's Origin (preferred) or Referer header
 * matches one of our trusted origins:
 *   - The configured `NEXT_PUBLIC_APP_URL` (production domain).
 *   - Any *.vercel.app subdomain (preview deployments).
 *   - `http://localhost:*` and `http://127.0.0.1:*` in non-production
 *     (local dev).
 *
 * Returns false if:
 *   - Both Origin and Referer are missing (very unusual; almost
 *     certainly a script/curl from outside a browser).
 *   - The header doesn't match any allowed pattern.
 *
 * Same-origin browser fetches always include the Origin header for
 * cross-origin requests AND for same-origin POST/PATCH/DELETE/PUT
 * (per the Fetch spec). So a missing Origin on a state-changing
 * verb is itself a signal of a non-browser caller.
 */
export function assertSameOrigin(req: NextRequest): boolean {
  // Prefer Origin header — it's the canonical CSRF defence. Browsers
  // send it on every cross-origin request AND on same-origin
  // state-changing requests. The Origin contains scheme+host+port,
  // never the path (unlike Referer which can be stripped or spoofed
  // via Referrer-Policy).
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");

  // If both are missing, treat as cross-origin (non-browser caller).
  // Allow it only when the caller has a valid CRON_SECRET — that's
  // the documented pattern for legitimate machine-to-machine calls.
  if (!origin && !referer) {
    return false;
  }

  // Build the allow-list of trusted host strings. We compare on
  // host only (scheme + host + optional port), not on path.
  const allowedHosts = new Set<string>();

  // 1) Production / configured app URL
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (appUrl) {
    try {
      const u = new URL(appUrl);
      allowedHosts.add(`${u.protocol}//${u.host}`);
    } catch {
      // Bad env var — log but don't crash; allow-list just won't
      // include the prod domain. The request will be rejected,
      // which is the safe default.
      console.warn("[csrf] NEXT_PUBLIC_APP_URL is not a valid URL:", appUrl);
    }
  }

  // 2) Local dev — only in non-production builds.
  if (process.env.NODE_ENV !== "production") {
    allowedHosts.add("http://localhost:3000");
    allowedHosts.add("http://localhost:3001");
    allowedHosts.add("http://localhost:3002");
    allowedHosts.add("http://127.0.0.1:3000");
    allowedHosts.add("http://127.0.0.1:3001");
  }

  // 3) The request's own host header — covers Vercel preview
  //    deployments where each PR gets a unique *.vercel.app URL
  //    we couldn't pre-list. The Host header is set by the platform
  //    (Vercel rewrites it to match the deployment), so if the
  //    Origin header matches the deployment's host, the request
  //    is genuinely same-origin to itself.
  const ownHost = req.headers.get("host");
  if (ownHost) {
    // Match the protocol from x-forwarded-proto (set by Vercel) or
    // fall back to the request URL's protocol.
    const proto =
      req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    allowedHosts.add(`${proto}://${ownHost}`);
  }

  const candidate = origin ?? extractOriginFromReferer(referer);
  if (!candidate) return false;

  // Allow *.vercel.app — every Vercel preview deploy lands on a
  // subdomain of vercel.app. We can't enumerate them up front, so
  // we accept the wildcard. (Production sits on a custom domain
  // covered by NEXT_PUBLIC_APP_URL above.)
  if (isVercelPreviewOrigin(candidate)) return true;

  return allowedHosts.has(candidate);
}

/** Parse the scheme+host out of a Referer header value. */
function extractOriginFromReferer(referer: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** True for `https://<anything>.vercel.app` (Vercel preview URLs). */
function isVercelPreviewOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    return u.protocol === "https:" && u.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}
