import { describe, expect, it } from "vitest";

import { nextCompactPlanBadge } from "./compactPlanBadge";

describe("nextCompactPlanBadge", () => {
  it("stays short when the only spare pixels are the flex gap", () => {
    const gapPx = 6;
    const fullBadgeWidth = 88;
    const currentBadgeWidth = 36;
    const extraForFull = fullBadgeWidth - currentBadgeWidth;

    // Name overflowed the full badge by less than the 6px row gap, so the
    // gap plus leftover space looks like enough room to expand again.
    expect(
      nextCompactPlanBadge({
        compact: true,
        nameScrollWidth: 120,
        nameClientWidth: 120,
        freeSpace: extraForFull,
        fullBadgeWidth,
        currentBadgeWidth,
        gapPx,
      }),
    ).toBe(true);

    expect(
      nextCompactPlanBadge({
        compact: true,
        nameScrollWidth: 120,
        nameClientWidth: 120,
        freeSpace: extraForFull + gapPx + 1,
        fullBadgeWidth,
        currentBadgeWidth,
        gapPx,
      }),
    ).toBe(false);

    expect(
      nextCompactPlanBadge({
        compact: false,
        nameScrollWidth: 140,
        nameClientWidth: 100,
        freeSpace: 0,
        fullBadgeWidth,
        currentBadgeWidth: fullBadgeWidth,
        gapPx,
      }),
    ).toBe(true);
  });
});
