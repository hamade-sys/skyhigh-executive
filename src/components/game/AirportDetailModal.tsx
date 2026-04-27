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
    return (
      <>
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
