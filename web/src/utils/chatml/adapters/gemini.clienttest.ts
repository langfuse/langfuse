import { geminiAdapter } from "./gemini";
import type { NormalizerContext } from "../types";

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

    it("should detect via structural analysis (tool definitions in messages)", () => {
      const ctx: NormalizerContext = {
        metadata: {
          messages: [
            { role: "system", content: "System prompt" },
            {
              role: "tool",
              content: {
                type: "function",
                function: { name: "get_weather", description: "Get weather" },
              },
            },
          ],
        },
      };

      expect(geminiAdapter.detect(ctx)).toBe(true);
    });

    it("should not detect non-Gemini formats", () => {
      expect(
        geminiAdapter.detect({ metadata: { ls_provider: "openai" } }),
      ).toBe(false);
      expect(geminiAdapter.detect({ observationName: "OpenAI-call" })).toBe(
        false,
      );
      expect(geminiAdapter.detect({})).toBe(false);
    });
  });

  describe("preprocess", () => {
    it("should filter tool definitions and normalize structured content", () => {
      const input = [
        { role: "system", content: "System prompt" },
        {
          role: "assistant",
          content: [
            { type: "text", text: "Hello! " },
            { type: "text", text: "How can I help?" },
          ],
        },
        {
          role: "tool",
          content: {
            type: "function",
            function: {
              name: "get_weather",
              description: "Get weather",
              parameters: {},
            },
          },
        },
        {
          role: "user",
          content: [{ type: "text", text: "What's the weather?" }],
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      // Tool definition filtered out
      expect(result.length).toBe(3);

      // Content normalized from structured to plain text
      expect(result[0].content).toBe("System prompt");
      expect(result[1].content).toBe("Hello! How can I help?");
      expect(result[2].content).toBe("What's the weather?");
    });

    it("should preserve tool result messages (not filter them)", () => {
      const input = [
        {
          role: "assistant",
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

    it("should stringify object content in tool result messages", () => {
      const input = [
        {
          role: "assistant",
          content: [{ type: "text", text: "Let me check." }],
        },
        {
          role: "tool",
          content: {
            ok: true,
            data: { userId: 12345 },
            request: { unitId: 1, name: "Test User" },
          },
          tool_call_id: "call_xyz789",
        },
      ];

      const result = geminiAdapter.preprocess(input, "input", {}) as any[];

      expect(result.length).toBe(2);
      expect(result[1].role).toBe("tool");
      // Tool result content should be stringified
      expect(typeof result[1].content).toBe("string");
      expect(result[1].content).toBe(
        JSON.stringify({
          ok: true,
          data: { userId: 12345 },
          request: { unitId: 1, name: "Test User" },
        }),
      );
      expect(result[1].tool_call_id).toBe("call_xyz789");
    });

    it("should handle input wrapped in messages field", () => {
      const input = {
        messages: [
          { role: "system", content: "System" },
          {
            role: "tool",
            content: {
              type: "function",
              function: { name: "tool1", description: "Tool 1" },
            },
          },
          {
            role: "user",
            content: [{ type: "text", text: "User message" }],
          },
        ],
        extra: "metadata",
      };

      const result = geminiAdapter.preprocess(input, "input", {}) as any;

      expect(result.messages.length).toBe(2);
      expect(result.messages[0].content).toBe("System");
      expect(result.messages[1].content).toBe("User message");
      expect(result.extra).toBe("metadata");
    });

    it("should normalize tool_calls from Gemini format to OpenAI format", () => {
      const input = [
        {
          role: "assistant",
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
      expect(result[0].role).toBe("assistant");
      expect(result[0].tool_calls).toBeDefined();
      expect(result[0].tool_calls.length).toBe(1);

      // Should be normalized to our ChatML format
      const toolCall = result[0].tool_calls[0];
      expect(toolCall.id).toBe("call_abc123");
      expect(toolCall.type).toBe("function");
      expect(toolCall.function).toBeDefined();
      expect(toolCall.function.name).toBe("get_weather");
      expect(typeof toolCall.function.arguments).toBe("string");
      expect(toolCall.function.arguments).toBe(
        JSON.stringify({ location: "San Francisco", unit: "celsius" }),
      );

      // Old fields should be removed
      expect(toolCall.name).toBeUndefined();
      expect(toolCall.args).toBeUndefined();
    });
  });
});
