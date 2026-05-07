"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { AircraftMarketModal } from "@/components/game/AircraftMarketModal";
import { PurchaseOrderModal } from "@/components/game/PurchaseOrderModal";
import { useGame, selectPlayer } from "@/store/game";
import { toast } from "@/store/toasts";
import { fmtMoney, fmtPct, fmtAgeYQ, fmtQuarter } from "@/lib/format";
import { planeImagePath } from "@/lib/aircraft-images";
import { cn } from "@/lib/cn";
import { Plane, AlertTriangle, Clock, X } from "lucide-react";
import { discontinuedMaintenanceBracket } from "@/lib/engine";
import {
  effectiveProductionCap,
  estimatedDeliveryQuarter,
  queuePosition,
} from "@/lib/pre-orders";
import { engineUpgradeCostUsd, fuselageUpgradeCostUsd } from "@/lib/aircraft-upgrades";
import { PREORDER_CANCEL_PENALTY_PCT } from "@/lib/pre-orders";

/** Group aircraft by spec id, count quantity, and aggregate utilisation. */
function groupByType(
  player: ReturnType<typeof selectPlayer>,
  currentQuarter: number,
) {
  if (!player) return [];
  const map: Record<string, {
    specId: string;
    total: number;
    active: number;
    ordered: number;
    grounded: number;
    retired: number;
    onRoutes: number;        // # planes assigned to a route
    aging: number;           // active planes with ≤4Q retirement runway
    bookValue: number;       // sum
    avgAgeQ: number;         // average plane age in quarters
    quarterlyProfit: number; // sum of profit across routes carrying these planes
  }> = {};

  // Cache route profits by id
  const routeProfit: Record<string, number> = {};
  for (const r of player.routes) {
    routeProfit[r.id] = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
  }

  for (const f of player.fleet) {
    if (!map[f.specId]) {
      map[f.specId] = {
        specId: f.specId, total: 0, active: 0, ordered: 0, grounded: 0, retired: 0,
        onRoutes: 0, aging: 0, bookValue: 0, avgAgeQ: 0, quarterlyProfit: 0,
      };
    }
    const g = map[f.specId];
    g.total += 1;
    g.bookValue += f.bookValue ?? 0;
    if (f.routeId) {
      g.onRoutes += 1;
      g.quarterlyProfit += (routeProfit[f.routeId] ?? 0)
        / Math.max(1, player.fleet.filter((x) => x.routeId === f.routeId).length);
    }
    if (f.status === "active") {
      g.active += 1;
      // Aging = active and within 4 quarters of mandatory retirement.
      // Same threshold the top-of-panel "Aging" card uses so the
      // numbers reconcile.
      const q = (f.retirementQuarter ?? 0) - currentQuarter;
      if (q > 0 && q <= 4) g.aging += 1;
    }
    else if (f.status === "ordered") g.ordered += 1;
    else if (f.status === "grounded") g.grounded += 1;
    else if (f.status === "retired") g.retired += 1;
    g.avgAgeQ += f.purchaseQuarter;
  }
  // Convert avgAgeQ from sum-of-purchase-quarters to mean
  for (const g of Object.values(map)) {
    g.avgAgeQ = g.avgAgeQ / g.total; // this is actually "avg purchase quarter"
  }
  return Object.values(map).sort((a, b) => b.total - a.total);
}

export function FleetPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const [buyOpen, setBuyOpen] = useState(false);
  const [ordering, setOrdering] = useState<{
    specId: string;
    type: "buy" | "lease";
    prefill?: {
      quantity?: number;
      engineUpgrade?: "fuel" | "power" | "super" | null;
      fuselageUpgrade?: boolean;
    };
  } | null>(null);
  /** Listing-for-sale modal — bounds:
   *    min = 20% of book value (fire-sale floor — clears fast)
   *    max = 120% of the airframe's current new-build market price
   *  The wider range lets a player undercut on tired old metal or
   *  ride a hot-model premium when the secondary market is starved. */
  const [sellState, setSellState] = useState<{
    aircraftId: string;
    bookValue: number;
    marketValue: number;   // spec.buyPriceUsd at current quarter
    name: string;
    price: number;
  } | null>(null);
  /** Retire confirmation modal — replaces native confirm(). */
  const [retireState, setRetireState] = useState<{
    aircraftId: string;
    name: string;
    tail: string;
  } | null>(null);
  /** Retrofit/service/renovation confirmation. Replaces the previous
   *  one-tap commits which were silently spending $1M-$50M+ per click.
   *  `kind` discriminates which store action to fire on confirm. */
  const [retrofitState, setRetrofitState] = useState<
    | {
        kind: "eco";
        aircraftId: string;
        name: string;
        tail: string;
        costUsd: number;
        effectLine: string;
      }
    | {
        kind: "engine";
        engineType: "fuel" | "power" | "super";
        aircraftId: string;
        name: string;
        tail: string;
        costUsd: number;
        effectLine: string;
      }
    | {
        kind: "fuselage";
        aircraftId: string;
        name: string;
        tail: string;
        costUsd: number;
        effectLine: string;
      }
    | {
        kind: "quickService";
        aircraftId: string;
        name: string;
        tail: string;
        costUsd: number;
        effectLine: string;
      }
    | {
        kind: "fullReno";
        aircraftId: string;
        name: string;
        tail: string;
        costUsd: number;
        cabinConfig: import("@/types/game").CabinConfig;
        effectLine: string;
      }
    | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpecId, setExpandedSpecId] = useState<string | null>(null);
  /** When true, opens the Aging fleet modal — a per-plane list of
   *  active aircraft with ≤4Q retirement runway, with one-click
   *  Replace actions that route into the buy flow pre-targeted at
   *  the same spec. */
  const [agingOpen, setAgingOpen] = useState(false);
  const [marketQuery, setMarketQuery] = useState("");

  const groups = useMemo(() => groupByType(player, s.currentQuarter), [player, s.currentQuarter]);

  if (!player) return null;

  const available = AIRCRAFT.filter((a) => a.unlockQuarter <= s.currentQuarter)
    .filter((a) => {
      if (!marketQuery) return true;
      const q = marketQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q) ||
        a.family.toLowerCase().includes(q);
    });

  const expanded = expandedSpecId
    ? AIRCRAFT_BY_ID[expandedSpecId]
    : null;
  const expandedFleet = expandedSpecId
    ? player.fleet.filter((f) => f.specId === expandedSpecId)
    : [];
  const listings = s.secondHandListings;

  function handlePurchaseConfirm(args: {
    specId: string;
    acquisitionType: "buy" | "lease";
    quantity: number;
    customSeats?: { first: number; business: number; economy: number };
    engineUpgrade: "fuel" | "power" | "super" | null;
    fuselageUpgrade: boolean;
  }) {
    const r = s.orderAircraft(args);
    if (!r.ok) {
      // Surface the error via toast (replaces blocking native alert)
      // and keep the order modal open so the player can adjust
      // quantity/upgrades and retry without losing their config.
      toast.negative("Order failed", r.error ?? "Could not place this order. Adjust quantity or upgrades and try again.");
      return;
    }
    setOrdering(null);
    setBuyOpen(false);
    setError(null);
  }

  // Operational state breakdown for the top-of-panel summary cards
  // (recommendation #B8). Counts by status — every aircraft falls
  // into exactly one bucket. "Aging" is a sub-bucket of active that
  // surfaces planes with ≤4 quarters of life remaining so the player
  // can plan replacement orders before they retire.
  const opsBuckets = (() => {
    const fleet = player.fleet;
    const onOrder = fleet.filter((f) => f.status === "ordered").length;
    const grounded = fleet.filter((f) => f.status === "grounded").length;
    const active = fleet.filter((f) => f.status === "active");
    // Phase 6 P2 — split routes into "active flying" and "pending bid"
    // so an aircraft assigned to a pending-auction route doesn't get
    // mislabelled as idle. Previously, planes on `status='pending'`
    // routes counted as idle (because of the `!== "closed"` filter
    // — pending IS not closed, but it's also not earning revenue).
    // Now: onRoutes counts only `active` routes; onPendingRoutes is
    // surfaced separately so the player understands why the plane
    // isn't flying.
    const onRoutes = active.filter((f) => {
      if (!f.routeId) return false;
      const r = player.routes.find((rt) => rt.id === f.routeId);
      return !!(r && r.status === "active");
    }).length;
    const onPendingRoutes = active.filter((f) => {
      if (!f.routeId) return false;
      const r = player.routes.find((rt) => rt.id === f.routeId);
      return !!(r && r.status === "pending");
    }).length;
    const idle = active.length - onRoutes - onPendingRoutes;
    const aging = active.filter((f) => {
      const q = f.retirementQuarter - s.currentQuarter;
      return q > 0 && q <= 4;
    }).length;
    return {
      onOrder, grounded, onRoutes, onPendingRoutes, idle, aging,
      total: fleet.length,
    };
  })();

  return (
    <div className="space-y-3">
      {/* Operational state cards — recommendation #B8. Five buckets
          surface "what's the next action" at a glance: Available to
          assign / On routes / On order / Grounded / Aging. Detailed
          by-type list stays below. */}
      {opsBuckets.total > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          <FleetStateCard
            label="Available"
            count={opsBuckets.idle}
            tone={opsBuckets.idle > 0 ? "info" : "default"}
            sub={opsBuckets.idle > 0 ? "Idle, ready to assign" : "All assigned"}
          />
          <FleetStateCard
            label="On routes"
            count={opsBuckets.onRoutes}
            tone="positive"
            sub={
              opsBuckets.onPendingRoutes > 0
                ? `Generating revenue · ${opsBuckets.onPendingRoutes} on pending bid${opsBuckets.onPendingRoutes === 1 ? "" : "s"}`
                : "Generating revenue"
            }
          />
          <FleetStateCard
            label="On order"
            count={opsBuckets.onOrder}
            tone={opsBuckets.onOrder > 0 ? "info" : "default"}
            sub={opsBuckets.onOrder > 0 ? "Delivery next quarter" : "Nothing ordered"}
          />
          <FleetStateCard
            label="Grounded"
            count={opsBuckets.grounded}
            tone={opsBuckets.grounded > 0 ? "warn" : "default"}
            sub={opsBuckets.grounded > 0 ? "Maintenance / renovation" : "All flying"}
          />
          <FleetStateCard
            label="Aging"
            count={opsBuckets.aging}
            tone={opsBuckets.aging > 0 ? "warn" : "default"}
            sub={opsBuckets.aging > 0 ? "Click to retrofit or replace" : "Fleet is fresh"}
            onClick={opsBuckets.aging > 0 ? () => setAgingOpen(true) : undefined}
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="text-[0.8125rem] text-ink-2">
          {player.fleet.length} aircraft total · {groups.length} type{groups.length === 1 ? "" : "s"}
        </div>
        <Button variant="primary" size="sm" onClick={() => setBuyOpen(true)}>
          Order aircraft →
        </Button>
      </div>

      {/* Pre-order queue — pending FIFO orders awaiting production. */}
      <PreOrderQueue />

      {/* Historical aircraft log — every airframe that has exited
          the fleet (sold, retired/scrapped, lease-returned, crashed).
          Collapsed by default so the active fleet stays the focus. */}
      <RetiredHistory />

      {/* Insurance policy moved to the Ops form (Quarterly ops panel)
          — alongside the spend sliders, since insurance premium IS a
          recurring quarterly cost just like staff/marketing/maint. */}

      {groups.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          Fleet is empty. Order your first aircraft to begin flying routes.
        </div>
      ) : (
        <div className="rounded-md border border-line overflow-hidden">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <Th className="w-[36%]">Model</Th>
                <Th className="text-right w-[70px]">Total</Th>
                <Th className="text-right w-[70px]">Used</Th>
                <Th className="text-right w-[80px]">Unused</Th>
                <Th className="text-right w-[70px]">Order</Th>
                <Th className="text-right w-[80px]">Aging</Th>
                <Th className="text-right">Q profit</Th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const spec = AIRCRAFT_BY_ID[g.specId];
                if (!spec) return null;
                // Used = on a route. Unused = active but unassigned.
                const used = g.onRoutes;
                const unused = g.active - g.onRoutes;
                return (
                  <tr
                    key={g.specId}
                    onClick={() => setExpandedSpecId(g.specId)}
                    className="border-b border-line last:border-0 cursor-pointer hover:bg-surface-hover"
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-ink">{spec.name}</span>
                        <Badge tone={spec.family === "cargo" ? "warning" : "neutral"}>
                          {spec.family}
                        </Badge>
                        {g.grounded > 0 && (
                          <Badge tone="warning">{g.grounded} grounded</Badge>
                        )}
                        {(() => {
                          // Update 5: discontinued-type maintenance escalation
                          // badge. Shows the bracket so the player knows WHY
                          // their maintenance jumped on this fleet line.
                          const br = discontinuedMaintenanceBracket(spec, s.currentQuarter);
                          if (!br) return null;
                          return (
                            <span
                              className="inline-flex items-center gap-1 text-[0.625rem] uppercase tracking-wider font-semibold text-warning bg-[var(--warning-soft)] px-1.5 py-0.5 rounded"
                              title={`Production for this aircraft ended R${spec.cutoffRound}. Parts availability declining — maintenance +${br.pct}% (bracket ${br.bracketLabel}).`}
                            >
                              <AlertTriangle size={10} />
                              Discontinued · maint +{br.pct}%
                            </span>
                          );
                        })()}
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted mt-0.5 font-mono">
                        {spec.family === "passenger"
                          ? `${spec.seats.first}F/${spec.seats.business}C/${spec.seats.economy}Y · ${spec.rangeKm.toLocaleString()} km`
                          : `${spec.cargoTonnes ?? 0}T · ${spec.rangeKm.toLocaleString()} km`}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-display text-[1.25rem] text-ink leading-none">
                      {g.total}
                    </td>
                    <td className="py-2.5 px-3 text-right tabular font-mono text-positive font-semibold">
                      {used}
                    </td>
                    <td className={cn(
                      "py-2.5 px-3 text-right tabular font-mono",
                      unused > 0 ? "text-warning font-semibold" : "text-ink-muted",
                    )}>
                      {unused}
                    </td>
                    <td className={cn(
                      "py-2.5 px-3 text-right tabular font-mono",
                      g.ordered > 0 ? "text-info font-semibold" : "text-ink-muted",
                    )}>
                      {g.ordered}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 px-3 text-right tabular font-mono",
                        g.aging > 0 ? "text-warning font-semibold" : "text-ink-muted",
                      )}
                      title={g.aging > 0
                        ? `${g.aging} of ${g.active} active planes have ≤4Q before mandatory retirement`
                        : undefined}
                    >
                      {g.aging}
                    </td>
                    <td
                      className={cn(
                        "py-2.5 px-3 text-right tabular font-mono font-medium",
                        g.quarterlyProfit >= 0 ? "text-positive" : "text-negative",
                      )}
                    >
                      {fmtMoney(g.quarterlyProfit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Second-hand market preview */}
      {listings.length > 0 && (
        <section className="mt-5">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
            Second-hand market · {listings.length} listing{listings.length > 1 ? "s" : ""}
          </div>
          <div className="space-y-1.5">
            {listings.map((l) => {
              const spec = AIRCRAFT_BY_ID[l.specId];
              if (!spec) return null;
              const remainingLifespan = Math.max(0, l.retirementQuarter - s.currentQuarter);
              return (
                <div key={l.id} className="rounded-md border border-line bg-surface-2/50 p-2.5 text-[0.8125rem]">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium text-ink">{spec.name}</div>
                      <div className="text-[0.6875rem] text-ink-muted font-mono">
                        Seller: {l.sellerTeamId === "admin" ? "Facilitator" : l.sellerTeamId.slice(-6)}
                        {l.ecoUpgrade && " · Eco"} · {remainingLifespan}Q left
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => {
                        const r = s.buySecondHand(l.id);
                        if (!r.ok) toast.negative("Purchase failed", r.error ?? "Couldn't acquire this listing.");
                      }}
                    >
                      Buy {fmtMoney(l.askingPriceUsd)}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Aircraft type detail (per-plane drilldown) ─────────────── */}
      {expanded && (() => {
        const heroImg = planeImagePath(expanded.id);
        return (
        <Modal
          open={true}
          onClose={() => setExpandedSpecId(null)}
          className="w-[min(880px,calc(100vw-3rem))]"
        >
          <ModalHeader>
            <div className="flex items-start gap-4">
              {/* Hero illustration — left of the title block. Big enough
                  to actually feel like an aircraft profile, not a tile
                  next to a wall of stats. */}
              <div className="shrink-0 w-40 h-28 rounded-lg bg-surface-2/60 border border-line/60 flex items-center justify-center overflow-hidden">
                {heroImg ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={heroImg}
                    alt={`${expanded.name} 3-view`}
                    className="max-w-full max-h-full object-contain p-2"
                  />
                ) : (
                  <Plane size={56} className="text-ink-muted" strokeWidth={1.0} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge tone={expanded.family === "cargo" ? "warning" : "neutral"}>
                    {expanded.family}
                  </Badge>
                  <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-mono">
                    {expanded.id}
                  </span>
                </div>
                <h2 className="font-display text-[1.625rem] text-ink leading-tight">
                  {expanded.name}
                  <span className="ml-2 text-ink-muted text-[0.9375rem] font-sans">
                    × {expandedFleet.length}
                  </span>
                </h2>
                {/* Spec readout — 4-up grid is roomier than the previous
                    inline string and reads like a proper datasheet. */}
                <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.75rem]">
                  <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Cabin</div>
                    <div className="font-mono tabular text-ink mt-0.5">
                      {expanded.family === "passenger"
                        ? `${expanded.seats.first}F/${expanded.seats.business}C/${expanded.seats.economy}Y`
                        : `${expanded.cargoTonnes ?? 0}T cargo`}
                    </div>
                  </div>
                  <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Range</div>
                    <div className="font-mono tabular text-ink mt-0.5">{expanded.rangeKm.toLocaleString()} km</div>
                  </div>
                  <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Fuel burn</div>
                    <div className="font-mono tabular text-ink mt-0.5">{expanded.fuelBurnPerKm} L/km</div>
                  </div>
                  <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                    <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">List price</div>
                    <div className="font-mono tabular text-ink mt-0.5">{fmtMoney(expanded.buyPriceUsd)}</div>
                  </div>
                </div>
              </div>
            </div>
          </ModalHeader>
          <ModalBody className="max-h-[60vh] overflow-auto space-y-3">
            {/* Per-plane card list — replaces the previous cramped 8-column
                table. Each card has the tail, status, current route, age,
                book value, satisfaction on top — and the action set as
                proper buttons in a tidy row. */}
            {expandedFleet.map((f) => {
              const route = player.routes.find((r) => r.id === f.routeId);
              const ageQ = Math.max(0, s.currentQuarter - f.purchaseQuarter);
              const remainingQ = Math.max(0, f.retirementQuarter - s.currentQuarter);
              const sat = Math.round(f.satisfactionPct ?? 75);
              const satTone =
                sat < 30 ? "text-negative" :
                sat < 50 ? "text-warning" :
                sat >= 80 ? "text-positive" : "text-ink";
              return (
                <div
                  key={f.id}
                  className="rounded-lg border border-line bg-surface p-4"
                >
                  {/* Top row — tail + badges + status, route, key stats */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[0.9375rem] text-ink font-semibold tracking-wide">
                        {f.id.slice(-6).toUpperCase()}
                      </span>
                      <Badge
                        tone={
                          f.status === "active" ? "positive" :
                          f.status === "retired" ? "negative" :
                          f.status === "ordered" ? "info" : "warning"
                        }
                      >
                        {f.status}
                      </Badge>
                      {f.ecoUpgrade && <Badge tone="positive">Eco</Badge>}
                      {f.engineUpgrade && (
                        <Badge tone="info" title={`Engine retrofit: ${f.engineUpgrade}`}>
                          {f.engineUpgrade === "fuel" ? "Fuel-eff" :
                           f.engineUpgrade === "power" ? "Power" :
                           f.engineUpgrade === "super" ? "Super" : ""}
                        </Badge>
                      )}
                      {f.fuselageUpgrade && (
                        <Badge tone="accent" title="Anti-drag fuselage coating">Fuselage</Badge>
                      )}
                      {f.customSeats && (
                        <Badge tone="warning" title="Custom cabin layout">Custom cabin</Badge>
                      )}
                    </div>
                    <div className="text-[0.75rem] text-ink-muted flex items-center gap-1.5">
                      {route ? (
                        <>
                          <span className="font-mono text-ink-2">
                            {route.originCode} → {route.destCode}
                          </span>
                          {/* Phase 6 P2 — pending-route visibility.
                              Aircraft on pending-bid routes look like
                              they're flying but earn nothing until
                              the slot auction resolves. Surface a
                              pill so the player understands why. */}
                          {route.status === "pending" && (
                            <span
                              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700"
                              title="Route is in a pending slot auction — aircraft is reserved but earns no revenue until the bid resolves."
                            >
                              Pending bid
                            </span>
                          )}
                          {route.status === "suspended" && (
                            <span
                              className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider bg-slate-100 text-slate-600"
                              title="Route is suspended — aircraft is reserved but not flying."
                            >
                              Suspended
                            </span>
                          )}
                        </>
                      ) : (
                        <span className="italic">Idle — assign to a route</span>
                      )}
                    </div>
                  </div>
                  {/* 4-up stat strip — clearer than the 8-col table */}
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.75rem]">
                    <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Age</div>
                      <div className="font-mono tabular text-ink mt-0.5">
                        {fmtAgeYQ(ageQ)} <span className="text-ink-muted">· {fmtAgeYQ(remainingQ)} left</span>
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Cabin sat.</div>
                      <div className={cn("font-mono tabular mt-0.5", satTone)}>
                        {sat}%
                      </div>
                    </div>
                    <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Book value</div>
                      <div className="font-mono tabular text-ink mt-0.5">{fmtMoney(f.bookValue)}</div>
                    </div>
                    <div className="rounded-md bg-surface-2/40 border border-line/60 px-2 py-1.5">
                      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Acquisition</div>
                      <div className="font-mono tabular text-ink mt-0.5 capitalize">{f.acquisitionType}</div>
                    </div>
                  </div>

                  {/* Action row — proper Buttons that route through the new
                      Sell + Retire modals. No more native prompt() / confirm(). */}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {!f.ecoUpgrade && f.status === "active" && (expanded.ecoUpgradeUsd ?? 0) > 0 && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setRetrofitState({
                          kind: "eco",
                          aircraftId: f.id,
                          name: expanded.name,
                          tail: f.id.slice(-6).toUpperCase(),
                          costUsd: expanded.ecoUpgradeUsd ?? 0,
                          effectLine: "−10% fuel burn",
                        })}
                        title={`Eco engine retrofit · ${fmtMoney(expanded.ecoUpgradeUsd ?? 0)} · −10% fuel burn`}
                      >
                        + Eco · {fmtMoney(expanded.ecoUpgradeUsd ?? 0)}
                      </Button>
                    )}
                    {!f.engineUpgrade && (f.status === "active" || f.status === "grounded") && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                          kind: "engine",
                          engineType: "fuel",
                          aircraftId: f.id,
                          name: expanded.name,
                          tail: f.id.slice(-6).toUpperCase(),
                          costUsd: engineUpgradeCostUsd(expanded.buyPriceUsd, "fuel"),
                          effectLine: "+10% range · −10% fuel burn",
                        })} title="Fuel-efficient engine: +10% range, −10% fuel burn">
                          + Fuel engine
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                          kind: "engine",
                          engineType: "power",
                          aircraftId: f.id,
                          name: expanded.name,
                          tail: f.id.slice(-6).toUpperCase(),
                          costUsd: engineUpgradeCostUsd(expanded.buyPriceUsd, "power"),
                          effectLine: "+10% cruise speed → tighter schedule",
                        })} title="Power engine: +10% cruise speed">
                          + Power engine
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                          kind: "engine",
                          engineType: "super",
                          aircraftId: f.id,
                          name: expanded.name,
                          tail: f.id.slice(-6).toUpperCase(),
                          costUsd: engineUpgradeCostUsd(expanded.buyPriceUsd, "super"),
                          effectLine: "+10% range · −10% fuel burn · +10% speed",
                        })} title="Super engine: combines fuel + power">
                          + Super
                        </Button>
                      </>
                    )}
                    {!f.fuselageUpgrade && (f.status === "active" || f.status === "grounded") && (
                      <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                        kind: "fuselage",
                        aircraftId: f.id,
                        name: expanded.name,
                        tail: f.id.slice(-6).toUpperCase(),
                        costUsd: fuselageUpgradeCostUsd(expanded.buyPriceUsd),
                        effectLine: "−10% fuel burn · stacks with engine retrofit",
                      })} title="Anti-drag fuselage coating · −10% fuel burn">
                        + Fuselage
                      </Button>
                    )}
                    {f.acquisitionType === "buy" && f.status === "active" && (
                      <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                        kind: "quickService",
                        aircraftId: f.id,
                        name: expanded.name,
                        tail: f.id.slice(-6).toUpperCase(),
                        costUsd: Math.round(f.bookValue * 0.05),
                        effectLine: "Cabin satisfaction restored · no downtime",
                      })} title={`Quick service · ${fmtMoney(f.bookValue * 0.05)} · cabin sat. restored, no downtime`}>
                        Quick svc
                      </Button>
                    )}
                    {f.acquisitionType === "buy" && f.status === "active" && (
                      <Button size="sm" variant="secondary" onClick={() => setRetrofitState({
                        kind: "fullReno",
                        aircraftId: f.id,
                        name: expanded.name,
                        tail: f.id.slice(-6).toUpperCase(),
                        costUsd: Math.round(Math.max(f.bookValue * 0.20, f.purchasePrice * 0.05)),
                        cabinConfig: f.cabinConfig,
                        effectLine: "+8Q lifespan · 1Q downtime · airframe refurb",
                      })} title={`Full renovation · ${fmtMoney(Math.max(f.bookValue * 0.20, f.purchasePrice * 0.05))} · +8Q lifespan, 1Q downtime`}>
                        Full reno
                      </Button>
                    )}
                    {f.acquisitionType === "buy" && f.status === "active" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setSellState({
                          aircraftId: f.id,
                          bookValue: f.bookValue,
                          // "Market value" anchor for the upper bound is
                          // the airframe's current new-build list price —
                          // captures appreciation on hot models even when
                          // the player's specific airframe is depreciated.
                          marketValue: expanded.buyPriceUsd,
                          name: expanded.name,
                          price: Math.round(f.bookValue * 1.0),
                        })}
                      >
                        Sell
                      </Button>
                    )}
                    {f.status !== "retired" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="!text-negative hover:!bg-[var(--negative-soft)]"
                        onClick={() => setRetireState({
                          aircraftId: f.id,
                          name: expanded.name,
                          tail: f.id.slice(-6).toUpperCase(),
                        })}
                      >
                        Retire
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setExpandedSpecId(null)}>Close</Button>
            <Button
              variant="primary"
              onClick={() => {
                setExpandedSpecId(null);
                setOrdering({ specId: expanded.id, type: "buy" });
              }}
            >
              Order another → buy {fmtMoney(expanded.buyPriceUsd)}
            </Button>
          </ModalFooter>
        </Modal>
        );
      })()}

      {/* Sell modal — proper UI replacing the legacy native prompt(). */}
      {sellState && (() => {
        const minPrice = Math.round(sellState.bookValue * 0.20);
        const maxPrice = Math.round(sellState.marketValue * 1.20);
        const clamped = Math.max(minPrice, Math.min(maxPrice, sellState.price));
        return (
        <Modal open onClose={() => setSellState(null)} className="w-[min(520px,calc(100vw-3rem))]">
          <ModalHeader>
            <h2 className="font-display text-[1.25rem] text-ink leading-tight">
              List {sellState.name} for sale
            </h2>
            <p className="text-[0.8125rem] text-ink-muted mt-1">
              Floor 20% of book value ({fmtMoney(sellState.bookValue)}); ceiling 120% of new-build market price ({fmtMoney(sellState.marketValue)}).
            </p>
          </ModalHeader>
          <ModalBody className="space-y-3">
            <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-3">
              <div className="flex items-baseline justify-between text-[0.8125rem]">
                <span className="text-ink-muted">Asking price</span>
                <span className="font-mono tabular text-ink font-semibold text-[1rem]">
                  {fmtMoney(clamped)}
                </span>
              </div>
              <input
                type="range"
                min={minPrice}
                max={maxPrice}
                step={100_000}
                value={clamped}
                onChange={(e) => setSellState({ ...sellState, price: parseInt(e.target.value, 10) })}
                className="w-full accent-primary"
              />
              <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-muted tabular font-mono">
                <span>Min {fmtMoney(minPrice)} <span className="text-ink-muted/70">· 20% book</span></span>
                <span><span className="text-ink-muted/70">120% market ·</span> Max {fmtMoney(maxPrice)}</span>
              </div>
              <div className="text-[0.625rem] text-ink-muted tabular font-mono">
                Reference · book {fmtMoney(sellState.bookValue)} · market {fmtMoney(sellState.marketValue)}
              </div>
            </div>
            <p className="text-[0.75rem] text-ink-muted leading-relaxed">
              Used aircraft surface in the secondary market under your airline name. Below book = fast clear at a loss; near book = clears within a quarter or two; above market = stale listing unless the model is in short supply.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSellState(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = s.listSecondHand(sellState.aircraftId, clamped);
                if (!r.ok) {
                  toast.negative("Listing failed", r.error ?? "Could not list this aircraft for sale.");
                  return;
                }
                toast.success("Listed for sale", `${sellState.name} at ${fmtMoney(clamped)}`);
                setSellState(null);
              }}
            >
              List at {fmtMoney(clamped)}
            </Button>
          </ModalFooter>
        </Modal>
        );
      })()}

      {/* Retire modal — proper UI replacing the legacy native confirm(). */}
      {retireState && (
        <Modal open onClose={() => setRetireState(null)} className="w-[min(440px,calc(100vw-3rem))]">
          <ModalHeader>
            <h2 className="font-display text-[1.25rem] text-ink leading-tight">
              Retire {retireState.name}?
            </h2>
            <p className="text-[0.8125rem] text-ink-muted mt-1">
              Tail <span className="font-mono text-ink">{retireState.tail}</span>
            </p>
          </ModalHeader>
          <ModalBody>
            <p className="text-[0.875rem] text-ink-2 leading-relaxed">
              This permanently retires the aircraft. Insurance proceeds (if your policy is set) pay out at
              the next quarter close based on the aircraft&apos;s book value.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setRetireState(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                s.decommissionAircraft(retireState.aircraftId);
                toast.info("Aircraft retired", `${retireState.name} (${retireState.tail})`);
                setRetireState(null);
              }}
            >
              Retire aircraft
            </Button>
          </ModalFooter>
        </Modal>
      )}

      {/* ── Aircraft market modal ─────────────────────────────────── */}
      <AircraftMarketModal
        open={buyOpen}
        onClose={() => { setBuyOpen(false); setError(null); }}
        currentQuarter={s.currentQuarter}
        marketQuery={marketQuery}
        setMarketQuery={setMarketQuery}
        secondHandListings={listings}
        onOrder={(specId, type, prefill) => setOrdering({ specId, type, prefill })}
        onBuySecondHand={(listingId) => {
          const r = s.buySecondHand(listingId);
          if (!r.ok) setError(r.error ?? "Purchase failed");
        }}
      />

      {/* ── Aging fleet modal ─────────────────────────────────────── */}
      <AgingFleetModal
        open={agingOpen}
        onClose={() => setAgingOpen(false)}
        onReplaceWithSameSpec={(specId) => {
          // Pre-prime the market modal's search query to the spec
          // name so the player lands on the same model. We close the
          // aging modal, then open the market modal — the market
          // modal honours the marketQuery state, which we set before
          // opening it.
          const spec = AIRCRAFT_BY_ID[specId];
          if (spec) setMarketQuery(spec.name);
          setAgingOpen(false);
          setBuyOpen(true);
        }}
      />

      {/* Purchase order modal — quantity, engine retrofit, fuselage,
          and seat configuration. Replaces the old single-button confirm. */}
      <PurchaseOrderModal
        spec={ordering ? AIRCRAFT_BY_ID[ordering.specId] ?? null : null}
        acquisitionType={ordering?.type ?? "buy"}
        prefill={ordering?.prefill}
        onClose={() => { setOrdering(null); setError(null); }}
        onConfirm={handlePurchaseConfirm}
      />

      {/* Retrofit / service / renovation confirm — one modal handles
          all of: eco upgrade, engine retrofits (fuel/power/super),
          fuselage coating, quick service, and full renovation. Each
          variant carries its own cost and effect copy in retrofitState. */}
      <Modal
        open={!!retrofitState}
        onClose={() => setRetrofitState(null)}
        className="w-[min(480px,calc(100vw-3rem))]"
      >
        {retrofitState && (() => {
          const { kind, name, tail, costUsd, effectLine } = retrofitState;
          const titleByKind: Record<typeof kind, string> = {
            eco: "Apply eco engine retrofit?",
            engine: "Fit new engine?",
            fuselage: "Apply anti-drag fuselage coating?",
            quickService: "Run quick service?",
            fullReno: "Schedule full renovation?",
          };
          const ctaByKind: Record<typeof kind, string> = {
            eco: "Apply",
            engine: "Fit engine",
            fuselage: "Apply coating",
            quickService: "Service",
            fullReno: "Schedule reno",
          };
          const subByKind: Record<typeof kind, string> = {
            eco: "Mature eco package — installs immediately and pays back over the rest of the airframe's life through fuel savings.",
            engine: "Engine retrofits permanently change the airframe's performance profile. Eligibility requires no existing engine retrofit.",
            fuselage: "Anti-drag fuselage coating stacks with engine retrofits for compounding fuel savings.",
            quickService: "Restores cabin satisfaction in-place — no downtime, no scheduled outage. Useful between full renos.",
            fullReno: "Heavy-touch refurbishment: airframe goes off-line for one round (lost route revenue) but emerges with +8 quarters of life and a fresh interior.",
          };
          const player2 = useGame.getState().teams.find((t) => t.id === useGame.getState().playerTeamId);
          const cantAfford = (player2?.cashUsd ?? 0) < costUsd;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  {titleByKind[kind]}
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  {subByKind[kind]}
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Aircraft</span>
                    <span className="text-ink">{name}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Tail (last 6)</span>
                    <span className="font-mono tabular text-ink">{tail}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Effect</span>
                    <span className="text-positive text-right max-w-[60%]">
                      {effectLine}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 mt-1.5">
                    <span className="text-ink font-semibold">Cost</span>
                    <span className="tabular font-mono text-negative font-semibold">
                      −{fmtMoney(costUsd)}
                    </span>
                  </div>
                </div>
                {cantAfford && (
                  <div className="mt-2 text-[0.8125rem] text-negative">
                    Insufficient cash — you have {fmtMoney(player2?.cashUsd ?? 0)}.
                  </div>
                )}
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setRetrofitState(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={cantAfford}
                  onClick={() => {
                    let r: { ok: boolean; error?: string };
                    if (retrofitState.kind === "eco") {
                      r = s.addEcoUpgrade(retrofitState.aircraftId);
                      if (r.ok) toast.success("Eco retrofit applied", `${name} (${tail}) — ${effectLine}`);
                    } else if (retrofitState.kind === "engine") {
                      r = s.retrofitEngine(retrofitState.aircraftId, retrofitState.engineType);
                      const labels = { fuel: "Fuel-efficient engine fitted", power: "Power engine fitted", super: "Super engine fitted" };
                      if (r.ok) toast.success(labels[retrofitState.engineType], effectLine);
                    } else if (retrofitState.kind === "fuselage") {
                      r = s.retrofitFuselage(retrofitState.aircraftId);
                      if (r.ok) toast.success("Anti-drag coating applied", effectLine);
                    } else if (retrofitState.kind === "quickService") {
                      r = s.quickServiceAircraft(retrofitState.aircraftId);
                      if (r.ok) toast.success("Quick service complete", effectLine);
                    } else {
                      r = s.renovateAircraft(retrofitState.aircraftId, retrofitState.cabinConfig);
                      if (r.ok) toast.success("Full renovation started", effectLine);
                    }
                    if (!r.ok) toast.negative("Action failed", r.error ?? "Could not apply retrofit.");
                    setRetrofitState(null);
                  }}
                >
                  {ctaByKind[kind]} · {fmtMoney(costUsd)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
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

// fmtPct is imported lazily only when needed for occupancy on cargo planes —
// the unused import is suppressed by tsc since we reference it elsewhere.
void fmtPct;

/** Pre-order queue display — shows the player's queued orders with
 *  position in the FIFO line and an estimated delivery quarter, plus
 *  a Cancel action that refunds half the deposit (50% penalty). */
function PreOrderQueue() {
  const playerTeamId = useGame((s) => s.playerTeamId);
  const preOrders = useGame((s) => s.preOrders);
  const overrides = useGame((s) => s.productionCapOverrides);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const cancelPreOrder = useGame((s) => s.cancelPreOrder);
  // Branded cancel-pre-order confirm replaces the legacy native
  // confirm() — these are real-money irreversible cancellations
  // (half-deposit penalty), so the UX has to feel deliberate.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);

  const myQueued = preOrders.filter(
    (o) => o.teamId === playerTeamId && o.status === "queued",
  );
  const cancelTarget = confirmCancelId
    ? myQueued.find((o) => o.id === confirmCancelId)
    : null;
  const cancelTargetSpec = cancelTarget ? AIRCRAFT_BY_ID[cancelTarget.specId] : null;
  if (myQueued.length === 0) return null;

  const totalDeposit = myQueued.reduce((sum, o) => sum + o.depositUsd, 0);
  const totalBalance = myQueued.reduce((sum, o) => sum + (o.totalPriceUsd - o.depositUsd), 0);

  return (
    <div className="rounded-md border border-line bg-surface overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 px-3 py-2 border-b border-line bg-surface-2/40">
        <div className="flex items-center gap-2">
          <Clock size={13} className="text-accent" />
          <span className="text-[0.8125rem] font-semibold text-ink">
            Pre-orders queued · {myQueued.length}
          </span>
        </div>
        <div className="text-[0.6875rem] text-ink-muted tabular font-mono">
          deposits paid {fmtMoney(totalDeposit)} · balance owed at delivery {fmtMoney(totalBalance)}
        </div>
      </div>
      <div className="divide-y divide-line/40">
        {myQueued.map((order) => {
          const spec = AIRCRAFT_BY_ID[order.specId];
          if (!spec) return null;
          const pos = queuePosition(preOrders, order.id);
          const eta = estimatedDeliveryQuarter(order, spec, preOrders, currentQuarter, overrides);
          const cap = effectiveProductionCap(spec, overrides);
          // Refund / penalty math lives in the cancel-confirm modal —
          // we don't surface them on the row itself anymore.
          return (
            <div key={order.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[0.875rem] text-ink font-medium">{spec.name}</div>
                <div className="text-[0.6875rem] text-ink-muted mt-0.5 tabular font-mono">
                  Position {pos ?? "—"} of {myQueued.length} (cap {cap}/Q) ·
                  {" "}ETA <span className="text-ink">{fmtQuarter(eta)}</span> ·
                  {" "}{order.acquisitionType === "buy" ? "Buy" : "Lease"}
                </div>
              </div>
              <div className="text-right text-[0.6875rem] text-ink-muted tabular font-mono shrink-0">
                <div>Deposit {fmtMoney(order.depositUsd)}</div>
                <div>Balance {fmtMoney(order.totalPriceUsd - order.depositUsd)}</div>
              </div>
              <button
                onClick={() => setConfirmCancelId(order.id)}
                className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md border border-line text-[0.6875rem] text-ink-2 hover:text-negative hover:border-negative"
                title="Cancel pre-order (50% penalty on deposit)"
              >
                <X size={11} /> Cancel
              </button>
            </div>
          );
        })}
      </div>

      {/* Branded cancel-pre-order confirm — half-deposit penalty
          on cancellation, so the UX makes the trade-off explicit.
          The penalty pct is defined in lib/pre-orders so display +
          actual deduction stay in sync. */}
      <Modal open={!!cancelTarget} onClose={() => setConfirmCancelId(null)}>
        {cancelTarget && cancelTargetSpec && (() => {
          const penaltyPct = PREORDER_CANCEL_PENALTY_PCT;
          const refundPct = 1 - penaltyPct;
          const refund = cancelTarget.depositUsd * refundPct;
          const penalty = cancelTarget.depositUsd * penaltyPct;
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Cancel pre-order for {cancelTargetSpec.name}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Pre-orders are real commitments — cancelling forfeits
                  half the deposit. The remaining refund is paid in cash
                  next quarter close.
                </p>
              </ModalHeader>
              <ModalBody className="space-y-2">
                <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Deposit paid</span>
                    <span className="tabular font-mono text-ink">{fmtMoney(cancelTarget.depositUsd)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Refund ({Math.round(refundPct * 100)}%)</span>
                    <span className="tabular font-mono text-positive">{fmtMoney(refund)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Penalty ({Math.round(penaltyPct * 100)}%)</span>
                    <span className="tabular font-mono text-negative">−{fmtMoney(penalty)}</span>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmCancelId(null)}>
                  Keep pre-order
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    cancelPreOrder(cancelTarget.id);
                    setConfirmCancelId(null);
                  }}
                >
                  Cancel · refund {fmtMoney(refund)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}

/** History panel — every airframe that has exited the fleet. Sold,
 *  retired (auto-scrapped at lifespan end), lease-returned, or
 *  crashed. Collapsed by default. */
function RetiredHistory() {
  const player = useGame(selectPlayer);
  const [open, setOpen] = useState(false);
  if (!player) return null;
  const history = player.retiredHistory ?? [];
  if (history.length === 0) return null;

  // Newest first.
  const sorted = [...history].sort((a, b) => b.exitQuarter - a.exitQuarter);
  const proceedsTotal = history.reduce((sum, h) => sum + h.proceedsUsd, 0);

  const reasonLabel: Record<typeof history[number]["exitReason"], string> = {
    retired: "Retired (scrap)",
    sold: "Sold",
    "lease-returned": "Lease returned",
    crashed: "Crashed",
  };
  const reasonTone: Record<typeof history[number]["exitReason"], string> = {
    retired: "text-ink-muted",
    sold: "text-positive",
    "lease-returned": "text-warning",
    crashed: "text-negative",
  };

  return (
    <div className="rounded-md border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-surface-hover transition-colors"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem] font-semibold text-ink">
            Aircraft history · {history.length}
          </span>
          <span className="text-[0.6875rem] text-ink-muted">
            sold / retired / returned / crashed
          </span>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-[0.6875rem] text-ink-muted tabular font-mono">
            {fmtMoney(proceedsTotal)} lifetime proceeds
          </span>
          <span className="text-ink-muted text-[0.6875rem]">{open ? "▾" : "▸"}</span>
        </div>
      </button>
      {open && (
        <div className="border-t border-line/40">
          <table className="w-full text-[0.75rem]">
            <thead>
              <tr className="bg-surface-2 border-b border-line/40">
                <th className="text-left px-3 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Aircraft</th>
                <th className="text-left px-3 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">In-service</th>
                <th className="text-left px-3 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Exited</th>
                <th className="text-left px-3 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Reason</th>
                <th className="text-right px-3 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Proceeds</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((h) => (
                <tr key={h.id} className="border-b border-line/30 last:border-0">
                  <td className="px-3 py-1.5">
                    <div className="text-ink">{h.specName}</div>
                    <div className="text-[0.625rem] text-ink-muted font-mono">
                      {h.acquisitionType} · {h.id.slice(-6)}
                    </div>
                  </td>
                  <td className="px-3 py-1.5 tabular font-mono text-ink-2">
                    {fmtQuarter(h.acquiredAtQuarter)} – {fmtQuarter(h.exitQuarter)}
                  </td>
                  <td className="px-3 py-1.5 tabular font-mono text-ink-2">
                    {fmtQuarter(h.exitQuarter)}
                  </td>
                  <td className={cn("px-3 py-1.5 text-[0.6875rem] font-semibold", reasonTone[h.exitReason])}>
                    {reasonLabel[h.exitReason]}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular font-mono text-ink">
                    {h.proceedsUsd > 0 ? fmtMoney(h.proceedsUsd) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Status-bucket card for the top-of-panel operational summary.
 *  Recommendation #B8: scan five buckets and know the next move. */
function FleetStateCard({
  label, count, tone, sub, onClick,
}: {
  label: string;
  count: number;
  tone: "positive" | "info" | "warn" | "default";
  sub: string;
  /** Optional click handler — when provided, the card renders as a
   *  button with hover affordance + a chevron hint. Used by the
   *  "Aging" card to drill into a per-plane replacement modal. */
  onClick?: () => void;
}) {
  const interactive = !!onClick;
  return (
    <button
      type={interactive ? "button" : undefined}
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "rounded-md border p-2.5 text-left w-full",
        tone === "positive" && "border-positive/40 bg-[var(--positive-soft)]/30",
        tone === "warn" && "border-warning/40 bg-[var(--warning-soft)]/30",
        tone === "info" && "border-line bg-[rgba(20,53,94,0.04)]",
        tone === "default" && "border-line bg-surface",
        interactive && "cursor-pointer hover:shadow-[var(--shadow-1)] hover:border-warning transition-shadow",
        !interactive && "cursor-default",
      )}
    >
      <div className="flex items-center justify-between text-[0.625rem] uppercase tracking-wider text-ink-muted">
        <span>{label}</span>
        {interactive && <span className="text-ink-muted">→</span>}
      </div>
      <div
        className={cn(
          "font-display text-[1.5rem] tabular leading-none mt-0.5",
          tone === "positive" && "text-positive",
          tone === "warn" && "text-warning",
          tone === "info" && "text-primary",
          tone === "default" && "text-ink",
        )}
      >
        {count}
      </div>
      <div className="text-[0.625rem] text-ink-muted mt-1 leading-snug">{sub}</div>
    </button>
  );
}

/**
 * Aging fleet modal.
 *
 * Per-plane list of every active aircraft within 4 quarters of
 * mandatory retirement. Each row offers two routes forward:
 *
 *   1. **Retrofit lifespan** — pay 30% of the original purchase
 *      price, gain +14Q operational life (50% of base 28Q lifespan).
 *      One per airframe so it's a real decision, not an indefinite
 *      escape hatch.
 *
 *   2. **Replace** — close this modal and open the aircraft market
 *      modal, pre-primed with the same model in the search query.
 *      Player can then buy or lease a fresh airframe of the same
 *      type (or browse to a different model).
 *
 * Why this exists: previously the player had no in-flow way to act
 * on the "Aging" stat card. They had to memorise which planes were
 * aging, scroll the fleet list, find the right model, and order
 * a replacement separately. This modal collapses that workflow
 * into two clicks.
 */
function AgingFleetModal({
  open, onClose, onReplaceWithSameSpec,
}: {
  open: boolean;
  onClose: () => void;
  onReplaceWithSameSpec: (specId: string) => void;
}) {
  const s = useGame();
  const player = selectPlayer(s);
  const retrofitLifespan = useGame((g) => g.retrofitLifespan);

  if (!player) return null;

  // Aging = active and within 4 quarters of mandatory retirement.
  const agingPlanes = player.fleet
    .filter((f) => {
      if (f.status !== "active") return false;
      const q = (f.retirementQuarter ?? 0) - s.currentQuarter;
      return q > 0 && q <= 4;
    })
    .sort((a, b) => a.retirementQuarter - b.retirementQuarter);

  return (
    <Modal open={open} onClose={onClose} className="w-[min(720px,calc(100vw-2rem))]">
      <ModalHeader>
        <div className="flex items-baseline gap-2 mb-1">
          <Badge tone="warning">Aging fleet</Badge>
          <span className="text-[0.6875rem] text-ink-muted">
            {agingPlanes.length} ≤4Q from retirement
          </span>
        </div>
        <h2 className="font-display text-[1.5rem] text-ink leading-tight">
          Plan replacements
        </h2>
        <p className="text-[0.8125rem] text-ink-muted mt-1 leading-snug">
          Retrofit once for +14Q life, or replace via a fresh order in the
          same model line.
        </p>
      </ModalHeader>

      <ModalBody className="max-h-[60vh] overflow-auto p-0">
        {agingPlanes.length === 0 ? (
          <div className="px-4 py-8 text-center text-[0.8125rem] text-ink-muted">
            No aging aircraft right now. The &ldquo;Aging&rdquo; card lights
            up when a plane has 4 quarters or fewer of mandatory life
            remaining.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {agingPlanes.map((f) => (
              <AgingFleetRow
                key={f.id}
                plane={f}
                currentQuarter={s.currentQuarter}
                playerCash={player.cashUsd}
                routeAssignment={
                  f.routeId
                    ? player.routes.find((r) => r.id === f.routeId)
                    : undefined
                }
                onRetrofit={() => {
                  const r = retrofitLifespan(f.id);
                  if (!r.ok) toast.negative("Retrofit failed", r.error ?? "");
                }}
                onReplace={() => onReplaceWithSameSpec(f.specId)}
              />
            ))}
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

function AgingFleetRow({
  plane, currentQuarter, playerCash, routeAssignment, onRetrofit, onReplace,
}: {
  plane: import("@/types/game").FleetAircraft;
  currentQuarter: number;
  playerCash: number;
  routeAssignment?: import("@/types/game").Route;
  onRetrofit: () => void;
  onReplace: () => void;
}) {
  const spec = AIRCRAFT_BY_ID[plane.specId];
  if (!spec) return null;
  const quartersLeft = (plane.retirementQuarter ?? 0) - currentQuarter;
  const ageQ = currentQuarter - plane.purchaseQuarter;
  const baselinePrice = plane.purchasePrice > 0
    ? plane.purchasePrice
    : (spec.buyPriceUsd ?? 0);
  const retrofitCost = Math.round(baselinePrice * 0.30);
  const canAffordRetrofit = playerCash >= retrofitCost;
  const alreadyExtended = !!plane.lifespanExtended;
  const tail = plane.id.slice(-4).toUpperCase();
  return (
    <div className="flex items-center gap-4 px-4 py-3 hover:bg-surface-2/30 transition-colors">
      {/* Left column — aircraft identity + status. Single row of small
          text instead of a stacked layout, keeps the row compact. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="font-semibold text-ink text-[0.875rem]">
            {spec.name}
          </span>
          <span className="font-mono text-[0.6875rem] text-ink-muted">
            #{tail}
          </span>
          {routeAssignment && routeAssignment.status !== "closed" && (
            <span className="font-mono text-[0.6875rem] text-accent">
              {routeAssignment.originCode} → {routeAssignment.destCode}
            </span>
          )}
          {alreadyExtended && (
            <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-positive bg-[var(--positive-soft)] px-1.5 py-0.5 rounded">
              Retrofitted
            </span>
          )}
        </div>
        <div className="text-[0.6875rem] text-ink-muted mt-0.5">
          Age <span className="tabular font-mono text-ink-2">{ageQ}Q</span>
          {" · "}retires in
          {" "}<span className="tabular font-mono text-warning font-semibold">{quartersLeft}Q</span>
          {" · "}book <span className="tabular font-mono text-ink-2">{fmtMoney(plane.bookValue ?? 0)}</span>
        </div>
      </div>

      {/* Right column — two action buttons side-by-side, fixed widths
          so the price lines and chevrons sit on a single row each. */}
      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          variant="primary"
          disabled={alreadyExtended || !canAffordRetrofit}
          title={
            alreadyExtended
              ? "Already retrofitted once"
              : !canAffordRetrofit
                ? `Need ${fmtMoney(retrofitCost)} cash`
                : `30% of original purchase · +14Q lifespan`
          }
          onClick={onRetrofit}
          className="whitespace-nowrap"
        >
          Retrofit · {fmtMoney(retrofitCost)}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={onReplace}
          title={`Open the market filtered to ${spec.name}`}
          className="whitespace-nowrap"
        >
          Replace →
        </Button>
      </div>
    </div>
  );
}
