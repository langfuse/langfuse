import {
  decodeUnicodeInJson,
  DECODE_UNICODE_MAX_DEPTH,
  DECODE_UNICODE_MAX_NODES,
} from "@/src/components/ui/PrettyJsonView";

describe("decodeUnicodeInJson", () => {
  it("decodes \\uXXXX sequences in string values", () => {
    expect(decodeUnicodeInJson("\\u4f60\\u597d")).toBe("你好");
    expect(decodeUnicodeInJson("\\u3053\\u3093\\u306b\\u3061\\u306f")).toBe(
      "こんにちは",
    );
  });

  it("decodes double-escaped \\\\uXXXX sequences (greedy mode)", () => {
    // Python SDK json.dumps(ensure_ascii=True) nested inside a string field
    // can produce double-escaped forms depending on the ingest path.
    expect(decodeUnicodeInJson("\\\\u4f60\\\\u597d")).toBe("你好");
  });

  it("passes through primitive non-string values unchanged", () => {
    expect(decodeUnicodeInJson(null)).toBe(null);
    expect(decodeUnicodeInJson(undefined)).toBe(undefined);
    expect(decodeUnicodeInJson(42)).toBe(42);
    expect(decodeUnicodeInJson(true)).toBe(true);
    expect(decodeUnicodeInJson(false)).toBe(false);
  });

  it("passes through strings without escape sequences unchanged", () => {
    expect(decodeUnicodeInJson("hello world")).toBe("hello world");
    expect(decodeUnicodeInJson("すでに日本語")).toBe("すでに日本語");
    expect(decodeUnicodeInJson("")).toBe("");
  });

  it("recursively decodes string values inside an array", () => {
    expect(decodeUnicodeInJson(["\\u4ee5\\u4e0a", "plain", 123])).toEqual([
      "以上",
      "plain",
      123,
    ]);
  });

  it("recursively decodes string values inside an object", () => {
    const input = {
      question: "\\u8cea\\u554f",
      answer: "\\u56de\\u7b54",
      score: 0.95,
    };
    expect(decodeUnicodeInJson(input)).toEqual({
      question: "質問",
      answer: "回答",
      score: 0.95,
    });
  });

  it("recursively decodes deeply nested structures", () => {
    const input = {
      trace: {
        output: {
          messages: [
            {
              role: "assistant",
              content: "\\u6761\\u4ef6\\u306b\\u5408\\u81f4",
            },
          ],
        },
      },
    };
    expect(decodeUnicodeInJson(input)).toEqual({
      trace: {
        output: {
          messages: [{ role: "assistant", content: "条件に合致" }],
        },
      },
    });
  });

  it("preserves null and number leaves inside nested structures", () => {
    const input = {
      name: "\\u30c6\\u30b9\\u30c8",
      meta: { count: 3, tags: null, ratio: 0.5 },
    };
    expect(decodeUnicodeInJson(input)).toEqual({
      name: "テスト",
      meta: { count: 3, tags: null, ratio: 0.5 },
    });
  });

  it("decodes surrogate-pair emoji escapes", () => {
    expect(decodeUnicodeInJson({ reaction: "\\ud83d\\ude00" })).toEqual({
      reaction: "😀",
    });
  });

  it("handles mixed already-decoded and escaped strings", () => {
    expect(decodeUnicodeInJson({ a: "日本語", b: "\\u4ee5\\u4e0a" })).toEqual({
      a: "日本語",
      b: "以上",
    });
  });

  it("decodes escaped object keys as well as values", () => {
    expect(decodeUnicodeInJson({ "\\u8cea\\u554f": "\\u56de\\u7b54" })).toEqual(
      { 質問: "回答" },
    );
  });

  it("decodes escaped keys inside nested structures", () => {
    const input = {
      "\\u5916\\u5074": {
        "\\u5185\\u5074": "\\u5024",
      },
    };
    expect(decodeUnicodeInJson(input)).toEqual({
      外側: { 内側: "値" },
    });
  });

  it("does not blow the call stack on very deeply nested structures", () => {
    // Build a chain ~10x deeper than MAX_DEPTH. A recursive implementation would
    // throw "Maximum call stack size exceeded" here.
    const chainDepth = DECODE_UNICODE_MAX_DEPTH * 10;
    let input: Record<string, unknown> = { leaf: "\\u4ee5\\u4e0a" };
    for (let i = 0; i < chainDepth; i++) {
      input = { child: input };
    }

    expect(() => decodeUnicodeInJson(input)).not.toThrow();

    // Leaves within MAX_DEPTH get decoded; deeper subtrees are returned as-is.
    let result = decodeUnicodeInJson(input) as Record<string, unknown>;
    for (let i = 0; i < DECODE_UNICODE_MAX_DEPTH - 1; i++) {
      result = result.child as Record<string, unknown>;
    }
    // Below MAX_DEPTH the subtree is kept untouched, so the leaf still contains
    // the escaped form somewhere further down.
    expect(result).toBeDefined();
  });

  it("stops decoding once the node budget is exceeded", () => {
    // Build an array with > MAX_NODES escaped strings. Entries beyond the budget
    // should be preserved verbatim (still escaped) rather than throwing or hanging.
    const items = new Array(DECODE_UNICODE_MAX_NODES + 10).fill(
      "\\u4ee5\\u4e0a",
    );
    const out = decodeUnicodeInJson(items) as string[];
    expect(out).toHaveLength(items.length);
    expect(out[0]).toBe("以上");
    expect(out[out.length - 1]).toBe("\\u4ee5\\u4e0a"); // beyond budget, undecoded
  });
});
