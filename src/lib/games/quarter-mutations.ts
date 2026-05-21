/** Client helpers for server-authoritative quarter close / advance. */

import type { GameStore } from "@/store/game";

export async function postCloseQuarter(args: {
  gameId: string;
  expectedVersion: number;
  fromQuarter: number;
  facilitatorAdvance?: boolean;
}): Promise<
  | { ok: true; stateJson: unknown; version: number; snapshot?: { ok: boolean; error?: string } }
  | { ok: false; error: string; status: number }
> {
  const res = await fetch("/api/games/close-quarter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Close quarter failed",
      status: res.status,
    };
  }
  return {
    ok: true,
    stateJson: json.state?.state_json,
    version: json.state?.version ?? args.expectedVersion + 1,
    snapshot: json.snapshot,
  };
}

export async function postAdvanceQuarter(args: {
  gameId: string;
  expectedVersion: number;
  fromQuarter: number;
}): Promise<
  | { ok: true; stateJson: unknown; version: number; snapshot?: { ok: boolean; error?: string } }
  | { ok: false; error: string; status: number }
> {
  const res = await fetch("/api/games/advance-quarter", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(args),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Advance quarter failed",
      status: res.status,
    };
  }
  return {
    ok: true,
    stateJson: json.state?.state_json,
    version: json.state?.version ?? args.expectedVersion + 1,
    snapshot: json.snapshot,
  };
}

export function applyServerStateHydrate(
  hydrate: GameStore["hydrateFromServerState"],
  args: {
    stateJson: unknown;
    mySessionId: string;
    fallbackTeamId: string | null;
    version: number;
  },
): void {
  if (!args.stateJson || typeof args.stateJson !== "object") return;
  hydrate({
    stateJson: args.stateJson,
    mySessionId: args.mySessionId,
    fallbackTeamId: args.fallbackTeamId,
    dbVersion: args.version,
  });
}
