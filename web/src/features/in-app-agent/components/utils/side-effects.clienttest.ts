import { performToolSideEffectsForCompletedToolCalls } from "./side-effects";

type InvalidationUtils = Parameters<
  typeof performToolSideEffectsForCompletedToolCalls
>[0]["utils"];

describe("in-app agent tool side effects", () => {
  it("refreshes legacy and v2 evaluator views after an evaluator update", async () => {
    const evalsInvalidate = vi.fn(() => Promise.resolve());
    const evalsV2Invalidate = vi.fn(() => Promise.resolve());
    const modelsInvalidate = vi.fn(() => Promise.resolve());
    const utils = {
      evals: { invalidate: evalsInvalidate },
      evalsV2: { invalidate: evalsV2Invalidate },
      models: { invalidate: modelsInvalidate },
    } as unknown as InvalidationUtils;

    await performToolSideEffectsForCompletedToolCalls({
      toolCalls: [
        {
          toolCallId: "update-evaluator-1",
          toolName: "langfuse_updateEvaluator",
        },
      ],
      handledToolCallIds: new Set(),
      utils,
    });

    expect(evalsInvalidate).toHaveBeenCalledOnce();
    expect(evalsV2Invalidate).toHaveBeenCalledOnce();
    expect(modelsInvalidate).toHaveBeenCalledOnce();
  });
});
