/**
 * Canonical production URLs for SkyForce / ICAN Simulations.
 *
 * The Next.js app lives at sim.icanmena.com (Vercel). Supabase Auth
 * must use a separate subdomain (auth.sim.icanmena.com) so Google OAuth
 * shows our brand instead of veokzbeaqenkdtkaltcg.supabase.co.
 */

export const CANONICAL_APP_HOST = "sim.icanmena.com";
export const CANONICAL_APP_ORIGIN = `https://${CANONICAL_APP_HOST}`;

/** Supabase custom domain — set up via scripts/setup-supabase-auth-domain.sh */
export const SUPABASE_AUTH_HOST = "auth.sim.icanmena.com";
export const SUPABASE_AUTH_ORIGIN = `https://${SUPABASE_AUTH_HOST}`;

export const SUPABASE_PROJECT_REF = "veokzbeaqenkdtkaltcg";
export const SUPABASE_PROJECT_ORIGIN = `https://${SUPABASE_PROJECT_REF}.supabase.co`;

/** Public Supabase URL (browser + server). Set NEXT_PUBLIC_SUPABASE_URL in Vercel. */
export function getPublicSupabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "") ?? "";
}

/** App origin for OAuth redirectTo / email links (current request or canonical). */
export function getAppOrigin(requestOrigin?: string): string {
  if (requestOrigin) return requestOrigin.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  if (process.env.VERCEL_ENV === "production") return CANONICAL_APP_ORIGIN;
  return "";
}

/** Google OAuth redirect URI after custom domain is active. */
export function getSupabaseAuthCallbackUrl(): string {
  return `${getPublicSupabaseUrl() || SUPABASE_AUTH_ORIGIN}/auth/v1/callback`;
}
