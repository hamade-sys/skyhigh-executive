"use client";

import { useEffect } from "react";
import { useGame } from "@/store/game";
import { cn } from "@/lib/cn";

/**
 * Tick driver — also responsible for auto-starting the per-quarter
 * timer based on the game's `session.quarterTimerSeconds`. Mounts
 * once inside the canvas. Runs a 1-Hz interval that calls
 * tickQuarterTimer when the timer is active and not paused. When
 * the user-supplied timer hits 0, the engine auto-closes the
 * quarter (see store: tickQuarterTimer).
 */
export function QuarterTimerDriver() {
  const tick = useGame((s) => s.tickQuarterTimer);
  const phase = useGame((s) => s.phase);
  const start = useGame((s) => s.startQuarterTimer);
  const seconds = useGame((s) => s.quarterTimerSecondsRemaining);
  const configuredSeconds = useGame(
    (s) => s.session?.quarterTimerSeconds,
  );
  // Auto-start the timer when the game enters playing phase if the
  // session has a configured per-quarter timer. 0 means "no timer"
  // (Game Master closes manually) — skip the auto-start in that
  // case. Re-fires on each phase transition into "playing" (which
  // happens after closeQuarter → advanceToNext loops back to the
  // next round).
  useEffect(() => {
    if (phase !== "playing") return;
    if (seconds !== null) return; // already running
    if (typeof configuredSeconds !== "number" || configuredSeconds <= 0) return;
    start(configuredSeconds);
  }, [phase, seconds, configuredSeconds, start]);

  useEffect(() => {
    const id = setInterval(() => tick(1), 1000);
    return () => clearInterval(id);
  }, [tick]);
  return null;
}

/** Inline countdown display (for placement in TopBar). */
export function QuarterTimerChip() {
  const seconds = useGame((s) => s.quarterTimerSecondsRemaining);
  const paused = useGame((s) => s.quarterTimerPaused);
  const start = useGame((s) => s.startQuarterTimer);
  const pause = useGame((s) => s.pauseQuarterTimer);
  const resume = useGame((s) => s.resumeQuarterTimer);
  const extend = useGame((s) => s.extendQuarterTimer);
  const isObserver = useGame((s) => s.isObserver);
  const sessionMode = useGame((s) => s.session?.mode ?? null);
  const gameId = useGame((s) => s.session?.gameId ?? null);
  const canControlTimer = !(
    sessionMode === "facilitated" &&
    gameId &&
    !isObserver
  );
  // Default the manual "Start timer" button to whatever the host
  // configured at game creation (if anything); otherwise fall back
  // to the legacy 30 minutes.
  const configuredSeconds = useGame(
    (s) => s.session?.quarterTimerSeconds,
  );
  const fallbackStart =
    typeof configuredSeconds === "number" && configuredSeconds > 0
      ? configuredSeconds
      : 1800;

  if (seconds === null) {
    if (!canControlTimer) {
      return (
        <span
          className="text-[0.6875rem] font-medium px-2 py-1 rounded-md border border-line bg-surface-2 text-ink-muted"
          title="Game Master controls the quarter timer"
        >
          Timer idle
        </span>
      );
    }
    return (
      <button
        onClick={() => start(fallbackStart)}
        className="text-[0.6875rem] font-medium px-2 py-1 rounded-md border border-line bg-surface-2 text-ink-2 hover:text-ink"
        title={`Start ${Math.round(fallbackStart / 60)}m quarter timer`}
      >
        Start timer
      </button>
    );
  }

  const mm = Math.floor(seconds / 60).toString().padStart(2, "0");
  const ss = (seconds % 60).toString().padStart(2, "0");
  const expired = seconds === 0;
  const urgent = seconds > 0 && seconds < 300; // < 5m

  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          "tabular font-mono text-[0.875rem] font-semibold px-2 py-1 rounded-md",
          expired
            ? "bg-[var(--negative-soft)] text-negative"
            : urgent
              ? "bg-[var(--warning-soft)] text-warning"
              : paused
                ? "bg-surface-2 text-ink-muted"
                : "bg-surface-2 text-ink",
        )}
        title={paused ? "Paused" : expired ? "Timer expired" : "Time remaining this quarter"}
      >
        {mm}:{ss}
      </span>
      {canControlTimer && (
        <>
          <button
            onClick={paused ? resume : pause}
            className="w-6 h-6 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink text-[0.6875rem]"
            title={paused ? "Resume" : "Pause"}
          >
            {paused ? "▶" : "❚❚"}
          </button>
          <button
            onClick={() => extend(300)}
            className="w-6 h-6 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink text-[0.625rem] tabular"
            title="Extend 5 minutes"
          >
            +5
          </button>
        </>
      )}
    </div>
  );
}
