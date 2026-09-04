import type { api } from "@/src/utils/api";
import { evaluatorAssistantTestResultStore } from "./evaluatorAssistantTestResultStore";
import { performEvaluatorAssistantToolSideEffects } from "./evaluatorToolSideEffects";

type InvalidationUtils = ReturnType<typeof api.useUtils>;

describe("evaluator Assistant tool side effects", () => {
  it("refreshes the updated evaluator only", async () => {
    const evaluatorInvalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evalsV2: { get: { invalidate: evaluatorInvalidate } },
    } as unknown as InvalidationUtils;

    await Promise.all(
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "update-evaluator-1",
            toolName: "langfuse_updateEvaluator",
            toolArguments: '{"evaluatorId":"evaluator-1"}',
          },
          {
            toolCallId: "update-evaluator-2",
            toolName: "langfuse_updateEvaluator",
            toolArguments: '{"evaluatorId":"evaluator-1"}',
          },
        ],
        projectId: "project-1",
        conversationId: "conversation-1",
        utils,
      }),
    );

    expect(evaluatorInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    expect(evaluatorInvalidate).toHaveBeenCalledOnce();
  });

  it("publishes a hydrated evaluator test result for the matching handoff", async () => {
    const result = {
      success: true,
      scores: [{ name: "Non-empty", value: 1, dataType: "BOOLEAN" }],
      executionTraceId: "execution-trace-1",
      durationMs: 25,
    };
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [
        {
          toolCallId: "test-evaluator-1",
          toolName: "langfuse_testEvaluator",
          toolArguments:
            '{"evaluatorId":"evaluator-1","observationId":"observation-1"}',
          toolResultContent: JSON.stringify({
            content: [{ type: "text", text: JSON.stringify(result) }],
          }),
        },
      ],
      projectId: "project-1",
      conversationId: "conversation-1",
      utils: {} as InvalidationUtils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "test-evaluator-1",
      result,
    });
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });

  it("ignores redacted silent evaluator test output", () => {
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: null,
    });

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [
        {
          toolCallId: "silent-test-1",
          toolName: "langfuse_testEvaluator",
          toolArguments: { evaluatorId: "evaluator-1" },
          toolResultContent:
            "Output saved to /workspace/tool_calls/langfuse_testEvaluator_silent-test-1.json",
        },
      ],
      projectId: "project-1",
      conversationId: "conversation-1",
      utils: {} as InvalidationUtils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toBeNull();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });
});
