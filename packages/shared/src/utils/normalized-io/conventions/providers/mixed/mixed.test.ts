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

  it("preserves numeric-only input alongside a text output", () => {
    const result = normalizeSpanIO({
      input: "12345678901",
      output: "Example assistant reply",
      metadata: undefined,
    });

    expect(result.messages).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "12345678901" }],
      },
      {
        role: "assistant",
        source: "output",
        parts: [{ type: "text", text: "Example assistant reply" }],
      },
    ]);
  });

  it.each(["0", "-42", "12.50", "1e3", "9007199254740993"])(
    "preserves numeric text %s on both sides",
    (value) => {
      const result = normalizeSpanIO({
        input: value,
        output: value,
        metadata: undefined,
      });

      expect(result.messages).toEqual([
        {
          role: "user",
          source: "input",
          parts: [{ type: "text", text: value }],
        },
        {
          role: "assistant",
          source: "output",
          parts: [{ type: "text", text: value }],
        },
      ]);
    },
  );

  it.each(["true", "false", "null"])(
    "keeps existing nonnumeric JSON scalar behavior for %s",
    (value) => {
      expect(
        normalizeSpanIO({
          input: value,
          output: "Example reply",
          metadata: undefined,
        }).messages,
      ).toEqual([
        {
          role: "assistant",
          source: "output",
          parts: [{ type: "text", text: "Example reply" }],
        },
      ]);
    },
  );

  it.each([
    JSON.stringify("12345678901"),
    JSON.stringify({ role: "user", content: "12345678901" }),
    JSON.stringify([{ role: "user", content: "12345678901" }]),
    JSON.stringify({
      messages: [{ role: "user", content: "12345678901" }],
    }),
  ])("decodes serialized message input %s", (input) => {
    expect(
      normalizeSpanIO({ input, output: undefined, metadata: undefined })
        .messages,
    ).toEqual([
      {
        role: "user",
        source: "input",
        parts: [{ type: "text", text: "12345678901" }],
      },
    ]);
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
