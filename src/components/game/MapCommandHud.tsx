"use client";

import { MapPin, Plane, Info } from "lucide-react";
import { cn } from "@/lib/cn";
import { CITIES_BY_CODE } from "@/data/cities";

export interface MapCommandHudProps {
  origin: string | null;
  dest: string | null;
  /** Player's hub airport code — shown as a starting-point hint on step 1. */
  hubCode?: string;
  /**
   * When true (a side panel is open), collapse to a pill that tells the
   * player their route selection is paused — they need to close the panel
   * to continue picking cities on the map.
   */
  compact?: boolean;
}

export function MapCommandHud({ origin, dest, hubCode, compact }: MapCommandHudProps) {
  const o = origin ? CITIES_BY_CODE[origin] : null;
  const d = dest ? CITIES_BY_CODE[dest] : null;
  const hub = hubCode ? CITIES_BY_CODE[hubCode] : null;

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
        "pointer-events-none fixed bottom-4 right-4 z-[1090]",
        "w-[17rem] rounded-lg border border-line bg-surface/95 backdrop-blur-md",
        "shadow-[var(--shadow-3)]",
      )}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b border-line/60 flex items-center gap-1.5">
        <Plane size={11} className="text-primary" />
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink font-medium">
          Start a route
        </span>
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
