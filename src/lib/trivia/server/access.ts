import "server-only";

import type { NextRequest } from "next/server";
import { hashToken, tokenMatches } from "./auth";
import { findPlayerByToken, type RoomRow } from "./rooms";

export const HOST_HEADER = "x-trivia-host";
export const PLAYER_HEADER = "x-trivia-player";

export type Viewer =
  | { role: "host" }
  | { role: "player"; player: { id: string; name: string; last_seen_at: string } }
  | { role: "display" };

/**
 * Work out who is looking at a room from the tokens in the headers.
 * No token (or a bad one) is the big-screen display view, which holds
 * nothing secret.
 */
export async function resolveViewer(req: NextRequest, room: RoomRow): Promise<Viewer> {
  const hostToken = req.headers.get(HOST_HEADER);
  if (hostToken && tokenMatches(hostToken, room.host_token_hash)) return { role: "host" };
  const playerToken = req.headers.get(PLAYER_HEADER);
  if (playerToken && playerToken.length <= 200) {
    const player = await findPlayerByToken(room.id, hashToken(playerToken));
    if (player) return { role: "player", player };
  }
  return { role: "display" };
}
