"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { SCENARIOS, SCENARIOS_BY_QUARTER, type OptionEffect, type ScenarioOption } from "@/data/scenarios";
import { useGame, selectPlayer } from "@/store/game";
import { cn } from "@/lib/cn";
import type { Team } from "@/types/game";
import { fmtMoney } from "@/lib/format";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { CheckCircle2, AlertTriangle } from "lucide-react";

export function DecisionsPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const submit = useGame((g) => g.submitDecision);
  if (!player) return null;

  const currentScenarios = SCENARIOS_BY_QUARTER[s.currentQuarter] ?? [];
  const pastDecisions = [...player.decisions].sort((a, b) => b.quarter - a.quarter);

  return (
    <div className="space-y-4">
      {currentScenarios.length === 0 ? (
        <div className="py-8 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          No board decision this quarter.
        </div>
      ) : (
        currentScenarios.map((sc) => {
          const submitted = player.decisions.find((d) => d.scenarioId === sc.id && d.quarter === s.currentQuarter);
          return (
            <ScenarioCard
              key={sc.id}
              scenario={sc}
              submittedOptionId={submitted?.optionId ?? null}
              flags={player.flags}
              cargoFleetCount={player.fleet.filter((f) => {
                const spec = AIRCRAFT_BY_ID[f.specId];
                return spec?.family === "cargo" && f.status !== "retired";
              }).length}
              onSubmit={(optionId) => submit({ scenarioId: sc.id, optionId: optionId as "A" | "B" | "C" | "D" | "E" })}
            />
          );
        })
      )}

      {pastDecisions.length > 0 && (
        <section className="pt-3 border-t border-line">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">Past decisions</div>
          <div className="space-y-1.5">
            {pastDecisions.map((d) => {
              const sc = SCENARIOS.find((x) => x.id === d.scenarioId);
              if (!sc) return null;
              const opt = sc.options.find((o) => o.id === d.optionId);
              return (
                <div key={`${d.scenarioId}-${d.quarter}`} className="flex items-baseline justify-between text-[0.8125rem] py-1.5 border-b border-line last:border-0">
                  <div className="min-w-0">
                    <span className="font-mono text-primary mr-1.5 text-[0.75rem]">Q{d.quarter} · {sc.id}</span>
                    <span className="text-ink truncate">{sc.title}</span>
                  </div>
                  <span className="shrink-0 text-accent font-mono text-[0.75rem] ml-2">
                    {d.optionId} · {opt?.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function ScenarioCard({
  scenario, submittedOptionId, onSubmit, flags, cargoFleetCount,
}: {
  scenario: (typeof SCENARIOS)[number];
  submittedOptionId: string | null;
  flags: Team["flags"];
  cargoFleetCount: number;
  onSubmit: (optionId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const locked = !!submittedOptionId;

  function isBlocked(opt: (typeof scenario.options)[number]): string | null {
    if (opt.blockedByFlags) {
      for (const f of opt.blockedByFlags) {
        if (flags.has(f)) return f;
      }
    }
    // Capability requirement (PRD update — option D of S5 needs cargo fleet)
    if (opt.requires === "cargo-fleet" && cargoFleetCount === 0) {
      return "no cargo fleet";
    }
    return null;
  }

  const severityTone =
    scenario.severity === "CATASTROPHIC" || scenario.severity === "HIGH" ? "negative"
      : scenario.severity === "MEDIUM" ? "warning" : "neutral";

  return (
    <div className="rounded-lg border border-line bg-surface p-4 shadow-[var(--shadow-1)]">
      <div className="flex items-center gap-2 mb-2">
        <Badge tone={severityTone}>{scenario.severity}</Badge>
        <span className="font-mono text-[0.75rem] text-primary">{scenario.id}</span>
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
          Q{scenario.quarter} · {scenario.timeLimitMinutes}m
        </span>
        {locked
          ? <Badge tone="primary">Submitted</Badge>
          : <Badge tone="accent">Awaiting decision</Badge>}
      </div>
      <h3 className="font-display text-[1.375rem] text-ink leading-tight mb-2">
        {scenario.title}
      </h3>
      <p className="italic text-ink-2 text-[0.875rem] leading-relaxed mb-2">{scenario.teaser}</p>
      <p className="text-ink-2 text-[0.875rem] leading-relaxed mb-3">{scenario.context}</p>

      <div className="space-y-1.5">
        {scenario.options.map((opt) => {
          const blocker = isBlocked(opt);
          const isSelected = locked ? opt.id === submittedOptionId : opt.id === selected;
          const disabled = locked || !!blocker;
          return (
            <button
              key={opt.id}
              onClick={() => !disabled && setSelected(opt.id)}
              disabled={disabled}
              className={cn(
                "w-full text-left rounded-md border px-3 py-2 transition-all",
                isSelected ? "border-primary bg-[rgba(20,53,94,0.05)]" : "border-line hover:bg-surface-hover",
                disabled && !isSelected && "opacity-50 cursor-not-allowed",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-[0.875rem] text-accent shrink-0 w-4 mt-0.5">{opt.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-ink text-[0.875rem]">{opt.label}</span>
                    {blocker && (
                      <Badge tone="negative">Blocked · {blocker.replace(/_/g, " ")}</Badge>
                    )}
                  </div>
                  <div className="text-[0.8125rem] text-ink-2 mt-0.5 leading-relaxed">{opt.description}</div>
                  {opt.effectTags && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {opt.effectTags.map((t) => <Badge key={t} tone="neutral">{t}</Badge>)}
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {!locked && (
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-line">
          <span className="text-[0.75rem] text-ink-muted">
            {selected ? `Option ${selected} selected` : "Pick an option"}
          </span>
          <Button size="sm" variant="primary" disabled={!selected} onClick={() => selected && onSubmit(selected)}>
            Submit decision
          </Button>
        </div>
      )}

      {locked && (() => {
        const submittedOption = scenario.options.find((o) => o.id === submittedOptionId);
        if (!submittedOption) return null;
        return <ConsequenceCard option={submittedOption} />;
      })()}
    </div>
  );
}

/**
 * Renders the immediate + deferred effects of a chosen option, so the player
 * sees the boardroom consequences of the choice they just locked in. Tied to
 * the existing `OptionEffect` schema in src/data/scenarios.ts.
 */
function ConsequenceCard({ option }: { option: ScenarioOption }) {
  const e = option.effect;
  const hasImmediate = !!(
    e.cash || e.brandPts || e.opsPts || e.loyaltyDelta ||
    (e.setFlags && e.setFlags.length > 0)
  );
  const deferred = e.deferred;
  return (
    <div className="mt-3 pt-3 border-t border-line">
      <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-positive font-semibold mb-2">
        <CheckCircle2 size={12} /> Boardroom consequence
      </div>
      {hasImmediate ? (
        <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 space-y-1">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-0.5">
            Effects this quarter
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem]">
            {e.cash !== undefined && e.cash !== 0 && (
              <Pill tone={e.cash >= 0 ? "positive" : "negative"}>
                Cash {e.cash >= 0 ? "+" : ""}{fmtMoney(e.cash)}
              </Pill>
            )}
            {e.brandPts !== undefined && e.brandPts !== 0 && (
              <Pill tone={e.brandPts >= 0 ? "positive" : "negative"}>
                Brand {e.brandPts >= 0 ? "+" : ""}{e.brandPts}
              </Pill>
            )}
            {/* Loyalty delta is internal — not surfaced to the player. */}
            {e.opsPts !== undefined && e.opsPts !== 0 && (
              <Pill tone={e.opsPts >= 0 ? "positive" : "negative"}>
                Ops {e.opsPts >= 0 ? "+" : ""}{e.opsPts}
              </Pill>
            )}
            {(e.setFlags ?? []).map((f) => (
              <Pill key={f} tone="info">{f.replace(/_/g, " ")}</Pill>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-[0.75rem] text-ink-muted italic">No immediate effects.</div>
      )}

      {deferred && (
        <div className="mt-2 rounded-md border border-warning bg-[var(--warning-soft)] px-3 py-2">
          <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-warning font-semibold mb-1">
            <AlertTriangle size={11} /> Deferred consequence · Q{deferred.quarter}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.8125rem]">
            {deferred.probability !== undefined && deferred.probability < 1 && (
              <span className="text-[0.6875rem] tabular font-mono text-warning font-semibold">
                {(deferred.probability * 100).toFixed(0)}% chance
              </span>
            )}
            <DeferredEffectSummary effect={deferred.effect} />
          </div>
        </div>
      )}
    </div>
  );
}

function DeferredEffectSummary({ effect }: { effect: OptionEffect }) {
  const parts: React.ReactNode[] = [];
  if (effect.cash) {
    parts.push(
      <Pill key="cash" tone={effect.cash >= 0 ? "positive" : "negative"}>
        Cash {effect.cash >= 0 ? "+" : ""}{fmtMoney(effect.cash)}
      </Pill>,
    );
  }
  if (effect.brandPts) {
    parts.push(
      <Pill key="brand" tone={effect.brandPts >= 0 ? "positive" : "negative"}>
        Brand {effect.brandPts >= 0 ? "+" : ""}{effect.brandPts}
      </Pill>,
    );
  }
  // Loyalty delta is internal — kept silent in deferred summary too.
  if (effect.opsPts) {
    parts.push(
      <Pill key="ops" tone={effect.opsPts >= 0 ? "positive" : "negative"}>
        Ops {effect.opsPts >= 0 ? "+" : ""}{effect.opsPts}
      </Pill>,
    );
  }
  if (parts.length === 0) parts.push(<span key="none" className="text-ink-2">No deferred effect</span>);
  return <>{parts}</>;
}

function Pill({ tone, children }: { tone: "positive" | "negative" | "info"; children: React.ReactNode }) {
  const cls =
    tone === "positive" ? "bg-[var(--positive-soft)] text-positive"
      : tone === "negative" ? "bg-[var(--negative-soft)] text-negative"
      : "bg-[var(--info-soft)] text-info";
  return (
    <span className={cn(
      "inline-flex items-center text-[0.6875rem] tabular font-mono px-1.5 py-0.5 rounded",
      cls,
    )}>
      {children}
    </span>
  );
}
