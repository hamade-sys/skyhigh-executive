"use client";

/**
 * /games/new — comprehensive Create Game form.
 *
 * Per the V1 spec the host configures everything in one screen:
 *
 *   Game name           — short label shown on /lobby and the lobby
 *   Visibility          — Public (listed in /lobby) | Private (code only)
 *   Game Master         — toggle "I want to be the Game Master" (max 1
 *                          per game, or zero). GM gets the facilitator
 *                          console + admin overrides.
 *   Board Decisions     — on/off (separate from GM)
 *   Number of rounds    — 8 / 16 / 24 / 40 (default 40, full 10 yrs)
 *   Player slots        — list of seats, each marked Player or AI Bot,
 *                          AI gets a difficulty picker. Min 1, max 8.
 *
 * V3 deferred (spec from user, NOT shipped now):
 *   - Start year (1960-2015)        → affects aircraft availability
 *   - Round unit (quarters/months)
 *
 * On submit: POST /api/games/create with the assembled config, then
 * route to /games/[id]/lobby. The host-side onboarding (brand your
 * airline) happens AFTER seat-claim in the lobby.
 */

import Link from "next/link";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Loader2, Lock, Globe2, Sparkles,
  CheckSquare, Plus, Trash2, User, Bot,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { isMultiplayerAvailable } from "@/lib/supabase/browser";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";

type Visibility = "public" | "private";
type Difficulty = "easy" | "medium" | "hard";
type SeatType = "human" | "bot";

interface SlotDraft {
  id: string;
  type: SeatType;
  difficulty?: Difficulty;
}

const ROUND_PRESETS = [
  { value: 8, label: "8 rounds", sub: "2 years · quick session" },
  { value: 16, label: "16 rounds", sub: "4 years · half campaign" },
  { value: 24, label: "24 rounds", sub: "6 years · medium" },
  { value: 40, label: "40 rounds", sub: "10 years · full decade" },
] as const;

function mkSlotId() {
  return `slot-${Math.random().toString(36).slice(2, 8)}`;
}

// Parent component — does ONLY the auth gate. No state hooks live
// here, so the rules-of-hooks early-return pattern is safe. Once
// `user` is non-null, render <CreateGameForm/> which owns all the
// form state. This split was forced by react-hooks/rules-of-hooks:
// the previous shape called `useState` AFTER the auth-loading early
// return, so the hook order changed when auth resolved.
export default function CreateGamePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace("/login?next=/games/new");
    }
  }, [authLoading, user, router]);

  if (authLoading || !user) {
    return <div className="flex-1 bg-slate-50" aria-hidden />;
  }
  return <CreateGameForm />;
}

function CreateGameForm() {
  const router = useRouter();
  // `user` is guaranteed non-null here because <CreateGameForm/> only
  // mounts after the parent's auth gate clears. Re-reading useAuth is
  // cheap (context lookup) and keeps the existing code body unchanged.
  const { user } = useAuth();
  const mpAvailable = isMultiplayerAvailable();

  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [beGameMaster, setBeGameMaster] = useState(false);
  const [boardDecisionsEnabled, setBoardDecisionsEnabled] = useState(false);
  const [totalRounds, setTotalRounds] = useState(40);
  // Default: 2 human slots, no bots. Users can add AI bots manually if wanted.
  const [slots, setSlots] = useState<SlotDraft[]>([
    { id: mkSlotId(), type: "human" },
    { id: mkSlotId(), type: "human" },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // GM-toggle nudge for the Board Decisions default. The convention:
  // turning GM ON usually means "I want a facilitated game with all
  // the decisions surfaced" — so we default Board Decisions to ON
  // unless the user explicitly turned it off afterwards. Done in
  // the click handler (not a useEffect) per React 19 guidance —
  // useEffect cascades would re-render twice on every toggle.
  function toggleGameMaster() {
    setBeGameMaster((wasOn) => {
      const nowOn = !wasOn;
      if (nowOn) setBoardDecisionsEnabled(true);
      return nowOn;
    });
  }

  function addSlot(type: SeatType) {
    if (slots.length >= 8) return;
    setSlots([
      ...slots,
      type === "bot"
        ? { id: mkSlotId(), type, difficulty: "medium" }
        : { id: mkSlotId(), type },
    ]);
  }

  function removeSlot(id: string) {
    if (slots.length <= 1) return;
    setSlots(slots.filter((s) => s.id !== id));
  }

  function updateSlot(id: string, patch: Partial<SlotDraft>) {
    setSlots(slots.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  async function handleSubmit() {
    setError(null);
    if (name.trim().length === 0) {
      setError("Game name is required.");
      return;
    }
    if (slots.length < 1) {
      setError("At least one seat is required.");
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
          maxTeams: slots.length,
          totalRounds,
          boardDecisionsEnabled,
          beGameMaster,
          plannedSeats: slots,
          hostSessionId: user.id,
          // Initial state placeholder — the host's airline-branding
          // happens after seat-claim. For now we ship a minimal
          // skeleton; the engine fills it in at start.
          initialState: {
            phase: "idle",
            currentQuarter: 1,
            totalRounds,
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

  const humanCount = slots.filter((s) => s.type === "human").length;
  const botCount = slots.filter((s) => s.type === "bot").length;

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
          Configure the seats, mode, and length. Once you create, you&rsquo;ll
          land in the game lobby with a code to share.
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
            <p className="text-xs text-slate-400 mt-3">
              <span className="text-slate-500">V3 coming:</span> start year
              picker (1960-2015) and round unit (quarter/month).
            </p>
          </Field>

          {/* 6. Player slots */}
          <Field
            label="Player slots"
            hint={`${slots.length} seat${slots.length === 1 ? "" : "s"} · ${humanCount} human · ${botCount} bot`}
          >
            <div className="space-y-2">
              {slots.map((slot, i) => (
                <SlotRow
                  key={slot.id}
                  index={i + 1}
                  slot={slot}
                  canRemove={slots.length > 1}
                  onUpdate={(patch) => updateSlot(slot.id, patch)}
                  onRemove={() => removeSlot(slot.id)}
                />
              ))}
            </div>
            {slots.length < 8 && (
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => addSlot("human")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <User className="w-3 h-3" />
                  Add player
                </button>
                <button
                  type="button"
                  onClick={() => addSlot("bot")}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-slate-200 hover:border-slate-300 bg-white text-xs font-semibold text-slate-700 transition-colors"
                >
                  <Plus className="w-3 h-3" />
                  <Bot className="w-3 h-3" />
                  Add AI bot
                </button>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-3">
              Up to 8 seats. Human seats stay open until claimed; AI bots
              auto-fill at start.
            </p>
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

function SlotRow({
  index, slot, canRemove, onUpdate, onRemove,
}: {
  index: number;
  slot: SlotDraft;
  canRemove: boolean;
  onUpdate: (patch: Partial<SlotDraft>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 flex items-center gap-3">
      <div className="shrink-0 w-7 h-7 rounded-lg bg-slate-100 text-slate-700 font-mono text-xs font-bold tabular flex items-center justify-center">
        {index}
      </div>

      {/* Type selector */}
      <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
        <SegBtn
          active={slot.type === "human"}
          onClick={() => onUpdate({ type: "human", difficulty: undefined })}
          icon={<User className="w-3.5 h-3.5" />}
          label="Player"
        />
        <SegBtn
          active={slot.type === "bot"}
          onClick={() => onUpdate({ type: "bot", difficulty: slot.difficulty ?? "medium" })}
          icon={<Bot className="w-3.5 h-3.5" />}
          label="AI bot"
        />
      </div>

      {/* Difficulty (bot only) */}
      {slot.type === "bot" && (
        <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <SegBtn
              key={d}
              active={slot.difficulty === d}
              onClick={() => onUpdate({ difficulty: d })}
              label={d[0].toUpperCase() + d.slice(1)}
            />
          ))}
        </div>
      )}

      {slot.type === "human" && (
        <div className="hidden sm:block text-xs text-slate-400 italic flex-1">
          Open seat — anyone can claim
        </div>
      )}

      {/* Remove */}
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove seat ${index}`}
          className="ml-auto shrink-0 w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-rose-600 flex items-center justify-center"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

function SegBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors " +
        (active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-900")
      }
    >
      {icon}
      {label}
    </button>
  );
}
