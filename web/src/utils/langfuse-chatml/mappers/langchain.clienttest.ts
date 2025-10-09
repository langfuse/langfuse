// TODO: remove this mock...
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
    OpenAIToolSchema: z.object({
      type: z.literal("function"),
      function: z.object({
        name: z.string(),
        description: z.string(),
        parameters: z.any(),
      }),
    }),
  };
});

import { langChainMapper } from "./langchain";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("langChainMapper", () => {
  it("should detect LangChain via metadata and structural indicators", () => {
    // Metadata detection: ls_ prefix (LangSmith convention)
    const metadata = {
      tags: ["seq:step:1"],
      ls_provider: "amazon_bedrock",
      ls_model_name: "eu.anthropic.claude-3-haiku-20240307-v1:0",
      ls_model_type: "chat",
      ls_temperature: 0.1,
    };

    expect(langChainMapper.canMapScore({}, {}, metadata)).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(langChainMapper.canMapScore({}, {}, { ls_provider: "openai" })).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(
      langChainMapper.canMapScore({}, {}, { framework: "langchain" }),
    ).toBe(MAPPER_SCORE_DEFINITIVE);
    expect(
      langChainMapper.canMapScore({}, {}, { some_provider: "openai" }),
    ).toBe(MAPPER_SCORE_NONE);

    // Structural detection: additional_kwargs
    const inputWithStructure = {
      messages: [
        {
          role: "assistant",
          content: "Let me help",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_123",
                function: { name: "search", arguments: '{"q":"test"}' },
              },
            ],
          },
        },
      ],
    };

    expect(
      langChainMapper.canMapScore(inputWithStructure, null),
    ).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = {
      messages: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
      ],
    };
    expect(langChainMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should handle tool calls and results", () => {
    // Extract tool_calls from additional_kwargs (standard format)
    const input1 = {
      messages: [
        {
          role: "assistant",
          content: "Using tools",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_lc1",
                function: {
                  name: "weather_tool",
                  arguments: '{"city": "NYC"}',
                },
              },
            ],
          },
          custom_field: "preserved",
        },
      ],
    };

    const result1 = langChainMapper.map(input1, null);
    expect(result1.input.messages[0].toolCalls).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_lc1",
      type: "function",
      function: {
        name: "weather_tool",
        arguments: '{"city": "NYC"}',
      },
    });
    expect(result1.input.messages[0].json).toEqual({
      custom_field: "preserved",
    });

    // Handle object arguments (not string)
    const input2 = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_lc2",
                function: {
                  name: "calculator",
                  arguments: { operation: "add", a: 1, b: 2 },
                },
              },
            ],
          },
        },
      ],
    };

    const result2 = langChainMapper.map(input2, null);
    expect(result2.input.messages[0].toolCalls?.[0].function.arguments).toBe(
      '{"operation":"add","a":1,"b":2}',
    );

    // Handle missing tool call ID
    const input3 = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                function: {
                  name: "test_tool",
                  arguments: "{}",
                },
              },
            ],
          },
        },
      ],
    };

    const result3 = langChainMapper.map(input3, null);
    expect(result3.input.messages[0].toolCalls?.[0].id).toBeNull();

    // Handle shorthand format (name/args instead of function.name/function.arguments)
    const input4 = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_short",
                name: "shorthand_tool",
                args: { key: "value" },
              },
            ],
          },
        },
      ],
    };

    const result4 = langChainMapper.map(input4, null);
    expect(result4.input.messages[0].toolCalls?.[0].function).toEqual({
      name: "shorthand_tool",
      arguments: '{"key":"value"}',
    });

    // Extract tool_call_id from tool result messages
    const input5 = {
      messages: [
        {
          role: "tool",
          content: "result",
          tool_call_id: "call_lc123",
        },
      ],
    };

    const result5 = langChainMapper.map(input5, null);
    expect(result5.input.messages[0].toolCallId).toBe("call_lc123");
  });

  it("should extract tool definitions to additional.tools", () => {
    // Basic tool definition extraction
    const input1 = {
      messages: [
        {
          role: "tool",
          content: JSON.stringify({
            type: "function",
            function: {
              name: "search",
              description: "Search the web",
              parameters: {
                type: "object",
                properties: {
                  query: { type: "string", description: "Search query" },
                },
                required: ["query"],
              },
            },
          }),
        },
        {
          role: "tool",
          content: JSON.stringify({
            type: "function",
            function: {
              name: "calculator",
              description: "Perform calculations",
              parameters: {
                type: "object",
                properties: {
                  expression: { type: "string" },
                },
              },
            },
          }),
        },
        {
          role: "user",
          content: "Search for cats",
        },
      ],
    };

    const result1 = langChainMapper.map(input1, null);
    expect(result1.input.additional?.tools).toHaveLength(2);
    expect((result1.input.additional?.tools as any)?.[0]).toEqual({
      name: "search",
      description: "Search the web",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query" },
        },
        required: ["query"],
      },
    });
    expect(result1.input.messages).toHaveLength(1);
    expect(result1.input.messages[0].role).toBe("user");

    // Mixed: tool definitions + tool calls + tool results
    const input2 = {
      messages: [
        {
          role: "tool",
          content: JSON.stringify({
            type: "function",
            function: {
              name: "weather",
              description: "Get weather",
              parameters: { type: "object", properties: {} },
            },
          }),
        },
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_1",
                function: { name: "weather", arguments: '{"city":"SF"}' },
              },
            ],
          },
        },
        {
          role: "tool",
          content: "Sunny, 72°F",
          tool_call_id: "call_1",
        },
      ],
    };

    const result2 = langChainMapper.map(input2, null);
    expect(result2.input.additional?.tools).toHaveLength(1);
    expect((result2.input.additional?.tools as any)?.[0].name).toBe("weather");
    expect(result2.input.messages).toHaveLength(2);
    expect(result2.input.messages[0].role).toBe("assistant");
    expect(result2.input.messages[0].toolCalls).toHaveLength(1);
    expect(result2.input.messages[1].role).toBe("tool");
    expect(result2.input.messages[1].toolCallId).toBe("call_1");
  });
});
