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

import { openAIMapperV0 } from "./openai-v0";

describe("openAIMapperV0", () => {
  it("should detect OpenAI Parts API format", () => {
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

    expect(openAIMapperV0.canMap(input, null)).toBe(true);
  });

  it("should not detect regular ChatML format", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];

    expect(openAIMapperV0.canMap(input, null)).toBe(false);
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

    const result = openAIMapperV0.map(input, null);

    expect(result.metadata?.framework).toEqual({
      name: "openai",
      version: "v0",
    });
  });
});
