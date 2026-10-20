import "server-only";

/**
 * ICAN Trivia — who is calling.
 *
 * Hosts are signed-in users (Google, Microsoft or email). Anonymous
 * guest sessions can't build or host: boards, templates and the
 * column bank belong to an account, and the AI assist bills against
 * one. Same rule as hosting a simulation (/api/games/create).
 *
 * Players never sign in. A room hands each one a random token at
 * join; the browser keeps it and sends it back in a header. Only the
 * sha256 is stored, so a database read can't impersonate a player.
 * The host gets a room-scoped token the same way, which keeps every
 * in-game click off the auth server (fast) and lets a second device
 * co-host.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { User } from "@supabase/supabase-js";
import { getCookieClient } from "@/lib/supabase/server-auth";

export type HostResult =
  | { ok: true; userId: string; label: string }
  | { ok: false; status: number; error: string };

export async function requireHost(): Promise<HostResult> {
  let user: User | null = null;
  try {
    const supa = await getCookieClient();
    const { data, error } = await supa.auth.getUser();
    if (!error) user = data.user;
  } catch {
    user = null;
  }
  if (!user) return { ok: false, status: 401, error: "Sign in to build and host ICAN Trivia games." };
  if (user.is_anonymous) {
    return {
      ok: false,
      status: 403,
      error: "Guest sessions can't host. Sign in with Google, Microsoft or email to save boards and run games.",
    };
  }
  return { ok: true, userId: user.id, label: displayLabel(user) };
}

function displayLabel(user: User): string {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const name = [meta.full_name, meta.name].find((v) => typeof v === "string" && v.trim()) as string | undefined;
  if (name) return name.trim().slice(0, 60);
  const email = user.email ?? "";
  return email ? email.split("@")[0].slice(0, 60) : "ICAN host";
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string | null | undefined, hash: string | null | undefined): boolean {
  if (!token || !hash || token.length > 200) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The host token for a room is derived, not stored: HMAC(secret, room
 * id). The signed-in owner can fetch it again from any device
 * (/host-token), and a co-host link can carry it, without the
 * database ever holding a usable secret (it stores only the hash).
 */
export function hostTokenFor(roomId: string): string {
  const secret = process.env.TRIVIA_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("[trivia] Missing TRIVIA_TOKEN_SECRET / SUPABASE_SERVICE_ROLE_KEY for host tokens.");
  return createHmac("sha256", secret).update(`ican-trivia-host:${roomId}`).digest("base64url");
}
