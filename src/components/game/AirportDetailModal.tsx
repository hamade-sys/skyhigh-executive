"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { useGame, selectPlayer, selectActiveTeam, useCampaignStartYear, useTotalRounds } from "@/store/game";
import { useUi } from "@/store/ui";
import { CITIES_BY_CODE, countryForCode } from "@/data/cities";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { newsRoundForQuarter, gameQuarterForNewsRound } from "@/data/world-news";
import { cn } from "@/lib/cn";
import type { City } from "@/types/game";
import { Crown, MapPin, Building, ShieldAlert, ArrowUp, ArrowDown, Trophy, Newspaper } from "lucide-react";
import {
  airportAskingPriceUsd,
  airportQuarterlySlotRevenueUsd,
  AIRPORT_BASE_PRICE_BY_TIER,
  AIRPORT_DEFAULT_CAPACITY_BY_TIER,
  AIRPORT_EXPANSION_COST_PER_LEVEL,
  AIRPORT_EXPANSION_SLOTS,
  AIRPORT_MAX_CAPACITY_BY_TIER,
  maxOwnerSlotRatePerWeekUsd,
} from "@/lib/airport-ownership";
import { cityEffectiveDemand } from "@/lib/engine";
import { cityEventImpact } from "@/lib/city-events";
import { AirportOwnershipV2 } from "@/components/game/AirportOwnershipV2";

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
  // Multiplayer-aware "you" id — falls back to legacy player id so
  // older saves keep their highlight. This component already keys
  // most things off `player.id` for solo runs; in multiplayer the
  // active team takes over.
  const youId = selectActiveTeam(s)?.id ?? player?.id ?? null;

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
          <h2 className="font-display text-heading-lg text-ink leading-tight font-mono">
            {city.code}
          </h2>
          <span className="font-display text-heading-sm text-ink-2">{city.name}</span>
        </div>
        <div className="text-ink-muted text-body mt-1 flex items-center gap-1.5">
          <MapPin size={11} /> {city.regionName} · {tierLabel[city.tier] ?? `Tier ${city.tier}`}
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 max-h-[60vh] overflow-auto">
        {/* Player's slot utilization — quiet card, same visual weight
            as the other sections. The "fully utilized" state used to
            be a heavy outlined box + an amber sentence pointing at the
            Slot Market; now the pointer is a real button. */}
        {playerEntry && (
          <section>
            <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
              Your position
            </div>
            <div className="rounded-md border border-line bg-surface-2/40 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-body-sm text-ink-2">Slots used / held</div>
                  <div className="text-label text-ink-muted mt-0.5">
                    {playerEntry.held - playerEntry.used > 0
                      ? `${playerEntry.held - playerEntry.used} free — add routes touching ${city.code} without new bids`
                      : "Fully utilized — more slots needed to grow here"}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono tabular text-ink font-semibold text-title-lg">
                    {playerEntry.used}
                    <span className="text-ink-muted font-normal">/{playerEntry.held}</span>
                  </span>
                  {playerEntry.held - playerEntry.used <= 0 && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        onClose();
                        useUi.getState().openPanel("slots");
                      }}
                      title="Open the Slot Market to bid for more slots at this airport"
                    >
                      Slot Market →
                    </Button>
                  )}
                </div>
              </div>
              <div className="h-1 rounded bg-line overflow-hidden mt-2.5">
                <div
                  className={cn(
                    "h-full rounded",
                    playerEntry.held === 0
                      ? "bg-line"
                      : playerEntry.used / playerEntry.held > 0.9
                        ? "bg-warning"
                        : "bg-accent",
                  )}
                  style={{
                    width: `${Math.min(100, (playerEntry.used / Math.max(1, playerEntry.held)) * 100)}%`,
                  }}
                />
              </div>
            </div>
          </section>
        )}

        {/* Demand — one section that owns its context: the events strip
            (the WHY behind a demand spike or crash) sits directly above
            the numbers it explains, and the explainer footnote lives
            INSIDE the card instead of floating between sections. */}
        <CityDemandSection city={city} quarter={s.currentQuarter} />

        {/* Airport supply — a slim one-row strip, deliberately a
            different shape from the demand card so the two number
            groups don't read as one undifferentiated wall of boxes. */}
        <section>
          <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
            Airport supply
          </div>
          <div className="rounded-md border border-line bg-surface-2/40 grid grid-cols-3 divide-x divide-line/70">
            {([
              { label: "Pool open now", value: data.pool, hint: "available to bid" },
              { label: "Next opening", value: data.nextOpening, hint: "at year tick" },
              { label: "All teams hold", value: data.totalHeldByAllTeams, hint: "across the field" },
            ] as const).map((cell) => (
              <div key={cell.label} className="px-3 py-2 flex items-baseline justify-between gap-2 min-w-0">
                <div className="min-w-0">
                  <div className="text-caption uppercase tracking-wider text-ink-muted truncate">{cell.label}</div>
                  <div className="text-micro text-ink-faint truncate">{cell.hint}</div>
                </div>
                <span className="font-mono tabular text-title-sm text-ink font-medium shrink-0">
                  {cell.value.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Per-team breakdown */}
        <section>
          <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-2">
            Airline footprint at {city.code}
          </div>
          <div className="rounded-md border border-line overflow-hidden">
            <table className="w-full text-body">
              <thead>
                <tr className="bg-surface-2 border-b border-line">
                  <th className="text-left px-3 py-2 text-caption uppercase tracking-wider font-semibold text-ink-muted">Airline</th>
                  <th className="text-right px-3 py-2 text-caption uppercase tracking-wider font-semibold text-ink-muted">Slots held</th>
                  <th className="text-right px-3 py-2 text-caption uppercase tracking-wider font-semibold text-ink-muted">Used</th>
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
                            className="inline-block w-5 h-5 rounded flex items-center justify-center font-mono text-micro font-semibold text-primary-fg shrink-0"
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
                          <span className="text-ink-muted text-label italic">private</span>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {data.breakdown.every((b) => b.held === 0 && !b.isHomeHub) && (
            <div className="text-body-sm text-ink-muted italic mt-2">
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
              <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-2">
                Your routes touching {city.code} · {playerRoutes.length}
              </div>
              <div className="space-y-1">
                {playerRoutes.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-baseline justify-between rounded-md border border-line bg-surface-2/40 px-3 py-1.5 text-body"
                  >
                    <span className="font-mono text-ink">
                      {r.originCode} → {r.destCode}
                    </span>
                    <div className="flex items-baseline gap-3 text-body-sm">
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

        {/* Airport ownership panel — V2 (auctions/approvals/owner console) for
            new games, else the legacy buy/expand/sell flow. */}
        {s.session?.airportSystemV2 ? (
          <AirportOwnershipV2 cityCode={city.code} />
        ) : (
          <AirportOwnership cityCode={city.code} />
        )}
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
  // Multiplayer-aware "you" id — falls back to legacy player id when
  // unset (solo runs, older saves).
  const youId = useGame((s) => s.activeTeamId ?? s.playerTeamId);
  const teams = useGame((s) => s.teams);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const concessionAuctions = useGame((s) => s.airportConcessionAuctions);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const submitAirportBid = useGame((s) => s.submitAirportBid);
  const sellAirport = useGame((s) => s.sellAirport);
  const setAirportSlotRate = useGame((s) => s.setAirportSlotRate);
  const expandAirportCapacity = useGame((s) => s.expandAirportCapacity);
  const [pendingRate, setPendingRate] = useState<string>("");
  const [confirmBuy, setConfirmBuy] = useState(false);
  const [raiseInput, setRaiseInput] = useState<string>("");
  const [confirmSell, setConfirmSell] = useState(false);

  if (!player) return null;
  const city = CITIES_BY_CODE[cityCode];
  if (!city) return null;
  // Real-world regulator framing: the host country's government (acting
  // as its civil aviation authority) is the body that approves or
  // rejects an airport-concession bid. Derived from the airport's
  // country so the copy reads "Japan's government", "the UAE's
  // government", etc. Falls back to a generic authority when the
  // country isn't mapped.
  const country = countryForCode(cityCode);
  const govPossessive = country ? `${country}'s government` : "the national aviation authority";
  const govPossessiveCap = country ? `${country}'s Government` : "The National Aviation Authority";
  const tier = city.tier as 1 | 2 | 3 | 4;
  const askingPrice = airportAskingPriceUsd(cityCode, slotState, teams);
  const qRevenue = airportQuarterlySlotRevenueUsd(cityCode, teams);
  const ownedByMe = slotState?.ownerTeamId === player.id;
  const ownedByRival = slotState?.ownerTeamId && slotState.ownerTeamId !== player.id;
  const ownerTeam = ownedByRival ? teams.find((t) => t.id === slotState!.ownerTeamId) : null;
  const capacity = slotState?.totalCapacity ?? AIRPORT_DEFAULT_CAPACITY_BY_TIER[tier];
  const maxCap = AIRPORT_MAX_CAPACITY_BY_TIER[tier];
  const expansionCost = AIRPORT_EXPANSION_COST_PER_LEVEL[tier];

  // Live ascending concession auction on this airport, if any. A bid
  // opens a VISIBLE auction: the high bid is real (escrowed cash from a
  // real team), rivals counter at quarter close, and the standing high
  // bidder when the window closes actually takes ownership. There is no
  // phantom regulator verdict — the auction itself decides.
  const liveAuction = (concessionAuctions ?? []).find(
    (a) => a.airportCode === cityCode && a.status === "open",
  );
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
          isPlayer: t.id === (youId ?? player.id),
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
        <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
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
            <div className="text-caption uppercase tracking-wider text-ink-muted">
              Current slot rate
            </div>
            <div className="flex items-baseline gap-2 mt-0.5">
              <span className="font-display text-display tabular text-ink leading-none">
                ${currentRate.toLocaleString()}
              </span>
              <span className="text-body-sm text-ink-muted">/ slot / week</span>
            </div>
            <div className="text-label text-ink-muted mt-1">
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
                <div className="text-caption uppercase tracking-wider text-ink-muted mb-1">
                  Quarterly revenue · how the math works
                </div>
                <div className="flex items-baseline justify-between text-body">
                  <span className="text-ink-2">
                    Gross collections
                    <span className="text-ink-muted ml-1.5 text-label">(all tenants × rate × 13)</span>
                  </span>
                  <span className="tabular font-mono text-ink">{fmtMoney(qRevenue)}</span>
                </div>
                {ownSlotFees > 0 && (
                  <div className="flex items-baseline justify-between text-body">
                    <span className="text-ink-2">
                      − Your own slot fees
                      <span className="text-ink-muted ml-1.5 text-label">(refunded — paid to yourself)</span>
                    </span>
                    <span className="tabular font-mono text-ink-muted">−{fmtMoney(ownSlotFees)}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between text-body border-t border-line pt-1.5">
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
                <div className="flex items-baseline justify-between text-body">
                  <span className="text-ink-2">
                    − Opex
                    <span className="text-ink-muted ml-1.5 text-label">(30% of gross · crew + ATC + upkeep)</span>
                  </span>
                  <span className="tabular font-mono text-ink-muted">−{fmtMoney(opex)}</span>
                </div>
                <div className="flex items-baseline justify-between text-body-lg border-t border-line pt-1.5">
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
                  <div className="text-label text-ink-muted leading-snug pt-1 border-t border-line">
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
              <div className="px-3 py-2 border-b border-line text-caption uppercase tracking-wider font-semibold text-ink-muted bg-surface-2/40">
                Who&rsquo;s paying this rate · {tenants.length} tenant{tenants.length === 1 ? "" : "s"}
              </div>
              <table className="w-full text-body-sm">
                <thead>
                  <tr className="border-b border-line text-caption uppercase tracking-wider text-ink-muted">
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
                            <span className="text-micro uppercase tracking-wider font-bold text-accent">
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
                <div className="px-3 py-1.5 border-t border-line bg-surface-2/30 text-caption text-ink-muted leading-snug">
                  You&apos;re the only tenant — rivals don&apos;t fly here yet.
                  No external slot revenue while you&apos;re sole tenant.
                </div>
              )}
            </div>
          )}

          {/* Rate setter — formatted with commas. Saved rate echoes
              into the headline display above the moment Apply is hit. */}
          <div>
            <div className="text-label uppercase tracking-wider text-ink-muted mb-1.5">
              Change slot rate
            </div>
            {(() => {
              // The owner rate is capped so it can't be weaponised to bankrupt
              // rivals. The ceiling grows with airport tier, destination
              // travellers, and the owner's on-airport investments (lounge,
              // duty-free, hotel, chauffeur — subsidiaries here).
              const maxRate = maxOwnerSlotRatePerWeekUsd(cityCode, player);
              const draftNum = pendingRate ? parseInt(pendingRate.replace(/[^\d]/g, ""), 10) : NaN;
              const sliderVal = Math.min(
                maxRate,
                Math.max(1_000, Number.isNaN(draftNum) ? (currentRate || 1_000) : draftNum),
              );
              return (
                <>
                  <div className="flex items-baseline justify-between mb-1.5">
                    <span className="tabular font-mono text-ink text-title-lg font-bold">
                      {fmtMoney(sliderVal)}
                      <span className="text-ink-muted text-body-sm font-normal"> /wk · slot</span>
                    </span>
                    <span className="text-label text-ink-muted">
                      ceiling {fmtMoney(maxRate)}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={1_000}
                    max={maxRate}
                    step={500}
                    value={sliderVal}
                    onChange={(e) => setPendingRate(String(parseInt(e.target.value, 10)))}
                    className="w-full accent-[var(--accent)] cursor-pointer"
                    aria-label="Owner slot rate per week"
                  />
                  <div className="flex items-end justify-between gap-3 mt-1.5">
                    <span className="text-label text-ink-muted leading-snug flex-1">
                      Invest in lounges, duty-free and hotels here — and serve busier
                      destinations — to lift the ceiling. Tenants are re-billed next
                      quarter and may release slots if your fee outweighs their route.
                    </span>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={!pendingRate}
                      onClick={() => {
                        const v = parseInt(pendingRate.replace(/[^\d]/g, ""), 10);
                        if (Number.isNaN(v)) return;
                        setAirportSlotRate({ airportCode: cityCode, newRatePerWeekUsd: v });
                        setPendingRate("");
                      }}
                    >
                      Apply
                    </Button>
                  </div>
                </>
              );
            })()}
          </div>

          <div>
            <div className="text-label uppercase tracking-wider text-ink-muted mb-1.5">
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

      <Modal open={confirmSell} onClose={() => setConfirmSell(false)} stack>
        <ModalHeader>
          <h2 className="font-display text-heading-lg text-ink">
            Sell {city.name} airport?
          </h2>
          <p className="text-ink-muted text-body mt-1">
            Bidding will resume here at the auction default. Tenant airlines
            will revert to paying the cleared rate, not yours. Your
            subsidiary revenue from this hub stops next quarter.
          </p>
        </ModalHeader>
        <ModalBody className="space-y-2">
          <div className="rounded-md border border-line bg-surface p-3 text-body space-y-1">
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
        <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
          <ShieldAlert size={12} className="text-warning" /> Airport ownership
        </div>
        <div className="rounded-md border border-warning bg-[var(--warning-soft)] p-3">
          <div className="text-body-lg text-ink">
            <span
              className="inline-flex w-5 h-5 rounded-sm items-center justify-center font-mono text-micro font-semibold text-primary-fg mr-1.5 align-middle"
              style={{ background: ownerTeam.color }}
            >
              {ownerTeam.code}
            </span>
            <strong>{ownerTeam.name}</strong> owns this airport and sets the slot rate.
          </div>
          <div className="text-body-sm text-ink-2 mt-1.5 leading-relaxed">
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

  // Unowned — DIRECT BUY. Placing a purchase escrows the price and the
  // airport transfers at the very next quarter close. The only twist: if a
  // rival carrier places a higher competing offer that same quarter, the
  // higher offer wins (a rare sealed contest) and the loser is refunded.
  // `liveAuction` here is always the player's own pending purchase, since
  // rivals never open one — they only contest at close.
  const pending = liveAuction; // the player's pending purchase, if any
  const myOffer = pending?.highBidUsd ?? 0;
  const canAffordBuy = player.cashUsd >= askingPrice;
  // Optional "offer above asking" to pre-empt a rival. Defaults to asking.
  const offerAmount = Math.max(
    askingPrice,
    Math.round(Number(raiseInput.replace(/[^0-9.]/g, "")) || 0),
  );
  return (
    <>
    <section>
      <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-2 flex items-center gap-1.5">
        <Building size={12} /> Airport ownership
      </div>
      <div className="rounded-md border border-line bg-surface p-3 space-y-2">
        <div className="grid grid-cols-3 gap-2">
          {pending ? (
            <Stat label="Your offer" value={fmtMoney(myOffer)} hint="In escrow" />
          ) : (
            <Stat label="Buy price" value={fmtMoney(askingPrice)} hint="Tier base + 4× Q rev" />
          )}
          <Stat label="Q slot revenue" value={fmtMoney(qRevenue)} hint="What it earns now" />
          <Stat label="Capacity" value={`${capacity} / ${maxCap}`} hint="+200 per expansion" />
        </div>

        {pending ? (
          /* ── Pending purchase status ──────────────────────────────── */
          <div className="rounded-md border border-accent bg-[var(--accent-soft)] p-2.5 text-body">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-semibold text-accent">Purchase pending</span>
              <span className="tabular font-mono text-label text-ink-muted">
                completes next quarter
              </span>
            </div>
            <div className="text-ink-2 mt-1 leading-relaxed">
              Your {fmtMoney(myOffer)} is held in escrow. You take ownership of{" "}
              {city.name} at the next quarter close — unless a rival carrier
              places a higher competing offer this quarter, in which case the
              higher offer wins and you&apos;re refunded in full.
            </div>
          </div>
        ) : (
          /* ── Buy-price breakdown ──────────────────────────────────── */
          (() => {
            const baseUsd = AIRPORT_BASE_PRICE_BY_TIER[tier];
            const capitalisedUsd = askingPrice - baseUsd;
            return (
              <div className="rounded-md border border-line/60 bg-surface-2/30 p-2.5 text-body-sm space-y-1">
                <div className="text-caption uppercase tracking-wider text-ink-muted font-semibold">
                  How the buy price is calculated
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-2">Tier {tier} base price</span>
                  <span className="tabular font-mono text-ink-2">{fmtMoney(baseUsd)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-ink-2">Capitalised slot revenue (4× current Q)</span>
                  <span className="tabular font-mono text-ink-2">+{fmtMoney(capitalisedUsd)}</span>
                </div>
                <div className="flex items-baseline justify-between gap-3 pt-1 mt-0.5 border-t border-line/60 font-semibold">
                  <span className="text-ink">Buy price</span>
                  <span className="tabular font-mono text-ink">{fmtMoney(askingPrice)}</span>
                </div>
              </div>
            );
          })()
        )}

        {/* CTA — buy the airport (disabled while a purchase is pending). */}
        {pending ? (
          <div className="text-body-sm text-ink-muted leading-relaxed">
            Purchase pending — it completes at the next quarter close.
          </div>
        ) : (
          <Button
            size="sm"
            variant="primary"
            disabled={!canAffordBuy}
            onClick={() => { setRaiseInput(String(askingPrice)); setConfirmBuy(true); }}
          >
            {canAffordBuy
              ? `Buy airport · ${fmtMoney(askingPrice)}`
              : `Need ${fmtMoney(askingPrice - player.cashUsd)} more cash`}
          </Button>
        )}

        <p className="text-label text-ink-muted leading-relaxed">
          Tier {tier} airport. Buying it transfers ownership at the next
          quarter close — you then collect every airline&apos;s slot fees here
          as Subsidiary revenue (30% opex), set the slot rate, and can fund
          +200-slot expansions. A rival only competes in the rare case it bids
          on the same airport the same quarter; then the higher offer wins and
          the loser is refunded in full. Offer above the asking price to
          pre-empt that.
        </p>
      </div>
    </section>

    {/* Buy confirm — with optional "offer above asking" to pre-empt rivals */}
    <Modal open={confirmBuy} onClose={() => setConfirmBuy(false)} stack>
      <ModalHeader>
        <h2 className="font-display text-heading-lg text-ink">
          Buy {city.name} airport?
        </h2>
        <p className="text-ink-muted text-body mt-1">
          Your offer is held in escrow now and ownership transfers at the next
          quarter close. If a rival carrier places a higher competing offer
          that same quarter, the higher offer wins and your cash is refunded
          in full. Offer above the asking price to make sure you win it.
        </p>
      </ModalHeader>
      <ModalBody className="space-y-2">
        <div className="rounded-md border border-line bg-surface p-3 text-body space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-muted">Asking price</span>
            <span className="tabular font-mono text-ink">{fmtMoney(askingPrice)}</span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-ink-muted">Quarterly slot revenue (current)</span>
            <span className="tabular font-mono text-positive">{fmtMoney(qRevenue)}</span>
          </div>
          <label className="block pt-1">
            <span className="text-label uppercase tracking-wider text-ink-muted font-semibold">
              Your offer (≥ asking)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={raiseInput}
              onChange={(e) => setRaiseInput(e.target.value)}
              className="mt-1 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono tabular text-ink text-body-lg focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
            />
            {offerAmount > player.cashUsd && (
              <span className="mt-1 block text-label text-warning">
                Need {fmtMoney(offerAmount - player.cashUsd)} more cash for that offer.
              </span>
            )}
          </label>
        </div>
      </ModalBody>
      <ModalFooter>
        <Button variant="ghost" onClick={() => setConfirmBuy(false)}>
          Cancel
        </Button>
        <Button
          variant="primary"
          disabled={offerAmount > player.cashUsd}
          onClick={() => {
            submitAirportBid({ airportCode: cityCode, bidPriceUsd: offerAmount });
            setConfirmBuy(false);
          }}
        >
          Buy · {fmtMoney(offerAmount)}
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
      <div className="text-caption uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div className="font-display text-heading text-ink mt-0.5 tabular">
        {value}
      </div>
      {hint && (
        <div className="text-label text-ink-muted mt-0.5">{hint}</div>
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
  const startYear = useCampaignStartYear();
  const totalRounds = useTotalRounds();
  const worldCupHostCode = useGame((g) => g.worldCupHostCode);
  const olympicHostCode = useGame((g) => g.olympicHostCode);
  const isWorldCupHost = worldCupHostCode === cityCode;
  const isOlympicHost = olympicHostCode === cityCode;
  // World Cup runs Q19-Q24, Olympics Q29-Q32 (per engine logic). We
  // surface the host status year-round as a planning signal, with an
  // "active now" badge when the player is in the demand window.
  const wcActiveNow = isWorldCupHost && quarter >= 19 && quarter <= 24;
  const olActiveNow = isOlympicHost && quarter >= 29 && quarter <= 32;

  // News modifiers active at this city right now. cityEventImpact returns
  // items whose `quarter` is in scripted-news-round space, so compare the
  // window against the news-round equivalent of the live game quarter
  // (identity in the half campaign; -60 in the full campaign).
  const newsQ = newsRoundForQuarter(quarter, totalRounds);
  const impact = cityEventImpact(cityCode, quarter, totalRounds);
  const activeNews = impact.items.filter((n) =>
    (n.modifiers ?? []).some(
      (m) => (m.city === cityCode || m.city === "ALL") &&
             newsQ >= n.quarter &&
             newsQ < n.quarter + Math.max(1, m.rounds),
    ),
  );

  if (!isWorldCupHost && !isOlympicHost && activeNews.length === 0) {
    // Nothing to show. Skip the strip entirely so the modal stays
    // compact for cities with no active events.
    return null;
  }

  // Bare chip strip — no section wrapper or title of its own. It
  // renders INSIDE the Demand section (June 2026 reorganisation),
  // directly above the numbers these events explain.
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
        {isWorldCupHost && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm font-semibold",
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
            {wcActiveNow && <span className="text-caption uppercase tracking-wider">live</span>}
          </span>
        )}
        {isOlympicHost && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-body-sm font-semibold",
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
            {olActiveNow && <span className="text-caption uppercase tracking-wider">live</span>}
          </span>
        )}
        {activeNews.slice(0, 6).map((n) => (
          <span
            key={n.id}
            className="inline-flex items-baseline gap-1.5 rounded-md bg-surface-2 border border-line px-2 py-1 text-body-sm text-ink-2 max-w-full"
            title={n.detail || n.headline}
          >
            <Newspaper size={11} aria-hidden="true" className="shrink-0 mt-0.5" />
            <span className="truncate">{n.headline}</span>
            <span className="text-caption tabular text-ink-muted shrink-0">
              {fmtQuarter(gameQuarterForNewsRound(n.quarter, totalRounds), startYear)}
            </span>
          </span>
        ))}
    </div>
  );
}

/** Effective per-city demand for the current quarter, with Q/Q delta.
 *  Player sees the exact same values the route engine works against
 *  (event modifiers + travel index + season all baked in), plus the
 *  signed % change vs the prior quarter so they can spot demand
 *  inflection events ("World Cup boost just kicked in" → +50% Q/Q).
 *  Owns the active-events strip too: an event chip directly above the
 *  numbers it explains beats a stray "Active events" section. */
function CityDemandSection({ city, quarter }: { city: City; quarter: number }) {
  const startYear = useCampaignStartYear();
  const totalRounds = useTotalRounds();
  // Full campaign (>60 rounds) shifts news/travel-index lookups back 60
  // quarters to land on the real calendar year.
  const campaignMode = totalRounds > 60 ? "full" : "half";
  const demand = cityEffectiveDemand(city, quarter, campaignMode);

  return (
    <section>
      <div className="text-label uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
        Demand · {fmtQuarter(quarter, startYear)}
      </div>
      <CityEventsSection cityCode={city.code} quarter={quarter} />
      <div className="rounded-md border border-line bg-surface-2/40">
        <div className="grid grid-cols-3 divide-x divide-line/70">
          <DemandStat label="Tourism" value={demand.tourism} deltaPct={demand.tourismDeltaPct} />
          <DemandStat label="Business" value={demand.business} deltaPct={demand.businessDeltaPct} />
          <DemandStat label="Cargo" value={demand.cargo} deltaPct={demand.cargoDeltaPct} />
        </div>
        <div className="text-micro text-ink-muted leading-relaxed border-t border-line/70 px-3 py-1.5">
          Effective daily demand — news modifiers, the global travel index, and
          seasonal effects already included. Δ compares vs last quarter.
        </div>
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
  // Cell inside the shared demand card (divide-x separators come from
  // the parent grid) — no border of its own, calmer numeral scale.
  return (
    <div className="px-3 py-2">
      <div className="text-caption uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-0.5 flex-wrap">
        <span className="font-display text-title-lg text-ink tabular leading-none">
          {rounded.toLocaleString()}
        </span>
        {flat ? (
          <span className="text-micro text-ink-muted">flat Q/Q</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-micro tabular font-mono",
              positive ? "text-positive" : "text-negative",
            )}
          >
            <ArrowIcon size={9} aria-hidden="true" />
            {positive ? "+" : ""}{deltaPct.toFixed(1)}%
          </span>
        )}
      </div>
    </div>
  );
}
