"use client";

/**
 * /lobby — single source of truth for joining a game.
 *
 * Three things happen on this page:
 *   1. Browse public games (joinable directly) — sorted by Phase 8.4:
 *      lobbies waiting for players first (oldest first within), then
 *      in-progress games (most-progressed first within). Ended games
 *      and full active games are filtered out at the API level.
 *   2. Enter a 6-digit code to join a private game (bumped from 4 in
 *      Phase 1 hardening — 1M-keyspace makes brute-force infeasible
 *      with the per-IP rate limiter).
 *   3. Click "Create game" to host your own.
 *
 * Private games are NOT listed here — they exist only via code, so
 * showing them in the lobby would defeat "private". The code-input
 * field at the top is the only path into a private game from the
 * lobby; the host pastes the 6-digit code from /games/[id]/lobby's
 * prominent "share this code" panel.
 */

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight, Plus, RefreshCw, Users, Lock, Sparkles, Globe2, Play,
  KeyRound, Loader2,
} from "lucide-react";
import { isMultiplayerAvailable } from "@/lib/supabase/browser";
import { useMultiplayerSession } from "@/lib/games/useMultiplayerSession";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import type { GameRow } from "@/lib/supabase/types";

// Joinable-game shape returned by /api/games/list — extends GameRow
// with the per-game member count so we can render "3/6 joined"
// affordances without a follow-up roundtrip.
interface JoinableGame extends GameRow {
  member_count?: number;
}

export default function LobbyPage() {
  const router = useRouter();
  const { sessionId } = useMultiplayerSession();
  const [games, setGames] = useState<JoinableGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Phase 8 — the global <ActiveGameRibbon /> mounted in the root
  // layout now surfaces the "Resume game" CTA at the top of every
  // marketing page (lobby included), so this page no longer renders
  // its own active-game banner. Removing the duplicate prevents the
  // visual stutter where users saw two side-by-side resume CTAs.
  const [code, setCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  async function loadGames() {
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

  useEffect(() => {
    // loadGames() is async — its setState calls fire after the await,
    // not synchronously inside the effect body. React 19's
    // set-state-in-effect rule flags this via static analysis anyway.
    // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
    loadGames();
  }, []);

  async function handleJoinByCode(e: React.FormEvent) {
    e.preventDefault();
    setJoinError(null);
    // Phase 1.6 bumped join codes from 4 digits to 6. Accept either
    // length here so private games created on the legacy 4-digit
    // schema (during the rollout) keep working.
    if (!/^\d{4}$|^\d{6}$/.test(code)) {
      setJoinError("Enter the 6-digit code from your host.");
      return;
    }
    if (!sessionId) return;
    setJoining(true);
    try {
      const res = await fetch("/api/games/join", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ joinCode: code, sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setJoinError(json.error ?? "Couldn't find that game.");
        setJoining(false);
        return;
      }
      router.push(`/games/${json.game.id}/lobby`);
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : "Network error");
      setJoining(false);
    }
  }

  const mpAvailable = isMultiplayerAvailable();

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
      <MarketingHeader current="lobby" />

      <main className="max-w-5xl mx-auto px-6 py-12 lg:py-16">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-cyan-600 mb-2">
              Public lobby
            </p>
            <h1 className="text-3xl md:text-4xl font-display font-bold tracking-tight text-slate-900">
              Pick a game to join.
            </h1>
            <p className="text-sm text-slate-500 mt-2 max-w-xl">
              Open games anyone is hosting right now. Got a code from your
              facilitator? Drop it below. Or host your own.
            </p>
          </div>
          <Link
            href="/games/new"
            className="inline-flex items-center gap-1.5 px-5 py-3 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold transition-colors shadow-sm shrink-0"
          >
            <Plus className="w-4 h-4" />
            Create game
          </Link>
        </div>

        <form
          onSubmit={handleJoinByCode}
          className="mb-10 rounded-2xl border border-slate-200 bg-white p-5 flex flex-wrap items-center gap-3"
        >
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-violet-50 ring-4 ring-violet-100 text-violet-700 flex items-center justify-center">
              <KeyRound className="w-4 h-4" />
            </div>
            <div className="hidden sm:block">
              <div className="text-sm font-semibold text-slate-900">Have a code?</div>
              <div className="text-xs text-slate-500">Join a private game</div>
            </div>
          </div>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            inputMode="numeric"
            maxLength={6}
            aria-label="6-digit join code"
            className="flex-1 min-w-[8rem] px-4 py-2.5 rounded-lg border border-slate-200 bg-slate-50/60 font-mono tabular text-center text-2xl font-bold text-slate-900 tracking-[0.3em] focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400"
          />
          <button
            type="submit"
            disabled={(code.length !== 4 && code.length !== 6) || joining || !sessionId}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold disabled:opacity-50 transition-colors shrink-0"
          >
            {joining ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            Join
          </button>
          {joinError && (
            <div className="basis-full text-sm text-rose-600 mt-1">{joinError}</div>
          )}
        </form>

        {!mpAvailable && <ConfigBanner />}

        {mpAvailable && error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-5 mb-6">
            <p className="text-sm font-semibold text-rose-700 mb-1">
              Couldn&rsquo;t load games
            </p>
            <p className="text-sm text-rose-600 mb-3">{error}</p>
            <button
              onClick={loadGames}
              className="text-xs font-medium text-rose-700 underline underline-offset-2"
            >
              Try again
            </button>
          </div>
        )}

        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Open games
              {games && games.length > 0 && (
                <span className="ml-2 text-slate-400 normal-case font-normal tracking-normal">
                  · {games.length}
                </span>
              )}
            </h2>
            <button
              onClick={loadGames}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={loading ? "w-3 h-3 animate-spin" : "w-3 h-3"} />
              Refresh
            </button>
          </div>

          {loading && games === null ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="rounded-xl border border-slate-200 bg-white p-5 h-24 animate-pulse" />
              ))}
            </div>
          ) : mpAvailable && games && games.length === 0 ? (
            <NoGamesEmpty />
          ) : games && games.length > 0 ? (
            <div className="space-y-3">
              {games.map((g) => <GameCard key={g.id} game={g} />)}
            </div>
          ) : null}
        </section>
      </main>

      <MarketingFooter />
    </div>
  );
}

function GameCard({ game }: { game: JoinableGame }) {
  const playing = game.status === "playing";
  const memberCount = game.member_count ?? 0;
  const seatsRemaining = game.max_teams - memberCount;
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
            {/* Phase 8.4 — primary status badge. Lobby vs in-progress
                drives both color and the affordance copy below. */}
            {playing ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-amber-50 text-amber-700">
                <Play className="w-2.5 h-2.5 fill-amber-700" />
                In progress · Q{game.current_quarter}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-emerald-50 text-emerald-700">
                <Users className="w-2.5 h-2.5" />
                Waiting · {memberCount}/{game.max_teams}
              </span>
            )}
            {game.mode === "facilitated" && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-violet-50 text-violet-700">
                <Sparkles className="w-2.5 h-2.5" />
                Game master
              </span>
            )}
            {game.locked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wider bg-slate-100 text-slate-600">
                <Lock className="w-2.5 h-2.5" />
                Locked
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <Users className="w-3 h-3" />
              {game.max_teams} {game.max_teams === 1 ? "seat" : "seats"} total
            </span>
            <span className="text-slate-300">·</span>
            <span>
              {playing
                ? "spectator-only"
                : seatsRemaining > 0
                  ? `${seatsRemaining} seat${seatsRemaining === 1 ? "" : "s"} open`
                  : "lobby full"}
            </span>
          </p>
        </div>
        <div className="text-xs font-semibold text-slate-400 group-hover:text-slate-900 hidden sm:block">
          {playing ? "View →" : "Join →"}
        </div>
      </div>
    </Link>
  );
}

function ConfigBanner() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 mb-8">
      <p className="text-sm font-semibold text-amber-900 mb-2">
        Multiplayer setup pending
      </p>
      <p className="text-sm text-amber-800 max-w-xl leading-relaxed mb-4">
        The Supabase environment isn&rsquo;t wired up yet, so creating + joining
        games over the network is offline. Solo play still works — visit{" "}
        <Link href="/onboarding" className="underline font-medium">
          /onboarding
        </Link>{" "}
        to launch a single-browser run.
      </p>
      <Link
        href="/onboarding"
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-amber-900 text-white text-xs font-semibold hover:bg-amber-800 transition-colors"
      >
        Play offline →
      </Link>
    </div>
  );
}

function NoGamesEmpty() {
  return (
    <div className="rounded-xl border-2 border-dashed border-slate-200 p-12 text-center">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 mb-4">
        <Globe2 className="w-6 h-6" />
      </div>
      <p className="text-base font-semibold text-slate-900 mb-2">
        No public games yet
      </p>
      <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
        Be the first. Set up a public lobby in 30 seconds and share the link
        with your team.
      </p>
      <Link
        href="/games/new"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#00C2CB] hover:bg-[#00a9b1] text-white text-sm font-semibold transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Create the first game
      </Link>
    </div>
  );
}
