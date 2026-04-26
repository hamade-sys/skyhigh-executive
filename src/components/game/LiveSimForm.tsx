"use client";

import { useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { useGame } from "@/store/game";
import { cn } from "@/lib/cn";
import type { Team } from "@/types/game";

/**
 * Live Simulation outcome entry — used by the facilitator after each
 * offline live sim (L0–L7) to push the result into the platform.
 *
 * Single template, parameterised by sim id. Each sim has its own
 * descriptor with the fields it CARES about, but the form always
 * accepts the union (Brand/Cash/Ops/Loyalty deltas + per-role MVP +
 * free-text notes) so a facilitator can capture nuance.
 */

export type LiveSimId = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";

interface SimDescriptor {
  id: LiveSimId;
  title: string;
  timing: string;
  who: string;
  hint: string;
  /** Predefined flags this sim can set (auto-suggested in form) */
  flags?: string[];
}

export const LIVE_SIMS: SimDescriptor[] = [
  // 40-round mapping: PRD timings translated via 2Q-1 (PRD-Q N → round 2N-1).
  {
    id: "L0",
    title: "Brand Building",
    timing: "Q1 2015",
    who: "All teams",
    hint: "Score on 5 dimensions. Rank → cash injection (1st +$80M, 2nd +$60M, 3rd +$40M, 4th +$20M, 5th $0). Brand Pts multiplier (10×/7×/5×/3×/2×).",
  },
  {
    id: "L1",
    title: "The Strike",
    timing: "Between Q3 2016 – Q1 2017",
    who: "Cross-team pairings",
    hint: "Bilateral negotiation. Corporate knows $400K/min cost (3× after min 30). Union has secret dead-stop. Government 50% relief if dead-stop triggers.",
    flags: ["strong_labour_relations", "weak_labour_relations"],
  },
  {
    id: "L2",
    title: "Talent Heist Live",
    timing: "Q3 2020 (with S14)",
    who: "CEOs extracted",
    hint: "CEOs bid to poach a rival exec. Remaining team makes S14 counter without CEO. Cross-reference bids with S14 picks.",
  },
  {
    id: "L3",
    title: "The Whistleblower",
    timing: "Between Q1 2018 – Q3 2018",
    who: "CEOs only",
    hint: "Junior engineer reveals forged safety sign-offs. Score on listening, honesty, protecting engineer, commitment to action.",
  },
  {
    id: "L4",
    title: "The Podium",
    timing: "Between Q3 2019 – Q1 2020",
    who: "CEOs only",
    hint: "Press conference to journalist. Plot twist: any specific verbal promise becomes a game obligation. Log exact commitments.",
  },
  {
    id: "L5",
    title: "Project Aurora",
    timing: "Between Q1 2021 – Q3 2021",
    who: "All roles split by function",
    hint: "20 information cards. CEO has hidden agenda card (Route D = personal MVP, team destruction). Three routing options A/B/C.",
    flags: ["integrity_leader", "maverick"],
  },
  {
    id: "L6",
    title: "FIFA Elevator",
    timing: "End of Q1 2018",
    who: "CMOs only",
    hint: "60-second pitch. Score 5 dim × 5 pts. +3 bonus for BMW/golf reference (early world-news clue). Combined with R3 sealed bid → World Cup winner.",
    flags: ["global_brand"],
  },
  {
    id: "L7",
    title: "Crisis Operations Room",
    timing: "Between Q3 2018 – Q1 2019",
    who: "CMOs + CFOs",
    hint: "No-fly zone (flight 58 min from dest, 61 from origin) + projectile risk on runway (1:15,750 prob, $50M/$400M loss model).",
  },
];

export function LiveSimForm({ teams }: { teams: Team[] }) {
  const apply = useGame((g) => g.applyLiveSimOutcome);

  const [simId, setSimId] = useState<LiveSimId>("L0");
  const [teamId, setTeamId] = useState<string>(teams[0]?.id ?? "");
  const [cashM, setCashM] = useState<string>("0");
  const [brandPts, setBrandPts] = useState<string>("0");
  const [opsPts, setOpsPts] = useState<string>("0");
  const [loyalty, setLoyalty] = useState<string>("0");
  const [mvpCEO, setMvpCEO] = useState<string>("0");
  const [mvpCFO, setMvpCFO] = useState<string>("0");
  const [mvpCMO, setMvpCMO] = useState<string>("0");
  const [mvpCHRO, setMvpCHRO] = useState<string>("0");
  const [setFlags, setSetFlags] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const sim = LIVE_SIMS.find((s) => s.id === simId)!;
  const team = teams.find((t) => t.id === teamId);

  function submit() {
    if (!team) return;
    const r = apply({
      teamId: team.id,
      simId,
      cashDelta: (parseFloat(cashM) || 0) * 1_000_000,
      brandPtsDelta: parseInt(brandPts, 10) || 0,
      opsPtsDelta: parseInt(opsPts, 10) || 0,
      loyaltyDelta: parseInt(loyalty, 10) || 0,
      mvpByRole: {
        CEO: parseInt(mvpCEO, 10) || 0,
        CFO: parseInt(mvpCFO, 10) || 0,
        CMO: parseInt(mvpCMO, 10) || 0,
        CHRO: parseInt(mvpCHRO, 10) || 0,
      },
      setFlags: setFlags.split(",").map((s) => s.trim()).filter(Boolean),
      notes: notes.trim() || undefined,
    });
    if (!r.ok) {
      alert(r.error ?? "Failed to apply outcome");
      return;
    }
    // Reset deltas but keep team + sim selection for next entry
    setCashM("0"); setBrandPts("0"); setOpsPts("0"); setLoyalty("0");
    setMvpCEO("0"); setMvpCFO("0"); setMvpCMO("0"); setMvpCHRO("0");
    setSetFlags(""); setNotes("");
  }

  return (
    <div className="space-y-4">
      <header>
        <h2 className="font-display text-[1.5rem] text-ink mb-1">Live simulation outcomes</h2>
        <p className="text-ink-2 text-[0.875rem] leading-relaxed">
          Capture the result of each offline live sim and push it to a team.
          Deltas apply immediately. Use the notes field to log verbal
          commitments (especially L4 Podium press conference).
        </p>
      </header>

      {/* Sim picker */}
      <div className="grid grid-cols-4 gap-1.5">
        {LIVE_SIMS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSimId(s.id)}
            className={cn(
              "rounded-md border px-3 py-2 text-left transition-colors",
              simId === s.id
                ? "border-primary bg-[rgba(20,53,94,0.06)]"
                : "border-line hover:bg-surface-hover",
            )}
          >
            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="font-mono text-[0.8125rem] font-semibold text-primary">{s.id}</span>
              <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted">{s.timing}</span>
            </div>
            <div className="text-[0.8125rem] text-ink leading-tight">{s.title}</div>
          </button>
        ))}
      </div>

      {/* Sim hint */}
      <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-[0.8125rem] text-ink-2 leading-relaxed">
        <div className="flex items-baseline gap-2 mb-1">
          <Badge tone="primary">{sim.id}</Badge>
          <span className="text-ink font-medium">{sim.title}</span>
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">{sim.who}</span>
        </div>
        {sim.hint}
        {sim.flags && sim.flags.length > 0 && (
          <div className="mt-1.5 text-[0.6875rem] text-ink-muted">
            Common flags: <span className="font-mono">{sim.flags.join(", ")}</span>
          </div>
        )}
      </div>

      {/* Team picker */}
      <div>
        <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Team
        </label>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink focus:outline-none focus:border-primary"
        >
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} — {t.name} (Hub {t.hubCode})
            </option>
          ))}
        </select>
      </div>

      {/* Deltas */}
      <div className="grid grid-cols-2 gap-3">
        <DeltaField label="Cash Δ ($M)" value={cashM} onChange={setCashM} hint="e.g. 80 for +$80M" />
        <DeltaField label="Brand Pts Δ" value={brandPts} onChange={setBrandPts} hint="±10 typical" />
        <DeltaField label="Ops Pts Δ" value={opsPts} onChange={setOpsPts} hint="±10 typical" />
        <DeltaField label="Loyalty Δ (%)" value={loyalty} onChange={setLoyalty} hint="±5 typical" />
      </div>

      {/* MVP per role */}
      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          MVP points per role
        </div>
        <div className="grid grid-cols-4 gap-2">
          <DeltaField label="CEO" value={mvpCEO} onChange={setMvpCEO} compact />
          <DeltaField label="CFO" value={mvpCFO} onChange={setMvpCFO} compact />
          <DeltaField label="CMO" value={mvpCMO} onChange={setMvpCMO} compact />
          <DeltaField label="CHRO" value={mvpCHRO} onChange={setMvpCHRO} compact />
        </div>
      </div>

      {/* Flags + notes */}
      <div>
        <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Set flags (comma-separated)
        </label>
        <Input
          value={setFlags}
          onChange={(e) => setSetFlags(e.target.value)}
          placeholder="e.g. global_brand, strong_labour_relations"
        />
        {sim.flags && (
          <div className="mt-1 flex flex-wrap gap-1">
            {sim.flags.map((f) => (
              <button
                key={f}
                onClick={() => setSetFlags((p) => (p ? `${p}, ${f}` : f))}
                className="text-[0.6875rem] rounded border border-line bg-surface-2 px-1.5 py-0.5 hover:bg-surface-hover font-mono"
              >
                + {f}
              </button>
            ))}
          </div>
        )}
      </div>

      <div>
        <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder={
            simId === "L4"
              ? "Log exact verbal commitments from the press conference."
              : simId === "L1"
                ? "Deal terms, dead-stop outcome, gov relief applied."
                : "Free-text context the platform should remember."
          }
          rows={3}
          className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink focus:outline-none focus:border-primary resize-y"
        />
      </div>

      <div className="flex justify-end pt-2 border-t border-line">
        <Button variant="primary" onClick={submit} disabled={!team}>
          Apply {simId} → {team?.name ?? "—"}
        </Button>
      </div>
    </div>
  );
}

function DeltaField({
  label, value, onChange, hint, compact = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  compact?: boolean;
}) {
  return (
    <div>
      <label className={cn(
        "block uppercase tracking-wider text-ink-muted font-semibold mb-1",
        compact ? "text-[0.5625rem]" : "text-[0.625rem]",
      )}>
        {label}
      </label>
      <Input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="tabular font-mono"
      />
      {hint && !compact && (
        <div className="text-[0.625rem] text-ink-muted mt-0.5">{hint}</div>
      )}
    </div>
  );
}
