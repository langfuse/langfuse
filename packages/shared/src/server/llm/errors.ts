const LLMCompletionErrorName = "LLMCompletionError";

const UNRECOVERABLE_HTTP_CODES = [401, 404];

const UNRECOVERABLE_MESSAGE_PATTERNS = [
  "Model use case details have not been submitted for this account",
];

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

  isUnrecoverable(): boolean {
    if (UNRECOVERABLE_HTTP_CODES.includes(this.responseStatusCode)) {
      return true;
    }
    return UNRECOVERABLE_MESSAGE_PATTERNS.some((p) => this.message.includes(p));
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
