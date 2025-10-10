// TODO: remove this mock
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

import { langGraphMapper } from "./langgraph";
import { MAPPER_SCORE_DEFINITIVE, MAPPER_SCORE_NONE } from "./base";

describe("langGraphMapper", () => {
  it("should detect LangGraph via metadata and structural indicators", () => {
    // Metadata detection: framework or ls_provider
    expect(
      langGraphMapper.canMapScore({}, {}, { framework: "langgraph" }),
    ).toBe(MAPPER_SCORE_DEFINITIVE);
    expect(
      langGraphMapper.canMapScore({}, {}, { ls_provider: "langgraph" }),
    ).toBe(MAPPER_SCORE_DEFINITIVE);
    expect(
      langGraphMapper.canMapScore({}, {}, { some_provider: "openai" }),
    ).toBe(MAPPER_SCORE_NONE);

    // Structural detection: langgraph_node or langgraph_step in metadata
    const inputWithStructure = {
      metadata: JSON.stringify({ langgraph_node: "some_node" }),
    };
    expect(
      langGraphMapper.canMapScore(inputWithStructure, null),
    ).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(langGraphMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should normalize roles (Gemini support)", () => {
    // Normalize Gemini "model" role to "assistant"
    const input1 = {
      messages: [{ role: "model", content: "Response from Gemini" }],
      metadata: JSON.stringify({ langgraph_step: 1 }),
    };

    const result1 = langGraphMapper.map(input1, null);
    expect(result1.input.messages[0].role).toBe("assistant");

    // Preserve _originalRole for custom tool names (used for tool call ID inference)
    const input2 = {
      messages: [{ role: "custom_tool_name", content: "Tool result" }],
      metadata: JSON.stringify({ langgraph_node: "agent" }),
    };

    const result2 = langGraphMapper.map(input2, null);
    expect(result2.input.messages[0].role).toBe("tool");
    expect(result2.input.messages[0]._originalRole).toBe("custom_tool_name");

    // Handle Gemini parts array conversion
    const input3 = {
      messages: [
        {
          role: "user",
          parts: [{ text: "Hello" }, { text: " world" }],
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "test" }),
    };

    const result3 = langGraphMapper.map(input3, null);
    expect(result3.input.messages[0].content).toBe("Hello world");
  });

  it("should handle tool calls and results", () => {
    // Extract tool_calls from LangGraph messages
    const input1 = {
      messages: [
        {
          role: "assistant",
          content: "Using tools",
          tool_calls: [
            {
              id: "call_lg1",
              name: "weather_tool",
              args: { city: "SF" },
            },
          ],
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "agent" }),
    };

    const result1 = langGraphMapper.map(input1, null);
    expect(result1.input.messages[0].toolCalls).toHaveLength(1);
    expect(result1.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_lg1",
      type: "function",
      function: {
        name: "weather_tool",
        arguments: '{"city":"SF"}',
      },
    });

    // Handle missing tool call IDs (use null)
    const input2 = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              name: "test_tool",
              args: {},
            },
          ],
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "test" }),
    };

    const result2 = langGraphMapper.map(input2, null);
    expect(result2.input.messages[0].toolCalls?.[0].id).toBeNull();

    // Extract tool_call_id from tool result messages
    const input3 = {
      messages: [
        {
          role: "tool",
          content: "result",
          tool_call_id: "call_123",
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "tools" }),
    };

    const result3 = langGraphMapper.map(input3, null);
    expect(result3.input.messages[0].toolCallId).toBe("call_123");
  });
});
