import { JobConfigBlockReason } from "@prisma/client";

const LLMCompletionErrorName = "LLMCompletionError";

const BLOCK_REASON_PATTERNS = [
  {
    pattern: "Model use case details have not been submitted for this account",
    blockReason: JobConfigBlockReason.PROVIDER_ACCOUNT_UNREADY,
  },
] as const;

export function inferLLMCompletionBlockReason(params: {
  responseStatusCode: number;
  message: string;
}): JobConfigBlockReason | null {
  if (params.responseStatusCode === 401) {
    return JobConfigBlockReason.CONNECTION_AUTH_INVALID;
  }

  if (params.responseStatusCode === 404) {
    return JobConfigBlockReason.MODEL_UNAVAILABLE;
  }

  const reasonByMessage = BLOCK_REASON_PATTERNS.find((entry) =>
    params.message.includes(entry.pattern),
  );

  return reasonByMessage?.blockReason ?? null;
}

export class LLMCompletionError extends Error {
  responseStatusCode: number;
  isRetryable: boolean;
  blockReason: JobConfigBlockReason | null;

  constructor(params: {
    message: string;
    responseStatusCode?: number;
    isRetryable?: boolean;
    blockReason?: JobConfigBlockReason | null;
  }) {
    super(params.message);

    this.name = LLMCompletionErrorName;
    this.responseStatusCode = params.responseStatusCode ?? 500;
    this.isRetryable = params.isRetryable ?? false; // Default to false - be explicit about retryability
    this.blockReason =
      params.blockReason ??
      inferLLMCompletionBlockReason({
        responseStatusCode: this.responseStatusCode,
        message: this.message,
      });

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }

  shouldBlockConfig(): boolean {
    return this.blockReason !== null;
  }

  getBlockReason(): JobConfigBlockReason | null {
    return this.blockReason;
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
