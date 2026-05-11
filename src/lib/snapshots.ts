/**
 * Quarter-versioned game snapshots.
 *
 * Backed by the database through `/api/games/snapshots`, not browser
 * storage. Facilitators can restore/export/import saves across devices
 * and machines because snapshots now live with the game itself.
 */

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

interface SaveOpts {
  gameId: string;
  quarter: number;
  /** State shape matching the persist `partialize`. */
  state: unknown;
  /** Display label e.g. "6 teams · MRD $42M". */
  contextLabel: string;
  /** Calendar-formatted quarter e.g. "Q1 2018". */
  quarterLabel: string;
  teamCount: number;
}

function rowToMeta(row: {
  id: string;
  quarter: number;
  label: string;
  quarter_label: string;
  team_count: number;
  created_at: string;
}): SnapshotMeta {
  return {
    id: row.id,
    quarter: row.quarter,
    savedAt: Date.parse(row.created_at),
    label: row.label,
    quarterLabel: row.quarter_label,
    teamCount: row.team_count,
  };
}

/** Read every snapshot's metadata. Sorted newest-first by savedAt. */
export async function listSnapshots(gameId: string): Promise<SnapshotMeta[]> {
  const res = await fetch(`/api/games/snapshots?gameId=${encodeURIComponent(gameId)}`, {
    cache: "no-store",
  });
  if (!res.ok) return [];
  const json = await res.json().catch(() => ({}));
  const rows = Array.isArray(json.snapshots) ? json.snapshots : [];
  return rows.map(rowToMeta);
}

/** Read one snapshot's full payload by id. Returns null if missing. */
export async function loadSnapshot(gameId: string, id: string): Promise<SnapshotPayload | null> {
  const params = new URLSearchParams({ gameId, snapshotId: id });
  const res = await fetch(`/api/games/snapshots?${params.toString()}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const row = json.snapshot;
  if (!row || typeof row !== "object") return null;
  return {
    meta: rowToMeta(row as {
      id: string;
      quarter: number;
      label: string;
      quarter_label: string;
      team_count: number;
      created_at: string;
    }),
    version: SCHEMA_VERSION,
    state: (row as { state_json: unknown }).state_json,
  };
}

/** Save a snapshot for the given quarter. Overwrites any existing
 *  snapshot for the same round (we keep one per round only). */
export async function saveSnapshot(opts: SaveOpts): Promise<SnapshotMeta | null> {
  const res = await fetch("/api/games/snapshots", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      gameId: opts.gameId,
      quarter: opts.quarter,
      label: `${opts.quarterLabel} · ${opts.contextLabel}`,
      quarterLabel: opts.quarterLabel,
      teamCount: opts.teamCount,
      stateJson: opts.state,
    }),
  });
  if (!res.ok) return null;
  const json = await res.json().catch(() => ({}));
  const row = json.snapshot;
  if (!row || typeof row !== "object") return null;
  return rowToMeta(row as {
    id: string;
    quarter: number;
    label: string;
    quarter_label: string;
    team_count: number;
    created_at: string;
  });
}

export async function deleteSnapshot(gameId: string, id: string): Promise<void> {
  await fetch("/api/games/snapshots", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ gameId, snapshotId: id }),
  }).catch(() => {
    // Non-fatal: callers refresh list after delete attempt.
  });
}

/** Clear every snapshot for a game. */
export async function clearAllSnapshots(gameId: string): Promise<void> {
  const snapshots = await listSnapshots(gameId);
  for (const m of snapshots) {
    await deleteSnapshot(gameId, m.id);
  }
}

/** Serialize a snapshot to JSON for download (facilitator can email
 *  / archive a save). Returns null if the snapshot doesn't exist. */
export async function exportSnapshotJson(gameId: string, id: string): Promise<string | null> {
  const payload = await loadSnapshot(gameId, id);
  if (!payload) return null;
  return JSON.stringify(payload, null, 2);
}

/** Import a previously-exported snapshot JSON. Validates schema and
 *  writes it to the index + payload store. Returns the meta on
 *  success or an error string. */
export async function importSnapshotJson(
  gameId: string,
  json: string,
): Promise<{ ok: true; meta: SnapshotMeta } | { ok: false; error: string }> {
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
  const saved = await saveSnapshot({
    gameId,
    quarter: meta.quarter,
    state: p.state,
    contextLabel: meta.label.split(" · ").slice(1).join(" · ") || meta.label,
    quarterLabel: meta.quarterLabel,
    teamCount: meta.teamCount,
  });
  if (!saved) {
    return { ok: false, error: "Could not write snapshot to the database." };
  }
  return { ok: true, meta: saved };
}
