"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge, Button, Card, CardBody, Sparkline } from "@/components/ui";
import { fmtMoney, fmtPct } from "@/lib/format";
import { useGame, selectPlayer } from "@/store/game";
import { computeAirlineValue, fleetCount, resolveEndgameAwards, brandRating } from "@/lib/engine";
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
