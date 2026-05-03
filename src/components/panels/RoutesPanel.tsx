"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge, Input, Modal, ModalBody, ModalFooter, ModalHeader, Button } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { classFareRangeForDoctrine, distanceBetween, effectiveRangeKm, maxRouteDailyFrequency, routeDemandPerDay } from "@/lib/engine";
import type { CityTier, PricingTier } from "@/types/game";
import { cn } from "@/lib/cn";
import { AlertTriangle, Pause, Play, Plus, X } from "lucide-react";
import { RouteSetupModal, BidRow } from "@/components/game/RouteSetupModal";
import { PanelSubheader } from "@/components/game/PanelSubheader";
import { toast } from "@/store/toasts";

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
  type SortKey = "profit" | "load" | "revenue" | "fuel";
  type FilterKey = "all" | "passenger" | "cargo" | "losing";
  const [sortKey, setSortKey] = useState<SortKey>("profit");
  const [filterKey, setFilterKey] = useState<FilterKey>("all");
  // Branded close-route confirmation. Replaces the legacy native
  // confirm() so the close flow stays on-brand and we can spell out
  // the slot-forfeit consequence.
  const [closeRouteConfirm, setCloseRouteConfirm] = useState<{
    routeId: string;
    originCode: string;
    destCode: string;
  } | null>(null);
  // Pending-route cancel confirmation (replaces inline confirm() in
  // RouteDetailModal). Uses a context object so the modal can show
  // the full OD pair without coupling to RouteDetailModal state.
  const [cancelPendingConfirm, setCancelPendingConfirm] = useState<{
    routeId: string;
    originCode: string;
    destCode: string;
  } | null>(null);

  // "New route" flow — opened via the panel's New-Route button so the
  // player doesn't have to use the world map to start a route.
  // Two-stage state: pick origin → pick dest → forward to RouteSetupModal.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerOrigin, setPickerOrigin] = useState<string | null>(null);
  const [pickerDest, setPickerDest] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  // If GameCanvas asked us to focus a specific route (because the player
  // clicked an existing route's endpoints on the map), auto-open it once.
  const focusedRouteId = useUi((u) => u.focusedRouteId);
  const setFocusedRouteId = useUi((u) => u.setFocusedRouteId);
  // Consume the cross-component "focus this route" signal from
  // GameCanvas. setState-in-effect is intentional — we're syncing
  // local panel state against an external store value, then clearing
  // the signal. Not a render cascade.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (focusedRouteId) {
      setActiveRouteId(focusedRouteId);
      setFocusedRouteId(null);  // consume the signal
    }
  }, [focusedRouteId, setFocusedRouteId]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const rows = useMemo(() => {
    if (!player) return [];
    const q = query.trim().toUpperCase();
    // Sort by DIRECT contribution (revenue minus the costs the route
    // itself drives — fuel + slot), NOT fully-loaded profit. Reasoning:
    // a 100%-load Tier-1 trunk route can show negative Q profit only
    // because it's absorbing its revenue-share of company overhead;
    // operationally it's healthy. Sorting by fully-loaded would push
    // strong direct performers to the bottom and steer players to
    // close them, which is the wrong action — the right action is
    // either upsize the aircraft (if sold out) or cut overhead. The
    // network-wide KPI strip below still uses the fully-loaded number
    // so it reconciles with the team P&L.
    const profitOf = (r: typeof player.routes[number]) =>
      r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
    return player.routes
      // Include pending routes too — they're awaiting auction resolution
      // and the player needs to see them.
      .filter(
        (r) =>
          r.status === "active" ||
          r.status === "suspended" ||
          r.status === "pending",
      )
      .filter((r) => {
        // Type filter chip
        if (filterKey === "passenger" && r.isCargo) return false;
        if (filterKey === "cargo" && !r.isCargo) return false;
        if (filterKey === "losing" && (r.consecutiveLosingQuarters ?? 0) < 2) return false;
        if (!q) return true;
        return (
          r.originCode.includes(q) ||
          r.destCode.includes(q) ||
          CITIES_BY_CODE[r.originCode]?.name.toUpperCase().includes(q) ||
          CITIES_BY_CODE[r.destCode]?.name.toUpperCase().includes(q)
        );
      })
      .sort(
        // Pending routes always float to top so the player sees their
        // bids; suspended sink to the bottom; the rest sort by the
        // user-chosen key.
        (a, b) => {
          const ra =
            a.status === "pending" ? -2 : a.status === "active" ? 0 : 1;
          const rb =
            b.status === "pending" ? -2 : b.status === "active" ? 0 : 1;
          if (ra !== rb) return ra - rb;
          switch (sortKey) {
            case "load":
              return b.avgOccupancy - a.avgOccupancy;
            case "revenue":
              return b.quarterlyRevenue - a.quarterlyRevenue;
            case "fuel":
              return b.quarterlyFuelCost - a.quarterlyFuelCost;
            case "profit":
            default:
              return profitOf(b) - profitOf(a);
          }
        },
      );
  }, [player, query, sortKey, filterKey]);

  if (!player) return null;

  const activeRoute = activeRouteId
    ? player.routes.find((r) => r.id === activeRouteId) ?? null
    : null;

  // Two profit views, two purposes:
  //   • routeProfit (direct contribution = revenue − fuel − slot) is
  //     the per-route operational signal. This drives the row display
  //     in the route list and the streak basis for "Losing 2Q+".
  //   • routeNetProfit (revenue − allocated overhead share) is the
  //     accounting view. Sums across the network to the team's net
  //     profit so the KPI strip reconciles with the financials panel.
  // Surfacing both prevents the "100% load Tier-1 trunk reads as a
  // bad route" trap — players were closing strong direct performers
  // because the fully-loaded number went red.
  const activeRoutes = player.routes.filter((r) => r.status === "active");
  const routeProfit = (r: typeof activeRoutes[number]) =>
    r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
  const routeNetProfit = (r: typeof activeRoutes[number]) =>
    r.quarterlyAllocatedCost !== undefined
      ? r.quarterlyRevenue - r.quarterlyAllocatedCost
      : r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
  const totalQRev = activeRoutes.reduce((s, r) => s + r.quarterlyRevenue, 0);
  const totalQProfit = activeRoutes.reduce((s, r) => s + routeNetProfit(r), 0);
  const avgLoad = activeRoutes.length > 0
    ? activeRoutes.reduce((s, r) => s + r.avgOccupancy, 0) / activeRoutes.length
    : 0;
  const totalWeeklyFreq = activeRoutes.reduce((s, r) => s + Math.round(r.dailyFrequency * 7), 0);
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

      {/* Tournament window banner — fires only during the relevant rounds.
          The host city is already shown in news + decisions, this just
          gives the player a persistent reminder while building routes. */}
      <TournamentBanner />

      {/* Sticky subheader: search + filters stay pinned at the top of
          the panel scroll region so the player can re-filter without
          losing their place in a long route list. */}
      <PanelSubheader>
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <Input
            placeholder="Search by code or city name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="flex-1 min-w-[180px] h-9 text-[0.875rem]"
          />
          <div className="text-[0.75rem] text-ink-muted tabular shrink-0">
            {rows.length} of {player.routes.filter((r) => r.status !== "closed").length}
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setPickerOrigin(player.hubCode);  // sensible default
              setPickerDest(null);
              setPickerOpen(true);
            }}
            className="shrink-0"
          >
            <Plus size={13} className="mr-1" /> New route
          </Button>
        </div>

        {/* Filter + sort chips */}
        <div className="flex items-center gap-1.5 flex-wrap text-[0.75rem]">
          <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted mr-1">Filter</span>
        {([
          { k: "all", label: "All" },
          { k: "passenger", label: "Passenger" },
          { k: "cargo", label: "Cargo" },
          { k: "losing", label: "Losing 2Q+" },
        ] as Array<{ k: FilterKey; label: string }>).map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setFilterKey(k)}
            className={cn(
              "px-2 py-0.5 rounded-md border transition-colors",
              filterKey === k
                ? "bg-primary text-primary-fg border-primary font-medium"
                : "border-line text-ink-muted hover:bg-surface-hover",
            )}
          >
            {label}
          </button>
        ))}
        <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted mx-1 ml-3">Sort</span>
        {([
          { k: "profit", label: "Profit" },
          { k: "load", label: "Occupancy" },
          { k: "revenue", label: "Revenue" },
          { k: "fuel", label: "Fuel" },
        ] as Array<{ k: SortKey; label: string }>).map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setSortKey(k)}
            className={cn(
              "px-2 py-0.5 rounded-md border transition-colors",
              sortKey === k
                ? "bg-accent text-white border-accent font-medium"
                : "border-line text-ink-muted hover:bg-surface-hover",
            )}
          >
            {label}
          </button>
        ))}
        </div>
      </PanelSubheader>

      {rows.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          {query
            ? "No routes match that search."
            : "No routes yet — click New route above, or pick a city on the map."}
        </div>
      ) : (
        <div className="rounded-md border border-line overflow-hidden">
          <table className="w-full text-[0.8125rem] table-fixed">
            <thead>
              <tr className="bg-surface-2 border-b border-line">
                <Th className="w-[30%]">Route</Th>
                <Th className="text-right w-[80px]">Occupancy</Th>
                <Th className="text-right w-[80px]">Freq</Th>
                <Th className="text-right w-[120px]">Q revenue</Th>
                <Th
                  className="text-right w-[140px]"
                  title="Direct contribution: revenue minus fuel and slot costs for this route. Excludes the route's share of company overhead (staff, marketing, maintenance, depreciation, interest, taxes), which is shown in the route detail modal as 'Net after overhead'."
                >
                  Direct profit
                </Th>
                <Th className="text-right w-[100px]">Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const profit = routeProfit(r);
                const origin = CITIES_BY_CODE[r.originCode];
                const dest = CITIES_BY_CODE[r.destCode];
                const suspended = r.status === "suspended";
                const pending = r.status === "pending";
                const losing = (r.consecutiveLosingQuarters ?? 0) >= 2;
                return (
                  <tr
                    key={r.id}
                    onClick={() => setActiveRouteId(r.id)}
                    onKeyDown={(e) => {
                      // Enter or Space opens the route detail modal —
                      // matches the click handler so keyboard users
                      // aren't shut out of editing routes.
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setActiveRouteId(r.id);
                      }
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open route ${r.originCode} to ${r.destCode}, ${Math.round(r.avgOccupancy * 100)}% occupancy, ${Math.round(r.dailyFrequency * 7)} weekly flights, ${r.status}`}
                    className={cn(
                      "border-b border-line last:border-0 cursor-pointer",
                      "hover:bg-surface-hover transition-colors",
                      "focus-visible:outline-none focus-visible:bg-surface-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                      suspended && "opacity-60",
                      pending && "bg-[var(--warning-soft)]/20",
                    )}
                  >
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-ink font-medium">
                          {r.originCode} → {r.destCode}
                        </span>
                        {r.isCargo && (
                          <Badge tone="warning">Cargo</Badge>
                        )}
                        {/* Triage health badges (recommendation #10).
                            Each tag flags one specific concern so the
                            player can scan the table and act. */}
                        {(() => {
                          const tags: Array<{ tone: "negative" | "warning" | "info"; label: string; title: string }> = [];
                          // Dormant: active but no operating aircraft
                          const hasAc = r.aircraftIds.some((id) =>
                            player.fleet.find((f) => f.id === id && f.status === "active"),
                          );
                          if (r.status === "active" && !hasAc) {
                            tags.push({
                              tone: "warning",
                              label: "No aircraft",
                              title: "Active route with no operating aircraft assigned. Slots are leased but no flights are scheduled.",
                            });
                          }
                          // Pending auction
                          if (pending) {
                            tags.push({
                              tone: "info",
                              label: "Bid pending",
                              title: "Slot bid resolves at quarter close.",
                            });
                          }
                          // Losing money 2Q+
                          if (losing) {
                            tags.push({
                              tone: "negative",
                              label: "Losing 2Q+",
                              title: "Two consecutive losing quarters. Reprice, suspend, or close.",
                            });
                          }
                          // Underloaded — under 50% occupancy
                          if (r.status === "active" && r.avgOccupancy > 0 && r.avgOccupancy < 0.5) {
                            tags.push({
                              tone: "warning",
                              label: "Underloaded",
                              title: `${Math.round(r.avgOccupancy * 100)}% avg occupancy. Cut frequency or drop pricing tier.`,
                            });
                          }
                          // Aircraft mismatch — pax aircraft on cargo route or vice versa
                          if (r.aircraftIds.length > 0) {
                            const wrongFleet = r.aircraftIds.some((id) => {
                              const f = player.fleet.find((x) => x.id === id);
                              if (!f) return false;
                              const spec = AIRCRAFT_BY_ID[f.specId];
                              if (!spec) return false;
                              return r.isCargo
                                ? spec.family !== "cargo"
                                : spec.family !== "passenger";
                            });
                            if (wrongFleet) {
                              tags.push({
                                tone: "negative",
                                label: "Mismatch",
                                title: r.isCargo
                                  ? "Passenger aircraft on a cargo route — economics will be off."
                                  : "Cargo aircraft on a passenger route — no seats to sell.",
                              });
                            }
                          }
                          return tags.map((t) => (
                            <Badge key={t.label} tone={t.tone} title={t.title}>
                              {t.label}
                            </Badge>
                          ));
                        })()}
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
                      {Math.round(r.dailyFrequency * 7)}/wk
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
                      {pending ? (
                        <Badge tone="warning" title="Bid pending — auction at quarter close">
                          Pending
                        </Badge>
                      ) : suspended ? (
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
            setCloseRouteConfirm({
              routeId: activeRoute.id,
              originCode: activeRoute.originCode,
              destCode: activeRoute.destCode,
            });
          }}
          onCancelPending={() => {
            setCancelPendingConfirm({
              routeId: activeRoute.id,
              originCode: activeRoute.originCode,
              destCode: activeRoute.destCode,
            });
          }}
        />
      )}

      {/* Close-route confirm — replaces legacy native confirm(). */}
      <Modal open={!!closeRouteConfirm} onClose={() => setCloseRouteConfirm(null)}>
        {closeRouteConfirm && (
          <>
            <ModalHeader>
              <h2 className="font-display text-[1.5rem] text-ink flex items-center gap-2">
                <AlertTriangle size={18} className="text-warning shrink-0" />
                Close {closeRouteConfirm.originCode} → {closeRouteConfirm.destCode}?
              </h2>
              <p className="text-ink-muted text-[0.8125rem] mt-1">
                Aircraft return to idle and become available for new routes.
                The slots at both endpoints are released back to the auction
                pool — you may need to re-bid (and pay) to use them again.
              </p>
            </ModalHeader>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setCloseRouteConfirm(null)}>
                Keep route
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  closeRoute(closeRouteConfirm.routeId);
                  setCloseRouteConfirm(null);
                  setActiveRouteId(null);
                }}
              >
                Close route
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* Cancel-pending-route confirm. Note: pending routes already
          paid/queued slot bids; cancelling here only frees the aircraft.
          The bid sits in the slot market until released there. */}
      <Modal open={!!cancelPendingConfirm} onClose={() => setCancelPendingConfirm(null)}>
        {cancelPendingConfirm && (
          <>
            <ModalHeader>
              <h2 className="font-display text-[1.5rem] text-ink flex items-center gap-2">
                <AlertTriangle size={18} className="text-warning shrink-0" />
                Cancel pending route {cancelPendingConfirm.originCode} → {cancelPendingConfirm.destCode}?
              </h2>
              <p className="text-ink-muted text-[0.8125rem] mt-1">
                Aircraft return to idle. Slot bids stay queued for the next
                auction — release them in the Slot Market panel if you don&apos;t
                want to spend.
              </p>
            </ModalHeader>
            <ModalFooter>
              <Button variant="ghost" onClick={() => setCancelPendingConfirm(null)}>
                Keep pending
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  const r = useGame.getState().cancelPendingRoute(cancelPendingConfirm.routeId);
                  setCancelPendingConfirm(null);
                  if (!r.ok) {
                    toast.negative("Cancel failed", r.error ?? "Unable to cancel pending route.");
                  } else {
                    setActiveRouteId(null);
                  }
                }}
              >
                Cancel pending route
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      {/* New-route picker — opened from the panel's "New route" button. */}
      <NewRoutePicker
        open={pickerOpen}
        origin={pickerOrigin}
        dest={pickerDest}
        onOriginChange={setPickerOrigin}
        onDestChange={setPickerDest}
        onCancel={() => setPickerOpen(false)}
        onConfirm={() => {
          if (pickerOrigin && pickerDest) {
            setPickerOpen(false);
            setSetupOpen(true);
          }
        }}
        ownedCodes={
          new Set([
            player.hubCode,
            ...player.secondaryHubCodes,
            ...player.routes
              .filter((r) => r.status !== "closed")
              .flatMap((r) => [r.originCode, r.destCode]),
          ])
        }
      />

      {/* Hand off to the existing route setup flow once both endpoints are picked. */}
      <RouteSetupModal
        open={setupOpen}
        origin={pickerOrigin}
        dest={pickerDest}
        onClose={() => {
          setSetupOpen(false);
          setPickerOrigin(null);
          setPickerDest(null);
        }}
      />
    </div>
  );
}

/**
 * Two-input picker: searchable origin + destination dropdowns. When both
 * are set, the player can confirm and hand off to RouteSetupModal.
 *
 * Owned-airports float to the top of each list (hub, secondaries, anything
 * already touched by an existing route) since those are the codes the
 * player most often needs.
 */
function NewRoutePicker({
  open, origin, dest, ownedCodes,
  onOriginChange, onDestChange, onCancel, onConfirm,
}: {
  open: boolean;
  origin: string | null;
  dest: string | null;
  ownedCodes: Set<string>;
  onOriginChange: (code: string | null) => void;
  onDestChange: (code: string | null) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [search, setSearch] = useState("");
  const [picking, setPicking] = useState<"origin" | "dest" | null>(null);

  // When picking destination AND we have an origin, sort by distance
  // ascending so the player can see "what's nearby". Otherwise (origin
  // picker, no origin yet) keep the network-first / tier+name fallback.
  const sortRef = picking === "dest" ? origin : null;
  const sortedCities = useMemo(
    () =>
      [...CITIES].map((c) => ({
        city: c,
        distance: sortRef ? distanceBetween(sortRef, c.code) : 0,
      })).sort((a, b) => {
        // Owned (network) cities still float to the top — saves
        // hunting for hub/secondary in long lists.
        const aOwn = ownedCodes.has(a.city.code) ? 0 : 1;
        const bOwn = ownedCodes.has(b.city.code) ? 0 : 1;
        if (aOwn !== bOwn) return aOwn - bOwn;
        if (sortRef) return a.distance - b.distance;
        return a.city.tier - b.city.tier || a.city.name.localeCompare(b.city.name);
      }),
    [ownedCodes, sortRef],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedCities;
    return sortedCities.filter(
      ({ city: c }) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q) ||
        c.regionName.toLowerCase().includes(q),
    );
  }, [sortedCities, search]);

  // Group filtered cities by region for the collapsed view. Owned
  // ("Your network") cities pulled out to the top. Within each
  // region: keep the parent sort order (distance asc when from-origin).
  const grouped = useMemo(() => {
    const network = filtered.filter((x) => ownedCodes.has(x.city.code));
    const others = filtered.filter((x) => !ownedCodes.has(x.city.code));
    const byRegion = new Map<string, typeof others>();
    for (const x of others) {
      const list = byRegion.get(x.city.regionName) ?? [];
      list.push(x);
      byRegion.set(x.city.regionName, list);
    }
    const regions = Array.from(byRegion.entries()).sort(([a], [b]) => a.localeCompare(b));
    return { network, regions };
  }, [filtered, ownedCodes]);

  const dist =
    origin && dest && origin !== dest ? distanceBetween(origin, dest) : 0;

  function pick(code: string) {
    if (picking === "origin") {
      onOriginChange(code);
      // Auto-advance to destination picker if dest isn't set yet
      if (!dest && code !== dest) {
        setPicking("dest");
        setSearch("");
        return;
      }
    } else if (picking === "dest") {
      if (code === origin) return; // can't pick same as origin
      onDestChange(code);
    }
    setPicking(null);
    setSearch("");
  }

  return (
    <Modal open={open} onClose={onCancel} className="w-[min(560px,calc(100vw-2rem))]">
      <ModalHeader>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge tone="accent">New route</Badge>
        </div>
        <h2 className="font-display text-[1.5rem] text-ink leading-tight">
          Pick origin and destination
        </h2>
        <p className="text-[0.8125rem] text-ink-muted mt-1">
          Choose the two endpoints. Aircraft, frequency, and pricing are
          configured on the next step.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <CityField
            label="From"
            code={origin}
            placeholder="Pick origin"
            highlightHub
            onClick={() => {
              setPicking("origin");
              setSearch("");
            }}
            onClear={() => onOriginChange(null)}
            isOwned={origin ? ownedCodes.has(origin) : false}
          />
          <CityField
            label="To"
            code={dest}
            placeholder="Pick destination"
            onClick={() => {
              setPicking("dest");
              setSearch("");
            }}
            onClear={() => onDestChange(null)}
            isOwned={dest ? ownedCodes.has(dest) : false}
          />
        </div>

        {origin && dest && origin !== dest && (
          <div className="rounded-md border border-line bg-surface-2/40 px-3 py-2 text-[0.8125rem] text-ink-2">
            Great-circle distance:{" "}
            <strong className="font-mono tabular text-ink">
              {Math.round(dist).toLocaleString()} km
            </strong>
          </div>
        )}

        {origin && dest && origin === dest && (
          <div className="rounded-md border border-negative bg-[var(--negative-soft)] px-3 py-2 text-[0.8125rem] text-negative">
            Origin and destination must be different airports.
          </div>
        )}

        {picking !== null && (
          <div className="rounded-md border border-primary bg-[rgba(20,53,94,0.04)] p-2.5">
            <div className="text-[0.6875rem] uppercase tracking-wider text-primary font-semibold mb-1.5">
              Pick {picking === "origin" ? "origin" : "destination"}
            </div>
            <Input
              autoFocus
              placeholder="Search by code, city, or region…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="mb-2 h-9 text-[0.875rem]"
            />
            <div className="max-h-[320px] overflow-y-auto rounded-md border border-line bg-surface">
              {filtered.length === 0 ? (
                <div className="py-6 text-center text-[0.8125rem] text-ink-muted">
                  No cities match.
                </div>
              ) : (
                <div>
                  {/* Network section — owned cities first if any */}
                  {grouped.network.length > 0 && (
                    <RegionSection
                      label="Your network"
                      entries={grouped.network}
                      sortRef={sortRef}
                      origin={origin}
                      picking={picking}
                      onPick={pick}
                    />
                  )}
                  {grouped.regions.map(([regionName, entries]) => (
                    <RegionSection
                      key={regionName}
                      label={regionName}
                      entries={entries}
                      sortRef={sortRef}
                      origin={origin}
                      picking={picking}
                      onPick={pick}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button
          variant="primary"
          disabled={!origin || !dest || origin === dest}
          onClick={onConfirm}
        >
          Continue →
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function CityField({
  label, code, placeholder, isOwned, highlightHub,
  onClick, onClear,
}: {
  label: string;
  code: string | null;
  placeholder: string;
  isOwned: boolean;
  highlightHub?: boolean;
  onClick: () => void;
  onClear: () => void;
}) {
  const city = code ? CITIES_BY_CODE[code] : null;
  return (
    <div>
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-1">
        {label}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={onClick}
          className={cn(
            "flex-1 rounded-md border px-3 py-2 text-left transition-colors",
            city
              ? highlightHub && isOwned
                ? "border-primary bg-[rgba(20,53,94,0.04)]"
                : "border-line hover:bg-surface-hover"
              : "border-dashed border-line text-ink-muted hover:bg-surface-hover",
          )}
        >
          {city ? (
            <>
              <div className="font-mono font-semibold text-ink text-[0.9375rem] leading-tight">
                {city.code}
              </div>
              <div className="text-[0.6875rem] text-ink-muted truncate">
                {city.name}
              </div>
            </>
          ) : (
            <div className="text-[0.875rem] py-1.5">{placeholder}</div>
          )}
        </button>
        {city && (
          <button
            onClick={onClear}
            aria-label="Clear"
            className="w-8 h-8 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center"
          >
            <X size={14} />
          </button>
        )}
      </div>
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
  children, className, title,
}: {
  children?: React.ReactNode;
  className?: string;
  /** Native HTML title attribute — surfaces a tooltip on hover. Used to
   *  explain non-obvious column semantics (e.g. "Direct profit"
   *  excludes allocated overhead). */
  title?: string;
}) {
  return (
    <th
      className={cn(
        "text-left px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted",
        className,
      )}
      title={title}
    >
      {children}
    </th>
  );
}

// ─── Detail modal with edit ────────────────────────────────────────

function RouteDetailModal({
  open, route, onClose, onSuspend, onResume, onClose_close, onCancelPending,
}: {
  open: boolean;
  route: ReturnType<typeof selectPlayer> extends null ? never : NonNullable<ReturnType<typeof selectPlayer>>["routes"][number];
  onClose: () => void;
  onSuspend: () => void;
  onResume: () => void;
  onClose_close: () => void;
  /** Open the branded cancel-pending confirm modal at the panel level.
   *  We bubble up rather than rendering inline so all destructive
   *  confirms share the same UX in RoutesPanel. */
  onCancelPending: () => void;
}) {
  const s = useGame();
  const player = selectPlayer(s);
  const updateRoute = useGame((g) => g.updateRoute);
  const submitSlotBid = useGame((g) => g.submitSlotBid);

  // UI works in WEEKLY frequency (engine still stores dailyFrequency).
  const [weeklyFreq, setWeeklyFreq] = useState<number>(Math.round(route.dailyFrequency * 7));
  const [tier, setTier] = useState<PricingTier>(route.pricingTier);
  const [econFare, setEconFare] = useState<number | null>(route.econFare ?? null);
  const [busFare, setBusFare] = useState<number | null>(route.busFare ?? null);
  const [firstFare, setFirstFare] = useState<number | null>(route.firstFare ?? null);
  const [cargoRate, setCargoRate] = useState<number | null>(route.cargoRatePerTonne ?? null);
  const [selectedPlaneIds, setSelectedPlaneIds] = useState<string[]>(route.aircraftIds);
  const [error, setError] = useState<string | null>(null);
  // Inline slot-bid state — when the player tries to lift weeklyFreq
  // beyond their current slot allocation, render a BidRow instead of
  // the legacy "Not enough slots" error so they can resolve it without
  // closing the modal. Keyed by airport code (origin or dest).
  const [bidPrices, setBidPrices] = useState<Record<string, number>>({});
  const [bidSlots, setBidSlots] = useState<Record<string, number>>({});

  // Auto-clamp weeklyFreq when aircraft selection changes — fewer planes
  // means a lower physics cap, and the slider/value MUST drop to match.
  // PRD update: removing an aircraft from a route should automatically
  // reduce capacity. Hooks must run before early-return so we compute
  // these even when player is null (clampMaxWeekly = 0 in that case).
  const clampSpecIds = selectedPlaneIds
    .map((id) => player?.fleet.find((f) => f.id === id)?.specId)
    .filter((x): x is string => !!x);
  const clampAircraftForPhysics = selectedPlaneIds
    .map((id) => {
      const f = player?.fleet.find((plane) => plane.id === id);
      if (!f) return null;
      return {
        specId: f.specId,
        engineUpgrade: f.engineUpgrade ?? null,
        cargoBelly: f.cargoBelly,
        doctrine: player?.doctrine,
      };
    })
    .filter((x): x is NonNullable<typeof x> => !!x);
  const clampMaxDaily = clampSpecIds.length > 0
    ? maxRouteDailyFrequency(clampSpecIds, route.distanceKm, clampAircraftForPhysics)
    : 0;
  const clampMaxWeekly = Math.round(clampMaxDaily * 7);
  // Clamp weeklyFreq when the engine-derived ceiling shifts (aircraft
  // selection / range / cargo belly all change clampMaxWeekly). The
  // setState here is intentional — sync against derived data, not a
  // cascading render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (clampMaxWeekly === 0 && weeklyFreq !== 0) {
      setWeeklyFreq(0);
    } else if (clampMaxWeekly > 0 && weeklyFreq > clampMaxWeekly) {
      setWeeklyFreq(clampMaxWeekly);
    }
  }, [clampMaxWeekly, weeklyFreq]);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (!player) return null;

  const origin = CITIES_BY_CODE[route.originCode];
  const dest = CITIES_BY_CODE[route.destCode];
  // Two profit numbers, two purposes:
  //   directContribution = revenue − fuel − slot lease for THIS route.
  //     This is the operational signal: did the route itself cover
  //     the costs the route itself drove? Used as the headline number
  //     and as the streak basis for the "Losing 2Q+" filter.
  //   fullyLoadedNet = revenue − route's allocated share of every
  //     team-level cost (staff, marketing, maintenance, depreciation,
  //     interest, taxes, hub fees, slot leases, etc). Used as the
  //     accounting view so the route grid reconciles to the team P&L
  //     net profit.
  const directContribution =
    route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost;
  const fullyLoadedNet =
    route.quarterlyAllocatedCost !== undefined
      ? route.quarterlyRevenue - route.quarterlyAllocatedCost
      : directContribution;
  const econRange = classFareRangeForDoctrine(route.distanceKm, "econ", player.doctrine);
  const busRange = classFareRangeForDoctrine(route.distanceKm, "bus", player.doctrine);
  const firstRange = classFareRangeForDoctrine(route.distanceKm, "first", player.doctrine);

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

  // Show every active aircraft that is either: idle, on THIS route, or
  // has a stale routeId pointing to a deleted/closed route (treated as idle).
  const idleOrOnRoute = player.fleet.filter((f) => {
    if (f.status !== "active") return false;
    if (!f.routeId) return true;
    if (f.routeId === route.id) return true;
    const stale = player.routes.find((rt) => rt.id === f.routeId);
    return !stale || stale.status === "closed";
  });

  // ── Slot shortfall — replicates updateRoute's check so the UI can
  //    inline-render a BidRow instead of bouncing on save with the
  //    "Not enough slots" error. We exclude THIS route's contribution
  //    from "usedByOthers" so the math is symmetric with the store.
  const proposedWeekly = Math.max(0, Math.round((weeklyFreq / 7) * 7));
  const shortfallAt = (code: string) => {
    const slotsHeld = player.airportLeases?.[code]?.slots ?? 0;
    const usedByOthers = player.routes
      .filter((r) =>
        r.id !== route.id &&
        (r.status === "active" || r.status === "suspended" || r.status === "pending") &&
        (r.originCode === code || r.destCode === code),
      )
      .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
    return Math.max(0, usedByOthers + proposedWeekly - slotsHeld);
  };
  const shortfallOrigin = shortfallAt(route.originCode);
  const shortfallDest = shortfallAt(route.destCode);
  const hasShortfall = shortfallOrigin > 0 || shortfallDest > 0;

  // ── Demand vs capacity projection — passenger uses pax/seats, cargo
  //    uses tonnes. Read-only forecast that helps the player gauge
  //    "is this aircraft set sized right for the demand on this OD pair?"
  const projection = (() => {
    if (selectedPlaneIds.length === 0 || weeklyFreq < 1) return null;
    const dailyFreq = Math.max(1 / 7, weeklyFreq / 7);
    if (route.isCargo) {
      const tonnesPerFlight = selectedPlaneIds.reduce((sum, id) => {
        const p = player.fleet.find((f) => f.id === id);
        if (!p) return sum;
        const spec = AIRCRAFT_BY_ID[p.specId];
        return sum + (spec?.cargoTonnes ?? 0);
      }, 0);
      const dailyCapacity = tonnesPerFlight * dailyFreq;
      if (dailyCapacity === 0) return null;
      const o = CITIES_BY_CODE[route.originCode];
      const d = CITIES_BY_CODE[route.destCode];
      if (!o || !d) return null;
      const dailyBusinessO = o.business * Math.pow(1 + o.businessGrowth / 100 / 4, s.currentQuarter - 1);
      const dailyBusinessD = d.business * Math.pow(1 + d.businessGrowth / 100 / 4, s.currentQuarter - 1);
      const demand = Math.min(dailyBusinessO, dailyBusinessD);
      const occ = demand > 0 ? Math.min(1, demand / dailyCapacity) : 0;
      return { kind: "cargo" as const, demand, capacity: dailyCapacity, occupancy: occ };
    }
    const demand = routeDemandPerDay(route.originCode, route.destCode, s.currentQuarter).total;
    // Capacity bug fix (matches engine.ts): each daily flight uses ONE
    // plane's seats, not the sum across planes. dailyFreq is already
    // the total daily flights across the fleet, so capacity is
    // (avg seats per flight) × dailyFreq.
    let seatsSum = 0;
    let seatedPlaneCount = 0;
    for (const id of selectedPlaneIds) {
      const p = player.fleet.find((f) => f.id === id);
      if (!p) continue;
      const spec = AIRCRAFT_BY_ID[p.specId];
      const seats = p.customSeats ?? spec?.seats;
      if (!seats) continue;
      seatsSum += seats.first + seats.business + seats.economy;
      seatedPlaneCount += 1;
    }
    const avgSeatsPerFlight = seatedPlaneCount > 0 ? seatsSum / seatedPlaneCount : 0;
    const dailyCapacity = avgSeatsPerFlight * dailyFreq;
    if (dailyCapacity === 0) return null;
    const occ = Math.min(1, demand / dailyCapacity);
    return { kind: "passenger" as const, demand, capacity: dailyCapacity, occupancy: occ };
  })();

  // Are all required bids set when there's a shortfall? Save's split
  // path uses this to gate the button.
  const allBidsSet =
    !hasShortfall ||
    ((shortfallOrigin === 0 || bidPrices[route.originCode] !== undefined) &&
      (shortfallDest === 0 || bidPrices[route.destCode] !== undefined));

  function save() {
    // Reject empty aircraft assignment — earlier the modal happily
    // saved aircraftIds=[] with a positive frequency, so the route
    // would stay "active" earning no revenue while still consuming
    // slots until the player manually closed it.
    if (selectedPlaneIds.length === 0) {
      setError("Pick at least one aircraft, or close the route from the routes list.");
      return;
    }
    // ── Path A: shortfall + bids set → submit each bid via the auction
    //    queue, then save the rest of the patch with the *current*
    //    daily frequency (NOT the bumped one). The frequency will
    //    auto-bump after the auction clears next quarter close. This
    //    replaces the old "save fails → see error message" UX.
    if (hasShortfall) {
      if (!allBidsSet) {
        setError("Set your bid for each shortfall airport below before saving.");
        return;
      }
      const bidErrs: string[] = [];
      if (shortfallOrigin > 0 && bidPrices[route.originCode] !== undefined) {
        const slots = bidSlots[route.originCode] ?? shortfallOrigin;
        const r = submitSlotBid(route.originCode, slots, bidPrices[route.originCode]!);
        if (!r.ok) bidErrs.push(`${route.originCode}: ${r.error}`);
      }
      if (shortfallDest > 0 && bidPrices[route.destCode] !== undefined) {
        const slots = bidSlots[route.destCode] ?? shortfallDest;
        const r = submitSlotBid(route.destCode, slots, bidPrices[route.destCode]!);
        if (!r.ok) bidErrs.push(`${route.destCode}: ${r.error}`);
      }
      if (bidErrs.length > 0) {
        setError(`Slot bid${bidErrs.length === 1 ? "" : "s"} rejected — ${bidErrs.join(" · ")}`);
        return;
      }
      // Save the non-frequency edits at the current daily frequency
      // so the route doesn't break slot caps. Frequency auto-bumps
      // after the auction clears.
      const r = updateRoute(route.id, {
        aircraftIds: selectedPlaneIds,
        dailyFrequency: route.dailyFrequency,
        pricingTier: tier,
        econFare,
        busFare,
        firstFare,
        cargoRatePerTonne: cargoRate,
      });
      if (!r.ok) {
        setError(r.error ?? "Failed to save");
        return;
      }
      toast.info(
        "Slot bids queued",
        "Bids resolve at quarter close — schedule auto-updates if you win the slots.",
      );
      onClose();
      return;
    }

    // Path B: no shortfall → standard save with the new frequency.
    const r = updateRoute(route.id, {
      aircraftIds: selectedPlaneIds,
      // Preserve fractional daily — earlier this snapped 1-3 weekly
      // schedules up to 7/wk and 4-10 to 14/wk by rounding daily to
      // an integer. Now passes through as weekly/7 so the engine
      // and slot-cap math both see the player's real intent.
      dailyFrequency: Math.max(1 / 7, weeklyFreq / 7),
      pricingTier: tier,
      econFare,
      busFare,
      firstFare,
      cargoRatePerTonne: cargoRate,
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
          <Badge
            tone={
              route.status === "pending" ? "warning" :
              route.status === "suspended" ? "warning" :
              "positive"
            }
          >
            {route.status === "pending" ? "Pending bid" :
             route.status === "suspended" ? "Suspended" : "Active"}
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
        {route.status === "pending" && (
          <div className="mt-2 rounded-md border border-warning/40 bg-[var(--warning-soft)] px-3 py-2 text-[0.75rem] text-ink-2 leading-relaxed">
            {/* Phase 4.6 — copy fixed to match actual store behavior.
                Previously claimed "If you're outbid, it cancels and
                aircraft return idle." That's wrong: outbid routes
                stay in pending state with `pendingReason` recorded,
                and aircraft remain reserved to the route until the
                player rebids OR cancels manually. */}
            <strong className="text-warning">Awaiting auction.</strong> Your slot
            bid resolves at end of quarter. The route will activate at the lower
            of (your intended weekly frequency) and (slots actually won). If
            you&apos;re outbid, the route stays pending — re-bid next quarter,
            or cancel manually to free the aircraft.
            {route.pendingReason && (
              <div className="mt-1.5 pt-1.5 border-t border-warning/20 font-mono text-[0.6875rem] text-ink-2">
                Last auction: {route.pendingReason}
              </div>
            )}
          </div>
        )}
      </ModalHeader>
      <ModalBody className="space-y-5 max-h-[60vh] overflow-auto">
        {/* Performance snapshot — split into TWO profit views so a
            healthy route doesn't read as a bad one just because it's
            absorbing its share of company overhead.
              • Direct contribution = revenue − fuel − slot. The
                operational signal: did this route cover the costs it
                directly drove? Drives the streak + the "Losing 2Q+"
                filter.
              • Net after overhead = revenue − route's allocated share
                of every team-level cost (staff, marketing, maintenance,
                depreciation, interest, taxes, hub fees, lease totals).
                The accounting view; reconciles to team P&L.
            On Tier-1 trunk routes with sold-out load, direct contribution
            is the right number to act on; net after overhead is purely
            informational. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <MiniStat
            label={route.isCargo ? "Cargo occupancy" : "Occupancy"}
            value={fmtPct(route.avgOccupancy * 100, 0)}
            tone={route.avgOccupancy > 0.7 ? "pos" : route.avgOccupancy > 0 && route.avgOccupancy < 0.5 ? "neg" : undefined}
            sub={route.isCargo ? "tonnes shipped / capacity" : "pax / seats"}
          />
          <MiniStat
            label="Q revenue"
            value={fmtMoney(route.quarterlyRevenue)}
            sub={`fuel ${fmtMoney(route.quarterlyFuelCost)} · slot ${fmtMoney(route.quarterlySlotCost)}`}
          />
          <MiniStat
            label="Direct contribution"
            value={fmtMoney(directContribution)}
            tone={directContribution >= 0 ? "pos" : "neg"}
            sub="revenue − fuel − slot"
          />
          <MiniStat
            label="Net after overhead"
            value={fmtMoney(fullyLoadedNet)}
            tone={fullyLoadedNet >= 0 ? "pos" : "neg"}
            sub="after share of company costs"
          />
        </div>

        {/* ── Demand vs capacity projection — restored. Tells the player
            the OD pair's daily demand AND how much of it the currently
            selected aircraft set covers, so they can right-size the
            fleet without flipping back to the route list. */}
        {projection && (
          <div
            className={cn(
              "rounded-md border px-3 py-2.5",
              projection.occupancy < 0.25
                ? "border-negative bg-[var(--negative-soft)]"
                : projection.occupancy < 0.55
                  ? "border-warning bg-[var(--warning-soft)]"
                  : "border-positive bg-[var(--positive-soft)]",
            )}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
                Demand · capacity · projected occupancy
              </span>
              <span
                className={cn(
                  "tabular font-mono text-[0.875rem] font-semibold",
                  projection.occupancy < 0.25
                    ? "text-negative"
                    : projection.occupancy < 0.55
                      ? "text-warning"
                      : "text-positive",
                )}
              >
                {(projection.occupancy * 100).toFixed(0)}%
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 text-[0.75rem]">
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                  Daily demand
                </div>
                <div className="tabular font-mono text-ink font-medium">
                  {Math.round(projection.demand).toLocaleString()}
                  {projection.kind === "cargo" ? " T" : " pax"}
                </div>
              </div>
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                  Daily capacity
                </div>
                <div className="tabular font-mono text-ink font-medium">
                  {Math.round(projection.capacity).toLocaleString()}
                  {projection.kind === "cargo" ? " T" : " seats"}
                </div>
              </div>
              <div>
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                  Coverage
                </div>
                <div className="tabular font-mono text-ink font-medium">
                  {projection.demand > 0
                    ? `${Math.min(100, Math.round((projection.capacity / projection.demand) * 100))}%`
                    : "—"}
                </div>
              </div>
            </div>
            <div className="text-[0.625rem] text-ink-muted leading-snug mt-1.5">
              {projection.kind === "cargo"
                ? "Demand = min(origin, dest) business demand in tonnes (before market-focus + news modifiers)."
                : "Demand = engine-modelled pax/day for this OD pair. Capacity = total seats × daily frequency."}
            </div>
          </div>
        )}

        {/* ── Sold-out + under-served right-sizing hint ─────────────
            Triggers when the route is operationally sold out AND the
            engine-modelled demand significantly exceeds the current
            capacity. This is the case the playtest report surfaced:
            a 100%-load Tier-1 trunk reads as "losing money" only
            because it's covering a fraction of available demand AND
            absorbing fully-loaded overhead. The right action is
            upsize / add frequency — NOT close the route. We show it
            below the demand block so the player sees the shape of the
            problem before the recommendation. */}
        {(() => {
          if (route.isCargo) return null;
          if (!projection || projection.kind !== "passenger") return null;
          const liveOcc = route.avgOccupancy ?? 0;
          const projectedCoverage =
            projection.demand > 0
              ? Math.min(1, projection.capacity / projection.demand)
              : 1;
          const soldOut = liveOcc >= 0.95;
          const underServed = projectedCoverage < 0.67;
          if (!soldOut || !underServed) return null;
          const o = CITIES_BY_CODE[route.originCode];
          const d = CITIES_BY_CODE[route.destCode];
          const tier1Trunk = o?.tier === 1 && d?.tier === 1;
          // Cabin-mismatch check: any aircraft assigned to this route
          // with 0 first AND 0 business seats while the OD has Tier-1
          // business demand on at least one endpoint = premium demand
          // is bleeding to rivals.
          const hasNoPremium = (route.aircraftIds ?? []).every((id) => {
            const p = player.fleet.find((f) => f.id === id);
            if (!p) return false;
            const spec = AIRCRAFT_BY_ID[p.specId];
            const seats = p.customSeats ?? spec?.seats;
            if (!seats) return false;
            return (seats.first ?? 0) === 0 && (seats.business ?? 0) === 0;
          });
          const businessHeavy =
            (o?.tier ?? 4) <= 2 && (d?.tier ?? 4) <= 2;
          const cabinMismatch = hasNoPremium && businessHeavy;
          const coveragePct = Math.round(projectedCoverage * 100);
          return (
            <div className="rounded-md border border-warning/50 bg-[var(--warning-soft)]/60 px-3 py-2.5">
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-warning">
                  Sold out · only {coveragePct}% of demand served
                </span>
              </div>
              <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
                Every flight on this route is full, but you&apos;re leaving
                {" "}
                <strong className="text-ink">
                  {Math.max(0, Math.round(projection.demand - projection.capacity))} pax/day
                </strong>{" "}
                on the table. Add frequency, upsize the aircraft, or both.
                {tier1Trunk && (
                  <> {o?.code}↔{d?.code} is a Tier-1 trunk — under-capacity
                  here is where competitors take share fastest.</>
                )}
              </p>
              {cabinMismatch && (
                <p className="text-[0.8125rem] text-ink-2 leading-relaxed mt-2 pt-2 border-t border-warning/30">
                  <strong className="text-warning">Premium demand unserved:</strong>{" "}
                  the assigned aircraft has zero business or first seats
                  while both endpoints carry significant business demand.
                  A two- or three-cabin airframe (e.g. A321, A330, B777)
                  would unlock higher-yield seats without burning more fuel.
                </p>
              )}
              <p className="text-[0.6875rem] text-ink-muted leading-snug mt-2">
                Note: the &ldquo;Net after overhead&rdquo; figure above
                can read negative on healthy direct contributors when the
                airline carries heavy company overhead. Watch{" "}
                <strong className="text-ink-2">Direct contribution</strong>
                {" "}as the operational signal.
              </p>
            </div>
          );
        })()}

        {/* ── 1. Aircraft assigned — moved to first config step. The route
            economics flow from this choice (frequency cap, cabin classes,
            cargo capability), so picking aircraft first lets every other
            slider reflect the actual hardware. */}
        <div>
          <Label>1 · Aircraft assigned</Label>
          <div className="space-y-1.5 max-h-40 overflow-auto">
            {idleOrOnRoute.map((p) => {
              const spec = AIRCRAFT_BY_ID[p.specId];
              if (!spec) return null;
              // Honour the +10% range upgrade so a paid retrofit
              // actually unlocks the routes the player paid for.
              const effRange = effectiveRangeKm(spec, p.engineUpgrade ?? null);
              const canReach = effRange >= route.distanceKm;
              const cargoMatch = route.isCargo ? spec.family === "cargo" : spec.family === "passenger";
              const selected = selectedPlaneIds.includes(p.id);
              const disabled = !canReach || !cargoMatch;
              const hasUpgrades = p.engineUpgrade || p.fuselageUpgrade || p.ecoUpgrade;
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
                    <div className="text-ink text-[0.875rem] flex items-center gap-1.5 flex-wrap">
                      {spec.name}
                      {p.engineUpgrade === "fuel" && (
                        <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-positive bg-[var(--positive-soft)] px-1.5 py-0.5 rounded" title="Fuel engine retrofit: −10% fuel burn, +10% range">
                          Fuel engine
                        </span>
                      )}
                      {p.engineUpgrade === "power" && (
                        <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-accent bg-[var(--accent-soft)] px-1.5 py-0.5 rounded" title="Power engine retrofit: +10% cruise speed, raises rotation cap">
                          Power engine
                        </span>
                      )}
                      {p.engineUpgrade === "super" && (
                        <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-warning bg-[var(--warning-soft)] px-1.5 py-0.5 rounded" title="Super engine: stacks fuel + power retrofits">
                          Super engine
                        </span>
                      )}
                      {p.fuselageUpgrade && (
                        <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-positive bg-[var(--positive-soft)] px-1.5 py-0.5 rounded" title="Anti-drag fuselage coating: stacks an extra −10% fuel burn">
                          Fuselage
                        </span>
                      )}
                      {p.ecoUpgrade && (
                        <span className="text-[0.5625rem] uppercase tracking-wider font-semibold text-positive bg-[var(--positive-soft)] px-1.5 py-0.5 rounded" title="Eco engine retrofit: −10% fuel burn">
                          Eco
                        </span>
                      )}
                    </div>
                    <div className="text-[0.6875rem] text-ink-muted font-mono">
                      Range {effRange.toLocaleString()} km
                      {hasUpgrades && effRange > spec.rangeKm && (
                        <span className="text-positive"> (+10% upgrade)</span>
                      )}
                      {" · "}
                      {spec.family === "passenger"
                        ? `${spec.seats.first + spec.seats.business + spec.seats.economy} seats`
                        : `${spec.cargoTonnes ?? 0}T cargo`}
                    </div>
                  </div>
                  {!canReach && <Badge tone="negative">Out of range</Badge>}
                  {canReach && !cargoMatch && <Badge tone="warning">{route.isCargo ? "Passenger plane" : "Cargo plane"}</Badge>}
                </label>
              );
            })}
          </div>
        </div>

        {/* ── 2. Frequency — weekly with engine-derived cap */}
        <div>
          <Label>2 · Schedules per week</Label>
          {(() => {
            const specIds = selectedPlaneIds
              .map((id) => player.fleet.find((f) => f.id === id)?.specId)
              .filter((x): x is string => !!x);
            const aircraftForPhysics = selectedPlaneIds
              .map((id) => {
                const f = player.fleet.find((plane) => plane.id === id);
                if (!f) return null;
                return {
                  specId: f.specId,
                  engineUpgrade: f.engineUpgrade ?? null,
                  cargoBelly: f.cargoBelly,
                  doctrine: player.doctrine,
                };
              })
              .filter((x): x is NonNullable<typeof x> => !!x);
            const maxDaily = specIds.length > 0
              ? maxRouteDailyFrequency(specIds, route.distanceKm, aircraftForPhysics)
              : 1;
            const maxWeekly = Math.round(maxDaily * 7);
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

        {/* ── 3. Pricing tier — quick preset that scales every per-class
            fare. Verbose blurb removed per user feedback (the tier
            multipliers on the buttons themselves communicate the
            mechanic). */}
        <div>
          <Label>3 · Pricing tier</Label>
          <div className="grid grid-cols-4 gap-2">
            {(["budget", "standard", "premium", "ultra"] as PricingTier[]).map((t) => {
              const mult = t === "budget" ? "0.5×"
                : t === "standard" ? "1.0×"
                : t === "premium" ? "1.5×" : "2.0×";
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
        </div>

        {/* ── 4. Per-class fares (passenger only) */}
        {!route.isCargo && (
          <div className="space-y-3">
            <Label>4 · Per-class fares (optional override)</Label>
            <FareRow label="Economy" range={econRange} fare={econFare} setFare={setEconFare} active />
            <FareRow label="Business" range={busRange} fare={busFare} setFare={setBusFare} active={hasBus} />
            <FareRow label="First" range={firstRange} fare={firstFare} setFare={setFirstFare} active={hasFirst} />
          </div>
        )}

        {/* ── 4. Cargo rate (cargo only) — same UX shape as the passenger
            fares so the player has a clear way to set fee instead of
            being stuck at the fixed base. */}
        {route.isCargo && (() => {
          const baseRate = route.distanceKm < 3000 ? 3.5 : 5.5;
          const tierMult =
            tier === "budget" ? 0.5 :
            tier === "premium" ? 1.5 :
            tier === "ultra" ? 2.0 : 1.0;
          const tierBaseRate = baseRate * tierMult;
          const minRate = baseRate * 0.5;
          const maxRate = baseRate * 3.0;
          const effective = cargoRate ?? tierBaseRate;
          return (
            <div className="space-y-3">
              <Label>4 · Cargo rate per tonne (optional override)</Label>
              <div className="rounded-md border border-line bg-surface-2/40 p-3 space-y-3">
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-ink-2">
                    Base ${baseRate.toFixed(2)}/T
                    <span className="text-ink-muted"> · {route.distanceKm < 3000 ? "short-haul" : "long-haul"}</span>
                  </span>
                  <span className="text-ink-muted">
                    Tier × {tierMult.toFixed(1)} → ${tierBaseRate.toFixed(2)}/T
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={minRate}
                    max={maxRate}
                    step={0.1}
                    value={effective}
                    onChange={(e) => setCargoRate(parseFloat(e.target.value))}
                    className="flex-1 accent-primary"
                    aria-label="Cargo rate per tonne"
                  />
                  <span className="tabular font-mono text-ink font-semibold w-20 text-right">
                    ${effective.toFixed(2)}/T
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-[0.6875rem] text-ink-muted">
                  <span>Min ${minRate.toFixed(2)}</span>
                  {cargoRate !== null && (
                    <button
                      type="button"
                      onClick={() => setCargoRate(null)}
                      className="text-accent hover:underline"
                    >
                      Reset to tier default
                    </button>
                  )}
                  <span>Max ${maxRate.toFixed(2)}</span>
                </div>
                <p className="text-[0.6875rem] text-ink-muted leading-relaxed">
                  Higher rates extract more revenue per tonne but suppress demand against competitors;
                  lower rates fill capacity at thinner margins.
                </p>
              </div>
            </div>
          );
        })()}

        {/* ── 5. Inline slot shortfall — replaces the legacy "Not enough
            slots" save-fail error. Renders a BidRow per shortfall airport
            with full bid form. On Save the bids submit via submitSlotBid
            and the schedule auto-bumps after the auction clears next
            quarter close. */}
        {hasShortfall && (
          <div>
            <Label>5 · Slots needed — bid to lift schedule</Label>
            <div className="rounded-md border border-warning/40 bg-[var(--warning-soft)]/40 px-3 py-2 mb-2 text-[0.75rem] text-ink-2">
              Lifting to <strong className="text-ink">{weeklyFreq}/wk</strong> needs more
              slots. Auctions resolve at quarter close — you only pay if you win.
            </div>
            {shortfallOrigin > 0 && (
              <BidRow
                airportCode={route.originCode}
                slotsNeeded={shortfallOrigin}
                tier={(CITIES_BY_CODE[route.originCode]?.tier ?? 1) as CityTier}
                price={bidPrices[route.originCode]}
                slots={bidSlots[route.originCode] ?? shortfallOrigin}
                onSlotsChange={(n) =>
                  setBidSlots((prev) => ({ ...prev, [route.originCode]: n }))
                }
                onChange={(p) => setBidPrices((prev) => {
                  if (Number.isNaN(p)) {
                    const next = { ...prev };
                    delete next[route.originCode];
                    return next;
                  }
                  return { ...prev, [route.originCode]: p };
                })}
              />
            )}
            {shortfallDest > 0 && (
              <BidRow
                airportCode={route.destCode}
                slotsNeeded={shortfallDest}
                tier={(CITIES_BY_CODE[route.destCode]?.tier ?? 1) as CityTier}
                price={bidPrices[route.destCode]}
                slots={bidSlots[route.destCode] ?? shortfallDest}
                onSlotsChange={(n) =>
                  setBidSlots((prev) => ({ ...prev, [route.destCode]: n }))
                }
                onChange={(p) => setBidPrices((prev) => {
                  if (Number.isNaN(p)) {
                    const next = { ...prev };
                    delete next[route.destCode];
                    return next;
                  }
                  return { ...prev, [route.destCode]: p };
                })}
              />
            )}
          </div>
        )}

        {/* ── Why this performance — multipliers breakdown. Moved to the
            bottom (collapsible) since it's read-only context the player
            consults rather than configures. */}
        <DemandBreakdown route={route} player={player} />

        {/* ── Competitors on this OD pair. Also bottom — informational. */}
        <CompetitorsTable route={route} />

        {error && (
          <div className="text-negative text-[0.875rem] rounded-md border border-[var(--negative-soft)] bg-[var(--negative-soft)] px-3 py-2">
            {error}
          </div>
        )}
      </ModalBody>
      <ModalFooter className="justify-between">
        <div className="flex items-center gap-2">
          {route.status === "pending" ? (
            <Button
              variant="danger"
              size="sm"
              onClick={onCancelPending}
              title="Cancel this pending route. Aircraft return to idle; slot bids stay queued (release in Slot Market if you don't want to spend)."
            >
              <X size={13} className="mr-1.5" /> Cancel pending route
            </Button>
          ) : (
            <>
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
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {route.status !== "pending" && (
            <Button
              variant="primary"
              onClick={save}
              disabled={hasShortfall && !allBidsSet}
              title={
                hasShortfall && !allBidsSet
                  ? "Set your bid for each shortfall airport above"
                  : undefined
              }
            >
              {hasShortfall
                ? allBidsSet
                  ? "Submit bids & save →"
                  : "Set your bids above ↑"
                : "Save changes"}
            </Button>
          )}
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
  // Multiplayer-aware "you" — falls back to legacy player so this
  // works in both solo and multiplayer modes.
  const youId = useGame((state) => state.activeTeamId ?? state.playerTeamId);
  if (!player) return null;
  // Find rivals flying the same OD pair (either direction). In
  // multiplayer "rival" means "not you", which excludes other humans
  // too — they're competing on the same OD just like a bot would.
  const rivals = teams
    .filter((t) => t.id !== (youId ?? player.id))
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
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Occupancy</th>
              <th className="text-right px-2 py-1.5 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Q profit</th>
            </tr>
          </thead>
          <tbody>
            {/* Always include the player's own row at the top for comparison.
                Uses direct contribution (revenue − fuel − slot) so the
                head-to-head comparison against rivals stays apples-to-apples
                — rivals don't have an allocated overhead figure on file. */}
            {(() => {
              const playerProfit =
                route.quarterlyRevenue - route.quarterlyFuelCost - route.quarterlySlotCost;
              return (
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
                  <td className="px-2 py-1.5 text-right tabular font-mono text-ink">{Math.round(route.dailyFrequency * 7)}</td>
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
                    playerProfit >= 0 ? "text-positive" : "text-negative",
                  )}>
                    {fmtMoney(playerProfit)}
                  </td>
                </tr>
              );
            })()}
            {rivals.map(({ team, route: r }) => {
              const planeId = r.aircraftIds[0];
              const plane = planeId ? team.fleet.find((f) => f.id === planeId) : undefined;
              // Direct contribution — apples-to-apples with the player
              // row above. Rivals don't carry the allocated-overhead
              // breakdown anyway (overhead allocation runs per-team).
              const profit =
                r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
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
                  <td className="px-2 py-1.5 text-right tabular font-mono text-ink-2">{Math.round(r.dailyFrequency * 7)}</td>
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

  // Cabin condition penalty — same min-satisfaction lookup as engine.
  // Shows the player WHY a route with a beat-up plane is underperforming
  // even with the right hub + CS settings.
  const planes = route.aircraftIds
    .map((id) => player.fleet.find((f) => f.id === id))
    .filter((p): p is NonNullable<typeof p> => !!p && p.status === "active");
  let cabinPenalty = 1.0;
  let cabinLabel = "Cabin condition (no aircraft)";
  if (planes.length > 0) {
    const worstSat = Math.min(...planes.map((p) => p.satisfactionPct ?? 75));
    if (worstSat < 30) { cabinPenalty = 0.92; cabinLabel = `Cabin condition · worst ${Math.round(worstSat)}% (poor)`; }
    else if (worstSat < 50) { cabinPenalty = 0.96; cabinLabel = `Cabin condition · worst ${Math.round(worstSat)}% (mid)`; }
    else if (worstSat >= 80) { cabinPenalty = 1.02; cabinLabel = `Cabin condition · worst ${Math.round(worstSat)}% (great)`; }
    else { cabinLabel = `Cabin condition · worst ${Math.round(worstSat)}% (ok)`; }
  }

  // Loyalty retention — same band lookup as engine's loyaltyRetentionFactor.
  const loyalty = player.customerLoyaltyPct ?? 50;
  const loyaltyMult =
    loyalty >= 80 ? 1.05 :
    loyalty >= 65 ? 1.03 :
    loyalty >= 50 ? 1.0 :
    loyalty >= 35 ? 0.97 : 0.93;

  const rows: Array<{ label: string; mult: number; tone: "pos" | "neg" | "neutral" }> = [
    { label: `Hub bonus${isHub ? "" : isSecondary ? " (secondary)" : " (none)"}`, mult: hubMultiplier, tone: hubMultiplier > 1 ? "pos" : "neutral" },
    { label: `Customer Service · L${csLevel}`, mult: csMultiplier, tone: csMultiplier > 1 ? "pos" : csMultiplier < 1 ? "neg" : "neutral" },
    { label: hasLounge ? "Premium lounge at hub" : "No lounge at endpoints", mult: loungeBonus, tone: loungeBonus > 1 ? "pos" : "neutral" },
    { label: "Doctrine + geography fit", mult: onboardingBonus, tone: onboardingBonus > 1 ? "pos" : "neutral" },
    { label: cabinLabel, mult: cabinPenalty, tone: cabinPenalty > 1 ? "pos" : cabinPenalty < 1 ? "neg" : "neutral" },
    { label: `Customer loyalty · ${Math.round(loyalty)}%`, mult: loyaltyMult, tone: loyaltyMult > 1 ? "pos" : loyaltyMult < 1 ? "neg" : "neutral" },
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
  label, value, tone, sub,
}: {
  label: string; value: string; tone?: "pos" | "neg"; sub?: string;
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
      {sub && (
        <div className="text-[0.625rem] text-ink-muted mt-1 leading-tight truncate">
          {sub}
        </div>
      )}
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

/** Persistent reminder of the active tournament window — shown at the
 *  top of the Routes panel during World Cup (R19-24) and Olympics
 *  (R29-32). Gives the player a chance to build capacity into the
 *  host city *before* the demand surge lands. */
function TournamentBanner() {
  const currentQuarter = useGame((s) => s.currentQuarter);
  const worldCupHostCode = useGame((s) => s.worldCupHostCode);
  const olympicHostCode = useGame((s) => s.olympicHostCode);

  // Pre-event window starts 2 rounds before so the player has a buffer
  // to acquire slots / order aircraft / open routes.
  const wcUpcoming = currentQuarter >= 17 && currentQuarter < 19;
  const wcActive = currentQuarter >= 19 && currentQuarter <= 24;
  const olUpcoming = currentQuarter >= 27 && currentQuarter < 29;
  const olActive = currentQuarter >= 29 && currentQuarter <= 32;

  if (!wcUpcoming && !wcActive && !olUpcoming && !olActive) return null;

  const items: Array<{
    label: string;
    city: string | null;
    sub: string;
    tone: "info" | "accent";
  }> = [];
  if (wcUpcoming && worldCupHostCode) {
    items.push({
      label: "World Cup",
      city: worldCupHostCode,
      sub: `Kicks off in ${19 - currentQuarter} rounds — build capacity now`,
      tone: "info",
    });
  }
  if (wcActive && worldCupHostCode) {
    const tail = currentQuarter >= 23;
    items.push({
      label: "World Cup live",
      city: worldCupHostCode,
      sub: tail
        ? "Tail rounds: +50% uplift on host-city routes"
        : "Host-city routes near full loads through R22",
      tone: "accent",
    });
  }
  if (olUpcoming && olympicHostCode) {
    items.push({
      label: "Olympics",
      city: olympicHostCode,
      sub: `Opens in ${29 - currentQuarter} rounds — secure slots before R29`,
      tone: "info",
    });
  }
  if (olActive && olympicHostCode) {
    items.push({
      label: "Olympics live",
      city: olympicHostCode,
      sub: "Host-city routes ride the surge through R32",
      tone: "accent",
    });
  }

  return (
    <div className="space-y-1.5">
      {items.map((it) => {
        const cityName = it.city ? CITIES_BY_CODE[it.city]?.name ?? it.city : null;
        return (
          <div
            key={it.label}
            className={cn(
              "rounded-md px-3 py-2 flex items-center gap-2 text-[0.8125rem] border",
              it.tone === "accent"
                ? "border-accent/40 bg-[var(--accent-soft)]/40"
                : "border-warning/40 bg-[var(--warning-soft)]/40",
            )}
          >
            <span
              className={cn(
                "text-[0.625rem] uppercase tracking-wider font-bold shrink-0",
                it.tone === "accent" ? "text-accent" : "text-warning",
              )}
            >
              {it.label}
            </span>
            {cityName && (
              <span className="font-medium text-ink shrink-0">
                <span className="font-mono mr-1 text-ink-2">{it.city}</span>
                {cityName}
              </span>
            )}
            <span className="text-ink-muted truncate">{it.sub}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Collapsible region section for the route-pick city list. Header
 *  shows the region name + entry count; body lists each city with
 *  code, name, distance (when sorting by distance from origin), and
 *  a "Network" badge when in player's owned set. No tier label. */
function RegionSection({
  label, entries, sortRef, origin, picking, onPick,
}: {
  label: string;
  entries: Array<{ city: import("@/types/game").City; distance: number }>;
  sortRef: string | null;
  origin: string | null;
  picking: "origin" | "dest" | null;
  onPick: (code: string) => void;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="border-b border-line last:border-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-baseline justify-between px-3 py-1.5 bg-surface-2/40 hover:bg-surface-hover text-left"
      >
        <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
          {label}
        </span>
        <span className="text-[0.625rem] tabular text-ink-muted">
          {entries.length} {open ? "▾" : "▸"}
        </span>
      </button>
      {open && (
        <div>
          {entries.slice(0, 50).map(({ city: c, distance }) => (
            <button
              key={c.code}
              onClick={() => onPick(c.code)}
              disabled={picking === "dest" && c.code === origin}
              className={cn(
                "w-full flex items-baseline gap-2 px-3 py-1.5 text-left text-[0.8125rem]",
                "hover:bg-surface-hover transition-colors border-t border-line/40",
                picking === "dest" && c.code === origin && "opacity-40 cursor-not-allowed",
              )}
            >
              <span className="font-mono font-semibold text-ink shrink-0 w-10">
                {c.code}
              </span>
              <span className="text-ink-2 flex-1 truncate">{c.name}</span>
              {sortRef && distance > 0 && (
                <span className="text-[0.6875rem] text-ink-muted tabular shrink-0">
                  {Math.round(distance).toLocaleString()} km
                </span>
              )}
            </button>
          ))}
          {entries.length > 50 && (
            <div className="px-3 py-1 text-[0.625rem] text-ink-muted italic border-t border-line/40">
              + {entries.length - 50} more — refine the search above
            </div>
          )}
        </div>
      )}
    </div>
  );
}
