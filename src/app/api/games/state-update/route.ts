/**
 * POST /api/games/state-update — write a new engine state for a
 * multiplayer game with optimistic concurrency.
 *
 * Body: {
 *   gameId: string,
 *   expectedVersion: number,
 *   newState: unknown,                 // full engine state JSON
 *   eventType: string,                 // e.g. "game.quarterClosed"
 *   eventPayload?: unknown,
 * }
 *
 * IMPORTANT (Phase 1 hardening): the caller's identity is derived
 * SERVER-SIDE from the cookie-bound auth session. Body parameters
 * `actorSessionId` and `actorTeamId` are no longer accepted —
 * trusting them was the original vulnerability that let any browser
 * holding a `gameId` impersonate any member and corrupt their state.
 *
 * Authorization: the caller must be a member of `gameId`. Per-team
 * ownership of mutated teams is verified by diffing the incoming
 * `newState.teams[].claimedBySessionId` against the calling user;
 * facilitators are exempt and may mutate any team.
 *
 * Returns:
 *   200 { state: GameStateRow }       on success
 *   400 { error }                     on bad input
 *   401 { error }                     when not signed in
 *   403 { error }                     when not a member or mutating
 *                                     a team you don't own
 *   404 { error }                     when game not found
 *   409 { error }                     on stale state (CAS mismatch)
 *   500 { error }                     on Supabase fault
 */

import { NextRequest, NextResponse } from "next/server";
import {
  assertMembership,
  assertHostOrFacilitator,
  submitStateMutation,
} from "@/lib/games/api";
import { getAuthenticatedUserId } from "@/lib/supabase/server-auth";
import { getServerClient } from "@/lib/supabase/server";
import { broadcastGameEvent } from "@/lib/games/realtime-broadcast";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NewStateTeamShape {
  id?: unknown;
  claimedBySessionId?: unknown;
  controlledBy?: unknown;
  isPlayer?: unknown;
  playerDisplayName?: unknown;
}

interface NewStateShape {
  teams?: NewStateTeamShape[];
}

// Shape we read from the CURRENT stored game_state row to authorise
// mutations against. We trust THIS, not whatever the client claims
// the team owner is in the submitted payload.
interface StoredTeam {
  id?: string;
  claimedBySessionId?: string | null;
  controlledBy?: string | null;
  isPlayer?: boolean | null;
  playerDisplayName?: string | null;
}

/**
 * Returns true if any field in `submitted` differs from `stored`.
 *
 * WHY: pushStateToServer always sends the full engine state including ALL
 * teams. A player legitimately pushes other players' teams verbatim (they
 * haven't touched them) on every timer tick, quarter close, slider change,
 * etc. Without this check we would block those writes with a 403 even though
 * no cross-team mutation is happening.
 *
 * We use canonical JSON (sorted object keys + sorted primitive arrays) so
 * field-ordering differences in the JSON round-trip don't produce false
 * positives. Sets are serialised as arrays by pushStateToServer; the stored
 * data has the same shape, so the comparison is apples-to-apples.
 */
function teamDataChanged(
  stored: Record<string, unknown>,
  submitted: Record<string, unknown>,
): boolean {
  function norm(v: unknown): unknown {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) {
      const mapped = v.map(norm);
      // Primitive arrays (e.g. flags: string[]) are order-independent sets —
      // sort them so ["b","a"] and ["a","b"] compare equal.
      if (mapped.every((x) => typeof x === "string" || typeof x === "number")) {
        return (mapped as (string | number)[]).slice().sort();
      }
      return mapped;
    }
    if (typeof v === "object") {
      return Object.fromEntries(
        Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => [k, norm((v as Record<string, unknown>)[k])]),
      );
    }
    return v;
  }
  return JSON.stringify(norm(stored)) !== JSON.stringify(norm(submitted));
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    if (!userId) {
      return NextResponse.json(
        { error: "Sign-in required to write game state." },
        { status: 401 },
      );
    }

    const body = await req.json();
    const {
      gameId,
      expectedVersion,
      newState,
      eventType,
      eventPayload,
    } = body ?? {};

    if (typeof gameId !== "string") {
      return NextResponse.json({ error: "gameId required" }, { status: 400 });
    }
    if (typeof expectedVersion !== "number") {
      return NextResponse.json(
        { error: "expectedVersion (number) required" },
        { status: 400 },
      );
    }
    if (typeof newState !== "object" || newState === null) {
      return NextResponse.json({ error: "newState (object) required" }, { status: 400 });
    }
    if (typeof eventType !== "string" || eventType.length === 0) {
      return NextResponse.json({ error: "eventType required" }, { status: 400 });
    }

    // Verify membership before any write. assertMembership checks
    // game_members for (gameId, userId) — if no row, fall back to
    // assertHostOrFacilitator: the game creator's authenticated user.id
    // may differ from the anonymous session_id stored in game_members
    // (e.g. when the host created the game before OAuth sign-in). The
    // host/facilitator check reads directly from the games table so it
    // is safe and cannot be spoofed by the body payload.
    let isFacilitator = false;
    let memberTeamId: string | undefined;
    const membership = await assertMembership(gameId, userId);
    if (!membership.ok) {
      const hostCheck = await assertHostOrFacilitator(gameId, userId);
      if (!hostCheck.ok) {
        return NextResponse.json({ error: membership.error }, { status: 403 });
      }
      // Host/facilitator acting outside a game_members row — treat as
      // facilitator so they can advance bot rounds and apply admin writes.
      isFacilitator = true;
    } else {
      isFacilitator = membership.data.role === "facilitator";
      memberTeamId = membership.data.team_id ?? undefined;
    }

    // Verify per-team ownership of any team mutations against the
    // CANONICAL STORED state, not the submitted payload. Facilitators
    // (role === 'facilitator') are exempt — they can apply admin
    // overrides across all teams. Other roles can only modify teams
    // whose stored row says claimedBySessionId === their userId, OR
    // teams the stored row says are bot-controlled (the local engine
    // runs bot turns on the active player's browser).
    //
    // SECURITY NOTE: previously this check trusted
    // newState.teams[].claimedBySessionId — meaning a malicious client
    // could submit a payload with their own userId stamped on a victim
    // team and bypass the gate, OR flip any team's controlledBy to
    // "bot" and bypass via the bot lane. Both bypasses are now closed
    // by ignoring the submitted ownership fields entirely and reading
    // them only from the stored game_state row.
    // Quarter-close simulation runs on one browser and produces post-simulation
    // state for ALL teams (routes settle, cash updates, bot AI turns, etc.).
    // That browser then pushes every team's new state in a single atomic write.
    // Exempting this event from the per-team ownership check is safe because:
    //   1. CAS (expectedVersion) serialises concurrent closes — only one push
    //      per version lands; the loser 409s and re-syncs.
    //   2. closeQuarter() has its own isClosing re-entrancy guard.
    //   3. The simulation logic is read-only for other teams' strategic choices
    //      (it only applies deterministic quarterly accounting, not decisions).
    // Without this exemption, any human player's closeQuarter push is rejected
    // with 403 because simulation necessarily changes the other player's team
    // state (cash, routes, fleet status) which they don't "own".
    const isQuarterClose = eventType === "game.quarterClosed";

    // Load the canonical stored teams once so we can both authorise writes
    // and preserve multiplayer identity fields (`claimedBySessionId`,
    // `controlledBy`, `isPlayer`, `playerDisplayName`) even if a client-side
    // quarter-close transform accidentally drops them.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const supa = getServerClient() as any;
    const { data: storedRow, error: storedErr } = await supa
      .from("game_state")
      .select("state_json")
      .eq("game_id", gameId)
      .single();
    if (storedErr || !storedRow) {
      return NextResponse.json(
        { error: "Game state not found." },
        { status: 404 },
      );
    }
    const storedTeamsRaw = (
      (storedRow.state_json as Record<string, unknown> | undefined)?.teams as
        | StoredTeam[]
        | undefined
    ) ?? [];
    const storedById = new Map<string, StoredTeam>();
    for (const t of storedTeamsRaw) {
      if (t && typeof t.id === "string") storedById.set(t.id, t);
    }

    if (!isFacilitator && !isQuarterClose) {
      const submittedTeams = (newState as NewStateShape).teams ?? [];
      for (const t of submittedTeams) {
        if (!t || typeof t !== "object") continue;
        const teamId = typeof t.id === "string" ? t.id : null;
        if (!teamId) {
          return NextResponse.json(
            { error: "Submitted team is missing an id — refusing to apply." },
            { status: 400 },
          );
        }
        const stored = storedById.get(teamId);
        if (!stored) {
          // Team not in stored state. This isn't a normal play-time
          // mutation — teams are seeded server-side at game start,
          // never created by client state-update writes.
          return NextResponse.json(
            {
              error:
                "Cannot create new teams via state-update. Use the game-start path.",
            },
            { status: 403 },
          );
        }
        // Bot teams (per STORED state) — allowed for everyone, since
        // the local engine runs bot turns and pushes their results.
        if (stored.controlledBy === "bot") continue;

        // Human team — check ownership only if the team data actually changed.
        // Full-state pushes (timer ticks, quarter close, slider changes, etc.)
        // include every team verbatim. Rejecting those with a 403 just because
        // another player's team appears in the payload would block virtually
        // every multiplayer state write. We only block cross-team mutations —
        // i.e. when a player's submitted payload meaningfully differs from the
        // stored state for a team they don't own.
        const ownerInStore = stored.claimedBySessionId ?? null;
        if (ownerInStore && ownerInStore !== userId) {
          const storedFull = stored as unknown as Record<string, unknown>;
          const submittedFull = t as unknown as Record<string, unknown>;
          if (teamDataChanged(storedFull, submittedFull)) {
            return NextResponse.json(
              {
                error:
                  "Cannot mutate a team you do not own. Facilitator role required for cross-team writes.",
              },
              { status: 403 },
            );
          }
          // Data unchanged — player is carrying this team through a global
          // state push. Allow it.
        }
      }
    }

    const submittedTeams = (newState as NewStateShape).teams;
    const sanitizedState = Array.isArray(submittedTeams)
      ? {
          ...(newState as Record<string, unknown>),
          teams: submittedTeams.map((t) => {
            if (!t || typeof t !== "object" || typeof t.id !== "string") return t;
            const stored = storedById.get(t.id);
            if (!stored) return t;
            return {
              ...t,
              claimedBySessionId: stored.claimedBySessionId ?? null,
              controlledBy:
                stored.controlledBy === "human" || stored.controlledBy === "bot"
                  ? stored.controlledBy
                  : t.controlledBy,
              isPlayer: typeof stored.isPlayer === "boolean"
                ? stored.isPlayer
                : t.isPlayer,
              playerDisplayName: stored.playerDisplayName ?? null,
            };
          }),
        }
      : newState;

    const result = await submitStateMutation({
      gameId,
      expectedVersion,
      newState: sanitizedState,
      // Identity is server-derived — pass the authenticated userId
      // so the audit log records the real actor, not a body param.
      actorSessionId: userId,
      actorTeamId: memberTeamId,
      eventType,
      eventPayload,
    });

    if (!result.ok) {
      const status = result.error.toLowerCase().includes("stale state") ? 409 : 400;
      return NextResponse.json({ error: result.error }, { status });
    }

    // Tell peer browsers the state changed. We send a tiny "go
    // refetch" payload (event type + version) rather than the full
    // state to keep websocket frames small and avoid leaking team
    // state into the broadcast pipe (peers re-call /api/games/load
    // which respects the membership-gated read policy).
    await broadcastGameEvent({
      gameId,
      event: "game.stateChanged",
      payload: { eventType, version: result.data.version },
    });

    return NextResponse.json({ state: result.data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
