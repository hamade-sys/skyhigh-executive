import { Crown } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ViewTeam } from "@/lib/trivia/views";
import { formatScore } from "./PlayerChip";
import { ToolCounts } from "./Teams";

/** The row of team podiums along the bottom of the big screen. */
export function ScoreStrip({
  teams,
  controllerTeamId,
  highlightId,
  showTools = false,
  className,
}: {
  teams: ViewTeam[];
  controllerTeamId: string | null;
  highlightId?: string | null;
  showTools?: boolean;
  className?: string;
}) {
  return (
    <ul className={cn("grid w-full gap-[clamp(6px,1vmin,14px)]", className)} style={{ gridTemplateColumns: `repeat(${Math.max(1, teams.length)}, minmax(0, 1fr))` }} aria-label="Scores">
      {teams.map((t) => {
        const control = t.id === controllerTeamId;
        return (
          <li
            key={t.id}
            className={cn(
              "relative min-w-0 overflow-hidden rounded-[1.4vmin] border border-[var(--t-line)] bg-white px-[1.6vmin] pb-[1.2vmin] pt-[1.6vmin] text-center shadow-sm transition-transform duration-300",
              highlightId === t.id && "scale-[1.04] ring-4 ring-[var(--t-teal-deep)]",
            )}
            style={{ boxShadow: `inset 0 0.7vmin 0 ${t.color}` }}
          >
            <p className="flex items-center justify-center gap-[0.6vmin] truncate t-font text-[clamp(13px,2.2vmin,26px)] font-extrabold" data-team="" style={{ "--team": t.color } as React.CSSProperties}>
              {control && <Crown className="h-[1em] w-[1em] shrink-0 text-[var(--t-teal-deep)]" aria-label="Picks next" />}
              <span className="truncate">{t.name}</span>
            </p>
            <p className={cn("t-font text-[clamp(20px,4.4vmin,52px)] font-extrabold tabular-nums leading-tight", t.score < 0 ? "text-[var(--t-red)]" : "text-[var(--t-ink)]")}>
              {formatScore(t.score)}
            </p>
            {showTools && <ToolCounts tools={t.tools} className="mt-[0.6vmin] justify-center" />}
          </li>
        );
      })}
    </ul>
  );
}
