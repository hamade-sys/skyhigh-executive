"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
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
import { FleetPanel } from "@/components/panels/FleetPanel";
import { RoutesPanel } from "@/components/panels/RoutesPanel";
import { FinancialsPanel } from "@/components/panels/FinancialsPanel";
import { OpsPanel } from "@/components/panels/OpsPanel";
import { DecisionsPanel } from "@/components/panels/DecisionsPanel";
import { NewsPanel } from "@/components/panels/NewsPanel";
import { LeaderboardPanel } from "@/components/panels/LeaderboardPanel";
import { AdminPanel } from "@/components/panels/AdminPanel";
import { RouteSetupModal } from "@/components/game/RouteSetupModal";
import { RouteLaunchBar } from "@/components/game/RouteLaunchBar";
import { QuarterTimerDriver } from "@/components/game/QuarterTimer";
import { Toaster } from "@/components/game/Toaster";
import { useShallow } from "zustand/react/shallow";
import { useGame, selectPlayer, selectRivals } from "@/store/game";
import type { City } from "@/types/game";
import { Button } from "@/components/ui";

const PANEL_META: Record<
  PanelId,
  { title: string; subtitle?: string; width?: "narrow" | "wide"; render: () => React.ReactNode }
> = {
  overview:    { title: "Overview",    width: "narrow", render: () => <OverviewPanel /> },
  fleet:       { title: "Fleet",       subtitle: "Aircraft owned, leased, and on order", width: "narrow", render: () => <FleetPanel /> },
  routes:      { title: "Routes",      subtitle: "Active network and profitability", width: "narrow", render: () => <RoutesPanel /> },
  financials:  { title: "Financials",  subtitle: "Balance sheet, debt, quarterly history", width: "wide", render: () => <FinancialsPanel /> },
  ops:         { title: "Quarterly ops", subtitle: "Set spend levels and close the quarter", width: "narrow", render: () => <OpsPanel /> },
  decisions:   { title: "Board decisions", subtitle: "Scenarios — final once submitted", width: "wide", render: () => <DecisionsPanel /> },
  news:        { title: "World news",  subtitle: "Headlines this quarter + forecast", width: "narrow", render: () => <NewsPanel /> },
  leaderboard: { title: "Leaderboard", subtitle: "Ranked by Brand Value", width: "narrow", render: () => <LeaderboardPanel /> },
  admin:       { title: "Facilitator", subtitle: "Admin controls for this simulation", width: "narrow", render: () => <AdminPanel /> },
};

function CanvasInner() {
  const router = useRouter();
  // Fine-grained store subscriptions so clicks and typing don't force
  // a whole-canvas re-render.
  const phase = useGame((state) => state.phase);
  const playerTeamId = useGame((state) => state.playerTeamId);
  const player = useGame(selectPlayer);
  // useShallow so the .filter() in selectRivals doesn't return a fresh array
  // reference every render and trip the getServerSnapshot infinite-loop guard.
  const rivals = useGame(useShallow(selectRivals));
  const currentPanel = useUi((s) => s.panel);
  const railExpanded = useUi((s) => s.railExpanded);

  // Hydration-aware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Route setup state (lifted up to share between map + modal)
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);
  const [isCargo, setIsCargo] = useState(false);
  const [launchOpen, setLaunchOpen] = useState(false);

  function handleCityClick(c: City) {
    // No origin yet: select it (highlighted yellow on the map).
    if (!origin) return setOrigin(c.code);
    // Clicked the same origin: deselect.
    if (c.code === origin) { setOrigin(null); setDest(null); return; }
    // Origin set, new city clicked: set as destination AND auto-open the
    // route setup modal so the player goes straight from the second click
    // into managing the new route.
    if (!dest) {
      setDest(c.code);
      setLaunchOpen(true);
      return;
    }
    // Otherwise restart with the new origin.
    setOrigin(c.code);
    setDest(null);
    setLaunchOpen(false);
  }

  useEffect(() => {
    if (!hydrated) return;
    if (phase === "idle" || !playerTeamId) router.replace("/onboarding");
    else if (phase === "endgame") router.replace("/endgame");
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
            Your simulation begins shortly.
          </h1>
          <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-2">
            You&apos;ll run an airline for 20 quarters: open routes across 100 cities,
            command a fleet of up to 21 aircraft types, and steer through 18
            board-level scenarios and the global Travel Index.
          </p>
          <p className="text-ink-muted text-[0.8125rem] mb-8">
            You begin with $150M seed capital. Q1 Brand Building determines your
            L0 cash injection (up to +$80M) and brand foundation before Q2
            operations open.
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
            <PreGameStat label="Quarters" value="20" sub="Five years of strategy" />
            <PreGameStat label="Cities" value="100" sub="Tier 1 hubs to T4 outposts" />
            <PreGameStat label="Aircraft" value="21" sub="A220 to A380, freighters" />
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
        className="absolute inset-0 top-14 transition-[left] duration-[var(--dur-fast)]"
        style={{ left: railExpanded ? "14rem" : "3.5rem" }}
      >
        <WorldMap
          team={player}
          rivals={rivals}
          selectedOriginCode={origin}
          onCityClick={handleCityClick}
          onClearSelection={() => { setOrigin(null); setDest(null); }}
        />
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

      {/* Floating route launch bar — always visible during selection,
          never blocks the map. Clicking "Launch" opens the detail modal. */}
      <RouteLaunchBar
        origin={origin}
        dest={dest}
        isCargo={isCargo}
        setIsCargo={setIsCargo}
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
    <Suspense fallback={<main className="flex-1" />}>
      <CanvasInner />
    </Suspense>
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
