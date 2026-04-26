"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  Car,
  Coffee,
  Wrench,
  Fuel,
  Utensils,
  GraduationCap,
  Plus,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { CITIES_BY_CODE } from "@/data/cities";
import {
  SUBSIDIARY_CATALOG,
  SUBSIDIARY_BY_TYPE,
} from "@/data/subsidiaries";
import type { SubsidiaryType, Subsidiary } from "@/types/game";
import { cn } from "@/lib/cn";

/**
 * Investments — non-aviation subsidiaries the airline can build at any
 * of its network cities. Replaces the weak "Network" placeholder in the
 * old Overview block. Each subsidiary card shows current portfolio
 * holdings + a "Build new" catalog of available investments.
 *
 * Operational subsidiaries (maintenance hub, fuel storage, lounge)
 * also stack with the existing PRD hub-investment bonus paths via
 * team.hubInvestments — so building a maintenance hub at DXB drops
 * maintenance for all DXB-based fleet by 20%, etc. The store action
 * handles that mirror automatically.
 *
 * Selling a subsidiary cashes out at marketValue × (1 - 5% broker fee).
 * Market value appreciates 2% per quarter toward a 1.5× ceiling on the
 * original purchase price while held (resolved at quarter close).
 */
/** Outer panel — keeps hook order stable. The actual content lives
 *  in <InvestmentsPanelInner> which only mounts once `player` exists,
 *  so its hooks never run with a missing player and won't see a
 *  changed call order between renders. Earlier this whole component
 *  early-returned BEFORE its useMemo hooks, which produced a
 *  React hook-order error when transitioning from idle/hydration
 *  to the loaded-player render. */
export function InvestmentsPanel() {
  const player = useGame(selectPlayer);
  if (!player) return null;
  return <InvestmentsPanelInner playerId={player.id} />;
}

function InvestmentsPanelInner({ playerId }: { playerId: string }) {
  // Re-subscribe to player so this child re-renders when fleet/cash
  // change — but the parent's early-return guarantees player exists
  // by the time this component mounts.
  const player = useGame(selectPlayer);
  const buildSubsidiary = useGame((s) => s.buildSubsidiary);
  const sellSubsidiary = useGame((s) => s.sellSubsidiary);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const [buildOpen, setBuildOpen] = useState<{ type: SubsidiaryType } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSell, setConfirmSell] = useState<Subsidiary | null>(null);

  const owned = player?.subsidiaries ?? [];
  const ownedByType = useMemo(() => {
    const m = new Map<SubsidiaryType, Subsidiary[]>();
    for (const s of owned) {
      const arr = m.get(s.type) ?? [];
      arr.push(s);
      m.set(s.type, arr);
    }
    return m;
  }, [owned]);

  // Quarterly portfolio revenue + total mark-to-market value
  const portfolioRevenue = owned.reduce((sum, s) => {
    const e = SUBSIDIARY_BY_TYPE[s.type];
    return sum + (e?.revenuePerQuarterUsd ?? 0) * s.conditionPct;
  }, 0);
  const portfolioValue = owned.reduce((sum, s) => sum + s.marketValueUsd, 0);

  // Network cities = hub + secondary hubs + every endpoint of an active route.
  const networkCities = useMemo(() => {
    if (!player) return [];
    const set = new Set<string>([player.hubCode, ...player.secondaryHubCodes]);
    for (const r of player.routes) {
      if (r.status !== "closed") {
        set.add(r.originCode);
        set.add(r.destCode);
      }
    }
    return Array.from(set);
  }, [player]);

  // Defensive: if the player vanished between renders (e.g. session
  // teardown) bail out without calling more hooks below.
  if (!player) return null;
  void playerId;

  return (
    <div className="space-y-5">
      {/* Portfolio summary */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Investment portfolio · subsidiaries
        </div>
        <div className="grid grid-cols-3 gap-3">
          <SummaryCard
            label="Holdings"
            value={String(owned.length)}
            sub={owned.length === 0 ? "Nothing built yet" : `${owned.length} subsidiar${owned.length === 1 ? "y" : "ies"}`}
          />
          <SummaryCard
            label="Q revenue"
            value={fmtMoney(portfolioRevenue)}
            sub="Non-aviation income"
            tone="pos"
          />
          <SummaryCard
            label="Mark-to-market"
            value={fmtMoney(portfolioValue)}
            sub="Sale value if liquidated today"
          />
        </div>
      </section>

      {/* Owned subsidiaries — grouped by type */}
      {owned.length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Owned holdings
          </div>
          <div className="space-y-2">
            {Array.from(ownedByType.entries()).map(([type, list]) => {
              const entry = SUBSIDIARY_BY_TYPE[type];
              if (!entry) return null;
              return (
                <div key={type} className="rounded-md border border-line bg-surface overflow-hidden">
                  <div className="flex items-center gap-2 px-3 py-2 border-b border-line bg-surface-2/40">
                    <SubsidiaryIcon type={type} />
                    <span className="text-[0.875rem] font-semibold text-ink">{entry.name}</span>
                    <span className="text-[0.6875rem] text-ink-muted">· {list.length} location{list.length === 1 ? "" : "s"}</span>
                  </div>
                  <div className="divide-y divide-line">
                    {list.map((sub) => {
                      const city = CITIES_BY_CODE[sub.cityCode];
                      const ageQ = currentQuarter - sub.acquiredAtQuarter;
                      const sellProceeds = Math.round(sub.marketValueUsd * 0.95);
                      return (
                        <div key={sub.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2">
                              <span className="font-mono tabular text-ink text-[0.8125rem]">{sub.cityCode}</span>
                              <span className="text-[0.8125rem] text-ink-2 truncate">
                                {city?.name ?? sub.cityCode}
                              </span>
                              <span className="text-[0.625rem] text-ink-muted">
                                acquired {fmtQuarter(sub.acquiredAtQuarter)} · {ageQ}Q held
                              </span>
                            </div>
                            <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                              Earns {fmtMoney(entry.revenuePerQuarterUsd * sub.conditionPct)}/Q
                              {entry.operationalBonus && ` · ${entry.operationalBonus}`}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-mono tabular text-[0.8125rem] text-ink font-semibold">
                              {fmtMoney(sub.marketValueUsd)}
                            </div>
                            <div className="text-[0.625rem] text-ink-muted">
                              {sub.marketValueUsd > sub.purchaseCostUsd ? "+" : ""}
                              {(((sub.marketValueUsd - sub.purchaseCostUsd) / sub.purchaseCostUsd) * 100).toFixed(0)}% vs cost
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirmSell(sub)}
                            title={`Sell to market for ~${fmtMoney(sellProceeds)} (5% broker fee)`}
                          >
                            Sell
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Build new · {SUBSIDIARY_CATALOG.length} options
          </div>
          <div className="text-[0.6875rem] text-ink-muted">
            Cash {fmtMoney(player.cashUsd)}
          </div>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {SUBSIDIARY_CATALOG.map((entry) => {
            const ownedAtCount = (ownedByType.get(entry.type)?.length ?? 0);
            const cantAfford = player.cashUsd < entry.setupCostUsd;
            return (
              <div
                key={entry.type}
                className="rounded-md border border-line bg-surface p-3 flex flex-col gap-2"
              >
                <div className="flex items-start gap-2">
                  <SubsidiaryIcon type={entry.type} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-semibold text-ink text-[0.875rem]">{entry.name}</span>
                      {ownedAtCount > 0 && (
                        <span className="text-[0.625rem] uppercase tracking-wider text-positive font-semibold bg-[var(--positive-soft)] px-1.5 py-0.5 rounded">
                          {ownedAtCount} owned
                        </span>
                      )}
                    </div>
                    <div className="text-[0.75rem] text-ink-2 mt-0.5 leading-snug">
                      {entry.description}
                    </div>
                  </div>
                </div>
                <div className="flex items-baseline justify-between gap-2 mt-1 text-[0.75rem]">
                  <div className="text-ink-muted">
                    Setup{" "}
                    <span className="text-ink tabular font-mono font-semibold">
                      {fmtMoney(entry.setupCostUsd)}
                    </span>
                  </div>
                  {entry.revenuePerQuarterUsd > 0 ? (
                    <div className="text-positive">
                      <TrendingUp size={12} className="inline mr-0.5" />
                      <span className="tabular font-mono font-semibold">
                        {fmtMoney(entry.revenuePerQuarterUsd)}/Q
                      </span>
                    </div>
                  ) : (
                    <div className="text-ink-muted italic text-[0.6875rem]">Operational asset</div>
                  )}
                </div>
                {entry.operationalBonus && (
                  <div className="text-[0.6875rem] text-accent leading-relaxed">
                    {entry.operationalBonus}
                  </div>
                )}
                <Button
                  size="sm"
                  variant="primary"
                  disabled={cantAfford}
                  title={cantAfford ? `Need ${fmtMoney(entry.setupCostUsd)} cash` : undefined}
                  onClick={() => { setBuildOpen({ type: entry.type }); setError(null); }}
                  className="self-start"
                >
                  <Plus size={12} /> Build
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Build modal */}
      <Modal open={!!buildOpen} onClose={() => { setBuildOpen(null); setError(null); }}>
        {buildOpen && (() => {
          const entry = SUBSIDIARY_BY_TYPE[buildOpen.type];
          if (!entry) return null;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">Build {entry.name}</h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Pick a city in your network. {entry.pitch}
                </p>
              </ModalHeader>
              <ModalBody className="space-y-3">
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  Pick a city ({networkCities.length})
                </div>
                <div className="max-h-72 overflow-auto rounded-md border border-line">
                  {networkCities.map((code) => {
                    const city = CITIES_BY_CODE[code];
                    const isHub = code === player.hubCode;
                    const owns = (player.subsidiaries ?? []).some(
                      (s) => s.type === buildOpen.type && s.cityCode === code,
                    );
                    return (
                      <button
                        key={code}
                        onClick={async () => {
                          const r = buildSubsidiary({ type: buildOpen.type, cityCode: code });
                          if (!r.ok) { setError(r.error ?? "Build failed"); return; }
                          setBuildOpen(null);
                          setError(null);
                        }}
                        disabled={owns || player.cashUsd < entry.setupCostUsd}
                        className={cn(
                          "w-full flex items-center justify-between px-3 py-2 text-left text-[0.8125rem] border-b border-line/40 last:border-0 hover:bg-surface-hover disabled:opacity-50",
                          owns && "bg-surface-2/40",
                        )}
                      >
                        <span className="flex items-baseline gap-2">
                          <span className="font-mono tabular text-ink">{code}</span>
                          <span className="text-ink-2">{city?.name ?? code}</span>
                          {isHub && (
                            <span className="text-[0.5625rem] uppercase tracking-wider text-accent font-semibold">hub</span>
                          )}
                        </span>
                        {owns ? (
                          <span className="text-[0.625rem] text-ink-muted italic">already built</span>
                        ) : (
                          <ArrowRight size={12} className="text-ink-muted" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {error && <div className="text-negative text-[0.875rem]">{error}</div>}
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => { setBuildOpen(null); setError(null); }}>
                  Cancel
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>

      {/* Sell confirm */}
      <Modal open={!!confirmSell} onClose={() => setConfirmSell(null)}>
        {confirmSell && (() => {
          const entry = SUBSIDIARY_BY_TYPE[confirmSell.type];
          const proceeds = Math.round(confirmSell.marketValueUsd * 0.95);
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">Sell {entry?.name}</h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  At {confirmSell.cityCode}. You receive {fmtMoney(proceeds)} (5% broker fee).
                  {entry?.operationalBonus && " Operational bonus removed."}
                </p>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmSell(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    sellSubsidiary(confirmSell.id);
                    setConfirmSell(null);
                  }}
                >
                  Sell for {fmtMoney(proceeds)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

function SubsidiaryIcon({ type }: { type: SubsidiaryType }) {
  const cls = "shrink-0 text-ink-2";
  switch (type) {
    case "hotel": return <Building2 size={18} className={cls} />;
    case "limo": return <Car size={18} className={cls} />;
    case "lounge": return <Coffee size={18} className={cls} />;
    case "maintenance-hub": return <Wrench size={18} className={cls} />;
    case "fuel-storage": return <Fuel size={18} className={cls} />;
    case "catering": return <Utensils size={18} className={cls} />;
    case "training-academy": return <GraduationCap size={18} className={cls} />;
  }
}

function SummaryCard({
  label, value, sub, tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "pos" | "neg";
}) {
  const toneCls = tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={cn("font-display text-[1.375rem] tabular leading-none mt-1", toneCls)}>
        {value}
      </div>
      {sub && <div className="text-[0.625rem] text-ink-muted mt-1.5">{sub}</div>}
    </div>
  );
}
