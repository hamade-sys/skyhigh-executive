"use client";

import {
  LayoutDashboard,
  Plane,
  Route as RouteIcon,
  DollarSign,
  SlidersHorizontal,
  Hexagon,
  Newspaper,
  Trophy,
  Settings2,
  type LucideIcon,
} from "lucide-react";
import { useGame, selectPlayer } from "@/store/game";
import { useUi, type PanelId } from "@/store/ui";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { cn } from "@/lib/cn";

export type { PanelId };

const NAV: Array<{ id: PanelId; label: string; Icon: LucideIcon }> = [
  { id: "overview",    label: "Overview",    Icon: LayoutDashboard },
  { id: "fleet",       label: "Fleet",       Icon: Plane },
  { id: "routes",      label: "Routes",      Icon: RouteIcon },
  { id: "financials",  label: "Financials",  Icon: DollarSign },
  { id: "ops",         label: "Ops form",    Icon: SlidersHorizontal },
  { id: "decisions",   label: "Decisions",   Icon: Hexagon },
  { id: "news",        label: "World news",  Icon: Newspaper },
  { id: "leaderboard", label: "Leaderboard", Icon: Trophy },
  { id: "admin",       label: "Facilitator", Icon: Settings2 },
];

export function NavRail() {
  const current = useUi((s) => s.panel);
  const togglePanel = useUi((s) => s.togglePanel);
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((state) => state.currentQuarter);
  const fuelIndex = useGame((state) => state.fuelIndex);
  const baseInterestRatePct = useGame((state) => state.baseInterestRatePct);

  const pendingDecisions =
    (SCENARIOS_BY_QUARTER[currentQuarter] ?? []).filter(
      (sc) =>
        !player?.decisions.some(
          (d) => d.scenarioId === sc.id && d.quarter === currentQuarter,
        ),
    ) ?? [];

  return (
    <aside
      className={cn(
        "fixed left-0 top-14 bottom-0 z-30 w-14",
        "flex flex-col items-center py-3",
        "border-r border-line bg-surface/85 backdrop-blur-md",
      )}
    >
      <nav className="flex flex-col gap-1">
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
              title={item.label}
              className={cn(
                "group relative w-10 h-10 rounded-lg flex items-center justify-center",
                "transition-all duration-[var(--dur-fast)]",
                active
                  ? "bg-primary text-primary-fg shadow-[0_4px_12px_rgba(20,53,94,0.25)]"
                  : "text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              <item.Icon size={18} strokeWidth={1.75} />
              {badge !== null && badge > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 rounded-full bg-accent text-primary-fg text-[0.625rem] font-semibold flex items-center justify-center px-1 tabular leading-none">
                  {badge}
                </span>
              )}
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
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      <div className="flex flex-col items-center gap-2 text-[0.625rem] text-ink-muted font-mono tabular">
        <div className="flex flex-col items-center leading-tight">
          <span>{Math.round(fuelIndex)}</span>
          <span className="text-[0.5625rem] uppercase tracking-wider">fuel</span>
        </div>
        <div className="flex flex-col items-center leading-tight">
          <span>{baseInterestRatePct.toFixed(1)}</span>
          <span className="text-[0.5625rem] uppercase tracking-wider">rate</span>
        </div>
      </div>
    </aside>
  );
}
