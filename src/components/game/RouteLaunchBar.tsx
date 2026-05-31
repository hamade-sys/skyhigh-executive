"use client";

import { X, ArrowRight, Plane, Users, MapPin, Building2, Gavel } from "lucide-react";
import { Button, Badge } from "@/components/ui";
import { CITIES_BY_CODE } from "@/data/cities";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { distanceBetween, routeDemandPerDay } from "@/lib/engine";
import { cn } from "@/lib/cn";
import type { City, Team } from "@/types/game";

export interface RouteLaunchBarProps {
  origin: string | null;
  dest: string | null;
  /** Viewport coords of the clicked city marker. When present the card
   *  anchors next to the marker (above it, flipping below near the top
   *  edge) instead of the fixed bottom-center fallback. */
  anchor?: { x: number; y: number } | null;
  onCancel: () => void;
  onLaunch: (args: { isCargo: boolean }) => void;
}

/**
 * Floating city-card popup for route picking.
 *
 * Replaces the prior top-of-screen toolbar with a pair of small
 * cards anchored at the bottom-center of the map. Each card carries
 * the city's name + IATA code, demand split (tourism + business
 * pax/day for THIS quarter), and the player's slot count at that
 * airport. Picking a second city slides a second card in beside
 * the first; an "Open route →" button appears once both are set.
 *
 * Why the redesign:
 *   - The old top toolbar pulled the player's gaze away from the
 *     map exactly when they needed to compare cities.
 *   - The "Origin in network" badge was the only signal; demand,
 *     slots, and tier were invisible at the picking moment.
 *   - The bidirectional issue (clicking LHR-DXB then DXB-LHR
 *     looking like a different route) is engine-correct in
 *     openRoute(), but the UI didn't surface that fact. The new
 *     cards always render with the player's HUB on the left so
 *     the player sees the canonical orientation that the engine
 *     will use, regardless of click order.
 */
export function RouteLaunchBar({
  origin, dest, anchor, onCancel, onLaunch,
}: RouteLaunchBarProps) {
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const totalRounds = useGame((s) => s.session?.totalRounds ?? 60);
  if (!player) return null;
  if (!origin && !dest) return null;

  const o = origin ? CITIES_BY_CODE[origin] : null;
  const d = dest ? CITIES_BY_CODE[dest] : null;

  // Hub-first orientation — same logic as openRoute()'s normalizer.
  // Whichever city the player picked, the player's hub renders on
  // the left so LHR→DXB and DXB→LHR show identically once both
  // ends are set. Eliminates the "feels like a different route"
  // confusion the user flagged.
  const hubs = new Set([player.hubCode, ...player.secondaryHubCodes]);
  let leftCity: City | null = o;
  let rightCity: City | null = d;
  if (o && d) {
    if (hubs.has(d.code) && !hubs.has(o.code)) {
      leftCity = d;
      rightCity = o;
    } else if (hubs.has(d.code) && hubs.has(o.code)) {
      // Both hubs — primary hub on left.
      if (o.code !== player.hubCode && d.code === player.hubCode) {
        leftCity = d;
        rightCity = o;
      }
    }
  }

  const distKm = leftCity && rightCity
    ? distanceBetween(leftCity.code, rightCity.code)
    : 0;

  // Anchor the card next to the clicked marker. Place it ABOVE the marker by
  // default, flipping BELOW when the click is near the top edge. Clamp the
  // horizontal center so a card never runs off-screen. Falls back to the
  // fixed bottom-center when no anchor is available (e.g. keyboard entry).
  const GAP = 18;
  const CARD_H = 168;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1440;
  const placeBelow = anchor ? anchor.y < CARD_H + GAP + 12 : false;
  const anchored = !!anchor;
  const wrapperStyle = anchor
    ? {
        left: Math.min(Math.max(anchor.x, 150), vw - 150),
        top: placeBelow ? anchor.y + GAP : anchor.y - GAP,
        transform: placeBelow ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }
    : undefined;

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[1080]",
        !anchored && "bottom-6 left-1/2 -translate-x-1/2",
      )}
      style={wrapperStyle}
    >
      <div className="pointer-events-auto flex items-end gap-2">
        {/* Left card (origin or hub-side) */}
        {leftCity && (
          <CityCard
            city={leftCity}
            player={player}
            currentQuarter={currentQuarter}
            totalRounds={totalRounds}
            otherCity={rightCity}
            role={leftCity === o ? "primary" : "primary"}
          />
        )}

        {/* Connector + open-route button */}
        {leftCity && rightCity && (
          <div className="flex flex-col items-center gap-2 pb-3">
            <div className="flex items-center gap-1.5 text-ink-muted">
              <ArrowRight size={14} />
              <span className="text-[0.75rem] tabular font-mono">
                {Math.round(distKm).toLocaleString()} km
              </span>
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => onLaunch({ isCargo: false })}
            >
              Open route →
            </Button>
          </div>
        )}

        {/* Right card (destination) — slides in once both are picked */}
        {rightCity && (
          <CityCard
            city={rightCity}
            player={player}
            currentQuarter={currentQuarter}
            totalRounds={totalRounds}
            otherCity={leftCity}
            role="secondary"
          />
        )}

        {/* Inline hint when only origin is picked */}
        {leftCity && !rightCity && (
          <div className="flex flex-col gap-2 pl-2 pb-2">
            <div className="text-[0.75rem] text-ink-muted leading-tight max-w-[10rem]">
              Pick a destination on the map
            </div>
            <button
              onClick={onCancel}
              aria-label="Cancel"
              className="w-7 h-7 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* Cancel pill once both cards are visible */}
        {leftCity && rightCity && (
          <button
            onClick={onCancel}
            aria-label="Cancel"
            className="w-7 h-7 rounded-md text-ink-2 hover:bg-surface-hover hover:text-ink flex items-center justify-center self-end mb-1"
          >
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// City card
// ============================================================================

function CityCard({
  city, player, currentQuarter, totalRounds, otherCity, role,
}: {
  city: City;
  player: Team;
  currentQuarter: number;
  totalRounds: number;
  /** When set, surface OD-pair demand instead of single-city demand
   *  on the destination card so the player sees the actual market
   *  size for the chosen route. */
  otherCity: City | null;
  role: "primary" | "secondary";
}) {
  const setAirportDetailCode = useUi((u) => u.setAirportDetailCode);
  const ownerTeamId = useGame((s) => s.airportSlots?.[city.code]?.ownerTeamId);
  const liveAuction = useGame((s) =>
    (s.airportConcessionAuctions ?? []).find(
      (a) => a.airportCode === city.code && a.status === "open",
    ),
  );
  const ownedByMe = ownerTeamId === player.id;
  const ownedByRival = !!ownerTeamId && ownerTeamId !== player.id;

  const isHub = city.code === player.hubCode;
  const isSecondaryHub = player.secondaryHubCodes.includes(city.code);
  const inNetwork =
    isHub ||
    isSecondaryHub ||
    player.routes.some(
      (r) =>
        r.status !== "closed" &&
        (r.originCode === city.code || r.destCode === city.code),
    );

  // Slots the player owns at this airport (across leases). Shows the
  // actual capacity number the route launch will be checked against.
  const slotsHeld = player.airportLeases?.[city.code]?.slots ?? 0;

  // Demand context — when both endpoints are set, show the OD's
  // shared daily demand (this is the actual pool the route would
  // compete for). Otherwise show the city's own tourism/business
  // baseline at the current quarter.
  const demand = (() => {
    if (otherCity) {
      const od = routeDemandPerDay(city.code, otherCity.code, currentQuarter, totalRounds);
      return {
        kind: "od" as const,
        total: Math.round(od.total),
        tourism: Math.round(od.tourism),
        business: Math.round(od.business),
      };
    }
    return {
      kind: "city" as const,
      total: Math.round(city.tourism + city.business),
      tourism: Math.round(city.tourism),
      business: Math.round(city.business),
    };
  })();

  return (
    <div
      className={cn(
        "min-w-[14rem] rounded-xl border bg-surface/95 backdrop-blur-md shadow-[var(--shadow-3)]",
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        role === "primary" ? "border-primary/40" : "border-line",
      )}
    >
      {/* Header: code + name + tier pill */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-line/60">
        <MapPin size={11} className="text-primary shrink-0" />
        <span className="font-mono text-[0.9375rem] font-bold tabular text-ink">
          {city.code}
        </span>
        <span className="text-[0.75rem] text-ink-2 truncate flex-1">
          {city.name}
        </span>
        {isHub && (
          <Badge tone="primary">Hub</Badge>
        )}
        {!isHub && isSecondaryHub && (
          <Badge tone="accent">2°</Badge>
        )}
        {!isHub && !isSecondaryHub && inNetwork && (
          <Badge tone="neutral">In network</Badge>
        )}
      </div>

      {/* Body: demand + slots */}
      <div className="px-3 py-2 space-y-1.5">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            <Users size={10} />
            {demand.kind === "od" ? "OD demand · day" : "City demand · day"}
          </div>
          <span className="font-mono text-[0.875rem] font-semibold tabular text-ink">
            {demand.total.toLocaleString()}
          </span>
        </div>
        {/* Tourism / business split bar */}
        <div className="flex items-center gap-2 text-[0.6875rem] tabular">
          <span className="text-ink-muted">Leisure</span>
          <div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden">
            {demand.total > 0 && (
              <div
                className="h-full bg-primary/70"
                style={{
                  width: `${Math.round((demand.tourism / demand.total) * 100)}%`,
                }}
              />
            )}
          </div>
          <span className="text-ink-muted">Business</span>
        </div>

        <div className="flex items-baseline justify-between pt-1.5 border-t border-line/40">
          <div className="flex items-center gap-1.5 text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            <Plane size={10} />
            Your slots
          </div>
          <span
            className={cn(
              "font-mono text-[0.875rem] font-semibold tabular",
              slotsHeld > 0 ? "text-ink" : "text-warning",
            )}
          >
            {slotsHeld}
            {slotsHeld === 0 && (
              <span className="ml-1 text-[0.6875rem] font-normal text-warning">
                bid required
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Airport ownership entry — single-click discoverable path to the
          ownership / slot-bid / concession-auction modal. Before this the
          modal opened only on double-click, which players never found, so
          "I can't even buy an airport" was a discoverability dead-end. */}
      <button
        onClick={() => setAirportDetailCode(city.code)}
        className={cn(
          "w-full flex items-center justify-between gap-2 px-3 py-2 border-t border-line/60",
          "text-[0.75rem] font-medium rounded-b-xl transition-colors",
          liveAuction
            ? "text-warning hover:bg-[var(--warning-soft)]/40"
            : "text-primary hover:bg-[var(--primary-soft)]/40",
        )}
      >
        <span className="flex items-center gap-1.5">
          {liveAuction ? <Gavel size={12} /> : <Building2 size={12} />}
          {liveAuction
            ? `Auction live · ${Math.max(0, liveAuction.closesQuarter - currentQuarter)}Q left`
            : ownedByMe
              ? "Your airport · manage"
              : ownedByRival
                ? "Owned by rival · view"
                : "Buy / bid airport"}
        </span>
        <ArrowRight size={13} />
      </button>
    </div>
  );
}
