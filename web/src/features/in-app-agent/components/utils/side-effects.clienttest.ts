import type { AgUiMessage } from "@langfuse/shared/in-app-agent";
import {
  getCompletedToolCalls,
  performToolSideEffectsForCompletedToolCalls,
} from "./side-effects";

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
      utils,
    });

    expect(evalsInvalidate).toHaveBeenCalledOnce();
    expect(evaluatorInvalidate).toHaveBeenCalledWith({
      projectId: "project-1",
      evaluatorId: "evaluator-1",
    });
    expect(modelsInvalidate).toHaveBeenCalledOnce();
  });
});
