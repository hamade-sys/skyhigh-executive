"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { AdminPanel } from "@/components/panels/AdminPanel";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { computeAirlineValue, brandRating, fleetCount } from "@/lib/engine";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plane, Users, Settings2, Trophy } from "lucide-react";
import type { Team } from "@/types/game";

/**
 * Facilitator console — separate from the player UI.
 *
 * In production this would be auth-gated as a distinct role and would
 * communicate with player sessions via a backend. In this single-player
 * demo it shares the same Zustand store: switching the active team
 * pivots the game store's `playerTeamId` so the facilitator can see
 * each airline's view in isolation. A clear "Currently viewing"
 * indicator and a TEAM_SWITCHER warn the user that this is a host
 * tool, not a player surface.
 */
export default function FacilitatorPage() {
  const s = useGame();
  const player = selectPlayer(s);
  const setActiveTeam = useGame((g) => g.setActiveTeam);

  const [section, setSection] = useState<"teams" | "admin" | "leaderboard">("teams");

  if (s.teams.length === 0) {
    return (
      <main className="flex-1 flex items-center justify-center px-8 py-16">
        <Card className="max-w-md">
          <CardBody>
            <h1 className="font-display text-[1.5rem] text-ink mb-2">No active simulation</h1>
            <p className="text-ink-2 text-[0.875rem] leading-relaxed mb-4">
              The facilitator console manages a running simulation. Set up
              the players first via onboarding.
            </p>
            <Link href="/onboarding" className="inline-block">
              <Button variant="primary">Start a new simulation →</Button>
            </Link>
          </CardBody>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex-1 flex flex-col bg-surface-2/30">
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

      <div className="flex-1 flex">
        {/* Sidebar nav */}
        <nav className="w-52 border-r border-line bg-surface flex flex-col py-4 gap-1 px-2 shrink-0">
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
            active={section === "admin"}
            onClick={() => setSection("admin")}
            Icon={Settings2}
            label="Game state"
            sub="Quarter, fuel, teams"
          />
        </nav>

        {/* Main */}
        <div className="flex-1 overflow-auto px-8 py-6">
          {section === "teams" && (
            <TeamsView
              teams={s.teams}
              activeId={s.playerTeamId}
              onSelectTeam={(id) => setActiveTeam(id)}
            />
          )}
          {section === "leaderboard" && (
            <LeaderboardView teams={s.teams} />
          )}
          {section === "admin" && (
            <Card>
              <CardBody>
                <AdminPanel />
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </main>
  );
}

function NavItem({
  active, onClick, Icon, label, sub,
}: {
  active: boolean;
  onClick: () => void;
  Icon: typeof Users;
  label: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-lg flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
        active
          ? "bg-primary text-primary-fg"
          : "text-ink-2 hover:bg-surface-hover hover:text-ink",
      )}
    >
      <Icon size={16} strokeWidth={1.75} className="shrink-0 mt-0.5" />
      <div>
        <div className="font-medium text-[0.875rem] leading-tight">{label}</div>
        <div className={cn(
          "text-[0.6875rem] mt-0.5",
          active ? "text-primary-fg/80" : "text-ink-muted",
        )}>
          {sub}
        </div>
      </div>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {teams.map((t) => {
          const isActive = t.id === activeId;
          const av = computeAirlineValue(t);
          const br = brandRating(t);
          const activeRoutes = t.routes.filter((r) => r.status === "active").length;
          const pendingRoutes = t.routes.filter((r) => r.status === "pending").length;
          return (
            <button
              key={t.id}
              onClick={() => onSelectTeam(t.id)}
              className={cn(
                "rounded-lg border bg-surface p-4 text-left transition-all",
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
                    {t.isPlayer && <Badge tone="accent">Player</Badge>}
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
