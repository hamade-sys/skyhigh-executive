"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Modal, ModalFooter, ModalHeader, Sparkline } from "@/components/ui";
import { useGame, selectPlayer, selectActiveTeam } from "@/store/game";
import { fmtMoney, fmtQuarter, getTotalRounds } from "@/lib/format";
import { CITIES } from "@/data/cities";
import { runQuarterClose } from "@/lib/engine";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";

export function AdminPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  // Multiplayer-aware "you" — same fallback pattern as LeaderboardPanel.
  const activeTeamId = selectActiveTeam(s)?.id ?? null;
  const router = useRouter();
  const [cashAdjust, setCashAdjust] = useState(0);
  const [secondaryHub, setSecondaryHub] = useState("");
  const [flashDealCount, setFlashDealCount] = useState(3);
  // Branded confirm modals replace native confirm() — facilitator
  // actions are powerful (reset, force-fire deferred events) so the UX
  // stays on-brand and explicit about consequences.
  const [confirmFireDeferred, setConfirmFireDeferred] = useState<{
    id: string;
    label: string;
  } | null>(null);
  const [confirmDemo, setConfirmDemo] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  // Dry-run quarter close preview — useMemo MUST run unconditionally above
  // any early returns (rules of hooks).
  const preview = useMemo(() => {
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

  if (!player || !preview) return null;

  const tier1 = CITIES.filter((c) => c.tier === 1).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <GroupHeader title="Round control" subtitle="Game state · current quarter · fuel + rate context" />

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Game state</div>
        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Phase" v={s.phase} />
          <Row k="Round" v={`${s.currentQuarter} / ${getTotalRounds(s)}`} />
          <Row k="Fuel idx" v={s.fuelIndex.toFixed(0)} />
          <Row k="Base rate" v={`${s.baseInterestRatePct.toFixed(1)}%`} />
          <Row k="Teams" v={`${s.teams.length}`} />
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Adjust player state
        </div>
        <div className="flex gap-2 mb-2">
          <Input
            type="number"
            value={cashAdjust}
            onChange={(e) => setCashAdjust(parseInt(e.target.value, 10) || 0)}
            placeholder="Cash delta"
          />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              if (cashAdjust !== 0) {
                useGame.setState({
                  teams: s.teams.map((t) =>
                    t.id === s.playerTeamId ? { ...t, cashUsd: t.cashUsd + cashAdjust } : t,
                  ),
                });
              }
            }}
          >
            +/− cash
          </Button>
        </div>
        {/* Quick test-cash button */}
        <div className="flex gap-2 mb-3">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              useGame.setState({
                teams: s.teams.map((t) =>
                  t.id === s.playerTeamId ? { ...t, cashUsd: t.cashUsd + 900_000_000 } : t,
                ),
              });
            }}
          >
            +$900M (test)
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              useGame.setState({
                teams: s.teams.map((t) =>
                  t.id === s.playerTeamId ? { ...t, cashUsd: t.cashUsd + 100_000_000 } : t,
                ),
              });
            }}
          >
            +$100M
          </Button>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[0.75rem] mb-2">
          <AdjustChip
            label="Brand"
            value={player.brandPts}
            onChange={(delta) => useGame.setState({
              teams: s.teams.map((t) => t.id === s.playerTeamId
                ? { ...t, brandPts: Math.max(0, Math.min(100, t.brandPts + delta)) } : t),
            })}
          />
          <AdjustChip
            label="Loyalty"
            value={player.customerLoyaltyPct}
            unit="%"
            onChange={(delta) => useGame.setState({
              teams: s.teams.map((t) => t.id === s.playerTeamId
                ? { ...t, customerLoyaltyPct: Math.max(0, Math.min(100, t.customerLoyaltyPct + delta)) } : t),
            })}
          />
          <AdjustChip
            label="Ops"
            value={player.opsPts}
            onChange={(delta) => useGame.setState({
              teams: s.teams.map((t) => t.id === s.playerTeamId
                ? { ...t, opsPts: Math.max(0, Math.min(100, t.opsPts + delta)) } : t),
            })}
          />
        </div>
        <div className="text-[0.6875rem] text-ink-muted">
          ± 5 adjusters for brand / loyalty / ops points. All state changes are
          local-only until Supabase lands.
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Fuel market · base rate
        </div>
        <div className="space-y-1.5 text-[0.8125rem] mb-2">
          <Row k="Fuel index" v={s.fuelIndex.toFixed(0)} />
          <Row k="Base rate" v={`${s.baseInterestRatePct.toFixed(1)}%`} />
        </div>
        <div className="grid grid-cols-4 gap-1 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.max(50, s.fuelIndex - 10) })}>
            −10
          </Button>
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.max(50, s.fuelIndex - 5) })}>
            −5
          </Button>
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.min(200, s.fuelIndex + 5) })}>
            +5
          </Button>
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.min(200, s.fuelIndex + 10) })}>
            +10
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary" onClick={() => {
            useGame.setState({ fuelIndex: Math.min(200, s.fuelIndex + 25) });
          }}>
            Fuel spike +25
          </Button>
          <Button size="sm" variant="secondary" onClick={() => {
            useGame.setState({ fuelIndex: 100 });
          }}>
            Reset to 100
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-1 text-[0.75rem]">
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ baseInterestRatePct: Math.max(0, s.baseInterestRatePct - 0.5) })}>
            Rate −0.5%
          </Button>
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ baseInterestRatePct: s.baseInterestRatePct + 0.5 })}>
            Rate +0.5%
          </Button>
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Quarter control
        </div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <Button size="sm" variant="secondary" onClick={s.closeQuarter}>
            Force close Q{s.currentQuarter}
          </Button>
          <Button size="sm" variant="secondary" onClick={s.advanceToNext}>
            Advance quarter
          </Button>
        </div>

        {/* Preview quarter close (dry-run) */}
        <div className="rounded-md border border-line bg-surface-2/40 p-3 text-[0.75rem] space-y-1">
          <div className="flex items-center justify-between font-medium text-ink-2 mb-1.5">
            <span>Preview of quarter close (dry-run)</span>
            <span className="font-mono text-ink-muted">Q{s.currentQuarter}</span>
          </div>
          <PreviewRow k="Revenue" v={fmtMoney(preview.revenue)} />
          <PreviewRow k="Fuel + slot" v={fmtMoney(preview.fuelCost + preview.slotCost)} />
          <PreviewRow k="Staff + sliders" v={fmtMoney(preview.staffCost + preview.otherSliderCost)} />
          <PreviewRow k="Maint + depr" v={fmtMoney(preview.maintenanceCost + preview.depreciation)} />
          <PreviewRow k="Interest + RCF + taxes" v={fmtMoney(preview.interest + preview.rcfInterest + preview.passengerTax + preview.fuelExcise + preview.carbonLevy + preview.tax)} />
          <PreviewRow k="Net profit" v={fmtMoney(preview.netProfit)} tone={preview.netProfit >= 0 ? "pos" : "neg"} bold />
          {preview.triggeredEvents.length > 0 && (
            <div className="pt-1.5 mt-1.5 border-t border-line">
              <span className="text-ink-muted">Deferred events that will roll: </span>
              {preview.triggeredEvents.map((e) => e.scenario).join(", ")}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Teams
        </div>
        <div className="space-y-1">
          {s.teams.map((t) => (
            <div key={t.id} className="flex items-center justify-between text-[0.8125rem] py-1 border-b border-line last:border-0">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-[0.625rem] text-primary-fg"
                  style={{ background: t.color }}
                >
                  {t.code}
                </span>
                <span className="truncate">{t.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="tabular font-mono text-ink-muted">{t.brandValue.toFixed(1)}</span>
                {(activeTeamId !== null ? t.id === activeTeamId : t.isPlayer)
                  ? <Badge tone="primary">You</Badge>
                  : <Badge tone="neutral">Rival</Badge>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Secondary hubs (§4.4 · 2× terminal fee)
        </div>
        <div className="flex gap-2 mb-2">
          <select
            value={secondaryHub}
            onChange={(e) => setSecondaryHub(e.target.value)}
            className="flex-1 h-9 px-2 rounded-md border border-line bg-surface text-[0.8125rem] text-ink"
          >
            <option value="">Pick a tier-1 city…</option>
            {tier1
              .filter((c) => c.code !== player.hubCode)
              .filter((c) => !player.secondaryHubCodes.includes(c.code))
              .map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} · {c.code}
                </option>
              ))}
          </select>
          <Button
            size="sm"
            variant="secondary"
            disabled={!secondaryHub}
            onClick={() => {
              if (!secondaryHub) return;
              const r = s.addSecondaryHub(secondaryHub);
              if (!r.ok) toast.negative("Add secondary hub failed", r.error ?? "Could not add hub.");
              else setSecondaryHub("");
            }}
          >
            Add
          </Button>
        </div>
        {player.secondaryHubCodes.length > 0 && (
          <div className="space-y-1">
            {player.secondaryHubCodes.map((code) => (
              <div key={code} className="flex items-center justify-between text-[0.8125rem] py-1 border-b border-line last:border-0">
                <span className="font-mono text-primary">{code}</span>
                <button
                  className="text-[0.75rem] text-negative hover:underline"
                  onClick={() => s.removeSecondaryHub(code)}
                >
                  Close hub
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MVP scoring (PRD §15) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          MVP scoring · Live sim outcome entry
        </div>
        <div className="space-y-1">
          {player.members.map((m) => (
            <div
              key={m.role}
              className="flex items-center gap-2 text-[0.8125rem] py-1.5 border-b border-line last:border-0"
            >
              <span className="font-mono text-[0.6875rem] text-primary w-10 shrink-0">
                {m.role}
              </span>
              <input
                className="flex-1 h-7 px-2 rounded-md border border-line bg-surface text-ink text-[0.8125rem] min-w-0"
                value={m.name}
                onChange={(e) => s.renameMember(m.role, e.target.value)}
              />
              <span className="tabular font-mono text-ink shrink-0 w-10 text-right">
                {m.mvpPts}
              </span>
              <button
                onClick={() => s.awardMvp(m.role, 5)}
                className="w-6 h-6 shrink-0 rounded-sm bg-surface border border-line text-ink-2 hover:bg-surface-hover text-[0.625rem]"
              >
                +5
              </button>
              <button
                onClick={() => s.awardMvp(m.role, 10)}
                className="w-6 h-6 shrink-0 rounded-sm bg-surface border border-line text-ink-2 hover:bg-surface-hover text-[0.625rem]"
              >
                +10
              </button>
            </div>
          ))}
        </div>
        <div className="text-[0.6875rem] text-ink-muted mt-2">
          Award MVP points per live-sim outcome (L0 Brand Building, L1 Strike,
          L2 Talent Heist, L3 Whistleblower, L4 Podium, L6 Elevator, L7 Crisis
          Ops, L5 Project Aurora). Endgame declares the top individual.
        </div>
      </section>

      {s.currentQuarter === 13 && !player.flags.has("flash_deal_claimed") && (
        <section className="rounded-md border border-accent bg-[var(--accent-soft)] p-3">
          <div className="font-semibold text-ink text-[0.875rem] mb-1">
            Flash Deal available — {fmtQuarter(13)}
          </div>
          <p className="text-[0.8125rem] text-ink-2 mb-2">
            Eco-engine A320neo order. $4M deposit per plane, eco upgrade included.
          </p>
          <div className="flex gap-2">
            <input
              type="range"
              min={1}
              max={10}
              value={flashDealCount}
              onChange={(e) => setFlashDealCount(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
            />
            <span className="tabular font-mono text-ink w-8 text-right text-[0.8125rem]">
              {flashDealCount}
            </span>
            <Button
              size="sm"
              variant="accent"
              onClick={() => {
                const r = s.claimFlashDeal(flashDealCount);
                if (!r.ok) toast.negative("Claim failed", r.error ?? "Could not claim flash deal.");
              }}
            >
              Claim {fmtMoney(4_000_000 * flashDealCount)}
            </Button>
          </div>
        </section>
      )}

      <GroupHeader title="Team adjustments" subtitle="Cash · brand · ops · loyalty · trajectory" />

      {/* Brand Value trajectory across teams (PRD §10.10) */}
      {s.teams.some((t) => t.financialsByQuarter.length > 0) && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Brand Value trajectory · all teams
          </div>
          <div className="space-y-1.5">
            {[...s.teams]
              .sort((a, b) => b.brandValue - a.brandValue)
              .map((t) => {
                const series =
                  t.financialsByQuarter.length > 0
                    ? t.financialsByQuarter.map((q) => q.brandValue)
                    : [t.brandValue, t.brandValue];
                return (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 text-[0.75rem]"
                  >
                    <span
                      className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-[0.625rem] text-primary-fg shrink-0"
                      style={{ background: t.color }}
                    >
                      {t.code}
                    </span>
                    <span className="text-ink-2 truncate flex-1 min-w-0">
                      {t.name}
                    </span>
                    <Sparkline values={series} color={t.color} width={80} height={20} />
                    <span className="tabular font-mono text-ink w-10 text-right">
                      {t.brandValue.toFixed(1)}
                    </span>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* Cargo contracts (PRD E8.6) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Cargo contracts
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary" onClick={() => s.adminGrantCargoContract({
            originCode: player.hubCode, destCode: "FRA",
            tonnesPerWeek: 150, ratePerTonneUsd: 4500, quarters: 4,
            source: "Dubai Expo 2040 equipment",
          })}>
            Dubai Expo · 4Q
          </Button>
          <Button size="sm" variant="secondary" onClick={() => s.adminGrantCargoContract({
            originCode: player.hubCode, destCode: "HKG",
            tonnesPerWeek: 100, ratePerTonneUsd: 5200, quarters: 6,
            source: "Pharma corridor",
          })}>
            Pharma · 6Q
          </Button>
        </div>
        {s.cargoContracts.filter((c) => c.teamId === player.id).length > 0 && (
          <div className="space-y-1 text-[0.75rem]">
            {s.cargoContracts.filter((c) => c.teamId === player.id).map((c) => (
              <div key={c.id} className="flex items-center justify-between py-1 border-b border-line last:border-0">
                <span className="text-ink font-mono">{c.originCode} ↔ {c.destCode}</span>
                <span className="text-ink-muted">
                  {c.guaranteedTonnesPerWeek}T/wk · ${c.ratePerTonneUsd}/T · {c.quartersRemaining}Q left
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Ground-stop slot refund (PRD G6) */}
      {player.routes.filter((r) => r.status === "active" || r.status === "suspended").length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Ground-stop · slot fee refund
          </div>
          <div className="space-y-1 max-h-28 overflow-auto">
            {player.routes
              .filter((r) => r.status === "active" || r.status === "suspended")
              .map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-[0.75rem]">
                  <span className="font-mono text-ink-2 truncate">
                    {r.originCode} → {r.destCode}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => s.adminGroundStopRefund(r.id)}
                  >
                    50% refund
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Hub infrastructure investments (PRD D4) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Hub infrastructure
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("fuelReserveTank");
              if (!r.ok) toast.negative("Purchase failed", r.error ?? "Could not buy fuel tank.");
            }}>
            Fuel Tank · $8M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("maintenanceDepot");
              if (!r.ok) toast.negative("Purchase failed", r.error ?? "Could not buy maintenance depot.");
            }}>
            Maint Depot · $12M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("premiumLounge");
              if (!r.ok) toast.negative("Purchase failed", r.error ?? "Could not buy premium lounge.");
            }}>
            Premium Lounge · $5M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("opsExpansion");
              if (!r.ok) toast.negative("Purchase failed", r.error ?? "Could not expand operations.");
            }}>
            Ops Expansion · $5M
          </Button>
        </div>
        <div className="text-[0.6875rem] text-ink-muted">
          Fuel tanks: {player.hubInvestments.fuelReserveTankHubs.length} ·
          Depots: {player.hubInvestments.maintenanceDepotHubs.length} ·
          Lounges: {player.hubInvestments.premiumLoungeHubs.length} ·
          Ops slots: +{player.hubInvestments.opsExpansionSlots}
        </div>
      </section>

      {/* Insurance policy */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Insurance policy
        </div>
        <div className="grid grid-cols-4 gap-1.5 text-[0.75rem]">
          {(["none", "low", "medium", "high"] as const).map((lvl) => {
            const premiums = { none: "0%", low: "0.15%", medium: "0.30%", high: "0.50%" };
            const coverage = { none: "0%", low: "30%", medium: "50%", high: "80%" };
            const active = player.insurancePolicy === lvl;
            return (
              <button
                key={lvl}
                onClick={() => s.setInsurancePolicy(lvl)}
                className={`rounded-md border px-2 py-1.5 capitalize transition-colors ${
                  active
                    ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                    : "border-line text-ink-2 hover:bg-surface-hover"
                }`}
              >
                <div className="text-[0.75rem] font-medium">{lvl}</div>
                <div className="text-[0.625rem] text-ink-muted">
                  {premiums[lvl]}/Q · {coverage[lvl]}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Talent heist (S14) — Option A "Full Counter Offer" leaves a
          pending flag on the team because the cost isn't fixed by the
          rule book; the facilitator captures whatever the table
          negotiated and applies it as a cash hit here. */}
      <FullCounterOfferAdmin />

      {/* Recurring staff-cost surcharge — set by S14 "Apply Incremental
          Salary Increase 10%" (option B) and tunable by the facilitator.
          One row per team with the current rate and an editable input. */}
      <StaffSurchargeAdmin />

      <GroupHeader title="Scenario tools" subtitle="Plot twists · talent heist · staff surcharge · deferred events" />

      {/* Plot twists — fire deferred events NOW (PRD §10.7) */}
      {(player.deferredEvents ?? []).filter((e) => !e.resolved).length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Plot twists · trigger deferred events
          </div>
          <div className="space-y-1.5">
            {(player.deferredEvents ?? [])
              .filter((e) => !e.resolved)
              .sort((a, b) => a.targetQuarter - b.targetQuarter)
              .map((e) => (
                <div
                  key={e.id}
                  className="flex items-baseline justify-between gap-2 rounded-md border border-line bg-surface-2/50 px-2.5 py-2 text-[0.75rem]"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-primary">{e.sourceScenario}</span>
                      <span className="text-[0.625rem] tabular text-ink-muted">→ Q{e.targetQuarter}</span>
                      <span className="text-[0.625rem] tabular text-ink-muted">{(e.probability * 100).toFixed(0)}%</span>
                    </div>
                    <div className="text-ink-2 mt-0.5 truncate">{e.noteAtQueue ?? "(no note)"}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setConfirmFireDeferred({
                      id: e.id,
                      label: `${e.sourceScenario}-${e.sourceOption}`,
                    })}
                  >
                    Fire
                  </Button>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Quick world-event buttons */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          World event shocks
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[0.75rem]">
          <Button size="sm" variant="secondary" onClick={() => s.adminFuelShock(30)}>
            Oil shock +30
          </Button>
          <Button size="sm" variant="secondary" onClick={() => s.adminFuelShock(-15)}>
            Oil glut −15
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => useGame.setState({ baseInterestRatePct: s.baseInterestRatePct + 1.5 })}>
            Rate hike +1.5%
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => useGame.setState({ baseInterestRatePct: Math.max(0, s.baseInterestRatePct - 1.0) })}>
            Easing −1.0%
          </Button>
        </div>
        <div className="text-[0.6875rem] text-ink-muted mt-1 leading-relaxed">
          Use during live-sim moments to test how the player responds under stress.
        </div>
      </section>

      {/* Slot auction resolver (PRD §10.7) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Slot auctions · resolve pending bids
        </div>
        {(() => {
          // Group bids by airport across all teams
          const byAirport: Record<string, Array<{ teamCode: string; teamName: string; slots: number; pricePerSlot: number }>> = {};
          for (const t of s.teams) {
            for (const b of (t.pendingSlotBids ?? [])) {
              (byAirport[b.airportCode] ??= []).push({
                teamCode: t.code,
                teamName: t.name,
                slots: b.slots,
                pricePerSlot: b.pricePerSlot,
              });
            }
          }
          const airports = Object.keys(byAirport).sort();
          if (airports.length === 0) {
            return (
              <div className="text-[0.75rem] text-ink-muted italic">
                No pending bids. Players bid via Ops form.
              </div>
            );
          }
          return (
            <div className="space-y-2">
              {airports.map((code) => {
                const bids = byAirport[code].sort((a, b) => b.pricePerSlot - a.pricePerSlot);
                const totalSlots = bids.reduce((sum, b) => sum + b.slots, 0);
                return (
                  <div key={code} className="rounded-md border border-line p-2">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[0.8125rem] font-mono text-ink font-semibold">{code}</span>
                      <span className="text-[0.6875rem] tabular text-ink-muted">
                        {bids.length} bid{bids.length === 1 ? "" : "s"} · {totalSlots} slots wanted
                      </span>
                    </div>
                    <div className="space-y-0.5 mb-2 text-[0.6875rem]">
                      {bids.map((b, i) => (
                        <div key={i} className="flex items-center justify-between font-mono">
                          <span className="text-ink-2 truncate">
                            <span className="text-ink">{b.teamCode}</span> · {b.slots}×
                          </span>
                          <span className="tabular text-ink">${(b.pricePerSlot / 1000).toFixed(0)}K</span>
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      {[2, 4, 8].map((n) => (
                        <Button
                          key={n}
                          size="sm"
                          variant="secondary"
                          onClick={() => s.adminReleaseSlots(code, n)}
                        >
                          Release {n}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
      </section>

      {/* Second-hand market admin (A13) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Second-hand market · admin inject
        </div>
        <div className="grid grid-cols-2 gap-1 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary"
            onClick={() => s.adminInjectSecondHand("A320", 14_000_000)}>
            List A320 · $14M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => s.adminInjectSecondHand("B777-200ER", 52_000_000)}>
            List 777 · $52M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => s.adminInjectSecondHand("B787-9", 46_000_000)}>
            List 787-9 · $46M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => s.adminInjectSecondHand("A330-200", 38_000_000)}>
            List A330 · $38M
          </Button>
        </div>
        <div className="text-[0.6875rem] text-ink-muted">
          {s.secondHandListings.length} active listing{s.secondHandListings.length === 1 ? "" : "s"}
        </div>
      </section>

      <GroupHeader title="Reset / demo" subtitle="Destructive — wipes simulation state" tone="danger" />

      <section className="pt-3 border-t border-line grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => setConfirmDemo(true)}
        >
          Demo mode
        </Button>
        <Button
          variant="danger"
          onClick={() => setConfirmReset(true)}
        >
          Reset simulation
        </Button>
      </section>

      {/* Aircraft production overrides (Sprint 8) — facilitator can
          raise / lower the per-spec quarterly delivery cap for the
          remainder of the campaign, and can force-deliver queued
          pre-orders ahead of cap (e.g. to clear a backlog after a
          dispute). */}
      <ProductionCapAdmin />

      {/* Branded admin confirms — replace legacy native confirm()s. */}
      <Modal open={!!confirmFireDeferred} onClose={() => setConfirmFireDeferred(null)}>
        {confirmFireDeferred && (
          <>
            <ModalHeader>
              <h2 className="font-display text-[1.5rem] text-ink">
                Trigger deferred event {confirmFireDeferred.label}?
              </h2>
              <p className="text-ink-muted text-[0.8125rem] mt-1">
                The deferred effect will fire immediately, applying any
                staged consequences (financial hit, fleet change, brand
                shift) to the player team. Use this for facilitator
                interventions only.
              </p>
            </ModalHeader>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setConfirmFireDeferred(null)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  s.adminTriggerDeferred(confirmFireDeferred.id);
                  setConfirmFireDeferred(null);
                }}
              >
                Fire now
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      <Modal open={confirmDemo} onClose={() => setConfirmDemo(false)}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Start demo mode?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            This wipes the current simulation and seeds a sample game with
            pre-built fleet, routes, and rivals. Useful for screencasts and
            walkthroughs but the running session will be lost.
          </p>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmDemo(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              s.resetGame();
              s.startDemo();
              setConfirmDemo(false);
            }}
          >
            Reset and start demo
          </Button>
        </ModalFooter>
      </Modal>

      <Modal open={confirmReset} onClose={() => setConfirmReset(false)}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Reset the simulation?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            All state is wiped — fleet, routes, finances, decisions, news,
            rival progress. This cannot be undone. You&apos;ll be returned to
            the home screen to start a fresh game.
          </p>
        </ModalHeader>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              s.resetGame();
              setConfirmReset(false);
              router.push("/");
            }}
          >
            Wipe and reset
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

/** Talent-heist Full Counter Offer settle screen. When a player picks
 *  S14 option A the team gets flagged `talent_heist_pending_full_counter`
 *  with no cash hit; the rival's actual package amount is whatever the
 *  table negotiated, so the facilitator captures it here and applies
 *  it as a cash hit. Section is hidden when no team is pending. */
function FullCounterOfferAdmin() {
  const teams = useGame((g) => g.teams);
  const applyFullCounterOfferCost = useGame((g) => g.applyFullCounterOfferCost);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const pending = teams.filter((t) =>
    t.flags && Array.from(t.flags).includes("talent_heist_pending_full_counter"),
  );
  if (pending.length === 0) return null;

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2 flex items-baseline justify-between">
        <span>Full Counter Offers · awaiting cost</span>
        <span className="text-[0.625rem] text-warning font-semibold">
          {pending.length} pending
        </span>
      </div>
      <div className="text-[0.6875rem] text-ink-muted mb-2 leading-relaxed">
        S14 option A picked — the team committed to match every rival
        package. Capture the table-negotiated total and apply it as a
        one-time cash hit. No cap; type any USD figure.
      </div>
      <div className="space-y-1.5">
        {pending.map((t) => {
          const draft = drafts[t.id] ?? "";
          const draftN = Number(draft);
          const valid = draft.trim() !== "" && !isNaN(draftN) && draftN >= 0;
          return (
            <div
              key={t.id}
              className="flex items-baseline gap-2 rounded-md border border-warning/40 bg-[var(--warning-soft)]/40 px-2.5 py-2 text-[0.75rem]"
            >
              <span
                className="inline-flex w-5 h-5 rounded items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg shrink-0"
                style={{ background: t.color }}
                aria-hidden="true"
              >
                {t.code}
              </span>
              <span className="text-ink font-medium flex-1 truncate">
                {t.name}
              </span>
              <span className="text-ink-muted shrink-0 text-[0.6875rem]">
                cash {fmtMoney(t.cashUsd)}
              </span>
              <input
                type="number"
                step="100000"
                min="0"
                placeholder="cost USD"
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                className="w-32 px-2 py-1 rounded-md border border-line bg-surface text-ink text-[0.75rem] tabular font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label={`Counter-offer cost in USD for ${t.name}`}
              />
              <Button
                size="sm"
                variant="primary"
                disabled={!valid}
                onClick={() => {
                  const r = applyFullCounterOfferCost({ teamId: t.id, costUsd: draftN });
                  if (!r.ok) toast.negative("Apply failed", r.error ?? "");
                  setDrafts((d) => ({ ...d, [t.id]: "" }));
                }}
              >
                Apply
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/** Recurring staff-cost surcharge — facilitator-tunable rate per team.
 *  Set by S14 "Apply Incremental Salary Increase 10%" (option B); the
 *  facilitator can override here. Default 10% if a team picked option B;
 *  0 otherwise. */
function StaffSurchargeAdmin() {
  const teams = useGame((g) => g.teams);
  const setRecurringStaffSurcharge = useGame((g) => g.setRecurringStaffSurcharge);
  // Local edit buffers per team — players type a percentage like "10"
  // and we convert to the 0..1 multiplier on apply. Pre-fill from
  // the team's current value (or empty if 0/undefined).
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  // Only show teams with a non-zero surcharge OR allow setting one
  // for any team. Keeping it always-visible means the facilitator
  // can pre-emptively dial in a number before the option is picked.
  const sorted = [...teams].sort((a, b) => {
    const ap = a.recurringStaffSurchargePct ?? 0;
    const bp = b.recurringStaffSurchargePct ?? 0;
    if (ap !== bp) return bp - ap;
    return a.name.localeCompare(b.name);
  });

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Staff-cost surcharge · per team
      </div>
      <div className="text-[0.6875rem] text-ink-muted mb-2 leading-relaxed">
        S14 &quot;Apply Incremental Salary Increase 10%&quot; (option B) sets a
        permanent +10% on quarterly staff cost. Adjust the rate here
        if the table negotiated a different number. 0 = baseline (no
        surcharge).
      </div>
      <div className="space-y-1.5">
        {sorted.map((t) => {
          const currentPct = (t.recurringStaffSurchargePct ?? 0) * 100;
          const draft = drafts[t.id] ?? "";
          return (
            <div
              key={t.id}
              className="flex items-baseline gap-2 rounded-md border border-line bg-surface-2/40 px-2.5 py-2 text-[0.75rem]"
            >
              <span
                className="inline-flex w-5 h-5 rounded items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg shrink-0"
                style={{ background: t.color }}
                aria-hidden="true"
              >
                {t.code}
              </span>
              <span className="text-ink font-medium flex-1 truncate">
                {t.name}
              </span>
              <span className="text-ink-muted tabular font-mono shrink-0">
                current{" "}
                <span className={cn(
                  currentPct > 0 ? "text-warning font-semibold" : "text-ink-muted",
                )}>
                  +{currentPct.toFixed(1)}%
                </span>
              </span>
              <input
                type="number"
                step="0.5"
                min="0"
                max="100"
                placeholder="%"
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value }))}
                className="w-16 px-2 py-1 rounded-md border border-line bg-surface text-ink text-[0.75rem] tabular font-mono focus:outline-none focus:ring-2 focus:ring-primary/50"
                aria-label={`New staff surcharge percent for ${t.name}`}
              />
              <Button
                size="sm"
                variant="secondary"
                disabled={draft.trim() === "" || isNaN(Number(draft))}
                onClick={() => {
                  const v = Number(draft);
                  if (isNaN(v)) return;
                  const r = setRecurringStaffSurcharge({ teamId: t.id, pct: v / 100 });
                  if (!r.ok) toast.negative("Set surcharge failed", r.error ?? "");
                  setDrafts((d) => ({ ...d, [t.id]: "" }));
                }}
              >
                Apply
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProductionCapAdmin() {
  const preOrders = useGame((s) => s.preOrders);
  const overrides = useGame((s) => s.productionCapOverrides);
  const setProductionCapOverride = useGame((s) => s.setProductionCapOverride);
  const forceDeliverPreOrders = useGame((s) => s.forceDeliverPreOrders);
  // Aggregate queued counts per spec across all teams.
  const bySpec = new Map<string, number>();
  for (const o of preOrders) {
    if (o.status !== "queued") continue;
    bySpec.set(o.specId, (bySpec.get(o.specId) ?? 0) + 1);
  }
  const specs = Array.from(bySpec.entries()).sort((a, b) => b[1] - a[1]);
  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
        Production overrides
      </div>
      <div className="rounded-md border border-line bg-surface p-3 space-y-2 text-[0.8125rem]">
        {specs.length === 0 ? (
          <div className="text-ink-muted italic">No pre-orders are currently queued.</div>
        ) : (
          specs.map(([specId, queued]) => {
            const override = overrides[specId];
            return (
              <div key={specId} className="flex items-center justify-between gap-2 border-b border-line/40 last:border-0 pb-2 last:pb-0">
                <div className="min-w-0">
                  <div className="font-mono tabular text-ink text-[0.8125rem]">{specId}</div>
                  <div className="text-[0.6875rem] text-ink-muted">
                    {queued} queued ·
                    {typeof override === "number" ? ` cap override ${override}` : " default cap"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <input
                    type="number"
                    min={1}
                    max={50}
                    placeholder="cap"
                    defaultValue={override ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value;
                      if (v === "") setProductionCapOverride(specId, null);
                      else setProductionCapOverride(specId, parseInt(v, 10));
                    }}
                    className="w-16 rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[0.75rem] tabular font-mono"
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      const n = parseInt(prompt(`Force-deliver how many of ${specId}? (queued: ${queued})`, String(Math.min(queued, 5))) ?? "0", 10);
                      if (n > 0) forceDeliverPreOrders(specId, n);
                    }}
                  >
                    Force deliver
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{k}</span>
      <span className="tabular font-mono text-ink">{v}</span>
    </div>
  );
}

/** Group header for the AdminPanel. Visual divider that breaks the
 *  long flat list of facilitator controls into named sections —
 *  Round control, Team adjustments, Scenario tools, Reset/demo etc.
 *  Recommendation #19: organise the facilitator console so
 *  destructive actions sit visually apart from routine adjustments. */
function GroupHeader({
  title, subtitle, tone,
}: {
  title: string;
  subtitle?: string;
  tone?: "danger";
}) {
  return (
    <div
      className={cn(
        "border-t pt-4 -mx-1 px-1 first:border-0 first:pt-0",
        tone === "danger" ? "border-negative/40" : "border-line",
      )}
    >
      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className={cn(
            "text-[0.6875rem] uppercase tracking-[0.18em] font-bold",
            tone === "danger" ? "text-negative" : "text-accent",
          )}
        >
          {title}
        </span>
        {subtitle && (
          <span className="text-[0.625rem] text-ink-muted leading-snug">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}

function AdjustChip({
  label, value, unit, onChange,
}: {
  label: string;
  value: number;
  unit?: string;
  onChange: (delta: number) => void;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-2/60 p-2">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{label}</span>
        <span className="tabular font-mono text-ink">
          {value.toFixed(0)}{unit ?? ""}
        </span>
      </div>
      <div className="flex gap-1">
        <button
          onClick={() => onChange(-5)}
          className="flex-1 h-6 rounded-sm bg-surface border border-line text-ink-2 hover:bg-surface-hover text-[0.625rem]"
        >
          −5
        </button>
        <button
          onClick={() => onChange(+5)}
          className="flex-1 h-6 rounded-sm bg-surface border border-line text-ink-2 hover:bg-surface-hover text-[0.625rem]"
        >
          +5
        </button>
      </div>
    </div>
  );
}

function PreviewRow({
  k, v, tone, bold,
}: {
  k: string; v: string; tone?: "pos" | "neg"; bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{k}</span>
      <span className={`tabular font-mono ${
        tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink"
      } ${bold ? "font-semibold" : ""}`}>{v}</span>
    </div>
  );
}
