import Link from "next/link";
import { Button } from "@/components/ui";

export default function Home() {
  return (
    <main className="flex-1 flex flex-col">
      {/* ── Top bar ──────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-line">
        <div className="flex items-baseline gap-3">
          <span className="font-display text-xl text-ink">SkyForce</span>
          <span className="text-[0.6875rem] uppercase tracking-[0.18em] text-ink-muted">
            Executive Simulation
          </span>
        </div>
        <nav className="flex items-center gap-1">
          <Link href="/styleguide">
            <Button variant="ghost" size="sm">
              Style guide
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button variant="secondary" size="sm">
              Team dashboard
            </Button>
          </Link>
          <Link href="/admin">
            <Button variant="primary" size="sm">
              Admin
            </Button>
          </Link>
        </nav>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="flex-1 flex items-center">
        <div className="w-full max-w-5xl mx-auto px-8 py-24 grid grid-cols-12 gap-8">
          <div className="col-span-12 md:col-span-8">
            <p className="text-[0.75rem] font-medium uppercase tracking-[0.24em] text-accent mb-5">
              Twenty quarters · One airline · Your board is watching
            </p>
            <h1 className="font-display text-[clamp(2.5rem,6vw,4.25rem)] leading-[1.05] text-ink mb-8">
              Build an airline
              <br />
              that outlives the
              <br />
              <span className="italic">crisis.</span>
            </h1>
            <p className="text-ink-2 text-[1.0625rem] leading-[1.65] max-w-[40ch] mb-10">
              A turn-based executive simulation for senior aviation leaders.
              Five airlines. Twenty quarters. Eighteen board decisions. Every
              choice compounds.
            </p>
            <div className="flex items-center gap-3">
              <Link href="/dashboard">
                <Button variant="primary" size="lg">
                  Enter your airline →
                </Button>
              </Link>
              <Link href="/styleguide">
                <Button variant="ghost" size="lg">
                  Style guide
                </Button>
              </Link>
            </div>
          </div>

          <aside className="col-span-12 md:col-span-4 flex flex-col gap-4">
            {[
              { k: "Teams", v: "2–10" },
              { k: "Quarters per game", v: "20" },
              { k: "Board decisions", v: "18" },
              { k: "Cities on the map", v: "100" },
              { k: "Physical sim", v: "1.5 days" },
            ].map((row) => (
              <div
                key={row.k}
                className="flex items-baseline justify-between border-b border-line pb-3 last:border-b-0"
              >
                <span className="text-[0.75rem] uppercase tracking-wider text-ink-muted">
                  {row.k}
                </span>
                <span className="tabular font-display text-[1.25rem] text-ink">
                  {row.v}
                </span>
              </div>
            ))}
          </aside>
        </div>
      </section>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer className="px-8 py-5 border-t border-line flex items-center justify-between text-[0.75rem] text-ink-muted">
        <span>SkyForce · v0.1 · feat/skyforce-v1</span>
        <span className="tabular">Q1 opens when your facilitator starts the session.</span>
      </footer>
    </main>
  );
}
