"use client";

import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct, fmtQuarter, fmtQuarterShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { computeAirlineValue } from "@/lib/engine";
import { QuarterTimerChip } from "@/components/game/QuarterTimer";

export function TopBar() {
  // Fine-grained subscriptions so unrelated store writes don't re-render this.
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((state) => state.currentQuarter);

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 h-14 z-40",
        "flex items-center gap-5 pl-4 pr-4",
        "border-b border-line bg-surface/85 backdrop-blur-md",
      )}
    >
      {/* Brand + airline identity */}
      <div className="flex items-center gap-3 min-w-0 shrink-0 pr-4 mr-0.5 border-r border-line h-full">
        <span
          className="inline-flex w-8 h-8 rounded-md items-center justify-center font-mono text-[0.6875rem] font-semibold text-primary-fg shadow-[var(--shadow-1)]"
          style={{ background: player.color }}
          title={player.name}
        >
          {player.code}
        </span>
        <div className="min-w-0 hidden md:block">
          <div className="font-display text-[1rem] text-ink leading-none truncate">
            {player.name}
          </div>
          <div className="text-[0.625rem] text-ink-muted uppercase tracking-wider mt-1 truncate font-medium">
            Hub {player.hubCode}
            {player.secondaryHubCodes.length > 0 &&
              ` +${player.secondaryHubCodes.length}`}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0">
        <Kpi label="Cash" value={fmtMoney(player.cashUsd)} emphasize />
        <Divider />
        <Kpi
          label="Debt"
          value={fmtMoney(player.totalDebtUsd)}
          tone={player.totalDebtUsd > 0 ? "neg" : undefined}
        />
        <Divider />
        <Kpi label="Airline value" value={fmtMoney(airlineValue)} />
        <Divider />
        <Kpi label="Brand value" value={player.brandValue.toFixed(1)} emphasize />
        <Divider />
        <Kpi label="Loyalty" value={fmtPct(player.customerLoyaltyPct, 0)} />
        {player.rcfBalanceUsd > 0 && (
          <>
            <Divider />
            <Kpi
              label="RCF drawn"
              value={fmtMoney(player.rcfBalanceUsd)}
              tone="warn"
            />
          </>
        )}
      </div>

      {/* Quarter + timer */}
      <div className="flex items-center gap-4 shrink-0 pl-4 border-l border-line h-full">
        <div className="hidden md:flex flex-col items-end leading-tight">
          <span className="font-display text-[1rem] text-ink">
            {fmtQuarterShort(currentQuarter)}
          </span>
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mt-0.5 tabular">
            {fmtQuarter(currentQuarter)}
          </span>
        </div>
        <QuarterTimerChip />
      </div>
    </header>
  );
}

function Kpi({
  label,
  value,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "neg" | "warn";
}) {
  return (
    <div className="flex flex-col items-start px-4 py-1 min-w-[7.5rem] shrink-0">
      <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-medium">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-display text-[1rem] leading-none mt-1",
          tone === "neg"
            ? "text-negative"
            : tone === "warn"
              ? "text-warning"
              : emphasize
                ? "text-ink"
                : "text-ink-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-line shrink-0" aria-hidden />;
}
