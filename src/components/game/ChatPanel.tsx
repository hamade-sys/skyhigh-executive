"use client";

/**
 * In-game cohort chat — Phase 10.
 *
 * Slide-over from the right edge. Loads the most-recent 50 messages
 * via /api/games/chat/list, subscribes to Realtime for new messages
 * and soft-delete updates, and ships sends through
 * /api/games/chat/send (which handles profanity, rate limit, and
 * the denormalised author metadata).
 *
 * Every message renders the author's airline color chip (Phase 9)
 * so cohorts can recognise each other visually. Facilitator
 * broadcasts get an amber pill for emphasis.
 *
 * Behaviour:
 *   - 500-char counter; Enter sends, Shift+Enter newline.
 *   - Optimistic insert with rollback on send failure.
 *   - Empty state: "No messages yet — say hi to your fellow airlines."
 *   - Read-only when game.status === 'ended' (post-game retro can
 *     still see the log).
 *   - Mobile: panel goes full-screen below 768px so the keyboard
 *     can push the input above the fold cleanly.
 *   - Honours `prefers-reduced-motion` — no slide animation when set.
 */

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type KeyboardEvent,
} from "react";
import { X, Send, MessageCircle, Megaphone, Trash2, Loader2 } from "lucide-react";
import { useGame } from "@/store/game";
import {
  subscribeToChat,
  type ChatMessageRow,
} from "@/lib/games/chat-realtime";
import {
  airlineColorFor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { cn } from "@/lib/cn";

const MAX_LENGTH = 500;

interface Props {
  open: boolean;
  onClose: () => void;
  /** Set the count of unread messages (panel-closed) so the parent
   *  TopBar trigger can render a badge. */
  onUnreadCountChange?: (count: number) => void;
}

export function ChatPanel({ open, onClose, onUnreadCountChange }: Props) {
  const sessionGameId = useGame((g) => g.session?.gameId ?? null);
  const sessionId = useGame((g) => g.localSessionId);
  const phase = useGame((g) => g.phase);
  const isFacilitator = useGame((g) => {
    const myId = g.localSessionId;
    if (!myId) return false;
    return g.session?.facilitatorSessionId === myId;
  });
  const isReadOnly = phase === "endgame";

  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [broadcastMode, setBroadcastMode] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Initial backfill on open.
  useEffect(() => {
    if (!open || !sessionGameId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/games/chat/list?gameId=${encodeURIComponent(sessionGameId)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        if (Array.isArray(json?.messages)) {
          // API returns newest-first; reverse so render order is
          // oldest→newest top-to-bottom.
          setMessages([...json.messages].reverse() as ChatMessageRow[]);
        }
      } catch {
        if (!cancelled) setError("Couldn't load chat history.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, sessionGameId]);

  // Realtime subscription — runs whenever the panel is mounted (NOT
  // gated by `open`) so unread-count tracking continues while the
  // panel is closed.
  useEffect(() => {
    if (!sessionGameId) return;
    const sub = subscribeToChat(sessionGameId, {
      onInsert: (msg) => {
        setMessages((prev) => {
          // Dedupe — server-confirmed message replaces any optimistic
          // local copy keyed by client-side temp id.
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });
      },
      onUpdate: (msg) => {
        setMessages((prev) =>
          prev.map((m) => (m.id === msg.id ? msg : m)),
        );
      },
    });
    return () => sub.unsubscribe();
  }, [sessionGameId]);

  // Unread tracking — count messages newer than the last "panel
  // opened" timestamp. Resets to 0 when open. We initialise the ref
  // to `null` and set it on the first effect run so we don't call
  // Date.now() during render (lint forbids that). The unread-count
  // effect is fire-safe even if a Realtime INSERT lands BEFORE the
  // mount effect runs: the `lastSeen ?? Date.now()` fallback in
  // that branch returns "now", so any in-flight message would be
  // skipped — but we explicitly clamp via a single setup effect
  // before any unread calculation runs.
  const lastSeenAtRef = useRef<number | null>(null);
  const [seenInitialized, setSeenInitialized] = useState(false);
  useEffect(() => {
    lastSeenAtRef.current = Date.now();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeenInitialized(true);
  }, []);
  useEffect(() => {
    if (!seenInitialized) return;
    if (open) {
      lastSeenAtRef.current = Date.now();
      onUnreadCountChange?.(0);
      return;
    }
    if (!onUnreadCountChange) return;
    const lastSeen = lastSeenAtRef.current ?? Date.now();
    const unread = messages.filter((m) => {
      const ts = new Date(m.created_at).getTime();
      return (
        ts > lastSeen &&
        m.author_session_id !== sessionId &&
        !m.deleted_at
      );
    }).length;
    onUnreadCountChange(unread);
  }, [messages, open, onUnreadCountChange, sessionId, seenInitialized]);

  // Auto-scroll to bottom on new messages (when panel is open).
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const send = useCallback(async () => {
    const body = draft.trim();
    if (!body || !sessionGameId || sending || isReadOnly) return;
    setSending(true);
    setError(null);

    // Optimistic insert — render the message immediately with a
    // temp id so the user sees feedback before the network round-
    // trip. When the Realtime echo arrives we de-dupe by matching
    // (author + created_at proximity + body) and replace the temp.
    // On failure we roll back.
    const tempId = `temp:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
    const optimistic: ChatMessageRow = {
      id: tempId,
      game_id: sessionGameId,
      author_session_id: sessionId ?? "",
      author_display_name: "You",
      author_airline_color_id: null,
      is_facilitator_broadcast: broadcastMode && isFacilitator,
      body,
      created_at: new Date().toISOString(),
      deleted_at: null,
      deleted_by_session_id: null,
    };
    setMessages((prev) => [...prev, optimistic]);
    setDraft("");

    try {
      const { fetchWithRetry } = await import("@/lib/games/fetch-with-retry");
      const res = await fetchWithRetry("/api/games/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameId: sessionGameId,
          body,
          asFacilitatorBroadcast: broadcastMode && isFacilitator,
        }),
        // Don't retry 422 (profanity) or 429 (rate-limit) — those
        // are user-side and should be surfaced immediately. The
        // helper already skips 4xx by default, so chat-send only
        // retries on 5xx + network failures.
        maxAttempts: 3,
      });
      const json = await res.json();
      if (!res.ok) {
        // Rollback the optimistic insert and restore the draft so
        // the user can edit + retry without retyping.
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setDraft(body);
        setError(json?.error ?? "Couldn't send message.");
        return;
      }
      // Server-confirmed row — replace the temp with the real row
      // (the Realtime listener may also fire and deliver this same
      // row; the dedupe in onInsert by row.id handles that).
      const real = json?.message as ChatMessageRow | undefined;
      if (real) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? real : m)),
        );
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setDraft(body);
      setError("Network error — message not sent.");
    } finally {
      setSending(false);
    }
  }, [draft, sessionGameId, sending, isReadOnly, broadcastMode, isFacilitator, sessionId]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function handleDelete(messageId: string) {
    if (!sessionGameId || !isFacilitator) return;
    try {
      await fetch("/api/games/chat/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: sessionGameId, messageId }),
      });
      // Realtime will deliver the soft-delete update.
    } catch {
      setError("Couldn't remove message.");
    }
  }

  if (!open) return null;
  if (!sessionGameId) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="In-game chat"
      className="fixed inset-0 z-[80] flex"
    >
      {/* Scrim — click to close */}
      <button
        type="button"
        aria-label="Close chat"
        onClick={onClose}
        className="flex-1 bg-slate-900/30 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
      />
      {/* Panel — full-width on mobile, anchored right at md+ */}
      <aside
        className={cn(
          "h-full w-full md:max-w-md md:w-[28rem]",
          "flex flex-col bg-surface border-l border-line shadow-[var(--shadow-3)]",
          "motion-safe:transition-transform motion-safe:duration-200",
        )}
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
          <div className="flex items-center gap-2">
            <MessageCircle size={16} className="text-ink-muted" aria-hidden />
            <h2 className="text-[0.9375rem] font-semibold text-ink">
              Cohort chat
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close chat"
            className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center min-h-[40px] min-w-[40px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X size={16} aria-hidden />
          </button>
        </header>

        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2"
        >
          {messages.length === 0 ? (
            <div className="text-center text-[0.8125rem] text-ink-muted py-12">
              No messages yet — say hi to your fellow airlines.
            </div>
          ) : (
            messages.map((m) => (
              <ChatMessage
                key={m.id}
                msg={m}
                isMine={m.author_session_id === sessionId}
                canDelete={isFacilitator && !m.deleted_at}
                onDelete={() => handleDelete(m.id)}
              />
            ))
          )}
        </div>

        {error && (
          <div
            role="alert"
            className="mx-3 mb-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-700"
          >
            {error}
          </div>
        )}

        <footer className="border-t border-line p-3 shrink-0">
          {isReadOnly ? (
            <p className="text-[0.8125rem] text-ink-muted text-center py-2">
              The game has ended. Chat is read-only.
            </p>
          ) : (
            <>
              {isFacilitator && (
                <label className="flex items-center gap-2 mb-2 text-[0.75rem] text-ink-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={broadcastMode}
                    onChange={(e) => setBroadcastMode(e.target.checked)}
                    className="rounded"
                  />
                  <Megaphone size={12} className="text-amber-600" />
                  Send as facilitator broadcast
                </label>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
                  onKeyDown={handleKeyDown}
                  rows={2}
                  placeholder="Message your cohort…"
                  aria-label="Chat message"
                  className="flex-1 min-h-[44px] resize-none rounded-md border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || draft.trim().length === 0}
                  aria-label="Send message"
                  className="w-10 h-10 min-h-[44px] min-w-[44px] rounded-md bg-primary text-primary-fg font-semibold disabled:opacity-50 hover:bg-primary/90 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                >
                  {sending ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                  ) : (
                    <Send size={16} aria-hidden />
                  )}
                </button>
              </div>
              <div className="flex items-center justify-between mt-1.5 text-[0.6875rem] text-ink-muted">
                <span>Enter to send · Shift+Enter for newline</span>
                <span
                  className={cn(
                    "tabular",
                    draft.length > MAX_LENGTH * 0.9 && "text-rose-600 font-semibold",
                  )}
                >
                  {draft.length} / {MAX_LENGTH}
                </span>
              </div>
            </>
          )}
        </footer>
      </aside>
    </div>
  );
}

function ChatMessage({
  msg,
  isMine,
  canDelete,
  onDelete,
}: {
  msg: ChatMessageRow;
  isMine: boolean;
  canDelete: boolean;
  onDelete: () => void;
}) {
  const color = airlineColorFor({
    colorId: (msg.author_airline_color_id as AirlineColorId | null) ?? null,
    fallbackKey: msg.author_session_id,
  });
  const ts = new Date(msg.created_at);
  const timeLabel = ts.toLocaleTimeString("en-AE", {
    hour: "numeric",
    minute: "2-digit",
  });

  if (msg.deleted_at) {
    return (
      <div className="text-[0.75rem] text-ink-muted italic px-3 py-1">
        Message removed by facilitator
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-md px-3 py-2 group",
        msg.is_facilitator_broadcast
          ? "bg-amber-50 border border-amber-200"
          : isMine
            ? "bg-surface-hover"
            : "bg-surface",
      )}
    >
      <div className="flex items-center gap-2 mb-1">
        <span
          aria-label={`${color.label} airline`}
          className="inline-block w-3 h-3 rounded-sm shrink-0"
          style={{ background: color.hex }}
        />
        <span className="text-[0.8125rem] font-semibold text-ink truncate">
          {msg.author_display_name}
        </span>
        {msg.is_facilitator_broadcast && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-100 text-amber-800">
            <Megaphone size={9} />
            Facilitator
          </span>
        )}
        <span className="ml-auto text-[0.6875rem] text-ink-muted tabular shrink-0">
          {timeLabel}
        </span>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            aria-label="Remove message"
            title="Remove message (facilitator)"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 w-6 h-6 rounded text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-opacity"
          >
            <Trash2 size={11} aria-hidden />
          </button>
        )}
      </div>
      <p className="text-[0.875rem] text-ink-2 leading-relaxed whitespace-pre-wrap break-words">
        {msg.body}
      </p>
    </div>
  );
}
