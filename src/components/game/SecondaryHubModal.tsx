"use client";

import { useMemo, useState } from "react";
import { Button, Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui";
import { CITIES } from "@/data/cities";
import { useGame, selectPlayer } from "@/store/game";
import { fmtMoney } from "@/lib/format";
import { toast } from "@/store/toasts";
import { cn } from "@/lib/cn";
import { Search, Plane } from "lucide-react";

const ACTIVATION_COST_BY_TIER: Record<1 | 2 | 3 | 4, number> = {
  1: 30_000_000,
  2: 22_000_000,
  3: 12_000_000,
  4: 6_000_000,
};

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * Secondary hub activation (PRD §4.4).
 * Opens after Q3. One-time activation cost depends on city tier; ongoing
 * terminal fee is 2× normal until paid back via traffic.
 */
export function SecondaryHubModal({ open, onClose }: Props) {
  const player = useGame(selectPlayer);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const addSecondaryHub = useGame((s) => s.addSecondaryHub);
  const removeSecondaryHub = useGame((s) => s.removeSecondaryHub);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const candidates = useMemo(() => {
    if (!player) return [];
    const q = query.trim().toLowerCase();
    return CITIES.filter((c) => {
      if (c.code === player.hubCode) return false;
      if (player.secondaryHubCodes.includes(c.code)) return false;
      if (!q) return true;
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    }).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }, [player, query]);

  if (!player) return null;

  const locked = currentQuarter < 3;
  const selectedCity = selected ? CITIES.find((c) => c.code === selected) ?? null : null;
  const cost = selectedCity ? ACTIVATION_COST_BY_TIER[selectedCity.tier] : 0;
  const canAfford = player.cashUsd >= cost;

  function handleActivate() {
    if (!selected) return;
    const res = addSecondaryHub(selected);
    if (res.ok) {
      toast.success(`${selected} activated as secondary hub`);
      setSelected(null);
      setQuery("");
      onClose();
    } else {
      toast.negative(res.error ?? "Activation failed");
    }
  }

  return (
    <Modal open={open} onClose={onClose} className="max-w-2xl">
      <ModalHeader>
        <span className="text-label uppercase tracking-[0.2em] text-accent">
          Network expansion
        </span>
        <h2 className="font-display text-heading-lg text-ink leading-tight mt-1">
          Activate a secondary hub
        </h2>
        <p className="text-body text-ink-muted mt-1.5 leading-relaxed">
          Adds a new origin/destination point on your network. Routes from
          a secondary hub pay <strong>2× terminal fee</strong> until the city
          stabilises, but unlock new market access and break the
          spoke-only constraint.
        </p>
      </ModalHeader>

      <ModalBody className="space-y-4">
        {locked ? (
          <div className="rounded-md border border-[var(--warning-soft)] bg-[var(--warning-soft)] p-3 text-body text-warning">
            Secondary hubs unlock from <strong>Q3</strong>. Build out from your
            primary hub for the first two quarters.
          </div>
        ) : (
          <>
            {/* Current network summary */}
            <div className="rounded-md border border-line bg-surface-2 p-3">
              <div className="text-caption uppercase tracking-wider text-ink-muted mb-1.5">
                Your network
              </div>
              <div className="flex flex-wrap gap-1.5 items-center">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary text-primary-fg text-body-sm font-mono font-semibold">
                  HUB · {player.hubCode}
                </span>
                {player.secondaryHubCodes.map((code) => (
                  <button
                    key={code}
                    onClick={() => {
                      removeSecondaryHub(code);
                      toast.info(`${code} removed`, "No more secondary-hub fees from there.");
                    }}
                    title="Click to remove"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border border-dashed border-primary text-primary text-body-sm font-mono font-semibold hover:bg-[var(--accent-soft)]"
                  >
                    HUB·2 · {code} ×
                  </button>
                ))}
                {player.secondaryHubCodes.length === 0 && (
                  <span className="text-body-sm text-ink-muted italic">
                    No secondary hubs yet.
                  </span>
                )}
              </div>
            </div>

            {/* Search + city picker */}
            <div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-muted" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name or IATA code…"
                  className="w-full rounded-md border border-line bg-surface px-8 py-2 text-body-lg text-ink placeholder:text-ink-muted focus:outline-none focus:border-primary"
                />
              </div>

              <div className="mt-2 max-h-[320px] overflow-y-auto rounded-md border border-line">
                {candidates.length === 0 ? (
                  <div className="p-4 text-center text-body text-ink-muted">
                    No cities match. Try a different search.
                  </div>
                ) : (
                  <ul>
                    {candidates.slice(0, 80).map((c) => {
                      const isSelected = selected === c.code;
                      const tierCost = ACTIVATION_COST_BY_TIER[c.tier];
                      return (
                        <li key={c.code}>
                          <button
                            onClick={() => setSelected(c.code)}
                            className={cn(
                              "w-full flex items-center justify-between px-3 py-2 text-left text-body border-b border-line last:border-0",
                              isSelected
                                ? "bg-[var(--accent-soft-2)] text-ink"
                                : "hover:bg-surface-hover text-ink-2",
                            )}
                          >
                            <span className="flex items-center gap-2.5 min-w-0">
                              <Plane size={13} className={isSelected ? "text-accent" : "text-ink-muted"} />
                              <span className="font-mono text-ink shrink-0">{c.code}</span>
                              <span className="truncate">{c.name}</span>
                              <span className="text-label text-ink-muted shrink-0">
                                · {c.regionName} · T{c.tier}
                              </span>
                            </span>
                            <span className="tabular font-mono text-body-sm text-ink-2 shrink-0">
                              {fmtMoney(tierCost)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Selected summary */}
            {selectedCity && (
              <div className="rounded-md border border-primary bg-[var(--accent-soft)] p-3">
                <div className="flex items-baseline justify-between mb-1">
                  <span className="text-label uppercase tracking-wider text-accent font-semibold">
                    Selected · {selectedCity.code}
                  </span>
                  <span className={cn(
                    "tabular font-mono font-semibold text-body-lg",
                    canAfford ? "text-ink" : "text-negative",
                  )}>
                    {fmtMoney(cost)}
                  </span>
                </div>
                <div className="text-body-lg font-medium text-ink">
                  {selectedCity.name}
                </div>
                <div className="text-body-sm text-ink-muted leading-relaxed mt-1">
                  {selectedCity.character}
                </div>
                {!canAfford && (
                  <div className="text-body-sm text-negative mt-2">
                    Need {fmtMoney(cost - player.cashUsd)} more in cash to activate.
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        {!locked && (
          <Button
            variant="primary"
            disabled={!selected || !canAfford}
            onClick={handleActivate}
          >
            Activate hub
          </Button>
        )}
      </ModalFooter>
    </Modal>
  );
}
