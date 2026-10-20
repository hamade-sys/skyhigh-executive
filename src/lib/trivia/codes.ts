/**
 * ICAN Trivia — room codes and player colours.
 *
 * Room codes are four letters, Jackbox-style, drawn from consonants
 * only: no vowels means no accidental words (rude or otherwise), and
 * leaving out Y keeps it that way. I and O are vowels already, so
 * there's nothing to confuse with 1 or 0. 20⁴ = 160,000 codes.
 */

export const ROOM_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const ROOM_CODE_LENGTH = 4;

export function generateRoomCode(): string {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  // 256 isn't a multiple of 20, so reject the top slice to stay uniform.
  let out = "";
  let i = 0;
  while (out.length < ROOM_CODE_LENGTH) {
    if (i >= bytes.length) {
      globalThis.crypto.getRandomValues(bytes);
      i = 0;
    }
    const b = bytes[i++];
    if (b >= 240) continue;
    out += ROOM_ALPHABET[b % ROOM_ALPHABET.length];
  }
  return out;
}

/** Uppercase and strip anything that isn't a letter. */
export function normalizeRoomCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

export function isRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_ALPHABET.includes(ch)) return false;
  return true;
}

/**
 * Player colours — bright enough to read as name chips on the dark
 * board, each carrying dark text. Assigned in join order.
 */
export const PLAYER_COLORS = [
  "#00C2CB", // ICAN teal
  "#F7E300", // ICAN highlighter
  "#56A98F", // ICAN sage
  "#FF8A65", // coral
  "#B39DFF", // lavender
  "#5CC8FF", // sky
  "#FF8FCB", // pink
  "#B5E35B", // lime
  "#FFB547", // amber
  "#7EE0C3", // mint
  "#FF9E9E", // salmon
  "#D7C4A3", // sand
];

export function colorForIndex(index: number): string {
  return PLAYER_COLORS[((index % PLAYER_COLORS.length) + PLAYER_COLORS.length) % PLAYER_COLORS.length];
}

/** Initials for an avatar chip: "Sara K" → "SK", "Falcons" → "FA". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
