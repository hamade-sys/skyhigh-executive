"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { SCENARIOS, SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { useGame, selectPlayer } from "@/store/game";
import { cn } from "@/lib/cn";

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
  scenario, submittedOptionId, onSubmit,
}: {
  scenario: (typeof SCENARIOS)[number];
  submittedOptionId: string | null;
  onSubmit: (optionId: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const locked = !!submittedOptionId;

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
        {locked && <Badge tone="primary">Submitted</Badge>}
      </div>
      <h3 className="font-display text-[1.375rem] text-ink leading-tight mb-2">
        {scenario.title}
      </h3>
      <p className="italic text-ink-2 text-[0.875rem] leading-relaxed mb-2">{scenario.teaser}</p>
      <p className="text-ink-2 text-[0.875rem] leading-relaxed mb-3">{scenario.context}</p>

      <div className="space-y-1.5">
        {scenario.options.map((opt) => {
          const isSelected = locked ? opt.id === submittedOptionId : opt.id === selected;
          return (
            <button
              key={opt.id}
              onClick={() => !locked && setSelected(opt.id)}
              disabled={locked}
              className={cn(
                "w-full text-left rounded-md border px-3 py-2 transition-all",
                isSelected ? "border-primary bg-[rgba(20,53,94,0.05)]" : "border-line hover:bg-surface-hover",
                locked && !isSelected && "opacity-50",
              )}
            >
              <div className="flex items-start gap-2">
                <span className="font-mono text-[0.875rem] text-accent shrink-0 w-4 mt-0.5">{opt.id}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-ink text-[0.875rem]">{opt.label}</div>
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
    </div>
  );
}
