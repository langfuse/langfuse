import { EvaluatorBlockReason } from "@prisma/client";

import { getLLMErrorInfo, type LLMErrorInfo } from "../llm/errors";

const BLOCK_REASON_PATTERNS = [
  {
    pattern: "Model use case details have not been submitted for this account",
    blockReason: EvaluatorBlockReason.PROVIDER_ACCOUNT_NOT_READY,
  },
  {
    pattern: "API key not valid",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
  },
  {
    pattern: "invalid_grant",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID,
  },
  {
    pattern: "DNS lookup failed",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE,
  },
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
    pattern: "requires more credits",
    blockReason: EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED,
  },
] as const;

export type EvaluatorLlmErrorClassification = (
  | LLMErrorInfo
  | {
      kind: "evaluator-policy";
      message: string;
      statusCode?: number;
      isRetryable: false;
      error: unknown;
    }
) & { blockReason: EvaluatorBlockReason | null };

/**
 * Evaluator policy layered on top of native AI SDK error metadata. Provider
 * retryability remains authoritative unless the evaluator is paused for a
 * terminal connection/model condition.
 */
export function classifyEvaluatorLlmError(
  error: unknown,
): EvaluatorLlmErrorClassification | null {
  const info = getLLMErrorInfo(error);
  if (!info) {
    const matchedError = findBlockReasonInCauseChain(error);
    return matchedError
      ? {
          kind: "evaluator-policy",
          message: matchedError.message,
          isRetryable: false,
          error,
          blockReason: matchedError.blockReason,
        }
      : null;
  }

  const blockReason = inferEvaluatorBlockReason(info);

  return {
    ...info,
    blockReason,
    isRetryable: blockReason === null && info.isRetryable,
  };
}

function inferEvaluatorBlockReason(
  info: LLMErrorInfo,
): EvaluatorBlockReason | null {
  if (info.validationError?.code === "endpoint-unreachable") {
    return EvaluatorBlockReason.LLM_CONNECTION_ENDPOINT_UNREACHABLE;
  }

  if (info.statusCode === 401) {
    return EvaluatorBlockReason.LLM_CONNECTION_AUTH_INVALID;
  }

  if (info.statusCode === 402) {
    return EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED;
  }

  if (info.statusCode === 404) {
    return EvaluatorBlockReason.EVAL_MODEL_UNAVAILABLE;
  }

  if (getProviderErrorDiscriminators(info).includes("insufficient_quota")) {
    return EvaluatorBlockReason.LLM_CONNECTION_BILLING_EXHAUSTED;
  }

  return getBlockReasonByMessage(info.message);
}

function getProviderErrorDiscriminators(info: LLMErrorInfo): string[] {
  const data = toRecord(info.providerError?.data);
  if (!data) return [];

  const nestedError = toRecord(data.error);

  return [data, nestedError].flatMap((candidate) => {
    if (!candidate) return [];

    return ["code", "type"]
      .map((key) => {
        const value = candidate[key];
        return typeof value === "string" ? value.toLowerCase() : undefined;
      })
      .filter((value): value is string => value !== undefined);
  });
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function findBlockReasonInCauseChain(
  error: unknown,
): { message: string; blockReason: EvaluatorBlockReason } | undefined {
  const visited = new Set<unknown>();
  let current = error;

  while (current !== null && current !== undefined && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) {
      const blockReason = getBlockReasonByMessage(current.message);
      if (blockReason) return { message: current.message, blockReason };
    }

    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }

  return undefined;
}

function getBlockReasonByMessage(message: string): EvaluatorBlockReason | null {
  return (
    BLOCK_REASON_PATTERNS.find(({ pattern }) => message.includes(pattern))
      ?.blockReason ?? null
  );
}
