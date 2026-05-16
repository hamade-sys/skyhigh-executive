"use client";

import Link from "next/link";
import { Loader2 } from "lucide-react";

/** Shown on lobby/play when guest bootstrap failed or is still pending. */
export function GuestAccessPrompt({
  nextPath,
  guestError,
  guestPending,
  onContinueAsGuest,
}: {
  nextPath: string;
  guestError: string | null;
  guestPending: boolean;
  onContinueAsGuest: () => void;
}) {
  return (
    <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
      <p className="text-base font-semibold text-amber-900 mb-2">
        {guestPending ? "Setting up guest access…" : "Continue as guest"}
      </p>
      <p className="text-sm text-amber-800 mb-4">
        {guestPending
          ? "One moment — we’re creating a temporary session so you can join without signing in."
          : "Play without an account. Your session stays on this device until you sign in to save progress across devices."}
      </p>
      {guestError && (
        <p className="text-sm text-rose-700 mb-4 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2">
          {guestError}
        </p>
      )}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-2">
        <button
          type="button"
          onClick={onContinueAsGuest}
          disabled={guestPending}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          {guestPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Continue as guest
        </button>
        <Link
          href={`/login?next=${encodeURIComponent(nextPath)}`}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Sign in
        </Link>
      </div>
    </div>
  );
}
