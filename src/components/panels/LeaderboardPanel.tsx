"use client";

import { Badge } from "@/components/ui";
import { useGame } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { computeAirlineValue, fleetCount, brandRating } from "@/lib/engine";
import { Plane, Crown, Trophy } from "lucide-react";

export function LeaderboardPanel() {
  const s = useGame();
  const ranked = [...s.teams].sort(
    (a, b) => computeAirlineValue(b) - computeAirlineValue(a),
  );

  return (
    <div className="space-y-3">
      <div className="text-[0.8125rem] text-ink-2">
        Ranked by Airline Value (book equity × brand multiplier). Competitor
        finances stay private per PRD.
      </div>
      <div className="space-y-1.5">
        {ranked.map((t, i) => {
          const isPlayer = t.isPlayer;
          const rankIcon = i === 0 ? Crown : i === 1 || i === 2 ? Trophy : null;
          const RankIcon = rankIcon;
          return (
            <div
              key={t.id}
              className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                isPlayer
                  ? "border-primary bg-[rgba(20,53,94,0.04)]"
                  : "border-line bg-surface hover:bg-surface-hover"
              }`}
            >
              <span className="font-mono text-ink-muted w-5 tabular text-center flex items-center justify-center">
                {RankIcon ? (
                  <RankIcon
                    size={14}
                    className={
                      i === 0
                        ? "text-[#E0A93B]"
                        : i === 1
                          ? "text-ink-2"
                          : "text-warning"
                    }
                  />
                ) : (
                  i + 1
                )}
              </span>
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
                  {fmtMoney(computeAirlineValue(t))}
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5 flex items-center justify-end gap-1.5">
                  <span>Brand {brandRating(t).grade}</span>
                  {isPlayer && (
                    <>
                      <span>·</span>
                      <span>{t.routes.filter((r) => r.status === "active").length} routes</span>
                    </>
                  )}
                  <span>·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Plane size={11} className="text-ink-muted" />
                    {fleetCount(t.fleet)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
