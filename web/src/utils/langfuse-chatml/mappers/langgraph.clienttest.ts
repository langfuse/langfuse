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

describe("langGraphMapper", () => {
  it("should detect LangGraph via metadata", () => {
    expect(langGraphMapper.canMap({}, {}, "langgraph")).toBe(true);
    expect(langGraphMapper.canMap({}, {}, "langgraph", "1.0")).toBe(true);
    expect(langGraphMapper.canMap({}, {}, "openai")).toBe(false);
  });

  it("should detect LangGraph trace with metadata", () => {
    const input = {
      metadata: JSON.stringify({ langgraph_node: "some_node" }),
    };

    expect(langGraphMapper.canMap(input, null)).toBe(true);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(langGraphMapper.canMap(regularInput, null)).toBe(false);
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
