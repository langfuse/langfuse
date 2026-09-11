import type { NormalizedIOFixture } from "../fixture-types";

const toolCallId = "call_weather_001";
const customToolCallId = "call_custom_002";

/** Synthetic OpenAI chat-completion case adapted from the playground suite. */
export const openAiChatCompletionToolSequenceFixture = {
  name: "normalizes an OpenAI chat-completion tool sequence",
  spanIO: {
    input: {
      tools: [
        {
          type: "function",
          function: {
            name: "get_weather",
            description: "Get the weather for a city",
            parameters: {
              type: "object",
              properties: { city: { type: "string" } },
              required: ["city"],
            },
          },
        },
        {
          type: "custom",
          custom: {
            name: "run_python",
            description: "Runs a python snippet",
            format: { type: "text" },
          },
        },
      ],
      messages: [
        // `name` differentiates same-role participants — carried as the
        // message's senderName (unlike the function-role `name` below,
        // which is a tool name).
        {
          role: "user",
          name: "alice",
          content: "What is the weather in Zurich?",
        },
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: toolCallId,
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city":"Zurich"}',
              },
            },
            {
              id: customToolCallId,
              type: "custom",
              custom: { name: "run_python", input: "print(21 * 2)" },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: toolCallId,
          content: '{"condition":"sunny","temperature":24}',
        },
        // Deprecated legacy function-calling protocol: the result message
        // carries the function name instead of a tool_call_id.
        { role: "function", name: "run_python", content: "42" },
      ],
    },
    output: {
      role: "assistant",
      content: "It is sunny and 24 degrees in Zurich.",
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        senderName: "alice",
        parts: [{ type: "text", text: "What is the weather in Zurich?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId,
            toolName: "get_weather",
            input: { city: "Zurich" },
            toolType: "function",
          },
          {
            type: "tool-call",
            toolCallId: customToolCallId,
            toolName: "run_python",
            input: "print(21 * 2)",
            toolType: "custom",
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId,
            output: { condition: "sunny", temperature: 24 },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: null,
            toolName: "run_python",
            output: 42,
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          { type: "text", text: "It is sunny and 24 degrees in Zurich." },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        name: "get_weather",
        description: "Get the weather for a city",
        inputSchema: {
          type: "object",
          properties: { city: { type: "string" } },
          required: ["city"],
        },
        type: "function",
      },
      {
        name: "run_python",
        description: "Runs a python snippet",
        inputSchema: { type: "text" },
        type: "custom",
      },
    ],
  },
} satisfies NormalizedIOFixture;

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
            content: {
              kind: "text",
              text: "I should check both the refund policy doc and the annual-plan terms doc, since the answer may differ for annual vs monthly plans.",
            },
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
            toolType: "function_call",
            providerMetadata: { status: "completed" },
          },
          {
            type: "tool-call",
            toolCallId: callId2,
            toolName: "search_docs",
            input: toolInput2,
            toolType: "function_call",
            providerMetadata: { status: "completed" },
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
            content: {
              kind: "text",
              text: "Both documents indicate refunds aren't available after 30 days for annual plans, so no further lookup is needed.",
            },
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

const responsesToolCallId = "call_weather_002";

/** Synthetic OpenAI Responses case adapted from the playground suite. */
export const openAiResponsesFunctionCallFixture = {
  name: "normalizes OpenAI Responses function calls and outputs",
  spanIO: {
    input: [
      { role: "user", content: "What is the weather in Basel?" },
      {
        type: "function_call",
        id: "fc_weather_002",
        call_id: responsesToolCallId,
        name: "get_weather",
        arguments: { city: "Basel" },
        status: "completed",
      },
      {
        type: "function_call_output",
        call_id: responsesToolCallId,
        output: "The weather in Basel is cloudy.",
      },
    ],
    output: undefined,
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "user",
        parts: [{ type: "text", text: "What is the weather in Basel?" }],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "tool-call",
            toolCallId: responsesToolCallId,
            toolName: "get_weather",
            input: { city: "Basel" },
            toolType: "function_call",
            providerMetadata: { status: "completed" },
          },
        ],
        source: "input",
      },
      {
        role: "tool",
        parts: [
          {
            type: "tool-result",
            toolCallId: responsesToolCallId,
            output: "The weather in Basel is cloudy.",
          },
        ],
        source: "input",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

/**
 * Synthetic OpenAI chat-completion case for the non-text surfaces: multimodal
 * content parts (image_url / input_audio / file in all three source shapes —
 * https URL, base64 data-URI, and Langfuse media reference token), refusal
 * parts, response-message url_citation annotations, and audio output.
 *
 * Media handling contract exercised here:
 * - `@@@langfuseMedia:type=X|id=Y|source=Z@@@` tokens (the dominant shape in
 *   stored production IO) become `file` parts with `kind: "reference"`,
 *   mediaType from the token, and the token's `source` in providerMetadata.
 * - Unknown media subtypes fall back to modality wildcards (`image/*`,
 *   `audio/*`) when the part kind reveals the modality, and omit mediaType
 *   entirely when it does not (opaque file ids).
 * - Refusals stay findable: they normalize to text parts flagged with
 *   `refusal: true` (typed field) so evals can filter refusal observations.
 */
export const openAiChatMultimodalRichResponseFixture = {
  name: "normalizes OpenAI chat-completion multimodal content and rich response fields",
  spanIO: {
    input: {
      messages: [
        // `developer` is OpenAI's replacement name for `system` — aliases to
        // the canonical system role.
        { role: "developer", content: "You are a helpful assistant." },
        {
          role: "user",
          content: [
            { type: "text", text: "What is in these files?" },
            {
              type: "image_url",
              image_url: { url: "https://example.com/cat.png", detail: "low" },
            },
            {
              type: "image_url",
              image_url: { url: "data:image/png;base64,aGVsbG8=" },
            },
            {
              type: "image_url",
              image_url: {
                url: "@@@langfuseMedia:type=image/jpeg|id=media-ref-image-1|source=base64@@@",
              },
            },
            {
              type: "input_audio",
              input_audio: { data: "UklGRg==", format: "wav" },
            },
            {
              type: "input_audio",
              input_audio: {
                data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-1|source=base64@@@",
              },
            },
            {
              type: "file",
              file: { file_data: "JVBERi0=", filename: "report.pdf" },
            },
            { type: "file", file: { file_id: "file-abc123" } },
            "@@@langfuseMedia:type=application/pdf|id=media-ref-file-1|source=bytes@@@",
            // Text with several embedded media tokens splits into
            // interleaved text and file parts.
            {
              type: "text",
              text: "Compare @@@langfuseMedia:type=image/png|id=media-ref-inline-1|source=base64@@@ with @@@langfuseMedia:type=image/png|id=media-ref-inline-2|source=base64@@@ please.",
            },
          ],
        },
        {
          role: "assistant",
          content: [
            { type: "refusal", refusal: "I cannot describe this image." },
          ],
        },
      ],
    },
    output: {
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: "The Eiffel Tower is 330 meters tall.",
            refusal: null,
            annotations: [
              {
                type: "url_citation",
                url_citation: {
                  url: "https://example.com/eiffel",
                  title: "Eiffel Tower",
                  start_index: 0,
                  end_index: 37,
                },
              },
            ],
            audio: {
              id: "audio_001",
              data: "@@@langfuseMedia:type=audio/mpeg|id=media-ref-audio-2|source=base64@@@",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
          finish_reason: "stop",
        },
      ],
    },
    metadata: undefined,
  },
  expected: {
    messages: [
      {
        role: "system",
        parts: [{ type: "text", text: "You are a helpful assistant." }],
        source: "input",
      },
      {
        role: "user",
        parts: [
          { type: "text", text: "What is in these files?" },
          {
            type: "file",
            mediaType: "image/*",
            content: { kind: "url", url: "https://example.com/cat.png" },
            providerMetadata: { detail: "low" },
          },
          {
            type: "file",
            // Data-URIs stay urls (they render as urls; decoding is the media
            // pipeline's job), but the prefix still declares the exact type.
            mediaType: "image/png",
            content: { kind: "url", url: "data:image/png;base64,aGVsbG8=" },
          },
          {
            type: "file",
            mediaType: "image/jpeg",
            content: { kind: "reference", id: "media-ref-image-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            mediaType: "audio/wav",
            content: { kind: "base64", data: "UklGRg==" },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-1" },
            providerMetadata: { source: "base64" },
          },
          {
            type: "file",
            filename: "report.pdf",
            content: { kind: "base64", data: "JVBERi0=" },
          },
          {
            type: "file",
            content: { kind: "reference", id: "file-abc123" },
          },
          {
            type: "file",
            mediaType: "application/pdf",
            content: { kind: "reference", id: "media-ref-file-1" },
            providerMetadata: { source: "bytes" },
          },
          { type: "text", text: "Compare " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-1" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " with " },
          {
            type: "file",
            mediaType: "image/png",
            content: { kind: "reference", id: "media-ref-inline-2" },
            providerMetadata: { source: "base64" },
          },
          { type: "text", text: " please." },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            refusal: true,
            text: "I cannot describe this image.",
          },
        ],
        source: "input",
      },
      {
        role: "assistant",
        parts: [
          {
            type: "text",
            text: "The Eiffel Tower is 330 meters tall.",
            providerMetadata: {
              citations: [
                {
                  type: "url_citation",
                  url_citation: {
                    url: "https://example.com/eiffel",
                    title: "Eiffel Tower",
                    start_index: 0,
                    end_index: 37,
                  },
                },
              ],
            },
          },
          {
            type: "file",
            mediaType: "audio/mpeg",
            content: { kind: "reference", id: "media-ref-audio-2" },
            providerMetadata: {
              source: "base64",
              id: "audio_001",
              transcript: "The Eiffel Tower is 330 meters tall.",
              expires_at: 1755672000,
            },
          },
        ],
        // The finish reason lives on the choice, not the message.
        finishReason: { type: "stop", raw: "stop" },
        source: "output",
      },
    ],
    toolDefinitions: [],
  },
} satisfies NormalizedIOFixture;

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
          {
            type: "input_text",
            text: "Check the docs and describe the diagram.",
          },
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
        type: "mcp_list_tools",
        id: "mcpl_100",
        server_label: "analytics",
        tools: [
          {
            name: "query_db",
            description: "Run a SQL query",
            input_schema: { type: "object" },
          },
        ],
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
            content: { kind: "text", text: "Detailed chain of thought." },
          },
          {
            type: "reasoning",
            content: { kind: "text", text: "Weighing the sources." },
          },
          // The replayable encrypted blob is its own stream element.
          {
            type: "reasoning",
            content: { kind: "encrypted", data: "enc_abc123" },
          },
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
              citations: [
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
            refusal: true,
            text: "I cannot share the internal spec.",
          },
        ],
        source: "output",
      },
    ],
    toolDefinitions: [
      {
        // From the mcp_list_tools item — definitions, not conversation
        // content; no message is emitted for the listing itself.
        name: "query_db",
        description: "Run a SQL query",
        inputSchema: { type: "object" },
        type: undefined,
      },
    ],
  },
} satisfies NormalizedIOFixture;
