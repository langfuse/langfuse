// TODO: fix that mocking @langfuse/shared is required
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
  it("should be fallback mapper with score 0 and map basic ChatML", () => {
    // Always score 0 (fallback)
    expect(genericMapper.canMapScore("anything", "anything")).toBe(0);
    expect(genericMapper.canMapScore(null, undefined)).toBe(0);
    expect(genericMapper.canMapScore({}, {}, "openai")).toBe(0);

    // Map simple ChatML
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "Response" };

    const result = genericMapper.map(input, output);

    expect(result.canDisplayAsChat()).toBe(true);
    expect(result.getAllMessages()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Hello!" }),
        expect.objectContaining({ role: "assistant", content: "Hi there!" }),
        expect.objectContaining({ role: "assistant", content: "Response" }),
      ]),
    );
    expect(result.input.messages).toHaveLength(2);
    expect(result.output.messages).toHaveLength(1);
  });
});
