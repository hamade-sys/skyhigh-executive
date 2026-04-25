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
  | "slots"
  | "admin";

interface UiStore {
  panel: PanelId | null;
  openPanel(id: PanelId): void;
  togglePanel(id: PanelId): void;
  closePanel(): void;
  /** Rail expanded state. Lifted here so the map container can adjust its
   *  left inset and avoid the rail covering map area when expanded. */
  railExpanded: boolean;
  setRailExpanded(v: boolean): void;
  toggleRail(): void;
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
  railExpanded: false,
  setRailExpanded: (v) => set({ railExpanded: v }),
  toggleRail: () => set({ railExpanded: !get().railExpanded }),
}));
