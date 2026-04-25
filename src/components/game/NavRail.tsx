"use client";

import { useState } from "react";
import {
  LayoutDashboard,
  Plane,
  Route as RouteIcon,
  DollarSign,
  SlidersHorizontal,
  Hexagon,
  Trophy,
  Gavel,
  BarChart3,
  Settings2,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  type LucideIcon,
} from "lucide-react";
import { useGame, selectPlayer } from "@/store/game";
import { useUi, type PanelId } from "@/store/ui";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { NEWS_BY_QUARTER } from "@/data/world-news";
import type { NewsItem } from "@/types/game";
import { cn } from "@/lib/cn";

export type { PanelId };

const NAV: Array<{ id: PanelId; label: string; Icon: LucideIcon }> = [
  { id: "overview",    label: "Overview",    Icon: LayoutDashboard },
  { id: "dashboard",   label: "Mgmt report", Icon: BarChart3 },
  { id: "fleet",       label: "Fleet",       Icon: Plane },
  { id: "routes",      label: "Routes",      Icon: RouteIcon },
  { id: "financials",  label: "Financials",  Icon: DollarSign },
  { id: "ops",         label: "Ops form",    Icon: SlidersHorizontal },
  { id: "decisions",   label: "Decisions",   Icon: Hexagon },
  { id: "leaderboard", label: "Leaderboard", Icon: Trophy },
  { id: "slots",       label: "Slot market", Icon: Gavel },
  { id: "admin",       label: "Facilitator", Icon: Settings2 },
];

/** Fictional news outlets we cycle through to give the news feed a real-world feel.
 *  These replace the impact-tag taxonomy as the surface label. The internal
 *  `impact` field is preserved for engine logic but never shown to the player. */
const OUTLETS: string[] = [
  "Sky News",
  "Bloomberg",
  "Reuters",
  "FT",
  "The Air Reporter",
  "AP",
  "BBC World",
  "WSJ",
  "Al Arabiya",
  "Nikkei Asia",
];

/** Deterministic mapping from a news id to an outlet name so the same item
 *  always shows under the same outlet. */
function outletFor(item: NewsItem): string {
  let h = 0;
  for (let i = 0; i < item.id.length; i++) {
    h = (h * 31 + item.id.charCodeAt(i)) & 0xffffffff;
  }
  return OUTLETS[Math.abs(h) % OUTLETS.length];
}

export function NavRail() {
  const current = useUi((s) => s.panel);
  const togglePanel = useUi((s) => s.togglePanel);
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((state) => state.currentQuarter);
  const fuelIndex = useGame((state) => state.fuelIndex);
  const baseInterestRatePct = useGame((state) => state.baseInterestRatePct);

  const expanded = useUi((s) => s.railExpanded);
  const toggleRail = useUi((s) => s.toggleRail);
  const setRailExpanded = useUi((s) => s.setRailExpanded);
  const [newsExpanded, setNewsExpanded] = useState(false);

  const pendingDecisions =
    (SCENARIOS_BY_QUARTER[currentQuarter] ?? []).filter(
      (sc) =>
        !player?.decisions.some(
          (d) => d.scenarioId === sc.id && d.quarter === currentQuarter,
        ),
    ) ?? [];

  // World news = current + past quarters only (most recent first)
  const newsItems: NewsItem[] = [];
  for (let q = currentQuarter; q >= 1; q--) {
    const items = NEWS_BY_QUARTER[q] ?? [];
    for (const item of items) newsItems.push(item);
  }

  const railWidth = expanded ? "w-56" : "w-14";

  return (
    <aside
      className={cn(
        // z-50 to stay above the Leaflet map (which makes its own
        // stacking context at z-index: 0). Same as Panel/TopBar so they
        // never disappear behind the globe.
        "fixed left-0 top-14 bottom-0 z-50 flex flex-col overflow-visible",
        "border-r border-line bg-surface/90 backdrop-blur-md",
        "transition-[width] duration-[var(--dur-fast)]",
        railWidth,
      )}
    >
      {/* Expand/collapse handle — sits at the right edge inside the rail
          so it can't be clipped by any ancestor overflow. */}
      <button
        onClick={toggleRail}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        className={cn(
          "absolute right-1 top-2 z-20 w-6 h-6 rounded-full",
          "bg-surface border border-line shadow-[var(--shadow-1)]",
          "flex items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink",
        )}
      >
        {expanded ? <ChevronLeft size={13} /> : <ChevronRight size={13} />}
      </button>

      {/* Top: nav buttons */}
      <nav className="flex flex-col gap-1 px-2 pt-3">
        {NAV.map((item) => {
          const active = current === item.id;
          const badge =
            item.id === "decisions" && pendingDecisions.length > 0
              ? pendingDecisions.length
              : null;
          return (
            <button
              key={item.id}
              onClick={() => togglePanel(item.id)}
              title={!expanded ? item.label : undefined}
              className={cn(
                "group relative h-10 rounded-lg flex items-center",
                expanded ? "px-3 gap-3 justify-start" : "w-10 justify-center mx-auto",
                "transition-colors duration-[var(--dur-fast)]",
                active
                  ? "bg-primary text-primary-fg shadow-[0_4px_12px_rgba(20,53,94,0.25)]"
                  : "text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              <item.Icon size={18} strokeWidth={1.75} className="shrink-0" />
              {expanded && (
                <span className="text-[0.8125rem] font-medium truncate">
                  {item.label}
                </span>
              )}
              {badge !== null && badge > 0 && (
                <span
                  className={cn(
                    "absolute min-w-[16px] h-4 rounded-full bg-accent text-primary-fg",
                    "text-[0.625rem] font-semibold flex items-center justify-center",
                    "px-1 tabular leading-none",
                    expanded ? "right-2" : "-top-1 -right-1",
                  )}
                >
                  {badge}
                </span>
              )}
              {!expanded && (
                <span
                  className={cn(
                    "absolute left-full ml-3 px-2.5 py-1 rounded-md",
                    "bg-ink text-[var(--bg)] text-[0.75rem] font-medium",
                    "opacity-0 group-hover:opacity-100 pointer-events-none",
                    "whitespace-nowrap transition-opacity duration-[var(--dur-fast)]",
                    "shadow-[var(--shadow-2)]",
                  )}
                >
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Quick stats — always visible */}
      <div
        className={cn(
          "border-t border-line",
          expanded
            ? "px-3 py-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[0.6875rem] tabular font-mono text-ink-muted"
            : "py-2 flex flex-col items-center gap-2 text-[0.625rem] text-ink-muted font-mono tabular",
        )}
      >
        {expanded ? (
          <>
            <span>Fuel idx</span>
            <span className="text-ink text-right">{Math.round(fuelIndex)}</span>
            <span>Base rate</span>
            <span className="text-ink text-right">{baseInterestRatePct.toFixed(1)}%</span>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center leading-tight">
              <span>{Math.round(fuelIndex)}</span>
              <span className="text-[0.5625rem] uppercase tracking-wider">fuel</span>
            </div>
            <div className="flex flex-col items-center leading-tight">
              <span>{baseInterestRatePct.toFixed(1)}</span>
              <span className="text-[0.5625rem] uppercase tracking-wider">rate</span>
            </div>
          </>
        )}
      </div>

      {/* World news ticker — at the BOTTOM, past + current only,
          fake-outlet labels, headline only (no mechanics detail) */}
      {expanded ? (
        <div className="border-t border-line max-h-[40vh] flex flex-col">
          <button
            onClick={() => setNewsExpanded((v) => !v)}
            className="flex items-center justify-between px-3 py-2 text-[0.6875rem] uppercase tracking-wider text-ink-muted hover:bg-surface-hover"
          >
            <span className="flex items-center gap-1.5">
              <Newspaper size={12} /> World news
            </span>
            <span className="tabular text-ink">{newsItems.length}</span>
          </button>
          {newsExpanded && (
            <div className="overflow-auto px-2 pb-3 space-y-1.5">
              {newsItems.map((n) => (
                <article
                  key={n.id}
                  className="rounded-md border border-line bg-surface px-2.5 py-2"
                >
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span
                      className="text-[0.625rem] uppercase tracking-wider font-bold text-accent"
                    >
                      {outletFor(n)}
                    </span>
                    <span className="text-[0.625rem] tabular text-ink-muted font-mono">
                      Q{n.quarter}
                    </span>
                  </div>
                  <h3 className="text-[0.75rem] font-medium text-ink leading-snug">
                    {n.headline}
                  </h3>
                </article>
              ))}
            </div>
          )}
        </div>
      ) : (
        // Collapsed: just an icon button that opens the news panel state
        <button
          onClick={() => setRailExpanded(true)}
          title="World news"
          className="border-t border-line py-3 flex flex-col items-center text-ink-2 hover:text-ink hover:bg-surface-hover"
        >
          <Newspaper size={16} />
          <span className="text-[0.5625rem] uppercase tracking-wider mt-0.5">News</span>
        </button>
      )}
    </aside>
  );
}
