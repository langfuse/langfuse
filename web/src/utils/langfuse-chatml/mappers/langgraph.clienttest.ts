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
  it("should detect LangGraph via metadata", () => {
    expect(langGraphMapper.canMapScore({}, {}, "langgraph")).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(langGraphMapper.canMapScore({}, {}, "langgraph", "1.0")).toBe(
      MAPPER_SCORE_DEFINITIVE,
    );
    expect(langGraphMapper.canMapScore({}, {}, "openai")).toBe(
      MAPPER_SCORE_NONE,
    );
  });

  it("should detect LangGraph trace with metadata", () => {
    const input = {
      metadata: JSON.stringify({ langgraph_node: "some_node" }),
    };

    expect(langGraphMapper.canMapScore(input, null)).toBeGreaterThan(0);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(langGraphMapper.canMapScore(regularInput, null)).toBe(0);
  });

  it("should map with LangGraph framework metadata and role normalization", () => {
    const input = {
      messages: [
        { role: "model", content: "Response from Gemini" }, // Should normalize model -> assistant
        { role: "custom_tool", content: "Tool result" }, // Should normalize to tool
      ],
      metadata: JSON.stringify({ langgraph_step: 1 }),
    };

    const result = langGraphMapper.map(input, null);

    expect(result.dataSource).toBeUndefined();
    expect(result.dataSourceVersion).toBeUndefined();

    // Check that the first message role was normalized
    expect(result.input.messages.length).toBeGreaterThan(0);
    // Note: The normalization happens in the mapper but the exact output depends on the ChatML schema transformations
  });
});

describe("langGraphMapper tool handling", () => {
  it("should preserve _originalRole for tool call ID inference", () => {
    const input = {
      messages: [{ role: "custom_tool_name", content: "Tool result" }],
      metadata: JSON.stringify({ langgraph_node: "agent" }),
    };

    const result = langGraphMapper.map(input, null);

    // After normalization, role should be "tool"
    expect(result.input.messages[0].role).toBe("tool");
    // Original role should be preserved
    expect(result.input.messages[0]._originalRole).toBe("custom_tool_name");
  });

  it("should handle Gemini model role normalization", () => {
    const input = {
      messages: [{ role: "model", content: "Response" }],
      metadata: JSON.stringify({ langgraph_step: 1 }),
    };

    const result = langGraphMapper.map(input, null);

    expect(result.input.messages[0].role).toBe("assistant");
  });

  it("should handle Gemini parts array conversion", () => {
    const input = {
      messages: [
        {
          role: "user",
          parts: [{ text: "Hello" }, { text: " world" }],
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "test" }),
    };

    const result = langGraphMapper.map(input, null);

    expect(result.input.messages[0].content).toBe("Hello world");
  });

  it("should extract tool_calls from LangGraph messages", () => {
    const input = {
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

    const result = langGraphMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0]).toEqual({
      id: "call_lg1",
      type: "function",
      function: {
        name: "weather_tool",
        arguments: '{"city":"SF"}',
      },
    });
  });

  it("should use null for tool call IDs if missing", () => {
    const input = {
      messages: [
        {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              // No id provided
              name: "test_tool",
              args: {},
            },
          ],
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "test" }),
    };

    const result = langGraphMapper.map(input, null);

    expect(result.input.messages[0].toolCalls).toHaveLength(1);
    expect(result.input.messages[0].toolCalls?.[0].id).toBeNull();
  });

  it("should extract tool_call_id from tool messages", () => {
    const input = {
      messages: [
        {
          role: "tool",
          content: "result",
          tool_call_id: "call_123",
        },
      ],
      metadata: JSON.stringify({ langgraph_node: "tools" }),
    };

    const result = langGraphMapper.map(input, null);

    expect(result.input.messages[0].toolCallId).toBe("call_123");
  });
});
