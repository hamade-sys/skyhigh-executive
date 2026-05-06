"use client";

import { useEffect, useState, useMemo } from "react";
import { Bell, Trash2, X, Info, CheckCircle2, AlertTriangle, CircleX, Sparkles } from "lucide-react";
import { useToasts, type ToastKind } from "@/store/toasts";
import { cn } from "@/lib/cn";
import { Button, Modal, ModalFooter, ModalHeader } from "@/components/ui";

const KIND_META: Record<ToastKind, { Icon: typeof Info; tint: string }> = {
  info:     { Icon: Info,          tint: "text-info" },
  success:  { Icon: CheckCircle2,  tint: "text-positive" },
  warning:  { Icon: AlertTriangle, tint: "text-warning" },
  negative: { Icon: CircleX,       tint: "text-negative" },
  accent:   { Icon: Sparkles,      tint: "text-accent" },
};

/**
 * Notification Center — persistent log of every toast.
 *
 * Triggers a bell button (with unread count) in the topbar. Click opens
 * a popover with the full history grouped by relative time (Just now /
 * Earlier today / Older). Player can mark all read, clear history.
 *
 * Why: toasts auto-dismiss in ~4 seconds. Quarter-close fires a burst of
 * them (5+ at once) and the player can't read them all. This panel
 * captures every notification permanently so they can review later.
 */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const history = useToasts((s) => s.history);
  const lastReadAt = useToasts((s) => s.lastReadAt);
  const markAllRead = useToasts((s) => s.markAllRead);
  const clearHistory = useToasts((s) => s.clearHistory);

  const unreadCount = useMemo(
    () => history.filter((t) => t.createdAt > lastReadAt).length,
    [history, lastReadAt],
  );

  function toggle() {
    if (!open) {
      // Opening: defer markAllRead so the unread highlights stay visible
      // for one render — gives the player a chance to see what was new.
      setOpen(true);
    } else {
      // Closing: now mark everything read.
      markAllRead();
      setOpen(false);
    }
  }

  // Bucketing depends on "now", which we refresh once per minute while
  // the panel is open. Pulling Date.now() inline in render or a memo
  // breaks idempotency — buckets would drift on every re-render. We
  // intentionally setState inside an effect to (a) snapshot now at
  // open-time so a stale mount-time value isn't reused hours later,
  // and (b) tick once per minute so "just now" eventually rolls over.
  // The effect-set is bounded (only on open transition) so cascading
  // renders aren't a real concern here.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [open]);

  // Group by relative bucket (newest first)
  const groups = useMemo(() => {
    const HOUR = 60 * 60 * 1000;
    const justNow: typeof history = [];
    const today: typeof history = [];
    const older: typeof history = [];
    // Iterate newest first
    for (let i = history.length - 1; i >= 0; i--) {
      const t = history[i];
      const age = now - t.createdAt;
      if (age < 5 * 60 * 1000) justNow.push(t);
      else if (age < 12 * HOUR) today.push(t);
      else older.push(t);
    }
    return { justNow, today, older };
  }, [history, now]);

  return (
    <>
      <button
        onClick={toggle}
        aria-label={`Notifications (${unreadCount} unread)`}
        title={unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "Notifications"}
        className={cn(
          // Phase 7 P2 — touch target ≥40px (visible 32px + min-h/w
          // expansion). The bell icon stays size-16 inside the
          // larger hit zone.
          "relative w-8 h-8 min-h-[40px] min-w-[40px] rounded-md flex items-center justify-center transition-colors",
          open
            ? "bg-surface-hover text-ink"
            : "text-ink-muted hover:text-ink hover:bg-surface-hover",
        )}
      >
        <Bell size={16} />
        {unreadCount > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[1.125rem] h-[1.125rem] px-1 rounded-full bg-negative text-white text-[0.625rem] font-semibold tabular flex items-center justify-center"
            aria-hidden
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Click-away scrim */}
          <div
            className="fixed inset-0 z-[1199]"
            onClick={() => {
              markAllRead();
              setOpen(false);
            }}
            aria-hidden
          />
          <div
            role="dialog"
            aria-label="Notifications"
            className={cn(
              "fixed top-16 right-3 z-[1200] flex flex-col",
              "w-[min(440px,calc(100vw-1.5rem))] max-h-[70vh]",
              "rounded-xl border border-line bg-surface shadow-[var(--shadow-3)]",
              "overflow-hidden",
            )}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-surface-2/40">
              <div>
                <h3 className="font-display text-[1rem] text-ink leading-none">
                  Notifications
                </h3>
                <p className="text-[0.6875rem] text-ink-muted mt-1">
                  {history.length === 0
                    ? "No notifications yet."
                    : `${history.length} total · ${unreadCount} unread`}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {history.length > 0 && (
                  <button
                    onClick={() => setConfirmClear(true)}
                    aria-label="Clear all"
                    title="Clear all"
                    className="w-8 h-8 min-h-[40px] min-w-[40px] rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
                <button
                  onClick={() => {
                    markAllRead();
                    setOpen(false);
                  }}
                  aria-label="Close"
                  className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {history.length === 0 ? (
                <div className="py-12 text-center text-[0.8125rem] text-ink-muted">
                  Nothing to show yet. Quarter-close events, board decisions,
                  and other updates will land here.
                </div>
              ) : (
                <>
                  {groups.justNow.length > 0 && (
                    <Group label="Just now" items={groups.justNow} lastReadAt={lastReadAt} />
                  )}
                  {groups.today.length > 0 && (
                    <Group label="Earlier today" items={groups.today} lastReadAt={lastReadAt} />
                  )}
                  {groups.older.length > 0 && (
                    <Group label="Older" items={groups.older} lastReadAt={lastReadAt} />
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* Branded clear-history confirm. Replaces the legacy native
          confirm() — this is destructive (history is lost), so we
          spell out the consequence and keep it on-brand. */}
      <Modal open={confirmClear} onClose={() => setConfirmClear(false)}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Clear all notifications?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            All {history.length} notification{history.length === 1 ? "" : "s"} in
            your history will be removed permanently. New notifications will
            still appear normally going forward.
          </p>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmClear(false)}>
            Keep notifications
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              clearHistory();
              setConfirmClear(false);
            }}
          >
            Clear all
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function Group({
  label, items, lastReadAt,
}: {
  label: string;
  items: ReturnType<typeof useToasts.getState>["history"];
  lastReadAt: number;
}) {
  return (
    <section>
      <div className="sticky top-0 px-4 py-1.5 bg-surface-2/80 backdrop-blur-sm text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold border-b border-line">
        {label}
      </div>
      <ul className="divide-y divide-line">
        {items.map((t) => {
          const meta = KIND_META[t.kind];
          const unread = t.createdAt > lastReadAt;
          const Icon = meta.Icon;
          return (
            <li
              key={t.id}
              className={cn(
                "px-4 py-2.5 flex items-start gap-3 text-[0.8125rem]",
                unread && "bg-[rgba(20,53,94,0.04)]",
              )}
            >
              <Icon size={16} className={cn("shrink-0 mt-0.5", meta.tint)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <span className={cn("text-ink leading-tight", unread && "font-semibold")}>
                    {t.title}
                  </span>
                  <span className="text-[0.6875rem] text-ink-muted tabular shrink-0">
                    {relativeTime(t.createdAt)}
                  </span>
                </div>
                {t.detail && (
                  <div className="text-[0.75rem] text-ink-2 mt-0.5 leading-relaxed">
                    {t.detail}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 60 * 60_000) return `${Math.round(diff / 60_000)}m`;
  if (diff < 24 * 60 * 60_000) return `${Math.round(diff / (60 * 60_000))}h`;
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
