"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { CITIES_BY_CODE } from "@/data/cities";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { City } from "@/types/game";
import { Crown, MapPin, Building, ShieldAlert, ArrowUp, ArrowDown, Trophy, Newspaper } from "lucide-react";
import {
  airportAskingPriceUsd,
  airportQuarterlySlotRevenueUsd,
  AIRPORT_DEFAULT_CAPACITY_BY_TIER,
  AIRPORT_EXPANSION_COST_PER_LEVEL,
  AIRPORT_EXPANSION_SLOTS,
  AIRPORT_MAX_CAPACITY_BY_TIER,
} from "@/lib/airport-ownership";
import { cityEffectiveDemand } from "@/lib/engine";
import { cityEventImpact } from "@/lib/city-events";

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
        .reduce((sum, r) => sum + Math.round(r.dailyFrequency * 7), 0);
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

        {/* Active events at this city — World Cup host, Olympics
            host, and any active news modifier hitting the city. */}
        <CityEventsSection cityCode={city.code} quarter={s.currentQuarter} />

        {/* Effective demand at this city, with Q/Q delta. Helps the
            player decide where to bid and how to price routes. */}
        <CityDemandSection city={city} quarter={s.currentQuarter} />

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
                        {Math.round(r.dailyFrequency * 7)}/wk
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
  // Branded confirms replace the legacy native confirm() prompts.
  // Buying and selling an airport are 7-figure decisions that
  // permanently change slot dynamics for every airline at this hub —
  // the confirmation UX has to feel proportional to that.
  const player = useGame(selectPlayer);
  const teams = useGame((s) => s.teams);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const airportBids = useGame((s) => s.airportBids);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const submitAirportBid = useGame((s) => s.submitAirportBid);
  const sellAirport = useGame((s) => s.sellAirport);
  const setAirportSlotRate = useGame((s) => s.setAirportSlotRate);
  const expandAirportCapacity = useGame((s) => s.expandAirportCapacity);
  const [pendingRate, setPendingRate] = useState<string>("");
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [confirmSell, setConfirmSell] = useState(false);

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

  // Pending bids on this airport — separate the player's own pending
  // bid (so we can show "Your bid pending") from any other team's
  // bid (so we can show "Another team has a bid pending — yours will
  // be considered against theirs").
  const pendingBidsAtAirport = (airportBids ?? []).filter(
    (b) => b.airportCode === cityCode && b.status === "pending",
  );
  const myPendingBid = pendingBidsAtAirport.find((b) => b.bidderTeamId === player.id);
  const otherPendingBids = pendingBidsAtAirport.filter((b) => b.bidderTeamId !== player.id);

  // Sell modal — only relevant when ownedByMe; rendered inline in
  // that branch's fragment.
  const sellProceeds = Math.round(askingPrice * 0.95);

  if (ownedByMe) {
    const currentRate = slotState?.ownerSlotRatePerWeekUsd ?? 0;
    const opex = qRevenue * 0.30;
    const ownLease = player.airportLeases?.[cityCode];
    const ownSlotFees = ownLease ? ownLease.totalWeeklyCost * 13 : 0;
    const netOwnerProfit = qRevenue - opex - ownSlotFees;
    // Tenant breakdown — every team (including the player themselves)
    // with a non-zero lease at this airport. Shows how many slots they
    // hold and what they're charged this quarter at the current rate.
    // Lets the player see exactly which rivals are paying and verify
    // the rate IS in effect.
    const tenants = teams
      .map((t) => {
        const lease = t.airportLeases?.[cityCode];
        if (!lease || lease.slots === 0) return null;
        return {
          teamId: t.id,
          teamName: t.name,
          teamCode: t.code,
          teamColor: t.color,
          isPlayer: t.id === player.id,
          slots: lease.slots,
          weeklyCost: lease.totalWeeklyCost,
          quarterlyCost: lease.totalWeeklyCost * 13,
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => b.slots - a.slots);
    const totalLeasedSlots = tenants.reduce((sum, t) => sum + t.slots, 0);
    return (
      <>
      <section>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
          <Building size={12} className="text-accent" />
          Airport ownership · YOU OWN THIS AIRPORT
        </div>
        <div className="rounded-md border border-accent bg-[var(--accent-soft)] p-3 space-y-3">
          {/* Headline rate display — biggest number on the screen so the
              player can verify their rate IS in effect at a glance. The
              previous design buried this in a small italic note below
              the input, which made it look like a hint rather than a
              live setting. */}
          <div className="rounded-md border border-accent bg-surface px-3 py-2.5">
            <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
              Current slot rate
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display text-[1.75rem] tabular text-ink leading-none">
                ${currentRate.toLocaleString()}
              </span>
              <span className="text-[0.75rem] text-ink-muted">/ slot / week</span>
            </div>
            <div className="text-[0.6875rem] text-ink-muted mt-1">
              Charged to all {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
              {" "}holding {totalLeasedSlots.toLocaleString()} slot
              {totalLeasedSlots === 1 ? "" : "s"} at this airport.
            </div>
          </div>

          {/* Revenue breakdown — clarified. The previous 3-stat row
              showed Q SLOT REVENUE = $156M (gross, includes your own
              contribution), Q OPEX = $46.8M, Q NET TO YOU = -$46.8M
              which left players asking "where did the $156M go?"
              The new layout walks the math top-to-bottom:
                Gross collections - your own fees = External revenue
                External revenue - 30% opex = Net to you
              So sole-tenant case (you're the only payer) reads as
              -opex without looking like the engine ate your money. */}
          {(() => {
            const externalCollections = qRevenue - ownSlotFees;
            return (
              <div className="rounded-md border border-line bg-surface px-3 py-2.5 space-y-1.5">
                <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1">
                  Quarterly revenue · how the math works
                </div>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-ink-2">
                    Gross collections
                    <span className="text-ink-muted ml-1.5 text-[0.6875rem]">(all tenants × rate × 13)</span>
                  </span>
                  <span className="tabular font-mono text-ink">{fmtMoney(qRevenue)}</span>
                </div>
                {ownSlotFees > 0 && (
                  <div className="flex items-baseline justify-between text-[0.8125rem]">
                    <span className="text-ink-2">
                      − Your own slot fees
                      <span className="text-ink-muted ml-1.5 text-[0.6875rem]">(refunded — paid to yourself)</span>
                    </span>
                    <span className="tabular font-mono text-ink-muted">−{fmtMoney(ownSlotFees)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between text-[0.8125rem] border-t border-line pt-1.5">
                  <span className="text-ink-2 font-medium">External revenue</span>
                  <span
                    className={cn(
                      "tabular font-mono font-semibold",
                      externalCollections > 0 ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {fmtMoney(externalCollections)}
                  </span>
                </div>
                <div className="flex items-baseline justify-between text-[0.8125rem]">
                  <span className="text-ink-2">
                    − Opex
                    <span className="text-ink-muted ml-1.5 text-[0.6875rem]">(30% of gross · crew + ATC + upkeep)</span>
                  </span>
                  <span className="tabular font-mono text-ink-muted">−{fmtMoney(opex)}</span>
                </div>
                <div className="flex items-baseline justify-between text-[0.875rem] border-t border-line pt-1.5">
                  <span className="text-ink font-semibold">Net to you / Q</span>
                  <span
                    className={cn(
                      "tabular font-mono font-semibold",
                      netOwnerProfit >= 0 ? "text-positive" : "text-negative",
                    )}
                  >
                    {netOwnerProfit >= 0 ? "+" : ""}{fmtMoney(netOwnerProfit)}
                  </span>
                </div>
                {externalCollections === 0 && (
                  <div className="text-[0.6875rem] text-ink-muted leading-snug pt-1 border-t border-line">
                    You&apos;re the only tenant — opex still applies even
                    when no rivals are paying. Net flips positive once
                    other airlines lease slots here.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Tenant breakdown — proves the rate IS being charged. */}
          {tenants.length > 0 && (
            <div className="rounded-md border border-line bg-surface overflow-hidden">
              <div className="px-3 py-2 border-b border-line text-[0.625rem] uppercase tracking-wider font-semibold text-ink-muted bg-surface-2/40">
                Who&rsquo;s paying this rate · {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
              </div>
              <table className="w-full text-[0.75rem]">
                <thead>
                  <tr className="border-b border-line text-[0.625rem] uppercase tracking-wider text-ink-muted">
                    <th className="text-left px-3 py-1.5">Tenant</th>
                    <th className="text-right px-3 py-1.5">Slots</th>
                    <th className="text-right px-3 py-1.5">Weekly</th>
                    <th className="text-right px-3 py-1.5">Quarterly</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((t) => (
                    <tr
                      key={t.teamId}
                      className={cn(
                        "border-b border-line/50 last:border-0",
                        t.isPlayer && "bg-[var(--accent-soft)]/40",
                      )}
                    >
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="inline-block w-3.5 h-3.5 rounded-sm shrink-0"
                            style={{ background: t.teamColor }}
                          />
                          <span className={cn(
                            "truncate",
                            t.isPlayer ? "text-ink font-semibold" : "text-ink-2",
                          )}>
                            {t.teamName}
                          </span>
                          {t.isPlayer && (
                            <span className="text-[0.5625rem] uppercase tracking-wider font-bold text-accent">
                              YOU
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular font-mono text-ink">
                        {t.slots.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular font-mono text-ink-2">
                        ${t.weeklyCost.toLocaleString()}
                      </td>
                      <td className="px-3 py-1.5 text-right tabular font-mono text-ink font-medium">
                        ${t.quarterlyCost.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.length === 1 && tenants[0].isPlayer && (
                <div className="px-3 py-1.5 border-t border-line bg-surface-2/30 text-[0.625rem] text-ink-muted leading-snug">
                  You&apos;re the only tenant — rivals don&apos;t fly here yet.
                  No external slot revenue while you&apos;re sole tenant.
                </div>
              )}
            </div>
          )}

          {/* Rate setter — formatted with commas. Saved rate echoes
              into the headline display above the moment Apply is hit. */}
          <div>
            <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-1.5">
              Change slot rate
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted text-[0.875rem] pointer-events-none">$</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder={currentRate.toLocaleString()}
                  value={pendingRate}
                  onChange={(e) => {
                    // Strip any commas the user types so we can re-format
                    // and keep the underlying number clean for parseInt.
                    const digits = e.target.value.replace(/[^\d]/g, "");
                    setPendingRate(
                      digits === "" ? "" : parseInt(digits, 10).toLocaleString(),
                    );
                  }}
                  className="w-full rounded-md border border-line bg-surface pl-6 pr-2.5 py-1.5 text-[0.875rem] tabular font-mono"
                />
              </div>
              <Button
                size="sm"
                variant="primary"
                disabled={!pendingRate}
                onClick={() => {
                  // Strip commas before parsing.
                  const v = parseInt(pendingRate.replace(/,/g, ""), 10);
                  if (Number.isNaN(v)) return;
                  setAirportSlotRate({ airportCode: cityCode, newRatePerWeekUsd: v });
                  setPendingRate("");
                }}
              >
                Apply rate
              </Button>
            </div>
            <div className="text-[0.6875rem] text-ink-muted mt-1">
              Higher rates extract more revenue but may price tenants out
              (they can release slots if your fee outweighs the route).
              All current tenants are re-billed at the new rate from
              next quarter.
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
                onClick={() => setConfirmSell(true)}
              >
                Sell airport
              </Button>
            </div>
          </div>
        </div>
      </section>

      <Modal open={confirmSell} onClose={() => setConfirmSell(false)}>
        <ModalHeader>
          <h2 className="font-display text-[1.5rem] text-ink">
            Sell {city.name} airport?
          </h2>
          <p className="text-ink-muted text-[0.8125rem] mt-1">
            Bidding will resume here at the auction default. Tenant airlines
            will revert to paying the cleared rate, not yours. Your
            subsidiary revenue from this hub stops next quarter.
          </p>
        </ModalHeader>
        <ModalBody className="space-y-2">
          <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-muted">Asking price (mark-to-market)</span>
              <span className="tabular font-mono text-ink">{fmtMoney(askingPrice)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-ink-muted">Broker fee (5%)</span>
              <span className="tabular font-mono text-negative">−{fmtMoney(askingPrice - sellProceeds)}</span>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 mt-1.5">
              <span className="text-ink font-semibold">Net proceeds</span>
              <span className="tabular font-mono text-positive font-semibold">{fmtMoney(sellProceeds)}</span>
            </div>
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="ghost" onClick={() => setConfirmSell(false)}>
            Keep airport
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              sellAirport(cityCode);
              setConfirmSell(false);
            }}
          >
            Sell · {fmtMoney(sellProceeds)}
          </Button>
        </ModalFooter>
      </Modal>
      </>
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

  // Unowned — show bid CTA. Cash is escrowed at submission, regulator
  // approval is required, 2Q window before auto-expiry refund.
  const canAfford = player.cashUsd >= askingPrice;
  const myBidQuartersHeld = myPendingBid
    ? currentQuarter - myPendingBid.submittedQuarter
    : 0;
  return (
    <>
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

        {/* Pending-bid surfaces — explain to the player why they
            can't bid again while their previous bid is held. */}
        {myPendingBid ? (
          <div className="rounded-md border border-warning bg-[var(--warning-soft)] p-2.5 text-[0.8125rem]">
            <div className="font-semibold text-warning flex items-baseline justify-between gap-2">
              <span>Your bid is in regulatory review</span>
              <span className="tabular font-mono text-[0.6875rem] text-ink-muted">
                {myBidQuartersHeld === 0 ? "submitted this quarter" : `${myBidQuartersHeld}Q held`}
              </span>
            </div>
            <div className="text-ink-2 mt-1 leading-relaxed">
              {fmtMoney(myPendingBid.bidPriceUsd)} held in escrow. The
              facilitator will approve or reject before the 2-quarter
              window expires (auto-refund if no decision).
            </div>
          </div>
        ) : otherPendingBids.length > 0 ? (
          <div className="rounded-md border border-line bg-surface-2/40 p-2.5 text-[0.8125rem]">
            <div className="font-semibold text-ink">
              {otherPendingBids.length} other bid{otherPendingBids.length === 1 ? "" : "s"} in review
            </div>
            <div className="text-ink-muted mt-0.5 text-[0.6875rem]">
              You can still submit your own bid — the facilitator picks
              one to approve and refunds the rest.
            </div>
          </div>
        ) : null}

        {!myPendingBid && (
          <Button
            size="sm"
            variant="primary"
            disabled={!canAfford}
            onClick={() => setConfirmBuy(true)}
          >
            {canAfford
              ? `Submit bid · ${fmtMoney(askingPrice)}`
              : `Need ${fmtMoney(askingPrice - player.cashUsd)} more cash`}
          </Button>
        )}

        <p className="text-[0.6875rem] text-ink-muted leading-relaxed">
          Tier {tier} airport. Acquiring requires facilitator (regulator)
          approval — your bid amount is held in escrow for up to 2 quarters
          while the facilitator reviews. If approved, ownership transfers
          and you collect every airline&apos;s slot fees as Subsidiary
          revenue (30% opex). If rejected or expired, your cash is
          refunded in full.
        </p>
      </div>
    </section>

    <Modal open={confirmBuy} onClose={() => setConfirmBuy(false)}>
      <ModalHeader>
        <h2 className="font-display text-[1.5rem] text-ink">
          Submit bid for {city.name} airport?
        </h2>
        <p className="text-ink-muted text-[0.8125rem] mt-1">
          Your bid amount is held in escrow immediately. The facilitator
          (acting as regulator) reviews and either approves the transfer
          of operating control or rejects the bid. If 2 quarters pass
          without a decision, the bid auto-expires and your cash is
          refunded in full. No fees on rejection.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-muted">Bid amount (escrowed)</span>
            <span className="tabular font-mono text-ink">{fmtMoney(askingPrice)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-muted">Quarterly slot revenue (current)</span>
            <span className="tabular font-mono text-positive">{fmtMoney(qRevenue)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-muted">Approval window</span>
            <span className="tabular font-mono text-ink">2 quarters</span>
          </div>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => setConfirmBuy(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={() => {
            submitAirportBid({ airportCode: cityCode });
            setConfirmBuy(false);
          }}
        >
          Submit bid · {fmtMoney(askingPrice)}
        </Button>
      </ModalFooter>
    </Modal>
    </>
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

/** "Active events" — pills showing every special status currently
 *  affecting this city: World Cup host (rounds 19-24), Olympic host
 *  (rounds 29-32), plus every active news item that touches the city
 *  via its `modifiers` array. The list is the player's primary signal
 *  for "why is demand spiking here?" */
function CityEventsSection({ cityCode, quarter }: { cityCode: string; quarter: number }) {
  const worldCupHostCode = useGame((g) => g.worldCupHostCode);
  const olympicHostCode = useGame((g) => g.olympicHostCode);
  const isWorldCupHost = worldCupHostCode === cityCode;
  const isOlympicHost = olympicHostCode === cityCode;
  // World Cup runs Q19-Q24, Olympics Q29-Q32 (per engine logic). We
  // surface the host status year-round as a planning signal, with an
  // "active now" badge when the player is in the demand window.
  const wcActiveNow = isWorldCupHost && quarter >= 19 && quarter <= 24;
  const olActiveNow = isOlympicHost && quarter >= 29 && quarter <= 32;

  // News modifiers active at this city right now.
  const impact = cityEventImpact(cityCode, quarter);
  const activeNews = impact.items.filter((n) =>
    (n.modifiers ?? []).some(
      (m) => (m.city === cityCode || m.city === "ALL") &&
             quarter >= n.quarter &&
             quarter < n.quarter + Math.max(1, m.rounds),
    ),
  );

  if (!isWorldCupHost && !isOlympicHost && activeNews.length === 0) {
    // Nothing to show. Skip the section entirely so the modal stays
    // compact for cities with no active events.
    return null;
  }

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
        Active events
      </div>
      <div className="flex flex-wrap gap-1.5">
        {isWorldCupHost && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] font-semibold",
              wcActiveNow
                ? "bg-[var(--accent-soft)] text-accent border border-accent/40"
                : "bg-surface-2 text-ink-2 border border-line",
            )}
            title={wcActiveNow
              ? "World Cup demand surge active now (Q19-Q24)."
              : "World Cup host city. Demand surge fires at Q19 and runs through Q24."}
          >
            <Trophy size={12} aria-hidden="true" />
            World Cup host
            {wcActiveNow && <span className="text-[0.625rem] uppercase tracking-wider">live</span>}
          </span>
        )}
        {isOlympicHost && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[0.75rem] font-semibold",
              olActiveNow
                ? "bg-[var(--accent-soft)] text-accent border border-accent/40"
                : "bg-surface-2 text-ink-2 border border-line",
            )}
            title={olActiveNow
              ? "Olympics demand surge active now (Q29-Q32)."
              : "Olympics host city. Demand surge fires at Q29 and runs through Q32."}
          >
            <Trophy size={12} aria-hidden="true" />
            Olympics host
            {olActiveNow && <span className="text-[0.625rem] uppercase tracking-wider">live</span>}
          </span>
        )}
        {activeNews.slice(0, 6).map((n) => (
          <span
            key={n.id}
            className="inline-flex items-baseline gap-1.5 rounded-md bg-surface-2 border border-line px-2 py-1 text-[0.75rem] text-ink-2 max-w-full"
            title={n.detail || n.headline}
          >
            <Newspaper size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
            <span className="truncate">{n.headline}</span>
            <span className="text-[0.625rem] tabular text-ink-muted shrink-0">
              {fmtQuarter(n.quarter)}
            </span>
          </span>
        ))}
      </div>
    </section>
  );
}

/** Effective per-city demand for the current quarter, with Q/Q delta.
 *  Player sees the exact same values the route engine works against
 *  (event modifiers + travel index + season all baked in), plus the
 *  signed % change vs the prior quarter so they can spot demand
 *  inflection events ("World Cup boost just kicked in" → +50% Q/Q). */
function CityDemandSection({ city, quarter }: { city: City; quarter: number }) {
  const demand = cityEffectiveDemand(city, quarter);

  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
        Demand · {fmtQuarter(quarter)}
      </div>
      <div className="grid grid-cols-3 gap-2">
        <DemandStat label="Tourism" value={demand.tourism} deltaPct={demand.tourismDeltaPct} />
        <DemandStat label="Business" value={demand.business} deltaPct={demand.businessDeltaPct} />
        <DemandStat label="Cargo" value={demand.cargo} deltaPct={demand.cargoDeltaPct} />
      </div>
      <div className="text-[0.6875rem] text-ink-muted mt-1.5 leading-relaxed">
        Effective daily demand at this city — already includes news
        modifiers, the global travel index, and seasonal effects. Δ
        compares this quarter vs last quarter.
      </div>
    </section>
  );
}

function DemandStat({
  label, value, deltaPct,
}: {
  label: string;
  value: number;
  deltaPct: number;
}) {
  const rounded = Math.round(value);
  // Hide the delta on opening quarter (no prior quarter to compare).
  // |delta| < 0.5% reads as "flat" so tiny drift doesn't show as
  // an arrow.
  const flat = Math.abs(deltaPct) < 0.5;
  const positive = deltaPct > 0;
  const ArrowIcon = positive ? ArrowUp : ArrowDown;
  return (
    <div className="rounded-md border border-line bg-surface p-2.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div className="font-display text-[1.25rem] text-ink mt-0.5 tabular">
        {rounded.toLocaleString()}
      </div>
      <div className="text-[0.6875rem] mt-0.5 flex items-center gap-1">
        {flat ? (
          <span className="text-ink-muted">flat Q/Q</span>
        ) : (
          <>
            <ArrowIcon
              size={11}
              aria-hidden="true"
              className={positive ? "text-positive" : "text-negative"}
            />
            <span
              className={cn(
                "tabular font-mono",
                positive ? "text-positive" : "text-negative",
              )}
            >
              {positive ? "+" : ""}{deltaPct.toFixed(1)}% Q/Q
            </span>
          </>
        )}
      </div>
    </div>
  );
}
