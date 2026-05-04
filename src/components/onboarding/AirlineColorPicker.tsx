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

import { Check, Lock } from "lucide-react";
import {
  AIRLINE_COLOR_PALETTE,
  type AirlineColorId,
} from "@/lib/games/airline-colors";
import { cn } from "@/lib/cn";

interface Props {
  /** Currently-selected color id. Null when nothing selected. */
  value: AirlineColorId | null;
  /** Called with the new id on click. */
  onChange: (id: AirlineColorId) => void;
  /** Color ids already claimed by other players in this game. Empty
   *  array for solo flows. The user's own current selection is NOT
   *  considered "taken" — they can re-select it idempotently. */
  takenColorIds?: ReadonlyArray<AirlineColorId>;
  /** Optional airline name to weave into the per-tile aria-label. */
  airlineName?: string;
}

export function AirlineColorPicker({
  value,
  onChange,
  takenColorIds = [],
  airlineName,
}: Props) {
  const taken = new Set(takenColorIds.filter((id) => id !== value));

  return (
    <div
      role="radiogroup"
      aria-label="Airline brand color"
      className="grid grid-cols-4 sm:grid-cols-8 gap-2"
    >
      {AIRLINE_COLOR_PALETTE.map((c) => {
        const isSelected = value === c.id;
        const isTaken = taken.has(c.id);
        const ariaLabel = airlineName
          ? `${c.label} — ${airlineName}${isTaken ? " (already taken)" : ""}`
          : `${c.label}${isTaken ? " (already taken)" : ""}`;
        return (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-disabled={isTaken}
            disabled={isTaken}
            onClick={() => !isTaken && onChange(c.id)}
            aria-label={ariaLabel}
            title={isTaken ? "Already chosen by another airline" : c.label}
            className={cn(
              "relative aspect-square rounded-xl transition-all",
              "min-h-[44px] min-w-[44px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
              isSelected
                ? "ring-2 ring-offset-2 ring-offset-surface scale-[1.05]"
                : "hover:scale-[1.03] focus-visible:ring-primary",
              isTaken && "opacity-30 cursor-not-allowed",
            )}
            style={{
              backgroundColor: c.hex,
              boxShadow: isSelected
                ? `0 0 0 2px ${c.hex}, 0 0 0 4px white, 0 0 0 6px ${c.hex}`
                : undefined,
            }}
          >
            {isSelected && (
              <Check
                className={cn(
                  "absolute inset-0 m-auto w-5 h-5",
                  c.textOn === "white" ? "text-white" : "text-slate-900",
                )}
                strokeWidth={3}
                aria-hidden
              />
            )}
            {isTaken && (
              <Lock
                className="absolute inset-0 m-auto w-3.5 h-3.5 text-white"
                strokeWidth={2.5}
                aria-hidden
              />
            )}
            {/* Visible label below the tile for sighted users */}
            <span className="sr-only">{c.label}</span>
          </button>
        );
      })}
    </div>
  );
}
