"use client";

import { useEffect, useState } from "react";
import { Check, Plane, X } from "lucide-react";
import { useGame, selectActiveTeam, selectPlayer } from "@/store/game";
import { getGamePreference, setGamePreference } from "@/lib/client-preferences";
import { cn } from "@/lib/cn";

/**
 * First Flight checklist (June 2026 First Flight bundle).
 *
 * A brand-new executive lands on a world map with no idea what "open a
 * route" means tactically. This card gives Q1 a visible trajectory:
 * four steps that auto-check off real store state as the player acts —
 * no fake "mark as done" buttons, the game itself confirms progress.
 *
 * Lifecycle: renders ONLY in quarter 1 for players with fewer than two
 * routes-worth of progress left to make; disappears forever once Q1
 * closes (the quarter-close digest takes over the coaching from there).
 * Manual dismissal persists per game. Complements MapCommandHud, which
 * teaches the two clicks of route-picking — this card covers the whole
 * first-quarter loop including ending the round.
 */
const DISMISSED_KEY = "skyforce:firstFlightDismissed:v1";

export function FirstFlightChecklist() {
  const activeTeam = useGame(selectActiveTeam);
  const legacyPlayer = useGame(selectPlayer);
  const player = activeTeam ?? legacyPlayer;
  const currentQuarter = useGame((s) => s.currentQuarter);
  const phase = useGame((s) => s.phase);
  const gameId = useGame((s) => s.session?.gameId ?? null);

  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!gameId) return;
    let cancelled = false;
    void getGamePreference(gameId, DISMISSED_KEY).then((value) => {
      if (cancelled) return;
      // State-sync against a persisted preference (resolves after a
      // microtask, not synchronous-in-effect).
      setDismissed(value === true);
    });
    return () => { cancelled = true; };
  }, [gameId]);

  if (!player || dismissed) return null;
  if (currentQuarter !== 1 || phase !== "playing") return null;

  const openRoutes = player.routes.filter((r) => r.status !== "closed");
  const hasRoute = openRoutes.length > 0;
  const hasAircraftOnRoute = openRoutes.some((r) => (r.aircraftIds ?? []).length > 0);
  const hasSecondRoute = openRoutes.length >= 2;

  const steps: Array<{ label: string; hint: string; done: boolean }> = [
    {
      label: "Open your first route",
      hint: `Click ${player.hubCode} (your hub) on the map, then pick a destination.`,
      done: hasRoute,
    },
    {
      label: "Aircraft & fares set",
      hint: "The route card assigns idle planes and lets you pick a pricing tier before launch.",
      done: hasAircraftOnRoute,
    },
    {
      label: "Open a second route",
      hint: "Your hub stays selected after launch — click the next destination to keep building.",
      done: hasSecondRoute,
    },
    {
      label: "End the quarter",
      hint: "Use the button in the top-right. The results digest shows what your network earned.",
      done: false, // closing Q1 removes this card — this step is the exit
    },
  ];
  const doneCount = steps.filter((st) => st.done).length;
  const currentIdx = steps.findIndex((st) => !st.done);

  function dismiss() {
    setDismissed(true);
    if (gameId) void setGamePreference(gameId, DISMISSED_KEY, true);
  }

  return (
    <aside
      aria-label="First quarter checklist"
      className="fixed top-[4.25rem] right-3 z-[1080] w-[17rem] rounded-lg border border-line bg-surface/95 backdrop-blur-md shadow-[var(--shadow-3)]"
    >
      <div className="px-3 py-2 border-b border-line/60 flex items-center gap-1.5">
        <Plane size={11} className="text-accent" aria-hidden />
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink font-medium flex-1">
          Your first quarter
        </span>
        <span className="text-[0.6875rem] tabular font-mono text-ink-muted">
          {doneCount}/{steps.length}
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss the first-quarter checklist"
          className="p-1 -mr-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition"
        >
          <X size={12} aria-hidden />
        </button>
      </div>
      <ol className="px-3 py-2.5 space-y-2">
        {steps.map((st, i) => {
          const isCurrent = i === currentIdx;
          return (
            <li key={st.label} className="flex items-start gap-2">
              <span
                aria-hidden
                className={cn(
                  "shrink-0 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[0.625rem] font-bold mt-px",
                  st.done
                    ? "bg-positive text-primary-fg"
                    : isCurrent
                      ? "border-2 border-accent text-accent"
                      : "border border-line text-ink-faint",
                )}
              >
                {st.done ? <Check size={11} strokeWidth={3} /> : i + 1}
              </span>
              <div className="min-w-0">
                <div
                  className={cn(
                    "text-[0.75rem] leading-snug",
                    st.done
                      ? "text-ink-muted line-through decoration-ink-faint"
                      : isCurrent
                        ? "text-ink font-medium"
                        : "text-ink-2",
                  )}
                >
                  {st.label}
                </div>
                {isCurrent && (
                  <div className="text-[0.6875rem] text-ink-muted leading-snug mt-0.5">
                    {st.hint}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </aside>
  );
}
