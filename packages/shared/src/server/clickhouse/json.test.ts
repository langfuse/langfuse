import { describe, expect, it } from "vitest";

import { stringifyJsonWithSanitizedSurrogates } from "./json";

describe("stringifyJsonWithSanitizedSurrogates", () => {
  it("replaces lone surrogate code units", () => {
    const serialized = stringifyJsonWithSanitizedSurrogates({
      high: String.fromCharCode(0xd800),
      low: String.fromCharCode(0xdfff),
    });

    expect(JSON.parse(serialized)).toEqual({ high: "�", low: "�" });
  });

  it("preserves literal unicode escape text", () => {
    const literalEscape = String.raw`\ud800`;
    const serialized = stringifyJsonWithSanitizedSurrogates({
      value: literalEscape,
    });

    expect(JSON.parse(serialized)).toEqual({ value: literalEscape });
  });
});
