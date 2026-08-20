import type { NormalizedIOFixture } from "./types";

const inputToolCallId1 = "call_i1";
const inputToolCallId2 = "call_i2";
const outputToolCallId1 = "call_o1";
const outputToolCallId2 = "call_o2";

const searchDocsDefinition = {
  name: "search_docs",
  description: "Search internal documentation for a given query.",
  parameters: {
    type: "object",
    properties: {
      query: { type: "string", description: "The search query." },
    },
    required: ["query"],
    additionalProperties: false,
  },
};

const escalateDefinition = {
  name: "escalate_to_human",
  description: "Escalate the conversation to a human support agent.",
  parameters: {
    type: "object",
    properties: {
      reason: { type: "string", description: "Why escalation is needed." },
    },
    required: ["reason"],
    additionalProperties: false,
  },
};

const inputToolInput1 = { query: "current pricing tiers" };
const inputToolInput2 = { query: "recent pricing changes release notes" };
const outputToolInput1 = { query: "current pricing tiers documentation" };
const outputToolInput2 = { query: "Q3 release notes pricing changes" };

const inputMessages = [
  {
    role: "system",
    content:
      "You are a research assistant that answers by searching internal documentation before responding.",
  },
  {
    role: "user",
    content: "How does our pricing compare to the previous tier structure?",
  },
  {
    role: "assistant",
    content:
      "I can look into that — let me check the current and legacy pricing docs.",
  },
  {
    role: "user",
    content:
      "Please also check if there were any changes announced in the last release notes.",
  },
  {
    role: "assistant",
    content: [
      {
        index: 0,
        type: "thinking",
        thinking:
          "The user wants a comparison across two pricing versions plus recent release notes. I should search two sources in parallel: current pricing docs and release notes.",
        // Anthropic requires this signature to be replayed back unmodified on
        // the next turn for extended-thinking conversations. The parser has
        // nowhere to put it today (see the note below the fixture).
        signature: "sig_1a2b3c",
      },
      {
        index: 1,
        type: "tool_use",
        id: inputToolCallId1,
        name: "search_docs",
        input: JSON.stringify(inputToolInput1),
        caller: { type: "direct" },
      },
      {
        index: 2,
        type: "tool_use",
        id: inputToolCallId2,
        name: "search_docs",
        input: JSON.stringify(inputToolInput2),
        caller: { type: "direct" },
      },
    ],
    // Real captures carry both the native Anthropic content blocks and a
    // LangChain-style flattened tool_calls array referencing the same ids —
    // the parser must dedup these, not double-count.
    tool_calls: [
      {
        name: "search_docs",
        args: inputToolInput1,
        id: inputToolCallId1,
        type: "tool_call",
      },
      {
        name: "search_docs",
        args: inputToolInput2,
        id: inputToolCallId2,
        type: "tool_call",
      },
    ],
  },
];

const outputMessage = {
  role: "assistant",
  content: [
    {
      index: 0,
      type: "thinking",
      thinking:
        "Both searches are running in parallel to gather the current and legacy pricing details plus any recent release notes.",
      signature: "sig_4d5e6f",
    },
    {
      index: 1,
      type: "tool_use",
      id: outputToolCallId1,
      name: "search_docs",
      input: JSON.stringify(outputToolInput1),
      caller: { type: "direct" },
    },
    {
      index: 2,
      type: "tool_use",
      id: outputToolCallId2,
      name: "search_docs",
      input: JSON.stringify(outputToolInput2),
      caller: { type: "direct" },
    },
  ],
  tool_calls: [
    {
      id: outputToolCallId1,
      type: "tool_call",
      name: "search_docs",
      arguments: JSON.stringify(outputToolInput1),
    },
    {
      id: outputToolCallId2,
      type: "tool_call",
      name: "search_docs",
      arguments: JSON.stringify(outputToolInput2),
    },
  ],
};

/**
 * Anonymized shape from a real production trace (LangChain-wrapped Anthropic
 * extended-thinking call with parallel tool use), captured via
 * scripts/prepareOtelFixture.ts. Content is synthetic; the message/tool
 * structure — including the redundant content[]/tool_calls[] representation
 * that must dedup to one call per id — matches the original.
 */
export const anthropicMessagesRichContentFixture = {
  name: "normalizes Anthropic extended thinking with parallel tool use",
  spanIO: {
    input: JSON.stringify({
      messages: inputMessages,
      tools: [searchDocsDefinition, escalateDefinition],
    }),
    output: JSON.stringify(outputMessage),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [
          {
            type: "text",
            text: "You are a research assistant that answers by searching internal documentation before responding.",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "How does our pricing compare to the previous tier structure?",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I can look into that — let me check the current and legacy pricing docs.",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Please also check if there were any changes announced in the last release notes.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "The user wants a comparison across two pricing versions plus recent release notes. I should search two sources in parallel: current pricing docs and release notes.",
              signature: "sig_1a2b3c",
            },
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId1,
            toolName: "search_docs",
            input: inputToolInput1,
            index: 1,
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId2,
            toolName: "search_docs",
            input: inputToolInput2,
            index: 2,
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: {
              kind: "text",
              text: "Both searches are running in parallel to gather the current and legacy pricing details plus any recent release notes.",
              signature: "sig_4d5e6f",
            },
          },
          {
            type: "tool-call",
            toolCallId: outputToolCallId1,
            toolName: "search_docs",
            input: outputToolInput1,
            index: 1,
          },
          {
            type: "tool-call",
            toolCallId: outputToolCallId2,
            toolName: "search_docs",
            input: outputToolInput2,
            index: 2,
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "search_docs",
        description: "Search internal documentation for a given query.",
        inputSchema: searchDocsDefinition.parameters,
      },
      {
        name: "escalate_to_human",
        description: "Escalate the conversation to a human support agent.",
        inputSchema: escalateDefinition.parameters,
      },
    ],
  },
} satisfies NormalizedIOFixture;
