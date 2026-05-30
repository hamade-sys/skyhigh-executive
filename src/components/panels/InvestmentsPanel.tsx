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
  Plane,
  Users,
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
import type { SubsidiaryType, Subsidiary, FuelTankTier } from "@/types/game";
import {
  SUBSIDIARY_TIER_REV_MULT,
  SUBSIDIARY_UPGRADE_COST_MULT,
} from "@/types/game";
import { cn } from "@/lib/cn";
import {
  FUEL_TANK_SPECS,
  FUEL_TANK_MAX_COUNT,
  operatedCities,
  cityQuarterlyBurnL,
} from "@/lib/engine";
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

  // Route count per city — how many active (non-closed) routes touch each
  // city as an endpoint. Drives the per-row "N routes" annotation in the
  // build city-picker so the player can pick the best-connected city for a
  // subsidiary at a glance (a lounge / fuel depot pays off where traffic
  // is densest).
  const routeCountByCity = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!player) return counts;
    for (const r of player.routes) {
      if (r.status === "closed") continue;
      counts[r.originCode] = (counts[r.originCode] ?? 0) + 1;
      counts[r.destCode] = (counts[r.destCode] ?? 0) + 1;
    }
    return counts;
  }, [player]);

  // Network cities = hub + secondary hubs + every endpoint of an active
  // route. Sorted most-connected-first so the picker leads with the cities
  // where a subsidiary will see the most traffic.
  const networkCities = useMemo(() => {
    if (!player) return [];
    const set = new Set<string>([player.hubCode, ...player.secondaryHubCodes]);
    for (const r of player.routes) {
      if (r.status !== "closed") {
        set.add(r.originCode);
        set.add(r.destCode);
      }
    }
    return Array.from(set).sort(
      (a, b) => (routeCountByCity[b] ?? 0) - (routeCountByCity[a] ?? 0),
    );
  }, [player, routeCountByCity]);

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

      {/* ── Fuel tanks (per-city redesign 2026-05) ──────────────────
          Per-city fuel-tank infrastructure replaces the old team-level
          litre pool + bulk-buy timing game. For each operated city the
          player picks a tier (Small/Medium/Large) and a count (1–10);
          tanks give a coverage-based fuel discount on every route
          departing that city. Discount = tierMaxDiscount × min(1,
          capacity / quarterly burn) — recomputed each quarter, never
          depletes. No litre inventory, no spot-market timing. */}
      <FuelTanksSection />

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
          const isAcademy = buildOpen.type === "training-academy";
          // The academy's ops bonus is global, so it's chosen by workforce
          // discipline rather than by city (play-test ask, May 2026).
          const ACADEMY_CATEGORIES: Array<{
            key: NonNullable<Subsidiary["academyCategory"]>;
            label: string;
            blurb: string;
            Icon: typeof Plane;
          }> = [
            { key: "pilots", label: "Pilots", blurb: "Flight-deck crew training — fewer delays, steadier ops.", Icon: Plane },
            { key: "cabin-crew", label: "Cabin Crew", blurb: "Cabin service standards — lifts onboard experience.", Icon: Users },
            { key: "maintenance-crew", label: "Maintenance Crew", blurb: "In-house engineers — keeps the fleet reliable.", Icon: Wrench },
          ];
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">Build {entry.name}</h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  {isAcademy
                    ? <>Pick a workforce category to train. {entry.pitch}</>
                    : <>Pick a city in your network. {entry.pitch}</>}
                </p>
              </ModalHeader>
              <ModalBody className="space-y-3">
                {isAcademy ? (
                  <>
                    <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                      Pick a category (3)
                    </div>
                    <div className="rounded-md border border-line divide-y divide-line/40">
                      {ACADEMY_CATEGORIES.map(({ key, label, blurb, Icon }) => {
                        const owns = (player.subsidiaries ?? []).some(
                          (sub) => sub.type === "training-academy" && sub.academyCategory === key,
                        );
                        const tooPoor = player.cashUsd < entry.setupCostUsd;
                        return (
                          <button
                            key={key}
                            onClick={async () => {
                              const r = buildSubsidiary({
                                type: "training-academy",
                                cityCode: player.hubCode,
                                academyCategory: key,
                              });
                              if (!r.ok) { setError(r.error ?? "Build failed"); return; }
                              setBuildOpen(null);
                              setError(null);
                            }}
                            disabled={owns || tooPoor}
                            className={cn(
                              "w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover disabled:opacity-50",
                              owns && "bg-surface-2/40",
                            )}
                          >
                            <Icon size={18} className="text-accent shrink-0" />
                            <span className="flex flex-col min-w-0 flex-1">
                              <span className="text-[0.875rem] text-ink font-medium">{label}</span>
                              <span className="text-[0.6875rem] text-ink-muted truncate">{blurb}</span>
                            </span>
                            {owns ? (
                              <span className="text-[0.625rem] text-ink-muted italic shrink-0">already built</span>
                            ) : (
                              <ArrowRight size={12} className="text-ink-muted shrink-0" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                <>
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
                        <span className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono tabular text-ink">{code}</span>
                          <span className="text-ink-2 truncate">{city?.name ?? code}</span>
                          {isHub && (
                            <span className="text-[0.5625rem] uppercase tracking-wider text-accent font-semibold">hub</span>
                          )}
                        </span>
                        <span className="flex items-center gap-2.5 shrink-0">
                          {(() => {
                            const n = routeCountByCity[code] ?? 0;
                            return (
                              <span
                                className="text-[0.625rem] tabular text-ink-muted font-mono"
                                title={`${n} active route${n === 1 ? "" : "s"} touch ${code}`}
                              >
                                {n} {n === 1 ? "route" : "routes"}
                              </span>
                            );
                          })()}
                          {owns ? (
                            <span className="text-[0.625rem] text-ink-muted italic">already built</span>
                          ) : (
                            <ArrowRight size={12} className="text-ink-muted" />
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>
                </>
                )}
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

function FuelTanksSection() {
  const player = useGame(selectPlayer);
  const applyCityFuelTanksToAll = useGame((s) => s.applyCityFuelTanksToAll);

  // Network-wide apply controls — tanks are managed for the whole network at
  // once, not city by city. Tier + count fan out to every operated city.
  const [allTier, setAllTier] = useState<FuelTankTier>("small");
  const [allCount, setAllCount] = useState<number>(2);

  const cities = useMemo(() => (player ? operatedCities(player) : []), [player]);
  const burnByCity = useMemo(
    () => (player ? cityQuarterlyBurnL(player) : {}),
    [player],
  );

  if (!player) return null;

  const byCity = player.fuelTanksByCity ?? {};

  // ─── Network rollup for the header KPIs (what's installed today) ──────
  let totalTanks = 0;
  let totalCapacityL = 0;
  let totalMaintUsd = 0;
  let weightedDiscNum = 0;
  let weightedDiscDen = 0;
  let coverNum = 0;
  let coverDen = 0;
  let cityCount = 0;
  for (const [code, cfg] of Object.entries(byCity)) {
    if (!cfg || cfg.count <= 0) continue;
    const spec = FUEL_TANK_SPECS[cfg.tier];
    if (!spec) continue;
    const cap = spec.capacityL * cfg.count;
    const burn = burnByCity[code] ?? 0;
    const coverage = burn > 0 ? Math.min(1, cap / burn) : 1;
    cityCount += 1;
    totalTanks += cfg.count;
    totalCapacityL += cap;
    totalMaintUsd += spec.maintUsd * cfg.count;
    // Burn-weight the blended discount so high-traffic cities dominate.
    const w = Math.max(burn, 1);
    weightedDiscNum += spec.maxDiscount * coverage * w;
    weightedDiscDen += w;
    coverNum += Math.min(cap, burn);
    coverDen += burn;
  }
  const blendedDiscount = weightedDiscDen > 0 ? weightedDiscNum / weightedDiscDen : 0;
  const blendedCoverage =
    coverDen > 0 ? coverNum / coverDen : totalTanks > 0 ? 1 : 0;

  // ─── Empty state: no operated cities yet ─────────────────────
  if (cities.length === 0) {
    return (
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Network fuel tanks · coverage discount
        </div>
        <div className="rounded-lg border border-line bg-surface-2/30 px-4 py-8 text-center">
          <Fuel className="w-8 h-8 mx-auto text-ink-muted mb-2" aria-hidden />
          <div className="text-[0.875rem] text-ink font-semibold">
            No cities yet
          </div>
          <div className="text-[0.75rem] text-ink-muted mt-1 max-w-sm mx-auto leading-snug">
            Open a route first. Once you operate in a city you can install fuel
            tanks across your network to discount the fuel bill on every route.
          </div>
        </div>
      </section>
    );
  }

  // ─── Projection: what the selected tier+count would deliver across the
  //     whole network. Large tanks only land at Tier-1 cities; the rest get
  //     skipped, exactly mirroring applyCityFuelTanksToAll. ────────────────
  const selSpec = FUEL_TANK_SPECS[allTier];
  let projCities = 0;
  let projInstallUsd = 0;
  let projMaintUsd = 0;
  let projCapacityL = 0;
  let projCoverNum = 0;
  let projCoverDen = 0;
  let projDiscNum = 0;
  let projDiscDen = 0;
  for (const code of cities) {
    const city = CITIES_BY_CODE[code];
    if (!city) continue;
    if (allTier === "large" && city.tier !== 1) continue; // skipped
    projCities += 1;
    const cap = selSpec.capacityL * allCount;
    const burn = burnByCity[code] ?? 0;
    const coverage = burn > 0 ? Math.min(1, cap / burn) : 1;
    projCapacityL += cap;
    projMaintUsd += selSpec.maintUsd * allCount;
    // Install only charges for incremental tanks at the same tier (matches store).
    const prev = byCity[code];
    const prevSame = prev && prev.tier === allTier ? prev.count : 0;
    projInstallUsd += selSpec.installUsd * Math.max(0, allCount - prevSame);
    const w = Math.max(burn, 1);
    projDiscNum += selSpec.maxDiscount * coverage * w;
    projDiscDen += w;
    projCoverNum += Math.min(cap, burn);
    projCoverDen += burn;
  }
  const projDiscount = projDiscDen > 0 ? projDiscNum / projDiscDen : 0;
  const projCoverage = projCoverDen > 0 ? projCoverNum / projCoverDen : 1;
  const skipped = allTier === "large" ? cities.length - projCities : 0;
  const canAffordProj = projInstallUsd <= player.cashUsd;

  return (
    <section className="space-y-3">
      {/* Header / explainer */}
      <div className="rounded-lg border border-line bg-surface-2/30 p-3">
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1">
          Network fuel tanks · coverage discount
        </div>
        <p className="text-[0.75rem] text-ink-muted leading-snug max-w-2xl">
          Pick a tank tier and how many to place in every city you operate. Each
          tank covers a fixed quarterly fuel volume; when your tanks cover a
          city&apos;s full burn you earn that tier&apos;s maximum fuel discount on
          every route departing it. As your network grows, raise the count to
          keep coverage near 100%. Tanks never deplete — nothing to buy or time.
        </p>

        {totalTanks > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
            <FuelKpi
              label="Total tanks"
              value={`${totalTanks}`}
              sub={`across ${cityCount} cit${cityCount === 1 ? "y" : "ies"}`}
            />
            <FuelKpi
              label="Capacity"
              value={`${(totalCapacityL / 1_000_000).toFixed(0)}M L`}
              sub="per quarter"
            />
            <FuelKpi
              label="Network coverage"
              value={`${Math.round(blendedCoverage * 100)}%`}
              sub="of fuel burn"
              tone={blendedCoverage >= 0.999 ? "pos" : undefined}
            />
            <FuelKpi
              label="Quarterly upkeep"
              value={fmtMoney(totalMaintUsd)}
              sub={`~${(blendedDiscount * 100).toFixed(1)}% blended discount`}
            />
          </div>
        )}
      </div>

      {/* The one control: tier + count → whole network */}
      <div className="rounded-lg border border-line bg-surface p-3 space-y-3">
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
          Set tanks for every operated city
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-line overflow-hidden">
            {(["small", "medium", "large"] as FuelTankTier[]).map((t) => (
              <button
                key={t}
                onClick={() => setAllTier(t)}
                className={cn(
                  "px-3 py-1.5 text-[0.8125rem] font-medium transition-colors",
                  allTier === t
                    ? "bg-[var(--accent)] text-white"
                    : "bg-surface text-ink-muted hover:text-ink",
                )}
              >
                {FUEL_TANK_SPECS[t].label}
              </button>
            ))}
          </div>
          <span className="text-[0.75rem] text-ink-muted">×</span>
          <CountStepper value={allCount} onChange={setAllCount} />
          <span className="text-[0.75rem] text-ink-muted">
            tank{allCount === 1 ? "" : "s"} per city
          </span>
        </div>

        {/* Tier spec line */}
        <div className="text-[0.6875rem] text-ink-muted">
          {FUEL_TANK_SPECS[allTier].label}: {(selSpec.capacityL / 1_000_000).toFixed(0)}M L/qtr
          per tank · up to {(selSpec.maxDiscount * 100).toFixed(0)}% fuel discount ·
          {" "}{fmtMoney(selSpec.installUsd)} install · {fmtMoney(selSpec.maintUsd)}/qtr upkeep
          {allTier === "large" ? " · Tier-1 airports only" : ""}
        </div>

        {/* Projection of the proposed network state */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 rounded-md border border-line bg-surface-2/30 p-2.5">
          <Readout
            label="Cities covered"
            value={`${projCities}${skipped > 0 ? ` (−${skipped})` : ""}`}
          />
          <Readout
            label="Proj. coverage"
            value={`${Math.round(projCoverage * 100)}%`}
            tone={projCoverage >= 0.999 ? "pos" : projCoverage >= 0.5 ? undefined : "warn"}
          />
          <Readout
            label="Proj. discount"
            value={`${(projDiscount * 100).toFixed(1)}%`}
            tone={projDiscount > 0 ? "pos" : undefined}
          />
          <Readout label="Upkeep" value={`${fmtMoney(projMaintUsd)}/qtr`} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-[0.6875rem] text-ink-muted">
            {projInstallUsd > 0 ? (
              <>
                Install cost{" "}
                <span className={cn("font-mono font-semibold", canAffordProj ? "text-ink-2" : "text-negative")}>
                  {fmtMoney(projInstallUsd)}
                </span>{" "}
                <span className="text-ink-muted">(new tanks only)</span>
              </>
            ) : (
              <span>No new install cost — adjusting in place.</span>
            )}
            {skipped > 0 && (
              <span className="block text-[0.625rem] mt-0.5">
                {skipped} non-Tier-1 cit{skipped === 1 ? "y is" : "ies are"} skipped for Large tanks.
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const r = applyCityFuelTanksToAll("none", 0);
                if (!r.ok && r.error) toast.warning("Cannot clear", r.error);
                else toast.info("Tanks cleared", "All fuel tanks removed (no refund).");
              }}
              className="text-[0.75rem] text-ink-muted hover:text-negative px-1"
              disabled={totalTanks === 0}
            >
              Clear all
            </button>
            <Button
              size="sm"
              variant="primary"
              disabled={projInstallUsd > 0 && !canAffordProj}
              title={projInstallUsd > 0 && !canAffordProj ? `Need ${fmtMoney(projInstallUsd)}` : undefined}
              onClick={() => {
                const r = applyCityFuelTanksToAll(allTier, allCount);
                if (!r.ok && r.error) toast.warning("Cannot apply", r.error);
                else
                  toast.success(
                    "Tanks applied",
                    `${allCount}× ${FUEL_TANK_SPECS[allTier].label} across ${projCities} cit${projCities === 1 ? "y" : "ies"}.`,
                  );
              }}
            >
              <Plus className="w-3.5 h-3.5" aria-hidden />
              Apply to {projCities} cit{projCities === 1 ? "y" : "ies"}
            </Button>
          </div>
        </div>
      </div>
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

/** Compact +/- count stepper used by the apply-to-all control. */
function CountStepper({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center rounded-md border border-line overflow-hidden">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="px-2 py-1 text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        aria-label="Decrease tank count"
      >
        −
      </button>
      <span className="px-1 text-[0.75rem] tabular font-mono text-ink font-semibold w-6 text-center">
        {value}
      </span>
      <button
        onClick={() => onChange(Math.min(FUEL_TANK_MAX_COUNT, value + 1))}
        className="px-2 py-1 text-ink-muted hover:text-ink hover:bg-surface-2 transition-colors"
        aria-label="Increase tank count"
      >
        +
      </button>
    </div>
  );
}

/** Tiny label/value row used inside the projection readout grid. */
function Readout({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "warn" | "neg";
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <span
        className={cn(
          "tabular font-mono font-semibold",
          tone === "pos"
            ? "text-positive"
            : tone === "warn"
              ? "text-warning"
              : tone === "neg"
                ? "text-negative"
                : "text-ink-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}

