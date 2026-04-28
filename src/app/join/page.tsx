"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Badge, Button, Card, CardBody, Input } from "@/components/ui";
import { useGame } from "@/store/game";
import { CITIES } from "@/data/cities";

/**
 * Player entry point for facilitated sessions. The facilitator generates
 * a 4-digit join code; players land here, enter the code + their company
 * name, pick a hub, and are placed into a seat. Once joined, they go
 * straight into the main game UI as their team.
 */
export default function JoinPage() {
  const router = useRouter();
  const sessionCode = useGame((s) => s.sessionCode);
  const sessionSlots = useGame((s) => s.sessionSlots);
  const join = useGame((g) => g.joinSessionWithCode);

  const [code, setCode] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [hubCode, setHubCode] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const tier1 = CITIES.filter((c) => c.tier === 1).sort((a, b) => a.name.localeCompare(b.name));

  function submit() {
    setError(null);
    const r = join({
      code: code.trim(),
      companyName: companyName.trim(),
      hubCode,
    });
    if (!r.ok) {
      setError(r.error ?? "Couldn't join.");
      return;
    }
    router.push("/");
  }

  const seatsAvailable = sessionSlots.filter((x) => !x.claimed).length;
  const totalSeats = sessionSlots.length;
  const sessionActive = !!sessionCode && totalSeats > 0;

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-12 bg-surface-2/30">
      <Card className="w-[min(560px,calc(100vw-2rem))]">
        <CardBody>
          <Badge tone="accent">Join simulation</Badge>
          <h1 className="font-display text-[2rem] text-ink leading-tight mt-3 mb-1">
            Enter your session.
          </h1>
          <p className="text-ink-2 text-[0.9375rem] mb-6">
            Get the 4-digit code from your facilitator. Pick a company name
            and your hub airport — you&apos;ll start with $150M seed capital
            and a fresh slate.
          </p>

          {sessionActive ? (
            <div className="rounded-md border border-positive/40 bg-[var(--positive-soft)] px-3 py-2 mb-5 text-[0.8125rem]">
              Session is active.{" "}
              <strong className="font-mono tabular text-positive">
                {seatsAvailable}
              </strong>{" "}
              of {totalSeats} seats still open.
            </div>
          ) : (
            <div className="rounded-md border border-warning/40 bg-[var(--warning-soft)] px-3 py-2 mb-5 text-[0.8125rem] text-warning">
              No active session yet. Ask the facilitator to start one and
              share the code, then refresh this page.
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
                4-digit code
              </label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                inputMode="numeric"
                maxLength={4}
                className="font-mono tabular text-[1.75rem] text-center tracking-[0.4em]"
              />
            </div>

            <div>
              <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
                Company name
              </label>
              <Input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value.slice(0, 40))}
                placeholder="Northern Aviation"
                maxLength={40}
              />
              <div className="text-[0.6875rem] text-ink-muted mt-1">
                Used as your airline name throughout the simulation.
              </div>
            </div>

            <div>
              <label className="block text-[0.6875rem] uppercase tracking-wider text-ink-muted font-semibold mb-1.5">
                Hub airport
              </label>
              <select
                value={hubCode}
                onChange={(e) => setHubCode(e.target.value)}
                className="w-full rounded-md border border-line bg-surface px-3 py-2 text-[0.9375rem] text-ink focus:outline-none focus:border-primary"
              >
                <option value="">Select a hub city…</option>
                {tier1.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} — {c.name}, {c.regionName}
                  </option>
                ))}
              </select>
              <div className="text-[0.6875rem] text-ink-muted mt-1">
                You start with 50 slots at your hub plus 30 slots at five
                nearby destinations.
              </div>
            </div>

            {error && (
              <div className="text-[0.875rem] text-negative rounded-md border border-[var(--negative-soft)] bg-[var(--negative-soft)] px-3 py-2">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between pt-2">
              <Link href="/" className="text-[0.875rem] text-ink-muted hover:text-ink">
                ← Back
              </Link>
              <Button
                variant="primary"
                size="lg"
                onClick={submit}
                disabled={!sessionActive || code.length !== 4 || !companyName.trim() || !hubCode}
              >
                Join simulation →
              </Button>
            </div>
          </div>
        </CardBody>
      </Card>
    </main>
  );
}
