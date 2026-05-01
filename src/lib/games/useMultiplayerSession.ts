"use client";

/**
 * useMultiplayerSession — reliable server-side identity for multiplayer.
 *
 * Returns the current player's Supabase user.id.
 *
 * If the visitor is not signed in (no Google/email session), this hook
 * automatically calls supabase.auth.signInAnonymously() so they get a
 * real, durable user.id that is server-backed and consistent regardless
 * of which device or browser they open the game on.
 *
 * Why NOT localStorage (the old localSessionId approach):
 *   - A localStorage UUID is unique per browser installation.
 *   - Open the game on a second device → different UUID → can't bind
 *     to the same team → Observer mode bug.
 *   - Clearing browser data destroys the identity silently.
 *
 * Why Supabase anonymous auth instead:
 *   - signInAnonymously() issues a real JWT backed by the Supabase
 *     users table, so user.id is consistent across the same session.
 *   - The onAuthStateChange listener in AuthProvider picks up the
 *     new session automatically — no extra state needed here.
 *   - If the player later signs in with Google/email their anonymous
 *     session is upgraded; user.id stays the same.
 *
 * Returns null only while Supabase is initialising (< 1 render cycle).
 * Callers should treat null as "loading, do not send requests yet".
 */

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { getBrowserClient } from "@/lib/supabase/browser";

export function useMultiplayerSession(): string | null {
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    // Wait for AuthProvider to finish its getSession() call.
    if (authLoading) return;
    // Already have a real (or previously anonymous) session — nothing to do.
    if (user?.id) return;
    // No session → sign in anonymously so the player gets a real user.id.
    // The AuthProvider's onAuthStateChange listener will fire and update
    // `user` in context, which re-renders callers with the new id.
    const supa = getBrowserClient();
    if (!supa) return; // Supabase not configured (local dev without env vars)
    supa.auth.signInAnonymously().catch(() => {
      // If anonymous auth is disabled in the Supabase project the player
      // will stay unauthenticated. Multiplayer pages should show a
      // "sign in required" prompt in that case (user?.id will stay null).
    });
  }, [authLoading, user?.id]);

  return user?.id ?? null;
}
