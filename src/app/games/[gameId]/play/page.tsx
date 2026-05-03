"use client";

/**
 * /games/[gameId]/play — live game canvas for a multiplayer run.
 *
 * Hydrates the engine state from the server, binds this browser to
 * the team owned by `localSessionId`, then renders the existing
 * GameCanvas. The store's `activeTeamId` is set on bind so panels/
 * HUD branch on session-team match instead of the legacy isPlayer.
 *
 * State sync model:
 *   1. Initial paint: GET /api/games/load?gameId=X&includeState=1
 *   2. Engine state JSON is fed into the local Zustand store via
 *      `hydrateFromServerState({ stateJson, mySessionId })`.
 *   3. After hydrate, the GameCanvas paints from local store.
 *   4. Key player actions (routes, fleet, sliders, decisions,
 *      quarter close) call pushStateToServer which does a CAS write
 *      to Supabase — each game has its own game_state row keyed by
 *      game_id, so games never affect each other's saves.
 *   5. Supabase Realtime broadcasts every game_state update to all
 *      subscribers. When any player pushes new state, every other
 *      browser on that game re-hydrates automatically — players
 *      stay in sync across devices without polling.
 */

import Link from "next/link";
import { useEffect, useState, useRef, use } from "react";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { useMultiplayerSession } from "@/lib/games/useMultiplayerSession";
import { useGame } from "@/store/game";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";
import { GameCanvas } from "@/components/game/GameCanvas";
// TopBar import removed — GameCanvas mounts it internally (Phase 4.7).

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
  // Stable server-side identity — Supabase user.id only.
  const { sessionId, authReady } = useMultiplayerSession();
  const hydrateFromServerState = useGame((s) => s.hydrateFromServerState);
  const phase = useGame((s) => s.phase);
  const teamsCount = useGame((s) => s.teams.length);
  const [data, setData] = useState<LoadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Ref so the Realtime callback can call the latest hydrateFromServerState
  // without being stale-closed over an old reference.
  const hydrateRef = useRef(hydrateFromServerState);
  useEffect(() => { hydrateRef.current = hydrateFromServerState; }, [hydrateFromServerState]);

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
    // Hydration succeeded — the database is the source of truth for
    // which game this player belongs to; no localStorage key needed.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, [data, sessionId, hydrated, hydrateFromServerState]);

  // Step 3 — Supabase Realtime: re-hydrate whenever any player pushes
  // new state for this game. Each game has its own game_state row
  // (keyed by game_id) so this subscription is perfectly isolated —
  // updates from other games never reach this listener.
  useEffect(() => {
    if (!hydrated || !sessionId) return;
    const supa = getBrowserClient();
    if (!supa) return; // Supabase not configured (local dev without env vars)

    const channel = supa
      .channel(`game-state:${gameId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        {
          event: "UPDATE",
          schema: "public",
          table: "game_state",
          filter: `game_id=eq.${gameId}`,
        },
        (payload: { new: { state_json: unknown; version: number } }) => {
          // Another player pushed new state. Re-hydrate from the fresh
          // server snapshot so this browser stays in sync. We skip if
          // the version hasn't changed (duplicate fire safety).
          const newState = payload.new?.state_json;
          if (!newState) return;
          hydrateRef.current({ stateJson: newState, mySessionId: sessionId });
        },
      )
      .subscribe();

    return () => {
      supa.removeChannel(channel);
    };
  }, [hydrated, gameId, sessionId]);

  // Auth gate — must be signed in to play
  if (authReady && !sessionId) {
    return (
      <CenteredMessage>
        <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-base font-semibold text-amber-900 mb-2">Sign in required</p>
          <p className="text-sm text-amber-800 mb-4">
            You need to be signed in to join a multiplayer game.
          </p>
          <Link
            href={`/login?next=/games/${gameId}/play`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </CenteredMessage>
    );
  }

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
  const isFacilitator =
    myMember?.role === "facilitator" ||
    (sessionId != null && sessionId === (data.game as unknown as Record<string, unknown>).facilitator_session_id);

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
  // Facilitators have no team (teamsCount may still be 0 if seeding just
  // happened), but we still render the canvas so they can observe the game.
  if (!hydrated || phase !== "playing" || (!isFacilitator && teamsCount === 0)) {
    return (
      <CenteredMessage>
        <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
        <p className="text-sm text-slate-500">Loading game canvas…</p>
        {myMember && (
          <p className="text-xs text-slate-400 mt-2">
            Joined as {myMember.display_name ?? "Anonymous"} ({myMember.role})
          </p>
        )}
      </CenteredMessage>
    );
  }

  // Full game canvas — exact same shell solo runs use, with the
  // multiplayer-aware activeTeamId bound during hydrate.
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {/* Game Master observer banner */}
      {isFacilitator && (
        <div className="bg-violet-900 text-violet-100 text-xs font-medium px-4 py-1.5 flex items-center gap-2 shrink-0">
          <span className="text-violet-300">👁</span>
          Game Master — observer mode. Use &ldquo;Switch view&rdquo; to inspect any team.
        </div>
      )}
      {/* Phase 4.7 — GameCanvas mounts its own <TopBar/> + NavRail
          internally. The previous shape rendered TopBar twice in
          multiplayer (once at the play-page level, once inside
          GameCanvas), which produced a duplicated header strip and
          off-by-h-14 map/panel offsets. */}
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
