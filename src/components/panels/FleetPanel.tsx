"use client";

import { useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";

export function FleetPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const [buyOpen, setBuyOpen] = useState(false);
  const [ordering, setOrdering] = useState<{ specId: string; type: "buy" | "lease" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!player) return null;

  const available = AIRCRAFT.filter((a) => a.unlockQuarter <= s.currentQuarter);

  function confirmOrder() {
    if (!ordering) return;
    const r = s.orderAircraft({ specId: ordering.specId, acquisitionType: ordering.type });
    if (!r.ok) {
      setError(r.error ?? "Unknown error");
      return;
    }
    setOrdering(null);
    setBuyOpen(false);
    setError(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-[0.8125rem] text-ink-2">
          {player.fleet.length} aircraft · {player.fleet.filter((f) => f.status === "active").length} active
        </div>
        <Button variant="primary" size="sm" onClick={() => setBuyOpen(true)}>
          Order aircraft →
        </Button>
      </div>

      {player.fleet.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          Fleet is empty. Order your first aircraft to begin flying routes.
        </div>
      ) : (
        <div className="space-y-2">
          {player.fleet.map((f) => {
            const spec = AIRCRAFT_BY_ID[f.specId];
            if (!spec) return null;
            const route = player.routes.find((r) => r.id === f.routeId);
            const quartersToRetirement = f.retirementQuarter - s.currentQuarter;
            const aging = quartersToRetirement <= 2 && f.status !== "retired";
            const retired = f.status === "retired";
            return (
              <div key={f.id} className="rounded-md border border-line bg-surface p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <div className="font-medium text-ink text-[0.9375rem] truncate">{spec.name}</div>
                    <div className="text-[0.6875rem] text-ink-muted font-mono mt-0.5">
                      {f.id.slice(-6)} · Q{f.purchaseQuarter} · {f.acquisitionType} · retires Q{f.retirementQuarter}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {aging && <Badge tone="warning">Aging {quartersToRetirement}Q</Badge>}
                    <Badge tone={
                      retired ? "negative"
                        : f.status === "active" ? "positive"
                        : f.status === "ordered" ? "warning" : "neutral"
                    }>
                      {f.status}
                    </Badge>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-[0.75rem]">
                  <span className="text-ink-muted">Book value</span>
                  <span className="col-span-2 text-right tabular font-mono text-ink">{fmtMoney(f.bookValue)}</span>
                  <span className="text-ink-muted">Range</span>
                  <span className="col-span-2 text-right tabular font-mono text-ink">{spec.rangeKm.toLocaleString()} km</span>
                  <span className="text-ink-muted">Seats</span>
                  <span className="col-span-2 text-right tabular font-mono text-ink">{spec.seats.first + spec.seats.business + spec.seats.economy}</span>
                  <span className="text-ink-muted">Route</span>
                  <span className="col-span-2 text-right font-mono text-ink">
                    {route ? `${route.originCode}→${route.destCode}` : <span className="text-ink-muted">Idle</span>}
                  </span>
                </div>
                <div className="flex justify-end gap-1.5 mt-3 pt-2 border-t border-line">
                  {!f.ecoUpgrade && (
                    <button
                      className="text-[0.75rem] text-ink-2 hover:text-accent underline"
                      onClick={() => {
                        const r = s.addEcoUpgrade(f.id);
                        if (!r.ok) alert(r.error ?? "Upgrade failed");
                      }}
                    >
                      Eco +{fmtMoney(spec.ecoUpgradeUsd)}
                    </button>
                  )}
                  {f.ecoUpgrade && <Badge tone="positive">Eco</Badge>}
                  <button
                    className="text-[0.75rem] text-negative hover:underline"
                    onClick={() => s.decommissionAircraft(f.id)}
                  >
                    Retire
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={buyOpen} onClose={() => { setBuyOpen(false); setError(null); }} className="w-[48rem]">
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">Aircraft market</h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            {available.length} types available at Q{s.currentQuarter} · new types unlock by quarter
          </p>
        </ModalHeader>
        <ModalBody className="max-h-[28rem] overflow-auto space-y-2">
          {available.map((a) => (
            <div key={a.id} className="rounded-md border border-line p-3 flex items-start gap-3 hover:bg-surface-hover">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink text-[0.9375rem]">{a.name}</span>
                  <Badge tone={a.family === "cargo" ? "warning" : "neutral"}>{a.family}</Badge>
                </div>
                <div className="text-[0.75rem] text-ink-muted mt-0.5 font-mono tabular">
                  {a.seats.first + a.seats.business + a.seats.economy} seats ({a.seats.first}F/{a.seats.business}C/{a.seats.economy}Y) · {a.rangeKm.toLocaleString()} km · {a.fuelBurnPerKm} L/km
                </div>
                {a.note && <p className="text-[0.8125rem] text-ink-2 mt-1 italic">{a.note}</p>}
              </div>
              <div className="flex flex-col gap-1.5 shrink-0">
                <Button size="sm" variant="primary" onClick={() => setOrdering({ specId: a.id, type: "buy" })}>
                  Buy {fmtMoney(a.buyPriceUsd)}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setOrdering({ specId: a.id, type: "lease" })}>
                  Lease {fmtMoney(a.leasePerQuarterUsd)}/Q
                </Button>
              </div>
            </div>
          ))}
        </ModalBody>
      </Modal>

      <Modal open={!!ordering} onClose={() => { setOrdering(null); setError(null); }}>
        <ModalHeader>
          <h2 className="font-display text-[1.25rem] text-ink">Confirm order</h2>
        </ModalHeader>
        <ModalBody>
          {ordering && (() => {
            const spec = AIRCRAFT_BY_ID[ordering.specId];
            if (!spec) return null;
            const cost = ordering.type === "buy" ? spec.buyPriceUsd : spec.leasePerQuarterUsd;
            return (
              <div className="space-y-2">
                <Row k="Aircraft" v={spec.name} />
                <Row k="Acquisition" v={ordering.type === "buy" ? "Outright purchase" : "Lease (quarterly)"} />
                <Row k="Cost" v={fmtMoney(cost)} />
                <Row k="Arrives" v={`Q${s.currentQuarter + 1}`} />
                {error && <div className="text-negative text-[0.875rem] mt-2">{error}</div>}
              </div>
            );
          })()}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => { setOrdering(null); setError(null); }}>Cancel</Button>
          <Button variant="primary" onClick={confirmOrder}>Confirm order</Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-line last:border-0">
      <span className="text-[0.8125rem] uppercase tracking-wider text-ink-muted">{k}</span>
      <span className="text-ink tabular">{v}</span>
    </div>
  );
}
