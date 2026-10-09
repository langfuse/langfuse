import { describe, expect, it, vi } from "vitest";
import type { EvalExecutionDeps } from "./evalExecutionDeps";
import {
  completeEvalExecution,
  type EvalExecutionResult,
} from "./evalCompletion";

vi.mock("@langfuse/shared/src/server", () => ({
  buildDeterministicEvalScoreIds: ({ scores }: { scores: Array<unknown> }) =>
    scores.map((_, index) => `score-${index}`),
  eventTypes: { SCORE_CREATE: "score-create" },
  logger: { debug: vi.fn(), error: vi.fn() },
  traceException: vi.fn(),
}));

const result = {
  scores: [{ name: "quality", dataType: "NUMERIC", value: 0.9 }],
  executionTraceId: "execution-trace-id",
  metadata: {},
  evaluationContext: { evaluatorExecutionIsTest: false },
} satisfies EvalExecutionResult;

const completionParams = {
  projectId: "project-id",
  jobExecutionId: "job-execution-id",
  traceId: "trace-id",
  observationId: "observation-id",
  environment: "default",
};

function createDeps(overrides: Partial<EvalExecutionDeps> = {}) {
  return {
    updateJobExecution: vi.fn(async () => {}),
    uploadScore: vi.fn(async () => {}),
    enqueueScoreIngestion: vi.fn(async () => {}),
    callLLM: vi.fn(),
    fetchModelConfig: vi.fn(),
    callDecisionModel: vi.fn(),
    writeInternalTrace: vi.fn(),
    ...overrides,
  } as EvalExecutionDeps;
}

describe("completeEvalExecution", () => {
  it("notifies evaluator completion after persisting scores", async () => {
    const calls: string[] = [];
    const deps = createDeps({
      uploadScore: async () => {
        calls.push("upload");
      },
      enqueueScoreIngestion: async () => {
        calls.push("enqueue");
      },
      updateJobExecution: async () => {
        calls.push("complete");
      },
    });

    await completeEvalExecution({
      ...completionParams,
      result,
      deps,
      onEvaluatorCompleted: async () => {
        calls.push("notify");
      },
    });

    expect(calls).toEqual(["upload", "enqueue", "notify", "complete"]);
  });

  it("does not notify evaluator completion for editor tests", async () => {
    const onEvaluatorCompleted = vi.fn();

    await completeEvalExecution({
      ...completionParams,
      result: {
        ...result,
        evaluationContext: { evaluatorExecutionIsTest: true },
      },
      deps: createDeps(),
      onEvaluatorCompleted,
    });

    expect(onEvaluatorCompleted).not.toHaveBeenCalled();
  });

  it("marks the execution complete when downstream scheduling fails", async () => {
    const updateJobExecution = vi.fn();

    await expect(
      completeEvalExecution({
        ...completionParams,
        result,
        deps: createDeps({ updateJobExecution }),
        onEvaluatorCompleted: async () => {
          throw new Error("notification failed");
        },
      }),
    ).resolves.toEqual({ scoreCount: 1 });

    expect(updateJobExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "COMPLETED",
        }),
      }),
    );
  });
});
