"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, Sparkline } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { computeAirlineValue, fleetCount, resolveEndgameAwards, brandRating, computeBrandValueBreakdown } from "@/lib/engine";
import { MILESTONES, MILESTONES_BY_ID } from "@/data/milestones";
import { SCENARIOS_BY_QUARTER } from "@/data/scenarios";
import { Award, TrendingUp, TrendingDown, Trophy } from "lucide-react";

/** Legacy titles by final Brand Value band. */
function legacyTitle(bv: number): { title: string; sub: string } {
  if (bv >= 85) return { title: "The Legend", sub: "A new benchmark for the industry. Regulators write case studies. Rivals study your playbook." };
  if (bv >= 72) return { title: "The Architect", sub: "Built a carrier that will outlive you. Your moves define the next decade." };
  if (bv >= 60) return { title: "The Operator", sub: "Solid, respected, durable. The airline that investors trust." };
  if (bv >= 45) return { title: "The Survivor", sub: "You took the hits and made it to Q20. That counts." };
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
      <main className="flex-1 flex items-center justify-center">
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
  const ranked = rankedTeams.sort((a, b) => b.finalAirlineValue - a.finalAirlineValue);
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
    <main className="flex-1 flex flex-col">
      <header className="px-8 py-5 border-b border-line flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl text-ink">SkyForce</span>
          <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            Final scoring · Q20 closed
          </span>
        </div>
      </header>

      <section className="flex-1 px-8 py-12 max-w-5xl mx-auto w-full">
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
            converged or diverged across the 20-quarter window. */}
        {ranked.length > 0 && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[1.5rem] text-ink">
                  Airline value · Q1 → Q20
                </h2>
                <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  All teams
                </span>
              </div>
              <MultiAirlineChart teams={ranked} />
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
                      style={{ background: t.color }}
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

        {/* Fun facts — quirky stats from the player's 20 quarters */}
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
            value: `${player.financialsByQuarter.length} of 20`,
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

        {/* Career arc — brand value trajectory across all 20 quarters */}
        {player.financialsByQuarter.length >= 2 && (
          <Card className="mb-6">
            <CardBody>
              <div className="flex items-baseline justify-between mb-3">
                <h2 className="font-display text-[1.5rem] text-ink">Career arc</h2>
                <span className="text-[0.6875rem] uppercase tracking-wider text-ink-muted">
                  Q1 → Q20 brand value
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

        {/* Milestones unlocked across the 20 quarters */}
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
            <h2 className="font-display text-[1.5rem] text-ink mb-4">Final leaderboard</h2>
            <table className="w-full text-[0.9375rem]">
              <tbody>
                {ranked.map((t, i) => (
                  <tr key={t.id} className={`border-b border-line last:border-0 ${t.id === player.id ? "bg-[rgba(20,53,94,0.04)]" : ""}`}>
                    <td className="py-3 w-10 font-mono text-ink-muted">{i + 1}</td>
                    <td className="py-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="inline-block w-6 h-6 rounded flex items-center justify-center font-mono text-[0.625rem] font-semibold text-primary-fg"
                          style={{ background: t.color }}
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

function MultiAirlineChart({ teams }: { teams: Array<{ id: string; name: string; code: string; color: string; financialsByQuarter: Array<{ quarter: number; cash: number; debt: number; brandValue: number }> }> }) {
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

  const x = (q: number) => padL + ((q - 1) / 19) * innerW;
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
        {/* X-axis labels (Q1, Q5, Q10, Q15, Q20) */}
        {[1, 5, 10, 15, 20].map((q) => (
          <text key={q} x={x(q)} y={H - padB + 14} textAnchor="middle" fontSize="9" fill="var(--ink-muted)" className="font-mono tabular">
            Q{q}
          </text>
        ))}
        {/* X-axis baseline */}
        <line x1={padL} y1={H - padB} x2={W - padR} y2={H - padB} stroke="var(--line)" strokeWidth="1" />

        {/* One polyline per team */}
        {series.map(({ team, points }) => {
          if (points.length < 2) return null;
          const d = points.map((p, i) => `${i === 0 ? "M" : "L"} ${x(p.q).toFixed(1)} ${y(p.v).toFixed(1)}`).join(" ");
          return (
            <g key={team.id}>
              <path d={d} stroke={team.color} strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
              {/* End-point marker */}
              {points.length > 0 && (() => {
                const last = points[points.length - 1];
                return <circle cx={x(last.q)} cy={y(last.v)} r="3" fill={team.color} />;
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
              style={{ background: t.color }}
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
