/**
 * Quarter Story — turns a quarter-close P&L diff into one plain-English
 * sentence so the player grasps WHY profit moved without hunting across
 * the digest tabs. Workshop constraint: executives get ~5 minutes
 * between rounds; the "why" has to be readable in one glance.
 *
 * Pure module (no store imports) so it can be probed from a script.
 */

import { fmtMoney } from "@/lib/format";

/** Current-quarter P&L lines — structural subset of the engine's
 *  QuarterCloseResult so this module doesn't depend on engine.ts. */
export interface CurrentQuarterLines {
  revenue: number;
  fuelCost: number;
  slotCost: number;
  staffCost: number;
  leaseFeesUsd?: number;
  otherSliderCost: number;
  maintenanceCost: number;
  insuranceCost?: number;
  depreciation: number;
  interest: number;
  rcfInterest?: number;
  tax: number;
  passengerTax?: number;
  fuelExcise?: number;
  carbonLevy?: number;
  obligationFinesUsd?: number;
  netProfit: number;
}

/** Prior-quarter lines — structural subset of Team.financialsByQuarter
 *  entries. Sub-lines are optional on older saves; drivers whose prior
 *  value is unknown are simply skipped. */
export interface PrevQuarterLines {
  revenue: number;
  netProfit: number;
  fuelCost?: number;
  slotCost?: number;
  staffCost?: number;
  leaseFeesUsd?: number;
  otherSliderCost?: number;
  maintenanceCost?: number;
  insuranceCost?: number;
  depreciation?: number;
  interest?: number;
  taxesAndLevies?: number;
}

interface Driver {
  /** Contribution to the Δ in net profit. Positive = helped profit. */
  amount: number;
  /** Full clause for the primary slot, e.g. "fuel costs jumped $6.1M". */
  clause: string;
  /** Noun phrase for the "partly offset by …" slot, e.g.
   *  "higher fuel costs ($6.1M)". */
  noun: string;
}

const m = (n: number) => fmtMoney(Math.abs(n));

function costDriver(
  name: string,
  cur: number,
  prev: number | undefined,
): Driver | null {
  if (prev === undefined) return null;
  const amount = -(cur - prev); // cost up = hurt profit
  const amt = m(amount);
  return amount >= 0
    ? { amount, clause: `${name} eased ${amt}`, noun: `lower ${name} (${amt})` }
    : { amount, clause: `${name} rose ${amt}`, noun: `higher ${name} (${amt})` };
}

function buildDrivers(
  cur: CurrentQuarterLines,
  prev: PrevQuarterLines,
  newRouteCount: number,
  newRouteRevenue: number,
): Driver[] {
  const out: Driver[] = [];

  // Revenue — with a "from N new routes" garnish when growth came from
  // network expansion, so the player connects the action to the result.
  const revAmt = cur.revenue - prev.revenue;
  const garnish =
    revAmt > 0 && newRouteRevenue > 0 && newRouteCount > 0
      ? ` (${m(newRouteRevenue)} from ${newRouteCount} new route${newRouteCount === 1 ? "" : "s"})`
      : "";
  out.push(
    revAmt >= 0
      ? {
          amount: revAmt,
          clause: `revenue climbed ${m(revAmt)}${garnish}`,
          noun: `stronger revenue (${m(revAmt)})`,
        }
      : {
          amount: revAmt,
          clause: `revenue slipped ${m(revAmt)}`,
          noun: `softer revenue (${m(revAmt)})`,
        },
  );

  const curTaxes =
    cur.tax +
    (cur.passengerTax ?? 0) +
    (cur.fuelExcise ?? 0) +
    (cur.carbonLevy ?? 0) +
    (cur.obligationFinesUsd ?? 0);
  const curInterest = cur.interest + (cur.rcfInterest ?? 0);

  const candidates: Array<Driver | null> = [
    costDriver("fuel costs", cur.fuelCost, prev.fuelCost),
    costDriver("slot fees", cur.slotCost, prev.slotCost),
    costDriver("staff costs", cur.staffCost, prev.staffCost),
    costDriver("lease payments", cur.leaseFeesUsd ?? 0, prev.leaseFeesUsd),
    costDriver("marketing & ops spend", cur.otherSliderCost, prev.otherSliderCost),
    costDriver("maintenance", cur.maintenanceCost, prev.maintenanceCost),
    costDriver("insurance", cur.insuranceCost ?? 0, prev.insuranceCost),
    costDriver("depreciation", cur.depreciation, prev.depreciation),
    costDriver("interest costs", curInterest, prev.interest),
    costDriver("taxes & levies", curTaxes, prev.taxesAndLevies),
  ];
  for (const c of candidates) if (c) out.push(c);
  return out;
}

const joinAnd = (parts: string[]) => parts.join(" and ");

/**
 * One-sentence narrative for the quarter. Returns null only when there
 * is nothing meaningful to say (shouldn't happen in practice).
 */
export function buildQuarterStory(args: {
  cur: CurrentQuarterLines;
  prev: PrevQuarterLines | null;
  newRouteCount?: number;
  newRouteRevenue?: number;
}): string {
  const { cur, prev } = args;
  const newRouteCount = args.newRouteCount ?? 0;
  const newRouteRevenue = args.newRouteRevenue ?? 0;

  // ── First closed quarter: nothing to diff against ──
  if (!prev) {
    const costs = cur.revenue - cur.netProfit;
    const lines: Array<[string, number]> = [
      ["fuel", cur.fuelCost],
      ["staff", cur.staffCost],
      ["slot fees", cur.slotCost],
      ["maintenance", cur.maintenanceCost],
      ["marketing & ops spend", cur.otherSliderCost],
      ["depreciation", cur.depreciation],
    ];
    lines.sort((a, b) => b[1] - a[1]);
    const [bigName, bigVal] = lines[0] ?? ["", 0];
    const biggest =
      bigVal > 0 ? ` — biggest cost line: ${bigName} at ${m(bigVal)}` : "";
    return `First quarter on the books: ${m(cur.revenue)} of revenue against ${m(costs)} in costs${biggest}.`;
  }

  const netDelta = cur.netProfit - prev.netProfit;
  const drivers = buildDrivers(cur, prev, newRouteCount, newRouteRevenue);
  const threshold = Math.max(400_000, Math.abs(netDelta) * 0.15);
  const helpers = drivers
    .filter((d) => d.amount >= threshold)
    .sort((a, b) => b.amount - a.amount);
  const draggers = drivers
    .filter((d) => d.amount <= -threshold)
    .sort((a, b) => a.amount - b.amount);

  // ── Roughly flat quarter ──
  if (Math.abs(netDelta) < 250_000) {
    const base = `Net profit held roughly flat vs last quarter at ${fmtMoney(cur.netProfit)}`;
    if (helpers.length > 0 && draggers.length > 0) {
      return `${base} — ${helpers[0].noun} offset ${draggers[0].noun}.`;
    }
    return `${base}.`;
  }

  const dir = netDelta > 0 ? "up" : "down";
  const head = `Net profit ${dir} ${m(netDelta)} on last quarter`;
  const primary = (netDelta > 0 ? helpers : draggers).slice(0, 2);
  const secondary = (netDelta > 0 ? draggers : helpers).slice(0, 2);

  if (primary.length === 0) {
    // No driver explains the move in its own direction (typical on
    // older saves whose prior snapshot lacks cost sub-lines). Name the
    // counter-movers so the sentence still teaches something.
    if (secondary.length > 0) {
      const tail = netDelta < 0 ? " — costs outgrew revenue" : "";
      return `${head} despite ${joinAnd(secondary.map((d) => d.noun))}${tail}.`;
    }
    return `${head}.`;
  }
  const main = joinAnd(primary.map((d) => d.clause));
  const offset =
    secondary.length > 0
      ? `, partly offset by ${joinAnd(secondary.map((d) => d.noun))}`
      : "";
  return `${head} — ${main}${offset}.`;
}

/** 1 → "1st", 2 → "2nd", 3 → "3rd", 11 → "11th"… */
export function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}

/** Rank movement line for the close digest. Returns null when rank
 *  data isn't available (older saves before ranks were snapshotted). */
export function buildRankLine(args: {
  prevRank?: number;
  newRank?: number;
  teamCount: number;
}): { text: string; tone: "up" | "down" | "hold" } | null {
  const { prevRank, newRank, teamCount } = args;
  if (!newRank || teamCount < 2) return null;
  if (prevRank && prevRank !== newRank) {
    return {
      text: `You moved ${ordinal(prevRank)} → ${ordinal(newRank)} of ${teamCount}`,
      tone: newRank < prevRank ? "up" : "down",
    };
  }
  return {
    text: `You hold ${ordinal(newRank)} of ${teamCount}`,
    tone: "hold",
  };
}
