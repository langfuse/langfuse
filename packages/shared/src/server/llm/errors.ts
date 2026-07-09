import { EvaluatorBlockReason } from "@prisma/client";

const LLMCompletionErrorName = "LLMCompletionError";

const BLOCK_REASON_PATTERNS = [
  {
    pattern: "Model use case details have not been submitted for this account",
    blockReason: EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY,
  },
  // Google AI Studio rejects invalid API keys with a 400, so this cannot rely
  // on the 401 status check above.
  {
    pattern: "API key not valid",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
  },
  // Exhausted credits or spend budgets are terminal until a human tops up the
  // provider account, but providers report them with inconsistent status
  // codes (OpenRouter 402, Anthropic 400, LiteLLM 400/429, OpenAI 429), so
  // they must be matched by message.
  {
    pattern: "Insufficient credits",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
  {
    pattern: "credit balance is too low",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
  {
    pattern: "prepayment credits are depleted",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
  {
    pattern: "Budget has been exceeded",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
  {
    pattern: "exceeded your current quota",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
] as const;

export function inferLLMCompletionBlockReason(params: {
  responseStatusCode: number;
  message: string;
}): EvaluatorBlockReason | null {
  if (params.responseStatusCode === 401) {
    return EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID;
  }

  if (params.responseStatusCode === 402) {
    return EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED;
  }

  if (params.responseStatusCode === 404) {
    return EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE;
  }

  const reasonByMessage = BLOCK_REASON_PATTERNS.find((entry) =>
    params.message.includes(entry.pattern),
  );

  return reasonByMessage?.blockReason ?? null;
}

export class LLMCompletionError extends Error {
  responseStatusCode: number;
  isRetryable: boolean;
  blockReason: EvaluatorBlockReason | null;

  constructor(params: {
    message: string;
    responseStatusCode?: number;
    isRetryable?: boolean;
    cause?: unknown;
  }) {
    super(params.message, { cause: params.cause });

    this.name = LLMCompletionErrorName;
    this.responseStatusCode = params.responseStatusCode ?? 500;
    this.blockReason = inferLLMCompletionBlockReason({
      responseStatusCode: this.responseStatusCode,
      message: this.message,
    });
    // A block-worthy error is terminal by definition: retrying would burn the
    // eval retry budget on a config that is being paused anyway. This matters
    // for billing errors that arrive as otherwise-retryable 429s.
    this.isRetryable =
      this.blockReason !== null ? false : (params.isRetryable ?? false); // Default to false - be explicit about retryability

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this);
    }
  }

  shouldBlockConfig(): boolean {
    return this.blockReason !== null;
  }

  getEvaluatorBlockReason(): EvaluatorBlockReason | null {
    return this.blockReason;
  }
}

export function isLLMCompletionError(e: any): e is LLMCompletionError {
  return e instanceof Error && e.name === LLMCompletionErrorName;
}
