"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { AircraftMarketModal } from "@/components/game/AircraftMarketModal";
import { PurchaseOrderModal } from "@/components/game/PurchaseOrderModal";
import { useGame, selectPlayer } from "@/store/game";
import { toast } from "@/store/toasts";
import { fmtMoney, fmtPct, fmtAgeYQ } from "@/lib/format";
import { planeImagePath } from "@/lib/aircraft-images";
import { cn } from "@/lib/cn";
import { Plane, AlertTriangle } from "lucide-react";
import { discontinuedMaintenanceBracket } from "@/lib/engine";

/** Group aircraft by spec id, count quantity, and aggregate utilisation. */
function groupByType(player: ReturnType<typeof selectPlayer>) {
  if (!player) return [];
  const map: Record<string, {
    specId: string;
    total: number;
    active: number;
    ordered: number;
    grounded: number;
    retired: number;
    onRoutes: number;        // # planes assigned to a route
    bookValue: number;       // sum
    avgAgeQ: number;         // average plane age in quarters
    quarterlyProfit: number; // sum of profit across routes carrying these planes
  }> = {};

  // Cache route profits by id
  const routeProfit: Record<string, number> = {};
  for (const r of player.routes) {
    routeProfit[r.id] = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
  }

  let now = 0;
  for (const f of player.fleet) {
    if (!map[f.specId]) {
      map[f.specId] = {
        specId: f.specId, total: 0, active: 0, ordered: 0, grounded: 0, retired: 0,
        onRoutes: 0, bookValue: 0, avgAgeQ: 0, quarterlyProfit: 0,
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
    if (f.status === "active") g.active += 1;
    else if (f.status === "ordered") g.ordered += 1;
    else if (f.status === "grounded") g.grounded += 1;
    else if (f.status === "retired") g.retired += 1;
    g.avgAgeQ += f.purchaseQuarter;
    now += 1;
  }
  void now;
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
  /** Listing-for-sale modal — replaces the legacy native browser
   *  prompt(). Gives the player a proper price slider with min/max
   *  bounds derived from the aircraft's book value. */
  const [sellState, setSellState] = useState<{
    aircraftId: string;
    bookValue: number;
    name: string;
    price: number;
  } | null>(null);
  /** Retire confirmation modal — replaces native confirm(). */
  const [retireState, setRetireState] = useState<{
    aircraftId: string;
    name: string;
    tail: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpecId, setExpandedSpecId] = useState<string | null>(null);
  const [marketQuery, setMarketQuery] = useState("");

  const groups = useMemo(() => groupByType(player), [player]);

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

  // Insurance details (PRD E5)
  const insuranceMeta = {
    none:   { coverage: "0%", premium: "0%/Q", tone: "neutral" as const },
    low:    { coverage: "30%", premium: "0.15%/Q", tone: "info" as const },
    medium: { coverage: "50%", premium: "0.30%/Q", tone: "primary" as const },
    high:   { coverage: "80%", premium: "0.50%/Q", tone: "positive" as const },
  };
  const insMeta = insuranceMeta[player.insurancePolicy];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[0.8125rem] text-ink-2">
          {player.fleet.length} aircraft total · {groups.length} type{groups.length === 1 ? "" : "s"}
        </div>
        <Button variant="primary" size="sm" onClick={() => setBuyOpen(true)}>
          Order aircraft →
        </Button>
      </div>

      {/* Insurance policy — directly editable from Fleet panel */}
      <div className="rounded-md border border-line bg-surface p-3">
        <div className="flex items-baseline justify-between mb-2">
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
            Aircraft insurance
          </div>
          <div className="flex items-center gap-2 text-[0.6875rem] tabular text-ink-muted">
            <span>Premium {insMeta.premium}</span>
            <span>·</span>
            <span className="text-ink font-semibold">Coverage {insMeta.coverage}</span>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {(["none", "low", "medium", "high"] as const).map((lvl) => {
            const m = insuranceMeta[lvl];
            const active = player.insurancePolicy === lvl;
            return (
              <button
                key={lvl}
                onClick={() => s.setInsurancePolicy(lvl)}
                className={cn(
                  "rounded-md border px-2 py-1.5 capitalize transition-colors",
                  active
                    ? "border-primary bg-[rgba(20,53,94,0.06)] text-ink font-medium"
                    : "border-line text-ink-2 hover:bg-surface-hover",
                )}
              >
                <div className="text-[0.75rem] font-medium">{lvl}</div>
                <div className="text-[0.625rem] text-ink-muted">
                  {m.premium} · {m.coverage}
                </div>
              </button>
            );
          })}
        </div>
        <div className="text-[0.6875rem] text-ink-muted mt-2 leading-relaxed">
          Premium is paid each quarter as % of fleet market value. On
          mandatory retirement (16Q lifespan), insurance pays out
          coverage × 75% of book value.
        </div>
      </div>

      {groups.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          Fleet is empty. Order your first aircraft to begin flying routes.
        </div>
      ) : (
        <div className="rounded-md border border-line overflow-hidden">
          <table className="w-full text-[0.8125rem]">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <Th className="w-[40%]">Model</Th>
                <Th className="text-right w-[70px]">Total</Th>
                <Th className="text-right w-[70px]">Used</Th>
                <Th className="text-right w-[80px]">Unused</Th>
                <Th className="text-right w-[70px]">Order</Th>
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
                    <div className="text-[0.75rem] text-ink-muted">
                      {route ? (
                        <span className="font-mono text-ink-2">
                          {route.originCode} → {route.destCode}
                        </span>
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
                        onClick={() => {
                          const r = s.addEcoUpgrade(f.id);
                          if (!r.ok) toast.negative("Eco upgrade failed", r.error ?? "Could not apply eco retrofit.");
                          else toast.success("Eco retrofit applied", `${expanded.name} (${f.id.slice(-6).toUpperCase()}) — −10% fuel burn`);
                        }}
                        title={`Eco engine retrofit · ${fmtMoney(expanded.ecoUpgradeUsd ?? 0)} · −10% fuel burn`}
                      >
                        + Eco · {fmtMoney(expanded.ecoUpgradeUsd ?? 0)}
                      </Button>
                    )}
                    {!f.engineUpgrade && (f.status === "active" || f.status === "grounded") && (
                      <>
                        <Button size="sm" variant="secondary" onClick={() => {
                          const r = s.retrofitEngine(f.id, "fuel");
                          if (!r.ok) toast.negative("Retrofit failed", r.error ?? ""); else toast.success("Fuel-efficient engine fitted", "+10% range, −10% fuel burn");
                        }} title="Fuel-efficient engine: +10% range, −10% fuel burn">
                          + Fuel engine
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => {
                          const r = s.retrofitEngine(f.id, "power");
                          if (!r.ok) toast.negative("Retrofit failed", r.error ?? ""); else toast.success("Power engine fitted", "+10% cruise speed → tighter schedule");
                        }} title="Power engine: +10% cruise speed">
                          + Power engine
                        </Button>
                        <Button size="sm" variant="secondary" onClick={() => {
                          const r = s.retrofitEngine(f.id, "super");
                          if (!r.ok) toast.negative("Retrofit failed", r.error ?? ""); else toast.success("Super engine fitted", "+10% range, −10% fuel burn, +10% speed");
                        }} title="Super engine: combines fuel + power">
                          + Super
                        </Button>
                      </>
                    )}
                    {!f.fuselageUpgrade && (f.status === "active" || f.status === "grounded") && (
                      <Button size="sm" variant="secondary" onClick={() => {
                        const r = s.retrofitFuselage(f.id);
                        if (!r.ok) toast.negative("Retrofit failed", r.error ?? ""); else toast.success("Anti-drag coating applied", "−10% fuel burn, stacks with engine retrofit");
                      }} title="Anti-drag fuselage coating · −10% fuel burn">
                        + Fuselage
                      </Button>
                    )}
                    {f.acquisitionType === "buy" && f.status === "active" && (
                      <Button size="sm" variant="secondary" onClick={() => {
                        const r = s.quickServiceAircraft(f.id);
                        if (!r.ok) toast.negative("Quick service failed", r.error ?? ""); else toast.success("Quick service complete", "Cabin satisfaction restored");
                      }} title={`Quick service · ${fmtMoney(f.bookValue * 0.05)} · cabin sat. restored, no downtime`}>
                        Quick svc
                      </Button>
                    )}
                    {f.acquisitionType === "buy" && f.status === "active" && (
                      <Button size="sm" variant="secondary" onClick={() => {
                        const r = s.renovateAircraft(f.id, f.cabinConfig);
                        if (!r.ok) toast.negative("Renovation failed", r.error ?? ""); else toast.success("Full renovation started", "+8Q lifespan, 1 round downtime");
                      }} title={`Full renovation · ${fmtMoney(Math.max(f.bookValue * 0.20, f.purchasePrice * 0.05))} · +8Q lifespan, 1Q downtime`}>
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
                          name: expanded.name,
                          price: Math.round(f.bookValue * 1.1),
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
      {sellState && (
        <Modal open onClose={() => setSellState(null)} className="w-[min(520px,calc(100vw-3rem))]">
          <ModalHeader>
            <h2 className="font-display text-[1.25rem] text-ink leading-tight">
              List {sellState.name} for sale
            </h2>
            <p className="text-[0.8125rem] text-ink-muted mt-1">
              Listing price must be at least the book value ({fmtMoney(sellState.bookValue)}) and at most 1.5× book.
            </p>
          </ModalHeader>
          <ModalBody className="space-y-3">
            <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-3">
              <div className="flex items-baseline justify-between text-[0.8125rem]">
                <span className="text-ink-muted">Asking price</span>
                <span className="font-mono tabular text-ink font-semibold text-[1rem]">
                  {fmtMoney(sellState.price)}
                </span>
              </div>
              <input
                type="range"
                min={Math.round(sellState.bookValue)}
                max={Math.round(sellState.bookValue * 1.5)}
                step={100_000}
                value={sellState.price}
                onChange={(e) => setSellState({ ...sellState, price: parseInt(e.target.value, 10) })}
                className="w-full accent-primary"
              />
              <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-muted tabular font-mono">
                <span>Min {fmtMoney(sellState.bookValue)}</span>
                <span>Max {fmtMoney(sellState.bookValue * 1.5)}</span>
              </div>
            </div>
            <p className="text-[0.75rem] text-ink-muted leading-relaxed">
              Used aircraft surface in the secondary market under your airline name. Higher prices
              mean fewer buyers; book-value pricing usually clears within a quarter or two.
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" onClick={() => setSellState(null)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => {
                const r = s.listSecondHand(sellState.aircraftId, sellState.price);
                if (!r.ok) {
                  toast.negative("Listing failed", r.error ?? "Could not list this aircraft for sale.");
                  return;
                }
                toast.success("Listed for sale", `${sellState.name} at ${fmtMoney(sellState.price)}`);
                setSellState(null);
              }}
            >
              List at {fmtMoney(sellState.price)}
            </Button>
          </ModalFooter>
        </Modal>
      )}

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

      {/* Purchase order modal — quantity, engine retrofit, fuselage,
          and seat configuration. Replaces the old single-button confirm. */}
      <PurchaseOrderModal
        spec={ordering ? AIRCRAFT_BY_ID[ordering.specId] ?? null : null}
        acquisitionType={ordering?.type ?? "buy"}
        prefill={ordering?.prefill}
        onClose={() => { setOrdering(null); setError(null); }}
        onConfirm={handlePurchaseConfirm}
      />
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
