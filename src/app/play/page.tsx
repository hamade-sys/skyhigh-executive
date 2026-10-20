"use client";

/**
 * /play — the Jackbox-style front door for players: room code + name.
 * The big screen says "go to sim.icanmena.com/play"; a QR code lands
 * on /play/<CODE> with the code already filled in.
 */

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { JoinForm } from "@/components/trivia/JoinForm";
import { Wordmark } from "@/components/trivia/Wordmark";

function JoinScreen() {
  const router = useRouter();
  const params = useSearchParams();
  return (
    <JoinForm
      initialCode={params.get("code") ?? ""}
      onJoined={({ code }) => router.replace(`/play/${code}`)}
    />
  );
}

export default function PlayPage() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-10 px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
        <div className="text-center">
          <Wordmark size="lg" />
          <p className="mt-3 text-[var(--t-muted)]">Buzz in from your phone.</p>
        </div>
        <Suspense fallback={<div className="h-80" />}>
          <JoinScreen />
        </Suspense>
        <Link href="/trivia" className="text-sm text-[var(--t-faint)] underline-offset-4 hover:text-[var(--t-ink)] hover:underline">
          Hosting a game? Build a board →
        </Link>
      </div>
    </main>
  );
}
