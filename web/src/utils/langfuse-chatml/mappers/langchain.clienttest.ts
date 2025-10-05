// TODO: remove this mock...
jest.mock("@langfuse/shared", () => ({
  ChatMessageRole: {
    System: "system",
    Developer: "developer",
    User: "user",
    Assistant: "assistant",
    Tool: "tool",
    Model: "model",
  },
}));

import { langChainMapper } from "./langchain";

describe("langChainMapper", () => {
  it("should detect LangChain via metadata", () => {
    expect(langChainMapper.canMapScore({}, {}, "langchain")).toBe(100);
    expect(langChainMapper.canMapScore({}, {}, "langchain", "1.0")).toBe(100);
    expect(langChainMapper.canMapScore({}, {}, "openai")).toBe(0);
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

    // additional_kwargs should be removed from json
    expect(result.input.messages[0].json).toBeUndefined();
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

    expect(result.input.messages[0].json).toEqual({
      custom_field: "preserved",
    });
  });
});
