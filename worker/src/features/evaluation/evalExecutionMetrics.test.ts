import { EvalTemplateType } from "@langfuse/shared";
import {
  CodeEvalDispatcherErrorCodes,
  CodeEvalExecutionError,
  recordDistribution,
  recordIncrement,
  type EvaluatorLlmErrorClassification,
} from "@langfuse/shared/src/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  __test,
  getCodeEvalTerminalErrorOutcome,
  getLlmEvalTerminalErrorAttribution,
  getLlmEvalTerminalErrorOutcome,
  recordEvalScorePersistenceOutcome,
  recordEvalTerminalOutcome,
  recordEvalTimeToFirstAttempt,
} from "./evalExecutionMetrics";
import {
  EvalFailureError,
  EvalFailureReason,
  UnrecoverableEvalFailureError,
} from "./evalFailureErrors";

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
}));

describe("evaluation execution metrics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records the bounded metric contract", () => {
    recordEvalTimeToFirstAttempt(EvalTemplateType.LLM_AS_JUDGE, 1_234);
    recordEvalTerminalOutcome(EvalTemplateType.CODE, "success");
    recordEvalScorePersistenceOutcome(
      EvalTemplateType.LLM_AS_JUDGE,
      "failure",
      7,
    );

    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.evaluation.execution.time_to_first_attempt_ms",
      1_234,
      {
        evaluator_type: "llm_as_judge",
        unit: "milliseconds",
      },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.evaluation.execution.terminal",
      1,
      { evaluator_type: "code_as_judge", outcome: "success" },
    );
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.evaluation.score_persistence",
      1,
      {
        evaluator_type: "llm_as_judge",
        outcome: "failure",
        score_count_bucket: "6-10",
      },
    );
  });

  it.each([
    { scoreCount: 0, expected: "0" },
    { scoreCount: 1, expected: "1" },
    { scoreCount: 2, expected: "2" },
    { scoreCount: 3, expected: "3-5" },
    { scoreCount: 5, expected: "3-5" },
    { scoreCount: 6, expected: "6-10" },
    { scoreCount: 10, expected: "6-10" },
    { scoreCount: 11, expected: "11+" },
  ])("buckets $scoreCount scores as $expected", ({ scoreCount, expected }) => {
    expect(__test.getEvalScoreCountBucket(scoreCount)).toBe(expected);
  });

  it.each([
    {
      classification: null,
      expected: "platform_error",
    },
    {
      classification: {
        kind: "validation",
        message: "invalid connection",
        isRetryable: false,
        error: new Error("invalid connection"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      expected: "customer_error",
    },
    {
      classification: {
        kind: "provider",
        message: "invalid request",
        statusCode: 400,
        isRetryable: false,
        error: new Error("invalid request"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      expected: "customer_error",
    },
    {
      classification: {
        kind: "provider",
        message: "rate limited",
        statusCode: 429,
        isRetryable: true,
        error: new Error("rate limited"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      expected: "upstream_error",
    },
    {
      classification: {
        kind: "timeout",
        message: "provider timed out",
        isRetryable: false,
        error: new Error("provider timed out"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      expected: "upstream_error",
    },
    ...["AI_NoObjectGeneratedError", "AI_NoOutputGeneratedError"].map(
      (name) => ({
        classification: {
          kind: "ai-sdk" as const,
          message: "model output did not match the required format",
          isRetryable: false,
          error: Object.assign(new Error("invalid model output"), { name }),
          blockReason: null,
        } satisfies EvaluatorLlmErrorClassification,
        expected: "customer_error",
      }),
    ),
  ])(
    "classifies LLM terminal errors as $expected",
    ({ classification, expected }) => {
      expect(getLlmEvalTerminalErrorOutcome(classification)).toBe(expected);
    },
  );

  it.each([
    {
      name: "unknown AI SDK errors by LLM error kind",
      error: new Error("unexpected AI SDK failure"),
      classification: {
        kind: "ai-sdk",
        message: "unexpected AI SDK failure",
        isRetryable: false,
        error: new Error("unexpected AI SDK failure"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      isUnrecoverable: false,
      expected: { outcome: "platform_error", reason: "llm_ai_sdk" },
    },
    {
      name: "upstream errors without a reason",
      error: new Error("provider timed out"),
      classification: {
        kind: "timeout",
        message: "provider timed out",
        isRetryable: false,
        error: new Error("provider timed out"),
        blockReason: null,
      } satisfies EvaluatorLlmErrorClassification,
      isUnrecoverable: false,
      expected: { outcome: "upstream_error" },
    },
    {
      name: "invalid model configuration as customer errors",
      error: new UnrecoverableEvalFailureError(
        "invalid model configuration",
        EvalFailureReason.InvalidModelConfig,
      ),
      classification: null,
      isUnrecoverable: true,
      expected: { outcome: "customer_error" },
    },
    {
      name: "score persistence failures as platform errors",
      error: new EvalFailureError(
        "failed to write score",
        EvalFailureReason.ScorePersistence,
      ),
      classification: null,
      isUnrecoverable: false,
      expected: { outcome: "platform_error", reason: "score_persistence" },
    },
    {
      name: "unknown application errors as unexpected",
      error: new Error("database unavailable"),
      classification: null,
      isUnrecoverable: false,
      expected: { outcome: "platform_error", reason: "unexpected" },
    },
  ])(
    "attributes $name",
    ({ error, classification, isUnrecoverable, expected }) => {
      expect(
        getLlmEvalTerminalErrorAttribution({
          error,
          classification,
          isUnrecoverable,
        }),
      ).toEqual(expected);
    },
  );

  it("tags only platform errors with a reason", () => {
    recordEvalTerminalOutcome(
      EvalTemplateType.LLM_AS_JUDGE,
      "platform_error",
      "score_persistence",
    );

    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.evaluation.execution.terminal",
      1,
      {
        evaluator_type: "llm_as_judge",
        outcome: "platform_error",
        reason: "score_persistence",
      },
    );
  });

  it.each([
    {
      code: CodeEvalDispatcherErrorCodes.USER_CODE_ERROR,
      expected: "customer_error",
    },
    {
      code: CodeEvalDispatcherErrorCodes.TIMEOUT,
      expected: "customer_error",
    },
    {
      code: CodeEvalDispatcherErrorCodes.OUT_OF_MEMORY,
      expected: "customer_error",
    },
    {
      code: CodeEvalDispatcherErrorCodes.LAMBDA_CONCURRENCY_LIMIT,
      expected: "platform_error",
    },
    {
      code: CodeEvalDispatcherErrorCodes.LAMBDA_CONFIGURATION_ERROR,
      expected: "platform_error",
    },
  ])("classifies code terminal errors as $expected", ({ code, expected }) => {
    expect(
      getCodeEvalTerminalErrorOutcome(
        new CodeEvalExecutionError({
          code,
          message: code,
          retryable: false,
        }),
      ),
    ).toBe(expected);
  });
});
