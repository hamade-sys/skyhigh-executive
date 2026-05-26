"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import { HelpCircle, Trophy, ChevronDown, Eye, MoreVertical, RotateCcw, X, Hash, MessageCircle, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { airlineColorFor, type AirlineColorId } from "@/lib/games/airline-colors";
import { DOCTRINE_BY_ID } from "@/data/doctrines";

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
  const baseInterestRatePct = useGame((s) => s.baseInterestRatePct);
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
  // Phase 3: pull configured totalRounds from session so the "Quarter X of Y"
  // chip uses the actual game length (8, 16, 24, 40…) not the hardcoded default.
  const totalRounds = useGame(getTotalRounds);

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

      {/* Doctrine pill — at-a-glance reminder of which strategic
          archetype this airline picked at onboarding (Premium /
          Budget / Cargo / Global Network). Click to see the full
          benefits list. Pre-Phase-9 the doctrine was only visible
          on the Overview tab (Reports), which is too buried for
          mid-game reference. Hidden when viewing a rival because
          rival doctrines are intel that should require an explicit
          peek (Switch View → rival panel). */}
      {!viewingRival && (
        <DoctrinePill doctrineId={displayTeam.doctrine} />
      )}

      {/* KPIs — follow the currently-displayed team. When viewing a
          rival, the strip shows their numbers (read-only). */}
      <div className="flex items-center gap-0 overflow-x-auto flex-1 min-w-0">
        <Kpi label="Cash" value={fmtMoney(displayTeam.cashUsd)} emphasize />
        <Divider />
        <Kpi
          label="Debt"
          // BUG FIX (May 2026): Debt KPI now rolls up totalDebtUsd
          // + rcfBalanceUsd. Previously the KPI showed only the
          // commercial-loan principal; RCF auto-draws (the engine's
          // overdraft that activates when cash < 0) only appeared as
          // a separate pill *if* drawn. A player with losses absorbed
          // entirely by RCF saw "Debt $110M" unchanged for many
          // quarters while cash hovered near 0 — couldn't tell where
          // the money was going. The combined figure makes total
          // liabilities visible at a glance; the RCF pill below still
          // surfaces the *premium-rate* portion as a separate warning.
          value={fmtMoney(displayTeam.totalDebtUsd + (displayTeam.rcfBalanceUsd ?? 0))}
          // 3-state risk ladder per workshop feedback. Replaces the
          // binary "any debt = red" signal that warned for healthy
          // leverage. Thresholds:
          //   < 0.5× airline value          → no tone (safe)
          //   0.5 — 1.0× OR RCF drawn       → warn (stretched)
          //   > 1.0× airline value          → neg  (distressed)
          tone={(() => {
            const total = displayTeam.totalDebtUsd + (displayTeam.rcfBalanceUsd ?? 0);
            if (total <= 0) return undefined;
            if (airlineValue <= 0) return "neg" as const;
            const ratio = total / airlineValue;
            if (ratio > 1.0) return "neg" as const;
            if (ratio >= 0.5 || displayTeam.rcfBalanceUsd > 0) return "warn" as const;
            return undefined;
          })()}
        />
        <Divider />
        <Kpi label="Airline value" value={fmtMoney(airlineValue)} emphasize />
        <Divider />
        {/* Phase D — D-006: shortened from "Brand rating" to "Brand"
            so the label fits the 7.5rem KPI column width without
            truncating to "Brand R..". The value (A/B/C/D grade) is
            unambiguous on its own. */}
        <Kpi label="Brand" value={brandRating(displayTeam).grade} />
        {!viewingRival && displayTeam.rcfBalanceUsd > 0 && (
          <>
            <Divider />
            {/* RCF Risk — surfaces the most expensive debt the player
                can hold (auto-draw runs at 2× base rate). Pre-Phase-2
                this was a passive "RCF drawn $X" chip with no signal
                about the interest cost; players didn't realise
                they'd be paying ~12-18% APR until they saw it on
                next quarter's P&L. Phase 2 adds:
                  • the projected next-Q interest in the chip subtext
                  • a tooltip that names the trap explicitly
                  • a clickable target that navigates to Financials so
                    the player can see the full debt picture and decide
                    whether to take a regular loan to clear the RCF. */}
            <RcfRiskPill
              rcfBalanceUsd={displayTeam.rcfBalanceUsd}
              baseRatePct={baseInterestRatePct}
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
            {fmtQuarterShort(currentQuarter, totalRounds)}
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
          // HelpModal is a slide-in side panel (NOT a native dialog).
          // Native dialog stacking proved fragile — see HelpModal.tsx
          // header comment. To prevent any open `<dialog>` from
          // stacking with the help panel, we DOM-close every
          // `dialog[open]` in the same frame as we open help. The
          // Modal primitive's React-state mutex handles dialog-on-
          // dialog mutual exclusion; the panel-on-dialog direction is
          // handled here.
          onClick={() => {
            if (typeof document !== "undefined") {
              document
                .querySelectorAll<HTMLDialogElement>("dialog[open]")
                .forEach((d) => {
                  try { d.close(); } catch { /* already closed */ }
                });
            }
            setHelpOpen(true);
          }}
          aria-label="Help &amp; reference"
          aria-haspopup="dialog"
          aria-expanded={helpOpen}
          title="Quick reference (cheat sheet)"
          className="w-8 h-8 min-h-[40px] min-w-[40px] rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
        "w-8 h-8 min-h-[40px] min-w-[40px] rounded-md flex items-center justify-center transition-colors",
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
  const gmAdvanceQuarter = useGame((s) => s.gmAdvanceQuarter);
  const hydrateFromServerState = useGame((s) => s.hydrateFromServerState);
  const localSessionId = useGame((s) => s.localSessionId);
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
  const sessionMode = useGame((s) => s.session?.mode ?? null);
  const gameId = useGame((s) => s.session?.gameId ?? null);
  const phase = useGame((s) => s.phase);
  const isObserver = useGame((s) => s.isObserver);
  const memberTeamId = useGame((s) => s.memberTeamId);
  const allReady = useGame((s) => s.allActiveTeamsReady());
  const designatedCloserId = useGame((s) => {
    const humanIds = s.teams
      .filter((t) => t.controlledBy === "human")
      .map((t) => t.id)
      .sort((a, b) => a.localeCompare(b));
    return humanIds[0] ?? null;
  });
  // When the session has board decisions disabled (self-guided cohorts
  // that opt out of scenarios), the close-quarter pre-flight should
  // not include the decisions row. Defaults to true for legacy saves
  // and solo runs that didn't set the flag explicitly.
  const boardDecisionsEnabled = useGame(
    (s) => s.session?.boardDecisionsEnabled ?? true,
  );
  const humanCount = useGame(
    (s) => s.teams.filter((t) => t.controlledBy === "human").length,
  );
  const activeTeamId = useGame((s) => s.activeTeamId ?? s.playerTeamId);
  const isMultiplayerSelfGuided = sessionMode === "self_guided" && humanCount >= 2;
  const isMultiplayerFacilitated = sessionMode === "facilitated" && Boolean(gameId);

  // Quarter-close request from a peer (set by onQuarterCloseRequested in
  // play/page.tsx). Null in solo runs or when we initiated the close
  // ourselves. Shows the countdown banner on this browser.
  const quarterCloseRequest = useGame((s) => s.quarterCloseRequest);
  const setQuarterCloseRequest = useGame((s) => s.setQuarterCloseRequest);

  // Quarter close readiness modal
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Loading-overlay state for the moment between clicking "Close
  // quarter →" and the digest modal appearing.
  const [pendingClose, setPendingClose] = useState(false);
  // Countdown seconds remaining (for the peer-triggered banner)
  const [countdownSec, setCountdownSec] = useState<number | null>(null);
  // Whether we sent the close request (suppresses showing our own banner)
  const [iRequested, setIRequested] = useState(false);
  const autoCloseAttemptedQuarterRef = useRef<number | null>(null);
  const requestCameFromMe =
    quarterCloseRequest !== null &&
    memberTeamId !== null &&
    quarterCloseRequest.byTeamId === memberTeamId;

  // activeTeamId fallback already handled above; just satisfy TS
  void activeTeamId;

  // ── Shared pre-close helper: fetch fresh state → sync version → close ──
  //
  // WHY THIS EXISTS:
  // closeQuarter() pushes the full post-simulation state via pushStateToServer.
  // That push uses `serverStateVersion` as the CAS expectedVersion. Between
  // the moment a player last hydrated and the moment they call closeQuarter(),
  // at least one other DB write landed (the mark-ready/request-quarter-close
  // that bumped the version). If we close with the stale version we get 409
  // → pushStateToServer calls hydrateFromServerState → state reset → the
  // digest modal disappears and the player is back at the old quarter.
  //
  // Fix: before running closeQuarter(), re-fetch the latest state and hydrate
  // so serverStateVersion matches the DB. If the quarter already advanced
  // (someone else closed first), skip the close entirely.
  const syncAndClose = useCallback(async () => {
    const quarterBeforeSync = currentQuarter;
    setPendingClose(true);

    if (isMultiplayerSelfGuided && gameId && localSessionId) {
      try {
        const loadRes = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
          { cache: "no-store" },
        );
        if (loadRes.ok) {
          const json = await loadRes.json();
          if (json?.state?.state_json) {
            hydrateFromServerState({
              stateJson: json.state.state_json,
              mySessionId: localSessionId,
              fallbackTeamId:
                (json.members as Array<{ session_id: string | null; team_id: string | null }> | undefined)
                  ?.find((m) => m.session_id === localSessionId)
                  ?.team_id ?? null,
              dbVersion: typeof json.state.version === "number"
                ? json.state.version
                : undefined,
            });
          }
          // If the quarter already advanced while we were fetching (another
          // player closed first), skip the simulation — we'll get the new
          // state from Realtime.
          const freshQuarter = (json?.state?.state_json as { currentQuarter?: number } | null)
            ?.currentQuarter ?? quarterBeforeSync;
          if (freshQuarter > quarterBeforeSync) {
            setPendingClose(false);
            return;
          }
        }
      } catch {
        // Network error — proceed with whatever version we have; the CAS
        // will catch a conflict and re-sync gracefully.
      }
    }

    // Yield two animation frames so React paints the loading overlay
    // before the heavy synchronous simulation starts.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        closeQuarter();
        setPendingClose(false);
      });
    });
  }, [
    gameId,
    isMultiplayerSelfGuided,
    localSessionId,
    currentQuarter,
    closeQuarter,
    hydrateFromServerState,
  ]);

  // ── Countdown ticker ────────────────────────────────────────────────
  // Ticks every second when a peer has requested a quarter close.
  // When it reaches 0, we auto-close (same as clicking "Close Now").
  const triggerClose = useCallback(() => {
    setQuarterCloseRequest(null);
    setCountdownSec(null);
    // Peer accepted the close request. Only mark this seat ready; a
    // single deterministic browser will perform the actual close once
    // every human seat is ready for this quarter.
    if (isMultiplayerSelfGuided && gameId) {
      fetch("/api/games/mark-ready", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId }),
      }).catch(() => {/* non-fatal */});
    } else {
      void syncAndClose();
    }
  }, [gameId, isMultiplayerSelfGuided, syncAndClose, setQuarterCloseRequest]);

  useEffect(() => {
    if (!quarterCloseRequest || iRequested || requestCameFromMe) return;
    const deadline = Date.parse(quarterCloseRequest.deadlineAt);
    if (!Number.isFinite(deadline)) return;

    function tick() {
      const remaining = Math.max(
        0,
        Math.round((deadline - Date.now()) / 1000),
      );
      setCountdownSec(remaining);
      if (remaining <= 0) {
        triggerClose();
      }
    }
    tick(); // immediate paint
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [quarterCloseRequest, iRequested, requestCameFromMe, triggerClose]);

  // Reset iRequested when the quarter actually advances (store
  // clears quarterCloseRequest and hydrateFromServerState fires).
  // We detect this by watching currentQuarter.
  // Phase C — C2: lint flags setIRequested inside the effect. Safe:
  // the effect's only purpose is to reset state when the quarter
  // changes; deps are [currentQuarter] only, and iRequested isn't
  // in them, so no loop.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIRequested(false);
    autoCloseAttemptedQuarterRef.current = null;
  }, [currentQuarter]);

  // Self-guided multiplayer needs exactly one browser to perform the
  // actual close once every human has marked ready. Use the stable
  // smallest human team id as the designated closer so the quarter
  // doesn't depend on who happened to click last.
  useEffect(() => {
    if (!isMultiplayerSelfGuided) return;
    if (phase !== "playing") return;
    if (!allReady) return;
    if (pendingClose) return;
    if (!memberTeamId || memberTeamId !== designatedCloserId) return;
    if (autoCloseAttemptedQuarterRef.current === currentQuarter) return;

    autoCloseAttemptedQuarterRef.current = currentQuarter;
    setIRequested(false);
    void syncAndClose();
  }, [
    allReady,
    currentQuarter,
    designatedCloserId,
    isMultiplayerSelfGuided,
    memberTeamId,
    pendingClose,
    phase,
    syncAndClose,
  ]);

  if (isMultiplayerFacilitated && !isObserver) return null;
  if (!player) return null;

  const pending = scenariosForQuarter(currentQuarter, totalRounds).filter(
    (sc) => !player.decisions.some((d) => d.scenarioId === sc.id && d.quarter === currentQuarter),
  );

  // Readiness checks. Each yields {label, status, count, hint, openPanelId?}.
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
    ...(boardDecisionsEnabled
      ? [
          {
            id: "decisions",
            label: pending.length === 0 ? "All board decisions resolved" : `${pending.length} board decision${pending.length === 1 ? "" : "s"} pending`,
            detail: pending.length === 0
              ? "Every scenario this quarter has been answered."
              : "Unanswered scenarios auto-submit to a sensible default at close.",
            status: (pending.length === 0 ? "ok" : "warn") as CheckStatus,
            panel: "decisions" as import("@/store/ui").PanelId,
            cta: "Open Decisions",
          },
        ]
      : []),
    {
      id: "dormant",
      label: dormantRoutes.length === 0
        ? "No dormant routes"
        : `${dormantRoutes.length} active route${dormantRoutes.length === 1 ? "" : "s"} with no aircraft`,
      detail: dormantRoutes.length === 0
        ? "Every active route has at least one operating aircraft."
        : "BLOCKING — slots are leased but no flights are scheduled. Assign aircraft or close the route(s) before advancing the quarter. The close button is disabled until this clears.",
      status: dormantRoutes.length === 0 ? "ok" : "danger",
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

  // Hard-block: an active route with zero operating aircraft is almost
  // always a mistake — slots are being leased and paid for with no
  // flights running. Pre-fix the modal informed the player but let
  // them advance anyway. For workshop facilitators, this is the kind
  // of slip that justifies a confirm gate. Other warn-level checks
  // (losing routes, thin cash) stay informational so the player can
  // still take strategic risks.
  const hardBlocked = dormantRoutes.length > 0;

  // ── Handler: player clicks "End Quarter →" (multiplayer) ────────────
  // Calls /api/games/request-quarter-close which:
  //   • atomically marks us ready on the server
  //   • broadcasts the countdown to all other browsers
  //   • returns allReady=true if everyone was already ready
  async function handleRequestClose() {
    if (!gameId) {
      // Solo fallback — close directly.
      void syncAndClose();
      return;
    }
    setIRequested(true);
    setQuarterCloseRequest(null); // dismiss any incoming banner
    try {
      const res = await fetch("/api/games/request-quarter-close", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId }),
      });
      if (!res.ok) {
        console.warn("[SkyForce] request-quarter-close failed", res.status);
        // Server error — fall back to direct close so the player isn't stuck.
        void syncAndClose();
        return;
      }
      const { allReady } = await res.json() as { allReady: boolean; deadlineAt: string };
      void allReady;
      // If not allReady: the 30s countdown broadcast has been sent to peers.
      // When everyone is ready, the designated closer effect above performs
      // the actual quarter close on exactly one browser.
    } catch {
      console.warn("[SkyForce] request-quarter-close network error");
      void syncAndClose();
    }
  }

  // ── Peer-triggered countdown banner ─────────────────────────────────
  // Shown on every browser EXCEPT the one that initiated the close.
  const showCountdown =
    isMultiplayerSelfGuided &&
    quarterCloseRequest !== null &&
    !iRequested &&
    !requestCameFromMe;

  return (
    <>
      {/* ── Peer quarter-close countdown banner ──────────────────────────
           Shown on every browser EXCEPT the one that initiated the close.
           Positioned just below the TopBar (top-14) so it's always
           visible and never hidden behind canvas controls at the bottom.
           z-[110] keeps it above panels and modals.                    */}
      {showCountdown && quarterCloseRequest && (() => {
        const total = 30;
        const remaining = countdownSec ?? total;
        const pct = Math.max(0, Math.min(100, (remaining / total) * 100));
        const urgent = remaining <= 10;
        return (
          <div
            className={cn(
              "fixed top-14 inset-x-0 z-[110] flex justify-center px-4 pointer-events-none",
            )}
            role="status"
            aria-live="assertive"
          >
            <div
              className={cn(
                "pointer-events-auto w-full max-w-md",
                "rounded-xl border shadow-[var(--shadow-4)] overflow-hidden",
                urgent
                  ? "border-negative/50 bg-[var(--negative-soft)]/10"
                  : "border-warning/40 bg-surface",
              )}
            >
              {/* Progress bar across the top — drains left-to-right */}
              <div className="h-1 w-full bg-line">
                <div
                  className={cn(
                    "h-full transition-all duration-1000 ease-linear",
                    urgent ? "bg-negative" : "bg-warning",
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <div className="flex items-center gap-3 px-4 py-3">
                {/* Large countdown number */}
                <span
                  className={cn(
                    "shrink-0 w-12 h-12 rounded-full flex flex-col items-center justify-center",
                    "font-mono font-bold tabular leading-none border-2",
                    urgent
                      ? "border-negative text-negative animate-pulse"
                      : "border-warning text-warning",
                  )}
                >
                  <span className="text-[1.25rem]">{remaining}</span>
                  <span className="text-[0.5rem] font-normal opacity-70">sec</span>
                </span>

                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-ink text-[0.9375rem] leading-snug truncate">
                    {quarterCloseRequest.byTeamName} ended their quarter
                  </p>
                  <p className="text-ink-muted text-[0.75rem] mt-0.5">
                    Round closes automatically — or close now to jump in.
                  </p>
                </div>

                <Button
                  variant="primary"
                  size="sm"
                  onClick={triggerClose}
                  className="shrink-0"
                >
                  Close Now
                </Button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Primary button — "End Quarter →" in multiplayer, "Next Quarter →" in solo */}
      <Button
        variant="primary"
        size="sm"
        disabled={isMultiplayerSelfGuided && iRequested && !pendingClose}
        onClick={() => setConfirmOpen(true)}
        title={
          isMultiplayerSelfGuided
            ? "Review your decisions and end this quarter. Other players get 30s to close."
            : isMultiplayerFacilitated
              ? "Game Master control: close this quarter and advance the room."
            : "Lock decisions + run quarter close."
        }
      >
        {isMultiplayerSelfGuided && iRequested && !pendingClose
          ? "Waiting for cohort…"
          : isMultiplayerFacilitated
            ? "Advance Quarter →"
          : isMultiplayerSelfGuided
            ? "End Quarter →"
            : "Next Quarter →"}
      </Button>

      {/* Pre-flight readiness modal */}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} className="max-w-xl">
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Close {fmtQuarter(currentQuarter)}?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            {isMultiplayerSelfGuided
              ? issueCount === 0
                ? "Pre-flight checks all green. Ending the quarter will give cohort members 30s to close."
                : `${issueCount} item${issueCount === 1 ? "" : "s"} flagged. Review or close anyway.`
              : isMultiplayerFacilitated
                ? issueCount === 0
                  ? "Pre-flight checks all green. The Game Master will close this quarter and advance the room."
                  : `${issueCount} item${issueCount === 1 ? "" : "s"} flagged. Review or advance anyway.`
              : issueCount === 0
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
            disabled={hardBlocked}
            title={
              hardBlocked
                ? `Cannot close: ${dormantRoutes.length} active route${dormantRoutes.length === 1 ? "" : "s"} with no aircraft. Assign aircraft or close the route(s) first.`
                : undefined
            }
            onClick={() => {
              if (hardBlocked) return; // defence-in-depth, button is disabled
              setConfirmOpen(false);
              if (isMultiplayerSelfGuided) {
                // Request close via server — broadcasts countdown to peers.
                void handleRequestClose();
              } else if (isMultiplayerFacilitated) {
                setPendingClose(true);
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    gmAdvanceQuarter();
                    setPendingClose(false);
                  });
                });
              } else {
                // Solo / facilitated: close immediately with loading overlay.
                setPendingClose(true);
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    closeQuarter();
                    setPendingClose(false);
                  });
                });
              }
            }}
          >
            {hardBlocked
              ? "Fix dormant routes first"
              : isMultiplayerSelfGuided
                ? (issueCount === 0 ? "End quarter →" : "End quarter anyway →")
                : isMultiplayerFacilitated
                  ? (issueCount === 0 ? "Advance quarter →" : "Advance anyway →")
                  : (issueCount === 0 ? "Close quarter →" : "Close anyway →")}
          </Button>
        </ModalFooter>
      </Modal>
      {pendingClose && <QuarterCloseLoadingOverlay />}
    </>
  );
}

/** Branded loading overlay shown while the engine sim runs between
 *  the pre-flight modal closing and the quarter-close digest opening.
 *  Fixed-position so it sits above the canvas without competing for
 *  the dialog top-layer (which the digest modal claims). */
function QuarterCloseLoadingOverlay() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Closing quarter…"
      className="fixed inset-0 z-[90] flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-[2px] motion-reduce:backdrop-blur-none"
    >
      <div className="rounded-2xl bg-surface px-8 py-6 shadow-[var(--shadow-4)] flex flex-col items-center gap-3 max-w-[min(360px,calc(100vw-2rem))] text-center">
        <Loader2 className="w-6 h-6 text-accent animate-spin" aria-hidden />
        <div>
          <div className="text-[0.9375rem] font-semibold text-ink">
            Closing the quarter
          </div>
          <p className="text-[0.75rem] text-ink-2 mt-0.5 leading-snug">
            Running the engine across every airline. The digest opens
            in a moment.
          </p>
        </div>
      </div>
    </div>
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

/**
 * RCF Risk pill (Phase 2 — P1-6). Replaces the passive "RCF drawn $X"
 * KPI when the player has auto-drawn against their revolving credit
 * facility. The standard KPI didn't show the trap explicitly: RCF
 * auto-draws at **2× base rate**, the most expensive debt in the
 * game. Players routinely didn't realise they were paying ~12-18% APR
 * until the next quarter's P&L surfaced the interest line.
 *
 * The pill now shows the projected next-Q interest cost inline as the
 * sub-label so the player can't miss it. Hover/tooltip names the rate
 * explicitly. Clicking navigates to the Financials panel where the
 * full debt + loan composition is visible — that's where the player
 * decides whether to take a regular loan to clear the RCF.
 */
function RcfRiskPill({
  rcfBalanceUsd, baseRatePct,
}: {
  rcfBalanceUsd: number;
  baseRatePct: number;
}) {
  const openPanel = useUi((u) => u.openPanel);
  const rcfRatePct = baseRatePct * 2;
  const nextQInterest = rcfBalanceUsd * (rcfRatePct / 100) / 4;
  return (
    <button
      type="button"
      onClick={() => openPanel("financials")}
      title={`RCF balance ${fmtMoney(rcfBalanceUsd)} · auto-drawn at ${rcfRatePct.toFixed(1)}% APR (2× base). Next-quarter interest will be ${fmtMoney(nextQInterest)}. Click to open Financials and consider a cheaper loan.`}
      className="flex flex-col items-start px-4 py-1 min-w-[7.5rem] shrink-0 text-left rounded-md hover:bg-warning/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning focus-visible:ring-offset-2 focus-visible:ring-offset-surface transition-colors cursor-pointer"
    >
      <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-warning">
        RCF risk
      </span>
      <span className="tabular font-display text-[1rem] leading-none mt-1 text-warning">
        {fmtMoney(rcfBalanceUsd)}
      </span>
      <span className="text-[0.6875rem] text-warning/80 leading-snug mt-0.5 tabular">
        +{fmtMoney(nextQInterest)}/Q at 2× base
      </span>
    </button>
  );
}

/** Compact pill showing the player's strategic doctrine (Premium /
 *  Budget / Cargo / Global Network) — visible at all times in the
 *  top-bar so mid-game it's never a question what archetype the
 *  player is playing. Click/hover opens a popover with the doctrine's
 *  tagline + full effects list. Tinted to match the doctrine's
 *  iconAccent so it reads at a glance.
 *
 *  Hides the "safety-first" legacy doctrine (no longer player-facing). */
function DoctrinePill({ doctrineId }: { doctrineId: import("@/types/game").DoctrineId | undefined }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      const t = e.target as Node;
      if (panelRef.current?.contains(t)) return;
      if (buttonRef.current?.contains(t)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  // Phase 2 (P1-3): when doctrineId is missing (multiplayer pre-setup
  // before host locks doctrines, or legacy saves from before the
  // doctrine system shipped), the pill used to disappear entirely —
  // leaving the player wondering whether their strategy was ever
  // registered. Show a muted "Doctrine pending" chip instead so the
  // TopBar layout doesn't reflow and the player gets a clear signal.
  if (!doctrineId) {
    return (
      <div
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-line bg-surface-2/40 text-ink-muted text-[0.75rem] font-medium shrink-0"
        title="Doctrine not yet set. Pick one during onboarding or wait for the facilitator to seed your strategy."
      >
        <span className="inline-block w-2 h-2 rounded-full bg-ink-muted/40 animate-pulse" aria-hidden />
        Doctrine pending
      </div>
    );
  }
  const doctrine = DOCTRINE_BY_ID[doctrineId];
  if (!doctrine) return null;
  const Icon = doctrine.Icon;
  // Tint mapping matches the doctrine icon-accent palette used in
  // onboarding + lobby cards (DOCTRINE_ICON_TINT). We can't use the
  // tailwind class string directly inside the inline style; instead
  // pick a compatible hex pair per accent.
  const accentTone: Record<typeof doctrine.iconAccent, { bg: string; text: string; border: string }> = {
    amber:   { bg: "rgb(254 243 199 / 0.6)", text: "#B45309", border: "rgb(252 211 77 / 0.5)" },
    violet:  { bg: "rgb(237 233 254 / 0.6)", text: "#6D28D9", border: "rgb(196 181 253 / 0.5)" },
    emerald: { bg: "rgb(209 250 229 / 0.6)", text: "#047857", border: "rgb(110 231 183 / 0.5)" },
    cyan:    { bg: "rgb(207 250 254 / 0.6)", text: "#0E7490", border: "rgb(103 232 249 / 0.5)" },
  };
  const tone = accentTone[doctrine.iconAccent];
  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Doctrine: ${doctrine.name}. Click for benefits.`}
        title={`${doctrine.name} — ${doctrine.tagline}`}
        className="inline-flex items-center gap-1.5 h-7 pl-1.5 pr-2 rounded-full border text-[0.6875rem] font-semibold hover:brightness-95 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        style={{ background: tone.bg, color: tone.text, borderColor: tone.border }}
      >
        <Icon size={12} aria-hidden />
        <span className="hidden md:inline">{doctrine.name}</span>
        <span className="md:hidden">{doctrine.name.split(" ")[0]}</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label={`${doctrine.name} doctrine details`}
          className="absolute top-full left-0 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-xl border border-line bg-surface shadow-[var(--shadow-2)] p-4 z-[70]"
        >
          <div className="flex items-start gap-3 mb-3">
            <span
              className="inline-flex w-9 h-9 rounded-lg items-center justify-center shrink-0"
              style={{ background: tone.bg, color: tone.text }}
            >
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <div className="font-display text-[0.9375rem] text-ink leading-tight">
                {doctrine.name}
              </div>
              <div className="text-[0.75rem] text-ink-muted italic mt-0.5">
                {doctrine.tagline}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="-mr-1 -mt-1 p-1 rounded-md hover:bg-surface-hover text-ink-muted hover:text-ink shrink-0"
              aria-label="Close"
            >
              <X size={14} aria-hidden />
            </button>
          </div>
          <p className="text-[0.8125rem] text-ink-muted leading-relaxed mb-3">
            {doctrine.description}
          </p>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5 font-semibold">
            What you get
          </div>
          <ul className="space-y-1">
            {doctrine.effects.map((eff, i) => (
              <li
                key={i}
                className="text-[0.8125rem] text-ink leading-snug flex items-start gap-2 before:content-['•'] before:text-ink-muted before:mt-0"
              >
                <span>{eff}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
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
              {(() => {
                // Use the airline-palette color (the one the player
                // picked at onboarding / lobby) instead of the legacy
                // hex stored on team.color, so chips throughout the
                // app render with the player's chosen brand identity.
                // textOn carries the contrast-aware foreground so the
                // 3-letter code stays readable on light pastels.
                const ac = airlineColorFor({
                  colorId: t.airlineColorId as AirlineColorId | undefined,
                  fallbackKey: t.id,
                });
                return (
                  <span
                    aria-hidden="true"
                    className="inline-flex w-8 h-8 rounded-md items-center justify-center font-mono text-[0.6875rem] font-semibold shrink-0"
                    style={{
                      background: ac.hex,
                      color: ac.textOn === "white" ? "#ffffff" : "#0f172a",
                    }}
                  >
                    {t.code}
                  </span>
                );
              })()}
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
 * out of a saved game was clearing browser storage manually — players
 * who wanted to start fresh got stuck mid-quarter on next visit.
 */
function GameMenu() {
  const router = useRouter();
  const resetGame = useGame((g) => g.resetGame);
  const restartGame = useGame((g) => g.restartGame);
  const phase = useGame((g) => g.phase);
  const teams = useGame(useShallow((g) => g.teams));
  const sessionGameId = useGame((g) => g.session?.gameId ?? null);
  const sessionGameMasterId = useGame(
    (g) => g.session?.gameMasterSessionId ?? g.session?.facilitatorSessionId ?? null,
  );
  const localSessionId = useGame((g) => g.localSessionId);
  const isMultiplayer = sessionGameId !== null;
  // Game Master = the session owner who can force-end the whole game.
  const isGameMaster =
    isMultiplayer &&
    !!sessionGameMasterId &&
    !!localSessionId &&
    sessionGameMasterId === localSessionId;

  // Single-player restart eligibility — exactly one human team, and
  // the game is actively being played (not in onboarding or
  // post-endgame). For multi-human cohorts the restart would erase
  // everyone else's progress without their consent, so it's hidden
  // there. Facilitators can still force-end via the existing path.
  const humanTeamCount = teams.filter(
    (t) => (t.controlledBy ?? (t.isPlayer ? "human" : "bot")) === "human",
  ).length;
  const canRestart = humanTeamCount === 1 && phase === "playing";

  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [restartConfirmOpen, setRestartConfirmOpen] = useState(false);
  const [forceEndConfirmOpen, setForceEndConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  /**
   * Game Master: force-end the entire game for everyone. Calls
   * /api/games/delete (which already supports lobby OR ended games;
   * we extend it to also accept playing games when the caller is the
   * Game Master). Clears all local state, routes home, and the
   * cohort gets the next refresh from Realtime / postgres_changes.
   */
  async function handleForceEnd() {
    if (!sessionGameId) return;
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/games/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: sessionGameId, force: true }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setErrorMsg(
          json?.error ?? "Couldn't end the game. Try again or refresh.",
        );
        setSubmitting(false);
        return;
      }
      resetGame();
      setSubmitting(false);
      setForceEndConfirmOpen(false);
      setOpen(false);
      router.replace("/");
    } catch {
      setErrorMsg(
        "Network error — game state preserved. Check your connection and try again.",
      );
      setSubmitting(false);
    }
  }

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
      const { fetchWithRetry } = await import("@/lib/games/fetch-with-retry");
      const res = await fetchWithRetry("/api/games/forfeit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId: sessionGameId }),
        maxAttempts: 3,
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
          className="w-8 h-8 min-h-[40px] min-w-[40px] rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
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
              {/* Solo-only: Restart from Q1 with the same cohort */}
              {canRestart && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setRestartConfirmOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-[0.8125rem] text-ink hover:bg-surface-hover flex items-center gap-2"
                >
                  <RotateCcw size={13} className="text-ink-muted" />
                  <span>Restart from Q1</span>
                </button>
              )}
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
              {/* Game Master only — force-end the entire game for
                  every player. Uses /api/games/delete with `force:
                  true`. Renders rose so it's visually distinct from
                  the regular forfeit. */}
              {isGameMaster && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    setForceEndConfirmOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-[0.8125rem] text-rose-700 hover:bg-rose-50 flex items-center gap-2"
                >
                  <X size={13} className="text-rose-500" />
                  <span>End game for everyone</span>
                </button>
              )}
              <div className="px-3 py-1.5 text-[0.6875rem] text-ink-muted leading-snug border-t border-line/40 mt-1 pt-2">
                {phase === "endgame"
                  ? "Resets the saved run and returns to onboarding."
                  : isGameMaster
                    ? "Forfeit replaces you with a bot. End for everyone closes the game cohort-wide."
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

      {/* Game Master force-end modal — separate from forfeit so the
          confirmation copy is unambiguous (this affects EVERY player
          in the cohort, not just the GM). */}
      <Modal
        open={forceEndConfirmOpen}
        onClose={() => !submitting && setForceEndConfirmOpen(false)}
      >
        <ModalHeader>End the game for everyone?</ModalHeader>
        <ModalBody>
          <p className="text-[0.9375rem] text-ink-2 leading-relaxed">
            This closes the game for every team — your cohort gets
            routed to the endgame summary on their next refresh. The
            game state is preserved for the recap; nobody loses
            history. There&rsquo;s no undo: you can&rsquo;t resume
            from here.
          </p>
          <p className="text-[0.8125rem] text-ink-muted leading-relaxed mt-3">
            Use this when the workshop is over, the room ran out of
            time, or the cohort is no longer engaged. For your own
            airline only, use Forfeit & leave above instead.
          </p>
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
            onClick={() => setForceEndConfirmOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleForceEnd}
            disabled={submitting}
          >
            <X size={14} className="mr-1" />
            {submitting ? "Working…" : "End game for everyone"}
          </Button>
        </ModalFooter>
      </Modal>

      {/* Restart-from-Q1 confirmation (solo only). Preserves team
          identity — same airline name, color, doctrine, hub, same
          bot rivals with same difficulty — but wipes simulation
          state (cash, fleet routes, debts, financials, decisions,
          milestones). The cohort starts fresh at Q1 without going
          back through onboarding. Different from "End game & start
          over" which wipes EVERYTHING including team setup. */}
      <Modal
        open={restartConfirmOpen}
        onClose={() => setRestartConfirmOpen(false)}
      >
        <ModalHeader>Restart from Q1?</ModalHeader>
        <ModalBody>
          <p className="text-[0.9375rem] text-ink-2 leading-relaxed">
            All airlines reset to their Q1 starting positions —
            starter fleet, $350M onboarding budget, brand/loyalty/ops
            at 50. You and the bot rivals keep your names, colors,
            doctrines, and hubs. Only the simulation rewinds.
          </p>
          <p className="text-[0.8125rem] text-ink-muted leading-relaxed mt-3">
            Use this to retry a tough scenario or experiment with a
            different opening strategy. There&rsquo;s no undo —
            current quarter, fleet, routes, decisions, and financial
            history are erased.
          </p>
        </ModalBody>
        <ModalFooter>
          <Button
            variant="ghost"
            onClick={() => setRestartConfirmOpen(false)}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              restartGame();
              setRestartConfirmOpen(false);
            }}
          >
            <RotateCcw size={14} className="mr-1" />
            Restart from Q1
          </Button>
        </ModalFooter>
      </Modal>
    </>
  );
}
