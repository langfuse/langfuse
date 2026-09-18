import { test, expect } from "vitest";
import { parseTraceInput } from "./parse-trace-input";

test("deduplicates IDs and resolves same-project links without fetching", () => {
  expect(
    parseTraceInput(
      "abc, abc\nhttp://localhost:3000/project/p/traces/def?view=preview",
      "p",
      "http://localhost:3000",
    ),
  ).toEqual(["abc", "def"]);
});
test("preserves opaque trace IDs and decodes their URL path segment exactly once", () => {
  expect(
    parseTraceInput(
      "customer:request/42\nhttp://localhost:3000/project/p/traces/customer%3Arequest%2F42\nhttp://localhost:3000/project/p/traces/literal%252Fid",
      "p",
      "http://localhost:3000",
    ),
  ).toEqual(["customer:request/42", "literal%2Fid"]);
});
test("rejects foreign projects, hosts, credentials, invalid IDs and empty input", () => {
  for (const input of [
    "",
    "a".repeat(1001),
    "https://example.com/project/p/traces/a",
    "http://localhost:3000/project/other/traces/a",
    "http://u:p@localhost:3000/project/p/traces/a",
  ]) {
    expect(() =>
      parseTraceInput(input, "p", "http://localhost:3000"),
    ).toThrow();
  }
});
