"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ToastKind = "info" | "success" | "warning" | "negative" | "accent";

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
  /** Milliseconds before auto-dismiss. 0 = persistent. */
  duration?: number;
  createdAt: number;
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
  persist(
    (set, get) => ({
      toasts: [],
      history: [],
      lastReadAt: 0,
      // Default duration bumped 4.2s → 6.5s so quarter-close bursts (5+
      // toasts in quick succession) stay readable. Anything the user
      // misses still lives in the persistent Notification Center.
      push: ({ kind, title, detail, duration = 6500 }) => {
        const id = `t-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        const toast: Toast = {
          id,
          kind,
          title,
          detail,
          duration,
          createdAt: Date.now(),
        };
        set((s) => ({
          toasts: [...s.toasts, toast],
          // Append to history; cap to last HISTORY_CAP entries.
          history: [...s.history, toast].slice(-HISTORY_CAP),
        }));
        if (duration > 0) {
          setTimeout(() => {
            // Only dismiss if it hasn't already been dismissed
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
    {
      name: "skyforce-toast-history-v1",
      storage: createJSONStorage(() => localStorage),
      // Only persist history + lastReadAt — active toasts shouldn't survive a reload.
      partialize: (s) => ({ history: s.history, lastReadAt: s.lastReadAt }),
    },
  ),
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
