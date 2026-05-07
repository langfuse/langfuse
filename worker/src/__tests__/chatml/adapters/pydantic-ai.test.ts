import { describe, it, expect } from "vitest";
import {
  pydanticAIAdapter,
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

describe("Pydantic AI Adapter", () => {
  describe("detection and parsing", () => {
    it("should parse pydantic-ai messages with parts-based tool calls", () => {
      const input = [
        {
          role: "system",
          parts: [
            {
              type: "text",
              content: "You are a creative joke writer.",
            },
          ],
        },
        {
          role: "user",
          parts: [
            {
              type: "text",
              content: "Tell me a joke about programming.",
            },
          ],
        },
        {
          role: "assistant",
          parts: [
            {
              type: "tool_call",
              id: "call_123",
              name: "get_pun_suggestion",
              arguments: {
                topic: "programming",
              },
            },
          ],
          finish_reason: "tool_call",
        },
        {
          role: "user",
          parts: [
            {
              type: "tool_call_response",
              id: "call_123",
              name: "get_pun_suggestion",
              result:
                "Pun idea: Play on words related to 'programming' - think about homophones or double meanings",
            },
          ],
        },
      ];

      const result = normalizeInput(input, {
        metadata: {
          scope: {
            name: "pydantic-ai",
            version: "1.26.0",
          },
          attributes: {
            model_request_parameters: {
              function_tools: [
                {
                  name: "get_pun_suggestion",
                  description: "Get a pun-style joke suggestion",
                  parameters_json_schema: {
                    type: "object",
                    properties: {
                      topic: { type: "string" },
                    },
                    required: ["topic"],
                  },
                },
                {
                  name: "get_dad_joke_suggestion",
                  description: "Get a dad joke suggestion",
                  parameters_json_schema: {
                    type: "object",
                    properties: {
                      topic: { type: "string" },
                    },
                    required: ["topic"],
                  },
                },
              ],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(4); // system, user, assistant, tool response

      // First message - system
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[0].content).toBe("You are a creative joke writer.");

      // Check AVAILABLE tools are attached to messages
      expect(result.data?.[0].tools).toHaveLength(2);
      expect(result.data?.[0].tools?.[0]).toEqual({
        name: "get_pun_suggestion",
        description: "Get a pun-style joke suggestion",
        parameters: {
          type: "object",
          properties: {
            topic: { type: "string" },
          },
          required: ["topic"],
        },
      });

      // Second message - user
      expect(result.data?.[1].role).toBe("user");
      expect(result.data?.[1].content).toBe(
        "Tell me a joke about programming.",
      );
      expect(result.data?.[1].tools).toHaveLength(2); // Available tools attached

      // Third message - assistant with CALLED tool
      expect(result.data?.[2].role).toBe("assistant");
      expect(result.data?.[2].tools).toHaveLength(2); // 2 tools available

      // But only 1 tool was called
      expect(result.data?.[2].tool_calls).toHaveLength(1);
      expect(result.data?.[2].tool_calls?.[0]).toEqual({
        id: "call_123",
        name: "get_pun_suggestion",
        arguments: '{"topic":"programming"}',
        type: "function",
      });

      // Fourth message - tool response
      expect(result.data?.[3].role).toBe("tool");
      expect(result.data?.[3].tool_call_id).toBe("call_123");
      expect(result.data?.[3].content).toContain("Pun idea");
      expect(result.data?.[3].tools).toHaveLength(2); // Available tools attached
    });

    it("should extract thinking parts", () => {
      const output = [
        {
          role: "assistant",
          parts: [
            {
              type: "thinking",
              content:
                "The user wants weather info.\n- Location: NYC\n- Need to call weather API",
            },
            {
              type: "tool_call",
              id: "toolu_123",
              name: "get_weather",
              arguments: { city: "NYC" },
            },
          ],
        },
      ];

      const metadata = {
        attributes: {
          "gen_ai.operation.name": "chat",
          "gen_ai.request.model": "claude-sonnet-4-5@20250929",
          model_request_parameters: {
            function_tools: [
              {
                name: "get_weather",
                description: "Get weather for a city",
                parameters_json_schema: {
                  type: "object",
                  properties: { city: { type: "string" } },
                },
              },
            ],
          },
        },
        scope: { name: "pydantic-ai" },
      };

      const result = normalizeInput(output, { metadata });

      expect(result.success).toBe(true);
      expect(result.data?.[0].thinking?.[0].content).toContain("NYC");
      expect(result.data?.[0].tool_calls?.[0].name).toBe("get_weather");
      expect(result.data?.[0].tools?.[0].name).toBe("get_weather");
    });
  });
});
