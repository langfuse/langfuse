import type { NormalizedIOFixture } from "../../fixture-types";

/** Synthetic passthrough case adapted from useChatMLParser.clienttest.ts. */
export const rawPassthroughToolCallsFixture = {
  name: "normalizes raw passthrough tool-call aliases",
  spanIO: {
    input: {
      messages: [{ role: "system", content: "Use tools when needed." }],
      tools: [
        { name: "search", parameters: { type: "object" } },
        { name: "lookup", parameters: { type: "object" } },
      ],
    },
    output: {
      tool_calls: [
        {
          id: "call_search_001",
          toolName: "search",
          input: { query: "documentation" },
        },
        {
          id: "call_lookup_001",
          toolName: "lookup",
          args: { identifier: "synthetic-record" },
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "Use tools when needed." }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "call_search_001",
            toolName: "search",
            input: { query: "documentation" },
          },
          {
            type: "tool-call",
            toolCallId: "call_lookup_001",
            toolName: "lookup",
            input: { identifier: "synthetic-record" },
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "search",
        description: undefined,
        inputSchema: { type: "object" },
        type: undefined,
        providerMetadata: undefined,
      },
      {
        name: "lookup",
        description: undefined,
        inputSchema: { type: "object" },
        type: undefined,
        providerMetadata: undefined,
      },
    ],
  },
} satisfies NormalizedIOFixture;
