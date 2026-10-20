"use client";

/**
 * Game settings: mode, teams, tools, rules and clocks. Used in two
 * places — the board editor (the board's saved defaults) and the game
 * setup screen (this game only).
 */

import { Check, Plus, Swords, Trash2, Zap } from "lucide-react";
import { cn } from "@/lib/cn";
import { LIMITS, MAX_TEAMS, SUGGESTED_TEAM_NAMES, TEAM_COLORS, TOOL_INFO } from "@/lib/trivia/content";
import { TOOL_KINDS, type GameMode, type TeamDef, type TriviaSettings } from "@/lib/trivia/types";
import { TeamBadge, ToolIcon } from "@/components/trivia/Teams";
import { Stepper, Toggle, inputClass } from "./ui";

export function SettingsForm({ value, onChange, idPrefix = "s" }: { value: TriviaSettings; onChange: (next: TriviaSettings) => void; idPrefix?: string }) {
  const set = <K extends keyof TriviaSettings>(key: K, v: TriviaSettings[K]) => onChange({ ...value, [key]: v });
  const competitive = value.mode === "competitive";

  return (
    <div className="space-y-8">
      <section aria-labelledby={`${idPrefix}-mode`}>
        <h3 id={`${idPrefix}-mode`} className="mb-3 t-font text-base font-extrabold text-[#3a3a3a]">
          Game mode
        </h3>
        <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-labelledby={`${idPrefix}-mode`}>
          <ModeCard
            mode="traditional"
            selected={value.mode === "traditional"}
            onSelect={() => set("mode", "traditional")}
            title="Traditional"
            icon={<Zap className="h-5 w-5" />}
            body="Open buzzers — every team races. A right answer wins control of the board. Daily Doubles in play."
          />
          <ModeCard
            mode="competitive"
            selected={competitive}
            onSelect={() => set("mode", "competitive")}
            title="Competitive"
            icon={<Swords className="h-5 w-5" />}
            body="Teams take turns, and each brings tools: Steal, Block, Swap, Skip, Double Down and Hints."
          />
        </div>
      </section>

      <section aria-labelledby={`${idPrefix}-teams`}>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 id={`${idPrefix}-teams`} className="t-font text-base font-extrabold text-[#3a3a3a]">
            Teams
          </h3>
          <span className="text-sm text-slate-500">
            {value.teams.length} of {MAX_TEAMS}
          </span>
        </div>
        <TeamsList teams={value.teams} onChange={(teams) => set("teams", teams)} idPrefix={idPrefix} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="How players join a team">
          {(
            [
              ["choose", "Players choose", "Each phone picks a team after joining."],
              ["auto", "Assign automatically", "New players fill the smallest team."],
            ] as const
          ).map(([key, title, body]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={value.teamPick === key}
              onClick={() => set("teamPick", key)}
              className={cn(
                "rounded-xl border px-4 py-3 text-left transition-colors",
                value.teamPick === key ? "border-[#02797F] bg-[#02797F]/[0.06]" : "border-slate-200 hover:border-slate-300",
              )}
            >
              <span className="block text-sm font-semibold text-slate-900">{title}</span>
              <span className="block text-sm text-slate-500">{body}</span>
            </button>
          ))}
        </div>
      </section>

      {competitive && (
        <section aria-labelledby={`${idPrefix}-tools`}>
          <h3 id={`${idPrefix}-tools`} className="mb-1 t-font text-base font-extrabold text-[#3a3a3a]">
            Tools per team
          </h3>
          <p className="mb-3 text-sm text-slate-500">How many of each tool every team starts with. Set a tool to 0 to leave it out.</p>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            {TOOL_KINDS.map((k) => (
              <li key={k} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-lg", value.tools[k] > 0 ? "bg-[#02797F]/10 text-[#02797F]" : "bg-slate-100 text-slate-400")}>
                  <ToolIcon tool={k} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-900">{TOOL_INFO[k].label}</span>
                  <span className="block text-sm text-slate-500">{k === "swap" ? `Hand your question to another team — they get ${value.swapAnswerSec} seconds, then it comes back to you.` : TOOL_INFO[k].blurb}</span>
                </span>
                <Stepper value={value.tools[k]} min={0} max={5} onChange={(v) => set("tools", { ...value.tools, [k]: v })} label={`${TOOL_INFO[k].label} per team`} suffix="×" />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby={`${idPrefix}-rules`}>
        <h3 id={`${idPrefix}-rules`} className="mb-1 t-font text-base font-extrabold text-[#3a3a3a]">
          Rules and clocks
        </h3>
        <div className="divide-y divide-slate-100">
          <Toggle
            id={`${idPrefix}-neg`}
            checked={value.negativeScoring}
            onChange={(v) => set("negativeScoring", v)}
            label="Wrong answers lose points"
            description={competitive ? "A missed Double Down always costs the question's value." : "Jeopardy rules. A missed Daily Double always costs the wager."}
          />
          {competitive ? (
            <>
              <ClockRow label="Tools window" description="Time to steal, block, swap or skip before the answer clock starts. Off = the host starts it." value={value.toolWindowSec} min={0} max={60} onChange={(v) => set("toolWindowSec", v)} />
              <ClockRow label="Swap answer time" description="Seconds the team receiving a Swap gets." value={value.swapAnswerSec} min={5} max={60} onChange={(v) => set("swapAnswerSec", v)} />
              <Toggle id={`${idPrefix}-rebound`} checked={value.reboundOnMiss} onChange={(v) => set("reboundOnMiss", v)} label="Rebounds" description="After a miss, the other teams can buzz in for it." />
            </>
          ) : (
            <>
              <Toggle id={`${idPrefix}-pick`} checked={value.playersPick} onChange={(v) => set("playersPick", v)} label="Teams pick on their phones" description="The team in control taps the next question. The host can always pick for them." />
              <Toggle id={`${idPrefix}-auto`} checked={value.autoOpenBuzzers} onChange={(v) => set("autoOpenBuzzers", v)} label="Open buzzers straight away" description="For remote play, where nobody reads the question aloud first." />
            </>
          )}
          <ClockRow label="Buzz window" description="How long buzzers stay open. Off = until the host moves on." value={value.buzzWindowSec} min={0} max={60} onChange={(v) => set("buzzWindowSec", v)} />
          <ClockRow label="Answer time" description="Clock on screen after a team takes the question. Off = no clock." value={value.answerTimeSec} min={0} max={60} onChange={(v) => set("answerTimeSec", v)} />
          <ClockRow label="Final Trivia writing time" value={value.finalTimeSec} min={10} max={180} step={5} onChange={(v) => set("finalTimeSec", v)} />
          <Toggle id={`${idPrefix}-phrase`} checked={value.phraseAsQuestion} onChange={(v) => set("phraseAsQuestion", v)} label="Answer as a question" description="Remind teams to say “What is…?”, Jeopardy-style." />
        </div>
      </section>
    </div>
  );
}

function ModeCard({ selected, onSelect, title, icon, body }: { mode: GameMode; selected: boolean; onSelect: () => void; title: string; icon: React.ReactNode; body: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative rounded-2xl border-2 p-4 text-left transition-colors",
        selected ? "border-[#02797F] bg-[#02797F]/[0.05]" : "border-slate-200 hover:border-slate-300",
      )}
    >
      <span className={cn("mb-2 inline-grid h-9 w-9 place-items-center rounded-lg", selected ? "bg-[#02797F] text-white" : "bg-slate-100 text-slate-600")}>{icon}</span>
      <span className="block t-font text-lg font-extrabold text-slate-900">{title}</span>
      <span className="mt-1 block text-sm text-slate-600">{body}</span>
      {selected && <Check className="absolute right-3 top-3 h-5 w-5 text-[#02797F]" aria-hidden />}
    </button>
  );
}

function ClockRow({ label, description, value, min, max, step = 1, onChange }: { label: string; description?: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-800">{label}</p>
        {description && <p className="text-sm text-slate-500">{description}</p>}
      </div>
      <Stepper value={value} onChange={onChange} min={min} max={max} step={step} label={label} suffix="s" />
    </div>
  );
}

export function TeamsList({ teams, onChange, idPrefix }: { teams: TeamDef[]; onChange: (t: TeamDef[]) => void; idPrefix: string }) {
  const used = new Set(teams.map((t) => t.color.toUpperCase()));
  const names = teams.map((t) => t.name.trim().toLowerCase());
  return (
    <ul className="space-y-2.5">
      {teams.map((t, i) => {
        const duplicate = t.name.trim() && names.filter((n) => n === t.name.trim().toLowerCase()).length > 1;
        return (
          <li key={t.id} className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-center gap-2.5">
              <TeamBadge name={t.name || "?"} color={t.color} size={36} />
              <label htmlFor={`${idPrefix}-team-${t.id}`} className="sr-only">
                Team {i + 1} name
              </label>
              <input
                id={`${idPrefix}-team-${t.id}`}
                value={t.name}
                maxLength={LIMITS.teamName}
                onChange={(e) => onChange(teams.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                placeholder={`Team ${i + 1}`}
                aria-invalid={Boolean(duplicate) || !t.name.trim()}
                className={cn(inputClass, "t-font font-bold", (duplicate || !t.name.trim()) && "border-rose-300")}
              />
              {teams.length > 1 && (
                <button
                  type="button"
                  onClick={() => onChange(teams.filter((x) => x.id !== t.id))}
                  aria-label={`Remove ${t.name || `team ${i + 1}`}`}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
            {(duplicate || !t.name.trim()) && <p className="mt-1.5 text-xs text-rose-600">{duplicate ? "Two teams have this name." : "Give the team a name."}</p>}
            <div className="mt-2.5 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t.name || `Team ${i + 1}`} colour`}>
              {TEAM_COLORS.map((c) => {
                const selected = c.hex.toUpperCase() === t.color.toUpperCase();
                const taken = !selected && used.has(c.hex.toUpperCase());
                return (
                  <button
                    key={c.hex}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={`${c.name}${taken ? " (another team has it)" : ""}`}
                    title={c.name}
                    disabled={taken}
                    onClick={() => onChange(teams.map((x) => (x.id === t.id ? { ...x, color: c.hex } : x)))}
                    className={cn("relative h-8 w-8 rounded-full ring-1 ring-black/10 transition-transform", selected && "ring-2 ring-slate-900 ring-offset-2", taken && "opacity-20")}
                    style={{ background: c.hex }}
                  >
                    {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-[#0b1d20]" aria-hidden />}
                  </button>
                );
              })}
            </div>
          </li>
        );
      })}
      {teams.length < MAX_TEAMS && (
        <li>
          <button
            type="button"
            onClick={() => {
              const usedNames = new Set(teams.map((t) => t.name.toLowerCase()));
              const name = SUGGESTED_TEAM_NAMES.find((n) => !usedNames.has(n.toLowerCase())) ?? `Team ${teams.length + 1}`;
              const color = TEAM_COLORS.find((c) => !used.has(c.hex.toUpperCase()))?.hex ?? TEAM_COLORS[0].hex;
              const ids = new Set(teams.map((t) => t.id));
              let n = teams.length + 1;
              while (ids.has(`t${n}`)) n++;
              onChange([...teams, { id: `t${n}`, name, color }]);
            }}
            className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-[#02797F] hover:text-[#02797F]"
          >
            <Plus className="h-4 w-4" /> Add a team
          </button>
        </li>
      )}
    </ul>
  );
}

/** Problems that would make the server reject these settings. */
export function settingsProblem(s: TriviaSettings): string | null {
  const names = s.teams.map((t) => t.name.trim().toLowerCase());
  if (s.teams.length === 0) return "Add at least one team.";
  if (names.some((n) => !n)) return "Every team needs a name.";
  if (new Set(names).size !== names.length) return "Two teams have the same name.";
  return null;
}
