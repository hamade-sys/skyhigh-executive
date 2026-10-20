/**
 * A screen that was asleep (locked phone, background tab) catches up
 * with one fetch. Celebrations and callouts only fire for events that
 * happened in the last few seconds, so nobody gets "Correct!" for a
 * question that finished a minute ago.
 */
export const FRESH_MS = 6000;

export function isFresh(at: number | undefined, serverNow: number): boolean {
  return typeof at === "number" && serverNow - at < FRESH_MS;
}
