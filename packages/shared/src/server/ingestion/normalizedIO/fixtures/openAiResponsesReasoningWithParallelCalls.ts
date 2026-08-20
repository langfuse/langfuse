import type { NormalizedIOFixture } from "./types";

const callId1 = "call_r1";
const callId2 = "call_r2";

const toolInput1 = { query: "refund policy annual plans" };
const toolInput2 = { query: "annual plan terms 30 day window" };

// Prior turn, replayed as input history: a reasoning item and two parallel
// function calls followed by their outputs. Responses API items carry no
// explicit role — function_call/function_call_output are recognized by
// shape, and standalone reasoning items are model output (assistant) even
// on the input side.
const inputItems = [
  {
    role: "user",
    content:
      "What's our refund policy for annual plans purchased more than 30 days ago?",
  },
  {
    type: "reasoning",
    id: "rs_001",
    summary: [
      {
        type: "summary_text",
        text: "I should check both the refund policy doc and the annual-plan terms doc, since the answer may differ for annual vs monthly plans.",
      },
    ],
  },
  {
    type: "function_call",
    id: "fc_001",
    call_id: callId1,
    name: "search_docs",
    arguments: JSON.stringify(toolInput1),
    status: "completed",
  },
  {
    type: "function_call",
    id: "fc_002",
    call_id: callId2,
    name: "search_docs",
    arguments: JSON.stringify(toolInput2),
    status: "completed",
  },
  {
    type: "function_call_output",
    call_id: callId1,
    output: "[Reduced refund policy doc excerpt]",
  },
  {
    type: "function_call_output",
    call_id: callId2,
    output: "[Reduced annual plan terms excerpt]",
  },
];

// New turn: reasoning followed by a direct answer — the prior parallel
// lookups already covered what was needed, so no new tool call this turn.
const outputItems = [
  {
    type: "reasoning",
    id: "rs_002",
    status: "completed",
    summary: [
      {
        type: "summary_text",
        text: "Both documents indicate refunds aren't available after 30 days for annual plans, so no further lookup is needed.",
      },
    ],
  },
  {
    type: "message",
    id: "msg_001",
    role: "assistant",
    status: "completed",
    content: [
      {
        type: "output_text",
        text: "Refunds for annual plans are only available within the first 30 days of purchase, so a refund isn't possible after that window.",
      },
    ],
  },
];

/**
 * Hand-built from OpenAI's documented Responses API item shapes (not a real
 * capture — the real prod example in this batch was wrapped in LangChain's
 * serialization envelope, which tests LangChain's format rather than the
 * raw Responses API one). Mirrors the same reasoning + parallel-tool-call
 * complexity as anthropicMessagesRichContent for the OpenAI side.
 */
export const openAiResponsesReasoningWithParallelCallsFixture = {
  name: "normalizes OpenAI Responses reasoning with parallel function calls",
  spanIO: {
    input: JSON.stringify(inputItems),
    output: JSON.stringify(outputItems),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "What's our refund policy for annual plans purchased more than 30 days ago?",
          },
        ],
        source: "input",
      },
      {
        id: "rs_001",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "I should check both the refund policy doc and the annual-plan terms doc, since the answer may differ for annual vs monthly plans.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: callId1,
            toolName: "search_docs",
            input: toolInput1,
          },
          {
            type: "tool-call",
            toolCallId: callId2,
            toolName: "search_docs",
            input: toolInput2,
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: callId1,
            output: "[Reduced refund policy doc excerpt]",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: callId2,
            output: "[Reduced annual plan terms excerpt]",
          },
        ],
        source: "input",
      },
      {
        id: "rs_002",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Both documents indicate refunds aren't available after 30 days for annual plans, so no further lookup is needed.",
          },
        ],
        source: "output",
      },
      {
        id: "msg_001",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "Refunds for annual plans are only available within the first 30 days of purchase, so a refund isn't possible after that window.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
