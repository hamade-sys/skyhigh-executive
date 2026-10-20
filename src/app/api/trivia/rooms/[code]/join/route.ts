/**
 * POST /api/trivia/rooms/[code]/join { name, token?, teamId? } → { playerId, token, view }
 *
 * Jackbox-style: a room code and a name, no account. The response
 * carries a random player token the phone keeps (localStorage) and
 * sends back on every request. Sending a token you already hold for
 * this room rejoins as that player — a refreshed phone or a dropped
 * connection picks up where it left off, score intact.
 *
 * Late joiners are welcome (they join their team's score) unless the
 * host has locked the room. With one team, or when the host chose
 * "auto" team pick, the player is placed straight away (smallest team
 * first); otherwise the phone shows the team picker next.
 */

import { after, type NextRequest } from "next/server";
import { containsProfanity } from "@/lib/chat/profanity";
import { colorForIndex, isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { cleanName } from "@/lib/trivia/names";
import { applyPlayer, smallestTeam } from "@/lib/trivia/engine";
import { hashToken, newToken } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";
import {
  broadcastRoom,
  countPlayers,
  findPlayerByToken,
  insertPlayer,
  listPlayers,
  loadRoomByCode,
  MAX_PLAYERS,
  mutateRoom,
  roomRecord,
  touchPlayer,
  viewFor,
} from "@/lib/trivia/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) return errorJson("That isn't a room code. Codes are four letters.", 400);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;

  try {
    const room = await loadRoomByCode(code);
    if (!room) return errorJson(`No game is running with code ${code}. Check the code on the big screen.`, 404);

    // Rejoin with a token this phone already holds.
    const existingToken = str(body.token);
    if (existingToken && existingToken.length <= 200) {
      const player = await findPlayerByToken(room.id, hashToken(existingToken));
      if (player && !room.state.kicked?.includes(player.id)) {
        await touchPlayer(player);
        const players = await listPlayers(room.id);
        return json({ playerId: player.id, token: existingToken, view: viewFor(room, players, "player", player.id) });
      }
    }

    if (room.status === "ended") return errorJson("That game has finished.", 410);
    if (room.state.locked) return errorJson("The host has closed this game to new players.", 423);

    const name = cleanName(str(body.name) ?? "");
    if (!name) return errorJson("Enter a name (or a team name) to join.", 400);
    if (containsProfanity(name)) return errorJson("Pick a different name.", 400);

    const count = await countPlayers(room.id);
    if (count >= MAX_PLAYERS) return errorJson(`This game is full (${MAX_PLAYERS} players).`, 409);

    const token = newToken();
    const inserted = await insertPlayer({
      roomId: room.id,
      name,
      color: colorForIndex(count),
      tokenHash: hashToken(token),
    });
    if (!inserted.ok) {
      if (inserted.nameTaken) return errorJson(`Someone's already playing as “${name}”. Try another name.`, 409);
      throw new Error(inserted.error);
    }
    const playerId = inserted.player.id;
    const settings = roomRecord(room).content.settings;
    const chosen = str(body.teamId);
    let latest = room;
    if (chosen || settings.teamPick === "auto" || room.state.teams.length === 1) {
      const placed = await mutateRoom(room.id, (r, players, now) => {
        const rec = roomRecord(r);
        const ids = players.map((p) => p.id);
        const target = chosen && rec.state.teams.some((t) => t.id === chosen) ? chosen : smallestTeam(rec.state, ids);
        if (!target) return { ok: true, state: rec.state, changed: false };
        return applyPlayer(rec.state, playerId, { type: "chooseTeam", teamId: target }, { content: rec.content, playerIds: ids, now });
      });
      if (placed.ok) latest = placed.room;
    }
    const players = await listPlayers(room.id);
    // Let the host and the big screen see the new name right away.
    after(() => broadcastRoom(room.id, latest.version));
    return json({ playerId, token, view: viewFor(latest, players, "player", playerId) }, 201);
  } catch (err) {
    return serverError("join room", err);
  }
}
