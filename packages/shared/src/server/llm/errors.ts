const LLMCompletionErrorName = "LLMCompletionError";

const UNRECOVERABLE_MESSAGE_PATTERNS_WITH_CODES = [
  {
    pattern: "Model use case details have not been submitted for this account",
    suspendCode: "LLM_ACCOUNT_USE_CASE_NOT_SUBMITTED",
  },
  { pattern: "is not valid JSON", suspendCode: "LLM_INVALID_RESPONSE" },
  {
    pattern: "Unterminated string in JSON at position",
    suspendCode: "LLM_INVALID_RESPONSE",
  },
  { pattern: "TypeError", suspendCode: "LLM_INVALID_RESPONSE" },
] as const;

type SuspendCode =
  | "LLM_401"
  | "LLM_404"
  | (typeof UNRECOVERABLE_MESSAGE_PATTERNS_WITH_CODES)[number]["suspendCode"];

export function inferLLMCompletionSuspendCode(params: {
  responseStatusCode: number;
  message: string;
}): SuspendCode | null {
  if (params.responseStatusCode === 401) return "LLM_401";
  if (params.responseStatusCode === 404) return "LLM_404";

  const byMessage = UNRECOVERABLE_MESSAGE_PATTERNS_WITH_CODES.find((p) =>
    params.message.includes(p.pattern),
  );

  return byMessage?.suspendCode ?? null;
}

export class LLMCompletionError extends Error {
  responseStatusCode: number;
  isRetryable: boolean;
  suspendCode: SuspendCode | null;

  constructor(params: {
    message: string;
    responseStatusCode?: number;
    isRetryable?: boolean;
    suspendCode?: SuspendCode | null;
  }) {
    super(params.message);

    this.name = LLMCompletionErrorName;
    this.responseStatusCode = params.responseStatusCode ?? 500;
    this.isRetryable = params.isRetryable ?? false; // Default to false - be explicit about retryability
    this.suspendCode =
      params.suspendCode ??
      inferLLMCompletionSuspendCode({
        responseStatusCode: this.responseStatusCode,
        message: this.message,
      });

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }

  isUnrecoverable(): boolean {
    return this.getSuspendCode() !== null;
  }

  getSuspendCode(): SuspendCode | null {
    return this.suspendCode;
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
