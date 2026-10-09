import { act, renderHook, waitFor } from "@testing-library/react";

import { getInAppAgentPageContext } from "@/src/features/in-app-agent";
import { performEvaluatorAssistantToolSideEffects } from "@/src/features/evals/v2/fns/performEvaluatorAssistantToolSideEffects";
import { useEvaluatorSamplePageContext } from "@/src/features/evals/v2/hooks/useEvaluatorSamplePageContext";
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

  it("keeps the explicit handoff conversation while page context catches up", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    const setSelectedObservation =
      store.getState().actions.setSelectedObservation;
    type SelectedObservation = Parameters<typeof setSelectedObservation>[0];
    setSelectedObservation({
      id: "observation-1",
      traceId: "trace-1",
      startTime: new Date("2026-09-04T12:00:00.000Z"),
    } as SelectedObservation);
    store.getState().actions.setTestPanelOpen(false);

    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "handoff-conversation",
      observationId: "observation-1",
    });

    const setHasCompletedTestCall = vi.fn();
    const setLastTestRunCostUsd = vi.fn();
    const setRawResultOpen = vi.fn();
    const { result, unmount } = renderHook(() => {
      useEvaluatorSamplePageContext({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        selectedConversationId: "previous-conversation",
        store,
      });
      return useEvaluatorAssistantTestResultSync({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        store,
        setHasCompletedTestCall,
        setLastTestRunCostUsd,
        setRawResultOpen,
      });
    });

    await waitFor(() => {
      expect(getInAppAgentPageContext("project-1")).toHaveLength(1);
    });

    act(() => {
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "live-test-result",
            toolName: "langfuse_testEvaluator",
            toolArguments: {
              evaluatorId: "evaluator-1",
              observationId: "observation-1",
            },
            toolResultContent: JSON.stringify({
              success: true,
              executionTraceId: "trace-1",
            }),
          },
        ],
        projectId: "project-1",
        conversationId: "handoff-conversation",
        source: "live",
        utils: {} as Parameters<
          typeof performEvaluatorAssistantToolSideEffects
        >[0]["utils"],
      });
    });

    await waitFor(() => {
      expect(result.current).toEqual({
        toolCallId: "live-test-result",
        result: {
          success: true,
          executionTraceId: "trace-1",
        },
      });
      expect(store.getState().testPanelOpen).toBe(true);
    });

    unmount();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });
});
