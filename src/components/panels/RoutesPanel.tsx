"use client";

import { Badge } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney, fmtPct } from "@/lib/format";
import { CITIES_BY_CODE } from "@/data/cities";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";

export function RoutesPanel() {
  const s = useGame();
  const player = selectPlayer(s);
  const closeRoute = useGame((g) => g.closeRoute);
  if (!player) return null;

  const active = player.routes.filter((r) => r.status === "active");

  return (
    <div className="space-y-3">
      <div className="text-[0.8125rem] text-ink-2">
        {active.length} routes flying · click any city on the map to open a new route
      </div>
      {active.length === 0 ? (
        <div className="py-12 text-center text-ink-muted text-[0.875rem] rounded-lg border border-dashed border-line">
          No routes yet. Pick an origin and destination from the map.
        </div>
      ) : (
        <div className="space-y-2">
          {active.map((r) => {
            const origin = CITIES_BY_CODE[r.originCode];
            const dest = CITIES_BY_CODE[r.destCode];
            const profit = r.quarterlyRevenue - r.quarterlyFuelCost - r.quarterlySlotCost;
            const specs = r.aircraftIds
              .map((id) => player.fleet.find((f) => f.id === id))
              .map((p) => p && AIRCRAFT_BY_ID[p.specId]?.name)
              .filter(Boolean)
              .join(", ");
            return (
              <div key={r.id} className="rounded-md border border-line bg-surface p-3">
                <div className="flex items-start justify-between mb-2 gap-2">
                  <div>
                    <div className="font-mono text-ink font-medium">
                      {r.originCode} → {r.destCode}
                    </div>
                    <div className="text-[0.75rem] text-ink-muted tabular mt-0.5">
                      {origin?.name} · {dest?.name} · {Math.round(r.distanceKm).toLocaleString()} km
                    </div>
                  </div>
                  <Badge
                    tone={r.avgOccupancy > 0.7 ? "positive" : r.avgOccupancy < 0.5 && r.avgOccupancy > 0 ? "negative" : "neutral"}
                  >
                    {fmtPct(r.avgOccupancy * 100, 0)} load
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[0.75rem]">
                  <span className="text-ink-muted">Aircraft</span>
                  <span className="text-right text-ink-2 truncate">{specs || "—"}</span>
                  <span className="text-ink-muted">Frequency</span>
                  <span className="text-right tabular font-mono text-ink">{r.dailyFrequency}/day</span>
                  <span className="text-ink-muted">Pricing</span>
                  <span className="text-right text-ink capitalize">{r.pricingTier}</span>
                  <span className="text-ink-muted">Q revenue</span>
                  <span className="text-right tabular font-mono text-ink">{fmtMoney(r.quarterlyRevenue)}</span>
                  <span className="text-ink-muted">Q profit</span>
                  <span className={`text-right tabular font-mono font-medium ${profit >= 0 ? "text-positive" : "text-negative"}`}>
                    {fmtMoney(profit)}
                  </span>
                </div>
                <div className="flex justify-end mt-2 pt-2 border-t border-line">
                  <button
                    className="text-[0.75rem] text-negative hover:underline"
                    onClick={() => closeRoute(r.id)}
                  >
                    Close route
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
