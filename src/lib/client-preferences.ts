"use client";

function storageKey(scope: "user" | "game", key: string, gameId?: string): string {
  return scope === "game"
    ? `skyforce:pref:game:${gameId}:${key}`
    : `skyforce:pref:user:${key}`;
}

function readLocal(scope: "user" | "game", key: string, gameId?: string): unknown | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(storageKey(scope, key, gameId));
    return raw ? (JSON.parse(raw) as unknown) : null;
  } catch {
    return null;
  }
}

function writeLocal(
  scope: "user" | "game",
  key: string,
  value: unknown,
  gameId?: string,
): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(storageKey(scope, key, gameId), JSON.stringify(value));
  } catch {
    // Quota or private mode — ignore.
  }
}

async function getPreference(
  scope: "user" | "game",
  key: string,
  gameId?: string,
): Promise<unknown | null> {
  const params = new URLSearchParams({ scope, key });
  if (scope === "game" && gameId) params.set("gameId", gameId);
  try {
    const res = await fetch(`/api/preferences?${params.toString()}`, {
      cache: "no-store",
    });
    if (res.ok) {
      const json = await res.json().catch(() => ({}));
      const value = json.value ?? null;
      if (value != null) writeLocal(scope, key, value, gameId);
      return value;
    }
  } catch {
    // Offline or server error — fall through to local cache.
  }
  return readLocal(scope, key, gameId);
}

async function setPreference(
  scope: "user" | "game",
  key: string,
  value: unknown,
  gameId?: string,
): Promise<void> {
  writeLocal(scope, key, value, gameId);
  try {
    await fetch("/api/preferences", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        scope,
        key,
        value,
        ...(scope === "game" ? { gameId } : {}),
      }),
    });
  } catch {
    // Non-fatal: UI preference persistence should not block gameplay.
  }
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
