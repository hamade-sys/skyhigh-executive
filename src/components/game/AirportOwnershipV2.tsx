"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input } from "@/components/ui";
import { useGame, selectPlayer } from "@/store/game";
import { CITIES_BY_CODE, countryForCode } from "@/data/cities";
import { fmtMoney } from "@/lib/format";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";
import {
  Gavel,
  Landmark,
  Building2,
  Store,
  Percent,
  Lock,
  Sparkles,
  Gauge,
  ShieldAlert,
  Check,
  X,
  TrendingUp,
  Plane,
  Fuel,
} from "lucide-react";
import {
  AIRPORT_LADDER_NAME,
  AIRPORT_LADDER_CODE,
  airportLadder,
  AIRPORT_DEFAULT_FEES_BY_LADDER,
  AIRPORT_GAP_QUALIFY,
  AIRPORT_DEMAND_DEFS,
  AIRPORT_SPECIALIZATIONS,
  AIRPORT_RETAIL_MIN,
  AIRPORT_RETAIL_MAX,
  AIRPORT_RETAIL_INVESTMENT_COST,
  AIRPORT_OPEX_RATIO_BASELINE,
  AIRPORT_OPEX_RATIO_FLOOR,
  AIRPORT_OPEX_EFFICIENCY_INVESTMENT_COST,
  AIRPORT_OWNER_RESERVE_PCT_MAX,
  AIRPORT_OWNER_SELF_DISCOUNT_MAX,
  AIRPORT_SPECIALIZATION_SWITCH_COST,
  AIRPORT_SPECIALIZATION_SWITCH_ROUNDS,
  AIRPORT_APPROVAL_DEPOSIT_PCT,
  specializationForFork,
  type AirportSpecialization,
  type AirportSpecializationFork,
} from "@/lib/airport-system-v2";
import { gapFor } from "@/lib/airport-auction-runtime";
import type { AirportActiveDemand, AirportApprovalProcess } from "@/types/game";

/**
 * AIRPORT OWNERSHIP & HUB SYSTEM — V2 panel
 * ─────────────────────────────────────────
 * The from-scratch ownership / auction / approval / operator surface for
 * V2-enabled games (`session.airportSystemV2`). Rendered in place of the V1
 * `<AirportOwnership />` block in AirportDetailModal. Covers every state a
 * single airport can be in for the local player:
 *
 *   1. An OPEN privatization auction here → sealed-bid form + live GAP meter.
 *   2. MY pending approval gauntlet here → accept / decline each demand.
 *   3. Owned by ME → the full operator console (fees, retail, opex, slot
 *      reservation, self-discount, specialization + fork, regulatory status).
 *   4. Owned by a RIVAL → read-only landlord card.
 *   5. Public / unowned (no auction) → ladder + public fee schedule + a note
 *      that the government may release it for privatization later.
 *
 * Regulator copy always reads "<Country>'s Government" — never "facilitator".
 */
export function AirportOwnershipV2({ cityCode }: { cityCode: string }) {
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const allSlots = useGame((s) => s.airportSlots);
  const auctions = useGame((s) => s.airportAuctions);
  const approvals = useGame((s) => s.airportApprovals);

  const city = CITIES_BY_CODE[cityCode];
  const country = countryForCode(cityCode);
  const govt = country ? `${country}'s Government` : "The Government";

  const slotState = allSlots?.[cityCode];
  const ladder = airportLadder(cityCode, slotState?.ladder);

  const openAuction = useMemo(
    () =>
      (auctions ?? []).find(
        (a) => a.airportCode === cityCode && a.status === "open",
      ) ?? null,
    [auctions, cityCode],
  );

  const myApproval = useMemo(
    () =>
      (approvals ?? []).find(
        (a) =>
          a.airportCode === cityCode &&
          a.teamId === player?.id &&
          a.status === "pending",
      ) ?? null,
    [approvals, cityCode, player?.id],
  );

  if (!player || !city) return null;

  const ownerTeamId = slotState?.ownerTeamId;
  const ownedByMe = !!ownerTeamId && ownerTeamId === player.id;
  const ownedByRival = !!ownerTeamId && ownerTeamId !== player.id;

  return (
    <div className="space-y-4">
      {/* Always-on header: ladder + code */}
      <section>
        <SectionLabel icon={<Landmark size={12} />}>
          Airport concession · {AIRPORT_LADDER_NAME[ladder]}
        </SectionLabel>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">
            {AIRPORT_LADDER_CODE[ladder]} · {AIRPORT_LADDER_NAME[ladder]}
          </Badge>
          {ownedByMe && (
            <Badge tone="primary">
              <Building2 size={11} className="mr-1" /> You operate this airport
            </Badge>
          )}
          {ownedByRival && <Badge tone="warning">Privately operated</Badge>}
          {!ownerTeamId && !openAuction && (
            <Badge tone="neutral">Government-run</Badge>
          )}
          {openAuction && <Badge tone="warning">Privatization open</Badge>}
        </div>
      </section>

      {/* 2. My approval gauntlet (highest priority — time-sensitive) */}
      {myApproval && (
        <ApprovalGauntlet
          approval={myApproval}
          currentQuarter={currentQuarter}
          govt={govt}
        />
      )}

      {/* 1. Open auction — sealed bid */}
      {openAuction && !ownedByMe && (
        <AuctionBidForm
          auctionId={openAuction.id}
          cityCode={cityCode}
          reserveFloorUsd={openAuction.reserveFloorUsd}
          closesRound={openAuction.closesRound}
          currentQuarter={currentQuarter}
          govt={govt}
          myExistingBidUsd={
            openAuction.bids.find((b) => b.teamId === player.id)?.amountUsd ??
            null
          }
        />
      )}

      {/* 3. Owner console */}
      {ownedByMe && (
        <OwnerConsole cityCode={cityCode} currentQuarter={currentQuarter} />
      )}

      {/* 4. Owned by a rival */}
      {ownedByRival && <RivalOwnerCard cityCode={cityCode} govt={govt} />}

      {/* 5. Public / unowned, no auction */}
      {!ownerTeamId && !openAuction && (
        <PublicAirportCard cityCode={cityCode} ladder={ladder} govt={govt} />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Sealed-bid auction
 * ════════════════════════════════════════════════════════════════════ */

function AuctionBidForm({
  auctionId,
  cityCode,
  reserveFloorUsd,
  closesRound,
  currentQuarter,
  govt,
  myExistingBidUsd,
}: {
  auctionId: string;
  cityCode: string;
  reserveFloorUsd: number;
  closesRound: number;
  currentQuarter: number;
  govt: string;
  myExistingBidUsd: number | null;
}) {
  const player = useGame(selectPlayer);
  const allSlots = useGame((s) => s.airportSlots);
  const submitSealedAirportBid = useGame((s) => s.submitSealedAirportBid);

  const slotState = allSlots?.[cityCode];
  const ladder = airportLadder(cityCode, slotState?.ladder);
  const qualifyThreshold = AIRPORT_GAP_QUALIFY[ladder];

  // Default the input to the existing bid, or the reserve floor.
  const [bidStr, setBidStr] = useState<string>(
    String(myExistingBidUsd ?? reserveFloorUsd),
  );
  const bidAmount = Math.max(0, Math.round(Number(bidStr) || 0));

  // Live GAP confidence for the typed amount.
  const gapBreakdown = useMemo(() => {
    if (!player) return null;
    return gapFor({
      team: player,
      airportCode: cityCode,
      slotState,
      bidAmountUsd: Math.max(1, bidAmount),
      allSlots: allSlots ?? {},
    });
  }, [player, cityCode, slotState, bidAmount, allSlots]);

  if (!player) return null;

  const gap = gapBreakdown?.gap ?? 0;
  const qualifies = gap >= qualifyThreshold;
  const deposit = Math.round(bidAmount * AIRPORT_APPROVAL_DEPOSIT_PCT);
  const belowReserve = bidAmount < reserveFloorUsd;
  const cantAfford = player.cashUsd < bidAmount;
  const roundsLeft = Math.max(0, closesRound - currentQuarter);

  const submit = () => {
    const res = submitSealedAirportBid({ auctionId, amountUsd: bidAmount });
    if (!res.ok && res.error) toast.negative("Bid rejected", res.error);
  };

  return (
    <section className="rounded-xl border border-[var(--warning-soft)] bg-[var(--warning-soft)]/30 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Gavel size={15} className="text-warning" />
        <h3 className="font-display text-title-sm text-ink font-semibold">
          Privatization auction — sealed bids open
        </h3>
      </div>
      <p className="text-body text-ink-2 leading-relaxed mb-3">
        {govt} is privatizing this airport. File a single sealed bid — the
        winner is chosen on money <span className="text-ink-muted">and</span>{" "}
        government confidence, so a richer bid can still lose to a more credible
        rival. A {Math.round(AIRPORT_APPROVAL_DEPOSIT_PCT * 100)}% deposit is
        held now; you must be able to cover the full bid. Bids close in{" "}
        <span className="font-mono tabular text-ink">
          {roundsLeft} quarter{roundsLeft === 1 ? "" : "s"}
        </span>
        .
      </p>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <Stat
          label="Reserve floor"
          value={fmtMoney(reserveFloorUsd)}
          hint="Minimum bid"
        />
        <Stat
          label="Qualify ≥"
          value={`${qualifyThreshold}%`}
          hint="Min approval confidence"
        />
      </div>

      <label className="block text-label uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
        Your sealed bid (USD)
      </label>
      <div className="flex items-center gap-2 mb-1">
        <Input
          type="number"
          inputMode="numeric"
          value={bidStr}
          min={reserveFloorUsd}
          step={10_000_000}
          onChange={(e) => setBidStr(e.target.value)}
          className="font-mono tabular"
        />
        <span className="font-mono tabular text-ink-2 text-body whitespace-nowrap w-20 text-right">
          {fmtMoney(bidAmount)}
        </span>
      </div>
      <div className="text-label text-ink-muted mb-3">
        Deposit held now:{" "}
        <span className="font-mono tabular text-ink">{fmtMoney(deposit)}</span> ·
        Your cash:{" "}
        <span className="font-mono tabular text-ink">
          {fmtMoney(player.cashUsd)}
        </span>
      </div>

      {/* Live GAP confidence meter */}
      <div className="rounded-md border border-line bg-surface p-3 mb-3">
        <div className="flex items-baseline justify-between mb-1.5">
          <span className="text-label uppercase tracking-wider text-ink-muted font-semibold">
            Government acceptance confidence
          </span>
          <span
            className={cn(
              "font-mono tabular font-bold text-title-lg",
              qualifies ? "text-positive" : "text-negative",
            )}
          >
            {Math.round(gap)}%
          </span>
        </div>
        <div className="relative h-2 rounded bg-line overflow-hidden">
          {/* qualify threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-px bg-ink-2 z-10"
            style={{ left: `${qualifyThreshold}%` }}
          />
          <div
            className={cn(
              "h-full rounded transition-[width]",
              qualifies ? "bg-positive" : "bg-negative",
            )}
            style={{ width: `${Math.min(100, gap)}%` }}
          />
        </div>
        <div
          className={cn(
            "text-label mt-2",
            qualifies ? "text-positive" : "text-warning",
          )}
        >
          {qualifies
            ? `Clears the ${qualifyThreshold}% bar — your bid will be considered.`
            : `Below the ${qualifyThreshold}% bar. Strengthen your balance sheet, brand, or national alignment, or this bid is rejected on confidence.`}
        </div>
      </div>

      {myExistingBidUsd != null && (
        <div className="text-body-sm text-ink-2 mb-2">
          You have a standing bid of{" "}
          <span className="font-mono tabular text-ink">
            {fmtMoney(myExistingBidUsd)}
          </span>
          . Re-filing replaces it and refunds the old deposit.
        </div>
      )}

      <Button
        variant="accent"
        size="sm"
        className="w-full"
        disabled={belowReserve || cantAfford || bidAmount <= 0}
        onClick={submit}
      >
        <Gavel size={14} />
        {myExistingBidUsd != null ? "Replace sealed bid" : "File sealed bid"}
      </Button>
      {belowReserve && (
        <div className="text-label text-negative mt-1.5">
          Bid is below the {fmtMoney(reserveFloorUsd)} reserve floor.
        </div>
      )}
      {!belowReserve && cantAfford && (
        <div className="text-label text-negative mt-1.5">
          You must be able to cover the full {fmtMoney(bidAmount)} bid (cash{" "}
          {fmtMoney(player.cashUsd)}).
        </div>
      )}
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Approval gauntlet — respond to government demands
 * ════════════════════════════════════════════════════════════════════ */

function ApprovalGauntlet({
  approval,
  currentQuarter,
  govt,
}: {
  approval: AirportApprovalProcess;
  currentQuarter: number;
  govt: string;
}) {
  const respondToAirportDemand = useGame((s) => s.respondToAirportDemand);
  const accepted = approval.demands.filter((d) => d.accepted).length;
  const roundsLeft = Math.max(0, approval.deadlineRound - currentQuarter);
  const enough = accepted >= approval.minToAccept;

  const respond = (i: number, accept: boolean) => {
    const res = respondToAirportDemand({
      approvalId: approval.id,
      demandIndex: i,
      accept,
    });
    if (!res.ok && res.error) toast.negative("Couldn't update", res.error);
  };

  return (
    <section className="rounded-xl border border-primary bg-[rgba(20,53,94,0.04)] p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Building2 size={15} className="text-primary" />
        <h3 className="font-display text-title-sm text-ink font-semibold">
          You won the auction — approval gauntlet
        </h3>
      </div>
      <p className="text-body text-ink-2 leading-relaxed mb-3">
        {govt} will transfer operating control once you accept its conditions.
        Accept at least{" "}
        <span className="font-mono tabular text-ink">{approval.minToAccept}</span>{" "}
        of {approval.demands.length} demands before the deadline, or the
        acquisition collapses and your{" "}
        <span className="font-mono tabular text-ink">
          {fmtMoney(approval.depositUsd)}
        </span>{" "}
        deposit is forfeit.
      </p>

      <div className="flex items-center gap-3 mb-3">
        <Stat
          label="Accepted"
          value={`${accepted}/${approval.minToAccept}`}
          hint="Need to close"
          tone={enough ? "positive" : "warning"}
        />
        <Stat
          label="Deadline"
          value={`${roundsLeft}q`}
          hint="Rounds left"
          tone={roundsLeft <= 1 ? "negative" : undefined}
        />
        <Stat
          label="Balance due"
          value={fmtMoney(approval.winningBidUsd - approval.depositUsd)}
          hint="On approval"
        />
      </div>

      <div className="space-y-2">
        {approval.demands.map((d, i) => (
          <DemandCard
            key={`${d.type}-${i}`}
            demand={d}
            onAccept={() => respond(i, true)}
            onDecline={() => respond(i, false)}
          />
        ))}
      </div>

      <div
        className={cn(
          "text-body-sm mt-3 font-medium",
          enough ? "text-positive" : "text-warning",
        )}
      >
        {enough
          ? "Enough demands accepted — the acquisition will close at quarter end and the balance will be charged."
          : `Accept ${approval.minToAccept - accepted} more demand${approval.minToAccept - accepted === 1 ? "" : "s"} to secure approval.`}
      </div>
    </section>
  );
}

function DemandCard({
  demand,
  onAccept,
  onDecline,
}: {
  demand: AirportActiveDemand;
  onAccept: () => void;
  onDecline: () => void;
}) {
  const def = AIRPORT_DEMAND_DEFS[demand.type];
  return (
    <div
      className={cn(
        "rounded-md border p-3",
        demand.accepted
          ? "border-positive bg-[var(--positive-soft)]/40"
          : "border-line bg-surface",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-body font-semibold text-ink">
              {def.label}
            </span>
            <Badge tone={demand.accepted ? "positive" : "neutral"}>
              {demandMagnitudeLabel(demand)}
            </Badge>
          </div>
          <p className="text-body-sm text-ink-muted leading-snug">
            {def.blurb}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Button
            variant={demand.accepted ? "accent" : "secondary"}
            size="sm"
            className="!h-8 !px-2.5"
            onClick={onAccept}
            aria-label="Accept demand"
          >
            <Check size={14} />
          </Button>
          <Button
            variant={!demand.accepted ? "danger" : "ghost"}
            size="sm"
            className="!h-8 !px-2.5"
            onClick={onDecline}
            aria-label="Decline demand"
          >
            <X size={14} />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Human label for a demand's resolved magnitude, keyed on its cost shape. */
function demandMagnitudeLabel(d: AirportActiveDemand): string {
  const shape = AIRPORT_DEMAND_DEFS[d.type].shape;
  switch (shape) {
    case "one-time":
      return `${fmtMoney(d.magnitude)} one-time`;
    case "recurring":
      return `${fmtMoney(d.magnitude)}/quarter`;
    case "premium":
      return `+${Math.round(d.magnitude * 100)}% on bid`;
    case "equity":
      return `${Math.round(d.magnitude * 100)}% equity to gov`;
    case "flag":
      return `${fmtMoney(d.magnitude)} · scandal risk`;
    case "operational":
      if (d.type === "capacity-expansion")
        return `+${d.magnitude} slots${d.dueRound ? ` by Q${d.dueRound}` : ""}`;
      return `${d.magnitude} cities${d.dueRound ? ` thru Q${d.dueRound}` : ""}`;
    default:
      return "—";
  }
}

/* ════════════════════════════════════════════════════════════════════
 *  Owner console
 * ════════════════════════════════════════════════════════════════════ */

function OwnerConsole({
  cityCode,
  currentQuarter,
}: {
  cityCode: string;
  currentQuarter: number;
}) {
  const player = useGame(selectPlayer);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const setAirportFees = useGame((s) => s.setAirportFees);
  const investAirportRetail = useGame((s) => s.investAirportRetail);
  const investAirportOpexEfficiency = useGame(
    (s) => s.investAirportOpexEfficiency,
  );
  const setAirportReservedSlotPct = useGame((s) => s.setAirportReservedSlotPct);
  const setAirportSelfDiscount = useGame((s) => s.setAirportSelfDiscount);

  const ladder = airportLadder(cityCode, slotState?.ladder);
  const def = AIRPORT_DEFAULT_FEES_BY_LADDER[ladder];

  // Fee form (local pending, applied together).
  const [slotFee, setSlotFee] = useState<string>(
    String(slotState?.slotFeeUsd ?? def.slotFeeUsd),
  );
  const [landingFee, setLandingFee] = useState<string>(
    String(slotState?.landingFeeUsd ?? def.landingFeeUsd),
  );
  const [paxCharge, setPaxCharge] = useState<string>(
    String(slotState?.passengerChargeUsd ?? def.passengerChargeUsd),
  );

  // Slider locals (apply on release).
  const [reservedPct, setReservedPct] = useState<number>(
    Math.round((slotState?.reservedSlotPct ?? 0) * 100),
  );
  const [selfDiscount, setSelfDiscount] = useState<number>(
    Math.round((slotState?.ownerSelfDiscountPct ?? 0) * 100),
  );

  if (!player || !slotState) return null;

  const retailLevel = slotState.retailDevelopmentLevel ?? AIRPORT_RETAIL_MIN;
  const opexRatio = slotState.airportOpexRatio ?? AIRPORT_OPEX_RATIO_BASELINE;
  const regulated = (slotState.regulatedUntilRound ?? 0) > currentQuarter;
  const regulatedRoundsLeft = Math.max(
    0,
    (slotState.regulatedUntilRound ?? 0) - currentQuarter,
  );

  const applyFees = () => {
    const res = setAirportFees({
      airportCode: cityCode,
      slotFeeUsd: Number(slotFee) || 0,
      landingFeeUsd: Number(landingFee) || 0,
      passengerChargeUsd: Number(paxCharge) || 0,
    });
    if (!res.ok && res.error) toast.negative("Couldn't set fees", res.error);
  };
  const buyRetail = () => {
    const res = investAirportRetail(cityCode);
    if (!res.ok && res.error)
      toast.negative("Retail investment blocked", res.error);
  };
  const buyOpex = () => {
    const res = investAirportOpexEfficiency(cityCode);
    if (!res.ok && res.error)
      toast.negative("Efficiency investment blocked", res.error);
  };
  const applyReserved = () => {
    const res = setAirportReservedSlotPct({
      airportCode: cityCode,
      pct: reservedPct / 100,
    });
    if (!res.ok && res.error) toast.negative("Couldn't reserve slots", res.error);
  };
  const applySelfDiscount = () => {
    const res = setAirportSelfDiscount({
      airportCode: cityCode,
      pct: selfDiscount / 100,
    });
    if (!res.ok && res.error)
      toast.negative("Self-discount blocked", res.error);
  };

  return (
    <div className="space-y-4">
      {/* Regulatory status banner */}
      {(regulated ||
        (slotState.regulatoryStrikes ?? 0) > 0 ||
        (slotState.lobbyingExposure ?? 0) > 0) && (
        <div className="rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)]/40 p-3">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={13} className="text-warning" />
            <span className="text-body-sm font-semibold text-ink uppercase tracking-wide">
              Regulatory watch
            </span>
          </div>
          <ul className="text-body-sm text-ink-2 space-y-0.5">
            {regulated && (
              <li>
                Equal-pricing order in force for {regulatedRoundsLeft} more
                quarter{regulatedRoundsLeft === 1 ? "" : "s"} (self-discount
                locked).
              </li>
            )}
            {(slotState.regulatoryStrikes ?? 0) > 0 && (
              <li>
                Price-discrimination strikes:{" "}
                <span className="font-mono tabular">
                  {slotState.regulatoryStrikes}
                </span>{" "}
                / 3 (the third forces partial divestment).
              </li>
            )}
            {(slotState.lobbyingExposure ?? 0) > 0 && (
              <li>Lobbying exposure on file — scandal risk in later events.</li>
            )}
          </ul>
        </div>
      )}

      {/* Fees */}
      <section>
        <SectionLabel icon={<Gauge size={12} />}>Fee schedule</SectionLabel>
        <p className="text-body-sm text-ink-muted mb-2 leading-snug">
          Charged to every airline using the airport — including you. Raise for
          more per-unit revenue, but rivals route away past the market sweet
          spot. Public default for this tier: {fmtMoney(def.slotFeeUsd)}/slot ·{" "}
          {fmtMoney(def.landingFeeUsd)}/landing · ${def.passengerChargeUsd}/pax.
        </p>
        <div className="grid grid-cols-3 gap-2 mb-2">
          <FeeInput
            label="Slot / quarter"
            value={slotFee}
            onChange={setSlotFee}
            step={5_000}
          />
          <FeeInput
            label="Landing"
            value={landingFee}
            onChange={setLandingFee}
            step={100}
          />
          <FeeInput
            label="Per pax"
            value={paxCharge}
            onChange={setPaxCharge}
            step={1}
          />
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={applyFees}>
          Update fees
        </Button>
      </section>

      {/* Commercial + efficiency investments */}
      <section>
        <SectionLabel icon={<Store size={12} />}>
          Commercial development
        </SectionLabel>
        <div className="grid grid-cols-1 gap-2">
          <InvestRow
            icon={<Store size={14} className="text-accent" />}
            title="Retail development"
            detail={`Non-aero yield ${retailLevel.toFixed(1)}× of ${AIRPORT_RETAIL_MAX}× · compounds with every passenger`}
            cost={AIRPORT_RETAIL_INVESTMENT_COST}
            atMax={retailLevel >= AIRPORT_RETAIL_MAX}
            atMaxLabel="World-class (1.5×)"
            canAfford={player.cashUsd >= AIRPORT_RETAIL_INVESTMENT_COST}
            onClick={buyRetail}
          />
          <InvestRow
            icon={<TrendingUp size={14} className="text-accent" />}
            title="Operational efficiency"
            detail={`Opex ratio ${(opexRatio * 100).toFixed(0)}% · floor ${(AIRPORT_OPEX_RATIO_FLOOR * 100).toFixed(0)}%`}
            cost={AIRPORT_OPEX_EFFICIENCY_INVESTMENT_COST}
            atMax={opexRatio <= AIRPORT_OPEX_RATIO_FLOOR}
            atMaxLabel="At floor (30%)"
            canAfford={player.cashUsd >= AIRPORT_OPEX_EFFICIENCY_INVESTMENT_COST}
            onClick={buyOpex}
          />
        </div>
      </section>

      {/* Slot reservation (defensive) */}
      <section>
        <SectionLabel icon={<Lock size={12} />}>
          Slot reservation (own use)
        </SectionLabel>
        <p className="text-body-sm text-ink-muted mb-2 leading-snug">
          Reserve up to {Math.round(AIRPORT_OWNER_RESERVE_PCT_MAX * 100)}% of
          this airport&apos;s player slots for your own airline, allocated first
          each round. The defensive value of owning your hub as slots tighten.
        </p>
        <SliderRow
          value={reservedPct}
          max={Math.round(AIRPORT_OWNER_RESERVE_PCT_MAX * 100)}
          suffix="%"
          onChange={setReservedPct}
          onApply={applyReserved}
          dirty={reservedPct !== Math.round((slotState.reservedSlotPct ?? 0) * 100)}
        />
      </section>

      {/* Self-discount */}
      <section>
        <SectionLabel icon={<Percent size={12} />}>
          Own-airline slot discount
        </SectionLabel>
        <p className="text-body-sm text-ink-muted mb-2 leading-snug">
          Bill your own flights up to{" "}
          {Math.round(AIRPORT_OWNER_SELF_DISCOUNT_MAX * 100)}% below the rival
          slot rate. A modest cost edge — the regulator caps it and watches for
          abuse.
        </p>
        {regulated ? (
          <div className="rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)]/40 p-2.5 text-body-sm text-warning flex items-center gap-2">
            <Lock size={13} /> Equal pricing enforced for {regulatedRoundsLeft}{" "}
            more quarter{regulatedRoundsLeft === 1 ? "" : "s"}.
          </div>
        ) : (
          <SliderRow
            value={selfDiscount}
            max={Math.round(AIRPORT_OWNER_SELF_DISCOUNT_MAX * 100)}
            suffix="%"
            onChange={setSelfDiscount}
            onApply={applySelfDiscount}
            dirty={
              selfDiscount !==
              Math.round((slotState.ownerSelfDiscountPct ?? 0) * 100)
            }
          />
        )}
      </section>

      {/* Specialization */}
      <SpecializationSection cityCode={cityCode} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Specialization & forks
 * ════════════════════════════════════════════════════════════════════ */

function SpecializationSection({ cityCode }: { cityCode: string }) {
  const player = useGame(selectPlayer);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const chooseAirportSpecialization = useGame(
    (s) => s.chooseAirportSpecialization,
  );
  const setAirportFork = useGame((s) => s.setAirportFork);
  const switchAirportSpecialization = useGame(
    (s) => s.switchAirportSpecialization,
  );

  const [pickSpec, setPickSpec] = useState<AirportSpecialization | null>(null);
  const [showSwitch, setShowSwitch] = useState(false);

  if (!player || !slotState) return null;

  const current = slotState.specialization;
  const currentFork = slotState.specializationFork;
  const rebuilding = slotState.pendingUpgrades?.some(
    (u) => u.kind === "specialization-switch",
  );

  // ── First-time picker (free) ──────────────────────────────────────
  if (!current) {
    return (
      <section>
        <SectionLabel icon={<Sparkles size={12} />}>
          Choose a specialization
        </SectionLabel>
        <p className="text-body-sm text-ink-muted mb-2 leading-snug">
          Free the first time. Each specialization reshapes the airport&apos;s
          non-aero economics; pick the fork that matches your network.
        </p>
        <div className="space-y-2">
          {Object.values(AIRPORT_SPECIALIZATIONS).map((spec) => (
            <SpecCard
              key={spec.id}
              specId={spec.id}
              expanded={pickSpec === spec.id}
              onToggle={() =>
                setPickSpec(pickSpec === spec.id ? null : spec.id)
              }
              onPickFork={(fork) => {
                const res = chooseAirportSpecialization({
                  airportCode: cityCode,
                  specialization: spec.id,
                  fork,
                });
                if (!res.ok && res.error)
                  toast.negative("Couldn't specialize", res.error);
                setPickSpec(null);
              }}
            />
          ))}
        </div>
      </section>
    );
  }

  // ── Already specialized — show current + fork toggle + switch ──────
  const def = AIRPORT_SPECIALIZATIONS[current];
  return (
    <section>
      <SectionLabel icon={<Sparkles size={12} />}>Specialization</SectionLabel>
      <div className="rounded-md border border-line bg-surface p-3 mb-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-body-lg font-semibold text-ink">
            {def.name}
          </span>
          <Badge tone="accent">{def.nonAeroModifier.toFixed(2)}× non-aero</Badge>
          {rebuilding && <Badge tone="warning">Rebuild in progress</Badge>}
        </div>
        <p className="text-body-sm text-ink-muted mb-2">
          Pays off if {def.paysOffIf.toLowerCase()} · underperforms if{" "}
          {def.underperformsIf.toLowerCase()}.
        </p>

        {/* Fork toggle within current specialization */}
        <div className="text-caption uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Fork
        </div>
        <div className="grid grid-cols-2 gap-2">
          {def.forks.map((fork) => {
            const active = currentFork === fork.id;
            return (
              <button
                key={fork.id}
                disabled={active || rebuilding}
                onClick={() => {
                  const res = setAirportFork({
                    airportCode: cityCode,
                    fork: fork.id,
                  });
                  if (!res.ok && res.error)
                    toast.negative("Couldn't switch fork", res.error);
                }}
                className={cn(
                  "text-left rounded-md border p-2.5 transition-colors",
                  active
                    ? "border-accent bg-[var(--accent-soft)]"
                    : "border-line bg-surface hover:bg-surface-hover",
                  rebuilding && "opacity-50 pointer-events-none",
                )}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  {fork.id === "fuel-farm" && (
                    <Fuel size={12} className="text-accent" />
                  )}
                  <span className="text-body font-semibold text-ink">
                    {fork.name}
                  </span>
                  {active && <Badge tone="accent">Active</Badge>}
                </div>
                <p className="text-label text-ink-muted leading-snug">
                  {fork.blurb}
                </p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Costly switch */}
      {!rebuilding && (
        <>
          <button
            onClick={() => setShowSwitch((v) => !v)}
            className="text-body-sm text-accent font-medium hover:underline"
          >
            {showSwitch ? "Cancel" : "Switch to a different specialization…"}
          </button>
          {showSwitch && (
            <div className="mt-2 rounded-md border border-line bg-surface-2/40 p-3">
              <p className="text-body-sm text-warning mb-2 leading-snug">
                Reconfiguring is a {fmtMoney(AIRPORT_SPECIALIZATION_SWITCH_COST)}{" "}
                rebuild over {AIRPORT_SPECIALIZATION_SWITCH_ROUNDS} quarters. The
                new specialization only takes effect once the build completes.
              </p>
              <div className="space-y-2">
                {Object.values(AIRPORT_SPECIALIZATIONS)
                  .filter((spec) => spec.id !== current)
                  .map((spec) => (
                    <SpecCard
                      key={spec.id}
                      specId={spec.id}
                      expanded={pickSpec === spec.id}
                      onToggle={() =>
                        setPickSpec(pickSpec === spec.id ? null : spec.id)
                      }
                      onPickFork={(fork) => {
                        const res = switchAirportSpecialization({
                          airportCode: cityCode,
                          specialization: spec.id,
                          fork,
                        });
                        if (!res.ok && res.error)
                          toast.negative("Rebuild blocked", res.error);
                        setPickSpec(null);
                        setShowSwitch(false);
                      }}
                      ctaLabel={`Rebuild (${fmtMoney(AIRPORT_SPECIALIZATION_SWITCH_COST)})`}
                    />
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SpecCard({
  specId,
  expanded,
  onToggle,
  onPickFork,
  ctaLabel,
}: {
  specId: AirportSpecialization;
  expanded: boolean;
  onToggle: () => void;
  onPickFork: (fork: AirportSpecializationFork) => void;
  ctaLabel?: string;
}) {
  const spec = AIRPORT_SPECIALIZATIONS[specId];
  return (
    <div
      className={cn(
        "rounded-md border transition-colors",
        expanded ? "border-accent bg-[var(--accent-soft)]/40" : "border-line bg-surface",
      )}
    >
      <button
        onClick={onToggle}
        className="w-full text-left p-2.5 flex items-center justify-between gap-2"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-body font-semibold text-ink">
              {spec.name}
            </span>
            <Badge tone="neutral">{spec.nonAeroModifier.toFixed(2)}×</Badge>
          </div>
          <p className="text-label text-ink-muted truncate">
            {spec.optimizedFor}
          </p>
        </div>
        <span className="text-ink-muted text-body-sm shrink-0">
          {expanded ? "−" : "+"}
        </span>
      </button>
      {expanded && (
        <div className="px-2.5 pb-2.5 grid grid-cols-1 gap-2">
          {spec.forks.map((fork) => (
            <div
              key={fork.id}
              className="rounded-md border border-line bg-surface p-2.5"
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                {fork.id === "fuel-farm" && (
                  <Fuel size={12} className="text-accent" />
                )}
                <span className="text-body font-semibold text-ink">
                  {fork.name}
                </span>
              </div>
              <p className="text-label text-ink-muted leading-snug mb-2">
                {fork.blurb}
              </p>
              <Button
                variant="accent"
                size="sm"
                className="w-full !h-8"
                onClick={() => onPickFork(fork.id)}
              >
                {ctaLabel ?? "Choose this fork"}
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Rival-owned + public cards
 * ════════════════════════════════════════════════════════════════════ */

function RivalOwnerCard({
  cityCode,
  govt,
}: {
  cityCode: string;
  govt: string;
}) {
  const teams = useGame((s) => s.teams);
  const slotState = useGame((s) => s.airportSlots?.[cityCode]);
  const owner = teams.find((t) => t.id === slotState?.ownerTeamId);
  const ladder = airportLadder(cityCode, slotState?.ladder);
  const def = AIRPORT_DEFAULT_FEES_BY_LADDER[ladder];
  const slotFee = slotState?.slotFeeUsd ?? def.slotFeeUsd;
  const spec = slotState?.specialization
    ? AIRPORT_SPECIALIZATIONS[slotState.specialization]
    : null;

  return (
    <section className="rounded-xl border border-[var(--warning-soft)] bg-[var(--warning-soft)]/30 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Building2 size={15} className="text-warning" />
        <h3 className="font-display text-title-sm text-ink font-semibold">
          Privately operated{owner ? ` by ${owner.name}` : ""}
        </h3>
      </div>
      <p className="text-body text-ink-2 leading-relaxed mb-3">
        This airport was privatized — {owner?.name ?? "a rival airline"} runs it
        and sets the fees you pay to fly here. {govt} no longer controls slot
        pricing at this field.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Slot fee / quarter" value={fmtMoney(slotFee)} hint="What you're charged" />
        <Stat
          label="Specialization"
          value={spec ? spec.name : "—"}
          hint="Operator focus"
        />
      </div>
    </section>
  );
}

function PublicAirportCard({
  cityCode,
  ladder,
  govt,
}: {
  cityCode: string;
  ladder: number;
  govt: string;
}) {
  const def = AIRPORT_DEFAULT_FEES_BY_LADDER[ladder as 0 | 1 | 2 | 3 | 4 | 5];
  return (
    <section className="rounded-xl border border-line bg-surface-2/40 p-4">
      <div className="flex items-center gap-2 mb-1.5">
        <Landmark size={15} className="text-ink-2" />
        <h3 className="font-display text-title-sm text-ink font-semibold">
          Government-run airport
        </h3>
      </div>
      <p className="text-body text-ink-2 leading-relaxed mb-3">
        {govt} operates this airport and charges the public fee schedule below.
        It may be released for privatization in a future round — when it is,
        you&apos;ll be able to bid for operating control here.
      </p>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Slot / quarter" value={fmtMoney(def.slotFeeUsd)} />
        <Stat label="Landing" value={fmtMoney(def.landingFeeUsd)} />
        <Stat label="Per pax" value={`$${def.passengerChargeUsd}`} />
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════
 *  Small shared primitives
 * ════════════════════════════════════════════════════════════════════ */

function SectionLabel({
  icon,
  children,
}: {
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-label uppercase tracking-wider text-ink-muted font-semibold mb-2">
      {icon}
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "positive" | "negative" | "warning";
}) {
  return (
    <div className="rounded-md border border-line bg-surface px-3 py-2">
      <div className="text-caption uppercase tracking-wider text-ink-muted font-semibold">
        {label}
      </div>
      <div
        className={cn(
          "font-mono tabular font-bold text-title-sm leading-tight mt-0.5",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "warning" && "text-warning",
          !tone && "text-ink",
        )}
      >
        {value}
      </div>
      {hint && <div className="text-caption text-ink-muted mt-0.5">{hint}</div>}
    </div>
  );
}

function FeeInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  step: number;
}) {
  return (
    <div>
      <label className="block text-caption uppercase tracking-wider text-ink-muted font-semibold mb-1">
        {label}
      </label>
      <Input
        type="number"
        inputMode="numeric"
        value={value}
        step={step}
        min={0}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono tabular !h-9 !px-2 text-body"
      />
    </div>
  );
}

function SliderRow({
  value,
  max,
  suffix,
  onChange,
  onApply,
  dirty,
}: {
  value: number;
  max: number;
  suffix: string;
  onChange: (v: number) => void;
  onApply: () => void;
  dirty: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#00C2CB]"
      />
      <span className="font-mono tabular text-ink text-body-lg w-12 text-right">
        {value}
        {suffix}
      </span>
      <Button
        variant="secondary"
        size="sm"
        className="!h-8"
        disabled={!dirty}
        onClick={onApply}
      >
        Apply
      </Button>
    </div>
  );
}

function InvestRow({
  icon,
  title,
  detail,
  cost,
  atMax,
  atMaxLabel,
  canAfford,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  detail: string;
  cost: number;
  atMax: boolean;
  atMaxLabel: string;
  canAfford: boolean;
  onClick: () => void;
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          {icon}
          <span className="text-body font-semibold text-ink">{title}</span>
        </div>
        <p className="text-label text-ink-muted leading-snug">{detail}</p>
      </div>
      {atMax ? (
        <Badge tone="positive">{atMaxLabel}</Badge>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          className="!h-9 shrink-0"
          disabled={!canAfford}
          onClick={onClick}
        >
          {fmtMoney(cost)}
        </Button>
      )}
    </div>
  );
}
