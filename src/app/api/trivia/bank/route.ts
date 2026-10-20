/**
 * GET /api/trivia/bank → { mine, shared, library }
 *
 * The column bank: every titled column the host has saved on any
 * board or template, columns other hosts have shared, and the ICAN
 * library. Filtering happens in the browser — a host's bank is a few
 * hundred columns at most.
 */

import { requireHost } from "@/lib/trivia/server/auth";
import { errorJson, json, serverError } from "@/lib/trivia/server/http";
import { listBank } from "@/lib/trivia/server/sets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const host = await requireHost();
  if (!host.ok) return errorJson(host.error, host.status);
  try {
    return json(await listBank(host.userId));
  } catch (err) {
    return serverError("list bank", err);
  }
}
