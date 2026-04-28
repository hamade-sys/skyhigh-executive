"use client";

/**
 * `/` — game entry. Replaces the bare GameCanvas mount with a
 * unified picker that routes to the right surface:
 *
 *    - Solo practice          → /onboarding (existing flow)
 *    - Create game            → /games/new
 *    - Join public lobby      → /lobby
 *    - Join with code         → /join
 *    - Facilitator console    → /facilitator
 *
 * Backwards compat: if the local Zustand store already has a run
 * in progress (phase != 'idle'), we render GameCanvas directly so
 * existing solo players don't get bounced to a picker.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight, Plus, Globe2, KeyRound, User, ClipboardList, Sparkles,
} from "lucide-react";
import { useGame } from "@/store/game";
import { GameCanvas } from "@/components/game/GameCanvas";

export default function Home() {
  const phase = useGame((s) => s.phase);
  const [hydrated, setHydrated] = useState(false);
  // Wait for client-side hydration so we read the persisted store
  // accurately. Without this gate the picker briefly flashes for
  // returning solo players whose run is mid-quarter.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  if (!hydrated) {
    return (
      <div className="min-h-screen bg-slate-50" aria-hidden />
    );
  }

  // Active solo run — drop into the game canvas straight away.
  if (phase === "playing" || phase === "onboarding" || phase === "quarter-closing" || phase === "endgame") {
    return <GameCanvas />;
  }

  // Otherwise: clean picker.
  return <EntryPicker />;
}

function EntryPicker() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="max-w-5xl mx-auto px-6 py-16 md:py-24">
        <div className="text-center mb-12 md:mb-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-3">
            SkyForce
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight text-slate-900 mb-4 leading-[1.05]">
            Run an airline.
            <br />
            <span className="text-slate-500">For 40 quarters.</span>
          </h1>
          <p className="text-base md:text-lg text-slate-500 max-w-xl mx-auto leading-relaxed">
            Pick how you want to play. Solo, in a public lobby, in a facilitated
            cohort, or with a private code from your instructor.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <EntryCard
            href="/onboarding"
            icon={<User className="w-5 h-5" />}
            title="Solo practice"
            description="One human, AI rivals. The fastest path to learning the game."
            accent="cyan"
            primary
          />
          <EntryCard
            href="/games/new"
            icon={<Plus className="w-5 h-5" />}
            title="Create game"
            description="Set up a public or private run. Self-guided or facilitated."
            accent="violet"
          />
          <EntryCard
            href="/lobby"
            icon={<Globe2 className="w-5 h-5" />}
            title="Join public lobby"
            description="Pick from open games anyone is hosting right now."
            accent="emerald"
          />
          <EntryCard
            href="/join"
            icon={<KeyRound className="w-5 h-5" />}
            title="Join with code"
            description="Got a 4-digit code from your facilitator? Enter it here."
            accent="amber"
          />
          <EntryCard
            href="/facilitator"
            icon={<ClipboardList className="w-5 h-5" />}
            title="Facilitator console"
            description="Run a classroom or workshop session. Includes board decisions."
            accent="slate"
          />
          <EntryCard
            href="/onboarding?demo=1"
            icon={<Sparkles className="w-5 h-5" />}
            title="Tutorial run"
            description="Guided walkthrough of the first three quarters. Skippable any time."
            accent="cyan"
            tone="dim"
          />
        </div>
      </main>
    </div>
  );
}

function EntryCard({
  href, icon, title, description, accent, primary, tone,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: "cyan" | "violet" | "emerald" | "amber" | "slate";
  primary?: boolean;
  tone?: "dim";
}) {
  const ring = {
    cyan: "bg-cyan-50 text-cyan-700 ring-cyan-100",
    violet: "bg-violet-50 text-violet-700 ring-violet-100",
    emerald: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    slate: "bg-slate-100 text-slate-700 ring-slate-200",
  }[accent];
  return (
    <Link
      href={href}
      className={
        "group rounded-2xl border bg-white p-6 transition-all " +
        (primary
          ? "border-slate-900 ring-2 ring-slate-900/10 hover:shadow-md"
          : tone === "dim"
            ? "border-slate-200 opacity-80 hover:opacity-100 hover:border-slate-300"
            : "border-slate-200 hover:border-slate-300 hover:shadow-sm")
      }
    >
      <div className={"inline-flex items-center justify-center w-11 h-11 rounded-xl ring-4 mb-4 " + ring}>
        {icon}
      </div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-700 transition-colors" />
      </div>
      <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
    </Link>
  );
}
