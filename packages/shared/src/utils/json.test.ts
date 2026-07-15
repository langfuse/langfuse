import { describe, expect, it } from "vitest";

import { parseJsonPrioritised } from "./json";

// All JSON documents are built as literal strings so big integers stay exact
// digit text: a JS numeric literal in this file would itself be rounded to a
// double before the parser under test ever sees it.
describe("parseJsonPrioritised number precision (issue #6628)", () => {
  it("keeps safe numbers as real numbers", () => {
    expect(parseJsonPrioritised('{"a": 42, "b": 1.5, "c": -7}')).toEqual({
      a: 42,
      b: 1.5,
      c: -7,
    });
  });

  it("preserves integers beyond Number.MAX_SAFE_INTEGER as strings", () => {
    const result = parseJsonPrioritised(
      '{"as_number": 107505301260286111, "safe": 42}',
    ) as any;
    expect(result.as_number).toBe("107505301260286111");
    expect(result.safe).toBe(42);
  });

  it("preserves multiple unsafe numbers in one document", () => {
    // Guards the reviver's source access staying available across values.
    const result = parseJsonPrioritised(
      '{"a": 9223372036854775807, "b": [100000000000000001, 7], "c": {"d": 100000000000000003}}',
    ) as any;
    expect(result.a).toBe("9223372036854775807");
    expect(result.b).toEqual(["100000000000000001", 7]);
    expect(result.c.d).toBe("100000000000000003");
  });

  it("preserves a bare unsafe number document as its source string", () => {
    expect(parseJsonPrioritised("9007199254740993")).toBe("9007199254740993");
  });

  it("keeps a 13+ digit but double-safe integer as a number", () => {
    // Trips the UNSAFE_NUMBER_PATTERN heuristic, but round-trips losslessly.
    expect(parseJsonPrioritised('{"ts": 1721001600000}')).toEqual({
      ts: 1721001600000,
    });
  });

  it("resolves safe scientific notation to a number and keeps overflow exact", () => {
    expect(parseJsonPrioritised('{"a": 1e3}')).toEqual({ a: 1000 });
    expect(parseJsonPrioritised('{"a": 1e500}')).toEqual({ a: "1e500" });
  });

  it("preserves decimals with more significant digits than a double", () => {
    const result = parseJsonPrioritised(
      '{"pi": 3.14159265358979323846}',
    ) as any;
    expect(result.pi).toBe("3.14159265358979323846");
  });

  it("parses docs that only trip the heuristic via string content", () => {
    // Base64 payloads and ISO timestamps contain digit-e sequences and long
    // digit runs inside strings; numbers elsewhere must stay untouched.
    const result = parseJsonPrioritised(
      '{"blob": "aGVsbG8e9wORLD3e", "at": "2026-07-15T12:00:00.123456Z", "n": 5}',
    ) as any;
    expect(result.blob).toBe("aGVsbG8e9wORLD3e");
    expect(result.at).toBe("2026-07-15T12:00:00.123456Z");
    expect(result.n).toBe(5);
  });

  it("keeps last duplicate key like native JSON.parse", () => {
    // lossless-json threw on duplicate keys, so docs with an unsafe number
    // stayed raw strings while docs without one parsed (fast path). Native
    // parsing makes both paths consistently last-wins.
    expect(parseJsonPrioritised('{"a": 1, "a": 9223372036854775807}')).toEqual({
      a: "9223372036854775807",
    });
  });

  it("returns the original string for invalid JSON", () => {
    expect(parseJsonPrioritised("not json {")).toBe("not json {");
    expect(parseJsonPrioritised("")).toBe("");
  });
});
