"use client";

import { useMemo, useState } from "react";
import {
  useGame,
  selectActiveTeam,
  selectOtherTeams,
  useCampaignStartYear,
} from "@/store/game";
import { AIRCRAFT_BY_ID } from "@/data/aircraft";
import { DOCTRINE_BY_ID } from "@/data/doctrines";
import { CITIES_BY_CODE } from "@/data/cities";
import {
  queuedForSpec,
  queuePosition,
  estimatedDeliveryQuarter,
  effectiveProductionCap,
} from "@/lib/pre-orders";
import { fmtMoney, fmtQuarter } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { PreOrder, Team } from "@/types/game";
import {
  Factory,
  Plane,
  ChevronDown,
  ChevronRight,
  Clock,
  Telescope,
  Building2,
} from "lucide-react";

type IntelTab = "orderbook" | "fleets";

/** First token of a spec name is its manufacturer ("Airbus A380-800"). */
function manufacturerOf(specName: string): string {
  return specName.split(" ")[0] || "—";
}

export function MarketIntelPanel() {
  const me = useGame(selectActiveTeam);
  const others = useGame(selectOtherTeams);
  const teams = useGame((s) => s.teams);
  const preOrders = useGame((s) => s.preOrders);
  const productionCapOverrides = useGame((s) => s.productionCapOverrides);
  const currentQuarter = useGame((s) => s.currentQuarter);
  const campaignMode = useGame((s) => s.session?.campaignMode);
  const startYear = useCampaignStartYear();
  const cmode: "half" | "full" = campaignMode === "full" ? "full" : "half";
  const myId = me?.id ?? null;

  const [tab, setTab] = useState<IntelTab>("orderbook");

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <div className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted flex items-center gap-1.5">
          <Telescope size={12} /> Market intelligence
        </div>
        <p className="text-[0.8125rem] text-ink-2 leading-relaxed">
          See the global aircraft production queue — who has reserved which
          delivery slots, and in what order — plus a model-by-model breakdown of
          every rival&rsquo;s fleet. Slots are first-come, first-served across all
          airlines, so ordering early is how you build a delivery monopoly.
        </p>
      </header>

      {/* Tab strip */}
      <div className="inline-flex items-center gap-0.5 rounded-md border border-line p-0.5">
        <TabButton active={tab === "orderbook"} onClick={() => setTab("orderbook")} icon={<Factory size={12} />}>
          Order book
        </TabButton>
        <TabButton active={tab === "fleets"} onClick={() => setTab("fleets")} icon={<Building2 size={12} />}>
          Competitor fleets
        </TabButton>
      </div>

      {tab === "orderbook" ? (
        <OrderBook
          preOrders={preOrders}
          teams={teams}
          myId={myId}
          currentQuarter={currentQuarter}
          overrides={productionCapOverrides}
          cmode={cmode}
          startYear={startYear}
        />
      ) : (
        <CompetitorFleets
          others={others}
          preOrders={preOrders}
        />
      )}
    </div>
  );
}

function TabButton({
  active, onClick, icon, children,
}: {
  active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-sm text-[0.6875rem] flex items-center gap-1.5 transition-colors",
        active ? "bg-primary text-primary-fg font-medium" : "text-ink-2 hover:text-ink",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

// ─── Order book ──────────────────────────────────────────────

function OrderBook({
  preOrders, teams, myId, currentQuarter, overrides, cmode, startYear,
}: {
  preOrders: PreOrder[];
  teams: Team[];
  myId: string | null;
  currentQuarter: number;
  overrides: Record<string, number>;
  cmode: "half" | "full";
  startYear: number;
}) {
  // Specs with a live (queued) production line, ranked by queue depth.
  const lines = useMemo(() => {
    const specIds = new Set(
      preOrders.filter((o) => o.status === "queued").map((o) => o.specId),
    );
    const rows = [...specIds]
      .map((specId) => {
        const spec = AIRCRAFT_BY_ID[specId];
        const queue = queuedForSpec(preOrders, specId);
        const mine = queue.filter((o) => o.teamId === myId).length;
        return { specId, spec, queue, mine };
      })
      .filter((r) => r.spec && r.queue.length > 0);
    rows.sort((a, b) => b.queue.length - a.queue.length);
    return rows;
  }, [preOrders, myId]);

  const teamName = (id: string) => teams.find((t) => t.id === id)?.name ?? "—";
  const teamColor = (id: string) => teams.find((t) => t.id === id)?.color ?? "#888";

  // Default-open the deepest queue so the headline backlog is visible.
  const [openSpec, setOpenSpec] = useState<string | null>(lines[0]?.specId ?? null);

  if (lines.length === 0) {
    return (
      <EmptyState
        icon={<Factory size={20} />}
        title="No aircraft in the production queue"
        body="When any airline pre-orders an aircraft that can't ship the same quarter, it joins the global FIFO queue and appears here — with every reserved delivery slot in order."
      />
    );
  }

  return (
    <div className="space-y-2.5">
      {lines.map(({ specId, spec, queue, mine }) => {
        if (!spec) return null;
        const cap = effectiveProductionCap(spec, overrides);
        const open = openSpec === specId;
        const maker = manufacturerOf(spec.name);
        const model = spec.name.replace(new RegExp(`^${maker}\\s+`), "");
        return (
          <div key={specId} className="rounded-lg border border-line bg-surface overflow-hidden">
            <button
              type="button"
              onClick={() => setOpenSpec(open ? null : specId)}
              aria-expanded={open}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-surface-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="text-ink-muted shrink-0">
                {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
              </span>
              <Plane size={16} className="text-accent shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block text-[0.8125rem] font-medium text-ink truncate">
                  {model}
                  <span className="text-ink-muted font-normal"> · {maker}</span>
                </span>
                <span className="block text-[0.6875rem] text-ink-muted">
                  {cap}/quarter off the line · {fmtMoney(spec.buyPriceUsd, { compact: true })} list
                </span>
              </span>
              <span className="text-right shrink-0">
                <span className="block text-[0.9375rem] font-mono tabular text-ink leading-none">
                  {queue.length}
                </span>
                <span className="block text-[0.625rem] uppercase tracking-wider text-ink-muted mt-0.5">
                  in queue
                </span>
              </span>
              {mine > 0 && (
                <span className="shrink-0 rounded-full bg-primary/10 text-primary text-[0.625rem] font-semibold px-2 py-0.5 tabular">
                  {mine} yours
                </span>
              )}
            </button>

            {open && (
              <div className="border-t border-line">
                <div className="px-3 py-1.5 grid grid-cols-[2rem_1fr_auto_auto] gap-2 text-[0.5625rem] uppercase tracking-wider text-ink-muted bg-surface-2/40">
                  <span>#</span>
                  <span>Airline</span>
                  <span className="text-right">Ordered</span>
                  <span className="text-right">Est. delivery</span>
                </div>
                <ol>
                  {queue.map((o, i) => {
                    const pos = queuePosition(preOrders, o.id) ?? i + 1;
                    const eta = estimatedDeliveryQuarter(
                      o, spec, preOrders, currentQuarter, overrides, cmode,
                    );
                    const isMine = o.teamId === myId;
                    return (
                      <li
                        key={o.id}
                        className={cn(
                          "px-3 py-1.5 grid grid-cols-[2rem_1fr_auto_auto] gap-2 items-center text-[0.75rem] border-t border-line/60",
                          isMine && "bg-primary/[0.06]",
                        )}
                      >
                        <span className="font-mono tabular text-ink-muted">{pos}</span>
                        <span className="flex items-center gap-1.5 min-w-0">
                          <span
                            className="w-2 h-2 rounded-full shrink-0"
                            style={{ background: teamColor(o.teamId) }}
                          />
                          <span className={cn("truncate", isMine ? "text-primary font-semibold" : "text-ink")}>
                            {teamName(o.teamId)}
                          </span>
                          {isMine && (
                            <span className="shrink-0 text-[0.5625rem] uppercase tracking-wider text-primary/70">
                              you
                            </span>
                          )}
                          {o.acquisitionType === "lease" && (
                            <span className="shrink-0 text-[0.5625rem] uppercase tracking-wider text-ink-muted">
                              lease
                            </span>
                          )}
                        </span>
                        <span className="text-right font-mono tabular text-ink-muted">
                          {fmtQuarter(o.orderedAtQuarter, startYear)}
                        </span>
                        <span className="text-right font-mono tabular text-ink flex items-center justify-end gap-1">
                          <Clock size={10} className="text-ink-muted" />
                          {fmtQuarter(eta, startYear)}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Competitor fleets ───────────────────────────────────────

function CompetitorFleets({
  others, preOrders,
}: {
  others: Team[];
  preOrders: PreOrder[];
}) {
  if (others.length === 0) {
    return (
      <EmptyState
        icon={<Building2 size={20} />}
        title="No competitors in this game"
        body="When other airlines are in play, their full fleets — active aircraft and aircraft still on order — show up here, broken down model by model."
      />
    );
  }
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {others.map((team) => (
        <RivalFleetCard key={team.id} team={team} preOrders={preOrders} />
      ))}
    </div>
  );
}

function RivalFleetCard({ team, preOrders }: { team: Team; preOrders: PreOrder[] }) {
  const doctrine = DOCTRINE_BY_ID[team.doctrine];
  const hub = CITIES_BY_CODE[team.hubCode];

  // Active/owned aircraft by spec (exclude retired) + on-order from the queue.
  const breakdown = useMemo(() => {
    const owned = new Map<string, number>();
    for (const ac of team.fleet) {
      if (ac.status === "retired") continue;
      owned.set(ac.specId, (owned.get(ac.specId) ?? 0) + 1);
    }
    const onOrder = new Map<string, number>();
    for (const o of preOrders) {
      if (o.teamId !== team.id || o.status !== "queued") continue;
      onOrder.set(o.specId, (onOrder.get(o.specId) ?? 0) + 1);
    }
    const specIds = new Set([...owned.keys(), ...onOrder.keys()]);
    const rows = [...specIds]
      .map((specId) => ({
        specId,
        spec: AIRCRAFT_BY_ID[specId],
        owned: owned.get(specId) ?? 0,
        onOrder: onOrder.get(specId) ?? 0,
      }))
      .filter((r) => r.spec);
    rows.sort((a, b) => (b.owned + b.onOrder) - (a.owned + a.onOrder));
    return rows;
  }, [team, preOrders]);

  const totalActive = breakdown.reduce((s, r) => s + r.owned, 0);
  const totalOnOrder = breakdown.reduce((s, r) => s + r.onOrder, 0);

  return (
    <div className="rounded-lg border border-line bg-surface overflow-hidden">
      <div className="px-3 py-2.5 border-b border-line flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: team.color }} />
        <span className="min-w-0 flex-1">
          <span className="block text-[0.8125rem] font-semibold text-ink truncate">{team.name}</span>
          <span className="block text-[0.6875rem] text-ink-muted truncate">
            {doctrine?.name ?? "—"} · Hub {hub?.name ?? team.hubCode}
          </span>
        </span>
        <span className="text-right shrink-0">
          <span className="block text-[0.9375rem] font-mono tabular text-ink leading-none">{totalActive}</span>
          <span className="block text-[0.5625rem] uppercase tracking-wider text-ink-muted mt-0.5">aircraft</span>
        </span>
      </div>

      {breakdown.length === 0 ? (
        <div className="px-3 py-4 text-[0.75rem] text-ink-muted text-center">
          No aircraft yet.
        </div>
      ) : (
        <ul className="divide-y divide-line/60">
          {breakdown.map((r) => {
            const maker = manufacturerOf(r.spec!.name);
            const model = r.spec!.name.replace(new RegExp(`^${maker}\\s+`), "");
            return (
              <li key={r.specId} className="px-3 py-1.5 flex items-center gap-2 text-[0.75rem]">
                <Plane size={12} className="text-ink-muted shrink-0" />
                <span className="min-w-0 flex-1 truncate text-ink">
                  {model}
                  <span className="text-ink-muted"> · {maker}</span>
                </span>
                {r.owned > 0 && (
                  <span className="shrink-0 font-mono tabular text-ink">{r.owned}</span>
                )}
                {r.onOrder > 0 && (
                  <span className="shrink-0 rounded-full bg-accent/10 text-accent text-[0.625rem] font-semibold px-1.5 py-0.5 tabular">
                    +{r.onOrder} on order
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {totalOnOrder > 0 && (
        <div className="px-3 py-1.5 border-t border-line bg-surface-2/40 text-[0.6875rem] text-ink-muted flex items-center gap-1.5">
          <Clock size={11} /> {totalOnOrder} on order in the production queue
        </div>
      )}
    </div>
  );
}

// ─── Shared ──────────────────────────────────────────────────

function EmptyState({
  icon, title, body,
}: {
  icon: React.ReactNode; title: string; body: string;
}) {
  return (
    <div className="rounded-lg border border-dashed border-line bg-surface px-6 py-10 text-center">
      <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-surface-2 text-ink-muted mb-3">
        {icon}
      </div>
      <div className="text-[0.8125rem] font-medium text-ink mb-1">{title}</div>
      <p className="text-[0.75rem] text-ink-muted max-w-sm mx-auto leading-relaxed">{body}</p>
    </div>
  );
}
