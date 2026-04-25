"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { brandRating, computeAirlineValue } from "@/lib/engine";
import { MILESTONES_BY_ID } from "@/data/milestones";
import { TrendingUp, TrendingDown, Newspaper, Plane, Award, Users, FileBarChart, NotebookPen } from "lucide-react";
import { cn } from "@/lib/cn";

type Tab = "overview" | "news" | "routes" | "people" | "pnl" | "notes";

const TABS: Array<{ id: Tab; label: string; Icon: typeof TrendingUp }> = [
  { id: "overview", label: "Headline",   Icon: TrendingUp },
  { id: "news",     label: "News",       Icon: Newspaper },
  { id: "routes",   label: "Routes",     Icon: Plane },
  { id: "people",   label: "People",     Icon: Users },
  { id: "pnl",      label: "P&L",        Icon: FileBarChart },
  { id: "notes",    label: "Notes",      Icon: NotebookPen },
];

export function QuarterCloseModal() {
  const s = useGame();
  const router = useRouter();
  const player = selectPlayer(s);
  const [tab, setTab] = useState<Tab>("overview");
  const open = s.phase === "quarter-closing" && !!s.lastCloseResult;
  const result = s.lastCloseResult;

  function continueNext() {
    if (!result) return;
    s.advanceToNext();
    if (s.currentQuarter >= 20) router.push("/endgame");
  }

  // Top winners + top losers, computed once per result
  const { topWinners, topLosers } = useMemo(() => {
    if (!result) return { topWinners: [], topLosers: [] };
    const sorted = [...result.routeBreakdown].sort((a, b) => b.profit - a.profit);
    return {
      topWinners: sorted.slice(0, 3).filter((r) => r.profit > 0),
      topLosers: sorted.slice(-3).reverse().filter((r) => r.profit < 0),
    };
  }, [result]);

  if (!result || !player) return null;

  const cashDelta = result.newCashUsd - result.prevCashUsd;
  const newAirlineValue = computeAirlineValue({ ...player, cashUsd: result.newCashUsd, brandPts: result.newBrandPts, opsPts: result.newOpsPts, customerLoyaltyPct: result.newLoyalty });
  const prevAirlineValue = computeAirlineValue({ ...player, cashUsd: result.prevCashUsd, brandPts: result.prevBrandPts, opsPts: result.prevOpsPts, customerLoyaltyPct: result.prevLoyalty });
  const valueDelta = newAirlineValue - prevAirlineValue;
  const grade = brandRating({ ...player, brandPts: result.newBrandPts, opsPts: result.newOpsPts, customerLoyaltyPct: result.newLoyalty });

  const totalCosts =
    result.fuelCost + result.slotCost + result.staffCost +
    result.otherSliderCost + result.maintenanceCost +
    result.depreciation + result.interest + result.tax;

  return (
    <Modal open={open} onClose={() => { /* force continue */ }} className="max-w-3xl">
      <ModalHeader>
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent">
              Q{result.quarter} · Quarter closed
            </span>
            <h2 className="font-display text-[1.75rem] text-ink leading-tight mt-1">
              {result.netProfit >= 0
                ? "A profitable quarter."
                : result.netProfit > -5_000_000
                  ? "A breakeven quarter."
                  : "A tough quarter."}
            </h2>
          </div>
          <span
            className={cn(
              "rounded-md px-3 py-1.5 text-[0.75rem] font-semibold tabular tracking-wider",
              "border",
              "flex flex-col items-center min-w-[64px]",
            )}
            style={{ borderColor: grade.color, color: grade.color }}
          >
            <span className="text-[0.625rem] uppercase tracking-wider opacity-70">Brand</span>
            <span className="font-display text-[1.25rem] leading-none">{grade.grade}</span>
          </span>
        </div>

        {/* Tab strip */}
        <nav className="mt-4 -mb-3 flex items-center gap-1 border-b border-line">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "px-3 py-2 text-[0.75rem] font-medium flex items-center gap-1.5",
                  "border-b-2 -mb-px transition-colors duration-[var(--dur-fast)]",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                <t.Icon size={13} /> {t.label}
              </button>
            );
          })}
        </nav>
      </ModalHeader>

      <ModalBody className="space-y-5 min-h-[280px]">
        {tab === "overview" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-4">
              <BigStat label="Revenue" value={fmtMoney(result.revenue)} tone="positive" />
              <BigStat label="Costs" value={fmtMoney(totalCosts)} tone="negative" />
              <BigStat
                label="Net profit"
                value={fmtMoney(result.netProfit)}
                tone={result.netProfit >= 0 ? "positive" : "negative"}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <DeltaRow
                label="Cash position"
                from={result.prevCashUsd}
                to={result.newCashUsd}
                delta={cashDelta}
                fmt={fmtMoney}
              />
              <DeltaRow
                label="Airline value"
                from={prevAirlineValue}
                to={newAirlineValue}
                delta={valueDelta}
                fmt={fmtMoney}
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <Mini
                label="Brand pts"
                value={result.newBrandPts.toFixed(0)}
                delta={result.newBrandPts - result.prevBrandPts}
              />
              <Mini
                label="Loyalty"
                value={fmtPct(result.newLoyalty, 0)}
                delta={result.newLoyalty - result.prevLoyalty}
                deltaSuffix="%"
              />
              <Mini
                label="Ops pts"
                value={result.newOpsPts.toFixed(0)}
                delta={result.newOpsPts - result.prevOpsPts}
              />
            </div>

            {result.milestonesEarnedThisQuarter.length > 0 && (
              <div className="rounded-md border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] px-3 py-2">
                <div className="flex items-center gap-2 text-accent text-[0.6875rem] uppercase tracking-wider font-semibold">
                  <Award size={13} /> Milestones earned this quarter
                </div>
                <div className="mt-1 text-[0.8125rem] text-ink">
                  {result.milestonesEarnedThisQuarter
                    .map((id) => MILESTONES_BY_ID[id]?.title ?? id)
                    .join(" · ")}
                </div>
              </div>
            )}

            {result.newRcfBalance > 0 && (
              <div className="text-[0.8125rem] rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)] text-warning px-3 py-2">
                Revolving Credit Facility drawn: <span className="tabular font-mono font-semibold">{fmtMoney(result.newRcfBalance)}</span>. Interest at 2× base rate applies next quarter.
              </div>
            )}
          </div>
        )}

        {tab === "news" && (
          <div className="space-y-2">
            {result.newsImpacts.length === 0 ? (
              <div className="rounded-md border border-line bg-surface-2 p-6 text-center">
                <Newspaper size={20} className="mx-auto text-ink-muted mb-2" />
                <div className="text-[0.875rem] font-medium text-ink">No headlines hit your network</div>
                <div className="text-[0.75rem] text-ink-muted mt-0.5">
                  This quarter&apos;s news didn&apos;t materially affect any of your cities.
                </div>
              </div>
            ) : (
              result.newsImpacts.map((n, i) => {
                const totalImpact = n.cities.reduce((s, c) => s + c.pct, 0);
                const positive = totalImpact >= 0;
                return (
                  <article
                    key={i}
                    className="rounded-md border border-line bg-surface px-4 py-3"
                  >
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[0.625rem] uppercase tracking-[0.18em] font-bold text-accent">
                        {n.outlet}
                      </span>
                      <span className="text-[0.625rem] tabular text-ink-muted font-mono">
                        Q{n.quarter}
                      </span>
                    </div>
                    <h3 className="text-[0.9375rem] font-medium text-ink leading-snug">
                      {n.headline}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {n.cities.map((c) => (
                        <span
                          key={c.code}
                          className={cn(
                            "text-[0.6875rem] tabular px-1.5 py-0.5 rounded font-mono",
                            c.pct >= 0
                              ? "bg-[var(--positive-soft)] text-positive"
                              : "bg-[var(--negative-soft)] text-negative",
                          )}
                        >
                          {c.code} {c.pct >= 0 ? "+" : ""}{c.pct}%
                        </span>
                      ))}
                      <span
                        className={cn(
                          "ml-auto text-[0.6875rem] uppercase tracking-wider font-semibold",
                          positive ? "text-positive" : "text-negative",
                        )}
                      >
                        Net {positive ? "+" : ""}{totalImpact}%
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        )}

        {tab === "routes" && (
          <div className="space-y-4">
            {topWinners.length > 0 && (
              <Section title="Top performers" tone="positive">
                {topWinners.map((r) => {
                  const route = player.routes.find((x) => x.id === r.routeId);
                  return (
                    <RouteRow
                      key={r.routeId}
                      label={route ? `${route.originCode} → ${route.destCode}` : r.routeId}
                      occupancy={r.occupancy}
                      profit={r.profit}
                    />
                  );
                })}
              </Section>
            )}
            {topLosers.length > 0 && (
              <Section title="Routes losing money" tone="negative">
                {topLosers.map((r) => {
                  const route = player.routes.find((x) => x.id === r.routeId);
                  return (
                    <RouteRow
                      key={r.routeId}
                      label={route ? `${route.originCode} → ${route.destCode}` : r.routeId}
                      occupancy={r.occupancy}
                      profit={r.profit}
                    />
                  );
                })}
              </Section>
            )}
            {topWinners.length === 0 && topLosers.length === 0 && (
              <div className="rounded-md border border-line bg-surface-2 p-6 text-center text-ink-muted text-[0.8125rem]">
                No active routes this quarter.
              </div>
            )}

            {/* Full breakdown collapsible */}
            <details className="rounded-md border border-line">
              <summary className="px-3 py-2 cursor-pointer text-[0.75rem] font-semibold uppercase tracking-wider text-ink-2 hover:bg-surface-hover">
                All routes ({result.routeBreakdown.length})
              </summary>
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="bg-surface-2">
                    <th className="text-left font-semibold text-ink-muted uppercase tracking-wider text-[0.625rem] py-2 px-3">Route</th>
                    <th className="text-right font-semibold text-ink-muted uppercase tracking-wider text-[0.625rem] py-2 px-3">Load</th>
                    <th className="text-right font-semibold text-ink-muted uppercase tracking-wider text-[0.625rem] py-2 px-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {result.routeBreakdown.map((r) => {
                    const route = player.routes.find((x) => x.id === r.routeId);
                    return (
                      <tr key={r.routeId} className="border-t border-line">
                        <td className="py-2 px-3 text-ink font-mono">
                          {route ? `${route.originCode} → ${route.destCode}` : r.routeId}
                        </td>
                        <td className="py-2 px-3 text-right tabular">
                          {fmtPct(r.occupancy * 100, 0)}
                        </td>
                        <td className={`py-2 px-3 text-right tabular font-medium ${r.profit >= 0 ? "text-positive" : "text-negative"}`}>
                          {fmtMoney(r.profit)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          </div>
        )}

        {tab === "people" && (
          <div className="space-y-3">
            <PersonRow
              label="Brand strength"
              prev={result.prevBrandPts}
              next={result.newBrandPts}
              max={100}
              fmt={(n) => n.toFixed(0)}
            />
            <PersonRow
              label="Customer loyalty"
              prev={result.prevLoyalty}
              next={result.newLoyalty}
              max={100}
              fmt={(n) => `${n.toFixed(0)}%`}
            />
            <PersonRow
              label="Operational excellence"
              prev={result.prevOpsPts}
              next={result.newOpsPts}
              max={100}
              fmt={(n) => n.toFixed(0)}
            />
            <PersonRow
              label="Labour relations"
              prev={player.labourRelationsScore}
              next={player.labourRelationsScore}
              max={100}
              fmt={(n) => n.toFixed(0)}
            />
            <div className="text-[0.75rem] text-ink-muted leading-relaxed">
              Brand, Loyalty and Ops drive your <strong>Brand multiplier</strong> on top of net equity.
              The current grade is <strong style={{ color: grade.color }}>{grade.grade}</strong>.
            </div>
          </div>
        )}

        {tab === "pnl" && (
          <div className="rounded-md border border-line overflow-hidden">
            <table className="w-full text-[0.8125rem]">
              <tbody>
                <Row k="Revenue" v={fmtMoney(result.revenue)} tone="positive" />
                <Row k="Fuel cost" v={fmtMoney(result.fuelCost)} />
                <Row k="Slot fees" v={fmtMoney(result.slotCost)} />
                <Row k="Staff" v={fmtMoney(result.staffCost)} />
                <Row k="Other slider spend" v={fmtMoney(result.otherSliderCost)} />
                <Row k="Maintenance" v={fmtMoney(result.maintenanceCost)} />
                <Row k="Depreciation" v={fmtMoney(result.depreciation)} />
                <Row k="Debt interest" v={fmtMoney(result.interest)} />
                {result.rcfInterest > 0 && <Row k="RCF interest (2× base)" v={fmtMoney(result.rcfInterest)} />}
                <Row k="Passenger tax ($16/pax)" v={fmtMoney(result.passengerTax)} />
                <Row k="Fuel excise (8%)" v={fmtMoney(result.fuelExcise)} />
                {result.carbonLevy > 0 && <Row k="Carbon levy" v={fmtMoney(result.carbonLevy)} />}
                <Row k="Corporate tax (20% on pretax)" v={fmtMoney(result.tax)} />
                <Row
                  k="Net profit"
                  v={fmtMoney(result.netProfit)}
                  tone={result.netProfit >= 0 ? "positive" : "negative"}
                  bold
                />
              </tbody>
            </table>
          </div>
        )}

        {tab === "notes" && (
          <div className="space-y-3">
            {result.triggeredEvents.length > 0 && (
              <div>
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
                  Deferred events resolved
                </div>
                <div className="space-y-1.5">
                  {result.triggeredEvents.map((e) => (
                    <div
                      key={e.id}
                      className={cn(
                        "rounded-md border px-3 py-2 text-[0.8125rem]",
                        e.outcome === "triggered"
                          ? "border-[var(--negative-soft)] bg-[var(--negative-soft)]"
                          : "border-[var(--positive-soft)] bg-[var(--positive-soft)]",
                      )}
                    >
                      <span className="font-mono text-primary mr-2">{e.scenario}</span>
                      {e.note}
                      <span
                        className={cn(
                          "ml-2 font-semibold",
                          e.outcome === "triggered" ? "text-negative" : "text-positive",
                        )}
                      >
                        · {e.outcome === "triggered" ? "triggered" : "missed"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {result.notes.length > 0 ? (
              <div>
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
                  Engine log
                </div>
                <div className="text-[0.75rem] text-ink-2 space-y-1 font-mono">
                  {result.notes.map((n, i) => <div key={i}>· {n}</div>)}
                </div>
              </div>
            ) : (
              <div className="text-[0.8125rem] text-ink-muted">No additional notes this quarter.</div>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        <Button variant="primary" onClick={continueNext}>
          {result.quarter >= 20 ? "See endgame →" : "Continue to next quarter →"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function BigStat({ label, value, tone }: { label: string; value: string; tone: "positive" | "negative" }) {
  return (
    <div className="flex flex-col">
      <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
        {label}
      </span>
      <span className={cn("tabular font-display text-[1.5rem] leading-none mt-1", tone === "positive" ? "text-positive" : "text-negative")}>
        {value}
      </span>
    </div>
  );
}

function DeltaRow({
  label,
  from,
  to,
  delta,
  fmt,
}: {
  label: string;
  from: number;
  to: number;
  delta: number;
  fmt: (n: number) => string;
}) {
  const positive = delta >= 0;
  return (
    <div className="rounded-md border border-line p-3">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="tabular font-display text-[1.125rem] text-ink leading-none">
          {fmt(to)}
        </span>
        <span className={cn("text-[0.6875rem] tabular font-mono inline-flex items-center gap-0.5", positive ? "text-positive" : "text-negative")}>
          {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
          {positive ? "+" : ""}{fmt(delta)}
        </span>
      </div>
      <div className="text-[0.625rem] tabular text-ink-muted mt-1">
        from {fmt(from)}
      </div>
    </div>
  );
}

function Mini({ label, value, delta, deltaSuffix = "" }: { label: string; value: string; delta?: number; deltaSuffix?: string }) {
  const positive = (delta ?? 0) >= 0;
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className="tabular font-display text-[1.125rem] text-ink leading-none">
          {value}
        </span>
        {delta !== undefined && Math.abs(delta) > 0.05 && (
          <span className={cn("text-[0.6875rem] tabular font-mono", positive ? "text-positive" : "text-negative")}>
            {positive ? "+" : ""}{delta.toFixed(1)}{deltaSuffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ k, v, tone, bold }: { k: string; v: string; tone?: "positive" | "negative"; bold?: boolean }) {
  return (
    <tr className={cn("border-b border-line last:border-0", bold ? "bg-surface-2" : "")}>
      <td className={cn("py-2 px-3 text-ink-2", bold && "font-semibold text-ink")}>{k}</td>
      <td className={cn(
        "py-2 px-3 text-right tabular font-mono",
        bold ? "font-semibold" : "",
        tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink",
      )}>
        {v}
      </td>
    </tr>
  );
}

function Section({ title, tone, children }: { title: string; tone: "positive" | "negative"; children: React.ReactNode }) {
  return (
    <div>
      <div className={cn(
        "text-[0.6875rem] uppercase tracking-wider font-semibold mb-2",
        tone === "positive" ? "text-positive" : "text-negative",
      )}>
        {title}
      </div>
      <div className="rounded-md border border-line overflow-hidden">{children}</div>
    </div>
  );
}

function RouteRow({ label, occupancy, profit }: { label: string; occupancy: number; profit: number }) {
  return (
    <div className="flex items-center justify-between border-b border-line last:border-0 px-3 py-2 text-[0.8125rem]">
      <span className="font-mono text-ink">{label}</span>
      <span className="tabular text-ink-muted text-[0.75rem]">
        {fmtPct(occupancy * 100, 0)} load
      </span>
      <span className={cn(
        "tabular font-mono font-semibold",
        profit >= 0 ? "text-positive" : "text-negative",
      )}>
        {fmtMoney(profit)}
      </span>
    </div>
  );
}

function PersonRow({ label, prev, next, max, fmt }: { label: string; prev: number; next: number; max: number; fmt: (n: number) => string }) {
  const delta = next - prev;
  const pctOfMax = Math.max(0, Math.min(100, (next / max) * 100));
  const positive = delta >= 0;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[0.8125rem] font-medium text-ink">{label}</span>
        <span className="text-[0.75rem] tabular text-ink-2">
          {fmt(next)}
          {Math.abs(delta) > 0.05 && (
            <span className={cn("ml-2 text-[0.6875rem]", positive ? "text-positive" : "text-negative")}>
              {positive ? "+" : ""}{delta.toFixed(1)}
            </span>
          )}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-[var(--dur-normal)]"
          style={{ width: `${pctOfMax}%` }}
        />
      </div>
    </div>
  );
}
