"use client";

/**
 * Per-device memory for ICAN Trivia: the tokens that let a phone or
 * a host console pick a game back up after a refresh. Keyed by room
 * code and tagged with the room id, so a code reused by a later game
 * never inherits an old token. Every access is wrapped — private
 * windows and blocked storage just mean "join again".
 */

interface Saved {
  roomId: string | null;
  token: string;
  name?: string;
  savedAt: number;
}

const PREFIX = "ican-trivia";

function parse(raw: string | null): Saved | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Saved;
    // Tokens older than a day belong to a finished game.
    if (!parsed.token || Date.now() - parsed.savedAt > 24 * 3600_000) return null;
    return parsed;
  } catch {
    return null;
  }
}

function read(key: string, store: "local" | "session" = "local"): Saved | null {
  try {
    return parse((store === "local" ? window.localStorage : window.sessionStorage).getItem(key));
  } catch {
    return null;
  }
}

function write(key: string, value: Saved | null, stores: Array<"local" | "session"> = ["local"]) {
  for (const store of stores) {
    try {
      const s = store === "local" ? window.localStorage : window.sessionStorage;
      if (value) s.setItem(key, JSON.stringify(value));
      else s.removeItem(key);
    } catch {
      // Storage unavailable — the session still works until refresh.
    }
  }
}

/**
 * Players: the token lives in sessionStorage (this tab) and
 * localStorage (this browser). A refresh finds it in the tab and
 * rejoins silently. A new tab only finds the browser copy, so it asks
 * "continue as Sara?" rather than assuming — two people can share a
 * laptop without hijacking each other's seat.
 */
export const playerStore = {
  /** This tab's player — safe to rejoin without asking. */
  get: (code: string) => read(`${PREFIX}:player:${code}`, "session"),
  /** Someone who played from this browser — ask before rejoining. */
  getRemembered: (code: string) => read(`${PREFIX}:player:${code}`, "local"),
  set: (code: string, value: Omit<Saved, "savedAt">) => write(`${PREFIX}:player:${code}`, { ...value, savedAt: Date.now() }, ["local", "session"]),
  /** Claim the remembered player for this tab. */
  adopt: (code: string, value: Saved) => write(`${PREFIX}:player:${code}`, value, ["session"]),
  clear: (code: string) => write(`${PREFIX}:player:${code}`, null, ["local", "session"]),
  /** Start fresh in this tab without logging the other person out of theirs. */
  forgetHere: (code: string) => write(`${PREFIX}:player:${code}`, null, ["session"]),
};

export const hostStore = {
  get: (code: string) => read(`${PREFIX}:host:${code}`),
  set: (code: string, value: Omit<Saved, "savedAt">) => write(`${PREFIX}:host:${code}`, { ...value, savedAt: Date.now() }),
  clear: (code: string) => write(`${PREFIX}:host:${code}`, null),
};

export function lastName(): string {
  try {
    return window.localStorage.getItem(`${PREFIX}:name`) ?? "";
  } catch {
    return "";
  }
}

export function rememberName(name: string) {
  try {
    window.localStorage.setItem(`${PREFIX}:name`, name);
  } catch {
    // ignore
  }
}

export function getPref(key: string, fallback: boolean): boolean {
  try {
    const v = window.localStorage.getItem(`${PREFIX}:pref:${key}`);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export function setPref(key: string, value: boolean) {
  try {
    window.localStorage.setItem(`${PREFIX}:pref:${key}`, value ? "1" : "0");
  } catch {
    // ignore
  }
}
