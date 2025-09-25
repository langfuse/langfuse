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

describe("openAIMapper", () => {
  it("should detect OpenAI via metadata", () => {
    expect(openAIMapper.canMap({}, {}, "openai")).toBe(true);
    expect(openAIMapper.canMap({}, {}, "openai", "1.0")).toBe(true);
    expect(openAIMapper.canMap({}, {}, "langgraph")).toBe(false);
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

    expect(openAIMapper.canMap(input, null)).toBe(true);

    // Should not detect regular ChatML
    const regularInput = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    expect(openAIMapper.canMap(regularInput, null)).toBe(false);
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
