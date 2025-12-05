jest.mock("@langfuse/shared", () => {
  const { z } = require("zod/v4");

  return {
    ChatMessageRole: {
      System: "system",
      Developer: "developer",
      User: "user",
      Assistant: "assistant",
      Tool: "tool",
      Model: "model",
    },
    BaseChatMlMessageSchema: z
      .object({
        role: z.string().optional(),
        name: z.string().optional(),
        content: z
          .union([
            z.record(z.string(), z.any()),
            z.string(),
            z.array(z.any()),
            z.any(),
          ])
          .nullish(),
        audio: z.any().optional(),
        additional_kwargs: z.record(z.string(), z.any()).optional(),
        tools: z.array(z.any()).optional(),
        tool_calls: z.array(z.any()).optional(),
        tool_call_id: z.string().optional(),
      })
      .passthrough(),
  };
});

import { normalizeInput } from "./index";

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
  });
});
