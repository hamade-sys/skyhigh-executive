"use client";

import { useState } from "react";
import { useGame, selectPlayer, selectRivals, selectActiveTeam, selectOtherTeams } from "@/store/game";
import { useUi } from "@/store/ui";
import { fmtMoney, fmtQuarter, fmtQuarterShort } from "@/lib/format";
import { cn } from "@/lib/cn";
import { computeAirlineValue, brandRating } from "@/lib/engine";
import { QuarterTimerChip } from "@/components/game/QuarterTimer";
import { HelpModal } from "@/components/game/HelpModal";
import { NotificationCenter } from "@/components/game/NotificationCenter";
import { ChatPanel } from "@/components/game/ChatPanel";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { scenariosForQuarter } from "@/data/scenarios";
import { getTotalRounds } from "@/lib/format";
import { HelpCircle, Trophy, ChevronDown, Eye, MoreVertical, RotateCcw, X, Hash, MessageCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { airlineColorFor } from "@/lib/games/airline-colors";

export function TopBar() {
  // Fine-grained subscriptions so unrelated store writes don't re-render this.
  // "Player" here means "the team this browser is bound to" — in solo runs
  // that's selectPlayer (legacy playerTeamId); in multiplayer it's
  // selectActiveTeam (the seat claimed by this browser's session). Falls
  // back to selectPlayer when no active claim exists so older saves keep
  // working without re-claiming.
  const activeTeam = useGame(selectActiveTeam);
  const legacyPlayer = useGame(selectPlayer);
  const player = activeTeam ?? legacyPlayer;
  // Same logic for "rivals" — in multiplayer that's every team that ISN'T
  // you (other humans + bots); in solo it's every non-isPlayer team.
  const otherTeams = useGame(useShallow(selectOtherTeams));
  const legacyRivals = useGame(useShallow(selectRivals));
  const rivals = activeTeam ? otherTeams : legacyRivals;
  const currentQuarter = useGame((state) => state.currentQuarter);
  const joinCode = useGame((s) => s.session?.joinCode ?? null);
  const viewingTeamId = useUi((u) => u.viewingTeamId);
  const setViewingTeamId = useUi((u) => u.setViewingTeamId);
  const [helpOpen, setHelpOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  // Phase 10 — chat panel state. Only available in multiplayer
  // (`session.gameId` set). Unread badge tracks new messages while
  // the panel is closed.
  const [chatOpen, setChatOpen] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const isMultiplayer = useGame((g) => g.session?.gameId != null);

  if (!player) return null;

  // The "currently displayed" team — player by default, rival when in
  // view-only mode. KPIs in the strip below also follow this so the
  // airline identity and the numbers stay visually consistent.
  const viewingRival = viewingTeamId
    ? rivals.find((r) => r.id === viewingTeamId)
    : null;
  const displayTeam = viewingRival ?? player;
  const airlineValue = computeAirlineValue(displayTeam);

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 h-14 z-[60]",
        "flex items-center gap-5 pl-4 pr-4",
        "border-b border-line bg-surface/85 backdrop-blur-md",
        viewingRival && "border-b-2 border-accent",
      )}
    >
      {/* Brand + airline identity — clickable to open the switcher */}
      <div className="flex items-center gap-3 min-w-0 shrink-0 pr-4 mr-0.5 border-r border-line h-full">
        <button
          type="button"
          onClick={() => setSwitcherOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={switcherOpen}
          aria-label={
            viewingRival
              ? `Currently viewing ${displayTeam.name} (rival, view-only). Click to switch airlines.`
              : `Currently viewing ${displayTeam.name}. Click to switch to a rival airline view.`
          }
          className="flex items-center gap-3 min-w-0 hover:bg-surface-hover rounded-md -ml-1.5 pl-1.5 pr-2 py-1 transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          title="Switch view: see your airline or peek into a rival's network"
        >
          <span
            className="inline-flex w-8 h-8 rounded-md items-center justify-center font-mono text-[0.6875rem] font-semibold shadow-[var(--shadow-1)]"
            style={{
              // Phase 9 — chosen brand color overrides legacy team.color.
              background: airlineColorFor({
                colorId: displayTeam.airlineColorId,
                fallbackKey: displayTeam.id,
              }).hex,
              color: airlineColorFor({
                colorId: displayTeam.airlineColorId,
                fallbackKey: displayTeam.id,
              }).textOn === "white" ? "#fff" : "#0F172A",
            }}
          >
            {displayTeam.code}
          </span>
          <div className="min-w-0 hidden md:block text-left">
            <div className="font-display text-[1rem] text-ink leading-none truncate flex items-center gap-1">
              {displayTeam.name}
              {viewingRival && (
                <Eye size={12} className="text-accent shrink-0" aria-label="View only" />
              )}
              <ChevronDown size={12} className="text-ink-muted opacity-50 group-hover:opacity-100 shrink-0" />
            </div>
            <div className="text-[0.625rem] text-ink-muted uppercase tracking-wider mt-1 truncate font-medium">
              {viewingRival ? "View only · rival network" : (
                <>Hub {displayTeam.hubCode}
                {displayTeam.secondaryHubCodes.length > 0 &&
                  ` +${displayTeam.secondaryHubCodes.length}`}</>
              )}
            </div>
          </div>
        </button>
        <AirlineSwitcher
          open={switcherOpen}
          onClose={() => setSwitcherOpen(false)}
          player={player}
          rivals={rivals}
          viewingTeamId={viewingTeamId}
          onSelect={(id) => {
            setViewingTeamId(id === player.id ? null : id);
            setSwitcherOpen(false);
          }}
        />
      </div>

      {/* KPIs — follow the currently-displayed team. When viewing a
          rival, the strip shows their numbers (read-only). */}
      <div className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0">
        <Kpi label="Cash" value={fmtMoney(displayTeam.cashUsd)} emphasize />
        <Divider />
        <Kpi
          label="Debt"
          value={fmtMoney(displayTeam.totalDebtUsd)}
          tone={displayTeam.totalDebtUsd > 0 ? "neg" : undefined}
        />
        <Divider />
        <Kpi label="Airline value" value={fmtMoney(airlineValue)} emphasize />
        <Divider />
        <Kpi label="Brand rating" value={brandRating(displayTeam).grade} />
        {!viewingRival && displayTeam.rcfBalanceUsd > 0 && (
          <>
            <Divider />
            <Kpi
              label="RCF drawn"
              value={fmtMoney(displayTeam.rcfBalanceUsd)}
              tone="warn"
            />
          </>
        )}
        {viewingRival && (
          <button
            onClick={() => setViewingTeamId(null)}
            aria-label={`Return to ${player.name} (your airline)`}
            className="ml-auto mr-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[0.75rem] bg-accent/10 text-accent hover:bg-accent/20 font-semibold uppercase tracking-wider focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            title="Return to your airline"
          >
            <span aria-hidden="true">←</span> Return to {player.name}
          </button>
        )}
      </div>

      {/* Join code chip — lets late-joiners see the code without going back to lobby */}
      {joinCode && (
        <div
          className="hidden lg:inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-line bg-surface-2 text-ink-muted font-mono text-[0.6875rem] font-semibold tracking-[0.15em] tabular shrink-0"
          title="4-digit game code — share this so others can join"
        >
          <Hash size={10} aria-hidden className="shrink-0 opacity-60" />
          {joinCode}
        </div>
      )}

      {/* Quarter + timer + Close-quarter CTA */}
      <div className="flex items-center gap-3 shrink-0 pl-4 border-l border-line h-full">
        <div className="hidden md:flex flex-col items-end leading-tight">
          {/* Larger date label up top, "Round X of 20" beneath. */}
          <span className="font-display text-[1.0625rem] text-ink">
            {fmtQuarter(currentQuarter)}
          </span>
          <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mt-0.5 tabular">
            {fmtQuarterShort(currentQuarter)}
          </span>
        </div>
        <QuarterTimerChip />
        <LeaderboardButton />
        {isMultiplayer && (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            aria-label={chatUnread > 0 ? `Open chat (${chatUnread} unread)` : "Open chat"}
            aria-haspopup="dialog"
            aria-expanded={chatOpen}
            title="Cohort chat"
            className="relative w-8 h-8 min-h-[40px] min-w-[40px] rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <MessageCircle size={16} aria-hidden="true" />
            {chatUnread > 0 && (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 min-w-[16px] h-[16px] rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1"
              >
                {chatUnread > 9 ? "9+" : chatUnread}
              </span>
            )}
          </button>
        )}
        <NotificationCenter />
        <button
          type="button"
          onClick={() => setHelpOpen(true)}
          aria-label="Help &amp; reference"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          title="Quick reference (cheat sheet)"
          className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <HelpCircle size={16} aria-hidden="true" />
        </button>
        <GameMenu />
        <CloseQuarterButton />
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      {isMultiplayer && (
        <ChatPanel
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onUnreadCountChange={setChatUnread}
        />
      )}
    </header>
  );
}

function LeaderboardButton() {
  const openPanel = useUi((u) => u.openPanel);
  const currentPanel = useUi((u) => u.panel);
  const isOpen = currentPanel === "leaderboard";
  return (
    <button
      type="button"
      onClick={() => openPanel("leaderboard")}
      aria-label="Open leaderboard"
      aria-pressed={isOpen}
      title="Leaderboard"
      className={cn(
        "w-8 h-8 rounded-md flex items-center justify-center transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
        isOpen
          ? "bg-surface-hover text-ink"
          : "text-ink-muted hover:text-ink hover:bg-surface-hover",
      )}
    >
      <Trophy size={16} aria-hidden="true" />
    </button>
  );
}

function CloseQuarterButton() {
  const closeQuarter = useGame((s) => s.closeQuarter);
  const currentQuarter = useGame((s) => s.currentQuarter);
  // Phase 3: pull totalRounds from session for the scaled scenario
  // lookup below.
  const totalRounds = useGame(getTotalRounds);
  // "Player" = the team this browser controls. selectActiveTeam in
  // multiplayer; selectPlayer fallback for solo + legacy saves.
  const activeTeam = useGame(selectActiveTeam);
  const legacyPlayer = useGame(selectPlayer);
  const player = activeTeam ?? legacyPlayer;
  const openPanel = useUi((u) => u.openPanel);
  // Multiplayer-aware ready flag wiring — when in self-guided mode
  // with ≥2 humans, the Next Quarter button becomes a Ready toggle
  // for the active player (instead of running closeQuarter directly).
  // The auto-advance hook in setActiveTeamReady fires close once
  // every human has flipped ready. Solo + facilitated keep the
  // existing instant-close flow.
  const sessionMode = useGame((s) => s.session?.mode ?? null);
  const humanCount = useGame(
    (s) => s.teams.filter((t) => t.controlledBy === "human").length,
  );
  // How many of those humans are ready right now — drives the
  // "N of M ready" counter chip beside the Next Quarter / Mark Ready
  // button, so each player can see cohort progress at a glance.
  const readyCount = useGame(
    (s) => s.teams.filter(
      (t) => t.controlledBy === "human" && t.readyForNextQuarter === true,
    ).length,
  );
  const activeTeamId = useGame((s) => s.activeTeamId ?? s.playerTeamId);
  const myReady = useGame(
    (s) => s.teams.find((t) => t.id === (s.activeTeamId ?? s.playerTeamId))?.readyForNextQuarter ?? false,
  );
  const setActiveTeamReady = useGame((s) => s.setActiveTeamReady);
  const isMultiplayerSelfGuided = sessionMode === "self_guided" && humanCount >= 2;
  // Quarter close readiness modal — replaces the simple "you have N
  // pending decisions, close anyway?" prompt with a full pre-close
  // checklist (recommendation #1: stronger quarter cockpit). The
  // player sees decisions / dormant routes / cash risk / losing
  // routes / pending auctions all in one frame before committing.
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!player) return null;
  // activeTeamId fallback already handled above; just satisfy TS
  void activeTeamId;

  const pending = scenariosForQuarter(currentQuarter, totalRounds).filter(
    (sc) => !player.decisions.some((d) => d.scenarioId === sc.id && d.quarter === currentQuarter),
  );

  // Readiness checks. Each yields {label, status, count, hint, openPanelId?}.
  // status: "ok" / "warn" / "info". The button always opens the modal so
  // the player gets the same frame whether everything is green or there
  // are real issues — recommendation #1 specifically called for "ready
  // to close?" as a journey, not a fork in the road.
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const dormantRoutes = activeRoutes.filter(
    (r) => r.aircraftIds.length === 0 ||
      !r.aircraftIds.some((id) => player.fleet.find((f) => f.id === id && f.status === "active")),
  );
  const losingRoutes = activeRoutes.filter((r) => (r.consecutiveLosingQuarters ?? 0) >= 2);
  const pendingRoutes = player.routes.filter((r) => r.status === "pending");
  const totalQuarterlyCosts = activeRoutes.reduce(
    (s, r) => s + (r.quarterlyFuelCost ?? 0) + (r.quarterlySlotCost ?? 0), 0,
  );
  const cashRiskLevel: "ok" | "warn" | "danger" =
    player.cashUsd <= 0 ? "danger"
    : totalQuarterlyCosts > 0 && player.cashUsd < totalQuarterlyCosts * 1.5 ? "warn"
    : "ok";

  type CheckStatus = "ok" | "warn" | "danger" | "info";
  type Check = {
    id: string;
    label: string;
    detail: string;
    status: CheckStatus;
    panel?: import("@/store/ui").PanelId;
    cta?: string;
  };
  const checks: Check[] = [
    {
      id: "decisions",
      label: pending.length === 0 ? "All board decisions resolved" : `${pending.length} board decision${pending.length === 1 ? "" : "s"} pending`,
      detail: pending.length === 0
        ? "Every scenario this quarter has been answered."
        : "Unanswered scenarios auto-submit to a sensible default at close.",
      status: pending.length === 0 ? "ok" : "warn",
      panel: "decisions",
      cta: "Open Decisions",
    },
    {
      id: "dormant",
      label: dormantRoutes.length === 0
        ? "No dormant routes"
        : `${dormantRoutes.length} active route${dormantRoutes.length === 1 ? "" : "s"} with no aircraft`,
      detail: dormantRoutes.length === 0
        ? "Every active route has at least one operating aircraft."
        : "Slots are leased but no flights are scheduled. Assign aircraft or close the route.",
      status: dormantRoutes.length === 0 ? "ok" : "warn",
      panel: "routes",
      cta: "Open Routes",
    },
    {
      id: "cash",
      label: cashRiskLevel === "ok"
        ? `Cash buffer healthy · ${fmtMoney(player.cashUsd)}`
        : cashRiskLevel === "warn"
          ? `Cash thin · ${fmtMoney(player.cashUsd)} vs ${fmtMoney(totalQuarterlyCosts)}/Q direct`
          : `Cash negative · ${fmtMoney(player.cashUsd)}`,
      detail: cashRiskLevel === "ok"
        ? "Cash > 1.5× quarterly direct costs (fuel + slot)."
        : cashRiskLevel === "warn"
          ? "Cash is below 1.5× quarterly direct costs. A bad quarter could push you negative."
          : "You're already in the red. Next quarter close charges fixed costs against an empty till.",
      status: cashRiskLevel,
      panel: "reports",
      cta: "Open Reports",
    },
    {
      id: "losing",
      label: losingRoutes.length === 0
        ? "No routes flagged losing 2Q+"
        : `${losingRoutes.length} route${losingRoutes.length === 1 ? "" : "s"} losing money 2Q+`,
      detail: losingRoutes.length === 0
        ? "Every active route covered direct costs in at least one of the last two quarters."
        : "Consider cutting frequency, lowering pricing tier, or closing.",
      status: losingRoutes.length === 0 ? "ok" : "warn",
      panel: "routes",
      cta: "Open Routes",
    },
    {
      id: "pending-routes",
      label: pendingRoutes.length === 0
        ? "No pending route auctions"
        : `${pendingRoutes.length} route${pendingRoutes.length === 1 ? "" : "s"} awaiting slot auction`,
      detail: pendingRoutes.length === 0
        ? "No bids are queued at quarter close."
        : "Your pending bids resolve at this close. Cash is deducted only on win.",
      status: pendingRoutes.length === 0 ? ("ok" as const) : ("info" as const),
      panel: "slots",
      cta: "Open Slot Market",
    },
  ];

  const issueCount = checks.filter((c) => c.status === "warn" || c.status === "danger").length;

  // In multiplayer self-guided mode, the primary CTA flips to a Ready
  // toggle: clicking it marks the active player ready (so the cohort
  // close fires when everyone's done) and clicking it again unmarks.
  // The pre-flight modal still appears the FIRST time so the player
  // sees the readiness checks; subsequent toggles bypass it.
  const primaryLabel = isMultiplayerSelfGuided
    ? (myReady ? "Ready ✓ — waiting on cohort" : "Mark Ready →")
    : "Next Quarter →";
  const primaryTitle = isMultiplayerSelfGuided
    ? (myReady
        ? "You're ready. Quarter advances automatically once every player marks ready. Click again to unmark."
        : "Lock your decisions for this round. The quarter closes when every player has marked ready.")
    : "Lock decisions + run quarter close.";

  return (
    <>
      {/* Ready cohort counter — only shown in multiplayer self-guided
          runs. Helps each player see how close the cohort is to the
          auto-advance gate. The chip updates live as other players
          mark/unmark — once realtime sync lands, this reflects every
          browser's state. Today (no realtime), it reflects this
          browser's local view. */}
      {isMultiplayerSelfGuided && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1",
            "text-[0.6875rem] font-mono font-semibold tabular border",
            readyCount === humanCount
              ? "border-positive/40 bg-[var(--positive-soft)]/40 text-positive"
              : "border-line bg-surface-2 text-ink-2",
          )}
          title={`${readyCount} of ${humanCount} players ready for the next round`}
          aria-label={`${readyCount} of ${humanCount} players ready`}
        >
          <span aria-hidden="true">{readyCount === humanCount ? "✓" : "·"}</span>
          {readyCount}/{humanCount}
        </span>
      )}
      <Button
        variant={isMultiplayerSelfGuided && myReady ? "ghost" : "primary"}
        size="sm"
        onClick={() => {
          if (isMultiplayerSelfGuided && myReady) {
            // Already ready — clicking unmarks. No modal.
            setActiveTeamReady(false);
            return;
          }
          // Open the readiness modal (solo + facilitated + first-mark
          // multiplayer all surface the pre-flight check first).
          setConfirmOpen(true);
        }}
        title={primaryTitle}
      >
        {primaryLabel}
      </Button>

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} className="max-w-xl">
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Close {fmtQuarter(currentQuarter)}?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            {issueCount === 0
              ? "Pre-flight checks all green. Locking decisions and running quarter close."
              : `${issueCount} item${issueCount === 1 ? "" : "s"} flagged. Review or close anyway — auto-resolutions kick in for unfinished items.`}
          </p>
        </ModalHeader>
        <ModalBody className="space-y-1.5">
          {checks.map((c) => (
            <div
              key={c.id}
              className={cn(
                "rounded-md border px-3 py-2.5 flex items-start gap-3",
                c.status === "ok" && "border-positive/40 bg-[var(--positive-soft)]/30",
                c.status === "warn" && "border-warning/40 bg-[var(--warning-soft)]/30",
                c.status === "danger" && "border-negative/40 bg-[var(--negative-soft)]/30",
                c.status === "info" && "border-line bg-surface",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[0.6875rem] font-bold mt-0.5",
                  c.status === "ok" && "bg-positive text-primary-fg",
                  c.status === "warn" && "bg-warning text-primary-fg",
                  c.status === "danger" && "bg-negative text-primary-fg",
                  c.status === "info" && "bg-ink-muted text-primary-fg",
                )}
              >
                {c.status === "ok" ? "✓" : c.status === "danger" ? "!" : c.status === "warn" ? "⚠" : "i"}
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[0.875rem] font-semibold text-ink">{c.label}</div>
                <div className="text-[0.75rem] text-ink-muted leading-relaxed mt-0.5">
                  {c.detail}
                </div>
              </div>
              {c.cta && c.panel && (c.status === "warn" || c.status === "danger") && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setConfirmOpen(false);
                    openPanel(c.panel!);
                  }}
                >
                  {c.cta}
                </Button>
              )}
            </div>
          ))}
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
            Keep working
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              setConfirmOpen(false);
              if (isMultiplayerSelfGuided) {
                // Mark ready; the auto-advance hook in the store fires
                // closeQuarter when every human team is ready.
                setActiveTeamReady(true);
              } else {
                closeQuarter();
              }
            }}
          >
            {isMultiplayerSelfGuided
              ? (issueCount === 0 ? "Mark ready →" : "Mark ready anyway →")
              : (issueCount === 0 ? "Close quarter →" : "Close anyway →")}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}

function Kpi({
  label,
  value,
  emphasize = false,
  tone,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  tone?: "neg" | "warn";
}) {
  return (
    <div className="flex flex-col items-start px-4 py-1 min-w-[7.5rem] shrink-0">
      <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-medium">
        {label}
      </span>
      <span
        className={cn(
          "tabular font-display text-[1rem] leading-none mt-1",
          tone === "neg"
            ? "text-negative"
            : tone === "warn"
              ? "text-warning"
              : emphasize
                ? "text-ink"
                : "text-ink-2",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function Divider() {
  return <span className="w-px h-6 bg-line shrink-0" aria-hidden />;
}

/** Switcher modal opened by clicking the airline brand chip. Lists
 *  the player's own airline + every rival in the simulation. Picking
 *  a rival enters VIEW-ONLY mode — the map and panels render that
 *  rival's network and KPIs, but no player action affects them. */
function AirlineSwitcher({
  open, onClose, player, rivals, viewingTeamId, onSelect,
}: {
  open: boolean;
  onClose: () => void;
  player: NonNullable<ReturnType<typeof selectPlayer>>;
  rivals: ReturnType<typeof selectRivals>;
  viewingTeamId: string | null;
  onSelect: (id: string) => void;
}) {
  const all = [player, ...rivals];
  return (
    <Modal open={open} onClose={onClose}>
      <ModalHeader>
        <h2 className="font-display text-[1.5rem] text-ink">Switch view</h2>
        <p className="text-ink-muted text-[0.8125rem] mt-1">
          Peek into a rival&apos;s network for strategic intel. View-only — you can&apos;t change their state.
        </p>
      </ModalHeader>
      <ModalBody role="radiogroup" aria-label="Active airline view" className="space-y-1.5">
        {all.map((t) => {
          const isYou = t.id === player.id;
          const isActive = isYou ? !viewingTeamId : viewingTeamId === t.id;
          const activeRoutes = t.routes.filter((r) => r.status === "active").length;
          const fleetSize = t.fleet.filter((f) => f.status !== "retired").length;
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={`${isYou ? "Your airline " : ""}${t.name}, hub ${t.hubCode}, ${fleetSize} aircraft, ${activeRoutes} routes`}
              onClick={() => onSelect(t.id)}
              className={cn(
                "w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                isActive
                  ? "border-accent bg-[var(--accent-soft)]"
                  : "border-line hover:bg-surface-hover",
              )}
            >
              <span
                aria-hidden="true"
                className="inline-flex w-8 h-8 rounded-md items-center justify-center font-mono text-[0.6875rem] font-semibold text-primary-fg shrink-0"
                style={{ background: t.color }}
              >
                {t.code}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-ink text-[0.875rem] truncate">
                  {t.name}
                  {isYou && (
                    <span className="ml-2 text-[0.5625rem] uppercase tracking-wider text-accent font-semibold">you</span>
                  )}
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5 truncate">
                  Hub {t.hubCode} · {fleetSize} aircraft · {activeRoutes} routes
                </div>
              </div>
              {isActive && (
                <Eye size={14} aria-hidden="true" className="text-accent shrink-0" />
              )}
            </button>
          );
        })}
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

// ============================================================================
// Game menu — kebab-style overflow with "End game & start over"
// ============================================================================

/**
 * Top-bar overflow menu. The only item right now is "End game & start
 * over", which calls the store's resetGame() and routes back to the
 * onboarding flow. Lives in TopBar so the player always has a visible
 * exit, no matter which panel they're in. Without this the only path
 * out of a saved game was clearing localStorage manually — players
 * who wanted to start fresh got stuck mid-quarter on next visit.
 */
function GameMenu() {
  const router = useRouter();
  const resetGame = useGame((g) => g.resetGame);
  const phase = useGame((g) => g.phase);
  const sessionGameId = useGame((g) => g.session?.gameId ?? null);
  const isMultiplayer = sessionGameId !== null;
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /**
   * "End game" semantics — Phase 8.2 of the enterprise-readiness plan.
   *
   * SOLO RUN (no `session.gameId`): just wipe the local saved state
   * and route home. There's no server to clean up.
   *
   * MULTIPLAYER MEMBER: forfeit the seat. The /api/games/forfeit
   * endpoint flips the player's team to bot control (preserving
   * accumulated state so the cohort can keep playing) and deletes
   * the game_members row. If the caller is the host of a not-yet-
   * started lobby, the endpoint redirects to /api/games/delete
   * (tear down the lobby cleanly).
   *
   * On network failure, we DO NOT reset locally — we want the
   * player's progress preserved so they can retry. Better to be
   * stuck for 30s than to silently orphan their team in the cohort.
   */
  async function handleEndGame() {
    setErrorMsg(null);
    setSubmitting(true);

    if (!isMultiplayer || !sessionGameId) {
      resetGame();
      setSubmitting(false);
      setConfirmOpen(false);
      setOpen(false);
      router.replace("/");
      return;
    }

    try {
      const res = await fetch("/api/games/forfeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: sessionGameId }),
      });
      const json = await res.json().catch(() => ({}));

      // Host of a not-yet-started lobby: forfeit isn't appropriate;
      // tear down the whole lobby instead.
      if (json?.redirectToDelete) {
        const delRes = await fetch("/api/games/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameId: sessionGameId }),
        });
        if (!delRes.ok) {
          const delJson = await delRes.json().catch(() => ({}));
          setErrorMsg(
            delJson?.error ?? "Couldn't tear down the lobby. Try again.",
          );
          setSubmitting(false);
          return;
        }
      } else if (!res.ok) {
        setErrorMsg(
          json?.error ??
            "Couldn't forfeit — your progress is safe. Try again.",
        );
        setSubmitting(false);
        return;
      }

      resetGame();
      setSubmitting(false);
      setConfirmOpen(false);
      setOpen(false);
      router.replace("/");
    } catch {
      setErrorMsg(
        "Network error — your progress is safe. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Game menu"
          aria-haspopup="menu"
          aria-expanded={open}
          title="Game menu"
          className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          <MoreVertical size={16} aria-hidden="true" />
        </button>
        {open && (
          <>
            {/* Click-away catcher */}
            <div
              className="fixed inset-0 z-[60]"
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <div
              role="menu"
              className="absolute right-0 top-9 z-[61] w-56 rounded-lg border border-line bg-surface shadow-[var(--shadow-3)] py-1.5"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setConfirmOpen(true);
                }}
                className="w-full text-left px-3 py-2 text-[0.8125rem] text-ink hover:bg-surface-hover flex items-center gap-2"
              >
                <RotateCcw size={13} className="text-ink-muted" />
                <span>
                  {isMultiplayer ? "Forfeit & leave game" : "End game & start over"}
                </span>
              </button>
              <div className="px-3 py-1.5 text-[0.6875rem] text-ink-muted leading-snug border-t border-line/40 mt-1 pt-2">
                {phase === "endgame"
                  ? "Resets the saved run and returns to onboarding."
                  : isMultiplayer
                    ? "A bot takes over your airline so the cohort can keep playing."
                    : "Wipes the current saved run. Cannot be undone."}
              </div>
            </div>
          </>
        )}
      </div>

      <Modal open={confirmOpen} onClose={() => !submitting && setConfirmOpen(false)}>
        <ModalHeader>
          {isMultiplayer ? "Forfeit your airline?" : "End the current game?"}
        </ModalHeader>
        <ModalBody>
          {isMultiplayer ? (
            <>
              <p className="text-[0.9375rem] text-ink-2 leading-relaxed">
                A bot will take over your airline for the rest of the
                game. Your team&rsquo;s state — fleet, routes, cash,
                brand, milestones — is preserved so the cohort can
                keep playing.
              </p>
              <p className="text-[0.8125rem] text-ink-muted leading-relaxed mt-3">
                You will return to the home page and can&rsquo;t rejoin
                this game. If you&rsquo;re the last human and everyone
                else has forfeited, the game ends.
              </p>
            </>
          ) : (
            <>
              <p className="text-[0.9375rem] text-ink-2 leading-relaxed">
                This wipes your current run from this browser&rsquo;s
                saved state and routes you back to the onboarding flow.
                There&rsquo;s no undo — once you confirm, the saved
                game is gone.
              </p>
              <p className="text-[0.8125rem] text-ink-muted leading-relaxed mt-3">
                If you&rsquo;re in the middle of an interesting quarter
                you want to keep, hit Cancel and consider taking a
                screenshot of the leaderboard first.
              </p>
            </>
          )}
          {errorMsg && (
            <div
              role="alert"
              className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-[0.8125rem] text-rose-700"
            >
              {errorMsg}
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => setConfirmOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleEndGame}
            disabled={submitting}
          >
            <X size={14} className="mr-1" />
            {submitting
              ? "Working…"
              : isMultiplayer
                ? "Forfeit & leave"
                : "End game & start over"}
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
