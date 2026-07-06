import { ContextOverflowError } from "@langchain/core/errors";

import { LLMCompletionError } from "./errors";

const NON_RETRYABLE_LLM_ERROR_PATTERNS = [
  "Request timed out",
  "is not valid JSON",
  "Unterminated string in JSON at position",
  "TypeError",
  "reached the end of its life",
  "prompt is too long",
  // secureLlmFetch validation failures: synchronous, status-less errors that
  // would otherwise default to 500 + retryable and burn the eval-retry budget
  // on permanent config or redirect-target failures.
  "Only HTTP and HTTPS protocols are allowed",
  "Only HTTPS base URLs are allowed",
  "Blocked hostname detected",
  "Blocked IP address detected",
  "Redirect validation failed",
  "Maximum redirects",
  "Circular redirect detected",
] as const;

// Walks an error and its `.cause` chain (cycle-safe), yielding each link.
function* walkCauseChain(error: unknown): Generator<unknown> {
  const visited = new Set<unknown>();
  for (
    let current: unknown = error;
    current && !visited.has(current);
    current = (current as any).cause
  ) {
    visited.add(current);
    yield current;
  }
}

/**
 * Detects AI SDK native timeouts. `AbortSignal.timeout` (used by the SDK's
 * `timeout` option) aborts with `DOMException(..., "TimeoutError")`, which
 * carries neither a status code nor the "Request timed out" message the
 * shared retry classification keys on — callers must normalize it to the
 * canonical non-retryable timeout error.
 */
export function hasTimeoutAbortInCauseChain(error: unknown): boolean {
  for (const current of walkCauseChain(error)) {
    if ((current as { name?: string } | null)?.name === "TimeoutError") {
      return true;
    }
  }
  return false;
}

function findNonRetryableCauseMessage(error: unknown): string | undefined {
  for (const current of walkCauseChain(error)) {
    if (!(current instanceof Error)) continue;
    const message = extractCleanErrorMessage(current.message);
    if (NON_RETRYABLE_LLM_ERROR_PATTERNS.some((p) => message.includes(p))) {
      return message;
    }
  }
  return undefined;
}

function getErrorResponseStatusCode(error: unknown): number | undefined {
  for (const current of walkCauseChain(error)) {
    if (!current || typeof current !== "object") continue;
    const errorLike = current as any;
    const statusCode = [
      errorLike.response?.status,
      errorLike.status,
      errorLike.statusCode,
      // Bedrock errors have status code in $metadata.httpStatusCode.
      errorLike.$metadata?.httpStatusCode,
    ]
      .map(toHttpStatusCode)
      .find((code) => code !== undefined);
    if (statusCode !== undefined) return statusCode;
  }
  return undefined;
}

function toHttpStatusCode(value: unknown): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? value
    : undefined;
}

function extractCleanErrorMessage(rawMessage: string): string {
  // Try to parse JSON error format (common in Google/Vertex AI errors)
  // Example: '[{"error":{"code":404,"message":"Model not found..."}}]'
  try {
    // Check if the message starts with [ or { indicating JSON
    const trimmed = rawMessage.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      const parsed = JSON.parse(trimmed);

      // Handle array format: [{"error": {"message": "..."}}]
      if (Array.isArray(parsed) && parsed[0]?.error?.message) {
        return parsed[0].error.message;
      }

      // Handle object format: {"error": {"message": "..."}}
      if (parsed?.error?.message) {
        return parsed.error.message;
      }

      // Handle direct message format: {"message": "..."}
      if (parsed?.message) {
        return parsed.message;
      }
    }
  } catch {
    // Not valid JSON, return as-is
  }

  return rawMessage;
}

/**
 * Maps any error thrown during an LLM completion (LangChain or AI SDK engine)
 * to an `LLMCompletionError` with a clean user-visible message and the shared
 * retryability classification. Both execution engines MUST use this mapper so
 * eval retry budgets behave identically regardless of engine.
 */
export function mapToLLMCompletionError(e: unknown): LLMCompletionError {
  if (e instanceof LLMCompletionError) return e;

  const responseStatusCode = getErrorResponseStatusCode(e) ?? 500;
  const rawMessage = e instanceof Error ? e.message : String(e);
  // Anthropic/OpenAI/Azure SDKs wrap synchronous fetch errors as
  // `APIConnectionError { message: "Connection error.", cause: original }`,
  // hiding the actual secureLlmFetch validation reason. Walk the `.cause`
  // chain for both retryability classification and the user-visible message
  // so operators see "Blocked hostname detected" / "Redirect validation
  // failed ..." instead of the unhelpful wrapper text.
  const nonRetryableCauseMessage = findNonRetryableCauseMessage(e);
  const message =
    nonRetryableCauseMessage ?? extractCleanErrorMessage(rawMessage);

  const hasNonRetryablePattern = nonRetryableCauseMessage !== undefined;

  // Determine retryability:
  // - 429 (rate limit): retryable with custom delay
  // - 5xx (server errors): retryable with custom delay
  // - 4xx (client errors): not retryable
  // - Non-retryable patterns: not retryable
  let isRetryable = false;

  if (ContextOverflowError.isInstance(e)) {
    isRetryable = false;
  } else if (
    e instanceof Error &&
    (e.name === "InsufficientQuotaError" || e.name === "ThrottlingException")
  ) {
    // Explicit 429 handling
    isRetryable = true;
  } else if (responseStatusCode >= 500) {
    // 5xx errors are retryable (server issues)
    isRetryable = true;
  } else if (responseStatusCode === 429) {
    // Rate limit is retryable
    isRetryable = true;
  }

  // Override if error message indicates non-retryable issue
  if (hasNonRetryablePattern) {
    isRetryable = false;
  }

  return new LLMCompletionError({
    message,
    responseStatusCode,
    isRetryable,
    cause: e,
  });
}
