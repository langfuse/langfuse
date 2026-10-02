/**
 * Retry policy while a newly ingested trace may still be arriving in
 * ClickHouse. Used by the fullscreen/peek detail fetch — not by dense table
 * cells, which stay fail-fast.
 *
 * TanStack Query's retry callback receives a 0-based failureCount on the first
 * failure (see @tanstack/query-core retryer). `failureCount < 4` therefore
 * yields 4 retries after the initial attempt (~1s, 2s, 4s, 8s of backoff).
 */
export const TRACE_ARRIVAL_MAX_RETRIES = 4;

/** Cap so a long-tailed backoff cannot stretch past ~8s between attempts. */
export const TRACE_ARRIVAL_MAX_RETRY_DELAY_MS = 8_000;

/**
 * Delay before the next attempt after a miss. `failureCount` is the value
 * TanStack passes into `retryDelay` (0 on the first failure).
 */
export function getTraceArrivalRetryDelayMs(failureCount: number): number {
  return Math.min(1_000 * 2 ** failureCount, TRACE_ARRIVAL_MAX_RETRY_DELAY_MS);
}

/**
 * Whether to schedule another attempt after a NOT_FOUND (traces path) or an
 * empty events result (v4 path). `attemptIndex` is 0-based: 0 is the first
 * miss, 3 is the fourth retry.
 */
export function shouldRetryTraceArrival(attemptIndex: number): boolean {
  return attemptIndex < TRACE_ARRIVAL_MAX_RETRIES;
}

/**
 * For the events path, successful empty responses use `dataUpdateCount` (1 after
 * the first empty success). Keep refetching until we have exhausted the same
 * 4 retries (5 total fetches).
 */
export function getTraceArrivalEmptyRefetchIntervalMs(
  dataUpdateCount: number,
): number | false {
  // dataUpdateCount is 1 after the first empty success. Retries are fetches
  // 2–5 → stop once we have completed 5 successful empty reads.
  if (dataUpdateCount >= TRACE_ARRIVAL_MAX_RETRIES + 1) {
    return false;
  }
  return getTraceArrivalRetryDelayMs(dataUpdateCount - 1);
}
