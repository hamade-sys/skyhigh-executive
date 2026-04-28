"use client";

import { useMemo, useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import {
  computeAirlineValue,
  effectiveBorrowingRate,
  maxBorrowingUsd,
  runQuarterClose,
} from "@/lib/engine";
import { loanDisplayName } from "@/lib/bank-names";
import { cn } from "@/lib/cn";

/**
 * Financials report — three blocks:
 *  1. Balance sheet  · cash, debt, airline value, debt-ratio covenant.
 *  2. Borrowing      · current loans, refinance, repay actions.
 *  3. P&L statements · Last closed quarter + Projected next quarter,
 *                      side-by-side income statement with explicit
 *                      sliders broken out + Taxes & Government Levies
 *                      bucket (income tax + carbon levy + departure
 *                      tax + fuel excise + S5 obligation fines).
 *  4. P&L history    · expandable per-quarter income-statement rows.
 *  5. Trajectory     · brand / loyalty / ops trend lines with X-axis
 *                      labels (was previously a label-less sparkline).
 */
export function FinancialsPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState(50_000_000);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!player) return null;

  const airlineValue = computeAirlineValue(player);
  const debtRatio = airlineValue > 0 ? (player.totalDebtUsd / airlineValue) * 100 : 0;
  const rate = effectiveBorrowingRate(player, s.baseInterestRatePct);
  const maxBorrow = maxBorrowingUsd(player);
  const last = player.financialsByQuarter.at(-1);

  function confirmBorrow() {
    if (borrowAmount > maxBorrow) { setError(`Max is ${fmtMoney(maxBorrow)}`); return; }
    if (borrowAmount < 1_000_000) { setError("Minimum $1M"); return; }
    const r = s.borrowCapital(borrowAmount);
    if (!r.ok) { setError(r.error ?? "Failed"); return; }
    setBorrowOpen(false); setError(null);
  }

  // Loan covenant signals based on debt ratio.
  const covenant: { tone: "info" | "warn" | "neg" | null; label: string; detail: string } =
    debtRatio < 25
      ? { tone: null, label: "", detail: "" }
      : debtRatio < 35
        ? { tone: "info", label: "Leverage building",
            detail: "Borrowing rate is carrying a credit premium. Growth debt is still usable, but headroom is tightening." }
        : debtRatio < 45
          ? { tone: "warn", label: "High leverage",
              detail: "Lenders are close to the borrowing cap. More debt may be blocked until equity or cash flow improves." }
          : { tone: "neg", label: "Covenant breach",
              detail: "Debt is beyond the safe covenant band. New borrowing is likely blocked and refinancing will price at distressed rates." };

  // ── Cash runway: how many quarters of cash at current burn rate.
  //    Burn rate = max(0, last quarter's cost − revenue). If the
  //    airline is profitable, runway is "indefinite" (∞). The display
  //    caps at 24Q (6 years) so the bar doesn't render off-screen.
  const lastNetCashFlow = last ? last.revenue - last.costs : 0;
  const burnPerQ = lastNetCashFlow < 0 ? -lastNetCashFlow : 0;
  const runwayQ = burnPerQ > 0 ? Math.floor(player.cashUsd / burnPerQ) : Infinity;
  const runwayCappedQ = runwayQ === Infinity ? 24 : Math.min(runwayQ, 24);
  const runwayTone: "pos" | "neg" | "warn" | "neutral" =
    runwayQ === Infinity ? "pos" :
    runwayQ <= 2 ? "neg" :
    runwayQ <= 6 ? "warn" : "neutral";

  return (
    <div className="space-y-4">
      {/* ── 1. Balance sheet ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Balance sheet
          </div>
          <div className="text-[0.6875rem] tabular text-ink-muted">
            as of <strong className="text-ink">{fmtQuarter(s.currentQuarter)}</strong>
          </div>
        </div>
        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Cash" v={fmtMoney(player.cashUsd)} />
          <Row k="Fleet book value" v={fmtMoney(player.fleet.reduce((s, f) => s + f.bookValue, 0))} />
          <Row k="Total debt" v={fmtMoney(player.totalDebtUsd)} tone="neg" />
          <Row k="Airline value" v={fmtMoney(airlineValue)} bold />
          <Row k="Debt ratio" v={`${debtRatio.toFixed(1)}%`} tone={covenant.tone === "neg" ? "neg" : undefined} />
        </div>

        {/* ── Visual covenant gauge — replaces the older text-only
            covenant block with a horizontal bar from 0-100% debt ratio,
            with shaded thresholds at 30/50/70 and a marker showing
            current position. Colour follows the covenant tone. */}
        <CovenantGauge
          debtRatio={debtRatio}
          tone={covenant.tone}
          label={covenant.label}
          detail={covenant.detail}
        />

        {/* ── Cash runway gauge — months of cash at the most recent
            burn rate. If the airline is profitable, runway is
            "indefinite" and the bar renders fully positive. Helps
            the player gauge how aggressively they can spend. */}
        <CashRunwayGauge
          quarters={runwayQ}
          cappedQ={runwayCappedQ}
          tone={runwayTone}
          burnPerQ={burnPerQ}
        />
      </section>

      {/* ── 2. Borrowing ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Borrowing</div>
          <Button size="sm" variant="primary" onClick={() => setBorrowOpen(true)}>
            Borrow →
          </Button>
        </div>

        {/* ── Overdraft refi CTA — only renders when cash is negative.
            The RCF auto-draws to cover the gap at 2× the base rate
            (very expensive); this lets the player convert the
            overdraft into a fresh term loan at the standard
            covenant-adjusted rate. */}
        {player.cashUsd < 0 && (
          <div className="rounded-md border border-negative bg-[var(--negative-soft)] p-3 mb-3 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold text-negative text-[0.8125rem]">
                Overdraft active · {fmtMoney(-player.cashUsd)}
              </div>
              <div className="text-[0.6875rem] tabular font-mono text-negative">
                paying ~{(s.baseInterestRatePct * 2).toFixed(1)}% RCF rate
              </div>
            </div>
            <p className="text-[0.75rem] text-ink-2 leading-snug">
              Your revolving credit facility is bridging the negative
              balance at a penalty rate. Refinancing converts the
              overdraft into a regular term loan at your effective
              borrowing rate ({rate.toFixed(1)}%) — same payback profile
              as a normal loan, much lower interest while it sits.
            </p>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                const r = s.refinanceOverdraft();
                if (!r.ok) setError(r.error ?? "Refi failed");
              }}
              title={`Convert ${fmtMoney(Math.ceil(-player.cashUsd / 1_000_000) * 1_000_000)} into a term loan at ${rate.toFixed(1)}%`}
            >
              Refinance overdraft →
            </Button>
          </div>
        )}

        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Base rate" v={`${s.baseInterestRatePct.toFixed(1)}%`} />
          <Row k="Your effective rate" v={`${rate.toFixed(2)}%`} bold />
          <Row k="Max borrowing" v={fmtMoney(maxBorrow)} />
          {player.loans.length > 0 && (
            <div className="mt-3 pt-2 border-t border-line space-y-1.5">
              <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                Active facilities · {player.loans.length}
              </div>
              {player.loans.map((loan) => {
                const canRepay = player.cashUsd >= loan.remainingPrincipal;
                const newRateAvailable = effectiveBorrowingRate(player, s.baseInterestRatePct);
                const refiSavings = loan.ratePct - newRateAvailable;
                const canRefi = refiSavings >= 0.25 && player.cashUsd >= loan.remainingPrincipal * 0.01;
                // Quarterly cost = remaining × annual rate / 4. This is
                // the actual interest the engine charges via
                // quarterlyInterestUsd, surfaced per-loan so the player
                // can see which facility is most expensive.
                const quarterlyCost = loan.remainingPrincipal * (loan.ratePct / 100) / 4;
                return (
                  <div key={loan.id} className="rounded-md border border-line bg-surface px-2.5 py-2">
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className="min-w-0">
                        <div className="font-semibold text-ink text-[0.8125rem] truncate">
                          {loanDisplayName(loan)}
                        </div>
                        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
                          <span>Originated {fmtQuarter(loan.originQuarter)}</span>
                          {loan.source === "overdraft-refi" && (
                            <span className="text-warning bg-[var(--warning-soft)] px-1 py-0.5 rounded text-[0.5625rem] font-semibold">
                              Overdraft refi
                            </span>
                          )}
                          {loan.govBacked && (
                            <span className="text-positive bg-[var(--positive-soft)] px-1 py-0.5 rounded text-[0.5625rem] font-semibold">
                              Gov-backed
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="tabular font-mono text-ink font-semibold text-[0.875rem]">
                          {fmtMoney(loan.remainingPrincipal)}
                        </div>
                        <div className="text-[0.625rem] tabular font-mono text-ink-muted">
                          @ {loan.ratePct.toFixed(2)}% · {fmtMoney(quarterlyCost)}/Q
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={!canRepay}
                        title={canRepay ? "Pay off in full" : `Need ${fmtMoney(loan.remainingPrincipal - player.cashUsd)} more cash`}
                        onClick={() => {
                          const r = s.repayLoan(loan.id);
                          if (!r.ok) setError(r.error ?? "Repay failed");
                        }}
                      >
                        Repay
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canRefi}
                        title={canRefi
                          ? `Refi to ${newRateAvailable.toFixed(1)}% (1% fee)`
                          : refiSavings < 0.25
                            ? "Current rate too close to your effective rate to refi"
                            : "Need cash for 1% fee"}
                        onClick={() => {
                          const r = s.refinanceLoan(loan.id);
                          if (!r.ok) setError(r.error ?? "Refi failed");
                        }}
                      >
                        Refi → {newRateAvailable.toFixed(1)}%
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* ── 3. P&L statements ── */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          P&amp;L · most recent + projected
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {last && <PLCard title={`Closed · ${fmtQuarter(last.quarter)}`} pl={last} />}
          <ProjectedPLCard />
        </div>
      </section>

      {/* ── 3.5 Cash-flow statement — last 4 quarters of operating /
          investing / financing activity. Investing CF is derived as
          the residual that reconciles cash delta against operating +
          financing, so it absorbs CapEx, M&A, and any non-trivial
          one-off cash movements without needing per-line storage. */}
      {player.financialsByQuarter.length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Cash flow · last {Math.min(4, player.financialsByQuarter.length)} quarter
            {Math.min(4, player.financialsByQuarter.length) === 1 ? "" : "s"}
          </div>
          <CashflowCard rows={player.financialsByQuarter} />
        </section>
      )}

      {/* ── 4. P&L history (expandable) ── */}
      {player.financialsByQuarter.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center justify-between w-full text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2 hover:text-ink"
            aria-expanded={historyOpen}
          >
            <span>Quarterly P&amp;L history · {player.financialsByQuarter.length} quarter{player.financialsByQuarter.length === 1 ? "" : "s"}</span>
            <span className="text-[0.625rem] text-ink-muted">{historyOpen ? "Hide ▴" : "Show full ▾"}</span>
          </button>
          {historyOpen ? (
            <PLHistoryTable rows={player.financialsByQuarter} />
          ) : (
            <div className="rounded-md border border-line overflow-hidden">
              <table className="w-full text-[0.75rem]">
                <thead>
                  <tr className="bg-surface-2 border-b border-line">
                    <Th>Quarter</Th>
                    <Th className="text-right">Revenue</Th>
                    <Th className="text-right">Net profit</Th>
                    <Th className="text-right">Cash</Th>
                    <Th className="text-right">Debt</Th>
                  </tr>
                </thead>
                <tbody>
                  {player.financialsByQuarter.slice(-6).map((q) => (
                    <tr key={q.quarter} className="border-b border-line last:border-0">
                      <Td className="font-mono">{fmtQuarter(q.quarter)}</Td>
                      <Td className="text-right tabular font-mono">{fmtMoney(q.revenue)}</Td>
                      <Td className={`text-right tabular font-mono ${q.netProfit >= 0 ? "text-positive" : "text-negative"}`}>
                        {fmtMoney(q.netProfit)}
                      </Td>
                      <Td className="text-right tabular font-mono">{fmtMoney(q.cash)}</Td>
                      <Td className="text-right tabular font-mono">{q.debt > 0 ? fmtMoney(q.debt) : <span className="text-ink-muted">—</span>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Tax loss carryforward — only show if there's anything pending. */}
      {(player.taxLossCarryForward ?? []).length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Tax loss carryforward · 5-quarter expiry
          </div>
          <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-1.5">
            {(() => {
              const total = player.taxLossCarryForward.reduce((sum, e) => sum + e.amount, 0);
              return (
                <>
                  <div className="flex items-baseline justify-between text-[0.875rem]">
                    <span className="font-semibold text-ink">Available offset</span>
                    <span className="tabular font-mono text-ink font-semibold">
                      {fmtMoney(total)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    {[...player.taxLossCarryForward]
                      .sort((a, b) => a.quarter - b.quarter)
                      .map((e) => {
                        const expiresIn = Math.max(0, 5 - (s.currentQuarter - e.quarter));
                        return (
                          <div key={e.quarter} className="flex items-baseline justify-between text-[0.6875rem] tabular font-mono">
                            <span className="text-ink-muted">
                              Q{e.quarter} loss · expires in {expiresIn}Q
                            </span>
                            <span className="text-ink">{fmtMoney(e.amount)}</span>
                          </div>
                        );
                      })}
                  </div>
                  <div className="text-[0.6875rem] text-ink-muted leading-relaxed pt-1.5 border-t border-line">
                    Profitable quarters consume oldest losses first to reduce
                    your 20% corporate tax bill. Losses older than 5 quarters
                    expire unused.
                  </div>
                </>
              );
            })()}
          </div>
        </section>
      )}

      {/* ── 5. Trajectory charts with X-axis labels ── */}
      {player.financialsByQuarter.length >= 2 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Brand · Loyalty · Ops trajectory
          </div>
          <div className="rounded-md border border-line bg-surface p-3 space-y-3">
            <TrendRow
              label="Brand pts"
              series={player.financialsByQuarter.map((q) => ({ q: q.quarter, v: q.brandPts ?? 0 }))}
              color="#1E6B5C"
              suffix=""
              max={100}
            />
            <TrendRow
              label="Loyalty %"
              series={player.financialsByQuarter.map((q) => ({ q: q.quarter, v: q.loyalty ?? 0 }))}
              color="#0072B5"
              suffix="%"
              max={100}
            />
            <TrendRow
              label="Ops pts"
              series={player.financialsByQuarter.map((q) => ({ q: q.quarter, v: q.opsPts ?? 0 }))}
              color="#C46E27"
              suffix=""
              max={100}
            />
          </div>
        </section>
      )}

      <Modal open={borrowOpen} onClose={() => { setBorrowOpen(false); setError(null); }}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">Borrow capital</h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            Rate <span className="tabular font-mono text-ink">{rate.toFixed(2)}%</span> · Max <span className="tabular font-mono text-ink">{fmtMoney(maxBorrow)}</span>
          </p>
        </ModalHeader>
        <ModalBody className="space-y-4">
          <div>
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Amount</div>
            <Input type="number" value={borrowAmount} onChange={(e) => setBorrowAmount(parseInt(e.target.value, 10) || 0)} />
            <div className="text-[0.75rem] text-ink-muted mt-1">= {fmtMoney(borrowAmount)}</div>
          </div>
          {error && <div className="text-negative text-[0.875rem]">{error}</div>}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setBorrowOpen(false); setError(null); }}>Cancel</Button>
          <Button variant="primary" onClick={confirmBorrow}>Confirm</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/** Projected next-quarter P&L card — runs a dry close against the
 *  current player state so the player sees what a continuation will
 *  cost before pressing Next Quarter. Same layout as the closed-quarter
 *  card so the two read symmetrically. */
function ProjectedPLCard() {
  const s = useGame();
  const player = selectPlayer(s);
  const projected = useMemo(() => {
    if (!player) return null;
    const clone = {
      ...player,
      flags: new Set(player.flags),
      deferredEvents: [...(player.deferredEvents ?? [])],
      fleet: player.fleet.map((f) => ({ ...f })),
      routes: player.routes.map((r) => ({ ...r })),
    };
    return runQuarterClose(clone as typeof player, {
      baseInterestRatePct: s.baseInterestRatePct,
      fuelIndex: s.fuelIndex,
      quarter: s.currentQuarter,
      worldCupHostCode: s.worldCupHostCode,
      olympicHostCode: s.olympicHostCode,
    });
  }, [
    player,
    s.baseInterestRatePct,
    s.fuelIndex,
    s.currentQuarter,
    s.worldCupHostCode,
    s.olympicHostCode,
  ]);

  if (!projected || !player) return null;

  // Map the QuarterCloseResult to the same shape PLCard expects.
  const plRow = {
    quarter: s.currentQuarter,
    cash: projected.newCashUsd,
    debt: player.totalDebtUsd,
    revenue: projected.revenue,
    passengerRevenue: projected.passengerRevenue,
    cargoRevenue: projected.cargoRevenue,
    airportRevenue: projected.airportRevenueUsd,
    subsidiaryRevenue: projected.subsidiaryRevenueUsd,
    leaseFeesUsd: projected.leaseFeesUsd,
    costs: projected.revenue - projected.netProfit,
    fuelCost: projected.fuelCost,
    slotCost: projected.slotCost,
    staffCost: projected.staffCost,
    otherSliderCost: projected.otherSliderCost,
    marketingCost: projected.marketingCost,
    serviceCost: projected.serviceCost,
    operationsCost: projected.operationsCost,
    customerServiceCost: projected.customerServiceCost,
    maintenanceCost: projected.maintenanceCost,
    insuranceCost: projected.insuranceCost,
    depreciation: projected.depreciation,
    interest: projected.interest + projected.rcfInterest,
    taxesAndLevies:
      projected.tax + projected.carbonLevy +
      projected.passengerTax + projected.fuelExcise +
      projected.obligationFinesUsd,
    obligationFinesUsd: projected.obligationFinesUsd,
    netProfit: projected.netProfit,
    brandPts: projected.newBrandPts,
    opsPts: projected.newOpsPts,
    loyalty: projected.newLoyalty,
    brandValue: projected.newBrandValue,
  };
  return <PLCard title={`Projected · ${fmtQuarter(s.currentQuarter)}`} pl={plRow} projected />;
}

/** A single quarter's P&L laid out as an income statement.
 *  Same shape used for both "Closed" and "Projected" cards so the two
 *  read side-by-side. Optional fields fall back to "—" so older saves
 *  that don't carry the breakdown still render cleanly. */
function PLCard({
  title, pl, projected = false,
}: {
  title: string;
  pl: NonNullable<ReturnType<typeof selectPlayer>>["financialsByQuarter"][number];
  projected?: boolean;
}) {
  const fmtOpt = (n: number | undefined) =>
    typeof n === "number" ? fmtMoney(n) : "—";
  const otherTotal =
    (pl.marketingCost ?? 0) + (pl.serviceCost ?? 0) +
    (pl.operationsCost ?? 0) + (pl.customerServiceCost ?? 0);
  const hasOtherBreakdown = otherTotal > 0 || (pl.marketingCost !== undefined);
  return (
    <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
      <div className="flex items-baseline justify-between mb-2">
        <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-ink">
          {title}
        </span>
        {projected && (
          <span className="text-[0.5625rem] uppercase tracking-wider text-accent font-semibold">
            Estimate
          </span>
        )}
      </div>

      <SubHeader>Revenue</SubHeader>
      <Row k="Passenger" v={fmtOpt(pl.passengerRevenue)} tone="pos" />
      <Row k="Cargo" v={fmtOpt(pl.cargoRevenue)} tone="pos" />
      {(pl.airportRevenue ?? 0) !== 0 && (
        <Row k="Airport (owned)" v={fmtOpt(pl.airportRevenue)} tone="pos" />
      )}
      {(pl.subsidiaryRevenue ?? 0) !== 0 && (
        <Row k="Subsidiaries" v={fmtOpt(pl.subsidiaryRevenue)} tone="pos" />
      )}
      <div className="pt-1 border-t border-line/60">
        <Row k="Total revenue" v={fmtMoney(pl.revenue)} tone="pos" bold />
      </div>

      <SubHeader>Operating costs</SubHeader>
      <Row k="Fuel" v={fmtOpt(pl.fuelCost)} tone="neg" />
      <Row k="Slot fees" v={fmtOpt(pl.slotCost)} tone="neg" />
      <Row k="Staff" v={fmtOpt(pl.staffCost)} tone="neg" />
      {(pl.leaseFeesUsd ?? 0) > 0 && (
        <Row k="Lease fees" v={fmtOpt(pl.leaseFeesUsd)} tone="neg" />
      )}
      <Row k="Maintenance + hub" v={fmtOpt(pl.maintenanceCost)} tone="neg" />
      <Row k="Aircraft insurance" v={fmtOpt(pl.insuranceCost)} tone="neg" />
      {hasOtherBreakdown ? (
        <>
          <SubHeader nested>Slider spend (% revenue)</SubHeader>
          <Row k="  Marketing" v={fmtOpt(pl.marketingCost)} tone="neg" />
          <Row k="  In-flight service" v={fmtOpt(pl.serviceCost)} tone="neg" />
          <Row k="  Operations" v={fmtOpt(pl.operationsCost)} tone="neg" />
          <Row k="  Customer service" v={fmtOpt(pl.customerServiceCost)} tone="neg" />
        </>
      ) : (
        <Row k="Other slider spend" v={fmtOpt(pl.otherSliderCost)} tone="neg" />
      )}

      <SubHeader>Non-operating</SubHeader>
      <Row k="Depreciation" v={fmtOpt(pl.depreciation)} tone="neg" />
      <Row k="Debt interest" v={fmtOpt(pl.interest)} tone="neg" />

      <SubHeader>Taxes &amp; government levies</SubHeader>
      <Row k="Total taxes &amp; levies" v={fmtOpt(pl.taxesAndLevies)} tone="neg" bold />
      {(pl.obligationFinesUsd ?? 0) > 0 && (
        <Row
          k="  └─ Service-obligation fines"
          v={fmtOpt(pl.obligationFinesUsd)}
          tone="neg"
        />
      )}

      <div className="mt-3 pt-2 border-t border-line">
        <Row
          k={projected ? "Projected net profit" : "Net profit"}
          v={fmtMoney(pl.netProfit)}
          tone={pl.netProfit >= 0 ? "pos" : "neg"}
          bold
        />
      </div>
    </div>
  );
}

/** Full P&L history table — every quarter as a column, line items as
 *  rows. The "Show full" toggle in the parent collapses this when the
 *  campaign gets long; the default 6-quarter table is shown until then. */
function PLHistoryTable({
  rows,
}: {
  rows: NonNullable<ReturnType<typeof selectPlayer>>["financialsByQuarter"];
}) {
  if (rows.length === 0) return null;
  const cols = rows.slice().sort((a, b) => a.quarter - b.quarter);

  type Line = {
    label: string;
    pick: (q: typeof cols[number]) => number | undefined;
    tone?: "pos" | "neg";
    indent?: boolean;
    bold?: boolean;
    section?: string;
  };
  const lines: Line[] = [
    { label: "Passenger revenue", pick: (q) => q.passengerRevenue, tone: "pos", section: "Revenue" },
    { label: "Cargo revenue", pick: (q) => q.cargoRevenue, tone: "pos" },
    { label: "Total revenue", pick: (q) => q.revenue, tone: "pos", bold: true },
    { label: "Fuel", pick: (q) => q.fuelCost, tone: "neg", section: "Operating costs" },
    { label: "Slot fees", pick: (q) => q.slotCost, tone: "neg" },
    { label: "Staff", pick: (q) => q.staffCost, tone: "neg" },
    { label: "Marketing", pick: (q) => q.marketingCost, tone: "neg", indent: true },
    { label: "In-flight service", pick: (q) => q.serviceCost, tone: "neg", indent: true },
    { label: "Operations", pick: (q) => q.operationsCost, tone: "neg", indent: true },
    { label: "Customer service", pick: (q) => q.customerServiceCost, tone: "neg", indent: true },
    { label: "Maintenance + hub", pick: (q) => q.maintenanceCost, tone: "neg" },
    { label: "Aircraft insurance", pick: (q) => q.insuranceCost, tone: "neg" },
    { label: "Depreciation", pick: (q) => q.depreciation, tone: "neg", section: "Non-operating" },
    { label: "Debt interest", pick: (q) => q.interest, tone: "neg" },
    { label: "Taxes & levies", pick: (q) => q.taxesAndLevies, tone: "neg", section: "Taxes" },
    { label: "  └─ Obligation fines", pick: (q) => q.obligationFinesUsd, tone: "neg", indent: true },
    { label: "Net profit", pick: (q) => q.netProfit, bold: true, section: "Bottom line" },
    { label: "Cash position", pick: (q) => q.cash, section: "Balance sheet" },
    { label: "Debt", pick: (q) => q.debt, tone: "neg" },
  ];

  return (
    <div className="rounded-md border border-line overflow-x-auto">
      <table className="w-full text-[0.75rem]">
        <thead>
          <tr className="bg-surface-2 border-b border-line">
            <Th className="sticky left-0 z-10 bg-surface-2">Line item</Th>
            {cols.map((q) => (
              <Th key={q.quarter} className="text-right tabular font-mono">{fmtQuarter(q.quarter)}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, i) => {
            const prevSection = i === 0 ? null : lines[i - 1].section;
            const showSectionHeader = line.section && line.section !== prevSection;
            return (
              <>
                {showSectionHeader && (
                  <tr key={`s-${i}`} className="bg-surface-2/60">
                    <td colSpan={cols.length + 1} className="px-2 py-1 text-[0.5625rem] uppercase tracking-wider font-semibold text-ink-muted">
                      {line.section}
                    </td>
                  </tr>
                )}
                <tr key={i} className="border-b border-line/40 last:border-0">
                  <Td className={`sticky left-0 bg-surface ${line.indent ? "pl-6" : ""} ${line.bold ? "font-semibold text-ink" : "text-ink-2"}`}>
                    {line.label}
                  </Td>
                  {cols.map((q) => {
                    const v = line.pick(q);
                    const cls =
                      typeof v !== "number" ? "text-ink-muted"
                      : line.tone === "pos" ? "text-positive"
                      : line.tone === "neg" ? "text-negative"
                      : v < 0 ? "text-negative"
                      : "text-ink";
                    return (
                      <Td key={q.quarter} className={`text-right tabular font-mono ${cls} ${line.bold ? "font-semibold" : ""}`}>
                        {typeof v === "number" ? fmtMoney(v) : "—"}
                      </Td>
                    );
                  })}
                </tr>
              </>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Cash flow statement — last 4 closed quarters as columns, classic
 * three-section layout (Operating · Investing · Financing → Net
 * change in cash → cash end of period).
 *
 * Operating CF is built from line items on the financialsByQuarter
 * row (revenue minus operating costs minus taxes). Financing CF
 * shows the debt delta minus interest paid. Investing is the
 * residual: cashDelta − operatingCF − financingCF — anything not
 * accounted for elsewhere is by definition CapEx + M&A + other
 * non-operating cash movements.
 *
 * Older saves can omit cost breakdowns (everything was bundled into
 * `costs`). For those rows we approximate operating CF from
 * netProfit + interest (interest is reclassified to Financing).
 */
function CashflowCard({
  rows,
}: {
  rows: Array<{
    quarter: number;
    cash: number;
    debt: number;
    revenue: number;
    costs: number;
    fuelCost?: number;
    slotCost?: number;
    staffCost?: number;
    leaseFeesUsd?: number;
    otherSliderCost?: number;
    marketingCost?: number;
    serviceCost?: number;
    operationsCost?: number;
    customerServiceCost?: number;
    maintenanceCost?: number;
    insuranceCost?: number;
    depreciation?: number;
    interest?: number;
    taxesAndLevies?: number;
    netProfit: number;
  }>;
}) {
  // Last 4 closed quarters, oldest → newest left to right.
  const visible = rows.slice(-4);
  if (visible.length === 0) return null;

  type CFColumn = {
    quarter: number;
    operatingCF: number;
    financingCF: number;
    investingCF: number;
    netChange: number;
    endingCash: number;
    // Reusable subtotals so the rows below render their own breakdown.
    revenue: number;
    operatingOutflows: number;
    interest: number;
    debtDelta: number;
  };

  const cols: CFColumn[] = visible.map((r, i) => {
    // Operating outflows: every cost EXCEPT depreciation (non-cash) and
    // interest (financing). Falls back to (costs - depreciation) when
    // breakdown fields are missing on older rows. Interest is broken
    // out separately so the financing section can deduct it.
    const breakdown =
      (r.fuelCost ?? 0) +
      (r.slotCost ?? 0) +
      (r.staffCost ?? 0) +
      (r.leaseFeesUsd ?? 0) +
      (r.marketingCost ?? r.otherSliderCost ?? 0) +
      (r.serviceCost ?? 0) +
      (r.operationsCost ?? 0) +
      (r.customerServiceCost ?? 0) +
      (r.maintenanceCost ?? 0) +
      (r.insuranceCost ?? 0) +
      (r.taxesAndLevies ?? 0);
    const interest = r.interest ?? 0;
    // If no breakdown was persisted, fall back to (costs - depreciation
    // - interest) which still excludes the two non-operating items.
    const operatingOutflows = breakdown > 0
      ? breakdown
      : Math.max(0, r.costs - (r.depreciation ?? 0) - interest);
    const operatingCF = r.revenue - operatingOutflows;

    // Financing CF: net new debt this quarter minus interest paid.
    // Prior row (or 0 for the first visible) gives the debt baseline.
    const prevDebt = i === 0
      ? rows[rows.length - visible.length - 1]?.debt ?? 0
      : visible[i - 1].debt;
    const debtDelta = r.debt - prevDebt;
    const financingCF = debtDelta - interest;

    // Investing CF as residual against the cash change. Earlier rows
    // never tracked CapEx separately, so this is the cleanest way to
    // surface "where else did cash go" without retroactive ledger work.
    const prevCash = i === 0
      ? rows[rows.length - visible.length - 1]?.cash ?? r.cash - r.netProfit
      : visible[i - 1].cash;
    const netChange = r.cash - prevCash;
    const investingCF = netChange - operatingCF - financingCF;

    return {
      quarter: r.quarter,
      operatingCF,
      financingCF,
      investingCF,
      netChange,
      endingCash: r.cash,
      revenue: r.revenue,
      operatingOutflows,
      interest,
      debtDelta,
    };
  });

  return (
    <div className="rounded-md border border-line overflow-hidden text-[0.75rem]">
      <table className="w-full">
        <thead>
          <tr className="bg-surface-2 border-b border-line">
            <Th className="w-[35%]">Cash flow line</Th>
            {cols.map((c) => (
              <Th key={c.quarter} className="text-right">
                {fmtQuarter(c.quarter)}
              </Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Operating section */}
          <tr className="border-t border-line">
            <td colSpan={cols.length + 1} className="px-2 py-1 bg-surface-2/40 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
              Operating activities
            </td>
          </tr>
          <CashflowRow label="Revenue collected" values={cols.map((c) => c.revenue)} indent />
          <CashflowRow label="Operating outflows" values={cols.map((c) => -c.operatingOutflows)} indent />
          <CashflowRow label="Cash from operations" values={cols.map((c) => c.operatingCF)} bold />

          {/* Investing section */}
          <tr className="border-t border-line">
            <td colSpan={cols.length + 1} className="px-2 py-1 bg-surface-2/40 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
              Investing activities
            </td>
          </tr>
          <CashflowRow
            label="CapEx · M&A · other (residual)"
            values={cols.map((c) => c.investingCF)}
            indent
            hint="Aircraft purchases, airport buys, asset sales, and any one-off cash movements not in operating or financing."
          />
          <CashflowRow label="Cash used in investing" values={cols.map((c) => c.investingCF)} bold />

          {/* Financing section */}
          <tr className="border-t border-line">
            <td colSpan={cols.length + 1} className="px-2 py-1 bg-surface-2/40 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
              Financing activities
            </td>
          </tr>
          <CashflowRow label="Net debt change" values={cols.map((c) => c.debtDelta)} indent />
          <CashflowRow label="Interest paid" values={cols.map((c) => -c.interest)} indent />
          <CashflowRow label="Cash from financing" values={cols.map((c) => c.financingCF)} bold />

          {/* Reconciliation footer */}
          <tr className="border-t-2 border-line">
            <td colSpan={cols.length + 1} className="px-2 py-1 bg-surface-2/40 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
              Reconciliation
            </td>
          </tr>
          <CashflowRow label="Net change in cash" values={cols.map((c) => c.netChange)} bold />
          <CashflowRow label="Cash, end of quarter" values={cols.map((c) => c.endingCash)} bold />
        </tbody>
      </table>
      <div className="px-3 py-2 bg-surface-2/30 border-t border-line text-[0.625rem] text-ink-muted leading-snug">
        Operating &amp; financing built from P&amp;L line items + debt
        delta. Investing is the residual that reconciles cash, so it
        captures CapEx and any one-off movements without needing a
        separate ledger.
      </div>
    </div>
  );
}

/** A single row in the cash-flow table. Renders the label on the
 *  left and one money column per visible quarter, signed and tone-
 *  coloured. `bold` rows are subtotals; `indent` rows are line items
 *  inside a section. */
function CashflowRow({
  label, values, bold, indent, hint,
}: {
  label: string;
  values: number[];
  bold?: boolean;
  indent?: boolean;
  hint?: string;
}) {
  return (
    <tr className={cn("border-b border-line/50 last:border-0", bold && "bg-surface-2/20")}>
      <td className={cn("px-2 py-1.5", indent && "pl-5", bold && "font-semibold text-ink")}>
        <span className={cn(bold ? "text-ink" : "text-ink-2")}>{label}</span>
        {hint && (
          <span className="ml-1 text-[0.625rem] text-ink-muted" title={hint}>ⓘ</span>
        )}
      </td>
      {values.map((v, i) => (
        <td
          key={i}
          className={cn(
            "px-2 py-1.5 text-right tabular font-mono",
            v > 0 ? "text-positive" : v < 0 ? "text-negative" : "text-ink-muted",
            bold && "font-semibold",
          )}
        >
          {v >= 0 && bold ? "+" : ""}{fmtMoney(v)}
        </td>
      ))}
    </tr>
  );
}

function SubHeader({ children, nested }: { children: React.ReactNode; nested?: boolean }) {
  return (
    <div className={`text-[0.625rem] uppercase tracking-wider text-ink-muted ${nested ? "mt-2 ml-2" : "mt-3"} mb-1`}>
      {children}
    </div>
  );
}
function Row({ k, v, tone, bold }: { k: string; v: string | React.ReactNode; tone?: "pos" | "neg"; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted whitespace-pre">{k}</span>
      <span className={`tabular font-mono ${tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink"} ${bold ? "font-semibold" : ""}`}>{v}</span>
    </div>
  );
}
function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={`text-left px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-2 py-1.5 align-top ${className ?? ""}`}>{children}</td>;
}

/** Compact trend row — label, polyline trend with X-axis quarter
 *  ticks, current value, delta vs first sample. Earlier the chart
 *  had no axis labels at all so the player couldn't tell which round
 *  the trend covered. */
function TrendRow({
  label, series, color, suffix, max,
}: {
  label: string;
  /** {quarter, value} samples in chronological order. */
  series: Array<{ q: number; v: number }>;
  color: string;
  suffix: string;
  max: number;
}) {
  if (series.length === 0) return null;
  const w = 220;
  const h = 36;
  const lo = 0;
  const hi = Math.max(max, ...series.map((s) => s.v), 1);
  const px = (q: number, i: number, v: number) => {
    const x = series.length === 1 ? 0 : (i / (series.length - 1)) * w;
    const y = h - ((v - lo) / (hi - lo)) * h;
    return { x, y };
  };
  const pts = series.map((s, i) => px(s.q, i, s.v));
  const points = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const current = series[series.length - 1].v;
  const start = series[0].v;
  const delta = current - start;
  const fmt = (v: number) =>
    suffix === "%" ? `${Math.round(v)}%` : Math.round(v).toString();
  const tone =
    delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-ink-muted";
  // Pick up to 5 evenly-spaced X-axis ticks so the labels never crowd.
  const tickIdx: number[] = (() => {
    if (series.length <= 5) return series.map((_, i) => i);
    const step = (series.length - 1) / 4;
    return [0, 1, 2, 3, 4].map((k) => Math.round(k * step));
  })();
  return (
    <div className="flex items-start gap-3">
      <span className="w-20 text-[0.75rem] text-ink-2 shrink-0 pt-1">{label}</span>
      <div className="flex-1">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          preserveAspectRatio="none"
          className="w-full h-9"
          aria-label={`${label} trend`}
        >
          <polyline
            points={points}
            fill="none"
            stroke={color}
            strokeWidth={1.6}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {/* Tick marks at the X-axis ticks. */}
          {tickIdx.map((i) => (
            <line
              key={i}
              x1={pts[i].x}
              y1={h - 1}
              x2={pts[i].x}
              y2={h - 4}
              stroke="currentColor"
              className="text-ink-muted"
              strokeWidth={1}
            />
          ))}
        </svg>
        <div className="flex justify-between text-[0.5625rem] text-ink-muted tabular font-mono mt-0.5 px-0">
          {tickIdx.map((i) => (
            <span key={i}>{fmtQuarter(series[i].q)}</span>
          ))}
        </div>
      </div>
      <span className="tabular font-mono text-[0.8125rem] text-ink w-10 text-right pt-1">
        {fmt(current)}
      </span>
      <span className={`tabular font-mono text-[0.6875rem] w-12 text-right pt-1 ${tone}`}>
        {delta >= 0 ? "+" : ""}{fmt(delta)}
      </span>
    </div>
  );
}

/**
 * Visual covenant gauge — renders the debt ratio as a horizontal bar
 * with shaded threshold zones (0-25 ok / 25-35 caution / 35-45 high /
 * 45+ breach) and a marker at the current position. Replaces the
 * older text-only block so the player sees the slope toward breach.
 */
function CovenantGauge({
  debtRatio, tone, label, detail,
}: {
  debtRatio: number;
  tone: "info" | "warn" | "neg" | null;
  label: string;
  detail: string;
}) {
  const pct = Math.min(100, Math.max(0, debtRatio));
  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2/30 p-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
          Covenant pressure
        </span>
        <span
          className={`tabular font-mono text-[0.875rem] font-semibold ${
            tone === "neg" ? "text-negative" :
            tone === "warn" ? "text-warning" :
            tone === "info" ? "text-accent" : "text-positive"
          }`}
        >
          {debtRatio.toFixed(1)}%
        </span>
      </div>
      {/* Threshold-zoned bar. Each segment colored with the same tone
          the lender's covenant signal would emit at that debt ratio. */}
      <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
        <div className="absolute inset-y-0 left-0 right-[75%] bg-positive/30" />
        <div className="absolute inset-y-0 left-[25%] right-[65%] bg-accent/30" />
        <div className="absolute inset-y-0 left-[35%] right-[55%] bg-warning/40" />
        <div className="absolute inset-y-0 left-[45%] right-0 bg-negative/40" />
        {/* Position marker. */}
        <div
          className="absolute top-[-2px] bottom-[-2px] w-[3px] bg-ink rounded-sm"
          style={{ left: `calc(${pct}% - 1.5px)` }}
        />
      </div>
      <div className="flex justify-between text-[0.5625rem] tabular font-mono text-ink-muted mt-1 px-[1px]">
        <span>0%</span>
        <span>25%</span>
        <span>35%</span>
        <span>45%</span>
        <span>100%</span>
      </div>
      {label && (
        <div className="mt-1.5 text-[0.6875rem] leading-relaxed">
          <span
            className={`font-semibold uppercase tracking-wider text-[0.625rem] mr-1.5 ${
              tone === "neg" ? "text-negative" :
              tone === "warn" ? "text-warning" :
              tone === "info" ? "text-accent" : "text-positive"
            }`}
          >
            {label}
          </span>
          <span className="text-ink-2">{detail}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Cash-runway gauge — translates "burn rate × cash on hand" into an
 * intuitive visual. Bar fills from left in proportion to runway/24Q
 * (capped at 24Q so a profitable airline doesn't render a 1000+ bar).
 * Tone matches the urgency: ≤2Q = breach-imminent (red), ≤6Q = warn
 * (amber), longer = ok, profitable = positive.
 */
function CashRunwayGauge({
  quarters, cappedQ, tone, burnPerQ,
}: {
  /** Raw quarters of runway, may be Infinity. */
  quarters: number;
  /** Display value capped at 24Q for the bar fill. */
  cappedQ: number;
  tone: "pos" | "neg" | "warn" | "neutral";
  burnPerQ: number;
}) {
  const fillPct = (cappedQ / 24) * 100;
  const isInfinite = quarters === Infinity;
  return (
    <div className="mt-3 rounded-md border border-line bg-surface-2/30 p-3">
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
          Cash runway
        </span>
        <span
          className={`tabular font-mono text-[0.875rem] font-semibold ${
            tone === "pos" ? "text-positive" :
            tone === "neg" ? "text-negative" :
            tone === "warn" ? "text-warning" : "text-ink"
          }`}
        >
          {isInfinite ? "Indefinite" : `${quarters}Q`}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-surface-2 overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 transition-[width] ${
            tone === "pos" ? "bg-positive" :
            tone === "neg" ? "bg-negative" :
            tone === "warn" ? "bg-warning" : "bg-accent"
          }`}
          style={{ width: `${fillPct}%` }}
        />
      </div>
      <div className="flex justify-between text-[0.5625rem] tabular font-mono text-ink-muted mt-1">
        <span>0Q</span>
        <span>6Q</span>
        <span>12Q</span>
        <span>18Q</span>
        <span>24Q+</span>
      </div>
      <div className="mt-1.5 text-[0.6875rem] text-ink-2 leading-relaxed">
        {isInfinite ? (
          <>
            <span className="font-semibold uppercase tracking-wider text-[0.625rem] text-positive mr-1.5">
              Profitable
            </span>
            Last quarter you ran a surplus — runway grows as cash builds.
          </>
        ) : (
          <>
            <span
              className={`font-semibold uppercase tracking-wider text-[0.625rem] mr-1.5 ${
                tone === "neg" ? "text-negative" : tone === "warn" ? "text-warning" : "text-ink-muted"
              }`}
            >
              Burning {fmtMoney(burnPerQ)}/Q
            </span>
            {tone === "neg"
              ? "Cash runs out before next reporting cycle — refinance or cut spend now."
              : tone === "warn"
                ? "Less than 18 months of runway. Consider refinancing or trimming sliders."
                : "Plenty of cushion at the current burn rate."}
          </>
        )}
      </div>
    </div>
  );
}
