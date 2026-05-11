"use client";

/**
 * MultiAirlineAnalytics — endgame analytics block with toggleable
 * metrics across all teams, plotted quarter-by-quarter.
 *
 * Supports nine metrics: Brand value, Cash, Revenue, Net profit,
 * Cumulative profit, Operating margin, Customer loyalty, Rank
 * trajectory, and Airline value.
 *
 * When a cohort has more teams than MAX_CHART_LINES, the chart draws
 * only the top N lines (by final metric value) at full opacity and
 * fades the rest — the room can still read who pulled ahead without
 * the chart becoming a spaghetti of 40 overlapping lines. A toggle
 * reveals all lines when needed.
 *
 * The legend caps at MAX_LEGEND_ROWS and shows "+N more" overflow so
 * it never pushes the chart off-screen.
 */

import { useMemo, useState } from "react";
import { fmtMoney, fmtPct, fmtQuarter } from "@/lib/format";
import {
  airlineColorFor,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { cn } from "@/lib/cn";

export interface AnalyticsTeam {
  id: string;
  name: string;
  code: string;
  color: string;
  airlineColorId?: AirlineColorId | null;
  financialsByQuarter: Array<{
    quarter: number;
    cash: number;
    debt: number;
    revenue: number;
    netProfit: number;
    brandValue: number;
    loyalty?: number;
    rank?: number;
    airlineValue?: number;
  }>;
}

type MetricKey =
  | "brandValue"
  | "cash"
  | "revenue"
  | "netProfit"
  | "cumulativeProfit"
  | "operatingMargin"
  | "loyalty"
  | "rank"
  | "airlineValue";

interface MetricConfig {
  key: MetricKey;
  label: string;
  description: string;
  format: (n: number) => string;
  invertY?: boolean;
  compute: (
    q: AnalyticsTeam["financialsByQuarter"][number],
    history: AnalyticsTeam["financialsByQuarter"],
  ) => number | null;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: "brandValue",
    label: "Brand Value",
    description: "Composite brand health (0–100).",
    format: (n) => n.toFixed(1),
    compute: (q) => q.brandValue,
  },
  {
    key: "cash",
    label: "Cash",
    description: "End-of-quarter cash position.",
    format: (n) => fmtMoney(n),
    compute: (q) => q.cash,
  },
  {
    key: "revenue",
    label: "Revenue",
    description: "Quarterly revenue.",
    format: (n) => fmtMoney(n),
    compute: (q) => q.revenue,
  },
  {
    key: "netProfit",
    label: "Net profit",
    description: "Quarterly net profit (revenue − costs − interest − tax).",
    format: (n) => fmtMoney(n),
    compute: (q) => q.netProfit,
  },
  {
    key: "cumulativeProfit",
    label: "Cumulative profit",
    description: "Running sum of net profit across the campaign.",
    format: (n) => fmtMoney(n),
    compute: (q, history) => {
      let sum = 0;
      for (const row of history) {
        if (row.quarter > q.quarter) break;
        sum += row.netProfit;
      }
      return sum;
    },
  },
  {
    key: "operatingMargin",
    label: "Operating margin",
    description: "Net profit ÷ revenue, per quarter.",
    format: (n) => fmtPct(n, 1),
    compute: (q) => (q.revenue > 0 ? (q.netProfit / q.revenue) * 100 : null),
  },
  {
    key: "loyalty",
    label: "Customer loyalty",
    description: "Customer loyalty %.",
    format: (n) => fmtPct(n, 0),
    compute: (q) => q.loyalty ?? null,
  },
  {
    key: "rank",
    label: "Rank trajectory",
    description: "Leaderboard position quarter by quarter (1 is best).",
    format: (n) => `#${Math.round(n)}`,
    invertY: true,
    compute: (q) => q.rank ?? null,
  },
  {
    key: "airlineValue",
    label: "Airline value",
    description: "Cash − debt + 1M × brand value.",
    format: (n) => fmtMoney(n),
    compute: (q) =>
      q.airlineValue != null
        ? q.airlineValue
        : q.cash - q.debt + q.brandValue * 1_000_000,
  },
];

// How many teams to draw at full opacity before fading the rest.
const MAX_CHART_LINES = 8;
// How many legend rows to show before "+N more" overflow.
const MAX_LEGEND_ROWS = 10;

export function MultiAirlineAnalytics({
  teams,
  totalRounds,
  defaultMetric = "brandValue",
  highlightTeamIds,
}: {
  teams: AnalyticsTeam[];
  totalRounds: number;
  defaultMetric?: MetricKey;
  /** When provided, these teams are always shown at full opacity and
   *  listed first in the legend — useful for emphasising winner/runner-up. */
  highlightTeamIds?: string[];
}) {
  const [metric, setMetric] = useState<MetricKey>(defaultMetric);
  const [hoverQuarter, setHoverQuarter] = useState<number | null>(null);
  const [showAllLines, setShowAllLines] = useState(false);

  const config = METRIC_CONFIGS.find((m) => m.key === metric)!;

  // Build (team, points) pairs for every team.
  const series = useMemo(() => {
    return teams.map((t) => {
      const points: Array<{ q: number; v: number }> = [];
      for (const f of t.financialsByQuarter) {
        const v = config.compute(f, t.financialsByQuarter);
        if (v != null && Number.isFinite(v)) {
          points.push({ q: f.quarter, v });
        }
      }
      return { team: t, points };
    });
  }, [teams, config]);

  // Sort by final value — best first (or worst-first for inverted metrics).
  const seriesSorted = useMemo(() => {
    return [...series].sort((a, b) => {
      const lastA = a.points[a.points.length - 1]?.v ?? 0;
      const lastB = b.points[b.points.length - 1]?.v ?? 0;
      return config.invertY ? lastA - lastB : lastB - lastA;
    });
  }, [series, config.invertY]);

  // Which team IDs are "prominent" — shown at full opacity and drawn last
  // (on top). Priority: explicitly highlighted > top MAX_CHART_LINES by value.
  const prominentIds = useMemo(() => {
    const ids = new Set<string>(highlightTeamIds ?? []);
    for (const s of seriesSorted) {
      if (ids.size >= MAX_CHART_LINES) break;
      ids.add(s.team.id);
    }
    return ids;
  }, [seriesSorted, highlightTeamIds]);

  const allValues = series.flatMap((s) => s.points.map((p) => p.v));
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const yRangeRaw = yMax - yMin;
  const yPad = yRangeRaw === 0 ? Math.abs(yMax) * 0.1 || 1 : yRangeRaw * 0.05;
  const yLow = config.invertY ? yMax + yPad : yMin - yPad;
  const yHigh = config.invertY ? yMin - yPad : yMax + yPad;
  const yRange = yHigh - yLow || 1;

  const W = 720;
  const H = 280;
  const padL = 64;
  const padR = 14;
  const padT = 16;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const xDivisor = Math.max(1, totalRounds - 1);
  const xPos = (q: number) => padL + ((q - 1) / xDivisor) * innerW;
  const yPos = (v: number) => padT + ((v - yLow) / yRange) * innerH;

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (frac) => yMin + (yMax - yMin) * (config.invertY ? 1 - frac : frac),
  );

  const xTicks = useMemo(() => {
    const tickCount = Math.min(7, Math.max(3, Math.round(totalRounds / 6)));
    const step = Math.max(1, Math.floor((totalRounds - 1) / (tickCount - 1)));
    const ticks: number[] = [];
    for (let q = 1; q <= totalRounds; q += step) ticks.push(q);
    if (ticks[ticks.length - 1] !== totalRounds) ticks.push(totalRounds);
    return ticks;
  }, [totalRounds]);

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    if (px < padL || px > W - padR) {
      setHoverQuarter(null);
      return;
    }
    const ratio = (px - padL) / innerW;
    const q = Math.round(1 + ratio * xDivisor);
    setHoverQuarter(Math.max(1, Math.min(totalRounds, q)));
  }

  const tooltipRows = useMemo(() => {
    if (hoverQuarter == null) return null;
    // Show only prominent teams in tooltip to avoid a 42-row popup.
    return seriesSorted
      .filter((s) => prominentIds.has(s.team.id))
      .map((s) => {
        const point = s.points.find((p) => p.q === hoverQuarter);
        return point ? { team: s.team, value: point.v } : null;
      })
      .filter((r): r is { team: AnalyticsTeam; value: number } => r !== null);
  }, [hoverQuarter, seriesSorted, prominentIds]);

  // Legend: highlight first, then remaining sorted by value, capped.
  const legendRows = useMemo(() => {
    const highlighted = seriesSorted.filter((s) =>
      (highlightTeamIds ?? []).includes(s.team.id),
    );
    const rest = seriesSorted.filter(
      (s) => !(highlightTeamIds ?? []).includes(s.team.id),
    );
    return [...highlighted, ...rest].map((s) => s.team);
  }, [seriesSorted, highlightTeamIds]);

  const legendVisible = legendRows.slice(0, MAX_LEGEND_ROWS);
  const legendOverflow = legendRows.length - legendVisible.length;

  // Determine which series to render faded vs. prominent. Faded series
  // draw first (behind), prominent draw last (in front).
  const fadedSeries = showAllLines
    ? [] // show all at full opacity when toggled
    : seriesSorted.filter((s) => !prominentIds.has(s.team.id));
  const prominentSeries = showAllLines
    ? seriesSorted
    : seriesSorted.filter((s) => prominentIds.has(s.team.id));
  const hasHiddenLines = !showAllLines && fadedSeries.length > 0;

  return (
    <div>
      {/* Metric switcher */}
      <div
        role="tablist"
        aria-label="Analytics metric"
        className="flex gap-1 mb-4 overflow-x-auto pb-1 -mx-1 px-1"
      >
        {METRIC_CONFIGS.map((m) => (
          <button
            key={m.key}
            role="tab"
            aria-selected={metric === m.key}
            onClick={() => setMetric(m.key)}
            className={cn(
              "shrink-0 px-3 py-1.5 rounded-full text-[0.8125rem] font-medium transition-colors",
              "min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              metric === m.key
                ? "bg-primary text-primary-fg"
                : "bg-surface-2 text-ink-2 hover:bg-surface-hover hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <p className="text-[0.75rem] text-ink-muted mb-2">
        {config.description}
      </p>

      {allValues.length === 0 ? (
        <div className="rounded-md border border-dashed border-line p-8 text-center text-[0.8125rem] text-ink-muted">
          No data for this metric — quarters may not have closed yet,
          or the metric isn&rsquo;t recorded on this run.
        </div>
      ) : (
        <div className="relative">
          <svg
            width="100%"
            viewBox={`0 0 ${W} ${H}`}
            className="block"
            onMouseMove={handleMove}
            onMouseLeave={() => setHoverQuarter(null)}
            role="img"
            aria-label={`${config.label} over ${totalRounds} quarters`}
          >
            {/* Y gridlines + labels */}
            {yTicks.map((tickVal, i) => {
              const ty = yPos(tickVal);
              return (
                <g key={i}>
                  <line x1={padL} y1={ty} x2={W - padR} y2={ty}
                    stroke="var(--line)" strokeWidth="0.5" />
                  <text x={padL - 8} y={ty + 3} textAnchor="end"
                    fontSize="9" fill="var(--ink-muted)" className="font-mono tabular">
                    {config.format(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {xTicks.map((q) => (
              <text key={q} x={xPos(q)} y={H - padB + 16}
                textAnchor="middle" fontSize="9" fill="var(--ink-muted)"
                className="font-mono tabular">
                {fmtQuarter(q)}
              </text>
            ))}

            {/* Zero baseline */}
            {yMin < 0 && yMax > 0 && (
              <line x1={padL} y1={yPos(0)} x2={W - padR} y2={yPos(0)}
                stroke="var(--ink-muted)" strokeWidth="0.5" strokeDasharray="3 3" />
            )}

            {/* X-axis baseline */}
            <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB}
              stroke="var(--line)" strokeWidth="1" />

            {/* Faded background lines — non-prominent teams */}
            {fadedSeries.map(({ team, points }) => {
              if (points.length < 2) return null;
              const teamColor = airlineColorFor({
                colorId: team.airlineColorId,
                fallbackKey: team.id,
              }).hex;
              const d = points
                .map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(p.q).toFixed(1)} ${yPos(p.v).toFixed(1)}`)
                .join(" ");
              return (
                <path key={team.id} d={d}
                  stroke={teamColor} strokeWidth="1" fill="none"
                  opacity="0.18" strokeLinejoin="round" strokeLinecap="round"
                />
              );
            })}

            {/* Prominent lines — drawn on top, full opacity */}
            {prominentSeries.map(({ team, points }) => {
              if (points.length < 2) return null;
              const teamColor = airlineColorFor({
                colorId: team.airlineColorId,
                fallbackKey: team.id,
              }).hex;
              const d = points
                .map((p, i) => `${i === 0 ? "M" : "L"} ${xPos(p.q).toFixed(1)} ${yPos(p.v).toFixed(1)}`)
                .join(" ");
              const last = points[points.length - 1];
              return (
                <g key={team.id}>
                  <path d={d} stroke={teamColor} strokeWidth="2" fill="none"
                    strokeLinejoin="round" strokeLinecap="round" />
                  <circle cx={xPos(last.q)} cy={yPos(last.v)} r="3" fill={teamColor} />
                </g>
              );
            })}

            {/* Hover indicator */}
            {hoverQuarter != null && (
              <>
                <line x1={xPos(hoverQuarter)} y1={padT}
                  x2={xPos(hoverQuarter)} y2={H - padB}
                  stroke="var(--ink-muted)" strokeWidth="0.5" strokeDasharray="2 2" />
                {prominentSeries.map(({ team, points }) => {
                  const point = points.find((p) => p.q === hoverQuarter);
                  if (!point) return null;
                  const teamColor = airlineColorFor({
                    colorId: team.airlineColorId,
                    fallbackKey: team.id,
                  }).hex;
                  return (
                    <circle key={team.id}
                      cx={xPos(point.q)} cy={yPos(point.v)}
                      r="4" fill={teamColor} stroke="white" strokeWidth="1.5" />
                  );
                })}
              </>
            )}
          </svg>

          {/* Hover tooltip */}
          {hoverQuarter != null && tooltipRows && tooltipRows.length > 0 && (
            <div
              className="absolute top-2 right-2 rounded-md border border-line bg-surface/95 backdrop-blur-sm shadow-[var(--shadow-2)] p-2 pointer-events-none"
              style={{ minWidth: 160, maxWidth: 240 }}
            >
              <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">
                {fmtQuarter(hoverQuarter)} · {config.label}
              </div>
              <div className="space-y-0.5">
                {tooltipRows.map((row) => {
                  const teamColor = airlineColorFor({
                    colorId: row.team.airlineColorId,
                    fallbackKey: row.team.id,
                  }).hex;
                  return (
                    <div key={row.team.id} className="flex items-center gap-2 text-[0.75rem]">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: teamColor }} />
                      <span className="font-mono text-ink-2 shrink-0">{row.team.code}</span>
                      <span className="text-ink-2 truncate flex-1 min-w-0">{row.team.name}</span>
                      <span className="font-mono tabular text-ink shrink-0">
                        {config.format(row.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* "Show all / top N" toggle — only relevant for large cohorts */}
          {teams.length > MAX_CHART_LINES && (
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setShowAllLines((v) => !v)}
                className="text-[0.75rem] text-primary hover:underline focus-visible:outline-none"
              >
                {showAllLines
                  ? `Show top ${MAX_CHART_LINES} only`
                  : `Show all ${teams.length} teams`}
              </button>
              {!showAllLines && (
                <span className="text-[0.6875rem] text-ink-muted">
                  · {fadedSeries.length} team{fadedSeries.length !== 1 ? "s" : ""} faded
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-2">
        {legendVisible.map((t) => {
          const teamColor = airlineColorFor({
            colorId: t.airlineColorId,
            fallbackKey: t.id,
          }).hex;
          const isHighlighted = (highlightTeamIds ?? []).includes(t.id);
          const isProminent = prominentIds.has(t.id);
          return (
            <div key={t.id}
              className={cn(
                "flex items-center gap-1.5 text-[0.75rem]",
                !isProminent && hasHiddenLines && "opacity-40",
              )}
            >
              <span className={cn(
                "inline-block w-3 h-3 rounded-sm",
                isHighlighted && "ring-1 ring-offset-1 ring-current",
              )}
                style={{ background: teamColor }} aria-hidden />
              <span className="font-mono text-ink-muted">{t.code}</span>
              <span className={cn("text-ink-2", isHighlighted && "font-semibold text-ink")}>
                {t.name}
              </span>
            </div>
          );
        })}
        {legendOverflow > 0 && (
          <span className="text-[0.75rem] text-ink-muted italic">
            +{legendOverflow} more team{legendOverflow !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
}
