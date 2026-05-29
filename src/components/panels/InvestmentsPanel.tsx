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
import { useGame, selectPlayer, useCampaignStartYear } from "@/store/game";
import { useUi } from "@/store/ui";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { CITIES_BY_CODE } from "@/data/cities";
import {
  SUBSIDIARY_CATALOG,
  SUBSIDIARY_BY_TYPE,
} from "@/data/subsidiaries";
import type { SubsidiaryType, Subsidiary } from "@/types/game";
import {
  SUBSIDIARY_TIER_REV_MULT,
  SUBSIDIARY_UPGRADE_COST_MULT,
} from "@/types/game";
import { cn } from "@/lib/cn";
import { FUEL_BASELINE_USD_PER_L } from "@/lib/engine";
import { toast } from "@/store/toasts";

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
  const isObserver = useGame((s) => s.isObserver);
  if (!player) return null;
  // CRITICAL FIX (May 2026): when viewing a rival airline (observer
  // mode flipped by Switch view), the panel was crashing because
  // every action (buildSubsidiary, upgradeSubsidiary, fuel buy etc.)
  // operates on the player's team, not the team being viewed. The
  // resulting state mismatch + click handlers reading rival fields
  // triggered a runtime error.
  // Read-only summary in observer mode keeps the screen safe and
  // gives the player at-a-glance intel on the rival's footprint.
  if (isObserver) {
    return <RivalInvestmentsReadOnly rival={player} />;
  }
  return <InvestmentsPanelInner playerId={player.id} />;
}

/** Read-only investments view for the Switch-view rival mode.
 *  Surfaces what a competitor publicly does: subsidiary count by
 *  type, Premium Hub cities, fuel-storage / maintenance / lounge
 *  hub investments. No actions, no financials. */
function RivalInvestmentsReadOnly({ rival }: { rival: import("@/types/game").Team }) {
  const subs = rival.subsidiaries ?? [];
  // Group by city to surface Premium Hub status (3+ at one city).
  const cityCount = new Map<string, number>();
  const typeCount = new Map<string, number>();
  for (const s of subs) {
    cityCount.set(s.cityCode, (cityCount.get(s.cityCode) ?? 0) + 1);
    typeCount.set(s.type, (typeCount.get(s.type) ?? 0) + 1);
  }
  const premiumHubs = Array.from(cityCount.entries()).filter(([, c]) => c >= 3);
  const tierBest = subs.some((s) => s.tier === "flagship") ? "Flagship"
    : subs.some((s) => s.tier === "premium") ? "Premium" : "Basic";

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-line bg-surface-2/30 px-3 py-2">
        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
          Rival intel · {rival.name}
        </div>
        <div className="text-[0.75rem] text-ink-muted mt-0.5">
          View-only — financial details (cash, debt, revenue per asset) are private.
        </div>
      </div>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Subsidiary footprint
        </div>
        {subs.length === 0 ? (
          <div className="rounded-md border border-dashed border-line px-3 py-4 text-center text-[0.75rem] text-ink-muted">
            No subsidiaries built yet.
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-md border border-line bg-surface px-3 py-2.5 grid grid-cols-3 gap-2 text-[0.75rem]">
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Total</div>
                <div className="font-mono tabular text-ink text-[1rem] font-semibold">{subs.length}</div>
              </div>
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Best tier</div>
                <div className="text-ink text-[0.875rem] font-semibold">{tierBest}</div>
              </div>
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Premium Hubs</div>
                <div className="text-ink text-[0.875rem] font-semibold">{premiumHubs.length}</div>
              </div>
            </div>
            {premiumHubs.length > 0 && (
              <div className="text-[0.6875rem] text-positive leading-snug">
                Premium Hubs (3+ subs/city): {premiumHubs.map(([c, n]) => `${c} (${n})`).join(", ")}
              </div>
            )}
            <div className="grid grid-cols-2 gap-1.5 text-[0.75rem]">
              {Array.from(typeCount.entries())
                .sort((a, b) => b[1] - a[1])
                .map(([type, count]) => {
                  const cities = subs.filter((s) => s.type === type).map((s) => s.cityCode);
                  return (
                    <div key={type} className="rounded-md border border-line bg-surface px-2 py-1.5">
                      <div className="text-ink-2 capitalize">{type.replace(/-/g, " ")}</div>
                      <div className="text-[0.625rem] text-ink-muted">
                        {count} × at {cities.join(", ")}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function InvestmentsPanelInner({ playerId }: { playerId: string }) {
  const startYear = useCampaignStartYear();
  // Re-subscribe to player so this child re-renders when fleet/cash
  // change — but the parent's early-return guarantees player exists
  // by the time this component mounts.
  const player = useGame(selectPlayer);
  const teams = useGame((s) => s.teams);
  const buildSubsidiary = useGame((s) => s.buildSubsidiary);
  const sellSubsidiary = useGame((s) => s.sellSubsidiary);
  const upgradeSubsidiary = useGame((s) => s.upgradeSubsidiary);
  const refurbishSubsidiary = useGame((s) => s.refurbishSubsidiary);
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

  // Quarterly portfolio revenue + total mark-to-market value.
  // Tier multipliers apply on top of condition: basic 1.0×, premium
  // 1.6×, flagship 2.4× of the catalog base revenue (see engine).
  const portfolioRevenue = owned.reduce((sum, s) => {
    const e = SUBSIDIARY_BY_TYPE[s.type];
    const tierMult = SUBSIDIARY_TIER_REV_MULT[s.tier ?? "basic"] ?? 1.0;
    return sum + (e?.revenuePerQuarterUsd ?? 0) * s.conditionPct * tierMult;
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
      {/* Consolidated Portfolio overview (recommendation #B7).
          Surfaces owned airports + pending bids + slot leases + hub
          investments at the TOP of the panel so the player has one
          consolidated view of every asset they hold beyond aircraft
          + routes. Subsidiaries (the existing flow) live below. */}
      <PortfolioOverview />

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

      {/* ── Fuel hedging (Phase 1B) ─────────────────────────────────
          Surfaces team.fuelStorageLevelL + team.fuelTanks so the
          player can: buy tank capacity, bulk-buy fuel at 25% off
          spot, sell stored fuel back if needed, and see how much was
          drawn last quarter at the avg cost basis. Before this, the
          buyFuelTank / buyBulkFuel / sellStoredFuel store actions
          existed but had no UI entry-point — the catalogue promised
          the feature, the engine consumed from storage, but the
          player had no way to put fuel in. */}
      <FuelHedgingSection />

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
                      // ── Payback storytelling: optimistic cumulative
                      //    earnings = revenuePerQ × ageQ × current
                      //    condition. (Real earnings would integrate
                      //    condition decay quarter-by-quarter; this is
                      //    a defensible upper-bound estimate without
                      //    history.) Compared to setup cost, surfaces
                      //    "paid back" or "X% to breakeven".
                      const tier = sub.tier ?? "basic";
                      const tierMult = SUBSIDIARY_TIER_REV_MULT[tier];
                      const ratePerQ = entry.revenuePerQuarterUsd * sub.conditionPct * tierMult;
                      const upgradeCost = Math.round(entry.setupCostUsd * SUBSIDIARY_UPGRADE_COST_MULT);
                      const refurbCost = Math.round(sub.marketValueUsd * 0.15);
                      const conditionPct = Math.round(sub.conditionPct * 100);
                      const conditionTone: "pos" | "warn" | "neg" =
                        conditionPct >= 85 ? "pos" : conditionPct >= 50 ? "warn" : "neg";
                      const tierLabel = tier === "basic" ? "Basic"
                        : tier === "premium" ? "Premium" : "Flagship";
                      const tierToneClass = tier === "flagship"
                        ? "bg-[var(--positive-soft)] text-positive"
                        : tier === "premium"
                          ? "bg-[var(--accent-soft)] text-accent"
                          : "bg-surface-2 text-ink-muted";
                      const cumulativeEarned = ratePerQ * ageQ;
                      const paybackPct = sub.purchaseCostUsd > 0
                        ? Math.min(1, cumulativeEarned / sub.purchaseCostUsd)
                        : 1;
                      const isPaidBack = paybackPct >= 1;
                      const qToBreakeven = isPaidBack
                        ? 0
                        : ratePerQ > 0
                          ? Math.ceil((sub.purchaseCostUsd - cumulativeEarned) / ratePerQ)
                          : Infinity;
                      return (
                        <div key={sub.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-baseline gap-2 flex-wrap">
                              <span className="font-mono tabular text-ink text-[0.8125rem]">{sub.cityCode}</span>
                              <span className="text-[0.8125rem] text-ink-2 truncate">
                                {city?.name ?? sub.cityCode}
                              </span>
                              <span className={`text-[0.5625rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${tierToneClass}`}>
                                {tierLabel}
                              </span>
                              <span className="text-[0.625rem] text-ink-muted">
                                acquired {fmtQuarter(sub.acquiredAtQuarter, startYear)} · {ageQ}Q held
                              </span>
                              {entry.revenuePerQuarterUsd > 0 && (
                                isPaidBack ? (
                                  <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-positive bg-[var(--positive-soft)] px-1.5 py-0.5 rounded">
                                    Paid back
                                  </span>
                                ) : qToBreakeven < 100 ? (
                                  <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-accent bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
                                    {qToBreakeven}Q to breakeven
                                  </span>
                                ) : null
                              )}
                            </div>
                            <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                              Earns {fmtMoney(ratePerQ)}/Q
                              {entry.revenuePerQuarterUsd > 0 && (
                                <span className="ml-1.5">
                                  · {fmtMoney(cumulativeEarned)} earned vs {fmtMoney(sub.purchaseCostUsd)} setup
                                </span>
                              )}
                              {entry.operationalBonus && ` · ${entry.operationalBonus}`}
                            </div>
                            {/* Condition bar — drives the Refurbish CTA below.
                                Pos green ≥85%, amber 50-85%, red <50%. */}
                            <div className="mt-1.5 flex items-center gap-2">
                              <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted shrink-0 w-[60px]">
                                Condition
                              </span>
                              <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                                <div
                                  className={`h-full transition-[width] duration-[var(--dur-fast)] ${
                                    conditionTone === "pos" ? "bg-positive" :
                                    conditionTone === "warn" ? "bg-warning" : "bg-negative"
                                  }`}
                                  style={{ width: `${conditionPct}%` }}
                                />
                              </div>
                              <span className={`text-[0.625rem] tabular font-mono shrink-0 w-[36px] text-right ${
                                conditionTone === "pos" ? "text-positive" :
                                conditionTone === "warn" ? "text-warning" : "text-negative"
                              }`}>
                                {conditionPct}%
                              </span>
                            </div>
                            {/* Payback progress bar — only renders for cash-
                                generating subsidiaries. Bar fills as
                                cumulative earnings approach the original
                                setup cost. */}
                            {entry.revenuePerQuarterUsd > 0 && !isPaidBack && (
                              <div className="mt-1 flex items-center gap-2">
                                <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted shrink-0 w-[60px]">
                                  Payback
                                </span>
                                <div className="flex-1 h-1 bg-surface-2 rounded-full overflow-hidden">
                                  <div
                                    className="h-full bg-accent transition-[width] duration-[var(--dur-fast)]"
                                    style={{ width: `${(paybackPct * 100).toFixed(0)}%` }}
                                  />
                                </div>
                                <span className="text-[0.625rem] tabular font-mono shrink-0 w-[36px] text-right text-ink-muted">
                                  {Math.round(paybackPct * 100)}%
                                </span>
                              </div>
                            )}
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
                            {/* Upgrade — only when tier can still go up */}
                            {tier !== "flagship" && (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  const r = upgradeSubsidiary(sub.id);
                                  if (!r.ok) setError(r.error ?? "Upgrade failed");
                                }}
                                title={`Upgrade to ${tier === "basic" ? "Premium (1.6× revenue)" : "Flagship (2.4× revenue)"} for ${fmtMoney(upgradeCost)}. Resets condition to 100%.`}
                              >
                                Upgrade · {fmtMoney(upgradeCost)}
                              </Button>
                            )}
                            {/* Refurbish — only when condition has decayed */}
                            {sub.conditionPct < 0.9 && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  const r = refurbishSubsidiary(sub.id);
                                  if (!r.ok) setError(r.error ?? "Refurb failed");
                                }}
                                title={`Restore condition to 100% for ${fmtMoney(refurbCost)} (15% of market value).`}
                              >
                                Refurbish · {fmtMoney(refurbCost)}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOfferSub(sub);
                                setOfferPriceUsd(Math.round(sub.marketValueUsd));
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

                {/* ROI storytelling — payback period + 5Y net so the
                    player can compare investments without doing the math
                    in their head. Operational assets show their bonus
                    text instead since they don't have a cash payback. */}
                {entry.revenuePerQuarterUsd > 0 ? (() => {
                  const paybackQ = Math.ceil(entry.setupCostUsd / entry.revenuePerQuarterUsd);
                  // 5Y horizon = 20 quarters at 100% condition. Real
                  // condition decays slightly each quarter, so this is
                  // the optimistic / "if you stay on top of upkeep" floor.
                  const fiveYearNet = entry.revenuePerQuarterUsd * 20 - entry.setupCostUsd;
                  // Flagship preview: at 2.0× total cost, revenue is
                  // 2.8× base. Shown as a teaser so the player sees the
                  // late-game upside before they commit.
                  const flagshipRevPerQ = entry.revenuePerQuarterUsd * 2.8;
                  const flagshipTotalCost = entry.setupCostUsd * 2.0;
                  const flagshipPaybackQ = Math.ceil(flagshipTotalCost / flagshipRevPerQ);
                  const paybackTone =
                    paybackQ <= 8
                      ? "fast"
                      : paybackQ <= 16
                        ? "medium"
                        : "slow";
                  return (
                    <div className="rounded-md border border-line bg-surface-2/40 px-2 py-1.5 grid grid-cols-2 gap-2 text-[0.6875rem]">
                      <div>
                        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                          Payback
                        </div>
                        <div className="flex items-baseline gap-1">
                          <span className="tabular font-mono font-semibold text-ink">
                            {paybackQ}Q
                          </span>
                          <span
                            className={cn(
                              "text-[0.5625rem] uppercase tracking-wider font-semibold",
                              paybackTone === "fast"
                                ? "text-positive"
                                : paybackTone === "medium"
                                  ? "text-accent"
                                  : "text-warning",
                            )}
                          >
                            {paybackTone}
                          </span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                          5Y net
                        </div>
                        <div
                          className={cn(
                            "tabular font-mono font-semibold",
                            fiveYearNet >= 0 ? "text-positive" : "text-negative",
                          )}
                        >
                          {fiveYearNet >= 0 ? "+" : ""}{fmtMoney(fiveYearNet)}
                        </div>
                      </div>
                      <div className="col-span-2 pt-1.5 mt-0.5 border-t border-line/40">
                        <div className="text-[0.625rem] uppercase tracking-wider text-positive">
                          Flagship potential
                        </div>
                        <div className="text-[0.6875rem] text-ink-2 leading-snug">
                          Pay {fmtMoney(flagshipTotalCost)} total · earn{" "}
                          <span className="tabular font-mono text-positive">{fmtMoney(flagshipRevPerQ)}/Q</span>{" "}
                          · payback {flagshipPaybackQ}Q
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="rounded-md border border-line bg-surface-2/40 px-2 py-1.5 text-[0.6875rem] text-ink-2">
                    <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                      Strategic value
                    </span>
                    <div className="text-ink-2 leading-snug mt-0.5">
                      No direct cash return — value via brand, loyalty, or
                      operational leverage at this hub.
                    </div>
                  </div>
                )}

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

      {/* ── Rival intel ─────────────────────────────────────────────
          Workshop feedback (v2.6 ship): now that bots build their own
          subsidiaries (hard 25%/Q, hot bots stacking demand moats at
          their hubs), the player needs visibility into rival footprint
          so the moat mechanic creates real competitive pressure. This
          section ranks rivals by subsidiary count + Premium Hub status.
          Hidden when there are no rivals (solo onboarding mode). */}
      <RivalSubsidiaryIntel />

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

/** Portfolio overview — single consolidated view of every non-aircraft
 *  asset the player holds. Recommendation #B7: airports + pending bids
 *  + slot leases + hub investments + subsidiaries were scattered across
 *  the SlotMarketPanel, AirportDetailModal, HubInvestmentsModal, and
 *  this InvestmentsPanel. Now they live in one rolling summary the
 *  player can scan at a glance. Each asset row links back to the
 *  panel where it can be managed.
 */
function PortfolioOverview() {
  const startYear = useCampaignStartYear();
  const player = useGame(selectPlayer);
  const airportSlots = useGame((s) => s.airportSlots);
  const airportBids = useGame((s) => s.airportBids ?? []);
  const setAirportDetailCode = useUi((u) => u.setAirportDetailCode);
  const openPanel = useUi((u) => u.openPanel);

  if (!player) return null;

  // Owned airports (player.id matches airportSlots[code].ownerTeamId).
  const ownedAirports = Object.entries(airportSlots ?? {})
    .filter(([, st]) => st.ownerTeamId === player.id)
    .map(([code, st]) => ({ code, state: st }));

  // Pending airport bids submitted by this team, awaiting facilitator
  // approval. Cash is escrowed; surface so the player knows what's tied up.
  const myPendingBids = airportBids.filter(
    (b) => b.bidderTeamId === player.id && b.status === "pending",
  );

  // Slot leases — every airport where the player holds at least one slot.
  const slotLeases = Object.entries(player.airportLeases ?? {})
    .filter(([, l]) => (l?.slots ?? 0) > 0)
    .map(([code, l]) => ({ code, lease: l }));

  // Hub investments — fuel reserve tanks, maintenance depots, premium
  // lounges, ops expansion. Pull from team.hubInvestments.
  const hubInv = player.hubInvestments;
  const hubInvCount =
    (hubInv?.fuelReserveTankHubs?.length ?? 0)
    + (hubInv?.maintenanceDepotHubs?.length ?? 0)
    + (hubInv?.premiumLoungeHubs?.length ?? 0)
    + (hubInv?.opsExpansionSlots ?? 0 > 0 ? 1 : 0);

  const subCount = (player.subsidiaries ?? []).length;

  // Aggregate counts for the summary header — one number per asset
  // class, plus a portfolio mark-to-market total where computable.
  const totalSlotsHeld = slotLeases.reduce((s, x) => s + x.lease.slots, 0);
  const escrowedBidsUsd = myPendingBids.reduce((s, b) => s + b.bidPriceUsd, 0);

  // If the player has nothing in this panel yet (sub-Q5 fresh game)
  // skip rendering rather than showing five "0" cards.
  if (
    ownedAirports.length === 0 &&
    myPendingBids.length === 0 &&
    slotLeases.length === 0 &&
    hubInvCount === 0 &&
    subCount === 0
  ) {
    return null;
  }

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Portfolio overview · all assets
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <PortfolioCount
          label="Airports"
          value={ownedAirports.length}
          sub={ownedAirports.length === 0 ? "None owned" : "Full ownership"}
          onClick={ownedAirports.length > 0 ? () => setAirportDetailCode(ownedAirports[0].code) : undefined}
          ctaLabel={ownedAirports.length > 0 ? "Open first" : undefined}
        />
        <PortfolioCount
          label="Pending bids"
          value={myPendingBids.length}
          sub={myPendingBids.length === 0 ? "No bids in review" : `${fmtMoney(escrowedBidsUsd)} in escrow`}
          onClick={myPendingBids.length > 0 ? () => setAirportDetailCode(myPendingBids[0].airportCode) : undefined}
          ctaLabel={myPendingBids.length > 0 ? "Open first" : undefined}
          tone={myPendingBids.length > 0 ? "warn" : "default"}
        />
        <PortfolioCount
          label="Slot leases"
          value={slotLeases.length}
          sub={slotLeases.length === 0 ? "None held" : `${totalSlotsHeld} slots across airports`}
          onClick={() => openPanel("slots")}
          ctaLabel="Slot Market"
        />
        <PortfolioCount
          label="Hub upgrades"
          value={hubInvCount}
          sub={hubInvCount === 0 ? "None purchased" : "Tanks · depots · lounges"}
        />
        <PortfolioCount
          label="Subsidiaries"
          value={subCount}
          sub={subCount === 0 ? "None built" : "Hotel · limo · catering · …"}
        />
      </div>

      {/* Owned airports detail list — actionable rows (open detail) */}
      {ownedAirports.length > 0 && (
        <div className="mt-3">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">
            Owned airports
          </div>
          <div className="space-y-1.5">
            {ownedAirports.map(({ code, state }) => {
              const city = CITIES_BY_CODE[code];
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setAirportDetailCode(code)}
                  className="w-full flex items-center justify-between rounded-md border border-line bg-surface px-3 py-2 hover:bg-surface-hover text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono tabular text-ink text-[0.8125rem]">{code}</span>
                    <span className="text-[0.8125rem] text-ink-2 truncate">{city?.name ?? code}</span>
                  </span>
                  <span className="text-[0.6875rem] text-ink-muted tabular font-mono shrink-0">
                    {state.totalCapacity ?? "—"} cap · {fmtMoney(state.ownerSlotRatePerWeekUsd ?? 0)}/wk slot
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Pending bids detail list */}
      {myPendingBids.length > 0 && (
        <div className="mt-3">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">
            Pending airport bids · cash held in escrow
          </div>
          <div className="space-y-1.5">
            {myPendingBids.map((b) => {
              const city = CITIES_BY_CODE[b.airportCode];
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setAirportDetailCode(b.airportCode)}
                  className="w-full flex items-center justify-between rounded-md border border-warning/40 bg-[var(--warning-soft)]/30 px-3 py-2 hover:bg-[var(--warning-soft)]/50 text-left transition-colors"
                >
                  <span className="flex items-baseline gap-2 min-w-0">
                    <span className="font-mono tabular text-ink text-[0.8125rem]">{b.airportCode}</span>
                    <span className="text-[0.8125rem] text-ink-2 truncate">{city?.name ?? b.airportCode}</span>
                    <span className="text-[0.625rem] uppercase tracking-wider text-warning shrink-0">
                      submitted {fmtQuarter(b.submittedQuarter, startYear)}
                    </span>
                  </span>
                  <span className="text-[0.75rem] tabular font-mono text-ink shrink-0">
                    {fmtMoney(b.bidPriceUsd)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

/** Compact count card for the portfolio overview row. */
function PortfolioCount({
  label, value, sub, tone, onClick, ctaLabel,
}: {
  label: string;
  value: number;
  sub?: string;
  tone?: "warn" | "default";
  onClick?: () => void;
  ctaLabel?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-md border bg-surface p-2.5",
        tone === "warn" ? "border-warning/40 bg-[var(--warning-soft)]/30" : "border-line",
      )}
    >
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="font-display text-[1.5rem] tabular text-ink leading-none mt-0.5">
        {value}
      </div>
      {sub && (
        <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">{sub}</div>
      )}
      {onClick && ctaLabel && (
        <button
          type="button"
          onClick={onClick}
          className="mt-1.5 text-[0.6875rem] text-accent hover:underline focus-visible:outline-none focus-visible:underline"
        >
          {ctaLabel} →
        </button>
      )}
    </div>
  );
}

// ─── Fuel hedging section (Phase 1B) ──────────────────────────────────
//
// The team's fuel-storage state lives at the team level (not per-hub):
// `fuelStorageLevelL` (litres held) + `fuelStorageAvgCostPerL` (weighted
// avg cost basis). Capacity is gated by installed tanks
// (`fuelTanks.small/medium/large` × 25M/75M/150M L). Each tank costs
// $3M/$8M/$15M up-front and adds maintenance to the next quarter close.
//
// Routes from a hub that has a `fuelReserveTank` subsidiary built get a
// 15% routing discount (engine: src/lib/engine.ts:1838). Bulk-buys at
// 25% off market into the global pool stack on top: at quarter close
// the engine swaps in stored fuel at avg cost across all routes (engine:
// src/lib/engine.ts:2932). The catalogue promise of "25% off bulk +
// 15% routing" is delivered by the combination of these mechanisms.

const TANK_SPECS = {
  small:  { cost: 3_000_000,  capacityL: 25_000_000,  label: "Small" },
  medium: { cost: 8_000_000,  capacityL: 75_000_000,  label: "Medium" },
  large:  { cost: 15_000_000, capacityL: 150_000_000, label: "Large" },
} as const;
const MAX_STORAGE_L = 300_000_000;

/** Rival subsidiary intel — competitive-pressure card showing what
 *  the other airlines are building. Drives the workshop "they're
 *  stacking flagship lounges at LHR — I need to counter at JFK"
 *  moment. Hidden in solo-onboarding (no rivals). */
function RivalSubsidiaryIntel() {
  const player = useGame(selectPlayer);
  const teams = useGame((s) => s.teams);
  if (!player) return null;
  const rivals = teams.filter((t) => t.id !== player.id);
  if (rivals.length === 0) return null;

  // Compute per-rival stats: total subsidiary count, top city by
  // count, premium-hub status (3+ at one city), best tier present.
  const rivalStats = rivals
    .map((r) => {
      const subs = r.subsidiaries ?? [];
      if (subs.length === 0) return null;
      const cityCount = new Map<string, number>();
      for (const s of subs) {
        cityCount.set(s.cityCode, (cityCount.get(s.cityCode) ?? 0) + 1);
      }
      const sortedCities = Array.from(cityCount.entries())
        .sort((a, b) => b[1] - a[1]);
      const topCity = sortedCities[0];
      const premiumHubCities = sortedCities.filter(([, c]) => c >= 3).map(([code]) => code);
      const bestTier: "basic" | "premium" | "flagship" = subs.some((s) => s.tier === "flagship")
        ? "flagship"
        : subs.some((s) => s.tier === "premium")
          ? "premium"
          : "basic";
      return {
        team: r,
        subCount: subs.length,
        topCity: topCity ? { code: topCity[0], count: topCity[1] } : null,
        premiumHubCities,
        bestTier,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.subCount - a.subCount);

  if (rivalStats.length === 0) {
    return (
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Rival intel · subsidiary footprint
        </div>
        <div className="rounded-md border border-line bg-surface-2/30 px-3 py-3 text-[0.75rem] text-ink-muted leading-snug">
          No rivals have built subsidiaries yet — first-mover advantage is still open.
          A flagship lounge at your hub city right now will out-yield any rival catching
          up later.
        </div>
      </section>
    );
  }

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Rival intel · subsidiary footprint
      </div>
      <div className="rounded-md border border-line bg-surface overflow-hidden">
        <div className="divide-y divide-line">
          {rivalStats.slice(0, 5).map((rs) => {
            const tierClass = rs.bestTier === "flagship"
              ? "bg-[var(--positive-soft)] text-positive"
              : rs.bestTier === "premium"
                ? "bg-[var(--accent-soft)] text-accent"
                : "bg-surface-2 text-ink-muted";
            const tierLabel = rs.bestTier === "flagship" ? "Flagship"
              : rs.bestTier === "premium" ? "Premium" : "Basic";
            return (
              <div key={rs.team.id} className="px-3 py-2 flex items-center gap-3">
                <div
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: rs.team.color ?? "#888" }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[0.8125rem] font-semibold text-ink truncate">
                    {rs.team.name}
                  </div>
                  <div className="text-[0.625rem] text-ink-muted">
                    {rs.subCount} subsidiar{rs.subCount === 1 ? "y" : "ies"}
                    {rs.topCity && ` · top: ${rs.topCity.code} (${rs.topCity.count})`}
                    {rs.premiumHubCities.length > 0 && (
                      <span className="text-positive ml-1">
                        · Premium Hub: {rs.premiumHubCities.join(", ")}
                      </span>
                    )}
                  </div>
                </div>
                <span className={`text-[0.5625rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded shrink-0 ${tierClass}`}>
                  {tierLabel}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="text-[0.625rem] text-ink-muted mt-1.5 leading-snug">
        Premium Hub = a city where the rival owns 3+ subsidiaries.
        Routes through their Premium Hubs collect a brand + loyalty bonus
        that compounds against you on shared OD pairs.
      </div>
    </section>
  );
}

function FuelHedgingSection() {
  const player = useGame(selectPlayer);
  const fuelIndex = useGame((s) => s.fuelIndex);
  const fuelIndexHistory = useGame((s) => s.fuelIndexHistory ?? []);
  const buyFuelTank = useGame((s) => s.buyFuelTank);
  const buyBulkFuel = useGame((s) => s.buyBulkFuel);
  const sellStoredFuel = useGame((s) => s.sellStoredFuel);
  const [buyOpen, setBuyOpen] = useState(false);
  const [sellOpen, setSellOpen] = useState(false);
  if (!player) return null;

  const tanks = player.fuelTanks ?? { small: 0, medium: 0, large: 0 };
  const totalTanks = (tanks.small ?? 0) + (tanks.medium ?? 0) + (tanks.large ?? 0);
  const capacityL =
    (tanks.small ?? 0) * TANK_SPECS.small.capacityL +
    (tanks.medium ?? 0) * TANK_SPECS.medium.capacityL +
    (tanks.large ?? 0) * TANK_SPECS.large.capacityL;
  const storedL = player.fuelStorageLevelL ?? 0;
  const avgCost = player.fuelStorageAvgCostPerL ?? 0;
  const roomL = Math.max(0, capacityL - storedL);
  const fillPct = capacityL > 0 ? (storedL / capacityL) * 100 : 0;
  const depotHubs = player.hubInvestments?.fuelReserveTankHubs ?? [];
  const marketPricePerL = (fuelIndex / 100) * FUEL_BASELINE_USD_PER_L;
  const bulkPricePerL = marketPricePerL * 0.75; // buy at 25% off spot
  // Sell at 65% of spot (10% haircut vs buy) so there's no riskless
  // round-trip on a flat market — see sellStoredFuel in store/game.ts.
  // Stored-fuel P&L uses the SELL price, not spot, so the player sees
  // what they'd actually realise if they liquidated right now.
  const sellPricePerL = marketPricePerL * 0.65;
  const valueAtCost = storedL * avgCost;
  const valueAtSell = storedL * sellPricePerL;
  const unrealizedPnL = valueAtSell - valueAtCost;

  // ─── Gamified market read ────────────────────────────────────
  // Turns fuel hedging from a passive button-screen into a real
  // trading decision. The verdict reflects how much the player
  // SHOULD care THIS QUARTER about fuel, based on three signals:
  //   1. Current index relative to baseline (100)
  //   2. Whether storage is empty/full/in-between
  //   3. Stored fuel cost basis vs current market (P&L)
  // Goal: every workshop player who opens this panel sees a
  // headline that tells them what to do next.
  let marketVerdict: {
    label: string;
    detail: string;
    tone: "pos" | "neg" | "warn" | "neutral";
  };
  if (fuelIndex <= 85 && capacityL > storedL) {
    marketVerdict = {
      label: "BUY WINDOW OPEN",
      detail: `Index ${Math.round(fuelIndex)} — well below baseline. Bulk @ $${bulkPricePerL.toFixed(3)}/L locks in a margin for the next price spike.`,
      tone: "pos",
    };
  } else if (fuelIndex >= 115 && storedL > 0 && unrealizedPnL > 0) {
    marketVerdict = {
      label: "SELL WINDOW OPEN",
      detail: `Index ${Math.round(fuelIndex)} — above baseline. Stored fuel is up ${fmtMoney(unrealizedPnL)} on cost basis. Lock in the profit?`,
      tone: "pos",
    };
  } else if (fuelIndex >= 130 && storedL === 0) {
    marketVerdict = {
      label: "PRICE SPIKE — NO HEDGE",
      detail: `Index ${Math.round(fuelIndex)} — spot is expensive and you're buying every litre at market. Build storage when index drops.`,
      tone: "neg",
    };
  } else if (capacityL === 0) {
    marketVerdict = {
      label: "NO TANKS YET",
      detail: "Install a tank to unlock the bulk-buy mechanic. First small tank pays back inside a year if you time even one spike.",
      tone: "warn",
    };
  } else {
    marketVerdict = {
      label: "MARKET QUIET",
      detail: `Index ${Math.round(fuelIndex)} — no decisive entry or exit. Hold position; watch for index < 90 or > 115.`,
      tone: "neutral",
    };
  }

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <div>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Fuel hedging · storage + bulk-buy
          </div>
          <div className="text-[0.625rem] text-ink-muted leading-snug max-w-md">
            Bulk-buy at 25% off market to pre-stock fuel at a low index quarter,
            then consume at quarter close when prices spike.
          </div>
        </div>
      </div>

      {/* ─── Market read + sparkline (May 2026 redesign) ──────────
          Headline verdict tells the player what to do RIGHT NOW.
          Sparkline plots last 8Q of fuel index with the baseline (100)
          and the player's avg-cost basis (when fuel is stored) as
          reference guides. Turns the static screen into a live
          trading dashboard. */}
      <div className={`rounded-lg border p-3 mb-3 flex items-stretch gap-4 ${
        marketVerdict.tone === "pos" ? "border-positive/40 bg-[var(--positive-soft)]/40" :
        marketVerdict.tone === "neg" ? "border-negative/40 bg-[var(--negative-soft)]/40" :
        marketVerdict.tone === "warn" ? "border-warning/40 bg-[var(--warning-soft)]/40" :
        "border-line bg-surface-2/30"
      }`}>
        <div className="flex-1 min-w-0">
          <div className={`text-[0.6875rem] uppercase tracking-wider font-bold ${
            marketVerdict.tone === "pos" ? "text-positive" :
            marketVerdict.tone === "neg" ? "text-negative" :
            marketVerdict.tone === "warn" ? "text-warning" : "text-ink-muted"
          }`}>
            {marketVerdict.label}
          </div>
          <div className="text-[0.75rem] text-ink-2 mt-1 leading-snug">
            {marketVerdict.detail}
          </div>
          {/* Quick-action shortcut so the player can act without scrolling */}
          {marketVerdict.tone === "pos" && (
            <div className="mt-2">
              {fuelIndex <= 85 && capacityL > storedL ? (
                <Button size="sm" variant="primary" onClick={() => setBuyOpen(true)}>
                  Buy fuel now →
                </Button>
              ) : storedL > 0 ? (
                <Button size="sm" variant="primary" onClick={() => setSellOpen(true)}>
                  Sell stored now →
                </Button>
              ) : null}
            </div>
          )}
        </div>
        <FuelIndexSparkline
          history={fuelIndexHistory}
          currentIndex={fuelIndex}
          avgCostIndexEquivalent={avgCost > 0
            ? Math.round((avgCost / FUEL_BASELINE_USD_PER_L) * 100 / 0.75)
            : null}
        />
      </div>

      {/* Top-line cards. Show ALWAYS — even with zero tanks — so the player
          knows where the upgrade lives. The "Buy tanks" CTA in the row
          below covers the empty state. */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <FuelKpi
          label="Capacity"
          value={`${(capacityL / 1_000_000).toFixed(0)}M L`}
          sub={totalTanks === 0 ? "No tanks installed" : `${totalTanks} tank${totalTanks === 1 ? "" : "s"}`}
        />
        <FuelKpi
          label="Stored"
          value={`${(storedL / 1_000_000).toFixed(1)}M L`}
          sub={capacityL > 0 ? `${fillPct.toFixed(0)}% full` : "—"}
          tone={fillPct > 50 ? "pos" : undefined}
        />
        <FuelKpi
          label="Avg cost"
          value={avgCost > 0 ? `$${avgCost.toFixed(3)}/L` : "—"}
          sub={
            unrealizedPnL > 0 && storedL > 0
              ? `Up ${fmtMoney(unrealizedPnL)} on hand`
              : unrealizedPnL < 0 && storedL > 0
                ? `Down ${fmtMoney(-unrealizedPnL)} on hand`
                : "no fuel held"
          }
          tone={unrealizedPnL > 0 && storedL > 0 ? "pos" : unrealizedPnL < 0 && storedL > 0 ? "neg" : undefined}
        />
        <FuelKpi
          label="Spot today"
          value={`$${marketPricePerL.toFixed(3)}/L`}
          sub={`Index ${Math.round(fuelIndex)} · bulk $${bulkPricePerL.toFixed(3)}/L`}
        />
      </div>

      {/* Action row + depot list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <div className="rounded-md border border-line bg-surface p-3">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-2 font-semibold">
            Tank capacity
          </div>
          <div className="space-y-1.5">
            {(["small", "medium", "large"] as const).map((size) => {
              const spec = TANK_SPECS[size];
              const owned = tanks[size] ?? 0;
              const atMax = capacityL + spec.capacityL > MAX_STORAGE_L;
              const canAfford = player.cashUsd >= spec.cost;
              return (
                <div key={size} className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[0.8125rem] text-ink-2">
                      {spec.label} tank
                      <span className="text-ink-muted ml-1">
                        · {(spec.capacityL / 1_000_000).toFixed(0)}M L · {fmtMoney(spec.cost)}
                      </span>
                    </div>
                    <div className="text-[0.6875rem] text-ink-muted tabular">
                      Owned: {owned}
                    </div>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={atMax || !canAfford}
                    title={atMax ? "300M L maximum storage reached" : !canAfford ? `Need ${fmtMoney(spec.cost)}` : undefined}
                    onClick={() => {
                      const r = buyFuelTank(size);
                      if (!r.ok && r.error) toast.warning("Cannot install tank", r.error);
                    }}
                  >
                    + Install
                  </Button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-md border border-line bg-surface p-3">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-2 font-semibold">
            Bulk fuel
          </div>
          <div className="space-y-2">
            <p className="text-[0.75rem] text-ink-muted leading-relaxed">
              Buy at <strong className="text-ink-2">${bulkPricePerL.toFixed(3)}/L</strong>{" "}
              (25% off the current market). Engine draws from storage first
              at quarter close — so you save when spot prices spike.
            </p>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                disabled={capacityL === 0}
                title={capacityL === 0 ? "Install at least one tank first" : undefined}
                onClick={() => setBuyOpen(true)}
              >
                Buy fuel →
              </Button>
              <Button
                variant="secondary"
                size="sm"
                disabled={storedL === 0}
                title={storedL === 0 ? "No stored fuel to sell" : undefined}
                onClick={() => setSellOpen(true)}
              >
                Sell stored →
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Depot hubs (where the 15% routing discount applies) */}
      {depotHubs.length > 0 && (
        <div className="mt-3 rounded-md border border-line bg-surface-2/30 p-3">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5 font-semibold">
            Depot hubs — 15% routing discount applies on outbound routes
          </div>
          <div className="flex flex-wrap gap-1.5">
            {depotHubs.map((code) => {
              const city = CITIES_BY_CODE[code];
              return (
                <span
                  key={code}
                  className="inline-flex items-baseline gap-1 rounded-full border border-line bg-surface px-2 py-0.5 text-[0.75rem]"
                  title={city?.name ?? code}
                >
                  <span className="font-mono text-ink-2 font-semibold">{code}</span>
                  {city && <span className="text-ink-muted">· {city.name}</span>}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Buy modal */}
      {buyOpen && (
        <BuyFuelModal
          onClose={() => setBuyOpen(false)}
          roomL={roomL}
          bulkPricePerL={bulkPricePerL}
          marketPricePerL={marketPricePerL}
          cashUsd={player.cashUsd}
          onBuy={(litres) => {
            const r = buyBulkFuel(litres);
            if (!r.ok && r.error) toast.warning("Cannot buy fuel", r.error);
            else setBuyOpen(false);
          }}
        />
      )}

      {/* Sell modal */}
      {sellOpen && (
        <SellFuelModal
          onClose={() => setSellOpen(false)}
          storedL={storedL}
          sellPricePerL={sellPricePerL}
          avgCost={avgCost}
          onSell={(litres) => {
            const r = sellStoredFuel(litres);
            if (!r.ok && r.error) toast.warning("Cannot sell fuel", r.error);
            else setSellOpen(false);
          }}
        />
      )}
    </section>
  );
}

function FuelKpi({
  label, value, sub, tone,
}: { label: string; value: string; sub?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="rounded-md border border-line bg-surface p-2.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={cn(
        "font-display text-[1.25rem] tabular leading-none mt-0.5",
        tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink",
      )}>{value}</div>
      {sub && <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">{sub}</div>}
    </div>
  );
}

/** Compact 8-quarter fuel index sparkline. Plots the index line, the
 *  baseline (100), and — when the player has stored fuel — their
 *  effective cost-basis index for instant visual P&L read-out.
 *
 *  Workshop intent: the player should be able to GLANCE at the chart
 *  and know whether the index is trending up (sell), down (buy), or
 *  flat. The line color flips to the verdict color (positive/negative)
 *  so a single look from across the room communicates the state. */
function FuelIndexSparkline({
  history,
  currentIndex,
  avgCostIndexEquivalent,
}: {
  history: Array<{ quarter: number; index: number }>;
  currentIndex: number;
  /** The index-equivalent of the player's avg cost basis. When the
   *  current index is above this, stored fuel is in profit. */
  avgCostIndexEquivalent: number | null;
}) {
  const W = 140;
  const H = 56;
  const PAD = 4;

  // Build the series — last 8 history points + the current spot.
  const series = [
    ...history.slice(-7),
    { quarter: (history[history.length - 1]?.quarter ?? 0) + 1, index: currentIndex },
  ];
  if (series.length < 2) {
    return (
      <div className="shrink-0 w-[140px] h-[56px] flex items-center justify-center text-[0.625rem] text-ink-muted">
        Awaiting market data
      </div>
    );
  }

  const indices = series.map((p) => p.index);
  // Y-axis spans baseline ±35 for stable visual ground regardless of
  // local volatility. Cap to actual min/max if they exceed.
  const yMin = Math.min(65, ...indices) - 5;
  const yMax = Math.max(135, ...indices) + 5;
  const xStep = (W - PAD * 2) / (series.length - 1);
  const yFor = (val: number) =>
    H - PAD - ((val - yMin) / (yMax - yMin)) * (H - PAD * 2);

  const points = series
    .map((p, i) => `${PAD + i * xStep},${yFor(p.index)}`)
    .join(" ");

  // Trend: is the last value higher or lower than the average of the
  // prior 3? Drives line color.
  const tailAvg = series.slice(-4, -1).reduce((s, p) => s + p.index, 0) / Math.max(1, Math.min(3, series.length - 1));
  const trendUp = currentIndex > tailAvg + 2;
  const trendDown = currentIndex < tailAvg - 2;
  const lineColor = trendUp ? "var(--negative)" : trendDown ? "var(--positive)" : "var(--accent)";

  const baselineY = yFor(100);
  const costBasisY = avgCostIndexEquivalent != null ? yFor(avgCostIndexEquivalent) : null;

  return (
    <div className="shrink-0">
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        aria-label="Fuel index trend, last 8 quarters"
      >
        {/* Baseline (100) — dashed ink-muted guide */}
        <line
          x1={PAD} x2={W - PAD}
          y1={baselineY} y2={baselineY}
          stroke="var(--ink-muted)"
          strokeWidth={0.75}
          strokeDasharray="2 2"
          opacity={0.5}
        />
        {/* Player cost basis — dashed positive guide when present */}
        {costBasisY != null && (
          <line
            x1={PAD} x2={W - PAD}
            y1={costBasisY} y2={costBasisY}
            stroke="var(--positive)"
            strokeWidth={0.75}
            strokeDasharray="3 3"
            opacity={0.6}
          />
        )}
        {/* The trend line itself */}
        <polyline
          fill="none"
          stroke={lineColor}
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
        {/* Endpoint dot — the current quarter */}
        {(() => {
          const last = series[series.length - 1];
          return (
            <circle
              cx={PAD + (series.length - 1) * xStep}
              cy={yFor(last.index)}
              r={2.5}
              fill={lineColor}
            />
          );
        })()}
      </svg>
      <div className="text-[0.5625rem] tabular font-mono text-ink-muted text-center mt-0.5">
        Index · last {series.length}Q
      </div>
    </div>
  );
}

function BuyFuelModal({
  onClose, roomL, bulkPricePerL, marketPricePerL, cashUsd, onBuy,
}: {
  onClose: () => void;
  roomL: number;
  bulkPricePerL: number;
  marketPricePerL: number;
  cashUsd: number;
  onBuy: (litres: number) => void;
}) {
  // Default to the smaller of (room available, $50M worth at bulk price)
  // — a sensible mid-sized buy that's affordable mid-game without
  // exhausting cash.
  const defaultLitresFromBudget = bulkPricePerL > 0 ? Math.floor(50_000_000 / bulkPricePerL) : 0;
  const defaultLitres = Math.max(0, Math.min(roomL, defaultLitresFromBudget));
  const [litres, setLitres] = useState<number>(defaultLitres);
  const cost = litres * bulkPricePerL;
  const marketCost = litres * marketPricePerL;
  const savings = marketCost - cost;
  const canBuy = litres > 0 && litres <= roomL && cost <= cashUsd;
  return (
    <Modal open onClose={onClose}>
      <ModalHeader>
        <h2 className="font-display text-[1.125rem] text-ink leading-tight">Buy bulk fuel</h2>
        <p className="text-[0.8125rem] text-ink-muted mt-1 leading-snug">
          25% off the current market index. Stored fuel is drawn at quarter close
          to save vs the spot price.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="grid grid-cols-3 gap-2 text-[0.75rem]">
          <FuelKpi label="Room available" value={`${(roomL / 1_000_000).toFixed(1)}M L`} />
          <FuelKpi label="Bulk price" value={`$${bulkPricePerL.toFixed(3)}/L`} sub={`Market $${marketPricePerL.toFixed(3)}/L`} />
          <FuelKpi
            label="Saving vs spot"
            value={fmtMoney(savings)}
            tone="pos"
          />
        </div>
        <div className="space-y-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
            Litres to buy
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={roomL}
              step={Math.max(1, Math.floor(roomL / 100))}
              value={litres}
              onChange={(e) => setLitres(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
              aria-label="Litres to buy"
            />
            <span className="tabular font-mono text-ink font-semibold w-28 text-right">
              {(litres / 1_000_000).toFixed(2)}M L
            </span>
          </div>
          <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-muted">
            <span>0</span>
            <span>{(roomL / 1_000_000).toFixed(0)}M L (room)</span>
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-1 text-[0.8125rem]">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-2">Cost at bulk rate</span>
            <span className="tabular font-mono text-ink font-semibold">{fmtMoney(cost)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[0.75rem] text-ink-muted">
            <span>If bought at spot</span>
            <span className="tabular font-mono">{fmtMoney(marketCost)}</span>
          </div>
          <div className="flex items-baseline justify-between pt-1 mt-1 border-t border-line text-positive">
            <span>Saved vs spot</span>
            <span className="tabular font-mono">+{fmtMoney(savings)}</span>
          </div>
          <div className="text-[0.6875rem] text-ink-muted leading-snug pt-1">
            Cash on hand: <span className="text-ink-2 tabular font-mono">{fmtMoney(cashUsd)}</span>
            {cost > cashUsd && <span className="text-negative ml-2">— not enough cash</span>}
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={!canBuy} onClick={() => onBuy(litres)}>
          Buy {(litres / 1_000_000).toFixed(2)}M L →
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function SellFuelModal({
  onClose, storedL, sellPricePerL, avgCost, onSell,
}: {
  onClose: () => void;
  storedL: number;
  sellPricePerL: number;
  avgCost: number;
  onSell: (litres: number) => void;
}) {
  const [litres, setLitres] = useState<number>(Math.floor(storedL / 2));
  const proceeds = litres * sellPricePerL;
  const costBasis = litres * avgCost;
  const pnl = proceeds - costBasis;
  return (
    <Modal open onClose={onClose}>
      <ModalHeader>
        <h2 className="font-display text-[1.125rem] text-ink leading-tight">Sell stored fuel</h2>
        <p className="text-[0.8125rem] text-ink-muted mt-1 leading-snug">
          Liquidate stored fuel back to the market at the bulk price.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <FuelKpi label="Held" value={`${(storedL / 1_000_000).toFixed(2)}M L`} />
          <FuelKpi label="Avg cost" value={avgCost > 0 ? `$${avgCost.toFixed(3)}/L` : "—"} />
          <FuelKpi label="Sell price" value={`$${sellPricePerL.toFixed(3)}/L`} />
        </div>
        <div className="space-y-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
            Litres to sell
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={storedL}
              step={Math.max(1, Math.floor(storedL / 100))}
              value={litres}
              onChange={(e) => setLitres(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
              aria-label="Litres to sell"
            />
            <span className="tabular font-mono text-ink font-semibold w-28 text-right">
              {(litres / 1_000_000).toFixed(2)}M L
            </span>
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-1 text-[0.8125rem]">
          <div className="flex items-baseline justify-between">
            <span className="text-ink-2">Cash proceeds</span>
            <span className="tabular font-mono text-ink font-semibold">{fmtMoney(proceeds)}</span>
          </div>
          <div className="flex items-baseline justify-between text-[0.75rem] text-ink-muted">
            <span>Cost basis released</span>
            <span className="tabular font-mono">{fmtMoney(costBasis)}</span>
          </div>
          <div className={cn(
            "flex items-baseline justify-between pt-1 mt-1 border-t border-line",
            pnl >= 0 ? "text-positive" : "text-negative",
          )}>
            <span>P&amp;L on sale</span>
            <span className="tabular font-mono">{pnl >= 0 ? "+" : ""}{fmtMoney(pnl)}</span>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={litres <= 0} onClick={() => onSell(litres)}>
          Sell {(litres / 1_000_000).toFixed(2)}M L →
        </Button>
      </ModalFooter>
    </Modal>
  );
}
