"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, Input } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";

export function AdminPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const router = useRouter();
  const [cashAdjust, setCashAdjust] = useState(0);

  if (!player) return null;

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
