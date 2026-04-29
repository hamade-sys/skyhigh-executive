"use client";

/**
 * /terms — minimum-viable terms-of-use page so footer links resolve.
 * Plain language, no maximalist clickwrap. Replace with formal legal
 * once ICAN signs off.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function TermsPage() {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-white">
      <MarketingHeader />
      <main className="max-w-3xl mx-auto px-6 py-16 lg:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to home
        </Link>
        <p className="text-xs font-semibold text-cyan-600 uppercase tracking-widest mb-3">
          Terms of use
        </p>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-6 leading-tight">
          The short version.
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Last updated: {new Date().toLocaleDateString("en-AE", { month: "long", year: "numeric" })}
        </p>
        <div className="space-y-7">
          <Section title="It's a simulation">
            <p>
              ICAN Simulations are strategic simulations. Aircraft, airlines, cities,
              fares, board scenarios, and crisis events are stylized for
              learning. Don&rsquo;t make actual investment, hiring, or
              regulatory decisions based on what happens here.
            </p>
          </Section>
          <Section title="Don't break it">
            <p>
              Don&rsquo;t scrape, automate beyond your own play, attempt to
              breach the lobby auth model, or attack the multiplayer state
              endpoints. We log mutations and will block sessions that abuse
              the system.
            </p>
          </Section>
          <Section title="Cohort sessions">
            <p>
              Facilitator licensing for classroom and workshop use is a
              separate agreement with ICAN MENA. Email{" "}
              <a className="text-cyan-700 underline" href="mailto:info@icanmena.com">
                info@icanmena.com
              </a>{" "}
              if you&rsquo;re running a paid workshop using ICAN Simulations.
            </p>
          </Section>
          <Section title="No warranty">
            <p>
              ICAN Simulations are provided as-is. We aim for correctness in the
              engine — if you find a bug, please report it — but the platform
              is offered without warranty of any kind for any specific
              outcome of play.
            </p>
          </Section>
          <Section title="Governing law">
            <p>
              These terms are governed by the laws of the United Arab
              Emirates. Disputes go to courts in Dubai unless we agree
              otherwise in writing.
            </p>
          </Section>
          <Section title="Contact">
            <p>
              Questions go to{" "}
              <a className="text-cyan-700 underline" href="mailto:info@icanmena.com">
                info@icanmena.com
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
      <MarketingFooter />
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900 mb-3">{title}</h2>
      <div className="text-sm text-slate-600 leading-relaxed">
        {children}
      </div>
    </section>
  );
}
