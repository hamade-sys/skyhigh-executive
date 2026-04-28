"use client";

import { useEffect, useState, Suspense } from "react";
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
import { MapCommandHud } from "@/components/game/MapCommandHud";
import { QuarterTimerDriver } from "@/components/game/QuarterTimer";
import { Toaster } from "@/components/game/Toaster";
import { useShallow } from "zustand/react/shallow";
import { useGame, selectPlayer, selectRivals } from "@/store/game";
import type { City } from "@/types/game";
import { CITIES } from "@/data/cities";
import { Button } from "@/components/ui";
import { ErrorBoundary } from "@/components/ErrorBoundary";

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
  const player = useGame(selectPlayer);
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

  if (phase === "idle" || !playerTeamId || !player) {
    // PRD §13.1 pre-game lobby
    return (
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="max-w-2xl text-center">
          <div className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent mb-4">
            SkyForce · Executive Simulation
          </div>
          <h1 className="font-display text-4xl md:text-5xl text-ink leading-tight mb-4">
            Run a global airline for ten years.
          </h1>
          <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-2">
            SkyForce is a 40-round executive simulation covering 2015–2024.
            Open routes across 380+ cities, build a fleet from 40+ commercial
            aircraft, navigate 18 board-level scenarios, and steer through real
            macro events — World Cup, Olympics, fuel shocks, talent wars,
            recession, and the carbon-levy ultimatum.
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
          team={
            // In view-only mode, map paints the named rival's network.
            // Click handlers and onClearSelection still target the
            // player so route creation always affects the player only.
            viewingTeamId
              ? rivals.find((r) => r.id === viewingTeamId) ?? player
              : player
          }
          rivals={rivals}
          currentQuarter={currentQuarter}
          selectedOriginCode={origin}
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

      {/* Bottom-right command HUD — scaffolds the route-launch flow and
          tells the player exactly what to do at each step. Collapses to
          an explanatory note when a panel is open so they know why map
          clicks aren't working. */}
      <MapCommandHud
        origin={origin}
        dest={dest}
        hubCode={player.hubCode}
        activeRouteCount={
          player.routes.filter((r) => r.status !== "closed").length
        }
        compact={!!currentPanel}
      />

      {/* Floating route launch bar — always visible during selection,
          never blocks the map. Clicking "Launch" opens the detail modal. */}
      <RouteLaunchBar
        origin={origin}
        dest={dest}
        onCancel={() => { setOrigin(null); setDest(null); setIsCargo(false); }}
        onLaunch={() => setLaunchOpen(true)}
      />

      {/* Detail modal for route configuration — only opens post-Launch */}
      <RouteSetupModal
        open={launchOpen}
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
