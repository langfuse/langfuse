const LLMCompletionErrorName = "LLMCompletionError";

export class LLMCompletionError extends Error {
  responseStatusCode: number;
  isRetryable: boolean;

  constructor(params: {
    message: string;
    responseStatusCode?: number;
    isRetryable?: boolean;
  }) {
    super(params.message);

    this.name = LLMCompletionErrorName;
    this.responseStatusCode = params.responseStatusCode ?? 500;
    this.isRetryable = params.isRetryable ?? false; // Default to false - be explicit about retryability

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
