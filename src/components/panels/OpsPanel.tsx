"use client";

import { useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { SLIDER_LABELS, SLIDER_PCT_REVENUE, SLIDER_EFFECTS } from "@/lib/engine";
import { useGame, selectPlayer } from "@/store/game";
import type { SliderLevel, Sliders } from "@/types/game";
import { cn } from "@/lib/cn";
import { scenariosForQuarter } from "@/data/scenarios";
import { getTotalRounds } from "@/lib/format";
import { useUi } from "@/store/ui";

const SLIDER_LIST: Array<{ key: keyof Sliders; label: string; sub: string }> = [
  { key: "staff", label: "Staff & Training", sub: "Cabin, pilots, ground, training" },
  // Rewards programme merged into Marketing per PRD update — single lever
  // for both ad spend and frequent-flyer rewards.
  { key: "marketing", label: "Marketing", sub: "Campaigns, PR, frequent-flyer rewards" },
  { key: "service", label: "In-Flight Service", sub: "Food, amenities, cabin" },
  { key: "operations", label: "Operations", sub: "Maintenance, engineering" },
  { key: "customerService", label: "Office Capacity", sub: "Check-in, ground ops, contact centre" },
];

export function OpsPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const setSliders = useGame((g) => g.setSliders);
  const closePanel = useUi((u) => u.closePanel);
  // Branded close-quarter confirm replaces the legacy native confirm()
  // when the player has unanswered scenarios.
  const [confirmClose, setConfirmClose] = useState(false);

  if (!player) return null;

  const pendingDecisions = scenariosForQuarter(s.currentQuarter, getTotalRounds(s)).filter(
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
      setConfirmClose(true);
      return;
    }
    s.closeQuarter();
    closePanel();
  }

  function commitForce() {
    setConfirmClose(false);
    s.closeQuarter();
    closePanel();
  }

  // ─── Budget preview (recommendation #B9) ──────────────────────
  // Shows projected total slider spend + brand/ops delta for the
  // current set of slider levels vs the prior quarter's totals from
  // financialsByQuarter. Lets the player see "this is what I'm
  // committing to" before they hit Submit, instead of finding out
  // after the close that they over-spent.
  const lastClose = player.financialsByQuarter.at(-1);
  // Total brand/ops delta = sum of effects across sliders. Honors the
  // streak multiplier at the same level (1.2× at 3Q, 1.5× at 6Q).
  let totalBrandPerQ = 0;
  let totalOpsPerQ = 0;
  for (const { key } of SLIDER_LIST) {
    const lvl = player.sliders[key];
    const e = SLIDER_EFFECTS[key][lvl];
    const streak = player.sliderStreaks[key];
    const mult = streak.level === lvl
      ? (streak.quarters >= 6 ? 1.5 : streak.quarters >= 3 ? 1.2 : 1.0)
      : 1.0;
    totalBrandPerQ += (e.brandPts ?? 0) * mult;
    totalOpsPerQ += (e.opsPts ?? 0) * mult;
  }

  return (
    <div className="space-y-4">
      <div className="text-[0.8125rem] text-ink-2">
        Q{s.currentQuarter} spend levels. Compound every 3 and 6 quarters at the same level.
      </div>

      {/* Budget preview cards — committed-spend signals at-a-glance.
          Brand + Ops projected deltas help the player calibrate slider
          tradeoffs (push marketing high → +brand but cuts ops). */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Brand Δ</div>
          <div
            className={cn(
              "font-display text-[1.25rem] tabular leading-none mt-0.5",
              totalBrandPerQ > 0 ? "text-positive" : totalBrandPerQ < 0 ? "text-negative" : "text-ink",
            )}
          >
            {totalBrandPerQ > 0 ? "+" : ""}{totalBrandPerQ.toFixed(1)}/Q
          </div>
          <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">
            Sum across slider effects + streak mults
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Ops Δ</div>
          <div
            className={cn(
              "font-display text-[1.25rem] tabular leading-none mt-0.5",
              totalOpsPerQ > 0 ? "text-positive" : totalOpsPerQ < 0 ? "text-negative" : "text-ink",
            )}
          >
            {totalOpsPerQ > 0 ? "+" : ""}{totalOpsPerQ.toFixed(1)}/Q
          </div>
          <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">
            Maintenance + customer-service combined
          </div>
        </div>
        <div className="rounded-md border border-line bg-surface p-2.5">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Last close</div>
          <div className="font-display text-[1.25rem] tabular leading-none mt-0.5 text-ink">
            {lastClose
              ? `Brand ${lastClose.brandPts.toFixed(0)}`
              : "—"}
          </div>
          <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">
            {lastClose
              ? `Ops ${lastClose.opsPts.toFixed(0)} · revenue ${(lastClose.revenue / 1e6).toFixed(1)}M`
              : "Submit a quarter to see comparisons"}
          </div>
        </div>
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

      {/* Aircraft insurance — recurring quarterly cost, lives here
          alongside the spend sliders rather than buried in Fleet panel.
          Premium is paid each quarter as % of fleet market value. On
          mandatory retirement, insurance pays out coverage × 75% of
          book value. */}
      <InsurancePicker />

      {pendingDecisions.length > 0 && (
        <div className="rounded-md border border-line bg-surface-2/50 p-3 text-[0.8125rem] text-ink-2">
          {pendingDecisions.length} board decision{pendingDecisions.length > 1 ? "s" : ""} still open this quarter — handle them in the
          {" "}<button className="text-accent underline hover:no-underline" onClick={() => useUi.getState().openPanel("decisions")}>Decisions panel</button>.
        </div>
      )}

      <Button variant="primary" className="w-full" onClick={commit}>
        Submit ops &amp; advance to next quarter →
      </Button>

      <Modal open={confirmClose} onClose={() => setConfirmClose(false)}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Close quarter with {pendingDecisions.length} decision
            {pendingDecisions.length === 1 ? "" : "s"} still open?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            Any pending scenario will auto-resolve to a sensible default
            at close — usually the first listed option, skipping anything
            blocked by current cash, fleet or PR state.
          </p>
        </ModalHeader>
        <ModalBody className="space-y-2">
          <ul className="space-y-1.5">
            {pendingDecisions.map((sc) => (
              <li
                key={sc.id}
                className="rounded-md border border-line bg-surface px-3 py-2 text-[0.8125rem]"
              >
                <div className="font-semibold text-ink">{sc.title}</div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                  Will auto-submit at quarter close.
                </div>
              </li>
            ))}
          </ul>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmClose(false)}>
            Go back to decisions
          </Button>
          <Button variant="primary" onClick={commitForce}>
            Close quarter anyway
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}

function InsurancePicker() {
  const player = useGame(selectPlayer);
  const setInsurancePolicy = useGame((g) => g.setInsurancePolicy);
  if (!player) return null;
  const insuranceMeta = {
    none:   { coverage: "0%",  premium: "0%/Q" },
    low:    { coverage: "30%", premium: "0.15%/Q" },
    medium: { coverage: "50%", premium: "0.30%/Q" },
    high:   { coverage: "80%", premium: "0.50%/Q" },
  };
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-baseline justify-between mb-2">
        <div>
          <div className="font-semibold text-ink text-[0.9375rem]">Aircraft insurance</div>
          <div className="text-[0.75rem] text-ink-muted">
            Premium paid quarterly as % of fleet market value
          </div>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {(["none", "low", "medium", "high"] as const).map((lvl) => {
          const m = insuranceMeta[lvl];
          const active = player.insurancePolicy === lvl;
          return (
            <button
              key={lvl}
              onClick={() => setInsurancePolicy(lvl)}
              className={cn(
                "rounded-md border px-2 py-1.5 capitalize transition-colors",
                active
                  ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                  : "border-line text-ink-2 hover:bg-surface-hover",
              )}
            >
              <div className="text-[0.75rem] font-medium">{lvl}</div>
              <div className="text-[0.625rem] text-ink-muted">
                {m.premium} · {m.coverage}
              </div>
            </button>
          );
        })}
      </div>
      <div className="text-[0.6875rem] text-ink-muted mt-2 leading-relaxed">
        On mandatory retirement, insurance pays out coverage × 75% of book value.
      </div>
    </div>
  );
}
