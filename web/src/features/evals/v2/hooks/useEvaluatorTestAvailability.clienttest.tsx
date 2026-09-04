import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

import { useEvaluatorTestAvailability } from "./useEvaluatorTestAvailability";

vi.mock("@/src/features/evals/v2/hooks/useEvaluatorSetupSample", () => ({
  useEvaluatorSetupSample: () => ({ id: "sample" }),
}));

describe("useEvaluatorTestAvailability", () => {
  const store = createEvaluatorSetupStore({
    initialEvaluator: null,
    mode: "create",
  });

  beforeEach(() => {
    act(() => {
      store.getState().actions.setType("LLM_AS_JUDGE");
      store.getState().actions.setModelMode("default");
      store
        .getState()
        .actions.setSelectedObservation({ id: "sample" } as never);
    });
  });

  it("blocks LLM evaluator tests when no model is configured", () => {
    const { result, rerender } = renderHook(
      ({ hasValidModel }) =>
        useEvaluatorTestAvailability({
          projectId: "project-1",
          store,
          hasValidModel,
        }),
      { initialProps: { hasValidModel: false } },
    );

    expect(result.current).toBe("Select a model before running a test.");

    rerender({ hasValidModel: true });
    expect(result.current).toBeNull();

    act(() => store.getState().actions.setType("CODE"));
    rerender({ hasValidModel: false });
    expect(result.current).toBeNull();
  });
});
