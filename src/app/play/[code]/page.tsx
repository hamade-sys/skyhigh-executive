"use client";

/**
 * /play/[code] — the participant's phone.
 *
 * No account: a returning phone rejoins with the token it saved at
 * join (refresh, lock screen, flaky Wi-Fi — team and score intact). A
 * new phone sees the join form with the code filled in, then picks a
 * team (unless the host set teams to auto-assign).
 *
 * What the player sees follows the game: waiting room, the board when
 * it's their team's pick, the question with a buzzer, the Competitive
 * tools, wagers for a Daily Double or Final Trivia, a written Final
 * answer, and their team's finish. Answers never reach this screen
 * before the reveal, and a hint only reaches the team that unlocked it
 * (lib/trivia/views.ts).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Crown, Lightbulb, Loader2, LogOut, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { TOOL_INFO } from "@/lib/trivia/content";
import { api, ApiError, errorMessage } from "@/lib/trivia/client/api";
import { playerStore } from "@/lib/trivia/client/storage";
import { useCountdown, useTriviaRoom } from "@/lib/trivia/client/useRoom";
import { vibrate } from "@/lib/trivia/client/sounds";
import { isFresh } from "@/lib/trivia/client/fresh";
import type { ToolOption } from "@/lib/trivia/engine";
import type { ToolKind } from "@/lib/trivia/types";
import type { TriviaView, ViewTeam } from "@/lib/trivia/views";
import { JoinForm } from "@/components/trivia/JoinForm";
import { Wordmark } from "@/components/trivia/Wordmark";
import { TriviaBoard } from "@/components/trivia/TriviaBoard";
import { CountdownBar, CountdownRing } from "@/components/trivia/Countdown";
import { formatScore } from "@/components/trivia/PlayerChip";
import { TeamBadge, ToolIcon } from "@/components/trivia/Teams";
import { IcanStamp } from "@/components/trivia/IcanStamp";

type Stage =
  | { kind: "checking" }
  | { kind: "join"; title: string | null; missing: string | null }
  | { kind: "confirm"; name: string; token: string; title: string }
  | { kind: "play"; token: string };

export default function PlayerRoomPage() {
  const params = useParams<{ code: string }>();
  const router = useRouter();
  const code = normalizeRoomCode(params?.code ?? "");
  const [stage, setStage] = useState<Stage>({ kind: "checking" });

  useEffect(() => {
    let cancelled = false;
    async function rejoinView(token: string) {
      try {
        const res = await api<{ token: string; view: TriviaView }>(`/api/trivia/rooms/${code}/join`, { body: { token } });
        // A rejoin returns the same token; anything else means the old one was stale.
        return res.token === token ? res : null;
      } catch {
        return null;
      }
    }
    async function rejoin(token: string) {
      return Boolean(await rejoinView(token));
    }
    async function check() {
      if (!isRoomCode(code)) {
        setStage({ kind: "join", title: null, missing: null });
        return;
      }
      // This tab's own player: rejoin silently (a refresh, a locked screen).
      const saved = playerStore.get(code);
      if (saved) {
        const ok = await rejoin(saved.token);
        if (cancelled) return;
        if (ok) {
          setStage({ kind: "play", token: saved.token });
          return;
        }
        playerStore.forgetHere(code);
      }
      // Someone played from this browser before: ask, don't assume.
      const remembered = playerStore.getRemembered(code);
      if (remembered && remembered.token !== saved?.token) {
        const res = await rejoinView(remembered.token);
        if (cancelled) return;
        if (res) {
          setStage({ kind: "confirm", name: remembered.name ?? res.view.me?.name ?? "the last player", token: remembered.token, title: res.view.room.title });
          return;
        }
      }
      try {
        const res = await api<{ view: TriviaView }>(`/api/trivia/rooms/${code}`);
        if (cancelled) return;
        setStage({
          kind: "join",
          title: res.view.room.title,
          missing: res.view.room.status === "ended" ? "That game has finished." : null,
        });
      } catch (err) {
        if (cancelled) return;
        setStage({
          kind: "join",
          title: null,
          missing: err instanceof ApiError && err.status === 404 ? `No game is running with code ${code}.` : null,
        });
      }
    }
    void check();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (stage.kind === "play") {
    return (
      <PlayerGame
        code={code}
        token={stage.token}
        onLeave={() => {
          playerStore.clear(code);
          router.replace("/play");
        }}
      />
    );
  }

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-8 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <Wordmark size="lg" />
        {stage.kind === "checking" ? (
          <Loader2 className="h-8 w-8 animate-spin text-[var(--t-muted)]" aria-label="Finding your game" />
        ) : stage.kind === "confirm" ? (
          <div className="w-full max-w-sm space-y-4 text-center">
            <p className="text-[var(--t-muted)]">
              Someone already joined <span className="font-semibold text-[var(--t-ink)]">{stage.title}</span> from this browser.
            </p>
            <button
              type="button"
              onClick={() => {
                const remembered = playerStore.getRemembered(code);
                if (remembered) playerStore.adopt(code, remembered);
                setStage({ kind: "play", token: stage.token });
              }}
              className="h-16 w-full rounded-2xl bg-[var(--t-teal)] t-font text-xl font-extrabold text-white hover:bg-[var(--t-teal-strong)]"
            >
              Continue as {stage.name}
            </button>
            <button
              type="button"
              onClick={() => setStage({ kind: "join", title: stage.title, missing: null })}
              className="h-14 w-full rounded-2xl border-2 border-[var(--t-line-strong)] font-semibold"
            >
              I&apos;m someone else
            </button>
          </div>
        ) : (
          <>
            {stage.missing && (
              <p role="status" className="w-full max-w-sm rounded-xl border border-[var(--t-line-strong)] bg-[var(--t-panel)] px-4 py-3 text-center text-sm text-[var(--t-muted)]">
                {stage.missing} Check the code on the big screen.
              </p>
            )}
            <JoinForm
              initialCode={isRoomCode(code) ? code : ""}
              lockCode={isRoomCode(code) && !stage.missing}
              roomTitle={stage.title}
              onJoined={({ code: joined, token }) => {
                if (joined !== code) router.replace(`/play/${joined}`);
                else setStage({ kind: "play", token });
              }}
            />
          </>
        )}
      </div>
    </main>
  );
}

// ─── In-game ────────────────────────────────────────────────

type Act = ReturnType<typeof useTriviaRoom>["act"];
type Say = (m: string) => void;

function PlayerGame({ code, token, onLeave }: { code: string; token: string; onLeave: () => void }) {
  const { view, error, connection, act, serverNow } = useTriviaRoom(code, { role: "player", token });
  const [toast, setToast] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const toastTimer = useRef<number | null>(null);

  const say = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  useWakeLock(Boolean(view && view.phase !== "ended"));

  if (!view) {
    return (
      <main className="grid flex-1 place-items-center px-6 text-center">
        {error ? (
          <div className="space-y-4">
            <p className="text-lg font-semibold">{error.message}</p>
            <button type="button" onClick={onLeave} className="rounded-full border border-[var(--t-line-strong)] px-5 py-2.5 text-sm font-semibold">
              Join another game
            </button>
          </div>
        ) : (
          <Loader2 className="h-8 w-8 animate-spin text-[var(--t-muted)]" aria-label="Loading the game" />
        )}
      </main>
    );
  }

  const me = view.me;
  if (!me) {
    return (
      <main className="grid flex-1 place-items-center px-6 text-center">
        <div className="max-w-xs space-y-4">
          <p className="t-font text-2xl font-extrabold">You&apos;re out of this game</p>
          <p className="text-[var(--t-muted)]">The host removed you from room {code}.</p>
          <button type="button" onClick={onLeave} className="rounded-lg bg-[var(--t-teal)] px-5 py-2.5 text-sm font-bold text-white">
            Back to join
          </button>
        </div>
      </main>
    );
  }

  const team = view.teams.find((t) => t.id === me.teamId) ?? null;
  const showPicker = !team || (picking && me.canChooseTeam);

  return (
    <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      <TopBar view={view} team={team} onLeave={onLeave} />
      {connection === "offline" && (
        <div role="status" className="flex items-center justify-center gap-2 bg-rose-50 px-4 py-2 text-sm text-rose-700">
          <WifiOff className="h-4 w-4" /> Reconnecting…
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
        {showPicker ? (
          <TeamPicker
            view={view}
            current={me.teamId}
            onPick={async (teamId) => {
              try {
                await act({ type: "chooseTeam", teamId });
                vibrate(20);
                setPicking(false);
              } catch (err) {
                say(errorMessage(err));
              }
            }}
            onCancel={team ? () => setPicking(false) : undefined}
          />
        ) : (
          <PhaseView view={view} team={team!} act={act} serverNow={serverNow} say={say} onChangeTeam={() => setPicking(true)} />
        )}
      </div>
      {team && <ResultFlash view={view} teamId={team.id} />}
      {team && <ToolFlash view={view} myTeamId={team.id} />}
      {toast && (
        <div role="status" className="t-rise pointer-events-none absolute inset-x-4 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-30 rounded-2xl bg-[#1f2b2d] px-4 py-3 text-center text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}
    </main>
  );
}

function TopBar({ view, team, onLeave }: { view: TriviaView; team: ViewTeam | null; onLeave: () => void }) {
  const me = view.me!;
  const [confirm, setConfirm] = useState(false);
  return (
    <header
      className="flex items-center gap-3 border-b border-[var(--t-line)] bg-[var(--t-bg-2)] px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
      style={team ? { boxShadow: `inset 0 3px 0 ${team.color}` } : undefined}
    >
      {team ? <TeamBadge name={team.name} color={team.color} size={42} /> : <span className="h-[42px] w-[42px] rounded-[30%] border-2 border-dashed border-[var(--t-line-strong)]" aria-hidden />}
      <div className="min-w-0 flex-1">
        <p className="truncate t-font text-lg font-extrabold leading-tight text-[var(--t-ink)]">
          {team ? team.name : "Pick a team"}
        </p>
        <p className="truncate text-xs text-[var(--t-faint)]">
          {me.name} · Room <span className="font-mono tracking-wider text-[var(--t-muted)]">{view.room.code}</span>
          {me.isController && view.phase === "board" && (
            <span className="ml-2 inline-flex items-center gap-1 text-[var(--t-teal-deep)]">
              <Crown className="h-3 w-3" aria-hidden /> your pick
            </span>
          )}
        </p>
      </div>
      {team && (
        <div className="text-right">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Team score</p>
          <p className={cn("t-font text-2xl font-extrabold tabular-nums leading-none", team.score < 0 && "text-[var(--t-red)]")}>{formatScore(team.score)}</p>
        </div>
      )}
      {confirm ? (
        <div className="flex items-center gap-1">
          <button type="button" onClick={onLeave} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-bold text-white">
            Leave
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="rounded-full px-2 py-2 text-xs text-[var(--t-muted)]">
            Stay
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label="Leave this game"
          className="grid h-11 w-11 place-items-center rounded-full text-[var(--t-faint)] hover:bg-slate-50 hover:text-[var(--t-ink)]"
        >
          <LogOut className="h-5 w-5" />
        </button>
      )}
    </header>
  );
}

function TeamPicker({
  view,
  current,
  onPick,
  onCancel,
}: {
  view: TriviaView;
  current: string | null;
  onPick: (teamId: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="text-center">
        <p className="t-font text-3xl font-extrabold">Pick your team</p>
        <p className="mt-1 text-[var(--t-muted)]">Everyone on a team shares one score and one buzzer.</p>
      </div>
      <ul className="space-y-3">
        {view.teams.map((t) => {
          const mine = t.id === current;
          return (
            <li key={t.id}>
              <button
                type="button"
                disabled={busy !== null}
                onClick={async () => {
                  setBusy(t.id);
                  await onPick(t.id);
                  setBusy(null);
                }}
                aria-pressed={mine}
                className={cn(
                  "flex w-full items-center gap-4 rounded-2xl border-2 bg-[var(--t-panel)] p-4 text-left transition-[transform,border-color] active:scale-[0.99]",
                  mine ? "border-white" : "border-transparent hover:border-[var(--t-line-strong)]",
                )}
              >
                <TeamBadge name={t.name} color={t.color} size={52} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate t-font text-xl font-extrabold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
                    {t.name}
                  </span>
                  <span className="block truncate text-sm text-[var(--t-muted)]">
                    {t.members.length === 0 ? "No one yet" : t.members.map((m) => m.name).join(", ")}
                  </span>
                </span>
                {busy === t.id ? <Loader2 className="h-5 w-5 animate-spin" aria-label="Joining team" /> : mine ? <Check className="h-6 w-6" aria-label="Your team" /> : null}
              </button>
            </li>
          );
        })}
      </ul>
      {onCancel && (
        <button type="button" onClick={onCancel} className="mx-auto rounded-full px-4 py-2 text-sm text-[var(--t-muted)] hover:text-[var(--t-ink)]">
          Keep my team
        </button>
      )}
    </div>
  );
}

function PhaseView({
  view,
  team,
  act,
  serverNow,
  say,
  onChangeTeam,
}: {
  view: TriviaView;
  team: ViewTeam;
  act: Act;
  serverNow: () => number;
  say: Say;
  onChangeTeam: () => void;
}) {
  const me = view.me!;
  const teamName = (id: string | null) => view.teams.find((t) => t.id === id)?.name ?? "A team";

  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} team={team} onChangeTeam={onChangeTeam} />;

    case "board": {
      if (me.canPick) {
        return (
          <div className="flex flex-1 flex-col gap-4">
            <Headline kicker={view.mode === "competitive" ? "Your team's turn" : "Your team's pick"} title="Choose a question" />
            <div className="min-h-[300px] flex-1">
              <TriviaBoard
                board={view.board}
                teams={view.teams}
                rows={view.rowValues.length}
                canSelect
                compact
                onSelect={async (cellId) => {
                  try {
                    await act({ type: "pick", cellId });
                    vibrate(20);
                  } catch (err) {
                    say(errorMessage(err));
                  }
                }}
              />
            </div>
          </div>
        );
      }
      const picker = view.controllerTeamId ? teamName(view.controllerTeamId) : null;
      return (
        <Waiting
          title={view.remaining === 0 ? "Board cleared" : picker ? `${picker} ${view.mode === "competitive" ? "are up" : "are picking"}` : "The host is picking"}
          body={view.remaining === 0 ? (view.hasFinal ? "Final Trivia is next." : "Hang tight for the results.") : "Watch the big screen for the next question."}
          view={view}
        />
      );
    }

    case "question":
    case "buzzing":
    case "answering":
      return view.mode === "competitive" ? (
        <CompetitiveQuestion view={view} team={team} act={act} serverNow={serverNow} say={say} />
      ) : (
        <QuestionAndBuzzer view={view} team={team} act={act} serverNow={serverNow} say={say} />
      );

    case "dd_wager": {
      if (view.controllerTeamId === team.id && me.wagerRange) {
        return (
          <div className="flex flex-1 flex-col gap-6">
            <DailyDoubleBadge category={view.current?.columnTitle ?? ""} />
            <WagerForm
              label="Your team's Daily Double wager"
              range={me.wagerRange}
              score={team.score}
              presets={[
                { label: "Minimum", value: me.wagerRange.min },
                { label: "Half", value: Math.max(me.wagerRange.min, Math.round(me.wagerRange.max / 2)) },
                { label: team.score >= me.wagerRange.max ? "All in" : "Maximum", value: me.wagerRange.max },
              ]}
              submit={(amount) => act({ type: "wager", amount })}
              say={say}
            />
          </div>
        );
      }
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <DailyDoubleBadge category={view.current?.columnTitle ?? ""} />
          <p className="text-[var(--t-muted)]">{view.controllerTeamId ? `${teamName(view.controllerTeamId)} are placing a wager.` : "The host is choosing who answers."}</p>
        </div>
      );
    }

    case "dd_answer":
      return (
        <div className="flex flex-1 flex-col gap-5">
          <QuestionCard view={view} />
          {view.controllerTeamId === team.id ? (
            <UpNow team={team} sub={`for ${formatScore(view.wager ?? 0)} points`} />
          ) : (
            <p className="text-center text-[var(--t-muted)]">
              {teamName(view.controllerTeamId)} are answering for {formatScore(view.wager ?? 0)}.
            </p>
          )}
        </div>
      );

    case "reveal":
      return (
        <div className="flex flex-1 flex-col gap-5">
          <QuestionCard view={view} />
          <div className="t-zoom-in rounded-3xl bg-[var(--t-panel)] p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Answer</p>
            <p className="mt-2 t-font text-2xl font-extrabold text-[var(--t-teal-deep)]">{view.current?.answer}</p>
          </div>
        </div>
      );

    case "final_wager": {
      const wagered = me.finalWager !== null;
      return (
        <div className="flex flex-1 flex-col gap-6">
          <FinalBadge category={view.final?.category ?? ""} />
          {me.wagerRange && !wagered ? (
            me.wagerRange.max === 0 ? (
              <WagerZero submit={() => act({ type: "wager", amount: 0 })} say={say} />
            ) : (
              <WagerForm
                label="Your team's Final Trivia wager"
                range={me.wagerRange}
                score={team.score}
                presets={[
                  { label: "Nothing", value: 0 },
                  { label: "Half", value: Math.round(me.wagerRange.max / 2) },
                  { label: "Everything", value: me.wagerRange.max },
                ]}
                submit={(amount) => act({ type: "wager", amount })}
                say={say}
              />
            )
          ) : (
            <Locked title={`Wager locked: ${formatScore(me.finalWager ?? 0)}`} body="Any teammate can lock it in. Waiting for the Final Trivia question…" />
          )}
        </div>
      );
    }

    case "final_answer":
      return <FinalAnswer view={view} act={act} serverNow={serverNow} say={say} />;

    case "final_reveal": {
      const mine = view.final?.responses.find((r) => r.teamId === team.id);
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
          <FinalBadge category={view.final?.category ?? ""} />
          <div className="w-full rounded-3xl bg-[var(--t-panel)] p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Your team wrote</p>
            <p className="mt-2 text-xl font-semibold">{me.finalAnswer || "— nothing —"}</p>
            <p className="mt-1 text-sm text-[var(--t-muted)]">Wager {formatScore(me.finalWager ?? 0)}</p>
            {mine?.correct === true && <p className="mt-4 t-font text-xl font-extrabold text-[var(--t-sage)]">Correct!</p>}
            {mine?.correct === false && <p className="mt-4 t-font text-xl font-extrabold text-[var(--t-red)]">Not this time</p>}
          </div>
          {view.final?.answer && (
            <p className="text-[var(--t-muted)]">
              The answer: <span className="font-bold text-[var(--t-teal-deep)]">{view.final.answer}</span>
            </p>
          )}
          <p className="text-sm text-[var(--t-faint)]">Watch the big screen for the reveal.</p>
        </div>
      );
    }

    case "ended":
      return <Finished view={view} team={team} />;
  }
}

function Headline({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--t-teal-deep)]">{kicker}</p>
      <h1 className="t-font text-2xl font-extrabold text-[var(--t-ink)]">{title}</h1>
    </div>
  );
}

function Lobby({ view, team, onChangeTeam }: { view: TriviaView; team: ViewTeam; onChangeTeam: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-7 text-center">
      <div className="t-pop-in">
        <TeamBadge name={team.name} color={team.color} size={112} className="mx-auto shadow-[0_0_0_8px_rgba(2,121,127,0.08)]" />
        <p className="mt-5 t-font text-3xl font-extrabold">You&apos;re in!</p>
        <p className="mt-1 text-lg">
          Playing for{" "}
          <span className="font-bold" data-team="plain" style={{ "--team": team.color } as React.CSSProperties}>
            {team.name}
          </span>
        </p>
        <p className="mt-2 text-[var(--t-muted)]">Look up at the big screen. The game starts when the host is ready.</p>
        {view.me?.canChooseTeam && view.teams.length > 1 && (
          <button type="button" onClick={onChangeTeam} className="mt-4 rounded-full border border-[var(--t-line-strong)] px-4 py-2 text-sm font-semibold hover:bg-slate-50">
            Change team
          </button>
        )}
      </div>
      <ul className="w-full space-y-2 text-left">
        {view.teams.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-2xl bg-[var(--t-panel)] px-4 py-3">
            <TeamBadge name={t.name} color={t.color} size={32} />
            <span className="min-w-0 flex-1">
              <span className="block t-font font-extrabold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
                {t.name}
              </span>
              <span className="block truncate text-sm text-[var(--t-muted)]">{t.members.length ? t.members.map((m) => m.name).join(", ") : "No one yet"}</span>
            </span>
            <span className="text-sm tabular-nums text-[var(--t-faint)]">{t.members.length}</span>
          </li>
        ))}
      </ul>
      {view.mode === "competitive" && (
        <p className="rounded-xl border border-[var(--t-line)] px-4 py-3 text-sm text-[var(--t-muted)]">
          Competitive mode: teams take turns, and your team has tools — steal, block, swap, skip, double down and hints. They&apos;ll appear here during each question.
        </p>
      )}
      {view.settings.phraseAsQuestion && (
        <p className="rounded-xl border border-[var(--t-line)] px-4 py-3 text-sm text-[var(--t-muted)]">House rule: answer in the form of a question — “What is…?”</p>
      )}
    </div>
  );
}

function Waiting({ title, body, view }: { title: string; body: string; view: TriviaView }) {
  return (
    <div className="flex flex-1 flex-col gap-5">
      <div className="text-center">
        <p className="t-font text-2xl font-extrabold">{title}</p>
        <p className="mt-1 text-[var(--t-muted)]">{body}</p>
      </div>
      <div className="min-h-[220px] flex-1 opacity-80">
        <TriviaBoard board={view.board} teams={view.teams} rows={view.rowValues.length} compact />
      </div>
    </div>
  );
}

function QuestionCard({ view }: { view: TriviaView }) {
  const cur = view.current;
  if (!cur) return null;
  return (
    <div className="shrink-0 rounded-3xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="t-category text-sm text-[var(--t-muted)]">{cur.columnTitle}</p>
        <p className="rounded-lg bg-[var(--t-teal-deep)] px-2.5 py-0.5 t-font text-lg font-extrabold text-white">{formatScore(cur.dailyDouble && view.wager ? view.wager : cur.value)}</p>
      </div>
      {cur.question ? (
        <>
          <p className="mt-3 text-xl font-semibold leading-snug text-[var(--t-ink)]">{cur.question}</p>
          {cur.imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cur.imageUrl} alt="" className="mt-4 max-h-48 w-full rounded-xl object-contain" />
          )}
        </>
      ) : (
        <p className="mt-3 text-[var(--t-muted)]">Get ready…</p>
      )}
      {cur.hint && (
        <p className="t-zoom-in mt-4 flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-amber-900">
          <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>
            <span className="sr-only">Hint: </span>
            {cur.hint}
          </span>
        </p>
      )}
    </div>
  );
}

function UpNow({ team, sub }: { team: ViewTeam; sub: string }) {
  return (
    <div className="t-zoom-in rounded-3xl border-2 p-6 text-center" style={{ borderColor: team.color, background: `${team.color}1f` }}>
      <p className="t-font text-2xl font-extrabold">Your team is up!</p>
      <p className="mt-1 text-[var(--t-muted)]">{sub}</p>
    </div>
  );
}

type BuzzLocal = "idle" | "pending" | "early";

/** The buzzer — Traditional questions, and Competitive rebounds. */
function Buzzer({ view, team, act, say, compact = false }: { view: TriviaView; team: ViewTeam; act: Act; say: Say; compact?: boolean }) {
  const me = view.me!;
  const [local, setLocal] = useState<BuzzLocal>("idle");
  const earlyTimer = useRef<number | null>(null);
  const winnerTeam = view.teams.find((t) => t.id === view.buzz.winnerTeamId);
  const ours = view.phase === "answering" && view.buzz.winnerTeamId === team.id;
  const lockedOut = me.lockedOut;
  const iBuzzed = view.buzz.winnerPlayerId === me.id;

  useEffect(() => {
    if (ours) vibrate([40, 40, 80]);
  }, [ours]);

  const press = useCallback(async () => {
    if (local !== "idle") return;
    if (view.phase === "question") {
      // Jeopardy rule: buzzing before the buzzers open locks you out briefly.
      setLocal("early");
      vibrate(120);
      if (earlyTimer.current) window.clearTimeout(earlyTimer.current);
      earlyTimer.current = window.setTimeout(() => setLocal("idle"), 650);
      return;
    }
    if (view.phase !== "buzzing" || lockedOut) return;
    setLocal("pending");
    vibrate(25);
    try {
      const res = await act({ type: "buzz" });
      if (res.note === "beaten") say("So close — another team got there first.");
      else if (res.note === "closed") say("Buzzers just closed.");
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setLocal("idle");
    }
  }, [local, view.phase, lockedOut, act, say]);

  // Space / Enter buzz for anyone playing on a laptop.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || (e.target as HTMLElement)?.closest("input, textarea, select, button")) return;
      if (e.code === "Space" || e.key === "Enter") {
        e.preventDefault();
        void press();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [press]);

  let label = "Get ready";
  let sub = "Buzzers open when the host has read the question.";
  let tone: "dim" | "open" | "won" | "out" | "early" = "dim";
  if (local === "early") {
    label = "Too early!";
    sub = "Wait for the buzzers to open.";
    tone = "early";
  } else if (view.phase === "buzzing" && lockedOut) {
    label = "Your team is out";
    sub = "Other teams can still buzz in.";
    tone = "out";
  } else if (view.phase === "buzzing") {
    label = local === "pending" ? "Buzzing…" : "BUZZ";
    sub = view.mode === "competitive" ? "Rebound! First team in answers." : "Tap — first team in answers.";
    tone = "open";
  } else if (ours) {
    label = "You're up!";
    sub = iBuzzed ? "You buzzed — answer out loud." : `${view.players.find((p) => p.id === view.buzz.winnerPlayerId)?.name ?? "Your teammate"} buzzed — answer together.`;
    tone = "won";
  } else if (view.phase === "answering") {
    label = `${winnerTeam?.name ?? "A team"} buzzed`;
    sub = lockedOut ? "Waiting for the host." : "If they miss, you might get another chance.";
    tone = "out";
  }

  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-4", compact ? "min-h-[220px]" : "min-h-[260px]")}>
      <button
        type="button"
        onPointerDown={(e) => {
          // pointerdown, not click: every millisecond counts in a buzz race.
          e.preventDefault();
          void press();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            void press();
          }
        }}
        aria-label={label}
        aria-live="polite"
        className={cn(
          // The buzzer is the ICAN stamp itself — the seal from the logo.
          "relative grid aspect-square select-none place-items-center t-font font-extrabold transition-transform duration-150 [touch-action:manipulation]",
          compact ? "w-[min(60vw,240px,34vh)]" : "w-[min(76vw,340px,46vh)]",
          tone === "open" && "text-[clamp(2.5rem,13vw,4.5rem)] text-white active:scale-[0.95]",
          tone === "dim" && "text-3xl text-slate-400",
          tone === "won" && "text-4xl text-slate-900",
          tone === "out" && "px-6 text-center text-2xl text-slate-500",
          tone === "early" && "t-shake text-3xl text-white",
        )}
      >
        {tone === "open" && <IcanStamp className="t-ring pointer-events-none absolute inset-0 h-full w-full text-[var(--t-teal)]" />}
        <IcanStamp
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full drop-shadow-[0_12px_20px_rgba(2,121,127,0.28)] transition-colors duration-150",
            tone === "open" && "text-[var(--t-teal)]",
            tone === "dim" && "text-slate-200",
            tone === "out" && "text-slate-100",
            tone === "early" && "text-rose-500",
          )}
          style={tone === "won" ? { color: team.color } : undefined}
        />
        <span className="relative px-8 text-center leading-tight">{label}</span>
      </button>
      <p className="text-center text-sm text-[var(--t-muted)]">{sub}</p>
    </div>
  );
}

function QuestionAndBuzzer({ view, team, act, serverNow, say }: { view: TriviaView; team: ViewTeam; act: Act; serverNow: () => number; say: Say }) {
  const buzzLeft = useCountdown(view.phase === "buzzing" ? view.buzz.closesAt : null, serverNow);
  const answerLeft = useCountdown(view.phase === "answering" ? view.buzz.answerDeadline : null, serverNow);
  return (
    <div className="flex flex-1 flex-col gap-4">
      <QuestionCard view={view} />
      {view.phase === "buzzing" && view.buzz.closesAt && <CountdownBar left={buzzLeft} total={view.settings.buzzWindowSec * 1000} />}
      <Buzzer view={view} team={team} act={act} say={say} />
      {view.phase === "answering" && <CountdownRing left={answerLeft} total={view.settings.answerTimeSec * 1000} size={72} className="mx-auto" />}
    </div>
  );
}

/** Competitive: who holds the question, the tools window, then answering or a rebound buzz. */
function CompetitiveQuestion({ view, team, act, serverNow, say }: { view: TriviaView; team: ViewTeam; act: Act; serverNow: () => number; say: Say }) {
  const turn = view.turn;
  const windowLeft = useCountdown(view.phase === "question" ? turn?.windowEndsAt : null, serverNow, 200);
  const answerLeft = useCountdown(view.phase === "answering" ? view.buzz.answerDeadline : null, serverNow);
  const holderId = view.phase === "answering" ? view.buzz.winnerTeamId : turn?.answeringTeamId ?? null;
  const holder = view.teams.find((t) => t.id === holderId);
  const ours = holderId === team.id;
  const doubled = Boolean(holderId && turn?.doubleDown.includes(holderId));
  const blocked = Boolean(turn?.blocked.includes(team.id));
  const swapped = turn?.swappedTo === holderId && Boolean(holderId);
  const answerTotal = (swapped && view.phase === "answering" ? view.settings.swapAnswerSec : view.settings.answerTimeSec) * 1000;

  return (
    <div className="flex flex-1 flex-col gap-4">
      <QuestionCard view={view} />

      {view.phase === "buzzing" ? (
        <Buzzer view={view} team={team} act={act} say={say} compact={(view.me?.tools.length ?? 0) > 0} />
      ) : (
        <div
          className="rounded-3xl border-2 p-5 text-center"
          style={holder ? { borderColor: holder.color, background: ours ? `${holder.color}1f` : undefined } : { borderColor: "var(--t-line-strong)" }}
        >
          {blocked ? (
            <p className="t-font text-xl font-extrabold text-[var(--t-red)]">Your team is blocked from this question</p>
          ) : holder ? (
            <>
              <p className="t-font text-2xl font-extrabold" data-team="" style={{ "--team": holder.color } as React.CSSProperties}>
                {ours ? "Your team's question" : `${holder.name} have this question`}
              </p>
              <p className="mt-1 text-sm text-[var(--t-muted)]">
                {view.phase === "question" ? (ours ? "Answer clock starts soon — use a tool now if you want one." : "Use a tool before their clock starts.") : ours ? "Answer out loud!" : "They're answering."}
                {doubled && " · Double Down!"}
              </p>
            </>
          ) : (
            <p className="t-font text-xl font-extrabold">Open to a buzz in a moment…</p>
          )}
          <div className="mt-3 flex justify-center">
            {view.phase === "question" && turn?.windowEndsAt && <CountdownBar left={windowLeft} total={view.settings.toolWindowSec * 1000} className="max-w-xs" />}
            {view.phase === "answering" && view.buzz.answerDeadline && <CountdownRing left={answerLeft} total={answerTotal} size={64} />}
          </div>
        </div>
      )}

      <ToolsPanel view={view} act={act} say={say} />
    </div>
  );
}

function ToolsPanel({ view, act, say }: { view: TriviaView; act: Act; say: Say }) {
  const tools = view.me?.tools ?? [];
  const [armed, setArmed] = useState<ToolKind | null>(null);
  const [busy, setBusy] = useState(false);
  // Disarm when the moment passes.
  const phaseKey = `${view.phase}:${view.current?.cellId ?? ""}`;
  const lastKey = useRef(phaseKey);
  useEffect(() => {
    if (lastKey.current !== phaseKey) {
      lastKey.current = phaseKey;
       
      setArmed(null);
    }
  }, [phaseKey]);

  if (tools.length === 0) return null;
  const usable = tools.filter((t) => !t.disabled);

  async function use(tool: ToolKind, targetTeamId?: string) {
    setBusy(true);
    try {
      await act({ type: "useTool", tool, targetTeamId });
      vibrate([20, 30, 20]);
      setArmed(null);
    } catch (err) {
      say(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const armedOption = tools.find((t) => t.tool === armed) ?? null;

  return (
    <section aria-label="Your team's tools" className="rounded-3xl border border-[var(--t-line)] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--t-faint)]">Team tools</h2>
        <p className="text-xs text-[var(--t-faint)]">{usable.length ? "Tap to choose, tap again to use" : "Nothing to play right now"}</p>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {tools.map((t) => (
          <li key={t.tool}>
            <ToolButton option={t} armed={armed === t.tool} onClick={() => setArmed(armed === t.tool ? null : t.tool)} />
          </li>
        ))}
      </ul>
      {armedOption && !armedOption.disabled && (
        <div className="t-rise mt-3 rounded-2xl border border-[var(--t-teal-deep)]/30 bg-[var(--t-teal-soft)] p-4">
          <p className="font-semibold text-[var(--t-ink)]">{TOOL_INFO[armedOption.tool].label}</p>
          <p className="mt-0.5 text-sm text-[var(--t-muted)]">
            {armedOption.tool === "swap"
              ? `Hand your question to another team — they get ${view.settings.swapAnswerSec} seconds, then it comes back to you.`
              : TOOL_INFO[armedOption.tool].blurb}
          </p>
          {armedOption.targets ? (
            <div className="mt-3 grid gap-2">
              {armedOption.targets.map((id) => {
                const target = view.teams.find((x) => x.id === id);
                if (!target) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => use(armedOption.tool, id)}
                    className="flex min-h-12 items-center gap-3 rounded-xl px-4 font-bold text-slate-900 disabled:opacity-50"
                    style={{ background: target.color }}
                  >
                    <ToolIcon tool={armedOption.tool} className="h-5 w-5" />
                    {armedOption.tool === "block" ? "Block" : "Swap with"} {target.name}
                  </button>
                );
              })}
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => use(armedOption.tool)}
              className="relative mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--t-teal)] t-font text-lg font-extrabold text-white hover:bg-[var(--t-teal-strong)] disabled:opacity-50"
            >
              <span className={cn("inline-flex items-center gap-2", busy && "invisible")}>
                <ToolIcon tool={armedOption.tool} className="h-5 w-5" /> Use {TOOL_INFO[armedOption.tool].label}
              </span>
              {busy && <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin" aria-label="Using tool" />}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ToolButton({ option, armed, onClick }: { option: ToolOption; armed: boolean; onClick: () => void }) {
  const off = Boolean(option.disabled);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={off}
      aria-pressed={armed}
      aria-describedby={off ? `tool-${option.tool}-why` : undefined}
      className={cn(
        "flex min-h-[76px] w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 px-1 py-2 text-center transition-colors",
        armed ? "border-[var(--t-teal-deep)] bg-[var(--t-teal-soft)]" : "border-[var(--t-line)] bg-[var(--t-panel)]",
        off && "opacity-40",
      )}
    >
      <span className="relative">
        <ToolIcon tool={option.tool} className="h-6 w-6" />
        <span className="absolute -right-3 -top-2 rounded-full bg-[var(--t-teal-deep)] px-1.5 text-[10px] font-bold leading-4 text-white">{option.left}</span>
      </span>
      <span className="text-xs font-semibold leading-tight">{TOOL_INFO[option.tool].label}</span>
      {off && (
        <span id={`tool-${option.tool}-why`} className="sr-only">
          {option.disabled}
        </span>
      )}
    </button>
  );
}

function DailyDoubleBadge({ category }: { category: string }) {
  return (
    <div className="relative mx-auto grid w-full max-w-xs place-items-center py-6 text-center">
      <IcanStamp className="t-stamp absolute h-56 w-56 text-[var(--t-teal-deep)]/15" />
      <p className="relative t-font text-4xl font-extrabold leading-none text-[var(--t-teal-deep)]">
        Daily
        <br />
        Double
      </p>
      {category && <p className="relative mt-3 t-category text-sm text-[var(--t-muted)]">{category}</p>}
    </div>
  );
}

function FinalBadge({ category }: { category: string }) {
  return (
    <div className="text-center">
      <p className="t-font text-3xl font-extrabold text-[var(--t-teal-deep)]">Final Trivia</p>
      <p className="mt-2 t-category text-lg text-[var(--t-ink)]">{category}</p>
    </div>
  );
}

function WagerForm({
  label,
  range,
  score,
  presets,
  submit,
  say,
}: {
  label: string;
  range: { min: number; max: number };
  score: number;
  presets: Array<{ label: string; value: number }>;
  submit: (amount: number) => Promise<unknown>;
  say: Say;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const amount = Number(value);
  const valid = value !== "" && Number.isInteger(amount) && amount >= range.min && amount <= range.max;
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        setBusy(true);
        try {
          await submit(amount);
          vibrate(30);
        } catch (err) {
          say(errorMessage(err));
          setBusy(false);
        }
      }}
    >
      <label htmlFor="wager" className="block text-center text-sm font-semibold text-[var(--t-muted)]">
        {label}
      </label>
      <input
        id="wager"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/\D/g, "").slice(0, 7))}
        placeholder={String(range.min)}
        aria-describedby="wager-range"
        className="h-20 w-full rounded-2xl border-2 border-[var(--t-line-strong)] bg-[var(--t-panel)] text-center t-font text-5xl font-extrabold tabular-nums text-[var(--t-teal-deep)] placeholder:text-slate-300 focus:border-[var(--t-teal-deep)] focus:outline-none"
      />
      <p id="wager-range" className="text-center text-sm text-[var(--t-faint)]">
        Between {formatScore(range.min)} and {formatScore(range.max)} · your team has {formatScore(score)}
      </p>
      <div className="grid grid-cols-3 gap-2">
        {presets.map((p) => (
          <button key={p.label} type="button" onClick={() => setValue(String(p.value))} className="min-h-11 rounded-xl border border-[var(--t-line-strong)] px-2 py-2 text-sm font-semibold hover:bg-slate-50">
            {p.label}
            <span className="block text-xs font-normal text-[var(--t-faint)]">{formatScore(p.value)}</span>
          </button>
        ))}
      </div>
      <button type="submit" disabled={!valid || busy} className="relative h-16 w-full rounded-2xl bg-[var(--t-teal)] t-font text-xl font-extrabold text-white hover:bg-[var(--t-teal-strong)] disabled:opacity-40">
        <span className={busy ? "invisible" : undefined}>Lock in wager</span>
        {busy && <Loader2 className="absolute inset-0 m-auto h-6 w-6 animate-spin" aria-label="Saving" />}
      </button>
    </form>
  );
}

function WagerZero({ submit, say }: { submit: () => Promise<unknown>; say: Say }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-4 text-center">
      <p className="text-[var(--t-muted)]">Your team needs points above zero to wager — you&apos;ll play for pride. You can still write an answer.</p>
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await submit();
          } catch (err) {
            say(errorMessage(err));
            setBusy(false);
          }
        }}
        className="h-14 w-full rounded-2xl bg-[var(--t-teal)] t-font text-lg font-extrabold text-white disabled:opacity-50"
      >
        We&apos;re ready
      </button>
    </div>
  );
}

function Locked({ title, body }: { title: string; body: string }) {
  return (
    <div className="t-zoom-in rounded-3xl border border-[var(--t-line)] bg-[var(--t-panel)] p-6 text-center">
      <p className="t-font text-2xl font-extrabold">{title}</p>
      <p className="mt-2 text-[var(--t-muted)]">{body}</p>
    </div>
  );
}

function FinalAnswer({ view, act, serverNow, say }: { view: TriviaView; act: Act; serverNow: () => number; say: Say }) {
  const me = view.me!;
  const [draft, setDraft] = useState(me.finalAnswer ?? "");
  const [busy, setBusy] = useState(false);
  const left = useCountdown(view.final?.deadline, serverNow, 250);
  const submitted = me.finalAnswer ?? "";
  const dirty = draft.trim() !== submitted;
  const autoSent = useRef(false);

  const send = useCallback(
    async (text: string) => {
      setBusy(true);
      try {
        await act({ type: "finalAnswer", text });
        vibrate(25);
      } catch (err) {
        say(errorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [act, say],
  );

  // Last second: send whatever is typed so nobody loses an answer to the clock.
  useEffect(() => {
    if (left !== null && left < 1500 && dirty && draft.trim() && !autoSent.current) {
      autoSent.current = true;
      void send(draft.trim());
    }
  }, [left, dirty, draft, send]);

  const timeUp = left === 0;
  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <FinalBadge category={view.final?.category ?? ""} />
        <CountdownRing left={left} total={view.settings.finalTimeSec * 1000} size={72} />
      </div>
      <div className="rounded-3xl border border-[var(--t-line)] bg-[var(--t-panel)] p-5">
        <p className="text-xl font-semibold leading-snug">{view.final?.question}</p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (draft.trim()) void send(draft.trim());
        }}
      >
        <label htmlFor="final-answer" className="block text-sm font-semibold text-[var(--t-muted)]">
          Your team&apos;s answer {me.finalWager !== null && <span className="font-normal text-[var(--t-faint)]">· wager {formatScore(me.finalWager)}</span>}
        </label>
        <textarea
          id="final-answer"
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 200))}
          rows={3}
          disabled={timeUp}
          placeholder={view.settings.phraseAsQuestion ? "What is…?" : "Type your answer"}
          className="w-full resize-none rounded-2xl border-2 border-[var(--t-line-strong)] bg-[var(--t-bg-2)] p-4 text-lg text-[var(--t-text)] placeholder:text-slate-400 focus:border-[var(--t-teal-deep)] focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || timeUp || !draft.trim() || !dirty}
          className="relative h-14 w-full rounded-2xl bg-[var(--t-teal)] t-font text-lg font-extrabold text-white hover:bg-[var(--t-teal-strong)] disabled:opacity-40"
        >
          <span className={busy ? "invisible" : undefined}>{submitted && !dirty ? "Answer locked in" : submitted ? "Update answer" : "Lock in answer"}</span>
          {busy && <Loader2 className="absolute inset-0 m-auto h-5 w-5 animate-spin" aria-label="Saving" />}
        </button>
        {submitted && <p className="text-center text-sm text-[var(--t-sage)]">Saved: “{submitted}” — any teammate can change it until time&apos;s up.</p>}
      </form>
    </div>
  );
}

function Finished({ view, team }: { view: TriviaView; team: ViewTeam }) {
  const sorted = [...view.teams].sort((a, b) => b.score - a.score);
  const rank = sorted.findIndex((t) => t.score === team.score) + 1;
  const suffix = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
      <div className="t-pop-in">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--t-faint)]">Game over</p>
        <p className="mt-2 t-font text-6xl font-extrabold" style={{ color: rank === 1 ? "var(--t-teal-deep)" : "var(--t-ink)" }}>
          {rank}
          <span className="text-3xl">{suffix(rank)}</span>
        </p>
        <p className="mt-2 text-lg text-[var(--t-muted)]">
          {rank === 1 ? `${team.name} won ICAN Trivia!` : `Well played, ${team.name}.`} {formatScore(team.score)} points.
        </p>
      </div>
      <ol className="w-full space-y-2">
        {sorted.map((t, i) => (
          <li key={t.id} className={cn("flex items-center gap-3 rounded-2xl px-4 py-3", t.id === team.id ? "bg-slate-100" : "bg-[var(--t-panel)]")}>
            <span className="w-6 t-font text-lg font-extrabold text-[var(--t-faint)]">{i + 1}</span>
            <TeamBadge name={t.name} color={t.color} size={28} />
            <span className="min-w-0 flex-1 truncate text-left font-semibold">{t.name}</span>
            <span className={cn("t-font font-extrabold tabular-nums", t.score < 0 && "text-[var(--t-red)]")}>{formatScore(t.score)}</span>
          </li>
        ))}
      </ol>
      <Link href="/play" className="text-sm text-[var(--t-muted)] underline-offset-4 hover:underline">
        Join another game
      </Link>
    </div>
  );
}

/** Full-screen flash when this team's answer is judged. */
function ResultFlash({ view, teamId }: { view: TriviaView; teamId: string }) {
  const seen = useRef<number | null>(view.lastResult?.seq ?? null);
  const [flash, setFlash] = useState<{ key: number; correct: boolean; delta: number } | null>(null);
  useEffect(() => {
    const r = view.lastResult;
    if (!r || r.seq === seen.current) return;
    seen.current = r.seq;
    if (r.teamId !== teamId || !isFresh(r.at, view.serverNow)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFlash({ key: r.seq, correct: r.correct, delta: r.delta });
    vibrate(r.correct ? [30, 40, 30] : 200);
    const t = window.setTimeout(() => setFlash(null), 1500);
    return () => window.clearTimeout(t);
  }, [view.lastResult, view.serverNow, teamId]);
  if (!flash) return null;
  return (
    <div
      key={flash.key}
      aria-live="assertive"
      className={cn("t-flash pointer-events-none absolute inset-0 z-20 grid place-items-center", flash.correct ? "bg-[var(--t-sage-strong)]/95" : "bg-rose-600/95")}
    >
      <div className="text-center text-slate-900">
        <p className="t-font text-5xl font-extrabold">{flash.correct ? "Correct!" : "Not quite"}</p>
        {flash.delta !== 0 && (
          <p className="mt-2 t-font text-4xl font-extrabold tabular-nums">
            {flash.delta > 0 ? "+" : "−"}
            {Math.abs(flash.delta).toLocaleString("en-US")}
          </p>
        )}
      </div>
    </div>
  );
}

/** A banner when a tool is played on (or by) this team. */
function ToolFlash({ view, myTeamId }: { view: TriviaView; myTeamId: string }) {
  const seen = useRef<number | null>(view.lastTool?.seq ?? null);
  const [msg, setMsg] = useState<{ key: number; text: string; bad: boolean } | null>(null);
  useEffect(() => {
    const ev = view.lastTool;
    if (!ev || ev.seq === seen.current) return;
    seen.current = ev.seq;
    if (!isFresh(ev.at, view.serverNow)) return;
    const by = view.teams.find((t) => t.id === ev.teamId)?.name ?? "A team";
    const label = TOOL_INFO[ev.tool].label;
    let text: string | null = null;
    let bad = false;
    if (ev.teamId === myTeamId) text = `${label} played!`;
    else if (ev.targetTeamId === myTeamId) {
      text = ev.tool === "block" ? `${by} blocked your team!` : `${by} swapped the question to you — ${view.settings.swapAnswerSec} seconds!`;
      bad = ev.tool === "block";
    } else if (ev.tool === "steal" && view.turn?.turnTeamId === myTeamId) {
      text = `${by} stole your question!`;
      bad = true;
    }
    if (!text) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMsg({ key: ev.seq, text, bad });
    vibrate(bad ? [80, 60, 80] : 30);
    const t = window.setTimeout(() => setMsg(null), 2200);
    return () => window.clearTimeout(t);
  }, [view.lastTool, view.teams, view.turn, view.settings.swapAnswerSec, view.serverNow, myTeamId]);
  if (!msg) return null;
  return (
    <div
      key={msg.key}
      role="status"
      className={cn(
        "t-zoom-in pointer-events-none absolute inset-x-4 top-[calc(max(0.75rem,env(safe-area-inset-top))+4.5rem)] z-30 rounded-2xl px-4 py-3 text-center t-font text-lg font-extrabold text-slate-900 shadow-xl",
        msg.bad ? "bg-rose-600 text-white" : "bg-[var(--t-teal-deep)] text-white",
      )}
    >
      {msg.text}
    </div>
  );
}

/** Keep the phone screen awake while a game is on. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === "undefined" || !("wakeLock" in navigator)) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const request = async () => {
      try {
        lock = await (navigator as unknown as { wakeLock: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock.request("screen");
        if (cancelled) void lock.release();
      } catch {
        // Denied or unsupported — the game still works.
      }
    };
    void request();
    const onVisible = () => {
      if (document.visibilityState === "visible") void request();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [active]);
}
