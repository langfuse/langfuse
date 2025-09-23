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

import { genericMapper } from "./generic";

describe("genericMapper", () => {
  it("should always return canMap = true", () => {
    expect(genericMapper.canMap("anything", "anything")).toBe(true);
    expect(genericMapper.canMap(null, undefined)).toBe(true);
    expect(genericMapper.canMap({}, {}, "openai")).toBe(true); // Even with metadata
  });

  it("should map simple ChatML input/output to LangfuseChatML", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "Response" };

    const result = genericMapper.map(input, output);

    expect(result).toHaveProperty("input");
    expect(result).toHaveProperty("output");
    expect(result).toHaveProperty("canDisplayAsChat");
    expect(result).toHaveProperty("getAllMessages");

    // Test methods
    expect(result.canDisplayAsChat()).toBe(true);
    expect(result.getAllMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Hello!" }),
        expect.objectContaining({ role: "assistant", content: "Hi there!" }),
        expect.objectContaining({ role: "assistant", content: "Response" }),
      ]),
    );

    // Test structure
    expect(result.input.messages).toHaveLength(2);
    expect(result.output.messages).toHaveLength(1);
    expect(result.input.messages[0]).toMatchObject({
      role: "user",
      content: "Hello!",
    });
  });
});
