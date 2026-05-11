"use client";

/**
 * useMultiplayerSession — server-side identity for multiplayer pages.
 *
 * All multiplayer pages (lobby, game lobby, play, facilitator) require
 * the player to be signed in. Identity is always Supabase user.id —
 * never a browser-storage UUID, never an anonymous fallback.
 *
 * Returns:
 *   sessionId  — user.id when signed in, null otherwise
 *   authReady  — true once AuthProvider has finished its getSession()
 *                call; false during the initial loading tick
 *
 * Pages should:
 *   - Show a spinner while !authReady (auth is still initialising)
 *   - Show a "sign in required" prompt when authReady && !sessionId
 *   - Proceed normally when authReady && sessionId is a string
 */

import { useAuth } from "@/lib/auth-context";

export function useMultiplayerSession(): {
  sessionId: string | null;
  authReady: boolean;
} {
  const { user, loading: authLoading } = useAuth();
  return {
    sessionId: user?.id ?? null,
    authReady: !authLoading,
  };
}
