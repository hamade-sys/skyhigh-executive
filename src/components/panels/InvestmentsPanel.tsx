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
  Handshake,
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
  const teams = useGame((s) => s.teams);
  const buildSubsidiary = useGame((s) => s.buildSubsidiary);
  const sellSubsidiary = useGame((s) => s.sellSubsidiary);
  const offerSubsidiaryToRival = useGame((s) => s.offerSubsidiaryToRival);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const [buildOpen, setBuildOpen] = useState<{ type: SubsidiaryType } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmSell, setConfirmSell] = useState<Subsidiary | null>(null);
  // P2P offer state — sub being offered, who to offer it to, and
  // the asking price the seller wants. The rival auto-evaluates;
  // this modal collects the seller's offer terms only.
  const [offerSub, setOfferSub] = useState<Subsidiary | null>(null);
  const [offerRivalId, setOfferRivalId] = useState<string>("");
  const [offerPriceUsd, setOfferPriceUsd] = useState<number>(0);
  const [offerError, setOfferError] = useState<string | null>(null);

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
                          <div className="flex items-center gap-1.5 shrink-0">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOfferSub(sub);
                                // Default the asking price to mark-to-market
                                // so the seller can quickly accept "as-is".
                                setOfferPriceUsd(Math.round(sub.marketValueUsd));
                                // Default rival = first non-player team that
                                // has cash; user can change.
                                const firstRival = teams.find(
                                  (t) => t.id !== player.id && t.cashUsd > 0,
                                );
                                setOfferRivalId(firstRival?.id ?? "");
                                setOfferError(null);
                              }}
                              title="Offer this asset to a rival airline for a private peer-to-peer trade (no broker fee)"
                            >
                              <Handshake size={12} /> Offer
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setConfirmSell(sub)}
                              title={`Sell to market for ~${fmtMoney(sellProceeds)} (5% broker fee)`}
                            >
                              Sell
                            </Button>
                          </div>
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

      {/* Peer-to-peer offer — pick a rival + asking price.
          The rival auto-evaluates: accepts iff price ≤ 110% of market
          AND they have the cash. No broker fee on P2P trades, so the
          seller pockets the full asking price. */}
      <Modal open={!!offerSub} onClose={() => { setOfferSub(null); setOfferError(null); }}>
        {offerSub && (() => {
          const entry = SUBSIDIARY_BY_TYPE[offerSub.type];
          const market = offerSub.marketValueUsd;
          const ceiling = Math.round(market * 1.10);
          const rivals = teams.filter((t) => t.id !== player.id);
          const selectedRival = rivals.find((t) => t.id === offerRivalId);
          const overCeiling = offerPriceUsd > ceiling;
          const rivalCantAfford = selectedRival ? selectedRival.cashUsd < offerPriceUsd : false;
          const willLikelyAccept = !overCeiling && !rivalCantAfford && offerPriceUsd > 0;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Offer {entry?.name} to a rival
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Private peer-to-peer trade — no 5% broker fee. Rival accepts
                  iff your price is at most 110% of mark-to-market AND they
                  can afford it.
                </p>
              </ModalHeader>
              <ModalBody className="space-y-4">
                {/* Asset summary */}
                <div className="rounded-md border border-line bg-surface-2/30 p-3 flex items-baseline justify-between gap-3">
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono tabular text-ink text-[0.8125rem]">{offerSub.cityCode}</span>
                      <span className="text-[0.8125rem] text-ink-2">
                        {CITIES_BY_CODE[offerSub.cityCode]?.name ?? offerSub.cityCode}
                      </span>
                    </div>
                    <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                      Mark-to-market {fmtMoney(market)} · 110% ceiling {fmtMoney(ceiling)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">If sold to market</div>
                    <div className="font-mono tabular text-[0.75rem] text-ink-muted">
                      {fmtMoney(Math.round(market * 0.95))} (5% fee)
                    </div>
                  </div>
                </div>

                {/* Rival picker */}
                <div>
                  <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
                    Pick a rival airline ({rivals.length})
                  </div>
                  {rivals.length === 0 ? (
                    <div className="text-[0.8125rem] text-ink-muted italic">
                      No rival airlines in this game session.
                    </div>
                  ) : (
                    <div className="rounded-md border border-line divide-y divide-line max-h-56 overflow-auto">
                      {rivals.map((t) => {
                        const selected = t.id === offerRivalId;
                        const canPay = t.cashUsd >= offerPriceUsd;
                        return (
                          <button
                            key={t.id}
                            onClick={() => setOfferRivalId(t.id)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 text-left text-[0.8125rem] hover:bg-surface-hover",
                              selected && "bg-[var(--accent-soft)]",
                            )}
                          >
                            <span className="flex items-baseline gap-2">
                              <span
                                className={cn(
                                  "inline-block w-2.5 h-2.5 rounded-full shrink-0",
                                  selected ? "bg-accent" : "bg-line",
                                )}
                              />
                              <span className="font-semibold text-ink">{t.name}</span>
                              <span className="text-[0.6875rem] text-ink-muted font-mono">{t.code}</span>
                            </span>
                            <span
                              className={cn(
                                "font-mono tabular text-[0.6875rem]",
                                canPay ? "text-ink-muted" : "text-negative",
                              )}
                            >
                              cash {fmtMoney(t.cashUsd)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Asking price */}
                <div>
                  <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5">
                    Asking price (USD)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      step={100000}
                      min={0}
                      value={offerPriceUsd}
                      onChange={(e) => setOfferPriceUsd(Math.max(0, Number(e.target.value) || 0))}
                      className="flex-1 px-3 py-2 rounded-md border border-line bg-surface text-ink tabular font-mono text-[0.875rem] focus:outline-none focus:ring-2 focus:ring-accent/50"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOfferPriceUsd(Math.round(market))}
                      title="Set price = current market value"
                    >
                      Market
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setOfferPriceUsd(ceiling)}
                      title="Set price = 110% market ceiling (max likely accept)"
                    >
                      Max
                    </Button>
                  </div>
                  <div className="flex items-center justify-between mt-1.5 text-[0.6875rem]">
                    <span className="text-ink-muted">
                      vs market{" "}
                      <span
                        className={cn(
                          "tabular font-mono",
                          offerPriceUsd > market ? "text-positive" : offerPriceUsd < market ? "text-negative" : "text-ink-muted",
                        )}
                      >
                        {offerPriceUsd > market ? "+" : ""}
                        {market > 0 ? (((offerPriceUsd - market) / market) * 100).toFixed(1) : "0.0"}%
                      </span>
                    </span>
                    {willLikelyAccept ? (
                      <span className="text-positive font-semibold">Within rival&apos;s likely-accept range</span>
                    ) : overCeiling ? (
                      <span className="text-negative">Above 110% ceiling — rival will decline</span>
                    ) : rivalCantAfford ? (
                      <span className="text-negative">Selected rival can&apos;t afford this price</span>
                    ) : null}
                  </div>
                </div>

                {offerError && (
                  <div className="text-negative text-[0.8125rem] rounded-md bg-[var(--negative-soft)] p-2.5">
                    {offerError}
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => { setOfferSub(null); setOfferError(null); }}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!offerRivalId || offerPriceUsd <= 0 || rivals.length === 0}
                  onClick={() => {
                    const r = offerSubsidiaryToRival(offerSub.id, offerRivalId, offerPriceUsd);
                    if (!r.ok) {
                      setOfferError(r.error ?? "Offer failed");
                      return;
                    }
                    // Whether accepted or declined, the store has already
                    // toasted the outcome — close the modal either way.
                    setOfferSub(null);
                    setOfferError(null);
                  }}
                >
                  Send offer · {fmtMoney(offerPriceUsd)}
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
