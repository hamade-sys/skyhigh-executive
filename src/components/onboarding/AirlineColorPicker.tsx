"use client";

/**
 * Airline color picker — slim swatch row.
 *
 * Compact dot picker (8 small circles inline) instead of the chunky
 * grid of square tiles. Each tile is a 28×28 swatch with a thin
 * ring; the selected one gets a thicker ring + checkmark inside.
 * Disabled (already-taken) swatches go to ~25% opacity with a tiny
 * lock icon. The whole picker now takes one row instead of
 * dominating the form.
 *
 * Multiplayer-aware: when `gameId` is set, clicks call
 * /api/games/claim-color server-side before applying locally. On
 * 409 the picker surfaces an inline error and refreshes via the
 * `onTakenConflict` callback. On 5xx (e.g. the airline_color_id
 * column doesn't exist yet because migration 0004 hasn't been
 * applied), the error is downgraded to a soft toast — local
 * onChange still fires so the rest of the onboarding flow isn't
 * blocked.
 *
 * Solo flow: the parent passes no `gameId` and tracks the
 * selection locally — uniqueness isn't a concern.
 *
 * Accessibility:
 *   - Buttons in a `radiogroup` with `aria-checked`.
 *   - Each tile's aria-label includes color name + airline name
 *     so screen readers announce who this color identifies.
 *   - Disabled tiles get aria-disabled + tooltip.
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
   *  with another player's. The parent should re-fetch the
   *  takenColorIds set so the picker greys out the right tiles. */
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
      if (res.status === 503) {
        // Schema migration 0004 hasn't been applied yet — the
        // server explicitly tagged this as a "schema offline"
        // diagnostic. Apply locally, surface a soft hint.
        onChange(id);
        setError(
          "Color saved locally. Server color sync turns on once the operator applies migration 0004.",
        );
        return;
      }
      if (!res.ok) {
        setError(json?.error ?? "Couldn't claim that color. Try again.");
        return;
      }
      onChange(id);
    } catch {
      // Network blip — don't block the onboarding flow. Apply
      // locally and surface a soft warning.
      onChange(id);
      setError("Network blip. Color saved locally; will sync when you reconnect.");
    } finally {
      setClaiming(null);
    }
  }

  return (
    <div className="space-y-1.5">
      <div
        role="radiogroup"
        aria-label="Airline brand color"
        className="inline-flex flex-wrap items-center gap-2"
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
              title={isTaken ? `${c.label} (taken)` : c.label}
              className={cn(
                "relative w-7 h-7 rounded-full transition-all shrink-0",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface",
                isSelected
                  ? "scale-110 ring-2 ring-offset-2 ring-offset-surface"
                  : "ring-1 ring-line hover:scale-105 hover:ring-2 hover:ring-line-strong",
                isDisabled && !isClaiming && "opacity-30 cursor-not-allowed hover:scale-100",
                isClaiming && "opacity-70",
              )}
              style={{
                backgroundColor: c.hex,
                ...(isSelected
                  ? { boxShadow: `0 0 0 2px ${c.hex}` }
                  : {}),
              }}
            >
              {isClaiming ? (
                <Loader2
                  className={cn(
                    "absolute inset-0 m-auto w-3.5 h-3.5 animate-spin",
                    c.textOn === "white" ? "text-white" : "text-slate-900",
                  )}
                  aria-hidden
                />
              ) : isSelected ? (
                <Check
                  className={cn(
                    "absolute inset-0 m-auto w-3.5 h-3.5",
                    c.textOn === "white" ? "text-white" : "text-slate-900",
                  )}
                  strokeWidth={3}
                  aria-hidden
                />
              ) : isTaken ? (
                <Lock
                  className="absolute inset-0 m-auto w-2.5 h-2.5 text-white"
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
          className="text-[0.6875rem] text-amber-700 leading-snug"
        >
          {error}
        </p>
      )}
    </div>
  );
}
