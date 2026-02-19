import { describe, it, expect } from "vitest";
import {
  genericAdapter,
  normalizeInput,
  normalizeOutput,
  combineInputOutputMessages,
  cleanLegacyOutput,
} from "@langfuse/shared";

describe("Generic Adapter", () => {
  it("should always detect (fallback)", () => {
    expect(genericAdapter.detect({})).toBe(true);
    expect(genericAdapter.detect({ metadata: { anything: "value" } })).toBe(
      true,
    );
  });

  it("should handle basic ChatML format", () => {
    const input = [
      { role: "user", content: "Hello!" },
      { role: "assistant", content: "Hi there!" },
    ];
    const output = { role: "assistant", content: "Response" };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(
      inResult,
      outResult,
      cleanLegacyOutput(output, output),
    );

    expect(inResult.success).toBe(true);
    expect(outResult.success).toBe(true);
    expect(allMessages).toHaveLength(3);
    expect(allMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "Hello!" }),
        expect.objectContaining({ role: "assistant", content: "Hi there!" }),
        expect.objectContaining({ role: "assistant", content: "Response" }),
      ]),
    );
  });

  it("should not display non-ChatML formats as chat", () => {
    const input = {
      new_message: {
        parts: [{ text: "hi" }],
        role: "user",
      },
      run_config: {
        streaming_mode: "StreamingMode.NONE",
      },
    };

    const output = {
      content: {
        parts: [{ text: "Hello!" }],
        role: "model",
      },
      finish_reason: "STOP",
    };

    const inResult = normalizeInput(input);
    const outResult = normalizeOutput(output);
    const allMessages = combineInputOutputMessages(
      inResult,
      outResult,
      cleanLegacyOutput(output, output),
    );

    expect(inResult.success).toBe(false);
    expect(allMessages).toHaveLength(0);
  });

  it("should extract content from Microsoft Agent parts with content field", () => {
    const input = [
      {
        role: "user",
        parts: [
          // space behind hello - unsure if it should be added regardless
          { type: "text", content: "Hello " },
          { type: "text", content: "World" },
        ],
      },
    ];

    const preprocessed = genericAdapter.preprocess(input, "input", {});
    expect(Array.isArray(preprocessed)).toBe(true);
    const messages = preprocessed as any[];
    expect(messages[0].content).toBe("Hello World");
    expect(messages[0].parts).toBeUndefined();
  });

  it("should not crash when parts array contains null items", () => {
    // Bug: hasFunctionCall/hasFunctionResponse checked properties without null guards
    const input = [
      {
        role: "user",
        parts: [
          { type: "text", content: "Hello" },
          null, // This null item should not crash
          { type: "text", content: "World" },
        ],
      },
    ];

    // Should not throw TypeError
    expect(() => genericAdapter.preprocess(input, "input", {})).not.toThrow();

    const preprocessed = genericAdapter.preprocess(input, "input", {});
    const messages = preprocessed as any[];
    expect(messages[0].content).toContain("Hello");
    expect(messages[0].content).toContain("World");
  });

  it("should not crash when parts has null before function_call", () => {
    // Test hasFunctionCall code path with null
    const input = [
      {
        role: "assistant",
        parts: [
          null, // Null before function check
          { function_call: { name: "test", arguments: "{}" } },
        ],
      },
    ];

    expect(() => genericAdapter.preprocess(input, "input", {})).not.toThrow();
  });

  it("should not crash when parts has null before tool_call", () => {
    // Test Microsoft Agent tool_call type with null
    const input = [
      {
        role: "assistant",
        parts: [null, { type: "tool_call", id: "123", name: "test" }],
      },
    ];

    expect(() => genericAdapter.preprocess(input, "input", {})).not.toThrow();
  });
});
