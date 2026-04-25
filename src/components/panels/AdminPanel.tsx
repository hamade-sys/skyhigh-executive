"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input, Sparkline } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { CITIES } from "@/data/cities";
import { runQuarterClose } from "@/lib/engine";

export function AdminPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const router = useRouter();
  const [cashAdjust, setCashAdjust] = useState(0);
  const [secondaryHub, setSecondaryHub] = useState("");
  const [flashDealCount, setFlashDealCount] = useState(3);

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
    });
  }, [player, s.baseInterestRatePct, s.fuelIndex, s.currentQuarter]);

  if (!player || !preview) return null;

  const tier1 = CITIES.filter((c) => c.tier === 1).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-5">
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Game state</div>
        <div className="space-y-1.5 text-[0.8125rem]">
          <Row k="Phase" v={s.phase} />
          <Row k="Quarter" v={`Q${s.currentQuarter} / 20`} />
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
                {t.isPlayer ? <Badge tone="primary">You</Badge> : <Badge tone="neutral">Rival</Badge>}
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
              if (!r.ok) alert(r.error ?? "Failed");
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
            Flash Deal available at Q13
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
                if (!r.ok) alert(r.error ?? "Failed");
              }}
            >
              Claim {fmtMoney(4_000_000 * flashDealCount)}
            </Button>
          </div>
        </section>
      )}

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
            Ground-stop · slot fee refund (PRD G6)
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
          Hub infrastructure (PRD D4)
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[0.75rem] mb-2">
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("fuelReserveTank");
              if (!r.ok) alert(r.error);
            }}>
            Fuel Tank · $8M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("maintenanceDepot");
              if (!r.ok) alert(r.error);
            }}>
            Maint Depot · $12M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("premiumLounge");
              if (!r.ok) alert(r.error);
            }}>
            Premium Lounge · $5M
          </Button>
          <Button size="sm" variant="secondary"
            onClick={() => {
              const r = s.buyHubInvestment("opsExpansion");
              if (!r.ok) alert(r.error);
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

      {/* Insurance policy (PRD E5) */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Insurance policy (PRD E5)
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
                    onClick={() => {
                      if (confirm(`Trigger ${e.sourceScenario}-${e.sourceOption} now? This applies its effect immediately.`)) {
                        s.adminTriggerDeferred(e.id);
                      }
                    }}
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

      <section className="pt-3 border-t border-line grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={() => {
            if (confirm("Start demo mode? This resets and seeds sample data.")) {
              s.resetGame();
              s.startDemo();
            }
          }}
        >
          Demo mode
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            if (confirm("Reset the simulation? All state is wiped.")) {
              s.resetGame();
              router.push("/");
            }
          }}
        >
          Reset simulation
        </Button>
      </section>
    </div>
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
