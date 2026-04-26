import type { AircraftSpec, FleetAircraft, Team } from "@/types/game";

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

/** Top-N specs eligible for lease at the given quarter, ranked by
 *  per-quarter production stock. We rank only specs that are currently
 *  available (unlocked AND not past cutoff) so a tier-1 widebody whose
 *  production line just closed is no longer leasable. */
export function leaseEligibleSpecIds(
  specs: AircraftSpec[],
  currentQuarter: number,
): { passenger: Set<string>; cargo: Set<string> } {
  function rank(family: "passenger" | "cargo", topN: number): Set<string> {
    return new Set(
      specs
        .filter((s) => s.family === family)
        .filter((s) => s.unlockQuarter <= currentQuarter)
        .filter((s) => typeof s.cutoffRound !== "number" || currentQuarter <= s.cutoffRound)
        // Production cap is the proxy for "stock the lessor has access to".
        // Defaults: 8 standard / 5 premium ($80M+ widebodies). Sort desc.
        .sort((a, b) => {
          const ca = a.productionCapPerQuarter ?? (a.buyPriceUsd >= 80_000_000 ? 5 : 8);
          const cb = b.productionCapPerQuarter ?? (b.buyPriceUsd >= 80_000_000 ? 5 : 8);
          if (cb !== ca) return cb - ca;
          // Tiebreaker: cheaper buy price first (more "commodity" airframe
          // = bigger lessor pool willing to underwrite).
          return a.buyPriceUsd - b.buyPriceUsd;
        })
        .slice(0, topN)
        .map((s) => s.id),
    );
  }
  return {
    passenger: rank("passenger", LEASE_ELIGIBLE_PASSENGER_TOP_N),
    cargo: rank("cargo", LEASE_ELIGIBLE_CARGO_TOP_N),
  };
}

/** Convenience — is this spec leasable for this team this quarter? */
export function canLeaseSpec(
  spec: AircraftSpec,
  specs: AircraftSpec[],
  currentQuarter: number,
): boolean {
  const { passenger, cargo } = leaseEligibleSpecIds(specs, currentQuarter);
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
