import type { SpanIO, ToolDefinition } from "../../../types";

import type { NormalizedIOFixture } from "../fixture-types";

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
            content: {
              kind: "text",
              text: "I need to find out what Langfuse is used for and review the documentation overview first.",
            },
          },
          {
            type: "tool-call",
            toolCallId: inputToolCallId,
            toolName: "getLangfuseOverview",
            input: {},
            toolType: "tool-call",
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
            toolName: "getLangfuseOverview",
            // AI SDK {type, value} output wrappers are unwrapped; the
            // structured value is the result.
            output: [
              {
                type: "text",
                text: "[Langfuse documentation overview response]",
              },
            ],
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
            toolType: "tool_use",
            providerMetadata: { caller: { type: "direct" } },
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
    })),
  },
} satisfies NormalizedIOFixture;

const previousToolCallId = "call_37WZP0DuTXwk6x43u5sz0WpD";
const outputToolCallIdFromRecovery = "call_CQBg5lwXHRCSONvKr6OT9znL";

const previousToolInput = {
  query:
    "RAG tracing Langfuse example retrieval generation evaluation datasets",
};

const outputToolInput = {
  query:
    "Langfuse Python minimal tracing example RAG retrieve span generation span OpenAI client langfuse.openai example run_experiment datasets quickstart",
};

const toolDefinition = {
  type: "function",
  name: "searchLangfuseDocs",
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
    $schema: "http://json-schema.org/draft-07/schema#",
  },
  description: "Semantic search over the Langfuse documentation.",
};

const recoveryInputMessages = [
  {
    role: "user",
    parts: [{ type: "text", content: "Building rag" }],
  },
  {
    role: "assistant",
    parts: [
      {
        type: "text",
        content: "I'll search the Langfuse docs for a RAG example.",
      },
      {
        type: "tool_call",
        id: previousToolCallId,
        name: "searchLangfuseDocs",
        arguments: previousToolInput,
      },
    ],
  },
  {
    role: "tool",
    parts: [
      {
        type: "tool_call_response",
        id: previousToolCallId,
        response: {
          type: "content",
          value: [
            {
              type: "text",
              text: "[Reduced documentation search response]",
            },
          ],
        },
      },
    ],
  },
];

const outputMessages = [
  {
    role: "assistant",
    parts: [
      {
        type: "reasoning",
        content: "Looking into the RAG integration documentation.",
      },
      // Reasoning-generated file (AI SDK reasoning-file part, FilePart
      // nested under `file`).
      {
        type: "reasoning-file",
        file: {
          type: "file",
          data: "https://example.com/scratchpad.png",
          mediaType: "image/png",
        },
      },
      // Plain AI SDK file part (flat data | url shape).
      {
        type: "file",
        data: "UEsDBA==",
        mediaType: "application/zip",
        filename: "bundle.zip",
      },
      // Anchor-less document reference (AI SDK source part).
      {
        type: "source",
        sourceType: "url",
        id: "src_1",
        url: "https://example.com/rag-docs",
        title: "RAG integration docs",
      },
      {
        type: "tool_call",
        id: outputToolCallIdFromRecovery,
        name: "searchLangfuseDocs",
        arguments: outputToolInput,
      },
    ],
    finish_reason: "tool_call",
  },
];

const recoveryResourceAttributes = {
  "service.name": "unknown_service:node",
  "telemetry.sdk.language": "nodejs",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.version": "2.0.1",
};

const recoverySpanMetadata = {
  attributes: {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.request.model": "gpt-5",
    "gen_ai.tool.definitions": JSON.stringify([toolDefinition]),
  },
  resourceAttributes: recoveryResourceAttributes,
  scope: { name: "gen_ai", attributes: {} },
};

/**
 * Captured from a production Vercel AI SDK trace:
 * trace 5f9b96b2d186c0cd172bc93272bf6f68,
 * span a661aa3c1be83d6a. Large text and tool-result payloads are reduced while
 * preserving the OTel message/tool structure that exposed the regression.
 */
export const vercelAiSdkOutputToolCallFixture = {
  name: "extracts an output tool call from GenAI message parts",
  otel: {
    scopeSpan: {
      scope: { name: "gen_ai" },
      spans: [
        {
          traceId: Buffer.from("5f9b96b2d186c0cd172bc93272bf6f68", "hex"),
          spanId: Buffer.from("a661aa3c1be83d6a", "hex"),
          parentSpanId: Buffer.from("e85de236034cf4a5", "hex"),
          name: "chat gpt-5",
          kind: 3,
          attributes: [
            {
              key: "gen_ai.operation.name",
              value: { stringValue: "chat" },
            },
            {
              key: "gen_ai.provider.name",
              value: { stringValue: "openai" },
            },
            {
              key: "gen_ai.request.model",
              value: { stringValue: "gpt-5" },
            },
            {
              key: "gen_ai.input.messages",
              value: { stringValue: JSON.stringify(recoveryInputMessages) },
            },
            {
              key: "gen_ai.tool.definitions",
              value: { stringValue: JSON.stringify([toolDefinition]) },
            },
            {
              key: "gen_ai.output.messages",
              value: { stringValue: JSON.stringify(outputMessages) },
            },
          ],
          events: [],
          status: { code: 0 },
        },
      ],
    },
    resourceAttributes: recoveryResourceAttributes,
  },
  spanIO: {
    input: JSON.stringify(recoveryInputMessages),
    output: JSON.stringify(outputMessages),
    metadata: recoverySpanMetadata,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "Building rag" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "I'll search the Langfuse docs for a RAG example.",
          },
          {
            type: "tool-call",
            toolCallId: previousToolCallId,
            toolName: "searchLangfuseDocs",
            input: previousToolInput,
            toolType: "tool_call",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: previousToolCallId,
            output: [
              {
                type: "text",
                text: "[Reduced documentation search response]",
              },
            ],
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
              text: "Looking into the RAG integration documentation.",
            },
          },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "url", url: "https://example.com/scratchpad.png" },
            // Reasoning provenance is a typed field, not a part type.
            reasoning: true,
          },
          {
            type: "file",
            mediaType: "application/zip",
            filename: "bundle.zip",
            content: { kind: "base64", data: "UEsDBA==" },
          },
          {
            // Anchor-less citations stay stream-positioned parts; anchored
            // ones live on their text part's providerMetadata.citations.
            type: "custom",
            kind: "source",
            value: {
              type: "source",
              sourceType: "url",
              id: "src_1",
              url: "https://example.com/rag-docs",
              title: "RAG integration docs",
            },
          },
          {
            type: "tool-call",
            toolCallId: outputToolCallIdFromRecovery,
            toolName: "searchLangfuseDocs",
            input: outputToolInput,
            toolType: "tool_call",
          },
        ],
        finishReason: { type: "tool-calls", raw: "tool_call" },
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: toolDefinition.name,
        description: toolDefinition.description,
        inputSchema: toolDefinition.inputSchema,
        type: toolDefinition.type,
      },
    ],
  },
} satisfies NormalizedIOFixture;
