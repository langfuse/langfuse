import type { SpanIO, ToolDefinition } from "../types";

import type { NormalizedIOFixture } from "./types";

const inputToolCallId = "call_5iGKBMczvh1pevPChrZNGSFB";
const outputToolCallId = "toolu_01XXtujJ3DBaYEZGzn96xpGt";

const toolDefinitions: ToolDefinition[] = [
  {
    type: "function",
    name: "searchLangfuseDocs",
    description:
      "Semantic search (RAG) over the Langfuse documentation. Returns a concise answer synthesized from relevant docs.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The user's question in natural language.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getLangfuseDocsPage",
    description:
      "Fetch the raw Markdown for a single Langfuse docs page from a path or URL.",
    inputSchema: {
      type: "object",
      properties: {
        pathOrUrl: {
          type: "string",
          description: "A Langfuse docs path or full URL.",
        },
      },
      required: ["pathOrUrl"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "getLangfuseOverview",
    description:
      "Get a high-level, machine-readable index of the Langfuse documentation.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
  },
];

const inputMessages = [
  {
    role: "system",
    content:
      "You are a helpful Langfuse support agent. Give correct, actionable answers with links and minimal runnable examples.",
  },
  {
    role: "user",
    content: "What can I use Langfuse for?",
  },
  {
    role: "assistant",
    content: [
      {
        type: "reasoning",
        text: "I need to find out what Langfuse is used for and review the documentation overview first.",
      },
      {
        type: "tool-call",
        toolCallId: inputToolCallId,
        toolName: "getLangfuseOverview",
        input: {},
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        toolCallId: inputToolCallId,
        toolName: "getLangfuseOverview",
        output: {
          type: "content",
          value: [
            {
              type: "text",
              text: "[Langfuse documentation overview response]",
            },
          ],
        },
      },
    ],
  },
];

const outputMessage = {
  role: "user",
  content: [
    {
      type: "tool_use",
      id: outputToolCallId,
      name: "extract",
      input: {
        score: "0",
        reasoning:
          "The last user message is a how-to question asking for guidance on using Langfuse evaluation features. It does not express feedback about a feature.",
      },
      caller: { type: "direct" },
    },
  ],
};

const resourceAttributes = {
  "service.name": "unknown_service:node",
  "telemetry.sdk.language": "nodejs",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.version": "2.0.1",
};

const spanMetadata = {
  attributes: {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai.responses",
    "gen_ai.request.model": "gpt-5-2025-08-07",
    "gen_ai.tool.definitions": JSON.stringify(toolDefinitions),
  },
  resourceAttributes,
  scope: { name: "ai" },
};

/**
 * Based on the ClickHouse row for an ai.streamText.doStream observation. The
 * fixture keeps the mixed message formats from the row while reducing the
 * large system prompt and documentation response to representative values.
 */
export const vercelAiSdkMixedToolMessagesFixture = {
  name: "normalizes mixed Vercel AI SDK tool messages",
  otel: {
    scopeSpan: {
      scope: { name: "ai" },
      spans: [
        {
          traceId: Buffer.from("a6babebc8be3faed5cbf76e3afb394f1", "hex"),
          spanId: Buffer.from("9c9f649e5c57e86c", "hex"),
          parentSpanId: Buffer.from("2cd1febe538594a6", "hex"),
          name: "ai.streamText.doStream",
          kind: 3,
          attributes: [
            {
              key: "gen_ai.operation.name",
              value: { stringValue: "chat" },
            },
            {
              key: "gen_ai.provider.name",
              value: { stringValue: "openai.responses" },
            },
            {
              key: "gen_ai.request.model",
              value: { stringValue: "gpt-5-2025-08-07" },
            },
            {
              key: "gen_ai.input.messages",
              value: { stringValue: JSON.stringify(inputMessages) },
            },
            {
              key: "gen_ai.output.messages",
              value: { stringValue: JSON.stringify(outputMessage) },
            },
            {
              key: "gen_ai.tool.definitions",
              value: { stringValue: JSON.stringify(toolDefinitions) },
            },
          ],
          events: [],
          status: { code: 0 },
        },
      ],
    },
    resourceAttributes,
  },
  spanIO: {
    input: JSON.stringify({ messages: inputMessages }),
    output: JSON.stringify(outputMessage),
    metadata: spanMetadata,
  } satisfies SpanIO,
  expected: {
    messages: [
      {
        role: "system",
        parts: [
          {
            type: "text",
            text: "You are a helpful Langfuse support agent. Give correct, actionable answers with links and minimal runnable examples.",
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [{ type: "text", text: "What can I use Langfuse for?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "I need to find out what Langfuse is used for and review the documentation overview first.",
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId,
            toolName: "getLangfuseOverview",
            input: {},
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: inputToolCallId,
            output: {
              type: "content",
              value: [
                {
                  type: "text",
                  text: "[Langfuse documentation overview response]",
                },
              ],
            },
          },
        ],
        source: "input",
      },
      {
        role: "user",
        parts: [
          {
            type: "tool-call",
            toolCallId: outputToolCallId,
            toolName: "extract",
            input: {
              score: "0",
              reasoning:
                "The last user message is a how-to question asking for guidance on using Langfuse evaluation features. It does not express feedback about a feature.",
            },
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: toolDefinitions.map((definition) => ({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      type: definition.type,
      providerMetadata: undefined,
    })),
  },
} satisfies NormalizedIOFixture;
