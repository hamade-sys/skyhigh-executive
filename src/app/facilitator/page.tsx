"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardBody, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { AdminPanel } from "@/components/panels/AdminPanel";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { computeAirlineValue, brandRating, fleetCount } from "@/lib/engine";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plane, Users, Settings2, Trophy, Key, Mic, Save, Download, Upload, RotateCcw, Trash2, Lock, Unlock, Building, Check, X, Loader2, AlertCircle } from "lucide-react";
import { CITIES } from "@/data/cities";
import {
  listSnapshots,
  exportSnapshotJson,
  importSnapshotJson,
  type SnapshotMeta,
} from "@/lib/snapshots";
import { toast } from "@/store/toasts";
import { LiveSimForm } from "@/components/game/LiveSimForm";
import { useMultiplayerSession } from "@/lib/games/useMultiplayerSession";
import type { Team } from "@/types/game";

/**
 * Facilitator console — separate from the player UI.
 *
 * Two binding modes:
 *
 * 1. Solo / local mode (default — when no ?gameId is in the URL):
 *    The page reads the local Zustand store directly. Switching the
 *    active team pivots `playerTeamId` so the facilitator can see
 *    each airline's view in isolation. Same behavior as before.
 *
 * 2. Multiplayer mode (?gameId=X in the URL):
 *    The page first fetches the server-authoritative state via
 *    /api/games/load and hydrates the local store via
 *    `hydrateFromServerState`. Once hydrated, the existing console
 *    UI renders unchanged. Until Step 9 lands the facilitator's
 *    edits stay in the local store; with realtime sync those
 *    edits will broadcast to every player browser.
 *
 * A clear "Currently viewing" indicator + the team switcher warn
 * the user that this is a host tool, not a player surface.
 */
export default function FacilitatorPage() {
  // Suspense wrapper required because useSearchParams() inside the
  // inner component opts the route into client-side rendering, and
  // Next 16 needs an explicit boundary so the framework can stream
  // the suspending tree without bailing out of static rendering of
  // adjacent UI.
  return (
    <Suspense
      fallback={
        <main className="flex-1 min-h-0 flex flex-col items-center justify-center bg-surface-2/30">
          <Loader2 className="w-6 h-6 text-ink-muted animate-spin mb-3" />
          <p className="text-[0.875rem] text-ink-muted">Loading facilitator console…</p>
        </main>
      }
    >
      <FacilitatorPageInner />
    </Suspense>
  );
}

function FacilitatorPageInner() {
  const search = useSearchParams();
  const gameId = search.get("gameId");
  const { sessionId } = useMultiplayerSession();
  const hydrateFromServerState = useGame((g) => g.hydrateFromServerState);
  const [hydrateState, setHydrateState] = useState<
    "idle" | "loading" | "ready" | "error"
  >(gameId ? "loading" : "ready");
  const [hydrateError, setHydrateError] = useState<string | null>(null);

  // Multiplayer hydrate path — fires once when ?gameId is present.
  // Without gameId we skip and the local store renders directly.
  useEffect(() => {
    if (!gameId || !sessionId || hydrateState !== "loading") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateError(json.error ?? "Game not found.");
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateState("error");
          return;
        }
        if (!json.state) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateError("Game state not seeded yet — start the game from the lobby first.");
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateState("error");
          return;
        }
        const result = hydrateFromServerState({
          stateJson: json.state.state_json,
          mySessionId: sessionId,
        });
        if (cancelled) return;
        if (!result.ok) {
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateError(result.error ?? "Could not hydrate facilitator console.");
          // eslint-disable-next-line react-hooks/set-state-in-effect
          setHydrateState("error");
          return;
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHydrateState("ready");
      } catch (e) {
        if (cancelled) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHydrateError(e instanceof Error ? e.message : "Network error");
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setHydrateState("error");
      }
    })();
    return () => { cancelled = true; };
  }, [gameId, sessionId, hydrateState, hydrateFromServerState]);

  // While the page is hydrating from the server (or has errored on a
  // hydrate attempt), render a thin gate component that owns ZERO
  // hooks below this point. The post-hydrate UI lives in
  // <FacilitatorContent/> so all the panel-state hooks are
  // unconditional inside that child. Previously they sat after
  // these early returns and tripped react-hooks/rules-of-hooks.
  if (hydrateState === "loading") {
    return (
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center bg-surface-2/30">
        <Loader2 className="w-6 h-6 text-ink-muted animate-spin mb-3" />
        <p className="text-[0.875rem] text-ink-muted">Loading game state…</p>
      </main>
    );
  }
  if (hydrateState === "error") {
    return (
      <main className="flex-1 min-h-0 flex flex-col items-center justify-center bg-surface-2/30 p-6">
        <div className="max-w-md w-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-3" />
          <p className="text-base font-semibold text-rose-900 mb-2">Couldn&rsquo;t load game</p>
          <p className="text-sm text-rose-700 mb-4">{hydrateError ?? "Unknown error."}</p>
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to lobby
          </Link>
        </div>
      </main>
    );
  }

  return <FacilitatorContent />;
}

function FacilitatorContent() {
  const s = useGame();
  const player = selectPlayer(s);
  const setActiveTeam = useGame((g) => g.setActiveTeam);

  const [section, setSection] = useState<"teams" | "admin" | "leaderboard" | "session" | "livesims" | "saves" | "airports">("session");
  // Auto-jump the facilitator to the Airports section if a new bid
  // arrives while they're on a different tab — this is the regulator's
  // primary alert, so we make it impossible to miss.
  const pendingBidsCount = (s.airportBids ?? []).filter((b) => b.status === "pending").length;

  return (
    // min-h-0 is critical: the body has overflow-hidden + flex-col,
    // so without min-h-0 here the inner overflow-auto column doesn't
    // engage and the bottom of the page gets clipped. Same fix as
    // /endgame and the lobby pages.
    <main className="flex-1 min-h-0 flex flex-col bg-surface-2/30">
      <header className="px-8 py-4 border-b border-line bg-surface flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Link href="/" className="text-ink-muted hover:text-ink flex items-center gap-1.5 text-[0.8125rem]">
            <ArrowLeft size={13} /> Back to game
          </Link>
          <span className="text-line">·</span>
          <span className="font-display text-xl text-ink">Facilitator</span>
          <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            {fmtQuarter(s.currentQuarter)} · {s.teams.length} team{s.teams.length === 1 ? "" : "s"}
          </span>
          {/* Cohort readiness counter — visible in any mode where 2+
              humans exist. In self-guided mode the engine auto-fires
              closeQuarter once this hits N/N; in facilitated mode the
              facilitator still drives close but can see at a glance
              how many seats finished their submission flow. */}
          {(() => {
            const humans = s.teams.filter((t) => t.controlledBy === "human");
            const ready = humans.filter((t) => t.readyForNextQuarter === true).length;
            if (humans.length < 2) return null;
            const allReady = ready === humans.length;
            return (
              <span
                className={cn(
                  "ml-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 border",
                  "text-[0.6875rem] font-mono font-semibold tabular",
                  allReady
                    ? "border-positive/40 bg-[var(--positive-soft)]/40 text-positive"
                    : "border-line bg-surface-2 text-ink-2",
                )}
                title={`${ready} of ${humans.length} players ready for the next round`}
              >
                <span aria-hidden="true">{allReady ? "✓" : "·"}</span>
                {ready}/{humans.length} ready
              </span>
            );
          })()}
        </div>
        {player && (
          <div className="flex items-center gap-2 text-[0.75rem]">
            <span className="text-ink-muted">Viewing as:</span>
            <span
              className="inline-block w-6 h-6 rounded-md flex items-center justify-center font-mono text-[0.625rem] font-semibold text-primary-fg"
              style={{ background: player.color }}
            >
              {player.code}
            </span>
            <span className="font-medium text-ink">{player.name}</span>
          </div>
        )}
      </header>

      <div className="flex-1 min-h-0 flex">
        {/* Sidebar nav */}
        <nav className="w-52 border-r border-line bg-surface flex flex-col py-4 gap-1 px-2 shrink-0">
          <NavItem
            active={section === "session"}
            onClick={() => setSection("session")}
            Icon={Key}
            label="Session"
            sub="Code & seats"
          />
          <NavItem
            active={section === "teams"}
            onClick={() => setSection("teams")}
            Icon={Users}
            label="Teams"
            sub={`${s.teams.length} active`}
          />
          <NavItem
            active={section === "leaderboard"}
            onClick={() => setSection("leaderboard")}
            Icon={Trophy}
            label="Leaderboard"
            sub="Live rankings"
          />
          <NavItem
            active={section === "airports"}
            onClick={() => setSection("airports")}
            Icon={Building}
            label="Airports"
            sub={pendingBidsCount > 0 ? `${pendingBidsCount} bid${pendingBidsCount === 1 ? "" : "s"} pending` : "Ownership · bids"}
            badge={pendingBidsCount > 0 ? pendingBidsCount : undefined}
          />
          <NavItem
            active={section === "livesims"}
            onClick={() => setSection("livesims")}
            Icon={Mic}
            label="Live sims"
            sub="L0–L7 outcomes"
          />
          <NavItem
            active={section === "saves"}
            onClick={() => setSection("saves")}
            Icon={Save}
            label="Saves"
            sub="Snapshots & restore"
          />
          <NavItem
            active={section === "admin"}
            onClick={() => setSection("admin")}
            Icon={Settings2}
            label="Game state"
            sub="Quarter, fuel, teams"
          />
        </nav>

        {/* Main */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {section === "session" && <SessionView />}
          {section === "teams" && s.teams.length > 0 && (
            <TeamsView
              teams={s.teams}
              activeId={s.playerTeamId}
              onSelectTeam={(id) => setActiveTeam(id)}
            />
          )}
          {section === "teams" && s.teams.length === 0 && (
            <Card>
              <CardBody>
                <p className="text-ink-2 text-[0.875rem]">
                  No teams yet. Start a session in the Session tab to invite players.
                </p>
              </CardBody>
            </Card>
          )}
          {section === "leaderboard" && (
            <LeaderboardView teams={s.teams} />
          )}
          {section === "airports" && <AirportsView />}
          {section === "livesims" && s.teams.length > 0 && (
            <Card>
              <CardBody>
                <LiveSimForm teams={s.teams} />
              </CardBody>
            </Card>
          )}
          {section === "livesims" && s.teams.length === 0 && (
            <Card>
              <CardBody>
                <p className="text-ink-2 text-[0.875rem]">
                  Live-sim outcomes apply to existing teams. Start a session first.
                </p>
              </CardBody>
            </Card>
          )}
          {section === "saves" && <SavesView />}
          {section === "admin" && s.teams.length > 0 && (
            <Card>
              <CardBody>
                <AdminPanel />
              </CardBody>
            </Card>
          )}
          {section === "admin" && s.teams.length === 0 && (
            <Card>
              <CardBody>
                <p className="text-ink-2 text-[0.875rem]">
                  Game-state admin requires an active simulation. Start a session first.
                </p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function SessionView() {
  const sessionCode = useGame((s) => s.sessionCode);
  const sessionLocked = useGame((s) => s.sessionLocked);
  const sessionSlots = useGame((s) => s.sessionSlots);
  const startSession = useGame((s) => s.startFacilitatedSession);
  const setSessionLocked = useGame((s) => s.setSessionLocked);
  const rebroadcastSessionCode = useGame((s) => s.rebroadcastSessionCode);
  const [seatCount, setSeatCount] = useState(5);

  const claimed = sessionSlots.filter((x) => x.claimed).length;
  const total = sessionSlots.length;

  return (
    <div className="space-y-4 max-w-2xl">
      <header>
        <h1 className="font-display text-[1.75rem] text-ink mb-1">Facilitated session</h1>
        <p className="text-ink-2 text-[0.9375rem] leading-relaxed">
          Generate a 4-digit join code, share it with the players in the
          room, and watch them claim seats as they enter the simulation
          on their own devices via <span className="font-mono">/join</span>.
        </p>
      </header>

      {!sessionCode ? (
        <Card>
          <CardBody>
            <h2 className="font-display text-[1.25rem] text-ink mb-3">Start a new session</h2>
            <div className="space-y-3">
              <div>
                <div
                  id="seat-count-label"
                  className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5"
                >
                  Number of teams
                </div>
                <div
                  role="group"
                  aria-labelledby="seat-count-label"
                  className="flex items-center gap-3"
                >
                  <button
                    onClick={() => setSeatCount(Math.max(2, seatCount - 1))}
                    aria-label="Decrease team count"
                    className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    disabled={seatCount <= 2}
                  >
                    <span aria-hidden="true">−</span>
                  </button>
                  <span
                    className="tabular font-mono text-[1.5rem] text-ink font-bold w-14 text-center"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {seatCount}
                  </span>
                  <button
                    onClick={() => setSeatCount(Math.min(10, seatCount + 1))}
                    aria-label="Increase team count"
                    className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                    disabled={seatCount >= 10}
                  >
                    <span aria-hidden="true">+</span>
                  </button>
                  <span className="text-[0.75rem] text-ink-muted ml-2">
                    Between 2 and 10 players
                  </span>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="lg"
                  onClick={() => startSession(seatCount)}
                >
                  Generate session code →
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-[1.25rem] text-ink">Session active</h2>
              <Badge tone="positive">{claimed}/{total} seats claimed</Badge>
            </div>

            <div className="rounded-lg border-2 border-primary bg-[rgba(20,53,94,0.04)] p-6 text-center mb-4">
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
                Share this code
              </div>
              <div className="font-mono tabular text-[3.5rem] text-ink leading-none font-bold tracking-[0.4em] mb-2">
                {sessionCode}
              </div>
              <div className="text-[0.8125rem] text-ink-muted">
                Players visit{" "}
                <span className="font-mono text-ink">/join</span>{" "}
                and enter this code along with their company name and hub.
              </div>
            </div>

            {/* Session controls — lock toggle + reissue. Locked sessions
                still allow reconnects (a player whose computer dropped
                can rejoin by entering their original company name) but
                refuse new seat claims. */}
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Button
                variant={sessionLocked ? "primary" : "secondary"}
                size="sm"
                onClick={() => setSessionLocked(!sessionLocked)}
              >
                {sessionLocked ? <Lock size={13} className="mr-1.5" /> : <Unlock size={13} className="mr-1.5" />}
                {sessionLocked ? "Session locked" : "Lock session"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => rebroadcastSessionCode()}
                title="Generate a new join code. Existing players keep their teams; new players use the new code."
              >
                Reissue code
              </Button>
              <span className="text-[0.6875rem] text-ink-muted leading-relaxed flex-1 min-w-[180px]">
                {sessionLocked
                  ? "Locked — only existing players can reconnect (by their original company name)."
                  : "Unlocked — new players can claim any open seat. Lock once your cohort is in to prevent strays."}
              </span>
            </div>

            <div className="space-y-1.5">
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
                Seats
              </div>
              {sessionSlots.map((seat, i) => (
                <div
                  key={seat.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2 text-[0.875rem]",
                    seat.claimed
                      ? "border-positive/40 bg-[var(--positive-soft)]/40"
                      : "border-dashed border-line",
                  )}
                >
                  <span className="font-mono text-ink-muted w-8 tabular text-center text-[0.75rem]">
                    #{i + 1}
                  </span>
                  {seat.claimed ? (
                    <span className="text-ink font-medium flex-1">
                      {seat.companyName}
                    </span>
                  ) : (
                    <span className="text-ink-muted italic flex-1">Awaiting player…</span>
                  )}
                  {seat.claimed && <Badge tone="positive">Joined</Badge>}
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}

function NavItem({
  active, onClick, Icon, label, sub, badge,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Users;
  label: string;
  sub: string;
  /** Optional unread/pending count. Renders a top-right pill chip when
   *  > 0. Used by the Airports tab to surface pending bid count. */
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={badge && badge > 0
        ? `${label} — ${sub}, ${badge} pending`
        : `${label} — ${sub}`}
      className={cn(
        "relative rounded-lg flex items-start gap-3 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        active
          ? "bg-primary text-primary-fg"
          : "text-ink-2 hover:bg-surface-hover hover:text-ink",
      )}
    >
      <Icon size={16} strokeWidth={1.75} aria-hidden="true" className="shrink-0 mt-0.5" />
      <div className="min-w-0 flex-1">
        <div className="font-medium text-[0.875rem] leading-tight">{label}</div>
        <div className={cn(
          "text-[0.6875rem] mt-0.5",
          active ? "text-primary-fg/80" : "text-ink-muted",
        )}>
          {sub}
        </div>
      </div>
      {badge !== undefined && badge > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            "shrink-0 min-w-[20px] h-5 rounded-full flex items-center justify-center px-1.5 text-[0.625rem] font-bold tabular leading-none",
            active
              ? "bg-primary-fg text-primary"
              : "bg-accent text-primary-fg",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function TeamsView({
  teams, activeId, onSelectTeam,
}: {
  teams: Team[];
  activeId: string | null;
  onSelectTeam: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[1.75rem] text-ink mb-1">Teams</h1>
        <p className="text-ink-2 text-[0.875rem] leading-relaxed max-w-[60ch]">
          Switch the active view between teams. The selected airline becomes
          the &ldquo;player&rdquo; in the main game UI; the facilitator toggle
          here lets you flip through each airline&apos;s state without
          disturbing their session.
        </p>
      </header>

      <div
        role="radiogroup"
        aria-label="Active team viewer"
        className="grid grid-cols-1 md:grid-cols-2 gap-3"
      >
        {teams.map((t) => {
          const isActive = t.id === activeId;
          const av = computeAirlineValue(t);
          const br = brandRating(t);
          const activeRoutes = t.routes.filter((r) => r.status === "active").length;
          const pendingRoutes = t.routes.filter((r) => r.status === "pending").length;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`View as ${t.name} (${t.code}), hub ${t.hubCode}`}
              onClick={() => onSelectTeam(t.id)}
              className={cn(
                "rounded-lg border bg-surface p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                isActive
                  ? "border-primary shadow-[var(--shadow-2)] ring-2 ring-primary/20"
                  : "border-line hover:bg-surface-hover hover:border-line",
              )}
            >
              <div className="flex items-start gap-3 mb-3">
                <span
                  className="inline-block w-10 h-10 rounded-md flex items-center justify-center font-mono text-[0.75rem] font-semibold text-primary-fg shrink-0"
                  style={{ background: t.color }}
                >
                  {t.code}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-display text-[1.0625rem] text-ink leading-tight truncate">
                      {t.name}
                    </span>
                    {isActive && <Badge tone="primary">Active</Badge>}
                    {/* In multiplayer, every claimed seat is "Player" —
                        the facilitator wants to see who's a human vs a
                        bot. controlledBy is the right signal here, not
                        the legacy isPlayer flag (which only tags one
                        seat in solo runs). */}
                    {t.controlledBy === "human" && <Badge tone="accent">Player</Badge>}
                    {/* Ready chip — visible when the team has flipped
                        the readyForNextQuarter flag. Self-guided games
                        gate the auto-advance on every human team being
                        ready; in facilitated games this is just a
                        visual signal that the seat finished their
                        submission flow (board decisions + ops sliders +
                        any pending route bids). Bots don't have a
                        ready state — they act in their own quarter
                        close hook. */}
                    {t.controlledBy === "human" && t.readyForNextQuarter && (
                      <Badge tone="positive">Ready</Badge>
                    )}
                  </div>
                  <div className="text-[0.75rem] text-ink-muted font-mono">
                    Hub {t.hubCode} · {t.doctrine}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[0.8125rem]">
                <Row k="Cash" v={fmtMoney(t.cashUsd)} />
                <Row k="Debt" v={fmtMoney(t.totalDebtUsd)} />
                <Row k="Airline value" v={fmtMoney(av)} bold />
                <Row k="Brand rating" v={br.grade} />
                <Row k="Routes" v={`${activeRoutes}${pendingRoutes ? ` (+${pendingRoutes} pending)` : ""}`} />
                <Row k="Fleet" v={`${fleetCount(t.fleet)} aircraft`} />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardView({ teams }: { teams: Team[] }) {
  const ranked = [...teams].sort(
    (a, b) => computeAirlineValue(b) - computeAirlineValue(a),
  );
  return (
    <div className="space-y-4">
      <header>
        <h1 className="font-display text-[1.75rem] text-ink mb-1">Leaderboard</h1>
        <p className="text-ink-2 text-[0.875rem] leading-relaxed">
          Real-time ranking by Airline Value. Updated each quarter close.
        </p>
      </header>
      <Card>
        <CardBody>
          <table className="w-full text-[0.875rem]">
            <thead>
              <tr className="border-b border-line">
                <th className="text-left py-2 px-3 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">#</th>
                <th className="text-left py-2 px-3 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Team</th>
                <th className="text-right py-2 px-3 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Airline value</th>
                <th className="text-right py-2 px-3 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Brand</th>
                <th className="text-right py-2 px-3 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted"><Plane size={11} className="inline" /></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((t, i) => (
                <tr key={t.id} className="border-b border-line last:border-0 hover:bg-surface-hover">
                  <td className="py-2 px-3 font-mono text-ink-muted tabular">{i + 1}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg shrink-0" style={{ background: t.color }}>
                        {t.code}
                      </span>
                      <span className="font-medium text-ink">{t.name}</span>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-right tabular font-mono text-ink">{fmtMoney(computeAirlineValue(t))}</td>
                  <td className="py-2 px-3 text-right tabular font-mono text-ink">{brandRating(t).grade}</td>
                  <td className="py-2 px-3 text-right tabular font-mono text-ink-muted">{fleetCount(t.fleet)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Row({ k, v, bold = false }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted text-[0.6875rem] uppercase tracking-wider">{k}</span>
      <span className={cn("tabular font-mono", bold ? "text-ink font-semibold" : "text-ink-2")}>{v}</span>
    </div>
  );
}

/**
 * Quarter-snapshot facilitator surface.
 *
 * Lists every snapshot in localStorage (auto-saved at the start of each
 * round, plus any manual saves) and exposes Restore / Export / Import /
 * Delete. Restore replaces the live game state with the snapshot's
 * payload; Export downloads the JSON for archival; Import lets the
 * facilitator load a previously-exported JSON, useful if the localStorage
 * was wiped or the cohort moved to a new machine.
 */
function SavesView() {
  const saveQuarterSnapshot = useGame((s) => s.saveQuarterSnapshot);
  const restoreQuarterSnapshot = useGame((s) => s.restoreQuarterSnapshot);
  const deleteQuarterSnapshot = useGame((s) => s.deleteQuarterSnapshot);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const phase = useGame((s) => s.phase);

  const [snapshots, setSnapshots] = useState<SnapshotMeta[]>(() => listSnapshots());
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmRestoreId, setConfirmRestoreId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function refresh() {
    setSnapshots(listSnapshots());
  }

  function handleManualSave() {
    saveQuarterSnapshot();
    toast.accent("Snapshot saved", `Game saved at ${fmtQuarter(currentQuarter)}.`);
    refresh();
  }

  function handleRestore(id: string) {
    setPendingId(id);
    const r = restoreQuarterSnapshot(id);
    setPendingId(null);
    if (!r.ok) {
      toast.negative("Restore failed", r.error ?? "Unknown error.");
    } else {
      refresh();
      setConfirmRestoreId(null);
    }
  }

  function handleDelete(id: string) {
    deleteQuarterSnapshot(id);
    refresh();
    toast.info("Snapshot deleted", "Removed from local storage.");
  }

  function handleExport(id: string) {
    const json = exportSnapshotJson(id);
    if (!json) {
      toast.negative("Export failed", "Snapshot couldn't be read from storage.");
      return;
    }
    const meta = snapshots.find((s) => s.id === id);
    const filename = `skyforce-${meta?.quarterLabel?.replace(/\s+/g, "-").toLowerCase() ?? id}.json`;
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.accent("Snapshot exported", filename);
  }

  function handleImport(file: File) {
    file.text().then((text) => {
      const r = importSnapshotJson(text);
      if (!r.ok) {
        toast.negative("Import failed", r.error);
        return;
      }
      refresh();
      toast.accent("Snapshot imported", r.meta.quarterLabel);
    });
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <header>
        <h1 className="font-display text-[1.75rem] text-ink mb-1">Game saves</h1>
        <p className="text-ink-2 text-[0.9375rem] leading-relaxed">
          One snapshot per round, auto-saved when each round begins. Use
          <span className="font-medium text-ink"> Restore</span> to roll the
          game back to that exact moment — useful for re-syncing a cohort
          after a disconnection or replaying a critical decision.
        </p>
      </header>

      <Card>
        <CardBody>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <Button
              variant="primary"
              size="sm"
              onClick={handleManualSave}
              disabled={phase === "idle"}
            >
              <Save size={13} className="mr-1.5" />
              Save current state
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload size={13} className="mr-1.5" />
              Import JSON
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <span className="text-[0.6875rem] text-ink-muted ml-auto">
              {snapshots.length} snapshot{snapshots.length === 1 ? "" : "s"}
            </span>
          </div>

          {snapshots.length === 0 ? (
            <div className="text-[0.875rem] text-ink-muted italic py-8 text-center rounded-md border border-dashed border-line">
              No snapshots yet. They auto-save at the start of each round, or
              click <strong className="text-ink">Save current state</strong> above
              to take one now.
            </div>
          ) : (
            <div className="space-y-1.5">
              {snapshots.map((m) => (
                <div
                  key={m.id}
                  className="rounded-md border border-line p-3 flex items-center gap-3 hover:bg-surface-hover"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[0.8125rem] text-ink font-semibold">
                        {m.quarterLabel}
                      </span>
                      <span className="text-[0.6875rem] text-ink-muted">
                        Round {m.quarter}/40
                      </span>
                      {m.quarter === currentQuarter && (
                        <Badge tone="primary">Current</Badge>
                      )}
                    </div>
                    <div className="text-[0.75rem] text-ink-muted mt-0.5 truncate">
                      {m.label}
                    </div>
                    <div className="text-[0.625rem] text-ink-muted/70 mt-0.5">
                      Saved {new Date(m.savedAt).toLocaleString("en-AE", {
                        day: "numeric", month: "short", year: "numeric",
                        hour: "numeric", minute: "2-digit",
                      })} · {m.teamCount} team{m.teamCount === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setConfirmRestoreId(m.id)}
                      disabled={pendingId === m.id}
                      className="px-2 py-1 rounded-md border border-line text-[0.75rem] hover:bg-[var(--accent-soft)] hover:border-accent flex items-center gap-1 disabled:opacity-50"
                      title="Restore this snapshot — replaces live game state"
                    >
                      <RotateCcw size={11} /> Restore
                    </button>
                    <button
                      onClick={() => handleExport(m.id)}
                      className="px-2 py-1 rounded-md border border-line text-[0.75rem] hover:bg-surface-hover flex items-center gap-1"
                      title="Download this snapshot as JSON"
                    >
                      <Download size={11} /> Export
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(m.id)}
                      aria-label={`Delete snapshot ${m.quarterLabel}`}
                      className="px-2 py-1 rounded-md border border-line text-[0.75rem] hover:bg-[var(--negative-soft)] hover:border-negative flex items-center gap-1 text-ink-muted hover:text-negative focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                      title="Delete this snapshot"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <p className="text-[0.75rem] text-ink-muted leading-relaxed">
        Snapshots live in your browser&apos;s local storage. To move a save
        between machines, export it as JSON and import it on the new
        machine. The schema is versioned — saves from incompatible builds
        are rejected at import time.
      </p>

      {/* Restore confirmation — destructive (replaces live state) so we
          force a confirm. Switched from a hand-rolled overlay to the
          canonical <Modal> for visual consistency with every other
          confirm in the app. */}
      <Modal open={!!confirmRestoreId} onClose={() => setConfirmRestoreId(null)}>
        {confirmRestoreId && (() => {
          const meta = snapshots.find((m) => m.id === confirmRestoreId);
          if (!meta) return null;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Restore {meta.quarterLabel}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  This replaces the current game state with the snapshot taken
                  at the start of that round. Every team rolls back to where
                  they were at that moment. Subsequent rounds are wiped from
                  the live state but their snapshots stay in this list, so
                  you can re-restore at any time.
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Quarter</span>
                    <span className="tabular font-mono text-ink">{meta.quarterLabel}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Teams at snapshot</span>
                    <span className="tabular font-mono text-ink">{meta.teamCount}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Saved</span>
                    <span className="text-ink">{new Date(meta.savedAt).toLocaleString("en-AE", {
                      day: "numeric", month: "short", year: "numeric",
                      hour: "numeric", minute: "2-digit",
                    })}</span>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmRestoreId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => handleRestore(meta.id)}
                  disabled={pendingId === meta.id}
                >
                  {pendingId === meta.id ? "Restoring…" : "Restore game"}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>

      {/* Delete-snapshot confirm — small but irreversible. */}
      <Modal open={!!confirmDeleteId} onClose={() => setConfirmDeleteId(null)}>
        {confirmDeleteId && (() => {
          const meta = snapshots.find((m) => m.id === confirmDeleteId);
          if (!meta) return null;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Delete {meta.quarterLabel} snapshot?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Removes this saved state from local storage. The current
                  game session is unaffected — only the snapshot you took at
                  the start of {meta.quarterLabel} is lost.
                </p>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmDeleteId(null)}>
                  Keep snapshot
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    handleDelete(meta.id);
                    setConfirmDeleteId(null);
                  }}
                >
                  Delete
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

/**
 * Facilitator-side airport oversight. Two roles:
 *   1. **Bid inbox** — pending bids submitted by player teams that need
 *      regulator approval. Each row shows the airport, bidder, price,
 *      quarters held; approve / reject buttons commit or refund the
 *      escrowed cash.
 *   2. **Airport ownership table** — every Tier-1/2 airport with current
 *      owner (or "auction" if unowned), owner-set slot rate, capacity,
 *      and a Bids column that lights up when there's an active bid
 *      pending facilitator review.
 */
function AirportsView() {
  const teams = useGame((s) => s.teams);
  const airportSlots = useGame((s) => s.airportSlots);
  const airportBids = useGame((s) => s.airportBids ?? []);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const approveAirportBid = useGame((s) => s.approveAirportBid);
  const rejectAirportBid = useGame((s) => s.rejectAirportBid);

  const [confirmApproveId, setConfirmApproveId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>("");

  const pendingBids = airportBids.filter((b) => b.status === "pending");
  const recentResolved = airportBids
    .filter((b) => b.status !== "pending")
    .sort((a, b) => (b.resolvedQuarter ?? 0) - (a.resolvedQuarter ?? 0))
    .slice(0, 6);

  // Airport list — every airport that's either currently owned, has a
  // pending bid, or has any historical activity. Skips empty Tier-1/2
  // entries with nothing happening to keep the table compact.
  type AirportRow = {
    code: string;
    name: string;
    ownerTeamId?: string;
    capacity?: number;
    rate?: number;
    pendingCount: number;
  };
  const slotsMap = airportSlots ?? {};
  const rows: AirportRow[] = Object.entries(slotsMap)
    .flatMap(([code, st]) => {
      const pendingCount = pendingBids.filter((b) => b.airportCode === code).length;
      const isInteresting = !!st.ownerTeamId || pendingCount > 0;
      if (!isInteresting) return [];
      const row: AirportRow = {
        code,
        name: CITIES.find((c) => c.code === code)?.name ?? code,
        ownerTeamId: st.ownerTeamId,
        capacity: st.totalCapacity,
        rate: st.ownerSlotRatePerWeekUsd,
        pendingCount,
      };
      return [row];
    })
    .sort((a, b) => {
      // Pending bids float to top, then owned, then by code.
      if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
      if (!!a.ownerTeamId !== !!b.ownerTeamId) return a.ownerTeamId ? -1 : 1;
      return a.code.localeCompare(b.code);
    });

  function teamName(id: string): { name: string; code: string; color: string } {
    const t = teams.find((x) => x.id === id);
    return t
      ? { name: t.name, code: t.code, color: t.color }
      : { name: "(unknown)", code: "??", color: "#888" };
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="font-display text-[1.75rem] text-ink mb-1">Airports · regulator</h1>
        <p className="text-ink-2 text-[0.9375rem] leading-relaxed">
          Player teams can bid to acquire airports outright. As facilitator
          you act as the regulator — approve a bid to transfer operating
          control, or reject it (escrowed cash refunds in full). Bids that
          sit pending for 2 quarters auto-expire and refund.
        </p>
      </header>

      {/* Pending bids inbox — the regulator's primary workspace. */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
            Pending bids · {pendingBids.length}
          </div>
          {pendingBids.length > 0 && (
            <div className="text-[0.6875rem] text-warning font-semibold uppercase tracking-wider">
              ⚠ Awaiting your decision
            </div>
          )}
        </div>
        {pendingBids.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[0.875rem] text-ink-muted italic">
                No pending bids. Submitted bids will appear here for
                approval or rejection.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-2">
            {pendingBids.map((bid) => {
              const bidder = teamName(bid.bidderTeamId);
              const cityName = CITIES.find((c) => c.code === bid.airportCode)?.name ?? bid.airportCode;
              const heldQ = currentQuarter - bid.submittedQuarter;
              const expiresInQ = Math.max(0, 2 - heldQ);
              return (
                <div
                  key={bid.id}
                  className={cn(
                    "rounded-lg border p-4 flex items-start gap-4",
                    expiresInQ === 0
                      ? "border-warning bg-[var(--warning-soft)]/40"
                      : "border-line bg-surface",
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className="font-display text-[1.25rem] text-ink leading-none">
                        {cityName}
                      </span>
                      <span className="font-mono text-[0.75rem] text-ink-muted">{bid.airportCode}</span>
                      {expiresInQ === 0 && (
                        <Badge tone="warning">Expires this quarter</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[0.8125rem] mb-2">
                      <span
                        className="inline-block w-6 h-6 rounded-md flex items-center justify-center font-mono text-[0.625rem] font-semibold text-primary-fg"
                        style={{ background: bidder.color }}
                      >
                        {bidder.code}
                      </span>
                      <span className="text-ink font-medium">{bidder.name}</span>
                      <span className="text-ink-muted">bid</span>
                      <span className="font-mono tabular text-ink font-semibold">
                        {fmtMoney(bid.bidPriceUsd)}
                      </span>
                    </div>
                    <div className="text-[0.6875rem] text-ink-muted">
                      Submitted {fmtQuarter(bid.submittedQuarter)} ·{" "}
                      Held {heldQ} quarter{heldQ === 1 ? "" : "s"} ·{" "}
                      {expiresInQ === 0
                        ? "Auto-expires at this quarter close if not decided"
                        : `${expiresInQ} quarter${expiresInQ === 1 ? "" : "s"} until auto-expiry`}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => setConfirmApproveId(bid.id)}
                    >
                      <Check size={13} className="mr-1" /> Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRejectReason("");
                        setConfirmRejectId(bid.id);
                      }}
                    >
                      <X size={13} className="mr-1" /> Reject
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Airport ownership table — Bids column is highlighted when an
          active bid exists. Sorted: bids first, then owned, then code. */}
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
          Airports · {rows.length} active
        </div>
        {rows.length === 0 ? (
          <Card>
            <CardBody>
              <p className="text-[0.875rem] text-ink-muted italic">
                No airport ownership yet. Once teams submit bids or own
                airports, they&apos;ll appear here.
              </p>
            </CardBody>
          </Card>
        ) : (
          <div className="rounded-md border border-line overflow-hidden bg-surface">
            <table className="w-full text-[0.8125rem]">
              <thead className="bg-surface-2/40">
                <tr className="text-left">
                  <th className="px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Airport</th>
                  <th className="px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Owner</th>
                  <th className="px-3 py-2 text-right text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Slot rate / wk</th>
                  <th className="px-3 py-2 text-right text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Capacity</th>
                  <th className="px-3 py-2 text-right text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Bids</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const owner = r.ownerTeamId ? teamName(r.ownerTeamId) : null;
                  return (
                    <tr key={r.code} className="border-t border-line/60">
                      <td className="px-3 py-2.5">
                        <div className="font-display text-ink">{r.name}</div>
                        <div className="font-mono text-[0.6875rem] text-ink-muted">{r.code}</div>
                      </td>
                      <td className="px-3 py-2.5">
                        {owner ? (
                          <div className="flex items-center gap-1.5">
                            <span
                              className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg"
                              style={{ background: owner.color }}
                            >
                              {owner.code}
                            </span>
                            <span className="text-ink">{owner.name}</span>
                          </div>
                        ) : (
                          <span className="text-ink-muted italic text-[0.75rem]">unowned · auction</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular font-mono text-ink">
                        {r.rate ? fmtMoney(r.rate) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular font-mono text-ink-2">
                        {r.capacity ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {r.pendingCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--warning-soft)] text-warning font-semibold tabular text-[0.75rem]">
                            ⚠ {r.pendingCount}
                          </span>
                        ) : (
                          <span className="text-ink-muted">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Resolved bids history — last 6 decisions, helps the facilitator
          remember what they approved/rejected. */}
      {recentResolved.length > 0 && (
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Recent decisions
          </div>
          <div className="space-y-1.5">
            {recentResolved.map((bid) => {
              const bidder = teamName(bid.bidderTeamId);
              const cityName = CITIES.find((c) => c.code === bid.airportCode)?.name ?? bid.airportCode;
              return (
                <div
                  key={bid.id}
                  className="flex items-baseline gap-3 rounded-md border border-line bg-surface px-3 py-2 text-[0.8125rem]"
                >
                  <Badge
                    tone={
                      bid.status === "approved" ? "positive"
                        : bid.status === "rejected" ? "negative"
                        : "warning"
                    }
                  >
                    {bid.status}
                  </Badge>
                  <span className="text-ink font-medium">{cityName}</span>
                  <span className="text-ink-muted text-[0.75rem] font-mono">{bid.airportCode}</span>
                  <span className="text-ink-muted">·</span>
                  <span className="text-ink-2 text-[0.75rem]">{bidder.name}</span>
                  <span className="text-ink-muted">·</span>
                  <span className="tabular font-mono text-ink-2 text-[0.75rem]">
                    {fmtMoney(bid.bidPriceUsd)}
                  </span>
                  {bid.resolvedQuarter && (
                    <span className="ml-auto text-[0.6875rem] text-ink-muted font-mono">
                      {fmtQuarter(bid.resolvedQuarter)}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Approve confirm */}
      <Modal open={!!confirmApproveId} onClose={() => setConfirmApproveId(null)}>
        {confirmApproveId && (() => {
          const bid = pendingBids.find((b) => b.id === confirmApproveId);
          if (!bid) return null;
          const bidder = teamName(bid.bidderTeamId);
          const cityName = CITIES.find((c) => c.code === bid.airportCode)?.name ?? bid.airportCode;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Approve bid for {cityName}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Operating control transfers to <strong>{bidder.name}</strong>.
                  The escrowed bid is committed (no further cash movement —
                  the {fmtMoney(bid.bidPriceUsd)} was already deducted at
                  bid submission). Slot fees from every airline operating
                  here will flow to the new owner from next quarter.
                </p>
              </ModalHeader>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmApproveId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    approveAirportBid(bid.id);
                    setConfirmApproveId(null);
                  }}
                >
                  Approve transfer · {fmtMoney(bid.bidPriceUsd)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>

      {/* Reject confirm with optional reason */}
      <Modal open={!!confirmRejectId} onClose={() => setConfirmRejectId(null)}>
        {confirmRejectId && (() => {
          const bid = pendingBids.find((b) => b.id === confirmRejectId);
          if (!bid) return null;
          const bidder = teamName(bid.bidderTeamId);
          const cityName = CITIES.find((c) => c.code === bid.airportCode)?.name ?? bid.airportCode;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Reject bid for {cityName}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  The escrowed {fmtMoney(bid.bidPriceUsd)} is refunded to{" "}
                  <strong>{bidder.name}</strong> at this quarter close. They
                  can submit a new bid afterwards. Optional: leave a reason
                  so the bidder knows why.
                </p>
              </ModalHeader>
              <ModalBody>
                <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
                  Reason (optional)
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value.slice(0, 200))}
                  placeholder="e.g. Strategic asset, government wants to retain control"
                  rows={3}
                  className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[0.875rem] text-ink focus:outline-none focus:border-primary resize-none"
                />
                <div className="text-[0.625rem] text-ink-muted mt-1 tabular font-mono">
                  {rejectReason.length}/200
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmRejectId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    rejectAirportBid(bid.id, rejectReason.trim() || undefined);
                    setConfirmRejectId(null);
                    setRejectReason("");
                  }}
                >
                  Reject · refund {fmtMoney(bid.bidPriceUsd)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
