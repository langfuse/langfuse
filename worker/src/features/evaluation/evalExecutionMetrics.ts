import { EvalTemplateType } from "@langfuse/shared";
import {
  CodeEvalDispatcherErrorCodes,
  CodeEvalExecutionError,
  recordDistribution,
  recordIncrement,
  type EvaluatorLlmErrorClassification,
} from "@langfuse/shared/src/server";
import { EvalFailureReason, getEvalFailureReason } from "./evalFailureErrors";

export type ObservationEvalExecutionType =
  | typeof EvalTemplateType.LLM_AS_JUDGE
  | typeof EvalTemplateType.CODE;

export type EvalExecutionTerminalOutcome =
  | "success"
  | "platform_error"
  | "upstream_error"
  | "customer_error"
  | "cancelled";

const CUSTOMER_EVAL_FAILURE_REASONS: ReadonlySet<EvalFailureReason> =
  new Set<CustomerEvalFailureReason>([
    EvalFailureReason.InvalidModelConfig,
    EvalFailureReason.InvalidModelOutput,
  ]);

const LLM_ERROR_KIND_REASONS = {
  provider: "llm_provider",
  validation: "llm_validation",
  "ai-sdk": "llm_ai_sdk",
  timeout: "llm_timeout",
  abort: "llm_abort",
  "evaluator-policy": "llm_evaluator_policy",
} as const satisfies Record<EvaluatorLlmErrorClassification["kind"], string>;

type EvalScoreCountBucket = "0" | "1" | "2" | "3-5" | "6-10" | "11+";

const LLM_EVAL_CUSTOMER_OUTPUT_ERROR_NAMES: ReadonlySet<string> = new Set([
  "AI_NoObjectGeneratedError",
  "AI_NoOutputGeneratedError",
]);

const CODE_EVAL_CUSTOMER_ERROR_CODES: ReadonlySet<string> = new Set([
  CodeEvalDispatcherErrorCodes.INVALID_RESULT,
  CodeEvalDispatcherErrorCodes.INVALID_SOURCE,
  CodeEvalDispatcherErrorCodes.PAYLOAD_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.RESULT_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.SOURCE_TOO_LARGE,
  CodeEvalDispatcherErrorCodes.TIMEOUT,
  CodeEvalDispatcherErrorCodes.OUT_OF_MEMORY,
  CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
]);

export function recordEvalTimeToFirstAttempt(
  executionType: ObservationEvalExecutionType,
  durationMs: number,
): void {
  recordDistribution(
    "langfuse.evaluation.execution.time_to_first_attempt_ms",
    durationMs,
    {
      evaluator_type: getEvaluatorTypeTag(executionType),
      unit: "milliseconds",
    },
  );
}

export function recordEvalTerminalOutcome(
  executionType: ObservationEvalExecutionType,
  outcome: EvalExecutionTerminalOutcome,
  platformErrorReason?: EvalPlatformErrorReason,
): void {
  recordIncrement("langfuse.evaluation.execution.terminal", 1, {
    evaluator_type: getEvaluatorTypeTag(executionType),
    outcome,
    ...(outcome === "platform_error" && platformErrorReason
      ? { reason: platformErrorReason }
      : {}),
  });
}

/**
 * Attributes a terminal LLM evaluator failure. Known failure sites carry an
 * explicit reason; everything else falls back to the LLM classification, then
 * to whether the error was raised as unrecoverable.
 */
export function getLlmEvalTerminalErrorAttribution(params: {
  error: unknown;
  classification: EvaluatorLlmErrorClassification | null;
  isUnrecoverable: boolean;
}): LlmEvalTerminalErrorAttribution {
  const { error, classification, isUnrecoverable } = params;

  const failureReason = getEvalFailureReason(error);
  if (failureReason) {
    return isCustomerEvalFailureReason(failureReason)
      ? { outcome: "customer_error" }
      : { outcome: "platform_error", reason: failureReason };
  }

  if (classification) {
    const outcome = getLlmEvalTerminalErrorOutcome(classification);
    return outcome === "platform_error"
      ? { outcome, reason: LLM_ERROR_KIND_REASONS[classification.kind] }
      : { outcome };
  }

  return {
    outcome: "platform_error",
    reason: isUnrecoverable ? "unrecoverable" : "unexpected",
  };
}

export function recordEvalScorePersistenceOutcome(
  executionType: ObservationEvalExecutionType,
  outcome: "success" | "failure",
  scoreCount: number,
): void {
  recordIncrement("langfuse.evaluation.score_persistence", 1, {
    evaluator_type: getEvaluatorTypeTag(executionType),
    outcome,
    score_count_bucket: getEvalScoreCountBucket(scoreCount),
  });
}

export function getLlmEvalTerminalErrorOutcome(
  classification: EvaluatorLlmErrorClassification | null,
): Extract<
  EvalExecutionTerminalOutcome,
  "platform_error" | "upstream_error" | "customer_error"
> {
  if (!classification) return "platform_error";

  if (
    classification.blockReason !== null ||
    classification.kind === "evaluator-policy" ||
    classification.kind === "validation" ||
    (classification.kind === "ai-sdk" &&
      isLlmEvalCustomerOutputError(classification.error))
  ) {
    return "customer_error";
  }

  if (classification.kind === "provider") {
    const statusCode = classification.statusCode;
    return statusCode !== undefined &&
      statusCode >= 400 &&
      statusCode < 500 &&
      statusCode !== 408 &&
      statusCode !== 429
      ? "customer_error"
      : "upstream_error";
  }

  if (classification.kind === "timeout") return "upstream_error";

  return "platform_error";
}

export function getCodeEvalTerminalErrorOutcome(
  error: unknown,
): Extract<EvalExecutionTerminalOutcome, "platform_error" | "customer_error"> {
  if (!(error instanceof CodeEvalExecutionError)) return "platform_error";

  return CODE_EVAL_CUSTOMER_ERROR_CODES.has(error.code)
    ? "customer_error"
    : "platform_error";
}

function isLlmEvalCustomerOutputError(error: unknown): boolean {
  const visited = new Set<unknown>();
  const pending = [error];

  while (pending.length > 0) {
    const current = pending.pop();
    if (
      current === null ||
      current === undefined ||
      typeof current !== "object" ||
      visited.has(current)
    ) {
      continue;
    }

    visited.add(current);
    const value = current as Record<string, unknown>;
    if (
      typeof value.name === "string" &&
      LLM_EVAL_CUSTOMER_OUTPUT_ERROR_NAMES.has(value.name)
    ) {
      return true;
    }

    pending.push(value.cause, value.lastError);
  }

  return false;
}

function getEvaluatorTypeTag(
  executionType: ObservationEvalExecutionType,
): "llm_as_judge" | "code_as_judge" {
  return executionType === EvalTemplateType.LLM_AS_JUDGE
    ? "llm_as_judge"
    : "code_as_judge";
}

function getEvalScoreCountBucket(scoreCount: number): EvalScoreCountBucket {
  if (scoreCount === 0) return "0";
  if (scoreCount === 1) return "1";
  if (scoreCount === 2) return "2";
  if (scoreCount <= 5) return "3-5";
  if (scoreCount <= 10) return "6-10";
  return "11+";
}

function isCustomerEvalFailureReason(
  reason: EvalFailureReason,
): reason is CustomerEvalFailureReason {
  return CUSTOMER_EVAL_FAILURE_REASONS.has(reason);
}

type EvalPlatformErrorReason =
  | Exclude<EvalFailureReason, CustomerEvalFailureReason>
  | (typeof LLM_ERROR_KIND_REASONS)[keyof typeof LLM_ERROR_KIND_REASONS]
  | "unrecoverable"
  | "unexpected";

type LlmEvalTerminalErrorAttribution =
  | { outcome: "platform_error"; reason: EvalPlatformErrorReason }
  | { outcome: "upstream_error" | "customer_error"; reason?: never };

type CustomerEvalFailureReason =
  | typeof EvalFailureReason.InvalidModelConfig
  | typeof EvalFailureReason.InvalidModelOutput;

export const __test = {
  getEvalScoreCountBucket,
};
