"use client";

/**
 * /privacy — minimum-viable privacy page so footer links resolve.
 * Honest, scoped to what ICAN Simulations actually collect (very little).
 * Update with the real legal review when ICAN signs off.
 */

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export default function PrivacyPage() {
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
          Privacy
        </p>
        <h1 className="text-3xl md:text-4xl font-display font-bold text-slate-900 mb-6 leading-tight">
          What ICAN Simulations keeps about you.
        </h1>
        <p className="text-sm text-slate-500 mb-10">
          Last updated: {new Date().toLocaleDateString("en-AE", { month: "long", year: "numeric" })}
        </p>
        <div className="prose prose-slate max-w-none space-y-6">
          <Section title="Anonymous play by default">
            <p>
              ICAN Simulations support lightweight browsing without an account,
              but active game persistence now runs through our database rather
              than browser storage. When you sign in, your game session is tied
              to your authenticated account so you can reconnect across refreshes
              and devices.
            </p>
          </Section>
          <Section title="What we collect when you play multiplayer">
            <ul>
              <li>The display name you type when you claim a seat</li>
              <li>Your authenticated session/account id so we can reconnect you</li>
              <li>Game state — fleet, routes, decisions you submit</li>
              <li>Audit-log events — joins, ready toggles, quarter closes</li>
            </ul>
            <p>
              No email, no phone, no IP logging beyond what Vercel and our
              database provider keep for standard server-side metrics.
            </p>
          </Section>
          <Section title="What we don't collect">
            <ul>
              <li>Personal information you didn&rsquo;t type into the game</li>
              <li>Browsing history outside of /skyforce surfaces</li>
              <li>Cross-site tracking via third-party cookies</li>
              <li>Microphone, camera, location, or device identifiers</li>
            </ul>
          </Section>
          <Section title="Data retention">
            <p>
              Active game state is kept in our database for the life of the run
              plus 90 days, after which finished runs are purged. Cohort sessions
              hosted by a facilitator can have a custom retention policy on request.
            </p>
          </Section>
          <Section title="Your rights">
            <p>
              You can request deletion of your multiplayer session and all
              associated game-state rows by emailing{" "}
              <a className="text-cyan-700 underline" href="mailto:info@icanmena.com">
                info@icanmena.com
              </a>{" "}
              with your game code or signed-in account details.
            </p>
          </Section>
          <Section title="Questions">
            <p>
              ICAN Simulations are products of ICAN MENA, based in Dubai. Reach us at{" "}
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
      <div className="text-sm text-slate-600 leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_code]:text-xs [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:bg-slate-100">
        {children}
      </div>
    </section>
  );
}
