import { describe, it, expect } from "vitest";
import {
  geminiAdapter,
  selectAdapter,
  SimpleChatMlArraySchema,
  normalizeInput as chatmlNormalizeInput,
  normalizeOutput as chatmlNormalizeOutput,
  combineInputOutputMessages,
  type NormalizerContext,
} from "@langfuse/shared";

// Test helper
function normalizeInput(input: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? input,
    data: input,
  });
  const preprocessed = adapter.preprocess(input, "input", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

describe("geminiAdapter", () => {
  describe("detect", () => {
    it.each([
      {
        name: "ls_provider metadata",
        ctx: { metadata: { ls_provider: "google_vertexai" } },
      },
      {
        name: "observation name with 'gemini'",
        ctx: { observationName: "VertexGemini" },
      },
      {
        name: "observation name with 'vertex'",
        ctx: { observationName: "vertex-ai-call" },
      },
      {
        name: "explicit framework",
        ctx: { framework: "gemini" },
      },
    ])("should detect Gemini format via $name", ({ ctx }) => {
      expect(geminiAdapter.detect(ctx as NormalizerContext)).toBe(true);
    });

    it("should not detect non-Gemini formats", () => {
      expect(
        geminiAdapter.detect({ metadata: { ls_provider: "openai" } }),
      ).toBe(false);
      expect(geminiAdapter.detect({ observationName: "OpenAI-call" })).toBe(
        false,
      );
      expect(geminiAdapter.detect({})).toBe(false);

      // Should reject Microsoft Agent format (parts without contents wrapper)
      expect(
        geminiAdapter.detect({
          metadata: [
            {
              role: "user",
              parts: [{ type: "text", content: "Hello" }],
            },
          ],
        }),
      ).toBe(false);
    });
  });

  describe("preprocess", () => {
    it("should preserve tool result messages (not filter them)", () => {
      const input = [
        {
          role: "model",
          content: [{ type: "text", text: "Let me check." }],
        },
        {
          role: "tool",
          content: "Temperature is 72°F", // String content = tool RESULT
          tool_call_id: "call_123",
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      expect(result.length).toBe(2);
      expect(result[1].role).toBe("tool");
      expect(result[1].content).toBe("Temperature is 72°F");
      expect(result[1].tool_call_id).toBe("call_123");
    });

    it("should stringify simple object content in tool result messages (1-2 scalar keys)", () => {
      const input = [
        {
          role: "model",
          content: [{ type: "text", text: "Let me check." }],
        },
        {
          role: "tool",
          content: {
            temperature: 72,
            conditions: "sunny",
          },
          tool_call_id: "call_xyz789",
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      expect(result.length).toBe(2);
      expect(result[1].role).toBe("tool");
      // Simple objects (1-2 scalar keys) get stringified
      expect(typeof result[1].content).toBe("string");
      expect(result[1].content).toBe(
        JSON.stringify({
          temperature: 72,
          conditions: "sunny",
        }),
      );
      expect(result[1].tool_call_id).toBe("call_xyz789");
    });

    it("should spread rich object content (3+ keys or nested) in tool result messages", () => {
      const input = [
        {
          role: "model",
          content: [{ type: "text", text: "Let me check." }],
        },
        {
          role: "tool",
          content: {
            PatientNo: "123",
            Firstname: "John",
            Lastname: "Doe",
            Email: "john@example.com",
            Mobile: "1234567890",
          },
          tool_call_id: "call_abc123",
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      expect(result.length).toBe(2);
      expect(result[1].role).toBe("tool");
      // Rich objects get spread into message
      expect(result[1].content).toBeUndefined();
      expect(result[1].PatientNo).toBe("123");
      expect(result[1].Firstname).toBe("John");
      expect(result[1].tool_call_id).toBe("call_abc123");
    });

    it("should normalize tool_calls from Gemini format to flat ChatML format", () => {
      const input = [
        {
          role: "model",
          content: "",
          tool_calls: [
            {
              name: "get_weather",
              args: {
                location: "San Francisco",
                unit: "celsius",
              },
              id: "call_abc123",
              type: "tool_call",
            },
          ],
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      expect(result.length).toBe(1);
      expect(result[0].role).toBe("model");
      expect(result[0].tool_calls).toBeDefined();
      expect(result[0].tool_calls.length).toBe(1);

      // Should be normalized to our ChatML format
      const toolCall = result[0].tool_calls[0];
      expect(toolCall.id).toBe("call_abc123");
      // previous, before flattinging
      // TODO: remove
      // expect(toolCall.function).toBeDefined();
      // expect(toolCall.function.name).toBe("get_weather");
      // expect(typeof toolCall.function.arguments).toBe("string");
      expect(toolCall.type).toBe("function");
      expect(toolCall.name).toBe("get_weather");
      expect(typeof toolCall.arguments).toBe("string");
      expect(toolCall.arguments).toBe(
        JSON.stringify({ location: "San Francisco", unit: "celsius" }),
      );

      // Old fields should be removed
      expect(toolCall.args).toBeUndefined();
    });

    it("should handle Google ADK format with tool calls and function responses", () => {
      // This is the format from google-adk-2025-08-28.json
      const input = {
        model: "gemini-2.0-flash",
        config: {
          system_instruction: "Always greet using the say_hello tool.",
          tools: [
            {
              function_declarations: [
                {
                  name: "say_hello",
                  description: "Greet the user",
                },
              ],
            },
          ],
        },
        contents: [
          {
            parts: [{ text: "hi" }],
            role: "user",
          },
          {
            parts: [
              {
                function_call: {
                  args: {},
                  name: "say_hello",
                },
              },
            ],
            role: "model",
          },
          {
            parts: [
              {
                function_response: {
                  name: "say_hello",
                  response: {
                    greeting: "Hello Langfuse 👋",
                  },
                },
              },
            ],
            role: "user",
          },
        ],
      };

      const result = normalizeInput(input, { framework: "gemini" });
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4);

      // First message: system instruction
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[0].content).toBe(
        "Always greet using the say_hello tool.",
      );
      expect(result.data?.[0].tools).toBeDefined();
      expect(result.data?.[0].tools?.[0].name).toBe("say_hello");

      // Second message: user text
      expect(result.data?.[1].role).toBe("user");
      expect(result.data?.[1].content).toBe("hi");
      expect(result.data?.[1].tools).toBeDefined();
      expect(result.data?.[1].tools?.[0].name).toBe("say_hello");

      // Third message: assistant with tool_call, not normalized
      expect(result.data?.[2].role).toBe("model");
      expect(result.data?.[2].tool_calls).toBeDefined();
      expect(result.data?.[2].tool_calls?.[0].name).toBe("say_hello");
      expect(result.data?.[2].tool_calls?.[0].arguments).toBe("{}");

      // Fourth message: tool result
      expect(result.data?.[3].role).toBe("user");
      expect(result.data?.[3].content).toBeDefined();
    });
  });
});

// Real payloads from a Google ADK invocation root span
// (openinference-instrumentation-google-adk 0.1.17, google-adk 2.4.0).
// Regression tests for https://github.com/langfuse/langfuse/issues/13292
describe("geminiAdapter: Google ADK invocation root span", () => {
  const invocationInput = {
    user_id: "demo-user",
    session_id: "demo-session",
    invocation_id: null,
    new_message: {
      parts: [
        {
          text: "hi",
        },
      ],
      role: "user",
    },
    state_delta: null,
    run_config: {
      save_input_blobs_as_artifacts: false,
      support_cfc: false,
      streaming_mode: "StreamingMode.NONE",
      output_audio_transcription: {},
      input_audio_transcription: {},
      save_live_blob: false,
      save_live_audio: false,
      max_llm_calls: 500,
    },
    yield_user_message: false,
  };

  const invocationOutput = {
    model_version: "gemini-3.1-flash-lite",
    content: {
      parts: [
        {
          text: "Hello! How can I help you today?",
          thought_signature:
            "EjQKMgERTTIP4vHbi_GtaO9Rcz5K7VC1uJkE5IsctGfJn7xqR9usflAYTBhwqAuJMyGmdnsy",
        },
      ],
      role: "model",
    },
    finish_reason: "STOP",
    usage_metadata: {
      candidates_token_count: 9,
      prompt_token_count: 62,
      prompt_tokens_details: [
        {
          modality: "TEXT",
          token_count: 62,
        },
      ],
      total_token_count: 71,
    },
    invocation_id: "e-db33baf0-bb57-4b21-a6f7-a222364a4309",
    author: "hello_agent",
    actions: {
      state_delta: {},
      artifact_delta: {},
      requested_auth_configs: {},
      requested_tool_confirmations: {},
    },
    node_info: {
      path: "hello_agent@1",
    },
    id: "8f01c045-0d98-421a-848f-cf25fc4fe1d3",
    timestamp: 1784663909.934617,
  };

  const observationMetadata = {
    attributes: {
      "langfuse.internal.is_app_root": "true",
      "input.mime_type": "application/json",
      "user.id": "demo-user",
      "session.id": "demo-session",
      "output.mime_type": "application/json",
      "openinference.span.kind": "CHAIN",
    },
    resourceAttributes: {
      "telemetry.sdk.language": "python",
      "telemetry.sdk.name": "opentelemetry",
      "telemetry.sdk.version": "1.42.1",
      "service.name": "unknown_service",
    },
    scope: {
      name: "openinference.instrumentation.google_adk",
      version: "0.1.17",
      attributes: {},
    },
  };

  // ctx exactly as parseChatML (useChatMLParser.ts) builds it
  const ctx: NormalizerContext = {
    metadata: observationMetadata,
    observationName: "invocation [hello_app]",
  };

  it("normalizes the invocation input envelope into a user message", () => {
    const res = chatmlNormalizeInput(invocationInput, ctx);
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.data).toHaveLength(1);
    expect(res.data[0].role).toBe("user");
    expect(res.data[0].content).toBe("hi");
  });

  it("combines invocation input and output so the trace renders as chat", () => {
    const inResult = chatmlNormalizeInput(invocationInput, ctx);
    const outResult = chatmlNormalizeOutput(invocationOutput, ctx);
    const messages = combineInputOutputMessages(
      inResult,
      outResult,
      invocationOutput,
    );
    expect(messages).toHaveLength(2);
    expect(messages[1].role).toBe("model");
  });
});
