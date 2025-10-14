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

import { normalizeInput, normalizeOutput } from "./adapters";
import {
  combineInputOutputMessages,
  cleanLegacyOutput,
  extractAdditionalInput,
} from "./core";

describe("ChatML Integration", () => {
  it("should handle OpenAI multimodal format", () => {
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

    const ctx = { metadata: { scope: { name: "langfuse-sdk" } } };
    const inResult = normalizeInput(input, ctx);
    const additionalInput = extractAdditionalInput(input);

    expect(inResult.success).toBe(true);
    expect(inResult.data).toHaveLength(1);
    expect(Array.isArray(inResult.data[0].content)).toBe(true);
    expect(additionalInput).toEqual({
      temperature: 0.7,
      model: "gpt-4-vision-preview",
    });
  });

  it("should handle nested array format [[ChatML...]]", () => {
    const input = [
      [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
      ],
    ];
    const output = { role: "assistant", content: "Hi there!" };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    expect(inResult.data).toHaveLength(2);
    expect(allMessages).toHaveLength(3);
  });

  it("should handle legacy completion format {completion: string}", () => {
    const input = [{ role: "user", content: "Write a haiku" }];
    const output = {
      completion:
        "Cherry blossoms fall\nSoftly on the morning dew\nSpring has come at last",
    };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const outputClean = cleanLegacyOutput(output, output);
    const allMessages = combineInputOutputMessages(
      inResult,
      outResult,
      outputClean,
    );

    expect(inResult.success).toBe(true);
    expect(allMessages).toHaveLength(2);
    expect(allMessages[1].json).toEqual({
      completion:
        "Cherry blossoms fall\nSoftly on the morning dew\nSpring has come at last",
    });
  });

  it("should handle placeholder messages", () => {
    const input = [
      { role: "user", content: "Hello" },
      { type: "placeholder", name: "Processing" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "How can I help?" };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(inResult, outResult, output);

    expect(inResult.success).toBe(true);
    expect(allMessages).toHaveLength(4);
    expect(allMessages[1].type).toBe("placeholder");
  });

  it("should handle circular references gracefully", () => {
    const input: any = [{ role: "user", content: "test" }];
    input[0].circular = input[0];

    expect(() => normalizeInput(input)).not.toThrow();
  });

  it("should handle very large inputs", () => {
    const largeContent = "x".repeat(1000000);
    const input = [{ role: "user", content: largeContent }];

    const inResult = normalizeInput(input);

    expect(inResult.success).toBe(true);
    expect(inResult.data[0].content).toHaveLength(1000000);
  });
});
