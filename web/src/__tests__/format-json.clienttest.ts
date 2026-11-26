import { describe, expect, it } from "vitest";
import { formatJson } from "@/src/utils/formatJson";

describe("formatJson", () => {
  it("only changes whitespace, preserving numbers, escapes, and key order", () => {
    const source =
      '{"2":12345678901234567890,"1":1e400,"pattern":"\\\\u0061","nested":[{},[],"a, : { \\\"quoted\\\" }"],"unicode":"\\u4f60"}';
    expect(formatJson(source)).toBe(
      '{\n  "2": 12345678901234567890,\n  "1": 1e400,\n  "pattern": "\\\\u0061",\n  "nested": [\n    {},\n    [],\n    "a, : { \\\"quoted\\\" }"\n  ],\n  "unicode": "\\u4f60"\n}',
    );
  });

  it("formats JSON above the highlighting limit", () => {
    const value = "x".repeat(10_001);
    expect(formatJson(`{"value":"${value}"}`)).toBe(
      `{\n  "value": "${value}"\n}`,
    );
  });

  it("keeps scalar JSON valid", () => {
    expect(formatJson(" 12345678901234567890 ")).toBe("12345678901234567890");
  });

  it("does not format invalid JSON", () => {
    expect(formatJson('{"broken":')).toBeNull();
  });
});
