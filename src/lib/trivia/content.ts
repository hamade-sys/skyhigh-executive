/**
 * ICAN Trivia — content helpers shared by the editor, the API and
 * the engine: defaults, ids, validation and readiness stats.
 *
 * `parseContent` is the single gate every piece of content passes
 * through before it is stored or played. It is lenient on shape
 * (older or partial content is upgraded with defaults) and strict on
 * size, so a hand-crafted request can't store a 10 MB board.
 */

import { z } from "zod";
import {
  TOOL_KINDS,
  type TeamDef,
  type ToolKind,
  type TriviaColumn,
  type TriviaContent,
  type TriviaFinal,
  type TriviaQuestion,
  type TriviaSettings,
} from "./types";

export const DEFAULT_VALUES = [200, 400, 600, 800, 1000];
export const MAX_COLUMNS = 8;
export const MIN_ROWS = 1;
export const MAX_ROWS = 7;
export const MAX_VALUE = 100_000;
export const MIN_TEAMS = 1;
export const MAX_TEAMS = 5;

export const LIMITS = {
  setTitle: 80,
  description: 280,
  columnTitle: 60,
  question: 400,
  answer: 200,
  notes: 400,
  imageUrl: 600,
  hint: 200,
  teamName: 24,
  finalAnswerText: 200,
  playerName: 20,
} as const;

/**
 * Team colours a host can choose from — each light enough to carry
 * dark text, distinct from its neighbours, and named so the colour is
 * never the only label.
 */
export const TEAM_COLORS: Array<{ name: string; hex: string }> = [
  { name: "Teal", hex: "#00C2CB" },
  { name: "Yellow", hex: "#F7E300" },
  { name: "Coral", hex: "#FF8A65" },
  { name: "Lavender", hex: "#B39DFF" },
  { name: "Sage", hex: "#56A98F" },
  { name: "Sky", hex: "#5CC8FF" },
  { name: "Pink", hex: "#FF8FCB" },
  { name: "Lime", hex: "#B5E35B" },
  { name: "Amber", hex: "#FFB547" },
  { name: "Red", hex: "#FF6B6B" },
];

export const SUGGESTED_TEAM_NAMES = ["Falcons", "Pearls", "Dunes", "Oryx", "Palms"];

export const TOOL_INFO: Record<ToolKind, { label: string; blurb: string }> = {
  steal: { label: "Steal", blurb: "Take another team's question before they answer it." },
  hint: { label: "Hint", blurb: "Unlock a hint on your team's phones." },
  block: { label: "Block", blurb: "Stop a team from answering this question." },
  swap: { label: "Swap", blurb: "Hand your question to another team — they get 10 seconds, then it comes back to you." },
  skip: { label: "Skip", blurb: "Pass on your question and pick another." },
  doubleDown: { label: "Double Down", blurb: "Win double the points — or lose the question's value." },
};

export const DEFAULT_TOOLS: Record<ToolKind, number> = {
  steal: 1,
  hint: 2,
  block: 1,
  swap: 1,
  skip: 1,
  doubleDown: 1,
};

export function defaultTeams(count = 3): TeamDef[] {
  return Array.from({ length: Math.min(MAX_TEAMS, Math.max(MIN_TEAMS, count)) }, (_, i) => ({
    id: `t${i + 1}`,
    name: SUGGESTED_TEAM_NAMES[i] ?? `Team ${i + 1}`,
    color: TEAM_COLORS[[0, 1, 2, 3, 4][i] ?? i].hex,
  }));
}

export const DEFAULT_SETTINGS: TriviaSettings = {
  mode: "traditional",
  teams: defaultTeams(3),
  teamPick: "choose",
  negativeScoring: true,
  buzzWindowSec: 10,
  answerTimeSec: 8,
  finalTimeSec: 30,
  playersPick: true,
  autoOpenBuzzers: false,
  phraseAsQuestion: false,
  tools: { ...DEFAULT_TOOLS },
  toolWindowSec: 8,
  swapAnswerSec: 10,
  reboundOnMiss: true,
};

/** A fresh copy — never hand out the shared default object. */
export function defaultSettings(): TriviaSettings {
  return { ...DEFAULT_SETTINGS, teams: DEFAULT_SETTINGS.teams.map((t) => ({ ...t })), tools: { ...DEFAULT_TOOLS } };
}

/**
 * The hint a team unlocks: the host's own, or — when none was written —
 * the answer's first letter and length ("Starts with P · 6 letters").
 */
export function hintFor(q: Pick<TriviaQuestion, "hint" | "answer">): string {
  if (q.hint?.trim()) return q.hint.trim();
  const answer = q.answer.trim().replace(/^(the|a|an)\s+/i, "");
  if (!answer) return "No hint for this one.";
  const words = answer.split(/\s+/).filter(Boolean);
  const first = answer[0].toUpperCase();
  if (words.length > 1) return `Starts with “${first}” · ${words.length} words`;
  const letters = answer.replace(/[^\p{L}\p{N}]/gu, "").length;
  return `Starts with “${first}” · ${letters} ${letters === 1 ? "letter" : "letters"}`;
}

/** Short random id. Works in the browser and on the server. */
export function newId(prefix: string): string {
  const bytes = new Uint8Array(6);
  globalThis.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 10);
  return `${prefix}_${body}`;
}

export function blankQuestion(value: number): TriviaQuestion {
  return { id: newId("q"), value, question: "", answer: "" };
}

export function blankColumn(values: number[] = DEFAULT_VALUES, title = ""): TriviaColumn {
  return { id: newId("c"), title, questions: values.map((v) => blankQuestion(v)) };
}

export function blankFinal(): TriviaFinal {
  return { enabled: true, category: "", question: "", answer: "" };
}

export function blankContent(columns = 6, values: number[] = DEFAULT_VALUES): TriviaContent {
  return {
    schema: 1,
    columns: Array.from({ length: columns }, () => blankColumn(values)),
    final: blankFinal(),
    settings: defaultSettings(),
  };
}

/** Fresh ids for every column and question — used when copying a
 *  template into a new board or a bank column into a board, so the
 *  copy never shares ids (and column-bank rows) with its source. */
export function cloneWithNewIds(content: TriviaContent): TriviaContent {
  return {
    ...content,
    columns: content.columns.map((c) => cloneColumn(c)),
    final: { ...content.final },
    settings: { ...content.settings, teams: content.settings.teams.map((t) => ({ ...t })), tools: { ...content.settings.tools } },
  };
}

export function cloneColumn(column: TriviaColumn, values?: number[]): TriviaColumn {
  return {
    id: newId("c"),
    title: column.title,
    questions: column.questions.map((q, i) => ({
      ...q,
      id: newId("q"),
      value: values?.[i] ?? q.value,
      // A Daily Double belongs to the board it was placed on.
      dailyDouble: false,
    })),
  };
}

export function isPlayable(q: Pick<TriviaQuestion, "question" | "answer">): boolean {
  return q.question.trim().length > 0 && q.answer.trim().length > 0;
}

export function finalPlayable(final: TriviaFinal): boolean {
  return final.enabled && final.question.trim().length > 0 && final.answer.trim().length > 0;
}

/** The value of each row on the board, read from the first column that has that row. */
export function rowValues(content: TriviaContent): number[] {
  const rows = Math.max(0, ...content.columns.map((c) => c.questions.length));
  return Array.from({ length: rows }, (_, i) => {
    for (const c of content.columns) {
      const q = c.questions[i];
      if (q) return q.value;
    }
    return DEFAULT_VALUES[i] ?? (i + 1) * 200;
  });
}

export function findCell(
  content: TriviaContent,
  cellId: string,
): { question: TriviaQuestion; column: TriviaColumn; columnIndex: number; rowIndex: number } | null {
  for (let ci = 0; ci < content.columns.length; ci++) {
    const column = content.columns[ci];
    const ri = column.questions.findIndex((q) => q.id === cellId);
    if (ri >= 0) return { question: column.questions[ri], column, columnIndex: ci, rowIndex: ri };
  }
  return null;
}

export function playableCellIds(content: TriviaContent): string[] {
  return content.columns.flatMap((c) => c.questions.filter(isPlayable).map((q) => q.id));
}

export function maxBoardValue(content: TriviaContent): number {
  let max = 0;
  for (const c of content.columns) for (const q of c.questions) if (q.value > max) max = q.value;
  return max;
}

export interface ContentStats {
  columns: number;
  questions: number;
  ready: number;
  missingQuestion: number;
  missingAnswer: number;
  untitledColumns: number;
  dailyDoubles: number;
  finalReady: boolean;
}

export function contentStats(content: TriviaContent): ContentStats {
  let questions = 0;
  let ready = 0;
  let missingQuestion = 0;
  let missingAnswer = 0;
  let dailyDoubles = 0;
  for (const c of content.columns) {
    for (const q of c.questions) {
      questions++;
      const hasQ = q.question.trim().length > 0;
      const hasA = q.answer.trim().length > 0;
      if (hasQ && hasA) ready++;
      else if (hasQ && !hasA) missingAnswer++;
      else if (!hasQ && hasA) missingQuestion++;
      // A cell with neither is simply blank — it stays dark on the board.
      if (q.dailyDouble && hasQ && hasA) dailyDoubles++;
    }
  }
  return {
    columns: content.columns.length,
    questions,
    ready,
    missingQuestion,
    missingAnswer,
    untitledColumns: content.columns.filter((c) => !c.title.trim()).length,
    dailyDoubles,
    finalReady: finalPlayable(content.final),
  };
}

// ─── Validation ─────────────────────────────────────────────

const text = (max: number) =>
  z
    .string()
    .max(max * 2) // generous pre-trim allowance; trimmed + clamped below
    .transform((s) => s.replace(/\s+$/g, "").replace(/^\s+/g, "").slice(0, max));

const optionalText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .optional()
    .transform((s) => {
      const t = (s ?? "").trim().slice(0, max);
      return t.length > 0 ? t : undefined;
    });

const imageUrl = z
  .string()
  .max(LIMITS.imageUrl)
  .optional()
  .transform((s) => {
    const t = (s ?? "").trim();
    if (!t) return undefined;
    try {
      const u = new URL(t);
      return u.protocol === "https:" ? u.toString() : undefined;
    } catch {
      return undefined;
    }
  });

const id = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_:-]+$/);

const questionSchema = z.object({
  id,
  value: z.coerce.number().int().min(0).max(MAX_VALUE),
  question: text(LIMITS.question).default(""),
  answer: text(LIMITS.answer).default(""),
  hint: optionalText(LIMITS.hint),
  notes: optionalText(LIMITS.notes),
  imageUrl,
  dailyDouble: z.boolean().optional().transform((b) => (b ? true : undefined)),
});

const columnSchema = z.object({
  id,
  title: text(LIMITS.columnTitle).default(""),
  questions: z.array(questionSchema).min(MIN_ROWS).max(MAX_ROWS),
});

const finalSchema = z.object({
  enabled: z.boolean().default(true),
  category: text(LIMITS.columnTitle).default(""),
  question: text(LIMITS.question).default(""),
  answer: text(LIMITS.answer).default(""),
  notes: optionalText(LIMITS.notes),
});

const seconds = (min: number, max: number, fallback: number) =>
  z.coerce.number().int().min(min).max(max).catch(fallback);

const teamSchema = z.object({
  id,
  name: text(LIMITS.teamName).pipe(z.string().min(1, "Every team needs a name")),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Pick a team colour"),
});

const toolsSchema = z
  .object(
    Object.fromEntries(TOOL_KINDS.map((k) => [k, z.coerce.number().int().min(0).max(5).catch(DEFAULT_TOOLS[k])])) as Record<
      ToolKind,
      z.ZodCatch<z.ZodNumber>
    >,
  )
  .partial()
  .transform((t) => ({ ...DEFAULT_TOOLS, ...t }) as Record<ToolKind, number>);

const settingsSchema = z.object({
  mode: z.enum(["traditional", "competitive"]).catch("traditional"),
  teams: z.array(teamSchema).min(MIN_TEAMS).max(MAX_TEAMS).catch(() => defaultTeams(3)),
  teamPick: z.enum(["choose", "auto"]).catch("choose"),
  negativeScoring: z.boolean().catch(DEFAULT_SETTINGS.negativeScoring),
  buzzWindowSec: seconds(0, 120, DEFAULT_SETTINGS.buzzWindowSec),
  answerTimeSec: seconds(0, 120, DEFAULT_SETTINGS.answerTimeSec),
  finalTimeSec: seconds(10, 300, DEFAULT_SETTINGS.finalTimeSec),
  playersPick: z.boolean().catch(DEFAULT_SETTINGS.playersPick),
  autoOpenBuzzers: z.boolean().catch(DEFAULT_SETTINGS.autoOpenBuzzers),
  phraseAsQuestion: z.boolean().catch(DEFAULT_SETTINGS.phraseAsQuestion),
  tools: toolsSchema.catch({ ...DEFAULT_TOOLS }),
  toolWindowSec: seconds(0, 60, DEFAULT_SETTINGS.toolWindowSec),
  swapAnswerSec: seconds(5, 60, DEFAULT_SETTINGS.swapAnswerSec),
  reboundOnMiss: z.boolean().catch(DEFAULT_SETTINGS.reboundOnMiss),
});

export function parseSettings(raw: unknown): TriviaSettings {
  const r = settingsSchema.safeParse(raw ?? {});
  return r.success ? (r.data as TriviaSettings) : defaultSettings();
}

/** Check a team list: 1–5 teams, names present and distinct. */
export function validateTeams(teams: TeamDef[]): string | null {
  if (teams.length < MIN_TEAMS || teams.length > MAX_TEAMS) return `Play with ${MIN_TEAMS} to ${MAX_TEAMS} teams.`;
  const names = new Set<string>();
  const ids = new Set<string>();
  for (const t of teams) {
    const name = t.name.trim().toLowerCase();
    if (!name) return "Every team needs a name.";
    if (names.has(name)) return `Two teams are called “${t.name.trim()}”.`;
    if (ids.has(t.id)) return "Two teams share an id.";
    names.add(name);
    ids.add(t.id);
  }
  return null;
}

export const contentSchema = z.object({
  schema: z.literal(1).catch(1),
  columns: z.array(columnSchema).min(1).max(MAX_COLUMNS),
  final: finalSchema.catch(blankFinal()),
  settings: settingsSchema.catch(defaultSettings()),
});

export type ParseResult = { ok: true; content: TriviaContent } | { ok: false; error: string };

/** Validate + normalize content from any untrusted source. */
export function parseContent(raw: unknown): ParseResult {
  const result = contentSchema.safeParse(raw);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path?.length ? ` (${issue.path.join(".")})` : "";
    return { ok: false, error: `This board couldn't be saved${where}: ${issue?.message ?? "invalid content"}.` };
  }
  const content = result.data as TriviaContent;
  const teamError = validateTeams(content.settings.teams);
  if (teamError) return { ok: false, error: teamError };
  // Ids must be unique across the board — they are the cell ids.
  const seen = new Set<string>();
  for (const c of content.columns) {
    if (seen.has(c.id)) return { ok: false, error: "Two columns share an id. Reload the editor and try again." };
    seen.add(c.id);
    for (const q of c.questions) {
      if (seen.has(q.id)) return { ok: false, error: "Two questions share an id. Reload the editor and try again." };
      seen.add(q.id);
    }
  }
  return { ok: true, content };
}

/** Columns worth keeping in the column bank: titled and with at least one written question. */
export function bankableColumns(content: TriviaContent): TriviaColumn[] {
  return content.columns.filter(
    (c) => c.title.trim().length > 0 && c.questions.some((q) => q.question.trim().length > 0),
  );
}
