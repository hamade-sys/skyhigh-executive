/**
 * Compute an "away" indicator from a member's last_seen_at timestamp.
 *
 * Phase 6 P1 of the enterprise-readiness plan. The play page + lobby
 * page each ping `/api/games/heartbeat` every 30s; if a player's
 * last_seen_at hasn't been updated in >2 minutes, they're treated as
 * away (closed tab, laptop sleep, lost connection). After 5 minutes
 * they're "long away" — the facilitator-side UI can suggest skipping
 * them.
 *
 * Returns:
 *   - `state`: "active" | "away" | "long-away" | "unknown"
 *   - `label`: short human-readable label, or null when active.
 *
 * Pure function — no side effects, takes the timestamp as a string
 * (or null) and the current time. The current time is injectable
 * so tests + SSR can pass a fixed clock.
 */

const AWAY_THRESHOLD_MS = 2 * 60 * 1000;
const LONG_AWAY_THRESHOLD_MS = 5 * 60 * 1000;

export type AwayState = "active" | "away" | "long-away" | "unknown";

export function awayIndicator(args: {
  lastSeenAt: string | null | undefined;
  /** Defaults to Date.now() when omitted. */
  now?: number;
}): { state: AwayState; label: string | null; minutesAway: number } {
  const lastSeenRaw = args.lastSeenAt;
  if (!lastSeenRaw) {
    return { state: "unknown", label: null, minutesAway: 0 };
  }
  const ts = Date.parse(lastSeenRaw);
  if (Number.isNaN(ts)) {
    return { state: "unknown", label: null, minutesAway: 0 };
  }
  const now = args.now ?? Date.now();
  const elapsed = now - ts;
  if (elapsed < AWAY_THRESHOLD_MS) {
    return { state: "active", label: null, minutesAway: 0 };
  }
  const minutes = Math.max(1, Math.floor(elapsed / 60_000));
  const minutesLabel = minutes >= 60
    ? `${Math.floor(minutes / 60)}h ${minutes % 60}m`
    : `${minutes}m`;
  if (elapsed < LONG_AWAY_THRESHOLD_MS) {
    return { state: "away", label: `Away ${minutesLabel}`, minutesAway: minutes };
  }
  return {
    state: "long-away",
    label: `Away ${minutesLabel}`,
    minutesAway: minutes,
  };
}
