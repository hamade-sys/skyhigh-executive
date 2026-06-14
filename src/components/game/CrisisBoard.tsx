"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Fuel,
  TrendingDown,
  Shield,
  Plane,
  Boxes,
  ArrowRight,
} from "lucide-react";
import type { CrisisOptionId } from "@/types/game";
import {
  useGame,
  selectActiveTeam,
  selectPlayer,
} from "@/store/game";
import { Modal } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { crisisMeta, crisisOptions, CRISIS_PAYOFF_DELAY } from "@/lib/crisis";

/**
 * Crisis Board — macro shocks become a board call (W1.8).
 *
 * When a fuel spike or demand collapse crosses its threshold at quarter
 * close, the player's team gets a `pendingCrisis`. In the new quarter this
 * raises a one-time strategic decision: protect cash, defend the franchise,
 * or chase the freight upside. Each option applies an immediate effect and
 * queues a deferred payoff that lands two quarters later in the digest.
 *
 * Non-blocking: the player can minimise it to check finances first; a slim
 * banner keeps the call reachable so it can't be lost.
 */

const OPTION_ICON: Record<CrisisOptionId, typeof Shield> = {
  defensive: Shield,
  "fly-through": Plane,
  "pivot-cargo": Boxes,
};

function DeltaChips({
  cashUsd,
  brandPts,
  loyaltyPct,
  when,
}: {
  cashUsd: number;
  brandPts: number;
  loyaltyPct: number;
  when: string;
}) {
  const chips: { label: string; positive: boolean }[] = [];
  if (cashUsd !== 0) {
    chips.push({
      label: `${cashUsd >= 0 ? "+" : ""}${fmtMoney(cashUsd)}`,
      positive: cashUsd >= 0,
    });
  }
  if (brandPts !== 0) {
    chips.push({ label: `${brandPts >= 0 ? "+" : ""}${brandPts} brand`, positive: brandPts >= 0 });
  }
  if (loyaltyPct !== 0) {
    chips.push({
      label: `${loyaltyPct >= 0 ? "+" : ""}${loyaltyPct} loyalty`,
      positive: loyaltyPct >= 0,
    });
  }
  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-micro uppercase tracking-wider text-ink-faint">{when}</span>
      {chips.map((c) => (
        <span
          key={c.label}
          className={`text-caption font-semibold tabular-nums rounded px-1.5 py-0.5 ${
            c.positive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-rose-50 text-rose-700"
          }`}
        >
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function CrisisBoard() {
  const activeTeam = useGame(selectActiveTeam);
  const legacyPlayer = useGame(selectPlayer);
  const player = activeTeam ?? legacyPlayer;
  const phase = useGame((s) => s.phase);
  const resolveCrisis = useGame((s) => s.resolveCrisis);
  const [minimized, setMinimized] = useState(false);
  const [submitting, setSubmitting] = useState<CrisisOptionId | null>(null);

  const crisis = player?.pendingCrisis ?? null;
  if (!player || !crisis || phase !== "playing") return null;

  const meta = crisisMeta(crisis.kind, crisis.fuelIndex, crisis.travelIndex);
  const options = crisisOptions(crisis.kind, player);
  const KindIcon: typeof Fuel = crisis.kind === "fuel-spike" ? Fuel : TrendingDown;

  const onChoose = (id: CrisisOptionId) => {
    setSubmitting(id);
    const res = resolveCrisis(id);
    if (!res.ok) setSubmitting(null);
    // On success the pendingCrisis clears in the store and this unmounts.
  };

  if (minimized) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed top-[4.25rem] left-1/2 -translate-x-1/2 z-[1085] w-[min(30rem,calc(100vw-2rem))]"
      >
        <div className="rounded-lg border border-amber-300 bg-surface/97 backdrop-blur-md shadow-[var(--shadow-4)] overflow-hidden">
          <div className="h-1 w-full bg-amber-400" />
          <div className="flex items-center gap-3 px-4 py-2.5">
            <span className="shrink-0 inline-flex w-8 h-8 rounded-lg bg-amber-50 text-amber-600 items-center justify-center">
              <AlertTriangle size={16} aria-hidden />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-caption uppercase tracking-wider text-amber-700 font-semibold">
                Board call pending
              </div>
              <p className="text-body-sm text-ink leading-snug truncate">{meta.title}</p>
            </div>
            <button
              type="button"
              onClick={() => setMinimized(false)}
              className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-ink text-surface text-caption font-semibold px-3 py-1.5 hover:opacity-90 transition"
            >
              Decide <ArrowRight size={13} aria-hidden />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Modal
      open
      onClose={() => setMinimized(true)}
      ariaLabel={meta.title}
      className="w-[min(46rem,calc(100vw-2rem))]"
    >
      <div className="px-6 pt-6 pb-4 border-b border-line">
        <div className="flex items-start gap-3">
          <span className="shrink-0 inline-flex w-11 h-11 rounded-xl bg-amber-50 text-amber-600 items-center justify-center">
            <KindIcon size={22} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="text-caption uppercase tracking-wider text-amber-700 font-semibold">
              {meta.eyebrow} · board call
            </div>
            <h2 className="text-title font-semibold text-ink leading-tight mt-0.5">
              {meta.title}
            </h2>
          </div>
        </div>
        <p className="text-body-sm text-ink-muted leading-relaxed mt-3">
          {meta.situation}
        </p>
      </div>

      <div className="px-6 py-5 grid gap-3 sm:grid-cols-3">
        {options.map((opt) => {
          const Icon = OPTION_ICON[opt.id];
          const busy = submitting !== null;
          return (
            <button
              key={opt.id}
              type="button"
              disabled={busy}
              onClick={() => onChoose(opt.id)}
              className={`group text-left rounded-xl border p-4 flex flex-col gap-3 transition ${
                submitting === opt.id
                  ? "border-accent bg-[var(--accent-soft)]"
                  : "border-line bg-surface hover:border-accent hover:shadow-sm"
              } ${busy && submitting !== opt.id ? "opacity-50" : ""} disabled:cursor-not-allowed`}
            >
              <span className="inline-flex w-9 h-9 rounded-lg bg-ink/5 text-ink items-center justify-center group-hover:bg-[var(--accent-soft)] group-hover:text-accent transition">
                <Icon size={18} aria-hidden />
              </span>
              <div>
                <div className="text-label font-semibold text-ink">{opt.label}</div>
                <p className="text-caption text-ink-muted leading-snug mt-1">{opt.blurb}</p>
              </div>
              <div className="mt-auto flex flex-col gap-1.5">
                <DeltaChips
                  cashUsd={opt.immediate.cashUsd}
                  brandPts={opt.immediate.brandPts}
                  loyaltyPct={opt.immediate.loyaltyPct}
                  when="Now"
                />
                <div className="text-caption text-ink-faint leading-snug">
                  <span className="text-micro uppercase tracking-wider text-ink-faint">
                    In {CRISIS_PAYOFF_DELAY}Q
                  </span>{" "}
                  {opt.deferredHeadline}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <div className="px-6 py-4 border-t border-line flex items-center justify-between">
        <p className="text-caption text-ink-faint">
          One decision — it shapes the next few quarters.
        </p>
        <button
          type="button"
          onClick={() => setMinimized(true)}
          className="text-caption font-medium text-ink-muted hover:text-ink transition"
        >
          Review finances first
        </button>
      </div>
    </Modal>
  );
}
