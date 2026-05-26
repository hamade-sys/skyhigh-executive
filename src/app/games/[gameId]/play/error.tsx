"use client";

/**
 * Error boundary for /games/[gameId]/play/* — Phase C C1.
 *
 * Pre-fix the play route had no error.tsx. Any unhandled error thrown
 * inside the GameCanvas or its descendants bubbled up to Next.js'
 * root error boundary, which blanks the entire route and shows a
 * generic "Something went wrong" page. In a live workshop, that is
 * the worst-case outcome — every player whose browser hit the bug
 * sees a blank page and assumes the game is dead.
 *
 * With this file in place, Next.js catches the error inside the play
 * route's segment, swaps in this UI, and leaves the surrounding
 * navigation chrome intact. The player can:
 *   - **Try again** — re-mount the segment (often fixes a transient
 *     bad-state read after Realtime delivered a malformed payload).
 *   - **Return to lobby** — go back to /games/<id>/lobby; the server
 *     state is unaffected.
 *   - **Refresh from server** — hard navigation to the same URL
 *     forces a re-fetch + re-hydrate, which heals stale local state.
 *
 * The error message is shown verbatim only in development. In
 * production we show a generic message + the error digest (a stable
 * hash Next assigns for matching server-side logs); the digest is
 * the only thing safe to display in front of a workshop participant.
 */

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RefreshCw, ArrowLeft, Home } from "lucide-react";

export default function PlayRouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  // Log the error to the console (always). Vercel Function logs
  // capture console output, so this lands in the operator's
  // observability stack without needing a custom telemetry route.
  // The error digest (a stable Next-generated hash) lets the operator
  // match what the player saw to the server-side log entry.
  useEffect(() => {
    console.error("[games/play] route error:", error);
  }, [error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
      <div className="max-w-lg w-full rounded-2xl border border-rose-200 bg-white shadow-sm p-6">
        <div className="flex items-start gap-3 mb-4">
          <div className="shrink-0 w-10 h-10 rounded-xl bg-rose-50 ring-4 ring-rose-100 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 leading-tight">
              The game canvas hit an error
            </h1>
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">
              Your saved game state on the server is safe. This is just a
              local rendering problem — the recovery actions below will
              fix it.
            </p>
          </div>
        </div>

        {/* Error reference for support — the digest is a stable hash
            that maps to the server-side log entry, so the operator can
            find the exact stack trace in the Vercel function logs. In
            dev we show the full message + stack inline. */}
        <div className="rounded-md border border-slate-200 bg-slate-50/60 p-3 mb-4">
          <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
            Error reference
          </div>
          {error.digest && (
            <div className="text-xs font-mono text-slate-700 break-all">
              Digest: {error.digest}
            </div>
          )}
          {isDev && (
            <div className="text-xs font-mono text-slate-700 mt-2 whitespace-pre-wrap break-all">
              {error.message}
              {error.stack && (
                <details className="mt-2 text-[11px] opacity-70">
                  <summary className="cursor-pointer">Stack trace</summary>
                  <pre className="mt-1 overflow-auto max-h-48">{error.stack}</pre>
                </details>
              )}
            </div>
          )}
          {!isDev && (
            <div className="text-xs text-slate-500">
              Share the digest above with your facilitator if this keeps happening.
            </div>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => reset()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
          <button
            type="button"
            onClick={() => {
              // Force a hard navigation to re-fetch the game from the
              // server and re-hydrate from scratch. Heals any local
              // store corruption from a bad Realtime payload.
              if (typeof window !== "undefined") {
                window.location.reload();
              } else {
                router.refresh();
              }
            }}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh from server
          </button>
          <Link
            href="/lobby"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-full border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to lobby
          </Link>
          <Link
            href="/"
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-slate-500 hover:text-slate-700 text-xs"
          >
            <Home className="w-3.5 h-3.5" />
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
