/**
 * Message protocol between the JSON-parser Web Worker and its client.
 *
 * Kept in its own module because the worker is compiled separately from the app
 * bundle (see `scripts/build-json-parser-worker.mjs`): both sides have to agree
 * on these shapes, and neither may pull the other's runtime code in to do it.
 */

export interface ParseRequest {
  id: string;
  input: unknown;
  output: unknown;
  metadata: unknown;
}

export interface ParseResponse {
  id: string;
  parsedInput: unknown;
  parsedOutput: unknown;
  parsedMetadata: unknown;
  parseTime: number;
  error?: string;
}

/**
 * Parse limits off the main thread: no depth cap and 10MB per field, because a
 * long parse there costs nothing but worker time.
 */
export const WORKER_PARSE_LIMITS = {
  maxDepth: Infinity,
  maxSize: 10_000_000,
} as const;

/**
 * Parse limits on the main thread, used whenever the worker is unavailable.
 * Deliberately far stricter: this parse blocks rendering.
 */
export const MAIN_THREAD_PARSE_LIMITS = {
  maxDepth: 50,
  maxSize: 500_000,
} as const;
