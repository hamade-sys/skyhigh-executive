"use client";

import { useState, useMemo } from "react";
import {
  Badge,
  Button,
  Modal,
  ModalBody,
  ModalFooter,
  ModalHeader,
} from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { planeImagePath } from "@/lib/aircraft-images";
import { cn } from "@/lib/cn";
import { useGame, selectPlayer } from "@/store/game";
import type { AircraftSpec } from "@/types/game";

/**
 * Purchase Order modal — Air-Tycoon-style aircraft order customization.
 *
 * Layout:
 *   1. Quantity selector (+/- buttons)
 *   2. Engine retrofit options (none / fuel / power / super)
 *   3. Fuselage coating retrofit (toggle)
 *   4. Seat configuration (passenger only) — adjustable %
 *      first/business/economy ratios. Total seat-equivalents fixed by
 *      airframe (1F = 3Y, 1C = 2Y).
 *   5. Live total price + Order button
 */

// Upgrade pricing now lives in src/lib/aircraft-upgrades.ts so the
// modal preview and the store's orderAircraft action read the same
// numbers — no more "UI shows $8M, store charges $24.9M" surprises.
import {
  engineUpgradeCostUsd as engineCost,
  fuselageUpgradeCostUsd as fuselageCost,
  amenityCostUsd,
  cargoBellyCostUsd,
  cargoBellyStandardTonnes,
  AMENITY_PCT,
  AMENITY_SAT_BUMP,
  CARGO_BELLY_COST_PCT,
} from "@/lib/aircraft-upgrades";
import type { CabinAmenities, CargoBellyTier } from "@/types/game";

type EngineKind = "none" | "fuel" | "power" | "super";

interface PurchaseOrderArgs {
  specId: string;
  acquisitionType: "buy" | "lease";
  quantity: number;
  customSeats?: { first: number; business: number; economy: number };
  engineUpgrade: "fuel" | "power" | "super" | null;
  fuselageUpgrade: boolean;
  cabinAmenities?: CabinAmenities;
  cargoBelly?: CargoBellyTier;
}

interface Props {
  spec: AircraftSpec | null;
  acquisitionType: "buy" | "lease";
  /** Optional initial values from the AircraftMarketModal expanded card.
   *  When provided, the modal jumps the player straight to seat-config
   *  review instead of asking them to re-enter quantity/engine/fuselage. */
  prefill?: {
    quantity?: number;
    engineUpgrade?: "fuel" | "power" | "super" | null;
    fuselageUpgrade?: boolean;
  };
  onConfirm: (args: PurchaseOrderArgs) => void;
  onClose: () => void;
}

export function PurchaseOrderModal(props: Props) {
  // Remount-on-spec-change pattern — React tears down and rebuilds with
  // fresh state every time spec.id changes, so we never need a "reset"
  // effect. Cleaner than setState-in-effect/memo.
  if (!props.spec) return null;
  return <PurchaseOrderBody key={props.spec.id} {...props} spec={props.spec} />;
}

function PurchaseOrderBody({
  spec, acquisitionType, prefill, onConfirm, onClose,
}: Omit<Props, "spec"> & { spec: NonNullable<Props["spec"]> }) {
  const isPassenger = spec.family === "passenger";

  const defaultEquivalents = useMemo(
    () =>
      isPassenger
        ? spec.seats.first * 3 + spec.seats.business * 2 + spec.seats.economy
        : 0,
    [spec, isPassenger],
  );

  // Default ratios derived from spec seats, weighted by their equivalence.
  const defaultRatios = useMemo(() => {
    if (!isPassenger || defaultEquivalents === 0) {
      return { first: 0, business: 0, economy: 100 };
    }
    const f = (spec.seats.first * 3 / defaultEquivalents) * 100;
    const b = (spec.seats.business * 2 / defaultEquivalents) * 100;
    const y = (spec.seats.economy / defaultEquivalents) * 100;
    return { first: Math.round(f), business: Math.round(b), economy: Math.round(y) };
  }, [spec, isPassenger, defaultEquivalents]);

  const [quantity, setQuantity] = useState(prefill?.quantity ?? 1);
  // Engine + fuselage are READ-ONLY from prefill — chosen on the
  // AircraftMarketModal expanded card. Showing them again as
  // editable fields earlier let the player override their previous
  // pick by accident.
  const engine: EngineKind = prefill?.engineUpgrade ?? "none";
  const fuselage = prefill?.fuselageUpgrade ?? false;
  const [firstPct, setFirstPct] = useState(defaultRatios.first);
  const [businessPct, setBusinessPct] = useState(defaultRatios.business);
  // New at PurchaseOrderModal: cabin amenities (passenger only) +
  // cargo belly tier (passenger only). Each is a per-airframe
  // commitment captured at order time.
  const [amenities, setAmenities] = useState<CabinAmenities>({});
  const [cargoBelly, setCargoBelly] = useState<CargoBellyTier>("none");
  // Economy is the remainder so it always balances.
  const economyPct = Math.max(0, 100 - firstPct - businessPct);

  // Compute custom seat counts from ratios. Each "unit" of seat-equivalent
  // is allocated by ratio. Then convert: F = units / 3, C = units / 2, Y = units.
  const firstSeatsRaw = (firstPct / 100) * defaultEquivalents / 3;
  const businessSeatsRaw = (businessPct / 100) * defaultEquivalents / 2;
  const economySeatsRaw = (economyPct / 100) * defaultEquivalents;
  const customSeats = isPassenger
    ? {
        first: Math.floor(firstSeatsRaw),
        business: Math.floor(businessSeatsRaw),
        economy: Math.floor(economySeatsRaw),
      }
    : undefined;
  const totalSeats = customSeats
    ? customSeats.first + customSeats.business + customSeats.economy
    : 0;
  // Sanity: equivalent total ≤ default
  const customEquivalents = customSeats
    ? customSeats.first * 3 + customSeats.business * 2 + customSeats.economy
    : 0;

  const isCustom =
    isPassenger && (
      Math.abs(firstPct - defaultRatios.first) > 0 ||
      Math.abs(businessPct - defaultRatios.business) > 0
    );

  // Pricing scales with the airframe. Engine + fuselage carry through
  // from the AircraftMarketModal pick (read-only here); cabin amenities
  // + cargo belly are new at this step.
  const selectedEngineCost = engine === "none" ? 0 : engineCost(spec.buyPriceUsd, engine);
  const fuselageUpgradeCost = fuselage ? fuselageCost(spec.buyPriceUsd) : 0;
  const amenitiesCost = amenityCostUsd(spec.buyPriceUsd, amenities);
  const bellyCost = isPassenger ? cargoBellyCostUsd(spec.buyPriceUsd, cargoBelly) : 0;
  const upgradeCostPerPlane =
    selectedEngineCost + fuselageUpgradeCost + amenitiesCost + bellyCost;

  const basePrice =
    acquisitionType === "buy" ? spec.buyPriceUsd : spec.leasePerQuarterUsd;
  const perPlaneCost = basePrice + upgradeCostPerPlane;
  const totalCost = perPlaneCost * quantity;

  function handleOrder() {
    onConfirm({
      specId: spec.id,
      acquisitionType,
      quantity,
      customSeats: isCustom && customSeats ? customSeats : undefined,
      engineUpgrade: engine === "none" ? null : engine,
      fuselageUpgrade: fuselage,
      cabinAmenities:
        isPassenger && (amenities.wifi || amenities.premiumSeating ||
                        amenities.entertainment || amenities.foodService)
          ? amenities
          : undefined,
      cargoBelly: isPassenger ? cargoBelly : undefined,
    });
  }

  return (
    <Modal open onClose={onClose} className="w-[min(700px,calc(100vw-3rem))]">
      <ModalHeader>
        <div className="flex items-start gap-4">
          {/* Hero illustration */}
          <div className="shrink-0 w-32 h-24 rounded-md bg-surface-2/50 border border-line/60 flex items-center justify-center overflow-hidden">
            {planeImagePath(spec.id) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={planeImagePath(spec.id)!}
                alt={`${spec.name} illustration`}
                className="max-w-full max-h-full object-contain p-1"
              />
            ) : (
              <span className="text-ink-muted text-[0.625rem] uppercase tracking-wider">No image</span>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Badge tone="accent">Purchase order</Badge>
              <Badge tone={acquisitionType === "buy" ? "primary" : "neutral"}>
                {acquisitionType === "buy" ? "Buy" : "Lease"}
              </Badge>
            </div>
            <h2 className="font-display text-[1.5rem] text-ink leading-tight">
              {spec.name}
            </h2>
            <div className="text-ink-muted text-[0.8125rem] mt-1 font-mono">
              {spec.family === "passenger"
                ? `${spec.seats.first}F / ${spec.seats.business}C / ${spec.seats.economy}Y default`
                : `${spec.cargoTonnes ?? 0}T cargo`}
              {" · "}{spec.rangeKm.toLocaleString()} km
              {" · "}{spec.fuelBurnPerKm} L/km
            </div>
          </div>
        </div>
      </ModalHeader>

      <ModalBody className="space-y-4 max-h-[68vh] overflow-y-auto">
        {/* 1 — Quantity */}
        <Section title="Quantity">
          <div role="group" aria-label="Aircraft order quantity" className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              aria-label="Decrease quantity"
              className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              disabled={quantity <= 1}
            >
              <span aria-hidden="true">−</span>
            </button>
            <span
              aria-live="polite"
              aria-atomic="true"
              className="tabular font-mono text-[1.5rem] text-ink font-bold w-16 text-center"
            >
              {quantity}
            </span>
            <button
              type="button"
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              aria-label="Increase quantity"
              className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              disabled={quantity >= 20}
            >
              <span aria-hidden="true">+</span>
            </button>
            <div className="flex-1 text-[0.75rem] text-ink-muted leading-relaxed">
              All aircraft in this order are configured identically. Max 20 per order.
            </div>
          </div>
        </Section>

        {/* 2 — Engine + fuselage chosen on the previous screen.
              Render as read-only summary so the player sees what's
              already locked in without a chance to override here. */}
        {(engine !== "none" || fuselage) && (
          <Section title="Already configured (from previous screen)">
            <div className="rounded-md border border-line bg-surface-2/40 p-3 text-[0.8125rem] flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
              {engine !== "none" && (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-ink-muted text-[0.6875rem] uppercase tracking-wider">Engine</span>
                  <span className="text-ink font-medium capitalize">{engine}</span>
                  <span className="text-ink-muted text-[0.6875rem] tabular font-mono">
                    +{fmtMoney(selectedEngineCost)}/plane
                  </span>
                </span>
              )}
              {fuselage && (
                <span className="inline-flex items-baseline gap-1.5">
                  <span className="text-ink-muted text-[0.6875rem] uppercase tracking-wider">Fuselage</span>
                  <span className="text-ink font-medium">Anti-drag coating</span>
                  <span className="text-ink-muted text-[0.6875rem] tabular font-mono">
                    +{fmtMoney(fuselageUpgradeCost)}/plane
                  </span>
                </span>
              )}
            </div>
          </Section>
        )}

        {/* 3 — Cabin amenities (passenger only). Each toggle adds
              a small per-plane cost AND a satisfaction bump that
              feeds the cabin-condition demand multiplier in the
              engine — the player buys passenger experience here. */}
        {isPassenger && (
          <Section title="Cabin amenities (per aircraft)">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <AmenityToggle
                checked={!!amenities.wifi}
                onChange={(v) => setAmenities((a) => ({ ...a, wifi: v }))}
                label="In-flight WiFi"
                detail={`+${AMENITY_SAT_BUMP.wifi} satisfaction`}
                cost={spec.buyPriceUsd * AMENITY_PCT.wifi}
              />
              <AmenityToggle
                checked={!!amenities.premiumSeating}
                onChange={(v) => setAmenities((a) => ({ ...a, premiumSeating: v }))}
                label="Premium seating"
                detail={`+${AMENITY_SAT_BUMP.premiumSeating} satisfaction · upgraded shells, more pitch`}
                cost={spec.buyPriceUsd * AMENITY_PCT.premiumSeating}
              />
              <AmenityToggle
                checked={!!amenities.entertainment}
                onChange={(v) => setAmenities((a) => ({ ...a, entertainment: v }))}
                label="Inflight entertainment"
                detail={`+${AMENITY_SAT_BUMP.entertainment} satisfaction · seat-back screens, content library`}
                cost={spec.buyPriceUsd * AMENITY_PCT.entertainment}
              />
              <AmenityToggle
                checked={!!amenities.foodService}
                onChange={(v) => setAmenities((a) => ({ ...a, foodService: v }))}
                label="Hot food service"
                detail={`+${AMENITY_SAT_BUMP.foodService} satisfaction · galleys + chef partnership`}
                cost={spec.buyPriceUsd * AMENITY_PCT.foodService}
              />
            </div>
            <div className="text-[0.6875rem] text-ink-muted mt-2 leading-relaxed">
              Amenities stack — picking premium seating + entertainment
              on every plane in your fleet earns an additional 3% route
              demand uplift on routes those planes fly.
            </div>
          </Section>
        )}

        {/* 4 — Cargo belly (passenger only). Standard belly per
              seat-count tier; Expanded = 1.5× standard tonnage at
              double the cost. Belly tonnage flies on every passenger
              flight and consumes from cargo demand on the route. */}
        {isPassenger && (() => {
          const bellyStdT = cargoBellyStandardTonnes(totalSeats);
          if (bellyStdT === 0) {
            return null;  // sub-100-seat regional jets don't get a belly tier
          }
          const bellyExpT = Math.round(bellyStdT * 1.5);
          return (
            <Section title="Cargo belly (per aircraft)">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <BellyOption
                  active={cargoBelly === "none"}
                  label="No belly cargo"
                  detail="Pax only — no belly capacity"
                  tonnes={0}
                  cost={0}
                  onClick={() => setCargoBelly("none")}
                />
                <BellyOption
                  active={cargoBelly === "standard"}
                  label="Standard belly"
                  detail="Tier-baseline tonnage on every flight"
                  tonnes={bellyStdT}
                  cost={spec.buyPriceUsd * CARGO_BELLY_COST_PCT.standard}
                  onClick={() => setCargoBelly("standard")}
                />
                <BellyOption
                  active={cargoBelly === "expanded"}
                  label="Expanded belly"
                  detail="1.5× standard tonnage"
                  tonnes={bellyExpT}
                  cost={spec.buyPriceUsd * CARGO_BELLY_COST_PCT.expanded}
                  onClick={() => setCargoBelly("expanded")}
                />
              </div>
              <div className="text-[0.6875rem] text-ink-muted mt-2 leading-relaxed">
                Belly tonnage scales with seat count: 100-199 seats = 5T,
                200-299 = 10T, 300-399 = 20T, 400+ = 25T. Belly cargo
                consumes from the route&apos;s cargo demand and prices
                at 80% of dedicated freighter rates.
              </div>
            </Section>
          );
        })()}

        {/* 4 — Seat configuration (passenger only) */}
        {isPassenger && customSeats && (
          <Section title="Seat configuration">
            <div className="rounded-md border border-line bg-surface-2/40 p-3 mb-3">
              <div className="text-[0.6875rem] text-ink-muted leading-relaxed">
                Allocate the airframe&apos;s {defaultEquivalents.toLocaleString()} seat-equivalents
                across cabin classes. <strong>1 First seat</strong> = 3 Economy units.{" "}
                <strong>1 Business</strong> = 2 Economy units. All-economy fits more passengers;
                all-business charges higher fares but holds far fewer.
              </div>
            </div>

            <RatioSlider
              label="First class"
              tone="first"
              percent={firstPct}
              onChange={(p) => {
                const newFirst = Math.max(0, Math.min(100 - businessPct, p));
                setFirstPct(newFirst);
              }}
              seats={customSeats.first}
            />
            <RatioSlider
              label="Business"
              tone="business"
              percent={businessPct}
              onChange={(p) => {
                const newBusiness = Math.max(0, Math.min(100 - firstPct, p));
                setBusinessPct(newBusiness);
              }}
              seats={customSeats.business}
            />
            <RatioSlider
              label="Economy"
              tone="economy"
              percent={economyPct}
              onChange={() => undefined}
              seats={customSeats.economy}
              readOnly
            />

            <div className="rounded-md border border-line bg-surface p-3 mt-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Total seats</div>
                <div className="font-mono text-ink text-[1.125rem] font-bold tabular">{totalSeats}</div>
              </div>
              <div>
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Equivalents used</div>
                <div className={cn(
                  "font-mono text-[1.125rem] font-bold tabular",
                  customEquivalents > defaultEquivalents ? "text-negative" : "text-ink",
                )}>
                  {customEquivalents}<span className="text-ink-muted">/{defaultEquivalents}</span>
                </div>
              </div>
              <div>
                <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">Premium %</div>
                <div className="font-mono text-ink text-[1.125rem] font-bold tabular">
                  {Math.round(firstPct + businessPct)}%
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setFirstPct(defaultRatios.first);
                setBusinessPct(defaultRatios.business);
              }}
              className="mt-2 text-[0.75rem] text-ink-muted hover:text-ink underline"
            >
              Reset to factory default
            </button>

          </Section>
        )}

        {/* 5 — Order summary */}
        <div className="rounded-lg border border-line bg-surface-2/50 p-4 space-y-1.5 text-[0.8125rem]">
          <SummaryRow
            label={`Base ${acquisitionType === "buy" ? "price" : "lease/Q"}`}
            value={`${fmtMoney(basePrice)} × ${quantity}`}
            total={fmtMoney(basePrice * quantity)}
          />
          {selectedEngineCost > 0 && (
            <SummaryRow
              label={`Engine retrofit (${engine})`}
              value={`${fmtMoney(selectedEngineCost)} × ${quantity}`}
              total={fmtMoney(selectedEngineCost * quantity)}
            />
          )}
          {fuselage && (
            <SummaryRow
              label="Fuselage coating"
              value={`${fmtMoney(fuselageUpgradeCost)} × ${quantity}`}
              total={fmtMoney(fuselageUpgradeCost * quantity)}
            />
          )}
          {amenitiesCost > 0 && (
            <SummaryRow
              label="Cabin amenities"
              value={`${fmtMoney(amenitiesCost)} × ${quantity}`}
              total={fmtMoney(amenitiesCost * quantity)}
            />
          )}
          {bellyCost > 0 && (
            <SummaryRow
              label={`Cargo belly (${cargoBelly})`}
              value={`${fmtMoney(bellyCost)} × ${quantity}`}
              total={fmtMoney(bellyCost * quantity)}
            />
          )}
          <div className="flex items-baseline justify-between border-t border-line pt-2 mt-2">
            <span className="font-semibold text-ink uppercase text-[0.75rem] tracking-wider">
              Total {acquisitionType === "buy" ? "purchase" : "first-quarter"}
            </span>
            <span className="font-mono tabular text-ink text-[1.25rem] font-bold">
              {fmtMoney(totalCost)}
            </span>
          </div>
          <CashAffordabilityRow totalCost={totalCost} />
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <CashAwareOrderButton
          totalCost={totalCost}
          quantity={quantity}
          onOrder={handleOrder}
        />
      </ModalFooter>
    </Modal>
  );
}

/** Cash readout — shows the player exactly what they have on hand
 *  vs what this order needs, so the Order button isn't a black box.
 *  When short, the row goes red and the gap is the focal number. */
function CashAffordabilityRow({ totalCost }: { totalCost: number }) {
  const player = useGame(selectPlayer);
  if (!player) return null;
  const cashOnHand = player.cashUsd;
  const shortfall = Math.max(0, totalCost - cashOnHand);
  const canAfford = shortfall === 0;
  return (
    <div
      className={cn(
        "flex items-baseline justify-between text-[0.75rem] mt-1.5 rounded-md px-2 py-1.5",
        canAfford
          ? "bg-surface-2/40 text-ink-2"
          : "bg-[var(--negative-soft)] text-negative",
      )}
    >
      <span className="uppercase tracking-wider text-[0.625rem]">
        Cash on hand
      </span>
      <span className="tabular font-mono">
        {fmtMoney(cashOnHand)}
        {!canAfford && (
          <span className="ml-2 font-semibold">
            · short {fmtMoney(shortfall)}
          </span>
        )}
      </span>
    </div>
  );
}

/** Order button with built-in cash check. When the player has enough
 *  cash the button is its normal CTA; when short, it disables but
 *  rewrites its label to call out the gap so the player knows WHY. */
function CashAwareOrderButton({
  totalCost, quantity, onOrder,
}: {
  totalCost: number;
  quantity: number;
  onOrder: () => void;
}) {
  const player = useGame(selectPlayer);
  if (!player) return null;
  const shortfall = Math.max(0, totalCost - player.cashUsd);
  const canAfford = shortfall === 0;
  return (
    <Button
      variant="primary"
      onClick={canAfford ? onOrder : undefined}
      disabled={!canAfford}
      title={
        canAfford
          ? undefined
          : `Need ${fmtMoney(shortfall)} more cash. Borrow from Financials → Borrowing or trim the order.`
      }
    >
      {canAfford
        ? <>Order {quantity} → {fmtMoney(totalCost)}</>
        : <>Need {fmtMoney(shortfall)} more cash</>
      }
    </Button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
        {title}
      </div>
      {children}
    </section>
  );
}

function RatioSlider({
  label, tone, percent, onChange, seats, readOnly = false,
}: {
  label: string;
  tone: "first" | "business" | "economy";
  percent: number;
  onChange: (p: number) => void;
  seats: number;
  readOnly?: boolean;
}) {
  const accent = tone === "first" ? "var(--positive)" : tone === "business" ? "var(--accent)" : "var(--ink-muted)";
  return (
    <div className="mb-2.5">
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-[0.75rem] text-ink-2 font-medium">{label}</span>
        <div className="flex items-baseline gap-2">
          <span className="font-mono tabular text-[0.8125rem] text-ink font-semibold">
            {seats} seat{seats === 1 ? "" : "s"}
          </span>
          <span className="text-[0.6875rem] tabular text-ink-muted">
            ({Math.round(percent)}%)
          </span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(percent)}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        disabled={readOnly}
        className="w-full"
        style={{ accentColor: accent }}
      />
    </div>
  );
}

function SummaryRow({ label, value, total }: { label: string; value: string; total: string }) {
  return (
    <div className="flex items-baseline justify-between text-[0.8125rem]">
      <span className="text-ink-2">{label}</span>
      <div className="flex items-baseline gap-3">
        <span className="text-ink-muted text-[0.75rem] tabular font-mono">{value}</span>
        <span className="font-mono tabular text-ink font-medium w-24 text-right">{total}</span>
      </div>
    </div>
  );
}

/** Cabin amenity toggle — checkbox row with label + effect blurb +
 *  cost. Visual matches the existing Fuselage coating row pattern
 *  for consistency across the order form. */
function AmenityToggle({
  checked, onChange, label, detail, cost,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  detail: string;
  cost: number;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
        checked
          ? "border-primary bg-[rgba(20,53,94,0.04)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="accent-primary"
      />
      <div className="flex-1">
        <div className="font-medium text-ink text-[0.875rem]">{label}</div>
        <div className="text-[0.75rem] text-ink-muted leading-snug">{detail}</div>
      </div>
      <span className="tabular font-mono text-ink-2 text-[0.875rem]">
        +{fmtMoney(cost)}
      </span>
    </label>
  );
}

/** Cargo belly tier option — radio-style card with tonnage badge. */
function BellyOption({
  active, label, detail, tonnes, cost, onClick,
}: {
  active: boolean;
  label: string;
  detail: string;
  tonnes: number;
  cost: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-3 text-left transition-colors",
        active
          ? "border-primary bg-[rgba(20,53,94,0.04)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink text-[0.875rem]">{label}</span>
        {tonnes > 0 && (
          <span className="text-[0.625rem] uppercase tracking-wider font-bold text-warning bg-[var(--warning-soft)] rounded px-1.5 py-0.5">
            {tonnes}T
          </span>
        )}
      </div>
      <div className="text-[0.75rem] text-ink-muted mt-1 leading-snug">{detail}</div>
      <div className="text-[0.75rem] tabular font-mono text-ink-2 mt-1.5">
        {cost > 0 ? `+${fmtMoney(cost)}` : "free"}
      </div>
    </button>
  );
}
