"use client";

/**
 * Live connection to one ICAN Trivia room.
 *
 * Reads the room view from the API (sanitized for whoever is asking),
 * then keeps it fresh two ways:
 *   - Supabase Realtime broadcast on `trivia:<roomId>`: the server
 *     pings `changed` after every move and the screen refetches at once.
 *   - Polling as a safety net: every 4s while Realtime is up, every
 *     1.2s when it isn't (corporate networks often block websockets).
 *
 * Responses can land out of order (a poll that started before a move
 * finishing after it), so a view is only applied if its room version
 * is at least the one on screen.
 *
 * The server sends its clock with every view; `serverNow()` corrects
 * the local clock by that offset so countdowns agree across devices.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { HostAction, PlayerAction } from "../types";
import type { TriviaView } from "../views";
import { api, ApiError } from "./api";

export type RoomAuth = { role: "host"; token: string } | { role: "player"; token: string } | { role: "display" };
export type Connection = "connecting" | "live" | "polling" | "offline";

const LIVE_POLL_MS = 4000;
const FALLBACK_POLL_MS = 1200;

function headersFor(auth: RoomAuth): Record<string, string> {
  if (auth.role === "host") return { "x-trivia-host": auth.token };
  if (auth.role === "player") return { "x-trivia-player": auth.token };
  return {};
}

export function useTriviaRoom(code: string, auth: RoomAuth | null) {
  const [view, setView] = useState<TriviaView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [realtime, setRealtime] = useState(false);
  const offsetRef = useRef(0);
  const versionRef = useRef(-1);
  const authKey = auth ? `${auth.role}:${"token" in auth ? auth.token : ""}` : "none";
  const authRef = useRef(auth);
  const realtimeRef = useRef(false);
  // Keep the latest identity / realtime state for callbacks without re-creating them.
  useEffect(() => {
    authRef.current = auth;
    realtimeRef.current = realtime;
  });

  const apply = useCallback((next: TriviaView, force = false) => {
    if (!force && next.room.version < versionRef.current) return;
    versionRef.current = next.room.version;
    offsetRef.current = next.serverNow - Date.now();
    setView(next);
    setError(null);
  }, []);

  const refresh = useCallback(async () => {
    const current = authRef.current;
    if (!current) return;
    try {
      const res = await api<{ view: TriviaView }>(`/api/trivia/rooms/${code}`, { headers: headersFor(current) });
      apply(res.view);
      setConnection((c) => (c === "offline" || c === "connecting" ? (realtimeRef.current ? "live" : "polling") : c));
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 0) setConnection("offline");
        else setError(err);
      }
    }
  }, [code, apply]);

  // First load + whenever the identity changes.
  useEffect(() => {
    versionRef.current = -1;
    if (auth) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, authKey]);

  // Realtime: subscribe once we know the room id.
  const roomId = view?.room.id ?? null;
  useEffect(() => {
    if (!roomId) return;
    const supa = getBrowserClient();
    if (!supa) return;
    const channel = supa.channel(`trivia:${roomId}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "changed" }, () => {
      void refresh();
    });
    channel.subscribe((status: string) => {
      const live = status === "SUBSCRIBED";
      setRealtime(live);
      setConnection((c) => (c === "offline" ? c : live ? "live" : "polling"));
    });
    return () => {
      setRealtime(false);
      try {
        void supa.removeChannel(channel);
      } catch {
        // non-fatal
      }
    };
  }, [roomId, refresh]);

  // Polling safety net.
  useEffect(() => {
    if (!auth) return;
    const ms = realtime ? LIVE_POLL_MS : FALLBACK_POLL_MS;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, ms);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authKey, realtime, refresh]);

  // Coming back to the tab (phones lock screens constantly).
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onVisible);
    };
  }, [refresh]);

  const act = useCallback(
    async (action: HostAction | PlayerAction): Promise<{ note?: string; changed: boolean }> => {
      const current = authRef.current;
      if (!current || current.role === "display") throw new ApiError("Join the game to play.", 401);
      const res = await api<{ view: TriviaView; note?: string; changed: boolean }>(`/api/trivia/rooms/${code}/action`, {
        body: { action },
        headers: headersFor(current),
      });
      apply(res.view, true);
      return { note: res.note, changed: res.changed };
    },
    [code, apply],
  );

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { view, error, connection, refresh, act, serverNow };
}

/** Re-render on a timer while a deadline is running; returns ms left (or null). */
export function useCountdown(deadline: number | null | undefined, serverNow: () => number, tickMs = 100): number | null {
  const [, force] = useState(0);
  useEffect(() => {
    if (!deadline) return;
    const id = window.setInterval(() => force((n) => n + 1), tickMs);
    return () => window.clearInterval(id);
  }, [deadline, tickMs]);
  if (!deadline) return null;
  return Math.max(0, deadline - serverNow());
}
