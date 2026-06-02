import type { AircraftSpec, PreOrder } from "@/types/game";
import { effectiveUnlockQuarter } from "./engine";

/** How many rounds before unlock pre-orders are allowed.
 *  Master-ref doc Section 1E: "Announcement at R-2". */
export const PREORDER_ANNOUNCEMENT_LEAD_ROUNDS = 2;

/** Deposit fraction held when a pre-order is placed. The remaining
 *  balance is charged PER DELIVERY — as each airframe rolls off the FIFO
 *  queue, the order pays (buyPrice − deposit-share) on that unit only, so
 *  a 10-plane order spreads its balance across the quarters it delivers in.
 *  Cancellation forfeits half the deposit — manufacturers don't refund a
 *  real-world airframe deposit when a slot has been built around your
 *  order. The 50% penalty matches industry practice on late cancellations. */
export const PREORDER_DEPOSIT_PCT = 0.25;
export const PREORDER_CANCEL_PENALTY_PCT = 0.50;

/** Premium aircraft buy-price threshold — anything at or above this
 *  price falls into the scarce widebody-class delivery rhythm. */
export const PREMIUM_PRICE_THRESHOLD_USD = 100_000_000;

/** Per-quarter production caps. Simple 2-tier model:
 *    < $100M  →  8 deliveries per quarter (narrowbodies, regionals)
 *    ≥ $100M  →  3 deliveries per quarter (widebodies, premium)
 *
 *  IMPORTANT — caps DO NOT limit how many a team can ORDER. They limit
 *  how many ROLL OFF THE FACTORY FLOOR per quarter, network-wide. A
 *  team that orders 10 of a $250M widebody simply joins the FIFO queue
 *  and receives 3 per quarter over ~4 quarters. That's the strategic
 *  mechanic: ordering early secures slots; the player who waits ends
 *  up behind 6 rivals in the queue and waits 2+ years for delivery.
 *
 *  Spec-level overrides (`spec.productionCapPerQuarter` on the catalog
 *  row) and facilitator overrides (`productionCapOverrides[specId]` in
 *  game state) both take precedence over this fallback. */
export const DEFAULT_PRODUCTION_CAP = 8;
export const PREMIUM_PRODUCTION_CAP = 3;

/** Widebody buy-price threshold for delivery lead time. Distinct from the
 *  production-cap threshold ($100M): the cap governs how scarce the line is,
 *  the lead time governs how long the airframe takes to BUILD once your slot
 *  comes up. The catalog splits cleanly at $150M — every passenger widebody
 *  (A330/777/787/A350/A380/747) and heavy freighter lists at or above this,
 *  every narrowbody (A320/737/A220/E-jets/regional) below it. */
export const WIDEBODY_PRICE_THRESHOLD_USD = 150_000_000;
/** Larger airframes take 2 quarters from order to delivery; smaller planes 1. */
export const WIDEBODY_LEAD_QUARTERS = 2;
export const NARROWBODY_LEAD_QUARTERS = 1;

/** Build lead time, in quarters, between an order being placed (or reaching
 *  the head of the FIFO queue) and the airframe rolling off the line. */
export function deliveryLeadQuarters(spec: AircraftSpec): number {
  return spec.buyPriceUsd >= WIDEBODY_PRICE_THRESHOLD_USD
    ? WIDEBODY_LEAD_QUARTERS
    : NARROWBODY_LEAD_QUARTERS;
}

export function effectiveProductionCap(
  spec: AircraftSpec,
  overrides: Record<string, number>,
): number {
  const o = overrides[spec.id];
  if (typeof o === "number" && o > 0) return Math.floor(o);
  if (typeof spec.productionCapPerQuarter === "number") {
    return Math.max(1, Math.floor(spec.productionCapPerQuarter));
  }
  return spec.buyPriceUsd >= PREMIUM_PRICE_THRESHOLD_USD
    ? PREMIUM_PRODUCTION_CAP
    : DEFAULT_PRODUCTION_CAP;
}

/** Pre-order announcement window opens at `unlockQuarter - 2` and runs
 *  forever after that — the queue stays open even past unlock so late
 *  buyers can join the production line behind earlier teams. */
export function isAnnouncementOpen(
  spec: AircraftSpec,
  currentQuarter: number,
  campaignMode: "half" | "full" = "half",
): boolean {
  return (
    currentQuarter >=
    effectiveUnlockQuarter(spec, campaignMode) - PREORDER_ANNOUNCEMENT_LEAD_ROUNDS
  );
}

/** True once the spec is fully released and pre-orders are eligible
 *  for delivery batches (queue may still be open before this — pre-
 *  orders during the announcement window simply wait for unlock). */
export function isReleased(
  spec: AircraftSpec,
  currentQuarter: number,
  campaignMode: "half" | "full" = "half",
): boolean {
  return currentQuarter >= effectiveUnlockQuarter(spec, campaignMode);
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
  campaignMode: "half" | "full" = "half",
): number {
  const cap = effectiveProductionCap(spec, overrides);
  const pos = queuePosition(orders, order.id) ?? 1;
  // Earliest possible delivery round = order quarter + build lead time, but no
  // sooner than the effective unlock quarter (announcements open ahead of
  // unlock so pre-unlock orders all wait). In the full campaign the unlock is
  // clamped to the airframe's real entry-into-service era. Widebodies carry a
  // 2-quarter lead; narrowbodies 1 — so even at the head of an empty queue a
  // widebody can't arrive next round.
  const lead = deliveryLeadQuarters(spec);
  const earliestByLead = order.orderedAtQuarter + lead;
  const startRound = Math.max(
    currentQuarter + 1,
    earliestByLead,
    effectiveUnlockQuarter(spec, campaignMode),
  );
  // pos=1 → delivers startRound; pos=cap → delivers startRound; pos=cap+1 → startRound+1; etc.
  const offset = Math.max(0, Math.floor((pos - 1) / cap));
  return startRound + offset;
}
