"use client";

import { MapPin, Plane, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { CITIES_BY_CODE } from "@/data/cities";

export interface MapCommandHudProps {
  origin: string | null;
  dest: string | null;
  /** Player's hub airport code — shown as a starting-point hint on step 1. */
  hubCode?: string;
  /** Number of routes the player already has open. When > 0 the HUD
   *  doesn't need to teach them anymore and auto-hides. They can still
   *  manually re-open it via the help icon (not yet wired). */
  activeRouteCount?: number;
  /**
   * When true (a side panel is open), collapse to a pill that tells the
   * player their route selection is paused — they need to close the panel
   * to continue picking cities on the map.
   */
  compact?: boolean;
}

const DISMISSED_KEY = "skyforce:mapHudDismissed:v1";

export function MapCommandHud({ origin, dest, hubCode, activeRouteCount, compact }: MapCommandHudProps) {
  const o = origin ? CITIES_BY_CODE[origin] : null;
  const d = dest ? CITIES_BY_CODE[dest] : null;
  const hub = hubCode ? CITIES_BY_CODE[hubCode] : null;

  // Manual dismissal — persists in localStorage so closing the HUD
  // sticks across reloads. Player gets back the screen real estate
  // once they've internalised the route flow.
  const [manuallyDismissed, setManuallyDismissed] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setManuallyDismissed(window.localStorage.getItem(DISMISSED_KEY) === "1");
    } catch {}
  }, []);
  function dismiss() {
    setManuallyDismissed(true);
    if (typeof window !== "undefined") {
      try { window.localStorage.setItem(DISMISSED_KEY, "1"); } catch {}
    }
  }

  // Auto-hide once the player has 2+ active routes — they don't need
  // the route-flow tutorial anymore and the floating panel just clutters
  // the map. They can still re-open it (eventually we'll add a help
  // icon in the rail).
  const autoHidden = (activeRouteCount ?? 0) >= 2;
  if (autoHidden || manuallyDismissed) return null;

  const stage: 1 | 2 | 3 = !o ? 1 : !d ? 2 : 3;

  // When a panel is open the map is blocked — tell the player why their
  // city clicks aren't working rather than silently showing "Step X/3".
  if (compact) {
    const hasSelection = !!o;
    return (
      <div
        className={cn(
          "pointer-events-none fixed bottom-4 right-4 z-[1090]",
          "rounded-md border border-line bg-surface/90 backdrop-blur-md",
          "px-3 py-2 shadow-[var(--shadow-2)] max-w-[14rem]",
        )}
      >
        <div className="flex items-start gap-1.5 text-[0.6875rem] text-ink-muted leading-snug">
          <Info size={10} className="mt-0.5 shrink-0" />
          <span>
            {hasSelection
              ? "Close the panel to continue picking your route on the map"
              : "Close the panel to start a route on the map"}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "pointer-events-auto fixed bottom-4 right-4 z-[1090]",
        "w-[17rem] rounded-lg border border-line bg-surface/95 backdrop-blur-md",
        "shadow-[var(--shadow-3)]",
      )}
    >
      {/* Header with close button — once the player closes this, the
          dismissal persists across reloads. They can also auto-graduate
          out of seeing it once they have 2+ active routes. */}
      <div className="px-3 py-2 border-b border-line/60 flex items-center gap-1.5">
        <Plane size={11} className="text-primary" />
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink font-medium">
          Start a route
        </span>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide route helper"
          className="ml-auto w-5 h-5 rounded-md text-ink-muted hover:bg-surface-hover hover:text-ink flex items-center justify-center"
        >
          <X size={11} />
        </button>
      </div>

      <ol className="px-3 py-2.5 space-y-2">
        {/* Step 1 */}
        <Step
          n={1}
          active={stage === 1}
          done={stage > 1}
          label="Click your departure city"
          detail={
            o
              ? `${o.code} · ${o.name}`
              : hub
              ? `Your hub ${hub.code} · ${hub.name} is a good start`
              : null
          }
          detailIsHint={!o && !!hub}
        />
        {/* Step 2 */}
        <Step
          n={2}
          active={stage === 2}
          done={stage > 2}
          label={stage >= 2 ? "Now click your destination city" : "Then click your destination"}
          detail={d ? `${d.code} · ${d.name}` : null}
        />
        {/* Step 3 */}
        <Step
          n={3}
          active={stage === 3}
          done={false}
          label={
            stage === 3
              ? "Tap Launch → in the bar above to open route setup"
              : "Then tap Launch to configure the route"
          }
        />
      </ol>

      {/* Footer tip */}
      <div className="px-3 py-2 border-t border-line/60">
        <div className="flex items-start gap-1.5 text-[0.6875rem] text-ink-muted leading-snug">
          <Info size={10} className="mt-0.5 shrink-0" />
          <div>
            <span className="text-ink-2">Double-click</span> any city to see
            airport info &amp; available slots ·{" "}
            <span className="text-ink-2">Click open ocean</span> to deselect
          </div>
        </div>
      </div>
    </div>
  );
}

function Step({
  n,
  active,
  done,
  label,
  detail,
  detailIsHint,
}: {
  n: number;
  active: boolean;
  done: boolean;
  label: string;
  detail?: string | null;
  detailIsHint?: boolean;
}) {
  return (
    <li className="flex items-start gap-2">
      <div
        className={cn(
          "shrink-0 w-4 h-4 rounded-full text-[0.625rem] font-semibold tabular flex items-center justify-center mt-0.5",
          done
            ? "bg-positive/20 text-positive"
            : active
            ? "bg-primary text-primary-fg"
            : "bg-surface-2 text-ink-muted",
        )}
      >
        {done ? "✓" : n}
      </div>
      <div className="min-w-0 flex-1">
        <div
          className={cn(
            "text-[0.75rem] leading-snug",
            active ? "text-ink font-medium" : done ? "text-ink-2" : "text-ink-muted",
          )}
        >
          {label}
        </div>
        {detail && (
          <div
            className={cn(
              "text-[0.6875rem] leading-tight mt-0.5 flex items-center gap-1 truncate",
              detailIsHint ? "text-primary/70 italic" : "text-ink-muted",
            )}
          >
            <MapPin size={9} className="shrink-0" />
            <span className="truncate">{detail}</span>
          </div>
        )}
      </div>
    </li>
  );
}
