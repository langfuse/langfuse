import { describe, it, expect } from "vitest";
import {
  stringify,
  stringifyForCsv,
} from "../../../packages/shared/src/server/utils/transforms/stringify";

describe("stringify unicode decode", () => {
  it("should decode unicode escapes in string values", () => {
    const data = {
      input: '{"message": "\\u4f60\\u597d"}',
      output: "\\u65e5\\u672c\\u8a9e",
    };
    const result = stringify(data);
    const parsed = JSON.parse(result);

    expect(parsed.input).toBe('{"message": "你好"}');
    expect(parsed.output).toBe("日本語");
  });

  it("should handle bigint values", () => {
    const data = { count: BigInt(42) };
    const result = stringify(data);
    expect(JSON.parse(result).count).toBe(42);
  });

  it("should preserve strings without unicode escapes", () => {
    const data = { message: "hello world", nested: { key: "value" } };
    const result = stringify(data);
    const parsed = JSON.parse(result);
    expect(parsed.message).toBe("hello world");
    expect(parsed.nested.key).toBe("value");
  });

  it("should decode emoji surrogate pairs", () => {
    const data = { emoji: "\\ud83d\\ude00" };
    const result = stringify(data);
    expect(JSON.parse(result).emoji).toBe("😀");
  });

  it("should use pretty-print for comments key", () => {
    const data = { text: "hello" };
    const result = stringify(data, "comments");
    expect(result).toContain("\n");
  });

  it("should preserve other escape sequences", () => {
    const data = { text: 'line1\\nline2\\t"quoted"' };
    const result = stringify(data);
    const parsed = JSON.parse(result);
    expect(parsed.text).toBe('line1\\nline2\\t"quoted"');
  });
});

describe("stringifyForCsv unicode decode", () => {
  it("should decode unicode escapes in string data", () => {
    const result = stringifyForCsv('{"message": "\\u4f60\\u597d"}');
    expect(result).toBe('{"message": "你好"}');
  });

  it("should decode unicode escapes in plain string", () => {
    const result = stringifyForCsv("\\u65e5\\u672c\\u8a9e");
    expect(result).toBe("日本語");
  });

  it("should fall back to stringify for non-string data", () => {
    const data = { key: "\\u4f60\\u597d" };
    const result = stringifyForCsv(data);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("你好");
  });

  it("should handle mixed Japanese and ASCII content", () => {
    const input =
      '{"question": "\\u65e5\\u672c\\u8a9e\\u306e\\u30c6\\u30b9\\u30c8", "lang": "ja"}';
    const result = stringifyForCsv(input);
    expect(result).toBe('{"question": "日本語のテスト", "lang": "ja"}');
  });
});
