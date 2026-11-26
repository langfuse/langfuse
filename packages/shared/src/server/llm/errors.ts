import { AISDKError, APICallError, RetryError } from "ai";

const LLM_VALIDATION_ERROR_MARKER = Symbol.for(
  "langfuse.error.LLMValidationError",
);

export type LLMValidationErrorCode =
  | "invalid-connection"
  | "invalid-request"
  | "endpoint-unreachable"
  | "media-not-found";

/**
 * A deterministic validation failure owned by Langfuse, before or around the
 * provider call. Provider failures remain native AI SDK errors.
 */
export class LLMValidationError extends Error {
  private readonly [LLM_VALIDATION_ERROR_MARKER] = true;

  readonly code: LLMValidationErrorCode;
  readonly statusCode = 400;

  constructor(params: {
    code: LLMValidationErrorCode;
    message: string;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });
    this.name = "LLMValidationError";
    this.code = params.code;
  }

  static isInstance(error: unknown): error is LLMValidationError {
    return (
      error !== null &&
      typeof error === "object" &&
      LLM_VALIDATION_ERROR_MARKER in error &&
      error[LLM_VALIDATION_ERROR_MARKER] === true
    );
  }
}

/**
 * Stands in for a provider 429 while a model on an LLM connection cools down after one,
 * so callers classify and reschedule it exactly like the provider's own.
 */
export class LLMConnectionCooldownError extends APICallError {
  readonly remainingMs: number;

  constructor(remainingMs: number) {
    super({
      message: `The provider rate limited this model on this LLM connection; requests are paused for another ${Math.ceil(remainingMs / 1000)}s.`,
      url: "",
      requestBodyValues: undefined,
      statusCode: 429,
      isRetryable: true,
    });
    this.name = "LLMConnectionCooldownError";
    this.remainingMs = remainingMs;
  }
}

/**
 * How long to wait before calling the provider again: the remaining LLM
 * connection cooldown, or the provider's `retry-after-ms` / `retry-after`
 * (seconds or HTTP date). Undefined when neither says.
 */
export function getLLMRetryAfterMs(error: unknown): number | undefined {
  const cooldownError = findInCauseChain(
    error,
    (e): e is LLMConnectionCooldownError =>
      e instanceof LLMConnectionCooldownError,
  );
  if (cooldownError) return cooldownError.remainingMs;

  const headers = getLLMErrorInfo(error)?.providerError?.responseHeaders;
  const retryAfterMs = Number.parseFloat(headers?.["retry-after-ms"] ?? "");
  if (Number.isFinite(retryAfterMs)) return retryAfterMs;
  const retryAfterSeconds = Number.parseFloat(headers?.["retry-after"] ?? "");
  if (Number.isFinite(retryAfterSeconds)) return retryAfterSeconds * 1000;
  const retryAt = Date.parse(headers?.["retry-after"] ?? "");
  return Number.isFinite(retryAt)
    ? Math.max(0, retryAt - Date.now())
    : undefined;
}

export type LLMErrorInfo = {
  kind: "provider" | "validation" | "ai-sdk" | "timeout" | "abort";
  message: string;
  statusCode?: number;
  isRetryable: boolean;
  error: unknown;
  providerError?: APICallError;
  retryError?: RetryError;
  validationError?: LLMValidationError;
};

/**
 * Reads native AI SDK and Langfuse validation errors without replacing them.
 * Unknown application errors intentionally return null so callers do not
 * accidentally expose internal messages or treat internal bugs as LLM errors.
 */
export function getLLMErrorInfo(error: unknown): LLMErrorInfo | null {
  const { resolvedError, retryError } = unwrapRetryError(error);

  const validationError = findInCauseChain(
    resolvedError,
    LLMValidationError.isInstance,
  );
  if (validationError) {
    return {
      kind: "validation",
      message: validationError.message,
      statusCode: validationError.statusCode,
      isRetryable: false,
      error,
      validationError,
      retryError,
    };
  }

  const providerError = findInCauseChain(
    resolvedError,
    APICallError.isInstance,
  );
  if (providerError) {
    return {
      kind: "provider",
      message: providerError.message,
      statusCode: providerError.statusCode,
      isRetryable:
        retryError?.reason === "abort" ? false : providerError.isRetryable,
      error,
      providerError,
      retryError,
    };
  }

  const timeoutError = findErrorByName(resolvedError, "TimeoutError");
  if (timeoutError) {
    return {
      kind: "timeout",
      message: timeoutError.message,
      isRetryable: false,
      error,
      retryError,
    };
  }

  const abortError = findErrorByName(resolvedError, "AbortError");
  if (abortError) {
    return {
      kind: "abort",
      message: abortError.message,
      isRetryable: false,
      error,
      retryError,
    };
  }

  const aiSdkError = (() => {
    if (AISDKError.isInstance(resolvedError)) {
      return resolvedError;
    }
    if (AISDKError.isInstance(error)) {
      return error;
    }
    return undefined;
  })();
  if (aiSdkError) {
    return {
      kind: "ai-sdk",
      message: aiSdkError.message,
      isRetryable: false,
      error,
      retryError,
    };
  }

  return null;
}

function unwrapRetryError(error: unknown): {
  resolvedError: unknown;
  retryError?: RetryError;
} {
  let resolvedError = error;
  let retryError: RetryError | undefined;
  const visited = new Set<unknown>();

  while (RetryError.isInstance(resolvedError) && !visited.has(resolvedError)) {
    visited.add(resolvedError);
    if (retryError === undefined) {
      retryError = resolvedError;
    }
    resolvedError = resolvedError.lastError;
  }

  return { resolvedError, retryError };
}

function findErrorByName(error: unknown, name: string): Error | undefined {
  return findInCauseChain(
    error,
    (candidate): candidate is Error =>
      candidate instanceof Error && candidate.name === name,
  );
}

function findInCauseChain<T>(
  error: unknown,
  predicate: (candidate: unknown) => candidate is T,
): T | undefined {
  const visited = new Set<unknown>();
  let current = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (predicate(current)) return current;

    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }

  return undefined;
}
