// @vitest-environment node

import { describe, expect, it } from "vitest";
import { activeIndexOf } from "./activeIndex";

describe("activeIndexOf", () => {
  it("shows the first item at rest and the next one each run", () => {
    expect(
      [0, 1, 2, 3, 4, 5].map((runs) => activeIndexOf(undefined, runs, 4)),
    ).toEqual([0, 0, 1, 2, 3, 0]);
  });

  it("keeps a pinned item every run, rounding it and wrapping it into range", () => {
    expect([1, 2, 3].map((runs) => activeIndexOf(2, runs, 4))).toEqual([
      2, 2, 2,
    ]);
    expect(activeIndexOf(5, 0, 4)).toBe(1);
    expect(activeIndexOf(-1, 0, 4)).toBe(3);
    expect(activeIndexOf(1.6, 0, 4)).toBe(2);
  });

  it("stays on the first slot when there are no items", () => {
    expect(activeIndexOf(undefined, 3, 0)).toBe(0);
  });
});
