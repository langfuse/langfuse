import { describe, it, expect } from "vitest";
import {
  microsoftAgentAdapter,
  selectAdapter,
  SimpleChatMlArraySchema,
  type NormalizerContext,
} from "@langfuse/shared";

// Test helpers
function normalizeInput(input: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? input,
    data: input,
  });
  const preprocessed = adapter.preprocess(input, "input", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

function normalizeOutput(output: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? output,
    data: output,
  });
  const preprocessed = adapter.preprocess(output, "output", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

describe("Microsoft Agent Framework Adapter", () => {
  describe("detection", () => {
    it("should detect Microsoft Agent Framework by provider name", () => {
      expect(
        microsoftAgentAdapter.detect({
          metadata: {
            attributes: {
              "gen_ai.provider.name": "microsoft.agent_framework",
            },
          },
        }),
      ).toBe(true);
    });

    it("should detect by framework override", () => {
      expect(
        microsoftAgentAdapter.detect({ framework: "microsoft-agent" }),
      ).toBe(true);
    });

    it("should detect Microsoft Agent format with parts array", () => {
      const input = [
        {
          role: "user",
          parts: [{ type: "text", content: "What's the weather like?" }],
        },
      ];

      expect(microsoftAgentAdapter.detect({ data: input })).toBe(true);
    });

    it("should not detect OpenAI format without parts", () => {
      expect(
        microsoftAgentAdapter.detect({
          data: { role: "user", content: "Hello" },
        }),
      ).toBe(false);
    });
  });

  describe("normalization", () => {
    it("should extract tool calls from parts array", () => {
      const input = [
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: ["run_123", "call_456"],
              name: "get_weather",
              arguments: { location: "Portland" },
            },
          ],
        },
      ];

      const result = normalizeInput(input, { framework: "microsoft-agent" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].tool_calls).toBeDefined();
      expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tool_calls?.[0].arguments).toBe(
        '{"location":"Portland"}',
      );
      expect(result.data?.[0].tool_calls?.[0].id).toBe("call_456");
    });

    it("should extract text content from parts array", () => {
      const input = [
        {
          role: "user",
          parts: [
            {
              type: "text",
              content: "What's the weather like in Portland?",
            },
          ],
        },
      ];

      const result = normalizeInput(input, { framework: "microsoft-agent" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe(
        "What's the weather like in Portland?",
      );
      // parts should be removed during normalization (not in ChatML type)
      expect((result.data?.[0] as any).parts).toBeUndefined();
    });

    it("should extract tool call responses from parts array", () => {
      const input = [
        {
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: ["run_123", "call_456"],
              response:
                "The weather in Portland is stormy with a high of 19°C.",
            },
          ],
        },
      ];

      const result = normalizeInput(input, { framework: "microsoft-agent" });

      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe(
        "The weather in Portland is stormy with a high of 19°C.",
      );
      expect(result.data?.[0].tool_call_id).toBe("call_456");
    });

    it("should handle full conversation with tool calls", () => {
      const metadata = {
        attributes: {
          "gen_ai.provider.name": "microsoft.agent_framework",
          "gen_ai.tool.definitions": [
            {
              type: "function",
              function: {
                name: "get_weather",
                description: "Get the weather for a given location.",
                parameters: {
                  properties: {
                    location: {
                      description: "The location to get the weather for.",
                      type: "string",
                    },
                  },
                  required: ["location"],
                  type: "object",
                },
              },
            },
          ],
        },
      };

      const input = [
        {
          role: "user",
          parts: [
            {
              type: "text",
              content: "What's the weather like in Portland?",
            },
          ],
        },
      ];

      const result = normalizeInput(input, {
        metadata,
        framework: "microsoft-agent",
      });

      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe(
        "What's the weather like in Portland?",
      );
      expect(result.data?.[0].tools).toBeDefined();
      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
    });

    it("should handle output with multiple parts", () => {
      const output = [
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: ["run_123", "call_456"],
              name: "get_weather",
              arguments: { location: "Portland" },
            },
          ],
        },
        {
          role: "tool",
          parts: [
            {
              type: "tool_call_response",
              id: ["run_123", "call_456"],
              response:
                "The weather in Portland is stormy with a high of 19°C.",
            },
          ],
        },
        {
          role: "assistant",
          parts: [
            {
              type: "text",
              content:
                "The weather in Portland is currently stormy with a high temperature of 19°C.",
            },
          ],
        },
      ];

      const result = normalizeOutput(output, { framework: "microsoft-agent" });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(3);

      // First message: tool call
      expect(result.data?.[0].tool_calls).toBeDefined();
      expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");

      // Second message: tool response
      expect(result.data?.[1].content).toBe(
        "The weather in Portland is stormy with a high of 19°C.",
      );

      // Third message: text response
      expect(result.data?.[2].content).toBe(
        "The weather in Portland is currently stormy with a high temperature of 19°C.",
      );
    });
  });
});
