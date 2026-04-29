"use client";

/**
 * /simulations — full portfolio view of every ICAN simulation.
 *
 * Visitors see the live Airline simulation plus the upcoming
 * pipeline (Banking, Hospitality, Agriculture, Real Estate,
 * Healthcare) with enough detail to picture each sector's
 * stress-test surface — decision domains, real-world dynamics
 * modeled, success-metric examples.
 *
 * Design intent (per ICAN-CRM marketing aesthetic):
 *   - dark hero, brand teal accents, generous whitespace
 *   - alternating-pattern detail rows so each simulation gets a
 *     "page within the page" feel rather than a flat grid
 *   - "Live now" / "In design" / "On the roadmap" status pills
 *     with three distinct treatments
 *   - early-access CTA pointing at info@icanmena.com so industry
 *     leaders can request a specific simulation be prioritized
 */

import Link from "next/link";
import {
  ArrowRight, ArrowLeft, Sparkles, Plane, Landmark, Hotel, Wheat,
  Building2, Stethoscope, Mail, Star, Clock, Target,
  type LucideIcon,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

type Status = "live" | "in-design" | "roadmap";
type Accent = "cyan" | "violet" | "emerald" | "amber" | "rose" | "sky";

interface Sim {
  slug: string;
  name: string;
  industry: string;
  status: Status;
  Icon: LucideIcon;
  accent: Accent;
  pitch: string;
  question: string;
  decisions: string[];
  realWorld: string[];
  competencies: string[];
}

const SIMS: Sim[] = [
  {
    slug: "airline",
    name: "Airline",
    industry: "Aviation",
    status: "live",
    Icon: Plane,
    accent: "cyan",
    pitch:
      "Run a global airline. Open routes across hundreds of cities, fight for slots, hedge fuel through every market shock.",
    question: "How does your team allocate capital under crisis pressure?",
    decisions: [
      "Network design + slot auctions",
      "Fleet acquisition + lease vs. buy",
      "Cabin design + per-class pricing",
      "Fuel hedging + cash discipline",
      "Cargo + premium product mix",
    ],
    realWorld: [
      "Real-world Jet A1 fuel band (USD/L)",
      "Per-OD demand pools split by class",
      "Rival pressure based on actual route overlap",
      "Slot scarcity + seasonal demand pulses",
    ],
    competencies: [
      "Capital allocation under uncertainty",
      "Crisis response timing",
      "Cross-functional trade-offs",
      "Long-horizon brand investment",
    ],
  },
  {
    slug: "banking",
    name: "Banking & Capital Markets",
    industry: "Banking",
    status: "in-design",
    Icon: Landmark,
    accent: "violet",
    pitch:
      "Lead a commercial bank. Set credit policy, manage capital ratios, navigate regulator stress tests, and survive a credit cycle.",
    question:
      "How does your team balance loan growth against capital adequacy?",
    decisions: [
      "Loan book composition + risk appetite",
      "Treasury + balance-sheet duration",
      "Capital raises + deposit pricing",
      "Loss provisioning + recoveries",
      "Branch / digital channel mix",
    ],
    realWorld: [
      "Basel-style capital + liquidity ratios",
      "Yield-curve shifts driving NIM",
      "Default-rate cycles by sector",
      "Regulatory stress-test simulations",
    ],
    competencies: [
      "Risk-adjusted underwriting",
      "Crisis liquidity management",
      "Capital deployment discipline",
      "Regulator + board communication",
    ],
  },
  {
    slug: "hospitality",
    name: "Hospitality",
    industry: "Hospitality",
    status: "in-design",
    Icon: Hotel,
    accent: "emerald",
    pitch:
      "Run a hotel and resort portfolio. Manage rate, occupancy, brand mix, and capital projects through tourism cycles.",
    question:
      "How does your team balance RevPAR optimization against brand investment?",
    decisions: [
      "Property acquisition + brand mix",
      "Revenue management + dynamic rate",
      "F&B and ancillary revenue strategy",
      "CapEx renovation + repositioning",
      "Loyalty program + direct booking",
    ],
    realWorld: [
      "Tourism demand cycles by region",
      "OTA commission pressure on margins",
      "Brand-standard CapEx requirements",
      "Labour cost + service quality trade-off",
    ],
    competencies: [
      "Yield management discipline",
      "Long-cycle CapEx judgement",
      "Brand vs. margin trade-offs",
      "Multi-property portfolio thinking",
    ],
  },
  {
    slug: "agriculture",
    name: "Agriculture",
    industry: "Agribusiness",
    status: "roadmap",
    Icon: Wheat,
    accent: "amber",
    pitch:
      "Run a diversified agribusiness. Manage land, commodity exposure, weather risk, and a long-cycle supply chain.",
    question:
      "How does your team hedge commodity exposure across weather cycles?",
    decisions: [
      "Crop mix + rotation strategy",
      "Land acquisition + leasing",
      "Commodity hedging + offtake contracts",
      "Storage + logistics capacity",
      "Sustainability + certification",
    ],
    realWorld: [
      "Weather-driven yield variability",
      "Commodity futures markets",
      "Seasonal cash-flow tightness",
      "Trade policy + tariff shocks",
    ],
    competencies: [
      "Long-cycle planning under uncertainty",
      "Commodity risk management",
      "Working-capital discipline",
      "Sustainability + ESG navigation",
    ],
  },
  {
    slug: "real-estate",
    name: "Real Estate",
    industry: "Real Estate",
    status: "roadmap",
    Icon: Building2,
    accent: "rose",
    pitch:
      "Build and run a property portfolio. Acquisition, development, leasing, capital structure — through real-estate cycles.",
    question:
      "How does your team time acquisitions against the capital cycle?",
    decisions: [
      "Asset-class allocation (office / retail / logistics / resi)",
      "Acquisition vs. develop vs. dispose",
      "Capital stack + debt covenants",
      "Lease structure + tenant mix",
      "Major refurb / repositioning timing",
    ],
    realWorld: [
      "Cap-rate compression + expansion cycles",
      "Interest-rate sensitivity on valuations",
      "Tenant default + lease renewal dynamics",
      "Construction cost + delivery risk",
    ],
    competencies: [
      "Cycle-aware capital allocation",
      "Underwriting discipline",
      "Tenant + asset risk concentration",
      "Stakeholder + co-investor management",
    ],
  },
  {
    slug: "healthcare",
    name: "Healthcare",
    industry: "Healthcare Systems",
    status: "roadmap",
    Icon: Stethoscope,
    accent: "sky",
    pitch:
      "Run a hospital network. Balance capacity, payor mix, clinical outcomes, and regulatory pressure under workforce constraints.",
    question:
      "How does your team trade off capacity expansion against operational excellence?",
    decisions: [
      "Service-line expansion + specialty mix",
      "Payor contracting + revenue cycle",
      "Workforce planning + clinician retention",
      "Capital projects + technology adoption",
      "Quality + outcomes investment",
    ],
    realWorld: [
      "Demographic + epidemiological trends",
      "Payor mix shifts + reimbursement pressure",
      "Workforce shortages + cost inflation",
      "Regulatory + accreditation cycles",
    ],
    competencies: [
      "Mission-vs-margin trade-off discipline",
      "Long-cycle workforce planning",
      "Outcomes + quality leadership",
      "Multi-stakeholder trade-off",
    ],
  },
];

const ACCENT_RING: Record<Accent, string> = {
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
};
const ACCENT_DARK: Record<Accent, string> = {
  cyan: "bg-cyan-500/15 text-cyan-300 ring-cyan-500/20",
  violet: "bg-violet-500/15 text-violet-300 ring-violet-500/20",
  emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-500/20",
  amber: "bg-amber-500/15 text-amber-300 ring-amber-500/20",
  rose: "bg-rose-500/15 text-rose-300 ring-rose-500/20",
  sky: "bg-sky-500/15 text-sky-300 ring-sky-500/20",
};
const ACCENT_TEXT: Record<Accent, string> = {
  cyan: "text-cyan-600",
  violet: "text-violet-600",
  emerald: "text-emerald-600",
  amber: "text-amber-600",
  rose: "text-rose-600",
  sky: "text-sky-600",
};

const STATUS_PILL: Record<Status, { label: string; bg: string }> = {
  live: { label: "Live now", bg: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  "in-design": { label: "In design", bg: "bg-violet-50 text-violet-700 ring-violet-100" },
  roadmap: { label: "On the roadmap", bg: "bg-slate-100 text-slate-600 ring-slate-200" },
};

export default function SimulationsPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      <MarketingHeader />

      {/* HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
          <div className="absolute top-40 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-3xl" />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
              backgroundSize: "24px 24px",
            }}
          />
        </div>

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-24 lg:pt-28 lg:pb-32">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 hover:text-white transition-colors mb-8"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to home
          </Link>

          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="text-[11px] font-semibold text-cyan-100 uppercase tracking-wider">
              The simulation portfolio
            </span>
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold tracking-tight leading-[1.05] max-w-3xl mb-6">
            Six industries.
            <br />
            <span className="text-cyan-300">One platform.</span>
          </h1>
          <p className="text-lg text-slate-400 max-w-2xl leading-relaxed mb-8">
            ICAN&rsquo;s executive simulations model the operating reality of
            an entire industry — capital, talent, regulation, and rival
            pressure all moving at once. The Airline simulation ships first;
            the next five are designed alongside the leaders who&rsquo;ll use
            them.
          </p>

          {/* Quick legend */}
          <div className="flex flex-wrap items-center gap-3">
            <StatusLegend status="live" />
            <StatusLegend status="in-design" />
            <StatusLegend status="roadmap" />
          </div>
        </div>
      </section>

      {/* SIMULATION DETAIL ROWS ───────────────────────────────── */}
      <section className="bg-white">
        {SIMS.map((sim, i) => (
          <SimRow key={sim.slug} sim={sim} flipped={i % 2 === 1} />
        ))}
      </section>

      {/* EARLY ACCESS BLOCK ───────────────────────────────────── */}
      <section className="relative py-24 bg-gradient-to-b from-white to-cyan-50/40">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-50 ring-4 ring-cyan-100 text-cyan-700 mb-5">
            <Mail className="w-5 h-5" />
          </div>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-4">
            Want a specific industry prioritized?
          </h2>
          <p className="text-base text-slate-500 mb-8 max-w-xl mx-auto leading-relaxed">
            We design the next simulation alongside the leaders who&rsquo;ll
            run it. If your team needs Banking, Hospitality, Agriculture,
            Real Estate, Healthcare — or an industry that&rsquo;s not on the
            roadmap — get in touch and we&rsquo;ll talk through it.
          </p>
          <a
            href="mailto:info@icanmena.com?subject=Simulation%20early%20access"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#00C2CB] text-white text-sm font-semibold rounded-full hover:bg-[#00a9b1] transition-colors shadow-[0_8px_30px_-8px_rgba(0,194,203,0.5)]"
          >
            Email info@icanmena.com <ArrowRight className="w-4 h-4" />
          </a>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function StatusLegend({ status }: { status: Status }) {
  const cfg = STATUS_PILL[status];
  return (
    <span
      className={
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset bg-white/5 text-slate-300 ring-white/10"
      }
    >
      <span className={
        "w-2 h-2 rounded-full " +
        (status === "live" ? "bg-emerald-400" :
          status === "in-design" ? "bg-violet-400" : "bg-slate-500")
      } />
      {cfg.label}
    </span>
  );
}

function SimRow({ sim, flipped }: { sim: Sim; flipped: boolean }) {
  const Icon = sim.Icon;
  const ring = ACCENT_RING[sim.accent];
  const pillCls = STATUS_PILL[sim.status];
  const accentText = ACCENT_TEXT[sim.accent];

  return (
    <div
      id={sim.slug}
      className={
        "scroll-mt-20 border-b border-slate-100 last:border-b-0 py-20 lg:py-24 " +
        (flipped ? "bg-slate-50/60" : "bg-white")
      }
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className={
          "grid lg:grid-cols-12 gap-12 items-start " +
          (flipped ? "" : "")
        }>
          {/* Identity card */}
          <div className={
            "lg:col-span-4 " + (flipped ? "lg:order-last" : "")
          }>
            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-2xl ring-4 mb-5 ${ring}`}>
              <Icon className="w-6 h-6" strokeWidth={1.75} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-2">
              {sim.industry}
            </p>
            <h3 className="text-3xl md:text-4xl font-display font-bold text-slate-900 leading-tight mb-3">
              {sim.name}
            </h3>
            <span
              className={
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset mb-5 " +
                pillCls.bg
              }
            >
              <span className={
                "w-1.5 h-1.5 rounded-full " +
                (sim.status === "live" ? "bg-emerald-500" :
                  sim.status === "in-design" ? "bg-violet-500" : "bg-slate-400")
              } />
              {pillCls.label}
            </span>
            <p className="text-base text-slate-500 leading-relaxed mb-6">
              {sim.pitch}
            </p>
            {sim.status === "live" ? (
              <Link
                href="/lobby"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold transition-colors"
              >
                Play the Airline simulation <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <a
                href={`mailto:info@icanmena.com?subject=${encodeURIComponent(`${sim.name} early access`)}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-900 text-sm font-semibold transition-colors"
              >
                Request early access <ArrowRight className="w-4 h-4" />
              </a>
            )}
          </div>

          {/* Detail panels */}
          <div className="lg:col-span-8 space-y-6">
            {/* Hero question */}
            <div className="rounded-2xl bg-slate-950 text-white p-6 md:p-7 relative overflow-hidden">
              <div className={`absolute top-0 right-0 w-[300px] h-[300px] rounded-full blur-3xl -mr-20 -mt-20 opacity-25 ${
                sim.accent === "cyan" ? "bg-cyan-500" :
                sim.accent === "violet" ? "bg-violet-500" :
                sim.accent === "emerald" ? "bg-emerald-500" :
                sim.accent === "amber" ? "bg-amber-500" :
                sim.accent === "rose" ? "bg-rose-500" : "bg-sky-500"
              }`} />
              <p className="relative text-[11px] font-semibold uppercase tracking-widest text-slate-400 mb-3">
                The question this simulation answers
              </p>
              <p className="relative text-xl md:text-2xl font-display font-semibold text-white leading-snug">
                &ldquo;{sim.question}&rdquo;
              </p>
            </div>

            {/* Triple panel — decisions / real-world / competencies */}
            <div className="grid md:grid-cols-3 gap-4">
              <DetailPanel
                icon={<Target className="w-4 h-4" />}
                eyebrow="Decision domains"
                accent={sim.accent}
                items={sim.decisions}
              />
              <DetailPanel
                icon={<Star className="w-4 h-4" />}
                eyebrow="Real-world dynamics"
                accent={sim.accent}
                items={sim.realWorld}
              />
              <DetailPanel
                icon={<Clock className="w-4 h-4" />}
                eyebrow="Competencies tested"
                accent={sim.accent}
                items={sim.competencies}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  icon, eyebrow, accent, items,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  accent: Accent;
  items: string[];
}) {
  const ring = ACCENT_RING[accent];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className={`shrink-0 w-7 h-7 rounded-lg ring-4 flex items-center justify-center ${ring}`}>
          {icon}
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">
          {eyebrow}
        </p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item}
            className="text-sm text-slate-600 leading-snug pl-3 border-l-2 border-slate-100"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
