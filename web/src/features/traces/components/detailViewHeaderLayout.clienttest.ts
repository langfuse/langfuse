// @vitest-environment node

import { describe, expect, it } from "vitest";

import { planDetailViewHeaderActions } from "@/src/features/traces/components/detailViewHeaderLayout";

// Measured widths (px). The detail pane's own floor is 360px
// (`DETAIL_PANEL_MIN_PX` in `TraceLayoutDesktop.tsx`), which leaves 328px of
// header once the shell's `px-4` is taken off. `Add to · Annotate · Comment`
// measures 312px there, and 344px with the options button beside them.
const PANE_FLOOR_HEADER_WIDTH = 328;
const CLUSTER_PX = 312;
const CLUSTER_WITH_OPTIONS_PX = 344;

const base = {
  minTitleWidth: 160,
  gap: 8,
};

describe("planDetailViewHeaderActions", () => {
  it("puts the actions beside the title while the title keeps its width", () => {
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: 900,
        actionsWidth: CLUSTER_PX,
      }),
    ).toBe("beside");
  });

  it("drops the actions onto their own row once the title would be squeezed", () => {
    // 480 - 312 - 8 = 160, exactly the title's floor.
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: 480,
        actionsWidth: CLUSTER_PX,
      }),
    ).toBe("beside");
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: 479,
        actionsWidth: CLUSTER_PX,
      }),
    ).toBe("below");
  });

  it("keeps a row of its own while the cluster still fits on one", () => {
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: PANE_FLOOR_HEADER_WIDTH,
        actionsWidth: CLUSTER_PX,
      }),
    ).toBe("below");
  });

  it("folds rather than wrap the cluster the pane cannot fit", () => {
    // The reported bug: 16px short at the pane's floor, so the last button
    // used to wrap onto a third row.
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: PANE_FLOOR_HEADER_WIDTH,
        actionsWidth: CLUSTER_WITH_OPTIONS_PX,
      }),
    ).toBe("folded");
  });

  it("folds on a cluster that grew, not on a width constant", () => {
    // `Comment` becoming `Comments` with a count badge is enough on its own.
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: PANE_FLOOR_HEADER_WIDTH,
        actionsWidth: CLUSTER_PX + 10,
      }),
    ).toBe("below");
    expect(
      planDetailViewHeaderActions({
        ...base,
        headerWidth: PANE_FLOOR_HEADER_WIDTH,
        actionsWidth: CLUSTER_PX + 40,
      }),
    ).toBe("folded");
  });
});
