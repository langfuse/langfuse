import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LangfuseInternalTraceEnvironment } from "@langfuse/shared";
import { useEvaluatorSavedBackfill } from "./useEvaluatorSavedBackfill";

const mocks = vi.hoisted(() => ({
  estimate: vi
    .fn()
    .mockResolvedValue([
      { evaluatorId: "evaluator-1", matchingObservations: 20 },
    ]),
  runEvaluation: vi.fn().mockResolvedValue({ id: "batch-action-1" }),
}));

vi.mock("@/src/utils/api", () => ({
  api: {
    useUtils: () => ({
      client: {
        evalsV2: {
          activationCostEstimates: { mutate: mocks.estimate },
        },
      },
    }),
    batchAction: {
      runEvaluation: {
        create: {
          useMutation: () => ({
            mutateAsync: mocks.runEvaluation,
            isPending: false,
          }),
        },
      },
    },
  },
}));

vi.mock("@/src/utils/trpcErrorToast", () => ({
  trpcErrorToast: vi.fn(),
}));

const excludedEnvironments = (filter: unknown[]) =>
  filter.flatMap((condition) => {
    const { column, operator, value } = condition as {
      column: string;
      operator: string;
      value: unknown;
    };
    return column === "environment" && operator === "none of"
      ? (value as string[])
      : [];
  });

describe("useEvaluatorSavedBackfill", () => {
  it("excludes the environments eval execution rejects from the estimate and the backfill run", async () => {
    const scope = {
      filter: [
        {
          column: "type",
          type: "stringOptions" as const,
          operator: "any of" as const,
          value: ["GENERATION"],
        },
      ],
      sampling: 1,
    };
    const { result } = renderHook(() =>
      useEvaluatorSavedBackfill({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        claimMissingCostTest: () => false,
        resetMissingCostTest: vi.fn(),
      }),
    );

    await act(async () => result.current.setEnabled(true, scope));
    await act(() =>
      result.current.schedule(scope, result.current.executionRange),
    );

    const estimateFilter = mocks.estimate.mock.calls[0]![0].filter;
    const runFilter = mocks.runEvaluation.mock.calls[0]![0].query.filter;
    for (const filter of [estimateFilter, runFilter]) {
      expect(filter).toEqual(expect.arrayContaining(scope.filter));
      expect(excludedEnvironments(filter)).toEqual(
        expect.arrayContaining([
          LangfuseInternalTraceEnvironment.LLMJudge,
          LangfuseInternalTraceEnvironment.CodeEval,
          "llm-as-a-judge",
        ]),
      );
      expect(excludedEnvironments(filter)).not.toContain(
        LangfuseInternalTraceEnvironment.PromptExperiments,
      );
    }
  });
});
