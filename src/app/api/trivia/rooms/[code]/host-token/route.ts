/**
 * GET /api/trivia/rooms/[code]/host-token → { hostToken, roomId }
 *
 * The signed-in owner of a live room gets its host token back — on a
 * new device, or after clearing the browser. The token is derived
 * from the room id (see hostTokenFor), so handing it out again
 * doesn't invalidate a co-host who already has it.
 */

import type { NextRequest } from "next/server";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { hostTokenFor, requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, serverError } from "@/lib/trivia/server/http";
import { loadRoomByCode } from "@/lib/trivia/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) return errorJson("That isn't a room code.", 400);
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  try {
    const room = await loadRoomByCode(code);
    if (!room) return errorJson(`No game is running with code ${code}.`, 404);
    if (room.host_id !== host.userId) return errorJson("Only the host who opened this room can run it.", 403);
    return json({ hostToken: hostTokenFor(room.id), roomId: room.id });
  } catch (err) {
    return serverError("host token", err);
  }
}
