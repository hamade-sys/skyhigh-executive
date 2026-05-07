"use client";

/**
 * useHeartbeat — client hook that pings /api/games/heartbeat every
 * 30 seconds while mounted, so peer browsers (and the facilitator)
 * can see who's actively in the cohort vs. who's away.
 *
 * Phase 6 P1 of the enterprise-readiness plan. Mount this on
 * /games/[id]/play and /games/[id]/lobby. Solo runs (no gameId)
 * skip the heartbeat — it's purely a multiplayer coordination
 * signal.
 *
 * Fires immediately on mount + every 30s. On tab visibility change
 * (user comes back from a hidden tab), fires once to catch up so
 * the "away" indicator clears quickly when the player returns.
 */

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 30_000;

export function useHeartbeat(gameId: string | null | undefined): void {
  useEffect(() => {
    if (!gameId) return;

    let cancelled = false;
    async function ping() {
      if (cancelled) return;
      try {
        await fetch("/api/games/heartbeat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId }),
          // Use keepalive so heartbeats fire even on page-hide /
          // navigation (the browser would otherwise drop the request
          // when the page tears down).
          keepalive: true,
        });
      } catch {
        // Heartbeat failures are non-fatal — the next interval picks
        // up. We deliberately don't surface to the UI because there's
        // nothing the user can do about a heartbeat fault.
      }
    }

    // Fire immediately on mount, then on a 30s interval.
    void ping();
    const interval = setInterval(ping, HEARTBEAT_INTERVAL_MS);

    // Catch-up ping when the tab becomes visible again — covers the
    // case where the user came back from a backgrounded tab and
    // their last_seen_at is stale.
    function onVisible() {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void ping();
      }
    }
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisible);
    }

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
      }
    };
  }, [gameId]);
}
