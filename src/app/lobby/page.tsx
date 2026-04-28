"use client";

/**
 * /lobby — public game listing.
 *
 * Anyone can browse this. Public games render as joinable cards;
 * games already in `playing` status appear greyed-out with an
 * "in progress" label. Private games are NEVER shown here — they
 * route through the join-by-code flow on /join instead.
 *
 * Empty states:
 *   - Multiplayer not configured     → "Set up Supabase to use lobby"
 *   - Multiplayer configured, 0 games → "Be the first to start a public game"
 *   - Fetch error                    → red banner with retry button
 *
 * Design:
 *   Light surface (matches game UI), brand teal `#3FA9D6`-style accent
 *   for primary actions, slate-tone neutrals, lucide-react icons.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Globe2, Lock, Plus, RefreshCw, Users, ArrowLeft, Play, Sparkles,
} from "lucide-react";
import { isMultiplayerAvailable } from "@/lib/supabase/browser";
import type { GameRow } from "@/lib/supabase/types";

export default function LobbyPage() {
  const [games, setGames] = useState<GameRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/games/list", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Could not load lobby.");
        setGames([]);
      } else {
        setGames(json.games ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const mpAvailable = isMultiplayerAvailable();

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to entry
          </Link>
          <Link
            href="/games/new"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create game
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-12">
        <div className="flex items-baseline justify-between gap-4 mb-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-2">
              Public lobby
            </p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              Open games
            </h1>
            <p className="text-sm text-slate-500 mt-2 max-w-xl">
              Public games anyone can join. Pick one, claim a seat, and start
              flying. Private games and facilitated cohorts go through their
              own join code on{" "}
              <Link href="/join" className="text-cyan-700 hover:text-cyan-800 underline underline-offset-2">
                /join
              </Link>
              .
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={loading ? "w-3.5 h-3.5 animate-spin" : "w-3.5 h-3.5"} />
            Refresh
          </button>
        </div>

        {/* Empty state — Supabase not configured */}
        {!mpAvailable && (
          <ConfigEmptyState />
        )}

        {/* Error banner */}
        {mpAvailable && error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 mb-6">
            <p className="text-sm font-semibold text-rose-700 mb-1">
              Couldn&rsquo;t load the lobby
            </p>
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              onClick={load}
              className="text-xs font-medium text-rose-700 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {mpAvailable && loading && games === null && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 h-24 animate-pulse" />
            ))}
          </div>
        )}

        {/* Empty — no public games */}
        {mpAvailable && !loading && !error && games !== null && games.length === 0 && (
          <NoGamesEmptyState />
        )}

        {/* Game list */}
        {mpAvailable && games && games.length > 0 && (
          <div className="space-y-3">
            {games.map((game) => <GameCard key={game.id} game={game} />)}
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function GameCard({ game }: { game: GameRow }) {
  const playing = game.status === "playing";
  return (
    <Link
      href={`/games/${game.id}/lobby`}
      className="block rounded-xl border border-slate-200 bg-white p-5 hover:border-slate-300 hover:shadow-sm transition-all group"
    >
      <div className="flex items-center gap-4">
        <div className="w-11 h-11 rounded-xl bg-cyan-50 ring-4 ring-cyan-100 text-cyan-700 flex items-center justify-center shrink-0">
          {game.mode === "facilitated" ? <Sparkles className="w-5 h-5" /> : <Globe2 className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="text-base font-semibold text-slate-900 truncate group-hover:text-slate-700">
              {game.name}
            </h3>
            <ModeBadge mode={game.mode} />
            {game.locked && <LockedBadge />}
            {playing && <PlayingBadge currentQuarter={game.current_quarter} />}
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {game.max_teams} {game.max_teams === 1 ? "seat" : "seats"} max
            </span>
            <span className="text-slate-300">·</span>
            <span>{playing ? "in progress" : "open lobby"}</span>
          </p>
        </div>
        <div className="text-xs text-slate-400 hidden sm:block">
          {playing ? "View" : "Join →"}
        </div>
      </div>
    </Link>
  );
}

function ModeBadge({ mode }: { mode: GameRow["mode"] }) {
  return (
    <span className={
      "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider " +
      (mode === "facilitated"
        ? "bg-violet-50 text-violet-700"
        : "bg-emerald-50 text-emerald-700")
    }>
      {mode === "facilitated" ? "Facilitated" : "Self-guided"}
    </span>
  );
}

function LockedBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600">
      <Lock className="w-2.5 h-2.5" />
      Locked
    </span>
  );
}

function PlayingBadge({ currentQuarter }: { currentQuarter: number }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700">
      <Play className="w-2.5 h-2.5 fill-amber-700" />
      Q{currentQuarter}
    </span>
  );
}

function ConfigEmptyState() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-8 text-center">
      <p className="text-sm font-semibold text-amber-900 mb-2">
        Multiplayer not configured
      </p>
      <p className="text-sm text-amber-800 max-w-md mx-auto leading-relaxed">
        The Supabase environment variables aren&rsquo;t set. Solo and the
        legacy facilitator console still work; public lobby + multi-device
        joining come online once <code className="text-xs px-1 py-0.5 bg-amber-100 rounded">NEXT_PUBLIC_SUPABASE_URL</code>{" "}
        and <code className="text-xs px-1 py-0.5 bg-amber-100 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are populated.
      </p>
      <Link
        href="/onboarding"
        className="inline-block mt-5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
      >
        Play solo instead
      </Link>
    </div>
  );
}

function NoGamesEmptyState() {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mb-4">
        <Globe2 className="w-6 h-6" />
      </div>
      <p className="text-base font-semibold text-slate-900 mb-2">
        No public games yet
      </p>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
        Be the first. Create a public lobby, share the link, and your
        teammates can join from any browser.
      </p>
      <Link
        href="/games/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Create the first game
      </Link>
    </div>
  );
}
