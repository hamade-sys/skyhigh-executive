"use client";

/**
 * Builder pages need a real account: boards, templates and the column
 * bank belong to one, and so does the AI assist. Players never see
 * this — they join with a code.
 */

import Link from "next/link";
import { Loader2 } from "lucide-react";
import type { ReactNode } from "react";
import { useAuth } from "@/lib/auth-context";
import { Wordmark } from "@/components/trivia/Wordmark";

export function HostGate({ next, children }: { next: string; children: ReactNode }) {
  const { user, loading, authConfigured } = useAuth();
  if (loading) {
    return (
      <div className="grid flex-1 place-items-center bg-[#F9FAFB]">
        <Loader2 className="h-7 w-7 animate-spin text-slate-400" aria-label="Loading" />
      </div>
    );
  }
  if (!user || user.is_anonymous) {
    return (
      <div className="grid flex-1 place-items-center bg-[#F9FAFB] p-6">
        <div className="max-w-md text-center">
          <Wordmark size="lg" />
          <p className="mt-5 text-lg text-slate-700">
            {user?.is_anonymous ? "Guest sessions can play, but building and hosting needs an account." : "Sign in to build boards and host games."}
          </p>
          <p className="mt-2 text-sm text-slate-500">Your boards, templates and column bank are saved to your account. Players never need one — they join with the room code.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            {authConfigured && (
              <Link href={`/login?next=${encodeURIComponent(next)}`} className="inline-flex min-h-11 items-center rounded-lg bg-[#02797F] px-5 font-semibold text-white hover:bg-[#026a6f]">
                Sign in
              </Link>
            )}
            <Link href="/play" className="inline-flex min-h-11 items-center rounded-lg border border-slate-300 bg-white px-5 font-semibold text-slate-800 hover:bg-slate-50">
              Join a game instead
            </Link>
          </div>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
