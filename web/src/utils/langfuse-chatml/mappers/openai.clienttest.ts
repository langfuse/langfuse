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
  it("should detect OpenAI via metadata and structural indicators", () => {
    // Metadata detection: ls_provider
    // TODO: remove ls_... check -> should be oai specific
    expect(openAIMapper.canMapScore({}, {}, { ls_provider: "openai" })).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(
      openAIMapper.canMapScore(
        {},
        {},
        { ls_provider: "openai", ls_version: "1.0" },
      ),
    ).toBe(MAPPER_SCORE_DEFINITIVE);
    expect(openAIMapper.canMapScore({}, {}, { framework: "langgraph" })).toBe(
      MAPPER_SCORE_NONE,
    );

    // Structural detection: Parts API
    const partsInput = {
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
    expect(openAIMapper.canMapScore(partsInput, null)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(openAIMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should handle tool calls and tool results", () => {
    // Test assistant message with tool_calls
    const inputWithToolCalls = {
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
          custom_field: "should_be_preserved",
        },
      ],
    };

    const result1 = openAIMapper.map(inputWithToolCalls, null);
    expect(result1.input.messages).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_abc123",
      type: "function",
      function: {
        name: "get_weather",
        arguments: '{"city": "NYC"}',
      },
    });
    expect(result1.input.messages[0].content).toBe("Let me check that for you");
    expect(result1.input.messages[0].json).toEqual({
      custom_field: "should_be_preserved",
    });

    // Test tool message with tool_call_id
    const inputWithToolResult = {
      messages: [
        {
          role: "tool",
          content: '{"temperature": 72}',
          tool_call_id: "call_abc123",
        },
      ],
    };

    const result2 = openAIMapper.map(inputWithToolResult, null);
    expect(result2.input.messages).toHaveLength(1);
    expect(result2.input.messages[0].toolCallId).toBe("call_abc123");
    expect(result2.input.messages[0].content).toBe('{"temperature": 72}');

    // Test object arguments (not string)
    const inputWithObjectArgs = {
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

    const result3 = openAIMapper.map(inputWithObjectArgs, null);
    expect(result3.input.messages[0].toolCalls?.[0].function.arguments).toBe(
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
