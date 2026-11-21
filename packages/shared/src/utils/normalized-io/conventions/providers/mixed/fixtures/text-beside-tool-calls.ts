import type { NormalizedIOFixture } from "../../fixture-types";

const expectedMessages = [
  {
    role: "assistant" as const,
    parts: [
      { type: "text" as const, text: "Let me look that up." },
      {
        type: "tool-call" as const,
        toolCallId: "call_search_001",
        toolName: "search_docs",
        input: { query: "refund policy" },
      },
    ],
    source: "output" as const,
  },
];

const toolCalls = [
  {
    toolCallId: "call_search_001",
    toolName: "search_docs",
    args: { query: "refund policy" },
  },
];

/** Result objects that carry the answer under `text`, not `content`. */
export const textBesideToolCallsFixtures = [
  {
    name: "keeps top-level text beside toolCalls",
    spanIO: {
      input: undefined,
      output: { text: "Let me look that up.", toolCalls },
      metadata: undefined,
    },
    expected: { messages: expectedMessages, toolDefinitions: [] },
  },
  {
    name: "keeps top-level text beside tool_calls",
    spanIO: {
      input: undefined,
      output: { text: "Let me look that up.", tool_calls: toolCalls },
      metadata: undefined,
    },
    expected: { messages: expectedMessages, toolDefinitions: [] },
  },
] satisfies NormalizedIOFixture[];
