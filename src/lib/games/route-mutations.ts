/** Client helpers for server-authoritative route / slot mutations. */

import type { GameStore } from "@/store/game";

type OpenRouteArgs = Parameters<GameStore["openRoute"]>[0];

async function hydrateFromResponse(
  hydrate: GameStore["hydrateFromServerState"],
  args: {
    stateJson: unknown;
    mySessionId: string;
    fallbackTeamId: string | null;
    version: number;
  },
): Promise<void> {
  if (!args.stateJson || typeof args.stateJson !== "object") return;
  hydrate({
    stateJson: args.stateJson,
    mySessionId: args.mySessionId,
    fallbackTeamId: args.fallbackTeamId,
    dbVersion: args.version,
  });
}

export async function postOpenRoute(args: {
  gameId: string;
  expectedVersion: number;
  route: OpenRouteArgs;
  mySessionId: string;
  memberTeamId: string | null;
  hydrate: GameStore["hydrateFromServerState"];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/games/routes/open", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      gameId: args.gameId,
      expectedVersion: args.expectedVersion,
      route: args.route,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Could not open route",
    };
  }
  await hydrateFromResponse(args.hydrate, {
    stateJson: json.state?.state_json,
    mySessionId: args.mySessionId,
    fallbackTeamId: args.memberTeamId,
    version: json.state?.version ?? args.expectedVersion + 1,
  });
  return { ok: true };
}

export async function postSlotBid(args: {
  gameId: string;
  expectedVersion: number;
  airportCode: string;
  slots: number;
  pricePerSlot: number;
  mySessionId: string;
  memberTeamId: string | null;
  hydrate: GameStore["hydrateFromServerState"];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch("/api/games/slots/bid", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      gameId: args.gameId,
      expectedVersion: args.expectedVersion,
      airportCode: args.airportCode,
      slots: args.slots,
      pricePerSlot: args.pricePerSlot,
    }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      error: typeof json.error === "string" ? json.error : "Could not submit bid",
    };
  }
  await hydrateFromResponse(args.hydrate, {
    stateJson: json.state?.state_json,
    mySessionId: args.mySessionId,
    fallbackTeamId: args.memberTeamId,
    version: json.state?.version ?? args.expectedVersion + 1,
  });
  return { ok: true };
}
