"use client";

import { create } from "zustand";

export type PanelId =
  | "reports"        // tabbed: overview / mgmt report / financials
  | "overview"       // legacy — still openable so deep links work
  | "dashboard"      // legacy
  | "financials"     // legacy
  | "fleet"
  | "routes"
  | "ops"
  | "investments"    // subsidiaries (hotel/limo/lounge/MRO/fuel/catering/training)
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
  /** Route to auto-focus when the Routes panel opens. Set when the player
   *  clicks an existing route on the map; cleared after the panel reads it. */
  focusedRouteId: string | null;
  setFocusedRouteId(id: string | null): void;
  /** When non-null, the canvas paints the named rival team's network
   *  on the map and the active panel reads that team's data instead of
   *  the player's. Strictly view-only — the player can't act on rival
   *  state. Cleared when the player taps the "Return to your airline"
   *  banner or selects their own airline from the switcher. */
  viewingTeamId: string | null;
  setViewingTeamId(id: string | null): void;
  /** IATA code of the airport whose AirportDetailModal should be open.
   *  Set by clicking a marker on the WorldMap (mouse path) OR by the
   *  "Detail" button in SlotMarketPanel (keyboard path). The canvas
   *  watches this and renders the modal. Null = closed. */
  airportDetailCode: string | null;
  setAirportDetailCode(code: string | null): void;
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
  focusedRouteId: null,
  setFocusedRouteId: (id) => set({ focusedRouteId: id }),
  viewingTeamId: null,
  setViewingTeamId: (id) => set({ viewingTeamId: id }),
  airportDetailCode: null,
  setAirportDetailCode: (code) => set({ airportDetailCode: code }),
}));
