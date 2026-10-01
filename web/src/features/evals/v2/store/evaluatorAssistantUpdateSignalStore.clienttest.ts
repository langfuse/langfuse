import { act, renderHook } from "@testing-library/react";

import {
  evaluatorAssistantUpdateSignalStore,
  useEvaluatorAssistantCodeUpdateSignal,
} from "./evaluatorAssistantUpdateSignalStore";

describe("evaluatorAssistantUpdateSignalStore", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("publishes a temporary code-update signal", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useEvaluatorAssistantCodeUpdateSignal("project-1", "evaluator-1"),
    );

    act(() => {
      evaluatorAssistantUpdateSignalStore.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        surface: "code",
        updateId: "tool-call-1",
      });
    });
    expect(result.current).toBe("tool-call-1");

    act(() => vi.advanceTimersByTime(5_000));
    expect(result.current).toBeNull();
  });
});
