import type { AircraftSpec, PreOrder } from "@/types/game";

/** How many rounds before unlock pre-orders are allowed.
 *  Master-ref doc Section 1E: "Announcement at R-2". */
export const PREORDER_ANNOUNCEMENT_LEAD_ROUNDS = 2;

/** Deposit fraction held when a pre-order is placed.
 *  Balance is charged at delivery; cancellation forfeits half the
 *  deposit — manufacturers don't refund 85% of a real-world airframe
 *  deposit when a slot has been built around your order. The 50%
 *  penalty matches industry practice on late-cycle cancellations. */
export const PREORDER_DEPOSIT_PCT = 0.20;
export const PREORDER_CANCEL_PENALTY_PCT = 0.50;

/** Premium aircraft buy-price threshold (legacy — kept for any
 *  downstream consumers that still reference the old two-tier model). */
export const PREMIUM_PRICE_THRESHOLD_USD = 80_000_000;

/** Legacy two-tier caps — kept as exports for compatibility with any
 *  external consumer, but the resolver below now uses a finer 5-tier
 *  scale to model real-world widebody scarcity properly. */
export const DEFAULT_PRODUCTION_CAP = 8;
export const PREMIUM_PRODUCTION_CAP = 5;

/** Five-tier price-keyed production caps (May 2026 — workshop feedback
 *  "reduce overall supply, more scarcity on top airplanes"). Real-world
 *  airframe makers deliver 50-80 narrowbodies per month but only 3-6
 *  A380s per quarter. The game's pre-rebalance flat 5/8 split missed
 *  this — every team could order as many widebodies as narrowbodies.
 *
 *  Tier  | Price band       | Cap | Real-world anchor
 *  ------+------------------+-----+-----------------------------------
 *  T1    | < $50M           |  6  | Embraer E190, CRJ — abundant
 *  T2    | $50M – $99M      |  4  | A319/A320, 737-700/800 (1.5k/yr)
 *  T3    | $100M – $199M    |  3  | 787-8, A330neo, 777-200 mid stock
 *  T4    | $200M – $299M    |  2  | 787-10, 777-300ER, A350-900
 *  T5    | ≥ $300M          |  1  | A380, 747-8I, 777-9X (showcase only)
 *
 *  Spec-level overrides (`spec.productionCapPerQuarter`) still take
 *  precedence so workshop facilitators can hand-tune individual specs
 *  via the admin panel; only the FALLBACK gets the new tiers. */
export function effectiveProductionCap(
  spec: AircraftSpec,
  overrides: Record<string, number>,
): number {
  const o = overrides[spec.id];
  if (typeof o === "number" && o > 0) return Math.floor(o);
  if (typeof spec.productionCapPerQuarter === "number") {
    return Math.max(1, Math.floor(spec.productionCapPerQuarter));
  }
  const price = spec.buyPriceUsd;
  if (price >= 300_000_000) return 1;  // mega: A380, 747-8I, 777X
  if (price >= 200_000_000) return 2;  // large widebody
  if (price >= 100_000_000) return 3;  // mid widebody / premium narrow
  if (price >=  50_000_000) return 4;  // standard narrowbody
  return 6;                            // regional jets
}

/** Pre-order announcement window opens at `unlockQuarter - 2` and runs
 *  forever after that — the queue stays open even past unlock so late
 *  buyers can join the production line behind earlier teams. */
export function isAnnouncementOpen(spec: AircraftSpec, currentQuarter: number): boolean {
  return currentQuarter >= spec.unlockQuarter - PREORDER_ANNOUNCEMENT_LEAD_ROUNDS;
}

/** True once the spec is fully released and pre-orders are eligible
 *  for delivery batches (queue may still be open before this — pre-
 *  orders during the announcement window simply wait for unlock). */
export function isReleased(spec: AircraftSpec, currentQuarter: number): boolean {
  return currentQuarter >= spec.unlockQuarter;
}

/** All queued pre-orders for a spec, FIFO sorted (older orders first;
 *  ties broken by id for stable ordering across renders). */
export function queuedForSpec(orders: PreOrder[], specId: string): PreOrder[] {
  return orders
    .filter((o) => o.specId === specId && o.status === "queued")
    .sort((a, b) => {
      if (a.orderedAtQuarter !== b.orderedAtQuarter) {
        return a.orderedAtQuarter - b.orderedAtQuarter;
      }
      return a.id.localeCompare(b.id);
    });
}

/** Queue position (1-indexed) for a single pre-order, or null if not queued. */
export function queuePosition(orders: PreOrder[], orderId: string): number | null {
  const order = orders.find((o) => o.id === orderId);
  if (!order || order.status !== "queued") return null;
  const same = queuedForSpec(orders, order.specId);
  const idx = same.findIndex((o) => o.id === orderId);
  return idx < 0 ? null : idx + 1;
}

/** Estimate the round in which an order will be delivered, given its
 *  position in the queue and the spec's effective per-quarter cap.
 *  Returns null if spec hasn't unlocked yet AND the queue would empty
 *  before unlock (i.e. order is already past the head when unlock hits). */
export function estimatedDeliveryQuarter(
  order: PreOrder,
  spec: AircraftSpec,
  orders: PreOrder[],
  currentQuarter: number,
  overrides: Record<string, number>,
): number {
  const cap = effectiveProductionCap(spec, overrides);
  const pos = queuePosition(orders, order.id) ?? 1;
  // Earliest possible delivery round = unlockQuarter (announcements open
  // ahead of unlock so pre-unlock orders all wait).
  const startRound = Math.max(currentQuarter + 1, spec.unlockQuarter);
  // pos=1 → delivers startRound; pos=cap → delivers startRound; pos=cap+1 → startRound+1; etc.
  const offset = Math.max(0, Math.floor((pos - 1) / cap));
  return startRound + offset;
}
