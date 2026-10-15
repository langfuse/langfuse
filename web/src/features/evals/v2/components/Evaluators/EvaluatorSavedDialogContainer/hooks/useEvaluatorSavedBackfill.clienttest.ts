import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { INTERNAL_EVALUATION_ENVIRONMENT_FILTERS } from "@/src/features/evals/v2/constants/experimentAndEvalFilters";
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

describe("useEvaluatorSavedBackfill", () => {
  it("excludes internal evaluation environments from the estimate and the backfill run", async () => {
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

    expect(mocks.estimate).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: [...scope.filter, ...INTERNAL_EVALUATION_ENVIRONMENT_FILTERS],
      }),
    );
    expect(mocks.runEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        query: expect.objectContaining({
          filter: expect.arrayContaining([
            ...scope.filter,
            ...INTERNAL_EVALUATION_ENVIRONMENT_FILTERS,
          ]),
        }),
      }),
    );
  });
});
