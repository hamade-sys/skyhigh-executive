"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { CITIES } from "@/data/cities";

export function AdminPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const router = useRouter();
  const [cashAdjust, setCashAdjust] = useState(0);
  const [secondaryHub, setSecondaryHub] = useState("");
  const [flashDealCount, setFlashDealCount] = useState(3);

  if (!player) return null;

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
            placeholder="Amount"
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
        <div className="text-[0.6875rem] text-ink-muted">
          Use negative numbers to remove cash. All admin actions are local-only until Supabase lands.
        </div>
      </section>

      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
          Fuel & rates
        </div>
        <div className="grid grid-cols-2 gap-2 text-[0.8125rem]">
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.max(50, s.fuelIndex - 10) })}>
            Fuel −10
          </Button>
          <Button size="sm" variant="secondary" onClick={() =>
            useGame.setState({ fuelIndex: Math.min(200, s.fuelIndex + 10) })}>
            Fuel +10
          </Button>
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
        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="secondary" onClick={s.closeQuarter}>
            Force close Q{s.currentQuarter}
          </Button>
          <Button size="sm" variant="secondary" onClick={s.advanceToNext}>
            Advance quarter
          </Button>
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

      <section className="pt-3 border-t border-line">
        <Button
          variant="danger"
          className="w-full"
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
