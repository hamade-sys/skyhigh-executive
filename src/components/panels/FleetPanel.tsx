"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { AircraftMarketModal } from "@/components/game/AircraftMarketModal";
import { PurchaseOrderModal } from "@/components/game/PurchaseOrderModal";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct } from "@/lib/format";
import { cn } from "@/lib/cn";

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
  const [ordering, setOrdering] = useState<{ specId: string; type: "buy" | "lease" } | null>(null);
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
      // Surface the error inline AND keep the order modal open so the
      // player can adjust quantity/upgrades and retry.
      alert(r.error ?? "Order failed");
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
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink">{spec.name}</span>
                        <Badge tone={spec.family === "cargo" ? "warning" : "neutral"}>
                          {spec.family}
                        </Badge>
                        {g.grounded > 0 && (
                          <Badge tone="warning">{g.grounded} grounded</Badge>
                        )}
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
                        if (!r.ok) alert(r.error);
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
      {expanded && (
        <Modal
          open={true}
          onClose={() => setExpandedSpecId(null)}
          className="w-[min(820px,calc(100vw-3rem))]"
        >
          <ModalHeader>
            <h2 className="font-display text-[1.5rem] text-ink leading-tight">
              {expanded.name}
              <span className="ml-2 text-ink-muted text-[0.875rem] font-sans">
                × {expandedFleet.length}
              </span>
            </h2>
            <div className="text-ink-muted text-[0.8125rem] mt-1 font-mono">
              {expanded.family === "passenger"
                ? `${expanded.seats.first}F / ${expanded.seats.business}C / ${expanded.seats.economy}Y`
                : `${expanded.cargoTonnes ?? 0}T cargo`}
              {" · "}{expanded.rangeKm.toLocaleString()} km
              {" · "}{expanded.fuelBurnPerKm} L/km
              {" · "}buy {fmtMoney(expanded.buyPriceUsd)}
              {" · "}lease {fmtMoney(expanded.leasePerQuarterUsd)}/Q
            </div>
          </ModalHeader>
          <ModalBody className="max-h-[60vh] overflow-auto">
            <div className="rounded-md border border-line overflow-hidden">
              <table className="w-full text-[0.8125rem]">
                <thead>
                  <tr className="bg-surface-2 border-b border-line">
                    <Th>Tail</Th>
                    <Th>Status</Th>
                    <Th>Route</Th>
                    <Th className="text-right">Age</Th>
                    <Th className="text-right">Cabin sat.</Th>
                    <Th className="text-right">Book value</Th>
                    <Th className="text-right">Q profit</Th>
                    <Th className="text-right w-[260px]">Actions</Th>
                  </tr>
                </thead>
                <tbody>
                  {expandedFleet.map((f) => {
                    const route = player.routes.find((r) => r.id === f.routeId);
                    const profit = route
                      ? (route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost) /
                        Math.max(1, player.fleet.filter((x) => x.routeId === route.id).length)
                      : 0;
                    const ageQ = Math.max(0, s.currentQuarter - f.purchaseQuarter);
                    const remainingQ = Math.max(0, f.retirementQuarter - s.currentQuarter);
                    return (
                      <tr key={f.id} className="border-b border-line last:border-0">
                        <td className="py-2 px-3 font-mono text-ink">
                          {f.id.slice(-6).toUpperCase()}
                          <span className="inline-flex items-center gap-1 ml-1.5">
                            {f.ecoUpgrade && (
                              <Badge tone="positive">Eco</Badge>
                            )}
                            {f.engineUpgrade && (
                              <Badge tone="info" title={`Engine: ${f.engineUpgrade}`}>
                                {f.engineUpgrade === "fuel" ? "F" :
                                 f.engineUpgrade === "power" ? "P" :
                                 f.engineUpgrade === "super" ? "S" : ""}
                              </Badge>
                            )}
                            {f.fuselageUpgrade && (
                              <Badge tone="accent" title="Fuselage coating">FX</Badge>
                            )}
                            {f.customSeats && (
                              <Badge tone="warning" title="Custom cabin layout">CC</Badge>
                            )}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <Badge
                            tone={
                              f.status === "active"
                                ? "positive"
                                : f.status === "retired"
                                  ? "negative"
                                  : f.status === "ordered"
                                    ? "info"
                                    : "warning"
                            }
                          >
                            {f.status}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 font-mono text-ink-2">
                          {route ? `${route.originCode}→${route.destCode}` : <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right tabular font-mono text-ink">
                          {ageQ}Q
                          <span className="text-ink-muted ml-1">/ {remainingQ}Q left</span>
                        </td>
                        <td className={cn(
                          "py-2 px-3 text-right tabular font-mono",
                          (f.satisfactionPct ?? 75) < 30 ? "text-negative" :
                          (f.satisfactionPct ?? 75) < 50 ? "text-warning" :
                          (f.satisfactionPct ?? 75) >= 80 ? "text-positive" : "text-ink",
                        )}>
                          {Math.round(f.satisfactionPct ?? 75)}%
                        </td>
                        <td className="py-2 px-3 text-right tabular font-mono text-ink">
                          {fmtMoney(f.bookValue)}
                        </td>
                        <td className={cn(
                          "py-2 px-3 text-right tabular font-mono",
                          profit >= 0 ? "text-positive" : "text-negative",
                        )}>
                          {f.routeId ? fmtMoney(profit) : <span className="text-ink-muted">—</span>}
                        </td>
                        <td className="py-2 px-3 text-right">
                          <div className="flex flex-wrap justify-end items-center gap-x-2 gap-y-1 text-[0.75rem]">
                            {!f.ecoUpgrade && f.status === "active" && (
                              <button
                                className="text-ink-2 hover:text-accent underline"
                                title={
                                  `Eco engine retrofit: ${fmtMoney(expanded.ecoUpgradeUsd ?? 0)} ` +
                                  `one-time. Cuts fuel burn 10–15%, boosts brand. ` +
                                  `Recommended for long-haul heavies.`
                                }
                                onClick={() => {
                                  try {
                                    const cost = expanded.ecoUpgradeUsd ?? 0;
                                    if (cost <= 0) {
                                      alert("This aircraft cannot be eco-retrofitted (no upgrade cost configured).");
                                      return;
                                    }
                                    const ok = confirm(
                                      `Eco retrofit ${expanded.name} (${f.id.slice(-6).toUpperCase()})?\n\n` +
                                      `Cost: ${fmtMoney(cost)}\n` +
                                      `Effect: -10% fuel burn, +brand bump.\n\n` +
                                      `OK to proceed.`,
                                    );
                                    if (!ok) return;
                                    const r = s.addEcoUpgrade(f.id);
                                    if (!r.ok) alert(r.error ?? "Upgrade failed");
                                  } catch (err) {
                                    console.error("Eco upgrade failed:", err);
                                    alert("Eco upgrade failed: " + (err instanceof Error ? err.message : String(err)));
                                  }
                                }}
                              >
                                Eco
                              </button>
                            )}
                            {!f.engineUpgrade && (f.status === "active" || f.status === "grounded") && (
                              <button
                                className="text-ink-2 hover:text-info underline"
                                title="Engine retrofit: pick fuel-efficient (-10% burn), power-up (+10% speed), or super (both)."
                                onClick={() => {
                                  const choice = prompt(
                                    `Engine retrofit ${expanded.name} (${f.id.slice(-6).toUpperCase()})\n\n` +
                                    `Type "fuel" for Fuel-efficient ($24.9M, -10% fuel burn)\n` +
                                    `Type "power" for Power-up ($24.9M, +10% speed)\n` +
                                    `Type "super" for Super ($49.8M, both)\n\n` +
                                    `Or cancel to keep stock.`,
                                    "fuel",
                                  );
                                  if (!choice) return;
                                  const k = choice.trim().toLowerCase();
                                  if (k !== "fuel" && k !== "power" && k !== "super") {
                                    alert(`Unknown engine type "${k}". Use fuel, power, or super.`);
                                    return;
                                  }
                                  const r = s.retrofitEngine(f.id, k);
                                  if (!r.ok) alert(r.error ?? "Retrofit failed");
                                }}
                              >
                                Engine
                              </button>
                            )}
                            {!f.fuselageUpgrade && (f.status === "active" || f.status === "grounded") && (
                              <button
                                className="text-ink-2 hover:text-accent underline"
                                title="Fuselage anti-drag coating: -10% fuel burn (stacks). $24.9M."
                                onClick={() => {
                                  const ok = confirm(
                                    `Apply fuselage coating to ${expanded.name} (${f.id.slice(-6).toUpperCase()})?\n\n` +
                                    `Cost: $24.9M\n` +
                                    `Effect: -10% fuel burn (stacks with engine).`,
                                  );
                                  if (!ok) return;
                                  const r = s.retrofitFuselage(f.id);
                                  if (!r.ok) alert(r.error ?? "Retrofit failed");
                                }}
                              >
                                Fuselage
                              </button>
                            )}
                            {/* Renovation — Quick Service: 5% of book,
                                no downtime, satisfaction restored.
                                Full Renovation: 20% of book (min 5% of
                                original price), 1Q downtime, +8Q
                                lifespan. Owned only. */}
                            {f.acquisitionType === "buy" && f.status === "active" && (
                              <button
                                className="text-ink-2 hover:text-positive underline"
                                title={
                                  `Quick Service: ${fmtMoney(f.bookValue * 0.05)}, no downtime, ` +
                                  `satisfaction restored to 80% of new.`
                                }
                                onClick={() => {
                                  const cost = f.bookValue * 0.05;
                                  if (!confirm(
                                    `Quick Service ${expanded.name} (${f.id.slice(-6).toUpperCase()})?\n\n` +
                                    `Cost: ${fmtMoney(cost)} (5% of book value)\n` +
                                    `Downtime: none — aircraft keeps flying.\n` +
                                    `Effect: per-plane satisfaction restored.`,
                                  )) return;
                                  const r = s.quickServiceAircraft(f.id);
                                  if (!r.ok) alert(r.error ?? "Quick Service failed");
                                }}
                              >
                                Quick svc
                              </button>
                            )}
                            {f.acquisitionType === "buy" && f.status === "active" && (
                              <button
                                className="text-ink-2 hover:text-info underline"
                                title={
                                  `Full Renovation: 20% of book value (min 5% of original ` +
                                  `purchase price). 1 round downtime. +8Q lifespan, ` +
                                  `cabin reconfigurable.`
                                }
                                onClick={() => {
                                  const cost = Math.max(
                                    f.bookValue * 0.20,
                                    f.purchasePrice * 0.05,
                                  );
                                  if (!confirm(
                                    `Full Renovation ${expanded.name} (${f.id.slice(-6).toUpperCase()})?\n\n` +
                                    `Cost: ${fmtMoney(cost)} (20% of book value, min 5% of original)\n` +
                                    `Downtime: 1 round\n` +
                                    `Effect: +8Q lifespan, satisfaction reset, cabin reconfigurable.`,
                                  )) return;
                                  const r = s.renovateAircraft(f.id, f.cabinConfig);
                                  if (!r.ok) alert(r.error ?? "Renovation failed");
                                }}
                              >
                                Full reno
                              </button>
                            )}
                            {f.acquisitionType === "buy" && f.status === "active" && (
                              <button
                                className="text-ink-2 hover:text-ink underline"
                                onClick={() => {
                                  const ps = prompt(
                                    `List ${expanded.name} for sale (book ${fmtMoney(f.bookValue)} min, 1.5× max):`,
                                    String(Math.round(f.bookValue * 1.1)),
                                  );
                                  if (!ps) return;
                                  const price = parseInt(ps, 10);
                                  if (!Number.isFinite(price)) return;
                                  const r = s.listSecondHand(f.id, price);
                                  if (!r.ok) alert(r.error);
                                }}
                              >
                                Sell
                              </button>
                            )}
                            {f.status !== "retired" && (
                              <button
                                className="text-negative hover:underline"
                                onClick={() => {
                                  if (confirm(`Retire ${expanded.name} (${f.id.slice(-6)})?`))
                                    s.decommissionAircraft(f.id);
                                }}
                              >
                                Retire
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
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
      )}

      {/* ── Aircraft market modal ─────────────────────────────────── */}
      <AircraftMarketModal
        open={buyOpen}
        onClose={() => { setBuyOpen(false); setError(null); }}
        currentQuarter={s.currentQuarter}
        marketQuery={marketQuery}
        setMarketQuery={setMarketQuery}
        secondHandListings={listings}
        onOrder={(specId, type) => setOrdering({ specId, type })}
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
