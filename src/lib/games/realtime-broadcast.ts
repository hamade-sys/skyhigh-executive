/**
 * Server-side helper for emitting Supabase Realtime broadcasts so
 * peer browsers learn about state changes without polling.
 *
 * Phase 8/Group-C of the enterprise-readiness plan. The chat
 * pipeline already uses postgres_changes events (cheaper for a
 * single table), but for game-state changes we use the broadcast
 * channel so we can send a small "refetch please" payload instead
 * of pushing the entire state_json over Realtime on every write.
 *
 * Channel naming convention: `game:<gameId>` — the same prefix the
 * chat helper uses, so a future Phase 4b can subscribe to one
 * channel per game and route by event type.
 *
 * Failure mode: best-effort. We never reject the originating API
 * call if the broadcast fails — the next /api/games/load by the
 * peer will pick up the new state. We do log to console so the
 * pattern is observable in Vercel logs during the rollout.
 */

import { getServerClient } from "@/lib/supabase/server";

export type GameRealtimeEvent =
  | "team.forfeited"
  | "game.autoEnded"
  | "game.stateChanged"
  | "game.locked"
  | "game.unlocked"
  | "game.started";

export async function broadcastGameEvent(args: {
  gameId: string;
  event: GameRealtimeEvent;
  payload?: Record<string, unknown>;
}): Promise<void> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const channel = supa.channel(`game:${args.gameId}`, {
      config: { broadcast: { self: false } },
    });
    // The send() promise resolves once the broadcast is buffered;
    // no acknowledgment from peers, by design.
    await channel.send({
      type: "broadcast",
      event: args.event,
      payload: { gameId: args.gameId, ...(args.payload ?? {}) },
    });
    // Channels created server-side leak unless we explicitly remove
    // them — they're cheap to spin up per event but accumulate.
    await supa.removeChannel(channel);
  } catch (err) {
    // Non-fatal — peers fall back to polling. Log so the operator
    // can spot a misconfigured Realtime endpoint quickly.
    // eslint-disable-next-line no-console
    console.warn("[realtime-broadcast] failed", { gameId: args.gameId, event: args.event, err });
  }
}
