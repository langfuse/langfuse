import Decimal from "decimal.js";
import { describe, it, expect, vi } from "vitest";
import { stringify, stringifyForCsv } from "./stringify";

describe("stringify", () => {
  it("serializes bigint values as numbers", () => {
    const data = { count: BigInt(42) };
    const result = stringify(data);
    expect(JSON.parse(result).count).toBe(42);
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
  it("returns Date values as unquoted ISO timestamps", () => {
    expect(stringifyForCsv(new Date("2026-11-03T12:00:00Z"))).toBe(
      "2026-11-03T12:00:00.000Z",
    );
  });

  it("returns Decimal values without JSON quotes or precision loss", () => {
    const amount = "12345678901234567890.123456789";

    expect(stringifyForCsv(new Decimal(amount))).toBe(amount);
  });

  it("serializes custom string values once and leaves CSV escaping to the caller", () => {
    const value = 'line1\nline2,"quoted"';
    const toJSON = vi.fn(() => value);

    expect(stringifyForCsv({ toJSON }, "comments")).toBe(value);
    expect(toJSON).toHaveBeenCalledOnce();
  });

  it("keeps nested Date and Decimal values inside structured JSON", () => {
    const result = stringifyForCsv({
      values: [new Date("2026-11-03T12:00:00Z"), new Decimal("0.0123")],
    });

    expect(JSON.parse(result)).toEqual({
      values: ["2026-11-03T12:00:00.000Z", "0.0123"],
    });
  });

  it("returns plain strings without JSON encoding", () => {
    const result = stringifyForCsv('line1\\nline2,"quoted"');
    expect(result).toBe('line1\\nline2,"quoted"');
  });

  it("falls back to stringify for non-string data", () => {
    const data = { count: BigInt(42), key: "value" };
    const result = stringifyForCsv(data);
    const parsed = JSON.parse(result);
    expect(parsed.count).toBe(42);
    expect(parsed.key).toBe("value");
  });
});
