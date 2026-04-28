"use client";

import { useEffect, useState } from "react";
import {
  Plane,
  Route as RouteIcon,
  SlidersHorizontal,
  Hexagon,
  Gavel,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Newspaper,
  Building2,
  type LucideIcon,
} from "lucide-react";
import { useGame, selectPlayer } from "@/store/game";
import { useUi, type PanelId } from "@/store/ui";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { NEWS_BY_QUARTER, dynamicHostNews } from "@/data/world-news";
import { CITIES_BY_CODE } from "@/data/cities";
import type { NewsItem } from "@/types/game";
import { cn } from "@/lib/cn";
import { fmtQuarter } from "@/lib/format";

export type { PanelId };

/** Player-facing nav. Reports tab consolidates Overview + Mgmt report
 *  + Financials. Leaderboard moved to TopBar; Facilitator is its own
 *  role and not exposed to player UIs. */
const NAV: Array<{ id: PanelId; label: string; Icon: LucideIcon }> = [
  { id: "reports",     label: "Reports",     Icon: BarChart3 },
  { id: "fleet",       label: "Fleet",       Icon: Plane },
  { id: "routes",      label: "Routes",      Icon: RouteIcon },
  { id: "ops",         label: "Ops form",    Icon: SlidersHorizontal },
  { id: "investments", label: "Investments", Icon: Building2 },
  { id: "decisions",   label: "Decisions",   Icon: Hexagon },
  { id: "slots",       label: "Slot market", Icon: Gavel },
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
  const worldCupHostCode = useGame((state) => state.worldCupHostCode);
  const olympicHostCode = useGame((state) => state.olympicHostCode);

  /** Combine static WORLD_NEWS for a round with the dynamic host-city
   *  announcements (World Cup / Olympics) that depend on the per-game
   *  randomized host codes. */
  const itemsForQuarter = (q: number): NewsItem[] => {
    const dynamic = dynamicHostNews(q, worldCupHostCode, olympicHostCode,
      (code) => CITIES_BY_CODE[code]?.name);
    return [...dynamic, ...(NEWS_BY_QUARTER[q] ?? [])];
  };
  const fuelIndex = useGame((state) => state.fuelIndex);
  const baseInterestRatePct = useGame((state) => state.baseInterestRatePct);

  const expanded = useUi((s) => s.railExpanded);
  const toggleRail = useUi((s) => s.toggleRail);
  const [newsExpanded, setNewsExpanded] = useState(false);
  // Rotating ticker — cycles through current quarter's news every 60s so
  // a player who isn't reading the panel still passively sees what's
  // happening this quarter. Resets when the quarter changes.
  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    // Reset ticker when the quarter changes — intentional state
    // sync against an external value (the game clock), not a
    // cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTickerIndex(0);
  }, [currentQuarter]);
  useEffect(() => {
    const items = itemsForQuarter(currentQuarter);
    if (items.length <= 1) return;
    const id = setInterval(() => {
      setTickerIndex((i) => (i + 1) % items.length);
    }, 60_000);
    return () => clearInterval(id);
  }, [currentQuarter]);

  // Self-guided multiplayer disables Board Decisions — the boardroom
  // scenarios assume a discussion partner that doesn't exist when no
  // facilitator is at the table. When disabled, the Decisions tab in
  // the rail no longer shows a pending-count badge (since there's
  // nothing for the player to act on). The DecisionsPanel itself
  // surfaces a clear "Disabled in self-guided" empty state.
  const boardDecisionsEnabled = useGame((s) => s.session?.boardDecisionsEnabled ?? true);
  const pendingDecisions = boardDecisionsEnabled
    ? ((SCENARIOS_BY_QUARTER[currentQuarter] ?? []).filter(
        (sc) =>
          !player?.decisions.some(
            (d) => d.scenarioId === sc.id && d.quarter === currentQuarter,
          ),
      ) ?? [])
    : [];

  // World news = current + past quarters only (most recent first)
  const newsItems: NewsItem[] = [];
  for (let q = currentQuarter; q >= 1; q--) {
    for (const item of itemsForQuarter(q)) newsItems.push(item);
  }

  const railWidth = expanded ? "w-56" : "w-14";

  return (
    <aside
      className={cn(
        // Leaflet panes go up to z-index 1000 — beat that decisively so
        // the rail is always reachable.
        "fixed left-0 top-14 bottom-0 z-[1100] flex flex-col overflow-visible",
        "border-r border-line bg-surface/90 backdrop-blur-md",
        "transition-[width] duration-[var(--dur-fast)]",
        railWidth,
      )}
    >
      {/* Expand/collapse handle — sits at the right edge inside the rail
          so it can't be clipped by any ancestor overflow. */}
      <button
        type="button"
        onClick={toggleRail}
        aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
        aria-expanded={expanded}
        className={cn(
          "absolute right-1 top-2 z-20 w-6 h-6 rounded-full",
          "bg-surface border border-line shadow-[var(--shadow-1)]",
          "flex items-center justify-center text-ink-2 hover:bg-surface-hover hover:text-ink",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        )}
      >
        {expanded ? <ChevronLeft size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />}
      </button>

      {/* Top: nav buttons */}
      <nav aria-label="Main navigation" className="flex flex-col gap-1 px-2 pt-3">
        {NAV.map((item) => {
          const active = current === item.id;
          const badge =
            item.id === "decisions" && pendingDecisions.length > 0
              ? pendingDecisions.length
              : null;
          // The visible label is hidden when the rail is collapsed, so
          // we always provide a contextual aria-label that includes the
          // pending-decisions badge if present.
          const ariaLabel =
            badge !== null && badge > 0
              ? `${item.label} — ${badge} pending decision${badge === 1 ? "" : "s"}`
              : item.label;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => togglePanel(item.id)}
              aria-label={ariaLabel}
              aria-current={active ? "page" : undefined}
              title={!expanded ? item.label : undefined}
              className={cn(
                "group relative h-10 rounded-lg flex items-center",
                expanded ? "px-3 gap-3 justify-start" : "w-10 justify-center mx-auto",
                "transition-colors duration-[var(--dur-fast)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                active
                  ? "bg-primary text-primary-fg shadow-[0_4px_12px_rgba(20,53,94,0.25)]"
                  : "text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              <item.Icon size={18} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
              {expanded && (
                <span className="text-[0.8125rem] font-medium truncate">
                  {item.label}
                </span>
              )}
              {badge !== null && badge > 0 && (
                <span
                  aria-hidden="true"
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
                  aria-hidden="true"
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

      {/* Rotating ticker — always shows ONE current-quarter headline at
          a time, cycling every 60s. Helps a passive player see what's
          happening this quarter without opening the panel. */}
      {expanded && (() => {
        const currentItems = itemsForQuarter(currentQuarter);
        if (currentItems.length === 0) return null;
        const item = currentItems[tickerIndex % currentItems.length];
        return (
          <button
            type="button"
            onClick={() => useUi.getState().openPanel("news")}
            aria-label={`This quarter's news, item ${tickerIndex + 1} of ${currentItems.length}: ${item.headline}. Click to open the full news panel.`}
            className="border-t border-line bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)] px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            title="Click to read this quarter's full news"
          >
            <div className="flex items-baseline justify-between mb-0.5">
              <span className="text-[0.5625rem] uppercase tracking-[0.18em] font-bold text-accent">
                {outletFor(item)} · live
              </span>
              <span className="text-[0.5625rem] tabular font-mono text-ink-muted">
                {tickerIndex + 1}/{currentItems.length}
              </span>
            </div>
            <h3 className="text-[0.6875rem] font-medium text-ink leading-snug line-clamp-2">
              {item.headline}
            </h3>
          </button>
        );
      })()}

      {/* World news ticker — at the BOTTOM, past + current only,
          fake-outlet labels, headline only (no mechanics detail).
          Each headline is clickable: opens the full News panel where
          the player can read the article. */}
      {expanded ? (
        <div className="border-t border-line max-h-[40vh] flex flex-col">
          <button
            type="button"
            onClick={() => setNewsExpanded((v) => !v)}
            aria-expanded={newsExpanded}
            aria-controls="navrail-news-list"
            className="flex items-center justify-between px-3 py-2 text-[0.6875rem] uppercase tracking-wider text-ink-muted hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
          >
            <span className="flex items-center gap-1.5">
              <Newspaper size={12} aria-hidden="true" /> World news
            </span>
            <span className="tabular text-ink" aria-label={`${newsItems.length} headlines`}>{newsItems.length}</span>
          </button>
          {newsExpanded && (
            <div id="navrail-news-list" className="overflow-auto px-2 pb-3 space-y-1.5">
              {newsItems.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => useUi.getState().openPanel("news")}
                  aria-label={`${outletFor(n)} (${fmtQuarter(n.quarter)}): ${n.headline}. Click to open the news panel.`}
                  className="w-full text-left rounded-md border border-line bg-surface px-2.5 py-2 hover:bg-surface-hover hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                  title="Open World news panel to read full article"
                >
                  <div className="flex items-baseline justify-between mb-0.5">
                    <span
                      className="text-[0.625rem] uppercase tracking-wider font-bold text-accent"
                    >
                      {outletFor(n)}
                    </span>
                    <span className="text-[0.625rem] tabular text-ink-muted font-mono">
                      {fmtQuarter(n.quarter)}
                    </span>
                  </div>
                  <h3 className="text-[0.75rem] font-medium text-ink leading-snug">
                    {n.headline}
                  </h3>
                </button>
              ))}
              <button
                type="button"
                onClick={() => useUi.getState().openPanel("news")}
                className="w-full mt-1 px-2 py-1.5 rounded-md border border-line bg-surface-2/50 text-[0.6875rem] uppercase tracking-wider text-ink-muted hover:text-ink hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                Open World News <span aria-hidden="true">→</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        // Collapsed: icon button that opens the News panel directly
        <button
          type="button"
          onClick={() => useUi.getState().openPanel("news")}
          aria-label="Open world news"
          title="World news"
          className="border-t border-line py-3 flex flex-col items-center text-ink-2 hover:text-ink hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
        >
          <Newspaper size={16} aria-hidden="true" />
          <span className="text-[0.5625rem] uppercase tracking-wider mt-0.5">News</span>
        </button>
      )}
    </aside>
  );
}
