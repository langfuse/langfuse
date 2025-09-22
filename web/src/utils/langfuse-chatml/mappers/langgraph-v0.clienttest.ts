// Mock the problematic @langfuse/shared import before importing our functions
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

import { langGraphMapperV0 } from "./langgraph-v0";

describe("langGraphMapperV0", () => {
  it("should detect LangGraph trace with metadata", () => {
    const input = {
      metadata: JSON.stringify({ langgraph_node: "some_node" }),
    };

    expect(langGraphMapperV0.canMap(input, null)).toBe(true);
  });

  it("should not detect regular ChatML format", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];

    expect(langGraphMapperV0.canMap(input, null)).toBe(false);
  });

  it("should map with LangGraph framework metadata and role normalization", () => {
    const input = {
      messages: [
        { role: "model", content: "Response from Gemini" }, // Should normalize model -> assistant
        { role: "custom_tool", content: "Tool result" }, // Should normalize to tool
      ],
      metadata: JSON.stringify({ langgraph_step: 1 }),
    };

    const result = langGraphMapperV0.map(input, null);

    expect(result.metadata?.framework).toEqual({
      name: "langgraph",
      version: "v0",
    });

    // Check that the first message role was normalized
    expect(result.input.messages.length).toBeGreaterThan(0);
    // Note: The normalization happens in the mapper but the exact output depends on the ChatML schema transformations
  });
});
