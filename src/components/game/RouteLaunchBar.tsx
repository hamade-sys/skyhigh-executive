"use client";

import { Plane, Package, X, ArrowRight } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { CITIES_BY_CODE } from "@/data/cities";
import { useGame, selectPlayer } from "@/store/game";
import { distanceBetween } from "@/lib/engine";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";

export interface RouteLaunchBarProps {
  origin: string | null;
  dest: string | null;
  onCancel: () => void;
  onLaunch: (args: { isCargo: boolean }) => void;
  isCargo: boolean;
  setIsCargo: (v: boolean) => void;
}

/**
 * Compact top-center toolbar that appears once the user has picked both
 * endpoints. It shows the pair + a Launch button — the big detail modal only
 * opens when Launch is clicked, so the destination city stays visible.
 */
export function RouteLaunchBar({
  origin, dest, onCancel, onLaunch, isCargo, setIsCargo,
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
          <div className="mt-2 mx-auto max-w-md pointer-events-auto rounded-md border border-warning bg-[var(--warning-soft)] px-3 py-2 text-[0.75rem] text-ink-2">
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
  // Reasonable cargo-storage setup estimate for UI preview
  const storageCostByTier = (tier: 1 | 2 | 3 | 4) =>
    tier === 1 ? 8_000_000 : tier === 2 ? 4_000_000 : tier === 3 ? 2_000_000 : 800_000;
  const cargoSetupCost = isCargo
    ? (player.cargoStorageActivations.includes(o.code) ? 0 : storageCostByTier(o.tier)) +
      (player.cargoStorageActivations.includes(d.code) ? 0 : storageCostByTier(d.tier))
    : 0;

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

        {/* Pax / Cargo toggle */}
        <div className="flex items-center gap-0.5 rounded-md border border-line p-0.5">
          <button
            onClick={() => setIsCargo(false)}
            className={cn(
              "px-2 py-1 rounded-sm text-[0.75rem] flex items-center gap-1.5",
              !isCargo
                ? "bg-primary text-primary-fg font-medium"
                : "text-ink-2 hover:text-ink",
            )}
          >
            <Plane size={13} /> Passenger
          </button>
          <button
            onClick={() => setIsCargo(true)}
            className={cn(
              "px-2 py-1 rounded-sm text-[0.75rem] flex items-center gap-1.5",
              isCargo
                ? "bg-primary text-primary-fg font-medium"
                : "text-ink-2 hover:text-ink",
            )}
          >
            <Package size={13} /> Cargo
          </button>
        </div>

        {isCargo && cargoSetupCost > 0 && (
          <Badge tone="warning">
            Cargo storage setup {fmtMoney(cargoSetupCost)}
          </Badge>
        )}

        <Button size="sm" variant="primary" onClick={() => onLaunch({ isCargo })}>
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
