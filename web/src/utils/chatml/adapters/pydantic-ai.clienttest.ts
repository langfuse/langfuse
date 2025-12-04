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
              id: "call_X0OSgjUukT5inyEQvuZQnHrk",
              name: "get_pun_suggestion",
              arguments: {
                topic: "programming",
              },
            },
            {
              type: "tool_call",
              id: "call_WxZcCvSDhGT4RJHlcU01k10x",
              name: "get_dad_joke_suggestion",
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
              id: "call_X0OSgjUukT5inyEQvuZQnHrk",
              name: "get_pun_suggestion",
              result:
                "Pun idea: Play on words related to 'programming' - think about homophones or double meanings",
            },
            {
              type: "tool_call_response",
              id: "call_WxZcCvSDhGT4RJHlcU01k10x",
              name: "get_dad_joke_suggestion",
              result:
                "Dad joke idea: Use a classic setup-punchline format about 'programming' with a groan-worthy twist",
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
        },
      });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(5); // Tool responses are split into separate messages

      // First message - system
      expect(result.data?.[0].role).toBe("system");
      expect(result.data?.[0].content).toBe("You are a creative joke writer.");

      // Second message - user
      expect(result.data?.[1].role).toBe("user");
      expect(result.data?.[1].content).toBe(
        "Tell me a joke about programming.",
      );

      // Third message - assistant with tool calls
      expect(result.data?.[2].role).toBe("assistant");
      expect(result.data?.[2].tool_calls).toHaveLength(2);
      expect(result.data?.[2].tool_calls?.[0]).toEqual({
        id: "call_X0OSgjUukT5inyEQvuZQnHrk",
        name: "get_pun_suggestion",
        arguments: '{"topic":"programming"}',
        type: "function",
      });
      expect(result.data?.[2].tool_calls?.[1]).toEqual({
        id: "call_WxZcCvSDhGT4RJHlcU01k10x",
        name: "get_dad_joke_suggestion",
        arguments: '{"topic":"programming"}',
        type: "function",
      });

      // Fourth message - first tool response
      expect(result.data?.[3].role).toBe("tool");
      expect(result.data?.[3].tool_call_id).toBe(
        "call_X0OSgjUukT5inyEQvuZQnHrk",
      );
      expect(result.data?.[3].content).toContain("Pun idea");

      // Fifth message - second tool response
      expect(result.data?.[4].role).toBe("tool");
      expect(result.data?.[4].tool_call_id).toBe(
        "call_WxZcCvSDhGT4RJHlcU01k10x",
      );
      expect(result.data?.[4].content).toContain("Dad joke idea");
    });
  });
});
