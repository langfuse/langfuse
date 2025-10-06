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
  it("should detect LangChain via metadata", () => {
    const metadata = {
      tags: ["seq:step:1"],
      ls_provider: "amazon_bedrock",
      ls_model_name: "eu.anthropic.claude-3-haiku-20240307-v1:0",
      ls_model_type: "chat",
      ls_temperature: 0.1,
    };

    // immediately detect as langchain due to ls_provider presence
    expect(langChainMapper.canMapScore({}, {}, metadata)).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );

    // works with just ls_provider
    expect(langChainMapper.canMapScore({}, {}, { ls_provider: "openai" })).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );

    // Should work with framework field
    expect(
      langChainMapper.canMapScore({}, {}, { framework: "langchain" }),
    ).toBe(MAPPER_SCORE_DEFINITIVE);

    // Should not detect non-langchain providers
    expect(
      langChainMapper.canMapScore({}, {}, { some_provider: "openai" }),
    ).toBe(MAPPER_SCORE_NONE);
  });

  it("should detect LangChain trace via additional_kwargs structure", () => {
    const input = {
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

    expect(langChainMapper.canMapScore(input, null)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = {
      messages: [
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
      ],
    };
    expect(langChainMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should extract tool_calls from additional_kwargs", () => {
    const input = {
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
        },
      ],
    };

    const result = langChainMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_lc1",
      type: "function",
      function: {
        name: "weather_tool",
        arguments: '{"city": "NYC"}',
      },
    });
  });

  it("should handle tool_calls with object arguments", () => {
    const input = {
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

    const result = langChainMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0].function.arguments).toBe(
      '{"operation":"add","a":1,"b":2}',
    );
  });

  it("should handle missing tool call ID", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                // No id
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

    const result = langChainMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0].id).toBeNull();
  });

  it("should extract tool_call_id from tool messages", () => {
    const input = {
      messages: [
        {
          role: "tool",
          content: "result",
          tool_call_id: "call_lc123",
        },
      ],
    };

    const result = langChainMapper.map(input, null);

    expect(result.input.messages[0].toolCallId).toBe("call_lc123");
  });

  it("should handle shorthand tool_calls format", () => {
    const input = {
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

    const result = langChainMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0].function).toEqual({
      name: "shorthand_tool",
      arguments: '{"key":"value"}',
    });
  });

  it("should remove additional_kwargs after processing tool_calls", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_1",
                function: { name: "tool", arguments: "{}" },
              },
            ],
          },
        },
      ],
    };

    const result = langChainMapper.map(input, null);
  });

  it("should preserve other fields in json after removing additional_kwargs", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          additional_kwargs: {
            tool_calls: [
              {
                id: "call_1",
                function: { name: "tool", arguments: "{}" },
              },
            ],
          },
          custom_field: "preserved",
        },
      ],
    };

    const result = langChainMapper.map(input, null);

    // Custom fields should be preserved after removing additional_kwargs
    expect(result.input.messages[0].json).toEqual({
      custom_field: "preserved",
    });
  });

  it("should extract tool definitions from LangChain tool messages into additional.tools", () => {
    const input = {
      messages: [
        // Tool definition message (special LangChain format)
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
        // Another tool definition
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
        // Regular user message
        {
          role: "user",
          content: "Search for cats",
        },
      ],
    };

    const result = langChainMapper.map(input, null);

    // Tool definitions should be extracted to additional.tools
    expect(result.input.additional?.tools).toHaveLength(2);
    expect((result.input.additional?.tools as any)?.[0]).toEqual({
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

    // Tool definition messages shouldn't appear in regular messages
    expect(result.input.messages).toHaveLength(1);
    expect(result.input.messages[0].role).toBe("user");
    expect(result.input.messages[0].content).toBe("Search for cats");
  });

  it("should handle mixed tool definitions and tool results", () => {
    const input = {
      messages: [
        // Tool definition (schema)
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
        // Assistant calling tool
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
        // Tool result (actual execution result)
        {
          role: "tool",
          content: "Sunny, 72°F",
          tool_call_id: "call_1",
        },
      ],
    };

    const result = langChainMapper.map(input, null);

    // Tool definition extracted
    expect(result.input.additional?.tools).toHaveLength(1);
    expect((result.input.additional?.tools as any)?.[0].name).toBe("weather");

    // Messages should have assistant tool call and tool result, but NOT tool definition
    expect(result.input.messages).toHaveLength(2);
    expect(result.input.messages[0].role).toBe("assistant");
    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[1].role).toBe("tool");
    expect(result.input.messages[1].toolCallId).toBe("call_1");
  });
});
