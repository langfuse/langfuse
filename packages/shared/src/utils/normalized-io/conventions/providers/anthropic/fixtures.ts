import type { NormalizedIOFixture } from "../fixture-types";

const searchSchema = {
  type: "object",
  properties: { query: { type: "string" } },
  required: ["query"],
};

const mediaReference =
  "@@@langfuseMedia:type=image/png|id=anthropic-image-1|source=base64@@@";

/** Raw Anthropic Messages API shape, including server tools and multimodal blocks. */
export const anthropicMessagesRawServerToolsAndMediaFixture = {
  name: "normalizes raw Anthropic system, server tools, documents, and citations",
  spanIO: {
    input: {
      system: [
        {
          type: "text",
          text: "You are a concise research assistant.",
        },
      ],
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Find the latest report.",
              citations: [
                { type: "char_location", cited_text: "latest report" },
              ],
            },
            {
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: "aGVsbG8=",
              },
            },
            { type: "image", source: { type: "url", url: mediaReference } },
            {
              type: "document",
              title: "Report",
              context: "Reference document",
              citations: [{ type: "page_location", page_number: 1 }],
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: "JVBERi0=",
              },
            },
            {
              type: "document",
              source: {
                type: "text",
                media_type: "text/plain",
                data: "A plain text document.",
              },
            },
            { type: "container_upload", file_id: "file-container-1" },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "redacted_thinking", data: "opaque-thinking-data" },
            {
              type: "server_tool_use",
              id: "server-call-1",
              name: "web_search",
              input: { query: "latest report" },
            },
            {
              type: "mcp_tool_use",
              id: "mcp-call-1",
              name: "lookup_report",
              server_name: "reports",
              input: { id: "report-1" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "web_search_tool_result",
              tool_use_id: "server-call-1",
              content: [{ type: "text", text: "Search result" }],
            },
            {
              type: "tool_result",
              tool_use_id: "server-call-1",
              is_error: true,
              content: "The report service timed out.",
            },
            {
              type: "mcp_tool_result",
              tool_use_id: "mcp-call-1",
              is_error: false,
              content: "Report metadata",
            },
          ],
        },
      ],
      tools: [
        {
          name: "lookup_report",
          description: "Look up a report by ID.",
          input_schema: searchSchema,
        },
        {
          type: "web_search_20250305",
          name: "web_search",
          max_uses: 3,
        },
      ],
    },
    output: {
      role: "assistant",
      content: [
        {
          type: "text",
          text: "I found the report.",
          citations: [{ type: "page_location", page_number: 1 }],
        },
        {
          type: "tool_use",
          id: "output-call-1",
          name: "lookup_report",
          input: { id: "report-1" },
        },
        {
          type: "mcp_tool_use",
          id: "output-mcp-1",
          name: "save_report",
          server_name: "reports",
          input: { id: "report-1" },
        },
      ],
      stop_reason: "tool_use",
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [
          { type: "text", text: "You are a concise research assistant." },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "text",
            text: "Find the latest report.",
            providerMetadata: {
              citations: [
                { type: "char_location", cited_text: "latest report" },
              ],
            },
          },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "base64", data: "aGVsbG8=" },
          },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "anthropic-image-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "base64", data: "JVBERi0=" },
            providerMetadata: {
              title: "Report",
              context: "Reference document",
              citations: [{ type: "page_location", page_number: 1 }],
            },
          },
          {
            type: "custom",
            kind: "document",
            value: {
              type: "document",
              source: {
                type: "text",
                media_type: "text/plain",
                data: "A plain text document.",
              },
            },
          },
          {
            type: "file",
            // Opaque reference — no media-type signal, so none is invented
            // (README assumption 11).
            content: { kind: "reference", id: "file-container-1" },
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            content: { kind: "redacted", data: "opaque-thinking-data" },
          },
          {
            type: "tool-call",
            toolCallId: "server-call-1",
            toolName: "web_search",
            input: { query: "latest report" },
            toolType: "server_tool_use",
            providerExecuted: true,
          },
          {
            type: "tool-call",
            toolCallId: "mcp-call-1",
            toolName: "lookup_report",
            input: { id: "report-1" },
            toolType: "mcp_tool_use",
            providerExecuted: true,
            providerMetadata: { server_name: "reports" },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "server-call-1",
            output: [{ type: "text", text: "Search result" }],
          },
          {
            type: "tool-result",
            toolCallId: "server-call-1",
            output: "The report service timed out.",
            isError: true,
          },
          {
            type: "tool-result",
            toolCallId: "mcp-call-1",
            output: "Report metadata",
            isError: false,
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I found the report.",
            providerMetadata: {
              citations: [{ type: "page_location", page_number: 1 }],
            },
          },
          {
            type: "tool-call",
            toolCallId: "output-call-1",
            toolName: "lookup_report",
            input: { id: "report-1" },
            toolType: "tool_use",
          },
          {
            type: "tool-call",
            toolCallId: "output-mcp-1",
            toolName: "save_report",
            input: { id: "report-1" },
            toolType: "mcp_tool_use",
            providerExecuted: true,
            providerMetadata: { server_name: "reports" },
          },
        ],
        finishReason: { type: "tool-calls", raw: "tool_use" },
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "lookup_report",
        description: "Look up a report by ID.",
        inputSchema: searchSchema,
      },
      {
        name: "web_search",
        type: "web_search_20250305",
        providerMetadata: { max_uses: 3 },
      },
    ],
  },
} satisfies NormalizedIOFixture;

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
            providerMetadata: { index: 0 },
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId1,
            toolName: "search_docs",
            input: inputToolInput1,
            toolType: "tool_use",
            providerMetadata: { index: 1, caller: { type: "direct" } },
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId2,
            toolName: "search_docs",
            input: inputToolInput2,
            toolType: "tool_use",
            providerMetadata: { index: 2, caller: { type: "direct" } },
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
            providerMetadata: { index: 0 },
          },
          {
            type: "tool-call",
            toolCallId: outputToolCallId1,
            toolName: "search_docs",
            input: outputToolInput1,
            toolType: "tool_use",
            providerMetadata: { index: 1, caller: { type: "direct" } },
          },
          {
            type: "tool-call",
            toolCallId: outputToolCallId2,
            toolName: "search_docs",
            input: outputToolInput2,
            toolType: "tool_use",
            providerMetadata: { index: 2, caller: { type: "direct" } },
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
