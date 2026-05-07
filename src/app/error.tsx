"use client";

/**
 * Branded global error boundary. Renders when a route segment throws
 * an unhandled error. Replaces the default Next.js red-on-white error
 * stack trace with a calm, on-brand recovery card.
 *
 * Phase 6 of the enterprise-readiness plan: a live workshop cannot
 * surface a stack trace to a senior executive. This component:
 *   - Logs to console with a consistent prefix so the dev console
 *     remains useful in development.
 *   - Surfaces a generic "something went wrong" message — never the
 *     raw error message, which can leak internals or unsettle a
 *     non-technical audience.
 *   - Offers one-click recovery: Reset to retry the route segment,
 *     Go home as a hard fallback. The Reset button calls the
 *     `reset()` callback Next provides, which re-renders the segment.
 *
 * If you wire up Sentry / @vercel/observability later, hook
 * `Sentry.captureException(error)` into the useEffect below — the
 * `digest` field is the production-safe error id you can pivot on.
 */

import { useEffect } from "react";
import Link from "next/link";
import { AlertCircle, RotateCcw, Home } from "lucide-react";
import { captureException } from "@/lib/telemetry";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Telemetry: structured log + optional webhook POST. Without a
    // configured webhook this is just a richer console.error; with
    // NEXT_PUBLIC_TELEMETRY_WEBHOOK set, every error fires real-time
    // to whatever channel the operator wires up (Slack / Discord /
    // Vercel Webhook / etc.). See src/lib/telemetry.ts.
    captureException(error, {
      route: typeof window !== "undefined" ? window.location.pathname : "unknown",
    });
  }, [error]);

  return (
    <main className="flex-1 min-h-0 flex items-center justify-center bg-slate-50 px-6 py-16">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 bg-white shadow-sm p-8 text-center">
        <div className="inline-flex w-12 h-12 rounded-full bg-rose-50 ring-4 ring-rose-100 items-center justify-center mb-4">
          <AlertCircle className="w-6 h-6 text-rose-600" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-display font-bold text-slate-900 mb-2">
          Something went wrong on this screen
        </h1>
        <p className="text-sm text-slate-500 leading-relaxed mb-6">
          Your game state is safe. The facilitator has been notified.
          You can retry the screen or head back to the lobby.
        </p>
        {error.digest && (
          <p className="text-[11px] font-mono text-slate-400 mb-6">
            Reference: {error.digest}
          </p>
        )}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#00C2CB] text-white text-sm font-semibold hover:bg-[#00a9b1] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-slate-200 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors"
          >
            <Home className="w-3.5 h-3.5" />
            Back to home
          </Link>
        </div>
      </div>
    </main>
  );
}
