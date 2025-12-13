import { describe, it, expect } from "vitest";
import {
  geminiAdapter,
  selectAdapter,
  SimpleChatMlArraySchema,
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
