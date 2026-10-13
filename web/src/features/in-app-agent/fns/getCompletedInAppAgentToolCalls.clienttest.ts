import { describe, expect, it } from "vitest";
import type { AgUiMessage } from "@langfuse/shared/in-app-agent";

import { getCompletedInAppAgentToolCalls } from "./getCompletedInAppAgentToolCalls";

describe("getCompletedInAppAgentToolCalls", () => {
  it("pairs durable tool calls with their arguments and results", () => {
    const messages = [
      {
        id: "assistant",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-call",
            type: "function",
            function: {
              name: "langfuse_testEvaluator",
              arguments: '{"evaluatorId":"evaluator"}',
            },
          },
        ],
      },
      {
        id: "tool-result",
        role: "tool",
        toolCallId: "tool-call",
        content: '{"success":true}',
      },
    ] satisfies AgUiMessage[];

    expect(getCompletedInAppAgentToolCalls(messages)).toEqual([
      {
        toolCallId: "tool-call",
        toolName: "langfuse_testEvaluator",
        toolArguments: '{"evaluatorId":"evaluator"}',
        toolResultContent: '{"success":true}',
        toolError: undefined,
      },
    ]);
  });

  it("omits tool calls without a durable result", () => {
    const messages = [
      {
        id: "assistant",
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "tool-call",
            type: "function",
            function: { name: "langfuse_testEvaluator", arguments: "{}" },
          },
        ],
      },
    ] satisfies AgUiMessage[];

    expect(getCompletedInAppAgentToolCalls(messages)).toEqual([]);
  });
});
