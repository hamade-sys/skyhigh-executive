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
} from "@/lib/aircraft-upgrades";

type EngineKind = "none" | "fuel" | "power" | "super";

interface PurchaseOrderArgs {
  specId: string;
  acquisitionType: "buy" | "lease";
  quantity: number;
  customSeats?: { first: number; business: number; economy: number };
  engineUpgrade: "fuel" | "power" | "super" | null;
  fuselageUpgrade: boolean;
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
  const [engine, setEngine] = useState<EngineKind>(
    prefill?.engineUpgrade ?? "none",
  );
  const [fuselage, setFuselage] = useState(prefill?.fuselageUpgrade ?? false);
  const [firstPct, setFirstPct] = useState(defaultRatios.first);
  const [businessPct, setBusinessPct] = useState(defaultRatios.business);
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

  // Pricing scales with the airframe (10% per upgrade, 20% for super).
  // The buy price is the airframe value regardless of buy-vs-lease since
  // upgrades belong to the aircraft, not the lease.
  const fuelUpgradeCost = engineCost(spec.buyPriceUsd, "fuel");
  const powerUpgradeCost = engineCost(spec.buyPriceUsd, "power");
  const superUpgradeCost = engineCost(spec.buyPriceUsd, "super");
  const fuselageUpgradeCost = fuselageCost(spec.buyPriceUsd);
  const selectedEngineCost =
    engine === "fuel" ? fuelUpgradeCost :
    engine === "power" ? powerUpgradeCost :
    engine === "super" ? superUpgradeCost : 0;
  const upgradeCostPerPlane = selectedEngineCost + (fuselage ? fuselageUpgradeCost : 0);

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
          <div className="flex items-center gap-3">
            <button
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40"
              disabled={quantity <= 1}
            >
              −
            </button>
            <span className="tabular font-mono text-[1.5rem] text-ink font-bold w-16 text-center">
              {quantity}
            </span>
            <button
              onClick={() => setQuantity(Math.min(20, quantity + 1))}
              className="w-9 h-9 rounded-md border border-line hover:bg-surface-hover text-[1.125rem] font-semibold disabled:opacity-40"
              disabled={quantity >= 20}
            >
              +
            </button>
            <div className="flex-1 text-[0.75rem] text-ink-muted leading-relaxed">
              All aircraft in this order are configured identically. Max 20 per order.
            </div>
          </div>
        </Section>

        {/* 2 — Engine upgrade */}
        <Section title="Engine retrofit (per aircraft)">
          <div className="grid grid-cols-2 gap-2">
            <EngineOption
              kind="none"
              active={engine === "none"}
              label="Stock engine"
              detail="No retrofit"
              cost={0}
              onClick={() => setEngine("none")}
            />
            <EngineOption
              kind="fuel"
              active={engine === "fuel"}
              label="Fuel-efficient"
              detail="+10% range, −10% fuel burn"
              cost={fuelUpgradeCost}
              onClick={() => setEngine("fuel")}
            />
            <EngineOption
              kind="power"
              active={engine === "power"}
              label="Power-up"
              detail="+10% speed → tighter schedule"
              cost={powerUpgradeCost}
              onClick={() => setEngine("power")}
            />
            <EngineOption
              kind="super"
              active={engine === "super"}
              label="Super (fuel + power)"
              detail="Both effects combined"
              cost={superUpgradeCost}
              onClick={() => setEngine("super")}
            />
          </div>
        </Section>

        {/* 3 — Fuselage coating */}
        <Section title="Fuselage coating">
          <label
            className={cn(
              "flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors",
              fuselage
                ? "border-primary bg-[rgba(20,53,94,0.04)]"
                : "border-line hover:bg-surface-hover",
            )}
          >
            <input
              type="checkbox"
              checked={fuselage}
              onChange={(e) => setFuselage(e.target.checked)}
              className="accent-primary"
            />
            <div className="flex-1">
              <div className="font-medium text-ink text-[0.875rem]">
                Anti-drag coating
              </div>
              <div className="text-[0.75rem] text-ink-muted">
                −10% fuel burn (stacks with engine retrofit)
              </div>
            </div>
            <span className="tabular font-mono text-ink-2 text-[0.875rem]">
              +{fmtMoney(fuselageUpgradeCost)}
            </span>
          </label>
        </Section>

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

            {/* Cabin attractiveness preview — shows how this seat split
                will compete for passengers in each cabin class. PRD §6.7
                weights are eco {price 0.55, brand 0.20, loyalty 0.15,
                service 0.10}, business {0.35/0.35/0.20/0.10}, first
                {0.25/0.45/0.20/0.10}. Larger premium share earns more
                BRAND-weighted demand but suppresses raw passenger volume.
                The preview uses a baseline mid-market 60/60/50 player
                profile so the comparison reads relative across configs. */}
            {totalSeats > 0 && (() => {
              // Mid-market baseline: brand 60, loyalty 50, service 60.
              // Same args we'd pass to attractivenessByClass at runtime.
              const baseArgs = {
                priceScore: 70, // assume "Standard" tier as the mid-point
                brandPts: 60,
                loyaltyPct: 50,
                serviceScore: 60,
              };
              // Re-implement the same weights so we don't have to import
              // engine code into a UI-only component.
              const score = (cls: "econ" | "bus" | "first") => {
                const brandScore = Math.min(100, baseArgs.brandPts / 2);
                const w =
                  cls === "econ"  ? { p: 0.55, b: 0.20, l: 0.15, s: 0.10 } :
                  cls === "bus"   ? { p: 0.35, b: 0.35, l: 0.20, s: 0.10 } :
                                    { p: 0.25, b: 0.45, l: 0.20, s: 0.10 };
                return baseArgs.priceScore * w.p +
                  brandScore * w.b +
                  baseArgs.loyaltyPct * w.l +
                  baseArgs.serviceScore * w.s;
              };
              const econScore = customSeats.economy > 0 ? score("econ") : null;
              const busScore = customSeats.business > 0 ? score("bus") : null;
              const firstScore = customSeats.first > 0 ? score("first") : null;
              const tone = (s: number | null) =>
                s === null ? "text-ink-muted" :
                s >= 70 ? "text-positive" :
                s >= 55 ? "text-ink" : "text-negative";
              return (
                <div className="mt-3 rounded-md border border-line bg-surface p-3">
                  <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted mb-2">
                    Cabin attractiveness preview
                    <span className="ml-1 text-ink-muted normal-case tracking-normal">
                      · vs mid-market peer (Brand 60 · Loyalty 50% · Service 60)
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[0.75rem]">
                    <div className="rounded bg-surface-2 p-2 text-center">
                      <div className="text-ink-muted text-[0.625rem] uppercase">Economy</div>
                      <div className={cn("font-mono tabular text-[1rem] mt-0.5", tone(econScore))}>
                        {econScore !== null ? econScore.toFixed(1) : "—"}
                      </div>
                      <div className="text-[0.625rem] text-ink-muted mt-0.5">
                        {customSeats.economy} seats
                      </div>
                    </div>
                    <div className="rounded bg-surface-2 p-2 text-center">
                      <div className="text-ink-muted text-[0.625rem] uppercase">Business</div>
                      <div className={cn("font-mono tabular text-[1rem] mt-0.5", tone(busScore))}>
                        {busScore !== null ? busScore.toFixed(1) : "—"}
                      </div>
                      <div className="text-[0.625rem] text-ink-muted mt-0.5">
                        {customSeats.business} seats
                      </div>
                    </div>
                    <div className="rounded bg-surface-2 p-2 text-center">
                      <div className="text-ink-muted text-[0.625rem] uppercase">First</div>
                      <div className={cn("font-mono tabular text-[1rem] mt-0.5", tone(firstScore))}>
                        {firstScore !== null ? firstScore.toFixed(1) : "—"}
                      </div>
                      <div className="text-[0.625rem] text-ink-muted mt-0.5">
                        {customSeats.first} seats
                      </div>
                    </div>
                  </div>
                  <p className="text-[0.6875rem] text-ink-muted mt-2 leading-snug">
                    Premium cabins lean on Brand and Loyalty more than price; Economy
                    is price-sensitive. Boost Brand to grow First/Business yields,
                    sharpen pricing to grow Economy load.
                  </p>
                </div>
              );
            })()}
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
          <div className="flex items-baseline justify-between border-t border-line pt-2 mt-2">
            <span className="font-semibold text-ink uppercase text-[0.75rem] tracking-wider">
              Total {acquisitionType === "buy" ? "purchase" : "first-quarter"}
            </span>
            <span className="font-mono tabular text-ink text-[1.25rem] font-bold">
              {fmtMoney(totalCost)}
            </span>
          </div>
        </div>
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={handleOrder}>
          Order {quantity} → {fmtMoney(totalCost)}
        </Button>
      </ModalFooter>
    </Modal>
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

function EngineOption({
  active, label, detail, cost, onClick,
}: {
  kind: EngineKind;
  active: boolean;
  label: string;
  detail: string;
  cost: number;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-3 py-2.5 text-left transition-colors",
        active
          ? "border-primary bg-[rgba(20,53,94,0.04)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 mb-0.5">
        <span className="font-medium text-ink text-[0.8125rem]">{label}</span>
        <span className="text-[0.75rem] tabular font-mono text-ink-2">
          {cost === 0 ? "free" : `+${fmtMoney(cost)}`}
        </span>
      </div>
      <div className="text-[0.6875rem] text-ink-muted">{detail}</div>
    </button>
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
