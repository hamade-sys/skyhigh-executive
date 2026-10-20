/**
 * /api/trivia/bank/[id]
 *
 *   PATCH  { starred?, shared?, title? } → { column }   (owner only)
 *   POST   { used: true } → { ok }   counts a column pulled into a board
 *   DELETE → { ok }                  (owner only)
 */

import type { NextRequest } from "next/server";
import { LIMITS } from "@/lib/trivia/content";
import { requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, readBody, serverError, str } from "@/lib/trivia/server/http";
import { deleteBankColumn, markBankColumnUsed, updateBankColumn } from "@/lib/trivia/server/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  const parsed = await readBody(req);
  if (!parsed.ok) return parsed.response;
  const { body } = parsed;
  const title = str(body.title)?.trim().slice(0, LIMITS.columnTitle);
  if (body.title !== undefined && !title) return errorJson("Give the column a title.", 400);
  try {
    const column = await updateBankColumn(id, host.userId, {
      starred: typeof body.starred === "boolean" ? body.starred : undefined,
      shared: typeof body.shared === "boolean" ? body.shared : undefined,
      title,
    });
    if (!column) return errorJson("That column isn't in your bank.", 404);
    return json({ column });
  } catch (err) {
    return serverError("update bank column", err);
  }
}

export async function POST(_req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  try {
    await markBankColumnUsed(decodeURIComponent(id), host.userId);
    return json({ ok: true });
  } catch (err) {
    return serverError("mark bank column used", err);
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  const { id } = await params;
  try {
    const ok = await deleteBankColumn(id, host.userId);
    if (!ok) return errorJson("That column isn't in your bank.", 404);
    return json({ ok: true });
  } catch (err) {
    return serverError("delete bank column", err);
  }
}
