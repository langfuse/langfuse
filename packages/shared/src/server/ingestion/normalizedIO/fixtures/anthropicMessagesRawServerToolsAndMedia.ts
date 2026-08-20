import type { NormalizedIOFixture } from "./types";

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
              cache_control: { type: "ephemeral" },
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
          { type: "reasoning", data: "opaque-thinking-data" },
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
