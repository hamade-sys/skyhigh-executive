"use client";

import { useState } from "react";
import { Badge, Button, Metric, Sparkline } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { computeAirlineValue, fleetCount, brandRating, computeBrandValueBreakdown } from "@/lib/engine";
import { DOCTRINE_BY_ID } from "@/data/doctrines";
import { useUi, type PanelId } from "@/store/ui";
import { SecondaryHubModal } from "@/components/game/SecondaryHubModal";
import { HubInvestmentsModal } from "@/components/game/HubInvestmentsModal";
import { Plus, MapPin, Award, Lock, Layers } from "lucide-react";
import { MILESTONES } from "@/data/milestones";
import { cn } from "@/lib/cn";

export function OverviewPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const openPanel = useUi((u) => u.openPanel);
  const [hubModalOpen, setHubModalOpen] = useState(false);
  const [hubInvestmentsOpen, setHubInvestmentsOpen] = useState(false);

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const totalRevenueLast = player.financialsByQuarter.at(-1)?.revenue ?? 0;
  const prevRevenue = player.financialsByQuarter.at(-2)?.revenue ?? 0;
  const revenueDelta =
    prevRevenue > 0 ? ((totalRevenueLast - prevRevenue) / prevRevenue) * 100 : 0;

  // Sparkline history (PRD §19.4) — last 8 quarters
  const history = player.financialsByQuarter.slice(-8);
  const bvSeries = history.map((q) => q.brandValue);
  const cashSeries = history.map((q) => q.cash);
  const revenueSeries = history.map((q) => q.revenue);
  // loyaltySeries removed — loyalty is internal-only per PRD update.

  const pendingDecisions = (SCENARIOS_BY_QUARTER[s.currentQuarter] ?? []).filter(
    (sc) =>
      !player.decisions.some(
        (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
      ),
  );

  const onOpen = (id: PanelId) => openPanel(id);

  // ─── Executive 3-card layout (recommendation #5) ─────────────
  // Replaces the metric dump that used to lead the panel. Three
  // status cards at the top: Cash risk / Network health / Board
  // attention. Each card has a single action button, traffic-light
  // colour, and a 1-line summary of "what's the worst thing here".
  // Detailed metrics + insights still live below for power users.
  const totalQuarterlyDirectCosts = activeRoutes.reduce(
    (s2, r) => s2 + (r.quarterlyFuelCost ?? 0) + (r.quarterlySlotCost ?? 0), 0,
  );
  const cashStatus: "ok" | "warn" | "danger" =
    player.cashUsd <= 0 ? "danger"
    : totalQuarterlyDirectCosts > 0 && player.cashUsd < totalQuarterlyDirectCosts * 1.5 ? "warn"
    : "ok";

  const profitableRoutes = activeRoutes.filter((r) => {
    const profit = (r.quarterlyRevenue ?? 0) - (r.quarterlyFuelCost ?? 0) - (r.quarterlySlotCost ?? 0);
    return profit > 0;
  });
  const profitablePct = activeRoutes.length > 0
    ? (profitableRoutes.length / activeRoutes.length) * 100
    : 100;
  const avgOcc = activeRoutes.length > 0
    ? activeRoutes.reduce((s2, r) => s2 + r.avgOccupancy, 0) / activeRoutes.length
    : 0;
  const losingRoutes = activeRoutes.filter((r) => (r.consecutiveLosingQuarters ?? 0) >= 2);
  const dormantRoutes = activeRoutes.filter((r) =>
    r.aircraftIds.length === 0 ||
    !r.aircraftIds.some((id) => player.fleet.find((f) => f.id === id && f.status === "active")),
  );
  const networkStatus: "ok" | "warn" | "danger" =
    activeRoutes.length === 0 ? "warn"
    : losingRoutes.length >= 3 || profitablePct < 40 ? "danger"
    : losingRoutes.length > 0 || avgOcc < 0.55 ? "warn"
    : "ok";

  const boardAttentionCount = pendingDecisions.length + losingRoutes.length + dormantRoutes.length;
  const boardStatus: "ok" | "warn" | "danger" =
    boardAttentionCount === 0 ? "ok"
    : pendingDecisions.length > 0 || dormantRoutes.length > 0 ? "warn"
    : "warn";

  return (
    <div className="space-y-5">
      {/* Executive 3-card status row — leads the panel. */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <ExecCard
          label="Cash risk"
          status={cashStatus}
          headline={fmtMoney(player.cashUsd)}
          detail={
            cashStatus === "ok"
              ? "Buffer healthy vs quarterly direct costs."
              : cashStatus === "warn"
                ? `Below 1.5× direct costs (${fmtMoney(totalQuarterlyDirectCosts)}/Q)`
                : "Cash position negative."
          }
          ctaLabel="Open Reports"
          onCta={() => onOpen("reports")}
        />
        <ExecCard
          label="Network health"
          status={networkStatus}
          headline={`${profitableRoutes.length} of ${activeRoutes.length} routes profitable`}
          detail={
            activeRoutes.length === 0
              ? "No active routes yet."
              : `${(profitablePct).toFixed(0)}% profit-positive · ${(avgOcc * 100).toFixed(0)}% avg occupancy`
          }
          ctaLabel="Review routes"
          onCta={() => onOpen("routes")}
        />
        <ExecCard
          label="Board attention"
          status={boardStatus}
          headline={
            boardAttentionCount === 0
              ? "All clear"
              : `${boardAttentionCount} item${boardAttentionCount === 1 ? "" : "s"}`
          }
          detail={
            boardAttentionCount === 0
              ? "No decisions, dormant routes, or chronic losers."
              : [
                  pendingDecisions.length > 0 ? `${pendingDecisions.length} decision${pendingDecisions.length === 1 ? "" : "s"} pending` : null,
                  dormantRoutes.length > 0 ? `${dormantRoutes.length} dormant route${dormantRoutes.length === 1 ? "" : "s"}` : null,
                  losingRoutes.length > 0 ? `${losingRoutes.length} losing 2Q+` : null,
                ].filter(Boolean).join(" · ")
          }
          ctaLabel={pendingDecisions.length > 0 ? "Open Decisions" : "Review routes"}
          onCta={() => onOpen(pendingDecisions.length > 0 ? "decisions" : "routes")}
        />
      </div>

      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Airline
        </div>
        <div className="flex items-center gap-3">
          <span
            className="inline-block w-9 h-9 rounded-md flex items-center justify-center font-mono text-[0.75rem] font-semibold text-primary-fg"
            style={{ background: player.color }}
          >
            {player.code}
          </span>
          <div>
            <div className="font-display text-[1.25rem] text-ink leading-tight">
              {player.name}
            </div>
            <div className="text-[0.8125rem] text-ink-muted">
              {DOCTRINE_BY_ID[player.doctrine].name} · Hub {player.hubCode}
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Financial health
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MetricWithSpark label="Cash" value={fmtMoney(player.cashUsd)} series={cashSeries} />
          <Metric label="Debt" value={fmtMoney(player.totalDebtUsd)} />
          <Metric label="Airline value" value={fmtMoney(airlineValue)} />
          <MetricWithSpark
            label="Revenue last Q"
            value={fmtMoney(totalRevenueLast)}
            series={revenueSeries}
            delta={
              revenueDelta !== 0
                ? {
                    value: revenueDelta,
                    format: (n) => `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`,
                  }
                : undefined
            }
          />
        </div>
      </div>

      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Brand health
        </div>
        <div className="grid grid-cols-2 gap-4">
          <MetricWithSpark
            label="Brand rating"
            value={brandRating(player).grade}
            series={bvSeries}
            color="var(--accent)"
          />
          <Metric label="Brand pts" value={player.brandPts.toFixed(0)} />
          <Metric label="Ops pts" value={player.opsPts.toFixed(0)} />
        </div>
        <BrandValueBreakdown player={player} />
      </div>

      {/* Network — primary + secondary hubs (PRD §4.4) */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Network
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setHubInvestmentsOpen(true)}
              className="text-[0.6875rem] uppercase tracking-wider text-accent font-semibold hover:underline flex items-center gap-1"
            >
              <Layers size={11} /> Invest
            </button>
            <button
              onClick={() => setHubModalOpen(true)}
              disabled={s.currentQuarter < 3}
              title={s.currentQuarter < 3 ? "Secondary hubs unlock Q3" : undefined}
              className="text-[0.6875rem] uppercase tracking-wider text-accent font-semibold hover:underline disabled:text-ink-muted disabled:no-underline disabled:cursor-not-allowed flex items-center gap-1"
            >
              <Plus size={11} /> Add secondary
            </button>
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface p-3">
          <div className="flex flex-wrap gap-1.5 items-center">
            <span
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-primary-fg text-[0.75rem] font-mono font-semibold"
              style={{ background: player.color }}
            >
              <MapPin size={11} /> HUB · {player.hubCode}
            </span>
            {player.secondaryHubCodes.map((code) => (
              <span
                key={code}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed text-[0.75rem] font-mono font-semibold"
                style={{ borderColor: player.color, color: player.color }}
              >
                HUB·2 · {code}
              </span>
            ))}
            {player.secondaryHubCodes.length === 0 && (
              <span className="text-[0.75rem] text-ink-muted italic">
                {s.currentQuarter < 3
                  ? "Secondary hubs unlock Q3"
                  : "No secondary hubs yet — expand to break the spoke-only constraint."}
              </span>
            )}
          </div>
          {/* Hub investments summary */}
          {(() => {
            const inv = player.hubInvestments;
            const lines: string[] = [];
            if (inv.fuelReserveTankHubs.length > 0)
              lines.push(`⛽ ${inv.fuelReserveTankHubs.length} fuel tank${inv.fuelReserveTankHubs.length > 1 ? "s" : ""}`);
            if (inv.maintenanceDepotHubs.length > 0)
              lines.push(`🔧 ${inv.maintenanceDepotHubs.length} depot${inv.maintenanceDepotHubs.length > 1 ? "s" : ""}`);
            if (inv.premiumLoungeHubs.length > 0)
              lines.push(`🛋 ${inv.premiumLoungeHubs.length} lounge${inv.premiumLoungeHubs.length > 1 ? "s" : ""}`);
            if (inv.opsExpansionSlots > 0)
              lines.push(`+${inv.opsExpansionSlots} ops slots`);
            if (lines.length === 0) return null;
            return (
              <div className="mt-2 pt-2 border-t border-line text-[0.6875rem] text-ink-muted leading-relaxed">
                {lines.join(" · ")}
              </div>
            );
          })()}
        </div>
      </div>

      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Operations
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Metric label="Fleet" value={fleetCount(player.fleet)} />
          <Metric label="Routes" value={activeRoutes.length} />
          <Metric
            label="Avg occupancy"
            value={fmtPct(
              activeRoutes.length > 0
                ? (activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) /
                    activeRoutes.length) *
                    100
                : 0,
              0,
            )}
          />
          <Metric label="Fuel idx" value={s.fuelIndex.toFixed(0)} />
        </div>
      </div>

      <div className="rounded-md border border-line bg-surface-2 p-4">
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Pending this quarter
        </div>
        <ul className="space-y-1.5 text-[0.875rem]">
          {pendingDecisions.length > 0 && (
            <li>
              <button
                className="text-accent hover:underline"
                onClick={() => onOpen("decisions")}
              >
                {pendingDecisions.length} board decision
                {pendingDecisions.length > 1 ? "s" : ""} open
              </button>
            </li>
          )}
          <li>
            <button
              className="text-ink-2 hover:underline"
              onClick={() => onOpen("ops")}
            >
              Review quarterly ops sliders
            </button>
          </li>
          <li>
            {activeRoutes.length === 0 ? (
              <span className="text-ink-2">No routes yet — click any city on the map</span>
            ) : (
              <span className="text-ink-muted">
                {activeRoutes.length} route{activeRoutes.length > 1 ? "s" : ""} flying
              </span>
            )}
          </li>
        </ul>
      </div>

      {/* Strategic insights — live hints from current game state */}
      <StrategicInsights player={player} currentQuarter={s.currentQuarter} fuelIndex={s.fuelIndex} onOpen={onOpen} />


      {/* World news lives in the sidebar now (past + current quarter, by outlet). */}

      {/* Cargo contracts */}
      {s.cargoContracts.filter((c) => c.teamId === player.id).length > 0 && (
        <div className="rounded-md border border-[var(--positive-soft)] bg-[var(--positive-soft)]/30 p-3">
          <div className="text-[0.6875rem] uppercase tracking-wider text-positive mb-1">
            Active cargo contracts
          </div>
          <div className="space-y-1 text-[0.75rem]">
            {s.cargoContracts
              .filter((c) => c.teamId === player.id)
              .map((c) => (
                <div key={c.id} className="flex items-center justify-between text-ink-2">
                  <span className="font-mono text-ink">
                    {c.originCode} ↔ {c.destCode}
                  </span>
                  <span className="tabular">
                    {c.guaranteedTonnesPerWeek}T/wk · {c.quartersRemaining}Q · {c.source}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Milestones — earned + remaining (PRD E8.9) */}
      <div>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
            <Award size={11} /> Milestones
          </div>
          <span className="text-[0.6875rem] tabular font-mono text-ink-muted">
            {player.milestones.length} / {MILESTONES.length}
          </span>
        </div>
        <div className="rounded-md border border-line bg-surface overflow-hidden">
          {[...MILESTONES]
            .sort((a, b) => {
              const ae = player.milestones.includes(a.id) ? 1 : 0;
              const be = player.milestones.includes(b.id) ? 1 : 0;
              if (ae !== be) return be - ae;       // earned first
              return a.difficulty - b.difficulty;
            })
            .map((m) => {
              const earned = player.milestones.includes(m.id);
              return (
                <div
                  key={m.id}
                  className={cn(
                    "flex items-start gap-2.5 px-3 py-2 border-b border-line last:border-0",
                    earned ? "bg-[var(--positive-soft)]/40" : "",
                  )}
                >
                  <span className={cn(
                    "shrink-0 w-5 h-5 rounded-full flex items-center justify-center mt-0.5",
                    earned ? "bg-positive text-primary-fg" : "bg-surface-2 text-ink-muted border border-line",
                  )}>
                    {earned ? <Award size={11} /> : <Lock size={10} />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className={cn(
                        "text-[0.8125rem] font-semibold",
                        earned ? "text-ink" : "text-ink-2",
                      )}>
                        {m.title}
                      </span>
                      <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted shrink-0">
                        {m.category}
                      </span>
                    </div>
                    <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-0.5">
                      {earned ? m.description : m.hint}
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>

      {/* Profit-streak counter (visible if you've ever turned a profit) */}
      {player.consecutiveProfitableQuarters > 0 && (
        <div className="rounded-md border border-line bg-[var(--positive-soft)]/30 px-3 py-2 flex items-baseline justify-between">
          <span className="text-[0.6875rem] uppercase tracking-wider text-positive font-semibold">
            Profitability streak
          </span>
          <span className="text-[0.875rem] tabular font-mono text-positive font-bold">
            {player.consecutiveProfitableQuarters} Q
          </span>
        </div>
      )}

      {/* Labour Relations Score (PRD E8.3) */}
      <div className="rounded-md border border-line bg-surface-2/60 p-3">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Labour relations
          </div>
          <span className={`tabular font-mono text-[0.75rem] ${
            player.labourRelationsScore >= 75 ? "text-positive" :
            player.labourRelationsScore <= 30 ? "text-negative" : "text-ink-muted"
          }`}>
            {player.labourRelationsScore.toFixed(0)} / 100
          </span>
        </div>
        <div className="h-1.5 bg-line rounded-full overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${player.labourRelationsScore}%`,
              background: player.labourRelationsScore >= 75 ? "var(--positive)" :
                player.labourRelationsScore <= 30 ? "var(--negative)" : "var(--primary)",
            }}
          />
        </div>
        <div className="text-[0.6875rem] text-ink-muted mt-1.5 leading-relaxed">
          {player.labourRelationsScore >= 75
            ? "Strong rapport: +3% loyalty/Q, labour scenarios soften."
            : player.labourRelationsScore <= 30
              ? "Strained: strike risk higher on labour scenarios."
              : "Building over time via salary slider and people-first decisions."}
        </div>
      </div>

      {/* Fleet efficiency (PRD E8.7) */}
      {player.fleet.filter((f) => f.status === "active").length > 0 && (
        <div className="rounded-md border border-line bg-surface-2/60 p-3">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1">
            Fleet efficiency
          </div>
          {(() => {
            const active = player.fleet.filter((f) => f.status === "active");
            const burns: Record<string, number> = {
              A319: 3.2, A320: 3.4, A321: 3.8, "B737-700": 3.1, "B737-800": 3.3,
              "B757-200": 3.9, "B767-300ER": 4.8, "A330-200": 4.6,
              "B777-200ER": 5.2, "B747-400": 8.5, "A380-800": 11.0,
              "B787-9": 4.2, "A350-900": 4.0, A320neo: 2.8, "A220-300": 2.5,
              "B737-MAX-8": 2.9, "B777X-9": 5.0, A321XLR: 3.4,
              "B737-300F": 3.4, "B757-200F": 4.2, "B767-300F": 6.5, "B747-400F": 14.0,
            };
            const avg = active.reduce((sum, f) => {
              const fuelBurn = burns[f.specId] ?? 4.0;
              return sum + (f.ecoUpgrade ? fuelBurn * 0.9 : fuelBurn);
            }, 0) / active.length;
            // Market baseline = mean of all burns ~ 4.6 L/km (weighted to legacy fleet)
            const marketAvg = 4.6;
            const delta = avg - marketAvg;
            const better = delta < -0.1;
            const worse = delta > 0.1;
            return (
              <>
                <div className="flex items-baseline justify-between">
                  <span className="tabular font-display text-[1.25rem] text-ink">{avg.toFixed(2)}</span>
                  <span className="text-[0.75rem] text-ink-muted">L/km fleet avg</span>
                </div>
                <div className="flex items-baseline justify-between mt-1 text-[0.75rem]">
                  <span className="text-ink-muted">Market avg {marketAvg.toFixed(1)} L/km</span>
                  <span
                    className={`tabular font-mono ${
                      better ? "text-positive" : worse ? "text-negative" : "text-ink-muted"
                    }`}
                  >
                    {delta >= 0 ? "+" : ""}{delta.toFixed(2)}
                  </span>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Pending deferred events */}
      {player.deferredEvents && player.deferredEvents.filter((e) => !e.resolved).length > 0 && (
        <div>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Pending risk events
          </div>
          <div className="space-y-1.5">
            {player.deferredEvents
              .filter((e) => !e.resolved)
              .sort((a, b) => a.targetQuarter - b.targetQuarter)
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-baseline justify-between rounded-md border border-line bg-surface-2/60 px-3 py-2 text-[0.8125rem]"
                >
                  <div className="min-w-0">
                    <span className="font-mono text-primary text-[0.75rem] mr-2">{e.sourceScenario}</span>
                    <span className="text-ink-2">{e.noteAtQueue}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular font-mono text-[0.6875rem] text-ink">
                      Q{e.targetQuarter}
                    </span>
                    <Badge tone={e.probability >= 0.5 ? "negative" : "warning"}>
                      {Math.round(e.probability * 100)}%
                    </Badge>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      <Button
        className="w-full"
        variant="primary"
        onClick={() => onOpen("ops")}
      >
        Open Ops form →
      </Button>

      <SecondaryHubModal
        open={hubModalOpen}
        onClose={() => setHubModalOpen(false)}
      />
      <HubInvestmentsModal
        open={hubInvestmentsOpen}
        onClose={() => setHubInvestmentsOpen(false)}
      />
    </div>
  );
}

interface Insight {
  tone: "info" | "warn" | "neg" | "pos" | "accent";
  title: string;
  detail: string;
  action?: { label: string; onClick: () => void };
}

function StrategicInsights({
  player, currentQuarter, fuelIndex, onOpen,
}: {
  player: NonNullable<ReturnType<typeof selectPlayer>>;
  currentQuarter: number;
  fuelIndex: number;
  onOpen: (id: PanelId) => void;
}) {
  const insights: Insight[] = [];
  const activeRoutes = player.routes.filter((r) => r.status === "active");

  // 1. Idle cash sitting on the balance sheet
  if (player.cashUsd > 60_000_000 && currentQuarter > 4 && activeRoutes.length < 8) {
    insights.push({
      tone: "info",
      title: "Idle capital",
      detail: `${fmtMoney(player.cashUsd)} sitting in cash. Order aircraft, open routes, or invest in hub infrastructure.`,
      action: { label: "Open Fleet", onClick: () => onOpen("fleet") },
    });
  }

  // 2. Routes losing money
  const losingRoutes = activeRoutes.filter((r) => (r.consecutiveLosingQuarters ?? 0) >= 2);
  if (losingRoutes.length > 0) {
    insights.push({
      tone: "neg",
      title: `${losingRoutes.length} route${losingRoutes.length > 1 ? "s" : ""} losing money`,
      detail: "Reprice, suspend, or close. Two consecutive losing quarters signal a structural problem.",
      action: { label: "Review routes", onClick: () => onOpen("routes") },
    });
  }

  // 3. Low load factor
  const lowLoadRoutes = activeRoutes.filter((r) => r.avgOccupancy > 0 && r.avgOccupancy < 0.5);
  if (lowLoadRoutes.length >= 3) {
    insights.push({
      tone: "warn",
      title: `${lowLoadRoutes.length} routes under 50% occupancy`,
      detail: "Cut frequency or drop pricing tier to bring occupancy up. Empty seats burn fuel.",
      action: { label: "Review routes", onClick: () => onOpen("routes") },
    });
  }

  // 4. Fuel index high → consider hedging or fuel tank
  const hasHedge = player.flags.has("hedged_12m") || player.flags.has("hedged_6m") || player.flags.has("hedged_50_50");
  if (fuelIndex > 130 && !hasHedge) {
    insights.push({
      tone: "warn",
      title: `Fuel index ${Math.round(fuelIndex)}`,
      detail: "Fuel costs are elevated. Hub fuel reserve tanks give you a 5% discount per route — worth ~$8M.",
      action: { label: "Hub investments", onClick: () => onOpen("overview") },
    });
  }

  // 5. Brand below B grade with no scenarios pending
  if (player.brandPts < 40 && currentQuarter > 5) {
    insights.push({
      tone: "warn",
      title: "Brand strength low",
      detail: "Brand pts under 40 cap your airline-value multiplier. Push Marketing slider, take pro-brand scenario options.",
      action: { label: "Open Ops", onClick: () => onOpen("ops") },
    });
  }

  // 6. High debt + sliding cash
  if (player.totalDebtUsd > 120_000_000 && player.cashUsd < 30_000_000) {
    insights.push({
      tone: "neg",
      title: "Liquidity tight",
      detail: "Cash low while debt high. Refinance high-rate loans, sell low-utilisation aircraft, or pause fleet orders.",
      action: { label: "Open Financials", onClick: () => onOpen("financials") },
    });
  }

  // 7. (Loyalty-driven milestone hint suppressed per player-facing rules —
  //    loyalty is internal. The milestone still triggers when crossed.)

  // 8. Q3+ and no secondary hub yet
  if (currentQuarter >= 5 && player.secondaryHubCodes.length === 0 && activeRoutes.length >= 6) {
    insights.push({
      tone: "info",
      title: "Network bottleneck",
      detail: "All routes still spoke from your primary hub. Activating a secondary hub opens new origin/destination paths.",
    });
  }

  // 9. Crew strike risk
  if (player.labourRelationsScore <= 35) {
    insights.push({
      tone: "neg",
      title: "Strike risk elevated",
      detail: `Labour relations at ${player.labourRelationsScore.toFixed(0)}. Raise the salary slider or take pro-employee decisions before a wildcat hits.`,
      action: { label: "Open Ops", onClick: () => onOpen("ops") },
    });
  }

  if (insights.length === 0) return null;

  return (
    <div>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Strategic signals
      </div>
      <div className="space-y-1.5">
        {insights.slice(0, 4).map((i, idx) => {
          const cls =
            i.tone === "neg" ? "border-negative bg-[var(--negative-soft)] text-negative"
              : i.tone === "warn" ? "border-warning bg-[var(--warning-soft)] text-warning"
              : i.tone === "pos" ? "border-positive bg-[var(--positive-soft)] text-positive"
              : i.tone === "accent" ? "border-accent bg-[var(--accent-soft)] text-accent"
              : "border-info bg-[var(--info-soft)] text-info";
          return (
            <div key={idx} className={cn("rounded-md border px-3 py-2", cls)}>
              <div className="flex items-baseline justify-between gap-2 mb-0.5">
                <span className="text-[0.75rem] font-semibold uppercase tracking-wider">
                  {i.title}
                </span>
                {i.action && (
                  <button
                    onClick={i.action.onClick}
                    className="text-[0.6875rem] underline hover:no-underline shrink-0"
                  >
                    {i.action.label}
                  </button>
                )}
              </div>
              <div className="text-[0.75rem] text-ink-2 leading-relaxed">{i.detail}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BrandValueBreakdown({ player }: { player: Parameters<typeof computeBrandValueBreakdown>[0] }) {
  const b = computeBrandValueBreakdown(player);
  return (
    <details className="mt-3 rounded-md border border-line">
      <summary className="px-3 py-2 cursor-pointer text-[0.6875rem] uppercase tracking-wider font-semibold text-ink-2 hover:bg-surface-hover flex items-center justify-between">
        <span>Brand Value formula</span>
        <span className="tabular font-mono text-ink">{b.composite.toFixed(1)}</span>
      </summary>
      <div className="p-3 space-y-3 border-t border-line">
        <BrandSection
          title="Financial health · 35%"
          composite={b.financialHealth}
          rows={[
            { label: "Cash ratio", value: b.cashRatio, weight: 30 },
            { label: "Debt ratio score", value: b.debtRatioScore, weight: 35 },
            { label: "Revenue growth", value: b.revGrowth, weight: 35 },
          ]}
        />
        <BrandSection
          title="Brand health · 50%"
          composite={b.brandHealth}
          rows={[
            { label: "Brand pts score", value: b.brandPtsScore, weight: 40 },
            // Customer loyalty (35%) is computed internally and rolls
            // straight into the brand-health composite. Hidden from the
            // surface — the brand grade is the player-facing summary.
            { label: "Reputation events", value: b.reputationEvents, weight: 25 },
          ]}
        />
        <BrandSection
          title="Operations health · 15%"
          composite={b.operationsHealth}
          rows={[
            { label: "Ops pts score", value: b.opsPtsScore, weight: 40 },
            { label: "Fleet efficiency", value: b.fleetEfficiency, weight: 35 },
            { label: "Staff commitment", value: b.staffCommitment, weight: 25 },
          ]}
        />
      </div>
    </details>
  );
}

function BrandSection({
  title, composite, rows,
}: {
  title: string;
  composite: number;
  rows: Array<{ label: string; value: number; weight: number }>;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
          {title}
        </span>
        <span className="text-[0.875rem] tabular font-mono font-semibold text-ink">
          {composite.toFixed(1)}
        </span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => {
          const pct = Math.max(0, Math.min(100, r.value));
          return (
            <div key={r.label} className="flex items-center gap-2 text-[0.6875rem]">
              <span className="text-ink-2 w-32 shrink-0">{r.label}</span>
              <div className="flex-1 h-1 rounded-full bg-surface-2 overflow-hidden">
                <div
                  className="h-full bg-primary"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="tabular font-mono text-ink w-10 text-right">
                {r.value.toFixed(0)}
              </span>
              <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted w-8 text-right">
                {r.weight}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricWithSpark({
  label,
  value,
  series,
  color,
  delta,
}: {
  label: string;
  value: React.ReactNode;
  series: number[];
  color?: string;
  delta?: { value: number; format?: (n: number) => string };
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="text-[0.6875rem] font-medium uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="flex items-end justify-between gap-2">
        <span className="tabular font-display text-[1.5rem] leading-none text-ink">
          {value}
        </span>
        {series.length >= 2 && (
          <Sparkline values={series} color={color ?? "var(--accent)"} width={64} height={24} />
        )}
      </div>
      {delta && (
        <span
          className={`tabular text-[0.75rem] font-medium ${
            delta.value > 0 ? "text-positive" : delta.value < 0 ? "text-negative" : "text-ink-muted"
          }`}
        >
          {(delta.format ?? ((n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`))(delta.value)}
        </span>
      )}
    </div>
  );
}

/** Executive status card — used for the 3-card row at the top of
 *  OverviewPanel. Each card has a coloured left border (traffic-light
 *  status), a small label, a hero number/phrase, a one-line detail,
 *  and a single action button. Recommendation #5: lead the Overview
 *  with action-oriented status, not a metric dump. */
function ExecCard({
  label, status, headline, detail, ctaLabel, onCta,
}: {
  label: string;
  status: "ok" | "warn" | "danger";
  headline: string;
  detail: string;
  ctaLabel: string;
  onCta: () => void;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-surface p-4 flex flex-col gap-3 relative overflow-hidden",
        status === "ok" && "border-line",
        status === "warn" && "border-warning/40 bg-[var(--warning-soft)]/30",
        status === "danger" && "border-negative/50 bg-[var(--negative-soft)]/30",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
          {label}
        </span>
        <span
          className={cn(
            "text-[0.5625rem] uppercase tracking-wider font-bold rounded px-1.5 py-0.5",
            status === "ok" && "text-positive bg-[var(--positive-soft)]",
            status === "warn" && "text-warning bg-[var(--warning-soft)]",
            status === "danger" && "text-negative bg-[var(--negative-soft)]",
          )}
        >
          {status === "ok" ? "Healthy" : status === "warn" ? "Watch" : "Action"}
        </span>
      </div>
      <div>
        <div className="font-display text-[1.5rem] tabular text-ink leading-none">
          {headline}
        </div>
        <div className="text-[0.75rem] text-ink-muted leading-relaxed mt-1.5">
          {detail}
        </div>
      </div>
      <Button
        size="sm"
        variant={status === "ok" ? "ghost" : "primary"}
        onClick={onCta}
        className="self-start mt-auto"
      >
        {ctaLabel} →
      </Button>
    </div>
  );
}

