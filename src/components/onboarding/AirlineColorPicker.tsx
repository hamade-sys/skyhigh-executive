"use client";

/**
 * Airline color picker — Phase 9 of the enterprise-readiness plan.
 *
 * 8-tile grid surfaced in onboarding. Each tile previews a brand
 * color (the same hex used downstream for leaderboard chips, route
 * ribbons, multi-airline chart lines, chat avatar). The selected
 * color highlights with a thicker ring and a checkmark.
 *
 * Multiplayer-aware: when `takenColorIds` is non-empty, those tiles
 * are visually muted and unclickable. Server-side
 * `/api/games/claim-color` (lobby flow) enforces uniqueness on race
 * conditions; this component handles the local UX.
 *
 * Solo flow: the parent passes an empty `takenColorIds` and just
 * tracks the selection locally — uniqueness isn't a concern.
 *
 * Accessibility:
 *   - Tiles are buttons in a `radiogroup` with `aria-checked`.
 *   - Each tile's aria-label includes the color name + airline name
 *     (e.g. "Blue — Meridian Air") so screen readers announce who
 *     this color identifies.
 *   - Disabled tiles get aria-disabled + a "Already taken" tooltip.
 */

import { useState } from "react";
import { Check, Lock, Loader2 } from "lucide-react";
import {
  AIRLINE_COLOR_PALETTE,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { cn } from "@/lib/cn";

interface Props {
  /** Currently-selected color id. Null when nothing selected. */
  value: AirlineColorId | null;
  /** Called with the new id on click. In multiplayer flows the parent
   *  should treat this as optimistic — the server-side claim still
   *  has to succeed. The `gameId` prop below toggles that behaviour. */
  onChange: (id: AirlineColorId) => void;
  /** Color ids already claimed by other players in this game. Empty
   *  array for solo flows. The user's own current selection is NOT
   *  considered "taken" — they can re-select it idempotently. */
  takenColorIds?: ReadonlyArray<AirlineColorId>;
  /** Optional airline name to weave into the per-tile aria-label. */
  airlineName?: string;
  /** When set, this is a multiplayer flow — the picker calls
   *  /api/games/claim-color before invoking onChange. On 409 (taken)
   *  it surfaces an inline error and skips onChange so the local
   *  state stays in sync with the server. Pass null/undefined for
   *  solo flows; in solo, onChange runs immediately with no network. */
  gameId?: string | null;
  /** Optional callback fired when the server-side claim collides
   *  with another player's. The parent should re-fetch the takenColorIds
   *  set so the picker greys out the right tiles. */
  onTakenConflict?: () => void;
}

export function AirlineColorPicker({
  value,
  onChange,
  takenColorIds = [],
  airlineName,
  gameId,
  onTakenConflict,
}: Props) {
  const taken = new Set(takenColorIds.filter((id) => id !== value));
  const [claiming, setClaiming] = useState<AirlineColorId | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSelect(id: AirlineColorId) {
    setError(null);
    if (!gameId) {
      // Solo flow — apply immediately, no network.
      onChange(id);
      return;
    }
    // Multiplayer — try to claim server-side first. The local state
    // doesn't update until we know the claim succeeded; otherwise
    // two players who both clicked the same color would both think
    // they had it.
    setClaiming(id);
    try {
      const res = await fetch("/api/games/claim-color", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameId, colorId: id }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setError("Another airline grabbed that color. Pick a different one.");
        onTakenConflict?.();
        return;
      }
      if (!res.ok) {
        setError(json?.error ?? "Couldn't claim that color. Try again.");
        return;
      }
      onChange(id);
    } catch {
      setError("Network error claiming color. Try again.");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Airline brand color"
        className="grid grid-cols-4 sm:grid-cols-8 gap-2"
      >
        {AIRLINE_COLOR_PALETTE.map((c) => {
          const isSelected = value === c.id;
          const isTaken = taken.has(c.id);
          const isClaiming = claiming === c.id;
          const isDisabled = isTaken || (claiming !== null && !isClaiming);
          const ariaLabel = airlineName
            ? `${c.label} — ${airlineName}${isTaken ? " (already taken)" : ""}`
            : `${c.label}${isTaken ? " (already taken)" : ""}`;
          return (
            <button
              key={c.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              onClick={() => !isDisabled && handleSelect(c.id)}
              aria-label={ariaLabel}
              title={isTaken ? "Already chosen by another airline" : c.label}
              className={cn(
                "relative aspect-square rounded-xl transition-all",
                "min-h-[44px] min-w-[44px]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                isSelected
                  ? "ring-2 ring-offset-2 ring-offset-surface scale-[1.05]"
                  : "hover:scale-[1.03] focus-visible:ring-primary",
                isDisabled && !isClaiming && "opacity-30 cursor-not-allowed",
                isClaiming && "opacity-70",
              )}
              style={{
                backgroundColor: c.hex,
                boxShadow: isSelected
                  ? `0 0 0 2px ${c.hex}, 0 0 0 4px white, 0 0 0 6px ${c.hex}`
                  : undefined,
              }}
            >
              {isClaiming ? (
                <Loader2
                  className={cn(
                    "absolute inset-0 m-auto w-5 h-5 animate-spin",
                    c.textOn === "white" ? "text-white" : "text-slate-900",
                  )}
                  aria-hidden
                />
              ) : isSelected ? (
                <Check
                  className={cn(
                    "absolute inset-0 m-auto w-5 h-5",
                    c.textOn === "white" ? "text-white" : "text-slate-900",
                  )}
                  strokeWidth={3}
                  aria-hidden
                />
              ) : isTaken ? (
                <Lock
                  className="absolute inset-0 m-auto w-3.5 h-3.5 text-white"
                  strokeWidth={2.5}
                  aria-hidden
                />
              ) : null}
              <span className="sr-only">{c.label}</span>
            </button>
          );
        })}
      </div>
      {error && (
        <p
          role="alert"
          className="text-[0.75rem] text-rose-600 leading-relaxed"
        >
          {error}
        </p>
      )}
    </div>
  );
}
