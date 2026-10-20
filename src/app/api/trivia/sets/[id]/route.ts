/**
 * /api/trivia/sets/[id]
 *
 *   GET    → { set } — yours, a shared template, or "lib:…"
 *   PUT    { title?, description?, content?, visibility? } → { set }
 *          Owner only. Content is validated by parseContent and its
 *          titled columns are synced into the column bank.
 *   DELETE → { ok } — owner only. Its bank columns stay in the bank.
 */

import type { NextRequest } from "next/server";
import { LIMITS, parseContent } from "@/lib/trivia/content";
import { requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";
import { deleteSet, getReadableSet, updateSet } from "@/lib/trivia/server/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  try {
    const set = await getReadableSet(decodeURIComponent(id), host.userId);
    if (!set) return errorJson("That board isn't available.", 404);
    return json({ set });
  } catch (err) {
    return serverError("get set", err);
  }
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  if (id.startsWith("lib:")) return errorJson("ICAN library templates are read-only. Use the template to make your own copy.", 403);
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.body;

  const title = str(body.title)?.trim().slice(0, LIMITS.setTitle);
  if (body.title !== undefined && !title) return errorJson("Give the board a title.", 400);
  const description = str(body.description)?.trim().slice(0, LIMITS.description);

  let content;
  if (body.content !== undefined) {
    const result = parseContent(body.content);
    if (!result.ok) return errorJson(result.error, 400);
    content = result.content;
  }
  const visibility = body.visibility === "shared" ? "shared" : body.visibility === "private" ? "private" : undefined;

  try {
    const result = await updateSet({
      id,
      userId: host.userId,
      label: host.label,
      title,
      description,
      content,
      visibility,
    });
    if (!result.ok) return errorJson(result.error, result.status);
    return json({ set: result.set });
  } catch (err) {
    return serverError("save set", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  try {
    const ok = await deleteSet(id, host.userId);
    if (!ok) return errorJson("That board isn't yours to delete.", 404);
    return json({ ok: true });
  } catch (err) {
    return serverError("delete set", err);
  }
}
