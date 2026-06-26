import { describe, expect, it } from "vitest";

import { planToolbarOverflow } from "@/src/components/table/peek/peekHeaderOverflow";

// actions is the first to fold, then openInTab; nav/expand/close are pinned.
const DROP_ORDER = ["actions", "openInTab"] as const;
const WIDTHS = { actions: 90, openInTab: 32 };
const base = {
  unitWidths: WIDTHS,
  dropOrder: DROP_ORDER,
  pinnedWidth: 120, // nav + expand + close
  moreWidth: 32,
  safety: 24,
};

describe("planToolbarOverflow", () => {
  it("keeps everything inline when there is room", () => {
    // 120 + (90+32) + 24 = 266 ≤ 400
    expect(planToolbarOverflow({ ...base, clusterWidth: 400 }).size).toBe(0);
  });

  it("folds the lowest-priority unit (actions) first when tight", () => {
    // inline needs 266 > 300? no — pick a width between the two thresholds.
    // with "…": 120 + 32 + openInTab(32) + 24 = 208; keep openInTab, drop actions.
    const overflow = planToolbarOverflow({ ...base, clusterWidth: 240 });
    expect([...overflow]).toEqual(["actions"]);
  });

  it("folds both units when very tight", () => {
    const overflow = planToolbarOverflow({ ...base, clusterWidth: 180 });
    expect(overflow.has("actions")).toBe(true);
    expect(overflow.has("openInTab")).toBe(true);
  });

  it("respects drop order: openInTab stays inline while actions collapse", () => {
    // 240: drop actions → 120+32+32+24=208 ≤ 240 → openInTab kept inline.
    const overflow = planToolbarOverflow({ ...base, clusterWidth: 240 });
    expect(overflow.has("openInTab")).toBe(false);
  });

  it("ignores units that are not present (no measured width)", () => {
    // Only actions present; openInTab absent → never in the overflow set.
    const overflow = planToolbarOverflow({
      ...base,
      unitWidths: { actions: 90 },
      clusterWidth: 150,
    });
    expect(overflow.has("openInTab")).toBe(false);
    expect(overflow.has("actions")).toBe(true);
  });

  it("treats a zero/unmeasured cluster as fully collapsed", () => {
    expect(planToolbarOverflow({ ...base, clusterWidth: 0 }).size).toBe(
      DROP_ORDER.length,
    );
  });
});
