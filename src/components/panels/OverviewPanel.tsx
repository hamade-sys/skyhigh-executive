"use client";

import { Badge, Button, Metric, Sparkline } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { NEWS_BY_QUARTER } from "@/data/world-news";
import { computeAirlineValue, fleetCount } from "@/lib/engine";
import { DOCTRINE_BY_ID } from "@/data/doctrines";
import { useUi, type PanelId } from "@/store/ui";

export function OverviewPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const openPanel = useUi((u) => u.openPanel);

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
  const loyaltySeries = history.map((q) => q.loyalty);

  const pendingDecisions = (SCENARIOS_BY_QUARTER[s.currentQuarter] ?? []).filter(
    (sc) =>
      !player.decisions.some(
        (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
      ),
  );
  const todayNews = NEWS_BY_QUARTER[s.currentQuarter] ?? [];

  const onOpen = (id: PanelId) => openPanel(id);

  return (
    <div className="space-y-5">
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
            label="Brand value"
            value={player.brandValue.toFixed(1)}
            series={bvSeries}
            color="var(--accent)"
          />
          <Metric label="Brand pts" value={player.brandPts.toFixed(0)} />
          <MetricWithSpark
            label="Loyalty"
            value={fmtPct(player.customerLoyaltyPct, 0)}
            series={loyaltySeries}
            color="var(--info)"
          />
          <Metric label="Ops pts" value={player.opsPts.toFixed(0)} />
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

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            World news · Q{s.currentQuarter}
          </div>
          <button
            className="text-[0.75rem] text-ink-muted hover:text-ink"
            onClick={() => onOpen("news")}
          >
            All {todayNews.length} →
          </button>
        </div>
        <div className="space-y-3">
          {todayNews.slice(0, 3).map((n) => (
            <div key={n.id} className="flex gap-3 items-start">
              <span className="text-[1rem] text-ink-muted mt-0.5 w-5">{n.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge tone={newsTone(n.impact)}>{n.impact.toUpperCase()}</Badge>
                </div>
                <div className="text-[0.8125rem] text-ink font-medium leading-snug">
                  {n.headline}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

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

      {/* Milestones */}
      {player.milestones && player.milestones.length > 0 && (
        <div>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Milestones earned
          </div>
          <div className="flex flex-wrap gap-1.5">
            {player.milestones.map((m) => (
              <Badge key={m} tone="accent">{m}</Badge>
            ))}
          </div>
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

function newsTone(
  impact: string,
): "neutral" | "primary" | "accent" | "positive" | "negative" | "warning" | "info" {
  switch (impact) {
    case "tourism": return "accent";
    case "business": return "primary";
    case "cargo": return "positive";
    case "brand": return "info";
    case "fuel": return "warning";
    case "ops": return "negative";
    default: return "neutral";
  }
}
