import { describe, expect, it } from "vitest";

import { getVisibleRowItemIndices } from "./getVisibleRowItemIndices";

// E.g. the detail tabs Preview, Messages, Attributes, Scores, Log View.
const widths = [90, 150, 100, 80, 95];
const overflowWidth = 32;

describe("getVisibleRowItemIndices", () => {
  it("tolerates a pixel of sub-pixel rounding at the boundary", () => {
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 514.2,
        overflowWidth,
        pinnedIndex: 0,
      }),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("fills the row in order and leaves room for the overflow trigger", () => {
    // 90 + 150 + 100 = 340 fits next to the 32px trigger; Scores would not.
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        pinnedIndex: 0,
      }),
    ).toEqual([0, 1, 2]);
  });

  it("keeps the pinned item visible by displacing the items after the prefix", () => {
    // Log View (95) takes the slot Attributes (100) would have had.
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        pinnedIndex: 4,
      }),
    ).toEqual([0, 1, 4]);
  });

  it("keeps the order: nothing after the pinned item jumps a spilled one", () => {
    // Messages spills before the pinned Attributes, so Scores stays hidden too.
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 320,
        overflowWidth,
        pinnedIndex: 2,
      }),
    ).toEqual([0, 2]);
  });

  it("shows only the pinned item when nothing else fits", () => {
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 140,
        overflowWidth,
        pinnedIndex: 3,
      }),
    ).toEqual([3]);
  });

  it("still shows the pinned item when even that one overflows", () => {
    expect(
      getVisibleRowItemIndices({
        widths,
        availableWidth: 60,
        overflowWidth,
        pinnedIndex: 2,
      }),
    ).toEqual([2]);
  });
});
