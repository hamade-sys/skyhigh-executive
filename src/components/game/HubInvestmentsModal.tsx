"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";
import { Fuel, Wrench, Sofa, Layers, Check } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface Investment {
  kind: "fuelReserveTank" | "maintenanceDepot" | "premiumLounge" | "opsExpansion";
  title: string;
  Icon: typeof Fuel;
  cost: number;
  effect: string;
  detail: string;
}

const INVESTMENTS: Investment[] = [
  {
    kind: "fuelReserveTank",
    title: "Fuel Reserve Tank",
    Icon: Fuel,
    cost: 8_000_000,
    effect: "−5% fuel cost on routes from this hub",
    detail: "Buys ahead at favorable index, smooths spikes.",
  },
  {
    kind: "maintenanceDepot",
    title: "Maintenance Depot",
    Icon: Wrench,
    cost: 12_000_000,
    effect: "−20% fleet maintenance per depot (cap 50%)",
    detail: "On-site engineers replace third-party costs.",
  },
  {
    kind: "premiumLounge",
    title: "Premium Lounge",
    Icon: Sofa,
    cost: 5_000_000,
    effect: "+4% demand on routes touching this hub",
    detail: "Premium passengers route through your hub by choice.",
  },
  {
    kind: "opsExpansion",
    title: "Ops Expansion",
    Icon: Layers,
    cost: 5_000_000,
    effect: "+5 slots in your overall ops capacity",
    detail: "Extra apron, ground crew, terminal real estate.",
  },
];

export function HubInvestmentsModal({ open, onClose }: Props) {
  const player = useGame(selectPlayer);
  const buyHubInvestment = useGame((s) => s.buyHubInvestment);
  const [hubCode, setHubCode] = useState<string>("");
  // Branded confirm — these are $5M-$12M one-time spends. Previously a
  // single click committed the spend; now the click stages a confirm
  // modal showing target hub + cost + effect, then the confirm fires.
  const [confirmInvestment, setConfirmInvestment] = useState<Investment | null>(null);

  if (!player) return null;
  const allHubs = [player.hubCode, ...player.secondaryHubCodes];
  const targetHub = hubCode || player.hubCode;
  const inv = player.hubInvestments;

  function isInstalled(kind: Investment["kind"], code: string): boolean {
    if (kind === "fuelReserveTank") return inv.fuelReserveTankHubs.includes(code);
    if (kind === "maintenanceDepot") return inv.maintenanceDepotHubs.includes(code);
    if (kind === "premiumLounge") return inv.premiumLoungeHubs.includes(code);
    return false;  // opsExpansion is global (slot count)
  }

  function commitBuy(investment: Investment) {
    const r = buyHubInvestment(investment.kind, targetHub);
    if (!r.ok) toast.negative(r.error ?? "Purchase failed");
    else toast.success(`${investment.title} installed`, investment.effect);
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <ModalHeader>
        <span className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent">
          Hub infrastructure
        </span>
        <h2 className="font-display text-[1.5rem] text-ink leading-tight mt-1">
          Hub investments
        </h2>
        <p className="text-[0.8125rem] text-ink-muted mt-1.5 leading-relaxed">
          One-time capital spends that compound forever. Choose which hub to
          upgrade — primary or secondary — and the engine applies the effect
          on every quarter close from now on.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {/* Hub picker */}
        {allHubs.length > 1 && (
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">
              Target hub
            </div>
            <div className="flex flex-wrap gap-1.5">
              {allHubs.map((code) => (
                <button
                  key={code}
                  onClick={() => setHubCode(code)}
                  className={cn(
                    "px-2.5 py-1 rounded-md text-[0.75rem] font-mono font-semibold border",
                    targetHub === code
                      ? "bg-primary text-primary-fg border-primary"
                      : "bg-surface border-line text-ink-2 hover:bg-surface-hover",
                  )}
                >
                  {code === player.hubCode ? `HUB · ${code}` : `HUB·2 · ${code}`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Investment cards */}
        <div className="grid grid-cols-1 gap-2.5">
          {INVESTMENTS.map((iv) => {
            const installed = isInstalled(iv.kind, targetHub);
            const canAfford = player.cashUsd >= iv.cost;
            const isOpsExpansion = iv.kind === "opsExpansion";
            return (
              <div
                key={iv.kind}
                className={cn(
                  "rounded-md border p-3 flex items-start gap-3",
                  installed
                    ? "border-positive bg-[var(--positive-soft)]/40"
                    : "border-line bg-surface",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 w-9 h-9 rounded-md flex items-center justify-center",
                    installed ? "bg-positive text-primary-fg" : "bg-surface-2 text-ink-2",
                  )}
                >
                  <iv.Icon size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2 mb-0.5">
                    <span className="font-semibold text-ink text-[0.9375rem]">
                      {iv.title}
                    </span>
                    <span className={cn(
                      "tabular font-mono text-[0.8125rem] shrink-0",
                      canAfford ? "text-ink" : "text-negative",
                    )}>
                      {fmtMoney(iv.cost)}
                    </span>
                  </div>
                  <div className="text-[0.8125rem] text-ink leading-snug">{iv.effect}</div>
                  <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-0.5">
                    {iv.detail}
                  </div>
                  {isOpsExpansion && inv.opsExpansionSlots > 0 && (
                    <div className="text-[0.6875rem] text-positive mt-1">
                      Already installed: +{inv.opsExpansionSlots} slots
                    </div>
                  )}
                </div>
                <div className="shrink-0">
                  {installed && !isOpsExpansion ? (
                    <span className="inline-flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-positive font-semibold">
                      <Check size={11} aria-hidden="true" /> Installed
                    </span>
                  ) : (
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!canAfford}
                      onClick={() => setConfirmInvestment(iv)}
                      aria-label={`Buy ${iv.title} at hub ${targetHub} for ${fmtMoney(iv.cost)}`}
                    >
                      Buy
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Done</Button>
      </ModalFooter>

      {/* Branded confirm — $5M-$12M one-time spend per investment.
          Previously a single click committed the spend; this now
          spells out target hub + cost + effect before the player
          commits. The HubInvestmentsModal stays mounted underneath. */}
      <Modal open={!!confirmInvestment} onClose={() => setConfirmInvestment(null)} stack>
        {confirmInvestment && (() => {
          const cantAfford = player.cashUsd < confirmInvestment.cost;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Buy {confirmInvestment.title} at {targetHub}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  One-time capital spend. The effect compounds every quarter
                  for the rest of the game — no recurring fees, no maintenance
                  cost on the asset itself.
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Asset</span>
                    <span className="text-ink">{confirmInvestment.title}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Target hub</span>
                    <span className="font-mono tabular text-ink">
                      {targetHub === player.hubCode ? `${targetHub} (primary)` : `${targetHub} (secondary)`}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Effect</span>
                    <span className="text-positive text-right max-w-[60%]">
                      {confirmInvestment.effect}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 mt-1.5">
                    <span className="text-ink font-semibold">Cost</span>
                    <span className="tabular font-mono text-negative font-semibold">
                      −{fmtMoney(confirmInvestment.cost)}
                    </span>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmInvestment(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={cantAfford}
                  onClick={() => {
                    commitBuy(confirmInvestment);
                    setConfirmInvestment(null);
                  }}
                >
                  Buy · {fmtMoney(confirmInvestment.cost)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </Modal>
  );
}
