import { describe, expect, it } from "vitest";

import { applyReplayReasoningToPrompt } from "./replayReasoning";

describe("applyReplayReasoningToPrompt", () => {
  it("prepends signed reasoning onto the following assistant message", () => {
    expect(
      applyReplayReasoningToPrompt(
        [
          { role: "user", content: [{ type: "text", text: "List prompts" }] },
          {
            id: "assistant-1",
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "langfuse_listPrompts",
              },
            ],
          },
          {
            role: "tool",
            content: [{ type: "tool-result", toolCallId: "call-1" }],
          },
        ],
        [
          {
            id: "reasoning-1",
            role: "reasoning",
            content: "I'm going through the list of prompts.",
            signature: "bedrock-signature",
          },
          {
            id: "assistant-1",
            role: "assistant",
            content: "",
            toolCalls: [
              {
                id: "call-1",
                type: "function",
                function: {
                  name: "langfuse_listPrompts",
                  arguments: "{}",
                },
              },
            ],
          },
        ],
      ),
    ).toEqual([
      { role: "user", content: [{ type: "text", text: "List prompts" }] },
      {
        id: "assistant-1",
        role: "assistant",
        content: [
          {
            type: "reasoning",
            text: "I'm going through the list of prompts.",
            providerOptions: { bedrock: { signature: "bedrock-signature" } },
          },
          {
            type: "tool-call",
            toolCallId: "call-1",
            toolName: "langfuse_listPrompts",
          },
        ],
      },
      {
        role: "tool",
        content: [{ type: "tool-result", toolCallId: "call-1" }],
      },
    ]);
  });
});
