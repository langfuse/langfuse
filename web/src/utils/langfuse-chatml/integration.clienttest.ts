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

import { mapToLangfuseChatML } from "./index";

describe("LangfuseChatML Integration", () => {
  it("should auto-detect and map OpenAI Parts format", () => {
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
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    };

    const result = mapToLangfuseChatML(input, null);

    expect(result.metadata?.framework).toEqual({
      name: "openai",
      version: "v0",
    });
    expect(result.canDisplayAsChat()).toBe(true);
    expect(result.input.additional).toEqual({
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    });
  });

  it("should auto-detect and map LangGraph format", () => {
    const input = {
      messages: [{ role: "model", content: "Response from Gemini" }],
      metadata: JSON.stringify({ langgraph_node: "agent_node" }),
    };

    const result = mapToLangfuseChatML(input, null);

    expect(result.metadata?.framework).toEqual({
      name: "langgraph",
      version: "v0",
    });
    expect(result.canDisplayAsChat()).toBe(true);

    // Check that model role was normalized to assistant
    const allMessages = result.getAllMessages();
    expect(allMessages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("should fallback to generic mapper for regular ChatML", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "How can I help?" };

    const result = mapToLangfuseChatML(input, output);

    // Should use generic mapper (no framework metadata)
    expect(result.metadata?.framework).toBeUndefined();
    expect(result.canDisplayAsChat()).toBe(true);

    const allMessages = result.getAllMessages();
    expect(allMessages).toHaveLength(3); // 2 input + 1 output
  });
});
