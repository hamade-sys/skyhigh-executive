"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { WorldMap } from "@/components/game/WorldMap";
import { NavRail, type PanelId } from "@/components/game/NavRail";
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
import { useGame, selectPlayer } from "@/store/game";
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
  const params = useSearchParams();
  const s = useGame();
  const player = selectPlayer(s);

  // Hydration-aware
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const currentPanel = params.get("panel") as PanelId | null;

  // Route setup state (lifted up to share between map + modal)
  const [origin, setOrigin] = useState<string | null>(null);
  const [dest, setDest] = useState<string | null>(null);

  function handleCityClick(c: City) {
    if (!origin) return setOrigin(c.code);
    if (origin && !dest && c.code !== origin) return setDest(c.code);
    setOrigin(c.code);
    setDest(null);
  }

  useEffect(() => {
    if (!hydrated) return;
    if (s.phase === "idle" || !s.playerTeamId) router.replace("/onboarding");
    else if (s.phase === "endgame") router.replace("/endgame");
  }, [hydrated, s.phase, s.playerTeamId, router]);

  if (!hydrated) {
    return (
      <main className="flex-1 flex items-center justify-center text-ink-muted">
        Loading…
      </main>
    );
  }

  if (s.phase === "idle" || !s.playerTeamId || !player) {
    // Pre-redirect render: welcome prompt
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <p className="text-ink-muted mb-3">Loading simulation…</p>
          <Button variant="primary" onClick={() => router.push("/onboarding")}>
            Begin new simulation →
          </Button>
        </div>
      </main>
    );
  }

  const meta = currentPanel ? PANEL_META[currentPanel] : null;

  return (
    <main className="flex-1 relative">
      {/* Full-viewport map */}
      <div className="absolute inset-0">
        <WorldMap
          team={player}
          selectedOriginCode={origin}
          onCityClick={handleCityClick}
        />
      </div>

      {/* Floating chrome */}
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
