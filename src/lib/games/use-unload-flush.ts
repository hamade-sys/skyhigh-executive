"use client";

/**
 * useUnloadFlush — Phase B D3.
 *
 * Mount this hook anywhere inside the /games/[gameId]/play tree.
 * It registers `beforeunload` and `pagehide` listeners that, when
 * the user is about to leave the page, fire a sendBeacon push to
 * persist whatever local state the store currently holds.
 *
 * Why this matters: pushStateToServer uses fetch, which the browser
 * cancels on tab close. If a player closes their laptop while:
 *   - QuarterCloseModal is open (phase === "quarter-closing")
 *   - The 800ms auto-push debounce is in flight
 *   - A user just submitted a decision or edited a route
 * ...the round can replay on next session, OR (worse) the edits
 * silently disappear. sendBeacon is queued by the browser and
 * guaranteed to deliver, even after the page is unloaded.
 *
 * The hook self-skips when:
 *   - There's no multiplayer session (solo runs persist via the
 *     existing Zustand persist middleware — no server to flush to).
 *   - The user is an observer (the Game Master shouldn't write
 *     state on the cohort's behalf).
 *
 * Use `pagehide` AND `beforeunload`: Safari iOS doesn't fire
 * beforeunload on tab-switch backgrounding; pagehide does. Chrome
 * Android fires beforeunload more reliably than pagehide. Listening
 * for both covers all browsers.
 */

import { useEffect } from "react";
import { useGame } from "@/store/game";

export function useUnloadFlush() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function flush(_reason: "beforeunload" | "pagehide") {
      void _reason; // reserved for future telemetry
      const s = useGame.getState();
      if (!s.session?.gameId) return;
      if (s.isObserver) return;
      // Best-effort: always try to flush. If beacon returns false
      // (queue full, etc.) there's not much we can do during an
      // unload window — and the user's next page load will rehydrate
      // from whatever the server last accepted, so the lost state
      // is bounded to what wasn't pushed between the debounce
      // window and unload.
      try {
        s.flushStateBeacon("player.unloadFlush", {
          // Tag the audit log so we can see how often this fires
          // and validate the safety net is actually catching real
          // unloads (vs. just route-change navigations within the
          // game itself, which don't unload).
          phase: s.phase,
        });
      } catch {
        // sendBeacon shouldn't throw, but defensive: never let an
        // unload handler escape an exception (some browsers will
        // hold the unload waiting for a microtask that won't run).
      }
    }

    const onBeforeUnload = () => flush("beforeunload");
    const onPageHide = () => flush("pagehide");

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, []);
}
