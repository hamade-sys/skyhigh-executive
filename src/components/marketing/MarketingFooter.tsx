"use client";

/**
 * ICAN Simulations marketing footer.
 *
 * Surface lives at the bottom of every public/marketing page (`/`,
 * `/lobby`, `/games/new`, `/join`, `/about`, etc.). Five-column
 * layout collapses to two columns on tablets and a single stack on
 * phones. Brand block carries the ICAN Simulations wordmark + a
 * one-liner; link columns route to product / play / company / legal.
 *
 * Design: dark `slate-950` panel that contrasts with the
 * light page bodies above. Brand teal `#00C2CB` for hover.
 */

import Link from "next/link";
import { Layers } from "lucide-react";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { label: "How it works", href: "/about#how" },
      { label: "Features", href: "/about#features" },
      { label: "Doctrines", href: "/about#doctrines" },
      { label: "FAQ", href: "/about#faq" },
    ],
  },
  {
    title: "Play",
    links: [
      { label: "Solo practice", href: "/onboarding" },
      { label: "Public lobby", href: "/lobby" },
      { label: "Create game", href: "/games/new" },
      { label: "Join with code", href: "/join" },
    ],
  },
  {
    title: "Facilitators",
    links: [
      { label: "Facilitator console", href: "/facilitator" },
      { label: "Run a workshop", href: "/about#facilitators" },
      { label: "Cohort licensing", href: "mailto:info@icanmena.com?subject=ICAN%20Simulations%20cohort%20licensing" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "ICAN MENA", href: "https://www.icanmena.com", external: true },
      { label: "Get in touch", href: "mailto:info@icanmena.com" },
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
    ],
  },
];

export function MarketingFooter() {
  return (
    <footer className="bg-slate-950 text-slate-400 border-t border-slate-900">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-5 gap-10 mb-12">
          {/* Brand block */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 ring-2 ring-cyan-500/20 flex items-center justify-center">
                <Layers className="w-3.5 h-3.5 text-cyan-300" />
              </div>
              <span className="font-display text-xl font-bold text-white tracking-tight">
                ICAN <span className="font-medium opacity-80">Simulations</span>
              </span>
            </div>
            <p className="text-xs leading-relaxed text-slate-500 max-w-[220px] mb-5">
              Executive simulations by ICAN MENA. The Airline simulation is live.
              Banking, Hospitality, Agriculture, Real Estate, and Healthcare
              are next.
            </p>
            <a
              href="mailto:info@icanmena.com"
              className="inline-block text-xs text-cyan-300 hover:text-cyan-200 font-medium"
            >
              info@icanmena.com
            </a>
          </div>

          {/* Link columns */}
          <div className="lg:col-span-4 grid grid-cols-2 md:grid-cols-4 gap-8">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white mb-4">
                  {col.title}
                </h4>
                <ul className="space-y-2.5">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : link.href.startsWith("mailto:") ? (
                        <a
                          href={link.href}
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          className="text-xs text-slate-400 hover:text-white transition-colors"
                        >
                          {link.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom bar */}
        <div className="pt-8 border-t border-slate-900 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <p className="text-[11px] text-slate-500">
            © {new Date().getFullYear()} ICAN MENA. Executive simulations are
            stylized for learning; gameplay events are fictional.
          </p>
          <p className="text-[11px] text-slate-600">
            Built in Dubai · For senior executives · One platform, every industry
          </p>
        </div>
      </div>
    </footer>
  );
}
