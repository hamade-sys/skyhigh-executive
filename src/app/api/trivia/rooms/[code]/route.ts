/**
 * GET /api/trivia/rooms/[code] → { view }
 *
 * The one read every screen polls. The view depends on who's asking:
 *   x-trivia-host: <host token>     → host view (answers, wagers, log)
 *   x-trivia-player: <player token> → that player's view
 *   neither                         → the big-screen display view
 * See lib/trivia/views.ts for exactly what each role can see.
 */

import type { NextRequest } from "next/server";
import { isRoomCode, normalizeRoomCode } from "@/lib/trivia/codes";
import { resolveViewer } from "@/lib/trivia/server/access";
import { errorJson, json, serverError } from "@/lib/trivia/server/http";
import { listPlayers, loadRoomByCode, touchPlayer, viewFor } from "@/lib/trivia/server/rooms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const code = normalizeRoomCode((await params).code);
  if (!isRoomCode(code)) return errorJson("That isn't a room code. Codes are four letters.", 400);
  try {
    const room = await loadRoomByCode(code);
    if (!room) return errorJson(`No game is running with code ${code}.`, 404);
    const viewer = await resolveViewer(req, room);
    if (viewer.role === "player") await touchPlayer(viewer.player);
    const players = await listPlayers(room.id);
    return json({
      view: viewFor(room, players, viewer.role, viewer.role === "player" ? viewer.player.id : null),
    });
  } catch (err) {
    return serverError("load room", err);
  }
}
