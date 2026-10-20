import "server-only";

/**
 * ICAN Trivia — boards, templates and the column bank.
 *
 * Who sees what:
 *   - Boards are always private to their owner.
 *   - Templates are private unless the owner shares them, which puts
 *     them in every host's "Shared" tab.
 *   - The ICAN library ships in code (library.ts) and is read-only.
 *   - Bank columns follow the set they were saved from (a shared
 *     template shares its columns) and can be shared on their own.
 *
 * Every save of a board or template upserts its titled columns into
 * the bank, keyed by (owner, set, column id): editing a column
 * updates its bank row, deleting the board keeps it.
 */

import { getServerClient } from "@/lib/supabase/server";
import { bankableColumns, cloneWithNewIds, contentStats, parseContent } from "../content";
import { LIBRARY_COLUMNS, LIBRARY_TEMPLATES } from "../library";
import type {
  BankColumn,
  SetKind,
  SetVisibility,
  TriviaContent,
  TriviaSetFull,
  TriviaSetSummary,
} from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return getServerClient();
}

interface SetRow {
  id: string;
  owner_id: string;
  owner_label: string | null;
  kind: SetKind;
  visibility: SetVisibility;
  title: string;
  description: string;
  content: TriviaContent;
  column_titles: string[];
  question_count: number;
  source_id: string | null;
  plays: number;
  updated_at: string;
}

interface BankRow {
  id: string;
  owner_id: string;
  owner_label: string | null;
  visibility: SetVisibility;
  title: string;
  questions: BankColumn["questions"];
  source_title: string | null;
  starred: boolean;
  times_used: number;
  updated_at: string;
}

const SUMMARY_COLUMNS =
  "id, owner_id, owner_label, kind, visibility, title, description, column_titles, question_count, source_id, plays, updated_at";
const FULL_COLUMNS = `${SUMMARY_COLUMNS}, content`;
const BANK_COLUMNS =
  "id, owner_id, owner_label, visibility, title, questions, source_title, starred, times_used, updated_at";

const LIBRARY_STAMP = "2026-10-20T00:00:00.000Z";

function summary(row: Omit<SetRow, "content">, userId: string): TriviaSetSummary {
  return {
    id: row.id,
    kind: row.kind,
    visibility: row.visibility,
    title: row.title,
    description: row.description,
    columnTitles: row.column_titles ?? [],
    questionCount: row.question_count ?? 0,
    mine: row.owner_id === userId,
    ownerLabel: row.owner_label,
    plays: row.plays ?? 0,
    updatedAt: row.updated_at,
  };
}

function librarySummary(id: string): TriviaSetFull | null {
  const t = LIBRARY_TEMPLATES.find((x) => x.id === id);
  if (!t) return null;
  return {
    id: t.id,
    kind: "template",
    visibility: "library",
    title: t.title,
    description: t.description,
    columnTitles: t.content.columns.map((c) => c.title),
    questionCount: contentStats(t.content).ready,
    mine: false,
    ownerLabel: "ICAN MENA",
    plays: 0,
    updatedAt: LIBRARY_STAMP,
    content: t.content,
  };
}

export function libraryTemplates(): TriviaSetSummary[] {
  return LIBRARY_TEMPLATES.map((t) => {
    const full = librarySummary(t.id)!;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { content, ...rest } = full;
    return rest;
  });
}

export async function listSets(userId: string) {
  const [mine, shared] = await Promise.all([
    db().from("trivia_sets").select(SUMMARY_COLUMNS).eq("owner_id", userId).order("updated_at", { ascending: false }).limit(200),
    db()
      .from("trivia_sets")
      .select(SUMMARY_COLUMNS)
      .eq("kind", "template")
      .eq("visibility", "shared")
      .neq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  if (mine.error) throw new Error(mine.error.message);
  if (shared.error) throw new Error(shared.error.message);
  const mineRows = (mine.data as SetRow[]).map((r) => summary(r, userId));
  return {
    boards: mineRows.filter((s) => s.kind === "board"),
    templates: {
      mine: mineRows.filter((s) => s.kind === "template"),
      shared: (shared.data as SetRow[]).map((r) => summary(r, userId)),
      library: libraryTemplates(),
    },
  };
}

/** A set the user may read: their own, a shared template, or the library. */
export async function getReadableSet(id: string, userId: string): Promise<TriviaSetFull | null> {
  if (id.startsWith("lib:")) return librarySummary(id);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const { data, error } = await db().from("trivia_sets").select(FULL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  const row = data as SetRow | null;
  if (!row) return null;
  const readable = row.owner_id === userId || (row.kind === "template" && row.visibility === "shared");
  if (!readable) return null;
  const parsed = parseContent(row.content);
  return { ...summary(row, userId), content: parsed.ok ? parsed.content : row.content };
}

function derived(content: TriviaContent) {
  return {
    column_titles: content.columns.map((c) => c.title || "Untitled"),
    question_count: contentStats(content).ready,
  };
}

export async function createSet(args: {
  userId: string;
  label: string;
  kind: SetKind;
  title: string;
  description: string;
  content: TriviaContent;
  visibility: SetVisibility;
  sourceId: string | null;
}): Promise<TriviaSetFull> {
  const { data, error } = await db()
    .from("trivia_sets")
    .insert({
      owner_id: args.userId,
      owner_label: args.label,
      kind: args.kind,
      visibility: args.kind === "template" ? args.visibility : "private",
      title: args.title,
      description: args.description,
      content: args.content,
      source_id: args.sourceId,
      ...derived(args.content),
    })
    .select(FULL_COLUMNS)
    .single();
  if (error) throw new Error(error.message);
  const row = data as SetRow;
  await syncBank(row, args.label);
  return { ...summary(row, args.userId), content: row.content };
}

/** Copy content from another set (template → board, board → template, duplicate). */
export async function copyContentFrom(id: string, userId: string): Promise<{ content: TriviaContent; title: string; description: string } | null> {
  const source = await getReadableSet(id, userId);
  if (!source) return null;
  return { content: cloneWithNewIds(source.content), title: source.title, description: source.description };
}

export async function updateSet(args: {
  id: string;
  userId: string;
  label: string;
  title?: string;
  description?: string;
  content?: TriviaContent;
  visibility?: SetVisibility;
}): Promise<{ ok: true; set: TriviaSetFull } | { ok: false; status: number; error: string }> {
  const { data: existing, error: readErr } = await db()
    .from("trivia_sets")
    .select("id, owner_id, kind")
    .eq("id", args.id)
    .maybeSingle();
  if (readErr) throw new Error(readErr.message);
  if (!existing) return { ok: false, status: 404, error: "That board no longer exists." };
  if (existing.owner_id !== args.userId) return { ok: false, status: 403, error: "Only the owner can edit this." };

  const patch: Record<string, unknown> = { owner_label: args.label };
  if (args.title !== undefined) patch.title = args.title;
  if (args.description !== undefined) patch.description = args.description;
  if (args.content !== undefined) Object.assign(patch, { content: args.content }, derived(args.content));
  if (args.visibility !== undefined && existing.kind === "template") patch.visibility = args.visibility;

  const { data, error } = await db().from("trivia_sets").update(patch).eq("id", args.id).select(FULL_COLUMNS).single();
  if (error) throw new Error(error.message);
  const row = data as SetRow;
  if (args.content !== undefined || args.visibility !== undefined || args.title !== undefined) {
    await syncBank(row, args.label);
  }
  return { ok: true, set: { ...summary(row, args.userId), content: row.content } };
}

export async function deleteSet(id: string, userId: string): Promise<boolean> {
  const { data, error } = await db().from("trivia_sets").delete().eq("id", id).eq("owner_id", userId).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function recordPlay(id: string): Promise<void> {
  if (id.startsWith("lib:")) return;
  const { data } = await db().from("trivia_sets").select("plays").eq("id", id).maybeSingle();
  if (!data) return;
  await db()
    .from("trivia_sets")
    .update({ plays: (data.plays ?? 0) + 1, last_played_at: new Date().toISOString() })
    .eq("id", id);
}

// ─── Column bank ────────────────────────────────────────────

async function syncBank(row: SetRow, label: string): Promise<void> {
  const parsed = parseContent(row.content);
  if (!parsed.ok) return;
  const columns = bankableColumns(parsed.content);
  if (columns.length === 0) return;

  const { data: existing } = await db()
    .from("trivia_bank_columns")
    .select("column_key, visibility")
    .eq("owner_id", row.owner_id)
    .eq("source_set_id", row.id);
  const sharedKeys = new Set(
    ((existing ?? []) as Array<{ column_key: string; visibility: string }>)
      .filter((r) => r.visibility === "shared")
      .map((r) => r.column_key),
  );
  const setShared = row.kind === "template" && row.visibility === "shared";

  const rows = columns.map((c) => ({
    owner_id: row.owner_id,
    owner_label: label,
    // Sharing a column on its own sticks, even if its board stays private.
    visibility: setShared || sharedKeys.has(c.id) ? "shared" : "private",
    title: c.title.slice(0, 60),
    questions: c.questions.map((q) => ({
      id: q.id,
      value: q.value,
      question: q.question,
      answer: q.answer,
      ...(q.notes ? { notes: q.notes } : {}),
      ...(q.imageUrl ? { imageUrl: q.imageUrl } : {}),
    })),
    question_count: c.questions.filter((q) => q.question.trim() && q.answer.trim()).length,
    source_set_id: row.id,
    source_title: row.title,
    column_key: c.id,
  }));
  const { error } = await db()
    .from("trivia_bank_columns")
    .upsert(rows, { onConflict: "owner_id,source_set_id,column_key" });
  // The bank is a convenience: never fail a save because of it.
  if (error) console.warn("[trivia] bank sync failed", { setId: row.id, error: error.message });
}

function bankFromRow(row: BankRow, userId: string): BankColumn {
  const mine = row.owner_id === userId;
  return {
    id: row.id,
    scope: mine ? "mine" : "shared",
    title: row.title,
    questions: row.questions ?? [],
    sourceTitle: mine ? row.source_title : row.owner_label ? `${row.source_title ?? "Shared"} · ${row.owner_label}` : row.source_title,
    starred: mine && row.starred,
    shared: row.visibility === "shared",
    timesUsed: row.times_used ?? 0,
    updatedAt: row.updated_at,
  };
}

export function libraryColumns(): BankColumn[] {
  const fromTemplates = LIBRARY_TEMPLATES.flatMap((t) =>
    t.content.columns.map((c) => ({ column: c, source: t.title })),
  );
  const standalone = LIBRARY_COLUMNS.map((c) => ({ column: c, source: "ICAN library" }));
  return [...standalone, ...fromTemplates].map(({ column, source }) => ({
    id: `lib:${column.id}`,
    scope: "library" as const,
    title: column.title,
    questions: column.questions.map((q) => ({ ...q, dailyDouble: undefined })),
    sourceTitle: source,
    starred: false,
    shared: true,
    timesUsed: 0,
    updatedAt: LIBRARY_STAMP,
  }));
}

export async function listBank(userId: string): Promise<{ mine: BankColumn[]; shared: BankColumn[]; library: BankColumn[] }> {
  const [mine, shared] = await Promise.all([
    db()
      .from("trivia_bank_columns")
      .select(BANK_COLUMNS)
      .eq("owner_id", userId)
      .order("starred", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(400),
    db()
      .from("trivia_bank_columns")
      .select(BANK_COLUMNS)
      .eq("visibility", "shared")
      .neq("owner_id", userId)
      .order("updated_at", { ascending: false })
      .limit(200),
  ]);
  if (mine.error) throw new Error(mine.error.message);
  if (shared.error) throw new Error(shared.error.message);
  return {
    mine: (mine.data as BankRow[]).map((r) => bankFromRow(r, userId)),
    shared: (shared.data as BankRow[]).map((r) => bankFromRow(r, userId)),
    library: libraryColumns(),
  };
}

export async function updateBankColumn(
  id: string,
  userId: string,
  patch: { starred?: boolean; shared?: boolean; title?: string },
): Promise<BankColumn | null> {
  const update: Record<string, unknown> = {};
  if (patch.starred !== undefined) update.starred = patch.starred;
  if (patch.shared !== undefined) update.visibility = patch.shared ? "shared" : "private";
  if (patch.title !== undefined) update.title = patch.title;
  const { data, error } = await db()
    .from("trivia_bank_columns")
    .update(update)
    .eq("id", id)
    .eq("owner_id", userId)
    .select(BANK_COLUMNS)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? bankFromRow(data as BankRow, userId) : null;
}

export async function deleteBankColumn(id: string, userId: string): Promise<boolean> {
  const { data, error } = await db().from("trivia_bank_columns").delete().eq("id", id).eq("owner_id", userId).select("id");
  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}

export async function markBankColumnUsed(id: string, userId: string): Promise<void> {
  if (id.startsWith("lib:")) return;
  const { data } = await db()
    .from("trivia_bank_columns")
    .select("id, owner_id, visibility, times_used")
    .eq("id", id)
    .maybeSingle();
  if (!data) return;
  if (data.owner_id !== userId && data.visibility !== "shared") return;
  await db().from("trivia_bank_columns").update({ times_used: (data.times_used ?? 0) + 1 }).eq("id", id);
}
