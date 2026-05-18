/**
 * Resolves NEXT_PUBLIC_SUPABASE_URL for browser + server clients.
 *
 * Production was briefly pointed at auth.sim.icanmena.com before DNS /
 * Supabase custom-domain activation; that hostname breaks all Auth and
 * API traffic. If the env still references it, use the project URL.
 */

export const SUPABASE_PROJECT_URL =
  "https://veokzbeaqenkdtkaltcg.supabase.co";

const DEPRECATED_AUTH_HOST = "auth.sim.icanmena.com";

export function getSupabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  if (!raw) return undefined;
  if (raw.includes(DEPRECATED_AUTH_HOST)) {
    return SUPABASE_PROJECT_URL;
  }
  return raw;
}
