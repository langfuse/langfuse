import { describe, expect, it } from "vitest";
import type {
  NormalizedMessage,
  ToolCallPart,
} from "../../utils/normalized-io";
import { messageKey } from "./comparison";

describe("messageKey", () => {
  it("matches a tool call replayed with execution and provider annotations", () => {
    const call: ToolCallPart = {
      type: "tool-call",
      toolCallId: "call-search",
      toolName: "search",
      input: { query: "Langfuse", limit: 2 },
    };
    const original: NormalizedMessage = {
      role: "assistant",
      source: "output",
      parts: [call],
    };

    for (const providerExecuted of [true, false]) {
      const replay: NormalizedMessage = {
        role: "assistant",
        source: "input",
        parts: [
          {
            ...call,
            input: { limit: 2, query: "Langfuse" },
            toolType: "function",
            providerExecuted,
            providerMetadata: { provider: { id: "executed-search" } },
          },
        ],
      };
      expect(messageKey(replay)).toBe(messageKey(original));
    }
  });

  it("distinguishes changed tool arguments even when they are named like annotations", () => {
    const call: ToolCallPart = {
      type: "tool-call",
      toolCallId: "call-search",
      toolName: "search",
      input: {
        providerExecuted: false,
        providerMetadata: { query: "Langfuse" },
      },
    };
    const original: NormalizedMessage = {
      role: "assistant",
      source: "output",
      parts: [call],
    };

    for (const input of [
      { providerExecuted: true, providerMetadata: { query: "Langfuse" } },
      { providerExecuted: false, providerMetadata: { query: "Other results" } },
    ]) {
      expect(
        messageKey({
          ...original,
          source: "input",
          parts: [{ ...call, input }],
        }),
      ).not.toBe(messageKey(original));
    }
  });
});
