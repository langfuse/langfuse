import type { AgUiMessage } from "@langfuse/shared/in-app-agent";
import {
  getCompletedToolCalls,
  performToolSideEffectsForCompletedToolCalls,
} from "./side-effects";
import { evaluatorAssistantTestResultStore } from "@/src/features/evals/v2/store/evaluatorAssistantTestResultStore";

type InvalidationUtils = Parameters<
  typeof performToolSideEffectsForCompletedToolCalls
>[0]["utils"];

describe("in-app agent tool side effects", () => {
  it("refreshes legacy and v2 evaluator views after an evaluator update", async () => {
    const evalsInvalidate = vi.fn(() => Promise.resolve());
    const evaluatorInvalidate = vi.fn(() => Promise.resolve());
    const modelsInvalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evals: { invalidate: evalsInvalidate },
      evalsV2: { get: { invalidate: evaluatorInvalidate } },
      models: { invalidate: modelsInvalidate },
    } as unknown as InvalidationUtils;
    const messages = [
      {
        id: "update-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "update-evaluator-1",
            type: "function",
            function: {
              name: "langfuse_updateEvaluator",
              arguments: '{"evaluatorId":"evaluator-1"}',
            },
          },
        ],
      },
      {
        id: "update-result",
        role: "tool",
        toolCallId: "update-evaluator-1",
        content: '{"id":"evaluator-1"}',
      },
    ] satisfies AgUiMessage[];

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: getCompletedToolCalls(messages),
      handledToolCallIds: new Set(),
      projectId: "project-1",
      conversationId: "conversation-1",
      utils,
    });

    expect(evalsInvalidate).toHaveBeenCalledOnce();
    expect(evaluatorInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    expect(modelsInvalidate).toHaveBeenCalledOnce();
  });

  it("publishes a hydrated evaluator test result for the matching evaluator", async () => {
    const result = {
      success: true,
      scores: [{ name: "Non-empty", value: 1, dataType: "BOOLEAN" }],
      executionTraceId: "execution-trace-1",
      durationMs: 25,
    };
    const messages = [
      {
        id: "test-call",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "test-evaluator-1",
            type: "function",
            function: {
              name: "langfuse_testEvaluator",
              arguments:
                '{"evaluatorId":"evaluator-1","observationId":"observation-1"}',
            },
          },
        ],
      },
      {
        id: "test-result",
        role: "tool",
        toolCallId: "test-evaluator-1",
        content: JSON.stringify(result),
      },
    ] satisfies AgUiMessage[];
    const invalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evals: { invalidate },
      evalsV2: { invalidate },
    } as unknown as InvalidationUtils;
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: getCompletedToolCalls(messages),
      handledToolCallIds: new Set(),
      projectId: "project-1",
      conversationId: "conversation-1",
      utils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "test-evaluator-1",
      result,
    });
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });

  it("ignores redacted silent evaluator test output", async () => {
    const invalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evals: { invalidate },
      evalsV2: { invalidate },
    } as unknown as InvalidationUtils;
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: null,
    });

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: [
        {
          toolCallId: "silent-test-1",
          toolName: "langfuse_testEvaluator",
          toolArguments: { evaluatorId: "evaluator-1" },
          toolResultContent:
            "Output saved to /workspace/tool_calls/langfuse_testEvaluator_silent-test-1.json",
        },
      ],
      handledToolCallIds: new Set(),
      projectId: "project-1",
      conversationId: "conversation-1",
      utils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toBeNull();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });
});
