/**
 * POST /api/trivia/rooms/[code]/action { action } → { view, note?, changed }
 *
 * One game move. The token header decides who's acting (host or
 * player); the body is validated, then run through the engine with a
 * version compare-and-swap (lib/trivia/server/rooms.ts → mutateRoom).
 *
 * `note` explains a no-op to the actor: "early" (buzzed before the
 * buzzers opened), "beaten" (someone else got there first), "locked"
 * (already answered this one), "closed".
 */

import type { NextRequest } from "next/server";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { applyHost, applyPlayer } from "@/lib/trivia/engine";
import { resolveViewer } from "@/lib/trivia/server/access";
import { parseHostAction, parsePlayerAction } from "@/lib/trivia/server/actions";
import { errorJson, json, readBody, serverError } from "@/lib/trivia/server/http";
import { loadRoomByCode, mutateRoom, roomRecord, touchPlayer, viewFor } from "@/lib/trivia/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function POST(req: NextRequest, { params }: Ctx) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) return errorJson("That isn't a room code.", 400);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;

  try {
    const room = await loadRoomByCode(code);
    if (!room) return errorJson("This game is no longer running.", 404);
    const viewer = await resolveViewer(req, room);

    if (viewer.role === "host") {
      const action = parseHostAction(parsed.body.action);
      if (!action) return errorJson("That move isn't recognised.", 400);
      const outcome = await mutateRoom(room.id, (r, players, now) => {
        const rec = roomRecord(r);
        return applyHost(rec.state, action, { content: rec.content, playerIds: players.map((p) => p.id), now });
      });
      if (!outcome.ok) return errorJson(outcome.error, outcome.status);
      return json({ view: viewFor(outcome.room, outcome.players, "host"), note: outcome.note, changed: outcome.changed });
    }

    if (viewer.role === "player") {
      const action = parsePlayerAction(parsed.body.action);
      if (!action) return errorJson("That move isn't recognised.", 400);
      void touchPlayer(viewer.player);
      const outcome = await mutateRoom(room.id, (r, players, now) => {
        const rec = roomRecord(r);
        return applyPlayer(rec.state, viewer.player.id, action, {
          content: rec.content,
          playerIds: players.map((p) => p.id),
          now,
        });
      });
      if (!outcome.ok) return errorJson(outcome.error, outcome.status);
      return json({
        view: viewFor(outcome.room, outcome.players, "player", viewer.player.id),
        note: outcome.note,
        changed: outcome.changed,
      });
    }

    return errorJson("Join the game to play.", 401);
  } catch (err) {
    return serverError("room action", err);
  }
}
