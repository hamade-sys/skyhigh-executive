"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { WorldMap } from "@/components/game/WorldMap";
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
import { QuarterTimerDriver } from "@/components/game/QuarterTimer";
import { Toaster } from "@/components/game/Toaster";
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
  const rivals = useGame(selectRivals);
  const currentPanel = useUi((s) => s.panel);

  // Hydration-aware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  // Route setup state (lifted up to share between map + modal)
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);

  function handleCityClick(c: City) {
    // No origin yet: select it
    if (!origin) return setOrigin(c.code);
    // Clicked the same origin: deselect
    if (c.code === origin) { setOrigin(null); setDest(null); return; }
    // Origin set and new city picked: set as destination (modal opens)
    if (!dest) return setDest(c.code);
    // Otherwise restart with new origin
    setOrigin(c.code);
    setDest(null);
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
        <div className="max-w-xl text-center">
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
          <div className="flex items-center justify-center gap-3">
            <Button variant="primary" size="lg" onClick={() => router.push("/onboarding")}>
              Begin Q1 Brand Building →
            </Button>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-4 text-left max-w-md mx-auto">
            <div className="border-t border-line pt-3">
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Quarters</div>
              <div className="font-display text-[1.5rem] text-ink tabular leading-tight">20</div>
            </div>
            <div className="border-t border-line pt-3">
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Cities</div>
              <div className="font-display text-[1.5rem] text-ink tabular leading-tight">100</div>
            </div>
            <div className="border-t border-line pt-3">
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Scenarios</div>
              <div className="font-display text-[1.5rem] text-ink tabular leading-tight">18</div>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const meta = currentPanel ? PANEL_META[currentPanel] : null;

  return (
    <main className="flex-1 relative overflow-hidden">
      {/* Full-viewport map — inset below the top bar + past the nav rail */}
      <div className="absolute inset-0 top-14 left-14">
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

      {/* Route setup modal when both origin + dest selected */}
      <RouteSetupModal
        origin={origin}
        dest={dest}
        onClose={() => { setOrigin(null); setDest(null); }}
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
