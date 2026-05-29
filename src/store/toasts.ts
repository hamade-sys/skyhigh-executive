"use client";

import { create } from "zustand";

export type ToastKind = "info" | "success" | "warning" | "negative" | "accent";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** Milliseconds before auto-dismiss. 0 = persistent. */
  duration?: number;
  createdAt: number;
  /** In-game quarter (1-based) at the moment the toast fired. Captured
   *  via a registered provider (see `registerToastQuarterProvider`) so
   *  the Notification Center can date events by the in-game calendar
   *  (e.g. "Q4 06") and group them by in-game year, instead of using
   *  the real-world wall clock. Optional so legacy/persisted toasts and
   *  any push that happens before the provider is registered still work. */
  quarter?: number;
}

/** Provider that returns the current in-game quarter. Registered by the
 *  game UI (NotificationCenter) on mount. Kept as a module-level callback
 *  rather than a static `useGame` import so the toast store has zero
 *  dependency on the game store — that keeps the import graph one-way
 *  (game/UI → toasts) and free of cycles. */
let quarterProvider: (() => number | undefined) | null = null;
export function registerToastQuarterProvider(fn: () => number | undefined) {
  quarterProvider = fn;
}

interface ToastStore {
  /** Currently visible toasts. Auto-dismissed after duration. */
  toasts: Toast[];
  /** Persistent log of every notification ever pushed. The Notifications
   *  Center reads from this. Capped at 200 to avoid runaway memory. */
  history: Toast[];
  /** Timestamp the user last opened the Notifications Center. Anything in
   *  `history` with `createdAt > lastReadAt` shows as unread. */
  lastReadAt: number;
  push(args: Omit<Toast, "id" | "createdAt">): string;
  dismiss(id: string): void;
  clearAll(): void;
  /** Clear the persistent history. */
  clearHistory(): void;
  /** Mark all history as read. */
  markAllRead(): void;
}

// Phase 6 hardening: bumped from 200 → 600 because a 40-round
// workshop with ~10 toasts/round generated 400 events and silently
// dropped Q1-Q5 events by Q25 — facilitators reviewing the
// notifications log mid-workshop missed early critical events.
// 600 entries comfortably covers a 40-round game even at peak
// activity (~15/round) with headroom; for shorter formats the
// extra slack is harmless.
const HISTORY_CAP = 600;

export const useToasts = create<ToastStore>()(
  (set, get) => ({
    toasts: [],
    history: [],
    lastReadAt: 0,
    push: ({ kind, title, detail, duration = 6500 }) => {
      const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const toast: Toast = {
        id,
        kind,
        title,
        detail,
        duration,
        createdAt: Date.now(),
        quarter: quarterProvider?.() ?? undefined,
      };
      set((s) => ({
        toasts: [...s.toasts, toast],
        history: [...s.history, toast].slice(-HISTORY_CAP),
      }));
      if (duration > 0) {
        setTimeout(() => {
          if (get().toasts.some((t) => t.id === id)) {
            get().dismiss(id);
          }
        }, duration);
      }
      return id;
    },
    dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
    clearAll: () => set({ toasts: [] }),
    clearHistory: () => set({ history: [], lastReadAt: Date.now() }),
    markAllRead: () => set({ lastReadAt: Date.now() }),
  }),
);

// Convenience helpers
export const toast = {
  info: (title: string, detail?: string) =>
    useToasts.getState().push({ kind: "info", title, detail }),
  success: (title: string, detail?: string) =>
    useToasts.getState().push({ kind: "success", title, detail }),
  warning: (title: string, detail?: string) =>
    useToasts.getState().push({ kind: "warning", title, detail }),
  negative: (title: string, detail?: string) =>
    useToasts.getState().push({ kind: "negative", title, detail }),
  accent: (title: string, detail?: string) =>
    useToasts.getState().push({ kind: "accent", title, detail }),
};
