"use client";

import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct, fmtQuarter, fmtQuarterShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Badge } from "@/components/ui";
import { computeAirlineValue, fleetCount } from "@/lib/engine";

export function TopBar() {
  const s = useGame();
  const player = selectPlayer(s);

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);

  return (
    <header className="pointer-events-none fixed top-3 left-3 right-3 z-40">
      <div className="pointer-events-auto flex items-center gap-6 px-4 py-2.5 rounded-xl border border-line bg-surface/90 backdrop-blur shadow-[var(--shadow-2)]">
        {/* Airline identity */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="inline-block w-8 h-8 rounded-md flex items-center justify-center font-mono text-[0.6875rem] font-semibold text-primary-fg"
            style={{ background: player.color }}
          >
            {player.code}
          </span>
          <div className="min-w-0">
            <div className="font-display text-[1.125rem] text-ink leading-none truncate">
              {player.name}
            </div>
            <div className="text-[0.6875rem] text-ink-muted uppercase tracking-wider mt-0.5 truncate">
              Hub {player.hubCode} · {s.teams.length} airlines competing
            </div>
          </div>
        </div>

        <div className="flex-1 hidden md:block" />

        {/* Key metrics */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <Kpi label="Cash" value={fmtMoney(player.cashUsd)} emphasize />
          <Kpi label="Debt" value={fmtMoney(player.totalDebtUsd)} />
          <Kpi label="Airline Value" value={fmtMoney(airlineValue)} />
          <Kpi label="Brand Value" value={player.brandValue.toFixed(1)} emphasize />
          <Kpi label="Loyalty" value={fmtPct(player.customerLoyaltyPct, 0)} />
        </div>

        <div className="hidden md:block w-px h-8 bg-line" />

        {/* Quarter block */}
        <div className="hidden md:flex flex-col items-end">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            {fmtQuarter(s.currentQuarter)}
          </div>
          <div className="flex items-baseline gap-2 mt-0.5">
            <span className="font-display text-[1.125rem] text-ink">
              {fmtQuarterShort(s.currentQuarter)}
            </span>
            <Badge tone="accent">Command</Badge>
          </div>
        </div>
      </div>
    </header>
  );
}

function Kpi({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-start px-3 py-1.5 rounded-md",
        emphasize && "bg-surface-2",
      )}
    >
      <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className="tabular font-display text-[1rem] leading-none text-ink mt-0.5">
        {value}
      </span>
    </div>
  );
}
