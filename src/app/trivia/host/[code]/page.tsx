"use client";

/**
 * /trivia/host/[code] — the host's control room.
 *
 * Shows everything, answers and hints included, so it belongs on the
 * host's laptop — share /trivia/display/[code] on the projector
 * instead. "Hide answers" blurs them for the moments this screen is
 * visible.
 *
 * The host token comes from (in order): this browser's storage, a
 * co-host link (#k=…), or the server for the signed-in owner.
 * Keyboard: Space = next step, C = correct, W = wrong, R = reveal,
 * B = back to board, H = hide answers.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Lightbulb,
  Loader2,
  Lock,
  LockOpen,
  Minus,
  Monitor,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  UserX,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { findCell, MAX_TEAMS, SUGGESTED_TEAM_NAMES, TEAM_COLORS, TOOL_INFO, LIMITS } from "@/lib/trivia/content";
import { api, ApiError, errorMessage } from "@/lib/trivia/client/api";
import { getPref, hostStore, setPref } from "@/lib/trivia/client/storage";
import { useCountdown, useTriviaRoom } from "@/lib/trivia/client/useRoom";
import { TOOL_KINDS, type HostAction, type TeamDef, type ToolKind } from "@/lib/trivia/types";
import type { TriviaView, ViewTeam } from "@/lib/trivia/views";
import { useAuth } from "@/lib/auth-context";
import { TriviaBoard } from "@/components/trivia/TriviaBoard";
import { Wordmark } from "@/components/trivia/Wordmark";
import { CountdownBar, CountdownRing } from "@/components/trivia/Countdown";
import { formatScore } from "@/components/trivia/PlayerChip";
import { TeamBadge, ToolCounts, ToolIcon } from "@/components/trivia/Teams";

type TokenState = { kind: "loading" } | { kind: "ready"; token: string } | { kind: "signin" } | { kind: "denied"; message: string };
type Run = (a: HostAction) => Promise<void>;

export default function HostPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeRoomCode(params?.code ?? "");
  const { user, loading: authLoading } = useAuth();
  const [tokenState, setTokenState] = useState<TokenState>({ kind: "loading" });

  const fetchToken = useCallback(async () => {
    try {
      const res = await api<{ hostToken: string; roomId: string }>(`/api/trivia/rooms/${code}/host-token`);
      hostStore.set(code, { roomId: res.roomId, token: res.hostToken });
      setTokenState({ kind: "ready", token: res.hostToken });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setTokenState({ kind: "signin" });
      else setTokenState({ kind: "denied", message: errorMessage(err) });
    }
  }, [code]);

  useEffect(() => {
    if (!isRoomCode(code)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTokenState({ kind: "denied", message: "That isn't a room code." });
      return;
    }
    // Co-host link: /trivia/host/CODE#k=<token>
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const shared = hash.get("k");
    if (shared) {
      hostStore.set(code, { roomId: null, token: shared });
      window.history.replaceState(null, "", window.location.pathname);
      setTokenState({ kind: "ready", token: shared });
      return;
    }
    const saved = hostStore.get(code);
    if (saved) {
      setTokenState({ kind: "ready", token: saved.token });
      return;
    }
    if (authLoading) return;
    if (!user) {
      setTokenState({ kind: "signin" });
      return;
    }
    void fetchToken();
  }, [code, user, authLoading, fetchToken]);

  const onBadToken = useCallback(() => {
    hostStore.clear(code);
    if (user) void fetchToken();
    else setTokenState({ kind: "signin" });
  }, [code, user, fetchToken]);

  if (tokenState.kind === "ready") return <Console code={code} token={tokenState.token} onBadToken={onBadToken} />;

  return (
    <div className="trivia-stage grid min-h-0 flex-1 place-items-center p-8 text-center">
      <div className="max-w-md space-y-5">
        <Wordmark size="lg" />
        {tokenState.kind === "loading" && <Loader2 className="mx-auto h-8 w-8 animate-spin text-[var(--t-muted)]" aria-label="Opening the host console" />}
        {tokenState.kind === "signin" && (
          <>
            <p className="text-lg text-[var(--t-muted)]">Sign in with the account that opened room {code} to run it.</p>
            <Link href={`/login?next=${encodeURIComponent(`/trivia/host/${code}`)}`} className="inline-flex rounded-lg bg-[var(--t-teal)] px-6 py-3 font-bold text-white hover:bg-[var(--t-teal-strong)]">
              Sign in
            </Link>
          </>
        )}
        {tokenState.kind === "denied" && (
          <>
            <p className="text-lg text-[var(--t-muted)]">{tokenState.message}</p>
            <Link href="/trivia" className="inline-flex rounded-full border border-[var(--t-line-strong)] px-6 py-3 font-semibold">
              Back to ICAN Trivia
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Console ────────────────────────────────────────────────

function Console({ code, token, onBadToken }: { code: string; token: string; onBadToken: () => void }) {
  const auth = useMemo(() => ({ role: "host" as const, token }), [token]);
  const { view, error, connection, act, serverNow } = useTriviaRoom(code, auth);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hideAnswers, setHideAnswers] = useState(false);
  const noticeTimer = useRef<number | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHideAnswers(getPref("host-hide-answers", false));
  }, []);

  // A token that no longer opens the host view (e.g. an old co-host link).
  useEffect(() => {
    if (view && view.role !== "host") onBadToken();
  }, [view, onBadToken]);

  const say = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice(null), 3500);
  }, []);

  const run = useCallback<Run>(
    async (action) => {
      setBusy(true);
      try {
        const res = await act(action);
        if (!res.changed && res.note && !["early", "beaten", "closed", "locked", "won"].includes(res.note)) say(res.note);
      } catch (err) {
        say(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [act, say],
  );

  const toggleHide = useCallback(() => {
    setHideAnswers((h) => {
      setPref("host-hide-answers", !h);
      return !h;
    });
  }, []);

  useAutoAdvance(view, serverNow, run);
  useShortcuts(view, run, toggleHide, busy);

  if (!view || view.role !== "host") {
    return (
      <div className="trivia-stage grid min-h-0 flex-1 place-items-center p-8 text-center">
        {error ? (
          <div className="space-y-4">
            <p className="text-lg">{error.message}</p>
            <Link href="/trivia" className="inline-flex rounded-full border border-[var(--t-line-strong)] px-5 py-2.5 font-semibold">
              Back to ICAN Trivia
            </Link>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-[var(--t-muted)]" aria-label="Loading" />
        )}
      </div>
    );
  }

  return (
    <div className="trivia-stage flex min-h-0 flex-1 flex-col">
      <ConsoleHeader view={view} token={token} hideAnswers={hideAnswers} toggleHide={toggleHide} run={run} />
      {connection === "offline" && (
        <div role="status" className="flex items-center justify-center gap-2 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <WifiOff className="h-4 w-4" /> Connection lost — reconnecting.
        </div>
      )}
      <div className="grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:overflow-hidden">
        <section className="flex min-h-0 flex-col p-4 sm:p-6 lg:overflow-y-auto" aria-label="Stage">
          <StagePanel view={view} run={run} busy={busy} hideAnswers={hideAnswers} serverNow={serverNow} />
        </section>
        <aside className="flex min-h-0 flex-col border-t border-[var(--t-line)] bg-[var(--t-bg-2)] lg:overflow-y-auto lg:border-l lg:border-t-0" aria-label="Teams and scores">
          <Scoreboard view={view} run={run} />
          <ScoreLog view={view} run={run} />
          <Shortcuts />
        </aside>
      </div>
      {notice && (
        <div role="status" className="t-rise fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl bg-[#1f2b2d] px-4 py-3 text-sm font-semibold text-white shadow-2xl">
          {notice}
        </div>
      )}
    </div>
  );
}

function ConsoleHeader({ view, token, hideAnswers, toggleHide, run }: { view: TriviaView; token: string; hideAnswers: boolean; toggleHide: () => void; run: Run }) {
  const [copied, setCopied] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [host, setHost] = useState("sim.icanmena.com");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHost(window.location.host);
  }, []);
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-[var(--t-line)] bg-[var(--t-bg-2)] px-4 py-3 sm:px-6">
      <Link href="/trivia" className="flex items-center gap-2 text-[var(--t-muted)] hover:text-[var(--t-ink)]" aria-label="Back to ICAN Trivia">
        <ArrowLeft className="h-4 w-4" />
        <Wordmark size="sm" />
      </Link>
      <div className="flex items-baseline gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Room</span>
        <span className="t-font text-3xl font-extrabold tracking-[0.18em] text-[var(--t-teal-deep)]">{view.room.code}</span>
        <span className="hidden text-sm text-[var(--t-muted)] md:inline">
          join at <span className="font-semibold text-[var(--t-ink)]">{host}/play</span>
        </span>
      </div>
      <p className="hidden min-w-0 flex-1 truncate text-sm text-[var(--t-muted)] xl:block">
        {view.room.title} · {view.mode === "competitive" ? "Competitive" : "Traditional"}
      </p>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <a
          href={`/trivia/display/${view.room.code}`}
          target="_blank"
          rel="noopener"
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[var(--t-teal)] px-3 text-sm font-bold text-white hover:bg-[var(--t-teal-strong)]"
        >
          <Monitor className="h-4 w-4" /> Open big screen
        </a>
        <HeaderButton
          onClick={async () => {
            const url = `${window.location.origin}/trivia/host/${view.room.code}#k=${token}`;
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              window.setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt("Copy this co-host link:", url);
            }
          }}
          title="Anyone with this link can run the game"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copied" : "Co-host link"}
        </HeaderButton>
        <HeaderButton onClick={() => run({ type: "lock", locked: !view.locked })} pressed={view.locked} title={view.locked ? "New players can't join" : "Anyone with the code can join"}>
          {view.locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />} {view.locked ? "Locked" : "Open"}
        </HeaderButton>
        <HeaderButton onClick={toggleHide} pressed={hideAnswers} title="Blur answers on this screen (H)">
          {hideAnswers ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />} {hideAnswers ? "Answers hidden" : "Answers shown"}
        </HeaderButton>
        {view.phase !== "ended" &&
          (confirmEnd ? (
            <span className="inline-flex items-center gap-1">
              <button type="button" onClick={() => run({ type: "finish" })} className="min-h-10 rounded-lg bg-rose-600 px-3 text-sm font-bold text-white">
                End the game
              </button>
              <button type="button" onClick={() => setConfirmEnd(false)} className="min-h-10 rounded-lg px-3 text-sm text-[var(--t-muted)] hover:text-[var(--t-ink)]">
                Keep playing
              </button>
            </span>
          ) : (
            <HeaderButton onClick={() => setConfirmEnd(true)}>End game</HeaderButton>
          ))}
      </div>
    </header>
  );
}

function HeaderButton({ children, onClick, pressed, title }: { children: React.ReactNode; onClick: () => void; pressed?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={title}
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
        pressed ? "border-[var(--t-teal-deep)]/40 bg-[var(--t-teal-soft)] text-[var(--t-teal-ink)]" : "border-[var(--t-line-strong)] text-[var(--t-text)] hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

// ─── Stage ──────────────────────────────────────────────────

function teamOf(view: TriviaView, id: string | null | undefined): ViewTeam | undefined {
  return id ? view.teams.find((t) => t.id === id) : undefined;
}

function StagePanel({ view, run, busy, hideAnswers, serverNow }: { view: TriviaView; run: Run; busy: boolean; hideAnswers: boolean; serverNow: () => number }) {
  const content = view.content!;

  switch (view.phase) {
    case "lobby":
      return <LobbyStage view={view} run={run} busy={busy} />;

    case "board": {
      const controller = teamOf(view, view.controllerTeamId);
      const competitive = view.mode === "competitive";
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-[var(--t-muted)]">
              {view.remaining === 0 ? (
                "Every question has been played."
              ) : controller ? (
                <>
                  <span className="t-font font-extrabold" data-team="" style={{ "--team": controller.color } as React.CSSProperties}>
                    {controller.name}
                  </span>{" "}
                  {competitive ? "— their turn. They pick on a phone, or click for them." : "has control — they can pick on a phone, or click for them."}
                </>
              ) : (
                "Click a question to start. Whoever answers it right picks next."
              )}
            </p>
            <div className="flex gap-2">
              {view.hasFinal && (
                <SecondaryButton onClick={() => run({ type: "startFinal" })} disabled={busy}>
                  {view.remaining === 0 ? "Start Final Trivia" : "Skip to Final Trivia"}
                </SecondaryButton>
              )}
              {(view.remaining === 0 || !view.hasFinal) && (
                <SecondaryButton onClick={() => run({ type: "finish" })} disabled={busy}>
                  Show final scores
                </SecondaryButton>
              )}
            </div>
          </div>
          <div className="min-h-[360px] flex-1">
            <TriviaBoard
              board={view.board}
              teams={view.teams}
              rows={view.rowValues.length}
              canSelect={!busy}
              onSelect={(cellId) => run({ type: "select", cellId })}
              hint={(cellId) => {
                const cell = findCell(content, cellId);
                return cell ? `${cell.question.question}\n→ ${cell.question.answer}${cell.question.dailyDouble && !competitive ? "\n(Daily Double)" : ""}` : null;
              }}
            />
          </div>
        </div>
      );
    }

    case "question":
    case "buzzing":
    case "answering":
    case "dd_answer":
    case "reveal":
      return <QuestionStage view={view} run={run} busy={busy} hideAnswers={hideAnswers} serverNow={serverNow} />;

    case "dd_wager":
      return <DailyDoubleStage view={view} run={run} busy={busy} />;

    case "final_wager":
    case "final_answer":
    case "final_reveal":
      return <FinalStage view={view} run={run} busy={busy} hideAnswers={hideAnswers} serverNow={serverNow} />;

    case "ended": {
      const sorted = [...view.teams].sort((a, b) => b.score - a.score);
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Game over</p>
          <h1 className="t-font text-4xl font-extrabold">
            {sorted[0] ? (
              <>
                <span data-team="" style={{ "--team": sorted[0].color } as React.CSSProperties}>{sorted[0].name}</span> win with {formatScore(sorted[0].score)}
              </>
            ) : (
              "Game over"
            )}
          </h1>
          <ol className="w-full max-w-md space-y-2 text-left">
            {sorted.map((t, i) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl bg-[var(--t-panel)] px-4 py-2.5">
                <span className="w-6 t-font font-extrabold text-[var(--t-faint)]">{i + 1}</span>
                <TeamBadge name={t.name} color={t.color} size={28} />
                <span className="flex-1 font-semibold">{t.name}</span>
                <span className="t-font font-extrabold tabular-nums">{formatScore(t.score)}</span>
              </li>
            ))}
          </ol>
          <PlayAgain view={view} />
          <p className="max-w-md text-sm text-[var(--t-faint)]">Scores stay on the big screen and players’ phones for a few hours.</p>
        </div>
      );
    }
  }
}

function LobbyStage({ view, run, busy }: { view: TriviaView; run: Run; busy: boolean }) {
  const staffed = view.teams.filter((t) => t.members.length > 0).length;
  const unassigned = view.players.filter((p) => !p.teamId);
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Waiting room · {view.mode === "competitive" ? "Competitive" : "Traditional"}</p>
          <h1 className="mt-1 t-font text-3xl font-extrabold">{view.room.title}</h1>
          <p className="mt-2 max-w-xl text-[var(--t-muted)]">
            Put the big screen on the projector. Players scan the QR code or go to /play, enter{" "}
            <span className="font-bold text-[var(--t-teal-deep)]">{view.room.code}</span>, then pick a team{view.settings.teamPick === "auto" ? " (or get one automatically)" : ""}.
          </p>
        </div>
        <PrimaryButton onClick={() => run({ type: "start" })} disabled={busy || staffed === 0} kbd="Space">
          {staffed === 0 ? "Waiting for players" : `Start the game · ${view.players.length} ${view.players.length === 1 ? "player" : "players"}`}
        </PrimaryButton>
      </div>
      <TeamsEditor view={view} run={run} />
      {unassigned.length > 0 && (
        <div className="rounded-2xl border border-[var(--t-line)] p-4">
          <p className="mb-2 text-sm font-semibold text-[var(--t-muted)]">Still choosing a team</p>
          <ul className="flex flex-wrap gap-2">
            {unassigned.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded-full bg-[var(--t-panel)] py-1 pl-3 pr-1 text-sm">
                {p.name}
                <MoveSelect view={view} playerId={p.id} current={null} run={run} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Rename, recolour, add and remove teams before the game starts. */
function TeamsEditor({ view, run }: { view: TriviaView; run: Run }) {
  const [draft, setDraft] = useState<TeamDef[]>(() => view.teams.map(({ id, name, color }) => ({ id, name, color })));
  const [error, setError] = useState<string | null>(null);
  // Follow server changes unless a name is being typed.
  const editing = useRef(false);
  const serverKey = view.teams.map((t) => `${t.id}:${t.name}:${t.color}`).join("|");
  useEffect(() => {
    if (!editing.current) {
       
      setDraft(view.teams.map(({ id, name, color }) => ({ id, name, color })));
    }
  }, [serverKey, view.teams]);

  async function save(next: TeamDef[]) {
    setDraft(next);
    const names = next.map((t) => t.name.trim().toLowerCase());
    if (names.some((n) => !n)) return setError("Every team needs a name.");
    if (new Set(names).size !== names.length) return setError("Two teams have the same name.");
    setError(null);
    await run({ type: "setTeams", teams: next.map((t) => ({ ...t, name: t.name.trim() })) });
  }

  const usedColors = new Set(draft.map((t) => t.color.toUpperCase()));
  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Teams · {draft.length} of {MAX_TEAMS}</h2>
        {error && (
          <p role="alert" className="text-sm text-rose-700">
            {error}
          </p>
        )}
      </div>
      <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(min(100%,260px),1fr))]">
        {draft.map((t, i) => {
          const live = view.teams.find((x) => x.id === t.id);
          return (
            <li key={t.id} className="rounded-2xl bg-[var(--t-panel)] p-3" style={{ boxShadow: `inset 0 4px 0 ${t.color}` }}>
              <div className="flex items-center gap-2">
                <TeamBadge name={t.name || "?"} color={t.color} size={34} />
                <label className="sr-only" htmlFor={`team-name-${t.id}`}>
                  Team {i + 1} name
                </label>
                <input
                  id={`team-name-${t.id}`}
                  value={t.name}
                  maxLength={LIMITS.teamName}
                  onFocus={() => (editing.current = true)}
                  onChange={(e) => setDraft(draft.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={() => {
                    editing.current = false;
                    void save(draft);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  className="h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-[var(--t-bg-2)] px-2 t-font font-extrabold focus:border-[var(--t-teal-deep)] focus:outline-none"
                  data-team="" style={{ "--team": t.color } as React.CSSProperties}
                />
                {draft.length > 1 && (
                  <button
                    type="button"
                    onClick={() => save(draft.filter((x) => x.id !== t.id))}
                    aria-label={`Remove ${t.name}`}
                    className="grid h-9 w-9 place-items-center rounded-lg text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-red)]"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`${t.name} colour`}>
                {TEAM_COLORS.map((c) => {
                  const selected = c.hex.toUpperCase() === t.color.toUpperCase();
                  const takenByOther = !selected && usedColors.has(c.hex.toUpperCase());
                  return (
                    <button
                      key={c.hex}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      aria-label={`${c.name}${takenByOther ? " (used by another team)" : ""}`}
                      title={c.name}
                      disabled={takenByOther}
                      onClick={() => save(draft.map((x) => (x.id === t.id ? { ...x, color: c.hex } : x)))}
                      className={cn("relative h-7 w-7 rounded-full transition-transform", selected && "ring-2 ring-white ring-offset-2 ring-offset-white", takenByOther && "opacity-20")}
                      style={{ background: c.hex }}
                    >
                      {selected && <Check className="absolute inset-0 m-auto h-4 w-4 text-slate-900" aria-hidden />}
                    </button>
                  );
                })}
              </div>
              <ul className="mt-3 space-y-1">
                {(live?.members ?? []).map((m) => (
                  <li key={m.id} className="flex items-center gap-2 text-sm">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", m.connected ? "bg-[var(--t-sage)]" : "bg-[var(--t-faint)]")} aria-label={m.connected ? "Connected" : "Not connected"} />
                    <span className="min-w-0 flex-1 truncate">{m.name}</span>
                    <MoveSelect view={view} playerId={m.id} current={t.id} run={run} />
                  </li>
                ))}
                {(live?.members.length ?? 0) === 0 && <li className="text-sm text-[var(--t-faint)]">No players yet</li>}
              </ul>
            </li>
          );
        })}
        {draft.length < MAX_TEAMS && (
          <li>
            <button
              type="button"
              onClick={() => {
                const usedNames = new Set(draft.map((t) => t.name.toLowerCase()));
                const name = SUGGESTED_TEAM_NAMES.find((n) => !usedNames.has(n.toLowerCase())) ?? `Team ${draft.length + 1}`;
                const color = TEAM_COLORS.find((c) => !usedColors.has(c.hex.toUpperCase()))?.hex ?? TEAM_COLORS[0].hex;
                const used = new Set(draft.map((t) => t.id));
                let n = draft.length + 1;
                while (used.has(`t${n}`)) n++;
                void save([...draft, { id: `t${n}`, name, color }]);
              }}
              className="flex h-full min-h-[140px] w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[var(--t-line-strong)] text-[var(--t-muted)] hover:border-slate-400 hover:text-[var(--t-ink)]"
            >
              <Plus className="h-6 w-6" /> Add a team
            </button>
          </li>
        )}
      </ul>
    </div>
  );
}

function MoveSelect({ view, playerId, current, run }: { view: TriviaView; playerId: string; current: string | null; run: Run }) {
  const name = view.players.find((p) => p.id === playerId)?.name ?? "player";
  return (
    <select
      value={current ?? ""}
      onChange={(e) => e.target.value && run({ type: "moveMember", playerId, teamId: e.target.value })}
      aria-label={`Move ${name} to a team`}
      className="h-8 max-w-[9rem] rounded-md border border-[var(--t-line-strong)] bg-[var(--t-bg-2)] px-1.5 text-xs text-[var(--t-muted)]"
    >
      {!current && <option value="">Assign…</option>}
      {view.teams.map((t) => (
        <option key={t.id} value={t.id}>
          {current === t.id ? `On ${t.name}` : `Move to ${t.name}`}
        </option>
      ))}
    </select>
  );
}

function PlayAgain({ view }: { view: TriviaView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap justify-center gap-3">
      {view.room.setId && (
        <PrimaryButton
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api<{ code: string; roomId: string; hostToken: string }>("/api/trivia/rooms", {
                body: { setId: view.room.setId, settings: view.settings },
              });
              hostStore.set(res.code, { roomId: res.roomId, token: res.hostToken });
              router.push(`/trivia/host/${res.code}`);
            } catch (err) {
              setError(errorMessage(err));
              setBusy(false);
            }
          }}
        >
          <RotateCcw className="h-5 w-5" /> Play this board again
        </PrimaryButton>
      )}
      {view.room.setId && (
        <Link href={`/trivia/boards/${view.room.setId}`} className="inline-flex min-h-12 items-center rounded-xl border border-[var(--t-line-strong)] px-5 font-semibold hover:bg-slate-50">
          Edit the board
        </Link>
      )}
      <Link href="/trivia" className="inline-flex min-h-12 items-center rounded-xl border border-[var(--t-line-strong)] px-5 font-semibold hover:bg-slate-50">
        Back to ICAN Trivia
      </Link>
      {error && <p className="w-full text-sm text-rose-700">{error}</p>}
    </div>
  );
}

function AnswerReveal({ answer, hint, notes, hidden }: { answer: string | null; hint?: string | null; notes: string | null; hidden: boolean }) {
  const [peek, setPeek] = useState(false);
  const show = !hidden || peek;
  return (
    <div className="rounded-2xl border border-[var(--t-teal-deep)]/25 bg-[var(--t-teal-soft)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-teal-ink)]">Answer · only you see this</p>
        {hidden && (
          <button
            type="button"
            onPointerDown={() => setPeek(true)}
            onPointerUp={() => setPeek(false)}
            onPointerLeave={() => setPeek(false)}
            onKeyDown={(e) => e.key === " " && setPeek(true)}
            onKeyUp={() => setPeek(false)}
            className="rounded-md border border-[var(--t-line-strong)] px-2 py-1 text-xs text-[var(--t-muted)]"
          >
            Hold to peek
          </button>
        )}
      </div>
      <p className={cn("mt-1 t-font text-2xl font-extrabold text-[var(--t-teal-deep)] transition-[filter] duration-150", !show && "select-none blur-md")} aria-hidden={!show}>
        {answer}
      </p>
      {hint && (
        <p className={cn("mt-1 flex items-center gap-1.5 text-sm text-[var(--t-muted)]", !show && "select-none blur-sm")}>
          <Lightbulb className="h-3.5 w-3.5" aria-hidden /> Hint: {hint}
        </p>
      )}
      {notes && <p className={cn("mt-1 text-sm text-[var(--t-muted)]", !show && "select-none blur-sm")}>{notes}</p>}
    </div>
  );
}

function QuestionStage({ view, run, busy, hideAnswers, serverNow }: { view: TriviaView; run: Run; busy: boolean; hideAnswers: boolean; serverNow: () => number }) {
  const cur = view.current!;
  const turn = view.turn;
  const competitive = view.mode === "competitive";
  const buzzLeft = useCountdown(view.phase === "buzzing" ? view.buzz.closesAt : null, serverNow);
  const answerLeft = useCountdown(view.phase === "answering" ? view.buzz.answerDeadline : null, serverNow);
  const windowLeft = useCountdown(view.phase === "question" ? turn?.windowEndsAt : null, serverNow, 200);
  const answeringTeam = teamOf(view, view.phase === "dd_answer" ? view.controllerTeamId : view.buzz.winnerTeamId);
  const holder = teamOf(view, turn?.answeringTeamId);
  const buzzer = view.players.find((p) => p.id === view.buzz.winnerPlayerId);
  const doubled = Boolean(answeringTeam && turn?.doubleDown.includes(answeringTeam.id) && !view.buzz.winnerPlayerId);
  const swapped = Boolean(answeringTeam && turn?.swappedTo === answeringTeam.id && !view.buzz.winnerPlayerId);
  const value = cur.dailyDouble && view.wager ? view.wager : cur.value;
  const winAmount = view.phase === "dd_answer" ? view.wager ?? 0 : doubled ? value * 2 : value;
  const loseAmount = view.phase === "dd_answer" ? view.wager ?? 0 : doubled || view.settings.negativeScoring ? value : 0;

  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="rounded-3xl border border-[var(--t-line)] bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <p className="t-category text-lg text-[var(--t-teal-ink)]">{cur.columnTitle}</p>
          <p className="rounded-lg bg-[var(--t-teal-deep)] px-3 py-1 t-font text-2xl font-extrabold leading-none text-white">
            {cur.dailyDouble && <span className="mr-2 text-sm text-[var(--t-text)]">DAILY DOUBLE</span>}
            {formatScore(value)}
          </p>
        </div>
        <p className="t-question mt-6 text-[clamp(1.5rem,2.6vw,2.4rem)] text-[var(--t-ink)]">{cur.question}</p>
        {cur.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.imageUrl} alt="" className="mt-4 max-h-56 rounded-xl object-contain" />
        )}
      </div>

      <AnswerReveal answer={cur.answer} hint={competitive ? cur.hint : null} notes={cur.notes} hidden={hideAnswers && view.phase !== "reveal"} />

      {competitive && turn && turn.events.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Tools played on this question">
          {turn.events.map((ev) => {
            const by = teamOf(view, ev.teamId);
            const target = teamOf(view, ev.targetTeamId);
            return (
              <li key={ev.seq} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold text-slate-900" style={{ background: by?.color }}>
                <ToolIcon tool={ev.tool} className="h-4 w-4" />
                {by?.name} · {TOOL_INFO[ev.tool].label}
                {target ? ` → ${target.name}` : ""}
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-2xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
        {view.phase === "question" && !competitive && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-[var(--t-muted)]">Read the question out, then open the buzzers.</p>
            <SecondaryButton onClick={() => run({ type: "backToBoard" })} disabled={busy} kbd="B">
              Put it back
            </SecondaryButton>
            <SecondaryButton onClick={() => run({ type: "revealAnswer" })} disabled={busy} kbd="R">
              Skip to answer
            </SecondaryButton>
            <PrimaryButton onClick={() => run({ type: "openBuzzers" })} disabled={busy} kbd="Space">
              Open buzzers
            </PrimaryButton>
          </div>
        )}

        {view.phase === "question" && competitive && turn && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="mr-auto">
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Tools window</p>
                <p className="t-font text-xl font-extrabold">
                  {holder ? (
                    <>
                      <span data-team="" style={{ "--team": holder.color } as React.CSSProperties}>{holder.name}</span> {turn.stolenBy === holder.id ? "stole it" : turn.swappedTo === holder.id ? `answer first (${view.settings.swapAnswerSec}s)` : "will answer"}
                    </>
                  ) : (
                    "Opens to a buzz"
                  )}
                  {holder && turn.doubleDown.includes(holder.id) && <span className="ml-2 text-base text-[var(--t-teal-deep)]">· doubled</span>}
                </p>
              </div>
              {turn.events.length === 0 && (
                <SecondaryButton onClick={() => run({ type: "backToBoard" })} disabled={busy} kbd="B">
                  Put it back
                </SecondaryButton>
              )}
              <PrimaryButton onClick={() => run({ type: "startAnswering" })} disabled={busy} kbd="Space">
                Start the answer clock
              </PrimaryButton>
            </div>
            {turn.windowEndsAt && <CountdownBar left={windowLeft} total={view.settings.toolWindowSec * 1000} />}
            <HostToolMenu view={view} run={run} busy={busy} />
          </div>
        )}

        {view.phase === "buzzing" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="mr-auto t-font text-xl font-extrabold text-[var(--t-teal-deep)]">{competitive ? "Rebound — buzzers open" : "Buzzers open"}</p>
              <SecondaryButton onClick={() => run({ type: "revealAnswer" })} disabled={busy} kbd="R">
                Nobody — reveal answer
              </SecondaryButton>
            </div>
            {view.buzz.closesAt && <CountdownBar left={buzzLeft} total={view.settings.buzzWindowSec * 1000} />}
            {view.buzz.lockedOut.length > 0 && (
              <p className="text-sm text-[var(--t-faint)]">Out of this one: {view.buzz.lockedOut.map((id) => teamOf(view, id)?.name).filter(Boolean).join(", ")}</p>
            )}
          </div>
        )}

        {(view.phase === "answering" || view.phase === "dd_answer") && (
          <div className="flex flex-wrap items-center gap-4">
            {answeringTeam ? (
              <div className="mr-auto flex items-center gap-3">
                <TeamBadge name={answeringTeam.name} color={answeringTeam.color} size={52} />
                <div>
                  <p className="t-font text-2xl font-extrabold" data-team="plain" style={{ "--team": answeringTeam.color } as React.CSSProperties}>
                    {answeringTeam.name}
                  </p>
                  <p className="text-sm text-[var(--t-muted)]">
                    {view.phase === "dd_answer"
                      ? `answering for ${formatScore(view.wager ?? 0)}`
                      : buzzer
                        ? `${buzzer.name} buzzed in`
                        : swapped
                          ? `swapped to them — ${view.settings.swapAnswerSec}s`
                          : turn?.stolenBy === answeringTeam.id
                            ? "stole the question"
                            : "answering"}
                    {doubled && " · Double Down"}
                    {view.settings.phraseAsQuestion && " · must phrase it as a question"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="mr-auto">Waiting…</p>
            )}
            {view.phase === "answering" && view.buzz.answerDeadline && (
              <CountdownRing left={answerLeft} total={(swapped ? view.settings.swapAnswerSec : view.settings.answerTimeSec) * 1000} size={64} />
            )}
            <JudgeButton correct={false} onClick={() => run({ type: "judge", correct: false })} disabled={busy} amount={loseAmount} />
            <JudgeButton correct onClick={() => run({ type: "judge", correct: true })} disabled={busy} amount={winAmount} />
          </div>
        )}

        {view.phase === "reveal" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-[var(--t-muted)]">
              {view.lastResult && view.lastResult.seq === view.seq ? (
                <>
                  <span className="font-semibold" data-team="" style={{ "--team": teamOf(view, view.lastResult.teamId)?.color } as React.CSSProperties}>
                    {teamOf(view, view.lastResult.teamId)?.name}
                  </span>{" "}
                  {view.lastResult.correct ? `got it (+${view.lastResult.delta.toLocaleString("en-US")}).` : "missed it."}
                </>
              ) : (
                "The answer is on the big screen."
              )}
            </p>
            <PrimaryButton onClick={() => run({ type: "backToBoard" })} disabled={busy} kbd="Space">
              Back to the board
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  );
}

/** Play a tool on a team's behalf — for a dead phone or a team shouting across the room. */
function HostToolMenu({ view, run, busy }: { view: TriviaView; run: Run; busy: boolean }) {
  const [teamId, setTeamId] = useState("");
  const [tool, setTool] = useState<ToolKind | "">("");
  const [target, setTarget] = useState("");
  const needsTarget = tool === "block" || tool === "swap";
  return (
    <details className="group rounded-xl border border-[var(--t-line)] px-3 py-2">
      <summary className="cursor-pointer select-none text-sm text-[var(--t-muted)] hover:text-[var(--t-ink)]">Play a tool for a team</summary>
      <form
        className="mt-3 flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!teamId || !tool) return;
          void run({ type: "useTool", teamId, tool, targetTeamId: needsTarget ? target || undefined : undefined });
        }}
      >
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)} aria-label="Team" className="h-10 rounded-lg border border-[var(--t-line-strong)] bg-[var(--t-bg-2)] px-2 text-sm">
          <option value="">Team…</option>
          {view.teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select value={tool} onChange={(e) => setTool(e.target.value as ToolKind)} aria-label="Tool" className="h-10 rounded-lg border border-[var(--t-line-strong)] bg-[var(--t-bg-2)] px-2 text-sm">
          <option value="">Tool…</option>
          {TOOL_KINDS.filter((k) => (view.settings.tools[k] ?? 0) > 0).map((k) => (
            <option key={k} value={k}>
              {TOOL_INFO[k].label} ({teamOf(view, teamId)?.tools?.[k] ?? "—"} left)
            </option>
          ))}
        </select>
        {needsTarget && (
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Target team" className="h-10 rounded-lg border border-[var(--t-line-strong)] bg-[var(--t-bg-2)] px-2 text-sm">
            <option value="">On team…</option>
            {view.teams
              .filter((t) => t.id !== teamId)
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </select>
        )}
        <button type="submit" disabled={busy || !teamId || !tool || (needsTarget && !target)} className="h-10 rounded-lg bg-slate-100 px-3 text-sm font-semibold hover:bg-slate-200 disabled:opacity-40">
          Play it
        </button>
      </form>
    </details>
  );
}

function JudgeButton({ correct, onClick, disabled, amount }: { correct: boolean; onClick: () => void; disabled: boolean; amount: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-14 items-center gap-2 rounded-xl px-5 t-font text-lg font-extrabold text-slate-900 transition-[filter,transform] active:scale-[0.98] disabled:opacity-50",
        correct ? "bg-[var(--t-sage-strong)] text-white hover:brightness-110" : "bg-rose-600 text-white hover:bg-rose-700",
      )}
    >
      {correct ? <Check className="h-5 w-5" /> : <X className="h-5 w-5" />}
      {correct ? "Correct" : "Wrong"}
      <span className="text-sm font-bold opacity-75">
        {correct ? "+" : amount ? "−" : "±"}
        {amount.toLocaleString("en-US")}
      </span>
      <kbd className="ml-1 rounded border border-white/40 px-1.5 text-xs font-bold opacity-80">{correct ? "C" : "W"}</kbd>
    </button>
  );
}

function DailyDoubleStage({ view, run, busy }: { view: TriviaView; run: Run; busy: boolean }) {
  const content = view.content!;
  const cur = view.current!;
  const [teamId, setTeamId] = useState<string>(view.controllerTeamId ?? "");
  const [amount, setAmount] = useState("");
  const team = teamOf(view, view.controllerTeamId ?? teamId);
  const topValue = Math.max(0, ...content.columns.flatMap((c) => c.questions.map((q) => q.value)));
  const max = team ? Math.max(team.score, topValue, 5) : topValue;
  const cell = findCell(content, cur.cellId);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <p className="t-stamp t-font text-6xl font-extrabold leading-none text-[var(--t-teal-deep)]">Daily Double</p>
      <p className="t-category text-lg text-[var(--t-teal-ink)]">{cur.columnTitle}</p>
      {cell && <p className="max-w-xl text-sm text-[var(--t-faint)]">Question (hidden from players until the wager is in): {cell.question.question}</p>}
      {view.controllerTeamId ? (
        <p className="text-[var(--t-muted)]">
          Waiting for{" "}
          <span className="font-bold" data-team="" style={{ "--team": team?.color } as React.CSSProperties}>
            {team?.name}
          </span>{" "}
          to wager on a phone (5 – {max.toLocaleString("en-US")}) — or enter it for them:
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[var(--t-muted)]">No team has control yet. Who&apos;s answering?</p>
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="min-h-11 rounded-lg border border-[var(--t-line-strong)] bg-white px-3 text-[var(--t-text)]" aria-label="Team answering the Daily Double">
            <option value="">Choose a team…</option>
            {view.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({formatScore(t.score)})
              </option>
            ))}
          </select>
        </div>
      )}
      <form
        className="flex flex-wrap items-center justify-center gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const n = Number(amount);
          if (!Number.isFinite(n)) return;
          void run({ type: "setWager", amount: n, teamId: view.controllerTeamId ?? (teamId || undefined) });
        }}
      >
        <input
          inputMode="numeric"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, "").slice(0, 7))}
          placeholder="Wager"
          aria-label="Wager amount"
          className="h-12 w-40 rounded-xl border-2 border-[var(--t-line-strong)] bg-[var(--t-panel)] text-center t-font text-2xl font-extrabold text-[var(--t-teal-deep)] focus:border-[var(--t-teal-deep)] focus:outline-none"
        />
        <PrimaryButton type="submit" disabled={busy || !amount || (!view.controllerTeamId && !teamId)}>
          Set wager
        </PrimaryButton>
        <SecondaryButton onClick={() => run({ type: "revealAnswer" })} disabled={busy}>
          Skip question
        </SecondaryButton>
      </form>
    </div>
  );
}

function FinalStage({ view, run, busy, hideAnswers, serverNow }: { view: TriviaView; run: Run; busy: boolean; hideAnswers: boolean; serverNow: () => number }) {
  const f = view.final!;
  const left = useCountdown(view.phase === "final_answer" ? f.deadline : null, serverNow, 250);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="rounded-3xl border border-[var(--t-line)] bg-white p-6 shadow-sm sm:p-8">
        <p className="t-font text-xl font-extrabold text-[var(--t-teal-deep)]">Final Trivia</p>
        <p className="mt-1 t-category text-2xl text-[var(--t-teal-ink)]">{f.category}</p>
        <p className="t-question mt-5 text-[clamp(1.4rem,2.4vw,2.2rem)] text-[var(--t-ink)]">{f.question}</p>
      </div>
      <AnswerReveal answer={f.answer} notes={f.notes} hidden={hideAnswers && !f.answerRevealed} />

      {view.phase === "final_wager" && (
        <div className="rounded-2xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-[var(--t-muted)]">
              {f.wagered.length} of {view.teams.length} teams have wagered. Players see the question only when you show it.
            </p>
            <PrimaryButton onClick={() => run({ type: "showFinalQuestion" })} disabled={busy} kbd="Space">
              Show the question ({view.settings.finalTimeSec}s)
            </PrimaryButton>
          </div>
          <ResponseTable view={view} mode="wagers" run={run} busy={busy} />
        </div>
      )}

      {view.phase === "final_answer" && (
        <div className="rounded-2xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
          <div className="flex flex-wrap items-center gap-4">
            <CountdownRing left={left} total={view.settings.finalTimeSec * 1000} size={64} />
            <p className="mr-auto text-[var(--t-muted)]">
              {f.answered.length} of {view.teams.length} teams answered. Answers close automatically.
            </p>
            <SecondaryButton onClick={() => run({ type: "closeFinal" })} disabled={busy}>
              Close answers now
            </SecondaryButton>
          </div>
        </div>
      )}

      {view.phase === "final_reveal" && (
        <div className="rounded-2xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
          <div className="flex flex-wrap items-center gap-3">
            <p className="mr-auto text-[var(--t-muted)]">Show each team&apos;s response on the big screen, then judge it.</p>
            {!f.answerRevealed && (
              <SecondaryButton onClick={() => run({ type: "revealFinalAnswer" })} disabled={busy} kbd="R">
                Reveal the answer
              </SecondaryButton>
            )}
            <PrimaryButton onClick={() => run({ type: "finish" })} disabled={busy}>
              Show final scores
            </PrimaryButton>
          </div>
          <ResponseTable view={view} mode="judge" run={run} busy={busy} />
        </div>
      )}
    </div>
  );
}

function ResponseTable({ view, mode, run, busy }: { view: TriviaView; mode: "wagers" | "judge"; run: Run; busy: boolean }) {
  const f = view.final!;
  return (
    <ul className="mt-4 divide-y divide-[var(--t-line)]">
      {view.teams.map((t) => {
        const r = f.responses.find((x) => x.teamId === t.id);
        const wagered = f.wagered.includes(t.id);
        return (
          <li key={t.id} className="flex flex-wrap items-center gap-3 py-3">
            <TeamBadge name={t.name} color={t.color} size={30} />
            <div className="min-w-0 flex-1">
              <p className="font-semibold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
                {t.name} <span className="font-normal text-[var(--t-faint)]">· {formatScore(t.score)}</span>
              </p>
              {mode === "wagers" ? (
                <p className="text-sm text-[var(--t-muted)]">{wagered ? `Wagered ${formatScore(r?.wager ?? 0)}` : "No wager yet"}</p>
              ) : (
                <p className="text-sm">
                  <span className="text-[var(--t-text)]">{r?.answer || <em className="text-[var(--t-faint)]">no answer</em>}</span> <span className="text-[var(--t-faint)]">· wager {formatScore(r?.wager ?? 0)}</span>
                </p>
              )}
            </div>
            {mode === "judge" && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => run({ type: "showFinalResponse", teamId: t.id })}
                  disabled={busy || r?.correct !== null}
                  className="min-h-10 rounded-lg border border-[var(--t-line-strong)] px-3 text-sm font-semibold hover:bg-slate-50 disabled:opacity-40"
                >
                  Show on screen
                </button>
                <button
                  type="button"
                  onClick={() => run({ type: "judgeFinal", teamId: t.id, correct: false })}
                  disabled={busy}
                  aria-pressed={r?.correct === false}
                  aria-label={`Mark ${t.name} wrong`}
                  className={cn("grid h-10 w-10 place-items-center rounded-lg border", r?.correct === false ? "border-transparent bg-rose-600 text-white" : "border-[var(--t-line-strong)] hover:bg-slate-50")}
                >
                  <X className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => run({ type: "judgeFinal", teamId: t.id, correct: true })}
                  disabled={busy}
                  aria-pressed={r?.correct === true}
                  aria-label={`Mark ${t.name} correct`}
                  className={cn("grid h-10 w-10 place-items-center rounded-lg border", r?.correct === true ? "border-transparent bg-[var(--t-sage-strong)] text-white" : "border-[var(--t-line-strong)] hover:bg-slate-50")}
                >
                  <Check className="h-5 w-5" />
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ─── Sidebar ────────────────────────────────────────────────

function Scoreboard({ view, run }: { view: TriviaView; run: Run }) {
  const [open, setOpen] = useState<string | null>(null);
  const step = view.current?.value ?? view.rowValues[0] ?? 200;
  return (
    <div className="border-b border-[var(--t-line)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Teams</h2>
        <p className="text-xs text-[var(--t-faint)]">{view.mode === "competitive" ? "crown = whose turn" : "crown = picks next"}</p>
      </div>
      <ul className="space-y-2">
        {view.teams.map((t) => (
          <TeamRow key={t.id} t={t} view={view} run={run} open={open === t.id} setOpen={(v) => setOpen(v ? t.id : null)} step={step} />
        ))}
      </ul>
    </div>
  );
}

function TeamRow({ t, view, run, open, setOpen, step }: { t: ViewTeam; view: TriviaView; run: Run; open: boolean; setOpen: (v: boolean) => void; step: number }) {
  const [custom, setCustom] = useState("");
  const [confirmKick, setConfirmKick] = useState<string | null>(null);
  const control = view.controllerTeamId === t.id;
  return (
    <li className="rounded-xl bg-[var(--t-panel)]">
      <div className="flex items-center gap-2.5 py-2 pl-2.5 pr-2">
        <TeamBadge name={t.name} color={t.color} size={34} />
        <span className="min-w-0 flex-1">
          <span className="block truncate t-font font-extrabold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
            {t.name}
          </span>
          <span className="block truncate text-xs text-[var(--t-faint)]">
            {t.members.length} {t.members.length === 1 ? "player" : "players"}
            {t.members.length > 0 && ` · ${t.members.filter((m) => m.connected).length} online`}
          </span>
        </span>
        <span className={cn("t-font text-xl font-extrabold tabular-nums", t.score < 0 && "text-[var(--t-red)]")}>{formatScore(t.score)}</span>
        <button
          type="button"
          onClick={() => run({ type: "setController", teamId: control ? null : t.id })}
          aria-pressed={control}
          aria-label={control ? `${t.name} has control — clear` : `Give ${t.name} control of the board`}
          title={control ? "Has control of the board" : "Give control of the board"}
          className={cn("grid h-9 w-9 place-items-center rounded-lg", control ? "text-[var(--t-teal-deep)]" : "text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-ink)]")}
        >
          <Crown className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-label={`Adjust ${t.name}'s score and players`}
          className="grid h-9 w-9 place-items-center rounded-lg text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-ink)]"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {view.mode === "competitive" && <ToolCounts tools={t.tools} className="px-3 pb-2" />}
      {open && (
        <div className="space-y-3 border-t border-[var(--t-line)] px-3 py-3">
          <div className="flex flex-wrap gap-1.5">
            {[-step, step].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => run({ type: "adjustScore", teamId: t.id, delta: d })}
                className="inline-flex min-h-9 items-center gap-1 rounded-lg border border-[var(--t-line-strong)] px-2.5 text-sm font-semibold hover:bg-slate-50"
              >
                {d < 0 ? <Minus className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                {Math.abs(d).toLocaleString("en-US")}
              </button>
            ))}
            <form
              className="flex items-center gap-1.5"
              onSubmit={(e) => {
                e.preventDefault();
                const n = Number(custom);
                if (Number.isFinite(n) && n !== 0) {
                  void run({ type: "adjustScore", teamId: t.id, delta: n });
                  setCustom("");
                }
              }}
            >
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^\d-]/g, "").slice(0, 8))}
                placeholder="±"
                aria-label={`Custom score change for ${t.name}`}
                className="h-9 w-20 rounded-lg border border-[var(--t-line-strong)] bg-[var(--t-bg-2)] px-2 text-sm"
              />
              <button type="submit" className="min-h-9 rounded-lg bg-slate-100 px-2.5 text-sm font-semibold hover:bg-slate-200">
                Apply
              </button>
            </form>
          </div>
          <ul className="space-y-1">
            {t.members.map((m) => (
              <li key={m.id} className="flex items-center gap-2 text-sm">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", m.connected ? "bg-[var(--t-sage)]" : "bg-[var(--t-faint)]")} aria-label={m.connected ? "Connected" : "Not connected"} />
                <span className="min-w-0 flex-1 truncate">{m.name}</span>
                <MoveSelect view={view} playerId={m.id} current={t.id} run={run} />
                {confirmKick === m.id ? (
                  <>
                    <button type="button" onClick={() => run({ type: "kick", playerId: m.id })} className="rounded-md bg-rose-600 px-2 py-1 text-xs font-bold text-white">
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirmKick(null)} className="px-1 text-xs text-[var(--t-muted)]">
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmKick(m.id)}
                    aria-label={`Remove ${m.name} from the game`}
                    className="grid h-8 w-8 place-items-center rounded-md text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-red)]"
                  >
                    <UserX className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
            {t.members.length === 0 && <li className="text-sm text-[var(--t-faint)]">No players on this team.</li>}
          </ul>
        </div>
      )}
    </li>
  );
}

function ScoreLog({ view, run }: { view: TriviaView; run: Run }) {
  const content = view.content!;
  const entries = [...(view.history ?? [])].reverse().slice(0, 30);
  const noteLabel: Record<string, string> = { doubleDown: "double down", dailyDouble: "Daily Double", stolen: "stolen", swapped: "swapped", rebound: "rebound" };
  return (
    <div className="min-h-[200px] flex-1 p-4 lg:overflow-y-auto">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Score log</h2>
      {entries.length === 0 && <p className="text-sm text-[var(--t-faint)]">Every score change lands here, with undo.</p>}
      <ul className="space-y-1">
        {entries.map((h) => {
          const t = teamOf(view, h.teamId);
          const cell = h.cellId !== "adjust" && h.cellId !== "final" ? findCell(content, h.cellId) : null;
          const what = h.cellId === "adjust" ? "manual" : h.cellId === "final" ? "Final Trivia" : cell ? `${cell.column.title} ${cell.question.value}` : "question";
          return (
            <li key={h.id} className={cn("flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm", h.undone && "opacity-40")}>
              <span className={cn("w-16 shrink-0 t-font font-extrabold tabular-nums", h.delta > 0 ? "text-[var(--t-sage)]" : h.delta < 0 ? "text-[var(--t-red)]" : "text-[var(--t-faint)]")}>
                {h.delta > 0 ? "+" : h.delta < 0 ? "−" : "±"}
                {Math.abs(h.delta).toLocaleString("en-US")}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", h.undone && "line-through")}>
                <span className="font-semibold" data-team="" style={{ "--team": t?.color } as React.CSSProperties}>
                  {t?.name ?? "Removed team"}
                </span>{" "}
                <span className="text-[var(--t-faint)]">
                  · {what}
                  {h.note ? ` · ${noteLabel[h.note]}` : ""}
                </span>
              </span>
              {!h.undone && (
                <button
                  type="button"
                  onClick={() => run({ type: "undo", historyId: h.id })}
                  aria-label={`Undo ${h.delta} for ${t?.name ?? "team"}`}
                  title="Undo this score change"
                  className="grid h-8 w-8 place-items-center rounded-md text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-ink)]"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Shortcuts() {
  const keys: Array<[string, string]> = [
    ["Space", "next step"],
    ["C / W", "correct / wrong"],
    ["R", "reveal answer"],
    ["B", "back to board"],
    ["H", "hide answers"],
  ];
  return (
    <div className="hidden border-t border-[var(--t-line)] px-4 py-3 lg:block">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--t-faint)]">
        {keys.map(([k, v]) => (
          <li key={k}>
            <kbd className="rounded border border-[var(--t-line-strong)] px-1.5 py-0.5 font-sans text-[var(--t-muted)]">{k}</kbd> {v}
          </li>
        ))}
      </ul>
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, kbd, type = "button" }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; kbd?: string; type?: "button" | "submit" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 items-center gap-2 rounded-lg bg-[var(--t-teal)] px-5 t-font text-base font-extrabold text-white transition-[background-color,transform] hover:bg-[var(--t-teal-strong)] active:scale-[0.98] disabled:opacity-40"
    >
      {children}
      {kbd && <kbd className="rounded border border-white/40 px-1.5 text-xs font-bold opacity-80">{kbd}</kbd>}
    </button>
  );
}

function SecondaryButton({ children, onClick, disabled, kbd }: { children: React.ReactNode; onClick: () => void; disabled?: boolean; kbd?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-[var(--t-line-strong)] px-4 text-sm font-semibold transition-colors hover:bg-slate-50 disabled:opacity-40"
    >
      {children}
      {kbd && <kbd className="rounded border border-[var(--t-line-strong)] px-1.5 text-xs text-[var(--t-faint)]">{kbd}</kbd>}
    </button>
  );
}

// ─── Behaviour ──────────────────────────────────────────────

/** Close the tools window, the buzz window and the Final Trivia clock when time runs out. */
function useAutoAdvance(view: TriviaView | null, serverNow: () => number, run: Run) {
  const sent = useRef<string | null>(null);
  useEffect(() => {
    if (!view) return;
    let deadline: number | null = null;
    let action: HostAction | null = null;
    if (view.phase === "question" && view.mode === "competitive" && view.turn?.windowEndsAt) {
      deadline = view.turn.windowEndsAt + 300;
      action = { type: "startAnswering" };
    } else if (view.phase === "buzzing" && view.buzz.closesAt) {
      deadline = view.buzz.closesAt + 500;
      action = { type: "timeout" };
    } else if (view.phase === "final_answer" && view.final?.deadline) {
      deadline = view.final.deadline + 2500;
      action = { type: "closeFinal" };
    }
    if (!deadline || !action) return;
    const key = `${view.phase}:${view.current?.cellId ?? ""}:${deadline}`;
    if (sent.current === key) return;
    const wait = Math.max(0, deadline - serverNow());
    const t = window.setTimeout(() => {
      sent.current = key;
      void run(action!);
    }, wait);
    return () => window.clearTimeout(t);
  }, [view, serverNow, run]);
}

function useShortcuts(view: TriviaView | null, run: Run, toggleHide: () => void, busy: boolean) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!view || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement)?.closest("input, textarea, select, [contenteditable]")) return;
      const key = e.key.toLowerCase();
      if (key === "h") {
        e.preventDefault();
        toggleHide();
        return;
      }
      if (busy) return;
      const p = view.phase;
      if (e.code === "Space") {
        // Let a focused button keep its own Space behaviour.
        if ((e.target as HTMLElement)?.closest("button, a, summary")) return;
        e.preventDefault();
        if (p === "lobby" && view.teams.some((t) => t.members.length > 0)) void run({ type: "start" });
        else if (p === "question") void run({ type: view.mode === "competitive" ? "startAnswering" : "openBuzzers" });
        else if (p === "reveal") void run({ type: "backToBoard" });
        else if (p === "final_wager") void run({ type: "showFinalQuestion" });
        return;
      }
      if ((p === "answering" || p === "dd_answer") && (key === "c" || key === "w")) {
        e.preventDefault();
        void run({ type: "judge", correct: key === "c" });
      } else if (key === "r") {
        if (["question", "buzzing", "answering", "dd_answer", "dd_wager"].includes(p)) void run({ type: "revealAnswer" });
        else if (p === "final_reveal") void run({ type: "revealFinalAnswer" });
      } else if (key === "b" && (p === "reveal" || p === "question")) {
        void run({ type: "backToBoard" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, run, toggleHide, busy]);
}
