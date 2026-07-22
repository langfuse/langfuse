import { describe, expect, it } from "vitest";

import { parse, serialize } from "./langQ";
import { semanticDiagnostics, validateQuery } from "./validate";

function warnings(query: string): string[] {
  const { ast } = parse(query);
  return semanticDiagnostics(ast, query.length)
    .filter((d) => d.severity === "warning")
    .map((d) => d.message);
}

describe("semanticDiagnostics — has: polarity", () => {
  it("positive has: on a non-nullable field matches everything", () => {
    expect(warnings("has:level")).toContain(
      '"level" always has a value — this filter matches everything',
    );
  });

  // `-has:level` lowers to `level IS NULL`, which is vacuously false on a
  // non-nullable column — it matches NOTHING, the opposite of the positive
  // form. The warning must flip with polarity.
  it("negated has: on a non-nullable field matches nothing (dash form)", () => {
    expect(warnings("-has:level")).toContain(
      '"level" always has a value — this filter matches nothing',
    );
  });

  it("negated has: on a non-nullable field matches nothing (NOT keyword)", () => {
    expect(warnings("NOT has:level")).toContain(
      '"level" always has a value — this filter matches nothing',
    );
  });

  it("double negation matches everything again", () => {
    expect(warnings("NOT NOT has:level")).toContain(
      '"level" always has a value — this filter matches everything',
    );
  });
});

describe("validateQuery — merged-diagnostic dedup", () => {
  // The parser (pushOpIssue) and the adapter (operatorIssue in lowerFilter)
  // both flag the same operator/field mismatch at the same span. validateQuery
  // merges the two lists, so it must dedupe — otherwise the global tooltip and
  // aria-live region announce the same message twice for a single typo.
  function errorMessages(query: string): string[] {
    return validateQuery(query)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.message);
  }

  it.each(["metadata.region:>5", "level:>5", "traceTags:*tag*", "xyz:1"])(
    "emits each error message once for %s",
    (query) => {
      const messages = errorMessages(query);
      expect(messages.length).toBeGreaterThan(0);
      expect(new Set(messages).size).toBe(messages.length);
    },
  );

  // A `key:` typo (no value) is flagged by BOTH the parser and the adapter; the
  // two messages must be identical so dedup collapses them to ONE (two
  // different strings would both survive — the prior bug).
  it.each([
    ["level:", 'Missing value after "level:"'],
    ["tags:", 'Missing value after "tags:"'],
    ["metadata.region:", 'Missing value after "metadata.region:"'],
    ["has:", 'Missing value after "has:"'],
    // textSearch column with no value; operator-prefix forms carry the prefix
    // in the parser's wording — both previously doubled.
    ["input:", 'Missing value after "input:"'],
    ["level:=", 'Missing value after "level:="'],
    ["latency:>", 'Missing value after "latency:>"'],
  ])(
    "surfaces exactly one empty-value diagnostic for %s",
    (query, expected) => {
      expect(errorMessages(query)).toEqual([expected]);
    },
  );
});

// LFE-11017: a partial filter token that isn't a complete expression must not
// silently apply to the query. A bare field word (`type`, no operator/value)
// used to parse as free text and lower to a full-text searchQuery, wiping the
// results with no signal — while `type:` already errored. It must now be
// treated as an incomplete filter (excluded from the query, rendered red),
// WITHOUT flagging deliberate multi-word free-text phrases.
describe("validateQuery — incomplete bare field token (LFE-11017)", () => {
  const errors = (query: string): string[] =>
    validateQuery(query)
      .diagnostics.filter((d) => d.severity === "error")
      .map((d) => d.message);
  const isValid = (query: string): boolean => validateQuery(query).valid;

  it.each(["type", "level", "env", "tags", "TYPE", "metadata.region"])(
    "flags a lone bare field word %s as an incomplete filter",
    (query) => {
      expect(isValid(query)).toBe(false);
      expect(errors(query).some((m) => m.startsWith("Incomplete filter"))).toBe(
        true,
      );
    },
  );

  it("flags a bare field word appended after an existing filter (the repro)", () => {
    expect(isValid("name:foo type")).toBe(false);
    expect(
      errors("name:foo type").some((m) => m.startsWith("Incomplete filter")),
    ).toBe(true);
  });

  it("does not flag a deliberate multi-word phrase containing a field word", () => {
    expect(isValid("type error")).toBe(true);
    expect(isValid("session timeout")).toBe(true);
    expect(isValid("name:foo type error")).toBe(true);
  });

  it("does not flag a quoted field word (explicit literal text search)", () => {
    expect(isValid('"type"')).toBe(true);
    expect(errors('"type"')).toEqual([]);
  });

  it("does not flag free text that is not a field name", () => {
    expect(isValid("hello")).toBe(true);
    expect(isValid("refund policy")).toBe(true);
  });

  it("still flags the colon-but-no-value form (unchanged existing error)", () => {
    // `type:` keeps its own "Missing value" error — NOT the incomplete-filter one.
    const msgs = errors("type:");
    expect(msgs).toContain('Missing value after "type:"');
    expect(msgs.some((m) => m.startsWith("Incomplete filter"))).toBe(false);
  });

  it("accepts a complete expression", () => {
    expect(isValid("type:chat")).toBe(true);
    expect(isValid("name:foo type:chat")).toBe(true);
  });

  it("round-trips a committed field-word free text as a quoted literal", () => {
    // The reverse of the guard: a legacy searchQuery=`type` must serialize as
    // `"type"` so it re-derives valid, not as a bare token that lands red.
    const text = serialize({ kind: "text", value: "type" });
    expect(text).toBe('"type"');
    expect(isValid(text)).toBe(true);
  });
});
