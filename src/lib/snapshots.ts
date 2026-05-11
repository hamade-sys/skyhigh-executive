/**
 * Quarter-versioned game snapshots.
 *
 * Stored independently from the live Zustand persist payload so that:
 *   1. The "rolling save" (one per round, capped at 40) doesn't bloat
 *      the main `skyforce:game` localStorage key.
 *   2. Snapshots survive a corrupt main save — the facilitator can
 *      restore from a known-good round even if the live state went
 *      sideways.
 *   3. Players who disconnect can be re-synced to the latest snapshot
 *      without losing the rest of the cohort's progress.
 *
 * Storage layout (localStorage):
 *   skyforce:snapshots:index   → JSON array of SnapshotMeta (small)
 *   skyforce:snapshots:<id>    → JSON of the full snapshot payload
 *
 * IDs are deterministic by round (`snap-q{quarter}`) so re-saving the
 * same round overwrites the previous snapshot — we keep one snapshot
 * per round, not one per `closeQuarter` invocation. That keeps the
 * index a clean 1-to-1 with the campaign timeline.
 */

const INDEX_KEY = "skyforce:snapshots:index";
const PAYLOAD_PREFIX = "skyforce:snapshots:";

/** Lightweight metadata — what shows in the facilitator UI list. */
export interface SnapshotMeta {
  id: string;
  quarter: number;
  /** Unix ms — when the snapshot was written. */
  savedAt: number;
  /** Human label e.g. "Q1 2018 · 6 teams · MRD $42M". */
  label: string;
  /** Calendar-formatted quarter e.g. "Q1 2018". */
  quarterLabel: string;
  /** Number of teams active in the snapshot. */
  teamCount: number;
}

/** Full payload — meta + the persisted slice of game state. */
export interface SnapshotPayload {
  meta: SnapshotMeta;
  /** Schema version. Bumped if we ever break-change the snapshot format. */
  version: number;
  /** Whatever the persist's `partialize` returned. We don't type this
   *  here because it's the same shape that the Zustand persist already
   *  re-hydrates — letting that pipeline absorb the schema is more
   *  resilient than redeclaring every field here. */
  state: unknown;
}

const SCHEMA_VERSION = 1;

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
}

function readIndex(): SnapshotMeta[] {
  if (!isBrowser()) return [];
  try {
    const raw = window.sessionStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SnapshotMeta[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

function writeIndex(index: SnapshotMeta[]): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch (err) {
    console.error("[snapshots] failed to write index", err);
  }
}

/** Stable id for a quarter's snapshot. Re-saving same round overwrites. */
export function snapshotIdForQuarter(quarter: number): string {
  return `snap-q${quarter}`;
}

/** Read every snapshot's metadata. Sorted newest-first by savedAt. */
export function listSnapshots(): SnapshotMeta[] {
  return readIndex().slice().sort((a, b) => b.savedAt - a.savedAt);
}

/** Read one snapshot's full payload by id. Returns null if missing
 *  or unparseable — caller decides how to handle a corrupt save. */
export function loadSnapshot(id: string): SnapshotPayload | null {
  if (!isBrowser()) return null;
  try {
    const raw = window.sessionStorage.getItem(PAYLOAD_PREFIX + id);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SnapshotPayload;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.version !== SCHEMA_VERSION) {
      console.warn("[snapshots] schema mismatch, ignoring snapshot", id, parsed.version);
      return null;
    }
    return parsed;
  } catch (err) {
    console.error("[snapshots] failed to load", id, err);
    return null;
  }
}

interface SaveOpts {
  quarter: number;
  /** State shape matching the persist `partialize`. */
  state: unknown;
  /** Display label e.g. "6 teams · MRD $42M". */
  contextLabel: string;
  /** Calendar-formatted quarter e.g. "Q1 2018". */
  quarterLabel: string;
  teamCount: number;
}

/** Save a snapshot for the given quarter. Overwrites any existing
 *  snapshot for the same round (we keep one per round only). */
export function saveSnapshot(opts: SaveOpts): SnapshotMeta {
  const id = snapshotIdForQuarter(opts.quarter);
  const meta: SnapshotMeta = {
    id,
    quarter: opts.quarter,
    savedAt: Date.now(),
    label: `${opts.quarterLabel} · ${opts.contextLabel}`,
    quarterLabel: opts.quarterLabel,
    teamCount: opts.teamCount,
  };
  const payload: SnapshotPayload = {
    meta,
    version: SCHEMA_VERSION,
    state: opts.state,
  };

  if (isBrowser()) {
    try {
      window.sessionStorage.setItem(
        PAYLOAD_PREFIX + id,
        JSON.stringify(payload),
      );
    } catch (err) {
      // Quota exceeded — most likely cause. Try evicting the oldest
      // payload (lowest quarter) and retrying once. If we're at quota
      // with the snapshots themselves the cohort has played 40+ rounds
      // and something is wrong; better to swallow than corrupt.
      console.error("[snapshots] write quota issue", err);
      const idx = readIndex().sort((a, b) => a.quarter - b.quarter);
      const oldest = idx[0];
      if (oldest && oldest.id !== id) {
        deleteSnapshot(oldest.id);
        try {
          window.sessionStorage.setItem(
            PAYLOAD_PREFIX + id,
            JSON.stringify(payload),
          );
        } catch {
          // Give up silently after one retry.
        }
      }
    }
  }

  // Update the index — replace existing entry for this id.
  const idx = readIndex().filter((m) => m.id !== id);
  idx.push(meta);
  writeIndex(idx);

  return meta;
}

export function deleteSnapshot(id: string): void {
  if (!isBrowser()) return;
  try {
    window.sessionStorage.removeItem(PAYLOAD_PREFIX + id);
  } catch (err) {
    console.error("[snapshots] delete payload failed", id, err);
  }
  writeIndex(readIndex().filter((m) => m.id !== id));
}

/** Clear every snapshot. Used when starting a fresh campaign so old
 *  saves from the prior session don't pollute the picker. */
export function clearAllSnapshots(): void {
  if (!isBrowser()) return;
  for (const m of readIndex()) {
    try { window.sessionStorage.removeItem(PAYLOAD_PREFIX + m.id); } catch {}
  }
  writeIndex([]);
}

/** Serialize a snapshot to JSON for download (facilitator can email
 *  / archive a save). Returns null if the snapshot doesn't exist. */
export function exportSnapshotJson(id: string): string | null {
  const payload = loadSnapshot(id);
  if (!payload) return null;
  return JSON.stringify(payload, null, 2);
}

/** Import a previously-exported snapshot JSON. Validates schema and
 *  writes it to the index + payload store. Returns the meta on
 *  success or an error string. */
export function importSnapshotJson(
  json: string,
): { ok: true; meta: SnapshotMeta } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: "File is not valid JSON." };
  }
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "File is not a snapshot." };
  }
  const p = parsed as Partial<SnapshotPayload>;
  if (p.version !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Snapshot schema v${p.version} can't be loaded by this build (expected v${SCHEMA_VERSION}).`,
    };
  }
  if (!p.meta || typeof p.meta !== "object" || typeof p.meta.id !== "string") {
    return { ok: false, error: "Snapshot is missing metadata." };
  }
  if (!p.state) {
    return { ok: false, error: "Snapshot has no state payload." };
  }

  const meta = p.meta as SnapshotMeta;
  if (isBrowser()) {
    try {
      window.sessionStorage.setItem(PAYLOAD_PREFIX + meta.id, json);
    } catch (err) {
      return {
        ok: false,
        error: `Could not write snapshot to storage: ${err instanceof Error ? err.message : "unknown"}`,
      };
    }
  }
  const idx = readIndex().filter((m) => m.id !== meta.id);
  idx.push(meta);
  writeIndex(idx);
  return { ok: true, meta };
}
