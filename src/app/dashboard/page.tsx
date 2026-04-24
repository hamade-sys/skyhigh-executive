import Link from "next/link";
import { Button } from "@/components/ui";

export default function DashboardPlaceholder() {
  return (
    <main className="flex-1 flex items-center justify-center px-8 py-24">
      <div className="max-w-lg text-center">
        <p className="text-[0.6875rem] uppercase tracking-[0.22em] text-accent mb-3">
          Phase 2
        </p>
        <h1 className="font-display text-4xl text-ink leading-tight mb-4">
          Team dashboard coming next
        </h1>
        <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-6">
          Scaffold shipped. Next up: auth, dashboard shell, world map
          (Mapbox), fleet, routes, financials, quarterly ops form, board
          decisions, world news, leaderboard. All per PRD §3 and §19.
        </p>
        <Link href="/">
          <Button variant="secondary">← Back to landing</Button>
        </Link>
      </div>
    </main>
  );
}
