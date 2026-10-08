import { describe, expect, it } from "vitest";

import { getVisibleTabIndices } from "./getVisibleTabIndices";

// Preview, Messages, Attributes, Scores, Log View at roughly their real widths.
const widths = [90, 150, 100, 80, 95];
const overflowWidth = 32;

describe("getVisibleTabIndices", () => {
  it("shows every tab and no overflow trigger while they all fit", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 515,
        overflowWidth,
        activeIndex: 0,
      }),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("tolerates a pixel of sub-pixel rounding at the boundary", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 514.2,
        overflowWidth,
        activeIndex: 0,
      }),
    ).toEqual([0, 1, 2, 3, 4]);
  });

  it("fills the row in order and leaves room for the overflow trigger", () => {
    // 90 + 150 + 100 = 340 fits next to the 32px trigger; Scores would not.
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        activeIndex: 0,
      }),
    ).toEqual([0, 1, 2]);
  });

  it("keeps the active tab visible by displacing the tabs after the prefix", () => {
    // Log View (95) takes the slot Attributes (100) would have had.
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        activeIndex: 4,
      }),
    ).toEqual([0, 1, 4]);
  });

  it("continues past the active tab when later tabs still fit", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        activeIndex: 1,
      }),
    ).toEqual([0, 1, 2]);
  });

  it("shows only the active tab when nothing else fits", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 140,
        overflowWidth,
        activeIndex: 3,
      }),
    ).toEqual([3]);
  });

  it("still shows the active tab when even that one overflows", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 60,
        overflowWidth,
        activeIndex: 2,
      }),
    ).toEqual([2]);
  });

  it("falls back to the plain prefix without an active tab", () => {
    expect(
      getVisibleTabIndices({
        widths,
        availableWidth: 400,
        overflowWidth,
        activeIndex: -1,
      }),
    ).toEqual([0, 1, 2]);
  });
});
