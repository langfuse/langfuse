import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobExecutionStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  blockEvaluator: vi.fn().mockResolvedValue({ blockedEvaluatorIds: [] }),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@langfuse/shared/src/server")>();
  return {
    ...actual,
    blockEvaluator: mocks.blockEvaluator,
    instrumentAsync: vi.fn(
      async (
        _options: { name: string },
        callback: (span: {
          setAttribute: () => unknown;
          setAttributes: () => unknown;
        }) => Promise<unknown>,
      ) => {
        const span = {
          setAttribute: () => span,
          setAttributes: () => span,
        };
        return callback(span);
      },
    ),
  };
});

import {
  createCategoricalEvalOutputDefinition,
  EvalTargetObject,
  EvalTemplateType,
} from "@langfuse/shared";
import {
  EvaluatorBlockSource,
  LLMValidationError,
} from "@langfuse/shared/src/server";
import { UnrecoverableError } from "../../../errors/UnrecoverableError";
import { createMockEvalExecutionDeps } from "../evalExecutionDeps";
import { runDecisionModelEvaluation } from "./runDecisionModelEvaluation";

describe("runDecisionModelEvaluation", () => {
  const projectId = "project-1";
  const jobExecutionId = "job-execution-1";

  beforeEach(() => {
    mocks.blockEvaluator.mockClear();
  });

  const job = {
    id: jobExecutionId,
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId,
    status: JobExecutionStatus.PENDING,
    startTime: new Date(),
    endTime: null,
    jobConfigurationId: "rule-1",
    jobInputTraceId: "trace-1",
    jobInputTraceTimestamp: new Date(),
    jobInputObservationId: "observation-1",
    jobInputDatasetItemId: null,
    jobInputDatasetItemValidFrom: null,
    jobTemplateId: "version-1",
    error: null,
    jobOutputScoreId: null,
    executionTraceId: null,
  };

  const config = {
    id: "rule-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId,
    jobType: "EVAL" as const,
    evalTemplateId: "version-1",
    scoreName: "send_ready",
    targetObject: EvalTargetObject.EVENT,
    filter: [],
    variableMapping: [],
    sampling: "1.0",
    delay: 0,
    status: "ACTIVE" as const,
    blockedAt: null,
    blockReason: null,
    blockMessage: null,
    timeScope: ["NEW" as const],
  };

  const template = {
    id: "version-1",
    createdAt: new Date(),
    updatedAt: new Date(),
    projectId,
    name: "Send readiness",
    version: 1,
    type: EvalTemplateType.DECISION_MODEL,
    prompt: "Is this reply ready to send to the customer?",
    partner: null,
    model: "jev-1.13.0",
    provider: "typesafe",
    modelParams: null,
    vars: [],
    outputDefinition: createCategoricalEvalOutputDefinition({
      scoreDescription: "",
      reasoningDescription: "",
      categories: ["ready", "needs_revision"],
    }),
    sourceCode: null,
    sourceCodeLanguage: null,
  };

  const typeSafeModelConfig = {
    valid: true as const,
    config: {
      provider: "typesafe",
      model: "jev-1.13.0",
      apiKey: { adapter: "typesafe", secretKey: "encrypted" },
      adapter: "typesafe" as never,
      modelParams: {},
    },
  };

  const baseParams = {
    projectId,
    jobExecutionId,
    job: job as never,
    config: config as never,
    template,
    extractedVariables: [
      { var: "input", value: "Can I get a refund?" },
      { var: "output", value: "Yes, unused items within 30 days." },
    ],
    executionMetadata: { job_execution_id: jobExecutionId },
    evaluationContext: {
      evaluationRuleId: "rule-1",
      evaluatorExecutionIsTest: false,
    },
    evaluatorId: "evaluator-1",
  };

  it("writes one categorical score carrying the probability distribution", async () => {
    const callDecisionModel = vi.fn().mockResolvedValue({
      model: "jev-1.13.0",
      answer: {
        type: "choice",
        choice: "ready",
        probabilities: { ready: 0.91, needs_revision: 0.09 },
        confidence: 0.82,
      },
      usage: { inputTokens: 200, outputTokens: 3 },
    });
    const deps = createMockEvalExecutionDeps({
      fetchModelConfig: vi.fn().mockResolvedValue(typeSafeModelConfig),
      callDecisionModel,
    });

    const result = await runDecisionModelEvaluation({ ...baseParams, deps });

    expect(callDecisionModel).toHaveBeenCalledWith({
      modelConfig: typeSafeModelConfig.config,
      state: {
        input: "Can I get a refund?",
        output: "Yes, unused items within 30 days.",
      },
      question: {
        type: "choice",
        instructions: "Is this reply ready to send to the customer?",
        criteria: { ready: null, needs_revision: null },
      },
    });
    expect(result.scores).toEqual([
      {
        name: "send_ready",
        dataType: "CATEGORICAL",
        value: "ready",
        comment:
          "ready (p=0.91) · confidence 0.82 · runner-up needs_revision (0.09) · jev-1.13.0",
        metadata: {
          decisionModel: {
            model: "jev-1.13.0",
            choice: "ready",
            confidence: 0.82,
            probabilities: { ready: 0.91, needs_revision: 0.09 },
          },
        },
      },
    ]);
    expect(mocks.blockEvaluator).not.toHaveBeenCalled();
  });

  it("pauses the evaluator when the connection is not a decision-model connection", async () => {
    const deps = createMockEvalExecutionDeps({
      fetchModelConfig: vi.fn().mockResolvedValue({
        ...typeSafeModelConfig,
        config: {
          ...typeSafeModelConfig.config,
          provider: "openai",
          adapter: "openai" as never,
          apiKey: { adapter: "openai", secretKey: "encrypted" },
        },
      }),
      callDecisionModel: vi.fn(),
    });

    await expect(
      runDecisionModelEvaluation({ ...baseParams, deps }),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.blockEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorId: "evaluator-1",
        source: EvaluatorBlockSource.INVALID_MODEL_CONFIG,
      }),
    );
    expect(deps.callDecisionModel).not.toHaveBeenCalled();
  });

  it("applies the LLM error policy to provider failures", async () => {
    // A connection-level failure pauses the evaluator like an LLM judge would.
    const unreachable = new LLMValidationError({
      code: "endpoint-unreachable",
      message: "Cannot reach TypeSafe",
    });
    const blocked = createMockEvalExecutionDeps({
      fetchModelConfig: vi.fn().mockResolvedValue(typeSafeModelConfig),
      callDecisionModel: vi.fn().mockRejectedValue(unreachable),
    });
    await expect(
      runDecisionModelEvaluation({ ...baseParams, deps: blocked }),
    ).rejects.toBe(unreachable);
    expect(mocks.blockEvaluator).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluatorId: "evaluator-1",
        source: EvaluatorBlockSource.LLM_COMPLETION_ERROR,
      }),
    );

    // Anything else propagates untouched so the queue decides on retries.
    mocks.blockEvaluator.mockClear();
    const transient = new Error("socket hang up");
    const failing = createMockEvalExecutionDeps({
      fetchModelConfig: vi.fn().mockResolvedValue(typeSafeModelConfig),
      callDecisionModel: vi.fn().mockRejectedValue(transient),
    });
    await expect(
      runDecisionModelEvaluation({ ...baseParams, deps: failing }),
    ).rejects.toBe(transient);
    expect(mocks.blockEvaluator).not.toHaveBeenCalled();
  });
});
