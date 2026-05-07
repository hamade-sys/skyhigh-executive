/**
 * fetchWithRetry — exponential-backoff fetch wrapper for the critical
 * write endpoints (state-update, forfeit, claim-color, chat-send,
 * etc.) where a single 500 in-flight loses a player's progress.
 *
 * Phase 6 P1 of the enterprise-readiness plan. The previous shape
 * was: every action calls fetch() once, surfaces an error toast on
 * any non-2xx response, and the local store keeps the change. So
 * a transient Supabase 500 left the local store ahead of the
 * server, and the next push collided with stale state.
 *
 * Behaviour:
 *   - Retries on network errors and 5xx (server-side faults).
 *   - DOES NOT retry on 4xx (auth, validation, conflict) — those
 *     are caller bugs, not transient failures.
 *   - DOES NOT retry on 409 (CAS conflict) — caller is expected to
 *     refetch state and try again with the new version.
 *   - Default: 3 attempts at 250ms / 750ms / 2.25s backoff.
 *   - Caller can pass `signal` for AbortController integration.
 */

export interface FetchWithRetryOptions extends RequestInit {
  /** Maximum number of attempts including the first. Default 3. */
  maxAttempts?: number;
  /** Initial backoff in ms; multiplied by 3 each retry. Default 250. */
  initialBackoffMs?: number;
  /** When provided, called once per retry with the attempt number
   *  and the error/status that triggered the retry. Use for telemetry. */
  onRetry?: (attempt: number, reason: string) => void;
}

export async function fetchWithRetry(
  input: RequestInfo | URL,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const {
    maxAttempts = 3,
    initialBackoffMs = 250,
    onRetry,
    ...init
  } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const res = await fetch(input, init);
      // Success or non-retryable failure — return immediately.
      if (res.ok || res.status < 500) {
        return res;
      }
      lastError = `HTTP ${res.status}`;
      if (attempt < maxAttempts) {
        const wait = initialBackoffMs * Math.pow(3, attempt - 1);
        onRetry?.(attempt, `HTTP ${res.status}`);
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        const wait = initialBackoffMs * Math.pow(3, attempt - 1);
        onRetry?.(
          attempt,
          err instanceof Error ? err.message : "network error",
        );
        await new Promise((resolve) => setTimeout(resolve, wait));
        continue;
      }
      throw err;
    }
  }
  // Should never reach here — the loop returns or throws.
  throw lastError instanceof Error
    ? lastError
    : new Error("fetchWithRetry exhausted");
}
