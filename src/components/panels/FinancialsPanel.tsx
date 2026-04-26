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
    debtRatio < 30
      ? { tone: null, label: "", detail: "" }
      : debtRatio < 50
        ? { tone: "info", label: "Leverage building",
            detail: "Borrowing rate has a +1.5pp premium. Plenty of headroom; just don't ratchet further." }
        : debtRatio < 70
          ? { tone: "warn", label: "High leverage",
              detail: "Borrowing rate has a +3pp premium and lenders are watching. Consider refinancing or repaying." }
          : { tone: "neg", label: "Covenant breach",
              detail: "Debt > 70% of airline value. Borrowing rate +5pp, board is uncomfortable. Repay or refi to lower." };

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
        {covenant.tone && (
          <div
            className={`mt-2 rounded-md px-3 py-2 text-[0.75rem] leading-relaxed ${
              covenant.tone === "neg"
                ? "border border-negative bg-[var(--negative-soft)] text-negative"
                : covenant.tone === "warn"
                  ? "border border-warning bg-[var(--warning-soft)] text-warning"
                  : "border border-line bg-surface-2/40 text-ink-2"
            }`}
          >
            <span className="font-semibold uppercase tracking-wider text-[0.625rem] mr-2">
              {covenant.label}
            </span>
            {covenant.detail}
          </div>
        )}
      </section>

      {/* ── 2. Borrowing ── */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Borrowing</div>
          <Button size="sm" variant="primary" onClick={() => setBorrowOpen(true)}>
            Borrow →
          </Button>
        </div>
        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Base rate" v={`${s.baseInterestRatePct.toFixed(1)}%`} />
          <Row k="Your effective rate" v={`${rate.toFixed(2)}%`} bold />
          <Row k="Max borrowing" v={fmtMoney(maxBorrow)} />
          {player.loans.length > 0 && (
            <div className="mt-3 pt-2 border-t border-line space-y-1.5">
              {player.loans.map((loan) => {
                const canRepay = player.cashUsd >= loan.remainingPrincipal;
                const newRateAvailable = s.baseInterestRatePct;
                const refiSavings = loan.ratePct - newRateAvailable;
                const canRefi = refiSavings >= 0.25 && player.cashUsd >= loan.remainingPrincipal * 0.01;
                return (
                  <div key={loan.id} className="rounded-md border border-line bg-surface px-2.5 py-2">
                    <div className="flex items-baseline justify-between text-[0.75rem] mb-1">
                      <span className="text-ink-muted">Loan · Q{loan.originQuarter}</span>
                      <span className="tabular font-mono text-ink">
                        {fmtMoney(loan.remainingPrincipal)} @ {loan.ratePct.toFixed(1)}%
                      </span>
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
                        Repay {fmtMoney(loan.remainingPrincipal)}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={!canRefi}
                        title={canRefi
                          ? `Refi to ${newRateAvailable.toFixed(1)}% (1% fee)`
                          : refiSavings < 0.25
                            ? "Base rate not low enough yet"
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
