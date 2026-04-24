"use client";

import { Badge } from "@/components/ui";
import { useGame } from "@/store/game";
import { fmtPct } from "@/lib/format";
import { fleetCount } from "@/lib/engine";

export function LeaderboardPanel() {
  const s = useGame();
  const ranked = [...s.teams].sort((a, b) => b.brandValue - a.brandValue);

  return (
    <div className="space-y-3">
      <div className="text-[0.8125rem] text-ink-2">
        Ranked by Brand Value. Competitor financial detail is hidden per PRD.
      </div>
      <div className="space-y-1.5">
        {ranked.map((t, i) => {
          const isPlayer = t.isPlayer;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-md border p-3 ${
                isPlayer
                  ? "border-primary bg-[rgba(20,53,94,0.04)]"
                  : "border-line bg-surface"
              }`}
            >
              <span className="font-mono text-ink-muted w-5 tabular text-center">{i + 1}</span>
              <span
                className="inline-block w-8 h-8 rounded flex items-center justify-center font-mono text-[0.6875rem] font-semibold text-primary-fg shrink-0"
                style={{ background: t.color }}
              >
                {t.code}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`${isPlayer ? "font-semibold text-ink" : "text-ink-2"} truncate text-[0.875rem]`}>
                    {t.name}
                  </span>
                  {isPlayer && <Badge tone="primary">You</Badge>}
                </div>
                <div className="text-[0.6875rem] text-ink-muted font-mono">Hub {t.hubCode}</div>
              </div>
              <div className="text-right shrink-0">
                <div className="tabular font-display text-[1.25rem] text-ink leading-none">
                  {t.brandValue.toFixed(1)}
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                  {isPlayer
                    ? `${t.routes.filter((r) => r.status === "active").length} routes · ${fleetCount(t.fleet)} ✈ · ${fmtPct(t.customerLoyaltyPct, 0)}`
                    : "—"}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
