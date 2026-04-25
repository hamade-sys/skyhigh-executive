"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Modal, ModalBody, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { planeImagePath } from "@/lib/aircraft-images";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Plane, ChevronDown, ChevronUp } from "lucide-react";
import type { AircraftSpec, SecondHandListing } from "@/types/game";

type EngineKind = "none" | "fuel" | "power" | "super";

/** Optional initial values passed to the next-screen PurchaseOrderModal. */
export interface OrderPrefill {
  quantity?: number;
  engineUpgrade?: "fuel" | "power" | "super" | null;
  fuselageUpgrade?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  currentQuarter: number;
  marketQuery: string;
  setMarketQuery: (s: string) => void;
  secondHandListings: SecondHandListing[];
  onOrder: (specId: string, type: "buy" | "lease", prefill?: OrderPrefill) => void;
  onBuySecondHand: (listingId: string) => void;
}

/** Engine retrofit pricing — same formula used by PurchaseOrderModal. The
 *  market card duplicates it so the player can see the live total before
 *  advancing to the next screen. */
function engineCost(specPrice: number, kind: "fuel" | "power" | "super"): number {
  const pct = kind === "super" ? 0.20 : 0.10;
  return Math.max(2_000_000, Math.round(specPrice * pct));
}
function fuselageCost(specPrice: number): number {
  return Math.max(2_000_000, Math.round(specPrice * 0.10));
}

type Tab = "boeing" | "airbus" | "secondary";
type Subfamily = "passenger" | "cargo";

/**
 * Aircraft market — restructured per PRD update.
 *
 * Tab strip:
 *  - Boeing  (primary tab — passenger and cargo sub-tabs inside)
 *  - Airbus
 *  - Secondary market (every listed used aircraft, regardless of brand)
 *
 * Within each manufacturer tab, aircraft are split by Passenger / Cargo,
 * sorted by family (737, 747, 757, 767, 777, 787 for Boeing; A220, A319,
 * A320, A321, A330, A350, A380 for Airbus) then by variant within a family.
 */
export function AircraftMarketModal({
  open, onClose, currentQuarter, marketQuery, setMarketQuery,
  secondHandListings, onOrder, onBuySecondHand,
}: Props) {
  const [tab, setTab] = useState<Tab>("boeing");
  const [subfamily, setSubfamily] = useState<Subfamily>("passenger");
  /** Spec id of the card the player has expanded. Click another card to
   *  flip the expansion; click the same card to collapse. Only one card
   *  at a time so the modal scroll doesn't get unwieldy. */
  const [expandedSpecId, setExpandedSpecId] = useState<string | null>(null);

  // Reset the expansion when the player switches Boeing↔Airbus or
  // Passenger↔Cargo so a previously-expanded spec doesn't stay open in
  // a tab where it no longer appears.
  function changeTab(next: Tab) {
    setTab(next);
    setExpandedSpecId(null);
  }
  function changeSubfamily(next: Subfamily) {
    setSubfamily(next);
    setExpandedSpecId(null);
  }

  /** Bucket every aircraft into Boeing / Airbus by name prefix. */
  const buckets = useMemo(() => {
    const boeing: AircraftSpec[] = [];
    const airbus: AircraftSpec[] = [];
    for (const a of AIRCRAFT) {
      if (a.unlockQuarter > currentQuarter) continue;
      const isBoeing =
        /^B7\d{2}/.test(a.id) || /^Boeing/i.test(a.name);
      const isAirbus = /^A\d{3}/.test(a.id) || /^Airbus/i.test(a.name);
      if (isBoeing) boeing.push(a);
      else if (isAirbus) airbus.push(a);
      else boeing.push(a);  // unknown brand → bucket with Boeing as fallback
    }
    // Sort by family (e.g. 737 before 747) then by variant.
    const variantOrder = (id: string): [number, string] => {
      const m = id.match(/(\d{3})/);
      const fam = m ? parseInt(m[1], 10) : 999;
      return [fam, id];
    };
    boeing.sort((a, b) => {
      const [af, av] = variantOrder(a.id);
      const [bf, bv] = variantOrder(b.id);
      return af - bf || av.localeCompare(bv);
    });
    airbus.sort((a, b) => {
      const [af, av] = variantOrder(a.id);
      const [bf, bv] = variantOrder(b.id);
      return af - bf || av.localeCompare(bv);
    });
    return { boeing, airbus };
  }, [currentQuarter]);

  const list = (tab === "boeing" ? buckets.boeing : tab === "airbus" ? buckets.airbus : [])
    .filter((a) => a.family === subfamily)
    .filter((a) => {
      if (!marketQuery) return true;
      const q = marketQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q);
    });

  const tabs: Array<{ id: Tab; label: string; count: number }> = [
    { id: "boeing", label: "Boeing", count: buckets.boeing.length },
    { id: "airbus", label: "Airbus", count: buckets.airbus.length },
    { id: "secondary", label: "Secondary market", count: secondHandListings.length },
  ];

  return (
    <Modal open={open} onClose={onClose} className="w-[min(900px,calc(100vw-3rem))]">
      <ModalHeader>
        <h2 className="font-display text-[1.5rem] text-ink">Aircraft market</h2>
        <p className="text-ink-muted text-[0.8125rem] mt-1">
          New-build orders by manufacturer, plus a secondary market for used aircraft.
        </p>

        {/* Tab strip — manufacturer + secondary */}
        <nav className="mt-3 flex items-center gap-1 border-b border-line -mb-3">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => changeTab(t.id)}
                className={cn(
                  "px-3 py-2 text-[0.8125rem] font-medium border-b-2 -mb-px transition-colors",
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-ink-muted hover:text-ink",
                )}
              >
                {t.label}
                <span className={cn(
                  "ml-1.5 text-[0.6875rem] tabular font-mono",
                  active ? "text-primary" : "text-ink-muted",
                )}>
                  {t.count}
                </span>
              </button>
            );
          })}
        </nav>
      </ModalHeader>

      <ModalBody className="max-h-[34rem] overflow-auto space-y-3">
        {tab !== "secondary" && (
          <>
            {/* Pax / Cargo sub-tab inside manufacturer */}
            <div className="flex items-center gap-1 rounded-md border border-line p-0.5 w-fit">
              <button
                onClick={() => changeSubfamily("passenger")}
                className={cn(
                  "px-3 py-1 text-[0.75rem] rounded-sm",
                  subfamily === "passenger"
                    ? "bg-primary text-primary-fg font-medium"
                    : "text-ink-2 hover:bg-surface-hover",
                )}
              >
                Passenger
              </button>
              <button
                onClick={() => changeSubfamily("cargo")}
                className={cn(
                  "px-3 py-1 text-[0.75rem] rounded-sm",
                  subfamily === "cargo"
                    ? "bg-primary text-primary-fg font-medium"
                    : "text-ink-2 hover:bg-surface-hover",
                )}
              >
                Cargo
              </button>
            </div>

            <Input
              placeholder="Search by name or model code…"
              value={marketQuery}
              onChange={(e) => setMarketQuery(e.target.value)}
            />

            {list.length === 0 ? (
              <div className="text-[0.8125rem] text-ink-muted italic py-6 text-center">
                No {subfamily} aircraft from {tab === "boeing" ? "Boeing" : "Airbus"} unlocked yet.
                More variants unlock later in the simulation.
              </div>
            ) : (
              list.map((a) => (
                <AircraftRow
                  key={a.id}
                  spec={a}
                  expanded={expandedSpecId === a.id}
                  onToggleExpand={() =>
                    setExpandedSpecId((cur) => (cur === a.id ? null : a.id))
                  }
                  onOrder={(type, prefill) => onOrder(a.id, type, prefill)}
                />
              ))
            )}
          </>
        )}

        {tab === "secondary" && (
          <SecondaryMarket
            listings={secondHandListings}
            onBuy={onBuySecondHand}
            currentQuarter={currentQuarter}
          />
        )}
      </ModalBody>
    </Modal>
  );
}

function AircraftRow({
  spec, expanded, onToggleExpand, onOrder,
}: {
  spec: AircraftSpec;
  expanded: boolean;
  onToggleExpand: () => void;
  onOrder: (type: "buy" | "lease", prefill?: OrderPrefill) => void;
}) {
  const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
  const imgSrc = planeImagePath(spec.id);

  return (
    <div
      className={cn(
        "rounded-md border bg-surface transition-all",
        expanded
          ? "border-primary shadow-[var(--shadow-1)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      {/* Collapsed-row header — always visible, click anywhere on it to
          toggle the expanded body below. The Lease button is exposed
          here as a one-click default-config purchase so light-touch
          players don't have to expand to lease. */}
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <div className="shrink-0 w-28 h-20 rounded-md bg-surface-2/50 border border-line/60 flex items-center justify-center overflow-hidden">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={`${spec.name} 3-view illustration`}
              loading="lazy"
              className="max-w-full max-h-full object-contain p-1"
            />
          ) : (
            <Plane size={28} className="text-ink-muted" strokeWidth={1.25} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-ink text-[0.9375rem]">{spec.name}</span>
            <Badge tone={spec.family === "cargo" ? "warning" : "neutral"}>
              {spec.family}
            </Badge>
            <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-mono">
              {spec.id}
            </span>
          </div>
          <div className="text-[0.75rem] text-ink-muted mt-0.5 font-mono tabular">
            {spec.family === "passenger"
              ? `${seats} seats (${spec.seats.first}F/${spec.seats.business}C/${spec.seats.economy}Y)`
              : `${spec.cargoTonnes ?? 0}T cargo`}
            {" · "}{spec.rangeKm.toLocaleString()} km · {spec.fuelBurnPerKm} L/km
          </div>
          {spec.note && !expanded && (
            <p className="text-[0.8125rem] text-ink-2 mt-1 italic line-clamp-1">
              {spec.note}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="tabular font-mono text-[0.875rem] font-semibold text-ink">
            {fmtMoney(spec.buyPriceUsd)}
          </span>
          <span className="text-[0.6875rem] tabular text-ink-muted">
            or {fmtMoney(spec.leasePerQuarterUsd)}/Q lease
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-accent font-semibold">
            {expanded ? "Hide" : "Configure"}
            {expanded
              ? <ChevronUp size={12} />
              : <ChevronDown size={12} />}
          </span>
        </div>
      </button>

      {expanded && <ExpandedConfigurator spec={spec} onOrder={onOrder} />}
    </div>
  );
}

/** Inline configurator that opens beneath an aircraft row. The player
 *  picks quantity + engine + fuselage here; clicking Buy / Lease
 *  forwards those values as a prefill to PurchaseOrderModal which
 *  handles seat-class allocation and final confirmation. */
function ExpandedConfigurator({
  spec, onOrder,
}: {
  spec: AircraftSpec;
  onOrder: (type: "buy" | "lease", prefill?: OrderPrefill) => void;
}) {
  const imgSrc = planeImagePath(spec.id);
  const [quantity, setQuantity] = useState(1);
  const [engine, setEngine] = useState<EngineKind>("none");
  const [fuselage, setFuselage] = useState(false);

  const fuelUpgradeCost = engineCost(spec.buyPriceUsd, "fuel");
  const powerUpgradeCost = engineCost(spec.buyPriceUsd, "power");
  const superUpgradeCost = engineCost(spec.buyPriceUsd, "super");
  const fuselageUpgradeCost = fuselageCost(spec.buyPriceUsd);
  const selectedEngineCost =
    engine === "fuel" ? fuelUpgradeCost :
    engine === "power" ? powerUpgradeCost :
    engine === "super" ? superUpgradeCost : 0;
  const upgradePerPlane = selectedEngineCost + (fuselage ? fuselageUpgradeCost : 0);
  const buyPerPlane = spec.buyPriceUsd + upgradePerPlane;
  const leasePerPlanePerQ = spec.leasePerQuarterUsd; // upgrades belong to airframe; lease is for hull only
  const buyTotal = buyPerPlane * quantity;
  const leaseTotal = leasePerPlanePerQ * quantity;

  function go(type: "buy" | "lease") {
    onOrder(type, {
      quantity,
      engineUpgrade: engine === "none" ? null : engine,
      fuselageUpgrade: fuselage,
    });
  }

  return (
    <div className="border-t border-line bg-surface-2/30 px-4 pt-3 pb-4 space-y-3">
      {/* Hero photo across the card */}
      <div className="rounded-md bg-surface border border-line/60 h-44 sm:h-52 flex items-center justify-center overflow-hidden">
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imgSrc}
            alt={`${spec.name} 3-view illustration`}
            className="max-w-full max-h-full object-contain p-3"
          />
        ) : (
          <Plane size={64} className="text-ink-muted" strokeWidth={1.0} />
        )}
      </div>

      {/* Spec readout — slightly more detailed than the collapsed row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.75rem]">
        <Stat label="Range" value={`${spec.rangeKm.toLocaleString()} km`} />
        <Stat label="Fuel burn" value={`${spec.fuelBurnPerKm} L/km`} />
        <Stat
          label={spec.family === "passenger" ? "Default seats" : "Cargo"}
          value={
            spec.family === "passenger"
              ? `${spec.seats.first}F/${spec.seats.business}C/${spec.seats.economy}Y`
              : `${spec.cargoTonnes ?? 0}T`
          }
        />
        <Stat label="List price" value={fmtMoney(spec.buyPriceUsd)} />
      </div>

      {spec.note && (
        <p className="text-[0.8125rem] text-ink-2 italic leading-relaxed">
          {spec.note}
        </p>
      )}

      {/* Quantity */}
      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Quantity
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
            disabled={quantity <= 1}
            className="w-8 h-8 rounded-md border border-line hover:bg-surface-hover text-[1rem] font-semibold disabled:opacity-40"
          >
            −
          </button>
          <span className="tabular font-mono text-[1.25rem] text-ink font-bold w-12 text-center">
            {quantity}
          </span>
          <button
            onClick={() => setQuantity(Math.min(20, quantity + 1))}
            disabled={quantity >= 20}
            className="w-8 h-8 rounded-md border border-line hover:bg-surface-hover text-[1rem] font-semibold disabled:opacity-40"
          >
            +
          </button>
          <span className="text-[0.75rem] text-ink-muted">Max 20 per order.</span>
        </div>
      </div>

      {/* Engine retrofit */}
      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Engine retrofit (per aircraft)
        </div>
        <div className="grid grid-cols-2 gap-2">
          <UpgradePick
            active={engine === "none"} title="Stock engine"
            sub="No retrofit" cost={0}
            onClick={() => setEngine("none")}
          />
          <UpgradePick
            active={engine === "fuel"} title="Fuel-efficient"
            sub="+10% range, −10% fuel burn" cost={fuelUpgradeCost}
            onClick={() => setEngine("fuel")}
          />
          <UpgradePick
            active={engine === "power"} title="Power-up"
            sub="+10% speed → tighter schedule" cost={powerUpgradeCost}
            onClick={() => setEngine("power")}
          />
          <UpgradePick
            active={engine === "super"} title="Super (fuel + power)"
            sub="Both effects combined" cost={superUpgradeCost}
            onClick={() => setEngine("super")}
          />
        </div>
      </div>

      {/* Fuselage coating */}
      <div>
        <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
          Fuselage coating
        </div>
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
      </div>

      {/* Live totals + advance buttons */}
      <div className="rounded-md border border-line bg-surface px-3 py-2.5 flex items-center justify-between gap-3">
        <div className="text-[0.75rem] text-ink-muted leading-tight">
          <div>
            Buy total{" "}
            <span className="text-ink font-mono font-semibold">{fmtMoney(buyTotal)}</span>
            {quantity > 1 && (
              <span className="text-ink-muted">
                {" "}({fmtMoney(buyPerPlane)} × {quantity})
              </span>
            )}
          </div>
          <div className="mt-0.5">
            Lease total{" "}
            <span className="text-ink font-mono font-semibold">{fmtMoney(leaseTotal)}/Q</span>
            <span className="text-ink-muted"> · seat config on next screen</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <Button size="sm" variant="primary" onClick={() => go("buy")}>
            Buy →
          </Button>
          <Button size="sm" variant="secondary" onClick={() => go("lease")}>
            Lease →
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-surface border border-line/60 px-2.5 py-1.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="font-mono tabular text-[0.8125rem] text-ink mt-0.5">
        {value}
      </div>
    </div>
  );
}

function UpgradePick({
  active, title, sub, cost, onClick,
}: {
  active: boolean;
  title: string;
  sub: string;
  cost: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border text-left px-3 py-2 transition-colors",
        active
          ? "border-primary bg-[rgba(20,53,94,0.04)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium text-ink text-[0.8125rem]">{title}</span>
        <span className="tabular font-mono text-[0.75rem] text-ink-2">
          {cost === 0 ? "Free" : `+${fmtMoney(cost)}`}
        </span>
      </div>
      <div className="text-[0.6875rem] text-ink-muted mt-0.5 leading-snug">
        {sub}
      </div>
    </button>
  );
}

function SecondaryMarket({
  listings, onBuy, currentQuarter,
}: {
  listings: SecondHandListing[];
  onBuy: (id: string) => void;
  currentQuarter: number;
}) {
  if (listings.length === 0) {
    return (
      <div className="text-[0.8125rem] text-ink-muted italic py-8 text-center">
        No used aircraft on the market right now. Check back next quarter —
        retired or decommissioned aircraft from other airlines surface here.
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <p className="text-[0.75rem] text-ink-muted leading-relaxed">
        Pre-owned aircraft listed by other airlines or by retiring carriers.
        Cheaper than new-build but with less remaining lifespan.
      </p>
      {listings.map((l) => {
        const spec = AIRCRAFT_BY_ID[l.specId];
        if (!spec) return null;
        const ageQ = currentQuarter - l.manufactureQuarter;
        const remainingQ = Math.max(0, l.retirementQuarter - currentQuarter);
        const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
        return (
          <div
            key={l.id}
            className="rounded-md border border-line p-3 flex items-start gap-3 hover:bg-surface-hover bg-surface-2/30"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-ink text-[0.9375rem]">{spec.name}</span>
                <Badge tone="warning">used</Badge>
                {l.ecoUpgrade && <Badge tone="positive">eco</Badge>}
                <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-mono">
                  {spec.id}
                </span>
              </div>
              <div className="text-[0.75rem] text-ink-muted mt-0.5 font-mono tabular">
                {spec.family === "passenger" ? `${seats} seats` : `${spec.cargoTonnes ?? 0}T cargo`}
                {" · "}{spec.rangeKm.toLocaleString()} km
                {" · "}{ageQ}Q age · {remainingQ}Q remaining
              </div>
              <div className="text-[0.6875rem] text-ink-muted mt-1">
                Listed by {l.sellerTeamId === "admin" ? "auctioneer" : "rival airline"}
              </div>
            </div>
            <div className="shrink-0">
              <Button size="sm" variant="primary" onClick={() => onBuy(l.id)}>
                Buy {fmtMoney(l.askingPriceUsd)}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
