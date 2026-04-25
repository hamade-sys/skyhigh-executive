"use client";

import { Badge, Button } from "@/components/ui";
import { SLIDER_LABELS, SLIDER_PCT_REVENUE, SLIDER_EFFECTS } from "@/lib/engine";
import { useGame, selectPlayer } from "@/store/game";
import type { SliderLevel, Sliders } from "@/types/game";
import { cn } from "@/lib/cn";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { useUi } from "@/store/ui";

const SLIDER_LIST: Array<{ key: keyof Sliders; label: string; sub: string }> = [
  { key: "staff", label: "Staff & Training", sub: "Cabin, pilots, ground, training" },
  { key: "marketing", label: "Marketing", sub: "Campaigns, PR, partnerships" },
  { key: "service", label: "In-Flight Service", sub: "Food, amenities, cabin" },
  { key: "rewards", label: "Rewards Program", sub: "Loyalty tiers, redemptions" },
  { key: "operations", label: "Operations", sub: "Maintenance, engineering" },
  { key: "customerService", label: "Customer Service", sub: "Check-in, ground ops, satisfaction" },
];

export function OpsPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const setSliders = useGame((g) => g.setSliders);
  const closePanel = useUi((u) => u.closePanel);

  if (!player) return null;

  const pendingDecisions = (SCENARIOS_BY_QUARTER[s.currentQuarter] ?? []).filter(
    (sc) => !player.decisions.some((d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter),
  );

  // PRD B6 — live dissonance warning
  const gap = Math.abs(player.sliders.staff - player.sliders.service);
  const dissonance = gap >= 3
    ? (player.sliders.staff < player.sliders.service
      ? "Great food, dreadful crew — passengers notice."
      : "Wonderful crew, nothing to offer — service underwhelms.")
    : null;

  function commit() {
    if (pendingDecisions.length > 0) {
      if (!confirm(`${pendingDecisions.length} board decision${pendingDecisions.length > 1 ? "s" : ""} still open. Close anyway?`)) return;
    }
    s.closeQuarter();
    closePanel();
  }

  return (
    <div className="space-y-4">
      <div className="text-[0.8125rem] text-ink-2">
        Q{s.currentQuarter} spend levels. Compound every 3 and 6 quarters at the same level.
      </div>

      {SLIDER_LIST.map(({ key, label, sub }) => {
        const level = player.sliders[key];
        const pctRev = SLIDER_PCT_REVENUE[level];
        const e = SLIDER_EFFECTS[key][level];
        const streak = player.sliderStreaks[key];
        return (
          <div key={key} className="rounded-md border border-line bg-surface p-3">
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-semibold text-ink text-[0.9375rem]">{label}</div>
                <div className="text-[0.75rem] text-ink-muted">{sub}</div>
              </div>
              <div className="text-right">
                <div className="font-display text-[1.25rem] text-ink leading-none">{SLIDER_LABELS[level]}</div>
                <div className="text-[0.6875rem] text-ink-muted tabular mt-0.5">
                  {key === "staff"
                    ? `×${[0.5, 0.75, 1.0, 1.1, 1.2, 1.5][level]} staff`
                    : `${(pctRev * 100).toFixed(0)}% of rev`}
                </div>
              </div>
            </div>
            <div className="flex gap-1 mb-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <button
                  key={i}
                  onClick={() => setSliders({ [key]: i as SliderLevel })}
                  className={cn(
                    "flex-1 h-8 rounded-md text-[0.6875rem] font-medium transition-colors",
                    i === level
                      ? "bg-primary text-primary-fg"
                      : "bg-surface-2 text-ink-2 hover:bg-surface-hover",
                  )}
                >
                  {SLIDER_LABELS[i as SliderLevel].split(" ")[0]}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.6875rem] text-ink-2">
              <span>Brand <span className={e.brandPts >= 0 ? "text-positive" : "text-negative"}>{e.brandPts >= 0 ? "+" : ""}{e.brandPts}/Q</span></span>
              <span>Loyalty <span className={e.loyalty >= 0 ? "text-positive" : "text-negative"}>{e.loyalty >= 0 ? "+" : ""}{e.loyalty}%/Q</span></span>
              {e.opsPts !== undefined && <span>Ops <span className={e.opsPts >= 0 ? "text-positive" : "text-negative"}>{e.opsPts >= 0 ? "+" : ""}{e.opsPts}/Q</span></span>}
              {streak.level === level && streak.quarters > 0 && (
                <span className="text-accent">Streak {streak.quarters}Q → {streak.quarters >= 6 ? "1.5×" : streak.quarters >= 3 ? "1.2×" : "1.0×"}</span>
              )}
            </div>
          </div>
        );
      })}

      {dissonance && (
        <div className="rounded-md border border-warning bg-[var(--warning-soft)] p-3 text-[0.8125rem]">
          <div className="font-medium text-warning mb-0.5">⚠ Service dissonance detected</div>
          <div className="text-ink-2">{dissonance} Gap of {gap} slider levels between Staff & In-Flight Service costs −2 to −3 Brand Pts and loyalty this quarter.</div>
        </div>
      )}

      {pendingDecisions.length > 0 && (
        <div className="rounded-md border border-accent bg-[var(--accent-soft)] p-3">
          <div className="font-semibold text-ink text-[0.875rem] mb-1">
            {pendingDecisions.length} board decision{pendingDecisions.length > 1 ? "s" : ""} still open
          </div>
          <ul className="space-y-0.5 text-[0.75rem] text-ink-2">
            {pendingDecisions.map((sc) => (
              <li key={sc.id}>
                <span className="font-mono text-primary mr-1.5">{sc.id}</span>
                {sc.title}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Button variant="primary" className="w-full" onClick={commit}>
        Close quarter →
      </Button>
    </div>
  );
}
