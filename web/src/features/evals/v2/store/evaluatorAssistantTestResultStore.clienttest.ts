import { createEvaluatorAssistantTestResultStore } from "./evaluatorAssistantTestResultStore";

describe("evaluatorAssistantTestResultStore", () => {
  it("ignores results from conversations without an active handoff", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "new-conversation",
      observationId: "observation-1",
    });

    expect(
      store.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "old-conversation",
        observationId: "observation-1",
        toolCallId: "old-tool-call",
        result: { success: true },
      }),
    ).toBe(false);

    expect(store.get("project-1", "evaluator-1")).toBeNull();
    store.clear("project-1", "evaluator-1");
  });

  it("does not let workbench page-context updates overwrite the active handoff sample", () => {
    const store = createEvaluatorAssistantTestResultStore();
    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "handoff-observation",
    });

    store.expectFromPageContext({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "newly-selected-observation",
    });

    expect(
      store.publish({
        projectId: "project-1",
        evaluatorId: "evaluator-1",
        conversationId: "conversation-1",
        observationId: "handoff-observation",
        toolCallId: "handoff-test",
        result: { success: true },
      }),
    ).toBe(true);
    expect(store.get("project-1", "evaluator-1")).toEqual({
      toolCallId: "handoff-test",
      result: { success: true },
    });
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

  it("keeps the displayed result while changing the expected sample", () => {
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
      toolCallId: "first-test",
      result: { count: 16 },
    });

    const publishedWithoutRefresh = store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-2",
      toolCallId: "second-test-before-refresh",
      result: { count: 43 },
    });

    store.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-2",
    });
    const resultAfterExpectationRefresh = store.get("project-1", "evaluator-1");

    const publishedAfterRefresh = store.publish({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-2",
      toolCallId: "second-test-after-refresh",
      result: { count: 43 },
    });

    expect(publishedWithoutRefresh).toBe(false);
    expect(resultAfterExpectationRefresh).toEqual({
      toolCallId: "first-test",
      result: { count: 16 },
    });
    expect(publishedAfterRefresh).toBe(true);
    expect(store.get("project-1", "evaluator-1")).toEqual({
      toolCallId: "second-test-after-refresh",
      result: { count: 43 },
    });
    store.clear("project-1", "evaluator-1");
  });
});
