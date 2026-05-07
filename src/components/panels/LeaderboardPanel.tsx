"use client";

import { Badge } from "@/components/ui";
import { useGame, selectActiveTeam } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { computeAirlineValue, fleetCount, brandRating } from "@/lib/engine";
import { Plane, Crown, Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/cn";
import { airlineColorFor } from "@/lib/games/airline-colors";

export function LeaderboardPanel() {
  const s = useGame();
  // Multiplayer-aware "you" — falls back to legacy isPlayer flag for
  // any persisted save that predates the activeTeamId binding so
  // existing solo runs don't lose their highlight.
  const activeTeamId = selectActiveTeam(s)?.id ?? null;
  const ranked = [...s.teams].sort(
    (a, b) => computeAirlineValue(b) - computeAirlineValue(a),
  );

  return (
    <div className="space-y-3">
      <div className="text-[0.8125rem] text-ink-2">
        Ranked by Airline Value (book equity × brand multiplier).
        Competitor finances stay private — only the rank, brand grade,
        and fleet size are shown. Arrows show Q/Q rank movement vs
        last close.
      </div>
      {/* Ordered list for proper ranking semantics — screen readers
          announce "list item N of M" with the rank built in. */}
      <ol className="space-y-1.5 list-none p-0">
        {ranked.map((t, i) => {
          const isPlayer = activeTeamId !== null
            ? t.id === activeTeamId
            : t.isPlayer; // legacy save fallback
          const rankIcon = i === 0 ? Crown : i === 1 || i === 2 ? Trophy : null;
          const RankIcon = rankIcon;
          const av = computeAirlineValue(t);
          const fc = fleetCount(t.fleet);
          const currentRank = i + 1;
          // Q/Q rank movement — pull from the second-last
          // financialsByQuarter entry (the most recent CLOSED row's
          // rank, vs the new sort position). Last entry is the same
          // quarter as currentRank (snapshotted at close), so we
          // look two-back for the prior quarter's rank.
          const history = t.financialsByQuarter;
          const priorRank = history.length >= 2 ? history[history.length - 2].rank : undefined;
          const rankDelta = priorRank !== undefined ? priorRank - currentRank : null;
          // Gap to next rank: distance in airline value to the team
          // immediately above (or 0 if leader).
          const aboveAv = i > 0 ? computeAirlineValue(ranked[i - 1]) : null;
          const gapToNext = aboveAv !== null ? aboveAv - av : null;

          const ariaLabel = isPlayer
            ? `Rank ${currentRank}${rankDelta && rankDelta !== 0 ? `, ${rankDelta > 0 ? "up" : "down"} ${Math.abs(rankDelta)} from last quarter` : ""}: ${t.name} (you), Brand ${brandRating(t).grade}, airline value ${fmtMoney(av)}, ${fc} aircraft`
            : `Rank ${currentRank}${rankDelta && rankDelta !== 0 ? `, ${rankDelta > 0 ? "up" : "down"} ${Math.abs(rankDelta)} from last quarter` : ""}: ${t.name}, Brand ${brandRating(t).grade}, airline value ${fmtMoney(av)}, ${fc} aircraft`;
          return (
            <li
              key={t.id}
              aria-label={ariaLabel}
              className={`flex items-center gap-3 rounded-md border p-3 transition-colors ${
                isPlayer
                  ? "border-primary bg-[rgba(20,53,94,0.04)]"
                  : "border-line bg-surface hover:bg-surface-hover"
              }`}
            >
              <span aria-hidden="true" className="font-mono text-ink-muted w-5 tabular text-center flex items-center justify-center">
                {RankIcon ? (
                  <RankIcon
                    size={14}
                    className={
                      i === 0
                        ? "text-[var(--gold)]"
                        : i === 1
                          ? "text-ink-2"
                          : "text-warning"
                    }
                  />
                ) : (
                  currentRank
                )}
              </span>
              {/* Q/Q rank movement chip — only renders when we have
                  a prior rank to compare against. Up arrow + green
                  for moved up; down + red for moved down; flat dash
                  for unchanged. */}
              {rankDelta !== null && (
                <span
                  aria-hidden="true"
                  className={cn(
                    "shrink-0 inline-flex items-center gap-0.5 text-[0.625rem] tabular font-mono font-semibold rounded px-1 py-0.5",
                    rankDelta > 0 && "bg-[var(--positive-soft)] text-positive",
                    rankDelta < 0 && "bg-[var(--negative-soft)] text-negative",
                    rankDelta === 0 && "text-ink-muted",
                  )}
                  title={
                    rankDelta > 0
                      ? `Up ${rankDelta} from last quarter`
                      : rankDelta < 0
                        ? `Down ${Math.abs(rankDelta)} from last quarter`
                        : "Same rank as last quarter"
                  }
                >
                  {rankDelta > 0 ? (
                    <><ArrowUp size={9} />{rankDelta}</>
                  ) : rankDelta < 0 ? (
                    <><ArrowDown size={9} />{Math.abs(rankDelta)}</>
                  ) : (
                    <><Minus size={9} /></>
                  )}
                </span>
              )}
              <span
                aria-label={`${airlineColorFor({ colorId: t.airlineColorId, fallbackKey: t.id }).label} airline — ${t.name}`}
                className="inline-block w-8 h-8 rounded flex items-center justify-center font-mono text-[0.6875rem] font-semibold shrink-0"
                style={{
                  // Phase 9 — prefer the player's chosen airline color
                  // over the legacy team.color hex. Falls back to a
                  // deterministic palette pick for legacy teams.
                  background: airlineColorFor({
                    colorId: t.airlineColorId,
                    fallbackKey: t.id,
                  }).hex,
                  color: airlineColorFor({
                    colorId: t.airlineColorId,
                    fallbackKey: t.id,
                  }).textOn === "white" ? "#fff" : "#0F172A",
                }}
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
                <div className="text-[0.6875rem] text-ink-muted font-mono">
                  Hub {t.hubCode}
                  {gapToNext !== null && gapToNext > 0 && (
                    <>
                      {" · "}
                      <span title="Airline value gap to the team immediately above">
                        {fmtMoney(gapToNext)} to next
                      </span>
                    </>
                  )}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="tabular font-display text-[1.25rem] text-ink leading-none">
                  {fmtMoney(av)}
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5 flex items-center justify-end gap-1.5">
                  <span>Brand {brandRating(t).grade}</span>
                  {isPlayer && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span>{t.routes.filter((r) => r.status === "active").length} routes</span>
                    </>
                  )}
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-0.5">
                    <Plane size={11} aria-hidden="true" className="text-ink-muted" />
                    {fc}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
