"use client";

import { Compass, X } from "lucide-react";
import { useState } from "react";
import { useGame, selectActiveTeam, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { Button } from "@/components/ui";

/**
 * Mid-campaign doctrine review — the board moment (W1.7).
 *
 * The doctrine-revision mechanic already existed but was buried behind a
 * "Review doctrine" button in the Reports → Overview panel, so players
 * reached the campaign midpoint and never knew they could pivot. This
 * banner makes it a prominent, one-time moment: at the midpoint round
 * (floor(totalRounds / 2)) it appears at the top of the canvas and routes
 * the player straight into the existing review modal. Dismissible — the
 * player can wave it off and still find the button in Overview — but it
 * won't be missed. Renders only on the exact midpoint round, only if the
 * player hasn't already revised.
 */
export function DoctrineReviewMoment() {
  const activeTeam = useGame(selectActiveTeam);
  const legacyPlayer = useGame(selectPlayer);
  const player = activeTeam ?? legacyPlayer;
  const currentQuarter = useGame((s) => s.currentQuarter);
  const phase = useGame((s) => s.phase);
  const totalRounds = useGame((s) => s.session?.totalRounds ?? 40);
  const requestDoctrineReview = useUi((u) => u.requestDoctrineReview);
  const [dismissed, setDismissed] = useState(false);

  if (!player || dismissed || phase !== "playing") return null;
  const midRound = Math.floor(totalRounds / 2);
  if (currentQuarter !== midRound) return null;
  if (
    player.flags?.has?.("doctrine_revised_midgame") ||
    player.flags?.has?.("doctrine_revised_r20")
  ) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[4.25rem] left-1/2 -translate-x-1/2 z-[1085] w-[min(30rem,calc(100vw-2rem))]"
    >
      <div className="rounded-lg border border-accent/50 bg-surface/97 backdrop-blur-md shadow-[var(--shadow-4)] overflow-hidden">
        <div className="h-1 w-full bg-accent" />
        <div className="flex items-start gap-3 px-4 py-3">
          <span className="shrink-0 mt-0.5 inline-flex w-8 h-8 rounded-lg bg-[var(--accent-soft)] text-accent items-center justify-center">
            <Compass size={16} aria-hidden />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-caption uppercase tracking-wider text-accent font-semibold">
              Strategic review · halfway point
            </div>
            <p className="text-body-sm text-ink leading-snug mt-0.5">
              You&apos;re at the campaign&apos;s midpoint — your one chance to
              change doctrine. Pivot if your strategy isn&apos;t paying, or
              double down on what works.
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => { requestDoctrineReview(); setDismissed(true); }}
              >
                Review doctrine →
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>
                Keep current
              </Button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss the strategic review prompt"
            className="p-1 -mr-1 rounded text-ink-muted hover:text-ink hover:bg-surface-hover transition shrink-0"
          >
            <X size={13} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
