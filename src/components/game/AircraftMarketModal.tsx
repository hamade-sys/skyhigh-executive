"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Modal, ModalBody, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { planeImagePath } from "@/lib/aircraft-images";
import { fmtMoney } from "@/lib/format";
import { cn } from "@/lib/cn";
import { Plane } from "lucide-react";
import type { AircraftSpec, SecondHandListing } from "@/types/game";

interface Props {
  open: boolean;
  onClose: () => void;
  currentQuarter: number;
  marketQuery: string;
  setMarketQuery: (s: string) => void;
  secondHandListings: SecondHandListing[];
  onOrder: (specId: string, type: "buy" | "lease") => void;
  onBuySecondHand: (listingId: string) => void;
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
                onClick={() => setTab(t.id)}
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
                onClick={() => setSubfamily("passenger")}
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
                onClick={() => setSubfamily("cargo")}
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
                  onBuy={() => onOrder(a.id, "buy")}
                  onLease={() => onOrder(a.id, "lease")}
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

function AircraftRow({ spec, onBuy, onLease }: { spec: AircraftSpec; onBuy: () => void; onLease: () => void }) {
  const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
  const imgSrc = planeImagePath(spec.id);
  return (
    <div className="rounded-md border border-line p-3 flex items-start gap-3 hover:bg-surface-hover">
      {/* 3-view illustration. Falls back to a generic plane icon if no
          image is mapped for this spec (kept lazy-loaded so the market
          list scrolls smoothly on slow connections). */}
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
        {spec.note && <p className="text-[0.8125rem] text-ink-2 mt-1 italic">{spec.note}</p>}
      </div>
      <div className="flex flex-col gap-1.5 shrink-0">
        <Button size="sm" variant="primary" onClick={onBuy}>
          Buy {fmtMoney(spec.buyPriceUsd)}
        </Button>
        <Button size="sm" variant="secondary" onClick={onLease}>
          Lease {fmtMoney(spec.leasePerQuarterUsd)}/Q
        </Button>
      </div>
    </div>
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
