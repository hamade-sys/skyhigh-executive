"use client";

async function getPreference(
  scope: "user" | "game",
  key: string,
  gameId?: string,
): Promise<unknown | null> {
  const params = new URLSearchParams({ scope, key });
  if (scope === "game" && gameId) params.set("gameId", gameId);
  const res = await fetch(`/api/preferences?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  return json.value ?? null;
}

async function setPreference(
  scope: "user" | "game",
  key: string,
  value: unknown,
  gameId?: string,
): Promise<void> {
  await fetch("/api/preferences", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      scope,
      key,
      value,
      ...(scope === "game" ? { gameId } : {}),
    }),
  }).catch(() => {
    // Non-fatal: UI preference persistence should not block gameplay.
  });
}

export function getUserPreference(key: string) {
  return getPreference("user", key);
}

export function setUserPreference(key: string, value: unknown) {
  return setPreference("user", key, value);
}

export function getGamePreference(gameId: string, key: string) {
  return getPreference("game", key, gameId);
}

export function setGamePreference(gameId: string, key: string, value: unknown) {
  return setPreference("game", key, value, gameId);
}
