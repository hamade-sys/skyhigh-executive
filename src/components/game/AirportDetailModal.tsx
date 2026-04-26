"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { CITIES_BY_CODE } from "@/data/cities";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { City } from "@/types/game";
import { Crown, MapPin, Building, ShieldAlert } from "lucide-react";
import {
  airportAskingPriceUsd,
  airportQuarterlySlotRevenueUsd,
  AIRPORT_DEFAULT_CAPACITY_BY_TIER,
  AIRPORT_EXPANSION_COST_PER_LEVEL,
  AIRPORT_EXPANSION_SLOTS,
  AIRPORT_MAX_CAPACITY_BY_TIER,
} from "@/lib/airport-ownership";

/**
 * Airport detail popup — opened when the player double-clicks a city on
 * the map. Shows:
 *  - Headline: city name, IATA, region, tier
 *  - Slot supply: pool available + your held + airport's home hub airline
 *  - Per-airline breakdown: every team's slot count + which one is the
 *    home hub airline
 *  - Player's slot utilization: held vs used (e.g. 14/30)
 *  - Routes touching this airport (player's only — rivals' confidential)
 *  - V2 placeholder for airport investment value
 */
export function AirportDetailModal({
  city, onClose,
}: {
  city: City | null;
  onClose: () => void;
}) {
  const s = useGame();
  const player = selectPlayer(s);

  const data = useMemo(() => {
    if (!city) return null;
    const airportSlots = s.airportSlots?.[city.code];
    const pool = airportSlots?.available ?? 0;
    const nextOpening = airportSlots?.nextOpening ?? 0;

    // Per-team breakdown
    const breakdown = s.teams.map((t) => {
      const held = t.airportLeases?.[city.code]?.slots ?? 0;
      const usedAtCode = t.routes
        .filter((r) =>
          (r.status === "active" || r.status === "suspended" || r.status === "pending") &&
          (r.originCode === city.code || r.destCode === city.code),
        )
        .reduce((sum, r) => sum + r.dailyFrequency * 7, 0);
      const isHomeHub = t.hubCode === city.code;
      const isSecondaryHub = t.secondaryHubCodes?.includes(city.code) ?? false;
      return { team: t, held, used: usedAtCode, isHomeHub, isSecondaryHub };
    });

    const homeHubTeam = breakdown.find((b) => b.isHomeHub);
    const totalHeldByAllTeams = breakdown.reduce((sum, b) => sum + b.held, 0);
    return { pool, nextOpening, breakdown, homeHubTeam, totalHeldByAllTeams };
  }, [city, s]);

  if (!city || !data) return null;

  const isOpen = !!city;
  const playerEntry = data.breakdown.find((b) => b.team.id === s.playerTeamId);

  const tierLabel: Record<number, string> = {
    1: "Tier 1 — Major hub",
    2: "Tier 2 — Regional",
    3: "Tier 3 — Secondary",
    4: "Tier 4 — Tertiary",
  };

  return (
    <Modal open={isOpen} onClose={onClose} className="w-[min(680px,calc(100vw-2rem))]">
      <ModalHeader>
        <div className="flex items-center gap-2 mb-1.5">
          <Badge tone="accent">Airport</Badge>
          {data.homeHubTeam && (
            <Badge tone="primary">
              <Crown size={11} className="mr-1" />
              Home hub: {data.homeHubTeam.team.name}
            </Badge>
          )}
        </div>
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-[1.5rem] text-ink leading-tight font-mono">
            {city.code}
          </h2>
          <span className="font-display text-[1.125rem] text-ink-2">{city.name}</span>
        </div>
        <div className="text-ink-muted text-[0.8125rem] mt-1 flex items-center gap-1.5">
          <MapPin size={11} /> {city.regionName} · {tierLabel[city.tier] ?? `Tier ${city.tier}`}
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 max-h-[60vh] overflow-auto">
        {/* Player's slot utilization */}
        {playerEntry && (
          <section>
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
              Your position
            </div>
            <div className="rounded-md border border-primary bg-[rgba(20,53,94,0.04)] p-3">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-[0.8125rem] text-ink-2">Slots used / held</span>
                <span className="font-mono tabular text-ink font-bold text-[1.25rem]">
                  {playerEntry.used}<span className="text-ink-muted">/{playerEntry.held}</span>
                </span>
              </div>
              <div className="h-1.5 rounded bg-line overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded",
                    playerEntry.held === 0
                      ? "bg-line"
                      : playerEntry.used / playerEntry.held > 0.9
                        ? "bg-warning"
                        : "bg-primary",
                  )}
                  style={{
                    width: `${Math.min(100, (playerEntry.used / Math.max(1, playerEntry.held)) * 100)}%`,
                  }}
                />
              </div>
              {playerEntry.held - playerEntry.used > 0 ? (
                <div className="text-[0.6875rem] text-ink-muted mt-2">
                  {playerEntry.held - playerEntry.used} slots free at this airport — you can add
                  routes touching {city.code} without bidding for new slots.
                </div>
              ) : (
                <div className="text-[0.6875rem] text-warning mt-2">
                  Fully utilized. Bid for more slots in the Slot Market to expand here.
                </div>
              )}
            </div>
          </section>
        )}

        {/* Airport pool */}
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Airport supply
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Stat
              label="Pool open now"
              value={data.pool.toLocaleString()}
              hint="Available to bid"
            />
            <Stat
              label="Next opening"
              value={data.nextOpening.toLocaleString()}
              hint="At year tick"
            />
            <Stat
              label="All teams hold"
              value={data.totalHeldByAllTeams.toLocaleString()}
              hint="Across the field"
            />
          </div>
        </section>

        {/* Per-team breakdown */}
        <section>
          <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Airline footprint at {city.code}
          </div>
          <div className="rounded-md border border-line overflow-hidden">
            <table className="w-full text-[0.8125rem]">
              <thead>
                <tr className="bg-surface-2 border-b border-line">
                  <th className="text-left px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Airline</th>
                  <th className="text-right px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Slots held</th>
                  <th className="text-right px-3 py-2 text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted">Used</th>
                </tr>
              </thead>
              <tbody>
                {data.breakdown
                  .filter((b) => b.held > 0 || b.isHomeHub || b.isSecondaryHub)
                  .sort((a, b) => b.held - a.held)
                  .map((b) => (
                    <tr
                      key={b.team.id}
                      className={cn(
                        "border-b border-line last:border-0",
                        b.team.id === s.playerTeamId && "bg-[rgba(20,53,94,0.04)]",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span
                            className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg shrink-0"
                            style={{ background: b.team.color }}
                          >
                            {b.team.code}
                          </span>
                          <span className="text-ink truncate font-medium">
                            {b.team.name}
                          </span>
                          {b.team.id === player?.id && <Badge tone="primary">You</Badge>}
                          {b.isHomeHub && (
                            <Badge tone="accent">
                              <Crown size={10} className="mr-0.5" /> Home
                            </Badge>
                          )}
                          {b.isSecondaryHub && <Badge tone="info">Secondary</Badge>}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right tabular font-mono text-ink">
                        {b.held > 0 ? b.held.toLocaleString() : <span className="text-ink-muted">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right tabular font-mono">
                        {b.team.id === s.playerTeamId ? (
                          <span className="text-ink">{b.used.toLocaleString()}</span>
                        ) : (
                          <span className="text-ink-muted text-[0.6875rem] italic">private</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {data.breakdown.every((b) => b.held === 0 && !b.isHomeHub) && (
            <div className="text-[0.75rem] text-ink-muted italic mt-2">
              No airline currently operates at {city.code}.
            </div>
          )}
        </section>

        {/* Routes touching this airport (player's only) */}
        {playerEntry && (() => {
          const playerRoutes = playerEntry.team.routes.filter(
            (r) =>
              (r.status === "active" || r.status === "suspended" || r.status === "pending") &&
              (r.originCode === city.code || r.destCode === city.code),
          );
          if (playerRoutes.length === 0) return null;
          return (
            <section>
              <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
                Your routes touching {city.code} · {playerRoutes.length}
              </div>
              <div className="space-y-1">
                {playerRoutes.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-baseline justify-between rounded-md border border-line bg-surface-2/40 px-3 py-1.5 text-[0.8125rem]"
                  >
                    <span className="font-mono text-ink">
                      {r.originCode} → {r.destCode}
                    </span>
                    <div className="flex items-baseline gap-3 text-[0.75rem]">
                      <span className="tabular text-ink-muted">
                        {r.dailyFrequency * 7}/wk
                      </span>
                      <Badge
                        tone={
                          r.status === "pending" ? "warning" :
                          r.status === "suspended" ? "warning" : "positive"
                        }
                      >
                        {r.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* Airport ownership panel (Sprint 10) */}
        <AirportOwnership cityCode={city.code} />
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Close</Button>
      </ModalFooter>
    </Modal>
  );
}

/** Airport ownership controls. Three states:
 *   1. Unowned, player can afford → "Buy this airport for $X" CTA.
 *   2. Unowned, player too poor → asking-price card with insufficient-cash hint.
 *   3. Owned by player → slot-rate editor + expansion buttons + sell.
 *   4. Owned by rival → status card noting who owns it (read-only).
 *
 *  Pricing follows the master-ref formula: base[tier] + 4 × current
 *  quarterly slot revenue at this airport. */
function AirportOwnership({ cityCode }: { cityCode: string }) {
  const player = useGame(selectPlayer);
  const teams = useGame((s) => s.teams);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const buyAirport = useGame((s) => s.buyAirport);
  const sellAirport = useGame((s) => s.sellAirport);
  const setAirportSlotRate = useGame((s) => s.setAirportSlotRate);
  const expandAirportCapacity = useGame((s) => s.expandAirportCapacity);
  const [pendingRate, setPendingRate] = useState<string>("");

  if (!player) return null;
  const city = CITIES_BY_CODE[cityCode];
  if (!city) return null;
  const tier = city.tier as 1 | 2 | 3 | 4;
  const askingPrice = airportAskingPriceUsd(cityCode, slotState, teams);
  const qRevenue = airportQuarterlySlotRevenueUsd(cityCode, teams);
  const ownedByMe = slotState?.ownerTeamId === player.id;
  const ownedByRival = slotState?.ownerTeamId && slotState.ownerTeamId !== player.id;
  const ownerTeam = ownedByRival ? teams.find((t) => t.id === slotState!.ownerTeamId) : null;
  const capacity = slotState?.totalCapacity ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[tier];
  const maxCap = AIRPORT_MAX_CAPACITY_BY_TIER[tier];
  const expansionCost = AIRPORT_EXPANSION_COST_PER_LEVEL[tier];

  if (ownedByMe) {
    const currentRate = slotState?.ownerSlotRatePerWeekUsd ?? 0;
    const opex = qRevenue * 0.30;
    const ownLease = player.airportLeases?.[cityCode];
    const ownSlotFees = ownLease ? ownLease.totalWeeklyCost * 13 : 0;
    const netOwnerProfit = qRevenue - opex - ownSlotFees;
    return (
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
          <Building size={12} className="text-accent" />
          Airport ownership · YOU OWN THIS AIRPORT
        </div>
        <div className="rounded-md border border-accent bg-[var(--accent-soft)] p-3 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Q slot revenue" value={fmtMoney(qRevenue)} hint="Across all tenants" />
            <Stat label="Q opex (30%)" value={fmtMoney(opex)} hint="Crew + ATC + upkeep" />
            <Stat
              label="Q net to you"
              value={fmtMoney(netOwnerProfit)}
              hint="Surfaces in 'Subsidiary revenue'"
            />
          </div>

          <div>
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5">
              Slot rate · weekly fee per slot (no bidding while owned)
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder={String(currentRate)}
                value={pendingRate}
                onChange={(e) => setPendingRate(e.target.value)}
                className="flex-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-[0.875rem] tabular font-mono"
              />
              <Button
                size="sm"
                variant="primary"
                disabled={!pendingRate}
                onClick={() => {
                  const v = parseInt(pendingRate, 10);
                  if (Number.isNaN(v)) return;
                  setAirportSlotRate({ airportCode: cityCode, newRatePerWeekUsd: v });
                  setPendingRate("");
                }}
              >
                Apply rate
              </Button>
            </div>
            <div className="text-[0.6875rem] text-ink-muted mt-1">
              Current rate {fmtMoney(currentRate)} / wk per slot.
              Higher rates extract more revenue but may price tenants out
              (they can release slots if your fee outweighs the route).
            </div>
          </div>

          <div>
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5">
              Capacity · {capacity}/{maxCap} slots
            </div>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                disabled={capacity >= maxCap || player.cashUsd < expansionCost}
                onClick={() => expandAirportCapacity(cityCode)}
                title={
                  capacity >= maxCap
                    ? "Already at maximum capacity for this tier"
                    : `+${AIRPORT_EXPANSION_SLOTS} slots for ${fmtMoney(expansionCost)}`
                }
              >
                Add +{AIRPORT_EXPANSION_SLOTS} slots · {fmtMoney(expansionCost)}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (!confirm(
                    `Sell ${city.name} airport?\n` +
                    `Proceeds ~${fmtMoney(askingPrice * 0.95)} (5% broker fee). Bidding will resume at this airport.`,
                  )) return;
                  sellAirport(cityCode);
                }}
              >
                Sell airport
              </Button>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (ownedByRival && ownerTeam) {
    return (
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-warning" /> Airport ownership
        </div>
        <div className="rounded-md border border-warning bg-[var(--warning-soft)] p-3">
          <div className="text-[0.875rem] text-ink">
            <span
              className="inline-flex w-5 h-5 rounded-sm items-center justify-center font-mono text-[0.5625rem] font-semibold text-primary-fg mr-1.5 align-middle"
              style={{ background: ownerTeam.color }}
            >
              {ownerTeam.code}
            </span>
            <strong>{ownerTeam.name}</strong> owns this airport and sets the slot rate.
          </div>
          <div className="text-[0.75rem] text-ink-2 mt-1.5 leading-relaxed">
            Current rate{" "}
            <span className="tabular font-mono font-semibold text-ink">
              {fmtMoney(slotState?.ownerSlotRatePerWeekUsd ?? 0)} / wk per slot
            </span>{" "}
            · No bidding here. Your slot fees flow to {ownerTeam.name} as
            their subsidiary revenue.
          </div>
        </div>
      </section>
    );
  }

  // Unowned — show acquire CTA
  const canAfford = player.cashUsd >= askingPrice;
  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
        <Building size={12} /> Airport ownership
      </div>
      <div className="rounded-md border border-line bg-surface p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Asking price" value={fmtMoney(askingPrice)} hint="Tier base + 4× Q rev" />
          <Stat label="Q slot revenue" value={fmtMoney(qRevenue)} hint="What it earns now" />
          <Stat label="Capacity" value={`${capacity} / ${maxCap}`} hint="+200 per expansion" />
        </div>
        <Button
          size="sm"
          variant="primary"
          disabled={!canAfford}
          onClick={() => {
            if (!confirm(
              `Acquire ${city.name} airport for ${fmtMoney(askingPrice)}?\n\n` +
              `You'll collect every airline's slot fees here as your own revenue. ` +
              `Bidding for this airport will be disabled — you set the slot rate.`,
            )) return;
            buyAirport(cityCode);
          }}
        >
          {canAfford
            ? `Acquire airport · ${fmtMoney(askingPrice)}`
            : `Need ${fmtMoney(askingPrice - player.cashUsd)} more cash`}
        </Button>
        <p className="text-[0.6875rem] text-ink-muted leading-relaxed">
          Tier {tier} airport. Owning lets you set the per-slot weekly fee and
          collect slot revenue from every operating airline (yourself
          included; intra-company fees net out). Operating cost is 30% of
          gross slot revenue. Net surfaces in your P&L as Subsidiary revenue.
        </p>
      </div>
    </section>
  );
}

function Stat({
  label, value, hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-2.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div className="font-display text-[1.25rem] text-ink mt-0.5 tabular">
        {value}
      </div>
      {hint && (
        <div className="text-[0.6875rem] text-ink-muted mt-0.5">{hint}</div>
      )}
    </div>
  );
}
