import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { isMissingRelationError } from "@/lib/supabase/db-errors";

const MAX_BODY_BYTES = 512 * 1024;

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function errorJson(error: string, status: number): NextResponse {
  return json({ error }, status);
}

/** Parse a JSON body, refusing anything over 512 KB. */
export async function readBody(req: NextRequest): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const length = Number(req.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) return { ok: false, response: errorJson("That's too much to save in one go.", 413) };
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return { ok: false, response: errorJson("That's too much to save in one go.", 413) };
    const body = text ? JSON.parse(text) : {};
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return { ok: false, response: errorJson("Expected a JSON object.", 400) };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return { ok: false, response: errorJson("Couldn't read that request.", 400) };
  }
}

/** Turn an unexpected failure into a readable 500 (or 503 before the migration lands). */
export function serverError(scope: string, err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[trivia] ${scope} failed`, message);
  if (isMissingRelationError({ message })) {
    return errorJson("ICAN Trivia is still being set up on this site. Try again in a minute.", 503);
  }
  return errorJson("Something went wrong on our side. Try again.", 500);
}

export function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}
