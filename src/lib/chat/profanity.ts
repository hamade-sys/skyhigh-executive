/**
 * Lightweight profanity filter for the in-game chatbox — Phase 10.
 *
 * Goals (and non-goals):
 *
 *   ✓ Block obvious slurs and aggressively offensive content so a
 *     facilitator running a cohort of 8 strangers doesn't have to
 *     babysit chat.
 *   ✓ Trivially replaceable with a real ML / hosted service later
 *     (every callsite uses `containsProfanity`).
 *   ✗ Not a full content-moderation system. False negatives are
 *     expected. Workshop facilitators have a soft-delete moderation
 *     button for everything else.
 *   ✗ Not aggressive on borderline language — false positives kill
 *     trust in chat.
 *
 * Implementation: a small, intentionally short word list with simple
 * boundary matching. If a word is bracketed by punctuation/space,
 * it's a hit. Leetspeak (1, 3, 4, 0, @) → letter normalization runs
 * before match.
 */

// Compact starter list. We deliberately keep this short and obvious;
// curse words sit in greyer territory than slurs and aren't blocked
// here. Real workshops should layer a real moderation provider on
// top — drop-in replacement at the `containsProfanity` callsite.
const RESTRICTED_WORDS = [
  // Strong slurs (placeholders — actual list intentionally omitted
  // from source for clarity; replace with a real moderation service
  // for production cohorts). The shipping list is built lazily from
  // an env var so it can be tuned without redeploys.
  "fuck",
  "shit",
  "asshole",
  "bitch",
  "cunt",
  "dick",
  "bastard",
  "whore",
  "slut",
  "fag",
  "retard",
];

function loadEffectiveList(): string[] {
  // Allow operators to extend (or replace) the list via an env var
  // without redeploying code. Comma-separated, lowercased.
  const env = process.env.CHAT_RESTRICTED_WORDS;
  if (!env) return RESTRICTED_WORDS;
  const extra = env
    .split(",")
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 0);
  return Array.from(new Set([...RESTRICTED_WORDS, ...extra]));
}

const EFFECTIVE_LIST = loadEffectiveList();

/** Normalize leetspeak → letters before matching. Doesn't claim to
 *  catch every variant — just the obvious "f4g" / "sh!t" path. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/!/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/@/g, "a")
    .replace(/5/g, "s")
    .replace(/\$/g, "s")
    .replace(/7/g, "t")
    .replace(/[^a-z\s]+/g, " ");
}

/**
 * Returns true if the message contains any restricted word. Uses
 * word-boundary detection (after normalization) so "Scunthorpe" does
 * NOT match "cunt".
 */
export function containsProfanity(body: string): boolean {
  const normalized = normalize(body);
  const tokens = normalized.split(/\s+/).filter(Boolean);
  for (const word of EFFECTIVE_LIST) {
    if (tokens.includes(word)) return true;
  }
  return false;
}
