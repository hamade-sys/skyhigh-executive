"use client";

/**
 * /about — long-form marketing page that drills past the landing
 * hero. Anchored sections (#how, #features, #doctrines, #faq,
 * #facilitators) so footer links from other pages resolve.
 */

import Link from "next/link";
import {
  ArrowRight, Sparkles, Plane, ClipboardList,
  CheckCircle2, MapPin, Users, Trophy, Wallet,
  ClipboardCheck, PenTool, Mic, Gauge, GraduationCap,
  type LucideIcon,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function AboutPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      <MarketingHeader current="about" />

      <main>
        {/* Hero */}
        <section className="relative bg-white border-b border-slate-100">
          <div className="max-w-4xl mx-auto px-6 py-20 lg:py-24 text-center">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-50 border border-cyan-100 mb-6">
              <Sparkles className="w-3 h-3 text-cyan-600" />
              <span className="text-[11px] font-semibold text-cyan-700 uppercase tracking-wider">
                Executive simulations by ICAN MENA
              </span>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight text-slate-900 mb-6 leading-[1.05]">
              The simulation
              <br />
              <span className="text-slate-500">senior leaders actually use.</span>
            </h1>
            <p className="text-lg text-slate-500 max-w-2xl mx-auto leading-relaxed">
              ICAN MENA builds executive simulations for boards and operating
              teams that need a strategy lab — not a board game. Each
              simulation models the operating reality of one industry.
              The Airline simulation is the first to ship; Banking,
              Hospitality, Agriculture, Real Estate, and Healthcare are next.
            </p>
          </div>
        </section>

        {/* How we work with clients */}
        <MethodologySection />

        {/* How it works */}
        <Section
          id="how"
          eyebrow="How a round plays"
          heading="Five steps. Same rhythm in every simulation."
          accent="cyan"
        >
          <ol className="space-y-6 mt-8">
            <Step n={1} title="Make industry decisions" desc="In the Airline simulation: pick cities, aircraft, fares, slot bids. In Banking: write loans, set capital ratios. In Hospitality: pick property mix and rate. Each simulation models its sector's real moves." />
            <Step n={2} title="Tune the ops sliders" desc="Six universal dials shape payroll, brand, loyalty, and cost discipline. Each tick has a real downstream effect — service at 5 lifts loyalty but blows up payroll." />
            <Step n={3} title="Resolve any board scenarios" desc="Some rounds ship a boardroom decision. Cyber breach. Hedge timing. Government deals. Each option is a real trade-off — one outcome wins this round, costs next." />
            <Step n={4} title="Advance the round" desc="The engine settles markets, demand, costs, debt service, brand drift, milestones — and writes the executive digest." />
            <Step n={5} title="Read, adapt, repeat" desc="Round close shows what happened. Then you walk into the next round." />
          </ol>
        </Section>

        {/* Features */}
        <Section
          id="features"
          eyebrow="Inside the Airline simulation"
          heading="Every lever the executive actually pulls."
          accent="violet"
          tone="dim"
        >
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-6 mt-8">
            {[
              { icon: <Plane />, title: "Fleet & cabin", text: "Buy or lease across many aircraft families. Custom cabin layouts. Engine retrofits, eco upgrades, fuselage coatings." },
              { icon: <MapPin />, title: "Network & slots", text: "Hundreds of cities. Bid against rivals at scarce airports. Per-class fares with physics-real schedule caps." },
              { icon: <Wallet />, title: "Finance", text: "Term loans, RCF, lease residuals, fuel hedging. Tax-loss carry-forward. CFO-grade cash discipline." },
              { icon: <Users />, title: "People & ops", text: "Six dials — staff, marketing, service, rewards, ops, customer service. Brand and loyalty curves follow." },
              { icon: <ClipboardList />, title: "Board scenarios", text: "Boardroom decisions ripple for rounds. Locked-in choices reshape strategy mid-game." },
              { icon: <Trophy />, title: "Endgame scoring", text: "Airline value at the final round = brand × ops × loyalty × cash. Comeback bonuses, debt-stress callouts, legacy title earned." },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="shrink-0 w-9 h-9 rounded-lg bg-violet-50 ring-4 ring-violet-100 text-violet-700 flex items-center justify-center">
                  {f.icon}
                </div>
                <div>
                  <h3 className="text-base font-semibold text-slate-900 mb-1.5">{f.title}</h3>
                  <p className="text-sm text-slate-500 leading-relaxed">{f.text}</p>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* Doctrines */}
        <Section
          id="doctrines"
          eyebrow="Pick a strategy"
          heading="Four doctrines. Pick one. Live with it."
          accent="emerald"
        >
          <div className="grid md:grid-cols-2 gap-5 mt-8">
            {[
              { name: "Budget Airline", desc: "Build around access and efficiency. Reach price-sensitive travelers. Downturns hit harder." },
              { name: "Premium Airline", desc: "Compete on service, brand, cabin quality. Price above market. Pay for it in payroll." },
              { name: "Cargo Dominance", desc: "Use every connection as a logistics corridor. Cargo capacity compounds." },
              { name: "Global Network", desc: "Grow a connected international system. Mixed fleet brands cost more to maintain." },
            ].map((d) => (
              <div key={d.name} className="rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-base font-semibold text-slate-900 mb-1.5">{d.name}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{d.desc}</p>
              </div>
            ))}
          </div>
        </Section>

        {/* For Game Masters */}
        <Section
          id="facilitators"
          eyebrow="For Game Masters"
          heading="Run an executive workshop."
          accent="amber"
          tone="dim"
        >
          <div className="grid md:grid-cols-2 gap-8 mt-8">
            <div>
              <p className="text-base text-slate-600 leading-relaxed mb-4">
                Create a private game, share the 4-digit code, watch teams
                claim seats from their own laptops. Switch the active view,
                force the round close, push live admin overrides, review the
                audit log — all from one console. The Game Master role is
                optional and exclusive: at most one per game.
              </p>
              <Link
                href="/games/new"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-slate-700"
              >
                Create a session <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
            <ul className="space-y-2.5">
              {[
                "4-digit join code, lockable lobby, reissue support",
                "Per-team view switching for live coaching moments",
                "Force-close + reopen the round with full audit log",
                "Game Master role is optional and exclusive (max 1 per game)",
                "Cohort licensing available — email info@icanmena.com",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2 text-sm text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </Section>

        {/* FAQ */}
        <Section
          id="faq"
          eyebrow="Common questions"
          heading="FAQ."
          accent="cyan"
        >
          <dl className="mt-8 grid md:grid-cols-2 gap-x-10 gap-y-7">
            {[
              { q: "How long is a session?", a: "Configurable. Hosts set the round count at create time (8/16/24/40). Solo learners often play short sessions; cohort workshops run 2-4 hours with discussion between rounds." },
              { q: "Can I save and resume?", a: "Yes. Solo runs persist in your browser; signing in saves them across devices. Multiplayer state lives server-side and reconnects on refresh." },
              { q: "Is there a tutorial?", a: "The first solo run walks you through brand-building (doctrine, hub, sliders). The map HUD explains route picking step-by-step until you've launched a route." },
              { q: "Can I review past decisions?", a: "Yes. The endgame screen shows every board decision you made, the alternatives, and the consequences that fired in later rounds." },
              { q: "Does it work on mobile?", a: "Onboarding and marketing pages do. The game canvas itself is desktop-first (1024px+). Cohort sessions work better with a laptop or tablet at minimum." },
              { q: "What other simulations are coming?", a: <>Banking, Hospitality, Agriculture, Real Estate, and Healthcare — built on the same engine and round loop, with industry-specific decisions inside each round. Email <a className="text-cyan-700 underline" href="mailto:info@icanmena.com">info@icanmena.com</a> if you want early access to a specific industry.</> },
              { q: "Who built it?", a: <>The simulations are products of <a className="text-cyan-700 underline" href="https://www.icanmena.com" target="_blank" rel="noreferrer">ICAN MENA</a>, the consulting firm based in Dubai. We use them ourselves with our boards.</> },
            ].map((row) => (
              <div key={row.q}>
                <dt className="text-base font-semibold text-slate-900 mb-2">{row.q}</dt>
                <dd className="text-sm text-slate-500 leading-relaxed">{row.a}</dd>
              </div>
            ))}
          </dl>
        </Section>

        {/* Final CTA */}
        <section className="relative py-20 bg-gradient-to-b from-white to-cyan-50/40">
          <div className="max-w-3xl mx-auto px-6 text-center">
            <h2 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-4">
              Take the controls.
            </h2>
            <p className="text-base text-slate-500 mb-8">
              Solo run starts at /onboarding. No setup, no signup.
            </p>
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 px-6 py-3.5 bg-slate-900 text-white text-sm font-semibold rounded-full hover:bg-slate-800 transition-colors"
              >
                Play solo <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/lobby"
                className="inline-flex items-center gap-1.5 px-5 py-3 text-sm font-medium text-slate-600 hover:text-slate-900"
              >
                Browse public lobby →
              </Link>
            </div>
          </div>
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function Section({
  id, eyebrow, heading, accent, tone, children,
}: {
  id: string;
  eyebrow: string;
  heading: string;
  accent: "cyan" | "violet" | "emerald" | "amber";
  tone?: "dim";
  children: React.ReactNode;
}) {
  const accentText = {
    cyan: "text-cyan-600",
    violet: "text-violet-600",
    emerald: "text-emerald-600",
    amber: "text-amber-600",
  }[accent];
  return (
    <section
      id={id}
      className={
        "scroll-mt-24 py-20 lg:py-24 border-b border-slate-100 last:border-b-0 " +
        (tone === "dim" ? "bg-slate-50/60" : "bg-white")
      }
    >
      <div className="max-w-5xl mx-auto px-6">
        <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${accentText}`}>
          {eyebrow}
        </p>
        <h2 className="text-3xl md:text-4xl font-display font-bold text-slate-900 tracking-tight leading-tight">
          {heading}
        </h2>
        {children}
      </div>
    </section>
  );
}

function Step({ n, title, desc }: { n: number; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-5">
      <div className="shrink-0 w-10 h-10 rounded-xl bg-slate-900 text-white font-mono text-sm font-bold tabular flex items-center justify-center">
        {n}
      </div>
      <div className="flex-1 min-w-0 pt-1.5">
        <h3 className="text-base font-semibold text-slate-900 mb-1.5">{title}</h3>
        <p className="text-sm text-slate-500 leading-relaxed">{desc}</p>
      </div>
    </li>
  );
}

// ============================================================================
// Methodology section — how ICAN works with clients
// ============================================================================

interface MethodStage {
  Icon: LucideIcon;
  accent: "cyan" | "violet" | "emerald" | "amber" | "rose";
  duration: string;
  title: string;
  intro: string;
  outputs: string[];
  example?: string;
}

const STAGES: MethodStage[] = [
  {
    Icon: ClipboardCheck,
    accent: "cyan",
    duration: "Week 1",
    title: "Discovery — what are you actually trying to develop?",
    intro:
      "We start with the competencies your team needs to stress-test, not the simulation we want to sell. Capital allocation discipline? Crisis-response timing? Cross-functional trade-offs? Long-cycle CapEx judgement? Whatever the muscles are, we list them with you.",
    outputs: [
      "Competency map (4-8 named muscles to develop)",
      "Audience profile — who participates, what level, what context",
      "Industry + scenario constraints from the client",
      "Success criteria draft (measurable + observable)",
    ],
    example:
      "A regional bank wanted to test capital allocation under regulator pressure. We listed seven concrete competencies — from asset-quality reading to board communication under duress — before opening any sim software.",
  },
  {
    Icon: PenTool,
    accent: "violet",
    duration: "Weeks 2-4",
    title: "Design — bespoke in-sim mechanics + live-action moments",
    intro:
      "We design two layers in parallel. The in-simulation mechanics (decisions, market dynamics, rivals) target each competency with measurable touchpoints. The live-action moments (board calls, regulator press conferences, M&A approaches) are scripted by ICAN consultants and dropped into the run at the right moment, so participants feel the pressure of the real role.",
    outputs: [
      "Custom decision domains tuned to the competency map",
      "Live-action scenario scripts (board, regulator, media, M&A)",
      "Industry calibration — real cost curves, real cycles",
      "Game Master playbook + facilitation guide",
    ],
    example:
      "For the bank, we wove a regulator stress test into Round 6, then a hostile acquisition approach in Round 9 — each one was a live-action call with an ICAN consultant playing the regulator / acquirer in real time over Zoom.",
  },
  {
    Icon: Mic,
    accent: "emerald",
    duration: "Workshop day",
    title: "Run — close-to-real-world environment",
    intro:
      "Cohorts run the simulation in a high-fidelity setting that mirrors the actual operating environment: timed decisions, real market data shape, named rivals modeled on competitors they recognize, regulatory and media pressure injected as live-action calls. Game Masters from ICAN drive the room, time the scenarios, and capture the behaviour, not just the numbers.",
    outputs: [
      "Live-facilitated workshop (half-day to multi-day)",
      "Per-team observation against the competency map",
      "Live-action scenarios delivered by ICAN consultants",
      "Continuous decision + behaviour capture",
    ],
  },
  {
    Icon: Gauge,
    accent: "amber",
    duration: "Same day",
    title: "Measure — define and score against success metrics",
    intro:
      "Every competency on the map has an explicit success metric defined at design time — quality of decision, time to decision, recovery from setbacks, communication clarity, trade-off discipline. We score each team and each individual on those, with both quantitative engine output and qualitative observation by the ICAN consultant facilitating.",
    outputs: [
      "Per-team competency scorecard",
      "Per-individual behavioural observations",
      "Cohort comparison + benchmark insights",
      "Specific examples + verbatim quotes from the run",
    ],
    example:
      "On the regulator-stress round, we scored each bank team on three things: speed of liquidity response, communication clarity to the regulator, and willingness to admit risk. One team excelled at #1 but was deflective on #3 — exactly the muscle their CEO had asked us to build.",
  },
  {
    Icon: GraduationCap,
    accent: "rose",
    duration: "Weeks following",
    title: "Develop — turn the run into a learning experience",
    intro:
      "The simulation is the catalyst, not the deliverable. We translate every score and observation into a development plan the participant + their manager can actually use: targeted reading, mentor pairings, on-the-job stretch assignments, follow-up coaching sessions. The L&D wrapper is what makes the simulation stick.",
    outputs: [
      "Individual development plan per participant",
      "Manager debrief + coaching brief",
      "Cohort-level development themes for L&D leadership",
      "Optional follow-up coaching sessions with ICAN",
    ],
  },
];

function MethodologySection() {
  return (
    <section
      id="methodology"
      className="scroll-mt-24 relative overflow-hidden bg-slate-950 text-white"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 py-24 lg:py-32">
        <div className="max-w-3xl mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-300 mb-3">
            How we work with clients
          </p>
          <h2 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05] mb-6">
            Built around your
            <br />
            <span className="text-cyan-300">competencies.</span>
          </h2>
          <p className="text-lg text-slate-300 leading-relaxed">
            We don&rsquo;t sell off-the-shelf simulations. Clients tell us what
            their teams need to stress-test — capital allocation, crisis
            response, M&amp;A judgement, board communication — and we build a
            close-to-real-world simulation around exactly those competencies,
            run it ourselves, score it against pre-defined metrics, and turn
            the result into an L&amp;D experience.
          </p>
        </div>

        {/* Process timeline */}
        <div className="relative">
          {/* Vertical line connecting stages on desktop */}
          <div
            aria-hidden
            className="hidden lg:block absolute left-[27px] top-12 bottom-12 w-px bg-gradient-to-b from-cyan-400/40 via-violet-400/30 to-rose-400/30"
          />

          <ol className="space-y-10 lg:space-y-14">
            {STAGES.map((stage, i) => (
              <MethodStageRow key={stage.title} stage={stage} index={i + 1} />
            ))}
          </ol>
        </div>

        {/* Closing band */}
        <div className="mt-20 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 md:p-10">
          <div className="grid md:grid-cols-3 gap-8">
            <Pillar
              eyebrow="Why this works"
              title="Real-world fidelity"
              desc="Every market dynamic, every rival, every scenario is shaped by ICAN consultants who&rsquo;ve actually advised in the industry. Participants react to it the way they&rsquo;d react in the actual role."
            />
            <Pillar
              eyebrow="What changes"
              title="Behaviour, not knowledge"
              desc="The simulation surfaces decision-making behaviour under pressure — exactly what gets tested in real boardrooms and is invisible in classroom training."
            />
            <Pillar
              eyebrow="What you get back"
              title="Action, not assessment"
              desc="Per-individual development plans, manager coaching briefs, cohort-level L&amp;D themes. The score is a means to a development action, not a deliverable in itself."
            />
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex items-center justify-center">
          <a
            href="mailto:info@icanmena.com?subject=Custom%20simulation%20engagement"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#00C2CB] text-white text-sm font-semibold rounded-full hover:bg-[#00a9b1] transition-colors shadow-[0_8px_30px_-8px_rgba(0,194,203,0.5)]"
          >
            Discuss a custom engagement <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </div>
    </section>
  );
}

function MethodStageRow({ stage, index }: { stage: MethodStage; index: number }) {
  const Icon = stage.Icon;
  const ringDark = {
    cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
    violet: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
    amber: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
    rose: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
  }[stage.accent];
  const accentText = {
    cyan: "text-cyan-300",
    violet: "text-violet-300",
    emerald: "text-emerald-300",
    amber: "text-amber-300",
    rose: "text-rose-300",
  }[stage.accent];

  return (
    <li className="grid lg:grid-cols-12 gap-6 lg:gap-10">
      {/* Number + icon column */}
      <div className="lg:col-span-3 flex lg:flex-col items-start gap-4 lg:gap-3">
        <div className="relative shrink-0">
          <div className={`w-14 h-14 rounded-2xl ring-4 flex items-center justify-center ${ringDark} relative z-10 bg-slate-950/80 backdrop-blur-sm`}>
            <Icon className="w-6 h-6" strokeWidth={1.75} />
          </div>
          <div className="absolute -top-1.5 -right-1.5 w-7 h-7 rounded-full bg-white text-slate-900 font-mono text-xs font-bold tabular flex items-center justify-center z-20 shadow-md">
            {String(index).padStart(2, "0")}
          </div>
        </div>
        <div>
          <p className={`text-xs font-semibold uppercase tracking-widest ${accentText} mb-1`}>
            Stage {index} · {stage.duration}
          </p>
        </div>
      </div>

      {/* Content column */}
      <div className="lg:col-span-9">
        <h3 className="text-2xl md:text-3xl font-display font-bold text-white tracking-tight leading-snug mb-3">
          {stage.title}
        </h3>
        <p className="text-base text-slate-300 leading-relaxed mb-6 max-w-3xl">
          {stage.intro}
        </p>

        <div className="grid md:grid-cols-2 gap-5">
          {/* Outputs */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
              What lands at the end of this stage
            </p>
            <ul className="space-y-2">
              {stage.outputs.map((o) => (
                <li
                  key={o}
                  className="flex items-start gap-2 text-sm text-slate-200 leading-relaxed"
                >
                  <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${accentText}`} />
                  {o}
                </li>
              ))}
            </ul>
          </div>

          {/* Example (when present) */}
          {stage.example && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                In practice
              </p>
              <p className="text-sm text-slate-300 italic leading-relaxed">
                &ldquo;{stage.example}&rdquo;
              </p>
            </div>
          )}
        </div>
      </div>
    </li>
  );
}

function Pillar({
  eyebrow, title, desc,
}: {
  eyebrow: string;
  title: string;
  desc: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-cyan-300 mb-2">
        {eyebrow}
      </p>
      <h4 className="text-lg font-display font-bold text-white mb-2">
        {title}
      </h4>
      <p className="text-sm text-slate-300 leading-relaxed">
        {desc}
      </p>
    </div>
  );
}
