"use client";

/**
 * /trivia/display/[code] — the big screen. Put it on the projector or
 * share it on the call. It holds nothing secret: answers arrive only
 * when the host reveals them and hints never (lib/trivia/views.ts), so
 * it needs no sign-in and anyone with the code can open it.
 */

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Lightbulb, Loader2, Maximize2, Minimize2, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/cn";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { TOOL_INFO } from "@/lib/trivia/content";
import { getPref, setPref } from "@/lib/trivia/client/storage";
import { play, unlockSound } from "@/lib/trivia/client/sounds";
import { isFresh } from "@/lib/trivia/client/fresh";
import { useCountdown, useTriviaRoom } from "@/lib/trivia/client/useRoom";
import type { TriviaView, ViewTeam } from "@/lib/trivia/views";
import { TriviaBoard } from "@/components/trivia/TriviaBoard";
import { ScoreStrip } from "@/components/trivia/ScoreStrip";
import { Wordmark } from "@/components/trivia/Wordmark";
import { QrCode } from "@/components/trivia/QrCode";
import { CountdownBar, CountdownRing } from "@/components/trivia/Countdown";
import { formatScore } from "@/components/trivia/PlayerChip";
import { TeamBadge, ToolIcon } from "@/components/trivia/Teams";
import { IcanStamp } from "@/components/trivia/IcanStamp";
import { Confetti } from "@/components/trivia/Confetti";

const DISPLAY_AUTH = { role: "display" } as const;

export default function DisplayPage() {
  const params = useParams<{ code: string }>();
  const code = normalizeRoomCode(params?.code ?? "");
  const { view, error, serverNow } = useTriviaRoom(code, isRoomCode(code) ? DISPLAY_AUTH : null);
  const [sound, setSound] = useState(false);
  const [full, setFull] = useState(false);
  const idle = useMouseIdle(2500);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSound(getPref("display-sound", false));
    const onFs = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  useCues(view, sound, serverNow);

  return (
    <div className="trivia-stage relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {!view ? (
        <div className="grid flex-1 place-items-center p-8 text-center">
          {error || !isRoomCode(code) ? (
            <div className="space-y-3">
              <Wordmark size="lg" />
              <p className="text-xl text-[var(--t-muted)]">{error?.message ?? "That isn't a room code."}</p>
            </div>
          ) : (
            <Loader2 className="h-10 w-10 animate-spin text-[var(--t-muted)]" aria-label="Loading" />
          )}
        </div>
      ) : (
        <>
          <Stage view={view} serverNow={serverNow} />
          <ToolCallout view={view} />
        </>
      )}

      {/* Screen controls — small, top-right, out of the way of the board. */}
      <div className={cn("absolute bottom-3 right-3 z-40 flex gap-2 transition-opacity duration-300 focus-within:opacity-100 hover:opacity-100", idle ? "opacity-0" : "opacity-90")}>
        <button
          type="button"
          onClick={() => {
            const next = !sound;
            if (next) unlockSound();
            setSound(next);
            setPref("display-sound", next);
          }}
          aria-label={sound ? "Mute sound" : "Turn sound on"}
          aria-pressed={sound}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white"
        >
          {sound ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void document.documentElement.requestFullscreen?.().catch(() => undefined);
          }}
          aria-label={full ? "Exit full screen" : "Full screen"}
          className="grid h-11 w-11 place-items-center rounded-full bg-white/90 text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur hover:bg-white"
        >
          {full ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
        </button>
      </div>
      {!sound && view && view.phase === "lobby" && (
        <button
          type="button"
          onClick={() => {
            unlockSound();
            setSound(true);
            setPref("display-sound", true);
            play("join");
          }}
          className="absolute left-1/2 top-3 z-40 -translate-x-1/2 rounded-full bg-black/40 px-4 py-2 text-sm text-[var(--t-text)] backdrop-blur hover:bg-black/60"
        >
          Click to turn on game sounds
        </button>
      )}
    </div>
  );
}

function Stage({ view, serverNow }: { view: TriviaView; serverNow: () => number }) {
  switch (view.phase) {
    case "lobby":
      return <Lobby view={view} />;
    case "board":
      return <BoardScreen view={view} />;
    case "question":
    case "buzzing":
    case "answering":
    case "dd_answer":
    case "reveal":
      return <QuestionScreen view={view} serverNow={serverNow} />;
    case "dd_wager":
      return <DailyDoubleScreen view={view} />;
    case "final_wager":
    case "final_answer":
    case "final_reveal":
      return <FinalScreen view={view} serverNow={serverNow} />;
    case "ended":
      return <Podium view={view} />;
  }
}

function joinHost(): string {
  if (typeof window === "undefined") return "sim.icanmena.com";
  return window.location.host.replace(/^www\./, "");
}

function team(view: TriviaView, id: string | null | undefined): ViewTeam | undefined {
  return id ? view.teams.find((t) => t.id === id) : undefined;
}

function Lobby({ view }: { view: TriviaView }) {
  const [origin, setOrigin] = useState("https://sim.icanmena.com");
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);
  const unassigned = view.players.filter((p) => !p.teamId);
  return (
    <div className="flex min-h-0 flex-1 flex-col px-[5vmin] pb-[3vmin] pt-[4vmin]">
      <div className="grid min-h-0 items-center gap-[4vmin] lg:grid-cols-[1.3fr_1fr]">
        <div className="t-rise">
          <Wordmark size="xl" />
          <p className="mt-[1.5vmin] t-font text-[clamp(1.1rem,2.8vmin,2.4rem)] font-semibold text-[var(--t-muted)]">
            {view.room.title} · <span className="text-[var(--t-teal-ink)]">{view.mode === "competitive" ? "Competitive" : "Traditional"}</span>
          </p>
          <div className="mt-[4vmin]">
            <p className="text-[clamp(1rem,2.4vmin,2rem)] text-[var(--t-muted)]">
              On your phone, go to <span className="font-bold text-[var(--t-ink)]">{joinHost()}/play</span> and enter
            </p>
            <div className="mt-[2vmin] flex gap-[1.6vmin]" aria-label={`Room code ${view.room.code.split("").join(" ")}`}>
              {view.room.code.split("").map((ch, i) => (
                <span
                  key={i}
                  className="t-zoom-in grid aspect-[4/5] w-[clamp(60px,11vmin,150px)] place-items-center rounded-[1.6vmin] bg-[var(--t-teal-deep)] t-font text-[clamp(2.5rem,8.5vmin,7.5rem)] font-extrabold text-white shadow-[0_0.8vmin_0_#01585d]"
                  style={{ animationDelay: `${i * 80}ms` }}
                >
                  {ch}
                </span>
              ))}
            </div>
            <p className="mt-[2.5vmin] text-[clamp(0.9rem,2vmin,1.5rem)] text-[var(--t-faint)]">No app, no sign-up. Pick your team once you&apos;re in.</p>
          </div>
        </div>
        <div className="flex flex-col items-center gap-[1.6vmin]">
          <div className="rounded-[2vmin] bg-white p-[1.4vmin] shadow-2xl">
            <QrCode value={`${origin}/play/${view.room.code}`} label={`QR code to join room ${view.room.code}`} className="h-[clamp(150px,30vmin,400px)] w-[clamp(150px,30vmin,400px)] [&>svg]:h-full [&>svg]:w-full" />
          </div>
          <p className="text-[clamp(0.9rem,2vmin,1.5rem)] text-[var(--t-muted)]">Scan to join</p>
        </div>
      </div>
      <div className="mt-[3vmin] grid min-h-0 flex-1 gap-[1.6vmin]" style={{ gridTemplateColumns: `repeat(${view.teams.length}, minmax(0, 1fr))` }}>
        {view.teams.map((t) => (
          <div key={t.id} className="flex min-h-0 flex-col overflow-hidden rounded-[1.6vmin] bg-[var(--t-panel)]" style={{ boxShadow: `inset 0 0.8vmin 0 ${t.color}` }}>
            <div className="flex items-center gap-[1.2vmin] px-[1.8vmin] pb-[1vmin] pt-[2vmin]">
              <TeamBadge name={t.name} color={t.color} size={44} />
              <p className="min-w-0 flex-1 truncate t-font text-[clamp(1.1rem,3vmin,2.6rem)] font-extrabold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
                {t.name}
              </p>
              <span className="t-font text-[clamp(1rem,2.6vmin,2.2rem)] font-extrabold tabular-nums text-[var(--t-muted)]">{t.members.length}</span>
            </div>
            <ul className="flex min-h-0 flex-wrap content-start gap-[0.8vmin] overflow-hidden px-[1.8vmin] pb-[1.8vmin]">
              {t.members.map((m) => (
                <li key={m.id} className="t-pop-in rounded-full bg-slate-100 px-[1.4vmin] py-[0.5vmin] text-[clamp(0.85rem,2vmin,1.6rem)] font-semibold">
                  {m.name}
                </li>
              ))}
              {t.members.length === 0 && <li className="text-[clamp(0.85rem,1.9vmin,1.5rem)] text-[var(--t-faint)]">Waiting for players…</li>}
            </ul>
          </div>
        ))}
      </div>
      {unassigned.length > 0 && (
        <p className="mt-[1.2vmin] text-[clamp(0.85rem,1.9vmin,1.5rem)] text-[var(--t-faint)]">
          Choosing a team: {unassigned.map((p) => p.name).join(", ")}
        </p>
      )}
    </div>
  );
}

function BoardScreen({ view }: { view: TriviaView }) {
  const picker = team(view, view.controllerTeamId);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2vmin] p-[2.5vmin]">
      <div className="t-zoom-in min-h-0 flex-1">
        {view.remaining === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="t-font text-[clamp(2rem,7vmin,6rem)] font-extrabold">Board cleared!</p>
              <p className="mt-2 text-[clamp(1rem,3vmin,2.25rem)] text-[var(--t-muted)]">{view.hasFinal ? "Final Trivia is next." : "Let's see the scores."}</p>
            </div>
          </div>
        ) : (
          <TriviaBoard board={view.board} teams={view.teams} rows={view.rowValues.length} />
        )}
      </div>
      <div className="flex flex-col items-center gap-[1.2vmin]">
        <div className="grid w-full grid-cols-[1fr_auto_1fr] items-center gap-4">
          <Wordmark size="sm" className="justify-self-start" />
          <p className="text-[clamp(0.9rem,2.4vmin,2rem)] text-[var(--t-muted)]">
            {view.remaining === 0 ? (
              ""
            ) : picker ? (
              <>
                <span className="t-font font-extrabold text-[var(--t-ink)]" data-team="" style={{ "--team": picker.color } as React.CSSProperties}>
                  {picker.name}
                </span>{" "}
                {view.mode === "competitive" ? "— your turn to pick" : "pick next"}
              </>
            ) : (
              "The host picks the first question"
            )}
          </p>
          <p className="justify-self-end text-[clamp(0.75rem,1.7vmin,1.25rem)] text-[var(--t-muted)]">
            Join at <span className="font-semibold text-[var(--t-ink)]">{joinHost()}/play</span> ·{" "}
            <span className="t-font font-extrabold tracking-[0.12em] text-[var(--t-teal-deep)]">{view.room.code}</span>
          </p>
        </div>
        <ScoreStrip teams={view.teams} controllerTeamId={view.controllerTeamId} showTools={view.mode === "competitive"} />
      </div>
    </div>
  );
}

function questionSize(text: string): string {
  const n = text.length;
  if (n < 50) return "clamp(2rem, 7.2vmin, 7rem)";
  if (n < 100) return "clamp(1.75rem, 5.8vmin, 5.5rem)";
  if (n < 170) return "clamp(1.5rem, 4.7vmin, 4.4rem)";
  return "clamp(1.25rem, 3.9vmin, 3.6rem)";
}

function QuestionScreen({ view, serverNow }: { view: TriviaView; serverNow: () => number }) {
  const cur = view.current;
  const turn = view.turn;
  const buzzLeft = useCountdown(view.phase === "buzzing" ? view.buzz.closesAt : null, serverNow);
  const answerLeft = useCountdown(view.phase === "answering" ? view.buzz.answerDeadline : null, serverNow);
  const windowLeft = useCountdown(view.phase === "question" ? turn?.windowEndsAt : null, serverNow, 200);
  if (!cur) return null;
  const answering = team(view, view.phase === "answering" ? view.buzz.winnerTeamId : view.phase === "dd_answer" ? view.controllerTeamId : turn?.answeringTeamId);
  const buzzer = view.players.find((p) => p.id === view.buzz.winnerPlayerId);
  const doubled = Boolean(answering && turn?.doubleDown.includes(answering.id) && !view.buzz.winnerPlayerId);
  const value = cur.dailyDouble && view.wager ? view.wager : doubled ? cur.value * 2 : cur.value;
  const swapped = Boolean(answering && turn?.swappedTo === answering.id && view.phase === "answering");
  const competitive = view.mode === "competitive";

  return (
    <div className="relative flex min-h-0 flex-1 flex-col trivia-wash p-[4vmin]">
      <div className="flex items-start justify-between gap-6">
        <p className="t-category text-[clamp(1rem,3.4vmin,2.75rem)] text-[var(--t-text)]">{cur.columnTitle}</p>
        <p className="rounded-[1.2vmin] bg-[var(--t-teal-deep)] px-[2vmin] py-[0.6vmin] t-font text-[clamp(1.5rem,5vmin,4.25rem)] font-extrabold leading-none text-white">
          {cur.dailyDouble && <span className="mr-[1.5vmin] align-middle text-[0.45em] text-[var(--t-text)]">DAILY DOUBLE ·</span>}
          {doubled && <span className="mr-[1.5vmin] align-middle text-[0.45em] text-[var(--t-text)]">DOUBLE DOWN ·</span>}
          {formatScore(value)}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vmin] text-center">
        <p key={cur.cellId} className="t-question t-zoom-in max-w-[88vw] text-[var(--t-ink)]" style={{ fontSize: questionSize(cur.question ?? "") }}>
          {cur.question}
        </p>
        {cur.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cur.imageUrl} alt="" className="max-h-[30vh] max-w-[70vw] rounded-[1.5vmin] object-contain shadow-2xl" />
        )}
        {view.phase === "reveal" && cur.answer && (
          <div className="t-rise mt-[1vmin] rounded-[2vmin] bg-white shadow-sm ring-1 ring-[var(--t-line)] px-[4vmin] py-[2vmin]">
            <p className="text-[clamp(0.8rem,2vmin,1.5rem)] font-semibold uppercase tracking-[0.18em] text-[var(--t-muted)]">Answer</p>
            <p className="t-font text-[clamp(1.75rem,6.4vmin,6rem)] font-extrabold leading-tight text-[var(--t-teal-deep)]"><span className="t-hl whitespace-normal">{cur.answer}</span></p>
          </div>
        )}
      </div>

      <div className="min-h-[13vmin]">
        {view.phase === "question" && !competitive && (
          <p className="text-center text-[clamp(1rem,2.6vmin,2rem)] text-[var(--t-muted)]">Listen to the question — buzzers open in a moment.</p>
        )}
        {view.phase === "question" && competitive && (
          <div className="mx-auto max-w-[70vw] space-y-[1.4vmin] text-center">
            {answering ? (
              <p className="t-font text-[clamp(1.25rem,4vmin,3.25rem)] font-extrabold">
                <span data-team="" style={{ "--team": answering.color } as React.CSSProperties}>{answering.name}</span>
                <span className="text-[var(--t-text)]"> {turn?.stolenBy === answering.id ? "stole it!" : turn?.swappedTo === answering.id ? `answer first — ${view.settings.swapAnswerSec}s` : "— get ready to answer"}</span>
              </p>
            ) : (
              <p className="t-font text-[clamp(1.25rem,4vmin,3.25rem)] font-extrabold text-[var(--t-teal-deep)]">Open to a buzz in a moment…</p>
            )}
            <p className="text-[clamp(0.9rem,2.2vmin,1.75rem)] text-[var(--t-muted)]">Tools window — steal, block, swap, skip or double down now.</p>
            {turn?.windowEndsAt && <CountdownBar left={windowLeft} total={view.settings.toolWindowSec * 1000} className="h-[1.2vmin]" />}
          </div>
        )}
        {view.phase === "buzzing" && (
          <div className="mx-auto max-w-[70vw] space-y-[1.6vmin] text-center">
            <p className="t-font text-[clamp(1.25rem,4vmin,3.25rem)] font-extrabold text-[var(--t-teal-deep)]">{competitive ? "Rebound — buzz in now!" : "Buzz in now!"}</p>
            {view.buzz.closesAt && <CountdownBar left={buzzLeft} total={view.settings.buzzWindowSec * 1000} className="h-[1.4vmin]" />}
            {view.buzz.lockedOut.length > 0 && (
              <p className="text-[clamp(0.9rem,2vmin,1.5rem)] text-[var(--t-muted)]">
                Out of this one: {view.buzz.lockedOut.map((id) => team(view, id)?.name).filter(Boolean).join(", ")}
              </p>
            )}
          </div>
        )}
        {(view.phase === "answering" || view.phase === "dd_answer") && answering && (
          <div className="t-pop-in flex items-center justify-center gap-[3vmin]">
            <TeamBadge name={answering.name} color={answering.color} size={100} />
            <div className="text-left">
              <p className="t-font text-[clamp(2rem,7vmin,6rem)] font-extrabold leading-none" data-team="plain" style={{ "--team": answering.color } as React.CSSProperties}>
                {answering.name}
              </p>
              <p className="mt-[0.6vmin] text-[clamp(0.9rem,2.4vmin,2rem)] text-[var(--t-muted)]">
                {view.phase === "dd_answer"
                  ? `answering for ${formatScore(view.wager ?? 0)}`
                  : buzzer
                    ? `${buzzer.name} buzzed in`
                    : swapped
                      ? `swapped to them — ${view.settings.swapAnswerSec} seconds`
                      : turn?.stolenBy === answering.id
                        ? "stole the question"
                        : "answering"}
              </p>
            </div>
            {view.phase === "answering" && view.buzz.answerDeadline && (
              <CountdownRing left={answerLeft} total={(swapped ? view.settings.swapAnswerSec : view.settings.answerTimeSec) * 1000} size={110} />
            )}
          </div>
        )}
        {competitive && turn && turn.hints.length > 0 && view.phase !== "reveal" && (
          <p className="mt-[1.4vmin] flex items-center justify-center gap-[1vmin] text-[clamp(0.85rem,2vmin,1.5rem)] text-[var(--t-teal-ink)]">
            <Lightbulb className="h-[1.1em] w-[1.1em]" aria-hidden /> Hint unlocked by {turn.hints.map((id) => team(view, id)?.name).filter(Boolean).join(", ")}
          </p>
        )}
      </div>
      <ResultBanner view={view} />
      <Wordmark size="sm" className="absolute bottom-[3vmin] left-[4vmin] opacity-90" />
    </div>
  );
}

function ResultBanner({ view }: { view: TriviaView }) {
  const seen = useRef<number | null>(view.lastResult?.seq ?? null);
  const [show, setShow] = useState<TriviaView["lastResult"]>(null);
  useEffect(() => {
    const r = view.lastResult;
    if (!r || r.seq === seen.current) return;
    seen.current = r.seq;
    if (!isFresh(r.at, view.serverNow)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(r);
    const t = window.setTimeout(() => setShow(null), 1600);
    return () => window.clearTimeout(t);
  }, [view.lastResult, view.serverNow]);
  if (!show) return null;
  const t = team(view, show.teamId);
  return (
    <div
      className={cn(
        "t-flash pointer-events-none absolute inset-x-0 bottom-[15vmin] mx-auto w-fit rounded-[2vmin] px-[5vmin] py-[2vmin] text-slate-900 shadow-2xl",
        show.correct ? "bg-[var(--t-sage-strong)] text-white" : "bg-rose-600 text-white",
      )}
    >
      <p className="t-font text-[clamp(1.5rem,5vmin,4.5rem)] font-extrabold tabular-nums">
        {show.delta > 0 ? "+" : show.delta < 0 ? "−" : ""}
        {Math.abs(show.delta).toLocaleString("en-US")} {t?.name}
      </p>
    </div>
  );
}

/** Big callout when a team plays a tool: "PEARLS STEAL!" */
function ToolCallout({ view }: { view: TriviaView }) {
  const seen = useRef<number | null>(view.lastTool?.seq ?? null);
  const [show, setShow] = useState<TriviaView["lastTool"]>(null);
  useEffect(() => {
    const ev = view.lastTool;
    if (!ev || ev.seq === seen.current) return;
    seen.current = ev.seq;
    if (!isFresh(ev.at, view.serverNow)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShow(ev);
    const t = window.setTimeout(() => setShow(null), 2400);
    return () => window.clearTimeout(t);
  }, [view.lastTool, view.serverNow]);
  if (!show) return null;
  const by = team(view, show.teamId);
  const target = team(view, show.targetTeamId);
  const verb: Record<string, string> = {
    steal: "steal the question!",
    hint: "unlock a hint",
    block: target ? `block ${target.name}!` : "block!",
    swap: target ? `swap it to ${target.name}!` : "swap!",
    skip: "skip — and pick again",
    doubleDown: "double down!",
  };
  return (
    <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center bg-black/40" role="status" aria-live="assertive">
      <div className="t-stamp flex flex-col items-center gap-[2vmin] rounded-[3vmin] px-[6vmin] py-[4vmin] text-center text-slate-900 shadow-2xl" style={{ background: by?.color ?? "var(--t-yellow)" }}>
        <ToolIcon tool={show.tool} className="h-[12vmin] w-[12vmin]" />
        <p className="t-font text-[clamp(2rem,8vmin,7rem)] font-extrabold uppercase leading-none">{TOOL_INFO[show.tool].label}</p>
        <p className="t-font text-[clamp(1.1rem,3.6vmin,3rem)] font-extrabold">
          {by?.name} {verb[show.tool]}
        </p>
      </div>
    </div>
  );
}

function DailyDoubleScreen({ view }: { view: TriviaView }) {
  const t = team(view, view.controllerTeamId);
  return (
    <div className="relative grid min-h-0 flex-1 place-items-center overflow-hidden trivia-wash p-[4vmin] text-center">
      <IcanStamp className="t-stamp absolute h-[95vmin] w-[95vmin] text-[var(--t-teal-deep)]/10" />
      <div className="relative">
        <p className="t-stamp t-font text-[clamp(3rem,16vmin,14rem)] font-extrabold leading-[0.9] text-[var(--t-teal-deep)] [text-shadow:0_1.2vmin_0_rgba(0,0,0,0.35)]">
          Daily
          <br />
          Double
        </p>
        <p className="mt-[3vmin] t-category text-[clamp(1rem,3.4vmin,2.75rem)] text-[var(--t-teal-ink)]">{view.current?.columnTitle}</p>
        <p className="mt-[2vmin] text-[clamp(1rem,3vmin,2.5rem)] text-[var(--t-muted)]">
          {t ? (
            <>
              <span className="t-font font-extrabold" data-team="" style={{ "--team": t.color } as React.CSSProperties}>
                {t.name}
              </span>{" "}
              are placing a wager…
            </>
          ) : (
            "The host is choosing who answers."
          )}
        </p>
      </div>
    </div>
  );
}

function FinalScreen({ view, serverNow }: { view: TriviaView; serverNow: () => number }) {
  const f = view.final;
  const left = useCountdown(view.phase === "final_answer" ? f?.deadline : null, serverNow, 250);
  if (!f) return null;
  const total = view.teams.length;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-[2vmin] trivia-wash p-[4vmin]">
      <div className="text-center">
        <p className="t-font text-[clamp(1.5rem,5vmin,4rem)] font-extrabold text-[var(--t-teal-deep)]">Final Trivia</p>
        <p className="mt-[1vmin] t-category text-[clamp(1.25rem,4.4vmin,3.75rem)] text-[var(--t-teal-ink)]">{f.category}</p>
      </div>

      {view.phase === "final_wager" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-[3vmin] text-center">
          <p className="text-[clamp(1.25rem,3.6vmin,3rem)] text-[var(--t-text)]">Teams, make your wagers on your phones.</p>
          <Progress done={f.wagered.length} total={total} label="teams wagered" />
        </div>
      )}

      {view.phase === "final_answer" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-[4vmin] text-center">
          <p className="t-question t-zoom-in max-w-[86vw] text-[var(--t-ink)]" style={{ fontSize: questionSize(f.question ?? "") }}>
            {f.question}
          </p>
          <div className="flex items-center gap-[4vmin]">
            <CountdownRing left={left} total={view.settings.finalTimeSec * 1000} size={150} />
            <Progress done={f.answered.length} total={total} label="teams answered" />
          </div>
        </div>
      )}

      {view.phase === "final_reveal" && (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vmin]">
          <p className="max-w-[80vw] text-center text-[clamp(1rem,3vmin,2.5rem)] text-[var(--t-text)]">{f.question}</p>
          <ul className="grid w-full max-w-[1500px] gap-[1.6vmin]" style={{ gridTemplateColumns: `repeat(${Math.min(5, Math.max(1, f.responses.length))}, minmax(0, 1fr))` }}>
            {f.responses.map((r) => {
              const t = team(view, r.teamId);
              if (!t) return null;
              return (
                <li
                  key={r.teamId}
                  className={cn("t-pop-in rounded-[1.6vmin] bg-white shadow-sm ring-1 ring-[var(--t-line)] p-[2vmin]", r.correct === true && "ring-4 ring-[var(--t-sage)]", r.correct === false && "ring-4 ring-[var(--t-red)]")}
                  style={{ boxShadow: `inset 0 0.6vmin 0 ${t.color}` }}
                >
                  <p className="t-font font-extrabold" data-team="" style={{ "--team": t.color } as React.CSSProperties}>
                    {t.name}
                  </p>
                  <p className="mt-[0.6vmin] t-font text-[clamp(1.1rem,3vmin,2.5rem)] font-bold text-[var(--t-ink)]">{r.answer || "— no answer —"}</p>
                  {r.correct !== null && (
                    <p className={cn("mt-[0.6vmin] t-font font-extrabold tabular-nums", r.correct ? "text-[var(--t-sage-strong)]" : "text-[var(--t-red)]")}>
                      {r.correct ? "✓ Correct" : "✗ Not this time"} · {r.wager === 0 ? "0" : `${r.correct ? "+" : "−"}${r.wager.toLocaleString("en-US")}`}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          {f.answer && (
            <div className="t-rise rounded-[2vmin] bg-white shadow-sm ring-1 ring-[var(--t-line)] px-[4vmin] py-[2vmin] text-center">
              <p className="text-[clamp(0.8rem,2vmin,1.5rem)] font-semibold uppercase tracking-[0.18em] text-[var(--t-muted)]">Answer</p>
              <p className="t-font text-[clamp(1.75rem,6vmin,5.5rem)] font-extrabold text-[var(--t-teal-deep)]"><span className="t-hl whitespace-normal">{f.answer}</span></p>
            </div>
          )}
        </div>
      )}
      <ScoreStrip teams={view.teams} controllerTeamId={null} />
    </div>
  );
}

function Progress({ done, total, label }: { done: number; total: number; label: string }) {
  return (
    <p className="t-font text-[clamp(1.25rem,4vmin,3.5rem)] font-extrabold tabular-nums text-[var(--t-ink)]">
      {done} <span className="text-[var(--t-faint)]">of {total}</span> <span className="text-[0.6em] font-semibold text-[var(--t-muted)]">{label}</span>
    </p>
  );
}

function Podium({ view }: { view: TriviaView }) {
  const sorted = [...view.teams].sort((a, b) => b.score - a.score);
  const top = sorted.slice(0, 3);
  const order = [top[1], top[0], top[2]].filter(Boolean);
  const heights: Record<number, string> = { 0: "h-[32vmin]", 1: "h-[23vmin]", 2: "h-[16vmin]" };
  return (
    <div className="relative flex min-h-0 flex-1 flex-col items-center justify-end overflow-hidden px-[4vmin] pb-[4vmin] pt-[6vmin]">
      <Confetti />
      <Wordmark size="md" className="absolute left-[4vmin] top-[3vmin]" />
      <p className="t-rise t-font text-[clamp(2rem,7vmin,6rem)] font-extrabold">
        {top[0] ? (
          <>
            <span data-team="" style={{ "--team": top[0].color } as React.CSSProperties}>{top[0].name}</span> win!
          </>
        ) : (
          "Game over"
        )}
      </p>
      <p className="mb-[4vmin] text-[clamp(1rem,2.6vmin,2rem)] text-[var(--t-muted)]">{view.room.title}</p>
      <div className="flex items-end justify-center gap-[2vmin]">
        {order.map((t) => {
          const place = sorted.indexOf(t);
          return (
            <div key={t.id} className="t-rise flex w-[clamp(130px,24vmin,300px)] flex-col items-center" style={{ animationDelay: `${(2 - place) * 180}ms` }}>
              <TeamBadge name={t.name} color={t.color} size={place === 0 ? 100 : 76} />
              <p className="mt-[1vmin] max-w-full truncate text-center t-font text-[clamp(1rem,3vmin,2.5rem)] font-extrabold" data-team="plain" style={{ "--team": t.color } as React.CSSProperties}>
                {t.name}
              </p>
              <p className="t-font text-[clamp(1rem,3vmin,2.5rem)] font-extrabold tabular-nums text-[var(--t-ink)]">{formatScore(t.score)}</p>
              <div className={cn("mt-[1vmin] grid w-full place-items-start justify-center rounded-t-[1.4vmin] pt-[1.5vmin]", heights[place])} style={{ background: t.color }}>
                <span className="t-font text-[clamp(2rem,7vmin,6rem)] font-extrabold text-slate-900">{place + 1}</span>
              </div>
            </div>
          );
        })}
      </div>
      {sorted.length > 3 && (
        <ol start={4} className="mt-[3vmin] flex flex-wrap justify-center gap-x-[3vmin] gap-y-[1vmin] text-[clamp(0.9rem,2.4vmin,2rem)] text-[var(--t-muted)]">
          {sorted.slice(3).map((t, i) => (
            <li key={t.id}>
              {i + 4}. <span className="font-semibold" data-team="" style={{ "--team": t.color } as React.CSSProperties}>{t.name}</span> {formatScore(t.score)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Sound cues driven by game events. */
function useCues(view: TriviaView | null, enabled: boolean, serverNow: () => number) {
  const prev = useRef<{ phase: string; players: number; result: number | null; winner: string | null; tool: number | null } | null>(null);
  const finalTick = useRef<number | null>(null);

  useEffect(() => {
    if (!view) return;
    const p = prev.current;
    const now = {
      phase: view.phase,
      players: view.players.length,
      result: view.lastResult?.seq ?? null,
      winner: view.buzz.winnerPlayerId,
      tool: view.lastTool?.seq ?? null,
    };
    prev.current = now;
    if (!enabled || !p) return;
    if (now.players > p.players && view.phase === "lobby") play("join");
    if (now.winner && now.winner !== p.winner && view.phase === "answering") play("buzz");
    if (now.tool !== null && now.tool !== p.tool) play(view.lastTool?.tool === "steal" || view.lastTool?.tool === "block" ? "wrong" : "reveal");
    if (now.result !== null && now.result !== p.result) play(view.lastResult?.correct ? "correct" : "wrong");
    else if (now.phase === "reveal" && p.phase === "buzzing" && !view.buzz.winnerTeamId) play("timeUp");
    else if (now.phase === "reveal" && p.phase !== "reveal") play("reveal");
    if (now.phase === "dd_wager" && p.phase !== "dd_wager") play("dailyDouble");
    if (now.phase === "final_wager" && p.phase !== "final_wager") play("dailyDouble");
    if (now.phase === "ended" && p.phase !== "ended") play("fanfare");
  }, [view, enabled]);

  // Ticking for the last five seconds of Final Trivia.
  useEffect(() => {
    if (!enabled || view?.phase !== "final_answer" || !view.final?.deadline) return;
    const deadline = view.final.deadline;
    const id = window.setInterval(() => {
      const left = deadline - serverNow();
      const s = Math.ceil(left / 1000);
      if (left > 0 && s <= 5 && finalTick.current !== s) {
        finalTick.current = s;
        play("tick");
      }
      if (left <= 0 && finalTick.current !== 0) {
        finalTick.current = 0;
        play("timeUp");
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [enabled, view?.phase, view?.final?.deadline, serverNow]);
}

/** True once the mouse has been still for a while — the big screen hides its controls. */
function useMouseIdle(ms: number): boolean {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = window.setTimeout(() => setIdle(true), ms);
    const wake = () => {
      setIdle(false);
      window.clearTimeout(t);
      t = window.setTimeout(() => setIdle(true), ms);
    };
    window.addEventListener("mousemove", wake);
    window.addEventListener("keydown", wake);
    window.addEventListener("touchstart", wake);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("mousemove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("touchstart", wake);
    };
  }, [ms]);
  return idle;
}
