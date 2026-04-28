"use client";

/**
 * /games/[gameId]/lobby — pre-game waiting room.
 *
 * Hydrates the game by id, shows the seat list, lets the host
 * lock/start, and lets players claim a seat. The seat-claim
 * mutation is what binds `team.claimedBySessionId` to the local
 * browser session id; a refresh reconnects to the same team.
 *
 * Step 4 ships this as a render-only surface — claim/start/lock
 * mutations are wired against the API routes from this PR but
 * realtime updates land in Step 9. For now the page polls every
 * 5 seconds while the lobby is open, swaps to no-poll once the
 * game starts.
 *
 * Facilitator extras: a dedicated panel rendered when the local
 * session matches `facilitator_session_id`. Currently shows the
 * join code, locked toggle, and start button. Extends in Step 5.
 */

import Link from "next/link";
import { useEffect, useState, useCallback, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, ArrowRight, Lock, Unlock, Copy, Sparkles, Globe2,
  Loader2, AlertCircle, Users, Play,
} from "lucide-react";
import { useLocalSessionId } from "@/lib/games/session";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";

interface LobbyResponse {
  game: GameRow;
  members: GameMemberRow[];
}

export default function GameLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  // Next 16 unwraps async params via React.use()
  const { gameId } = use(params);
  const router = useRouter();
  const sessionId = useLocalSessionId();
  const [data, setData] = useState<LobbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [copyHint, setCopyHint] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/load?gameId=${encodeURIComponent(gameId)}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Lobby not found.");
      } else {
        setData(json);
        setError(null);
        // Once game starts, route to /play
        if (json.game?.status === "playing") {
          router.replace(`/games/${gameId}/play`);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, [gameId, router]);

  useEffect(() => {
    load();
    // Poll every 5s while in lobby — Step 9 replaces with realtime.
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [load]);

  // Claim a seat as soon as we have a session id and the game is in lobby.
  // The join API is idempotent so re-running is safe.
  useEffect(() => {
    if (!sessionId || !data) return;
    const alreadyJoined = data.members.some((m) => m.session_id === sessionId);
    if (alreadyJoined) return;
    if (data.game.status !== "lobby") return;
    fetch("/api/games/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ gameId, sessionId }),
    }).then(load).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, data?.game.id, data?.game.status]);

  async function action(path: string, body: unknown) {
    if (!sessionId) return;
    setActionPending(true);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(body as object), actorSessionId: sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Action failed.");
      } else {
        await load();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setActionPending(false);
    }
  }

  function handleCopyCode() {
    const code = data?.game?.join_code;
    if (!code || typeof navigator === "undefined") return;
    navigator.clipboard.writeText(code).then(() => {
      setCopyHint(true);
      setTimeout(() => setCopyHint(false), 1500);
    });
  }

  // ── Loading state ─────────────────────────────────────────
  if (loading || !data) {
    return (
      <CenteredMessage>
        {error ? (
          <ErrorCard error={error} />
        ) : (
          <>
            <Loader2 className="w-6 h-6 text-slate-400 animate-spin mb-3" />
            <p className="text-sm text-slate-500">Loading lobby…</p>
          </>
        )}
      </CenteredMessage>
    );
  }

  const game = data.game;
  const isHost = sessionId === game.created_by_session_id;
  const isFacilitator = sessionId !== null && sessionId === game.facilitator_session_id;
  const seatsClaimed = data.members.filter((m) => m.role !== "spectator").length;
  const seatsRemaining = Math.max(0, game.max_teams - seatsClaimed);

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link
            href="/lobby"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Lobby
          </Link>
          <span className="text-xs text-slate-400 tabular">
            {seatsClaimed}/{game.max_teams} seats claimed
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="flex items-center gap-3 mb-2">
          <ModeBadge mode={game.mode} />
          {game.locked && <LockedBadge />}
        </div>
        <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-slate-900 mb-2">
          {game.name}
        </h1>
        <p className="text-sm text-slate-500 mb-10 max-w-xl">
          Players claim seats below. {game.mode === "facilitated"
            ? "The facilitator starts the game when ready."
            : "The host starts the game when everyone is in."}
        </p>

        {/* Host / facilitator panel */}
        {(isHost || isFacilitator) && (
          <HostPanel
            game={game}
            isFacilitator={isFacilitator}
            actionPending={actionPending}
            onCopyCode={handleCopyCode}
            copyHint={copyHint}
            onToggleLock={() => action("/api/games/lock", { gameId, locked: !game.locked })}
            onStart={() => action("/api/games/start", { gameId })}
          />
        )}

        {/* Seats */}
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
            Seats
          </h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {Array.from({ length: game.max_teams }).map((_, i) => {
              const member = data.members[i];
              const isMe = member?.session_id === sessionId;
              return <SeatCard key={i} index={i + 1} member={member ?? null} isMe={isMe} />;
            })}
          </div>
          {seatsRemaining > 0 && game.locked && (
            <p className="text-xs text-amber-700 mt-4 inline-flex items-center gap-1">
              <Lock className="w-3 h-3" />
              {seatsRemaining} {seatsRemaining === 1 ? "seat" : "seats"} unclaimed — lobby is locked.
            </p>
          )}
        </section>

        {error && (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 mt-8">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        )}
      </main>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function HostPanel({
  game, isFacilitator, actionPending, onCopyCode, copyHint, onToggleLock, onStart,
}: {
  game: GameRow;
  isFacilitator: boolean;
  actionPending: boolean;
  onCopyCode: () => void;
  copyHint: boolean;
  onToggleLock: () => void;
  onStart: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">
        {isFacilitator ? "Facilitator controls" : "Host controls"}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {/* Join code (private only) */}
        {game.join_code && (
          <button
            onClick={onCopyCode}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
          >
            <span className="text-xs uppercase tracking-wider text-slate-500">Code</span>
            <span className="font-mono text-base font-bold tabular text-slate-900">{game.join_code}</span>
            <Copy className="w-3.5 h-3.5 text-slate-500" />
            {copyHint && <span className="text-xs text-emerald-600">Copied!</span>}
          </button>
        )}
        {/* Lock toggle */}
        <button
          onClick={onToggleLock}
          disabled={actionPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-sm font-medium text-slate-700 disabled:opacity-50 transition-colors"
        >
          {game.locked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {game.locked ? "Unlock lobby" : "Lock lobby"}
        </button>
        {/* Start button — sticky right */}
        <div className="ml-auto">
          <button
            onClick={onStart}
            disabled={actionPending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            {actionPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-white" />
            )}
            Start game
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function SeatCard({
  index, member, isMe,
}: {
  index: number;
  member: GameMemberRow | null;
  isMe: boolean;
}) {
  const claimed = !!member;
  return (
    <div className={
      "rounded-xl border p-4 " +
      (isMe
        ? "border-cyan-300 bg-cyan-50/40"
        : claimed
          ? "border-slate-200 bg-white"
          : "border-dashed border-slate-200 bg-white")
    }>
      <div className="flex items-center gap-3">
        <div className={
          "w-9 h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular " +
          (claimed ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-400")
        }>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          {claimed ? (
            <>
              <div className="text-sm font-semibold text-slate-900 truncate">
                {member.display_name ?? "Anonymous player"}
                {isMe && <span className="ml-2 text-xs font-medium text-cyan-700">· you</span>}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {member.role === "facilitator" ? "Facilitator" :
                 member.role === "host" ? "Host" :
                 member.role === "spectator" ? "Spectator" : "Player"}
              </div>
            </>
          ) : (
            <div className="text-sm font-medium text-slate-400 italic">
              Open seat
            </div>
          )}
        </div>
      </div>
    </div>
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
      {mode === "facilitated" ? <Sparkles className="w-2.5 h-2.5" /> : <Globe2 className="w-2.5 h-2.5" />}
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

function CenteredMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="flex flex-col items-center text-center">{children}</div>
    </div>
  );
}

function ErrorCard({ error }: { error: string }) {
  return (
    <div className="max-w-md w-full rounded-xl border border-rose-200 bg-rose-50 p-6 text-center">
      <AlertCircle className="w-8 h-8 text-rose-600 mx-auto mb-3" />
      <p className="text-base font-semibold text-rose-900 mb-2">Couldn&rsquo;t load lobby</p>
      <p className="text-sm text-rose-700 mb-4">{error}</p>
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to lobby
      </Link>
    </div>
  );
}
