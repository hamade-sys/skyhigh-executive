"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { fmtMoney, fmtPct, fmtQuarter, getTotalRounds } from "@/lib/format";
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

  // ── Defensive milestone-shown ledger.
  //    The engine's `milestonesEarnedThisQuarter` is a diff between
  //    pre-close and post-close milestone sets, but players have
  //    reported the same milestones surfacing every quarter (e.g. the
  //    "First Cargo Route" stayed showing every Q3). We belt-and-
  //    suspenders this at the UI layer: track every milestone we've
  //    ever shown in localStorage and hide ones we've already paraded
  //    past the player. Result: even if the engine's diff is wrong,
  //    the modal won't repeat itself.
  const SHOWN_KEY = "skyforce:milestonesShown:v1";
  const milestonesShown = useMemo(() => {
    if (typeof window === "undefined") return new Set<string>();
    try {
      const raw = window.localStorage.getItem(SHOWN_KEY);
      if (!raw) return new Set<string>();
      const arr = JSON.parse(raw);
      return new Set<string>(Array.isArray(arr) ? arr : []);
    } catch {
      return new Set<string>();
    }
  }, [result?.milestonesEarnedThisQuarter]);
  const milestonesActuallyNew = useMemo(() => {
    if (!result) return [];
    return result.milestonesEarnedThisQuarter.filter(
      (m) => !milestonesShown.has(m),
    );
  }, [result, milestonesShown]);

  // When the modal renders new milestones, persist them to the shown
  // ledger immediately so any subsequent re-render won't show them
  // again. Effect runs only when the set of "new this time" changes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (milestonesActuallyNew.length === 0) return;
    try {
      const merged = Array.from(new Set([...milestonesShown, ...milestonesActuallyNew]));
      window.localStorage.setItem(SHOWN_KEY, JSON.stringify(merged));
    } catch {
      // Quota errors etc. — non-fatal, just lose dedupe for this turn.
    }
  }, [milestonesActuallyNew, milestonesShown]);

  function continueNext() {
    if (!result) return;
    s.advanceToNext();
    // Phase 3: respect the configured totalRounds — short-format
    // cohorts (8 / 16 / 24) end at their configured stop, not 40.
    if (s.currentQuarter >= getTotalRounds(s)) router.push("/endgame");
  }

  // Top winners + top losers, ranked by DIRECT contribution margin
  // (revenue − fuel − slot) rather than the allocated profit. The
  // allocated number divides team-wide overhead by revenue share,
  // which means a fully-loaded route can show as "losing" simply
  // because the network is sub-scale and can't yet absorb fixed
  // costs. We want this section to surface routes that genuinely
  // can't pay their direct operating costs, not routes that look
  // bad after overhead allocation.
  const { topWinners, topLosers } = useMemo(() => {
    if (!result) return { topWinners: [], topLosers: [] };
    // Skip dormant routes (no operating aircraft) — they aren't really
    // losing money in a "fix this route" sense, they just need
    // aircraft assigned. Surfacing them in the Top Losers list
    // distracts from genuine triage signals (real money-losing routes).
    const withDirect = result.routeBreakdown
      .filter((r) => !r.noOperatingAircraft)
      .map((r) => ({
        ...r,
        direct: r.revenue - r.fuelCost - r.slotCost,
      }));
    const sorted = [...withDirect].sort((a, b) => b.direct - a.direct);
    return {
      // Winners ranked by direct contribution (covers fuel + slot AND
      // throws cash at overhead). Losers are routes that can't even
      // cover their direct costs — those need real triage.
      topWinners: sorted.slice(0, 3).filter((r) => r.direct > 0),
      topLosers: sorted.slice(-3).reverse().filter((r) => r.direct < 0),
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
              {fmtQuarter(result.quarter)} · Quarter closed
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

        {/* Tab strip — proper tablist/tab/tabpanel ARIA so screen readers
            announce "tab N of 6" and arrow-key navigation works as
            expected. The tabpanel association lives on ModalBody below. */}
        <nav
          role="tablist"
          aria-label="Quarter close report sections"
          className="mt-4 -mb-3 flex items-center gap-1 border-b border-line"
        >
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                id={`qc-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`qc-tabpanel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                onKeyDown={(e) => {
                  // Roving tabindex: ←/→ moves through the tab strip
                  // without cycling outside the modal. Wraps at edges.
                  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                  e.preventDefault();
                  const idx = TABS.findIndex((x) => x.id === tab);
                  const next =
                    e.key === "ArrowRight"
                      ? (idx + 1) % TABS.length
                      : (idx - 1 + TABS.length) % TABS.length;
                  setTab(TABS[next].id);
                  // Focus the newly-selected tab so the visible focus
                  // ring follows the user's navigation.
                  const el = document.getElementById(`qc-tab-${TABS[next].id}`);
                  el?.focus();
                }}
                className={cn(
                  "px-3 py-2 text-[0.75rem] font-medium flex items-center gap-1.5",
                  "border-b-2 -mb-px transition-colors duration-[var(--dur-fast)]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface rounded-t",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                <t.Icon size={13} aria-hidden="true" /> {t.label}
              </button>
            );
          })}
        </nav>
      </ModalHeader>

      <ModalBody
        role="tabpanel"
        id={`qc-tabpanel-${tab}`}
        aria-labelledby={`qc-tab-${tab}`}
        className="space-y-5 min-h-[280px]"
      >
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

            <div className="grid grid-cols-2 gap-3">
              <Mini
                label="Brand pts"
                value={result.newBrandPts.toFixed(0)}
                delta={result.newBrandPts - result.prevBrandPts}
              />
              <Mini
                label="Ops pts"
                value={result.newOpsPts.toFixed(0)}
                delta={result.newOpsPts - result.prevOpsPts}
              />
            </div>

            {result.newRoutesActivatedThisQuarter && result.newRoutesActivatedThisQuarter.length > 0 && (
              <div className="rounded-md border border-[var(--positive-soft)] bg-surface px-3 py-2">
                <div className="flex items-center gap-2 text-positive text-[0.6875rem] uppercase tracking-wider font-semibold">
                  <Plane size={13} /> New routes opened this quarter · {result.newRoutesActivatedThisQuarter.length}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {result.newRoutesActivatedThisQuarter.map((r) => (
                    <span
                      key={r.routeId}
                      className="inline-flex items-center gap-1 rounded-md border border-line bg-surface-2 px-2 py-1 text-[0.75rem] text-ink"
                      title={`${r.originName} → ${r.destName}${r.isCargo ? " (cargo)" : ""}`}
                    >
                      <span className="font-mono tabular text-[0.6875rem] text-ink-muted">{r.originCode}</span>
                      <span className="text-ink-muted">→</span>
                      <span className="font-mono tabular text-[0.6875rem] text-ink-muted">{r.destCode}</span>
                      <span className="text-[0.6875rem] text-ink-2">
                        {r.originName} – {r.destName}
                      </span>
                      {r.isCargo && (
                        <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted">cargo</span>
                      )}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {milestonesActuallyNew.length > 0 && (
              <div className="rounded-md border border-[var(--accent-soft-2)] bg-[var(--accent-soft)] px-3 py-2">
                <div className="flex items-center gap-2 text-accent text-[0.6875rem] uppercase tracking-wider font-semibold">
                  <Award size={13} /> Milestones earned this quarter
                </div>
                <div className="mt-1 text-[0.8125rem] text-ink">
                  {milestonesActuallyNew
                    .map((id) => MILESTONES_BY_ID[id]?.title ?? id)
                    .join(" · ")}
                </div>
              </div>
            )}

            {/* Deferred event resolutions — surface on Headline so the
                player sees plot-twist outcomes (S5 government walk-away,
                S4 OPEC drop, etc.) without burying them in the Notes
                tab. Triggered events render with their effect; missed
                ones still show so the player knows the dice rolled. */}
            {result.triggeredEvents.length > 0 && (
              <div className="rounded-md border border-warning bg-[var(--warning-soft)] px-3 py-2 space-y-1.5">
                <div className="flex items-center gap-2 text-warning text-[0.6875rem] uppercase tracking-wider font-semibold">
                  Earlier decision · resolved this quarter
                </div>
                {result.triggeredEvents.map((e) => (
                  <div key={e.id} className="text-[0.8125rem] text-ink-2">
                    <span className="font-mono text-primary mr-2">{e.scenario}</span>
                    {e.note}
                    <span
                      className={cn(
                        "ml-2 font-semibold",
                        e.outcome === "triggered"
                          ? (typeof e.cashDelta === "number" && e.cashDelta < 0)
                            ? "text-negative"
                            : "text-positive"
                          : "text-ink-muted",
                      )}
                    >
                      · {e.outcome === "triggered" ? "fired" : "missed"}
                    </span>
                    {typeof e.cashDelta === "number" && e.cashDelta !== 0 && (
                      <span
                        className={cn(
                          "ml-1 tabular font-mono",
                          e.cashDelta > 0 ? "text-positive" : "text-negative",
                        )}
                      >
                        {e.cashDelta > 0 ? "+" : ""}{fmtMoney(e.cashDelta)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.newRcfBalance > 0 && (
              <div className="text-[0.8125rem] rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)] text-warning px-3 py-2">
                Revolving Credit Facility drawn: <span className="tabular font-mono font-semibold">{fmtMoney(result.newRcfBalance)}</span>. Interest at 2× base rate applies next quarter.
              </div>
            )}

            {/* Dormant routes warning — slots leased but no aircraft
                assigned, so the route is silently doing nothing. We
                surface this on the headline tab so it can't be missed
                buried in the All Routes table. */}
            {(() => {
              const dormantCount = result.routeBreakdown.filter((r) => r.noOperatingAircraft).length;
              if (dormantCount === 0) return null;
              return (
                <div className="text-[0.8125rem] rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)] text-warning px-3 py-2">
                  <span className="font-semibold">⚠ {dormantCount} active route{dormantCount === 1 ? "" : "s"} with no aircraft assigned.</span>{" "}
                  Slots are leased but no flights are operating. Either
                  assign aircraft from the Routes panel or close the route
                  to stop paying for unused slots.
                </div>
              );
            })()}
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
                // Pick the strongest category (by absolute value) per
                // city — a cargo-only +50% news otherwise averaged to
                // pct=17 and rendered as a weak "+17% blended" chip
                // that didn't match the headline's intensity. Now the
                // chip shows the actual headline category.
                type ChipDatum = {
                  code: string;
                  category: string;
                  pct: number;
                };
                const chips: ChipDatum[] = n.cities.map((c) => {
                  const tourism = c.tourism ?? 0;
                  const business = c.business ?? 0;
                  const cargo = c.cargo ?? 0;
                  // Find dominant category by absolute magnitude. If
                  // every category is non-zero (an "all" wildcard
                  // modifier), fall back to the blended pct.
                  const candidates = [
                    { cat: "tourism", v: tourism },
                    { cat: "business", v: business },
                    { cat: "cargo", v: cargo },
                  ].filter((x) => x.v !== 0);
                  if (candidates.length === 0) {
                    return { code: c.code, category: "", pct: c.pct };
                  }
                  if (candidates.length >= 3) {
                    // All three categories non-zero → "all" event;
                    // single chip with the blended value.
                    return { code: c.code, category: "all", pct: c.pct };
                  }
                  candidates.sort((a, b) => Math.abs(b.v) - Math.abs(a.v));
                  return { code: c.code, category: candidates[0].cat, pct: candidates[0].v };
                });
                // "Net" summary uses the dominant category sums so a
                // cargo-only +250% (5 cities × +50) shows as
                // "Net +250% cargo" rather than "+83% blended".
                const netPct = chips.reduce((s, c) => s + c.pct, 0);
                const positive = netPct >= 0;
                // Pick the most common chip category for the net label.
                const catCounts = chips.reduce<Record<string, number>>((acc, c) => {
                  if (c.category) acc[c.category] = (acc[c.category] ?? 0) + 1;
                  return acc;
                }, {});
                const dominantCat = Object.entries(catCounts)
                  .sort((a, b) => b[1] - a[1])[0]?.[0];
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
                        {fmtQuarter(n.quarter)}
                      </span>
                    </div>
                    <h3 className="text-[0.9375rem] font-medium text-ink leading-snug">
                      {n.headline}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5 items-baseline">
                      {chips.map((c) => (
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
                          {c.category && c.category !== "all" && (
                            <span className="opacity-60 ml-1">
                              {c.category}
                            </span>
                          )}
                        </span>
                      ))}
                      <span
                        className={cn(
                          "ml-auto text-[0.6875rem] uppercase tracking-wider font-semibold",
                          positive ? "text-positive" : "text-negative",
                        )}
                      >
                        Net {positive ? "+" : ""}{netPct}%
                        {dominantCat && dominantCat !== "all" && (
                          <span className="ml-1 opacity-70 normal-case">
                            {dominantCat}
                          </span>
                        )}
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
                  // Disambiguate same-OD passenger + cargo routes by
                  // tagging the cargo one. Earlier the player saw two
                  // "DXB → LHR" rows in the digest with different
                  // metrics and reasonably wondered which was which.
                  const label = route
                    ? `${route.originCode} → ${route.destCode}${route.isCargo ? " · cargo" : ""}`
                    : r.routeId;
                  return (
                    <RouteRow
                      key={r.routeId}
                      label={label}
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
                  const label = route
                    ? `${route.originCode} → ${route.destCode}${route.isCargo ? " · cargo" : ""}`
                    : r.routeId;
                  return (
                    <RouteRow
                      key={r.routeId}
                      label={label}
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
                    <th className="text-right font-semibold text-ink-muted uppercase tracking-wider text-[0.625rem] py-2 px-3">Occupancy</th>
                    <th className="text-right font-semibold text-ink-muted uppercase tracking-wider text-[0.625rem] py-2 px-3">Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {result.routeBreakdown.map((r) => {
                    const route = player.routes.find((x) => x.id === r.routeId);
                    const dormant = r.noOperatingAircraft;
                    return (
                      <tr
                        key={r.routeId}
                        className={cn(
                          "border-t border-line",
                          dormant && "bg-[var(--warning-soft)]/30",
                        )}
                      >
                        <td className="py-2 px-3 text-ink font-mono">
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span>
                              {route ? `${route.originCode} → ${route.destCode}` : r.routeId}
                            </span>
                            {route?.isCargo && (
                              <span className="text-[0.5625rem] uppercase tracking-wider font-bold text-ink-muted">
                                cargo
                              </span>
                            )}
                            {dormant && (
                              <span
                                className="text-[0.5625rem] uppercase tracking-wider font-bold text-warning"
                                title="Active route with no operating aircraft assigned. Slots are leased but no flights are scheduled. Assign aircraft from Routes panel or close the route."
                              >
                                no aircraft
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2 px-3 text-right tabular">
                          {dormant ? (
                            <span className="text-ink-muted">—</span>
                          ) : (
                            fmtPct(r.occupancy * 100, 0)
                          )}
                        </td>
                        <td
                          className={cn(
                            "py-2 px-3 text-right tabular font-medium",
                            dormant
                              ? "text-ink-muted"
                              : r.profit >= 0
                                ? "text-positive"
                                : "text-negative",
                          )}
                        >
                          {dormant ? "—" : fmtMoney(r.profit)}
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
              Brand and Ops drive your <strong>Brand multiplier</strong> on top of net equity.
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
          {result.quarter >= getTotalRounds(s) ? "See endgame →" : "Continue to next quarter →"}
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
        {fmtPct(occupancy * 100, 0)} occupancy
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
