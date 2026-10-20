import "server-only";

/**
 * ICAN Trivia — live room persistence.
 *
 * Every change to a room runs the pure engine against the stored
 * state, then writes back with `where version = <what we read>`. A
 * zero-row update means someone else wrote first (two players buzzing
 * in the same instant): re-read and re-run. The engine then sees the
 * buzzer already taken and answers "beaten" without writing, so
 * contention resolves in one extra round trip.
 *
 * After a write we broadcast `changed` on `trivia:<roomId>` so every
 * screen refetches its own (sanitized) view straight away; screens
 * also poll as a fallback when Realtime is down.
 */

import { after } from "next/server";
import { getServerClient } from "@/lib/supabase/server";
import { parseContent } from "../content";
import { initialState } from "../engine";
import type { ActionResult, PlayerRecord, RoomState, TriviaContent } from "../types";
import { buildView, type RoomRecord, type TriviaView, type ViewRole } from "../views";

/** Rooms nobody has touched for this long are closed, freeing the code. */
const STALE_ROOM_HOURS = 12;
/** Ended rooms stay readable (podium, results) for this long. */
const ENDED_VISIBLE_HOURS = 6;
export const MAX_PLAYERS = 60;

export interface RoomRow {
  id: string;
  code: string;
  host_id: string;
  host_token_hash: string;
  set_id: string | null;
  title: string;
  content: TriviaContent;
  state: RoomState;
  status: "lobby" | "playing" | "ended";
  version: number;
  last_activity_at: string;
  created_at: string;
  ended_at: string | null;
}

interface PlayerRow {
  id: string;
  room_id: string;
  name: string;
  color: string;
  token_hash: string;
  joined_at: string;
  last_seen_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return getServerClient();
}

const ROOM_COLUMNS =
  "id, code, host_id, host_token_hash, set_id, title, content, state, status, version, last_activity_at, created_at, ended_at";

/** Live room for a code, else a recently ended one (so phones can show the podium). */
export async function loadRoomByCode(code: string): Promise<RoomRow | null> {
  const { data: live, error } = await db()
    .from("trivia_rooms")
    .select(ROOM_COLUMNS)
    .eq("code", code)
    .neq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  const row = (live?.[0] as RoomRow | undefined) ?? null;
  if (row) {
    if (isStale(row)) {
      await closeStale(row.id);
      return { ...row, status: "ended" };
    }
    return row;
  }
  const since = new Date(Date.now() - ENDED_VISIBLE_HOURS * 3600_000).toISOString();
  const { data: ended, error: endedErr } = await db()
    .from("trivia_rooms")
    .select(ROOM_COLUMNS)
    .eq("code", code)
    .eq("status", "ended")
    .gte("ended_at", since)
    .order("ended_at", { ascending: false })
    .limit(1);
  if (endedErr) throw new Error(endedErr.message);
  return (ended?.[0] as RoomRow | undefined) ?? null;
}

export async function listHostRooms(hostId: string) {
  const { data, error } = await db()
    .from("trivia_rooms")
    .select("id, code, title, status, created_at, last_activity_at")
    .eq("host_id", hostId)
    .neq("status", "ended")
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) throw new Error(error.message);
  const cutoff = Date.now() - STALE_ROOM_HOURS * 3600_000;
  return (data as Array<Pick<RoomRow, "id" | "code" | "title" | "status" | "created_at" | "last_activity_at">>).filter(
    (r) => Date.parse(r.last_activity_at) > cutoff,
  );
}

export async function loadRoomById(id: string): Promise<RoomRow | null> {
  const { data, error } = await db().from("trivia_rooms").select(ROOM_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as RoomRow | null) ?? null;
}

function isStale(row: RoomRow): boolean {
  return Date.now() - Date.parse(row.last_activity_at) > STALE_ROOM_HOURS * 3600_000;
}

async function closeStale(id: string) {
  await db()
    .from("trivia_rooms")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "ended");
}

/** Close every room that's been idle too long — cheap, run before creating one. */
export async function sweepStaleRooms(): Promise<void> {
  const cutoff = new Date(Date.now() - STALE_ROOM_HOURS * 3600_000).toISOString();
  await db()
    .from("trivia_rooms")
    .update({ status: "ended", ended_at: new Date().toISOString() })
    .neq("status", "ended")
    .lt("last_activity_at", cutoff);
}

export async function insertRoom(args: {
  id: string;
  code: string;
  hostId: string;
  hostTokenHash: string;
  setId: string | null;
  title: string;
  content: TriviaContent;
}): Promise<{ ok: true; room: RoomRow } | { ok: false; codeTaken: boolean; error: string }> {
  const { data, error } = await db()
    .from("trivia_rooms")
    .insert({
      id: args.id,
      code: args.code,
      host_id: args.hostId,
      host_token_hash: args.hostTokenHash,
      set_id: args.setId,
      title: args.title,
      content: args.content,
      state: initialState(args.content.settings.teams),
      status: "lobby",
    })
    .select(ROOM_COLUMNS)
    .single();
  if (error) return { ok: false, codeTaken: error.code === "23505", error: error.message };
  return { ok: true, room: data as RoomRow };
}

export async function listPlayers(roomId: string): Promise<PlayerRecord[]> {
  const { data, error } = await db()
    .from("trivia_players")
    .select("id, name, color, joined_at, last_seen_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true })
    .limit(MAX_PLAYERS + 20);
  if (error) throw new Error(error.message);
  return (data as PlayerRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    joinedAt: p.joined_at,
    lastSeenAt: p.last_seen_at,
  }));
}

export async function findPlayerByToken(roomId: string, tokenHash: string): Promise<PlayerRow | null> {
  const { data, error } = await db()
    .from("trivia_players")
    .select("id, room_id, name, color, token_hash, joined_at, last_seen_at")
    .eq("room_id", roomId)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as PlayerRow | null) ?? null;
}

export async function countPlayers(roomId: string): Promise<number> {
  const { count, error } = await db()
    .from("trivia_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function insertPlayer(args: {
  roomId: string;
  name: string;
  color: string;
  tokenHash: string;
}): Promise<{ ok: true; player: PlayerRow } | { ok: false; nameTaken: boolean; error: string }> {
  const { data, error } = await db()
    .from("trivia_players")
    .insert({ room_id: args.roomId, name: args.name, color: args.color, token_hash: args.tokenHash })
    .select("id, room_id, name, color, token_hash, joined_at, last_seen_at")
    .single();
  if (error) return { ok: false, nameTaken: error.code === "23505", error: error.message };
  return { ok: true, player: data as PlayerRow };
}

/** Presence: refresh last_seen_at at most every ~10s per player. */
export async function touchPlayer(player: { id: string; last_seen_at: string }): Promise<void> {
  if (Date.now() - Date.parse(player.last_seen_at) < 10_000) return;
  await db().from("trivia_players").update({ last_seen_at: new Date().toISOString() }).eq("id", player.id);
}

export async function renamePlayer(playerId: string, name: string): Promise<{ ok: boolean; nameTaken?: boolean }> {
  const { error } = await db().from("trivia_players").update({ name }).eq("id", playerId);
  if (error) return { ok: false, nameTaken: error.code === "23505" };
  return { ok: true };
}

function statusFor(state: RoomState): RoomRow["status"] {
  if (state.phase === "ended") return "ended";
  if (state.phase === "lobby") return "lobby";
  return "playing";
}

export type MutateOutcome =
  | { ok: true; room: RoomRow; players: PlayerRecord[]; changed: boolean; note?: string }
  | { ok: false; status: number; error: string };

/**
 * Run one engine step against the room with optimistic concurrency.
 * `step` receives fresh state + players each attempt.
 */
export async function mutateRoom(
  roomId: string,
  step: (room: RoomRow, players: PlayerRecord[], now: number) => ActionResult,
): Promise<MutateOutcome> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const room = await loadRoomById(roomId);
    if (!room) return { ok: false, status: 404, error: "This game no longer exists." };
    const players = await listPlayers(roomId);
    const now = Date.now();
    const result = step(room, players, now);
    if (!result.ok) return { ok: false, status: 409, error: result.error };
    if (!result.changed) return { ok: true, room, players, changed: false, note: result.note };

    const status = statusFor(result.state);
    const patch: Record<string, unknown> = {
      state: result.state,
      status,
      version: room.version + 1,
      last_activity_at: new Date(now).toISOString(),
    };
    if (status === "ended" && room.status !== "ended") patch.ended_at = new Date(now).toISOString();

    const { data, error } = await db()
      .from("trivia_rooms")
      .update(patch)
      .eq("id", roomId)
      .eq("version", room.version)
      .select(ROOM_COLUMNS);
    if (error) return { ok: false, status: 500, error: "Couldn't save that move. Try again." };
    const written = (data as RoomRow[] | null)?.[0];
    if (written) {
      // After the response is flushed, so the caller isn't kept waiting
      // and Vercel doesn't freeze the function mid-send.
      after(() => broadcastRoom(roomId, written.version));
      return { ok: true, room: written, players, changed: true, note: result.note };
    }
    // Lost the race — back off a hair and re-run against fresh state.
    await new Promise((r) => setTimeout(r, 15 + Math.random() * 35 * (attempt + 1)));
  }
  return { ok: false, status: 503, error: "The game is busy — try that again." };
}

/** Tell every screen in the room to refetch. Best effort. */
export async function broadcastRoom(roomId: string, version: number): Promise<void> {
  try {
    const supa = db();
    const channel = supa.channel(`trivia:${roomId}`, { config: { broadcast: { self: false } } });
    if (typeof channel.httpSend === "function") {
      await channel.httpSend("changed", { version });
    } else {
      await channel.send({ type: "broadcast", event: "changed", payload: { version } });
    }
    await supa.removeChannel(channel);
  } catch (err) {
    console.warn("[trivia] broadcast failed", { roomId, err });
  }
}

export function roomRecord(row: RoomRow): RoomRecord {
  const parsed = parseContent(row.content);
  const content = parsed.ok ? parsed.content : row.content;
  return {
    id: row.id,
    setId: row.set_id,
    code: row.code,
    title: row.title,
    status: row.status,
    version: row.version,
    content,
    state: { ...initialState(content.settings.teams), ...row.state },
  };
}

export function viewFor(row: RoomRow, players: PlayerRecord[], role: ViewRole, playerId?: string | null): TriviaView {
  return buildView({ room: roomRecord(row), players, role, playerId, now: Date.now() });
}
