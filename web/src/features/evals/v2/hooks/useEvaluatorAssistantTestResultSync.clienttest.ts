import { act, renderHook, waitFor } from "@testing-library/react";

import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { evaluatorAssistantTestResultStore } from "../store/evaluatorAssistantTestResultStore";
import { useEvaluatorAssistantTestResultSync } from "./useEvaluatorAssistantTestResultSync";

describe("useEvaluatorAssistantTestResultSync", () => {
  it("opens the panel and keeps the result across evaluator remounts", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    store.getState().actions.setTestPanelOpen(false);
    const setHasCompletedTestCall = vi.fn();
    const setLastTestRunCostUsd = vi.fn();
    const setRawResultOpen = vi.fn();
    const useTestResultSync = () =>
      useEvaluatorAssistantTestResultSync({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        store,
        setHasCompletedTestCall,
        setLastTestRunCostUsd,
        setRawResultOpen,
      });
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });
    const firstMount = renderHook(useTestResultSync);
    const result = {
      success: true,
      executionTraceId: "trace-1",
      estimatedCostUsd: 0.01,
    };

    act(() => {
      evaluatorAssistantTestResultStore.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "conversation-1",
        observationId: "observation-1",
        toolCallId: "tool-call-1",
        result,
      });
    });

    await waitFor(() => {
      expect(firstMount.result.current?.result).toEqual(result);
      expect(store.getState().testPanelOpen).toBe(true);
    });
    expect(setHasCompletedTestCall).toHaveBeenCalledWith(true);
    expect(setLastTestRunCostUsd).toHaveBeenCalledWith(0.01);
    expect(setRawResultOpen).toHaveBeenCalledWith(false);

    firstMount.unmount();
    const secondMount = renderHook(useTestResultSync);
    expect(secondMount.result.current?.result).toEqual(result);

    secondMount.unmount();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });
});
