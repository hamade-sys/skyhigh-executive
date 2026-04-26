"use client";

import { useMemo } from "react";
import { Sparkline } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct, fmtQuarter } from "@/lib/format";
import {
  brandRating,
  computeAirlineValue,
  effectiveTravelIndex,
  fleetCount,
} from "@/lib/engine";
import { cityEventImpact, activeNewsAtQuarter } from "@/lib/city-events";
import { cn } from "@/lib/cn";
import { TrendingUp, TrendingDown, Plane, Users, BarChart3, Wallet } from "lucide-react";

/**
 * Management Report dashboard (PRD update — full overview with QTR/YTD/all-time
 * P&L plus graphs). Inspired by Air Tycoon's Management Report screen but
 * laid out for our PRD's quarter-based simulation.
 *
 * Sections:
 *  1. Company snapshot — cash, airline value, brand grade, fleet/routes
 *  2. Trajectory — sparklines for revenue, profit, brand value, cash
 *  3. Period comparison — QTR / YTD / All-time P&L tables
 *  4. Operations breakdown — fleet by status, route by tier, slots owned
 */
export function DashboardPanel() {
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const fuelIndex = useGame((s) => s.fuelIndex);
  const baseInterestRatePct = useGame((s) => s.baseInterestRatePct);

  const periods = useMemo(() => {
    if (!player) return null;
    const all = player.financialsByQuarter;
    const lastQ = all.at(-1);
    // YTD = current year's quarters (e.g. if currentQuarter = 6, year 2 = Q5..Q8)
    const yearStart = Math.floor((currentQuarter - 1) / 4) * 4 + 1;
    const ytd = all.filter((q) => q.quarter >= yearStart);
    return {
      quarter: lastQ ?? null,
      ytd: ytd.length === 0 ? null : aggregate(ytd),
      allTime: all.length === 0 ? null : aggregate(all),
    };
  }, [player, currentQuarter]);

  if (!player) return null;
  const airlineValue = computeAirlineValue(player);
  const grade = brandRating(player);
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const series = player.financialsByQuarter;

  return (
    <div className="space-y-5">
      {/* ── 1. Snapshot ── */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Company snapshot · Q{currentQuarter}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SnapCard
            label="Cash"
            value={fmtMoney(player.cashUsd)}
            sub={`Debt ${fmtMoney(player.totalDebtUsd)}`}
            icon={<Wallet size={12} />}
          />
          <SnapCard
            label="Airline value"
            value={fmtMoney(airlineValue)}
            sub={`Brand ${grade.grade}`}
            icon={<TrendingUp size={12} />}
            color={grade.color}
          />
          <SnapCard
            label="Network"
            value={`${activeRoutes.length}`}
            sub={`${activeRoutes.filter((r) => !r.isCargo).length} pax · ${activeRoutes.filter((r) => r.isCargo).length} cargo`}
            icon={<Plane size={12} />}
          />
          <SnapCard
            label="Fleet"
            value={`${fleetCount(player.fleet)}`}
            sub={`${player.fleet.filter((f) => f.status === "ordered").length} on order`}
            icon={<Users size={12} />}
          />
        </div>
      </section>

      {/* ── 2. Trajectory ── */}
      {series.length >= 2 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Trajectory · {fmtQuarter(1)} → {fmtQuarter(Math.max(1, currentQuarter - 1))}
          </div>
          <div className="rounded-md border border-line bg-surface p-3 space-y-2.5">
            <TrajectoryRow label="Revenue" series={series.map((q) => q.revenue)} color="var(--info)" fmt={fmtMoney} />
            <TrajectoryRow label="Net profit" series={series.map((q) => q.netProfit)} color={(series.at(-1)?.netProfit ?? 0) >= 0 ? "var(--positive)" : "var(--negative)"} fmt={fmtMoney} />
            <TrajectoryRow label="Cash position" series={series.map((q) => q.cash)} color="var(--primary)" fmt={fmtMoney} />
            <TrajectoryRow label="Brand value" series={series.map((q) => q.brandValue)} color="var(--accent)" fmt={(n) => n.toFixed(1)} />
          </div>
        </section>
      )}

      {/* ── 3. Period P&L comparison ── */}
      {periods && (periods.quarter || periods.ytd || periods.allTime) && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Profit & loss · period comparison
          </div>
          <div className="rounded-md border border-line overflow-hidden">
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="bg-surface-2 border-b border-line">
                  <th className="text-left px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Line</th>
                  <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">This quarter</th>
                  <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">YTD ({Math.ceil(currentQuarter / 4)})</th>
                  <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">All-time</th>
                </tr>
              </thead>
              <tbody>
                <PeriodRow label="Revenue" tone="pos"
                  q={periods.quarter?.revenue} ytd={periods.ytd?.revenue} all={periods.allTime?.revenue} />
                <PeriodRow label="Costs" tone="neg"
                  q={periods.quarter?.costs} ytd={periods.ytd?.costs} all={periods.allTime?.costs} />
                <PeriodRow label="Net profit" bold
                  tone={(periods.quarter?.netProfit ?? 0) >= 0 ? "pos" : "neg"}
                  q={periods.quarter?.netProfit} ytd={periods.ytd?.netProfit} all={periods.allTime?.netProfit} />
              </tbody>
            </table>
          </div>
          <div className="text-[0.6875rem] text-ink-muted mt-2 leading-relaxed">
            Year breakpoints every 4 rounds (R1 / R5 / R9 / R13 / R17 / R21
            / R25 / R29 / R33 / R37 = calendar 2015–2024). YTD aggregates
            the current 4-round cycle. All-time covers R1 through last close.
          </div>
        </section>
      )}

      {/* ── 4. Operations breakdown ── */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Operations breakdown
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Fleet by status */}
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
              <Plane size={11} /> Fleet by status
            </div>
            {(() => {
              const statusBuckets = {
                active: player.fleet.filter((f) => f.status === "active").length,
                ordered: player.fleet.filter((f) => f.status === "ordered").length,
                grounded: player.fleet.filter((f) => f.status === "grounded").length,
                retired: player.fleet.filter((f) => f.status === "retired").length,
                leased: player.fleet.filter((f) => f.status === "leased").length,
              };
              return (
                <div className="space-y-1">
                  <FleetStatusRow label="Active" value={statusBuckets.active} tone="pos" />
                  <FleetStatusRow label="Ordered" value={statusBuckets.ordered} tone="info" />
                  <FleetStatusRow label="Grounded (renovation)" value={statusBuckets.grounded} tone="warn" />
                  <FleetStatusRow label="Leased" value={statusBuckets.leased} tone="info" />
                  <FleetStatusRow label="Retired" value={statusBuckets.retired} tone="muted" />
                </div>
              );
            })()}
          </div>

          {/* Network by tier */}
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
              <BarChart3 size={11} /> Active routes by destination tier
            </div>
            {(() => {
              const counts = { 1: 0, 2: 0, 3: 0, 4: 0 };
              for (const r of activeRoutes) {
                const tier = (r.distanceKm > 0 ? 1 : 1); // placeholder; need CITIES_BY_CODE
              }
              void counts;
              const tierCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
              return (
                <div className="space-y-1">
                  <div className="text-[0.75rem] text-ink-2">
                    Total active: <strong className="text-ink">{activeRoutes.length}</strong>
                  </div>
                  <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-1">
                    Avg load factor:{" "}
                    <strong className={cn(
                      activeRoutes.length > 0 && (activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) / activeRoutes.length) >= 0.7
                        ? "text-positive"
                        : (activeRoutes.length > 0 && (activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) / activeRoutes.length) < 0.5)
                          ? "text-negative" : "text-ink",
                    )}>
                      {activeRoutes.length === 0 ? "—" : fmtPct(
                        (activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) / activeRoutes.length) * 100,
                        0,
                      )}
                    </strong>
                  </div>
                  <div className="text-[0.6875rem] text-ink-muted">
                    Total weekly schedules:{" "}
                    <strong className="text-ink">
                      {activeRoutes.reduce((s, r) => s + r.dailyFrequency * 7, 0)}
                    </strong>
                  </div>
                  {Object.keys(tierCounts).length > 0 && (
                    <div className="text-[0.625rem] text-ink-muted mt-2">
                      (Per-tier breakdown coming in V2 alongside airport ownership.)
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </section>

      {/* ── 5. Slots owned ── */}
      {Object.keys(player.slotsByAirport ?? {}).filter((c) => (player.slotsByAirport[c] ?? 0) > 0).length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Airport slots owned
          </div>
          <div className="rounded-md border border-line bg-surface p-3">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(player.slotsByAirport ?? {})
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([code, n]) => (
                  <span key={code} className="inline-flex items-center gap-1 text-[0.6875rem] tabular font-mono px-1.5 py-0.5 rounded bg-[var(--positive-soft)] text-positive">
                    <strong className="text-ink">{code}</strong> × {n}
                  </span>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ── 6. Market vitals ── */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Market vitals
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <SnapCard label="Fuel index" value={fuelIndex.toFixed(0)} sub="100 = baseline" />
          <SnapCard
            label="Travel index"
            value={effectiveTravelIndex(currentQuarter).toFixed(0)}
            sub="global demand multiplier"
          />
          <SnapCard label="Base rate" value={`${baseInterestRatePct.toFixed(1)}%`} sub="commercial debt" />
          <SnapCard label="Brand grade" value={grade.grade} sub={`Brand ${player.brandPts.toFixed(0)}/100 · Ops ${player.opsPts.toFixed(0)}/100`} color={grade.color} />
        </div>
      </section>

      {/* ── 6b. Market vitals trajectory ── */}
      <MarketHistorySection />

      {/* ── 7. Active demand modifiers (news in effect on YOUR network) ── */}
      <ActiveModifiersSection player={player} currentQuarter={currentQuarter} />
    </div>
  );
}

/** Surface the per-city demand modifiers currently active across the
 *  player's hub + secondary hubs + every endpoint of an active route.
 *  This is the dashboard's window into the structured news engine —
 *  the player can see "Mumbai +25% tourism for 2 more rounds because
 *  IPL is on" without having to dig through the news log. */
function ActiveModifiersSection({
  player,
  currentQuarter,
}: {
  player: NonNullable<ReturnType<typeof selectPlayer>>;
  currentQuarter: number;
}) {
  // Collect every city in the player's network.
  const networkCodes = useMemo(() => {
    const s = new Set<string>([player.hubCode, ...player.secondaryHubCodes]);
    for (const r of player.routes) {
      if (r.status !== "closed") {
        s.add(r.originCode);
        s.add(r.destCode);
      }
    }
    return Array.from(s);
  }, [player]);

  // For each network city, get the current per-category impact. Skip
  // cities with zero net effect so the panel doesn't show noise.
  const rows = useMemo(() => {
    const out: {
      code: string;
      tourism: number;
      business: number;
      cargo: number;
      total: number;
    }[] = [];
    for (const code of networkCodes) {
      const im = cityEventImpact(code, currentQuarter);
      const total = im.tourism + im.business + im.cargo;
      if (total === 0 && im.tourism === 0 && im.business === 0 && im.cargo === 0) continue;
      out.push({
        code,
        tourism: im.tourism,
        business: im.business,
        cargo: im.cargo,
        total,
      });
    }
    return out.sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
  }, [networkCodes, currentQuarter]);

  const activeNews = useMemo(() => activeNewsAtQuarter(currentQuarter), [currentQuarter]);

  if (rows.length === 0) {
    return (
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Active demand modifiers
        </div>
        <div className="rounded-md border border-line bg-surface p-3 text-[0.75rem] text-ink-muted italic">
          No structured news is shifting demand on your current network this round.
          {" "}
          {activeNews.length > 0 && (
            <span>{activeNews.length} headline{activeNews.length === 1 ? "" : "s"} in effect — open the News tab.</span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2 flex items-center gap-2">
        <span>Active demand modifiers · {fmtQuarter(currentQuarter)}</span>
        <span className="h-px flex-1 bg-line" />
        <span className="tabular text-ink-muted">{rows.length} cit{rows.length === 1 ? "y" : "ies"}</span>
      </div>
      <div className="rounded-md border border-line bg-surface overflow-hidden">
        <table className="w-full text-[0.75rem]">
          <thead>
            <tr className="bg-surface-2 text-[0.625rem] uppercase tracking-wider text-ink-muted">
              <th className="text-left px-3 py-1.5 font-semibold">City</th>
              <th className="text-right px-2 py-1.5 font-semibold">Tourism</th>
              <th className="text-right px-2 py-1.5 font-semibold">Business</th>
              <th className="text-right px-2 py-1.5 font-semibold">Cargo</th>
              <th className="text-right px-3 py-1.5 font-semibold">Net</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.code} className="border-t border-line">
                <td className="px-3 py-1.5 font-mono tabular text-ink">{r.code}</td>
                <td className={cn("px-2 py-1.5 text-right tabular font-mono", deltaClass(r.tourism))}>
                  {fmtDelta(r.tourism)}
                </td>
                <td className={cn("px-2 py-1.5 text-right tabular font-mono", deltaClass(r.business))}>
                  {fmtDelta(r.business)}
                </td>
                <td className={cn("px-2 py-1.5 text-right tabular font-mono", deltaClass(r.cargo))}>
                  {fmtDelta(r.cargo)}
                </td>
                <td className={cn("px-3 py-1.5 text-right tabular font-mono font-semibold", deltaClass(r.total))}>
                  {fmtDelta(r.total)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[0.625rem] text-ink-muted italic mt-1.5">
        Per-city demand shift driven by world news (current + back-dated multi-round events).
        Dashes mean no modifier in that category.
      </p>
    </section>
  );
}

function fmtDelta(n: number): string {
  if (n === 0) return "—";
  return `${n > 0 ? "+" : ""}${n}%`;
}
function deltaClass(n: number): string {
  if (n === 0) return "text-ink-muted";
  return n > 0 ? "text-positive" : "text-negative";
}

function aggregate(rows: Array<{ revenue: number; costs: number; netProfit: number }>) {
  return {
    revenue: rows.reduce((s, r) => s + r.revenue, 0),
    costs: rows.reduce((s, r) => s + r.costs, 0),
    netProfit: rows.reduce((s, r) => s + r.netProfit, 0),
  };
}

function SnapCard({
  label, value, sub, icon, color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: React.ReactNode;
  color?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {icon}
        {label}
      </div>
      <div
        className="font-display text-[1.375rem] tabular leading-none mt-1"
        style={color ? { color } : undefined}
      >
        {value}
      </div>
      {sub && <div className="text-[0.625rem] text-ink-muted mt-1.5">{sub}</div>}
    </div>
  );
}

function TrajectoryRow({
  label, series, color, fmt,
}: {
  label: string;
  series: number[];
  color: string;
  fmt: (n: number) => string;
}) {
  const last = series[series.length - 1] ?? 0;
  const prev = series[series.length - 2] ?? 0;
  const delta = last - prev;
  const positive = delta >= 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[0.75rem] text-ink-muted w-28 shrink-0">{label}</span>
      <Sparkline values={series} color={color} width={300} height={24} />
      <div className="flex flex-col items-end shrink-0 w-28">
        <span className="tabular font-mono text-[0.875rem] text-ink">
          {fmt(last)}
        </span>
        {Math.abs(delta) > 0.001 && (
          <span className={cn(
            "tabular text-[0.6875rem] font-mono inline-flex items-center gap-0.5",
            positive ? "text-positive" : "text-negative",
          )}>
            {positive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {positive ? "+" : ""}{fmt(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function PeriodRow({
  label, q, ytd, all, tone, bold = false,
}: {
  label: string;
  q?: number;
  ytd?: number;
  all?: number;
  tone?: "pos" | "neg";
  bold?: boolean;
}) {
  const cls = tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink";
  return (
    <tr className={cn("border-b border-line last:border-0", bold && "bg-surface-2")}>
      <td className={cn("px-3 py-2 text-ink-2", bold && "font-semibold text-ink")}>{label}</td>
      <td className={cn("px-2 py-2 text-right tabular font-mono", cls, bold && "font-semibold")}>
        {q !== undefined ? fmtMoney(q) : "—"}
      </td>
      <td className={cn("px-2 py-2 text-right tabular font-mono", cls, bold && "font-semibold")}>
        {ytd !== undefined ? fmtMoney(ytd) : "—"}
      </td>
      <td className={cn("px-2 py-2 text-right tabular font-mono", cls, bold && "font-semibold")}>
        {all !== undefined ? fmtMoney(all) : "—"}
      </td>
    </tr>
  );
}

function FleetStatusRow({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone: "pos" | "neg" | "info" | "warn" | "muted";
}) {
  const cls =
    tone === "pos" ? "text-positive" :
    tone === "neg" ? "text-negative" :
    tone === "info" ? "text-info" :
    tone === "warn" ? "text-warning" : "text-ink-muted";
  return (
    <div className="flex items-baseline justify-between text-[0.75rem]">
      <span className="text-ink-2">{label}</span>
      <span className={cn("tabular font-mono", cls, value > 0 && "font-semibold")}>
        {value}
      </span>
    </div>
  );
}

/** Three-line trajectory chart of the macro indices. Reads
 *  GameState.marketHistory which the engine appends to at every
 *  quarter close. Hidden until at least 2 closes have happened so
 *  the chart has a meaningful slope. */
function MarketHistorySection() {
  const history = useGame((s) => s.marketHistory ?? []);
  if (history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.quarter - b.quarter);
  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Market vitals · {sorted[0].quarter === sorted[sorted.length - 1].quarter ? "this quarter" : `${fmtQuarter(sorted[0].quarter)} – ${fmtQuarter(sorted[sorted.length - 1].quarter)}`}
      </div>
      <div className="rounded-md border border-line bg-surface p-3 space-y-3">
        <MarketHistoryLine
          label="Fuel index"
          color="#C46E27"
          series={sorted.map((m) => ({ q: m.quarter, v: m.fuelIndex }))}
          baseline={100}
          fmt={(v) => v.toFixed(0)}
        />
        <MarketHistoryLine
          label="Travel index"
          color="#1E6B5C"
          series={sorted.map((m) => ({ q: m.quarter, v: m.travelIndex }))}
          baseline={100}
          fmt={(v) => v.toFixed(0)}
        />
        <MarketHistoryLine
          label="Base rate"
          color="#0072B5"
          series={sorted.map((m) => ({ q: m.quarter, v: m.baseRatePct }))}
          fmt={(v) => `${v.toFixed(1)}%`}
        />
      </div>
    </section>
  );
}

/** Single index line with a baseline reference, current value, and a
 *  delta vs the first sample. Compact enough to stack three deep. */
function MarketHistoryLine({
  label, color, series, baseline, fmt,
}: {
  label: string;
  color: string;
  series: Array<{ q: number; v: number }>;
  baseline?: number;
  fmt: (n: number) => string;
}) {
  const w = 280;
  const h = 36;
  const values = series.map((s) => s.v);
  const lo = Math.min(...values, baseline ?? Infinity);
  const hi = Math.max(...values, baseline ?? -Infinity);
  const range = Math.max(0.001, hi - lo);
  const px = (v: number, i: number) => ({
    x: series.length === 1 ? 0 : (i / (series.length - 1)) * w,
    y: h - ((v - lo) / range) * h,
  });
  const points = series.map((s, i) => px(s.v, i)).map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const baselineY = baseline !== undefined ? h - ((baseline - lo) / range) * h : null;
  const current = values[values.length - 1];
  const start = values[0];
  const delta = current - start;
  const deltaTone = delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-ink-muted";
  // X-axis ticks (quarter labels) — up to 5, evenly spaced.
  const tickIdx: number[] = series.length <= 5
    ? series.map((_, i) => i)
    : [0, 1, 2, 3, 4].map((k) => Math.round((k * (series.length - 1)) / 4));
  const tickPts = tickIdx.map((i) => px(series[i].v, i));
  return (
    <div className="flex items-start gap-3">
      <span className="w-22 text-[0.75rem] text-ink-2 shrink-0 pt-1">{label}</span>
      <div className="flex-1 min-w-0">
        <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-9">
          {baselineY !== null && (
            <line x1={0} y1={baselineY} x2={w} y2={baselineY} stroke="currentColor" className="text-ink-muted/40" strokeWidth={0.5} strokeDasharray="2 3" />
          )}
          <polyline points={points} fill="none" stroke={color} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
          {tickPts.map((p, i) => (
            <line key={i} x1={p.x} y1={h - 1} x2={p.x} y2={h - 4} stroke="currentColor" className="text-ink-muted" strokeWidth={1} />
          ))}
        </svg>
        <div className="flex justify-between text-[0.5625rem] text-ink-muted tabular font-mono mt-0.5">
          {tickIdx.map((i) => (<span key={i}>{fmtQuarter(series[i].q)}</span>))}
        </div>
      </div>
      <span className="tabular font-mono text-[0.8125rem] text-ink shrink-0 w-14 text-right pt-1">{fmt(current)}</span>
      <span className={cn("tabular font-mono text-[0.6875rem] w-16 text-right pt-1", deltaTone)}>
        {delta >= 0 ? "+" : ""}{fmt(delta)}
      </span>
    </div>
  );
}
