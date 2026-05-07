"use client";

/**
 * MultiAirlineAnalytics — endgame analytics block with toggleable
 * metrics across all teams, plotted quarter-by-quarter.
 *
 * Replaces the previous single-metric `<MultiAirlineChart>` (which
 * only showed airline value). The room can now compare teams on:
 *
 *   - Brand value
 *   - Cash position
 *   - Quarterly revenue
 *   - Net profit
 *   - Cumulative net profit (running sum — surfaces the slow burn
 *     vs. the late-game spike)
 *   - Operating margin (netProfit / revenue per quarter)
 *   - Customer loyalty
 *   - Rank trajectory (inverted Y so #1 is at the top)
 *   - Airline value (the legacy view, kept as a tab)
 *
 * Each line is the player's own airline color (Phase 9 palette) so
 * the room can quickly say "the teal airline pulled away in Q22".
 *
 * The hover tooltip surfaces every team's value at the hovered
 * quarter — the headline insight is "who was where, when".
 *
 * This is a finished-game retrospective, not an in-game live chart;
 * we don't bother with realtime. Pure render of immutable
 * `financialsByQuarter` data.
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
  /** Format a single value for axis labels + tooltip. */
  format: (n: number) => string;
  /** When true, lower values render at the top (e.g. rank #1 above #5). */
  invertY?: boolean;
  /** Compute the series value for a quarter, given the team's full
   *  history up to and including that quarter. Allows running sums
   *  and ratios. Returns null when the metric is undefined for the
   *  quarter (e.g. operating margin on zero-revenue quarter). */
  compute: (
    q: AnalyticsTeam["financialsByQuarter"][number],
    history: AnalyticsTeam["financialsByQuarter"],
  ) => number | null;
}

const METRIC_CONFIGS: MetricConfig[] = [
  {
    key: "brandValue",
    label: "Brand Value",
    description: "Composite brand health (0-100).",
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
    description: "Cash − debt + 1M × brand value (the legacy view).",
    format: (n) => fmtMoney(n),
    compute: (q) =>
      q.airlineValue != null
        ? q.airlineValue
        : q.cash - q.debt + q.brandValue * 1_000_000,
  },
];

export function MultiAirlineAnalytics({
  teams,
  totalRounds,
  defaultMetric = "brandValue",
}: {
  teams: AnalyticsTeam[];
  totalRounds: number;
  defaultMetric?: MetricKey;
}) {
  const [metric, setMetric] = useState<MetricKey>(defaultMetric);
  const [hoverQuarter, setHoverQuarter] = useState<number | null>(null);

  const config = METRIC_CONFIGS.find((m) => m.key === metric)!;

  // Derive series for the active metric.
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

  const allValues = series.flatMap((s) => s.points.map((p) => p.v));
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  // Pad the y-range slightly so the top/bottom lines don't touch the
  // chart edges. Also handle the degenerate "all values equal" case.
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
  const x = (q: number) => padL + ((q - 1) / xDivisor) * innerW;
  const y = (v: number) => padT + ((v - yLow) / yRange) * innerH;

  // Five evenly-spaced y-axis ticks. Use the actual data range, not
  // the padded one, so the labels show clean numbers.
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(
    (frac) => yMin + (yMax - yMin) * (config.invertY ? 1 - frac : frac),
  );

  // X ticks — target ~6 across the campaign length.
  const xTicks = useMemo(() => {
    const tickCount = Math.min(7, Math.max(3, Math.round(totalRounds / 6)));
    const step = Math.max(1, Math.floor((totalRounds - 1) / (tickCount - 1)));
    const ticks: number[] = [];
    for (let q = 1; q <= totalRounds; q += step) ticks.push(q);
    if (ticks[ticks.length - 1] !== totalRounds) ticks.push(totalRounds);
    return ticks;
  }, [totalRounds]);

  // Translate mouseX → quarter for the hover tooltip.
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

  // Sort teams for the tooltip + legend by their value at the
  // hovered quarter (highest first). Legend sorts by final value.
  const tooltipRows = useMemo(() => {
    if (hoverQuarter == null) return null;
    return series
      .map((s) => {
        const point = s.points.find((p) => p.q === hoverQuarter);
        return point ? { team: s.team, value: point.v } : null;
      })
      .filter((r): r is { team: AnalyticsTeam; value: number } => r !== null)
      .sort((a, b) =>
        config.invertY ? a.value - b.value : b.value - a.value,
      );
  }, [hoverQuarter, series, config.invertY]);

  const legendRows = useMemo(() => {
    return [...teams].sort((a, b) => {
      const lastA = a.financialsByQuarter[a.financialsByQuarter.length - 1];
      const lastB = b.financialsByQuarter[b.financialsByQuarter.length - 1];
      const va = lastA ? config.compute(lastA, a.financialsByQuarter) ?? 0 : 0;
      const vb = lastB ? config.compute(lastB, b.financialsByQuarter) ?? 0 : 0;
      return config.invertY ? va - vb : vb - va;
    });
  }, [teams, config]);

  return (
    <div>
      {/* Metric switcher — horizontal scroll on small viewports so 9
          options don't crush the chart. */}
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
              const ty = y(tickVal);
              return (
                <g key={i}>
                  <line
                    x1={padL}
                    y1={ty}
                    x2={W - padR}
                    y2={ty}
                    stroke="var(--line)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={padL - 8}
                    y={ty + 3}
                    textAnchor="end"
                    fontSize="9"
                    fill="var(--ink-muted)"
                    className="font-mono tabular"
                  >
                    {config.format(tickVal)}
                  </text>
                </g>
              );
            })}

            {/* X-axis ticks */}
            {xTicks.map((q) => (
              <text
                key={q}
                x={x(q)}
                y={H - padB + 16}
                textAnchor="middle"
                fontSize="9"
                fill="var(--ink-muted)"
                className="font-mono tabular"
              >
                {fmtQuarter(q)}
              </text>
            ))}

            {/* Zero baseline if range crosses zero */}
            {yMin < 0 && yMax > 0 && (
              <line
                x1={padL}
                y1={y(0)}
                x2={W - padR}
                y2={y(0)}
                stroke="var(--ink-muted)"
                strokeWidth="0.5"
                strokeDasharray="3 3"
              />
            )}

            {/* X-axis baseline */}
            <line
              x1={padL}
              y1={H - padB}
              x2={W - padR}
              y2={H - padB}
              stroke="var(--line)"
              strokeWidth="1"
            />

            {/* One polyline per team */}
            {series.map(({ team, points }) => {
              if (points.length < 2) return null;
              const teamColor = airlineColorFor({
                colorId: team.airlineColorId,
                fallbackKey: team.id,
              }).hex;
              const d = points
                .map(
                  (p, i) =>
                    `${i === 0 ? "M" : "L"} ${x(p.q).toFixed(1)} ${y(p.v).toFixed(1)}`,
                )
                .join(" ");
              return (
                <g key={team.id}>
                  <path
                    d={d}
                    stroke={teamColor}
                    strokeWidth="2"
                    fill="none"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                  {/* End-point marker */}
                  {(() => {
                    const last = points[points.length - 1];
                    return (
                      <circle
                        cx={x(last.q)}
                        cy={y(last.v)}
                        r="3"
                        fill={teamColor}
                      />
                    );
                  })()}
                </g>
              );
            })}

            {/* Hover indicator */}
            {hoverQuarter != null && (
              <>
                <line
                  x1={x(hoverQuarter)}
                  y1={padT}
                  x2={x(hoverQuarter)}
                  y2={H - padB}
                  stroke="var(--ink-muted)"
                  strokeWidth="0.5"
                  strokeDasharray="2 2"
                />
                {/* Dots at every team's value at the hovered quarter */}
                {series.map(({ team, points }) => {
                  const point = points.find((p) => p.q === hoverQuarter);
                  if (!point) return null;
                  const teamColor = airlineColorFor({
                    colorId: team.airlineColorId,
                    fallbackKey: team.id,
                  }).hex;
                  return (
                    <circle
                      key={team.id}
                      cx={x(point.q)}
                      cy={y(point.v)}
                      r="4"
                      fill={teamColor}
                      stroke="white"
                      strokeWidth="1.5"
                    />
                  );
                })}
              </>
            )}
          </svg>

          {/* Tooltip — positioned to the right of the cursor when
              hovered. Uses absolute positioning so it overlays the
              chart without resizing it. */}
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
                    <div
                      key={row.team.id}
                      className="flex items-center gap-2 text-[0.75rem]"
                    >
                      <span
                        className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ background: teamColor }}
                      />
                      <span className="text-ink-2 truncate flex-1 min-w-0">
                        {row.team.code}
                      </span>
                      <span className="font-mono tabular text-ink shrink-0">
                        {config.format(row.value)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Legend — sorted by final value of the active metric. */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-2">
        {legendRows.map((t) => {
          const teamColor = airlineColorFor({
            colorId: t.airlineColorId,
            fallbackKey: t.id,
          }).hex;
          return (
            <div key={t.id} className="flex items-center gap-1.5 text-[0.75rem]">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ background: teamColor }}
                aria-hidden
              />
              <span className="font-mono text-ink-muted">{t.code}</span>
              <span className="text-ink-2">{t.name}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
