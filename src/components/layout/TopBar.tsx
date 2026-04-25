"use client";

import { useState } from "react";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { fmtMoney, fmtQuarter, fmtQuarterShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { computeAirlineValue, brandRating } from "@/lib/engine";
import { QuarterTimerChip } from "@/components/game/QuarterTimer";
import { HelpModal } from "@/components/game/HelpModal";
import { NotificationCenter } from "@/components/game/NotificationCenter";
import { Button } from "@/components/ui";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { HelpCircle, Trophy } from "lucide-react";

export function TopBar() {
  // Fine-grained subscriptions so unrelated store writes don't re-render this.
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((state) => state.currentQuarter);
  const [helpOpen, setHelpOpen] = useState(false);

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);

  return (
    <header
      className={cn(
        // z-[60] — highest of the chrome stack. Panel + Rail are both z-50;
        // the topbar must stay above them so the airline identity, KPI strip,
        // and Next-Quarter button are never covered.
        "fixed top-0 left-0 right-0 h-14 z-[60]",
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
        <Kpi label="Airline value" value={fmtMoney(airlineValue)} emphasize />
        <Divider />
        <Kpi label="Brand rating" value={brandRating(player).grade} />
        {/* Loyalty is internal; brand rating is the player-facing summary. */}
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

      {/* Quarter + timer + Close-quarter CTA */}
      <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-line h-full">
        <div className="hidden md:flex flex-col items-end leading-tight">
          {/* Larger date label up top, "Round X of 20" beneath. */}
          <span className="font-display text-[1.0625rem] text-ink">
            {fmtQuarter(currentQuarter)}
          </span>
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mt-0.5 tabular">
            {fmtQuarterShort(currentQuarter)}
          </span>
        </div>
        <QuarterTimerChip />
        <LeaderboardButton />
        <NotificationCenter />
        <button
          onClick={() => setHelpOpen(true)}
          aria-label="Help &amp; reference"
          title="Quick reference (cheat sheet)"
          className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors"
        >
          <HelpCircle size={16} />
        </button>
        <CloseQuarterButton />
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}

function LeaderboardButton() {
  const openPanel = useUi((u) => u.openPanel);
  const currentPanel = useUi((u) => u.panel);
  const isOpen = currentPanel === "leaderboard";
  return (
    <button
      onClick={() => openPanel("leaderboard")}
      aria-label="Leaderboard"
      title="Leaderboard"
      className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
        isOpen
          ? "bg-surface-hover text-ink"
          : "text-ink-muted hover:text-ink hover:bg-surface-hover",
      )}
    >
      <Trophy size={16} />
    </button>
  );
}

function CloseQuarterButton() {
  const closeQuarter = useGame((s) => s.closeQuarter);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const player = useGame(selectPlayer);
  if (!player) return null;

  const pending = (SCENARIOS_BY_QUARTER[currentQuarter] ?? []).filter(
    (sc) => !player.decisions.some((d) => d.scenarioId === sc.id && d.quarter === currentQuarter),
  );

  function onClick() {
    if (pending.length > 0) {
      const go = confirm(
        `${pending.length} board decision${pending.length > 1 ? "s" : ""} still open this quarter. Close anyway?`,
      );
      if (!go) return;
    }
    closeQuarter();
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={onClick}
      title="Lock decisions + run quarter close. In multi-team play this signals 'I'm ready' — the round advances when all teams (or admin) confirm."
    >
      Next Quarter →
    </Button>
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
