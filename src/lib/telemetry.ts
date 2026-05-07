/**
 * Lightweight observability shim — Phase 6 P0.
 *
 * Designed for the gap between "no error reporting at all" and "ship
 * a full Sentry/Datadog integration with a vendor account". Does the
 * minimum a workshop operator needs:
 *
 *   1. Always logs structured events to the console with a stable
 *      prefix so dev / Vercel function logs are searchable.
 *   2. POSTs to a webhook (Slack, Discord, Vercel Webhook, OpenObserve,
 *      etc.) when `NEXT_PUBLIC_TELEMETRY_WEBHOOK` is set, so
 *      production errors / slow closes generate a real-time signal
 *      without requiring any infra setup beyond the env var.
 *   3. Exposes a clean `captureException` + `captureEvent` API that
 *      any future Sentry / vendor integration can drop in behind
 *      without changing call sites.
 *
 * Safe defaults — never throws on its own faults; never blocks the
 * caller (POST is fire-and-forget); never sends user-identifying
 * info (only the digest if Next provides one).
 */

type TelemetryLevel = "info" | "warn" | "error";

interface TelemetryEvent {
  level: TelemetryLevel;
  name: string;
  /** Free-form context. Avoid PII — keep it numeric / structural. */
  context?: Record<string, unknown>;
  /** Original error if applicable (only `name`, `message`, and the
   *  Next.js error `digest` are forwarded; stack stays in console). */
  error?: { name?: string; message?: string; digest?: string };
}

const PREFIX = "[ican-sims:telemetry]";

function getWebhookUrl(): string | null {
  // Both NEXT_PUBLIC_ (browser-readable) and server-side variants
  // are honored. The browser path uses NEXT_PUBLIC_; the server
  // path can use TELEMETRY_WEBHOOK without exposing it to clients.
  if (typeof process === "undefined") return null;
  const env = process.env;
  return (
    env.NEXT_PUBLIC_TELEMETRY_WEBHOOK ??
    env.TELEMETRY_WEBHOOK ??
    null
  );
}

function emitToConsole(evt: TelemetryEvent): void {
  const fn =
    evt.level === "error" ? console.error :
    evt.level === "warn" ? console.warn :
    console.info;
  // eslint-disable-next-line no-console
  fn(PREFIX, evt.name, evt.context ?? {}, evt.error ?? null);
}

async function postToWebhook(evt: TelemetryEvent): Promise<void> {
  const url = getWebhookUrl();
  if (!url) return;
  try {
    // POST a flat JSON shape. Webhooks (Slack, Discord, etc.) each
    // expect their own format — operators wire a small transform
    // function or a generic ingestion endpoint. We keep the shape
    // simple so any reasonable webhook can consume it.
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        source: "ican-sims",
        timestamp: new Date().toISOString(),
        level: evt.level,
        name: evt.name,
        context: evt.context ?? {},
        error: evt.error ?? null,
      }),
      // keepalive: true so the request survives a page-navigate.
      keepalive: typeof window !== "undefined",
    });
  } catch {
    // Webhook fault is non-fatal — never re-emit (would loop).
  }
}

/** Capture an exception. Use in catch blocks + error boundaries. */
export function captureException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const errorPayload =
    err instanceof Error
      ? {
          name: err.name,
          message: err.message,
          digest: (err as Error & { digest?: string }).digest,
        }
      : {
          name: "UnknownError",
          message: typeof err === "string" ? err : "Unknown thrown value",
        };
  const evt: TelemetryEvent = {
    level: "error",
    name: errorPayload.name,
    context,
    error: errorPayload,
  };
  emitToConsole(evt);
  void postToWebhook(evt);
}

/** Capture a structured event (closeQuarter timing, slow API,
 *  workshop-survival warnings). */
export function captureEvent(
  name: string,
  level: TelemetryLevel = "info",
  context?: Record<string, unknown>,
): void {
  const evt: TelemetryEvent = { level, name, context };
  emitToConsole(evt);
  // Only forward warn/error to the webhook by default — info-level
  // events would flood operators with quarter-close timings.
  if (level !== "info") {
    void postToWebhook(evt);
  }
}
