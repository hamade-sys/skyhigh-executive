"use client";

import { X, ArrowRight } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { CITIES_BY_CODE } from "@/data/cities";
import { useGame, selectPlayer } from "@/store/game";
import { distanceBetween } from "@/lib/engine";
import { cn } from "@/lib/cn";

export interface RouteLaunchBarProps {
  origin: string | null;
  dest: string | null;
  onCancel: () => void;
  onLaunch: (args: { isCargo: boolean }) => void;
}

/**
 * Compact top-center toolbar that appears once the user has picked both
 * endpoints. It shows the pair + a Launch button — the big detail modal only
 * opens when Launch is clicked, so the destination city stays visible.
 *
 * Cargo flag is now derived inside RouteSetupModal from the selected
 * aircraft (commit 6300e08 removed the explicit toggle from the launch
 * bar and HUD). Callers still pass `forceCargo` to the setup modal.
 */
export function RouteLaunchBar({
  origin, dest, onCancel, onLaunch,
}: RouteLaunchBarProps) {
  const player = useGame(selectPlayer);
  if (!player) return null;

  // Stage 1: only origin picked — hint to pick destination
  if (origin && !dest) {
    const o = CITIES_BY_CODE[origin];
    if (!o) return null;
    const isInNetwork =
      o.code === player.hubCode ||
      player.secondaryHubCodes.includes(o.code) ||
      player.routes.some((r) =>
        r.status !== "closed" &&
        (r.originCode === o.code || r.destCode === o.code),
      );
    return (
      <div className="pointer-events-none fixed top-[4.25rem] left-1/2 -translate-x-1/2 z-50">
        <div
          className={cn(
            "pointer-events-auto flex items-center gap-3 px-3 py-2 rounded-lg",
            "border bg-surface/95 backdrop-blur-md shadow-[var(--shadow-3)]",
            isInNetwork ? "border-primary" : "border-warning",
          )}
        >
          <Badge tone={isInNetwork ? "primary" : "warning"}>
            {isInNetwork ? "Origin in network" : "Not in network"}
          </Badge>
          <span className="font-mono text-[0.9375rem] text-ink">
            {o.code}
          </span>
          <span className="text-[0.8125rem] text-ink-2">
            {o.name}
          </span>
          <span className="text-[0.75rem] text-ink-muted">
            → pick a destination city
          </span>
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="ml-1 w-7 h-7 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center"
          >
            <X size={14} />
          </button>
        </div>
        {!isInNetwork && (
          <div className="mt-2 mx-auto max-w-md pointer-events-auto rounded-md border border-warning bg-surface px-3 py-2 text-[0.75rem] text-ink-2 shadow-[var(--shadow-3)]">
            Routes must start from your hub or a city you already fly to.
            Continue picking a destination — if the destination is in your
            network, you&apos;ll be offered to add this as a secondary hub
            (costs 2× terminal fee).
          </div>
        )}
      </div>
    );
  }

  // Stage 2: both picked — launch bar
  if (!origin || !dest) return null;
  const o = CITIES_BY_CODE[origin];
  const d = CITIES_BY_CODE[dest];
  if (!o || !d) return null;

  const distKm = distanceBetween(origin, dest);

  return (
    <div className="pointer-events-none fixed top-[4.25rem] left-1/2 -translate-x-1/2 z-50">
      <div
        className={cn(
          "pointer-events-auto flex items-center gap-3 px-3 py-2 rounded-lg",
          "border border-primary bg-surface/95 backdrop-blur-md shadow-[var(--shadow-3)]",
        )}
      >
        <span className="font-mono text-[0.9375rem] text-ink font-medium">
          {o.code}
        </span>
        <ArrowRight size={14} className="text-ink-muted" />
        <span className="font-mono text-[0.9375rem] text-ink font-medium">
          {d.code}
        </span>
        <span className="text-[0.75rem] text-ink-muted tabular">
          {Math.round(distKm).toLocaleString()} km
        </span>

        <Button size="sm" variant="primary" onClick={() => onLaunch({ isCargo: false })}>
          Launch route →
        </Button>
        <button
          onClick={onCancel}
          aria-label="Cancel"
          className="w-7 h-7 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
