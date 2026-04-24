"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge, Button, Card, CardBody, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { classFareRange, distanceBetween } from "@/lib/engine";
import { CITIES_BY_CODE } from "@/data/cities";
import type { FleetAircraft, PricingTier } from "@/types/game";
import { cn } from "@/lib/cn";
import { fmtMoney } from "@/lib/format";

export interface RouteSetupModalProps {
  origin: string | null;
  dest: string | null;
  onClose: () => void;
}

/** Max daily frequency for a single route. Real-world airlines run 20+ rotations
 *  on the busiest corridors (JFK-LHR, DXB-LHR). We use 24. */
const MAX_FREQUENCY = 24;

export function RouteSetupModal({ origin, dest, onClose }: RouteSetupModalProps) {
  const s = useGame();
  const player = selectPlayer(s);
  const openRoute = useGame((g) => g.openRoute);

  const [freq, setFreq] = useState(2);
  const [tier, setTier] = useState<PricingTier>("standard");
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [econFare, setEconFare] = useState<number | null>(null);
  const [busFare, setBusFare] = useState<number | null>(null);
  const [firstFare, setFirstFare] = useState<number | null>(null);
  const [isCargo, setIsCargo] = useState(false);

  const isOpen = !!(origin && dest);

  // Reset + prefill when a new origin/dest pair arrives
  useEffect(() => {
    if (!isOpen || !player || !origin || !dest) return;
    const dist = distanceBetween(origin, dest);
    const idle = player.fleet.find(
      (f) =>
        f.status === "active" &&
        !f.routeId &&
        AIRCRAFT_BY_ID[f.specId] &&
        AIRCRAFT_BY_ID[f.specId].rangeKm >= dist,
    );
    setSelectedPlaneIds(idle ? [idle.id] : []);
    setFreq(2);
    setTier("standard");
    setEconFare(null);
    setBusFare(null);
    setFirstFare(null);
    setIsCargo(false);
    setError(null);
  }, [origin, dest, isOpen, player]);

  if (!player) return null;

  const dist = origin && dest ? distanceBetween(origin, dest) : 0;
  const idlePlanes = player.fleet.filter((f) => f.status === "active" && !f.routeId);
  const originCity = origin ? CITIES_BY_CODE[origin] : null;
  const destCity = dest ? CITIES_BY_CODE[dest] : null;

  function confirmRoute() {
    if (!origin || !dest) return;
    const r = openRoute({
      originCode: origin,
      destCode: dest,
      aircraftIds: selectedPlaneIds,
      dailyFrequency: freq,
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

  // Class availability from selected planes
  const hasFirst = useMemo(() => selectedPlaneIds.some((id) => {
    const p = player?.fleet.find((f) => f.id === id);
    const spec = p && AIRCRAFT_BY_ID[p.specId];
    return spec && spec.seats.first > 0;
  }), [selectedPlaneIds, player]);
  const hasBusiness = useMemo(() => selectedPlaneIds.some((id) => {
    const p = player?.fleet.find((f) => f.id === id);
    const spec = p && AIRCRAFT_BY_ID[p.specId];
    return spec && spec.seats.business > 0;
  }), [selectedPlaneIds, player]);
  const allCargo = useMemo(() => selectedPlaneIds.every((id) => {
    const p = player?.fleet.find((f) => f.id === id);
    const spec = p && AIRCRAFT_BY_ID[p.specId];
    return spec && spec.family === "cargo";
  }) && selectedPlaneIds.length > 0, [selectedPlaneIds, player]);
  const econRange = dest ? classFareRange(dist, "econ") : null;
  const busRange = dest ? classFareRange(dist, "bus") : null;
  const firstRange = dest ? classFareRange(dist, "first") : null;

  // Auto-enable cargo if all selected planes are cargo
  useEffect(() => {
    if (allCargo && !isCargo) setIsCargo(true);
    if (!allCargo && isCargo) setIsCargo(false);
  }, [allCargo]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={isOpen} onClose={onClose}>
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
      <ModalBody className="space-y-5">
        <div>
          <Label>Pricing tier</Label>
          <div className="grid grid-cols-4 gap-2">
            {(["budget", "standard", "premium", "ultra"] as PricingTier[]).map((t) => (
              <button
                key={t}
                onClick={() => setTier(t)}
                className={`rounded-md border px-3 py-2 text-[0.8125rem] capitalize transition-colors ${
                  tier === t
                    ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                    : "border-line text-ink-2 hover:bg-surface-hover"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <Label>Daily frequency</Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={MAX_FREQUENCY}
              value={freq}
              onChange={(e) => setFreq(parseInt(e.target.value, 10))}
              className="flex-1 accent-primary"
            />
            <span className="tabular font-mono text-ink text-[0.9375rem] w-16 text-right">
              {freq}/day
            </span>
          </div>
          <div className="text-[0.6875rem] text-ink-muted mt-1">
            Real-world trunks run up to ~20 daily each way (JFK–LHR, DXB–LHR).
          </div>
        </div>

        {/* Per-class fare sliders (passenger routes only) */}
        {!isCargo && selectedPlaneIds.length > 0 && econRange && (
          <div className="space-y-3">
            <Label>Seat-class fares (optional override)</Label>
            <FareSlider
              label="Economy"
              range={econRange}
              value={econFare ?? econRange.base}
              onChange={setEconFare}
              onReset={() => setEconFare(null)}
              isOverride={econFare !== null}
            />
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
          </div>
        )}

        {isCargo && (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-2 text-[0.8125rem] text-ink-2">
            Cargo route · revenue based on minimum of origin/destination business
            demand as daily tonnes. Storage fees replace slot fees.
          </div>
        )}

        <div>
          <Label>Assign aircraft (idle fleet)</Label>
          {idlePlanes.length === 0 ? (
            <Card>
              <CardBody className="text-[0.8125rem] text-ink-muted">
                No idle aircraft. Order or reassign in the Fleet panel.
              </CardBody>
            </Card>
          ) : (
            <div className="space-y-1.5 max-h-44 overflow-auto">
              {idlePlanes.map((p) => {
                const spec = AIRCRAFT_BY_ID[p.specId];
                if (!spec) return null;
                const canReach = spec.rangeKm >= dist;
                const selected = selectedPlaneIds.includes(p.id);
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
                        if (e.target.checked) setSelectedPlaneIds([...selectedPlaneIds, p.id]);
                        else setSelectedPlaneIds(selectedPlaneIds.filter((x) => x !== p.id));
                      }}
                      className="accent-primary"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-ink text-[0.875rem]">{spec.name}</div>
                      <div className="text-[0.6875rem] text-ink-muted font-mono">
                        Range {spec.rangeKm.toLocaleString()} km · {spec.seats.first + spec.seats.business + spec.seats.economy} seats
                      </div>
                    </div>
                    {!canReach && <Badge tone="negative">Out of range</Badge>}
                  </label>
                );
              })}
            </div>
          )}
        </div>

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
          disabled={selectedPlaneIds.length === 0}
          onClick={confirmRoute}
        >
          Open route →
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
      {children}
    </div>
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
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[0.75rem] text-ink-2">{label}</span>
        <div className="flex items-center gap-2">
          <span className="tabular font-mono text-[0.75rem] text-ink">
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
