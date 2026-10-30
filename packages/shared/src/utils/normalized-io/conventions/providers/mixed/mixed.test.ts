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

  it("prefers root messages over nested params messages", () => {
    const params = { messages: [{ role: "user", content: "Nested" }] };
    const result = normalizeSpanIO({
      input: { messages: [{ role: "user", content: "Root" }], params },
      output: undefined,
      metadata: undefined,
    });
    expect(result.messages).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "Root" }],
      },
    ]);
    expect(result.additionalInput).toEqual({ params });
  });

  it("leaves unrelated params messages as raw data", () => {
    const input = { params: { messages: [{ status: "queued" }] } };
    const result = normalizeSpanIO({
      input,
      output: undefined,
      metadata: undefined,
    });
    expect(result.messages).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "data", value: input }],
      },
    ]);
  });
});
