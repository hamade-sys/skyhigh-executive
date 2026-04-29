"use client";

/**
 * /games/[gameId]/play — live game canvas for a multiplayer run.
 *
 * Hydrates the engine state from the server, binds this browser to
 * the team owned by `localSessionId`, then renders the existing
 * GameCanvas. The store's `activeTeamId` is set on bind so panels/
 * HUD branch on session-team match instead of the legacy isPlayer.
 *
 * State sync model (current state of the rollout):
 *   1. Initial paint: GET /api/games/load?gameId=X&includeState=1
 *   2. Engine state JSON is fed into the local Zustand store via
 *      `hydrateFromServerState({ stateJson, mySessionId })`.
 *   3. After hydrate, the GameCanvas paints from local store. Local
 *      mutations stay local — server-side write-through (Step 9
 *      Supabase Realtime) lands when CAS + broadcast wiring is in
 *      place. For solo/cohort playtests this is enough: every
 *      browser hydrates from the server, drives its own engine,
 *      and the facilitator console is the source of truth.
 *
 * If the server state hasn't been seeded yet (lobby still open or
 * Supabase unconfigured), we render a friendly graceful-fallback
 * card pointing back to the lobby surface.
 */

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { useLocalSessionId } from "@/lib/games/session";
import { useGame } from "@/store/game";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";
import { GameCanvas } from "@/components/game/GameCanvas";
import { TopBar } from "@/components/layout/TopBar";

interface LoadResponse {
  game: GameRow;
  members: GameMemberRow[];
  state?: { game_id: string; version: number; state_json: unknown; updated_at: string };
}

export default function GamePlayPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  const { gameId } = use(params);
  const sessionId = useLocalSessionId();
  const hydrateFromServerState = useGame((s) => s.hydrateFromServerState);
  const phase = useGame((s) => s.phase);
  const teamsCount = useGame((s) => s.teams.length);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);

  // Step 1 — fetch the server snapshot.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Game not found.");
        } else {
          setData(json);
        }
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Network error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  // Step 2 — hydrate the local Zustand store once we have a state
  // payload. Guarded to fire exactly once per gameId+sessionId so a
  // remount (e.g. dev-mode StrictMode) doesn't re-hydrate twice.
  // The setState calls here are guarded by the early-return checks
  // above so they only fire when we actually have new data; React 19's
  // set-state-in-effect rule flags this anyway via static analysis,
  // hence the disable.
  useEffect(() => {
    if (!data || !sessionId || hydrated) return;
    if (data.game.status !== "playing") return;
    if (!data.state) {
      // Game row says "playing" but state row missing — probably a
      // half-seeded run. Surface a friendly error instead of trying
      // to hydrate from undefined.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Game state missing on the server. Try refreshing in a moment.");
      return;
    }
    const result = hydrateFromServerState({
      stateJson: data.state.state_json,
      mySessionId: sessionId,
    });
    if (!result.ok) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(result.error ?? "Couldn't hydrate game state.");
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [data, sessionId, hydrated, hydrateFromServerState]);

  if (loading) {
    return (
      <CenteredMessage>
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
        <p className="text-sm text-slate-500">Hydrating game state…</p>
      </CenteredMessage>
    );
  }

  if (error || !data) {
    return (
      <CenteredMessage>
        <div className="max-w-md w-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
          <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-3" />
          <p className="text-base font-semibold text-rose-900 mb-2">Couldn&rsquo;t load game</p>
          <p className="text-sm text-rose-700 mb-4">{error ?? "No data."}</p>
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to lobby
          </Link>
        </div>
      </CenteredMessage>
    );
  }

  const myMember = data.members.find((m) => m.session_id === sessionId);

  if (data.game.status === "lobby") {
    // Game hasn't started yet — bounce back to the lobby surface.
    return (
      <CenteredMessage>
        <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-base font-semibold text-amber-900 mb-2">Game hasn&rsquo;t started</p>
          <p className="text-sm text-amber-800 mb-4">
            The host hasn&rsquo;t kicked off the run yet. You&rsquo;ll be auto-routed once they do.
          </p>
          <Link
            href={`/games/${gameId}/lobby`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Go to lobby
          </Link>
        </div>
      </CenteredMessage>
    );
  }

  // Hydrate finished — render the engine. The local store now has the
  // server-authoritative team list, currentQuarter, fuel index, etc.
  if (!hydrated || phase !== "playing" || teamsCount === 0) {
    return (
      <CenteredMessage>
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
        <p className="text-sm text-slate-500">Loading game canvas…</p>
        {myMember && (
          <p className="text-xs text-slate-400 mt-2">
            Seated as {myMember.display_name ?? "Anonymous"} ({myMember.role})
          </p>
        )}
      </CenteredMessage>
    );
  }

  // Full game canvas — exact same shell solo runs use, with the
  // multiplayer-aware activeTeamId bound during hydrate.
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <TopBar />
      <GameCanvas />
    </div>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center text-center">{children}</div>
    </div>
  );
}
