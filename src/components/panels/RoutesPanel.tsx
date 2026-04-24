"use client";

import { useState } from "react";
import { Badge, Button } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct } from "@/lib/format";
import { CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { classFareRange } from "@/lib/engine";
import type { PricingTier } from "@/types/game";
import { cn } from "@/lib/cn";
import { Pencil, X } from "lucide-react";

export function RoutesPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const closeRoute = useGame((g) => g.closeRoute);
  const [editingId, setEditingId] = useState<string | null>(null);
  if (!player) return null;

  const active = player.routes.filter((r) => r.status === "active");

  return (
    <div className="space-y-3">
      <div className="text-[0.8125rem] text-ink-2">
        {active.length} routes flying · click a city on the map to open a new route
      </div>
      {active.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          No routes yet. Pick an origin and destination from the globe.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((r) => {
            const origin = CITIES_BY_CODE[r.originCode];
            const dest = CITIES_BY_CODE[r.destCode];
            const profit = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
            const specs = r.aircraftIds
              .map((id) => player.fleet.find((f) => f.id === id))
              .map((p) => p && AIRCRAFT_BY_ID[p.specId]?.name)
              .filter(Boolean)
              .join(", ");
            const editing = editingId === r.id;
            return (
              <div key={r.id} className="rounded-md border border-line bg-surface">
                <div className="p-3">
                  <div className="flex items-start justify-between mb-2 gap-2">
                    <div className="min-w-0">
                      <div className="font-mono text-ink font-medium">
                        {r.originCode} → {r.destCode}
                        {r.isCargo && <Badge tone="warning" className="ml-2">Cargo</Badge>}
                      </div>
                      <div className="text-[0.75rem] text-ink-muted tabular mt-0.5">
                        {origin?.name} · {dest?.name} · {Math.round(r.distanceKm).toLocaleString()} km
                      </div>
                    </div>
                    <Badge
                      tone={r.avgOccupancy > 0.7 ? "positive" : r.avgOccupancy < 0.5 && r.avgOccupancy > 0 ? "negative" : "neutral"}
                    >
                      {fmtPct(r.avgOccupancy * 100, 0)} load
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.75rem]">
                    <span className="text-ink-muted">Aircraft</span>
                    <span className="text-right text-ink-2 truncate">{specs || "—"}</span>
                    <span className="text-ink-muted">Frequency</span>
                    <span className="text-right tabular font-mono text-ink">{r.dailyFrequency}/day</span>
                    <span className="text-ink-muted">Pricing</span>
                    <span className="text-right text-ink capitalize">{r.pricingTier}</span>
                    <span className="text-ink-muted">Q revenue</span>
                    <span className="text-right tabular font-mono text-ink">{fmtMoney(r.quarterlyRevenue)}</span>
                    <span className="text-ink-muted">Q profit</span>
                    <span className={`text-right tabular font-mono font-medium ${profit >= 0 ? "text-positive" : "text-negative"}`}>
                      {fmtMoney(profit)}
                    </span>
                  </div>
                  <div className="flex justify-between mt-2 pt-2 border-t border-line">
                    <button
                      className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-2 hover:text-ink"
                      onClick={() => setEditingId(editing ? null : r.id)}
                    >
                      {editing ? <X size={13} /> : <Pencil size={13} />}
                      {editing ? "Close edit" : "Edit"}
                    </button>
                    <button
                      className="text-[0.75rem] text-negative hover:underline"
                      onClick={() => { if (confirm("Close this route?")) closeRoute(r.id); }}
                    >
                      Close route
                    </button>
                  </div>
                </div>

                {editing && (
                  <RouteEditor routeId={r.id} onDone={() => setEditingId(null)} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RouteEditor({ routeId, onDone }: { routeId: string; onDone: () => void }) {
  const s = useGame();
  const player = selectPlayer(s);
  const updateRoute = useGame((g) => g.updateRoute);
  const r = player?.routes.find((x) => x.id === routeId);
  const [freq, setFreq] = useState<number>(r?.dailyFrequency ?? 2);
  const [tier, setTier] = useState<PricingTier>(r?.pricingTier ?? "standard");
  const [econFare, setEconFare] = useState<number | null>(r?.econFare ?? null);
  const [busFare, setBusFare] = useState<number | null>(r?.busFare ?? null);
  const [firstFare, setFirstFare] = useState<number | null>(r?.firstFare ?? null);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>(r?.aircraftIds ?? []);
  const [error, setError] = useState<string | null>(null);

  if (!player || !r) return null;

  const econRange = classFareRange(r.distanceKm, "econ");
  const busRange = classFareRange(r.distanceKm, "bus");
  const firstRange = classFareRange(r.distanceKm, "first");

  const hasBus = selectedPlaneIds.some((id) => {
    const p = player.fleet.find((f) => f.id === id);
    const spec = p && AIRCRAFT_BY_ID[p.specId];
    return spec && spec.seats.business > 0;
  });
  const hasFirst = selectedPlaneIds.some((id) => {
    const p = player.fleet.find((f) => f.id === id);
    const spec = p && AIRCRAFT_BY_ID[p.specId];
    return spec && spec.seats.first > 0;
  });

  const assignable = player.fleet.filter(
    (f) => f.status === "active" && (!f.routeId || f.routeId === routeId),
  );

  function save() {
    const result = updateRoute(routeId, {
      dailyFrequency: freq,
      pricingTier: tier,
      econFare,
      busFare,
      firstFare,
      aircraftIds: selectedPlaneIds,
    });
    if (!result.ok) setError(result.error ?? "Failed");
    else { setError(null); onDone(); }
  }

  return (
    <div className="border-t border-line bg-surface-2/60 p-3 space-y-3">
      {/* Pricing tier */}
      <div>
        <Label>Pricing tier</Label>
        <div className="grid grid-cols-4 gap-1.5">
          {(["budget", "standard", "premium", "ultra"] as PricingTier[]).map((t) => (
            <button
              key={t}
              onClick={() => setTier(t)}
              className={cn(
                "rounded-md border px-2 py-1.5 text-[0.75rem] capitalize transition-colors",
                tier === t
                  ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                  : "border-line text-ink-2 hover:bg-surface-hover",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div>
        <Label>Daily frequency</Label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={1}
            max={24}
            value={freq}
            onChange={(e) => setFreq(parseInt(e.target.value, 10))}
            className="flex-1 accent-primary"
          />
          <span className="tabular font-mono text-[0.875rem] w-14 text-right text-ink">
            {freq}/day
          </span>
        </div>
      </div>

      {/* Fare sliders (passenger only) */}
      {!r.isCargo && (
        <div className="space-y-2">
          <Label>Seat-class fares</Label>
          <FareRow
            label="Economy" range={econRange}
            value={econFare ?? econRange.base}
            onChange={setEconFare} onReset={() => setEconFare(null)}
            override={econFare !== null}
          />
          {hasBus && (
            <FareRow
              label="Business" range={busRange}
              value={busFare ?? busRange.base}
              onChange={setBusFare} onReset={() => setBusFare(null)}
              override={busFare !== null}
            />
          )}
          {hasFirst && (
            <FareRow
              label="First" range={firstRange}
              value={firstFare ?? firstRange.base}
              onChange={setFirstFare} onReset={() => setFirstFare(null)}
              override={firstFare !== null}
            />
          )}
        </div>
      )}

      {/* Aircraft assignment */}
      <div>
        <Label>Assigned aircraft</Label>
        <div className="space-y-1 max-h-40 overflow-auto">
          {assignable.length === 0 ? (
            <div className="text-[0.75rem] text-ink-muted">No other aircraft available to swap in.</div>
          ) : (
            assignable.map((p) => {
              const spec = AIRCRAFT_BY_ID[p.specId];
              if (!spec) return null;
              const canReach = spec.rangeKm >= r.distanceKm;
              const selected = selectedPlaneIds.includes(p.id);
              return (
                <label key={p.id} className={cn(
                  "flex items-center gap-2 rounded-md border px-2 py-1.5 cursor-pointer text-[0.8125rem]",
                  selected ? "border-primary bg-[rgba(20,53,94,0.04)]"
                    : canReach ? "border-line hover:bg-surface-hover"
                    : "border-line opacity-50 cursor-not-allowed",
                )}>
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
                  <span className="flex-1 truncate text-ink">{spec.name}</span>
                  {!canReach && <span className="text-[0.625rem] text-negative">Out of range</span>}
                </label>
              );
            })
          )}
        </div>
      </div>

      {error && <div className="text-[0.8125rem] text-negative">{error}</div>}

      <div className="flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onDone}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={save} disabled={selectedPlaneIds.length === 0}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1.5">{children}</div>
  );
}

function FareRow({ label, range, value, onChange, onReset, override }: {
  label: string;
  range: { min: number; base: number; max: number };
  value: number;
  onChange: (n: number) => void;
  onReset: () => void;
  override: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[0.75rem] text-ink-2">{label}</span>
        <div className="flex items-center gap-2">
          <span className="tabular font-mono text-[0.75rem] text-ink">
            ${Math.round(value).toLocaleString()}
          </span>
          {override && (
            <button onClick={onReset} className="text-[0.625rem] text-ink-muted hover:text-ink underline">
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
    </div>
  );
}
