"use client";

/**
 * Supabase Realtime subscription helper for chat — Phase 10.
 *
 * Subscribes to postgres_changes on `public.game_chat_messages` for a
 * specific gameId and fires `onInsert` / `onUpdate` callbacks. The
 * Realtime channel is the only path the client uses to learn about
 * new messages from peers; the `/api/games/chat/list` endpoint is
 * just for initial backfill on panel mount.
 *
 * Callers MUST call the returned `unsubscribe` on unmount or the
 * channel leaks indefinitely.
 */

import type { RealtimeChannel } from "@supabase/supabase-js";
import { getBrowserClient } from "@/lib/supabase/browser";

export interface ChatMessageRow {
  id: string;
  game_id: string;
  author_session_id: string;
  author_display_name: string;
  author_airline_color_id: string | null;
  is_facilitator_broadcast: boolean;
  body: string;
  created_at: string;
  deleted_at: string | null;
  deleted_by_session_id: string | null;
}

export interface ChatSubscriptionHandlers {
  onInsert: (msg: ChatMessageRow) => void;
  onUpdate: (msg: ChatMessageRow) => void;
}

export function subscribeToChat(
  gameId: string,
  handlers: ChatSubscriptionHandlers,
): { unsubscribe: () => void } {
  const supa = getBrowserClient();
  if (!supa) {
    return { unsubscribe: () => {} };
  }

  const channel: RealtimeChannel = supa.channel(`chat:${gameId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "game_chat_messages",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        handlers.onInsert(row);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "game_chat_messages",
        filter: `game_id=eq.${gameId}`,
      },
      (payload) => {
        const row = payload.new as ChatMessageRow;
        handlers.onUpdate(row);
      },
    )
    .subscribe();

  return {
    unsubscribe: () => {
      try {
        supa.removeChannel(channel);
      } catch {
        // Best-effort cleanup; if the channel was never fully bound,
        // removeChannel can throw — safe to swallow.
      }
    },
  };
}
