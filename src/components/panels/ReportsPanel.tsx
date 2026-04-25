"use client";

import { useState } from "react";
import { LayoutDashboard, BarChart3, DollarSign } from "lucide-react";
import { OverviewPanel } from "@/components/panels/OverviewPanel";
import { DashboardPanel } from "@/components/panels/DashboardPanel";
import { FinancialsPanel } from "@/components/panels/FinancialsPanel";
import { cn } from "@/lib/cn";

/**
 * Reports — single panel that consolidates the player-facing reporting
 * surfaces (Overview snapshot, Mgmt report trajectory, Financials
 * statements) under tabs. Replaces three separate left-rail entries.
 *
 * Each tab is just the existing panel rendered inside; no logic was
 * forked, so bug fixes and tweaks to the underlying panels still
 * apply consistently.
 */
type Tab = "overview" | "mgmt" | "financials";

const TABS: Array<{ id: Tab; label: string; Icon: typeof LayoutDashboard; subtitle: string }> = [
  { id: "overview",   label: "Overview",   Icon: LayoutDashboard, subtitle: "Snapshot of cash, brand, fleet, network" },
  { id: "mgmt",       label: "Mgmt report", Icon: BarChart3,       subtitle: "Trajectory, P&L by period, ops breakdown" },
  { id: "financials", label: "Financials",  Icon: DollarSign,      subtitle: "Balance sheet, debt, quarterly history" },
];

export function ReportsPanel() {
  const [tab, setTab] = useState<Tab>("overview");
  const meta = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <div className="flex flex-col h-full">
      <nav className="flex items-stretch gap-0 border-b border-line -mt-1 mb-3 -mx-1">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 px-3 py-2.5",
                "text-[0.875rem] font-medium border-b-2 -mb-px transition-colors",
                active
                  ? "border-primary text-primary"
                  : "border-transparent text-ink-muted hover:text-ink hover:bg-surface-hover",
              )}
            >
              <t.Icon size={14} strokeWidth={1.75} />
              {t.label}
            </button>
          );
        })}
      </nav>

      <div className="text-[0.6875rem] text-ink-muted leading-relaxed mb-3 px-0.5">
        {meta.subtitle}
      </div>

      <div className="flex-1 overflow-auto pb-1">
        {tab === "overview" && <OverviewPanel />}
        {tab === "mgmt" && <DashboardPanel />}
        {tab === "financials" && <FinancialsPanel />}
      </div>
    </div>
  );
}
