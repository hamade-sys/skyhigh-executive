"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { AIRCRAFT, AIRCRAFT_BY_ID } from "@/data/aircraft";
import { planeImagePath } from "@/lib/aircraft-images";
import { fmtMoney, fmtAgeYQ, fmtQuarter } from "@/lib/format";
import {
  effectiveProductionCap,
  isAnnouncementOpen,
  isReleased,
} from "@/lib/pre-orders";
import { useGame, selectPlayer } from "@/store/game";
import { cn } from "@/lib/cn";
import { Plane, ChevronDown, ChevronUp, GitCompare, X } from "lucide-react";
import type { AircraftSpec, SecondHandListing } from "@/types/game";
import { AircraftCompareModal } from "@/components/game/AircraftCompareModal";
import {
  leaseEligibleSpecIds,
  LEASE_DEPOSIT_PCT,
  LEASE_PER_QUARTER_PCT,
  LEASE_TERM_QUARTERS,
  LEASE_BUYOUT_RESIDUAL_PCT,
  LEASE_ELIGIBLE_PASSENGER_TOP_N,
  LEASE_ELIGIBLE_CARGO_TOP_N,
} from "@/lib/lease";

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

type ManufacturerTab =
  | "boeing"
  | "airbus"
  | "embraer"
  | "atr"
  | "comac"
  | "bombardier"
  | "other";
type Tab = ManufacturerTab | "secondary" | "lease";
type Subfamily = "passenger" | "cargo";

/** Detect the manufacturer for a given aircraft spec from its id/name.
 *  Falls back to "other" when no rule matches — better than silently
 *  filing a Bombardier under Boeing the way the previous version did. */
function detectManufacturer(spec: { id: string; name: string }): ManufacturerTab {
  const id = spec.id;
  const name = spec.name;
  // Boeing: B-prefixed ids ("B737-700", "B777-200ER") or "Boeing …"
  if (/^B7\d{2}/.test(id) || /^Boeing/i.test(name)) return "boeing";
  // Airbus: A-prefixed ids ("A320", "A350-1000") or "Airbus …".
  // Important: this must be checked BEFORE the COMAC `^C\d{3}` pattern.
  if (/^A\d{3}/.test(id) || /^Airbus/i.test(name)) return "airbus";
  // Embraer: E170/E175/E190/E195 (incl. E2 variants), ERJ-x.
  if (/^E\d{3}/.test(id) || /^ERJ/.test(id) || /^Embraer/i.test(name)) return "embraer";
  // ATR: id starts with "ATR" (with or without space/dash).
  if (/^ATR/i.test(id) || /^ATR/i.test(name)) return "atr";
  // Bombardier: CRJ-* and Dash-* (Q400 etc).
  if (/^CRJ/.test(id) || /^Dash/i.test(id) || /Bombardier/i.test(name)) return "bombardier";
  // COMAC: ARJ21, C919.
  if (/^ARJ/.test(id) || /^C9\d{2}/.test(id) || /COMAC/i.test(name)) return "comac";
  return "other";
}

const MANUFACTURER_LABELS: Record<ManufacturerTab, string> = {
  boeing: "Boeing",
  airbus: "Airbus",
  embraer: "Embraer",
  atr: "ATR",
  bombardier: "Bombardier",
  comac: "COMAC",
  other: "Other",
};

/**
 * Aircraft market.
 *
 * Tab strip (top-left):
 *  - Boeing · Airbus · Embraer · ATR · Bombardier · COMAC · (Other)
 *  - Each tab has Passenger/Cargo sub-tabs inside.
 *
 * Top-right: separate "Secondary market" pill toggle. Splitting it from
 * the manufacturer tabs prevents the brand list from being shoved off
 * the row, and makes it visually clear that secondary is a different
 * mode of acquisition (used vs new-build).
 *
 * Within each manufacturer, aircraft are sorted by family (e.g. 737
 * before 747) then by variant within a family.
 */
export function AircraftMarketModal({
  open, onClose, currentQuarter, marketQuery, setMarketQuery,
  secondHandListings, onOrder, onBuySecondHand,
}: Props) {
  const [tab, setTab] = useState<Tab>("boeing");
  const [subfamily, setSubfamily] = useState<Subfamily>("passenger");
  /** Quick capacity filter for the passenger sub-tab. Range filters
   *  let the player narrow to "thin-route fleet" / "long-haul wides"
   *  without scrolling through 40+ cards. */
  type RangeBucket = "all" | "regional" | "narrow" | "wide";
  type DistanceBucket = "any-range" | "short" | "medium" | "long";
  const [rangeBucket, setRangeBucket] = useState<RangeBucket>("all");
  const [distanceBucket, setDistanceBucket] = useState<DistanceBucket>("any-range");
  /** Spec id of the card the player has expanded. Click another card to
   *  flip the expansion; click the same card to collapse. Only one card
   *  at a time so the modal scroll doesn't get unwieldy. */
  const [expandedSpecId, setExpandedSpecId] = useState<string | null>(null);

  /** Compare-mode: when active, each AircraftRow gets a checkbox.
   *  Up to 4 specs can be selected; a sticky footer surfaces a
   *  "Compare N →" CTA that opens AircraftCompareModal for
   *  side-by-side review. */
  const [compareMode, setCompareMode] = useState(false);
  const [compareSpecIds, setCompareSpecIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  function toggleCompare(specId: string) {
    setCompareSpecIds((cur) => {
      if (cur.includes(specId)) return cur.filter((x) => x !== specId);
      // Cap at 4 — past that the cells get cramped and the value drops.
      if (cur.length >= 4) return cur;
      return [...cur, specId];
    });
  }
  const compareSpecs = compareSpecIds
    .map((id) => AIRCRAFT_BY_ID[id])
    .filter((s): s is AircraftSpec => !!s);

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

  /** Bucket every available aircraft by manufacturer. Each bucket sorts
   *  by family (737 before 747) then by variant id. */
  const buckets = useMemo(() => {
    const out: Record<ManufacturerTab, AircraftSpec[]> = {
      boeing: [], airbus: [], embraer: [], atr: [],
      bombardier: [], comac: [], other: [],
    };
    for (const a of AIRCRAFT) {
      // Pre-orders open 2 quarters before unlock (announcement window).
      // Hide specs that haven't even been announced yet.
      const announcedAt = a.unlockQuarter - 2;
      if (announcedAt > currentQuarter) continue;
      // Discontinuation filter (Update 4): once cutoffRound is reached
      // the spec disappears from the New-Build market. Existing fleet
      // keeps flying and the secondary-market tab is unaffected.
      if (typeof a.cutoffRound === "number" && currentQuarter > a.cutoffRound) continue;
      out[detectManufacturer(a)].push(a);
    }
    const variantOrder = (id: string): [number, string] => {
      const m = id.match(/(\d{3})/);
      const fam = m ? parseInt(m[1], 10) : 999;
      return [fam, id];
    };
    for (const k of Object.keys(out) as ManufacturerTab[]) {
      out[k].sort((a, b) => {
        const [af, av] = variantOrder(a.id);
        const [bf, bv] = variantOrder(b.id);
        return af - bf || av.localeCompare(bv);
      });
    }
    return out;
  }, [currentQuarter]);

  /** Manufacturer tabs always render in the same order. Hide brands
   *  that have ZERO aircraft unlocked yet (e.g. COMAC pre-R40), but
   *  always show the major three (Boeing/Airbus/Embraer) so the tab
   *  strip is stable as the campaign progresses. */
  const manufacturerOrder: ManufacturerTab[] = [
    "boeing", "airbus", "embraer", "atr", "bombardier", "comac", "other",
  ];
  const visibleTabs = manufacturerOrder.filter((m) =>
    m === "boeing" || m === "airbus" || m === "embraer" || buckets[m].length > 0
  );

  const list = (tab === "secondary" ? [] : (buckets[tab as ManufacturerTab] ?? []))
    .filter((a) => a.family === subfamily)
    .filter((a) => {
      if (!marketQuery) return true;
      const q = marketQuery.toLowerCase();
      return a.name.toLowerCase().includes(q) ||
        a.id.toLowerCase().includes(q);
    })
    .filter((a) => {
      // Capacity bucket — only relevant on the passenger sub-tab.
      if (a.family !== "passenger" || rangeBucket === "all") return true;
      const seats = a.seats.first + a.seats.business + a.seats.economy;
      if (rangeBucket === "regional" && seats >= 100) return false;
      if (rangeBucket === "narrow" && (seats < 100 || seats > 250)) return false;
      if (rangeBucket === "wide" && seats <= 250) return false;
      return true;
    })
    .filter((a) => {
      if (distanceBucket === "any-range") return true;
      if (distanceBucket === "short" && a.rangeKm >= 4500) return false;
      if (distanceBucket === "medium" && (a.rangeKm < 4500 || a.rangeKm >= 9500)) return false;
      if (distanceBucket === "long" && a.rangeKm < 9500) return false;
      return true;
    });

  return (
    <Modal open={open} onClose={onClose} className="w-[min(900px,calc(100vw-3rem))]">
      <ModalHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h2 className="font-display text-[1.5rem] text-ink">Aircraft market</h2>
            <p className="text-ink-muted text-[0.8125rem] mt-1">
              New-build orders by manufacturer, plus a secondary market for used aircraft.
            </p>
          </div>
          {/* Compare + lease + secondary toggles pinned top-right.
              Compare is a modal-stay action (tick boxes inline); the
              lease and secondary toggles swap the entire list to a
              specialised view. */}
          <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
            {tab !== "secondary" && tab !== "lease" && (
              <button
                onClick={() => {
                  setCompareMode((on) => !on);
                  if (compareMode) setCompareSpecIds([]); // clear on exit
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-[0.75rem] font-medium border transition-colors flex items-center gap-1.5",
                  compareMode
                    ? "border-accent text-accent bg-[var(--accent-soft)]"
                    : "border-line text-ink-muted hover:bg-surface-hover",
                )}
                aria-pressed={compareMode}
                title="Pick 2-4 aircraft to view a side-by-side spec sheet"
              >
                <GitCompare size={13} />
                {compareMode ? "Exit compare" : "Compare"}
                {compareMode && compareSpecIds.length > 0 && (
                  <span className="text-[0.6875rem] tabular font-mono">
                    {compareSpecIds.length}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => changeTab(tab === "lease" ? "boeing" : "lease")}
              className={cn(
                "rounded-md px-3 py-1.5 text-[0.75rem] font-medium border transition-colors flex items-center gap-1.5",
                tab === "lease"
                  ? "border-accent text-accent bg-[var(--accent-soft)]"
                  : "border-line text-ink-muted hover:bg-surface-hover",
              )}
              title="Lease aircraft from a third-party lessor — top-stock specs only"
            >
              Lease
              <span className="text-[0.6875rem] tabular font-mono opacity-80">
                {LEASE_ELIGIBLE_PASSENGER_TOP_N + LEASE_ELIGIBLE_CARGO_TOP_N}
              </span>
            </button>
            <button
              onClick={() => changeTab(tab === "secondary" ? "boeing" : "secondary")}
              className={cn(
                "rounded-md px-3 py-1.5 text-[0.75rem] font-medium border transition-colors flex items-center gap-1.5",
                tab === "secondary"
                  ? "border-accent text-accent bg-[var(--accent-soft)]"
                  : "border-line text-ink-muted hover:bg-surface-hover",
              )}
            >
              Secondary market
              <span className="text-[0.6875rem] tabular font-mono opacity-80">
                {secondHandListings.length}
              </span>
            </button>
          </div>
        </div>

        {/* Manufacturer tab strip — only shown when on a manufacturer
            tab (i.e. not lease, not secondary). */}
        {tab !== "secondary" && tab !== "lease" && (
          <nav className="mt-3 flex items-center gap-1 border-b border-line -mb-3 overflow-x-auto">
            {visibleTabs.map((m) => {
              const active = tab === m;
              const count = buckets[m].length;
              return (
                <button
                  key={m}
                  onClick={() => changeTab(m)}
                  className={cn(
                    "shrink-0 px-3 py-2 text-[0.8125rem] font-medium border-b-2 -mb-px transition-colors",
                    active
                      ? "border-primary text-primary"
                      : "border-transparent text-ink-muted hover:text-ink",
                  )}
                >
                  {MANUFACTURER_LABELS[m]}
                  <span className={cn(
                    "ml-1.5 text-[0.6875rem] tabular font-mono",
                    active ? "text-primary" : "text-ink-muted",
                  )}>
                    {count}
                  </span>
                </button>
              );
            })}
          </nav>
        )}
      </ModalHeader>

      <ModalBody className="max-h-[34rem] overflow-auto space-y-3">
        {tab !== "secondary" && tab !== "lease" && (
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

            {/* Capacity + range filter chips — only meaningful on the
                passenger sub-tab. Keeps the cargo list uncluttered. */}
            {subfamily === "passenger" && (
              <div className="flex items-center gap-1.5 flex-wrap text-[0.75rem]">
                <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted">Capacity</span>
                {([
                  { k: "all", label: "All" },
                  { k: "regional", label: "Regional <100" },
                  { k: "narrow", label: "Narrow 100-250" },
                  { k: "wide", label: "Wide 250+" },
                ] as Array<{ k: RangeBucket; label: string }>).map(({ k, label }) => (
                  <button
                    key={k}
                    onClick={() => setRangeBucket(k)}
                    className={cn(
                      "px-2 py-0.5 rounded-md border transition-colors",
                      rangeBucket === k
                        ? "bg-primary text-primary-fg border-primary font-medium"
                        : "border-line text-ink-muted hover:bg-surface-hover",
                    )}
                  >
                    {label}
                  </button>
                ))}
                <span className="text-[0.625rem] uppercase tracking-wider text-ink-muted ml-2">Range</span>
                {([
                  { k: "any-range", label: "Any" },
                  { k: "short", label: "<4,500 km" },
                  { k: "medium", label: "4.5-9.5K km" },
                  { k: "long", label: "9,500+ km" },
                ] as Array<{ k: DistanceBucket; label: string }>).map(({ k, label }) => (
                  <button
                    key={k}
                    onClick={() => setDistanceBucket(k)}
                    className={cn(
                      "px-2 py-0.5 rounded-md border transition-colors",
                      distanceBucket === k
                        ? "bg-accent text-white border-accent font-medium"
                        : "border-line text-ink-muted hover:bg-surface-hover",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}

            {list.length === 0 ? (
              <div className="text-[0.8125rem] text-ink-muted italic py-6 text-center">
                No {subfamily} aircraft from{" "}
                {MANUFACTURER_LABELS[tab as ManufacturerTab]}
                {" "}unlocked yet. More variants unlock later in the simulation.
              </div>
            ) : (
              list.map((a) => (
                <AircraftRow
                  key={a.id}
                  spec={a}
                  currentQuarter={currentQuarter}
                  expanded={expandedSpecId === a.id}
                  onToggleExpand={() =>
                    setExpandedSpecId((cur) => (cur === a.id ? null : a.id))
                  }
                  onOrder={(type, prefill) => onOrder(a.id, type, prefill)}
                  compareMode={compareMode}
                  compareSelected={compareSpecIds.includes(a.id)}
                  onToggleCompare={() => toggleCompare(a.id)}
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

        {tab === "lease" && (
          <LeaseMarket
            currentQuarter={currentQuarter}
            expandedSpecId={expandedSpecId}
            onToggleExpand={(id) =>
              setExpandedSpecId((cur) => (cur === id ? null : id))
            }
            onOrder={(specId, prefill) => onOrder(specId, "lease", prefill)}
          />
        )}

        {/* Sticky compare-bar — sits at the bottom of the scroll region
            when the player has 1+ specs selected. Light enough not to
            compete with content; clear CTA to launch the compare modal. */}
        {compareMode && compareSpecIds.length > 0 && (
          <div className="sticky bottom-0 left-0 right-0 mt-2 -mx-1 rounded-md border border-accent bg-surface/95 backdrop-blur-md shadow-[var(--shadow-3)] p-2 flex items-center gap-2 z-10">
            <span className="text-[0.75rem] text-ink-2 px-1">
              <strong className="text-ink">{compareSpecIds.length}</strong> selected
              {compareSpecIds.length < 2 && (
                <span className="text-ink-muted ml-1">· pick at least 2 to compare</span>
              )}
              {compareSpecIds.length >= 4 && (
                <span className="text-ink-muted ml-1">· max 4</span>
              )}
            </span>
            <div className="flex-1 flex items-center gap-1 flex-wrap">
              {compareSpecs.map((s) => (
                <span
                  key={s.id}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--accent-soft)] text-accent px-2 py-0.5 text-[0.6875rem] font-medium"
                >
                  {s.name}
                  <button
                    onClick={() => toggleCompare(s.id)}
                    className="hover:text-ink"
                    aria-label={`Remove ${s.name} from compare`}
                  >
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
            <Button
              size="sm"
              variant="primary"
              onClick={() => setCompareOpen(true)}
              disabled={compareSpecIds.length < 2}
            >
              Compare {compareSpecIds.length} →
            </Button>
          </div>
        )}
      </ModalBody>

      {/* Compare modal — opens on top of this modal. Picking "Configure
          & buy" closes both and routes the player back into the order
          flow for that spec. */}
      <AircraftCompareModal
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        specs={compareSpecs}
        onPick={(specId) => {
          setCompareOpen(false);
          setCompareSpecIds([]);
          setCompareMode(false);
          onOrder(specId, "buy");
        }}
      />
    </Modal>
  );
}

function AircraftRow({
  spec, currentQuarter, expanded, onToggleExpand, onOrder,
  compareMode, compareSelected, onToggleCompare,
}: {
  spec: AircraftSpec;
  currentQuarter: number;
  expanded: boolean;
  onToggleExpand: () => void;
  onOrder: (type: "buy" | "lease", prefill?: OrderPrefill) => void;
  compareMode: boolean;
  compareSelected: boolean;
  onToggleCompare: () => void;
}) {
  const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
  const imgSrc = planeImagePath(spec.id);

  // Inventory + pre-order signals: compute the production cap, the
  // queue depth, and what's still available this round so the player
  // doesn't have to expand the card to find out scarcity. The market
  // modal sees pre-orders + cap overrides directly from the game store.
  const preOrders = useGame((s) => s.preOrders);
  const overrides = useGame((s) => s.productionCapOverrides);
  const cap = effectiveProductionCap(spec, overrides);
  const released = isReleased(spec, currentQuarter);
  const announcementOpen = isAnnouncementOpen(spec, currentQuarter);
  // Queue depth across all teams for this spec.
  const queuedThisSpec = preOrders.filter(
    (o) => o.specId === spec.id && o.status === "queued",
  ).length;
  // Already-delivered this round (counts toward the cap).
  const deliveredThisRound = preOrders.filter(
    (o) => o.specId === spec.id && o.deliveredAtQuarter === currentQuarter,
  ).length;
  const availableNow = released
    ? Math.max(0, cap - deliveredThisRound - queuedThisSpec)
    : 0;
  const isPreOrderOnly = announcementOpen && !released;

  // Count of this spec already in the player's fleet (excluding
  // retired). Surfaced as a badge so the player knows at a glance
  // whether they're scaling an existing fleet line or opening a new
  // type — relevant for fleet-variety maintenance overhead, training,
  // and the Global-Network doctrine penalty.
  const ownedCount = useGame((s) => {
    const player = s.teams.find((t) => t.id === s.playerTeamId);
    if (!player) return 0;
    return player.fleet.filter(
      (f) => f.specId === spec.id && f.status !== "retired",
    ).length;
  });

  return (
    <div
      className={cn(
        "rounded-md border bg-surface transition-all relative",
        expanded
          ? "border-primary shadow-[var(--shadow-1)]"
          : compareSelected
            ? "border-accent ring-1 ring-accent/30"
            : "border-line hover:bg-surface-hover",
      )}
    >
      {/* Compare checkbox — only renders in compare mode. Positioned in
          the top-left so it doesn't get tangled with the row's
          click-to-expand handler. */}
      {compareMode && (
        <label
          className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-md bg-surface/90 backdrop-blur-sm border border-line px-1.5 py-1 cursor-pointer hover:bg-surface text-[0.6875rem]"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={compareSelected}
            onChange={onToggleCompare}
            className="accent-accent w-3 h-3"
            aria-label={`Add ${spec.name} to compare`}
          />
          <span className="text-ink-2 select-none">Compare</span>
        </label>
      )}
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
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-ink text-[0.9375rem]">{spec.name}</span>
            {/* Subtle family marker — small lowercase tag instead of the
                heavier Badge component. The aircraft name already
                conveys whether it's a freighter (e.g. "Boeing 777F"),
                so the tag is just a quick scan signal. */}
            <span
              className={cn(
                "text-[0.5625rem] uppercase tracking-wider font-medium",
                spec.family === "cargo" ? "text-warning" : "text-ink-muted",
              )}
            >
              {spec.family}
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
            list price
          </span>
          {/* Inventory + pre-order signal — visible without expanding.
              Three states:
                Pre-order (announcement window, not yet released)
                Available N · queue M (released, partial inventory)
                Sold out · queue M (released, all this round's slots taken)
              */}
          {/* Owned-count badge — appears whenever the player already
              has at least one of this airframe in their fleet. Helps
              them see whether a click here scales an existing fleet
              line vs. introduces a new aircraft type (which carries
              fleet-variety maintenance + crew training overhead). */}
          {ownedCount > 0 && (
            <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-primary bg-[rgba(20,53,94,0.08)] px-1.5 py-0.5 rounded">
              You own {ownedCount}
            </span>
          )}
          {isPreOrderOnly ? (
            <span className="text-[0.625rem] uppercase tracking-wider font-semibold text-accent bg-[var(--accent-soft)] px-1.5 py-0.5 rounded">
              Pre-order · unlocks {fmtQuarter(spec.unlockQuarter)}
            </span>
          ) : released && (
            <span className={cn(
              "text-[0.625rem] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded",
              availableNow > 0
                ? "text-positive bg-[var(--positive-soft)]"
                : "text-warning bg-[var(--warning-soft)]",
            )}>
              {availableNow > 0
                ? `${availableNow} avail · ${cap}/Q cap`
                : `Sold out · queue ${queuedThisSpec}`}
            </span>
          )}
          <span className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-accent font-semibold">
            {expanded ? "Hide" : isPreOrderOnly ? "Pre-order" : "Configure"}
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
  spec, onOrder, leaseOnly,
}: {
  spec: AircraftSpec;
  onOrder: (type: "buy" | "lease", prefill?: OrderPrefill) => void;
  /** When true (Lease tab), the configurator hides the Buy controls
   *  and renders only the Lease side. The Buy tab uses the default
   *  (mixed buy + lease) layout. */
  leaseOnly?: boolean;
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

      {/* Spec readout — slightly more detailed than the collapsed row.
          Range + fuel burn now reflect the SELECTED engine retrofit
          live, so the player sees the spec change as they pick. The
          old layout showed the static spec values regardless of the
          retrofit choice, so the value of the upgrade was invisible
          until you read the side text. */}
      {(() => {
        // Compute effective values given engine + fuselage choices.
        // Fuel: stack retrofit + fuselage multiplicatively.
        const fuelMult =
          (engine === "fuel" || engine === "super" ? 0.9 : 1.0) *
          (fuselage ? 0.9 : 1.0);
        const effFuelBurn = spec.fuelBurnPerKm * fuelMult;
        // Range: +10% with fuel or super engine.
        const effRange = engine === "fuel" || engine === "super"
          ? Math.round(spec.rangeKm * 1.10)
          : spec.rangeKm;
        const burnDelta = effFuelBurn - spec.fuelBurnPerKm;
        const rangeDelta = effRange - spec.rangeKm;
        return (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[0.75rem]">
            <Stat
              label="Range"
              value={`${effRange.toLocaleString()} km`}
              delta={rangeDelta > 0 ? `+${rangeDelta.toLocaleString()} km` : undefined}
              positive={rangeDelta > 0}
            />
            <Stat
              label="Fuel burn"
              value={`${effFuelBurn.toFixed(1)} L/km`}
              delta={Math.abs(burnDelta) > 0.05
                ? `${burnDelta > 0 ? "+" : "−"}${Math.abs(burnDelta).toFixed(1)} L/km`
                : undefined}
              positive={burnDelta < 0}
            />
            <Stat
              label={spec.family === "passenger" ? "Default seats" : "Cargo"}
              value={
                spec.family === "passenger"
                  ? `${spec.seats.first}F/${spec.seats.business}C/${spec.seats.economy}Y`
                  : `${spec.cargoTonnes ?? 0}T`
              }
            />
            {/* Per-aircraft price — reflects engine + fuselage retrofits
                live so the player sees Super-engine's +$23M land here
                instead of having to advance to the next screen. The
                delta column below shows the upgrade premium when
                non-zero. */}
            <Stat
              label={leaseOnly ? "Lease / Q" : "Per aircraft"}
              value={leaseOnly
                ? fmtMoney(leasePerPlanePerQ)
                : fmtMoney(buyPerPlane)}
              delta={!leaseOnly && upgradePerPlane > 0
                ? `+${fmtMoney(upgradePerPlane)} retrofit`
                : undefined}
              positive={false}
            />
          </div>
        );
      })()}

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
          {leaseOnly ? (
            <div>
              Lease total{" "}
              <span className="text-ink font-mono font-semibold">{fmtMoney(leaseTotal)}/Q</span>
              <span className="text-ink-muted"> · seat config on next screen</span>
            </div>
          ) : (
            <div>
              Buy total{" "}
              <span className="text-ink font-mono font-semibold">{fmtMoney(buyTotal)}</span>
              {quantity > 1 && (
                <span className="text-ink-muted">
                  {" "}({fmtMoney(buyPerPlane)} × {quantity})
                </span>
              )}
              <span className="text-ink-muted"> · seat config on next screen</span>
            </div>
          )}
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {/* Buy section is buy-only. Lease lives entirely in the
              dedicated Lease tab now — having both options on the same
              row was creating a class of "I clicked Lease and nothing
              happened" bugs because not every spec is lease-eligible.
              Single primary action per surface = no silent failures. */}
          <Button
            size="sm"
            variant="primary"
            onClick={() => go(leaseOnly ? "lease" : "buy")}
          >
            {leaseOnly ? "Lease →" : "Buy →"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({
  label, value, delta, positive,
}: {
  label: string;
  value: string;
  /** Optional delta line shown below the value, e.g. "+1,610 km" or
   *  "−0.4 L/km". Used for live retrofit-impact rendering on the
   *  AircraftMarketModal expanded card so the player sees the spec
   *  change as they pick an engine option. */
  delta?: string;
  /** Whether the delta should render in the positive (green) tone.
   *  For range, more = positive. For fuel burn, less = positive — so
   *  the caller decides the polarity. */
  positive?: boolean;
}) {
  return (
    <div className="rounded-md bg-surface border border-line/60 px-2.5 py-1.5">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className="font-mono tabular text-[0.8125rem] text-ink mt-0.5">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            "text-[0.625rem] tabular font-mono mt-0.5 leading-tight",
            positive ? "text-positive" : "text-negative",
          )}
        >
          {delta}
        </div>
      )}
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

/**
 * LeaseMarket — dedicated tab listing only the top-7 passenger and
 * top-3 cargo specs that lessors are actually willing to underwrite.
 *
 * Header surfaces the player's remaining lease capacity under the 50%
 * fleet-ratio cap so they know how many more aircraft they can lease
 * before having to rebalance via buy or release. Each row reuses the
 * standard ExpandedConfigurator with the `leaseOnly` flag, which
 * hides the Buy controls so the Lease button is the single primary
 * action.
 *
 * Why a separate tab: lease eligibility is a real game restriction,
 * not a UI quirk. Showing buy + lease side-by-side on every spec
 * (and silently failing on ineligible ones) was confusing. Carving
 * out the leasable subset into its own surface makes it obvious
 * what's available, what the constraint is, and how many you can
 * still bring in.
 */
function LeaseMarket({
  currentQuarter, expandedSpecId, onToggleExpand, onOrder,
}: {
  currentQuarter: number;
  expandedSpecId: string | null;
  onToggleExpand: (specId: string) => void;
  onOrder: (specId: string, prefill?: OrderPrefill) => void;
}) {
  const player = useGame(selectPlayer);
  if (!player) return null;

  // Resolve the leasable-spec sets at this quarter.
  const eligible = leaseEligibleSpecIds(AIRCRAFT, currentQuarter);
  const passengerSpecs = AIRCRAFT
    .filter((s) => eligible.passenger.has(s.id))
    .sort((a, b) => a.buyPriceUsd - b.buyPriceUsd);
  const cargoSpecs = AIRCRAFT
    .filter((s) => eligible.cargo.has(s.id))
    .sort((a, b) => a.buyPriceUsd - b.buyPriceUsd);

  // ── Lease capacity remaining (50% fleet-ratio cap).
  //    A leased plane is counted vs total active+ordered fleet. The
  //    binding constraint: leased / (total + addedLeased) <= 0.5.
  //    Rearranging: addedLeased <= total - 2×leased  (when leased = 0,
  //    addedLeased = total; when leased = total, addedLeased = 0).
  //    We clamp at zero so the badge never goes negative.
  const eligibleFleet = player.fleet.filter(
    (f) => f.status === "active" || f.status === "ordered",
  );
  const totalEligible = eligibleFleet.length;
  const leasedCount = eligibleFleet.filter(
    (f) => f.acquisitionType === "lease",
  ).length;
  // To keep leased/(total+x) <= 0.5: x <= total - 2×leased
  const remainingLeaseCapacity = Math.max(0, totalEligible - 2 * leasedCount);
  const currentRatioPct = totalEligible === 0 ? 0 : (leasedCount / totalEligible) * 100;

  return (
    <div className="space-y-3">
      {/* Capacity header — single source of truth for "how many more
          can I lease before I'm forced to rebalance". */}
      <div className="rounded-md border border-accent bg-[var(--accent-soft)] px-3 py-2.5">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <div className="text-[0.625rem] uppercase tracking-wider text-accent font-semibold">
              Lease capacity
            </div>
            <div className="font-display text-[1.5rem] tabular leading-none mt-0.5 text-ink">
              {remainingLeaseCapacity === 0
                ? "0 — at cap"
                : `${remainingLeaseCapacity} more plane${remainingLeaseCapacity === 1 ? "" : "s"}`}
            </div>
          </div>
          <div className="text-[0.6875rem] text-ink-2 leading-snug max-w-[28ch] text-right">
            <div>
              {leasedCount} of {totalEligible} fleet leased
              {" "}<span className="tabular font-mono">({currentRatioPct.toFixed(0)}%)</span>
            </div>
            <div className="text-ink-muted">
              50% cap — sell or buy to free more headroom.
            </div>
          </div>
        </div>
      </div>

      {/* Passenger section */}
      <div>
        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2">
          Passenger · top {LEASE_ELIGIBLE_PASSENGER_TOP_N} by production stock
        </div>
        {passengerSpecs.length === 0 ? (
          <div className="text-[0.8125rem] text-ink-muted italic py-3 text-center">
            No passenger specs are leasable yet — production cap rankings
            haven&apos;t resolved.
          </div>
        ) : (
          <div className="space-y-2">
            {passengerSpecs.map((spec) => (
              <LeaseRow
                key={spec.id}
                spec={spec}
                expanded={expandedSpecId === spec.id}
                onToggleExpand={() => onToggleExpand(spec.id)}
                onOrder={(prefill) => onOrder(spec.id, prefill)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Cargo section */}
      <div>
        <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-2 mt-3">
          Cargo · top {LEASE_ELIGIBLE_CARGO_TOP_N} by production stock
        </div>
        {cargoSpecs.length === 0 ? (
          <div className="text-[0.8125rem] text-ink-muted italic py-3 text-center">
            No cargo specs are leasable yet.
          </div>
        ) : (
          <div className="space-y-2">
            {cargoSpecs.map((spec) => (
              <LeaseRow
                key={spec.id}
                spec={spec}
                expanded={expandedSpecId === spec.id}
                onToggleExpand={() => onToggleExpand(spec.id)}
                onOrder={(prefill) => onOrder(spec.id, prefill)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="text-[0.6875rem] text-ink-muted leading-relaxed pt-2 border-t border-line">
        Lease terms: {(LEASE_DEPOSIT_PCT * 100).toFixed(0)}% deposit, {(LEASE_PER_QUARTER_PCT * 100).toFixed(1)}% per quarter,
        {" "}{LEASE_TERM_QUARTERS}-quarter term. End of term: aircraft
        returns to lessor unless you exercise the {(LEASE_BUYOUT_RESIDUAL_PCT * 100).toFixed(0)}% buy-out.
      </div>
    </div>
  );
}

/** Compact lease-only row — leaner than the full AircraftRow because
 *  buy economics are off the table here. The expanded body uses the
 *  same configurator as the buy flow with the leaseOnly flag set. */
function LeaseRow({
  spec, expanded, onToggleExpand, onOrder,
}: {
  spec: AircraftSpec;
  expanded: boolean;
  onToggleExpand: () => void;
  onOrder: (prefill?: OrderPrefill) => void;
}) {
  const seats = spec.seats.first + spec.seats.business + spec.seats.economy;
  const imgSrc = planeImagePath(spec.id);
  const terms = {
    depositUsd: Math.round(spec.buyPriceUsd * LEASE_DEPOSIT_PCT),
    perQuarterUsd: Math.round(spec.buyPriceUsd * LEASE_PER_QUARTER_PCT),
  };
  return (
    <div
      className={cn(
        "rounded-md border bg-surface transition-all",
        expanded
          ? "border-primary shadow-[var(--shadow-1)]"
          : "border-line hover:bg-surface-hover",
      )}
    >
      <button
        type="button"
        onClick={onToggleExpand}
        aria-expanded={expanded}
        className="w-full text-left p-3 flex items-start gap-3"
      >
        <div className="shrink-0 w-20 h-14 rounded-md bg-surface-2/50 border border-line/60 flex items-center justify-center overflow-hidden">
          {imgSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={imgSrc}
              alt={`${spec.name} 3-view illustration`}
              loading="lazy"
              className="max-w-full max-h-full object-contain p-1"
            />
          ) : (
            <Plane size={20} className="text-ink-muted" strokeWidth={1.25} />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-semibold text-ink text-[0.9375rem]">{spec.name}</span>
            <span
              className={cn(
                "text-[0.5625rem] uppercase tracking-wider font-medium",
                spec.family === "cargo" ? "text-warning" : "text-ink-muted",
              )}
            >
              {spec.family}
            </span>
          </div>
          <div className="text-[0.75rem] text-ink-muted mt-0.5 font-mono tabular">
            {spec.family === "passenger"
              ? `${seats} seats · ${spec.rangeKm.toLocaleString()} km`
              : `${spec.cargoTonnes ?? 0}T cargo · ${spec.rangeKm.toLocaleString()} km`}
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          <span className="tabular font-mono text-[0.875rem] font-semibold text-ink">
            {fmtMoney(terms.perQuarterUsd)}<span className="text-ink-muted text-[0.6875rem] font-normal">/Q</span>
          </span>
          <span className="text-[0.6875rem] tabular text-ink-muted">
            {fmtMoney(terms.depositUsd)} deposit
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[0.6875rem] uppercase tracking-wider text-accent font-semibold">
            {expanded ? "Hide" : "Configure"}
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </span>
        </div>
      </button>
      {expanded && (
        <ExpandedConfigurator
          spec={spec}
          leaseOnly
          onOrder={(_, prefill) => onOrder(prefill)}
        />
      )}
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
  // Look up seller team names so the "Listed by …" line shows the
  // actual airline (e.g. "Avantair") instead of generic "rival airline".
  const teams = useGame((s) => s.teams);
  const sellerName = (sellerTeamId: string): string => {
    if (sellerTeamId === "admin") return "auctioneer";
    const t = teams.find((x) => x.id === sellerTeamId);
    return t ? t.name : "rival airline";
  };
  // Branded confirm — used-aircraft purchases are six- or seven-figure
  // commitments and were previously a one-tap action straight off a
  // dense listing row. The confirm summarises age / remaining life /
  // asking price so the player understands what they're committing to.
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const confirmListing = confirmId ? listings.find((x) => x.id === confirmId) : null;
  const confirmSpec = confirmListing ? AIRCRAFT_BY_ID[confirmListing.specId] : null;
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
                {" · "}{fmtAgeYQ(ageQ)} age · {fmtAgeYQ(remainingQ)} remaining
              </div>
              <div className="text-[0.6875rem] text-ink-muted mt-1">
                Listed by{" "}
                <span className="text-ink-2 font-medium">
                  {sellerName(l.sellerTeamId)}
                </span>
              </div>
            </div>
            <div className="shrink-0">
              <Button
                size="sm"
                variant="primary"
                onClick={() => setConfirmId(l.id)}
                aria-label={`Buy ${spec.name} from ${sellerName(l.sellerTeamId)} for ${fmtMoney(l.askingPriceUsd)}`}
              >
                Buy {fmtMoney(l.askingPriceUsd)}
              </Button>
            </div>
          </div>
        );
      })}

      {/* Confirm purchase of used aircraft */}
      <Modal open={!!confirmListing} onClose={() => setConfirmId(null)}>
        {confirmListing && confirmSpec && (() => {
          const ageQ = currentQuarter - confirmListing.manufactureQuarter;
          const remainingQ = Math.max(0, confirmListing.retirementQuarter - currentQuarter);
          return (
            <>
              <ModalHeader>
                <h2 className="font-display text-[1.5rem] text-ink">
                  Buy {confirmSpec.name}?
                </h2>
                <p className="text-ink-muted text-[0.8125rem] mt-1">
                  Pre-owned aircraft transfer immediately. The asking price is
                  withdrawn from your cash this quarter; the airframe slots
                  into your fleet at idle and is available for routes from
                  next quarter onward.
                </p>
              </ModalHeader>
              <ModalBody>
                <div className="rounded-md border border-line bg-surface p-3 text-[0.8125rem] space-y-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Asset</span>
                    <span className="text-ink">{confirmSpec.name}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Listed by</span>
                    <span className="text-ink">{sellerName(confirmListing.sellerTeamId)}</span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-ink-muted">Age · remaining life</span>
                    <span className="tabular font-mono text-ink">
                      {fmtAgeYQ(ageQ)} · {fmtAgeYQ(remainingQ)}
                    </span>
                  </div>
                  <div className="flex items-baseline justify-between gap-3 border-t border-line pt-1.5 mt-1.5">
                    <span className="text-ink font-semibold">Asking price</span>
                    <span className="tabular font-mono text-negative font-semibold">
                      −{fmtMoney(confirmListing.askingPriceUsd)}
                    </span>
                  </div>
                </div>
              </ModalBody>
              <ModalFooter>
                <Button variant="ghost" onClick={() => setConfirmId(null)}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    onBuy(confirmListing.id);
                    setConfirmId(null);
                  }}
                >
                  Buy · {fmtMoney(confirmListing.askingPriceUsd)}
                </Button>
              </ModalFooter>
            </>
          );
        })()}
      </Modal>
    </div>
  );
}
