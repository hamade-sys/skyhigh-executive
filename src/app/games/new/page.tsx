"use client";

/**
 * /games/new — Create Game form.
 *
 * Configures: game name, visibility, GM role, board decisions,
 * number of rounds, and seat count. Human/bot assignment and
 * difficulty are set per-seat in the pre-game lobby, not here.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Loader2, Lock, Globe2, Sparkles,
  CheckSquare, Minus, Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isMultiplayerAvailable } from "@/lib/supabase/browser";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

type Visibility = "public" | "private";

const ROUND_PRESETS = [
  { value: 8,  label: "8 rounds",  sub: "2 years · quick session" },
  { value: 16, label: "16 rounds", sub: "4 years · half campaign" },
  { value: 24, label: "24 rounds", sub: "6 years · medium" },
  { value: 40, label: "40 rounds", sub: "10 years · full decade" },
] as const;

/** Per-quarter timer presets (seconds). 0 = no timer. */
const QUARTER_TIMER_PRESETS = [
  { value: 300,  label: "5 min",  sub: "Sprint" },
  { value: 600,  label: "10 min", sub: "Quick" },
  { value: 900,  label: "15 min", sub: "Standard" },
  { value: 1800, label: "30 min", sub: "Relaxed" },
  { value: 3600, label: "60 min", sub: "Workshop" },
  { value: 0,    label: "Off",    sub: "GM closes" },
] as const;

export default function CreateGamePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/games/new");
      return;
    }
    if (!authLoading && user?.is_anonymous) {
      router.replace("/login?next=/games/new&reason=host");
    }
  }, [authLoading, user, router]);

  if (authLoading || !user || user.is_anonymous) {
    return <div className="flex-1 bg-slate-50" aria-hidden />;
  }
  return <CreateGameForm />;
}

function CreateGameForm() {
  const router = useRouter();
  const { user } = useAuth();
  const mpAvailable = isMultiplayerAvailable();

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [beGameMaster, setBeGameMaster] = useState(false);
  const [boardDecisionsEnabled, setBoardDecisionsEnabled] = useState(false);
  const [totalRounds, setTotalRounds] = useState(40);
  // Just a seat count — human/bot config is done in the pre-game lobby
  const [seatCount, setSeatCount] = useState(2);
  // Per-quarter timer in SECONDS. 0 = no timer (game master closes
  // manually). Default 30 minutes for a relaxed pace; presets cover
  // 5/10/15/30/60 minutes for typical workshop tempos. When set,
  // self-guided games auto-close the quarter when the timer hits 0
  // — that's how a non-facilitator game terminates instead of
  // running forever.
  const [quarterTimerSeconds, setQuarterTimerSeconds] = useState(1800);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleGameMaster() {
    setBeGameMaster((wasOn) => {
      const nowOn = !wasOn;
      if (nowOn) setBoardDecisionsEnabled(true);
      return nowOn;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (name.trim().length === 0) {
      setError("Game name is required.");
      return;
    }
    if (!user?.id) {
      setError("Not signed in — please refresh and sign in first.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/games/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          mode: beGameMaster ? "facilitated" : "self_guided",
          visibility,
          maxTeams: seatCount,
          totalRounds,
          quarterTimerSeconds,
          boardDecisionsEnabled,
          beGameMaster,
          plannedSeats: [],   // all human by default — lobby configures each seat
          hostSessionId: user.id,
          initialState: {
            phase: "idle",
            currentQuarter: 1,
            totalRounds,
            quarterTimerSeconds,
            teams: [],
            session: null,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to create game.");
        setSubmitting(false);
        return;
      }
      router.push(`/games/${json.game.id}/lobby`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-12 lg:py-16">
        <Link
          href="/lobby"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to lobby
        </Link>

        <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-2">
          Create game
        </p>
        <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-slate-900 mb-2">
          Set up your run.
        </h1>
        <p className="text-sm text-slate-500 mb-10 max-w-xl">
          Configure the name, mode, and length. Once you create, you&rsquo;ll
          land in the lobby — that&rsquo;s where you set each seat to a human player
          or an AI bot.
        </p>

        {!mpAvailable && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-8">
            <p className="text-sm font-semibold text-amber-900 mb-1">
              Multiplayer not configured
            </p>
            <p className="text-xs text-amber-800 leading-relaxed">
              The lobby system needs Supabase env vars to work. You can still{" "}
              <Link href="/onboarding" className="underline font-medium">
                play solo offline
              </Link>{" "}
              until that&rsquo;s set up.
            </p>
          </div>
        )}

        <div className="space-y-8">
          {/* 1. Game name */}
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
              Shown in the public lobby and to anyone who joins.
            </p>
          </Field>

          {/* 2. Visibility */}
          <Field label="Visibility">
            <div className="grid sm:grid-cols-2 gap-3">
              <ChoiceCard
                active={visibility === "public"}
                onClick={() => setVisibility("public")}
                icon={<Globe2 className="w-5 h-5" />}
                title="Public"
                accent="cyan"
                description="Listed in the public lobby. Anyone can browse and join an open seat."
              />
              <ChoiceCard
                active={visibility === "private"}
                onClick={() => setVisibility("private")}
                icon={<Lock className="w-5 h-5" />}
                title="Private"
                accent="violet"
                description="Hidden from /lobby. We'll generate a 4-digit code you share with players."
              />
            </div>
          </Field>

          {/* 3. Game Master toggle */}
          <Field label="Game Master role">
            <Toggle
              active={beGameMaster}
              onClick={toggleGameMaster}
              icon={<Sparkles className="w-5 h-5" />}
              title="Yes, I'll be the Game Master"
              description="One Game Master per game (or none). Drives quarter close, runs board decisions, has admin overrides. Only the creator can claim this role."
              accent="violet"
            />
            {!beGameMaster && (
              <p className="text-xs text-slate-400 mt-2">
                No Game Master · the game runs self-driven. Quarter advances
                automatically once every player marks ready.
              </p>
            )}
          </Field>

          {/* 4. Board Decisions */}
          <Field label="Board decisions">
            <Toggle
              active={boardDecisionsEnabled}
              onClick={() => setBoardDecisionsEnabled((v) => !v)}
              icon={<CheckSquare className="w-5 h-5" />}
              title={boardDecisionsEnabled ? "Enabled" : "Disabled"}
              description="The 18 boardroom scenarios (cyber breach, fuel hedging, government deals…). Best with a Game Master to facilitate; can run without."
              accent="emerald"
            />
          </Field>

          {/* 5. Number of rounds */}
          <Field
            label="Number of rounds"
            hint={`${totalRounds} rounds · ${(totalRounds / 4).toFixed(0)} years`}
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {ROUND_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setTotalRounds(p.value)}
                  className={
                    "rounded-xl border p-3 text-left transition-all " +
                    (totalRounds === p.value
                      ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
                      : "border-slate-200 bg-white hover:border-slate-300")
                  }
                >
                  <div className="text-base font-display font-bold text-slate-900">
                    {p.value}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                    {p.sub}
                  </div>
                </button>
              ))}
            </div>
          </Field>

          {/* 5b. Quarter timer — drives auto-advance in self-guided
                games + bounds total game length. 0 = no timer (only
                makes sense with a Game Master who closes manually). */}
          <Field
            label="Quarter timer"
            hint={
              quarterTimerSeconds === 0
                ? "No timer · Game Master closes each quarter manually"
                : `${Math.round(quarterTimerSeconds / 60)} min per quarter · max game ${Math.round((quarterTimerSeconds * totalRounds) / 60)} min`
            }
          >
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2.5">
              {QUARTER_TIMER_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setQuarterTimerSeconds(p.value)}
                  className={
                    "rounded-xl border p-3 text-left transition-all " +
                    (quarterTimerSeconds === p.value
                      ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
                      : "border-slate-200 bg-white hover:border-slate-300")
                  }
                >
                  <div className="text-base font-display font-bold text-slate-900">
                    {p.label}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-0.5">
                    {p.sub}
                  </div>
                </button>
              ))}
            </div>
            {!beGameMaster && quarterTimerSeconds === 0 && (
              <p className="text-xs text-amber-700 mt-2">
                Heads up: with no Game Master and no timer, the only
                way to advance the quarter is for every human player
                to mark ready. Pick a timer or enable Game Master to
                avoid stalling.
              </p>
            )}
          </Field>

          {/* 6. Number of seats */}
          <Field
            label="Number of seats"
            hint={
              `${seatCount} competing airline seat${seatCount === 1 ? "" : "s"}`
              + (beGameMaster ? " · Game Master not counted" : "")
            }
          >
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => setSeatCount((n) => Math.max(1, n - 1))}
                disabled={seatCount <= 1}
                aria-label="Remove a seat"
                className="w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:border-slate-300 disabled:opacity-40 transition-colors"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-8 text-center font-display text-2xl font-bold text-slate-900 tabular">
                {seatCount}
              </span>
              <button
                type="button"
                onClick={() => setSeatCount((n) => Math.min(8, n + 1))}
                disabled={seatCount >= 8}
                aria-label="Add a seat"
                className="w-10 h-10 rounded-full border border-slate-200 bg-white text-slate-700 flex items-center justify-center hover:border-slate-300 disabled:opacity-40 transition-colors"
              >
                <Plus className="w-4 h-4" />
              </button>
              <p className="text-xs text-slate-400">
                1–8 competing airlines. In the lobby you&rsquo;ll assign each
                seat to a human player or an AI bot and pick the difficulty.
                {beGameMaster ? " Your Game Master role is separate and does not use one of these seats." : ""}
              </p>
            </div>
          </Field>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 p-4">
              <p className="text-sm font-medium text-rose-700">{error}</p>
            </div>
          )}

          {/* Submit */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-slate-200">
            <Link
              href="/lobby"
              className="px-4 py-2.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !mpAvailable || !user?.id}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold disabled:opacity-50 transition-colors"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  Create game
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
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
      <div className="flex items-baseline justify-between mb-2.5">
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
  accent: "cyan" | "violet" | "emerald" | "amber";
}) {
  const accentRing = {
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
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
        <div className={`shrink-0 w-9 h-9 rounded-lg ring-4 flex items-center justify-center ${accentRing}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-slate-900 mb-1">{title}</div>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}

function Toggle({
  active, onClick, icon, title, description, accent,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "violet" | "emerald";
}) {
  const accentRing = active
    ? accent === "violet"
      ? "bg-violet-100 text-violet-700 ring-violet-200"
      : "bg-emerald-100 text-emerald-700 ring-emerald-200"
    : "bg-slate-100 text-slate-400 ring-slate-200";
  return (
    <button
      type="button"
      onClick={onClick}
      role="switch"
      aria-checked={active}
      className={
        "w-full text-left rounded-xl border p-4 transition-all " +
        (active
          ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
          : "border-slate-200 bg-white hover:border-slate-300")
      }
    >
      <div className="flex items-start gap-3">
        <div className={`shrink-0 w-9 h-9 rounded-lg ring-4 flex items-center justify-center transition-colors ${accentRing}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <span className="text-sm font-semibold text-slate-900">{title}</span>
            <span
              className={
                "shrink-0 inline-block w-9 h-5 rounded-full transition-colors relative " +
                (active ? "bg-slate-900" : "bg-slate-200")
              }
            >
              <span
                className={
                  "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform " +
                  (active ? "translate-x-4" : "translate-x-0")
                }
              />
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">{description}</p>
        </div>
      </div>
    </button>
  );
}
