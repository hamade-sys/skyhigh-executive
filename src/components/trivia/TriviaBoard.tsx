"use client";

import type { CSSProperties } from "react";
import { cn } from "@/lib/cn";
import type { ViewColumn } from "@/lib/trivia/views";

type TeamLite = { id: string; name: string; color: string };

/**
 * The board grid, used by the big display, the host console and the
 * phone of the player who's picking. Sized entirely from its own box
 * (container query units), so the same component fills a projector
 * or a phone without breakpoints.
 */
export function TriviaBoard({
  board,
  teams = [],
  rows,
  onSelect,
  canSelect,
  activeCellId,
  hint,
  className,
  compact = false,
}: {
  board: ViewColumn[];
  /** For colouring cells won by a team. */
  teams?: TeamLite[];
  rows: number;
  onSelect?: (cellId: string) => void;
  canSelect?: boolean;
  activeCellId?: string | null;
  /** Host console: a tooltip with the question behind each cell. */
  hint?: (cellId: string) => string | null;
  className?: string;
  compact?: boolean;
}) {
  const cols = Math.max(1, board.length);
  const style = { "--cols": cols, "--rows": rows } as CSSProperties;
  return (
    <div className={cn("relative h-full w-full [container-type:size]", className)} style={style}>
      <div
        className={cn("grid h-full w-full", compact ? "gap-[3px]" : "gap-[clamp(3px,0.6cqmin,8px)]")}
        style={{
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `minmax(0, 1.3fr) repeat(${rows}, minmax(0, 1fr))`,
          gridAutoFlow: "column",
        }}
        role="grid"
        aria-label="Trivia board"
      >
        {board.map((col) => (
          <BoardColumn
            key={col.id}
            col={col}
            teams={teams}
            rows={rows}
            compact={compact}
            onSelect={onSelect}
            canSelect={canSelect}
            activeCellId={activeCellId}
            hint={hint}
          />
        ))}
      </div>
    </div>
  );
}

// Sized from the board's own box; the floor keeps a phone-sized board legible.
const categorySize = "max(8.5px, min(calc(100cqh / (var(--rows) + 1.3) * 0.2), calc(100cqw / var(--cols) * 0.12)))";
const valueSize = "min(calc(100cqh / (var(--rows) + 1.3) * 0.46), calc(100cqw / var(--cols) * 0.27))";
// Four-digit values ("1,000") get a narrower allowance so they never touch the cell edge.
const wideValueSize = "min(calc(100cqh / (var(--rows) + 1.3) * 0.4), calc(100cqw / var(--cols) * 0.2))";

function BoardColumn({
  col,
  teams,
  rows,
  compact,
  onSelect,
  canSelect,
  activeCellId,
  hint,
}: {
  col: ViewColumn;
  teams: TeamLite[];
  rows: number;
  compact?: boolean;
  onSelect?: (cellId: string) => void;
  canSelect?: boolean;
  activeCellId?: string | null;
  hint?: (cellId: string) => string | null;
}) {
  return (
    <>
      <div
        role="columnheader"
        lang="en"
        className={cn(
          "t-head t-category flex items-center justify-center rounded-[6px] px-[6%] text-center text-[var(--t-teal-ink)]",
          // On a phone, title case is narrower than capitals and hyphenates cleanly.
          compact && "!normal-case !tracking-normal",
        )}
        style={{ fontSize: categorySize, lineHeight: 1.1 }}
      >
        <span className="line-clamp-3 [hyphens:auto] [overflow-wrap:break-word]">{col.title || "—"}</span>
      </div>
      {Array.from({ length: rows }, (_, ri) => {
        const cell = col.cells[ri];
        if (!cell) return <div key={`empty-${ri}`} className="t-cell-used rounded-[6px]" />;
        const live = cell.playable && !cell.used;
        const selectable = live && canSelect && onSelect;
        const active = activeCellId === cell.id;
        const winner = cell.winnerTeamId ? teams.find((t) => t.id === cell.winnerTeamId) : undefined;
        const content = live ? (
          <span className="t-value" style={{ fontSize: cell.value >= 1000 ? wideValueSize : valueSize, lineHeight: 1 }}>
            {cell.value.toLocaleString("en-US")}
          </span>
        ) : winner ? (
          // Won cells take the team's colour, with its name so colour isn't the only signal.
          <span className="flex min-w-0 flex-col items-center px-[6%] text-center leading-tight text-[#0b1d20]">
            <span className="t-font max-w-full truncate font-extrabold" style={{ fontSize: categorySize }}>
              {winner.name}
            </span>
            <span className="t-font font-bold opacity-60" style={{ fontSize: `calc(${categorySize} * 0.85)` }}>
              {cell.value.toLocaleString("en-US")}
            </span>
          </span>
        ) : null;
        const base = cn(
          "flex items-center justify-center rounded-[6px] transition-[filter,transform] duration-150",
          live ? "t-cell" : winner ? "" : "t-cell-used",
          active && "ring-4 ring-[var(--t-teal-ink)] ring-offset-2",
        );
        const winnerStyle = winner ? { background: winner.color } : undefined;
        if (selectable) {
          return (
            <button
              key={cell.id}
              type="button"
              role="gridcell"
              onClick={() => onSelect(cell.id)}
              title={hint?.(cell.id) ?? undefined}
              aria-label={`${col.title} for ${cell.value}`}
              className={cn(base, "cursor-pointer hover:brightness-110 active:scale-[0.97]")}
            >
              {content}
            </button>
          );
        }
        return (
          <div
            key={cell.id}
            role="gridcell"
            aria-label={live ? `${col.title} for ${cell.value}` : winner ? `${col.title} ${cell.value}, won by ${winner.name}` : cell.used ? "Played" : "Empty"}
            className={base}
            style={winnerStyle}
          >
            {content}
          </div>
        );
      })}
    </>
  );
}
