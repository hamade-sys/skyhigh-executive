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
import { useRouter } from "next/navigation";
import { ArrowLeft, AlertCircle, Loader2 } from "lucide-react";
import { useMultiplayerSession } from "@/lib/games/useMultiplayerSession";
import { useGame } from "@/store/game";
import { getBrowserClient } from "@/lib/supabase/browser";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";
import { GameCanvas } from "@/components/game/GameCanvas";
import { useGameRealtime } from "@/lib/games/use-game-realtime";
import { useHeartbeat } from "@/lib/games/use-heartbeat";
import { CohortReveal, hasSeenCohortReveal } from "@/components/game/CohortReveal";
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
  const router = useRouter();
  // Stable server-side identity — Supabase user.id only.
  const { sessionId, authReady } = useMultiplayerSession();
  const hydrateFromServerState = useGame((s) => s.hydrateFromServerState);
  const setQuarterCloseRequest = useGame((s) => s.setQuarterCloseRequest);
  const phase = useGame((s) => s.phase);
  const teamsCount = useGame((s) => s.teams.length);
  const teams = useGame((s) => s.teams);
  // Cohort reveal — shown once per game per browser, immediately after
  // hydration completes. The lazy useState initialiser reads
  // sessionStorage exactly once at first mount and skips any
  // synchronous setState-in-effect dance that would trip the
  // react-hooks/set-state-in-effect rule.
  const [revealDismissed, setRevealDismissed] = useState<boolean>(
    () => hasSeenCohortReveal(gameId),
  );
  const [data, setData] = useState<LoadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [hydrated, setHydrated] = useState(false);
  // Refs so Realtime callbacks always see the latest values without
  // being stale-closed — avoids tearing when sessionId stabilises
  // asynchronously after the subscription is first set up.
  const hydrateRef = useRef(hydrateFromServerState);
  useEffect(() => { hydrateRef.current = hydrateFromServerState; }, [hydrateFromServerState]);
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  // Track the last version we applied so duplicate Realtime fires (which
  // Supabase can occasionally emit) don't trigger a redundant re-hydrate.
  const lastVersionRef = useRef<number>(-1);

  // Step 1 — fetch the server snapshot.
  // Timing instrumentation: every phase logs to console with a tag so
  // a slow-load complaint can be diagnosed by sharing the console
  // output. Total wait = fetchMs + parseMs + hydrateMs + the gap until
  // React re-renders. Logged at info level so they're visible without
  // turning on verbose mode.
  useEffect(() => {
    let cancelled = false;
    const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
    (async () => {
      try {
        const fetchStart = typeof performance !== "undefined" ? performance.now() : Date.now();
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
          { cache: "no-store" },
        );
        const fetchEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        const parseStart = fetchEnd;
        const json = await res.json();
        const parseEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Game not found.");
        } else {
          // Approximate state-payload size for the diagnostic log.
          // JSON.stringify on the parsed object is the closest we can
          // get to byte size from the client; we only do it once.
          let stateBytes = 0;
          try {
            stateBytes = JSON.stringify(json.state?.state_json ?? {}).length;
          } catch { /* ignore — bigint keys etc. */ }
          // eslint-disable-next-line no-console
          console.info(
            "[play] load timing",
            {
              fetchMs: Math.round(fetchEnd - fetchStart),
              parseMs: Math.round(parseEnd - parseStart),
              totalMs: Math.round(parseEnd - t0),
              stateBytes,
              teams: Array.isArray(json.state?.state_json?.teams) ? json.state.state_json.teams.length : 0,
            },
          );
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
    if (data.game.status === "ended") {
      // Game has already ended (force-end, auto-end, or bulk-end via
      // ops SQL). The hydration path requires status='playing'; without
      // this branch, the page sits on "Loading game canvas…" forever.
      // Send the player to /endgame where the recap is rendered from
      // whatever state_json is left over.
      router.replace("/endgame");
      return;
    }
    if (data.game.status !== "playing") return;
    if (!data.state) {
      // Game row says "playing" but state row missing — probably a
      // half-seeded run. Surface a friendly error instead of trying
      // to hydrate from undefined.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Game state missing on the server. Try refreshing in a moment.");
      return;
    }
    const hydrateStart = typeof performance !== "undefined" ? performance.now() : Date.now();
    const fallbackTeamId = data.members.find((m) => m.session_id === sessionId)?.team_id ?? null;
    const result = hydrateFromServerState({
      stateJson: data.state.state_json,
      mySessionId: sessionId,
      fallbackTeamId,
      // Pass the real game_state.version so pushStateToServer sends the
      // correct expectedVersion. Without this, the embedded session.version
      // (which diverges after the start/seed writes) is used and every GM
      // push gets a 409 "stale write" on the very first try.
      dbVersion: data.state.version,
    });
    const hydrateEnd = typeof performance !== "undefined" ? performance.now() : Date.now();
    // eslint-disable-next-line no-console
    console.info("[play] hydrate timing", {
      hydrateMs: Math.round(hydrateEnd - hydrateStart),
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
  }, [data, sessionId, hydrated, hydrateFromServerState, router]);

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
          // server snapshot so this browser stays in sync.
          const newState = payload.new?.state_json;
          const newVersion = payload.new?.version ?? -1;
          if (!newState) return;
          // Skip duplicate fires (Supabase can occasionally re-emit
          // the same row update on reconnect).
          if (newVersion !== -1 && newVersion <= lastVersionRef.current) return;
          lastVersionRef.current = newVersion;
          const sid = sessionIdRef.current;
          if (!sid) return;
          // Pass the real DB version so every re-hydration (including
          // after a GM bot-round advance) tracks the correct expectedVersion.
          hydrateRef.current({ stateJson: newState, mySessionId: sid, dbVersion: newVersion });
        },
      )
      .subscribe();

    return () => {
      supa.removeChannel(channel);
    };
  }, [hydrated, gameId, sessionId]);

  // Phase 8.3 — when the engine transitions to endgame (last human
  // forfeited, or final round closed), route this browser to the
  // endgame summary. Without this, peer browsers stay stuck on the
  // play canvas after the cohort auto-ends.
  useEffect(() => {
    if (phase === "endgame") {
      router.replace("/endgame");
    }
  }, [phase, router]);

  // Phase 6 P1 — heartbeat ping every 30s so peers + the facilitator
  // can see "away (Nm)" indicators in the cohort UI when this player
  // closes their tab or backgrounds it. Solo runs (no gameId) skip
  // the heartbeat.
  useHeartbeat(gameId);

  // Group-C — subscribe to the game:<id> broadcast channel for
  // forfeit / auto-end / start / lock events. The
  // postgres_changes subscription above handles the heavy state
  // refetch; this hook just routes when the game ends or another
  // team flips to bot, both of which warrant an immediate refresh.
  useGameRealtime(hydrated ? gameId : null, {
    onAutoEnded: () => {
      router.replace("/endgame");
    },
    onTeamForfeited: async () => {
      // Refetch state so the team flip surfaces without waiting
      // for the postgres_changes to land. Cheap; both events tend
      // to fire close together — an extra fetch is harmless.
      try {
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (res.ok && sessionId && json?.state?.state_json) {
          hydrateRef.current({
            stateJson: json.state.state_json,
            mySessionId: sessionId,
            fallbackTeamId:
              (json.members as GameMemberRow[] | undefined)
                ?.find((m) => m.session_id === sessionId)
                ?.team_id ?? null,
            // Pass the real DB version so the next pushStateToServer
            // uses the correct expectedVersion and doesn't immediately
            // 409 after a team-forfeit refetch.
            dbVersion: typeof json.state.version === "number"
              ? json.state.version
              : undefined,
          });
        }
      } catch {
        // Best-effort — postgres_changes will catch us up.
      }
    },
    // If a GM locks the game mid-session (e.g. to prevent late joiners
    // from dropping into an active round) re-fetch so the member list
    // and any lock-gated UI reflects the new state immediately.
    onLocked: async () => {
      try {
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (res.ok) setData(json);
      } catch { /* non-fatal */ }
    },
    onUnlocked: async () => {
      try {
        const res = await fetch(
          `/api/games/load?gameId=${encodeURIComponent(gameId)}`,
          { cache: "no-store" },
        );
        const json = await res.json();
        if (res.ok) setData(json);
      } catch { /* non-fatal */ }
    },
    // A peer clicked "End Quarter →". Show the countdown banner on this
    // browser so the player knows the round is closing and can act.
    // The CloseQuarterButton component reads quarterCloseRequest from the
    // store and renders the banner + auto-close timer.
    onQuarterCloseRequested: ({ byTeamId, byTeamName, deadlineAt, requestedQuarter }) => {
      setQuarterCloseRequest({ byTeamId, byTeamName, deadlineAt, requestedQuarter });
    },
  });

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
  // Keep the live canvas mounted during quarter close so the digest modal
  // can render. Earlier this gate only allowed "playing" and "endgame",
  // which meant a legitimate transition to "quarter-closing" blanked the
  // canvas back to "Loading game canvas…" on every peer right after a
  // successful close.
  if (
    !hydrated ||
    (phase !== "playing" && phase !== "quarter-closing" && phase !== "endgame") ||
    (!isFacilitator && teamsCount === 0)
  ) {
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

  // Cohort reveal + GameCanvas — the canvas ALWAYS mounts after
  // hydrate completes. The cohort reveal renders as a fixed-position
  // overlay ON TOP, so the heavy canvas + its child trees (map,
  // panels, TopBar, NavRail) start warming up in parallel with the
  // user reading the lineup. When the user clicks "Begin simulation"
  // the overlay unmounts and the canvas — already painted underneath
  // — is instantly interactive. Earlier shape returned `<CohortReveal />`
  // standalone, which meant the canvas didn't begin mounting until
  // dismissal: classic load-then-load lag.
  const showReveal = !revealDismissed && teams.length > 0 && phase === "playing";
  return (
    <div className="flex-1 min-h-0 flex flex-col relative">
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
      {showReveal && (
        <CohortReveal
          gameId={gameId}
          teams={teams}
          onContinue={() => setRevealDismissed(true)}
        />
      )}
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
