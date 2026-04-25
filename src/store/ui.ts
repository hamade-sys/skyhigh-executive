"use client";

import { create } from "zustand";

export type PanelId =
  | "overview"
  | "fleet"
  | "routes"
  | "financials"
  | "ops"
  | "decisions"
  | "news"
  | "leaderboard"
  | "admin";

interface UiStore {
  panel: PanelId | null;
  openPanel(id: PanelId): void;
  togglePanel(id: PanelId): void;
  closePanel(): void;
}

/**
 * Lightweight UI state kept out of Next's router to avoid RSC round-trips on
 * every panel toggle. The map stays visible + responsive.
 */
export const useUi = create<UiStore>((set, get) => ({
  panel: null,
  openPanel: (id) => set({ panel: id }),
  togglePanel: (id) => set({ panel: get().panel === id ? null : id }),
  closePanel: () => set({ panel: null }),
}));
