"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useGame, selectPlayer } from "@/store/game";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { cn } from "@/lib/cn";

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

const NAV: Array<{ id: PanelId; label: string; icon: string }> = [
  { id: "overview",    label: "Overview",    icon: "◎" },
  { id: "fleet",       label: "Fleet",       icon: "✈" },
  { id: "routes",      label: "Routes",      icon: "↗" },
  { id: "financials",  label: "Financials",  icon: "$" },
  { id: "ops",         label: "Ops",         icon: "▦" },
  { id: "decisions",   label: "Decisions",   icon: "⬡" },
  { id: "news",        label: "News",        icon: "☐" },
  { id: "leaderboard", label: "Ranks",       icon: "≡" },
  { id: "admin",       label: "Admin",       icon: "⚙" },
];

export function NavRail() {
  const router = useRouter();
  const params = useSearchParams();
  const current = params.get("panel") as PanelId | null;
  const s = useGame();
  const player = selectPlayer(s);

  const pendingDecisions =
    (SCENARIOS_BY_QUARTER[s.currentQuarter] ?? []).filter(
      (sc) =>
        !player?.decisions.some(
          (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
        ),
    ) ?? [];

  function toggle(id: PanelId) {
    const sp = new URLSearchParams(params.toString());
    if (current === id) sp.delete("panel");
    else sp.set("panel", id);
    const q = sp.toString();
    router.push(q ? `/?${q}` : "/");
  }

  return (
    <div className="pointer-events-none fixed left-3 top-20 bottom-3 z-30 flex items-start">
      <nav className="pointer-events-auto flex flex-col gap-0.5 rounded-xl border border-line bg-surface/90 backdrop-blur px-1 py-1 shadow-[var(--shadow-2)]">
        {NAV.map((item) => {
          const active = current === item.id;
          const badge =
            item.id === "decisions" && pendingDecisions.length > 0
              ? pendingDecisions.length
              : null;
          return (
            <button
              key={item.id}
              onClick={() => toggle(item.id)}
              title={item.label}
              className={cn(
                "group relative w-11 h-11 rounded-lg flex items-center justify-center",
                "transition-colors duration-[var(--dur-fast)]",
                active
                  ? "bg-[rgba(20,53,94,0.1)] text-primary"
                  : "text-ink-2 hover:bg-surface-hover hover:text-ink",
              )}
            >
              <span className="font-mono text-[1rem]">{item.icon}</span>
              {badge !== null && badge > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-accent text-primary-fg text-[0.625rem] font-semibold flex items-center justify-center px-1 tabular">
                  {badge}
                </span>
              )}
              {/* Tooltip on hover */}
              <span className="absolute left-full ml-2 px-2 py-1 rounded-md bg-ink text-[var(--bg)] text-[0.6875rem] font-medium opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
