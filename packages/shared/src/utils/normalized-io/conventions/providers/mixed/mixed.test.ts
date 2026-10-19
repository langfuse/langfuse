import { describe, expect, it } from "vitest";

import { normalizeSpanIO } from "../../../parser";
import { mixedNormalizedIOFixtures } from "./fixtures";

describe("mixed normalized I/O", () => {
  it.each(mixedNormalizedIOFixtures)("$name", ({ spanIO, expected }) => {
    expect(normalizeSpanIO(spanIO)).toEqual({
      ...expected,
      span: spanIO,
    });
  });

  it("keeps a JSON result typed text but without text or content intact", () => {
    // e.g. a prompt object returned by a tool: {type: "text", prompt, ...}
    const output = {
      name: "prompt-4",
      version: 19,
      type: "text",
      prompt: "Hi",
    };
    const [message] = normalizeSpanIO({
      input: null,
      output,
      metadata: null,
    }).messages;
    expect(message.parts).toEqual([
      { type: "custom", kind: "text", value: output },
    ]);
  });
});
