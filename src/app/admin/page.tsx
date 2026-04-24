import Link from "next/link";
import { Button } from "@/components/ui";

export default function AdminPlaceholder() {
  return (
    <main className="flex-1 flex items-center justify-center px-8 py-24">
      <div className="max-w-lg text-center">
        <p className="text-[0.6875rem] uppercase tracking-[0.22em] text-accent mb-3">
          Phase 2
        </p>
        <h1 className="font-display text-4xl text-ink leading-tight mb-4">
          Admin portal coming next
        </h1>
        <p className="text-ink-2 text-[0.9375rem] leading-relaxed mb-6">
          Quarter control, team management, scenario admin, live-sim outcomes,
          aircraft market, fuel index, leaderboard controls, audit logs — all
          per PRD §10.
        </p>
        <Link href="/">
          <Button variant="secondary">← Back to landing</Button>
        </Link>
      </div>
    </main>
  );
}
