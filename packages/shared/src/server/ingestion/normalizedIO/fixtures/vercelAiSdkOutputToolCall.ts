import type { NormalizedIOFixture } from "./types";

const previousToolCallId = "call_37WZP0DuTXwk6x43u5sz0WpD";
const outputToolCallId = "call_CQBg5lwXHRCSONvKr6OT9znL";

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

const inputMessages = [
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
      // Reasoning-generated file (AI SDK reasoning-file part).
      {
        type: "reasoning-file",
        data: { type: "url", url: "https://example.com/scratchpad.png" },
        mediaType: "image/png",
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
        id: outputToolCallId,
        name: "searchLangfuseDocs",
        arguments: outputToolInput,
      },
    ],
    finish_reason: "tool_call",
  },
];

const resourceAttributes = {
  "service.name": "unknown_service:node",
  "telemetry.sdk.language": "nodejs",
  "telemetry.sdk.name": "opentelemetry",
  "telemetry.sdk.version": "2.0.1",
};

const spanMetadata = {
  attributes: {
    "gen_ai.operation.name": "chat",
    "gen_ai.provider.name": "openai",
    "gen_ai.request.model": "gpt-5",
    "gen_ai.tool.definitions": JSON.stringify([toolDefinition]),
  },
  resourceAttributes,
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
              value: { stringValue: JSON.stringify(inputMessages) },
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
    resourceAttributes,
  },
  spanIO: {
    input: JSON.stringify(inputMessages),
    output: JSON.stringify(outputMessages),
    metadata: spanMetadata,
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
            output: {
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
            // Reasoning provenance rides as a known flag, not a part type.
            providerMetadata: { reasoning: true },
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
            toolCallId: outputToolCallId,
            toolName: "searchLangfuseDocs",
            input: outputToolInput,
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
        providerMetadata: undefined,
      },
    ],
  },
} satisfies NormalizedIOFixture;
