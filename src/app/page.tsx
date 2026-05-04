"use client";

/**
 * `/` — ICAN Simulations marketing landing page.
 *
 * Audiences:
 *   1. First-time visitors (no saved game) → marketing-grade hero,
 *      doctrine showcase, "how it works" strip, classroom CTA, full
 *      footer.
 *   2. Returning SOLO players (local Zustand phase != idle) → drop
 *      into GameCanvas. Their TopBar carries the forfeit/end menu
 *      so they always have an exit.
 *   3. Returning MULTIPLAYER players (signed in, server-side member
 *      of an active game) → marketing renders normally; the global
 *      `<ActiveGameRibbon />` (mounted in app/layout.tsx) surfaces a
 *      "Resume game →" sticky banner at the top.
 *
 * Phase 8 of the enterprise-readiness plan removed the auto-redirect
 * from this page. Previously, signed-in players with an active
 * `game_members` row were force-redirected to `/games/[id]/...` here,
 * which made the marketing pages unreachable mid-game and (worse)
 * bounced users right back into a game they'd just tried to forfeit
 * — because resetGame() only cleared local state, not the DB row.
 * Now we let the ribbon surface the resume affordance instead, and
 * the new /api/games/forfeit endpoint actually deletes the membership.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Sparkles, Plane, Trophy, MapPin, Wallet, Users,
  Zap, Gem, PackageCheck, Globe2, ClipboardList,
  Clock, Landmark, Hotel, Wheat, Building2, Stethoscope,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useGame } from "@/store/game";
import { GameCanvas } from "@/components/game/GameCanvas";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const phase = useGame((s) => s.phase);
  const [hydrated, setHydrated] = useState(false);
  const router = useRouter();
  const { loading: authLoading } = useAuth();

  useEffect(() => {
    // ?code= → join lobby (invitation link flow). One narrow redirect
    // we still honour because it's an explicit user action.
    if (new URLSearchParams(window.location.search).has("code")) {
      router.replace("/lobby");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [router]);

  if (!hydrated || authLoading) {
    return <div className="flex-1 min-h-0 bg-slate-50" aria-hidden />;
  }

  // Active or finished SOLO run — drop into the canvas. The TopBar's
  // GameMenu has the forfeit/end-game path so the player can always
  // escape back to this landing. (Multiplayer players don't end up
  // here because they navigate to /games/[id]/play directly.)
  if (
    phase === "playing" ||
    phase === "onboarding" ||
    phase === "quarter-closing" ||
    phase === "endgame"
  ) {
    return <GameCanvas />;
  }

  return <Landing />;
}

// ============================================================================
// Marketing landing
// ============================================================================

// Industry slugs used to drive both the Portfolio "selected" state and
// the Features content. Lifted to Landing-level state so clicking a
// Portfolio card swaps the Features section's content without a route
// change.
type IndustrySlug = "airline" | "banking" | "hospitality" | "agriculture" | "real-estate" | "healthcare";

function Landing() {
  // Default to "airline" — the only live simulation. Visitors can flip
  // to a coming-soon industry by clicking its Portfolio card; the
  // Features block below re-renders to talk about that industry.
  const [selectedSim, setSelectedSim] = useState<IndustrySlug>("airline");

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      <MarketingHeader current="home" variant="onDark" />

      <Hero />
      <SocialProof />
      <Portfolio
        selectedSim={selectedSim}
        onSelectSim={(slug) => {
          setSelectedSim(slug);
          // Scroll the Features section into view so the swap is
          // visible. requestAnimationFrame ensures the state update
          // has flushed before we measure/scroll.
          if (typeof window !== "undefined") {
            requestAnimationFrame(() => {
              document
                .getElementById("features")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            });
          }
        }}
      />
      <Features selectedSim={selectedSim} />
      <Doctrines selectedSim={selectedSim} />
      <HowItWorks />
      <FacilitatorBlock />
      <FinalCta />
      <MarketingFooter />
    </div>
  );
}

// ─── Hero ────────────────────────────────────────────────────
function Hero() {
  const { user } = useAuth();

  return (
    <section className="relative overflow-hidden bg-slate-950 text-white -mt-16 pt-16">
      {/* Backdrop gradients */}
      <div className="absolute inset-0">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-cyan-500/10 rounded-full blur-3xl" />
        <div className="absolute top-40 right-0 w-[500px] h-[500px] bg-violet-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "24px 24px",
          }}
        />
      </div>

      <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-28 lg:pt-28 lg:pb-36">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span className="text-[11px] font-semibold text-cyan-100 uppercase tracking-wider">
              Executive simulations by ICAN MENA
            </span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-display font-bold tracking-tight leading-[1.04] mb-6">
            Lead an industry.
            <br />
            <span className="text-cyan-300">Not a spreadsheet.</span>
          </h1>

          <p className="text-lg text-slate-400 max-w-2xl leading-relaxed mb-10">
            ICAN Simulations puts senior leaders in the chair of an entire
            industry — pricing, capital, talent, regulation, and rival
            pressure all moving at once. The{" "}
            <strong className="text-white font-semibold">Airline</strong>{" "}
            simulation is live. Banking, Hospitality, Agriculture, Real
            Estate, and Healthcare are next.
          </p>

          <div className="flex items-center gap-3 flex-wrap mb-4">
            {/* Single primary CTA — every entry path lives inside the
                /lobby (browse public games, enter a private code, or
                hit Create game). */}
            <Link
              href="/lobby"
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#00C2CB] text-white text-sm font-semibold rounded-full hover:bg-[#00a9b1] transition-colors shadow-[0_8px_30px_-8px_rgba(0,194,203,0.5)]"
            >
              Join game <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center gap-2 px-6 py-3 border border-white/20 text-white text-sm font-semibold rounded-full hover:bg-white/5 transition-colors"
            >
              How it works
            </Link>
          </div>
          {/* Sign-in buttons removed from the marketing surface — the
              header chip + /login already cover that path. The hero
              should stay focused on the product story; the Join game
              CTA is the single primary call-to-action. */}
          {user && (
            <div className="mb-8">
              <Link href="/lobby" className="text-xs text-cyan-400 hover:text-cyan-300 transition-colors">
                Welcome back — go to your games →
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}


// ─── Social proof strip ──────────────────────────────────────
//
// Replaces the previous flex-wrapped chip+dot row, which fell apart on
// mid-width viewports: 5 items would fit on one row with their dots,
// then "Industry cohorts" wrapped to a second row dangling on its own.
// The dot-separator pattern is fragile because it doesn't know about
// wrap boundaries — a dot always renders after the i-th item even when
// that item lands at the end of a row.
//
// Now: a single centered <p> with `·` characters embedded as natural
// inline separators. The text wraps as a paragraph, dots wrap with
// the words, no orphaned items, no awkward second rows.
function SocialProof() {
  const segments = [
    "Boards & C-suite",
    "Strategy teams",
    "Operating leadership",
    "Family-office reviews",
    "Executive education",
    "Industry cohorts",
  ];
  return (
    <section className="border-b border-slate-100 bg-white">
      <div className="max-w-5xl mx-auto px-6 py-14 text-center">
        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-5">
          Built for senior executives who run real industries
        </p>
        <p className="text-sm md:text-base font-medium text-slate-600 leading-loose tracking-wide">
          {segments.map((s, i) => (
            <span key={s}>
              {s}
              {i < segments.length - 1 && (
                <span className="mx-3 text-slate-300" aria-hidden>
                  ·
                </span>
              )}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}

// ─── Industry portfolio ──────────────────────────────────────
//
// Cards are now selectable: clicking one updates the parent's
// `selectedSim` state and scrolls into the Features section, which
// rerenders with that industry's content. The live Airline still
// has a "Play now" CTA (separate link) so visitors can jump straight
// into the lobby without losing the selection-driven Features behavior.
interface PortfolioIndustryCard {
  slug: IndustrySlug;
  name: string;
  industry: string;
  status: "live" | "next";
  desc: string;
  accent: "cyan" | "violet" | "emerald" | "amber" | "rose" | "sky";
  Icon: LucideIcon;
}
const PORTFOLIO_INDUSTRIES: PortfolioIndustryCard[] = [
  { slug: "airline", name: "Airline", industry: "Aviation", status: "live",
    desc: "Network, fleet, pricing, slot auctions, fuel hedging, board scenarios.",
    accent: "cyan", Icon: Plane },
  { slug: "banking", name: "Banking", industry: "Banking & Capital Markets", status: "next",
    desc: "Lending, treasury, capital ratios, regulatory pressure.",
    accent: "violet", Icon: Landmark },
  { slug: "hospitality", name: "Hospitality", industry: "Hospitality", status: "next",
    desc: "Property portfolio, RevPAR, brand, demand cycles.",
    accent: "emerald", Icon: Hotel },
  { slug: "agriculture", name: "Agriculture", industry: "Agribusiness", status: "next",
    desc: "Land, commodities, weather risk, supply chain.",
    accent: "amber", Icon: Wheat },
  { slug: "real-estate", name: "Real Estate", industry: "Real Estate", status: "next",
    desc: "Acquisition, development, leasing, capital structure.",
    accent: "rose", Icon: Building2 },
  { slug: "healthcare", name: "Healthcare", industry: "Healthcare Systems", status: "next",
    desc: "Capacity, payor mix, clinical outcomes, regulatory landscape.",
    accent: "sky", Icon: Stethoscope },
];
const PORTFOLIO_RING: Record<PortfolioIndustryCard["accent"], string> = {
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  rose: "bg-rose-50 text-rose-700 ring-rose-100",
  sky: "bg-sky-50 text-sky-700 ring-sky-100",
};

function Portfolio({
  selectedSim,
  onSelectSim,
}: {
  selectedSim: IndustrySlug;
  onSelectSim: (slug: IndustrySlug) => void;
}) {
  return (
    <section
      id="portfolio"
      className="relative py-24 lg:py-32 bg-slate-50 border-y border-slate-100"
    >
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-widest mb-3">
            The simulation portfolio
          </p>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
            One platform.
            <br />
            <span className="text-slate-500">An industry per simulation.</span>
          </h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            ICAN is building executive simulations across the industries our
            clients lead. Each one models the operating reality of its sector —
            not a generic management game with the names changed.
          </p>
          <p className="text-sm text-slate-400 mt-4">
            Pick an industry to preview what the simulation models below.
          </p>
          <Link
            href="/simulations"
            className="inline-flex items-center gap-1.5 mt-6 text-sm font-semibold text-slate-900 hover:text-slate-700"
          >
            Explore the full portfolio <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {PORTFOLIO_INDUSTRIES.map((it) => {
            const isSelected = selectedSim === it.slug;
            return (
              <button
                key={it.slug}
                type="button"
                onClick={() => onSelectSim(it.slug)}
                aria-pressed={isSelected}
                className={
                  "block w-full text-left rounded-2xl border bg-white p-5 transition-all relative hover:shadow-md " +
                  (isSelected
                    ? "border-cyan-400 ring-2 ring-cyan-200"
                    : "border-slate-200 hover:border-slate-300")
                }
              >
                <div className="flex items-center justify-between mb-4">
                  <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ring-4 ${PORTFOLIO_RING[it.accent]}`}>
                    <it.Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <span
                    className={
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold uppercase tracking-wider " +
                      (it.status === "live"
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-slate-100 text-slate-500")
                    }
                  >
                    <span className={
                      "w-1.5 h-1.5 rounded-full " +
                      (it.status === "live" ? "bg-emerald-500" : "bg-slate-400")
                    } />
                    {it.status === "live" ? "Live now" : "Coming soon"}
                  </span>
                </div>
                <h3 className="text-lg font-semibold text-slate-900 mb-0.5">
                  {it.name}
                </h3>
                <p className="text-xs text-slate-400 uppercase tracking-wider mb-2">
                  {it.industry}
                </p>
                <p className="text-sm text-slate-500 leading-relaxed">
                  {it.desc}
                </p>
                {it.status === "live" && (
                  <Link
                    href="/lobby"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-800"
                  >
                    Play now <ArrowRight className="w-3 h-3" />
                  </Link>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────
//
// Per-industry feature catalog. Each industry has 6 cards mirroring the
// shape of the live Airline content: a flagship operational decision
// area, a network/market layer, finance + capital, people/ops dials,
// the board-scenario layer, and the endgame scoring formula. For
// non-live industries the cards describe what the simulation WILL
// model when it ships — readers see a coherent preview of every
// upcoming sim, not just airline. Source for the sector specifics
// is the same data we publish on /simulations.
type FeatureAccent = "cyan" | "violet" | "emerald" | "amber" | "rose" | "sky";
interface FeatureCardData {
  Icon: LucideIcon;
  accent: FeatureAccent;
  title: string;
  description: string;
}
interface FeatureBlock {
  eyebrow: string;
  headline: React.ReactNode;
  intro: React.ReactNode;
  status: "live" | "coming-soon";
  cards: FeatureCardData[];
}
const INDUSTRY_FEATURES: Record<IndustrySlug, FeatureBlock> = {
  airline: {
    eyebrow: "Inside the Airline simulation",
    headline: <>Every lever the executive<br /><span className="text-slate-500">actually pulls.</span></>,
    intro:
      "Not a board game. A complete operating model — fleet, network, pricing, slots, cabin demand, fuel hedging, debt, sliders, and board-level decisions — running on the same depth you'd review at a real strategy offsite.",
    status: "live",
    cards: [
      { Icon: Plane, accent: "cyan", title: "Fleet & cabin design",
        description: "Buy or lease across 40+ aircraft families. Custom cabin layouts. Engine upgrades, eco retrofits, fuselage coatings. Aircraft retire on schedule." },
      { Icon: MapPin, accent: "violet", title: "Network & slot auctions",
        description: "Open routes across 380+ cities. Bid against rivals at scarce airports. Per-class fares, frequency caps tied to physics-real schedules." },
      { Icon: Wallet, accent: "emerald", title: "Finance & debt",
        description: "Term loans, revolving credit, lease residuals. Fuel hedging. Dividend recap. Tax-loss carry-forward. Watch cash like a CFO." },
      { Icon: Users, accent: "amber", title: "People & ops sliders",
        description: "Six operational dials — staff, marketing, service, rewards, ops, customer service. Each shapes payroll, brand, and loyalty curves." },
      { Icon: ClipboardList, accent: "violet", title: "Board scenarios",
        description: "18 quarterly board decisions: cyber breach, fuel hedging, government deals, alliance offers. Locked-in choices ripple for years." },
      { Icon: Trophy, accent: "cyan", title: "Endgame scoring",
        description: "Airline value at Q40 = brand × ops × loyalty × cash position. Comeback bonuses, debt-stress callouts, legacy title earned." },
    ],
  },
  banking: {
    eyebrow: "Inside the Banking simulation",
    headline: <>Every credit cycle the bank<br /><span className="text-slate-500">has to live through.</span></>,
    intro:
      "Lead a commercial bank through a full credit cycle. Set risk appetite, manage capital ratios, navigate regulator stress tests, and decide how aggressively to chase yield when the curve moves.",
    status: "coming-soon",
    cards: [
      { Icon: Landmark, accent: "violet", title: "Loan book composition",
        description: "Build the asset side: corporate, SME, mortgage, consumer. Set risk appetite per segment, watch concentration, manage non-performing-loan flow." },
      { Icon: Wallet, accent: "emerald", title: "Treasury & balance-sheet duration",
        description: "Match-fund, run a deliberate duration gap, or hedge it. Net interest margin moves with every shift in the curve." },
      { Icon: ClipboardList, accent: "cyan", title: "Capital, liquidity & regulator stress",
        description: "Basel-style capital ratios, LCR/NSFR liquidity, and quarterly stress tests. Run too thin and the regulator opens the file." },
      { Icon: Users, accent: "amber", title: "Channel & talent mix",
        description: "Branch footprint, digital channel investment, frontline incentives. Cost-to-income ratio is the watchword." },
      { Icon: Sparkles, accent: "rose", title: "Board scenarios",
        description: "Quarterly scenarios: fraud event, rate-cycle pivot, fintech challenger, sovereign exposure, regulator inquiry. Choices ripple through capital plans." },
      { Icon: Trophy, accent: "sky", title: "Endgame scoring",
        description: "Bank value scored on ROE, capital adequacy, asset quality, and franchise strength. Cycle-survival bonus for clean cumulative loss provisioning." },
    ],
  },
  hospitality: {
    eyebrow: "Inside the Hospitality simulation",
    headline: <>Every property, brand, and<br /><span className="text-slate-500">tourism cycle in one room.</span></>,
    intro:
      "Run a hotel and resort portfolio across brand tiers and tourism cycles. Manage rate, occupancy, brand mix, and capital projects. RevPAR is the score; long-cycle CapEx is the risk.",
    status: "coming-soon",
    cards: [
      { Icon: Hotel, accent: "emerald", title: "Property portfolio & brand mix",
        description: "Acquire, develop, or franchise across luxury, upscale, midscale, economy. Brand standards drive CapEx; brand equity drives rate power." },
      { Icon: MapPin, accent: "violet", title: "Revenue management & dynamic rate",
        description: "Daily rate decisions across segments — corporate, leisure, group, OTA. Length-of-stay restrictions, channel mix, overbooking discipline." },
      { Icon: Wallet, accent: "amber", title: "F&B and ancillary revenue",
        description: "Restaurants, banqueting, spa, retail. Each property has a profit anatomy beyond rooms — neglect it and the brand softens." },
      { Icon: Users, accent: "cyan", title: "Workforce & service quality",
        description: "Service standards, training depth, line-staff turnover. The labour-to-quality dial drives both cost and loyalty in the same quarter." },
      { Icon: ClipboardList, accent: "rose", title: "Board scenarios",
        description: "Quarterly scenarios: pandemic shock, OTA contract pressure, brand-standard refresh, sustainability mandate, M&A approach." },
      { Icon: Trophy, accent: "sky", title: "Endgame scoring",
        description: "Portfolio value scored on RevPAR growth, brand strength, GOP margin, and capital efficiency. Loyalty-share bonus for repeat-guest expansion." },
    ],
  },
  agriculture: {
    eyebrow: "Inside the Agriculture simulation",
    headline: <>Every commodity hedge, every<br /><span className="text-slate-500">weather cycle, every season.</span></>,
    intro:
      "Run a diversified agribusiness through commodity, weather, and trade-policy cycles. Set crop mix, hedge exposure, time storage, and survive the quarter the futures market turns.",
    status: "coming-soon",
    cards: [
      { Icon: Wheat, accent: "amber", title: "Crop mix & rotation",
        description: "Set the planting plan: row crops, cash crops, rotation discipline. Yield variance per field, soil-health drag, certification premia." },
      { Icon: Globe2, accent: "emerald", title: "Land acquisition & leasing",
        description: "Buy versus lease, irrigated versus rain-fed, region diversification. Capital tied up in land vs. equipment is the perennial trade-off." },
      { Icon: Wallet, accent: "violet", title: "Commodity hedging & offtake",
        description: "Futures, forwards, basis trades. Lock in margin or run open exposure. Offtake contracts smooth cash but cap upside." },
      { Icon: PackageCheck, accent: "cyan", title: "Storage, logistics & working capital",
        description: "Silos, terminals, in-transit inventory. Seasonal cash-flow tightness compounds when storage is short or freight blows out." },
      { Icon: ClipboardList, accent: "rose", title: "Board scenarios",
        description: "Quarterly scenarios: drought, tariff shock, sustainability disclosure rule, biotech adoption, port disruption." },
      { Icon: Trophy, accent: "sky", title: "Endgame scoring",
        description: "Business value scored on margin per hectare, cycle-adjusted returns, balance-sheet strength, and ESG positioning." },
    ],
  },
  "real-estate": {
    eyebrow: "Inside the Real Estate simulation",
    headline: <>Every cap-rate cycle the<br /><span className="text-slate-500">portfolio has to clear.</span></>,
    intro:
      "Build and run a property portfolio across asset classes, debt cycles, and tenant economics. Time the acquisition window, manage the capital stack, and survive cap-rate expansion.",
    status: "coming-soon",
    cards: [
      { Icon: Building2, accent: "rose", title: "Asset-class allocation",
        description: "Office, retail, logistics, residential, hotel. Cycle exposure differs per asset; diversification dampens drawdowns but caps upside." },
      { Icon: MapPin, accent: "violet", title: "Acquisition vs. develop vs. dispose",
        description: "Time the cycle. Buy core when cap rates blow out, develop when construction prices favor it, dispose when valuations re-rate." },
      { Icon: Wallet, accent: "emerald", title: "Capital stack & debt covenants",
        description: "Senior debt, mezz, equity. LTV ratios, DSCR covenants, refi risk. The capital stack is what kills you in the down cycle." },
      { Icon: Users, accent: "amber", title: "Lease structure & tenant mix",
        description: "Anchor tenants, WALE management, rent-review clauses. Tenant diversification protects cash flow when single names fail." },
      { Icon: ClipboardList, accent: "cyan", title: "Board scenarios",
        description: "Quarterly scenarios: rate-shock revaluation, anchor tenant default, repositioning CapEx, regulatory ESG mandate, JV partner exit." },
      { Icon: Trophy, accent: "sky", title: "Endgame scoring",
        description: "NAV growth, cash-on-cash returns, occupancy, and capital efficiency. Cycle-survival bonus for clean LTV through the down move." },
    ],
  },
  healthcare: {
    eyebrow: "Inside the Healthcare simulation",
    headline: <>Every payor, every clinician,<br /><span className="text-slate-500">every regulator at once.</span></>,
    intro:
      "Run a hospital network through workforce shortages, payor pressure, and clinical quality demands. Capacity is the constraint; mission-vs-margin is the call you make every quarter.",
    status: "coming-soon",
    cards: [
      { Icon: Stethoscope, accent: "sky", title: "Service-line strategy",
        description: "Specialty mix, surgical volume, ambulatory growth. Each service line has its own margin profile and clinician demand." },
      { Icon: Wallet, accent: "emerald", title: "Payor contracting & revenue cycle",
        description: "Public payor mix, commercial contract terms, denied-claim recovery. The receivable cycle is where the cash actually lives." },
      { Icon: Users, accent: "amber", title: "Workforce & clinician retention",
        description: "Nurse staffing ratios, physician compensation, agency reliance. Burnout signals show up in turnover before they show up in quality." },
      { Icon: Sparkles, accent: "violet", title: "Capital projects & technology",
        description: "OR build-outs, imaging fleet, EHR adoption, AI-assisted clinical. Long-cycle CapEx with regulatory and accreditation tails." },
      { Icon: ClipboardList, accent: "rose", title: "Board scenarios",
        description: "Quarterly scenarios: outbreak surge, accreditation review, clinician strike action, payor renegotiation, value-based-care mandate." },
      { Icon: Trophy, accent: "cyan", title: "Endgame scoring",
        description: "System value scored on outcomes, margin, mission delivery, and resilience. Quality-of-care bonus for sustained outcome improvements." },
    ],
  },
};

function Features({ selectedSim }: { selectedSim: IndustrySlug }) {
  const block = INDUSTRY_FEATURES[selectedSim];
  return (
    <section id="features" className="relative py-24 lg:py-32 bg-white scroll-mt-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${block.status === "live" ? "text-cyan-600" : "text-slate-500"}`}>
            {block.eyebrow}
          </p>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
            {block.headline}
          </h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            {block.intro}
          </p>
          {block.status === "coming-soon" && (
            // Plain inline note — no bordered box, no pill chip, just a
            // small subtle line below the intro paragraph. The previous
            // bordered panel + chip pulled too much attention for a
            // status note that's meant to read as a footnote.
            <p className="mt-4 text-xs text-slate-400 leading-relaxed">
              <span className="text-slate-500">Coming soon.</span>{" "}
              The Airline simulation is live today —{" "}
              <Link href="/simulations" className="text-slate-600 underline-offset-2 hover:underline hover:text-slate-900">
                see the full pipeline
              </Link>{" "}
              or{" "}
              <a href="mailto:info@icanmena.com?subject=ICAN%20Simulations%20early%20access" className="text-slate-600 underline-offset-2 hover:underline hover:text-slate-900">
                ask about early access
              </a>.
            </p>
          )}
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {block.cards.map((c) => (
            <FeatureCard
              key={c.title}
              icon={<c.Icon className="w-5 h-5" />}
              accent={c.accent}
              title={c.title}
              description={c.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon, accent, title, description,
}: {
  icon: React.ReactNode;
  accent: FeatureAccent;
  title: string;
  description: string;
}) {
  const ring = {
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
    sky: "bg-sky-50 text-sky-700 ring-sky-100",
  }[accent];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 hover:border-slate-300 transition-colors">
      <div className={`inline-flex items-center justify-center w-11 h-11 rounded-xl ring-4 mb-4 ${ring}`}>
        {icon}
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </div>
  );
}

// ─── Doctrines showcase ─────────────────────────────────────
//
// Doctrines are sector-specific strategic commitments. Each industry
// has its own four — for the live Airline these are real engine
// multipliers; for coming-soon industries they preview what the
// strategic-commitment dial will look like when the sim ships.
type DoctrineAccent = "amber" | "violet" | "emerald" | "cyan";
interface DoctrineCardData {
  Icon: LucideIcon;
  accent: DoctrineAccent;
  name: string;
  tagline: string;
  desc: string;
}
const INDUSTRY_DOCTRINES: Record<IndustrySlug, DoctrineCardData[]> = {
  airline: [
    { Icon: Zap, accent: "amber", name: "Budget Airline",
      tagline: "Fast turns, lean costs, wider reach.",
      desc: "Build around access and efficiency. Reach price-sensitive travelers across Tier 2 + Tier 3. Downturns hit harder." },
    { Icon: Gem, accent: "violet", name: "Premium Airline",
      tagline: "Protect yield and loyalty.",
      desc: "Compete on service, brand, cabin quality. Price above the market and recover loyalty faster — pay for it in payroll." },
    { Icon: PackageCheck, accent: "emerald", name: "Cargo Dominance",
      tagline: "Make the network move freight.",
      desc: "Use every connection as a logistics corridor. Cargo capacity and turnarounds compound across linked cities." },
    { Icon: Globe2, accent: "cyan", name: "Global Network",
      tagline: "Connectivity compounds demand.",
      desc: "Grow a connected international system. Pax demand rises across linked cities; mixed fleet brands cost more to maintain." },
  ],
  banking: [
    { Icon: Globe2, accent: "cyan", name: "Retail Bank",
      tagline: "Mass-market deposits and consumer credit.",
      desc: "Deposits, mortgages, cards, personal loans. Branch + digital + ATM footprint. Funded cheap, regulated tight. Volume game — operational efficiency and channel mix decide ROE." },
    { Icon: PackageCheck, accent: "emerald", name: "Commercial Bank",
      tagline: "SME and corporate relationships.",
      desc: "Working capital, term loans, trade finance, treasury services for businesses. Relationship-driven. Underwriting depth + cross-sell across the corporate's whole stack." },
    { Icon: Zap, accent: "amber", name: "Wholesale / Investment Bank",
      tagline: "Capital markets, advisory, trading.",
      desc: "Debt + equity issuance, M&A advisory, structured finance, market-making. Big balance-sheet usage, deal-flow driven. Fee + trading income volatile through the cycle." },
    { Icon: Gem, accent: "violet", name: "Private / Wealth Bank",
      tagline: "High-net-worth advisory and asset management.",
      desc: "Wealth advisory, portfolio management, family office, lending against assets. Fee-led, low credit risk, capital-light. Talent retention is the operating challenge." },
  ],
  hospitality: [
    { Icon: Gem, accent: "violet", name: "Luxury-First",
      tagline: "Top-tier brand, top-tier rate.",
      desc: "Build around five-star brands and premium guest experience. Highest CapEx, slowest cycle, strongest rate power per room." },
    { Icon: Zap, accent: "amber", name: "Volume-Budget",
      tagline: "Scale across midscale and economy.",
      desc: "Push room count and operational efficiency in midscale + economy tiers. Margin per room is thin; occupancy + cost discipline are everything." },
    { Icon: PackageCheck, accent: "emerald", name: "Branded Portfolio",
      tagline: "Multi-brand across every tier.",
      desc: "Operate luxury, upscale, midscale, and economy brands in one portfolio. Diversified cycle exposure; brand-standard CapEx is constant." },
    { Icon: Globe2, accent: "cyan", name: "Independent Boutique",
      tagline: "Distinctive, soft-branded, loyalty-led.",
      desc: "Run independent or soft-branded properties with a strong identity. Higher repeat-guest loyalty, less marketing reach, harder to scale." },
  ],
  agriculture: [
    { Icon: PackageCheck, accent: "emerald", name: "Diversified Holdings",
      tagline: "Spread the cycles across crops + storage.",
      desc: "Mix row crops, cash crops, livestock, storage capacity. Cycles average out across the portfolio; specialization upside is given up." },
    { Icon: Gem, accent: "violet", name: "Specialist Commodity",
      tagline: "One commodity, scale advantage.",
      desc: "Bet on a single commodity with deep operational expertise. Massive upside when the market is right; brutal exposure when it isn't." },
    { Icon: Globe2, accent: "cyan", name: "Vertical Integration",
      tagline: "Field to fork, margin captured.",
      desc: "Own the chain — production, storage, processing, distribution. Capture margin at every step; capital tied up across the entire supply chain." },
    { Icon: Zap, accent: "amber", name: "Sustainable Premium",
      tagline: "Certified, regenerative, premium-priced.",
      desc: "Organic, regenerative, certified-origin produce. Premium pricing + regulatory tailwind; higher input cost, longer payback on land conversion." },
  ],
  "real-estate": [
    { Icon: PackageCheck, accent: "emerald", name: "Residential Operator",
      tagline: "Multi-family and build-to-rent at scale.",
      desc: "Apartments, build-to-rent, condos. Long-hold, predictable income, demographic tailwinds. Operational depth: leasing velocity, retention, unit-level CapEx, rent-control exposure." },
    { Icon: Globe2, accent: "cyan", name: "Commercial Operator",
      tagline: "Office, retail, industrial — long-hold income.",
      desc: "Hold and operate commercial assets across office, retail, industrial. Tenant credit + lease structure drive the cash flows; cap-rate cycle drives the valuation." },
    { Icon: Zap, accent: "amber", name: "Developer",
      tagline: "Ground-up build, sell-out or stabilize.",
      desc: "Acquire land, entitle, build. Construction risk + cycle timing decide profit margin. Either sell the asset on completion or stabilize and refinance into long-hold." },
    { Icon: Gem, accent: "violet", name: "Logistics & Industrial",
      tagline: "Warehouses, last-mile, data centers.",
      desc: "Specialist focus on logistics + industrial — distribution centers, last-mile fulfillment, cold storage, data centers. E-commerce + cloud demand tailwinds, capital-intensive." },
  ],
  healthcare: [
    { Icon: Globe2, accent: "cyan", name: "Public Health System",
      tagline: "Universal access, government-funded.",
      desc: "Government or quasi-public hospital system. Universal-access mandate, payor concentration with the state, regulatory bound. Mission anchors above margin; capacity planning is the strategic lever." },
    { Icon: PackageCheck, accent: "emerald", name: "Private Hospital Group",
      tagline: "Multi-specialty acute care, payor-mix managed.",
      desc: "For-profit acute care across multiple specialties — inpatient, ED, surgical, imaging. Payor diversification across commercial + government, capital-intensive, brand and outcomes drive volume." },
    { Icon: Gem, accent: "violet", name: "Specialty Practice",
      tagline: "Single-line excellence, premium margin.",
      desc: "Focused on one specialty — cardiac, ortho, oncology, fertility, dermatology, dental. Reputation drives referrals, pricing power follows outcomes. Narrower service surface, concentration risk." },
    { Icon: Zap, accent: "amber", name: "Digital / Virtual Care",
      tagline: "Tech-led, scale through software.",
      desc: "Telehealth-first or hybrid digital provider. Lower CapEx than acute, scalable across geography, payor reimbursement is the unlock. Software + clinical workflow is where the moat lives." },
  ],
};

const DOCTRINE_RING: Record<DoctrineAccent, string> = {
  amber: "bg-amber-50 text-amber-700 ring-amber-100",
  violet: "bg-violet-50 text-violet-700 ring-violet-100",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
};

function Doctrines({ selectedSim }: { selectedSim: IndustrySlug }) {
  const items = INDUSTRY_DOCTRINES[selectedSim];
  // Sector label for the eyebrow line: matches the Portfolio card name.
  const sectorName =
    PORTFOLIO_INDUSTRIES.find((i) => i.slug === selectedSim)?.name ?? "Airline";
  const isLive = selectedSim === "airline";
  return (
    <section id="doctrines" className="relative bg-slate-50 border-y border-slate-100 py-24 lg:py-32 scroll-mt-20">
      <div className="max-w-6xl mx-auto px-6">
        <div className="max-w-2xl mb-12">
          <p className={`text-xs font-semibold uppercase tracking-widest mb-3 ${isLive ? "text-cyan-600" : "text-slate-500"}`}>
            {sectorName} doctrines
          </p>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
            Four doctrines.
            <br />
            <span className="text-slate-500">Pick one. Live with it.</span>
          </h2>
          <p className="text-lg text-slate-500 leading-relaxed">
            Each industry has its own four. Your doctrine sets the multipliers
            that follow you through every quarter — not a flavor pick, a
            strategic commitment.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {items.map((d) => {
            const Icon = d.Icon;
            return (
              <div
                key={d.name}
                className="rounded-2xl border border-slate-200 bg-white p-6"
              >
                <div className="flex items-start gap-4">
                  <div className={`shrink-0 w-12 h-12 rounded-xl ring-4 flex items-center justify-center ${DOCTRINE_RING[d.accent]}`}>
                    <Icon className="w-5 h-5" strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-slate-900 mb-0.5">
                      {d.name}
                    </h3>
                    <p className="text-xs italic text-slate-500 mb-2">
                      &ldquo;{d.tagline}&rdquo;
                    </p>
                    <p className="text-sm text-slate-500 leading-relaxed">
                      {d.desc}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─── How it works ────────────────────────────────────────────
function HowItWorks() {
  return (
    <section id="how" className="relative py-24 lg:py-32 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="max-w-xl mb-12">
          <p className="text-xs font-semibold text-cyan-600 uppercase tracking-widest mb-3">
            The round loop
          </p>
          <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight mb-6 leading-[1.1]">
            How a round plays.
          </h2>
          <p className="text-base text-slate-500 leading-relaxed mt-3">
            Same five-step rhythm in every ICAN simulation. Industry-specific
            decisions live inside step 1; the rest is universal.
          </p>
        </div>
        <ol className="space-y-6">
          <Step n={1} title="Make industry decisions" desc="In the Airline simulation: open and price routes, pick aircraft, bid for scarce slots. In Banking: write loans, set capital ratios. In Hospitality: set property mix and rate. Each simulation models its sector's real moves." />
          <Step n={2} title="Tune the operating sliders" desc="Six universal dials — staff, marketing, service, rewards, ops, customer service. Each tick shapes payroll, brand, loyalty, and cost discipline downstream." />
          <Step n={3} title="Resolve any board scenarios" desc="Some rounds carry a boardroom decision. Cyber breach response. Hedge timing. Government deals. Each option is a real trade-off — one outcome wins this round, costs next." />
          <Step n={4} title="Advance the round" desc="The engine settles markets, demand, costs, debt service, brand drift, milestones — and then writes the executive digest." />
          <Step n={5} title="Read the digest, adapt" desc="Round close shows what happened: P&L, milestones earned, decision consequences fired, scenario aftermath. Then you walk into the next round." />
        </ol>
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

// ─── Facilitator block ──────────────────────────────────────
function FacilitatorBlock() {
  return (
    <section id="facilitators" className="relative py-24 lg:py-32 bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <div className="rounded-3xl bg-slate-950 text-white p-10 md:p-14 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-violet-500/10 rounded-full blur-3xl" />
          <div className="relative">
            <p className="text-xs font-semibold text-violet-300 uppercase tracking-widest mb-3">
              For Game Masters
            </p>
            <h2 className="text-3xl md:text-4xl font-display font-bold tracking-tight mb-4 leading-tight">
              Run an executive workshop.
            </h2>
            <p className="text-base text-slate-400 max-w-2xl mb-8 leading-relaxed">
              Create a private game, share the 4-digit code, watch teams claim
              seats from their own laptops. Switch the active view, force the
              round close, push admin overrides, review the audit log — all
              from one console. The same console powers every ICAN simulation.
            </p>
            <div className="flex items-center gap-3 flex-wrap">
              <Link
                href="/games/new"
                className="inline-flex items-center gap-2 px-5 py-3 bg-white text-slate-900 text-sm font-semibold rounded-full hover:bg-slate-100 transition-colors"
              >
                <ClipboardList className="w-4 h-4" />
                Create a session
              </Link>
              <a
                href="mailto:info@icanmena.com?subject=ICAN%20simulation%20cohort%20licensing"
                className="inline-flex items-center gap-1.5 px-5 py-3 text-sm font-medium text-slate-300 hover:text-white transition-colors"
              >
                Talk to ICAN about cohort licensing →
              </a>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mt-10 pt-8 border-t border-slate-800">
              <FacilitatorStat label="Per cohort" value="up to 8 teams" />
              <FacilitatorStat label="Session length" value="flexible" />
              <FacilitatorStat label="Game Master" value="optional" />
              <FacilitatorStat label="Setup" value={<><Clock className="inline w-3 h-3 mr-1 align-baseline" />minutes</>} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FacilitatorStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mb-1">{label}</div>
      <div className="text-lg font-display font-bold text-white">{value}</div>
    </div>
  );
}

// ─── Final CTA ───────────────────────────────────────────────
function FinalCta() {
  const { user } = useAuth();

  return (
    <section className="relative py-24 overflow-hidden bg-gradient-to-b from-white to-cyan-50/40">
      <div className="relative max-w-3xl mx-auto px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-display font-bold text-slate-900 tracking-tight mb-4 leading-[1.1]">
          Ready to take the controls?
        </h2>
        <p className="text-lg text-slate-500 mb-10 max-w-xl mx-auto leading-relaxed">
          One door in. Browse open games, drop in with a code, or start your
          own — solo, with friends, or with a facilitator.
        </p>
        {/* Sign-in buttons removed from the marketing surface — the
            header chip + /login already cover that path. The hero
            should stay focused on the product story; Join game is
            the single primary CTA on this page. */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link
            href="/lobby"
            className="inline-flex items-center gap-2 px-6 py-3.5 bg-[#00C2CB] text-white text-sm font-semibold rounded-full hover:bg-[#00a9b1] transition-colors shadow-[0_8px_30px_-8px_rgba(0,194,203,0.5)]"
          >
            Join game
            <ArrowRight className="w-4 h-4" />
          </Link>
          {user && (
            <Link href="/lobby" className="inline-flex items-center gap-1.5 px-5 py-3 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
              Go to my games →
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function MicrosoftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 21 21" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}
