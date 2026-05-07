"use client";

/**
 * Client-side subscription to the `game:<gameId>` Realtime broadcast
 * channel. Phase 8/Group-C of the enterprise-readiness plan.
 *
 * The server emits small "something changed" events from forfeit /
 * state-update / start / lock endpoints (see realtime-broadcast.ts).
 * This hook subscribes the play page so peer-driven changes propagate
 * within ~1s instead of waiting for a polling cycle.
 *
 * Returns nothing — fires the supplied callbacks. Callers are
 * responsible for the actual state refetch (typically calling
 * `/api/games/load` and re-hydrating the store).
 */

import { useEffect } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { GameRealtimeEvent } from "@/lib/games/realtime-broadcast";

export interface GameRealtimeHandlers {
  /** A team in the cohort flipped to bot control via forfeit. */
  onTeamForfeited?: (payload: {
    bySessionId: string;
    replacedByBot: boolean;
    remainingHumans: number;
  }) => void;
  /** Game ended because no human players remain. */
  onAutoEnded?: (payload: { reason: string }) => void;
  /** A state-update CAS write landed; peer should refetch. */
  onStateChanged?: (payload: {
    eventType: string;
    version: number;
  }) => void;
  /** Lobby started — flip to /play. */
  onStarted?: () => void;
  /** Lobby locked / unlocked. */
  onLocked?: () => void;
  onUnlocked?: () => void;
}

export function useGameRealtime(
  gameId: string | null | undefined,
  handlers: GameRealtimeHandlers,
): void {
  useEffect(() => {
    if (!gameId) return;
    const supa = getBrowserClient();
    if (!supa) return;

    const channel = supa.channel(`game:${gameId}`, {
      config: { broadcast: { self: false } },
    });

    type BroadcastEnvelope = { event: GameRealtimeEvent; payload: unknown };
    function dispatch({ event, payload }: BroadcastEnvelope) {
      const p = (payload ?? {}) as Record<string, unknown>;
      switch (event) {
        case "team.forfeited":
          handlers.onTeamForfeited?.({
            bySessionId: String(p.bySessionId ?? ""),
            replacedByBot: Boolean(p.replacedByBot),
            remainingHumans: Number(p.remainingHumans ?? 0),
          });
          break;
        case "game.autoEnded":
          handlers.onAutoEnded?.({ reason: String(p.reason ?? "") });
          break;
        case "game.stateChanged":
          handlers.onStateChanged?.({
            eventType: String(p.eventType ?? ""),
            version: Number(p.version ?? 0),
          });
          break;
        case "game.started":
          handlers.onStarted?.();
          break;
        case "game.locked":
          handlers.onLocked?.();
          break;
        case "game.unlocked":
          handlers.onUnlocked?.();
          break;
      }
    }

    // Bind a single listener that switch-routes by event name. We
    // could do `.on("broadcast", { event: "team.forfeited" }, ...)`
    // per event type, but that's six subscriptions of the same
    // channel — switching is cheaper.
    channel.on("broadcast", { event: "*" }, (msg) => {
      // The Supabase types for broadcast messages don't include a
      // `payload` field (it's optional in the wire format), but our
      // sender always populates it. Cast through `unknown` per TS's
      // structural-overlap rule.
      dispatch(msg as unknown as BroadcastEnvelope);
    });

    channel.subscribe();

    return () => {
      try {
        supa.removeChannel(channel);
      } catch {
        // Silent — non-fatal cleanup.
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);
}
