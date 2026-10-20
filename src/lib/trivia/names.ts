import { LIMITS } from "./content";

/**
 * Tidy a player name: Unicode-normalise, drop control and
 * bidi-override characters (so nobody can render a name backwards
 * over someone else's), collapse whitespace, cap the length.
 */
export function cleanName(raw: string): string {
  return raw
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LIMITS.playerName);
}
