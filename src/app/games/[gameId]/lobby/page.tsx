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
import { getBrowserClient } from "@/lib/supabase/browser";
import {
  ArrowLeft, ArrowRight, Lock, Unlock, Copy, Sparkles, Globe2,
  Loader2, AlertCircle, Play, Trash2, CheckCircle2, Plane, Bot, User,
} from "lucide-react";
import { useMultiplayerSession } from "@/lib/games/useMultiplayerSession";
import type { GameRow, GameMemberRow } from "@/lib/supabase/types";

type DoctrineId = "premium-service" | "budget-expansion" | "cargo-dominance" | "global-network";
type SeatType = "human" | "bot";
type Difficulty = "easy" | "medium" | "hard";

interface SeatConfig {
  index: number;   // 0-based
  type: SeatType;
  difficulty: Difficulty;
}

// Names assigned to bots in seat order — mirrors BOT_DEFAULTS in the start route.
const BOT_NAMES = [
  "Aurora Airways",
  "Sundial Carriers",
  "Meridian Air",
  "Pacific Crest",
  "Transit Nordique",
  "Solstice Wings",
  "Vermilion Air",
  "Firth Pacific",
] as const;

const DOCTRINES: { id: DoctrineId; label: string; desc: string }[] = [
  { id: "premium-service",  label: "Premium",     desc: "Higher fares, loyal business travellers" },
  { id: "budget-expansion", label: "Budget",       desc: "High volume, secondary markets" },
  { id: "cargo-dominance",  label: "Cargo",        desc: "Freight focus, resilient in downturns" },
  { id: "global-network",   label: "Global Network", desc: "Breadth pays — routes compound" },
];

const POPULAR_HUBS = [
  { code: "IST", name: "Istanbul" },
  { code: "LHR", name: "London Heathrow" },
  { code: "DXB", name: "Dubai" },
  { code: "FRA", name: "Frankfurt" },
  { code: "AMS", name: "Amsterdam" },
  { code: "CDG", name: "Paris CDG" },
  { code: "NRT", name: "Tokyo Narita" },
  { code: "SIN", name: "Singapore" },
  { code: "HKG", name: "Hong Kong" },
  { code: "JFK", name: "New York JFK" },
];

interface LobbyResponse {
  game: GameRow;
  members: GameMemberRow[];
  state?: { state_json: unknown };
}

export default function GameLobbyPage({
  params,
}: {
  params: Promise<{ gameId: string }>;
}) {
  // Next 16 unwraps async params via React.use()
  const { gameId } = use(params);
  const router = useRouter();
  // Stable server-side identity — Supabase user.id only.
  // authReady flips true once the auth session check completes.
  const { sessionId, authReady } = useMultiplayerSession();
  const [data, setData] = useState<LobbyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionPending, setActionPending] = useState(false);
  const [copyHint, setCopyHint] = useState(false);

  // ── Seat configuration (host/GM can toggle each unclaimed seat) ────────
  const [seatConfigs, setSeatConfigs] = useState<SeatConfig[]>([]);
  const [seatConfigSaving, setSeatConfigSaving] = useState(false);

  // ── Airline setup state (for non-facilitator players) ─────────────────
  const [airlineName, setAirlineName] = useState("");
  const [airlineCode, setAirlineCode] = useState("");
  const [airlineHub, setAirlineHub] = useState("IST");
  const [airlineDoctrine, setAirlineDoctrine] = useState<DoctrineId>("premium-service");
  const [setupSaved, setSetupSaved] = useState(false);
  const [setupSaving, setSetupSaving] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/games/load?gameId=${encodeURIComponent(gameId)}&includeState=1`, {
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

  // Initial fetch on mount.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  // Initialise seatConfigs from the server's plannedSeats once data loads.
  useEffect(() => {
    if (!data) return;
    const maxTeams = data.game.max_teams;
    const planned = (
      (data.state?.state_json as Record<string, unknown> | undefined)
        ?.session as Record<string, unknown> | undefined
    )?.plannedSeats as Array<{ type?: string; botDifficulty?: string }> | undefined;

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSeatConfigs(
      Array.from({ length: maxTeams }, (_, i) => {
        const p = planned?.[i];
        return {
          index: i,
          type: (p?.type === "bot" ? "bot" : "human") as SeatType,
          difficulty: ((p?.botDifficulty ?? "medium") as Difficulty),
        };
      }),
    );
  // Only re-init when the game data changes from the server (e.g. after reload).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.game.id, data?.state]);

  async function handleSeatConfigChange(index: number, patch: Partial<SeatConfig>) {
    const updated = seatConfigs.map((s) =>
      s.index === index ? { ...s, ...patch } : s,
    );
    setSeatConfigs(updated);
    setSeatConfigSaving(true);
    try {
      await fetch("/api/games/seat-config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ gameId, seatConfigs: updated }),
      });
    } catch { /* non-critical — local state already updated */ }
    finally { setSeatConfigSaving(false); }
  }

  // Supabase Realtime — live updates for all lobby events.
  // Three channels cover every change that matters in the lobby:
  //   1. game_members — someone joins or leaves
  //   2. games        — game locked/unlocked, or status flips to "playing"
  //   3. game_state   — a player saves their airline setup
  // Each event re-fetches fresh data so every participant's screen
  // stays in sync without polling.
  useEffect(() => {
    const supa = getBrowserClient();
    if (!supa) {
      // Supabase not configured — fall back to 5-second polling
      // so the lobby still works in local dev without env vars.
      const id = setInterval(load, 5_000);
      return () => clearInterval(id);
    }

    const channel = supa
      .channel(`lobby:${gameId}`)
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "game_members", filter: `game_id=eq.${gameId}` },
        () => { load(); },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` },
        () => { load(); },
      )
      .on(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        "postgres_changes" as any,
        { event: "UPDATE", schema: "public", table: "game_state", filter: `game_id=eq.${gameId}` },
        () => { load(); },
      )
      .subscribe();

    return () => { supa.removeChannel(channel); };
  }, [gameId, load]);

  // Claim a seat as soon as we have a session id and the game is in lobby.
  // The join API is idempotent — re-joining with the same session id is
  // the reconnect path and only updates last_seen_at.
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

  async function handleSaveSetup() {
    if (!sessionId || !airlineName.trim() || !airlineCode.trim()) return;
    setSetupSaving(true);
    setSetupError(null);
    try {
      const res = await fetch("/api/games/player-setup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          gameId,
          sessionId,
          airlineName: airlineName.trim(),
          code: airlineCode.trim(),
          hub: airlineHub,
          doctrine: airlineDoctrine,
        }),
      });
      const json = await res.json();
      if (!res.ok) { setSetupError(json.error ?? "Save failed."); }
      else {
        setSetupSaved(true);
        // Refresh lobby data immediately so all seat badges flip to "✓ Ready"
        // without waiting for the 5-second poll cycle.
        await load();
      }
    } catch (e) {
      setSetupError(e instanceof Error ? e.message : "Network error");
    } finally {
      setSetupSaving(false);
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

  // ── Auth gate — player must be signed in ─────────────────
  if (authReady && !sessionId) {
    return (
      <CenteredMessage>
        <div className="max-w-md w-full rounded-xl border border-amber-200 bg-amber-50 p-6 text-center">
          <p className="text-base font-semibold text-amber-900 mb-2">Sign in required</p>
          <p className="text-sm text-amber-800 mb-4">
            You need to be signed in to join or view a game lobby.
          </p>
          <Link
            href={`/login?next=/games/${gameId}/lobby`}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
          >
            Sign in →
          </Link>
        </div>
      </CenteredMessage>
    );
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
  // sessionId is always user.id (real or anonymous Supabase auth) —
  // no localStorage fallback needed because signInAnonymously() runs
  // before the join call, so the member row is always keyed to user.id.
  const myMember = data.members.find((m) => m.session_id === sessionId);
  const isFacilitator =
    (sessionId !== null && sessionId === game.facilitator_session_id) ||
    myMember?.role === "facilitator";
  // Count player seats only (not facilitator/spectator).
  const seatsClaimed = data.members.filter(
    (m) => m.role !== "spectator" && m.role !== "facilitator"
  ).length;
  const seatsRemaining = Math.max(0, game.max_teams - seatsClaimed);

  // Which session IDs have saved their airline setup (from server state_json)
  const playerSetups = (
    (data.state?.state_json as Record<string, unknown> | undefined)?.playerSetups as
      Record<string, unknown> | undefined
  ) ?? {};
  // Track whether MY airline setup is saved (players only — facilitator has no team)
  const mySetupSaved = !isFacilitator && (setupSaved || (sessionId != null && sessionId in playerSetups));

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50">
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
        <p className="text-sm text-slate-500 mb-8 max-w-xl">
          Players claim seats below. {game.mode === "facilitated"
            ? "The Game Master starts when everyone is in."
            : "The host starts when everyone is in."}
        </p>

        {/* Prominent share-code banner — shown on private games to
            ANY visitor (so non-host members can see the code their
            host shared with them, and the host can copy at a glance). */}
        {game.join_code && game.status === "lobby" && (
          <ShareCodeBanner
            code={game.join_code}
            onCopy={handleCopyCode}
            copyHint={copyHint}
          />
        )}

        {/* Host / Game Master panel */}
        {(isHost || isFacilitator) && (
          <HostPanel
            game={game}
            isFacilitator={isFacilitator}
            actionPending={actionPending}
            onCopyCode={handleCopyCode}
            copyHint={copyHint}
            onToggleLock={() => action("/api/games/lock", { gameId, locked: !game.locked })}
            onStart={() => action("/api/games/start", { gameId })}
            onDelete={async () => {
              await action("/api/games/delete", { gameId, sessionId });
              router.replace("/lobby");
            }}
          />
        )}

        {/* Airline setup — shown to players; facilitator/game master has no team */}
        {myMember && !isFacilitator && myMember.role !== "spectator" && game.status === "lobby" && (
          <section className="mt-8">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">
              Set up your airline
            </h2>
            {mySetupSaved ? (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-emerald-900">
                    {airlineName} ({airlineCode}) · Hub {airlineHub}
                  </p>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    Saved! The game master will start shortly.
                    <button
                      onClick={() => setSetupSaved(false)}
                      className="ml-2 underline text-emerald-700 hover:text-emerald-900"
                    >
                      Edit
                    </button>
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-1">
                  <Plane className="w-4 h-4 text-cyan-500" />
                  Brand your airline before the game starts
                </div>

                <div className="grid sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Airline name *</label>
                    <input
                      type="text"
                      value={airlineName}
                      onChange={(e) => setAirlineName(e.target.value)}
                      placeholder="e.g. SkyForce Airlines"
                      maxLength={40}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">IATA code (2–3 letters) *</label>
                    <input
                      type="text"
                      value={airlineCode}
                      onChange={(e) => setAirlineCode(e.target.value.toUpperCase().slice(0, 3))}
                      placeholder="e.g. SKF"
                      maxLength={3}
                      className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400 font-mono uppercase"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Home hub airport</label>
                  <select
                    value={airlineHub}
                    onChange={(e) => setAirlineHub(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-200 focus:border-cyan-400"
                  >
                    {POPULAR_HUBS.map((h) => (
                      <option key={h.code} value={h.code}>{h.code} — {h.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-2">Strategy doctrine</label>
                  <div className="grid sm:grid-cols-2 gap-2">
                    {DOCTRINES.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setAirlineDoctrine(d.id)}
                        className={
                          "text-left rounded-lg border p-3 text-xs transition-all " +
                          (airlineDoctrine === d.id
                            ? "border-cyan-400 bg-cyan-50 ring-2 ring-cyan-200"
                            : "border-slate-200 bg-slate-50 hover:border-slate-300")
                        }
                      >
                        <div className="font-semibold text-slate-800 mb-0.5">{d.label}</div>
                        <div className="text-slate-500">{d.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {setupError && (
                  <p className="text-xs text-rose-600">{setupError}</p>
                )}

                <button
                  onClick={handleSaveSetup}
                  disabled={setupSaving || !airlineName.trim() || airlineCode.trim().length < 2}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-[#00C2CB] text-white text-sm font-semibold hover:bg-[#00a9b1] disabled:opacity-50 transition-colors"
                >
                  {setupSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Save my airline
                </button>
              </div>
            )}
          </section>
        )}

        {/* Seats */}
        <section className="mt-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">
              Seats
            </h2>
            {(isHost || isFacilitator) && seatConfigSaving && (
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Loader2 className="w-2.5 h-2.5 animate-spin" />
                Saving…
              </span>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            {(() => {
              // Only show player seats — exclude facilitator/spectator so
              // the game master doesn't appear as one of the player seats.
              const playerMembers = data.members.filter(
                (m) => m.role !== "spectator" && m.role !== "facilitator",
              );
              return Array.from({ length: game.max_teams }).map((_, i) => {
                const member = playerMembers[i];
                const isMe = member ? member.session_id === sessionId : false;
                const hasSetup = member ? member.session_id in playerSetups : false;
                const cfg = seatConfigs[i] ?? { index: i, type: "human" as SeatType, difficulty: "medium" as Difficulty };
                return (
                  <SeatCard
                    key={i}
                    index={i + 1}
                    member={member ?? null}
                    isMe={isMe}
                    hasSetup={hasSetup}
                    seatConfig={cfg}
                    canEditConfig={(isHost || isFacilitator) && !member && game.status === "lobby"}
                    onConfigChange={(patch) => handleSeatConfigChange(i, patch)}
                  />
                );
              });
            })()}
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

function ShareCodeBanner({
  code, onCopy, copyHint,
}: {
  code: string;
  onCopy: () => void;
  copyHint: boolean;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white p-6 mb-8 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-cyan-500/15 rounded-full blur-3xl -mr-20 -mt-20" />
      <div className="relative flex flex-wrap items-center justify-between gap-6">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-cyan-300 mb-2">
            Private game · share this code
          </p>
          <p className="text-sm text-slate-300 mb-1 max-w-md leading-relaxed">
            Players visit <span className="font-mono text-white">/lobby</span> and enter this 4-digit code to join your game.
          </p>
        </div>
        <button
          onClick={onCopy}
          className="group inline-flex items-center gap-4 px-6 py-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
          aria-label={`Copy join code ${code}`}
        >
          <span className="font-mono text-5xl font-bold tabular text-white tracking-[0.25em]">
            {code}
          </span>
          <span className="flex flex-col items-start text-xs">
            <span className="text-slate-300 group-hover:text-white transition-colors">
              {copyHint ? "Copied!" : "Click to copy"}
            </span>
            <span className="text-slate-500 mt-0.5">share via chat / email</span>
          </span>
        </button>
      </div>
    </div>
  );
}

function HostPanel({
  game, isFacilitator, actionPending, onCopyCode, copyHint, onToggleLock, onStart, onDelete,
}: {
  game: GameRow;
  isFacilitator: boolean;
  actionPending: boolean;
  onCopyCode: () => void;
  copyHint: boolean;
  onToggleLock: () => void;
  onStart: () => void;
  onDelete: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-violet-600 mb-3">
        {isFacilitator ? "Game Master controls" : "Host controls"}
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

        {/* Delete game */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            disabled={actionPending}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-sm font-medium disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete game
          </button>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-rose-300 bg-rose-50">
            <span className="text-xs text-rose-700 font-medium">Delete permanently?</span>
            <button
              onClick={onDelete}
              disabled={actionPending}
              className="text-xs font-semibold text-rose-700 hover:text-rose-900 underline disabled:opacity-50"
            >
              Yes, delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Cancel
            </button>
          </div>
        )}

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
  index, member, isMe, hasSetup, seatConfig, canEditConfig, onConfigChange,
}: {
  index: number;
  member: GameMemberRow | null;
  isMe: boolean;
  hasSetup: boolean;
  seatConfig: SeatConfig;
  canEditConfig: boolean;
  onConfigChange: (patch: Partial<SeatConfig>) => void;
}) {
  const claimed = !!member;
  const isBot = !claimed && seatConfig.type === "bot";
  const botName = BOT_NAMES[(index - 1) % BOT_NAMES.length];

  return (
    <div className={
      "rounded-xl border p-4 space-y-3 " +
      (isMe
        ? "border-cyan-300 bg-cyan-50/40"
        : isBot
          ? "border-violet-200 bg-violet-50/30"
          : claimed
            ? "border-slate-200 bg-white"
            : "border-dashed border-slate-200 bg-white")
    }>
      <div className="flex items-center gap-3">
        <div className={
          "w-9 h-9 rounded-lg flex items-center justify-center font-mono text-xs font-bold tabular shrink-0 " +
          (claimed ? "bg-slate-900 text-white" : isBot ? "bg-violet-100 text-violet-700" : "bg-slate-100 text-slate-400")
        }>
          {claimed ? index : isBot ? <Bot className="w-4 h-4" /> : index}
        </div>
        <div className="flex-1 min-w-0">
          {claimed ? (
            <>
              <div className="text-sm font-semibold text-slate-900 truncate">
                {member.display_name ?? "Player"}
                {isMe && <span className="ml-2 text-xs font-medium text-cyan-700">· you</span>}
              </div>
              <div className="text-xs text-slate-500 truncate">
                {member.role === "facilitator" ? "Game Master" :
                 member.role === "host" ? "Host" :
                 member.role === "spectator" ? "Spectator" : "Player"}
              </div>
            </>
          ) : isBot ? (
            <>
              <div className="text-sm font-semibold text-violet-900 truncate">{botName}</div>
              <div className="text-xs text-violet-600">AI Bot</div>
            </>
          ) : (
            <div className="text-sm font-medium text-slate-400 italic">
              Open seat — waiting for player
            </div>
          )}
        </div>
        {/* Setup status badge */}
        {claimed && member.role !== "spectator" && (
          <div className={
            "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full " +
            (hasSetup
              ? "bg-emerald-100 text-emerald-700"
              : "bg-amber-50 text-amber-600")
          }>
            {hasSetup ? "✓ Ready" : "Setting up…"}
          </div>
        )}
        {isBot && (
          <span className={
            "shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full " +
            (seatConfig.difficulty === "hard"
              ? "bg-rose-100 text-rose-700"
              : seatConfig.difficulty === "medium"
                ? "bg-amber-50 text-amber-700"
                : "bg-emerald-100 text-emerald-700")
          }>
            {seatConfig.difficulty === "hard" ? "Hard" : seatConfig.difficulty === "medium" ? "Medium" : "Easy"}
          </span>
        )}
      </div>

      {/* Seat type toggle — only shown to host/GM on unclaimed seats */}
      {canEditConfig && (
        <div className="pt-2 border-t border-slate-100 space-y-2">
          {/* Human / Bot toggle */}
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
            <SeatToggleBtn
              active={seatConfig.type === "human"}
              onClick={() => onConfigChange({ type: "human" })}
              icon={<User className="w-3 h-3" />}
              label="Human"
            />
            <SeatToggleBtn
              active={seatConfig.type === "bot"}
              onClick={() => onConfigChange({ type: "bot" })}
              icon={<Bot className="w-3 h-3" />}
              label="AI Bot"
            />
          </div>

          {/* Difficulty — only when bot */}
          {seatConfig.type === "bot" && (
            <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 ml-2">
              {(["easy", "medium", "hard"] as const).map((d) => (
                <SeatToggleBtn
                  key={d}
                  active={seatConfig.difficulty === d}
                  onClick={() => onConfigChange({ difficulty: d })}
                  label={d[0].toUpperCase() + d.slice(1)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SeatToggleBtn({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold transition-colors " +
        (active
          ? "bg-white text-slate-900 shadow-sm"
          : "text-slate-500 hover:text-slate-900")
      }
    >
      {icon}
      {label}
    </button>
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
    <div className="flex-1 min-h-0 overflow-y-auto bg-slate-50 flex items-center justify-center p-6">
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
