import { describe, expect, it } from "vitest";

import { parse } from "./qlang";
import { semanticDiagnostics } from "./validate";

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
