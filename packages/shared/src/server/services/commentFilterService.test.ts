import { describe, expect, it } from "vitest";

import { filterRangeIncludesZero } from "./commentFilterService";

// `commentCount` filters AND together, so zero comments are in the matched range
// only when a count of 0 satisfies EVERY condition. When zero is included we use
// exclusion logic (items with 0 comments aren't in the comments table); when it
// is excluded we narrow to the entities that actually have matching comments.
//
// Regression: an `=`/`<`/`<=` filter has no `>=`/`>` lower bound, and the old
// implementation treated "no lower bound" as "includes zero" → match-everything.
// Under the new OR rewriter that amplified `OR(commentCount=N, …)` into "the whole
// tree matches everything", returning every event in the project.
const num = (operator: string, value: number) => ({
  type: "number",
  operator,
  value,
});

describe("filterRangeIncludesZero", () => {
  it("excludes zero for `= N` where N != 0 (the OR-collapse regression)", () => {
    expect(filterRangeIncludesZero([num("=", 5)])).toBe(false);
  });

  it("includes zero for `= 0`", () => {
    expect(filterRangeIncludesZero([num("=", 0)])).toBe(true);
  });

  it("handles lower bounds", () => {
    expect(filterRangeIncludesZero([num(">=", 1)])).toBe(false);
    expect(filterRangeIncludesZero([num(">=", 0)])).toBe(true);
    expect(filterRangeIncludesZero([num(">", 0)])).toBe(false);
    expect(filterRangeIncludesZero([num(">", -1)])).toBe(true);
  });

  it("handles upper bounds", () => {
    expect(filterRangeIncludesZero([num("<=", 0)])).toBe(true);
    expect(filterRangeIncludesZero([num("<=", 5)])).toBe(true);
    expect(filterRangeIncludesZero([num("<", 5)])).toBe(true);
    expect(filterRangeIncludesZero([num("<", 0)])).toBe(false);
  });

  it("requires EVERY condition to admit zero (AND semantics)", () => {
    // a range that excludes zero
    expect(filterRangeIncludesZero([num(">=", 1), num("<=", 5)])).toBe(false);
    // both admit zero
    expect(filterRangeIncludesZero([num(">=", 0), num("<=", 5)])).toBe(true);
    // one admits, one doesn't → excluded
    expect(filterRangeIncludesZero([num("<=", 5), num("=", 5)])).toBe(false);
  });

  it("treats no count filters as including zero", () => {
    expect(filterRangeIncludesZero([])).toBe(true);
  });

  it("does not assume zero for an unknown operator (narrows instead)", () => {
    expect(filterRangeIncludesZero([num("<>", 0)])).toBe(false);
  });
});
