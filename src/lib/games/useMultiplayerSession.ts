"use client";

/**
 * useMultiplayerSession — identity for multiplayer pages.
 *
 * Uses Supabase Auth user.id (signed-in or anonymous guest). When
 * `autoGuest` is true, creates an anonymous session automatically so
 * lobby/join/play work without Google or email sign-in.
 */

import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export function useMultiplayerSession(options?: { autoGuest?: boolean }): {
  sessionId: string | null;
  authReady: boolean;
  isGuest: boolean;
  guestPending: boolean;
  guestError: string | null;
  continueAsGuest: () => Promise<{ ok: true } | { ok: false; error: string }>;
} {
  const {
    user,
    loading: authLoading,
    guestPending,
    guestError,
    signInAsGuest,
  } = useAuth();

  const autoGuest = options?.autoGuest ?? false;

  useEffect(() => {
    if (!autoGuest || authLoading || user) return;
    void signInAsGuest();
  }, [autoGuest, authLoading, user, signInAsGuest]);

  const authReady = !authLoading && !guestPending;

  return {
    sessionId: user?.id ?? null,
    authReady,
    isGuest: user?.is_anonymous === true,
    guestPending,
    guestError,
    continueAsGuest: signInAsGuest,
  };
}
