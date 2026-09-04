import { AISDKError, APICallError, RetryError } from "ai";

const LLM_VALIDATION_ERROR_MARKER = Symbol.for(
  "langfuse.error.LLMValidationError",
);

export type LLMValidationErrorCode =
  | "invalid-connection"
  | "invalid-request"
  | "endpoint-unreachable";

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

  const aiSdkError = AISDKError.isInstance(resolvedError)
    ? resolvedError
    : AISDKError.isInstance(error)
      ? error
      : undefined;
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
    retryError ??= resolvedError;
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
