/**
 * countJsonRows feeds the JSON-view size gate (LFE-10847): it decides whether a
 * field is too large to render. It must therefore never itself crash on the
 * payloads the gate exists to catch — in particular a deeply *nested* payload
 * (a single-branch chain thousands of levels deep), which overflows the call
 * stack under plain recursion (worse in Firefox, cf. the deep-chain shapes in
 * LFE-10959). These tests pin the counts and the deep-nesting safety.
 */
import { countJsonRows, exceedsRowThreshold } from "./rowCount";

describe("countJsonRows", () => {
  it("counts primitives, objects, and arrays per the node model", () => {
    expect(countJsonRows(null)).toBe(0);
    expect(countJsonRows(undefined)).toBe(0);
    expect(countJsonRows("hello")).toBe(1);
    expect(countJsonRows(42)).toBe(1);
    expect(countJsonRows(true)).toBe(1);
    expect(countJsonRows({ a: 1, b: 2 })).toBe(3); // object + 2 props
    expect(countJsonRows([1, 2, 3])).toBe(4); // array + 3 elements
    expect(countJsonRows({ a: { b: { c: 1 } } })).toBe(4); // 3 objects + 1 number
    expect(countJsonRows([])).toBe(1);
    expect(countJsonRows({})).toBe(1);
  });

  it("does not stack-overflow on a deeply nested chain", () => {
    const depth = 200_000;
    let deep: unknown = 1;
    for (let i = 0; i < depth; i++) deep = { next: deep };
    // depth objects + the leaf primitive.
    expect(countJsonRows(deep)).toBe(depth + 1);
  });

  it("exceedsRowThreshold compares the total against the limit", () => {
    expect(exceedsRowThreshold([1, 2, 3], 2)).toBe(true);
    expect(exceedsRowThreshold([1, 2, 3], 10)).toBe(false);
  });
});
