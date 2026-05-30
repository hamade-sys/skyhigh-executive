import type { NewsItem, PreOrder } from "@/types/game";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { estimatedDeliveryQuarter } from "./pre-orders";
import { fmtQuarter } from "./format";

/** Default half-campaign start year. Callers pass the live value from
 *  `useCampaignStartYear()` / `getCampaignStartYear()`; this fallback
 *  only matters if a caller omits it. Mirrors format.ts. */
const DEFAULT_START_YEAR = 2015;

/** Minimum total order value (USD) that makes the trade press. A real
 *  fleet order of this size is a market-moving event — manufacturers
 *  issue press releases, rivals take notice. Below this it's routine
 *  capacity management and stays out of the news. */
export const ORDER_NEWS_THRESHOLD_USD = 2_000_000_000;

/** First token of an aircraft spec name is its manufacturer
 *  ("Airbus A380-800" → "Airbus", "Boeing 777-200LR" → "Boeing").
 *  The catalogue has no separate manufacturer field — it's embedded
 *  in the display name, matching how the rest of the app reads it. */
function manufacturerOf(specName: string): string {
  return specName.split(" ")[0] || "the manufacturer";
}

/** Compact "$X.XB" / "$XXXM" formatting tuned for order headlines. */
function fmtOrderValue(usd: number): string {
  if (usd >= 1_000_000_000) {
    const b = usd / 1_000_000_000;
    return `$${b.toFixed(b >= 10 ? 1 : 2)}B`;
  }
  return `$${Math.round(usd / 1_000_000)}M`;
}

type OrderGroup = {
  key: string;
  teamId: string;
  specId: string;
  orderedAtQuarter: number;
  units: PreOrder[];
  totalUsd: number;
  acquisitionType: "buy" | "lease";
};

/** Group pre-orders into "agreements": one airline, one airframe, one
 *  quarter. A player who orders 8 A380s in Q9 lands as a single group
 *  worth 8 × sticker — that's the agreement the press reports on.
 *  Cancelled units drop out; delivered units stay in (so the headline
 *  persists for the rest of the campaign, like a real signed deal). */
function groupOrders(orders: PreOrder[]): OrderGroup[] {
  const byKey = new Map<string, OrderGroup>();
  for (const o of orders) {
    if (o.status === "cancelled") continue;
    const key = `${o.teamId}|${o.specId}|${o.orderedAtQuarter}`;
    const g = byKey.get(key);
    if (g) {
      g.units.push(o);
      g.totalUsd += o.totalPriceUsd;
    } else {
      byKey.set(key, {
        key,
        teamId: o.teamId,
        specId: o.specId,
        orderedAtQuarter: o.orderedAtQuarter,
        units: [o],
        totalUsd: o.totalPriceUsd,
        acquisitionType: o.acquisitionType,
      });
    }
  }
  return [...byKey.values()];
}

/** Dynamic, player-driven trade-press headlines. Every fleet order
 *  worth ≥ $2B becomes a NewsItem dated to the quarter it was signed,
 *  e.g. "Skyward signs $3.44B agreement with Airbus for 8 A380-800s".
 *  Derived live from the shared pre-order book, so it needs no extra
 *  persisted state and survives reconnects exactly like the queue does.
 *
 *  `teamName` resolves a teamId to its airline name; `currentQuarter`
 *  and `overrides`/`campaignMode` feed the delivery-by estimate. */
export function dynamicOrderNews(
  orders: PreOrder[],
  currentQuarter: number,
  teamName: (teamId: string) => string | undefined,
  overrides: Record<string, number> = {},
  campaignMode: "half" | "full" = "half",
  startYear: number = DEFAULT_START_YEAR,
): NewsItem[] {
  const out: NewsItem[] = [];
  for (const g of groupOrders(orders)) {
    if (g.totalUsd < ORDER_NEWS_THRESHOLD_USD) continue;
    const spec = AIRCRAFT_BY_ID[g.specId];
    if (!spec) continue;
    const airline = teamName(g.teamId) ?? "An airline";
    const maker = manufacturerOf(spec.name);
    const qty = g.units.length;
    // Short model label — drop the manufacturer prefix so the headline
    // reads "8 A380-800s" not "8 Airbus A380-800s" (maker already named).
    const model = spec.name.replace(new RegExp(`^${maker}\\s+`), "");
    const value = fmtOrderValue(g.totalUsd);
    const verb = g.acquisitionType === "lease" ? "leasing deal" : "agreement";

    // Delivery-by = the last unit in the group's projected slot. Use the
    // newest queued unit; if all are delivered, the deal already closed.
    const stillQueued = g.units.filter((u) => u.status === "queued");
    let deliveryNote: string;
    if (stillQueued.length === 0) {
      const last = g.units.reduce(
        (a, b) => ((b.deliveredAtQuarter ?? 0) > (a.deliveredAtQuarter ?? 0) ? b : a),
        g.units[0],
      );
      deliveryNote = last.deliveredAtQuarter
        ? `All ${qty} delivered by ${fmtQuarter(last.deliveredAtQuarter, startYear)}.`
        : `Deliveries complete.`;
    } else {
      const etas = stillQueued.map((u) =>
        estimatedDeliveryQuarter(u, spec, orders, currentQuarter, overrides, campaignMode),
      );
      const lastEta = Math.max(...etas);
      deliveryNote = `Deliveries run through ${fmtQuarter(lastEta, startYear)} as slots come off the line.`;
    }

    out.push({
      id: `ORDER-${g.key}`,
      quarter: g.orderedAtQuarter,
      icon: "🛩️",
      impact: "ops",
      headline: `${airline} signs ${value} ${verb} with ${maker} for ${qty} ${model}${qty > 1 ? "s" : ""}`,
      detail:
        `${airline} has committed to ${qty} ${spec.name} airframe${qty > 1 ? "s" : ""} ` +
        `in a deal valued at ${value}. ${deliveryNote} ` +
        `Large orders reserve production slots ahead of rivals — competitors ordering the ` +
        `same type now join the queue behind this commitment.`,
    });
  }
  return out;
}
