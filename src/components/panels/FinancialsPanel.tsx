"use client";

import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import {
  computeAirlineValue,
  effectiveBorrowingRate,
  maxBorrowingUsd,
  runQuarterClose,
} from "@/lib/engine";
import { useMemo } from "react";

export function FinancialsPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const [borrowOpen, setBorrowOpen] = useState(false);
  const [borrowAmount, setBorrowAmount] = useState(50_000_000);
  const [error, setError] = useState<string | null>(null);

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

  // Loan covenant signals based on debt ratio
  // 0–30%: healthy
  // 30–50%: borrowing premium kicks in (1.5pp)
  // 50–70%: high leverage (3.0pp premium)
  // 70%+: covenant breach (5pp premium, refinance gets harder)
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

      {last && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Last quarter P&amp;L</div>
          <div className="space-y-1 text-[0.8125rem]">
            <Row k="Passenger revenue" v={fmtMoney(last.passengerRevenue ?? 0)} tone="pos" />
            <Row k="Cargo revenue" v={fmtMoney(last.cargoRevenue ?? 0)} tone="pos" />
            <div className="pt-1 border-t border-line/60">
              <Row k="Total revenue" v={fmtMoney(last.revenue)} tone="pos" />
            </div>
            <Row k="Aircraft insurance" v={fmtMoney(last.insuranceCost ?? 0)} tone="neg" />
            <Row k="All other costs" v={fmtMoney(last.costs - (last.insuranceCost ?? 0))} tone="neg" />
            <div className="pt-1 border-t border-line">
              <Row k="Net profit" v={fmtMoney(last.netProfit)} tone={last.netProfit >= 0 ? "pos" : "neg"} bold />
            </div>
          </div>
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

      {/* Projected P&L — dry-run of this quarter close */}
      {player && <ProjectedPL /> }

      {player.financialsByQuarter.length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Quarterly history</div>
          <div className="rounded-md border border-line overflow-hidden">
            <table className="w-full text-[0.75rem]">
              <thead>
                <tr className="bg-surface-2 border-b border-line">
                  <Th>Q</Th>
                  <Th className="text-right">Revenue</Th>
                  <Th className="text-right">Profit</Th>
                  <Th className="text-right">Cash</Th>
                  <Th className="text-right">Debt</Th>
                </tr>
              </thead>
              <tbody>
                {player.financialsByQuarter.map((q) => (
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

function ProjectedPL() {
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
    });
  }, [player, s.baseInterestRatePct, s.fuelIndex, s.currentQuarter]);

  if (!projected || !player) return null;
  const p = projected;

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Projected P&amp;L · Q{s.currentQuarter}
      </div>
      <div className="rounded-md border border-line bg-surface p-4 text-[0.8125rem] space-y-1">
        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">Revenue</div>
        <Row k="Passenger revenue" v={fmtMoney(p.passengerRevenue ?? 0)} tone="pos" />
        <Row k="Cargo revenue" v={fmtMoney(p.cargoRevenue ?? 0)} tone="pos" />
        <div className="pt-1 border-t border-line/60">
          <Row k="Total revenue" v={fmtMoney(p.revenue)} tone="pos" bold />
        </div>

        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mt-3 mb-1.5">Operating costs</div>
        <Row k="Fuel" v={fmtMoney(p.fuelCost)} tone="neg" />
        <Row k="Slot fees" v={fmtMoney(p.slotCost)} tone="neg" />
        <Row k="Staff" v={fmtMoney(p.staffCost)} tone="neg" />
        <Row k="Other slider spend" v={fmtMoney(p.otherSliderCost)} tone="neg" />
        <Row k="Maintenance + hub fees" v={fmtMoney(p.maintenanceCost)} tone="neg" />
        <Row k="Aircraft insurance" v={fmtMoney(p.insuranceCost ?? 0)} tone="neg" />

        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mt-3 mb-1.5">Non-operating</div>
        <Row k="Depreciation" v={fmtMoney(p.depreciation)} tone="neg" />
        <Row k="Debt interest" v={fmtMoney(p.interest)} tone="neg" />
        {p.rcfInterest > 0 && <Row k="RCF interest (2× base)" v={fmtMoney(p.rcfInterest)} tone="neg" />}

        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mt-3 mb-1.5">Taxes</div>
        <Row k="Passenger departure tax" v={fmtMoney(p.passengerTax)} tone="neg" />
        <Row k="Fuel excise (8%)" v={fmtMoney(p.fuelExcise)} tone="neg" />
        {p.carbonLevy > 0 && <Row k="Carbon levy" v={fmtMoney(p.carbonLevy)} tone="neg" />}
        <Row k="Corporate tax (20% on pretax)" v={fmtMoney(p.tax)} tone="neg" />

        <div className="mt-3 pt-2 border-t border-line">
          <Row
            k="Net profit (projected)"
            v={fmtMoney(p.netProfit)}
            tone={p.netProfit >= 0 ? "pos" : "neg"}
            bold
          />
        </div>
      </div>
    </section>
  );
}

function Row({ k, v, tone, bold }: { k: string; v: string; tone?: "pos" | "neg"; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{k}</span>
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
