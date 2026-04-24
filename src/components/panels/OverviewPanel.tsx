"use client";

import { Badge, Button, Metric } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { NEWS_BY_QUARTER } from "@/data/world-news";
import { computeAirlineValue, fleetCount } from "@/lib/engine";
import { DOCTRINE_BY_ID } from "@/data/doctrines";
import { useRouter, useSearchParams } from "next/navigation";

export function OverviewPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const router = useRouter();
  const params = useSearchParams();

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const totalRevenueLast = player.financialsByQuarter.at(-1)?.revenue ?? 0;
  const prevRevenue = player.financialsByQuarter.at(-2)?.revenue ?? 0;
  const revenueDelta =
    prevRevenue > 0 ? ((totalRevenueLast - prevRevenue) / prevRevenue) * 100 : 0;

  const pendingDecisions = (SCENARIOS_BY_QUARTER[s.currentQuarter] ?? []).filter(
    (sc) =>
      !player.decisions.some(
        (d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter,
      ),
  );
  const todayNews = NEWS_BY_QUARTER[s.currentQuarter] ?? [];

  function openPanel(id: string) {
    const sp = new URLSearchParams(params.toString());
    sp.set("panel", id);
    router.push(`/?${sp.toString()}`);
  }

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
          <Metric label="Cash" value={fmtMoney(player.cashUsd)} />
          <Metric label="Debt" value={fmtMoney(player.totalDebtUsd)} />
          <Metric label="Airline value" value={fmtMoney(airlineValue)} />
          <Metric
            label="Revenue last Q"
            value={fmtMoney(totalRevenueLast)}
            delta={
              revenueDelta !== 0
                ? {
                    value: revenueDelta,
                    format: (n) =>
                      `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`,
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
          <Metric label="Brand value" value={player.brandValue.toFixed(1)} />
          <Metric label="Brand pts" value={player.brandPts.toFixed(0)} />
          <Metric label="Loyalty" value={fmtPct(player.customerLoyaltyPct, 0)} />
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
                onClick={() => openPanel("decisions")}
              >
                {pendingDecisions.length} board decision
                {pendingDecisions.length > 1 ? "s" : ""} open
              </button>
            </li>
          )}
          <li>
            <button
              className="text-ink-2 hover:underline"
              onClick={() => openPanel("ops")}
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
            onClick={() => openPanel("news")}
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
        onClick={() => openPanel("ops")}
      >
        Open Ops form →
      </Button>
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
