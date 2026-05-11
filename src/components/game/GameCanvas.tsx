"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
// Leaflet hits `window` on import, so the map can't render on the server.
const WorldMap = dynamic(
  () => import("@/components/game/WorldMap").then((m) => m.WorldMap),
  { ssr: false, loading: () => <div className="w-full h-full bg-[var(--map-ocean-deep)]" /> },
);
import { NavRail } from "@/components/game/NavRail";
import { useUi, type PanelId } from "@/store/ui";
import { Panel } from "@/components/game/Panel";
import { TopBar } from "@/components/layout/TopBar";
import { QuarterCloseModal } from "@/components/game/QuarterCloseModal";
import { OverviewPanel } from "@/components/panels/OverviewPanel";
import { ReportsPanel } from "@/components/panels/ReportsPanel";
import { DashboardPanel } from "@/components/panels/DashboardPanel";
import { FleetPanel } from "@/components/panels/FleetPanel";
import { RoutesPanel } from "@/components/panels/RoutesPanel";
import { FinancialsPanel } from "@/components/panels/FinancialsPanel";
import { OpsPanel } from "@/components/panels/OpsPanel";
import { InvestmentsPanel } from "@/components/panels/InvestmentsPanel";
import { DecisionsPanel } from "@/components/panels/DecisionsPanel";
import { NewsPanel } from "@/components/panels/NewsPanel";
import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";
import { SlotMarketPanel } from "@/components/panels/SlotMarketPanel";
import { AdminPanel } from "@/components/panels/AdminPanel";
import { RouteSetupModal } from "@/components/game/RouteSetupModal";
import { AirportDetailModal } from "@/components/game/AirportDetailModal";
import { RouteLaunchBar } from "@/components/game/RouteLaunchBar";
import { QuarterTimerDriver } from "@/components/game/QuarterTimer";
import { Toaster } from "@/components/game/Toaster";
import { useShallow } from "zustand/react/shallow";
import { useGame, selectPlayer, selectRivals, selectActiveTeam } from "@/store/game";
import type { City } from "@/types/game";
import { CITIES } from "@/data/cities";
import { Button } from "@/components/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";

// ── Bot-only auto-advance ──────────────────────────────────────────────────
// How long (seconds) to pause between rounds so the GM can watch what
// happened before the next bot simulation fires automatically.
const BOT_AUTO_ADVANCE_SECONDS = 20;

/** Countdown + auto-advance component rendered inside the GM observer banner
 *  when ALL teams are bots (no human players in the game). Counts down from
 *  BOT_AUTO_ADVANCE_SECONDS, then fires gmAdvanceQuarter automatically.
 *  The GM can click "▶ Skip" to advance immediately.
 *
 *  Rapid-click resilience: gmAdvanceQuarter sets gmAdvanceInFlight in the
 *  Zustand store while the server push is in-flight. The Skip button is
 *  disabled during that window and shows a spinner. When the push settles
 *  (gmAdvanceInFlight → false) and seconds is already 0, the component
 *  automatically retries the advance so a rapid second click that was
 *  blocked doesn't leave the banner frozen at "0s". */
function BotAutoAdvanceBanner({
  gmAdvanceQuarter,
}: {
  gmAdvanceQuarter: () => void;
}) {
  const [seconds, setSeconds] = useState(BOT_AUTO_ADVANCE_SECONDS);
  // Subscribe to the reactive push-in-flight flag so we can disable the
  // button and auto-retry without polling a module-level variable.
  const inFlight = useGame((s) => s.gmAdvanceInFlight);

  // Always-current ref so the countdown effect never needs gmAdvanceQuarter
  // in its dependency array. Without this, a reference change (e.g. after a
  // Realtime re-hydration) would re-run the effect while seconds === 0 and
  // fire gmAdvanceQuarter a second time — causing a duplicate advance and a
  // cascade of 409 version-conflict errors.
  const advanceRef = useRef(gmAdvanceQuarter);
  useEffect(() => { advanceRef.current = gmAdvanceQuarter; }, [gmAdvanceQuarter]);

  // Reset counter every time this component mounts (= start of a new round).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeconds(BOT_AUTO_ADVANCE_SECONDS);
  }, []);

  // Count down 1 s at a time; fire advance when we reach 0 AND the previous
  // push has settled. If seconds hits 0 while inFlight is true (rapid clicks
  // or very fast auto-countdown), the advance is deferred until inFlight
  // clears — the effect below handles that auto-retry.
  useEffect(() => {
    if (seconds <= 0) {
      if (!inFlight) advanceRef.current();
      return;
    }
    const id = window.setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => window.clearTimeout(id);
  }, [seconds, inFlight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-retry: when the push settles (inFlight flips false) and seconds is
  // already 0, trigger the advance. This is the key fix for the "stuck at 0s"
  // bug: a rapid second Skip click was blocked by the guard and left the
  // banner frozen because currentQuarter never changed (no remount).
  useEffect(() => {
    if (!inFlight && seconds <= 0) {
      advanceRef.current();
    }
  }, [inFlight]); // eslint-disable-line react-hooks/exhaustive-deps

  // Arc progress — full circle = BOT_AUTO_ADVANCE_SECONDS, shrinks to 0.
  const pct = seconds / BOT_AUTO_ADVANCE_SECONDS;
  const r = 10;
  const circ = 2 * Math.PI * r;
  const dash = circ * pct;

  return (
    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
      {/* Circular countdown arc — replaces with a spinner while in-flight */}
      {inFlight ? (
        <svg width="22" height="22" className="animate-spin">
          <circle cx="11" cy="11" r={r} fill="none" stroke="#475569" strokeWidth="2" />
          <path d={`M 11 1 A ${r} ${r} 0 0 1 ${11 + r} 11`} fill="none" stroke="#a78bfa" strokeWidth="2" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="22" height="22" className="-rotate-90">
          <circle cx="11" cy="11" r={r} fill="none" stroke="#475569" strokeWidth="2" />
          <circle
            cx="11" cy="11" r={r}
            fill="none"
            stroke="#a78bfa"
            strokeWidth="2"
            strokeDasharray={`${dash} ${circ}`}
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className="text-violet-300 tabular-nums">{inFlight ? "…" : `${seconds}s`}</span>
      <span className="text-slate-300">· next round in</span>
      <button
        onClick={() => { setSeconds(0); }}
        disabled={inFlight}
        className="ml-1 px-2 py-0.5 rounded-full text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed bg-violet-600 hover:bg-violet-500 active:bg-violet-700 disabled:hover:bg-violet-600"
        title={inFlight ? "Advancing round…" : "Advance to next round immediately"}
      >
        {inFlight ? "Advancing…" : "▶ Skip"}
      </button>
    </div>
  );
}

const PANEL_META: Record<
  PanelId,
  { title: string; subtitle?: string; width?: "narrow" | "wide"; render: () => React.ReactNode }
> = {
  reports:     { title: "Reports",     subtitle: "Overview, management, and financials in one place", width: "wide", render: () => <ReportsPanel /> },
  // Legacy single-tab entries, kept so any deep link / focus signal that
  // still mentions them resolves to the same panels (rendered inside
  // Reports normally).
  overview:    { title: "Overview",    width: "narrow", render: () => <OverviewPanel /> },
  dashboard:   { title: "Management report", subtitle: "Snapshot, trajectory, P&L by period, ops breakdown", width: "wide", render: () => <DashboardPanel /> },
  financials:  { title: "Financials",  subtitle: "Balance sheet, debt, quarterly history", width: "wide", render: () => <FinancialsPanel /> },
  fleet:       { title: "Fleet",       subtitle: "Aircraft owned, leased, and on order", width: "wide", render: () => <FleetPanel /> },
  routes:      { title: "Routes",      subtitle: "Active network and profitability", width: "wide", render: () => <RoutesPanel /> },
  ops:         { title: "Quarterly ops", subtitle: "Set spend levels and close the quarter", width: "narrow", render: () => <OpsPanel /> },
  investments: { title: "Investments",   subtitle: "Subsidiary businesses · revenue + operational leverage", width: "wide", render: () => <InvestmentsPanel /> },
  decisions:   { title: "Board decisions", subtitle: "Scenarios — final once submitted", width: "wide", render: () => <DecisionsPanel /> },
  news:        { title: "World news",  subtitle: "Headlines this quarter + forecast", width: "wide", render: () => <NewsPanel /> },
  leaderboard: { title: "Leaderboard", subtitle: "Ranked by Brand Value", width: "narrow", render: () => <LeaderboardPanel /> },
  slots:       { title: "Slot market",  subtitle: "Bid for airport runway slots — resolves at quarter close", width: "wide", render: () => <SlotMarketPanel /> },
  admin:       { title: "Facilitator", subtitle: "Admin controls for this simulation", width: "narrow", render: () => <AdminPanel /> },
};

function CanvasInner() {
  const router = useRouter();
  // Fine-grained store subscriptions so clicks and typing don't force
  // a whole-canvas re-render.
  const phase = useGame((state) => state.phase);
  const playerTeamId = useGame((state) => state.playerTeamId);
  const currentQuarter = useGame((state) => state.currentQuarter);
  // Detect multiplayer context — session.gameId is set in-memory after
  // hydrateFromServerState. Not persisted to localStorage, so this is
  // null on solo runs and on home-page canvas mounts.
  const multiplayerGameId = useGame(
    (s) => ((s.session as Record<string, unknown> | null)?.gameId as string) ?? null,
  );
  const setActiveTeam = useGame((s) => s.setActiveTeam);
  const gmAdvanceQuarter = useGame((s) => s.gmAdvanceQuarter);
  const firstTeamId = useGame((s) => s.teams[0]?.id ?? null);
  const player = useGame(selectPlayer);
  // isObserver is true for the Game Master (no claimed team). All state
  // mutations are already blocked in the store; here we use it to keep
  // the GM's playerTeamId null (so setActiveTeam only sets activeTeamId)
  // and to hide interactive canvas elements (map click, launch bar, HUD).
  const isObserver = useGame((s) => s.isObserver);
  // GM can advance if there is at least one bot team — the button is
  // hidden when all seats are filled by human players (they control their
  // own advance via the Close Quarter button).
  const hasBotTeams = useGame((s) =>
    s.teams.some((t) => t.botDifficulty != null || t.controlledBy === "bot"),
  );
  // True when ALL teams are bots (no human players at all). In this
  // mode the game auto-advances on a timer instead of waiting for a human.
  const allBotsGame = useGame((s) =>
    s.teams.length > 0 &&
    s.teams.every((t) => t.botDifficulty != null || t.controlledBy === "bot"),
  );
  // activeTeam: what is currently displayed. For observers this is the
  // team they are spectating (set via setActiveTeam). For players it's
  // the same as player. canvasPlayer is the non-null "display team" used
  // by the map and panels.
  const activeTeam = useGame(selectActiveTeam);
  const canvasPlayer = isObserver ? activeTeam : player;

  // Game Master auto-view: when the GM has no claimed team, pin their
  // view to the first available team so the map renders immediately.
  // Because setActiveTeam now sets activeTeamId (not playerTeamId) for
  // observers, playerTeamId stays null — the GM never accidentally gets
  // ownership of a player's team.
  useEffect(() => {
    if (multiplayerGameId && isObserver && !activeTeam && firstTeamId) {
      setActiveTeam(firstTeamId);
    }
  }, [multiplayerGameId, isObserver, activeTeam, firstTeamId, setActiveTeam]);
  // View-only competitor mode (Sprint 7): when set, the map renders
  // the named rival's network instead of the player's. Click handlers
  // are still bound to the player so route creation always targets
  // the player's airline — viewing a rival is strictly read-only.
  const viewingTeamId = useUi((state) => state.viewingTeamId);
  // useShallow so the .filter() in selectRivals doesn't return a fresh array
  // reference every render and trip the getServerSnapshot infinite-loop guard.
  const rivals = useGame(useShallow(selectRivals));
  const currentPanel = useUi((s) => s.panel);
  const railExpanded = useUi((s) => s.railExpanded);

  // Hydration-aware — flips a flag once after first client paint so we
  // can render store-dependent UI without SSR/CSR mismatch warnings.
  // setState-in-effect is the canonical hydration pattern; the lint
  // rule's "cascading renders" concern doesn't apply because the effect
  // runs once with empty deps.
  const [hydrated, setHydrated] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setHydrated(true), []);

  // Route setup state (lifted up to share between map + modal)
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  // Airport detail modal — backed by the UI store so other panels
  // (e.g. SlotMarketPanel "Detail" button) can open the same modal as
  // a keyboard-friendly entry point parallel to map double-click.
  const airportDetailCode = useUi((u) => u.airportDetailCode);
  const setAirportDetailCode = useUi((u) => u.setAirportDetailCode);
  const airportDetail = airportDetailCode
    ? CITIES.find((c) => c.code === airportDetailCode) ?? null
    : null;
  const [isCargo, setIsCargo] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  function handleCityClick(c: City) {
    // Observers (GM) cannot create or modify routes — hard block here
    // so map clicks never start the selection/launch flow.
    if (isObserver) return;
    // No origin yet: select it (highlighted yellow on the map).
    if (!origin) return setOrigin(c.code);
    // Clicked the same origin: deselect.
    if (c.code === origin) { setOrigin(null); setDest(null); return; }
    // Origin set, new city clicked: pick as destination.
    if (!dest) {
      setDest(c.code);
      // If a route already exists between these endpoints AND of the
      // SAME mode (passenger/cargo) as the current click intent, open
      // the Routes panel focused on it. If a passenger route exists
      // and the player has the Cargo toggle on, fall through to the
      // new-route launch bar so the player can stack a cargo lane on
      // top of the existing passenger lane (and vice versa). Earlier
      // the handler always matched any route regardless of mode, so
      // adding cargo on an existing passenger OD pair was impossible.
      const existingSameMode = player?.routes.find(
        (r) =>
          r.status !== "closed" &&
          !!r.isCargo === isCargo &&
          ((r.originCode === origin && r.destCode === c.code) ||
            (r.originCode === c.code && r.destCode === origin)),
      );
      if (existingSameMode) {
        useUi.getState().openPanel("routes");
        useUi.getState().setFocusedRouteId(existingSameMode.id);
        setOrigin(null);
        setDest(null);
        setLaunchOpen(false);
      } else {
        // No matching-mode route → launch the new-route flow. The
        // launch bar (RouteLaunchBar) lets the player toggle pax/cargo
        // before committing.
        setLaunchOpen(true);
      }
      return;
    }
    // Otherwise restart with the new origin.
    setOrigin(c.code);
    setDest(null);
    setLaunchOpen(false);
  }

  useEffect(() => {
    if (!hydrated) return;
    // The pre-game lobby (rendered below) IS the landing page in
    // production. Previously this effect auto-redirected to /onboarding
    // the moment the page loaded with no save, which meant new visitors
    // never saw the marketing intro. Only redirect on terminal endgame
    // state — idle simply renders the landing.
    if (phase === "endgame") router.replace("/endgame");
  }, [hydrated, phase, playerTeamId, router]);

  if (!hydrated) {
    return (
      <main className="flex-1 flex items-center justify-center text-ink-muted">
        Loading…
      </main>
    );
  }

  // ── Multiplayer observer (Game Master) ──────────────────────────────────
  // isObserver is true when the GM has no claimed team. We let them reach
  // the full live canvas — the observer banner and the interaction blocks
  // below keep everything read-only. If the active team hasn't been set
  // yet (teams not loaded), show a brief loading state.
  if (isObserver && multiplayerGameId) {
    if (!canvasPlayer) {
      return (
        <main className="flex-1 flex items-center justify-center text-ink-muted">
          Loading game…
        </main>
      );
    }
    // Fall through to the full canvas render below.
  } else if (phase === "idle" || !playerTeamId || !player) {
    // PRD §13.1 pre-game lobby
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl text-center">
          <div className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent mb-4">
            ICAN Simulations · Airline
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-ink leading-tight mb-4">
            Run a global airline.
          </h1>
          <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-2">
            An executive simulation by ICAN MENA. Open routes across hundreds
            of cities, build a fleet from a deep aircraft catalogue, navigate
            board-level scenarios, and steer through real macro events — fuel
            shocks, talent wars, recession, and regulatory ultimatums.
          </p>
          <p className="text-ink-muted text-[0.8125rem] mb-8">
            You begin with $150M seed capital. Q1 Brand Building sets your
            opening cash injection (up to +$80M) and brand foundation before
            Q2 operations open.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Button variant="primary" size="lg" onClick={() => router.push("/onboarding")}>
              Begin Q1 Brand Building →
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={() => useGame.getState().startDemo()}
            >
              Play demo round
            </Button>
          </div>
          <div className="text-[0.75rem] text-ink-muted mt-3">
            Demo seeds a sample airline so you can explore mechanics without setup.
          </div>
          <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-4 text-left max-w-2xl mx-auto">
            <PreGameStat label="Rounds" value="40" sub="2015 → 2024 calendar" />
            <PreGameStat label="Cities" value="380+" sub="Tier 1 hubs to T4 outposts" />
            <PreGameStat label="Aircraft" value="40+" sub="Airbus, Boeing, Embraer, ATR, COMAC, Bombardier" />
            <PreGameStat label="Scenarios" value="18" sub="Board-level decisions" />
          </div>
          <div className="mt-8 text-left max-w-2xl mx-auto rounded-md border border-line bg-surface-2/40 p-4">
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
              How a quarter plays
            </div>
            <ol className="list-decimal list-inside text-[0.8125rem] text-ink-2 leading-relaxed space-y-1">
              <li>Open and price routes from your hub on the world map</li>
              <li>Set the six operational sliders (staff, marketing, service…)</li>
              <li>Resolve any board scenarios that came up this quarter</li>
              <li>Click <span className="font-semibold text-ink">Next Quarter</span> — engine settles fuel, fares, costs, and brand</li>
              <li>Read the digest, adapt strategy, then walk into the next quarter</li>
            </ol>
          </div>
        </div>
      </main>
    );
  }

  const meta = currentPanel ? PANEL_META[currentPanel] : null;

  return (
    <main className="flex-1 relative overflow-hidden">
      {/* Full-viewport map — inset below the top bar + past the nav rail.
          Left inset matches the rail's current width so the rail never sits
          on top of the map. */}
      <div
        // `isolate` creates a stacking context so Leaflet's pane z-indices
        // (which go up to 1000) stay inside this map container instead of
        // competing in the document root with our fixed-position chrome.
        className="absolute inset-0 top-14 isolate transition-[left] duration-[var(--dur-fast)]"
        style={{ left: railExpanded ? "14rem" : "3.5rem" }}
      >
        <WorldMap
          // canvasPlayer is guaranteed non-null here: observers are
          // returned early above if canvasPlayer is null; non-observers
          // are guarded by the idle/!player check before this block.
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          team={
            viewingTeamId
              ? rivals.find((r) => r.id === viewingTeamId) ?? canvasPlayer!
              : canvasPlayer!
          }
          rivals={rivals}
          currentQuarter={currentQuarter}
          selectedOriginCode={isObserver ? null : origin}
          onCityClick={handleCityClick}
          onCityDoubleClick={(c) => setAirportDetailCode(c.code)}
          onClearSelection={() => { setOrigin(null); setDest(null); }}
        />
        {/* Transparent blocker — sits on top of the map whenever a side
            panel is open so drag and click events don't bleed through to
            the map behind it. Visually invisible; functionally a wall. */}
        {currentPanel && (
          <div className="absolute inset-0 z-[600] cursor-default" />
        )}
      </div>

      {/* Attached chrome */}
      <TopBar />
      <NavRail />

      {/* Active panel */}
      {meta && (
        <Panel title={meta.title} subtitle={meta.subtitle} width={meta.width}>
          {meta.render()}
        </Panel>
      )}

      {/* Observer / GM banner — shown instead of action HUDs so the GM
          always knows they're in spectate-only mode.
          - Bot-only game  → auto-advance countdown + Skip button
          - Mixed game     → static read-only pill + manual Advance button
          - Human-only     → static read-only pill (no advance control) */}
      {isObserver && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-[700] flex items-center gap-3">

          {allBotsGame && phase === "playing" ? (
            /* Bot simulation mode: auto-advance fires after the countdown.
               A new BotAutoAdvanceBanner mounts each round (currentQuarter
               change causes a re-key) so the timer resets cleanly. */
            <BotAutoAdvanceBanner
              key={currentQuarter}
              gmAdvanceQuarter={gmAdvanceQuarter}
            />
          ) : (
            /* Mixed or human-only game: static observer pill */
            <div className="pointer-events-none inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900/80 backdrop-blur-sm text-white text-xs font-semibold shadow-lg">
              <span className="text-violet-300">👁</span>
              Observer · read-only — use the nav rail to switch teams
            </div>
          )}

          {/* Manual Advance button: visible in mixed games (human + bots)
              so the GM can trigger bot rounds if no human is online, and
              in bot-only games where they want to skip without waiting. */}
          {hasBotTeams && !allBotsGame && phase === "playing" && (
            <button
              onClick={gmAdvanceQuarter}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-violet-600 hover:bg-violet-500 active:bg-violet-700 text-white text-xs font-semibold shadow-lg transition-colors cursor-pointer select-none"
              title="Run all bot turns and advance to the next round"
            >
              ▶ Advance Round
            </button>
          )}
        </div>
      )}

      {/* Floating route launch bar — hidden for observers. */}
      {!isObserver && (
        <RouteLaunchBar
          origin={origin}
          dest={dest}
          onCancel={() => { setOrigin(null); setDest(null); setIsCargo(false); }}
          onLaunch={() => setLaunchOpen(true)}
        />
      )}

      {/* Detail modal for route configuration — never opens for observers */}
      <RouteSetupModal
        open={!isObserver && launchOpen}
        origin={origin}
        dest={dest}
        forceCargo={isCargo}
        onClose={() => {
          setLaunchOpen(false);
          setOrigin(null);
          setDest(null);
          setIsCargo(false);
        }}
      />

      {/* Airport detail popup — opened by double-clicking a city on the map */}
      <AirportDetailModal
        city={airportDetail}
        onClose={() => setAirportDetailCode(null)}
      />

      {/* Quarter close modal */}
      <QuarterCloseModal />

      {/* 1Hz timer driver (no render) */}
      <QuarterTimerDriver />

      {/* Toast stack */}
      <Toaster />
    </main>
  );
}

export function GameCanvas() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<main className="flex-1" />}>
        <CanvasInner />
      </Suspense>
    </ErrorBoundary>
  );
}

function PreGameStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className="font-display text-[1.5rem] text-ink tabular leading-tight">{value}</div>
      <div className="text-[0.6875rem] text-ink-muted leading-tight mt-0.5">{sub}</div>
    </div>
  );
}
