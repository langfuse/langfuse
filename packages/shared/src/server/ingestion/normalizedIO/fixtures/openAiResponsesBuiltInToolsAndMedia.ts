import type { NormalizedIOFixture } from "./types";

/**
 * Hand-built from OpenAI's documented Responses API item shapes, covering the
 * non-function surfaces: media inputs (input_image / input_file), a reasoning
 * item with both raw content (reasoning_text) and summary plus
 * encrypted_content, provider-executed built-in tool items (web_search_call,
 * mcp_call), the custom tool-call protocol, and per-part citation
 * annotations with a refusal in the output message.
 *
 * Built-in items carry no name/arguments — the item type is the tool. They
 * normalize to provider-executed tool calls with the raw item type as
 * toolType and the kind-specific payload as input.
 */
export const openAiResponsesBuiltInToolsAndMediaFixture = {
  name: "normalizes OpenAI Responses built-in tools, media inputs, and rich reasoning",
  spanIO: {
    input: JSON.stringify([
      {
        role: "user",
        content: [
          { type: "input_text", text: "Check the docs and describe the diagram." },
          {
            type: "input_image",
            detail: "auto",
            image_url: "https://example.com/diagram.png",
          },
          {
            type: "input_file",
            file_url: "https://example.com/spec.pdf",
            filename: "spec.pdf",
          },
        ],
      },
    ]),
    output: JSON.stringify([
      {
        type: "reasoning",
        id: "rs_100",
        summary: [{ type: "summary_text", text: "Weighing the sources." }],
        content: [
          { type: "reasoning_text", text: "Detailed chain of thought." },
        ],
        encrypted_content: "enc_abc123",
      },
      {
        type: "web_search_call",
        id: "ws_100",
        status: "completed",
        action: { type: "search", query: "diagram spec" },
      },
      {
        type: "custom_tool_call",
        id: "ctc_100",
        call_id: "call_custom_100",
        name: "render_diagram",
        input: "graph TD; A-->B",
      },
      {
        type: "custom_tool_call_output",
        id: "cto_100",
        call_id: "call_custom_100",
        output: "ok",
      },
      {
        type: "mcp_call",
        id: "mcp_100",
        name: "query_db",
        arguments: '{"sql":"SELECT 1"}',
        server_label: "analytics",
        output: '[{"one":1}]',
      },
      {
        type: "message",
        id: "msg_100",
        role: "assistant",
        status: "completed",
        content: [
          {
            type: "output_text",
            text: "The diagram shows a simple flow.",
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/spec",
                  title: "Spec",
                  start_index: 0,
                  end_index: 32,
                },
              },
            ],
          },
          { type: "refusal", refusal: "I cannot share the internal spec." },
        ],
      },
    ]),
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [
          { type: "text", text: "Check the docs and describe the diagram." },
          {
            type: "file",
            mediaType: "image/*",
            content: { kind: "url", url: "https://example.com/diagram.png" },
            providerMetadata: { detail: "auto" },
          },
          {
            type: "file",
            filename: "spec.pdf",
            content: { kind: "url", url: "https://example.com/spec.pdf" },
          },
        ],
        source: "input",
      },
      {
        id: "rs_100",
        role: "assistant",
        parts: [
          {
            type: "reasoning",
            text: "Detailed chain of thought.",
            providerMetadata: { encrypted_content: "enc_abc123" },
          },
          { type: "reasoning", text: "Weighing the sources." },
        ],
        source: "output",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "ws_100",
            toolName: "web_search",
            input: { action: { type: "search", query: "diagram spec" } },
            toolType: "web_search_call",
            providerExecuted: true,
            providerMetadata: { status: "completed" },
          },
          {
            type: "tool-call",
            toolCallId: "call_custom_100",
            toolName: "render_diagram",
            input: "graph TD; A-->B",
            toolType: "custom",
          },
        ],
        source: "output",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: "call_custom_100",
            output: "ok",
          },
        ],
        source: "output",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: "mcp_100",
            toolName: "query_db",
            input: { sql: "SELECT 1" },
            toolType: "mcp_call",
            providerExecuted: true,
            providerMetadata: {
              server_label: "analytics",
              output: '[{"one":1}]',
            },
          },
        ],
        source: "output",
      },
      {
        id: "msg_100",
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "The diagram shows a simple flow.",
            providerMetadata: {
              annotations: [
                {
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/spec",
                    title: "Spec",
                    start_index: 0,
                    end_index: 32,
                  },
                },
              ],
            },
          },
          {
            type: "text",
            text: "I cannot share the internal spec.",
            providerMetadata: { refusal: true },
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;
