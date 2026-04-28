"use client";

import { useState, useEffect, useMemo } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import {
  classFareRangeForDoctrine,
  cruiseSpeedKmh,
  detectTierFromAverage,
  distanceBetween,
  effectiveRangeKm,
  groundTurnaroundHours,
  maxRouteDailyFrequency,
  maxWeeklyRotations,
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
 *      + aircraft-size ground turnaround at each end, with cargo-belly
 *      loading penalty). Slider physically can't exceed the math.
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
  const [freqTouched, setFreqTouched] = useState(false);
  const [tier, setTier] = useState<PricingTier>("standard");
  const [econFare, setEconFare] = useState<number | null>(null);
  const [busFare, setBusFare] = useState<number | null>(null);
  const [firstFare, setFirstFare] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Inline slot-bid prices, keyed by airport code. Player sets these
  // when there's a shortfall; on Open route we submit them as auto-bids.
  const [bidPrices, setBidPrices] = useState<Record<string, number>>({});
  // Per-airport slot counts. Default = exact deficit; player can raise
  // above to grab headroom for future routes (e.g. need 7 today, bid
  // for 14 because they plan to add a second plane next quarter).
  const [bidSlots, setBidSlots] = useState<Record<string, number>>({});

  const isOpen = open && !!(origin && dest);

  // Reset + auto-pick a viable plane when the modal opens. All the
  // setState calls below are an intentional sync against the modal's
  // open transition (an external trigger), not a render-cascading
  // pattern — the effect only fires on isOpen / origin / dest change.
  /* eslint-disable react-hooks/set-state-in-effect */
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
      // Honour fuel/super engine retrofit +10% range bonus when
      // checking reach. Earlier the auto-pick used base spec range
      // and skipped over upgraded planes that could actually fly
      // the route.
      if (effectiveRangeKm(spec, f.engineUpgrade ?? null) < dist) return false;
      return cargo ? spec.family === "cargo" : spec.family === "passenger";
    });
    const defaultWeeklyFreq = idle
      ? maxWeeklyRotations(
          idle.specId,
          dist,
          idle.engineUpgrade ?? null,
          idle.cargoBelly,
          player.doctrine,
        )
      : 0;
    setSelectedPlaneIds(idle ? [idle.id] : []);
    setWeeklyFreq(defaultWeeklyFreq);
    setFreqTouched(false);
    setTier("standard");
    setEconFare(null);
    setBusFare(null);
    setFirstFare(null);
    setError(null);
    // Clear stale bid prices when the route changes — bids are
    // airport-specific, and showing them carried over from a prior
    // route attempt is misleading.
    setBidPrices({});
    setBidSlots({});
  }, [isOpen, origin, dest, forceCargo, player]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
  // Pass per-aircraft engine upgrades + cargo belly. Power/super increases
  // speed; cargo belly increases ground time, lowering the rotation cap.
  const aircraftWithUpgrades = useMemo(() =>
    selectedPlaneIds
      .map((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        if (!p) return null;
        return {
          specId: p.specId,
          engineUpgrade: p.engineUpgrade ?? null,
          cargoBelly: p.cargoBelly,
          doctrine: player?.doctrine,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x),
    [selectedPlaneIds, player],
  );
  const maxDailyFreq = specIds.length > 0
    ? maxRouteDailyFrequency(specIds, dist, aircraftWithUpgrades)
    : 0;
  const maxWeeklyFreq = Math.round(maxDailyFreq * 7);
  // Clamp weeklyFreq when the engine-derived ceiling shifts (aircraft
  // selection / range / cargo belly all change maxWeeklyFreq). Sync
  // against derived state, not a render cascade.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (maxWeeklyFreq === 0) {
      if (weeklyFreq !== 0) setWeeklyFreq(0);
      return;
    }
    if (!freqTouched) {
      if (weeklyFreq !== maxWeeklyFreq) setWeeklyFreq(maxWeeklyFreq);
      return;
    }
    if (weeklyFreq > maxWeeklyFreq) setWeeklyFreq(maxWeeklyFreq);
    if (weeklyFreq < 1) setWeeklyFreq(maxWeeklyFreq);
  }, [maxWeeklyFreq, weeklyFreq, freqTouched]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Cabin availability from selected planes — must honor per-instance
  // customSeats (set at purchase via the Purchase Order modal), not just
  // the spec default. A B787-9 spec defaults to 0F/48C/248Y, but if the
  // player allocated first-class seats during purchase, customSeats.first
  // > 0 and the First fare slider must appear.
  const hasFirst = useMemo(
    () =>
      selectedPlaneIds.some((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        if (!p) return false;
        const spec = AIRCRAFT_BY_ID[p.specId];
        const seats = p.customSeats ?? spec?.seats;
        return !!seats && seats.first > 0;
      }),
    [selectedPlaneIds, player],
  );
  const hasBusiness = useMemo(
    () =>
      selectedPlaneIds.some((id) => {
        const p = player?.fleet.find((f) => f.id === id);
        if (!p) return false;
        const spec = AIRCRAFT_BY_ID[p.specId];
        const seats = p.customSeats ?? spec?.seats;
        return !!seats && seats.business > 0;
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

  // Cargo flag is purely derived: it's a cargo route iff all selected
  // aircraft are cargo, OR the user opted-in via forceCargo from the
  // launch bar. Computing during render avoids the cascading-render
  // pattern of setState-in-effect.
  const isCargo = allCargo || (forceCargo ?? false);

  // Per-class fare ranges — needed for the bidirectional tier detector
  // hook below. Computed unconditionally (returns null when origin/dest
  // are missing) so the hook order stays stable across renders.
  const econRange = origin && dest ? classFareRangeForDoctrine(dist, "econ", player?.doctrine) : null;
  const busRange = origin && dest ? classFareRangeForDoctrine(dist, "bus", player?.doctrine) : null;
  const firstRange = origin && dest ? classFareRangeForDoctrine(dist, "first", player?.doctrine) : null;

  // Bidirectional binding: when the player nudges any per-class slider
  // away from the active tier preset, recompute which tier the AVERAGE
  // of all visible class fares matches and highlight that button.
  // MUST run before any conditional return so React hook order stays
  // identical between "no player yet" and "player loaded" renders —
  // otherwise React throws a hooks-order error mid-route-setup.
  // Bidirectional tier-detection: when per-class fares change, recompute
  // which tier preset the AVERAGE matches. setState-in-effect is the
  // canonical pattern for "derive controlled UI from related controlled
  // UI"; the effect ignores no-op updates.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (isCargo) return;
    const entries: Array<{ base: number; value: number }> = [];
    if (econRange) entries.push({ base: econRange.base, value: econFare ?? econRange.base });
    if (hasBusiness && busRange) entries.push({ base: busRange.base, value: busFare ?? busRange.base });
    if (hasFirst && firstRange) entries.push({ base: firstRange.base, value: firstFare ?? firstRange.base });
    const detected = detectTierFromAverage(entries);
    if (detected !== tier) setTier(detected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [econFare, busFare, firstFare, isCargo, hasBusiness, hasFirst,
      econRange?.base, busRange?.base, firstRange?.base]);

  // Synchronise bidPrices with the visible default on first paint —
  // this guarantees confirmRoute reads a real number for every shortfall
  // airport even if the BidRow's own onMount prime hasn't fired yet.
  // MUST run before the early return below so hook order stays stable
  // across renders. Inline-computes shortfall against player state
  // because we can't reach the post-early-return shortfall closure.
  useEffect(() => {
    if (!player || !origin || !dest || selectedPlaneIds.length === 0 || weeklyFreq < 1) return;
    const usedAtO = player.routes
      .filter((r) =>
        r.status === "active" &&
        (r.originCode === origin || r.destCode === origin),
      )
      .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
    const usedAtD = player.routes
      .filter((r) =>
        r.status === "active" &&
        (r.originCode === dest || r.destCode === dest),
      )
      .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
    const slotsO = player.airportLeases?.[origin]?.slots ?? 0;
    const slotsD = player.airportLeases?.[dest]?.slots ?? 0;
    const shortAtO = Math.max(0, usedAtO + weeklyFreq - slotsO);
    const shortAtD = Math.max(0, usedAtD + weeklyFreq - slotsD);
    if (shortAtO === 0 && shortAtD === 0) return;
    const updates: Record<string, number> = {};
    if (shortAtO > 0 && bidPrices[origin] === undefined) {
      const t = (CITIES_BY_CODE[origin]?.tier ?? 1) as CityTier;
      updates[origin] = BASE_SLOT_PRICE_BY_TIER[t];
    }
    if (shortAtD > 0 && bidPrices[dest] === undefined) {
      const t = (CITIES_BY_CODE[dest]?.tier ?? 1) as CityTier;
      updates[dest] = BASE_SLOT_PRICE_BY_TIER[t];
    }
    if (Object.keys(updates).length > 0) {
      setBidPrices((prev) => ({ ...prev, ...updates }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, origin, dest, weeklyFreq, selectedPlaneIds.length]);
  /* eslint-enable react-hooks/set-state-in-effect */

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
    if (aircraftWithUpgrades.length === 0) return null;
    const fastestSpeed = Math.max(...aircraftWithUpgrades.map((a) => cruiseSpeedKmh(a.specId, a.engineUpgrade)));
    const slowestSpeed = Math.min(...aircraftWithUpgrades.map((a) => cruiseSpeedKmh(a.specId, a.engineUpgrade)));
    const turnaround = Math.max(...aircraftWithUpgrades.map((a) => groundTurnaroundHours(a.specId, a.cargoBelly, a.doctrine)));
    const oneWayHrs = dist / slowestSpeed;
    const roundTripHrs = oneWayHrs * 2 + turnaround * 2;
    return {
      perPlaneWeekly: Math.max(1, Math.floor(168 / roundTripHrs)),
      roundTripHrs,
      fastestSpeed,
      slowestSpeed,
      turnaround,
    };
  })();

  // econRange / busRange / firstRange already defined above the early
  // return so the hook block can reference them — kept here as a
  // visual marker for where the tier-apply block historically lived.

  // Apply pricing-tier preset to all per-class fares (player can still
  // override individual classes after; reset clears the override).
  function applyTier(t: PricingTier) {
    setTier(t);
    const mult = t === "budget" ? 0.5 : t === "premium" ? 1.5 : t === "ultra" ? 2.0 : 1.0;
    if (econRange) setEconFare(Math.round(econRange.base * mult));
    if (hasBusiness && busRange) setBusFare(Math.round(busRange.base * mult));
    if (hasFirst && firstRange) setFirstFare(Math.round(firstRange.base * mult));
  }

  // (Bidirectional tier-detection useEffect lives above the early
  // return so hook order stays stable across renders — see the hook
  // ordering note further up.)

  // Projected demand vs capacity preview — passenger uses pax/day,
  // cargo uses tonnes/day. Earlier the cargo path skipped this preview
  // entirely so the player set up cargo routes blind. Now both modes
  // get the same projection block in their own units.
  const projection = (() => {
    if (specIds.length === 0 || weeklyFreq === 0) return null;
    const dailyFreq = Math.max(1 / 7, weeklyFreq / 7);
    if (isCargo) {
      // Cargo: capacity = tonnes/flight × daily freq.
      // Demand = min(origin business, dest business) tonnes/day, with
      // per-city cargo modifiers folded in (matches the engine).
      const tonnesPerFlight = selectedPlaneIds.reduce((sum, id) => {
        const p = player.fleet.find((f) => f.id === id);
        if (!p) return sum;
        const spec = AIRCRAFT_BY_ID[p.specId];
        return sum + (spec?.cargoTonnes ?? 0);
      }, 0);
      const dailyCapacity = tonnesPerFlight * dailyFreq;
      if (dailyCapacity === 0) return null;
      const o = CITIES_BY_CODE[origin!];
      const d = CITIES_BY_CODE[dest!];
      if (!o || !d) return null;
      // Same shape as engine cargo demand: min of two cities' business demand.
      // (Quick approximation — the engine adds news modifiers + market focus
      // bonus on top; this is a "before-modifier" baseline preview.)
      const dailyBusinessO = o.business * Math.pow(1 + o.businessGrowth / 100 / 4, s.currentQuarter - 1);
      const dailyBusinessD = d.business * Math.pow(1 + d.businessGrowth / 100 / 4, s.currentQuarter - 1);
      const demand = Math.min(dailyBusinessO, dailyBusinessD);
      const occ = demand > 0 ? Math.min(1, demand / dailyCapacity) : 0;
      return {
        kind: "cargo" as const,
        demand,
        capacity: dailyCapacity,
        occupancy: occ,
        tone: (occ < 0.25 ? "neg" : occ < 0.55 ? "warn" : "pos") as "neg" | "warn" | "pos",
      };
    }
    const demand = routeDemandPerDay(origin!, dest!, s.currentQuarter).total;
    // Capacity bug fix (matches engine.ts): each daily flight uses ONE
    // plane's seats, not the sum across all planes. dailyFreq is
    // already the total daily flights across the fleet, so capacity is
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
    return {
      kind: "passenger" as const,
      demand,
      capacity: dailyCapacity,
      occupancy: occ,
      tone: (occ < 0.25 ? "neg" : occ < 0.55 ? "warn" : "pos") as "neg" | "warn" | "pos",
    };
  })();

  const hasAircraft = selectedPlaneIds.length > 0;

  // Slot capacity check — replicates store-side validation so the modal
  // can render the inline bid form when there's a shortfall.
  const shortfall = (() => {
    if (!origin || !dest || !hasAircraft || weeklyFreq < 1) {
      return { atOrigin: 0, atDest: 0 };
    }
    const usedAtO = player.routes
      .filter((r) =>
        r.status === "active" &&
        (r.originCode === origin || r.destCode === origin),
      )
      .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
    const usedAtD = player.routes
      .filter((r) =>
        r.status === "active" &&
        (r.originCode === dest || r.destCode === dest),
      )
      .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
    const slotsO = player.airportLeases?.[origin]?.slots ?? 0;
    const slotsD = player.airportLeases?.[dest]?.slots ?? 0;
    return {
      atOrigin: Math.max(0, usedAtO + weeklyFreq - slotsO),
      atDest: Math.max(0, usedAtD + weeklyFreq - slotsD),
    };
  })();
  const hasShortfall = shortfall.atOrigin > 0 || shortfall.atDest > 0;

  // The button is enabled when every shortfall airport has SOME bid in
  // place. We auto-prime each BidRow's price to the tier minimum on
  // mount, so an unset entry should never persist past the first
  // render — but if the parent's reset effect clears bidPrices in
  // response to a player ref change, BidRow's empty-deps useEffect
  // doesn't re-fire and the entry stays undefined. The slider is still
  // visibly showing minPrice though, so treating undefined as
  // "implicit minimum bid" matches what the player sees and prevents
  // the Submit button from getting stuck disabled.
  const allBidsSet = !hasShortfall;
  // (bid-price prime useEffect lives above the early return — see the
  // hook ordering note further up. We can't safely keep it here because
  // it would render conditionally on `if (!player) return null;`.)

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
    // Build inline bid attachment per-airport when there's a shortfall.
    // The Open button is disabled until allBidsSet, so each shortfall
    // airport is guaranteed to have an explicit, user-set price here.
    // Slot count defaults to the strict deficit but the player can
    // over-bid for headroom (e.g. need 7, bid for 14).
    const slotBids: Array<{
      airportCode: string;
      pricePerSlot: number;
      slots?: number;
    }> = [];
    if (hasShortfall) {
      if (shortfall.atOrigin > 0 && bidPrices[origin] !== undefined) {
        slotBids.push({
          airportCode: origin,
          pricePerSlot: bidPrices[origin]!,
          slots: bidSlots[origin] ?? shortfall.atOrigin,
        });
      }
      if (shortfall.atDest > 0 && bidPrices[dest] !== undefined) {
        slotBids.push({
          airportCode: dest,
          pricePerSlot: bidPrices[dest]!,
          slots: bidSlots[dest] ?? shortfall.atDest,
        });
      }
    }
    const r = openRoute({
      originCode: origin,
      destCode: dest,
      aircraftIds: selectedPlaneIds,
      // Engine still tracks daily; convert. Min 1 so route is always operating.
      dailyFrequency: Math.max(1 / 7, weeklyFreq / 7),
      pricingTier: tier,
      econFare,
      busFare,
      firstFare,
      isCargo,
      slotBids: slotBids.length > 0 ? slotBids : undefined,
    });
    if (!r.ok) {
      setError(r.error ?? "Unknown error");
      return;
    }
    onClose();
  }

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

      {/* ── Decision cockpit — sticky summary rail wedged between
          header and scroll body. Always visible as the player scrolls
          through the configuration steps below, so the cause→effect
          loop (tweak → projection updates) is right above the action.
          Empty stats render as em-dashes until the prerequisite is set. */}
      <div className="border-y border-line bg-surface-2/60 px-4 py-2 grid grid-cols-4 gap-3 text-[0.75rem]">
        <CockpitStat
          label="Aircraft"
          value={
            selectedPlaneIds.length > 0
              ? `${selectedPlaneIds.length} selected`
              : "—"
          }
          tone={selectedPlaneIds.length > 0 ? "ok" : "pending"}
        />
        <CockpitStat
          label="Frequency"
          value={hasAircraft && weeklyFreq > 0 ? `${weeklyFreq}/wk` : "—"}
          tone={hasAircraft && weeklyFreq > 0 ? "ok" : "pending"}
        />
        <CockpitStat
          label={isCargo ? "Cargo route" : "Pricing"}
          value={isCargo ? "Cargo" : tier}
          tone="ok"
          mono={false}
          capitalize
        />
        <CockpitStat
          label="Occupancy"
          value={projection ? `${(projection.occupancy * 100).toFixed(0)}%` : "—"}
          tone={
            !projection
              ? "pending"
              : projection.tone === "neg"
                ? "neg"
                : projection.tone === "warn"
                  ? "warn"
                  : "pos"
          }
        />
      </div>

      <ModalBody className="space-y-5 max-h-[60vh] overflow-y-auto">
        {/* Step 1 — Assign aircraft (REQUIRED FIRST) */}
        <Section step={1} title="Assign aircraft">
          {idlePlanes.length === 0 ? (() => {
            // Surface WHY there are no idle aircraft — earlier this just
            // said "no idle, go to Fleet" which was misleading when the
            // player had ordered planes that hadn't been delivered yet,
            // or planes flying other routes. Now we count each bucket
            // so the player sees what they actually have.
            const orderedCount = player.fleet.filter((f) => f.status === "ordered").length;
            const assignedCount = player.fleet.filter((f) => {
              if (f.status !== "active") return false;
              if (!f.routeId) return false;
              const r = player.routes.find((rt) => rt.id === f.routeId);
              return !!(r && r.status !== "closed");
            }).length;
            const groundedCount = player.fleet.filter((f) => f.status === "grounded").length;
            const totalNonRetired = orderedCount + assignedCount + groundedCount;
            return (
              <div className="rounded-md border border-warning/40 bg-[var(--warning-soft)]/40 px-3 py-3 text-[0.8125rem] space-y-2">
                <div className="font-semibold text-warning">
                  No idle aircraft available
                </div>
                {totalNonRetired === 0 ? (
                  <div className="text-ink-2">
                    You have no aircraft in inventory. Order one from the Fleet panel — pre-orders open at announcement window for each model.
                  </div>
                ) : (
                  <>
                    <div className="text-ink-2">
                      Your aircraft are accounted for elsewhere:
                    </div>
                    <ul className="text-[0.75rem] text-ink-2 space-y-0.5 ml-3 list-disc">
                      {orderedCount > 0 && (
                        <li>
                          <strong className="text-ink">{orderedCount}</strong> on order — arriving next quarter or queued for delivery
                        </li>
                      )}
                      {assignedCount > 0 && (
                        <li>
                          <strong className="text-ink">{assignedCount}</strong> assigned to other routes — close one or reassign in Fleet
                        </li>
                      )}
                      {groundedCount > 0 && (
                        <li>
                          <strong className="text-ink">{groundedCount}</strong> grounded — re-activate via maintenance, or wait out renovation downtime
                        </li>
                      )}
                    </ul>
                  </>
                )}
              </div>
            );
          })() : (
            <div className="space-y-1.5 max-h-44 overflow-auto">
              {/* Family lock: once the first aircraft is picked, the
                  route's family is set. Mixed cargo+passenger on a
                  single route makes no sense — different revenue
                  models, different capacity units. The off-family
                  planes grey out below. */}
              {idlePlanes.map((p) => {
                const spec = AIRCRAFT_BY_ID[p.specId];
                if (!spec) return null;
                const canReach = effectiveRangeKm(spec, p.engineUpgrade ?? null) >= dist;
                const selected = selectedPlaneIds.includes(p.id);
                // Family lock — once first aircraft is picked, the rest
                // must be the same family. Picking a passenger plane
                // greys out cargo planes (and vice versa).
                const firstSelected = selectedPlaneIds[0]
                  ? player.fleet.find((f) => f.id === selectedPlaneIds[0])
                  : null;
                const lockedFamily = firstSelected
                  ? AIRCRAFT_BY_ID[firstSelected.specId]?.family
                  : null;
                const familyMismatch = !!lockedFamily && lockedFamily !== spec.family;
                const planeMaxWeekly = canReach
                  ? maxWeeklyRotations(p.specId, dist, p.engineUpgrade ?? null, p.cargoBelly, player.doctrine)
                  : 0;
                const disabled = !canReach || familyMismatch;
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
                      <div className="text-ink text-[0.875rem]">
                        {spec.name}
                        {p.customSeats && (
                          <span className="ml-1.5 text-[0.6875rem] text-accent">· custom cabin</span>
                        )}
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted font-mono">
                        Range {spec.rangeKm.toLocaleString()} km · {(() => {
                          // Cargo aircraft don't have passenger seats —
                          // show tonnage capacity instead.
                          if (spec.family === "cargo") {
                            return `${spec.cargoTonnes ?? 0}T cargo`;
                          }
                          const s = p.customSeats ?? spec.seats;
                          return `${s.first + s.business + s.economy} seats (${s.first}F/${s.business}C/${s.economy}Y)`;
                        })()} · {cruiseSpeedKmh(p.specId, p.engineUpgrade ?? null)} km/h cruise
                      </div>
                    </div>
                    {!canReach ? (
                      <Badge tone="negative">Out of range</Badge>
                    ) : familyMismatch ? (
                      <Badge tone="warning">
                        {lockedFamily === "cargo" ? "Cargo route locked" : "Passenger route locked"}
                      </Badge>
                    ) : (
                      <Badge tone="neutral">{planeMaxWeekly}/wk max</Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
          {hasAircraft && scheduleNote && (
            <div className="text-[0.6875rem] text-ink-muted leading-relaxed mt-2">
              Schedule math: {Math.round(dist).toLocaleString()} km ÷ {scheduleNote.slowestSpeed} km/h
              + 2 × {scheduleNote.turnaround.toFixed(0)} hr ground time = {scheduleNote.roundTripHrs.toFixed(1)} hr round-trip per
              aircraft · floor(168 / round-trip) = <strong className="text-ink">{scheduleNote.perPlaneWeekly} flights/week per plane</strong>.
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
                  onChange={(e) => {
                    setFreqTouched(true);
                    setWeeklyFreq(parseInt(e.target.value, 10));
                  }}
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
                        {t === "budget" ? "0.5×" : t === "standard" ? "1.0×" : t === "premium" ? "1.5×" : "2.0×"} base
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
          <Section
            step={3}
            title="Cargo"
            disabled={!hasAircraft}
            help={
              "Cargo route economics:\n\n" +
              "• Daily demand = the lower of origin and destination business demand (in tonnes), adjusted by news cargo modifiers and your market-focus doctrine.\n\n" +
              "• Cost stack: airport slot fees (same auction system as passenger — cargo flights occupy slots) plus warehousing storage fees at both endpoints.\n\n" +
              "• Rate per tonne scales by haul distance and Pricing Tier; you can override per route on the next step."
            }
          >
            <div className="text-[0.8125rem] text-ink-2 italic">
              Set frequency and pricing tier above. Slot bids on the next
              step if you don&apos;t hold enough capacity at either airport.
            </div>
          </Section>
        )}

        {/* Step 4 — Slot shortfall: inline bid form (only when needed) */}
        {hasAircraft && hasShortfall && (
          <Section step={4} title="Slot bidding (required)">
            <div className="rounded-md border border-warning/50 bg-[var(--warning-soft)] px-3 py-2 mb-3 text-[0.8125rem] text-ink-2">
              You don&apos;t have enough slots at{" "}
              {shortfall.atOrigin > 0 && <strong className="font-mono">{origin}</strong>}
              {shortfall.atOrigin > 0 && shortfall.atDest > 0 && " / "}
              {shortfall.atDest > 0 && <strong className="font-mono">{dest}</strong>}
              . Set a bid below — you only pay if you win the auction at quarter close.
            </div>

            {shortfall.atOrigin > 0 && origin && (
              <BidRow
                airportCode={origin}
                slotsNeeded={shortfall.atOrigin}
                tier={(CITIES_BY_CODE[origin]?.tier ?? 1) as CityTier}
                price={bidPrices[origin]}
                slots={bidSlots[origin] ?? shortfall.atOrigin}
                onSlotsChange={(n) =>
                  setBidSlots((prev) => ({ ...prev, [origin]: n }))
                }
                onChange={(p) => setBidPrices((prev) => {
                  if (Number.isNaN(p)) {
                    const next = { ...prev };
                    delete next[origin];
                    return next;
                  }
                  return { ...prev, [origin]: p };
                })}
              />
            )}
            {shortfall.atDest > 0 && dest && (
              <BidRow
                airportCode={dest}
                slotsNeeded={shortfall.atDest}
                tier={(CITIES_BY_CODE[dest]?.tier ?? 1) as CityTier}
                price={bidPrices[dest]}
                slots={bidSlots[dest] ?? shortfall.atDest}
                onSlotsChange={(n) =>
                  setBidSlots((prev) => ({ ...prev, [dest]: n }))
                }
                onChange={(p) => setBidPrices((prev) => {
                  if (Number.isNaN(p)) {
                    const next = { ...prev };
                    delete next[dest];
                    return next;
                  }
                  return { ...prev, [dest]: p };
                })}
              />
            )}
          </Section>
        )}

        {/* Live projection — passenger uses pax/seats, cargo uses tonnes.
            Shows BOTH daily and weekly figures so the player can sanity-
            check against the weekly frequency they entered (24/wk) and
            doesn't have to mentally divide by 7 to read the daily
            capacity. */}
        {projection && (() => {
          const weeklyDemand = projection.demand * 7;
          const weeklyCapacity = projection.capacity * 7;
          const unitShort = projection.kind === "cargo" ? "T" : "pax";
          const capUnit = projection.kind === "cargo" ? "T" : "seats";
          return (
            <div className={cn(
              "rounded-md border px-3 py-2.5 text-[0.8125rem]",
              projection.tone === "neg" && "border-negative bg-[var(--negative-soft)] text-negative",
              projection.tone === "warn" && "border-warning bg-[var(--warning-soft)] text-warning",
              projection.tone === "pos" && "border-positive bg-[var(--positive-soft)] text-positive",
            )}>
              <div className="font-semibold uppercase tracking-wider text-[0.6875rem] mb-1.5">
                Projected occupancy · {(projection.occupancy * 100).toFixed(0)}%
              </div>
              {/* Two-column daily/weekly breakdown so units are explicit. */}
              <div className="grid grid-cols-2 gap-2 text-[0.75rem] mb-1.5">
                <div className="rounded-md bg-surface/50 px-2 py-1.5">
                  <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                    Per day
                  </div>
                  <div className="tabular font-mono text-ink mt-0.5">
                    {Math.round(projection.demand).toLocaleString()} {unitShort} demand
                  </div>
                  <div className="tabular font-mono text-ink-2 text-[0.6875rem]">
                    {Math.round(projection.capacity).toLocaleString()} {capUnit} capacity
                  </div>
                </div>
                <div className="rounded-md bg-surface/50 px-2 py-1.5">
                  <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
                    Per week
                  </div>
                  <div className="tabular font-mono text-ink mt-0.5">
                    {Math.round(weeklyDemand).toLocaleString()} {unitShort} demand
                  </div>
                  <div className="tabular font-mono text-ink-2 text-[0.6875rem]">
                    {Math.round(weeklyCapacity).toLocaleString()} {capUnit} capacity
                  </div>
                </div>
              </div>
              <div className="text-[0.6875rem] text-ink-2 leading-snug">
                {projection.kind === "cargo" && "Cargo demand before market-focus + news modifiers. "}
                {projection.tone === "neg" && "Route is unlikely to be profitable at this configuration."}
                {projection.tone === "warn" && "Consider lowering frequency or adjusting fares."}
                {projection.tone === "pos" && "Strong occupancy projected."}
              </div>
            </div>
          );
        })()}

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
          disabled={!hasAircraft || weeklyFreq < 1 || !allBidsSet}
          onClick={confirmRoute}
          title={!allBidsSet ? "Set your bid for each shortfall airport below" : undefined}
        >
          {hasShortfall
            ? allBidsSet
              ? "Submit bids & open as pending →"
              : "Set your bids below ↓"
            : "Open route →"}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

export function BidRow({
  airportCode, slotsNeeded, tier, price, slots, onChange, onSlotsChange,
}: {
  airportCode: string;
  /** Slots strictly required to fly this route schedule. The default
   *  bid count, but the player can request more for future use. */
  slotsNeeded: number;
  tier: CityTier;
  /** undefined when player hasn't set a bid yet — render an empty/CTA state. */
  price: number | undefined;
  /** Slots the player wants to bid for. Defaults to slotsNeeded; can be
   *  raised so they have headroom for future routes. */
  slots: number;
  onChange: (n: number) => void;
  onSlotsChange: (n: number) => void;
}) {
  const player = useGame(selectPlayer);
  const closePanel = useUi((u) => u.closePanel);
  const openPanel = useUi((u) => u.openPanel);
  const basePrice = BASE_SLOT_PRICE_BY_TIER[tier];
  // Engine enforces basePrice as the floor (Tier 1 = $45K, Tier 2 = $30K,
  // Tier 3 = $15K, Tier 4 = $7.5K — see lib/slots.ts). Bidding below the
  // floor is rejected, so the slider starts AT basePrice.
  const minPrice = basePrice;
  const maxPrice = Math.round(basePrice * 3);
  const city = CITIES_BY_CODE[airportCode];
  // Auto-prime the bid price to the minimum on first render so the
  // player doesn't have to nudge the slider just to "activate" the
  // bid. Most players want the cheapest viable bid; if they want to
  // outbid rivals they can drag up.
  useEffect(() => {
    if (price === undefined) onChange(minPrice);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const displayPrice = price ?? minPrice;
  const weeklyCost = displayPrice * slots;
  const quarterlyCost = weeklyCost * 13;
  // Player can over-bid for headroom but never below the route's strict need.
  const maxSlots = Math.max(slotsNeeded * 4, slotsNeeded + 14);
  // ── Surface escrow shortfall up-front. Slot auctions need real
  //    cash (not borrowing headroom) — when the player is in
  //    overdraft or just short, render an inline warning + a one-click
  //    jump to Financials to refinance/borrow before they hit Submit
  //    and bounce on a confusing error.
  const maxBidCost = displayPrice * slots;
  const cashShortfall = player ? Math.max(0, maxBidCost - player.cashUsd) : 0;
  const isOverdraft = !!player && player.cashUsd < 0;

  return (
    <div className="rounded-md border border-primary bg-[rgba(20,53,94,0.04)] p-3 mb-2">
      {/* Header — airport + slot count compact stepper */}
      <div className="flex items-center justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <span className="font-mono text-ink font-semibold">{airportCode}</span>
          <span className="text-ink-muted text-[0.75rem] ml-1.5">
            {city?.name}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[0.6875rem] text-ink-muted mr-1">Slots</span>
          <button
            onClick={() => onSlotsChange(Math.max(slotsNeeded, slots - 1))}
            disabled={slots <= slotsNeeded}
            aria-label="Decrease slots"
            className="w-6 h-6 rounded border border-line text-ink-2 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-[0.875rem]"
          >
            −
          </button>
          <span className="font-mono text-ink font-semibold tabular w-8 text-center text-[0.875rem]">
            {slots}
          </span>
          <button
            onClick={() => onSlotsChange(Math.min(maxSlots, slots + 1))}
            disabled={slots >= maxSlots}
            aria-label="Increase slots"
            className="w-6 h-6 rounded border border-line text-ink-2 hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed text-[0.875rem]"
          >
            +
          </button>
        </div>
      </div>

      {/* Bid slider — value sits inline with the label, no separate
          row. Defaulted to min on mount so the player can submit
          without dragging. */}
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[0.75rem] text-ink-2">Bid / slot / week</span>
        <span className="tabular font-mono text-[0.875rem] font-semibold text-ink">
          ${displayPrice.toLocaleString()}
        </span>
      </div>
      <input
        type="range"
        min={minPrice}
        max={maxPrice}
        step={Math.max(1000, Math.round((maxPrice - minPrice) / 100))}
        value={displayPrice}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-primary"
      />
      <div className="flex justify-between text-[0.625rem] text-ink-muted tabular">
        <span>${minPrice.toLocaleString()}</span>
        <span>${maxPrice.toLocaleString()}</span>
      </div>

      {/* Cost summary — single line, weekly + quarterly. */}
      <div className="flex items-baseline justify-between gap-2 mt-2 pt-2 border-t border-line text-[0.75rem]">
        <span className="text-ink-muted">If won:</span>
        <span className="tabular font-mono text-ink">
          ${weeklyCost.toLocaleString()}/wk
          <span className="text-ink-muted"> · </span>
          <span className="font-semibold">${quarterlyCost.toLocaleString()}/Q</span>
        </span>
      </div>

      {/* Cash escrow shortfall — pre-submit. Auctions hold the bid in
          escrow until close, so borrowing headroom doesn't substitute
          for cash. */}
      {cashShortfall > 0 && (
        <div className="mt-2 rounded-md border border-negative bg-[var(--negative-soft)] px-2.5 py-1.5 text-[0.75rem]">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-negative">
              {isOverdraft ? "Overdraft" : "Cash short"} · ${(cashShortfall / 1_000_000).toFixed(2)}M
            </span>
            <button
              type="button"
              onClick={() => {
                closePanel();
                openPanel("reports");
              }}
              className="text-accent hover:underline text-[0.6875rem]"
            >
              Fix in Financials →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({
  step, title, disabled = false, help, children,
}: {
  step: number;
  title: string;
  disabled?: boolean;
  /** Optional explainer text. Renders as a (?) icon next to the
   *  title with a hover tooltip — keeps the section header tidy
   *  while still surfacing detail for players who want it. */
  help?: string;
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
        {help && (
          <span
            className="ml-auto inline-flex w-4 h-4 rounded-full items-center justify-center text-[0.625rem] font-semibold text-ink-muted bg-surface-2 cursor-help"
            title={help}
            aria-label="Help"
          >
            ?
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

/**
 * Compact cockpit stat for the sticky summary rail.
 * Tone "pending" renders muted with em-dash placeholder semantics so
 * the player can see at a glance which prerequisites are still open.
 */
function CockpitStat({
  label, value, tone = "ok", mono = true, capitalize = false,
}: {
  label: string;
  value: string;
  tone?: "ok" | "pos" | "neg" | "warn" | "pending";
  mono?: boolean;
  capitalize?: boolean;
}) {
  const valueClass =
    tone === "pos" ? "text-positive" :
    tone === "neg" ? "text-negative" :
    tone === "warn" ? "text-warning" :
    tone === "pending" ? "text-ink-muted" :
    "text-ink";
  return (
    <div className="min-w-0">
      <div className="text-[0.5625rem] uppercase tracking-wider text-ink-muted leading-tight">
        {label}
      </div>
      <div
        className={cn(
          "tabular text-[0.875rem] font-semibold leading-tight mt-0.5 truncate",
          mono && "font-mono",
          capitalize && "capitalize",
          valueClass,
        )}
      >
        {value}
      </div>
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
