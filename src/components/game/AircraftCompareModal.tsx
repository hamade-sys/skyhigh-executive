"use client";

import { Modal, ModalBody, ModalHeader, Badge, Button } from "@/components/ui";
import { fmtMoney } from "@/lib/format";
import { planeImagePath } from "@/lib/aircraft-images";
import { cruiseSpeedKmh, effectiveCutoffRound } from "@/lib/engine";
import { Plane, Trophy } from "lucide-react";
import { cn } from "@/lib/cn";
import type { AircraftSpec } from "@/types/game";

export interface AircraftCompareModalProps {
  open: boolean;
  onClose: () => void;
  specs: AircraftSpec[];
  /** Selected for buy from the compare panel — shortcut so the player
   *  can act without bouncing back to the market list. */
  onPick?: (specId: string) => void;
  /** Campaign mode so the discontinuation label shows the era-adjusted
   *  cutoff round (full campaigns are offset +60 quarters). */
  campaignMode?: "half" | "full";
}

/**
 * Side-by-side comparison of 2-4 aircraft specs.
 *
 * The market list shows one card at a time which makes it surprisingly
 * hard to A/B aircraft at a glance — players were ending up with PDFs of
 * spec sheets in another tab. This modal puts the key axes (price, seats,
 * range, fuel burn, runway, retirement, satisfaction) in a single grid
 * with row-level "best in row" highlighting so the trade-off is visible
 * at a glance.
 */
export function AircraftCompareModal({
  open, onClose, specs, onPick, campaignMode = "half",
}: AircraftCompareModalProps) {
  if (specs.length === 0) return null;

  const cols = specs.length;
  const gridCols =
    cols === 2 ? "grid-cols-[7rem_1fr_1fr]" :
    cols === 3 ? "grid-cols-[7rem_1fr_1fr_1fr]" :
    "grid-cols-[7rem_1fr_1fr_1fr_1fr]";

  // ── "Best in row" — flag the leader for each spec axis so the player
  // can see which plane wins on each dimension. Pure functions; nulls
  // mean tie or not applicable.
  const seatsTotal = (s: AircraftSpec) =>
    s.seats.first + s.seats.business + s.seats.economy;
  const bestSpecId = {
    seats: pickBest(specs, seatsTotal, "max"),
    cargo: pickBest(specs, (s) => s.cargoTonnes ?? 0, "max"),
    range: pickBest(specs, (s) => s.rangeKm, "max"),
    fuel: pickBest(specs, (s) => s.fuelBurnPerKm, "min"),
    price: pickBest(specs, (s) => s.buyPriceUsd, "min"),
    leasePerQ: pickBest(specs, (s) => s.leasePerQuarterUsd, "min"),
  };

  return (
    <Modal open={open} onClose={onClose} className="w-[min(1000px,calc(100vw-2rem))]">
      <ModalHeader>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="font-display text-heading-lg text-ink">
              Compare aircraft
            </h2>
            <p className="text-body text-ink-muted mt-1">
              Side-by-side specs for {cols} aircraft. Highlighted cell wins
              that row — but lowest fuel doesn&apos;t always mean best route fit.
            </p>
          </div>
          <Badge tone="accent">{cols} selected</Badge>
        </div>
      </ModalHeader>

      <ModalBody className="max-h-[70vh] overflow-auto">
        <div className={cn("grid gap-2 mb-4", gridCols)}>
          {/* Header row: empty anchor cell + plane name cells */}
          <div />
          {specs.map((s) => (
            <div
              key={s.id}
              className="rounded-md border border-line bg-surface p-2.5 flex flex-col gap-1.5"
            >
              <div className="aspect-[3/2] w-full rounded-md bg-surface-2/50 border border-line/60 flex items-center justify-center overflow-hidden">
                {planeImagePath(s.id) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={planeImagePath(s.id) ?? ""}
                    alt={`${s.name} illustration`}
                    loading="lazy"
                    className="max-w-full max-h-full object-contain p-1"
                  />
                ) : (
                  <Plane size={28} className="text-ink-muted" strokeWidth={1.25} />
                )}
              </div>
              <div className="text-body-lg font-semibold text-ink leading-tight">
                {s.name}
              </div>
              <div className="text-caption uppercase tracking-wider text-ink-muted">
                {s.family}
                {(() => {
                  const c = effectiveCutoffRound(s, campaignMode);
                  return typeof c === "number" ? ` · cutoff Q${c}` : null;
                })()}
              </div>
              {onPick && (
                <Button
                  size="sm"
                  variant="primary"
                  className="mt-1"
                  onClick={() => onPick(s.id)}
                >
                  Configure & buy →
                </Button>
              )}
            </div>
          ))}

          {/* Spec rows */}
          <Row label="Price (new)">
            {specs.map((s) => (
              <Cell
                key={s.id}
                best={bestSpecId.price === s.id}
                tone="lower-is-better"
              >
                {fmtMoney(s.buyPriceUsd)}
              </Cell>
            ))}
          </Row>
          <Row label="Lease" sub="per quarter">
            {specs.map((s) => (
              <Cell
                key={s.id}
                best={bestSpecId.leasePerQ === s.id}
                tone="lower-is-better"
              >
                {fmtMoney(s.leasePerQuarterUsd)}
              </Cell>
            ))}
          </Row>
          {specs.some((s) => s.family === "passenger") && (
            <>
              <Row label="Total seats">
                {specs.map((s) => (
                  <Cell
                    key={s.id}
                    best={bestSpecId.seats === s.id}
                    tone="higher-is-better"
                  >
                    {s.family === "passenger" ? seatsTotal(s).toLocaleString() : "—"}
                  </Cell>
                ))}
              </Row>
              <Row label="Class mix" sub="F · C · Y">
                {specs.map((s) => (
                  <Cell key={s.id}>
                    {s.family === "passenger"
                      ? `${s.seats.first} · ${s.seats.business} · ${s.seats.economy}`
                      : "—"}
                  </Cell>
                ))}
              </Row>
            </>
          )}
          {specs.some((s) => s.family === "cargo") && (
            <Row label="Cargo capacity">
              {specs.map((s) => (
                <Cell
                  key={s.id}
                  best={bestSpecId.cargo === s.id}
                  tone="higher-is-better"
                >
                  {s.cargoTonnes ? `${s.cargoTonnes}T` : "—"}
                </Cell>
              ))}
            </Row>
          )}
          <Row label="Range" sub="km">
            {specs.map((s) => (
              <Cell
                key={s.id}
                best={bestSpecId.range === s.id}
                tone="higher-is-better"
              >
                {s.rangeKm.toLocaleString()}
              </Cell>
            ))}
          </Row>
          <Row label="Fuel burn" sub="L/km">
            {specs.map((s) => (
              <Cell
                key={s.id}
                best={bestSpecId.fuel === s.id}
                tone="lower-is-better"
              >
                {s.fuelBurnPerKm.toFixed(1)}
              </Cell>
            ))}
          </Row>
          <Row label="Cruise speed" sub="km/h">
            {specs.map((s) => (
              <Cell key={s.id}>{cruiseSpeedKmh(s.id, null).toLocaleString()}</Cell>
            ))}
          </Row>
          <Row label="Eco upgrade" sub="one-time">
            {specs.map((s) => (
              <Cell key={s.id}>{fmtMoney(s.ecoUpgradeUsd)}</Cell>
            ))}
          </Row>
          <Row label="Unlocks" sub="quarter">
            {specs.map((s) => (
              <Cell key={s.id}>Q{s.unlockQuarter}</Cell>
            ))}
          </Row>
        </div>

        <div className="rounded-md border border-line bg-surface-2/30 px-3 py-2.5 text-body-sm text-ink-2 leading-relaxed">
          <strong className="text-ink">How to read this:</strong> the
          highlighted cell wins that row, but winning every row doesn&apos;t
          mean it&apos;s the right plane for YOUR routes — a long-range
          twin that wins on fuel will under-deliver if you&apos;re flying
          short-haul where the rotation cap matters more.
        </div>
      </ModalBody>
    </Modal>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────

function pickBest(
  specs: AircraftSpec[],
  axis: (s: AircraftSpec) => number,
  direction: "max" | "min",
): string | null {
  let bestId: string | null = null;
  let bestVal: number | null = null;
  for (const s of specs) {
    const v = axis(s);
    if (Number.isNaN(v) || v === 0) continue;
    if (
      bestVal === null ||
      (direction === "max" ? v > bestVal : v < bestVal)
    ) {
      bestVal = v;
      bestId = s.id;
    }
  }
  return bestId;
}

function Row({
  label, sub, children,
}: {
  label: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <div className="flex items-center px-2.5 py-2 text-body-sm text-ink-2 border-r border-line/60">
        <div>
          <div className="font-medium text-ink">{label}</div>
          {sub && <div className="text-caption text-ink-muted leading-tight">{sub}</div>}
        </div>
      </div>
      {children}
    </>
  );
}

function Cell({
  children, best, tone,
}: {
  children: React.ReactNode;
  best?: boolean;
  tone?: "higher-is-better" | "lower-is-better";
}) {
  return (
    <div
      className={cn(
        "px-2.5 py-2 text-body tabular font-mono rounded-md border flex items-center gap-1.5",
        best
          ? tone === "lower-is-better"
            ? "border-positive bg-[var(--positive-soft)] text-positive font-semibold"
            : "border-positive bg-[var(--positive-soft)] text-positive font-semibold"
          : "border-line bg-surface text-ink",
      )}
    >
      {best && <Trophy size={11} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </div>
  );
}
