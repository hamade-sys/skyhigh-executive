import type { AircraftSpec, FleetAircraft, Team } from "@/types/game";
import { effectiveUnlockQuarter } from "@/lib/engine";

/**
 * Lease economics (Option C — user-confirmed).
 *
 *  upfront deposit:   15% of spec buy price
 *  per-quarter fee:   7.5% of spec buy price
 *  term:              12 quarters (3 years)
 *  end of term:       aircraft returns to lessor unless the airline
 *                     exercises a buy-out at 25% of the original buy
 *                     price (the "leaseBuyoutBasisUsd" captured at
 *                     order time so future spec-price changes don't
 *                     re-price an in-flight lease).
 *
 *  Total cost over term (no buy-out):       15% + (7.5% × 12) = 105%
 *  Total cost-to-own (with buy-out):        105% + 25% = 130%
 *
 *  Eligibility: lease is offered only on the top 7 passenger and top 3
 *  cargo specs by current per-quarter production stock — the lessor
 *  needs scale to underwrite. Implemented by ranking specs on
 *  `productionCapPerQuarter` (default 8 for standard, 5 for premium).
 *
 *  Fleet cap: ≤ 50% of a team's active fleet may be leased aircraft.
 *
 *  Production-cap interaction: lease orders consume from the same
 *  per-spec FIFO production cap as buy orders. Fully integrated with
 *  the pre-order queue — the lessor can't conjure a plane out of
 *  nothing any more than the airline can.
 */

export const LEASE_DEPOSIT_PCT = 0.15;
export const LEASE_PER_QUARTER_PCT = 0.075;
export const LEASE_TERM_QUARTERS = 12;
export const LEASE_BUYOUT_RESIDUAL_PCT = 0.25;
/** Maximum share of a team's ACTIVE+ORDERED fleet that may be leased
 *  (rather than owned). Soft cap enforced by the order action. */
export const LEASE_FLEET_RATIO_CAP = 0.50;
/** How many top-stock specs are eligible for lease at any given time. */
export const LEASE_ELIGIBLE_PASSENGER_TOP_N = 7;
export const LEASE_ELIGIBLE_CARGO_TOP_N = 3;

export interface LeaseTerms {
  depositUsd: number;
  perQuarterUsd: number;
  termQuarters: number;
  buyoutResidualUsd: number;
  totalCommittedUsd: number; // deposit + every quarterly fee for full term
}

export function leaseTermsFor(spec: AircraftSpec): LeaseTerms {
  const buy = spec.buyPriceUsd;
  const depositUsd = Math.round(buy * LEASE_DEPOSIT_PCT);
  const perQuarterUsd = Math.round(buy * LEASE_PER_QUARTER_PCT);
  const buyoutResidualUsd = Math.round(buy * LEASE_BUYOUT_RESIDUAL_PCT);
  return {
    depositUsd,
    perQuarterUsd,
    termQuarters: LEASE_TERM_QUARTERS,
    buyoutResidualUsd,
    totalCommittedUsd: depositUsd + perQuarterUsd * LEASE_TERM_QUARTERS,
  };
}

/** Specs eligible for lease at the given quarter.
 *
 *  Pre-rebalance bug (May 2026 workshop feedback): "the lease market
 *  is only stuck with bombardier and embraer... nothing longhaul or
 *  widebody." Root cause: the old ranker picked the top 7 passenger
 *  specs purely by production-cap stock. Cheap regional jets had cap
 *  8 vs widebodies at cap 5, so regionals filled all 7 slots and
 *  every long-haul airframe was excluded from the lease tab.
 *
 *  Fix: split the passenger pool into haul-category buckets and pick
 *  the top stock-ranked spec inside EACH bucket. Guarantees the
 *  player sees a short-haul / mid-haul / long-haul mix every time.
 *
 *    Short-haul  (range ≤ 4,000 km): 3 slots — E-jets, CRJ, A319/A320
 *    Mid-haul    (4,000 – 8,000 km): 2 slots — 737 MAX, A321XLR, 757
 *    Long-haul   (>8,000 km):         2 slots — 787, A350, 777
 *                                     Total 7.
 *
 *  Cargo bucket (3 slots) splits the same way:
 *    Small/medium freighter (cargoTonnes ≤ 60): 1 slot
 *    Large freighter (60 < cargoTonnes ≤ 100):  1 slot
 *    Ultra freighter (cargoTonnes > 100):       1 slot
 *
 *  We rank only specs currently available (unlocked AND not past
 *  cutoff). Within each bucket we sort by production cap desc, then
 *  by buy price asc (cheaper airframe = bigger lessor pool willing to
 *  underwrite). If a bucket runs out of eligible specs, the slot is
 *  silently skipped — the lease tab never inflates with placeholders. */
export function leaseEligibleSpecIds(
  specs: AircraftSpec[],
  currentQuarter: number,
  campaignMode: "half" | "full" = "half",
): { passenger: Set<string>; cargo: Set<string> } {
  function available(s: AircraftSpec): boolean {
    if (effectiveUnlockQuarter(s, campaignMode) > currentQuarter) return false;
    if (typeof s.cutoffRound === "number" && currentQuarter > s.cutoffRound) return false;
    return true;
  }
  function stockRank(a: AircraftSpec, b: AircraftSpec): number {
    // Same fallback as effectiveProductionCap (8 below $100M, 3 above)
    // so the lease ranker agrees with the actual production pool.
    const capOf = (s: AircraftSpec) =>
      typeof s.productionCapPerQuarter === "number"
        ? s.productionCapPerQuarter
        : (s.buyPriceUsd >= 100_000_000 ? 3 : 8);
    const ca = capOf(a);
    const cb = capOf(b);
    if (cb !== ca) return cb - ca;
    return a.buyPriceUsd - b.buyPriceUsd;
  }

  // Passenger buckets — by stage length (range)
  const pax = specs.filter((s) => s.family === "passenger" && available(s));
  const paxShort = pax.filter((s) => s.rangeKm <= 4_000).sort(stockRank);
  const paxMid   = pax.filter((s) => s.rangeKm >  4_000 && s.rangeKm <= 8_000).sort(stockRank);
  const paxLong  = pax.filter((s) => s.rangeKm >  8_000).sort(stockRank);
  const passenger = new Set<string>([
    ...paxShort.slice(0, 3).map((s) => s.id),
    ...paxMid.slice(0, 2).map((s) => s.id),
    ...paxLong.slice(0, 2).map((s) => s.id),
  ]);

  // Cargo buckets — by payload tonnage. Falls back to small bucket if
  // a freighter spec is missing cargoTonnes (defensive against legacy
  // catalogue rows).
  const cgo = specs.filter((s) => s.family === "cargo" && available(s));
  const cgoSmall = cgo.filter((s) => (s.cargoTonnes ?? 0) <=  60).sort(stockRank);
  const cgoLarge = cgo.filter((s) => (s.cargoTonnes ?? 0) >   60 && (s.cargoTonnes ?? 0) <= 100).sort(stockRank);
  const cgoUltra = cgo.filter((s) => (s.cargoTonnes ?? 0) >  100).sort(stockRank);
  const cargo = new Set<string>([
    ...cgoSmall.slice(0, 1).map((s) => s.id),
    ...cgoLarge.slice(0, 1).map((s) => s.id),
    ...cgoUltra.slice(0, 1).map((s) => s.id),
  ]);

  return { passenger, cargo };
}

/** Convenience — is this spec leasable for this team this quarter? */
export function canLeaseSpec(
  spec: AircraftSpec,
  specs: AircraftSpec[],
  currentQuarter: number,
  campaignMode: "half" | "full" = "half",
): boolean {
  const { passenger, cargo } = leaseEligibleSpecIds(specs, currentQuarter, campaignMode);
  return spec.family === "passenger" ? passenger.has(spec.id)
       : spec.family === "cargo"     ? cargo.has(spec.id)
       : false;
}

/** Compute lease share of a team's fleet, used to enforce the 50% cap.
 *  Counts active + ordered (in-delivery) aircraft. Retired aircraft
 *  excluded. */
export function leaseFleetRatio(team: Team): number {
  const eligible = team.fleet.filter(
    (f) => f.status === "active" || f.status === "ordered",
  );
  if (eligible.length === 0) return 0;
  const leased = eligible.filter((f) => f.acquisitionType === "lease").length;
  return leased / eligible.length;
}

/** True when adding `qty` more leased aircraft would exceed the 50%
 *  cap on the team's projected fleet. */
export function wouldExceedLeaseCap(team: Team, addingLeasedQty: number): boolean {
  const eligible = team.fleet.filter(
    (f) => f.status === "active" || f.status === "ordered",
  );
  const leased = eligible.filter((f) => f.acquisitionType === "lease").length;
  const newLeased = leased + addingLeasedQty;
  const newTotal = eligible.length + addingLeasedQty;
  if (newTotal === 0) return false;
  return newLeased / newTotal > LEASE_FLEET_RATIO_CAP;
}

/** True when an active lease's term ends at or before the current
 *  quarter (so the engine should return / force-decision the aircraft). */
export function isLeaseExpired(plane: FleetAircraft, currentQuarter: number): boolean {
  if (plane.acquisitionType !== "lease") return false;
  if (typeof plane.leaseTermEndsAtQuarter !== "number") return false;
  return currentQuarter > plane.leaseTermEndsAtQuarter;
}
