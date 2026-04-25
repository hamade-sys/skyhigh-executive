"use client";

import { useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, CardBody, Input } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { AdminPanel } from "@/components/panels/AdminPanel";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { computeAirlineValue, brandRating, fleetCount } from "@/lib/engine";
import { cn } from "@/lib/cn";
import { ArrowLeft, Plane, Users, Settings2, Trophy, Key } from "lucide-react";
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

  const [section, setSection] = useState<"teams" | "admin" | "leaderboard" | "session">("session");

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
  const sessionSlots = useGame((s) => s.sessionSlots);
  const startSession = useGame((s) => s.startFacilitatedSession);
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
                <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
                  Number of teams
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSeatCount(Math.max(2, seatCount - 1))}
                    className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40"
                    disabled={seatCount <= 2}
                  >
                    −
                  </button>
                  <span className="tabular font-mono text-[1.5rem] text-ink font-bold w-14 text-center">
                    {seatCount}
                  </span>
                  <button
                    onClick={() => setSeatCount(Math.min(10, seatCount + 1))}
                    className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40"
                    disabled={seatCount >= 10}
                  >
                    +
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
