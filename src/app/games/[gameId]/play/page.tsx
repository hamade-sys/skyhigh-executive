"use client";

/**
 * /games/[gameId]/play — live game canvas for a multiplayer run.
 *
 * Hydrates the engine state from the server, binds this browser to
 * the team owned by `localSessionId`, then renders the existing
 * GameCanvas. The store's `activeTeamId` is set on bind so panels/
 * HUD branch on session-team match instead of the legacy isPlayer.
 *
 * Step 4 ships this as a hydrate-once surface — server-mediated
 * mutations + ready-flag quarter close land in Step 8, realtime
 * sync in Step 9. For now the page loads, binds, and renders;
 * subsequent quarter closes still go through the local engine.
 *
 * State sync model (placeholder):
 *   1. Initial paint: GET /api/games/load?gameId=X&includeState=1
 *   2. Engine state JSON is fed into the local Zustand store via
 *      `hydrateFromSnapshot()` (added in Step 8 — for now we render
 *      a "coming soon" notice when the snapshot is present but the
 *      hydrate path isn't wired).
 *   3. Mutations push to /api/games/state with version CAS.
 *   4. Realtime channel subscribes to broadcasts; remote mutations
 *      replace the local store snapshot.
 */

import Link from "next/link";
import { useEffect, useState, use } from "react";
import { ArrowLeft, AlertCircle, Loader2, Construction } from "lucide-react";
import { useLocalSessionId } from "@/lib/games/session";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";

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
  const [data, setData] = useState<LoadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  // Game is playing or ended — render the engine.
  // The hydrate-into-store pipeline isn't wired yet; surface a
  // construction notice so testers know what they're looking at.
  return (
    <CenteredMessage>
      <div className="max-w-lg w-full rounded-xl border border-cyan-200 bg-cyan-50 p-6 text-center">
        <Construction className="w-10 h-10 text-cyan-600 mx-auto mb-4" />
        <p className="text-base font-semibold text-cyan-900 mb-2">
          {data.game.name}
        </p>
        <p className="text-sm text-cyan-800 mb-1">
          Q{data.game.current_quarter} · {data.game.mode === "facilitated" ? "Facilitated" : "Self-guided"}
        </p>
        {myMember && (
          <p className="text-xs text-cyan-700 mb-4">
            You&rsquo;re seated as {myMember.display_name ?? "Anonymous"} ({myMember.role})
          </p>
        )}
        <div className="text-sm text-cyan-800 max-w-md mx-auto leading-relaxed">
          The play surface hydrates the engine from server state in Step 8 of
          the rollout. For now the run is created in Supabase but the live
          canvas + ready-flag quarter close land next. You can return to{" "}
          <Link href={`/games/${gameId}/lobby`} className="font-semibold underline underline-offset-2">
            the lobby
          </Link>{" "}
          to confirm seats + facilitator controls.
        </div>
      </div>
    </CenteredMessage>
  );
}

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center text-center">{children}</div>
    </div>
  );
}
