import { describe, it, expect } from "vitest";
import {
  stringify,
  stringifyForCsv,
} from "../../../packages/shared/src/server/utils/transforms/stringify";

describe("stringify", () => {
  it("serializes bigint values as numbers", () => {
    const data = { count: BigInt(42) };
    const result = stringify(data);
    expect(JSON.parse(result).count).toBe(42);
  });

  it.skip("preserves literal unicode escape sequences; skipped because exports intentionally decode unicode escapes for now", () => {
    const data = { text: "\\\\u0041" };
    const result = stringify(data);
    expect(JSON.parse(result).text).toBe("\\u0041");
  });

  it("uses pretty-print for comments key", () => {
    const data = { text: "hello" };
    const result = stringify(data, "comments");
    expect(result).toContain("\n");
  });

  it("preserves non-unicode escape sequences", () => {
    const data = { text: 'line1\\nline2\\t"quoted"' };
    const result = stringify(data);
    const parsed = JSON.parse(result);
    expect(parsed.text).toBe('line1\\nline2\\t"quoted"');
  });

  it("applies an explicit indent when provided", () => {
    const data = { text: "hello" };
    const result = stringify(data, undefined, 2);
    expect(result).toContain("\n");
    expect(result).toContain('  "text": "hello"');
  });

  it("decodes unicode escapes while keeping an explicit indent (trace download)", () => {
    // Mirrors the trace-download payload shape: input is a stringified JSON
    // blob whose Japanese characters were escaped by Python ensure_ascii=True.
    const data = {
      observations: [
        { input: '{"text": "\\u3053\\u3093\\u306b\\u3061\\u306f"}' },
      ],
    };
    const result = stringify(data, undefined, 2);
    expect(result).toContain("\n"); // pretty-printed
    expect(result).toContain("こんにちは"); // decoded, not こ...
    expect(result).not.toContain("\\u3053");
  });
});

describe("stringifyForCsv", () => {
  it("returns plain strings without JSON encoding", () => {
    const result = stringifyForCsv('line1\\nline2,"quoted"');
    expect(result).toBe('line1\\nline2,"quoted"');
  });

  it.skip("preserves literal unicode escape sequences in string data; skipped because exports intentionally decode unicode escapes for now", () => {
    const result = stringifyForCsv("\\\\u0041");
    expect(result).toBe("\\u0041");
  });

  it("falls back to stringify for non-string data", () => {
    const data = { count: BigInt(42), key: "value" };
    const result = stringifyForCsv(data);
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(42);
    expect(parsed.key).toBe("value");
  });
});
