"use client";

import { cn } from "@/lib/cn";

/** Draining bar for a running clock. `total` and `left` in ms. */
export function CountdownBar({ left, total, className }: { left: number | null; total: number; className?: string }) {
  if (left === null || total <= 0) return null;
  const pct = Math.max(0, Math.min(1, left / total));
  const urgent = left < 3000;
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <div
        className={cn("h-full origin-left rounded-full transition-[background-color] duration-300", urgent ? "bg-[var(--t-red)]" : "bg-[var(--t-teal)]")}
        style={{ transform: `scaleX(${pct})` }}
      />
    </div>
  );
}

/** Big seconds readout with a ring. */
export function CountdownRing({ left, total, size = 120, className }: { left: number | null; total: number; size?: number; className?: string }) {
  if (left === null || total <= 0) return null;
  const pct = Math.max(0, Math.min(1, left / total));
  const r = 44;
  const c = 2 * Math.PI * r;
  const urgent = left < 3000;
  return (
    <div className={cn("relative inline-grid place-items-center", className)} style={{ width: size, height: size }} role="timer" aria-label={`${Math.ceil(left / 1000)} seconds left`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e2e8f0" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={urgent ? "var(--t-red)" : "var(--t-teal)"}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
        />
      </svg>
      <span className="t-font font-extrabold tabular-nums" style={{ fontSize: size * 0.36 }}>
        {Math.ceil(left / 1000)}
      </span>
    </div>
  );
}
