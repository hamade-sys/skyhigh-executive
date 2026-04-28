"use client";

/**
 * Per-browser session id — the lobby system's primary identity key
 * for anonymous play.
 *
 * Persisted in localStorage so a page refresh reconnects to the
 * same team, the same lobby seat, and the same audit-log actor
 * across the run. Null on first ever paint (SSR + first client
 * hydration) — components must tolerate that case.
 *
 * NOT a Supabase auth user. The lobby intentionally allows
 * anonymous play; this id is durable but unverified.
 */

import { useEffect, useState } from "react";

const STORAGE_KEY = "skyforce:sessionId:v1";

export function getOrCreateSessionId(): string {
  if (typeof window === "undefined") {
    // SSR / build-time — return a stable placeholder. Real id is
    // generated on first client paint via the hook below.
    return "ssr-placeholder";
  }
  try {
    const existing = window.localStorage.getItem(STORAGE_KEY);
    if (existing && existing.length > 0) return existing;
    // crypto.randomUUID is on every modern browser; use it directly
    // rather than a polyfill to keep the bundle small. The fallback
    // covers ancient browsers (IE-era) we don't actually support.
    const fresh =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(STORAGE_KEY, fresh);
    return fresh;
  } catch {
    // Storage blocked (incognito + strict mode etc) — return a
    // ephemeral id. The user will lose the seat binding on refresh
    // but the current session keeps working.
    return `eph-${Math.random().toString(36).slice(2, 14)}`;
  }
}

/** React hook — returns null on first paint, then the real id once
 *  the client-only effect has run. Components branch on `null` to
 *  show a "loading" or "join via lobby" state to avoid SSR/CSR
 *  mismatch warnings. */
export function useLocalSessionId(): string | null {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setId(getOrCreateSessionId());
  }, []);
  return id;
}
