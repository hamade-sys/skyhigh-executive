/**
 * /api/trivia/ai — AI assist for the board editor.
 *
 *   GET  → { enabled } so the editor can show or explain the AI buttons.
 *   POST { mode: "answer" | "question" | "column" | "board", ... } → { data }
 *
 * Signed-in hosts only, capped per hour (see lib/trivia/server/ai.ts).
 */

import type { NextRequest } from "next/server";
import { MAX_COLUMNS, MAX_ROWS, MAX_VALUE } from "@/lib/trivia/content";
import { aiConfigured, runAi, type AiRequest } from "@/lib/trivia/server/ai";
import { requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  return json({ enabled: aiConfigured() });
}

function clip(v: unknown, max: number): string {
  return (str(v) ?? "").trim().slice(0, max);
}

function values(v: unknown): number[] {
  if (!Array.isArray(v)) return [200, 400, 600, 800, 1000];
  const out = v
    .map((n) => Math.round(Number(n)))
    .filter((n) => Number.isFinite(n) && n >= 0 && n <= MAX_VALUE)
    .slice(0, MAX_ROWS);
  return out.length ? out : [200, 400, 600, 800, 1000];
}

function avoid(v: unknown): string[] {
  return Array.isArray(v) ? v.map((q) => clip(q, 200)).filter(Boolean).slice(0, 60) : [];
}

export async function POST(req: NextRequest) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const b = parsed.body;

  let request: AiRequest;
  switch (b.mode) {
    case "answer": {
      const question = clip(b.question, 400);
      if (!question) return errorJson("Write the question first, then ask for its answer.", 400);
      request = { mode: "answer", category: clip(b.category, 60), question, value: values([b.value])[0] };
      break;
    }
    case "question":
      request = { mode: "question", category: clip(b.category, 60), value: values([b.value])[0], avoid: avoid(b.avoid), audience: clip(b.audience, 120) };
      break;
    case "column": {
      const category = clip(b.category, 60);
      if (!category) return errorJson("Give the column a category title first.", 400);
      request = { mode: "column", category, values: values(b.values), avoid: avoid(b.avoid), audience: clip(b.audience, 120) };
      break;
    }
    case "board": {
      const theme = clip(b.theme, 120);
      if (!theme) return errorJson("Describe a theme for the board.", 400);
      const columns = Math.min(MAX_COLUMNS, Math.max(1, Math.round(Number(b.columns) || 6)));
      request = { mode: "board", theme, columns, values: values(b.values), audience: clip(b.audience, 120) };
      break;
    }
    default:
      return errorJson("Unknown AI request.", 400);
  }

  try {
    const result = await runAi(host.userId, request);
    if (!result.ok) return errorJson(result.error, result.status);
    return json({ data: result.data });
  } catch (err) {
    return serverError("ai", err);
  }
}
