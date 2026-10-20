/**
 * /api/trivia/rooms
 *
 *   POST { setId, settings? } → { code, roomId, hostToken }
 *        Opens a live room for a board or template (yours, shared, or
 *        "lib:…"). The board is snapshotted onto the room, so editing
 *        it later never changes a game in progress. `settings` comes
 *        from the game-setup screen (mode, teams, tools, clocks) and
 *        overrides the board's saved settings for this game only.
 *   GET  → { rooms } — your rooms that are still live ("Resume hosting").
 */

import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { generateRoomCode } from "@/lib/trivia/codes";
import { contentStats, parseSettings, validateTeams } from "@/lib/trivia/content";
import { hashToken, hostTokenFor, requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";
import { insertRoom, listHostRooms, sweepStaleRooms } from "@/lib/trivia/server/rooms";
import { getReadableSet, recordPlay } from "@/lib/trivia/server/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  try {
    return json({ rooms: await listHostRooms(host.userId) });
  } catch (err) {
    return serverError("list rooms", err);
  }
}

export async function POST(req: NextRequest) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const setId = str(parsed.body.setId)?.slice(0, 80);
  if (!setId) return errorJson("Pick a board to host.", 400);

  try {
    const set = await getReadableSet(setId, host.userId);
    if (!set) return errorJson("That board isn't available.", 404);
    if (contentStats(set.content).ready === 0) {
      return errorJson("Write at least one question and answer before hosting this board.", 400);
    }
    let content = set.content;
    const override = parsed.body.settings;
    if (override && typeof override === "object" && !Array.isArray(override)) {
      const settings = parseSettings({ ...set.content.settings, ...(override as Record<string, unknown>) });
      const teamError = validateTeams(settings.teams);
      if (teamError) return errorJson(teamError, 400);
      content = { ...set.content, settings };
    }
    await sweepStaleRooms();

    for (let attempt = 0; attempt < 10; attempt++) {
      const id = randomUUID();
      const hostToken = hostTokenFor(id);
      const result = await insertRoom({
        id,
        code: generateRoomCode(),
        hostId: host.userId,
        hostTokenHash: hashToken(hostToken),
        setId: set.id.startsWith("lib:") ? null : set.id,
        title: set.title,
        content,
      });
      if (result.ok) {
        await recordPlay(set.id);
        return json({ code: result.room.code, roomId: result.room.id, hostToken }, 201);
      }
      if (!result.codeTaken) throw new Error(result.error);
    }
    return errorJson("Couldn't find a free room code. Try again.", 503);
  } catch (err) {
    return serverError("create room", err);
  }
}
