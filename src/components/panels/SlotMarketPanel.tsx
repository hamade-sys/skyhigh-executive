"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { useUi } from "@/store/ui";
import { CITIES } from "@/data/cities";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import { AIRPORT_DEFAULT_CAPACITY_BY_TIER } from "@/lib/airport-ownership";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";
import { PanelSubheader } from "@/components/game/PanelSubheader";
import type { CityTier } from "@/types/game";
import { Search, Calendar, ChevronRight, ChevronDown, ExternalLink } from "lucide-react";

/**
 * Slot Market — redesigned per PRD update.
 *
 * One row per airport with the columns the player actually cares about:
 *   Airport | Tier | Owned | Fee/Q | Open | Next Q
 *
 * Clicking a row expands it into a Bid form: pick slots requested,
 * bid weekly per-slot rent (with minimum from BASE_SLOT_PRICE_BY_TIER),
 * see total max commitment, then Submit. Owned airports also expose a
 * Release control so players can stop paying the recurring fee.
 *
 * All numbers use thousands separators so $120,000/wk is unambiguous.
 */
export function SlotMarketPanel() {
  const player = useGame(selectPlayer);
  const airportSlots = useGame((s) => s.airportSlots);
  const submitSlotBid = useGame((s) => s.submitSlotBid);
  const cancelSlotBid = useGame((s) => s.cancelSlotBid);
  const releaseSlots = useGame((s) => s.releaseSlots);

  const [query, setQuery] = useState("");
  const [expandedCode, setExpandedCode] = useState<string | null>(null);
  // Keyboard-friendly entry point to the AirportDetailModal — click
  // the small "Detail" affordance to open the same modal that map
  // double-click opens. Backed by the UI store so opening is identical
  // regardless of entry point.
  const setAirportDetailCode = useUi((u) => u.setAirportDetailCode);

  // Total recurring slot expense (header summary)
  const totalQuarterlySlotFees = useMemo(() => {
    if (!player) return 0;
    return Object.values(player.airportLeases ?? {})
      .reduce((sum, l) => sum + l.totalWeeklyCost * 13, 0);
  }, [player]);

  // Filtered airport list, hub + secondary surfaced first, then by tier
  const rows = useMemo(() => {
    if (!player) return [];
    const q = query.trim().toLowerCase();
    return CITIES
      .filter((c) => {
        if (!q) return true;
        return (
          c.code.toLowerCase().includes(q) ||
          c.name.toLowerCase().includes(q) ||
          c.regionName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Player's hubs first
        const aIsOwn = a.code === player.hubCode || player.secondaryHubCodes.includes(a.code);
        const bIsOwn = b.code === player.hubCode || player.secondaryHubCodes.includes(b.code);
        if (aIsOwn !== bIsOwn) return aIsOwn ? -1 : 1;
        // Then by tier ascending, then alphabetical
        return a.tier - b.tier || a.name.localeCompare(b.name);
      });
  }, [player, query]);

  if (!player) return null;

  const myBids = new Map(
    (player.pendingSlotBids ?? []).map((b) => [b.airportCode, b]),
  );

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
          Each route consumes one slot per weekly schedule at both endpoints.
          Bids set the <strong>weekly per-slot rent</strong> — winners pay
          ongoing fees as long as they hold the slot. Release a slot to stop
          paying for it; it returns to the airport pool.
        </p>
        {totalQuarterlySlotFees > 0 && (
          <div className="mt-2 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-[0.8125rem] flex items-baseline justify-between">
            <span className="text-ink-2">Your recurring slot expense</span>
            <span className="tabular font-mono font-semibold text-ink">
              {fmtMoney(totalQuarterlySlotFees)} / quarter
            </span>
          </div>
        )}
        {(player.pendingSlotBids ?? []).length > 0 && (
          <div className="mt-2 rounded-md border border-warning/40 bg-[var(--warning-soft)]/40 px-3 py-2 text-[0.8125rem]">
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-semibold text-warning text-[0.6875rem] uppercase tracking-wider">
                {(player.pendingSlotBids ?? []).length} pending bid{(player.pendingSlotBids ?? []).length === 1 ? "" : "s"}
              </span>
              <span className="text-ink-muted text-[0.6875rem]">
                Resolves at quarter close
              </span>
            </div>
            <div className="space-y-0.5">
              {(player.pendingSlotBids ?? []).map((b, i) => (
                <div key={i} className="flex items-baseline justify-between text-[0.75rem] tabular font-mono">
                  <span className="text-ink-2">
                    {b.airportCode} · {b.slots} slot{b.slots === 1 ? "" : "s"}
                  </span>
                  <span className="text-ink">
                    ${b.pricePerSlot.toLocaleString()}/wk · ${(b.slots * b.pricePerSlot * 13).toLocaleString()}/Q if won
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <PanelSubheader>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by airport code, city, or region…"
            className="w-full rounded-md border border-line bg-surface px-8 py-2 text-[0.875rem] text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
          />
        </div>
      </PanelSubheader>

      <div className="rounded-md border border-line overflow-hidden">
        {/* Table header */}
        <div className="bg-surface-2 border-b border-line grid grid-cols-12 gap-2 px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">
          <div className="col-span-4">Airport</div>
          <div className="col-span-1 text-center">Tier</div>
          <div className="col-span-2 text-right">Owned</div>
          <div className="col-span-2 text-right">Fee/Q</div>
          <div className="col-span-1 text-right">Open</div>
          <div className="col-span-2 text-right">Next Q</div>
        </div>

        {/* Rows */}
        {rows.slice(0, 60).map((c) => {
          const tier = c.tier as CityTier;
          const state = airportSlots?.[c.code];
          const lease = player.airportLeases?.[c.code];
          const owned = lease?.slots ?? 0;
          const quarterlyFee = (lease?.totalWeeklyCost ?? 0) * 13;
          const myBid = myBids.get(c.code);
          const expanded = expandedCode === c.code;
          const isOwnHub = c.code === player.hubCode;
          const isSecondary = player.secondaryHubCodes.includes(c.code);

          return (
            <div
              key={c.code}
              className={cn(
                "border-b border-line last:border-0 relative",
                isOwnHub && "bg-[var(--accent-soft)]/30",
                isSecondary && !isOwnHub && "bg-[var(--info-soft)]/30",
                expanded && "bg-surface-2",
              )}
            >
              {/* Sibling "Detail" affordance — small icon button placed
                  on the row, opens the AirportDetailModal as a keyboard
                  parallel to map double-click. Sits inside the row but
                  visually right of the bid/expand area. Stops propagation
                  so it doesn't toggle the bid expander. */}
              <button
                type="button"
                onClick={() => setAirportDetailCode(c.code)}
                aria-label={`Open ${c.name} (${c.code}) airport detail`}
                className="absolute right-1 top-1 w-7 h-7 rounded-md text-ink-muted hover:text-ink hover:bg-surface-hover flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface z-10"
                title="Open airport detail (slot bidders, ownership, capacity, government upgrades)"
              >
                <ExternalLink size={12} aria-hidden="true" />
              </button>
              <button
                onClick={() => setExpandedCode(expanded ? null : c.code)}
                className={cn(
                  "w-full grid grid-cols-12 gap-2 pl-3 pr-9 py-2.5 text-left transition-colors text-[0.8125rem]",
                  "hover:bg-surface-hover",
                )}
              >
                {/* Airport */}
                <div className="col-span-4 flex items-center gap-2 min-w-0">
                  {expanded ? (
                    <ChevronDown size={13} className="text-ink-muted shrink-0" />
                  ) : (
                    <ChevronRight size={13} className="text-ink-muted shrink-0" />
                  )}
                  <span className="font-mono font-semibold text-ink shrink-0">
                    {c.code}
                  </span>
                  <span className="text-ink-2 truncate">{c.name}</span>
                  {isOwnHub && (
                    <span className="text-[0.5625rem] uppercase tracking-wider text-accent font-bold shrink-0">
                      HUB
                    </span>
                  )}
                  {isSecondary && (
                    <span className="text-[0.5625rem] uppercase tracking-wider text-info font-bold shrink-0">
                      2ND
                    </span>
                  )}
                  {myBid && (
                    <span className="text-[0.5625rem] uppercase tracking-wider text-warning font-bold shrink-0">
                      BID PENDING
                    </span>
                  )}
                </div>

                {/* Tier */}
                <div className="col-span-1 text-center text-ink-muted tabular text-[0.75rem]">
                  T{tier}
                </div>

                {/* Owned */}
                <div className="col-span-2 text-right tabular font-mono">
                  {owned > 0 ? (
                    <span className="text-positive font-semibold">{owned}</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </div>

                {/* Fee/Q — only shown when there's a recurring fee */}
                <div className="col-span-2 text-right tabular font-mono text-[0.75rem]">
                  {quarterlyFee > 0 ? (
                    <span className="text-warning">{fmtMoney(quarterlyFee)}</span>
                  ) : owned > 0 ? (
                    <span className="text-positive">free</span>
                  ) : (
                    <span className="text-ink-muted">—</span>
                  )}
                </div>

                {/* Open + scarcity bar (recommendation #B11). Bar fills
                    based on (totalCapacity - available) / totalCapacity —
                    full bar = sold out, empty bar = wide open. Player
                    sees scarcity at a glance without re-reading numbers. */}
                <div className="col-span-1 text-right tabular font-mono">
                  {(() => {
                    const cap = state?.totalCapacity ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[tier] ?? 0;
                    const open = state?.available ?? 0;
                    const filled = Math.max(0, cap - open);
                    const filledPct = cap > 0 ? (filled / cap) * 100 : 0;
                    const tone =
                      filledPct >= 90 ? "bg-negative" :
                      filledPct >= 70 ? "bg-warning" :
                      "bg-positive";
                    return (
                      <div className="flex flex-col items-end gap-1">
                        <span className={open > 0 ? "text-ink" : "text-ink-muted"}>
                          {open}
                        </span>
                        {cap > 0 && (
                          <div
                            className="w-full max-w-12 h-1 rounded bg-line overflow-hidden"
                            title={`${filled} of ${cap} slots held (${filledPct.toFixed(0)}%)`}
                          >
                            <div
                              className={cn("h-full transition-all", tone)}
                              style={{ width: `${filledPct}%` }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Next Q — calendar quarter when next batch opens */}
                <div className="col-span-2 text-right tabular font-mono text-[0.6875rem] text-ink-muted">
                  {state ? (
                    <>
                      +{state.nextOpening.toLocaleString("en-US")}
                      <span className="ml-1">{fmtQuarter(state.nextTickQuarter)}</span>
                    </>
                  ) : "—"}
                </div>
              </button>

              {/* Expanded: bid + release controls */}
              {expanded && (
                <BidPanel
                  airportCode={c.code}
                  tier={tier}
                  owned={owned}
                  available={state?.available ?? 0}
                  myBid={myBid}
                  onPlaceBid={(slots, price) => {
                    const r = submitSlotBid(c.code, slots, price);
                    if (!r.ok) toast.negative(r.error ?? "Bid failed");
                    else setExpandedCode(null);
                  }}
                  onCancelBid={() => cancelSlotBid(c.code)}
                  onRelease={(n) => {
                    const r = releaseSlots(c.code, n);
                    if (!r.ok) toast.negative(r.error ?? "Release failed");
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {rows.length > 60 && (
        <div className="text-[0.6875rem] text-ink-muted text-center">
          Showing first 60 of {rows.length}. Refine search to see more.
        </div>
      )}

      <div className="rounded-md border border-line bg-surface-2/40 p-3 text-[0.75rem] text-ink-2">
        <div className="flex items-center gap-1.5 mb-1 text-ink font-semibold uppercase tracking-wider text-[0.625rem]">
          <Calendar size={11} /> Yearly slot opens
        </div>
        Once per simulated year, a fresh batch of slots opens at every
        airport. Tier 1 ~200/year, Tier 2 ~125/year, Tier 3 ~63/year,
        Tier 4 ~32/year (±20% jitter). The &ldquo;Next Q&rdquo; column shows the
        announced opening per airport so you can plan bids.
      </div>
    </div>
  );
}

/**
 * Inline expand-on-click panel for one airport: bid form + release control.
 * Visible only when the player taps a row, so the table itself stays calm.
 */
function BidPanel({
  airportCode, tier, owned, available, myBid, onPlaceBid, onCancelBid, onRelease,
}: {
  airportCode: string;
  tier: CityTier;
  owned: number;
  available: number;
  myBid?: { slots: number; pricePerSlot: number };
  onPlaceBid: (slots: number, price: number) => void;
  onCancelBid: () => void;
  onRelease: (n: number) => void;
}) {
  const minPrice = BASE_SLOT_PRICE_BY_TIER[tier];
  const [slotsRequested, setSlotsRequested] = useState<number>(myBid?.slots ?? 5);
  const [pricePerSlot, setPricePerSlot] = useState<number>(myBid?.pricePerSlot ?? minPrice);
  const [releaseCount, setReleaseCount] = useState<number>(Math.min(5, owned));

  const maxCommitWeekly = slotsRequested * pricePerSlot;
  const maxCommitQuarterly = maxCommitWeekly * 13;
  const priceTooLow = pricePerSlot < minPrice;
  const noSlotsAvailable = available <= 0;

  return (
    <div className="bg-surface px-4 py-3 border-t border-line space-y-4">
      {/* Pending bid summary + cancel */}
      {myBid && (
        <div className="rounded-md border border-warning bg-[var(--warning-soft)] px-3 py-2 flex items-baseline justify-between text-[0.75rem]">
          <span className="text-ink-2">
            Pending bid: <strong className="text-ink">{myBid.slots.toLocaleString("en-US")}</strong> slots at <strong className="text-ink">${myBid.pricePerSlot.toLocaleString("en-US")}/wk</strong>
          </span>
          <button
            onClick={onCancelBid}
            className="text-negative hover:underline text-[0.6875rem]"
          >
            Cancel bid
          </button>
        </div>
      )}

      {/* Bid form */}
      <div>
        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
          Place a bid {myBid ? "(replaces pending)" : ""}
        </div>
        <div className="grid grid-cols-12 gap-3 items-end">
          <div className="col-span-4">
            <label className="text-[0.6875rem] text-ink-muted block mb-1">
              Slots requested
            </label>
            <input
              type="number"
              min={1}
              max={Math.max(1, available)}
              value={slotsRequested}
              onChange={(e) => setSlotsRequested(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="w-full h-9 px-2 rounded-md border border-line bg-surface text-[0.875rem] text-ink text-right tabular font-mono focus:outline-none focus:border-primary"
            />
            <div className="text-[0.625rem] text-ink-muted mt-0.5 tabular">
              {available.toLocaleString("en-US")} open at this airport
            </div>
          </div>
          <div className="col-span-5">
            <label className="text-[0.6875rem] text-ink-muted block mb-1">
              Bid per slot ($/week)
            </label>
            <input
              type="number"
              min={minPrice}
              step={5_000}
              value={pricePerSlot}
              onChange={(e) => setPricePerSlot(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className={cn(
                "w-full h-9 px-2 rounded-md border bg-surface text-[0.875rem] text-ink text-right tabular font-mono focus:outline-none",
                priceTooLow ? "border-negative focus:border-negative" : "border-line focus:border-primary",
              )}
            />
            <div className="text-[0.625rem] text-ink-muted mt-0.5 tabular">
              Min ${minPrice.toLocaleString("en-US")}/wk · Tier {tier} base
            </div>
          </div>
          <div className="col-span-3">
            <Button
              variant="primary"
              disabled={priceTooLow || slotsRequested < 1 || noSlotsAvailable}
              onClick={() => onPlaceBid(slotsRequested, pricePerSlot)}
              className="w-full"
            >
              Submit bid
            </Button>
          </div>
        </div>

        {/* Cost preview */}
        <div className="mt-3 rounded-md border border-line bg-surface-2/40 px-3 py-2 grid grid-cols-3 gap-3 text-[0.75rem]">
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Weekly commit
            </div>
            <div className="tabular font-mono text-ink mt-0.5">
              ${maxCommitWeekly.toLocaleString("en-US")}
            </div>
          </div>
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Quarterly commit
            </div>
            <div className="tabular font-mono text-ink mt-0.5">
              {fmtMoney(maxCommitQuarterly)}
            </div>
          </div>
          <div>
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Resolves
            </div>
            <div className="text-[0.75rem] text-ink-2 mt-0.5">
              At quarter close
            </div>
          </div>
        </div>

        {priceTooLow && (
          <div className="mt-2 text-[0.75rem] text-negative">
            Below the Tier {tier} minimum (${minPrice.toLocaleString("en-US")}/wk).
          </div>
        )}
        {noSlotsAvailable && (
          <div className="mt-2 text-[0.75rem] text-warning">
            No slots available right now. Next batch opens{" "}
            {fmtQuarter(useGame.getState().airportSlots?.[airportCode]?.nextTickQuarter ?? 99)}.
          </div>
        )}
      </div>

      {/* Release control — only when player owns AND pays a fee */}
      {owned > 0 && (
        <div className="pt-3 border-t border-line">
          <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Release slots
          </div>
          <div className="grid grid-cols-12 gap-3 items-end">
            <div className="col-span-4">
              <label className="text-[0.6875rem] text-ink-muted block mb-1">
                Slots to release
              </label>
              <input
                type="number"
                min={1}
                max={owned}
                value={releaseCount}
                onChange={(e) => setReleaseCount(Math.max(1, Math.min(owned, parseInt(e.target.value, 10) || 1)))}
                className="w-full h-9 px-2 rounded-md border border-line bg-surface text-[0.875rem] text-ink text-right tabular font-mono focus:outline-none focus:border-primary"
              />
              <div className="text-[0.625rem] text-ink-muted mt-0.5 tabular">
                You own {owned.toLocaleString("en-US")}
              </div>
            </div>
            <div className="col-span-5 text-[0.75rem] text-ink-2 leading-relaxed">
              Stops the recurring fee on the released slots and returns
              them to the airport&apos;s open pool. Routes touching this
              airport must still fit within remaining slots.
            </div>
            <div className="col-span-3">
              <Button
                variant="secondary"
                onClick={() => onRelease(releaseCount)}
                disabled={releaseCount < 1}
                className="w-full"
              >
                Release
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
