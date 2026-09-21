import { describe, expect, it } from "vitest";

import {
  deepParseJson,
  deepParseJsonIterative,
  parseJsonPrioritised,
} from "./json";

// Focused on the precision path (UNSAFE_NUMBER_PATTERN hit -> source-access
// reviver). Complementary coverage elsewhere: basic parseJsonPrioritised
// semantics incl. invalid JSON and a bare unsafe integer live in
// web/src/__tests__/server/zod.servertest.ts; unsafe integers in nested
// objects/arrays via deepParseJson live in the "Number precision (issue
// #6628)" block of web/src/__tests__/json-utils.clienttest.ts.
//
// All JSON documents are built as literal strings so big integers stay exact
// digit text: a JS numeric literal in this file would itself be rounded to a
// double before the parser under test ever sees it.
describe("parseJsonPrioritised precision path", () => {
  it("keeps a 13+ digit but double-safe integer as a number", () => {
    // Trips the UNSAFE_NUMBER_PATTERN heuristic (13 digits), but round-trips
    // losslessly — must stay numeric, not become a string.
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
});

describe.each([
  ["recursive", deepParseJson],
  ["iterative", deepParseJsonIterative],
] as const)("%s object size limits", (_name, parse) => {
  it("parses eligible siblings of an oversized JSON string", () => {
    const oversized = JSON.stringify({ text: "x".repeat(523_000) });
    const input = {
      oversized,
      details: '{"ok":true}',
      python: "{'enabled': True}",
    };

    const result = parse(input) as Record<string, unknown>;
    expect(result.details).toEqual({ ok: true });
    expect(result.python).toEqual({ enabled: true });
    expect(result.oversized).toBe(oversized);
  });

  it("keeps the aggregate limit for individually eligible fields", () => {
    const field = JSON.stringify({ text: "x".repeat(260_000) });
    const input = { first: field, second: field };

    expect(parse(input)).toBe(input);
    expect(input.first).toBe(field);
    expect(input.second).toBe(field);
  });

  it("keeps wide containers opaque even when their leaves are small", () => {
    const first = '{"ok":true}';
    const input: unknown[] = Array(1_000_000).fill(0);
    input[0] = first;

    expect(parse(input)).toBe(input);
    expect(input[0]).toBe(first);
  });

  it("does not charge nested decoding against the input size again", () => {
    const payload = "x".repeat(260_000);
    const input = JSON.stringify({ json: JSON.stringify({ payload }) });

    expect(parse(input)).toEqual({ json: { payload } });
  });

  it("preserves root string parsing above the object size limit", () => {
    const payload = "x".repeat(523_000);
    expect(parse(JSON.stringify({ payload }))).toEqual({ payload });
  });
});
