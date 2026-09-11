import { performToolSideEffectsForCompletedToolCalls } from "./side-effects";

type InvalidationUtils = Parameters<
  typeof performToolSideEffectsForCompletedToolCalls
>[0]["utils"];

describe("in-app agent tool side-effect dispatch", () => {
  it("combines generic invalidations with feature-specific effects", async () => {
    const evalsInvalidate = vi.fn(() => Promise.resolve());
    const modelsInvalidate = vi.fn(() => Promise.resolve());
    const evaluatorInvalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evals: { invalidate: evalsInvalidate },
      models: { invalidate: modelsInvalidate },
      evalsV2: { get: { invalidate: evaluatorInvalidate } },
    } as unknown as InvalidationUtils;

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: [
        {
          toolCallId: "update-evaluator-1",
          toolName: "langfuse_updateEvaluator",
          toolArguments: '{"evaluatorId":"evaluator-1"}',
        },
      ],
      handledToolCallIds: new Set(),
      projectId: "project-1",
      conversationId: "conversation-1",
      source: "live",
      utils,
    });

    expect(evalsInvalidate).toHaveBeenCalledOnce();
    expect(modelsInvalidate).toHaveBeenCalledOnce();
    expect(evaluatorInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
  });
});
