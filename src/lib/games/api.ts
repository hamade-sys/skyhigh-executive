/**
 * Server-side game lifecycle helpers.
 *
 * These are the canonical mutation paths for the lobby. Every
 * mutation runs through the service-role Supabase client, writes a
 * game_events audit row, and bumps the optimistic-concurrency token
 * (`games.version` for lifecycle changes, `game_state.version` for
 * state-mutation calls).
 *
 * NEVER import from a "use client" file — this module pulls in the
 * server-side Supabase client which carries the service role key.
 *
 * Exported helpers (Step 2 surface — Step 4+ wires them into
 * /games/new, /lobby, /games/[id]/lobby/play):
 *
 *   createGame(args)          — host runs /games/new
 *   joinGame(gameId, ...)     — public lobby + private code paths
 *   claimSeat(gameId, ...)    — bind a browser to a team in the lobby
 *   markReady(...)            — self-guided per-team readiness flag
 *   startGame(gameId, ...)    — host/facilitator advances lobby → playing
 *   submitTeamMutation(...)   — version-checked engine state write
 *   appendEvent(...)          — append to game_events (audit log)
 *   listPublicLobby()         — feeds /lobby
 *   loadGame(gameId)          — fetch row + members + state for hydration
 *
 * Each function returns either { ok: true, data } or { ok: false,
 * error }. Callers (API routes / server actions) translate to HTTP
 * responses — no helper throws on user-input errors, only on
 * configuration errors (missing env, etc).
 */

import { getServerClient } from "@/lib/supabase/server";
import type {
  GameRow,
  GameMemberRow,
  GameStateRow,
  GameEventRow,
} from "@/lib/supabase/types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

// ─── Authorization helpers ──────────────────────────────────────
//
// Every server-mediated mutation (lock, start, state-update, etc.)
// must verify that the caller is allowed to perform the action. These
// helpers run BEFORE any data is read or written. They return
// ApiResult so the caller can `if (!result.ok) return ...` cleanly
// without try/catch noise.
//
// Phase 1 of the enterprise-readiness plan: callers MUST derive the
// `userId` argument from `getAuthenticatedUserId()` (cookie-bound)
// rather than a body parameter. Trusting a body parameter for
// identity is the original vulnerability this phase fixes.

/**
 * Verify that `userId` is a member of the game. Returns the member
 * row on success. Used by every per-team mutation (state-update,
 * player-setup, ready, claim, mark-ready, etc.) to ensure callers
 * can only act on games they've joined.
 */
export async function assertMembership(
  gameId: string,
  userId: string,
): Promise<ApiResult<GameMemberRow>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("game_members")
    .select("*")
    .eq("game_id", gameId)
    .eq("session_id", userId)
    .maybeSingle();
  if (error) {
    return { ok: false, error: error.message };
  }
  if (!data) {
    return {
      ok: false,
      error: "Not a member of this game.",
    };
  }
  return { ok: true, data: data as GameMemberRow };
}

/**
 * Verify that `userId` is the host (creator) or facilitator (Game
 * Master) of the game. Used by lifecycle mutations (lock, start,
 * delete, kick player, force-advance, etc.) where only privileged
 * roles can act.
 */
export async function assertHostOrFacilitator(
  gameId: string,
  userId: string,
): Promise<ApiResult<{ isHost: boolean; isFacilitator: boolean }>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("games")
    .select("created_by_session_id, facilitator_session_id")
    .eq("id", gameId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Game not found." };
  const row = data as { created_by_session_id: string | null; facilitator_session_id: string | null };
  const isHost = row.created_by_session_id === userId;
  const isFacilitator = row.facilitator_session_id === userId;
  if (!isHost && !isFacilitator) {
    return {
      ok: false,
      error: "Not authorised — host or facilitator role required.",
    };
  }
  return { ok: true, data: { isHost, isFacilitator } };
}

/**
 * Verify that `userId` is the facilitator (Game Master) of the game.
 * Stricter than `assertHostOrFacilitator` — used for facilitator-only
 * actions like kicking players, force-advancing rounds, applying
 * live-sim deltas. The host alone (without facilitator role) cannot
 * perform these.
 */
export async function assertFacilitator(
  gameId: string,
  userId: string,
): Promise<ApiResult<true>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("games")
    .select("facilitator_session_id")
    .eq("id", gameId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Game not found." };
  const row = data as { facilitator_session_id: string | null };
  if (row.facilitator_session_id !== userId) {
    return { ok: false, error: "Facilitator role required." };
  }
  return { ok: true, data: true };
}

export interface CreateGameArgs {
  name: string;
  mode: "facilitated" | "self_guided";
  visibility: "public" | "private";
  maxTeams: number;
  /** Browser session id of the host (or auth user.id when signed in).
   *  The host gets host role; if `beGameMaster` is true they also
   *  become the Game Master. */
  hostSessionId: string;
  /** When true, the host claims the Game Master role for the game.
   *  Max one GM per game. False/omitted = no GM (self-driven mode). */
  beGameMaster?: boolean;
  /** Optional explicit GM session id. Almost always omitted — the
   *  host is the GM via `beGameMaster` toggle. Reserved for facilitator
   *  hand-off scenarios where the creator preassigns the role. */
  gameMasterSessionId?: string;
  /** Total rounds the game runs for. Default 40. The create-game
   *  form offers 8/16/24/40 presets. */
  totalRounds?: number;
  /** Per-quarter timer in seconds. 0 = no timer (Game Master closes
   *  manually). Self-guided games auto-advance when this hits 0;
   *  the timer's max product (timerSec * totalRounds) bounds the
   *  total game length so a workshop can't run forever. */
  quarterTimerSeconds?: number;
  /** Whether the boardroom decisions surface is enabled. Defaults
   *  to true when GM is on, false otherwise — but explicit override
   *  always wins. */
  boardDecisionsEnabled?: boolean;
  /** Configured seats from the create-game form. Each entry plans a
   *  human-claimable seat (`type: human`) or a bot-filled seat
   *  (`type: bot` + `difficulty`). Length must equal `maxTeams`. */
  plannedSeats?: Array<{
    id?: string;
    type: "human" | "bot";
    difficulty?: "easy" | "medium" | "hard";
    label?: string;
  }>;
  /** Initial engine GameState snapshot — minimal shell for now;
   *  per-team state lands when each player completes their
   *  airline-branding onboarding inside the lobby. */
  initialState: unknown;
}

/** Generate a random 6-digit join code. The keyspace is 1M (vs the
 *  previous 4-digit / 10k), making brute-force enumeration infeasible
 *  in combination with the per-IP rate limit on /api/games/join.
 *  We collision-check against active games (status != 'ended').
 *
 *  Phase 1 hardening: 4-digit codes were brute-forceable in 10k
 *  HTTP requests — an attacker without auth could enumerate the
 *  entire keyspace in seconds and join any private lobby. 6 digits
 *  raises the floor to ~1M attempts; with rate-limiting at 10/min
 *  per IP, the time-to-find a single private game becomes ~100,000
 *  minutes (~70 days), which is operationally infeasible. */
function makeJoinCode(): string {
  // crypto.randomInt avoids the Math.random bias and gives a
  // uniformly-distributed 6-digit string. Pad with zeros so all
  // codes display as exactly 6 chars.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { randomInt } = require("node:crypto") as typeof import("node:crypto");
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Allocate a unique join code by retrying up to N times against
 *  active games. */
async function allocateJoinCode(): Promise<string> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = makeJoinCode();
    const { data, error } = await supa
      .from("games")
      .select("id")
      .eq("join_code", code)
      .neq("status", "ended")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return code;
  }
  throw new Error(
    "Could not allocate a unique join code after 8 retries. Too many active private lobbies; expand the keyspace.",
  );
}

export async function createGame(args: CreateGameArgs): Promise<
  ApiResult<{ game: GameRow; state: GameStateRow }>
> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;

  if (args.name.trim().length === 0) {
    return { ok: false, error: "Game name is required." };
  }
  if (args.maxTeams < 1 || args.maxTeams > 12) {
    return { ok: false, error: "Max teams must be between 1 and 12." };
  }

  const joinCode =
    args.visibility === "private" ? await allocateJoinCode() : null;

  // Resolve Game Master assignment.
  //   - Explicit `gameMasterSessionId` wins (rare hand-off scenarios)
  //   - Otherwise `beGameMaster: true` makes the host the GM
  //   - Otherwise no GM (mode 'self_guided' implicit, but the user
  //     can still flip board_decisions_enabled independently)
  const gmSessionId =
    args.gameMasterSessionId ??
    (args.beGameMaster ? args.hostSessionId : null);

  // boardDecisionsEnabled defaults: explicit value wins, otherwise
  // mirror the GM toggle (with-GM = decisions on by default).
  const boardDecisions =
    args.boardDecisionsEnabled ?? (gmSessionId !== null);

  const totalRounds = args.totalRounds ?? 40;

  const { data: game, error: gameErr } = await supa
    .from("games")
    .insert({
      name: args.name.trim(),
      mode: args.mode,
      visibility: args.visibility,
      max_teams: args.maxTeams,
      join_code: joinCode,
      board_decisions_enabled: boardDecisions,
      created_by_session_id: args.hostSessionId,
      // facilitator_session_id is the legacy column name in the SQL
      // schema — it now stores the Game Master session id (renamed
      // at the UI level only). We'll formalise the rename in a
      // follow-up migration once the lobby flow is stable.
      facilitator_session_id: gmSessionId,
    })
    .select()
    .single();
  if (gameErr || !game) {
    return { ok: false, error: gameErr?.message ?? "Failed to create game" };
  }

  // Initial state snapshot — augment whatever the caller passed with
  // the lobby session block so the play page can hydrate without a
  // separate round-trip. The session field carries totalRounds,
  // plannedSeats, mode, etc — single source of truth for the game.
  const inputState =
    typeof args.initialState === "object" && args.initialState !== null
      ? (args.initialState as Record<string, unknown>)
      : {};
  const seededState = {
    ...inputState,
    session: {
      gameId: game.id,
      name: game.name,
      mode: game.mode,
      visibility: game.visibility,
      status: game.status,
      boardDecisionsEnabled: game.board_decisions_enabled,
      joinCode: game.join_code,
      locked: game.locked,
      maxTeams: game.max_teams,
      creatorSessionId: game.created_by_session_id,
      gameMasterSessionId: gmSessionId,
      facilitatorSessionId: gmSessionId,  // legacy alias
      totalRounds,
      // Per-quarter timer chosen at create time. 0 = no timer (Game
      // Master closes manually). When set, self-guided games auto-
      // advance when the local tick reaches 0 — that's how a non-
      // facilitator game terminates instead of running forever.
      quarterTimerSeconds: args.quarterTimerSeconds ?? 1800,
      plannedSeats: (args.plannedSeats ?? []).map((s, i) => ({
        id: s.id ?? `seat-${i}`,
        type: s.type,
        botDifficulty: s.type === "bot" ? (s.difficulty ?? "medium") : undefined,
        label: s.label,
      })),
      seats: [],
      startedAt: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      version: 1,
    },
  };

  const { data: state, error: stateErr } = await supa
    .from("game_state")
    .insert({ game_id: game.id, state_json: seededState, version: 1 })
    .select()
    .single();
  if (stateErr || !state) {
    return { ok: false, error: stateErr?.message ?? "Failed to seed game state" };
  }

  // Host as the first member. Role: game-master if they claimed it,
  // otherwise plain host.
  const hostRole = gmSessionId === args.hostSessionId ? "facilitator" : "host";
  await supa.from("game_members").insert({
    game_id: game.id,
    session_id: args.hostSessionId,
    role: hostRole,
  });

  await appendEvent({
    gameId: game.id,
    actorSessionId: args.hostSessionId,
    type: "game.created",
    payload: {
      mode: args.mode,
      visibility: args.visibility,
      maxTeams: args.maxTeams,
      totalRounds,
      boardDecisionsEnabled: boardDecisions,
      gameMasterSessionId: gmSessionId,
    },
  });

  return { ok: true, data: { game, state } };
}

/** Resolve a game by either its id or a join code. Used by the
 *  /join page (code path) and direct lobby links (id path). */
export async function findGame(args: {
  gameId?: string;
  joinCode?: string;
}): Promise<ApiResult<GameRow>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const q = supa.from("games").select("*").neq("status", "ended").limit(1);
  if (args.gameId) {
    const { data, error } = await q.eq("id", args.gameId).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Game not found." };
    return { ok: true, data };
  }
  if (args.joinCode) {
    const { data, error } = await q.eq("join_code", args.joinCode.trim()).maybeSingle();
    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "No active game found for that code." };
    return { ok: true, data };
  }
  return { ok: false, error: "Pass either gameId or joinCode." };
}

export async function joinGame(args: {
  gameId: string;
  sessionId: string;
  displayName?: string;
}): Promise<ApiResult<{ member: GameMemberRow; game: GameRow }>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data: game, error: gameErr } = await supa
    .from("games")
    .select("*")
    .eq("id", args.gameId)
    .maybeSingle();
  if (gameErr || !game) return { ok: false, error: "Game not found." };
  if (game.status === "ended") return { ok: false, error: "Game has ended." };
  if (game.locked && game.status === "lobby") {
    // Reconnects (existing member) still allowed even when locked —
    // check member existence below.
    const { data: existing } = await supa
      .from("game_members")
      .select("*")
      .eq("game_id", args.gameId)
      .eq("session_id", args.sessionId)
      .maybeSingle();
    if (!existing) {
      return { ok: false, error: "Lobby is locked — no new seats can be claimed." };
    }
  }

  // Phase 1.8 — capacity gate. Refuse new joins when the game is at
  // its plannedSeats / max_teams cap. Existing members reconnecting
  // (their session_id already in game_members) bypass the gate. The
  // count uses ONLY non-spectator, non-facilitator seats — host /
  // facilitator role rows occupy a member row but don't consume a
  // playable seat.
  {
    const { data: existing } = await supa
      .from("game_members")
      .select("session_id")
      .eq("game_id", args.gameId)
      .eq("session_id", args.sessionId)
      .maybeSingle();
    const isReconnect = !!existing;
    if (!isReconnect) {
      const { count } = await supa
        .from("game_members")
        .select("session_id", { count: "exact", head: true })
        .eq("game_id", args.gameId)
        .neq("role", "spectator")
        .neq("role", "facilitator");
      const seatedCount = count ?? 0;
      const maxTeams = (game.max_teams as number | null) ?? 0;
      if (maxTeams > 0 && seatedCount >= maxTeams) {
        return {
          ok: false,
          error: "Game is full — capacity reached.",
        };
      }
    }
  }

  const { data: member, error: memberErr } = await supa
    .from("game_members")
    .upsert(
      {
        game_id: args.gameId,
        session_id: args.sessionId,
        display_name: args.displayName ?? null,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "game_id,session_id" },
    )
    .select()
    .single();
  if (memberErr || !member) {
    return { ok: false, error: memberErr?.message ?? "Failed to join." };
  }

  await appendEvent({
    gameId: args.gameId,
    actorSessionId: args.sessionId,
    type: "game.joined",
    payload: { displayName: args.displayName ?? null },
  });

  return { ok: true, data: { member, game } };
}

export async function appendEvent(args: {
  gameId: string;
  actorSessionId?: string | null;
  actorTeamId?: string | null;
  type: string;
  payload?: unknown;
}): Promise<ApiResult<GameEventRow>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("game_events")
    .insert({
      game_id: args.gameId,
      actor_session_id: args.actorSessionId ?? null,
      actor_team_id: args.actorTeamId ?? null,
      type: args.type,
      payload_json: args.payload ?? {},
    })
    .select()
    .single();
  if (error || !data) {
    return { ok: false, error: error?.message ?? "Failed to log event" };
  }
  return { ok: true, data };
}

/** Public lobby listing. Used by /lobby. Filters: visibility = public,
 *  status in ('lobby', 'playing') — ended games are NEVER returned.
 *  Sort priority (Phase 8.4):
 *    1. status='lobby' first (joinable, players still trickling in)
 *    2. within lobby: ascending by created_at (oldest first — they've
 *       been waiting longest, prioritize filling them)
 *    3. within playing: descending by current_quarter (most-progressed
 *       first, in case a facilitator wants to drop in)
 *
 *  Each row also carries `member_count` so the lobby UI can render
 *  "3/6 joined" badges and hide already-full active games. */
export interface JoinableGameRow extends GameRow {
  member_count: number;
}

/** Lobby is considered STALE (and gets filtered + queued for cleanup)
 *  when its newest member's `last_seen_at` is more than this many ms
 *  in the past. 2 hours per the user's rule. */
const LOBBY_IDLE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

export async function listPublicLobby(args?: {
  limit?: number;
}): Promise<ApiResult<JoinableGameRow[]>> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;

  // Step 1: pull the rows.
  const { data: gameRows, error } = await supa
    .from("games")
    .select("*")
    .eq("visibility", "public")
    .in("status", ["lobby", "playing"])
    .limit(args?.limit ?? 50);
  if (error) return { ok: false, error: error.message };

  const games = (gameRows ?? []) as GameRow[];
  if (games.length === 0) return { ok: true, data: [] };

  // Step 2: per-game member count + freshness. We need both:
  //   (a) playable-seat count (excludes spectator/facilitator) — for
  //       the "3/6 joined" badge + the empty-lobby filter.
  //   (b) the most-recent last_seen_at across non-spectator/non-
  //       facilitator members — drives the 2-hour idle cleanup.
  const gameIds = games.map((g) => g.id);
  const { data: memberRows } = await supa
    .from("game_members")
    .select("game_id, role, last_seen_at")
    .in("game_id", gameIds);

  const memberCount = new Map<string, number>();
  const newestSeenAt = new Map<string, number>();
  for (const row of (memberRows ?? []) as {
    game_id: string;
    role: string;
    last_seen_at: string | null;
  }[]) {
    if (row.role === "spectator" || row.role === "facilitator") continue;
    memberCount.set(row.game_id, (memberCount.get(row.game_id) ?? 0) + 1);
    if (row.last_seen_at) {
      const ts = Date.parse(row.last_seen_at);
      if (Number.isFinite(ts)) {
        const prev = newestSeenAt.get(row.game_id) ?? 0;
        if (ts > prev) newestSeenAt.set(row.game_id, ts);
      }
    }
  }

  const now = Date.now();
  const idleGameIds: string[] = [];

  // Step 3: enrich, filter empty/stale lobbies + full playing games,
  // sort.
  const enriched: JoinableGameRow[] = games
    .map((g) => ({ ...g, member_count: memberCount.get(g.id) ?? 0 }))
    .filter((g) => {
      // Rule from user task #1 — lobbies with zero active humans
      // shouldn't be advertised. Either the host abandoned, or
      // everyone forfeited; in both cases there's nothing to join.
      if (g.status === "lobby" && g.member_count === 0) {
        idleGameIds.push(g.id);
        return false;
      }
      // Rule from user task #4 — lobby idle > 2h with no member
      // heartbeat = host walked away, kill it. Playing games keep
      // showing regardless of last_seen_at.
      if (g.status === "lobby") {
        const newest = newestSeenAt.get(g.id);
        const idleMs = newest ? now - newest : now - Date.parse(g.created_at);
        if (Number.isFinite(idleMs) && idleMs > LOBBY_IDLE_THRESHOLD_MS) {
          idleGameIds.push(g.id);
          return false;
        }
      }
      // Existing rule — hide already-full active games (nothing to
      // join, surface only games with a reason to click in).
      if (g.status === "playing" && g.member_count >= g.max_teams) {
        return false;
      }
      return true;
    });

  // Background sweep — fire-and-forget, don't block the response.
  // Garbage-collects empty / 2-hour-idle lobbies so the table doesn't
  // accumulate ghost rows. Errors are logged to console only; the
  // next list call will retry.
  if (idleGameIds.length > 0) {
    void Promise.all(
      idleGameIds.map((id) => cleanupEmptyLobby(id).catch(() => undefined)),
    ).then(() => undefined);
  }

  enriched.sort((a, b) => {
    if (a.status !== b.status) {
      // 'lobby' before 'playing' (alphabetical happens to put lobby
      // first, but we make the intent explicit for clarity).
      return a.status === "lobby" ? -1 : 1;
    }
    if (a.status === "lobby") {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    }
    // both 'playing' — most-progressed first
    return b.current_quarter - a.current_quarter;
  });

  const limited = enriched.slice(0, args?.limit ?? 25);
  return { ok: true, data: limited };
}

/**
 * Forfeit a player's seat — Phase 8.2.
 *
 * Removes their game_members row, flips their team to bot control
 * (preserving accumulated state so the cohort can keep playing), and
 * appends a `game.forfeited` audit event. If this was the last human
 * in a 'playing' game, the engine's auto-end check (Phase 8.3) takes
 * care of flipping status to 'ended' on the next closeQuarter.
 *
 * The host of a not-yet-started lobby should NOT forfeit — they
 * should call /api/games/delete (which tears down the whole lobby).
 * The route-level guard handles that redirect.
 */
export async function forfeitMember(args: {
  gameId: string;
  sessionId: string;
}): Promise<ApiResult<{
  replacedByBot: boolean;
  remainingHumans: number;
  gameEnded: boolean;
}>> {
  // Group-D of the audit follow-ups — call the SECURITY DEFINER
  // function `forfeit_member_atomic` (migration 0006) so the
  // read/flip/delete/audit operations all run inside a single
  // Postgres transaction with a row-level lock on `games`. This
  // eliminates the CAS race that the previous JS implementation
  // (the version that was on origin/main before this merge) could
  // lose to a concurrent /api/games/state-update writer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa.rpc("forfeit_member_atomic", {
    p_game_id: args.gameId,
    p_session_id: args.sessionId,
  });
  if (error) {
    if (error.code === "P0002") {
      return { ok: false, error: error.message };
    }
    return { ok: false, error: error.message ?? "Forfeit failed." };
  }
  // The RPC returns a single jsonb object with snake_case keys.
  const result = (data ?? {}) as {
    replaced_by_bot?: boolean;
    remaining_humans?: number;
    game_ended?: boolean;
  };
  return {
    ok: true,
    data: {
      replacedByBot: !!result.replaced_by_bot,
      remainingHumans: Number(result.remaining_humans ?? 0),
      gameEnded: !!result.game_ended,
    },
  };
}

/**
 * Garbage-collect a stale lobby. Tears down (members + state +
 * events + game row) when ANY of these are true:
 *   1. Zero non-spectator/facilitator members remain (everyone left
 *      before the game started).
 *   2. The newest member's `last_seen_at` is more than 2 hours old —
 *      the host walked away and never started.
 *
 * Only operates on `status='lobby'` games. Playing games are
 * preserved regardless of staleness so a long-running workshop
 * doesn't get garbage-collected.
 */
export async function cleanupEmptyLobby(gameId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;

  const { data: game } = await supa
    .from("games")
    .select("status, created_at")
    .eq("id", gameId)
    .maybeSingle();
  if (!game) return;
  const g = game as { status: string; created_at: string };
  if (g.status !== "lobby") return;

  // Pull all playable-seat members + their last_seen_at — the
  // freshness signal. If there are zero rows OR the newest row is
  // > 2 hours stale, the lobby is dead weight.
  const { data: memberRows } = await supa
    .from("game_members")
    .select("last_seen_at, role")
    .eq("game_id", gameId);

  const playableMembers = ((memberRows ?? []) as {
    last_seen_at: string | null;
    role: string;
  }[]).filter((m) => m.role !== "spectator" && m.role !== "facilitator");

  const now = Date.now();
  let shouldCleanup = false;
  if (playableMembers.length === 0) {
    shouldCleanup = true;
  } else {
    let newest = 0;
    for (const m of playableMembers) {
      if (!m.last_seen_at) continue;
      const ts = Date.parse(m.last_seen_at);
      if (Number.isFinite(ts) && ts > newest) newest = ts;
    }
    const idleMs = newest > 0 ? now - newest : now - Date.parse(g.created_at);
    if (Number.isFinite(idleMs) && idleMs > LOBBY_IDLE_THRESHOLD_MS) {
      shouldCleanup = true;
    }
  }
  if (!shouldCleanup) return;

  // Tear down — delete dependents then the row.
  await supa.from("game_members").delete().eq("game_id", gameId);
  await supa.from("game_state").delete().eq("game_id", gameId);
  await supa.from("game_events").delete().eq("game_id", gameId);
  await supa.from("games").delete().eq("id", gameId);
}

/** Hydrate a game for the play page. Returns the row, current state,
 *  and members in a single call. */
export async function loadGame(gameId: string): Promise<
  ApiResult<{ game: GameRow; state: GameStateRow; members: GameMemberRow[] }>
> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const [gameRes, stateRes, membersRes] = await Promise.all([
    supa.from("games").select("*").eq("id", gameId).maybeSingle(),
    supa.from("game_state").select("*").eq("game_id", gameId).maybeSingle(),
    supa.from("game_members").select("*").eq("game_id", gameId),
  ]);
  if (gameRes.error || !gameRes.data) return { ok: false, error: "Game not found." };
  if (stateRes.error || !stateRes.data) return { ok: false, error: "Game state missing." };
  if (membersRes.error) return { ok: false, error: membersRes.error.message };
  return {
    ok: true,
    data: {
      game: gameRes.data,
      state: stateRes.data,
      members: membersRes.data ?? [],
    },
  };
}

/** Compare-and-swap update on game_state. The caller passes the
 *  version they last saw; if it doesn't match the row's current
 *  version the write is rejected with a stale-state error and the
 *  caller refreshes + retries. */
export async function submitStateMutation(args: {
  gameId: string;
  expectedVersion: number;
  newState: unknown;
  actorSessionId?: string;
  actorTeamId?: string;
  /** What changed — surfaces in the audit log. e.g. "team.slidersUpdated",
   *  "team.routeOpened", "game.quarterClosed". */
  eventType: string;
  eventPayload?: unknown;
}): Promise<ApiResult<GameStateRow>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("game_state")
    .update({ state_json: args.newState, version: args.expectedVersion + 1 })
    .eq("game_id", args.gameId)
    .eq("version", args.expectedVersion)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) {
    return {
      ok: false,
      error: "Stale state — someone else modified the game while you were thinking. Refresh and try again.",
    };
  }
  // Endgame auto-cleanup: when a state-write moves the engine into
  // `phase: "endgame"` (final round closeQuarter, or facilitator
  // force-end), flip the games row to status='ended' so the home-page
  // "Resume game" ribbon and the public lobby browser stop surfacing
  // a finished game as active. Members keep their rows so they can
  // revisit /endgame for the recap; the 0003 cleanup migration prunes
  // them later as needed. Idempotent — `.neq("status", "ended")`
  // means a re-run is a no-op.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const phase = (args.newState as any)?.phase;
  if (phase === "endgame") {
    await supa
      .from("games")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", args.gameId)
      .neq("status", "ended");
  }
  await appendEvent({
    gameId: args.gameId,
    actorSessionId: args.actorSessionId,
    actorTeamId: args.actorTeamId,
    type: args.eventType,
    payload: args.eventPayload,
  });
  return { ok: true, data };
}

/** Lobby host/facilitator: flip status from 'lobby' to 'playing'. */
export async function startGame(args: {
  gameId: string;
  actorSessionId: string;
}): Promise<ApiResult<GameRow>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("games")
    .update({ status: "playing", started_at: new Date().toISOString() })
    .eq("id", args.gameId)
    .eq("status", "lobby")
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Game not in lobby state." };
  await appendEvent({
    gameId: args.gameId,
    actorSessionId: args.actorSessionId,
    type: "game.started",
  });
  return { ok: true, data };
}

/** Lobby host/facilitator: lock or unlock seat-claiming. Locked
 *  lobbies still allow existing members to reconnect. */
export async function setLocked(args: {
  gameId: string;
  actorSessionId: string;
  locked: boolean;
}): Promise<ApiResult<GameRow>> {
  // The `as any` here erases the strict postgrest-js v12 generic
  // constraints (which fight hand-rolled Database types). The row
  // types from `lib/supabase/types.ts` re-establish type safety at
  // every read/write below. A future `supabase gen types` pass
  // replaces this cast with the canonical typed client.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const supa = getServerClient() as any;
  const { data, error } = await supa
    .from("games")
    .update({ locked: args.locked })
    .eq("id", args.gameId)
    .select()
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data) return { ok: false, error: "Game not found." };
  await appendEvent({
    gameId: args.gameId,
    actorSessionId: args.actorSessionId,
    type: args.locked ? "game.locked" : "game.unlocked",
  });
  return { ok: true, data };
}
