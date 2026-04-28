"use client";

/**
 * /games/new — host creates a new game.
 *
 * Two-step flow:
 *   1. Pick mode + visibility + max teams + game name
 *   2. Onboarding (existing /onboarding shape) to seed the host's
 *      starting team — same team-factory as solo, so the host walks
 *      into the lobby with a complete team. The other seats stay
 *      open until joiners claim them.
 *
 * Step 2 is reached via `/onboarding?gameId=<new-id>` — the
 * onboarding page already produces a complete starting position;
 * we hand off via query string and the onboarding "Start game"
 * button branches on the param to call /api/games/create instead
 * of seeding the local store.
 *
 * (That branching is wired up later. For Step 4 of the rollout we
 * land the form + handoff stub; the onboarding-side branch lands
 * with Step 5.)
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Globe2, Lock, Sparkles, Users, ChevronRight,
} from "lucide-react";

type Mode = "facilitated" | "self_guided";
type Visibility = "public" | "private";

export default function NewGamePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("self_guided");
  // Default visibility tracks the user's hint: facilitated → private,
  // self-guided → public. They can flip independently.
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [maxTeams, setMaxTeams] = useState(6);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleModeChange(next: Mode) {
    setMode(next);
    // If they hadn't manually picked a visibility, follow the default.
    setVisibility(next === "facilitated" ? "private" : "public");
  }

  function handleNext() {
    setError(null);
    if (name.trim().length === 0) {
      setError("Game name is required.");
      return;
    }
    setSubmitting(true);
    // Hand off to onboarding, carrying the lobby config in query
    // params. Onboarding completes the host's team setup, then
    // POSTs /api/games/create with the assembled state. Step 5 of
    // the rollout wires the actual handoff; for now we route to
    // onboarding and surface a coming-soon banner if Supabase env
    // is missing.
    const params = new URLSearchParams({
      gameName: name.trim().slice(0, 80),
      gameMode: mode,
      gameVisibility: visibility,
      gameMaxTeams: String(maxTeams),
    });
    router.push(`/onboarding?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to lobby
          </Link>
          <span className="text-xs text-slate-400 tabular">Step 1 of 2</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-2">
          Create game
        </p>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-2">
          Set up your run
        </h1>
        <p className="text-sm text-slate-500 mb-10 max-w-xl">
          Configure the lobby first. You&rsquo;ll fill in your airline brand
          (doctrine, hub, sliders) on the next step — same as solo.
        </p>

        <div className="space-y-8">
          {/* Game name */}
          <Field label="Game name" required>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ERTH Cohort 12 — Spring '26"
              maxLength={80}
              className="w-full px-4 py-2.5 rounded-lg border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
            />
            <p className="text-xs text-slate-400 mt-2">
              Shown in the lobby and the facilitator console.
            </p>
          </Field>

          {/* Mode */}
          <Field label="Mode">
            <div className="grid sm:grid-cols-2 gap-3">
              <ChoiceCard
                active={mode === "self_guided"}
                onClick={() => handleModeChange("self_guided")}
                icon={<Globe2 className="w-5 h-5" />}
                title="Self-guided"
                accent="emerald"
                description="Players advance the quarter once everyone is ready. Board Decisions disabled."
              />
              <ChoiceCard
                active={mode === "facilitated"}
                onClick={() => handleModeChange("facilitated")}
                icon={<Sparkles className="w-5 h-5" />}
                title="Facilitated"
                accent="violet"
                description="A facilitator drives quarter close + Board Decisions. Defaults to private."
              />
            </div>
          </Field>

          {/* Visibility */}
          <Field label="Visibility">
            <div className="grid sm:grid-cols-2 gap-3">
              <ChoiceCard
                active={visibility === "public"}
                onClick={() => setVisibility("public")}
                icon={<Globe2 className="w-5 h-5" />}
                title="Public"
                accent="cyan"
                description="Listed in the public lobby. Anyone can join until you lock or fill it."
              />
              <ChoiceCard
                active={visibility === "private"}
                onClick={() => setVisibility("private")}
                icon={<Lock className="w-5 h-5" />}
                title="Private"
                accent="slate"
                description="Hidden from /lobby. Players join with a 4-digit code you share."
              />
            </div>
          </Field>

          {/* Max teams */}
          <Field label="Max teams" hint={`${maxTeams} teams (humans + bots combined)`}>
            <div className="flex items-center gap-4">
              <input
                type="range"
                min={1}
                max={12}
                value={maxTeams}
                onChange={(e) => setMaxTeams(Number(e.target.value))}
                className="flex-1 accent-cyan-600"
              />
              <div className="w-16 text-center font-mono text-base font-semibold text-slate-900 tabular bg-white border border-slate-200 rounded-lg py-1.5">
                {maxTeams}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2 inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              Empty seats stay open in the lobby until claimed or filled by bots.
            </p>
          </Field>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200">
            <Link
              href="/lobby"
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              onClick={handleNext}
              disabled={submitting}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
            >
              Next: brand your airline
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function Field({
  label, required, hint, children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2">
        <label className="text-sm font-semibold text-slate-900">
          {label}
          {required && <span className="text-rose-500 ml-1" aria-label="required">*</span>}
        </label>
        {hint && <span className="text-xs text-slate-400 tabular">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ChoiceCard({
  active, onClick, icon, title, description, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "cyan" | "violet" | "emerald" | "slate";
}) {
  const accentRing = {
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  }[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "text-left rounded-xl border p-4 transition-all " +
        (active
          ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white hover:border-slate-300")
      }
    >
      <div className="flex items-start gap-3">
        <div className={"shrink-0 w-9 h-9 rounded-lg ring-4 flex items-center justify-center " + accentRing}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-slate-900">{title}</span>
            {active && <ChevronRight className="w-4 h-4 text-slate-900" />}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}
