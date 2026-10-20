/**
 * /api/trivia/sets — the signed-in host's boards and the templates bank.
 *
 *   GET   → { boards, templates: { mine, shared, library } }
 *   POST  { kind: "board" | "template", title?, description?,
 *           fromId?, visibility? } → { set }
 *         Without fromId: a blank 6×5 board. With fromId: a copy of
 *         that board/template (yours, shared, or "lib:…") with fresh
 *         ids — "Use template" and "Save as template" both land here.
 */

import type { NextRequest } from "next/server";
import { blankContent, LIMITS } from "@/lib/trivia/content";
import { requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";
import { copyContentFrom, createSet, listSets } from "@/lib/trivia/server/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  try {
    return json(await listSets(host.userId));
  } catch (err) {
    return serverError("list sets", err);
  }
}

export async function POST(req: NextRequest) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const kind = body.kind === "template" ? "template" : "board";
  const visibility = body.visibility === "shared" ? "shared" : "private";
  const fromId = str(body.fromId)?.slice(0, 80) ?? null;

  try {
    let content = blankContent();
    let title = "Untitled board";
    let description = "";
    if (fromId) {
      const source = await copyContentFrom(fromId, host.userId);
      if (!source) return errorJson("That board or template isn't available.", 404);
      content = source.content;
      title = source.title;
      description = source.description;
    }
    const requestedTitle = str(body.title)?.trim().slice(0, LIMITS.setTitle);
    if (requestedTitle) title = requestedTitle;
    const requestedDescription = str(body.description);
    if (requestedDescription !== undefined) description = requestedDescription.trim().slice(0, LIMITS.description);

    const set = await createSet({
      userId: host.userId,
      label: host.label,
      kind,
      title,
      description,
      content,
      visibility,
      sourceId: fromId,
    });
    return json({ set }, 201);
  } catch (err) {
    return serverError("create set", err);
  }
}
