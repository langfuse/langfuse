import { TopicsTargetObject } from "@langfuse/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuleSetupStore } from "@/src/features/evals/v2/stores/createRuleSetupStore";
import { useRuleCostEstimate } from "./useRuleCostEstimate";

const mocks = vi.hoisted(() => ({ estimate: vi.fn().mockResolvedValue([]) }));

vi.mock("@/src/utils/api", () => ({
  api: {
    evalsV2: {
      activationCostEstimates: {
        useMutation: () => ({ mutateAsync: mocks.estimate }),
      },
    },
  },
}));

describe("useRuleCostEstimate", () => {
  afterEach(() => vi.useRealTimers());

  it("does not estimate trace rules", () => {
    vi.useFakeTimers();
    const store = createRuleSetupStore(
      {
        name: "Trace rule",
        filter: [],
        sampling: 1,
        assignments: [
          {
            evaluatorId: "judge",
            evaluatorName: "Judge",
            evaluatorType: "LLM_AS_JUDGE",
            defaultVariableMapping: [],
            variableMapping: null,
          },
        ],
      },
      { targetObject: TopicsTargetObject },
    );

    const { result } = renderHook(() =>
      useRuleCostEstimate({ projectId: "project-1", store }),
    );
    vi.advanceTimersByTime(1_000);

    expect(mocks.estimate).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({
      status: "idle",
      estimates: [],
      estimatingEvaluatorIds: [],
    });
  });
});
