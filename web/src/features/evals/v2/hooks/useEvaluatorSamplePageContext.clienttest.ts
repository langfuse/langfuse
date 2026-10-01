import { act, renderHook, waitFor } from "@testing-library/react";

import { getInAppAgentPageContext } from "@/src/features/in-app-agent";
import { createEvaluatorSetupStore } from "@/src/features/evals/v2/store/evaluatorSetupStore/evaluatorSetupStore";
import { evaluatorAssistantTestResultStore } from "@/src/features/evals/v2/store/evaluatorAssistantTestResultStore";
import { useEvaluatorSamplePageContext } from "./useEvaluatorSamplePageContext";

describe("useEvaluatorSamplePageContext", () => {
  it("registers the current sample and cleans it up on unmount", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    const { unmount } = renderHook(() =>
      useEvaluatorSamplePageContext({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        selectedConversationId: undefined,
        store,
      }),
    );
    const setSelectedObservation =
      store.getState().actions.setSelectedObservation;
    type SelectedObservation = Parameters<typeof setSelectedObservation>[0];

    act(() => {
      setSelectedObservation({
        id: "observation-1",
        traceId: "trace-1",
        startTime: new Date("2026-09-04T12:00:00.000Z"),
      } as SelectedObservation);
    });

    await waitFor(() => {
      expect(getInAppAgentPageContext("project-1")).toContainEqual({
        description: "selected_evaluator_sample",
        value:
          '{"projectId":"project-1","evaluatorId":"evaluator-1","observationId":"observation-1","traceId":"trace-1","startTime":"2026-09-04T12:00:00.000Z"}',
      });
    });

    unmount();
    expect(getInAppAgentPageContext("project-1")).toEqual([]);
  });

  it("refreshes the active conversation expectation when the sample changes", async () => {
    const store = createEvaluatorSetupStore({
      initialEvaluator: null,
      initialType: "CODE",
      mode: "create",
    });
    const setSelectedObservation =
      store.getState().actions.setSelectedObservation;
    type SelectedObservation = Parameters<typeof setSelectedObservation>[0];
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });
    evaluatorAssistantTestResultStore.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
      toolCallId: "first-test",
      result: { count: 16 },
    });
    const { unmount } = renderHook(() =>
      useEvaluatorSamplePageContext({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        selectedConversationId: "conversation-1",
        store,
      }),
    );

    act(() => {
      setSelectedObservation({
        id: "observation-2",
        traceId: "trace-2",
        startTime: new Date("2026-09-04T13:00:00.000Z"),
      } as SelectedObservation);
    });

    await waitFor(() => {
      expect(getInAppAgentPageContext("project-1")).toContainEqual({
        description: "selected_evaluator_sample",
        value:
          '{"projectId":"project-1","evaluatorId":"evaluator-1","observationId":"observation-2","traceId":"trace-2","startTime":"2026-09-04T13:00:00.000Z"}',
      });
    });
    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "first-test",
      result: { count: 16 },
    });

    expect(
      evaluatorAssistantTestResultStore.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "conversation-1",
        observationId: "observation-2",
        toolCallId: "second-test",
        result: { count: 43 },
      }),
    ).toBe(true);
    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "second-test",
      result: { count: 43 },
    });

    unmount();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });
});
