import { act, renderHook } from "@testing-library/react";
import {
  createEvaluatorAssistantTestResultStore,
  evaluatorAssistantTestResultStore,
  useEvaluatorAssistantTestResult,
} from "./evaluatorAssistantTestResultStore";

describe("evaluatorAssistantTestResultStore", () => {
  it("publishes the latest result per evaluator and notifies subscribers", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });
    const listener = vi.fn();
    store.subscribe(listener);

    store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
      toolCallId: "tool-call-1",
      result: { success: true, scores: [] },
    });

    expect(listener).toHaveBeenCalledOnce();
    expect(store.get("project-1", "evaluator-1")).toEqual({
      toolCallId: "tool-call-1",
      result: { success: true, scores: [] },
    });
    expect(store.get("project-1", "evaluator-2")).toBeNull();
    store.clear("project-1", "evaluator-1");
  });

  it("clears a consumed evaluator result", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: null,
    });
    store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: null,
      toolCallId: "tool-call-1",
      result: { success: true },
    });

    store.clear("project-1", "evaluator-1");

    expect(store.get("project-1", "evaluator-1")).toBeNull();
  });

  it("updates evaluator page subscribers when a result arrives", () => {
    const { result } = renderHook(() =>
      useEvaluatorAssistantTestResult("project-1", "evaluator-1"),
    );

    act(() => {
      evaluatorAssistantTestResultStore.expect({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "conversation-1",
        observationId: null,
      });
      evaluatorAssistantTestResultStore.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "conversation-1",
        observationId: null,
        toolCallId: "tool-call-1",
        result: { success: true, executionTraceId: "trace-1" },
      });
    });

    expect(result.current).toEqual({
      toolCallId: "tool-call-1",
      result: { success: true, executionTraceId: "trace-1" },
    });
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });

  it("ignores results from conversations without an active handoff", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "new-conversation",
      observationId: "observation-1",
    });

    store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "old-conversation",
      observationId: "observation-1",
      toolCallId: "old-tool-call",
      result: { success: true },
    });

    expect(store.get("project-1", "evaluator-1")).toBeNull();
    store.clear("project-1", "evaluator-1");
  });

  it("keeps the latest retry result from the expected conversation", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });
    store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
      toolCallId: "failed-test",
      result: { success: false },
    });
    store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
      toolCallId: "successful-retry",
      result: { success: true },
    });

    expect(store.get("project-1", "evaluator-1")).toEqual({
      toolCallId: "successful-retry",
      result: { success: true },
    });
    store.clear("project-1", "evaluator-1");
  });
});
