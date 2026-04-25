"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Input, Modal, ModalBody, ModalFooter, ModalHeader, Button } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { classFareRange } from "@/lib/engine";
import type { PricingTier } from "@/types/game";
import { cn } from "@/lib/cn";
import { Pause, Play, X } from "lucide-react";

/**
 * Table-style route list (click a row to open a full detail modal) —
 * scales from a handful to dozens of routes while keeping overview clarity.
 */
export function RoutesPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const closeRoute = useGame((g) => g.closeRoute);
  const suspendRoute = useGame((g) => g.suspendRoute);
  const resumeRoute = useGame((g) => g.resumeRoute);

  const [query, setQuery] = useState("");
  const [activeRouteId, setActiveRouteId] = useState<string | null>(null);

  // If GameCanvas asked us to focus a specific route (because the player
  // clicked an existing route's endpoints on the map), auto-open it once.
  const focusedRouteId = useUi((u) => u.focusedRouteId);
  const setFocusedRouteId = useUi((u) => u.setFocusedRouteId);
  useEffect(() => {
    if (focusedRouteId) {
      setActiveRouteId(focusedRouteId);
      setFocusedRouteId(null);  // consume the signal
    }
  }, [focusedRouteId, setFocusedRouteId]);

  const rows = useMemo(() => {
    if (!player) return [];
    const q = query.trim().toUpperCase();
    return player.routes
      .filter((r) => r.status === "active" || r.status === "suspended")
      .filter((r) => {
        if (!q) return true;
        return (
          r.originCode.includes(q) ||
          r.destCode.includes(q) ||
          CITIES_BY_CODE[r.originCode]?.name.toUpperCase().includes(q) ||
          CITIES_BY_CODE[r.destCode]?.name.toUpperCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          b.quarterlyRevenue - b.quarterlyFuelCost - b.quarterlySlotCost -
          (a.quarterlyRevenue - a.quarterlyFuelCost - a.quarterlySlotCost),
      );
  }, [player, query]);

  if (!player) return null;

  const activeRoute = activeRouteId
    ? player.routes.find((r) => r.id === activeRouteId) ?? null
    : null;

  // Network-wide KPIs across active routes
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const totalQRev = activeRoutes.reduce((s, r) => s + r.quarterlyRevenue, 0);
  const totalQProfit = activeRoutes.reduce(
    (s, r) => s + r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost, 0,
  );
  const avgLoad = activeRoutes.length > 0
    ? activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) / activeRoutes.length
    : 0;
  const totalWeeklyFreq = activeRoutes.reduce((s, r) => s + r.dailyFrequency * 7, 0);
  const passengerRoutes = activeRoutes.filter((r) => !r.isCargo).length;
  const cargoRoutes = activeRoutes.filter((r) => r.isCargo).length;

  return (
    <div className="space-y-3">
      {/* Network KPIs */}
      <div className="grid grid-cols-4 gap-2">
        <KpiCard label="Active routes" value={`${activeRoutes.length}`} sub={`${passengerRoutes} pax · ${cargoRoutes} cargo`} />
        <KpiCard label="Avg load" value={fmtPct(avgLoad * 100, 0)} tone={avgLoad > 0.7 ? "positive" : avgLoad < 0.5 ? "negative" : "default"} />
        <KpiCard label="Weekly flights" value={`${totalWeeklyFreq}`} sub="across network" />
        <KpiCard
          label="Net profit/Q"
          value={fmtMoney(totalQProfit)}
          tone={totalQProfit >= 0 ? "positive" : "negative"}
          sub={`from ${fmtMoney(totalQRev)} rev`}
        />
      </div>

      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by code or city name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 h-9 text-[0.875rem]"
        />
        <div className="text-[0.75rem] text-ink-muted tabular shrink-0">
          {rows.length} of {player.routes.filter((r) => r.status !== "closed").length}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          {query
            ? "No routes match that search."
            : "No routes yet — click any city on the map to open one."}
        </div>
      ) : (
        <div className="rounded-md border border-line overflow-hidden">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <Th className="w-[30%]">Route</Th>
                <Th className="text-right">Load</Th>
                <Th className="text-right">Freq</Th>
                <Th className="text-right">Q revenue</Th>
                <Th className="text-right">Q profit</Th>
                <Th className="text-right w-[80px]">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const profit = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
                const origin = CITIES_BY_CODE[r.originCode];
                const dest = CITIES_BY_CODE[r.destCode];
                const suspended = r.status === "suspended";
                const losing = (r.consecutiveLosingQuarters ?? 0) >= 2;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setActiveRouteId(r.id)}
                    className={cn(
                      "border-b border-line last:border-0 cursor-pointer",
                      "hover:bg-surface-hover transition-colors",
                      suspended && "opacity-60",
                    )}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-ink font-medium">
                          {r.originCode} → {r.destCode}
                        </span>
                        {r.isCargo && (
                          <Badge tone="warning">Cargo</Badge>
                        )}
                        {losing && (
                          <Badge tone="negative">Review</Badge>
                        )}
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted truncate mt-0.5">
                        {origin?.name} · {dest?.name} · {Math.round(r.distanceKm).toLocaleString()} km
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span
                        className={cn(
                          "tabular font-mono",
                          r.avgOccupancy > 0.7
                            ? "text-positive"
                            : r.avgOccupancy > 0 && r.avgOccupancy < 0.5
                              ? "text-negative"
                              : "text-ink",
                        )}
                      >
                        {fmtPct(r.avgOccupancy * 100, 0)}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-mono text-ink">
                      {r.dailyFrequency * 7}/wk
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-mono text-ink">
                      {fmtMoney(r.quarterlyRevenue)}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 px-3 text-right tabular font-mono font-medium",
                        profit >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {fmtMoney(profit)}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {suspended ? (
                        <Badge tone="warning">Suspended</Badge>
                      ) : (
                        <Badge tone="positive">Active</Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {activeRoute && (
        <RouteDetailModal
          open={true}
          route={activeRoute}
          onClose={() => setActiveRouteId(null)}
          onSuspend={() => {
            suspendRoute(activeRoute.id);
            setActiveRouteId(null);
          }}
          onResume={() => {
            resumeRoute(activeRoute.id);
          }}
          onClose_close={() => {
            if (confirm("Close this route permanently? Slots may be forfeited.")) {
              closeRoute(activeRoute.id);
              setActiveRouteId(null);
            }
          }}
        />
      )}
    </div>
  );
}

function KpiCard({
  label, value, sub, tone = "default",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "default" | "positive" | "negative";
}) {
  const valueColor =
    tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface px-2.5 py-2">
      <div className="text-[0.5625rem] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`tabular font-display text-[1rem] leading-tight mt-0.5 ${valueColor}`}>
        {value}
      </div>
      {sub && (
        <div className="text-[0.5625rem] text-ink-muted truncate mt-0.5">{sub}</div>
      )}
    </div>
  );
}

function Th({
  children, className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-left px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted",
        className,
      )}
    >
      {children}
    </th>
  );
}

// ─── Detail modal with edit ────────────────────────────────────────

function RouteDetailModal({
  open, route, onClose, onSuspend, onResume, onClose_close,
}: {
  open: boolean;
  route: ReturnType<typeof selectPlayer> extends null ? never : NonNullable<ReturnType<typeof selectPlayer>>["routes"][number];
  onClose: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onClose_close: () => void;
}) {
  const s = useGame();
  const player = selectPlayer(s);
  const updateRoute = useGame((g) => g.updateRoute);

  // UI works in WEEKLY frequency (engine still stores dailyFrequency).
  const [weeklyFreq, setWeeklyFreq] = useState<number>(route.dailyFrequency * 7);
  const [tier, setTier] = useState<PricingTier>(route.pricingTier);
  const [econFare, setEconFare] = useState<number | null>(route.econFare ?? null);
  const [busFare, setBusFare] = useState<number | null>(route.busFare ?? null);
  const [firstFare, setFirstFare] = useState<number | null>(route.firstFare ?? null);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>(route.aircraftIds);
  const [error, setError] = useState<string | null>(null);

  if (!player) return null;

  // Auto-clamp weeklyFreq when aircraft selection changes — fewer planes
  // means a lower physics cap, and the slider/value MUST drop to match.
  // PRD update: removing an aircraft from a route should automatically
  // reduce capacity.
  const clampSpecIds = selectedPlaneIds
    .map((id) => player.fleet.find((f) => f.id === id)?.specId)
    .filter((x): x is string => !!x);
  const clampMaxDaily = clampSpecIds.length > 0
    ? Math.max(1, Math.floor(clampSpecIds.reduce((sum, id) => {
        const oneWayHrs = route.distanceKm / (
          /^A319|^A320|^A321|^B737/.test(id) ? 840 :
          /^B757|^B767|^A330/.test(id) ? 870 : 900);
        return sum + Math.max(1, Math.floor(24 / (oneWayHrs * 2 + 4))) * 7;
      }, 0) / 7))
    : 0;
  const clampMaxWeekly = clampMaxDaily * 7;
  useEffect(() => {
    if (clampMaxWeekly === 0 && weeklyFreq !== 0) {
      setWeeklyFreq(0);
    } else if (clampMaxWeekly > 0 && weeklyFreq > clampMaxWeekly) {
      setWeeklyFreq(clampMaxWeekly);
    }
  }, [clampMaxWeekly, weeklyFreq]);

  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  const profit = route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost;
  const econRange = classFareRange(route.distanceKm, "econ");
  const busRange = classFareRange(route.distanceKm, "bus");
  const firstRange = classFareRange(route.distanceKm, "first");

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

  const idleOrOnRoute = player.fleet.filter(
    (f) => f.status === "active" && (!f.routeId || f.routeId === route.id),
  );

  function save() {
    const r = updateRoute(route.id, {
      aircraftIds: selectedPlaneIds,
      // Convert weekly UI back to daily for engine. Round to nearest int.
      dailyFrequency: Math.max(1, Math.round(weeklyFreq / 7)),
      pricingTier: tier,
      econFare,
      busFare,
      firstFare,
    });
    if (!r.ok) {
      setError(r.error ?? "Failed to save");
      return;
    }
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} className="w-[min(780px,calc(100vw-3rem))]">
      <ModalHeader>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge tone={route.status === "suspended" ? "warning" : "positive"}>
            {route.status === "suspended" ? "Suspended" : "Active"}
          </Badge>
          {route.isCargo && <Badge tone="warning">Cargo</Badge>}
        </div>
        <h2 className="font-display text-[1.5rem] text-ink leading-tight">
          {route.originCode} → {route.destCode}
        </h2>
        <div className="text-ink-muted text-[0.8125rem] mt-1">
          {origin?.name} → {dest?.name} · {Math.round(route.distanceKm).toLocaleString()} km ·
          Opened Q{route.openQuarter}
          {(route.consecutiveQuartersActive ?? 0) >= 4 && (
            <span className="ml-2 text-positive">(Established route bonus)</span>
          )}
        </div>
      </ModalHeader>
      <ModalBody className="space-y-5 max-h-[60vh] overflow-auto">
        {/* Performance snapshot */}
        <div className="grid grid-cols-4 gap-3">
          <MiniStat label="Load" value={fmtPct(route.avgOccupancy * 100, 0)}
            tone={route.avgOccupancy > 0.7 ? "pos" : route.avgOccupancy > 0 && route.avgOccupancy < 0.5 ? "neg" : undefined} />
          <MiniStat label="Q revenue" value={fmtMoney(route.quarterlyRevenue)} />
          <MiniStat label="Q costs" value={fmtMoney(route.quarterlyFuelCost + route.quarterlySlotCost)} tone="neg" />
          <MiniStat label="Q profit" value={fmtMoney(profit)} tone={profit >= 0 ? "pos" : "neg"} />
        </div>

        {/* Why this performance — multipliers breakdown */}
        <DemandBreakdown route={route} player={player} />

        {/* Competitors on this OD pair */}
        <CompetitorsTable route={route} />

        {/* Pricing tier — quick preset that scales every per-class fare. */}
        <div>
          <Label>Pricing tier</Label>
          <div className="grid grid-cols-4 gap-2">
            {(["budget", "standard", "premium", "ultra"] as PricingTier[]).map((t) => {
              const mult = t === "budget" ? "0.7×"
                : t === "standard" ? "1.0×"
                : t === "premium" ? "1.3×" : "1.6×";
              return (
                <button
                  key={t}
                  onClick={() => setTier(t)}
                  className={cn(
                    "rounded-md border px-3 py-2 capitalize transition-colors flex flex-col items-center gap-0.5",
                    tier === t
                      ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-semibold"
                      : "border-line text-ink-2 hover:bg-surface-hover",
                  )}
                >
                  <span className="text-[0.8125rem]">{t}</span>
                  <span className="text-[0.625rem] tabular font-mono text-ink-muted">
                    {mult} base
                  </span>
                </button>
              );
            })}
          </div>
          <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-1.5">
            Quick preset that multiplies every per-class fare against a tier
            multiplier. Budget is 30% under base for high-volume capture;
            Ultra is 60% above for premium positioning. Per-class sliders
            below override individual cabin fares; the tier just sets the
            starting point.
          </div>
        </div>

        {/* Frequency — weekly with engine-derived cap */}
        <div>
          <Label>Schedules per week</Label>
          {(() => {
            const specIds = selectedPlaneIds
              .map((id) => player.fleet.find((f) => f.id === id)?.specId)
              .filter((x): x is string => !!x);
            const maxDaily = specIds.length > 0
              ? Math.max(1, Math.floor(specIds.reduce((sum, id) => {
                  const oneWayHrs = route.distanceKm / (
                    /^A319|^A320|^A321|^B737/.test(id) ? 840 :
                    /^B757|^B767|^A330/.test(id) ? 870 : 900);
                  const dailyPerPlane = Math.max(1, Math.floor(24 / (oneWayHrs * 2 + 4)));
                  return sum + dailyPerPlane * 7;
                }, 0) / 7))
              : 1;
            const maxWeekly = maxDaily * 7;
            return (
              <>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={maxWeekly}
                    value={Math.min(weeklyFreq, maxWeekly)}
                    onChange={(e) => setWeeklyFreq(parseInt(e.target.value, 10))}
                    className="flex-1 accent-primary"
                  />
                  <span className="tabular font-mono text-ink text-[0.9375rem] w-20 text-right">
                    {weeklyFreq}/wk
                  </span>
                </div>
                <div className="text-[0.6875rem] text-ink-muted mt-1">
                  Cap with this aircraft set: <strong className="text-ink">{maxWeekly}/week</strong>
                </div>
              </>
            );
          })()}
        </div>

        {/* Per-class fares (passenger only) */}
        {!route.isCargo && (
          <div className="space-y-3">
            <Label>Per-class fares (optional override)</Label>
            <FareRow label="Economy" range={econRange} fare={econFare} setFare={setEconFare} active />
            <FareRow label="Business" range={busRange} fare={busFare} setFare={setBusFare} active={hasBus} />
            <FareRow label="First" range={firstRange} fare={firstFare} setFare={setFirstFare} active={hasFirst} />
          </div>
        )}

        {/* Aircraft assignment */}
        <div>
          <Label>Aircraft assigned</Label>
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {idleOrOnRoute.map((p) => {
              const spec = AIRCRAFT_BY_ID[p.specId];
              if (!spec) return null;
              const canReach = spec.rangeKm >= route.distanceKm;
              const cargoMatch = route.isCargo ? spec.family === "cargo" : spec.family === "passenger";
              const selected = selectedPlaneIds.includes(p.id);
              const disabled = !canReach || !cargoMatch;
              return (
                <label
                  key={p.id}
                  className={cn(
                    "flex items-center gap-3 rounded-md border px-3 py-2 cursor-pointer",
                    selected
                      ? "border-primary bg-[rgba(20,53,94,0.04)]"
                      : disabled
                        ? "border-line opacity-50 cursor-not-allowed"
                        : "border-line hover:bg-surface-hover",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={disabled}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPlaneIds([...selectedPlaneIds, p.id]);
                      else setSelectedPlaneIds(selectedPlaneIds.filter((x) => x !== p.id));
                    }}
                    className="accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-ink text-[0.875rem]">{spec.name}</div>
                    <div className="text-[0.6875rem] text-ink-muted font-mono">
                      Range {spec.rangeKm.toLocaleString()} km ·
                      {spec.family === "passenger"
                        ? ` ${spec.seats.first + spec.seats.business + spec.seats.economy} seats`
                        : ` ${spec.cargoTonnes ?? 0}T cargo`}
                    </div>
                  </div>
                  {!canReach && <Badge tone="negative">Out of range</Badge>}
                  {canReach && !cargoMatch && <Badge tone="warning">{route.isCargo ? "Passenger plane" : "Cargo plane"}</Badge>}
                </label>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="text-negative text-[0.875rem] rounded-md border border-[var(--negative-soft)] bg-[var(--negative-soft)] px-3 py-2">
            {error}
          </div>
        )}
      </ModalBody>
      <ModalFooter className="justify-between">
        <div className="flex items-center gap-2">
          {route.status === "active" ? (
            <Button variant="secondary" size="sm" onClick={onSuspend}>
              <Pause size={13} className="mr-1.5" /> Suspend
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onResume}>
              <Play size={13} className="mr-1.5" /> Resume
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={onClose_close}>
            <X size={13} className="mr-1.5" /> Close route
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save changes</Button>
        </div>
      </ModalFooter>
    </Modal>
  );
}

function CompetitorsTable({
  route,
}: {
  route: NonNullable<ReturnType<typeof selectPlayer>>["routes"][number];
}) {
  const teams = useGame((state) => state.teams);
  const player = useGame(selectPlayer);
  if (!player) return null;
  // Find rivals flying the same OD pair (either direction)
  const rivals = teams
    .filter((t) => !t.isPlayer)
    .map((rv) => {
      const matchingRoute = rv.routes.find(
        (r) =>
          r.status === "active" &&
          ((r.originCode === route.originCode && r.destCode === route.destCode) ||
            (r.originCode === route.destCode && r.destCode === route.originCode)),
      );
      return matchingRoute ? { team: rv, route: matchingRoute } : null;
    })
    .filter((x): x is { team: typeof teams[0]; route: typeof route } => !!x);

  return (
    <details className="rounded-md border border-line">
      <summary className="px-3 py-2 cursor-pointer text-[0.625rem] uppercase tracking-wider font-semibold text-ink-2 hover:bg-surface-hover flex items-center justify-between">
        <span>Competitors on this route</span>
        <span className="tabular text-ink-muted">
          {rivals.length === 0 ? "Uncontested" : `${rivals.length} airline${rivals.length > 1 ? "s" : ""}`}
        </span>
      </summary>
      {rivals.length === 0 ? (
        <div className="p-3 text-[0.75rem] text-ink-muted leading-relaxed border-t border-line">
          No other airlines fly this OD pair right now. You have first-mover
          advantage on demand capture.
        </div>
      ) : (
        <table className="w-full text-[0.75rem] border-t border-line">
          <thead>
            <tr className="bg-surface-2">
              <th className="text-left px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Airline</th>
              <th className="text-left px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Aircraft</th>
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Sch/wk</th>
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Tier</th>
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Load</th>
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Q profit</th>
            </tr>
          </thead>
          <tbody>
            {/* Always include the player's own row at the top for comparison */}
            <tr className="border-t border-line bg-[var(--accent-soft)]/30">
              <td className="px-2 py-1.5">
                <span
                  className="inline-block w-4 h-4 rounded-sm align-middle mr-1.5"
                  style={{ background: player.color }}
                />
                <span className="font-semibold text-ink">{player.name}</span>
                <span className="ml-1 text-[0.6875rem] text-accent uppercase tracking-wider font-bold">YOU</span>
              </td>
              <td className="px-2 py-1.5 font-mono text-ink-2">
                {(() => {
                  const planeId = route.aircraftIds[0];
                  const plane = planeId ? player.fleet.find((f) => f.id === planeId) : undefined;
                  return plane ? plane.specId : "—";
                })()}
              </td>
              <td className="px-2 py-1.5 text-right tabular font-mono text-ink">{route.dailyFrequency * 7}</td>
              <td className="px-2 py-1.5 text-right text-[0.6875rem] capitalize">{route.pricingTier}</td>
              <td className={cn(
                "px-2 py-1.5 text-right tabular font-mono",
                route.avgOccupancy > 0.7 ? "text-positive" :
                route.avgOccupancy > 0 && route.avgOccupancy < 0.5 ? "text-negative" : "text-ink",
              )}>
                {fmtPct(route.avgOccupancy * 100, 0)}
              </td>
              <td className={cn(
                "px-2 py-1.5 text-right tabular font-mono font-medium",
                (route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost) >= 0 ? "text-positive" : "text-negative",
              )}>
                {fmtMoney(route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost)}
              </td>
            </tr>
            {rivals.map(({ team, route: r }) => {
              const planeId = r.aircraftIds[0];
              const plane = planeId ? team.fleet.find((f) => f.id === planeId) : undefined;
              const profit = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
              return (
                <tr key={team.id} className="border-t border-line">
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-block w-4 h-4 rounded-sm align-middle mr-1.5"
                      style={{ background: team.color }}
                    />
                    <span className="text-ink-2 truncate">{team.name}</span>
                  </td>
                  <td className="px-2 py-1.5 font-mono text-ink-muted">{plane?.specId ?? "—"}</td>
                  <td className="px-2 py-1.5 text-right tabular font-mono text-ink-2">{r.dailyFrequency * 7}</td>
                  <td className="px-2 py-1.5 text-right text-[0.6875rem] capitalize text-ink-muted">{r.pricingTier}</td>
                  <td className={cn(
                    "px-2 py-1.5 text-right tabular font-mono",
                    r.avgOccupancy > 0.7 ? "text-positive" :
                    r.avgOccupancy > 0 && r.avgOccupancy < 0.5 ? "text-negative" : "text-ink-2",
                  )}>
                    {fmtPct(r.avgOccupancy * 100, 0)}
                  </td>
                  <td className={cn(
                    "px-2 py-1.5 text-right tabular font-mono",
                    profit >= 0 ? "text-positive" : "text-negative",
                  )}>
                    {fmtMoney(profit)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </details>
  );
}

function DemandBreakdown({
  route, player,
}: {
  route: NonNullable<ReturnType<typeof selectPlayer>>["routes"][number];
  player: NonNullable<ReturnType<typeof selectPlayer>>;
}) {
  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  if (!origin || !dest) return null;
  const isHub = route.originCode === player.hubCode || route.destCode === player.hubCode;
  const isSecondary =
    player.secondaryHubCodes.includes(route.originCode) ||
    player.secondaryHubCodes.includes(route.destCode);
  const hubMultiplier = isHub ? 1.18 : isSecondary ? 1.10 : 1.0;
  const csLevel = player.sliders.customerService ?? 2;
  const csMultiplier = [0.92, 0.96, 1.0, 1.03, 1.06, 1.10][csLevel] ?? 1.0;
  const hasLounge =
    player.hubInvestments?.premiumLoungeHubs?.includes(route.originCode) ||
    player.hubInvestments?.premiumLoungeHubs?.includes(route.destCode);
  const loungeBonus = hasLounge ? 1.04 : 1.0;
  const hasFuelTank = player.hubInvestments?.fuelReserveTankHubs?.includes(route.originCode);

  // Onboarding bonus — same logic as engine
  let onboardingBonus = 1.0;
  if (player.marketFocus === "passenger" && !route.isCargo) onboardingBonus *= 1.05;
  if (player.marketFocus === "cargo" && route.isCargo) onboardingBonus *= 1.15;
  const geoMatch =
    player.geographicPriority === "global" ||
    (player.geographicPriority === "north-america" && origin.region === "na" && dest.region === "na") ||
    (player.geographicPriority === "europe" && origin.region === "eu" && dest.region === "eu") ||
    (player.geographicPriority === "asia-pacific" && (origin.region === "as" || origin.region === "oc") && (dest.region === "as" || dest.region === "oc")) ||
    (player.geographicPriority === "middle-east" && (origin.region === "me" || origin.region === "mea") && (dest.region === "me" || dest.region === "mea"));
  if (geoMatch && player.geographicPriority !== "global") onboardingBonus *= 1.08;
  if (player.csrTheme === "community" && origin.tier >= 2 && dest.tier >= 2) onboardingBonus *= 1.03;

  const rows: Array<{ label: string; mult: number; tone: "pos" | "neg" | "neutral" }> = [
    { label: `Hub bonus${isHub ? "" : isSecondary ? " (secondary)" : " (none)"}`, mult: hubMultiplier, tone: hubMultiplier > 1 ? "pos" : "neutral" },
    { label: `Customer Service · L${csLevel}`, mult: csMultiplier, tone: csMultiplier > 1 ? "pos" : csMultiplier < 1 ? "neg" : "neutral" },
    { label: hasLounge ? "Premium lounge at hub" : "No lounge at endpoints", mult: loungeBonus, tone: loungeBonus > 1 ? "pos" : "neutral" },
    { label: "Doctrine + geography fit", mult: onboardingBonus, tone: onboardingBonus > 1 ? "pos" : "neutral" },
  ];
  const compound = rows.reduce((m, r) => m * r.mult, 1);

  return (
    <details className="rounded-md border border-line">
      <summary className="px-3 py-2 cursor-pointer text-[0.625rem] uppercase tracking-wider font-semibold text-ink-2 hover:bg-surface-hover flex items-center justify-between">
        <span>Demand multipliers · why this route performs</span>
        <span className={`tabular font-mono ${compound > 1 ? "text-positive" : compound < 1 ? "text-negative" : "text-ink"}`}>
          ×{compound.toFixed(2)}
        </span>
      </summary>
      <div className="p-3 space-y-1.5 border-t border-line">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between text-[0.75rem]">
            <span className="text-ink-2">{r.label}</span>
            <span className={`tabular font-mono ${
              r.tone === "pos" ? "text-positive" :
              r.tone === "neg" ? "text-negative" : "text-ink-muted"
            }`}>
              ×{r.mult.toFixed(2)}
            </span>
          </div>
        ))}
        {hasFuelTank && (
          <div className="flex items-baseline justify-between text-[0.75rem] pt-1.5 border-t border-line">
            <span className="text-ink-2">Fuel reserve tank discount</span>
            <span className="tabular font-mono text-positive">−5% fuel</span>
          </div>
        )}
        <div className="text-[0.6875rem] text-ink-muted leading-relaxed pt-1.5 border-t border-line">
          The compounded multiplier scales the base origin↔destination demand
          before capacity is applied. A multiplier of ×1.20 means demand is
          20% higher than a vanilla version of this same route.
        </div>
      </div>
    </details>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
      {children}
    </div>
  );
}

function MiniStat({
  label, value, tone,
}: {
  label: string; value: string; tone?: "pos" | "neg";
}) {
  return (
    <div className="rounded-md border border-line bg-surface-2 p-2.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div
        className={cn(
          "tabular font-display text-[1rem] mt-0.5 leading-none",
          tone === "pos" ? "text-positive" : tone === "neg" ? "text-negative" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function FareRow({
  label, range, fare, setFare, active,
}: {
  label: string;
  range: { min: number; base: number; max: number };
  fare: number | null;
  setFare: (v: number | null) => void;
  active: boolean;
}) {
  const v = fare ?? range.base;
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2",
        active ? "border-line" : "border-line opacity-50",
      )}
    >
      <span className="w-20 text-[0.8125rem] text-ink">{label}</span>
      <input
        type="range"
        min={range.min}
        max={range.max}
        value={v}
        disabled={!active}
        onChange={(e) => setFare(parseInt(e.target.value, 10))}
        className="flex-1 accent-primary"
      />
      <span className="tabular font-mono text-ink text-[0.8125rem] w-16 text-right">
        ${v}
      </span>
    </div>
  );
}
