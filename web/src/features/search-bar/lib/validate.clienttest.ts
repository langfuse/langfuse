import { describe, expect, it } from "vitest";

import { parse } from "./langQ";
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

  it.each(["metadata.region:>5", "level:>5", "traceTags:~tag", "xyz:1"])(
    "emits each error message once for %s",
    (query) => {
      const messages = errorMessages(query);
      expect(messages.length).toBeGreaterThan(0);
      expect(new Set(messages).size).toBe(messages.length);
    },
  );
});
