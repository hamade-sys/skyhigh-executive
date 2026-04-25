"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import {
  classFareRange,
  cruiseSpeedKmh,
  distanceBetween,
  maxRouteDailyFrequency,
  routeDemandPerDay,
} from "@/lib/engine";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import { CITIES_BY_CODE } from "@/data/cities";
import type { CityTier, PricingTier } from "@/types/game";
import { cn } from "@/lib/cn";

export interface RouteSetupModalProps {
  /** Explicit open flag — modal appears only after the user clicks Launch. */
  open: boolean;
  origin: string | null;
  dest: string | null;
  /** Pax vs Cargo preselection from the launch bar. */
  forceCargo?: boolean;
  onClose: () => void;
}

/**
 * Route setup modal — PRD-aligned flow.
 *
 * Order of operations matters:
 *   1. Aircraft selection comes FIRST. Without it, frequency cap and
 *      cabin-class availability are undefined.
 *   2. Daily frequency is capped at `maxRouteDailyFrequency` for the
 *      selected aircraft set + distance (PRD §D1: cruise speed × distance
 *      + 2hr ground turnaround at each end). Slider physically can't
 *      exceed the math.
 *   3. Per-class fares (econ / business / first) only render for cabin
 *      classes the selected aircraft actually has. The default is the
 *      base fare from PRD §A11; sliding adjusts demand sensitivity.
 *   4. Pricing tier is a quick preset that scales all class fares — kept
 *      visible but optional, gated behind aircraft selection.
 */
export function RouteSetupModal({ open, origin, dest, forceCargo, onClose }: RouteSetupModalProps) {
  const s = useGame();
  const player = selectPlayer(s);
  const openRoute = useGame((g) => g.openRoute);

  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([]);
  // UI is weekly throughout; engine still stores daily.
  const [weeklyFreq, setWeeklyFreq] = useState(7);
  const [tier, setTier] = useState<PricingTier>("standard");
  const [econFare, setEconFare] = useState<number | null>(null);
  const [busFare, setBusFare] = useState<number | null>(null);
  const [firstFare, setFirstFare] = useState<number | null>(null);
  const [isCargo, setIsCargo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOpen = open && !!(origin && dest);

  // Reset + auto-pick a viable plane when the modal opens
  useEffect(() => {
    if (!isOpen || !player || !origin || !dest) return;
    const dist = distanceBetween(origin, dest);
    const cargo = forceCargo ?? false;
    const idle = player.fleet.find((f) => {
      if (f.status !== "active") return false;
      // Stale routeId tolerance — same logic as idlePlanes filter
      if (f.routeId) {
        const r = player.routes.find((rt) => rt.id === f.routeId);
        if (r && r.status !== "closed") return false;
      }
      const spec = AIRCRAFT_BY_ID[f.specId];
      if (!spec) return false;
      if (spec.rangeKm < dist) return false;
      return cargo ? spec.family === "cargo" : spec.family === "passenger";
    });
    setSelectedPlaneIds(idle ? [idle.id] : []);
    setWeeklyFreq(7);
    setTier("standard");
    setEconFare(null);
    setBusFare(null);
    setFirstFare(null);
    setIsCargo(cargo);
    setError(null);
  }, [isOpen, origin, dest, forceCargo, player]);

  // Cap frequency to the engine-computed max as soon as aircraft selection
  // changes, so the slider can never exceed the physics-derived ceiling.
  const dist = origin && dest ? distanceBetween(origin, dest) : 0;
  const specIds = useMemo(
    () =>
      selectedPlaneIds
        .map((id) => player?.fleet.find((f) => f.id === id)?.specId)
        .filter((x): x is string => !!x),
    [selectedPlaneIds, player],
  );
  const maxDailyFreq = specIds.length > 0 ? maxRouteDailyFrequency(specIds, dist) : 0;
  const maxWeeklyFreq = maxDailyFreq * 7;
  useEffect(() => {
    if (maxWeeklyFreq === 0) {
      if (weeklyFreq !== 0) setWeeklyFreq(0);
      return;
    }
    if (weeklyFreq > maxWeeklyFreq) setWeeklyFreq(maxWeeklyFreq);
    if (weeklyFreq < 1) setWeeklyFreq(Math.min(7, maxWeeklyFreq));
  }, [maxWeeklyFreq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cabin availability from selected planes
  const hasFirst = useMemo(
    () =>
      selectedPlaneIds.some((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        const spec = p && AIRCRAFT_BY_ID[p.specId];
        return spec && spec.seats.first > 0;
      }),
    [selectedPlaneIds, player],
  );
  const hasBusiness = useMemo(
    () =>
      selectedPlaneIds.some((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        const spec = p && AIRCRAFT_BY_ID[p.specId];
        return spec && spec.seats.business > 0;
      }),
    [selectedPlaneIds, player],
  );
  const allCargo = useMemo(
    () =>
      selectedPlaneIds.length > 0 &&
      selectedPlaneIds.every((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        const spec = p && AIRCRAFT_BY_ID[p.specId];
        return spec && spec.family === "cargo";
      }),
    [selectedPlaneIds, player],
  );

  // Auto-flip cargo flag when aircraft selection is purely cargo
  useEffect(() => {
    if (allCargo && !isCargo) setIsCargo(true);
    if (!allCargo && isCargo) setIsCargo(false);
  }, [allCargo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!player) return null;

  // Idle = active AND not currently flying a non-closed route. Defensively
  // treat aircraft whose routeId points to a missing/closed route as idle —
  // older saves can have stale routeIds after route closures.
  const idlePlanes = player.fleet.filter((f) => {
    if (f.status !== "active") return false;
    if (!f.routeId) return true;
    const r = player.routes.find((rt) => rt.id === f.routeId);
    if (!r) return true;            // route deleted
    if (r.status === "closed") return true;
    return false;
  });
  const originCity = origin ? CITIES_BY_CODE[origin] : null;
  const destCity = dest ? CITIES_BY_CODE[dest] : null;

  // Schedule math summary used to explain the frequency cap
  const scheduleNote = (() => {
    if (specIds.length === 0) return null;
    const fastestSpeed = Math.max(...specIds.map((id) => cruiseSpeedKmh(id)));
    const slowestSpeed = Math.min(...specIds.map((id) => cruiseSpeedKmh(id)));
    const oneWayHrs = dist / slowestSpeed;
    const turnaround = 2.0;
    const roundTripHrs = oneWayHrs * 2 + turnaround * 2;
    return {
      perPlaneDaily: Math.max(1, Math.floor(24 / roundTripHrs)),
      roundTripHrs,
      fastestSpeed,
      slowestSpeed,
    };
  })();

  const econRange = origin && dest ? classFareRange(dist, "econ") : null;
  const busRange = origin && dest ? classFareRange(dist, "bus") : null;
  const firstRange = origin && dest ? classFareRange(dist, "first") : null;

  // Apply pricing-tier preset to all per-class fares (player can still
  // override individual classes after; reset clears the override).
  function applyTier(t: PricingTier) {
    setTier(t);
    const mult = t === "budget" ? 0.7 : t === "premium" ? 1.3 : t === "ultra" ? 1.6 : 1.0;
    if (econRange) setEconFare(Math.round(econRange.base * mult));
    if (hasBusiness && busRange) setBusFare(Math.round(busRange.base * mult));
    if (hasFirst && firstRange) setFirstFare(Math.round(firstRange.base * mult));
  }

  // Projected occupancy preview
  const projection = (() => {
    if (specIds.length === 0 || weeklyFreq === 0) return null;
    const dailyFreq = Math.max(1, Math.round(weeklyFreq / 7));
    const demand = routeDemandPerDay(origin!, dest!, s.currentQuarter).total;
    const totalSeats = selectedPlaneIds.reduce((sum, id) => {
      const p = player.fleet.find((f) => f.id === id);
      const spec = p && AIRCRAFT_BY_ID[p.specId];
      if (!spec) return sum;
      return sum + spec.seats.first + spec.seats.business + spec.seats.economy;
    }, 0);
    const dailyCapacity = totalSeats * dailyFreq;
    if (dailyCapacity === 0) return null;
    const occ = Math.min(1, demand / dailyCapacity);
    return {
      demand,
      capacity: dailyCapacity,
      occupancy: occ,
      tone: occ < 0.25 ? "neg" : occ < 0.55 ? "warn" : "pos",
    } as const;
  })();

  function confirmRoute() {
    if (!origin || !dest) return;
    if (selectedPlaneIds.length === 0) {
      setError("Pick at least one aircraft before opening the route.");
      return;
    }
    if (weeklyFreq < 1) {
      setError("Weekly frequency must be at least 1.");
      return;
    }
    const r = openRoute({
      originCode: origin,
      destCode: dest,
      aircraftIds: selectedPlaneIds,
      // Engine still tracks daily; convert. Min 1 so route is always operating.
      dailyFrequency: Math.max(1, Math.round(weeklyFreq / 7)),
      pricingTier: tier,
      econFare,
      busFare,
      firstFare,
      isCargo,
    });
    if (!r.ok) {
      setError(r.error ?? "Unknown error");
      return;
    }
    onClose();
  }

  const hasAircraft = selectedPlaneIds.length > 0;

  return (
    <Modal open={isOpen} onClose={onClose} className="w-[min(640px,calc(100vw-2rem))]">
      <ModalHeader>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge tone="accent">New route</Badge>
        </div>
        <h2 className="font-display text-[1.5rem] text-ink leading-tight">
          {origin} → {dest}
        </h2>
        {originCity && destCity && (
          <div className="text-ink-muted text-[0.8125rem] mt-1 tabular font-mono">
            {originCity.name} → {destCity.name} · {Math.round(dist).toLocaleString()} km
          </div>
        )}
      </ModalHeader>

      <ModalBody className="space-y-5 max-h-[70vh] overflow-y-auto">
        {/* Step 1 — Assign aircraft (REQUIRED FIRST) */}
        <Section step={1} title="Assign aircraft">
          {idlePlanes.length === 0 ? (
            <div className="rounded-md border border-line bg-surface-2 px-3 py-3 text-[0.8125rem] text-ink-muted">
              No idle aircraft available. Order or reassign in the Fleet panel
              before opening this route.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-auto">
              {idlePlanes.map((p) => {
                const spec = AIRCRAFT_BY_ID[p.specId];
                if (!spec) return null;
                const canReach = spec.rangeKm >= dist;
                const selected = selectedPlaneIds.includes(p.id);
                const planeMaxDaily = canReach
                  ? Math.max(1, Math.floor(
                      24 / ((dist / cruiseSpeedKmh(p.specId)) * 2 + 4),
                    ))
                  : 0;
                return (
                  <label
                    key={p.id}
                    className={cn(
                      "flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer",
                      selected
                        ? "border-primary bg-[rgba(20,53,94,0.04)]"
                        : canReach
                          ? "border-line hover:bg-surface-hover"
                          : "border-line opacity-60 cursor-not-allowed",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={!canReach}
                      onChange={(e) => {
                        if (e.target.checked)
                          setSelectedPlaneIds([...selectedPlaneIds, p.id]);
                        else
                          setSelectedPlaneIds(
                            selectedPlaneIds.filter((x) => x !== p.id),
                          );
                      }}
                      className="accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-ink text-[0.875rem]">{spec.name}</div>
                      <div className="text-[0.6875rem] text-ink-muted font-mono">
                        Range {spec.rangeKm.toLocaleString()} km · {spec.seats.first + spec.seats.business + spec.seats.economy} seats · {cruiseSpeedKmh(p.specId)} km/h cruise
                      </div>
                    </div>
                    {!canReach ? (
                      <Badge tone="negative">Out of range</Badge>
                    ) : (
                      <Badge tone="neutral">{planeMaxDaily * 7}/wk max</Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          {hasAircraft && scheduleNote && (
            <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-2">
              Schedule math: {Math.round(dist).toLocaleString()} km ÷ {scheduleNote.slowestSpeed} km/h
              + 2 × 2 hr turnaround = {scheduleNote.roundTripHrs.toFixed(1)} hr round-trip per
              aircraft · floor(24 / round-trip) × 7 days = <strong className="text-ink">{scheduleNote.perPlaneDaily * 7} flights/week per plane</strong>.
            </div>
          )}
        </Section>

        {/* Step 2 — Schedules per week (capped by aircraft physics) */}
        <Section step={2} title="Schedules per week" disabled={!hasAircraft}>
          {!hasAircraft ? (
            <div className="text-[0.75rem] text-ink-muted italic">
              Pick at least one aircraft above to set frequency.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={1}
                  max={Math.max(1, maxWeeklyFreq)}
                  value={weeklyFreq}
                  onChange={(e) => setWeeklyFreq(parseInt(e.target.value, 10))}
                  className="flex-1 accent-primary"
                  disabled={maxWeeklyFreq < 1}
                />
                <span className="tabular font-mono text-ink text-[0.9375rem] w-20 text-right">
                  {weeklyFreq}/wk
                </span>
              </div>
              <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-muted mt-1">
                <span>1/wk</span>
                <span>
                  Cap: <strong className="text-ink">{maxWeeklyFreq}/week</strong> with {selectedPlaneIds.length} aircraft
                </span>
                <span>{maxWeeklyFreq}/wk</span>
              </div>
            </>
          )}
        </Section>

        {/* Step 3 — Pricing (per-class sliders) */}
        {!isCargo && (
          <Section step={3} title="Per-class fares" disabled={!hasAircraft}>
            {!hasAircraft ? (
              <div className="text-[0.75rem] text-ink-muted italic">
                Cabin classes are determined by the aircraft you pick.
              </div>
            ) : (
              <>
                {/* Quick-preset tier strip — applies to all classes */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {(["budget", "standard", "premium", "ultra"] as PricingTier[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => applyTier(t)}
                      className={cn(
                        "rounded-md border px-2.5 py-1.5 text-[0.75rem] capitalize transition-colors",
                        tier === t
                          ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                          : "border-line text-ink-2 hover:bg-surface-hover",
                      )}
                    >
                      {t}
                      <div className="text-[0.5625rem] text-ink-muted">
                        {t === "budget" ? "0.7×" : t === "standard" ? "1.0×" : t === "premium" ? "1.3×" : "1.6×"} base
                      </div>
                    </button>
                  ))}
                </div>
                <div className="text-[0.625rem] text-ink-muted mb-2 leading-relaxed">
                  Tier preset scales all classes at once. Each slider below
                  can fine-tune one class against demand sensitivity.
                </div>

                {econRange && (
                  <FareSlider
                    label="Economy"
                    range={econRange}
                    value={econFare ?? econRange.base}
                    onChange={setEconFare}
                    onReset={() => setEconFare(null)}
                    isOverride={econFare !== null}
                  />
                )}
                {hasBusiness && busRange && (
                  <FareSlider
                    label="Business"
                    range={busRange}
                    value={busFare ?? busRange.base}
                    onChange={setBusFare}
                    onReset={() => setBusFare(null)}
                    isOverride={busFare !== null}
                  />
                )}
                {hasFirst && firstRange && (
                  <FareSlider
                    label="First"
                    range={firstRange}
                    value={firstFare ?? firstRange.base}
                    onChange={setFirstFare}
                    onReset={() => setFirstFare(null)}
                    isOverride={firstFare !== null}
                  />
                )}
                {!hasBusiness && !hasFirst && (
                  <div className="text-[0.6875rem] text-ink-muted italic">
                    Selected aircraft is all-economy — no business or first
                    class to price.
                  </div>
                )}
              </>
            )}
          </Section>
        )}

        {isCargo && (
          <Section step={3} title="Cargo" disabled={!hasAircraft}>
            <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[0.8125rem] text-ink-2">
              Cargo route · revenue based on minimum of origin/destination
              business demand as daily tonnes. Storage fees replace slot fees.
              Rate per tonne is auto-set based on distance (PRD §A4).
            </div>
          </Section>
        )}

        {/* Live projection */}
        {projection && (
          <div className={cn(
            "rounded-md border px-3 py-2.5 text-[0.8125rem]",
            projection.tone === "neg" && "border-negative bg-[var(--negative-soft)] text-negative",
            projection.tone === "warn" && "border-warning bg-[var(--warning-soft)] text-warning",
            projection.tone === "pos" && "border-positive bg-[var(--positive-soft)] text-positive",
          )}>
            <div className="font-semibold uppercase tracking-wider text-[0.6875rem] mb-0.5">
              Projected occupancy · {(projection.occupancy * 100).toFixed(0)}%
            </div>
            <div className="text-ink-2 text-[0.75rem]">
              Daily demand {Math.round(projection.demand)} pax vs capacity {projection.capacity} seats.
              {projection.tone === "neg" && " Route is unlikely to be profitable at this configuration."}
              {projection.tone === "warn" && " Consider lowering frequency or adjusting fares."}
              {projection.tone === "pos" && " Strong load factor."}
            </div>
          </div>
        )}

        {error && (
          <div className="text-negative text-[0.875rem] rounded-md border border-[var(--negative-soft)] bg-[var(--negative-soft)] px-3 py-2">
            {error}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!hasAircraft || weeklyFreq < 1}
          onClick={confirmRoute}
        >
          Open route →
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function Section({
  step, title, disabled = false, children,
}: {
  step: number;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn(disabled && "opacity-60")}>
      <div className="flex items-center gap-2 mb-2">
        <span
          className={cn(
            "inline-flex w-5 h-5 rounded-full items-center justify-center text-[0.625rem] font-semibold",
            disabled ? "bg-surface-2 text-ink-muted" : "bg-primary text-primary-fg",
          )}
        >
          {step}
        </span>
        <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold">
          {title}
        </span>
      </div>
      {children}
    </section>
  );
}

function FareSlider({
  label, range, value, onChange, onReset, isOverride,
}: {
  label: string;
  range: { min: number; base: number; max: number };
  value: number;
  onChange: (n: number) => void;
  onReset: () => void;
  isOverride: boolean;
}) {
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.75rem] text-ink-2 font-medium">{label}</span>
        <div className="flex items-center gap-2">
          <span className="tabular font-mono text-[0.8125rem] text-ink font-semibold">
            ${Math.round(value).toLocaleString()}
          </span>
          {isOverride && (
            <button
              onClick={onReset}
              className="text-[0.6875rem] text-ink-muted hover:text-ink underline"
            >
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={range.min}
        max={range.max}
        step={Math.max(1, Math.round((range.max - range.min) / 100))}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-[0.6875rem] text-ink-muted tabular">
        <span>${range.min.toLocaleString()}</span>
        <span>base ${range.base.toLocaleString()}</span>
        <span>${range.max.toLocaleString()}</span>
      </div>
    </div>
  );
}
