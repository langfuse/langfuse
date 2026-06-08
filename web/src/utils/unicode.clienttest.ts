import { decodeUnicodeEscapesOnly } from "@/src/utils/unicode";

describe("decodeUnicodeEscapesOnly", () => {
  it("should decode basic Unicode escapes (Chinese, Korean)", () => {
    expect(decodeUnicodeEscapesOnly("\\u4f60\\u597d")).toBe("你好"); // Chinese "hello"
    expect(decodeUnicodeEscapesOnly("\\uc548\\ub155")).toBe("안녕"); // Korean "hello"
  });

  it("should decode surrogate pairs, i.e. emoji", () => {
    expect(decodeUnicodeEscapesOnly("\\ud83d\\ude00")).toBe("😀"); // grinning face
    expect(decodeUnicodeEscapesOnly("Hello \\ud83d\\udc4b World")).toBe(
      "Hello 👋 World",
    ); // waving hand
  });

  it("should handle multi-backslash scenarios", () => {
    // Even number of backslashes: literal backslash + uXXXX (not decoded)
    expect(decodeUnicodeEscapesOnly("\\\\u4f60")).toBe("\\u4f60");

    // Odd number (3): literal backslash + decoded unicode
    expect(decodeUnicodeEscapesOnly("\\\\\\u4f60")).toBe("\\你");
  });

  it("should be robust to truncation", () => {
    // Incomplete escape sequence at end
    expect(decodeUnicodeEscapesOnly("text \\u4f")).toBe("text \\u4f");

    // Incomplete surrogate pair (high surrogate only)
    expect(decodeUnicodeEscapesOnly("text \\ud83d")).toBe("text \\ud83d");

    // Invalid hex digits
    expect(decodeUnicodeEscapesOnly("\\uZZZZ")).toBe("\\uZZZZ");
  });

  it("should preserve other escape sequences", () => {
    expect(decodeUnicodeEscapesOnly('\\"hello\\"')).toBe('\\"hello\\"');
    expect(decodeUnicodeEscapesOnly("\\n\\t\\r")).toBe("\\n\\t\\r");
    expect(decodeUnicodeEscapesOnly("\\\\")).toBe("\\\\");
  });

  it("should handle mixed content", () => {
    expect(
      decodeUnicodeEscapesOnly(
        '{"name": "\\u4f60\\u597d", "emoji": "\\ud83d\\ude00"}',
      ),
    ).toBe('{"name": "你好", "emoji": "😀"}');
  });

  it("should handle no escapes", () => {
    expect(decodeUnicodeEscapesOnly("")).toBe("");
    expect(decodeUnicodeEscapesOnly("hello world")).toBe("hello world");
    expect(decodeUnicodeEscapesOnly("Hello 👋 World")).toBe("Hello 👋 World");
  });

  describe("greedy mode", () => {
    it("should decode double-escaped Unicode in greedy mode", () => {
      // \\uXXXX / \\\\uXXXX decodes to character
      expect(decodeUnicodeEscapesOnly("\\\\u4f60\\\\u597d", true)).toBe("你好");
    });

    it("should decode double-escaped surrogate pairs in greedy mode", () => {
      // Greedy mode with emoji
      expect(decodeUnicodeEscapesOnly("\\\\ud83d\\\\ude00", true)).toBe("😀");
    });

    it("should handle mixed content in greedy mode", () => {
      const input = '{"content": "\\\\uc885\\\\ubd80\\\\uc138"}';
      expect(decodeUnicodeEscapesOnly(input, true)).toBe(
        '{"content": "종부세"}',
      );
    });

    it("should preserve lone high surrogate as literal in greedy mode", () => {
      // Lone high surrogate without low surrogate pair should not emit WTF-16
      expect(decodeUnicodeEscapesOnly("\\\\uD83D", true)).toBe("\\uD83D");
    });

    it("should preserve high surrogate followed by non-surrogate in greedy mode", () => {
      // High surrogate followed by non-surrogate should preserve the surrogate literal
      expect(decodeUnicodeEscapesOnly("\\\\uD83D\\\\u0041", true)).toBe(
        "\\uD83DA",
      );
    });

    it("should preserve lone low surrogate as literal in greedy mode", () => {
      expect(decodeUnicodeEscapesOnly("\\\\uDE00", true)).toBe("\\uDE00");
    });

    it("should handle lone high surrogate followed by backslashes and non-surrogate in greedy mode", () => {
      // \\uD83D\\\\u0041: high surrogate preserved, then \\\\u0041 decoded to A by main loop
      expect(decodeUnicodeEscapesOnly("\\\\uD83D\\\\\\\\u0041", true)).toBe(
        "\\uD83DA",
      );
    });
  });
});
