"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, Sparkline } from "@/components/ui";
import { fmtMoney, fmtPct, fmtQuarter, getTotalRounds } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { computeAirlineValue, resolveEndgameAwards, brandRating, computeBrandValueBreakdown } from "@/lib/engine";
import { MILESTONES, MILESTONES_BY_ID } from "@/data/milestones";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { Award, TrendingUp, TrendingDown, Trophy, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";
import { airlineColorFor } from "@/lib/games/airline-colors";

/** Legacy titles by final Brand Value band. */
function legacyTitle(bv: number): { title: string; sub: string } {
  if (bv >= 85) return { title: "The Legend", sub: "A new benchmark for the industry. Regulators write case studies. Rivals study your playbook." };
  if (bv >= 72) return { title: "The Architect", sub: "Built a carrier that will outlive you. Your moves define the next decade." };
  if (bv >= 60) return { title: "The Operator", sub: "Solid, respected, durable. The airline that investors trust." };
  if (bv >= 45) return { title: "The Survivor", sub: "You took the hits and made it to Q4 2024. That counts." };
  if (bv >= 30) return { title: "The Cautionary Tale", sub: "Your story will be taught — as a lesson in what not to do." };
  return { title: "The Grounded", sub: "The board convenes next week. The conversation will be short." };
}

export default function Endgame() {
  const s = useGame();
  const router = useRouter();
  const player = selectPlayer(s);
  const reset = useGame((g) => g.resetGame);

  if (!player) {
    return (
      <main className="flex-1 min-h-0 flex items-center justify-center overflow-y-auto">
        <div className="text-ink-muted">No active game. <Link href="/onboarding" className="underline">Start a new simulation</Link></div>
      </main>
    );
  }

  // Apply endgame card multipliers (PRD G9) to the brand multiplier — net
  // effect lifts/depresses Airline Value by the same factor.
  const awards = resolveEndgameAwards(player);
  const cardMult = awards.reduce((m, a) => m * a.airlineValueMult, 1);
  const baseAirlineValue = computeAirlineValue(player);
  const finalAirlineValue = baseAirlineValue * cardMult;
  const rankedTeams = [...s.teams]
    .map((t) => {
      const aw = resolveEndgameAwards(t);
      const m = aw.reduce((mm, a) => mm * a.airlineValueMult, 1);
      return { ...t, finalAirlineValue: computeAirlineValue(t) * m };
    });
  // Sort with explicit tiebreakers so two airlines with identical
  // airline values resolve deterministically: cash > debt-free > brand
  // > loyalty. The UI surfaces each tiebreaker so players can see WHY
  // they ranked where they did.
  const ranked = rankedTeams.sort((a, b) => {
    if (b.finalAirlineValue !== a.finalAirlineValue)
      return b.finalAirlineValue - a.finalAirlineValue;
    if (b.cashUsd !== a.cashUsd) return b.cashUsd - a.cashUsd;
    if (a.totalDebtUsd !== b.totalDebtUsd) return a.totalDebtUsd - b.totalDebtUsd;
    if (b.brandPts !== a.brandPts) return b.brandPts - a.brandPts;
    return b.customerLoyaltyPct - a.customerLoyaltyPct;
  });
  const finalRank = ranked.findIndex((t) => t.id === player.id) + 1;
  const { title, sub } = legacyTitle(player.brandValue);
  const totalProfit = player.financialsByQuarter.reduce((s, q) => s + q.netProfit, 0);
  // Backwards-compatible alias for legacy display fragments below
  const adjustedBV = player.brandValue;
  const airlineValue = finalAirlineValue;

  function playAgain() {
    reset();
    router.push("/onboarding");
  }

  return (
    // The root layout's body has overflow-hidden (so the in-game map
    // doesn't push the page around). Endgame is a long scrollable
    // surface — give the main column min-h-0 + overflow-y-auto so
    // its content scrolls inside the flex column instead of being
    // clipped at the viewport. Sticky header keeps "Final scoring"
    // visible while the player scrolls through podium / awards /
    // milestones / decisions / rankings.
    <main className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <header className="sticky top-0 z-10 px-8 py-5 border-b border-line bg-bg/95 backdrop-blur-md flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl text-ink">ICAN Simulations</span>
          <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            Final scoring · Q4 2024 closed
          </span>
        </div>
      </header>

      <section className="flex-1 px-8 py-12 pb-24 max-w-5xl mx-auto w-full">
        {/* ── Podium — celebratory gold/silver/bronze for the top 3.
            Renders only when there are 3+ teams (otherwise the
            standings table below is enough). The player's tile gets
            a "You" pill + thicker border so they spot themselves
            at-a-glance even if they didn't medal. */}
        {ranked.length >= 3 && (
          <div className="grid grid-cols-3 gap-4 mb-10 items-end">
            <PodiumStep
              place={2}
              team={ranked[1]}
              isPlayer={ranked[1].id === player.id}
              heightClass="h-44"
            />
            <PodiumStep
              place={1}
              team={ranked[0]}
              isPlayer={ranked[0].id === player.id}
              heightClass="h-56"
            />
            <PodiumStep
              place={3}
              team={ranked[2]}
              isPlayer={ranked[2].id === player.id}
              heightClass="h-36"
            />
          </div>
        )}

        <Badge tone="accent">{finalRank === 1 ? "Winner" : `Finished #${finalRank} of ${s.teams.length}`}</Badge>
        <h1 className="font-display text-[clamp(3rem,7vw,5rem)] leading-[1.04] text-ink mt-4 mb-3">
          {title}.
        </h1>
        <p className="text-ink-2 text-[1.125rem] leading-relaxed max-w-[52ch] mb-10">
          {sub}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <Stat label="Final Brand Value" value={adjustedBV.toFixed(1)} tone="accent" />
          <Stat label="Airline Value" value={fmtMoney(airlineValue)} />
          <Stat label="Customer loyalty" value={fmtPct(player.customerLoyaltyPct, 0)} />
          <Stat label="Total net profit" value={fmtMoney(totalProfit)} tone={totalProfit >= 0 ? "positive" : "negative"} />
        </div>

        {/* Brand Value composition — how the final number was constructed */}
        {(() => {
          const bv = computeBrandValueBreakdown(player);
          return (
            <Card className="mb-6">
              <CardBody>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-[1.5rem] text-ink">
                    Brand Value composition
                  </h2>
                  <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                    {bv.composite.toFixed(1)} composite
                  </span>
                </div>
                <p className="text-[0.875rem] text-ink-2 leading-relaxed mb-4">
                  Three weighted health scores combine into the final Brand
                  Value: financial discipline, brand stewardship, and operational
                  rigor.
                </p>
                <div className="grid grid-cols-3 gap-3">
                  <BVPillar
                    label="Financial health · 35%"
                    score={bv.financialHealth}
                    rows={[
                      { k: "Cash ratio",     v: `${bv.cashRatio.toFixed(0)}` },
                      { k: "Debt discipline", v: `${bv.debtRatioScore.toFixed(0)}` },
                      { k: "Revenue growth",  v: `${bv.revGrowth.toFixed(0)}` },
                    ]}
                  />
                  <BVPillar
                    label="Brand health · 50%"
                    score={bv.brandHealth}
                    rows={[
                      { k: "Brand pts",         v: `${bv.brandPtsScore.toFixed(0)}` },
                      { k: "Customer loyalty",  v: `${bv.customerLoyalty.toFixed(0)}` },
                      { k: "Reputation events", v: `${bv.reputationEvents.toFixed(0)}` },
                    ]}
                  />
                  <BVPillar
                    label="Operations health · 15%"
                    score={bv.operationsHealth}
                    rows={[
                      { k: "Ops pts",          v: `${bv.opsPtsScore.toFixed(0)}` },
                      { k: "Fleet modernity",  v: `${bv.fleetEfficiency.toFixed(0)}` },
                      { k: "Staff commitment", v: `${bv.staffCommitment.toFixed(0)}` },
                    ]}
                  />
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* End-game awards (PRD G9) */}
        {awards.length > 0 && (
          <Card className="mb-6">
            <CardBody>
              <h2 className="font-display text-[1.5rem] text-ink mb-3">
                End-game awards earned
              </h2>
              <div className="space-y-2">
                {awards.map((a) => (
                  <div
                    key={a.card}
                    className="flex items-baseline justify-between py-2 border-b border-line last:border-0"
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="font-semibold text-ink text-[0.9375rem]">
                        {a.card}
                      </span>
                      <span className="text-[0.75rem] text-ink-muted">
                        {a.source}
                      </span>
                    </div>
                    <span className="text-[0.8125rem] text-ink-2 tabular font-mono">
                      {a.effect}
                    </span>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Multi-airline trajectory chart — every team's airline value
            quarter by quarter so the room can see how the field
            converged or diverged across the 40-round campaign. */}
        {ranked.length > 0 && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[1.5rem] text-ink">
                  Airline value · {fmtQuarter(1)} → {fmtQuarter(40)}
                </h2>
                <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  All teams
                </span>
              </div>
              <MultiAirlineChart teams={ranked} totalRounds={getTotalRounds(s)} />
            </CardBody>
          </Card>
        )}

        {/* Final standings — every team ranked by final airline value */}
        {ranked.length > 1 && (
          <Card className="mb-6">
            <CardBody>
              <h2 className="font-display text-[1.5rem] text-ink mb-3">
                Final standings
              </h2>
              <div className="space-y-1.5">
                {ranked.map((t, i) => (
                  <div
                    key={t.id}
                    className={`flex items-center gap-3 rounded-md border p-2.5 ${
                      t.id === player.id
                        ? "border-primary bg-[rgba(20,53,94,0.04)]"
                        : "border-line bg-surface"
                    }`}
                  >
                    <span className="font-mono text-[0.875rem] text-ink-muted w-6 tabular text-center">
                      #{i + 1}
                    </span>
                    <span
                      className="inline-block w-7 h-7 rounded flex items-center justify-center font-mono text-[0.625rem] font-semibold text-primary-fg shrink-0"
                      style={{ background: airlineColorFor({ colorId: t.airlineColorId, fallbackKey: t.id }).hex }}
                    >
                      {t.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={`text-[0.9375rem] truncate ${t.id === player.id ? "font-semibold text-ink" : "text-ink-2"}`}>
                          {t.name}
                        </span>
                        {t.id === player.id && <Badge tone="primary">You</Badge>}
                        {i === 0 && <Badge tone="accent">Winner</Badge>}
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted font-mono">
                        Hub {t.hubCode} · {t.routes.filter((r) => r.status === "active").length} routes · {t.fleet.filter((f) => f.status === "active").length} aircraft
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-display text-[1.125rem] text-ink leading-none tabular">
                        {fmtMoney(t.finalAirlineValue)}
                      </div>
                      <div className="text-[0.6875rem] text-ink-muted mt-0.5">
                        Brand {brandRating(t).grade}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Fun facts — quirky stats from the player's 40-round campaign */}
        {(() => {
          const facts: Array<{ label: string; value: string }> = [];
          // Most-flown route
          const routesByRev = [...player.routes].sort(
            (a, b) => b.quarterlyRevenue - a.quarterlyRevenue,
          );
          if (routesByRev.length > 0 && routesByRev[0].quarterlyRevenue > 0) {
            facts.push({
              label: "Top revenue route at endgame",
              value: `${routesByRev[0].originCode} → ${routesByRev[0].destCode} · ${fmtMoney(routesByRev[0].quarterlyRevenue)}/Q`,
            });
          }
          // Total quarters played
          facts.push({
            label: "Quarters operated",
            value: `${player.financialsByQuarter.length} of ${getTotalRounds(s)}`,
          });
          // Total decisions
          if (player.decisions.length > 0) {
            facts.push({
              label: "Boardroom decisions submitted",
              value: `${player.decisions.length}`,
            });
          }
          // Best brand value peak
          const peakBV = Math.max(...player.financialsByQuarter.map((q) => q.brandValue));
          const peakBVRow = player.financialsByQuarter.find((q) => q.brandValue === peakBV);
          if (peakBVRow) {
            facts.push({
              label: "Peak Brand Rating quarter",
              value: `${brandRating({ ...player, brandPts: peakBVRow.brandPts ?? player.brandPts }).grade} at Q${peakBVRow.quarter}`,
            });
          }
          // Total revenue
          const totalRev = player.financialsByQuarter.reduce((s, q) => s + q.revenue, 0);
          facts.push({
            label: "Lifetime revenue",
            value: fmtMoney(totalRev),
          });
          // Aircraft acquired
          facts.push({
            label: "Aircraft in fleet at endgame",
            value: `${player.fleet.filter((f) => f.status !== "retired").length} active · ${player.fleet.filter((f) => f.status === "retired").length} retired`,
          });
          // Network reach
          const uniqueCities = new Set<string>();
          for (const r of player.routes) {
            if (r.status !== "closed") {
              uniqueCities.add(r.originCode);
              uniqueCities.add(r.destCode);
            }
          }
          facts.push({
            label: "Cities served",
            value: `${uniqueCities.size}`,
          });
          return (
            <Card className="mb-6">
              <CardBody>
                <h2 className="font-display text-[1.5rem] text-ink mb-3">
                  Fun facts
                </h2>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {facts.map((f) => (
                    <div key={f.label} className="flex items-baseline justify-between border-b border-line py-1.5">
                      <span className="text-[0.8125rem] text-ink-muted">{f.label}</span>
                      <span className="text-[0.875rem] tabular font-mono text-ink font-medium">{f.value}</span>
                    </div>
                  ))}
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* Career arc — brand value trajectory across all 40 rounds */}
        {player.financialsByQuarter.length >= 2 && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[1.5rem] text-ink">Career arc</h2>
                <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  {fmtQuarter(1)} → {fmtQuarter(40)} brand value
                </span>
              </div>
              {(() => {
                const series = player.financialsByQuarter.map((q) => q.brandValue);
                const profitSeries = player.financialsByQuarter.map((q) => q.netProfit);
                const cashSeries = player.financialsByQuarter.map((q) => q.cash);
                const peakBV = Math.max(...series);
                const peakBVQ = player.financialsByQuarter.find((q) => q.brandValue === peakBV)?.quarter ?? 1;
                const trough = Math.min(...profitSeries);
                const peak = Math.max(...profitSeries);
                const bestQ = player.financialsByQuarter.find((q) => q.netProfit === peak);
                const worstQ = player.financialsByQuarter.find((q) => q.netProfit === trough);
                return (
                  <>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                      <ArcStat label="Brand peak" value={`${peakBV.toFixed(1)} (Q${peakBVQ})`} icon={<TrendingUp size={14} />} />
                      <ArcStat label="Best quarter" value={bestQ ? `${fmtMoney(peak)} (Q${bestQ.quarter})` : "—"} icon={<Trophy size={14} />} tone="positive" />
                      <ArcStat label="Worst quarter" value={worstQ ? `${fmtMoney(trough)} (Q${worstQ.quarter})` : "—"} icon={<TrendingDown size={14} />} tone={trough < 0 ? "negative" : "default"} />
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <ArcSpark label="Brand value" values={series} color="var(--accent)" />
                      <ArcSpark label="Cash position" values={cashSeries} color="var(--primary)" />
                      <ArcSpark label="Quarterly profit" values={profitSeries} color={trough < 0 ? "var(--negative)" : "var(--positive)"} />
                    </div>
                  </>
                );
              })()}
            </CardBody>
          </Card>
        )}

        {/* ── Quarter highlights timeline — pivotal moments across the
            40-round arc. Combines biggest profit/loss quarters, peak
            brand, decisions, milestones unlocked. Read like a history
            of the airline. */}
        {(() => {
          type Highlight = {
            quarter: number;
            kind: "peak-bv" | "best-q" | "worst-q" | "milestone" | "first-route" | "comeback" | "debt-stress" | "near-collapse";
            title: string;
            detail: string;
            tone: "pos" | "neg" | "info";
          };
          const highlights: Highlight[] = [];

          // Best & worst quarter by net profit
          const profitSeries = player.financialsByQuarter
            .map((q) => ({ q: q.quarter, p: q.netProfit }));
          if (profitSeries.length > 0) {
            const best = profitSeries.reduce((acc, x) => x.p > acc.p ? x : acc, profitSeries[0]);
            const worst = profitSeries.reduce((acc, x) => x.p < acc.p ? x : acc, profitSeries[0]);
            if (best.p > 0) {
              highlights.push({
                quarter: best.q,
                kind: "best-q",
                title: "Best quarter",
                detail: `Net profit ${fmtMoney(best.p)}`,
                tone: "pos",
              });
            }
            if (worst.p < 0) {
              highlights.push({
                quarter: worst.q,
                kind: "worst-q",
                title: "Worst quarter",
                detail: `Net loss ${fmtMoney(worst.p)}`,
                tone: "neg",
              });
            }
          }

          // ── Biggest comeback — find the longest run-up in airline
          //    value (or cash) starting from a trough. We walk the
          //    quarterly cash series, track the lowest cash position,
          //    and report the largest peak-to-trough recovery if it's
          //    meaningful (>$50M and spans >= 2Q).
          const cashSeries = player.financialsByQuarter
            .map((q) => ({ q: q.quarter, c: q.cash }));
          if (cashSeries.length >= 3) {
            let troughIdx = 0;
            let bestComeback = { from: 0, to: 0, gain: 0 };
            for (let i = 1; i < cashSeries.length; i++) {
              if (cashSeries[i].c < cashSeries[troughIdx].c) troughIdx = i;
              const gain = cashSeries[i].c - cashSeries[troughIdx].c;
              if (gain > bestComeback.gain) {
                bestComeback = { from: troughIdx, to: i, gain };
              }
            }
            if (bestComeback.gain >= 50_000_000 && bestComeback.to > bestComeback.from) {
              const span = bestComeback.to - bestComeback.from;
              highlights.push({
                quarter: cashSeries[bestComeback.to].q,
                kind: "comeback",
                title: "Biggest comeback",
                detail: `Recovered ${fmtMoney(bestComeback.gain)} of cash in ${span}Q (from ${fmtQuarter(cashSeries[bestComeback.from].q)})`,
                tone: "pos",
              });
            }
          }

          // ── Highest debt-stress moment — peak debt-to-airline-value
          //    ratio. Only worth surfacing when it crossed the
          //    "covenant pressure" zone (≥50%).
          const stressSeries = player.financialsByQuarter
            .map((q) => {
              // Approximate airline value from cash-debt+brandValue.
              // computeAirlineValue would be more accurate but needs
              // the team object; this is close enough for retrospect.
              const av = q.cash - q.debt + q.brandValue * 1_000_000;
              return { q: q.quarter, ratio: av > 0 ? q.debt / av : 0 };
            });
          if (stressSeries.length > 0) {
            const peak = stressSeries.reduce((acc, x) => x.ratio > acc.ratio ? x : acc, stressSeries[0]);
            if (peak.ratio >= 0.5) {
              highlights.push({
                quarter: peak.q,
                kind: "debt-stress",
                title: "Highest debt stress",
                detail: `Debt ratio peaked at ${(peak.ratio * 100).toFixed(0)}% — covenant zone`,
                tone: "neg",
              });
            }
          }

          // ── Near-collapse — any quarter where cash went deeply
          //    negative (RCF drawn aggressively).
          const negativeCashLow = cashSeries
            .filter((x) => x.c < -50_000_000)
            .sort((a, b) => a.c - b.c)[0];
          if (negativeCashLow) {
            highlights.push({
              quarter: negativeCashLow.q,
              kind: "near-collapse",
              title: "Cash crisis",
              detail: `Cash bottomed out at ${fmtMoney(negativeCashLow.c)} — overdraft territory`,
              tone: "neg",
            });
          }

          // Peak brand value quarter
          const bvSeries = player.financialsByQuarter
            .map((q) => ({ q: q.quarter, bv: q.brandValue }));
          if (bvSeries.length > 0) {
            const peak = bvSeries.reduce((acc, x) => x.bv > acc.bv ? x : acc, bvSeries[0]);
            highlights.push({
              quarter: peak.q,
              kind: "peak-bv",
              title: "Brand peak",
              detail: `Brand value reached ${peak.bv.toFixed(1)}`,
              tone: "info",
            });
          }

          // Most-impactful decisions — first 3 by quarter
          const earlyDecisions = [...player.decisions]
            .sort((a, b) => a.quarter - b.quarter)
            .slice(0, 3);
          for (const d of earlyDecisions) {
            const scenario = (SCENARIOS_BY_QUARTER[d.quarter] ?? [])
              .find((sc) => sc.id === d.scenarioId);
            if (!scenario) continue;
            highlights.push({
              quarter: d.quarter,
              kind: "milestone",
              title: scenario.title,
              detail: `Chose ${d.optionId}: ${scenario.options.find((o) => o.id === d.optionId)?.label ?? ""}`,
              tone: "info",
            });
          }

          if (highlights.length === 0) return null;
          highlights.sort((a, b) => a.quarter - b.quarter);

          return (
            <Card className="mb-6">
              <CardBody>
                <div className="flex items-baseline justify-between mb-3">
                  <h2 className="font-display text-[1.5rem] text-ink flex items-center gap-2">
                    <Sparkles size={20} /> Highlights
                  </h2>
                  <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                    Pivotal moments
                  </span>
                </div>
                <div className="relative">
                  {/* Vertical timeline rail */}
                  <div className="absolute top-0 bottom-0 left-[5.5rem] w-px bg-line" aria-hidden />
                  <div className="space-y-3">
                    {highlights.map((h, i) => (
                      <div key={`${h.kind}-${h.quarter}-${i}`} className="relative flex items-baseline gap-3">
                        <div className="font-mono tabular text-[0.6875rem] text-ink-muted w-20 text-right shrink-0 pt-1">
                          {fmtQuarter(h.quarter)}
                        </div>
                        <div
                          className={cn(
                            "shrink-0 w-2.5 h-2.5 rounded-full ring-2 ring-surface",
                            h.tone === "pos" ? "bg-positive" :
                            h.tone === "neg" ? "bg-negative" :
                            "bg-accent",
                          )}
                          aria-hidden
                        />
                        <div className="flex-1 min-w-0 pt-0.5">
                          <div className="text-[0.875rem] text-ink font-medium">
                            {h.title}
                          </div>
                          <div className="text-[0.75rem] text-ink-muted leading-snug">
                            {h.detail}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardBody>
            </Card>
          );
        })()}

        {/* Decisions retrospective — every board call this team made */}
        {player.decisions.length > 0 && (
          <Card className="mb-6">
            <CardBody>
              <h2 className="font-display text-[1.5rem] text-ink mb-3">
                Boardroom decisions · {player.decisions.length}
              </h2>
              <div className="space-y-1.5">
                {[...player.decisions]
                  .sort((a, b) => a.quarter - b.quarter)
                  .map((d) => {
                    const scenario = (SCENARIOS_BY_QUARTER[d.quarter] ?? [])
                      .find((sc) => sc.id === d.scenarioId);
                    const opt = scenario?.options.find((o) => o.id === d.optionId);
                    return (
                      <div key={`${d.scenarioId}-${d.quarter}`} className="flex items-baseline justify-between gap-3 py-1.5 border-b border-line last:border-0 text-[0.875rem]">
                        <div className="flex items-baseline gap-2 min-w-0">
                          <span className="font-mono text-[0.6875rem] text-primary tabular w-12 shrink-0">Q{d.quarter}</span>
                          <span className="font-mono text-[0.6875rem] text-ink-muted shrink-0">{d.scenarioId}</span>
                          <span className="text-ink-2 truncate">{scenario?.title ?? "Unknown"}</span>
                        </div>
                        <span className="text-accent font-mono text-[0.75rem] shrink-0">
                          {d.optionId} · {opt?.label}
                        </span>
                      </div>
                    );
                  })}
              </div>
            </CardBody>
          </Card>
        )}

        {/* Milestones unlocked across the 40-round campaign */}
        {player.milestones.length > 0 && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[1.5rem] text-ink flex items-center gap-2">
                  <Award size={20} /> Milestones unlocked
                </h2>
                <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  {player.milestones.length} of {MILESTONES.length}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {player.milestones.map((id) => {
                  const m = MILESTONES_BY_ID[id];
                  if (!m) return null;
                  return (
                    <div key={id} className="rounded-md border border-line bg-[var(--positive-soft)]/40 px-3 py-2">
                      <div className="flex items-baseline justify-between mb-0.5">
                        <span className="text-[0.875rem] font-semibold text-ink">{m.title}</span>
                        <span className="text-[0.5625rem] uppercase tracking-wider text-ink-muted">
                          {m.category}
                        </span>
                      </div>
                      <div className="text-[0.75rem] text-ink-muted leading-relaxed">{m.description}</div>
                    </div>
                  );
                })}
              </div>
            </CardBody>
          </Card>
        )}

        <Card className="mb-6">
          <CardBody>
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="font-display text-[1.5rem] text-ink">Final leaderboard</h2>
              <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                Sorted by airline value · ties broken by cash → debt → brand → loyalty
              </span>
            </div>
            <table className="w-full text-[0.9375rem]">
              <thead>
                <tr className="border-b border-line text-[0.625rem] uppercase tracking-wider text-ink-muted">
                  <th className="text-left py-2 w-10">#</th>
                  <th className="text-left py-2">Airline</th>
                  <th className="text-right py-2">Airline value</th>
                  <th className="text-right py-2 hidden md:table-cell">Cash</th>
                  <th className="text-right py-2 hidden md:table-cell">Debt</th>
                  <th className="text-right py-2 hidden md:table-cell">Brand</th>
                  <th className="text-right py-2 hidden md:table-cell">Loyalty</th>
                </tr>
              </thead>
              <tbody>
                {ranked.map((t, i) => (
                  <tr key={t.id} className={`border-b border-line last:border-0 ${t.id === player.id ? "bg-[rgba(20,53,94,0.04)]" : ""}`}>
                    <td className="py-3 w-10 font-mono text-ink-muted">{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-block w-6 h-6 rounded flex items-center justify-center font-mono text-[0.625rem] font-semibold text-primary-fg"
                          style={{ background: airlineColorFor({ colorId: t.airlineColorId, fallbackKey: t.id }).hex }}
                        >
                          {t.code}
                        </span>
                        <span className={t.id === player.id ? "font-semibold text-ink" : "text-ink-2"}>
                          {t.name}
                        </span>
                        {t.id === player.id && <Badge tone="primary">You</Badge>}
                      </div>
                    </td>
                    <td className="py-3 text-right tabular font-display text-[1.125rem]">{fmtMoney(t.finalAirlineValue)}</td>
                    <td className="py-3 text-right tabular font-mono text-[0.8125rem] text-ink-2 hidden md:table-cell">{fmtMoney(t.cashUsd)}</td>
                    <td className="py-3 text-right tabular font-mono text-[0.8125rem] text-ink-2 hidden md:table-cell">{t.totalDebtUsd > 0 ? fmtMoney(t.totalDebtUsd) : "—"}</td>
                    <td className="py-3 text-right tabular font-mono text-[0.8125rem] text-ink-2 hidden md:table-cell">{Math.round(t.brandPts)}</td>
                    <td className="py-3 text-right tabular font-mono text-[0.8125rem] text-ink-2 hidden md:table-cell">{Math.round(t.customerLoyaltyPct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>

        {/* MVP Award (PRD §15.2) */}
        {(() => {
          type MvpCandidate = { teamCode: string; teamName: string; teamColor: string; member: (typeof player.members)[number] };
          const allMembers: MvpCandidate[] = s.teams.flatMap((t) =>
            t.members.map((m) => ({ teamCode: t.code, teamName: t.name, teamColor: t.color, member: m }))
          );
          const ranked = [...allMembers].sort((a, b) => b.member.mvpPts - a.member.mvpPts);
          const winner = ranked[0];
          if (!winner || winner.member.mvpPts === 0) return null;
          return (
            <Card className="mb-10">
              <CardBody>
                <div className="flex items-baseline justify-between mb-4">
                  <h2 className="font-display text-[1.5rem] text-ink">MVP award</h2>
                  <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                    Highest individual score
                  </span>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-md border border-accent bg-[var(--accent-soft)] mb-3">
                  <span
                    className="inline-block w-8 h-8 rounded flex items-center justify-center font-mono text-[0.6875rem] font-semibold text-primary-fg shrink-0"
                    style={{ background: winner.teamColor }}
                  >
                    {winner.teamCode}
                  </span>
                  <div className="flex-1">
                    <div className="font-display text-[1.25rem] text-ink leading-tight">
                      {winner.member.name}
                    </div>
                    <div className="text-[0.75rem] text-ink-muted">
                      {winner.member.role} · {winner.teamName}
                      {winner.member.cards.length > 0 && ` · ${winner.member.cards.join(", ")}`}
                    </div>
                  </div>
                  <span className="tabular font-display text-[1.75rem] text-accent">
                    {winner.member.mvpPts}
                  </span>
                </div>
                <table className="w-full text-[0.8125rem]">
                  <tbody>
                    {ranked.slice(1, 8).map((c, i) => (
                      <tr key={`${c.teamCode}-${c.member.role}`} className="border-b border-line last:border-0">
                        <td className="py-1.5 w-10 font-mono text-ink-muted">{i + 2}</td>
                        <td className="py-1.5 text-ink-2">
                          {c.member.name}
                          <span className="ml-2 text-[0.6875rem] text-ink-muted">
                            {c.member.role} · {c.teamCode}
                          </span>
                        </td>
                        <td className="py-1.5 text-right tabular font-mono text-ink">
                          {c.member.mvpPts}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardBody>
            </Card>
          );
        })()}

        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={playAgain}>
            Begin new simulation →
          </Button>
          <Button
            variant="secondary"
            size="lg"
            onClick={() => {
              if (typeof window !== "undefined") window.print();
            }}
          >
            Export report
          </Button>
          <Link href="/">
            <Button variant="ghost" size="lg">Back to landing</Button>
          </Link>
        </div>
      </section>
    </main>
  );
}

/**
 * Podium step for the endgame top-3 visual. Gold/silver/bronze
 * styling baked into the place prop. The "step" is a vertical bar
 * sized by place (1st tallest) with the team's avatar + name + final
 * value floating above it. The player's tile is double-bordered with
 * a "You" pill so they can instantly find themselves.
 */
function PodiumStep({
  place, team, isPlayer, heightClass,
}: {
  place: 1 | 2 | 3;
  team: {
    id: string;
    name: string;
    code: string;
    color: string;
    airlineColorId?: import("@/lib/games/airline-colors").AirlineColorId | null;
    finalAirlineValue: number;
  };
  isPlayer: boolean;
  heightClass: string;
}) {
  const medal =
    place === 1 ? { emoji: "🥇", label: "Gold", border: "border-[#d4a017]", bg: "bg-[#d4a017]/15" } :
    place === 2 ? { emoji: "🥈", label: "Silver", border: "border-[#9ca3af]", bg: "bg-[#9ca3af]/15" } :
    { emoji: "🥉", label: "Bronze", border: "border-[#a16207]", bg: "bg-[#a16207]/15" };
  return (
    <div className="flex flex-col items-center">
      {/* Floating block above the step — avatar, name, final value */}
      <div
        className={cn(
          "w-full rounded-md border-2 p-3 mb-2 text-center",
          medal.border,
          medal.bg,
          isPlayer && "ring-2 ring-primary",
        )}
      >
        <div className="text-2xl leading-none mb-1.5" aria-hidden>
          {medal.emoji}
        </div>
        <div
          className="inline-flex items-center justify-center w-9 h-9 rounded mb-1.5 font-mono text-[0.6875rem] font-semibold shrink-0"
          style={{
            background: airlineColorFor({
              colorId: team.airlineColorId,
              fallbackKey: team.id,
            }).hex,
            color: airlineColorFor({
              colorId: team.airlineColorId,
              fallbackKey: team.id,
            }).textOn === "white" ? "#fff" : "#0F172A",
          }}
        >
          {team.code}
        </div>
        <div className="font-display text-[1rem] text-ink leading-tight">
          {team.name}
        </div>
        {isPlayer && (
          <div className="mt-1">
            <Badge tone="primary">You</Badge>
          </div>
        )}
        <div className="font-mono tabular text-[0.875rem] text-ink-2 mt-1.5">
          {fmtMoney(team.finalAirlineValue)}
        </div>
      </div>
      {/* The step itself — height encodes rank, place number stamped on. */}
      <div
        className={cn(
          "w-full rounded-t-md border-x border-t-2 flex items-center justify-center font-display text-[2.25rem] text-ink-muted",
          heightClass,
          medal.border,
          medal.bg,
        )}
      >
        #{place}
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: {
  label: string; value: string; tone?: "default" | "accent" | "positive" | "negative";
}) {
  const colorClass = tone === "accent" ? "text-accent" : tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
        {label}
      </div>
      <div className={`tabular font-display text-[1.75rem] leading-none mt-1 ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function ArcStat({
  label, value, icon, tone = "default",
}: {
  label: string; value: string; icon: React.ReactNode; tone?: "default" | "positive" | "negative";
}) {
  const colorClass = tone === "positive" ? "text-positive" : tone === "negative" ? "text-negative" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <div className="flex items-center gap-1.5 text-[0.625rem] uppercase tracking-wider text-ink-muted mb-1">
        {icon} {label}
      </div>
      <div className={`tabular font-mono text-[0.9375rem] font-semibold ${colorClass}`}>
        {value}
      </div>
    </div>
  );
}

function ArcSpark({ label, values, color }: { label: string; values: number[]; color: string }) {
  return (
    <div className="flex items-center gap-3 py-1">
      <span className="text-[0.75rem] text-ink-muted w-32 shrink-0">{label}</span>
      <Sparkline values={values} color={color} width={400} height={24} />
      <span className="tabular font-mono text-[0.75rem] text-ink ml-auto shrink-0 w-24 text-right">
        {values[values.length - 1] !== undefined
          ? (Math.abs(values[values.length - 1]) > 1_000_000
              ? `${(values[values.length - 1] / 1_000_000).toFixed(1)}M`
              : values[values.length - 1].toFixed(1))
          : "—"}
      </span>
    </div>
  );
}

function MultiAirlineChart({
  teams,
  totalRounds,
}: {
  teams: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
    airlineColorId?: import("@/lib/games/airline-colors").AirlineColorId | null;
    financialsByQuarter: Array<{ quarter: number; cash: number; debt: number; brandValue: number }>;
  }>;
  totalRounds: number;
}) {
  const W = 720;
  const H = 240;
  const padL = 60;
  const padR = 12;
  const padT = 10;
  const padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  // Compute series — airline value approximated as cash - debt + 100 * brandValue
  // (matches computeAirlineValue ordering without recomputing here).
  const series = teams.map((t) => {
    const points: Array<{ q: number; v: number }> = [];
    for (const f of t.financialsByQuarter) {
      points.push({ q: f.quarter, v: f.cash - f.debt + f.brandValue * 1_000_000 });
    }
    return { team: t, points };
  });

  const allValues = series.flatMap((s) => s.points.map((p) => p.v));
  const yMin = allValues.length > 0 ? Math.min(0, ...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(1, ...allValues) : 1;
  const yRange = yMax - yMin || 1;

  // Phase 3: x-axis scales by totalRounds rather than the legacy
  // 20-quarter constant so 8 / 16 / 24 / 40 round games all use the
  // full chart width. (totalRounds - 1) is the divisor because q
  // values are 1-indexed.
  const xDivisor = Math.max(1, totalRounds - 1);
  const x = (q: number) => padL + ((q - 1) / xDivisor) * innerW;
  const y = (v: number) => padT + innerH - ((v - yMin) / yRange) * innerH;

  // Y-axis ticks
  const yTicks = [yMin, yMin + yRange * 0.25, yMin + yRange * 0.5, yMin + yRange * 0.75, yMax];

  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        {/* Y gridlines */}
        {yTicks.map((tickVal, i) => {
          const ty = y(tickVal);
          return (
            <g key={i}>
              <line x1={padL} y1={ty} x2={W - padR} y2={ty} stroke="var(--line)" strokeWidth="0.5" />
              <text x={padL - 6} y={ty + 3} textAnchor="end" fontSize="9" fill="var(--ink-muted)" className="font-mono tabular">
                {Math.abs(tickVal) >= 1_000_000_000
                  ? `$${(tickVal / 1_000_000_000).toFixed(1)}B`
                  : Math.abs(tickVal) >= 1_000_000
                    ? `$${(tickVal / 1_000_000).toFixed(0)}M`
                    : `$${tickVal.toFixed(0)}`}
              </text>
            </g>
          );
        })}
        {/* X-axis labels — evenly-spaced ticks across the configured
            campaign length so 8 / 16 / 24 / 40-round games all show
            sensible date labels. Targets ~6 ticks regardless of
            totalRounds; pulls from the session value. */}
        {(() => {
          const tickCount = Math.min(7, Math.max(3, Math.round(totalRounds / 6)));
          const step = Math.max(1, Math.floor((totalRounds - 1) / (tickCount - 1)));
          const ticks: number[] = [];
          for (let q = 1; q <= totalRounds; q += step) ticks.push(q);
          if (ticks[ticks.length - 1] !== totalRounds) ticks.push(totalRounds);
          return ticks.map((q) => (
            <text key={q} x={x(q)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="var(--ink-muted)" className="font-mono tabular">
              {fmtQuarter(q)}
            </text>
          ));
        })()}
        {/* X-axis baseline */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" strokeWidth="1" />

        {/* One polyline per team */}
        {series.map(({ team, points }) => {
          if (points.length < 2) return null;
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.q).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={team.id}>
              <path d={d} stroke={airlineColorFor({ colorId: team.airlineColorId, fallbackKey: team.id }).hex} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {/* End-point marker */}
              {points.length > 0 && (() => {
                const last = points[points.length - 1];
                return <circle cx={x(last.q)} cy={y(last.v)} r="3" fill={airlineColorFor({ colorId: team.airlineColorId, fallbackKey: team.id }).hex} />;
              })()}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 px-2">
        {teams.map((t) => (
          <div key={t.id} className="flex items-center gap-1.5 text-[0.75rem]">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ background: airlineColorFor({ colorId: t.airlineColorId, fallbackKey: t.id }).hex }}
            />
            <span className="font-mono text-ink-muted">{t.code}</span>
            <span className="text-ink-2">{t.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function BVPillar({
  label, score, rows,
}: {
  label: string;
  score: number;
  rows: Array<{ k: string; v: string }>;
}) {
  return (
    <div className="rounded-md border border-line bg-surface-2/40 p-3">
      <div className="text-[0.625rem] uppercase tracking-wider text-ink-muted font-semibold mb-1">
        {label}
      </div>
      <div className="font-display text-[1.625rem] text-ink leading-none mb-2 tabular">
        {score.toFixed(1)}
      </div>
      <div className="space-y-0.5 text-[0.75rem] tabular">
        {rows.map((r) => (
          <div key={r.k} className="flex items-baseline justify-between">
            <span className="text-ink-muted">{r.k}</span>
            <span className="text-ink font-mono">{r.v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
