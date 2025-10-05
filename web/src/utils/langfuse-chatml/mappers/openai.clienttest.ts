// TODO: remove
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

import { openAIMapper } from "./openai";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("openAIMapper", () => {
  it("should detect OpenAI via metadata", () => {
    expect(openAIMapper.canMapScore({}, {}, "openai")).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(openAIMapper.canMapScore({}, {}, "openai", "1.0")).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(openAIMapper.canMapScore({}, {}, "langgraph")).toBe(
      MAPPER_SCORE_NONE,
    );
  });

  it("should detect OpenAI Parts API structure", () => {
    const input = {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What's in this image?" },
            {
              type: "image_url",
              image_url: { url: "data:image/jpeg;base64,..." },
            },
          ],
        },
      ],
    };

    expect(openAIMapper.canMapScore(input, null)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(openAIMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should map with OpenAI framework metadata", () => {
    const input = {
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Test message" }],
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.dataSource).toBeUndefined();
    expect(result.dataSourceVersion).toBeUndefined();
  });
});

describe("openAIMapper tool call handling", () => {
  it("should extract tool_calls from assistant message", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "Let me check that for you",
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city": "NYC"}',
              },
            },
          ],
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages).toHaveLength(1);
    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_abc123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"city": "NYC"}',
      },
    });
    expect(result.input.messages[0].content).toBe("Let me check that for you");
  });

  it("should extract tool_call_id from tool message", () => {
    const input = {
      messages: [
        {
          role: "tool",
          content: '{"temperature": 72}',
          tool_call_id: "call_abc123",
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages).toHaveLength(1);
    expect(result.input.messages[0].toolCallId).toBe("call_abc123");
    expect(result.input.messages[0].content).toBe('{"temperature": 72}');
  });

  it("should handle multiple tool calls in one message", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "Checking multiple things",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "get_weather",
                arguments: '{"city": "NYC"}',
              },
            },
            {
              id: "call_2",
              type: "function",
              function: {
                name: "get_time",
                arguments: '{"timezone": "EST"}',
              },
            },
          ],
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages).toHaveLength(1);
    expect(result.input.messages[0].toolCalls).toHaveLength(2);
    expect(result.input.messages[0].toolCalls?.[0].function.name).toBe(
      "get_weather",
    );
    expect(result.input.messages[0].toolCalls?.[1].function.name).toBe(
      "get_time",
    );
  });

  it("should preserve json field after extracting tool_calls", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "Response",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "test", arguments: "{}" },
            },
          ],
          custom_field: "should_be_preserved",
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].json).toEqual({
      custom_field: "should_be_preserved",
    });
  });

  it("should handle tool calls with object arguments (not string)", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_obj",
              type: "function",
              function: {
                name: "test_func",
                arguments: { key: "value", nested: { data: 123 } },
              },
            },
          ],
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages[0].toolCalls?.[0].function.arguments).toBe(
      '{"key":"value","nested":{"data":123}}',
    );
  });

  it("should not add toolCalls or toolCallId if not present", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "Regular message without tools",
        },
      ],
    };

    const result = openAIMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toBeUndefined();
    expect(result.input.messages[0].toolCallId).toBeUndefined();
  });
});
