// @vitest-environment node

import { describe, expect, it } from "vitest";

import { planDetailViewHeaderActions } from "@/src/features/traces/components/detailViewHeaderLayout";

// The detail pane's 360px floor leaves 328px of header once the shell's
// `px-4` is taken off. `Add to · Annotate · Comment` measures 312px; the
// icon-only cluster is about 100px.
const PANE_FLOOR_HEADER_WIDTH = 328;
const LABELLED_CLUSTER_PX = 312;
const ICON_ONLY_CLUSTER_PX = 100;

const base = {
  minTitleWidth: 160,
  gap: 8,
  iconOnlyActionsWidth: ICON_ONLY_CLUSTER_PX,
};

describe("planDetailViewHeaderActions", () => {
  it("puts the actions beside the title while the title keeps its width", () => {
    // 480 - 312 - 8 = 160, the title's floor.
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: 480,
        actionsWidth: LABELLED_CLUSTER_PX,
      }),
    ).toBe("beside");
  });

  it("drops the actions below the title once that floor is crossed", () => {
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: 479,
        actionsWidth: LABELLED_CLUSTER_PX,
      }),
    ).toBe("below");
  });

  it("switches to icon-only once the labelled cluster no longer fits a row", () => {
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: PANE_FLOOR_HEADER_WIDTH,
        actionsWidth: LABELLED_CLUSTER_PX + 32,
      }),
    ).toBe("icon-only");
  });

  it("folds once the icon-only cluster does not fit either", () => {
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: ICON_ONLY_CLUSTER_PX - 1,
        actionsWidth: LABELLED_CLUSTER_PX + 32,
      }),
    ).toBe("folded");
  });

  it("folds when the buttons grow past the row, at the same header width", () => {
    // No icon-only cluster: a comment count that widens the labels is enough.
    const headerWidth = PANE_FLOOR_HEADER_WIDTH;
    expect(
      planDetailViewHeaderActions({
        minTitleWidth: base.minTitleWidth,
        gap: base.gap,
        headerWidth,
        actionsWidth: LABELLED_CLUSTER_PX,
      }),
    ).toBe("below");
    expect(
      planDetailViewHeaderActions({
        minTitleWidth: base.minTitleWidth,
        gap: base.gap,
        headerWidth,
        actionsWidth: LABELLED_CLUSTER_PX + 40,
      }),
    ).toBe("folded");
  });
});
