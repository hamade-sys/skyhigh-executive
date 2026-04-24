"use client";

import { useState } from "react";
import { Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { computeAirlineValue, effectiveBorrowingRate, maxBorrowingUsd } from "@/lib/engine";

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

  return (
    <div className="space-y-4">
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Balance sheet</div>
        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Cash" v={fmtMoney(player.cashUsd)} />
          <Row k="Fleet book value" v={fmtMoney(player.fleet.reduce((s, f) => s + f.bookValue, 0))} />
          <Row k="Total debt" v={fmtMoney(player.totalDebtUsd)} tone="neg" />
          <Row k="Airline value" v={fmtMoney(airlineValue)} bold />
          <Row k="Debt ratio" v={`${debtRatio.toFixed(1)}%`} />
        </div>
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
            <div className="mt-3 pt-2 border-t border-line space-y-1">
              {player.loans.map((loan) => (
                <div key={loan.id} className="flex items-center justify-between text-[0.75rem]">
                  <span className="text-ink-muted">Loan Q{loan.originQuarter}</span>
                  <span className="tabular font-mono text-ink">
                    {fmtMoney(loan.remainingPrincipal)} @ {loan.ratePct.toFixed(1)}%
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {last && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Last quarter P&amp;L</div>
          <div className="space-y-1.5 text-[0.8125rem]">
            <Row k="Revenue" v={fmtMoney(last.revenue)} tone="pos" />
            <Row k="Costs" v={fmtMoney(last.costs)} tone="neg" />
            <Row k="Net profit" v={fmtMoney(last.netProfit)} tone={last.netProfit >= 0 ? "pos" : "neg"} bold />
          </div>
        </section>
      )}

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
                  <Th className="text-right">BV</Th>
                </tr>
              </thead>
              <tbody>
                {player.financialsByQuarter.map((q) => (
                  <tr key={q.quarter} className="border-b border-line last:border-0">
                    <Td className="font-mono">Q{q.quarter}</Td>
                    <Td className="text-right tabular font-mono">{fmtMoney(q.revenue)}</Td>
                    <Td className={`text-right tabular font-mono ${q.netProfit >= 0 ? "text-positive" : "text-negative"}`}>
                      {fmtMoney(q.netProfit)}
                    </Td>
                    <Td className="text-right tabular font-mono">{fmtMoney(q.cash)}</Td>
                    <Td className="text-right tabular font-mono">{q.brandValue.toFixed(1)}</Td>
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
