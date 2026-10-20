import "server-only";

/**
 * ICAN Trivia — AI assist for the board editor.
 *
 * Four jobs, all returning structured JSON:
 *   answer   — write the answer for a question the host has written
 *   question — fill one empty cell (question + answer) for a category
 *   column   — write a whole column for a category, easy → hard
 *   board    — draft a whole board from a theme
 *
 * Model: Claude Opus 5.5 at low effort — the writing is short and the
 * facts matter more than depth of reasoning. Refusals fall back
 * server-side (`fallbacks: "default"`), and a refusal that survives
 * the fallback comes back as a readable message, never a crash.
 *
 * Off unless ANTHROPIC_API_KEY is set on the deployment. Each call is
 * logged in trivia_ai_log and capped per user per hour, so a stuck
 * button can't run up a bill.
 */

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod/v4";
import { getServerClient } from "@/lib/supabase/server";

export const AI_MODEL = "claude-opus-5-5";
export const AI_HOURLY_LIMIT = 40;

export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic({ maxRetries: 1, timeout: 110_000 });
  return client;
}

const SYSTEM = `You write questions for ICAN Trivia, a Jeopardy-style quiz game that ICAN MENA (a management and HR consultancy in the Middle East) runs in corporate workshops, leadership offsites and team events.

Rules for everything you write:
- Accuracy above all. Use only facts you are highly confident are true and stable over time. Never use facts that change (current office-holders, latest rankings, populations, prices, "the biggest/tallest" claims without a year). If you are unsure, choose a different question.
- Each question is one or two sentences a host can read aloud, at most 140 characters. Each answer is short and unambiguous: 1 to 6 words.
- Put acceptable alternate answers or a one-line fun fact in "notes" (at most 140 characters). Use an empty string if there is nothing useful.
- Write a "hint" for every question: one short nudge (at most 80 characters) that helps a team think in the right direction without giving the answer away or containing any word of it.
- Difficulty rises with the point value: the lowest value is something most adults know; the highest is a real challenge for professionals.
- Keep it workplace-appropriate and inclusive: nothing political, religious, sexual, or that could embarrass a corporate audience. No private individuals. Well-known public and historical figures are fine.
- Write in clear international English. Category titles are short (at most 24 characters) and in Title Case.
- Never repeat a question that appears in the "already on the board" list.`;

const AnswerSchema = z.object({
  answer: z.string(),
  hint: z.string(),
  notes: z.string(),
});

const QuestionSchema = z.object({
  question: z.string(),
  answer: z.string(),
  hint: z.string(),
  notes: z.string(),
});

const ColumnSchema = z.object({
  title: z.string(),
  questions: z.array(QuestionSchema),
});

const BoardSchema = z.object({
  title: z.string(),
  columns: z.array(ColumnSchema),
  final: z.object({ category: z.string(), question: z.string(), answer: z.string(), notes: z.string() }),
});

export type AiRequest =
  | { mode: "answer"; category: string; question: string; value: number }
  | { mode: "question"; category: string; value: number; avoid: string[]; audience: string }
  | { mode: "column"; category: string; values: number[]; avoid: string[]; audience: string }
  | { mode: "board"; theme: string; columns: number; values: number[]; audience: string };

export type AiResult =
  | { ok: true; mode: "answer"; data: z.infer<typeof AnswerSchema> }
  | { ok: true; mode: "question"; data: z.infer<typeof QuestionSchema> }
  | { ok: true; mode: "column"; data: z.infer<typeof ColumnSchema> }
  | { ok: true; mode: "board"; data: z.infer<typeof BoardSchema> }
  | { ok: false; status: number; error: string };

function avoidBlock(avoid: string[]): string {
  const list = avoid.filter(Boolean).slice(0, 60);
  return list.length ? `\n\nAlready on the board (do not repeat these):\n${list.map((q) => `- ${q}`).join("\n")}` : "";
}

function audienceLine(audience: string): string {
  return audience.trim() ? `\nAudience: ${audience.trim()}.` : "";
}

function promptFor(req: AiRequest): { prompt: string; schema: z.ZodType; maxTokens: number } {
  switch (req.mode) {
    case "answer":
      return {
        schema: AnswerSchema,
        maxTokens: 4000,
        prompt: `Category: ${req.category || "General"}\nPoint value: ${req.value}\nQuestion: ${req.question}\n\nGive the single correct answer and a hint. If the question is ambiguous or wrong, give the most likely intended answer and say what's off in "notes".`,
      };
    case "question":
      return {
        schema: QuestionSchema,
        maxTokens: 4000,
        prompt: `Write one question for the category "${req.category || "General Knowledge"}" worth ${req.value} points.${audienceLine(req.audience)}${avoidBlock(req.avoid)}`,
      };
    case "column":
      return {
        schema: ColumnSchema,
        maxTokens: 8000,
        prompt: `Write a full column for the category "${req.category || "General Knowledge"}": exactly ${req.values.length} questions, in this order of point values: ${req.values.join(", ")}. Return "title" as a tidy version of the category name.${audienceLine(req.audience)}${avoidBlock(req.avoid)}`,
      };
    case "board":
      return {
        schema: BoardSchema,
        maxTokens: 16000,
        prompt: `Draft a complete board on the theme "${req.theme}": exactly ${req.columns} categories, each with exactly ${req.values.length} questions in this order of point values: ${req.values.join(", ")}. Make the categories varied and fun within the theme. Also write a Final round: one category, one hard-but-fair question, its answer. Give the board a short "title" (at most 40 characters).${audienceLine(req.audience)}`,
      };
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function db(): any {
  return getServerClient();
}

async function usedThisHour(userId: string): Promise<number> {
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await db()
    .from("trivia_ai_log")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  return count ?? 0;
}

async function log(userId: string, mode: string, ok: boolean, usage?: { input_tokens?: number; output_tokens?: number }) {
  await db()
    .from("trivia_ai_log")
    .insert({ user_id: userId, mode, ok, input_tokens: usage?.input_tokens ?? null, output_tokens: usage?.output_tokens ?? null });
}

export async function runAi(userId: string, req: AiRequest): Promise<AiResult> {
  if (!aiConfigured()) {
    return { ok: false, status: 503, error: "AI assist isn't switched on for this site yet." };
  }
  if ((await usedThisHour(userId)) >= AI_HOURLY_LIMIT) {
    return { ok: false, status: 429, error: `You've used AI assist ${AI_HOURLY_LIMIT} times this hour. Try again a little later.` };
  }

  const { prompt, schema, maxTokens } = promptFor(req);
  try {
    const response = await anthropic().beta.messages.parse({
      model: AI_MODEL,
      max_tokens: maxTokens,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: SYSTEM,
      output_config: { effort: "low", format: betaZodOutputFormat(schema) },
      messages: [{ role: "user", content: prompt }],
    });

    if (response.stop_reason === "refusal") {
      await log(userId, req.mode, false, response.usage);
      return { ok: false, status: 422, error: "The AI couldn't help with that one. Try rewording the category or question." };
    }
    if (response.stop_reason === "max_tokens") {
      console.warn("[trivia] AI reply hit max_tokens", { mode: req.mode, usage: response.usage });
      await log(userId, req.mode, false, response.usage);
      return { ok: false, status: 502, error: "The AI's answer was cut short. Try again, or ask for fewer questions." };
    }
    const parsed = response.parsed_output;
    await log(userId, req.mode, Boolean(parsed), response.usage);
    if (!parsed) return { ok: false, status: 502, error: "The AI sent back something we couldn't read. Try again." };
    return { ok: true, mode: req.mode, data: parsed } as AiResult;
  } catch (err) {
    await log(userId, req.mode, false).catch(() => undefined);
    if (err instanceof Anthropic.RateLimitError) {
      return { ok: false, status: 429, error: "The AI is busy right now. Try again in a moment." };
    }
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) {
      console.error("[trivia] AI key rejected", err.message);
      return { ok: false, status: 503, error: "AI assist isn't set up correctly on this site." };
    }
    if (err instanceof Anthropic.APIError) {
      console.error("[trivia] AI call failed", err.status, err.message);
      return { ok: false, status: 502, error: "The AI couldn't be reached. Try again." };
    }
    console.error("[trivia] AI call failed", err);
    return { ok: false, status: 502, error: "The AI couldn't be reached. Try again." };
  }
}
