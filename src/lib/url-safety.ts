/**
 * URL-safety helpers — defends against open-redirect attacks.
 *
 * Open-redirect is the classic phishing primitive: an attacker sends
 * a link like `https://sim.icanmena.com/auth/callback?code=...&next=
 * https://evil.com/phish`. The victim's browser sees a trusted host,
 * completes the OAuth flow, and is then bounced off to evil.com —
 * often with a referrer header leaking the just-set session cookie
 * context. The attacker can then mount a credible phishing page that
 * looks like a continuation of the legitimate flow.
 *
 * Phase A — S3. Pre-fix, both `/auth/callback` and `/login` accepted
 * a `next` query param and passed it straight into `router.replace()`
 * / `NextResponse.redirect()`. The Next.js URL parser treats absolute
 * URLs and protocol-relative URLs (`//evil.com/x`) as off-site, so
 * those bypass any base-URL guard. The fix below validates that the
 * `next` value is a strictly-relative path (starts with `/`, but
 * NOT `//` and not `/\`).
 *
 * Usage:
 *   const next = safeRelativePath(searchParams.get("next"), "/");
 *   router.replace(next);   // guaranteed same-origin
 */

/**
 * Returns the input if it's a safe same-origin relative path; falls
 * back to `fallback` otherwise.
 *
 * Accepts: paths that start with a single `/` and contain no scheme,
 *          no authority section (`//`), no backslash (some browsers
 *          and historical parsers treat `\` as a separator), and no
 *          control characters.
 *
 * Rejects:
 *   - `null` / `undefined`
 *   - Empty strings
 *   - Absolute URLs (`https://evil.com/`)
 *   - Protocol-relative URLs (`//evil.com/x`)
 *   - Backslash-prefixed (`/\evil.com/x` — some parsers normalise to
 *     `//evil.com/x`)
 *   - `javascript:`, `data:`, `vbscript:` (caught by the
 *     "must start with /" rule, but called out for completeness)
 *   - Paths containing control characters (could break header parsing)
 *
 * Examples:
 *   safeRelativePath("/games/abc", "/")        → "/games/abc"
 *   safeRelativePath("/games?next=x", "/")     → "/games?next=x"
 *   safeRelativePath("https://evil.com", "/")  → "/"
 *   safeRelativePath("//evil.com/x", "/")      → "/"
 *   safeRelativePath("/\\evil.com", "/")       → "/"
 *   safeRelativePath(null, "/lobby")           → "/lobby"
 *   safeRelativePath("", "/lobby")             → "/lobby"
 */
export function safeRelativePath(input: string | null | undefined, fallback: string): string {
  if (typeof input !== "string" || input.length === 0) return fallback;

  // Must start with `/`. Strings that don't aren't paths and could
  // be interpreted as relative-to-current-page references that
  // resolve unpredictably.
  if (!input.startsWith("/")) return fallback;

  // Reject `//foo` (protocol-relative, points to a different origin).
  if (input.startsWith("//")) return fallback;

  // Reject `/\foo` (backslash; some parsers normalise this to `//`).
  if (input.startsWith("/\\")) return fallback;

  // Reject any control characters (NUL through US, plus DEL) that
  // could break header / URL parsing further down the chain. We
  // iterate via charCodeAt so the source file stays ASCII-clean —
  // embedding raw control chars in source is fragile.
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return fallback;
  }

  return input;
}
