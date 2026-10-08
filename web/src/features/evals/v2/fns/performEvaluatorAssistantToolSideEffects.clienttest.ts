import type { api } from "@/src/utils/api";
import { evaluatorAssistantTestResultStore } from "../store/evaluatorAssistantTestResultStore";
import { evaluatorAssistantUpdateSignalStore } from "../store/evaluatorAssistantUpdateSignalStore";
import { registerEvaluatorWorkbenchFilter } from "../store/evaluatorWorkbenchFilterRegistry";
import { performEvaluatorAssistantToolSideEffects } from "./performEvaluatorAssistantToolSideEffects";

type InvalidationUtils = ReturnType<typeof api.useUtils>;

describe("evaluator Assistant tool side effects", () => {
  it("applies live workbench filters without replaying hydrated history", () => {
    const apply = vi.fn();
    const unregister = registerEvaluatorWorkbenchFilter(
      "project-1",
      "evaluator-1",
      apply,
    );
    const toolCall = {
      toolCallId: "set-filter-1",
      toolName: "langfuse_setEvaluatorWorkbenchFilter",
      toolArguments: {
        evaluatorId: "evaluator-1",
        filter: [
          {
            type: "stringOptions",
            column: "type",
            operator: "any of",
            value: ["GENERATION"],
          },
        ],
      },
    };

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [toolCall],
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "live",
      utils: {} as InvalidationUtils,
    });
    performEvaluatorAssistantToolSideEffects({
      toolCalls: [{ ...toolCall, toolCallId: "set-filter-history" }],
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "hydrated",
      utils: {} as InvalidationUtils,
    });

    expect(apply).toHaveBeenCalledOnce();
    unregister();
  });

  it("gracefully ignores a workbench filter when its UI is absent", () => {
    expect(() =>
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "set-filter-absent",
            toolName: "langfuse_setEvaluatorWorkbenchFilter",
            toolArguments: {
              evaluatorId: "evaluator-absent",
              filter: [],
            },
          },
        ],
        projectId: "project-1",
        conversationId: "conversation-1",
        source: "live",
        utils: {} as InvalidationUtils,
      }),
    ).not.toThrow();
  });

  it("refreshes the updated evaluator only", async () => {
    const evaluatorInvalidate = vi.fn(() => Promise.resolve());
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );
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
        source: "live",
        utils,
      }),
    );

    expect(evaluatorInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    expect(evaluatorInvalidate).toHaveBeenCalledOnce();
    expect(publishUpdate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      surface: "code",
      updateId: "update-evaluator-2",
    });
    publishUpdate.mockRestore();
  });

  it("highlights judge prompt updates on the prompt surface", async () => {
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );
    const utils = {
      evalsV2: { get: { invalidate: vi.fn(() => Promise.resolve()) } },
    } as unknown as InvalidationUtils;

    await Promise.all(
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "update-judge-1",
            toolName: "langfuse_updateEvaluator",
            toolArguments: {
              evaluatorId: "evaluator-1",
              type: "LLM_AS_JUDGE",
            },
          },
        ],
        projectId: "project-1",
        conversationId: "conversation-1",
        source: "live",
        utils,
      }),
    );

    expect(publishUpdate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      surface: "prompt",
      updateId: "update-judge-1",
    });
    publishUpdate.mockRestore();
  });

  it("does not refresh or highlight failed evaluator updates", async () => {
    const evaluatorInvalidate = vi.fn(() => Promise.resolve());
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );
    const utils = {
      evalsV2: { get: { invalidate: evaluatorInvalidate } },
    } as unknown as InvalidationUtils;

    await Promise.all(
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "failed-update",
            toolName: "langfuse_updateEvaluator",
            toolArguments: {
              evaluatorId: "evaluator-1",
              type: "LLM_AS_JUDGE",
            },
            toolError: { message: "Invalid prompt messages" },
          },
        ],
        projectId: "project-1",
        conversationId: "conversation-1",
        source: "live",
        utils,
      }),
    );

    expect(evaluatorInvalidate).not.toHaveBeenCalled();
    expect(publishUpdate).not.toHaveBeenCalled();
    publishUpdate.mockRestore();
  });

  it("does not replay highlights for hydrated historical updates", async () => {
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );
    const utils = {
      evalsV2: { get: { invalidate: vi.fn(() => Promise.resolve()) } },
    } as unknown as InvalidationUtils;

    await Promise.all(
      performEvaluatorAssistantToolSideEffects({
        toolCalls: [
          {
            toolCallId: "historical-update",
            toolName: "langfuse_updateEvaluator",
            toolArguments: '{"evaluatorId":"evaluator-1"}',
          },
        ],
        projectId: "project-1",
        conversationId: "conversation-1",
        source: "hydrated",
        utils,
      }),
    );

    expect(publishUpdate).not.toHaveBeenCalled();
    publishUpdate.mockRestore();
  });

  it("publishes an evaluator test result for the matching handoff", async () => {
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );
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
      source: "live",
      utils: {} as InvalidationUtils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "test-evaluator-1",
      result,
    });
    expect(publishUpdate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      surface: "test",
      updateId: "test-evaluator-1",
    });

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [
        {
          toolCallId: "test-evaluator-2",
          toolName: "langfuse_testEvaluator",
          toolArguments: {
            evaluatorId: "evaluator-1",
            observationId: "observation-1",
          },
          toolResultContent: JSON.stringify({
            success: true,
            scores: [{ name: "Non-empty", value: 0, dataType: "BOOLEAN" }],
          }),
        },
      ],
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "live",
      utils: {} as InvalidationUtils,
    });

    expect(publishUpdate).toHaveBeenCalledTimes(2);
    expect(publishUpdate).toHaveBeenLastCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      surface: "test",
      updateId: "test-evaluator-2",
    });
    publishUpdate.mockRestore();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });

  it("publishes a tool error when validation fails before observation arguments are available", () => {
    evaluatorAssistantTestResultStore.expect({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
      conversationId: "conversation-1",
      observationId: "observation-1",
    });

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [
        {
          toolCallId: "failed-test",
          toolName: "langfuse_testEvaluator",
          toolArguments: { evaluatorId: "evaluator-1" },
          toolError:
            "Validation failed: observationId: Invalid input: expected string",
        },
      ],
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "live",
      utils: {} as InvalidationUtils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toEqual({
      toolCallId: "failed-test",
      result: {
        requestError:
          "Validation failed: observationId: Invalid input: expected string",
      },
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
      source: "live",
      utils: {} as InvalidationUtils,
    });

    expect(
      evaluatorAssistantTestResultStore.get("project-1", "evaluator-1"),
    ).toBeNull();
    evaluatorAssistantTestResultStore.clear("project-1", "evaluator-1");
  });

  it("does not highlight a test result rejected by the handoff store", () => {
    const publishUpdate = vi.spyOn(
      evaluatorAssistantUpdateSignalStore,
      "publish",
    );

    performEvaluatorAssistantToolSideEffects({
      toolCalls: [
        {
          toolCallId: "unmatched-test",
          toolName: "langfuse_testEvaluator",
          toolArguments: {
            evaluatorId: "unmatched-evaluator",
            observationId: "observation-1",
          },
          toolResultContent: JSON.stringify({ success: true }),
        },
      ],
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "live",
      utils: {} as InvalidationUtils,
    });

    expect(publishUpdate).not.toHaveBeenCalled();
    publishUpdate.mockRestore();
  });
});
