import { TopicsTargetObject } from "@langfuse/shared";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";

import { useEvaluatorPromptSample } from "./useEvaluatorPromptSample";

const observationSample = { input: "observation input" };
const traceSample = { threads: [{ messages: [] }] };

vi.mock("@/src/features/evals/v2/hooks/useEvaluatorSetupSample", () => ({
  useEvaluatorSetupSample: () => observationSample,
}));

vi.mock("@/src/features/evals/v2/hooks/useEvaluatorTraceSample", () => ({
  useEvaluatorTraceSample: () => ({ sourceObject: traceSample }),
}));

describe("useEvaluatorPromptSample", () => {
  it("reads the trace transcript on trace messages", () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      mode: "create",
    });
    const { result, rerender } = renderHook(() =>
      useEvaluatorPromptSample({ projectId: "project-1", store }),
    );
    expect(result.current).toBe(observationSample);

    store.getState().actions.setTargetObject(TopicsTargetObject);
    rerender();
    expect(result.current).toBe(traceSample);
  });
});
