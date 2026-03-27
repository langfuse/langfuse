import { describe, it, expect } from "vitest";
import {
  anthropicAdapter,
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

function normalizeOutput(output: unknown, ctx: NormalizerContext = {}) {
  const adapter = selectAdapter({
    ...ctx,
    metadata: ctx.metadata ?? output,
    data: output,
  });
  const preprocessed = adapter.preprocess(output, "output", ctx);
  return SimpleChatMlArraySchema.safeParse(preprocessed);
}

describe("Anthropic Adapter", () => {
  describe("detection", () => {
    it("should detect by framework override", () => {
      expect(anthropicAdapter.detect({ framework: "anthropic" })).toBe(true);
    });

    it("should detect by observation name starting with 'anthropic.'", () => {
      expect(
        anthropicAdapter.detect({
          observationName: "anthropic.messages.create",
        }),
      ).toBe(true);
    });

    it("should NOT detect observation name with 'anthropic' as substring only", () => {
      expect(
        anthropicAdapter.detect({
          observationName: "anthropic-openai-bridge",
        }),
      ).toBe(false);
    });

    it("should detect by gen_ai.system attribute", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            attributes: { "gen_ai.system": "anthropic" },
          },
        }),
      ).toBe(true);
    });

    it("should detect Anthropic Messages API response structurally", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            role: "assistant",
            content: [
              { type: "text", text: "Hello" },
              { type: "tool_use", id: "t1", name: "fn", input: {} },
            ],
            stop_reason: "tool_use",
          },
        }),
      ).toBe(true);
    });

    it("should detect response with type:'message' but no stop_reason", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            role: "assistant",
            content: [{ type: "text", text: "Hello" }],
            type: "message",
          },
        }),
      ).toBe(true);
    });

    it("should detect array of Anthropic messages structurally", () => {
      expect(
        anthropicAdapter.detect({
          data: [
            { role: "user", content: [{ type: "text", text: "Hi" }] },
            {
              role: "assistant",
              content: [{ type: "tool_use", id: "t1", name: "fn", input: {} }],
            },
          ],
        }),
      ).toBe(true);
    });

    it("should NOT detect Pydantic AI format even with Claude model", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            attributes: {
              "gen_ai.request.model": "claude-sonnet-4-5@20250929",
            },
            scope: { name: "pydantic-ai" },
          },
        }),
      ).toBe(false);
    });

    it("should NOT detect LangSmith/LangChain format", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            scope: { name: "langsmith" },
          },
          observationName: "claude.assistant.turn",
        }),
      ).toBe(false);
    });

    it("should NOT detect plain OpenAI format", () => {
      expect(
        anthropicAdapter.detect({
          metadata: {
            messages: [
              { role: "user", content: "Hello" },
              {
                role: "assistant",
                content: "Hi",
                tool_calls: [
                  {
                    id: "tc1",
                    type: "function",
                    function: { name: "fn", arguments: "{}" },
                  },
                ],
              },
            ],
            tools: [{ type: "function", function: { name: "fn" } }],
          },
        }),
      ).toBe(false);
    });
  });

  describe("normalization", () => {
    const anthropicCtx: NormalizerContext = {
      framework: "anthropic",
    };

    it("should flatten tool_use blocks to tool_calls", () => {
      const output = {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { city: "Berlin" },
          },
        ],
        stop_reason: "tool_use",
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].role).toBe("assistant");
      expect(result.data?.[0].content).toBe("Let me check.");
      expect(result.data?.[0].tool_calls).toHaveLength(1);
      expect(result.data?.[0].tool_calls?.[0]).toEqual({
        id: "toolu_01",
        name: "get_weather",
        arguments: '{"city":"Berlin"}',
        type: "function",
      });
    });

    it("should handle multiple parallel tool_use blocks", () => {
      const output = {
        role: "assistant",
        content: [
          { type: "text", text: "Checking both." },
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { city: "Berlin" },
          },
          {
            type: "tool_use",
            id: "toolu_02",
            name: "get_weather",
            input: { city: "Tokyo" },
          },
        ],
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data?.[0].tool_calls).toHaveLength(2);
      expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tool_calls?.[1].name).toBe("get_weather");
    });

    it("should convert tool_result blocks to separate tool messages", () => {
      const input = [
        { role: "user", content: "What is the weather?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "toolu_01",
              name: "get_weather",
              input: { city: "Berlin" },
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "Cloudy, 15°C",
            },
          ],
        },
      ];

      const result = normalizeInput(input, anthropicCtx);
      expect(result.success).toBe(true);
      // user + assistant + tool
      expect(result.data).toHaveLength(3);
      expect(result.data?.[2].role).toBe("tool");
      expect(result.data?.[2].tool_call_id).toBe("toolu_01");
      expect(result.data?.[2].content).toBe("Cloudy, 15°C");
    });

    it("should handle multiple tool_result blocks without dropping any", () => {
      const input = [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "toolu_01",
              content: "Result A",
            },
            {
              type: "tool_result",
              tool_use_id: "toolu_02",
              content: "Result B",
            },
          ],
        },
      ];

      const result = normalizeInput(input, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].role).toBe("tool");
      expect(result.data?.[0].tool_call_id).toBe("toolu_01");
      expect(result.data?.[0].content).toBe("Result A");
      expect(result.data?.[1].role).toBe("tool");
      expect(result.data?.[1].tool_call_id).toBe("toolu_02");
      expect(result.data?.[1].content).toBe("Result B");
    });

    it("should extract thinking blocks with signature", () => {
      const output = {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "Let me calculate...",
            signature: "sig_abc",
          },
          { type: "text", text: "The answer is 42." },
        ],
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("The answer is 42.");
      expect(result.data?.[0].thinking).toEqual([
        {
          type: "thinking",
          content: "Let me calculate...",
          signature: "sig_abc",
        },
      ]);
    });

    it("should handle redacted_thinking blocks", () => {
      const output = {
        role: "assistant",
        content: [
          { type: "redacted_thinking", data: "encrypted_data_here" },
          { type: "text", text: "Here is my answer." },
        ],
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("Here is my answer.");
      expect(result.data?.[0].redacted_thinking).toEqual([
        { type: "redacted_thinking", data: "encrypted_data_here" },
      ]);
    });

    it("should handle Anthropic Messages API request with tools", () => {
      const input = {
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: "What is the weather in Berlin?" }],
        tools: [
          {
            name: "get_weather",
            description: "Get weather",
            input_schema: {
              type: "object",
              properties: { city: { type: "string" } },
            },
          },
        ],
      };

      const result = normalizeInput(input, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data?.[0].tools).toHaveLength(1);
      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tools?.[0].parameters).toEqual({
        type: "object",
        properties: { city: { type: "string" } },
      });
    });

    it("should pass through pure-text assistant response without destructive normalization", () => {
      const output = {
        role: "assistant",
        content: [{ type: "text", text: "Hello!" }],
        stop_reason: "end_turn",
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data?.[0].role).toBe("assistant");
      // Pure-text content arrays are preserved as-is (no Anthropic-specific blocks)
      expect(result.data?.[0].content).toEqual([
        { type: "text", text: "Hello!" },
      ]);
    });

    it("should pass through multiple text blocks without destructive normalization", () => {
      const output = {
        role: "assistant",
        content: [
          { type: "text", text: "First paragraph." },
          { type: "text", text: "Second paragraph." },
        ],
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      // Pure-text content arrays are preserved as-is
      expect(result.data?.[0].content).toEqual([
        { type: "text", text: "First paragraph." },
        { type: "text", text: "Second paragraph." },
      ]);
    });

    it("should pass through messages with string content unchanged", () => {
      const input = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there" },
      ];

      const result = normalizeInput(input, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data?.[0].content).toBe("Hello");
      expect(result.data?.[1].content).toBe("Hi there");
    });

    it("should handle mixed thinking + tool_use in same message", () => {
      const output = {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I should look up the weather.",
            signature: "sig_xyz",
          },
          { type: "text", text: "Let me check." },
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { city: "Berlin" },
          },
        ],
      };

      const result = normalizeOutput(output, anthropicCtx);
      expect(result.success).toBe(true);
      expect(result.data?.[0].content).toBe("Let me check.");
      expect(result.data?.[0].tool_calls).toHaveLength(1);
      expect(result.data?.[0].thinking).toEqual([
        {
          type: "thinking",
          content: "I should look up the weather.",
          signature: "sig_xyz",
        },
      ]);
    });
  });

  describe("extractToolEvents", () => {
    it("should extract tool_use events", () => {
      const message = {
        content: [
          {
            type: "tool_use",
            id: "toolu_01",
            name: "get_weather",
            input: { city: "Berlin" },
          },
        ],
      };

      const events = anthropicAdapter.extractToolEvents!(message);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "call",
        id: "toolu_01",
        name: "get_weather",
        argsJson: '{"city":"Berlin"}',
      });
    });

    it("should extract tool_result events with error status", () => {
      const message = {
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_01",
            content: "Not found",
            is_error: true,
          },
        ],
      };

      const events = anthropicAdapter.extractToolEvents!(message);
      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        type: "result",
        id: "toolu_01",
        content: "Not found",
        status: "error",
      });
    });
  });
});
