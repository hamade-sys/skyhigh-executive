"use client";

import { useMemo, useState } from "react";
import { Button, Input } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { CITIES, CITIES_BY_CODE } from "@/data/cities";
import { fmtMoney } from "@/lib/format";
import { BASE_SLOT_PRICE_BY_TIER } from "@/lib/slots";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";
import type { CityTier } from "@/types/game";
import { Search, Gavel, Calendar } from "lucide-react";

/**
 * Player-facing airport slot market.
 *
 * Lists every airport with its current available slots, your holdings,
 * any bid you've placed, and the announced next-quarter opening. The
 * player can submit/cancel bids; bids are resolved at quarter close
 * (highest price/slot wins until available runs out).
 */
export function SlotMarketPanel() {
  const player = useGame(selectPlayer);
  const airportSlots = useGame((s) => s.airportSlots);
  const submitSlotBid = useGame((s) => s.submitSlotBid);
  const cancelSlotBid = useGame((s) => s.cancelSlotBid);
  const [query, setQuery] = useState("");
  const [bidDraft, setBidDraft] = useState<Record<string, { slots: number; price: number }>>({});

  const rows = useMemo(() => {
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
      .sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }, [query]);

  if (!player) return null;

  const myBids = new Map(
    (player.pendingSlotBids ?? []).map((b) => [b.airportCode, b]),
  );

  function setDraft(code: string, patch: { slots?: number; price?: number }) {
    setBidDraft((prev) => ({
      ...prev,
      [code]: {
        slots: patch.slots ?? prev[code]?.slots ?? 5,
        price: patch.price ?? prev[code]?.price ?? 0,
      },
    }));
  }

  function placeBid(code: string, tier: CityTier) {
    const draft = bidDraft[code];
    const slots = draft?.slots ?? 5;
    const price = draft?.price ?? BASE_SLOT_PRICE_BY_TIER[tier];
    const r = submitSlotBid(code, slots, price);
    if (!r.ok) toast.negative(r.error ?? "Bid failed");
    else setBidDraft((prev) => { const next = { ...prev }; delete next[code]; return next; });
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
          Each route consumes one slot per weekly schedule at both endpoints.
          Bids resolve at quarter close — highest price/slot wins. Unsold
          slots roll forward and new batches open every year.
        </p>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by airport code, city, or region…"
          className="w-full rounded-md border border-line bg-surface px-8 py-2 text-[0.875rem] text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
        />
      </div>

      <div className="rounded-md border border-line overflow-hidden">
        <table className="w-full text-[0.8125rem]">
          <thead>
            <tr className="bg-surface-2 border-b border-line">
              <th className="text-left px-2.5 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Airport</th>
              <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Tier</th>
              <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Mine</th>
              <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Open</th>
              <th className="text-right px-2 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Next</th>
              <th className="text-left px-2.5 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Bid</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 50).map((c) => {
              const tier = c.tier as CityTier;
              const state = airportSlots?.[c.code];
              const owned = player.slotsByAirport[c.code] ?? 0;
              const myBid = myBids.get(c.code);
              const draft = bidDraft[c.code];
              const basePrice = BASE_SLOT_PRICE_BY_TIER[tier];
              const isOwnHub = c.code === player.hubCode;
              const isSecondary = player.secondaryHubCodes.includes(c.code);
              return (
                <tr key={c.code} className={cn(
                  "border-b border-line last:border-0",
                  isOwnHub && "bg-[var(--accent-soft)]/30",
                  isSecondary && "bg-[var(--info-soft)]/30",
                )}>
                  <td className="px-2.5 py-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold text-ink">{c.code}</span>
                      <span className="text-[0.75rem] text-ink-2 truncate max-w-[160px]">{c.name}</span>
                      {isOwnHub && <span className="text-[0.5625rem] uppercase tracking-wider text-accent font-bold">HUB</span>}
                      {isSecondary && <span className="text-[0.5625rem] uppercase tracking-wider text-info font-bold">2ND</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right tabular text-ink-muted text-[0.75rem]">
                    T{tier}
                  </td>
                  <td className="px-2 py-2 text-right tabular font-mono">
                    {owned > 0 ? <span className="text-positive font-semibold">{owned}</span> : <span className="text-ink-muted">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right tabular font-mono">
                    <span className={state?.available && state.available > 0 ? "text-ink" : "text-ink-muted"}>
                      {state?.available ?? "—"}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right tabular font-mono text-[0.75rem] text-ink-muted">
                    {state ? `+${state.nextOpening} Q${state.nextTickQuarter}` : "—"}
                  </td>
                  <td className="px-2.5 py-2">
                    {myBid ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[0.6875rem] tabular font-mono text-ink">
                          {myBid.slots} × ${(myBid.pricePerSlot / 1000).toFixed(0)}K
                        </span>
                        <button
                          onClick={() => cancelSlotBid(c.code)}
                          className="text-[0.625rem] text-negative hover:underline"
                        >
                          cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          min={1}
                          max={50}
                          value={draft?.slots ?? 5}
                          onChange={(e) => setDraft(c.code, { slots: parseInt(e.target.value, 10) || 1 })}
                          className="w-12 h-6 text-[0.6875rem]"
                          title="Slots wanted"
                        />
                        <span className="text-[0.625rem] text-ink-muted">×</span>
                        <Input
                          type="number"
                          min={basePrice}
                          step={5_000}
                          value={draft?.price ?? basePrice}
                          onChange={(e) => setDraft(c.code, { price: parseInt(e.target.value, 10) || basePrice })}
                          className="w-20 h-6 text-[0.6875rem]"
                          title={`Min $${(basePrice / 1000).toFixed(0)}K/slot`}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => placeBid(c.code, tier)}
                          title={`Bid for slots at ${c.name}`}
                        >
                          <Gavel size={11} />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > 50 && (
        <div className="text-[0.6875rem] text-ink-muted text-center">
          Showing first 50 of {rows.length}. Refine search to see more.
        </div>
      )}

      <div className="rounded-md border border-line bg-surface-2/40 p-3 text-[0.75rem] text-ink-2">
        <div className="flex items-center gap-1.5 mb-1 text-ink font-semibold uppercase tracking-wider text-[0.625rem]">
          <Calendar size={11} /> How slot opens work
        </div>
        Each Q5 / Q9 / Q13 / Q17 a fresh batch of slots opens at every airport.
        Tier 1 ~200/year, Tier 2 ~125/year, Tier 3 ~63/year, Tier 4 ~32/year
        (±20% jitter). The "Next" column above shows next quarter's opening
        per airport so you can plan bids accordingly.
      </div>
    </div>
  );
}
