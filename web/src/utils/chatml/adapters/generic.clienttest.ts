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

import { normalizeInput, normalizeOutput } from "./index";
import { combineInputOutputMessages, cleanLegacyOutput } from "../core";
import { genericAdapter } from "./generic";

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
});
