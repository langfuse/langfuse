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

    // Test with metadata
    // TODO: remove ls_... checks
    const resultWithMeta = mapToLangfuseChatML(input, null, {
      ls_provider: "openai",
      ls_version: "1.0",
    });
    expect(resultWithMeta.dataSource).toBe("openai");
    expect(resultWithMeta.dataSourceVersion).toBe("1.0");

    // Test with structural detection (no metadata)
    const resultNoMeta = mapToLangfuseChatML(input, null);
    expect(resultNoMeta.dataSource).toBeUndefined();
    expect(resultNoMeta.dataSourceVersion).toBeUndefined();
    expect(resultNoMeta.canDisplayAsChat()).toBe(true);
    expect(resultNoMeta.input.additional).toEqual({
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    });
  });

  it("should auto-detect and map LangGraph format", () => {
    const input = {
      messages: [{ role: "model", content: "Response from Gemini" }],
      metadata: JSON.stringify({ langgraph_node: "agent_node" }),
    };

    // Test with metadata
    // TODO: remove ls_... checks
    const resultWithMeta = mapToLangfuseChatML(input, null, {
      framework: "langgraph",
      ls_version: "2.1",
    });
    expect(resultWithMeta.dataSource).toBe("langgraph");
    expect(resultWithMeta.dataSourceVersion).toBe("2.1");

    // Test with structural detection (no metadata)
    const resultNoMeta = mapToLangfuseChatML(input, null);
    expect(resultNoMeta.dataSource).toBeUndefined();
    expect(resultNoMeta.dataSourceVersion).toBeUndefined();
    expect(resultNoMeta.canDisplayAsChat()).toBe(true);

    // Check that model role was normalized to assistant
    const allMessages = resultNoMeta.getAllMessages();
    expect(allMessages.some((m) => m.role === "assistant")).toBe(true);
  });

  it("should fallback to generic mapper for regular ChatML", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "How can I help?" };

    const result = mapToLangfuseChatML(input, output);

    // Should use generic mapper (no data source info)
    expect(result.dataSource).toBeUndefined();
    expect(result.dataSourceVersion).toBeUndefined();
    expect(result.canDisplayAsChat()).toBe(true);

    const allMessages = result.getAllMessages();
    expect(allMessages).toHaveLength(3); // 2 input + 1 output
  });
});
