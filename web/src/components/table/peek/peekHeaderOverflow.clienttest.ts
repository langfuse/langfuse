// @vitest-environment node

import { describe, expect, it } from "vitest";

import { planPeekHeaderLayout } from "@/src/components/table/peek/peekHeaderOverflow";

// Representative measured widths (px).
const base = {
  minTitle: 240,
  tileWidth: 32,
  navFullWidth: 92, // ↑K ↓J with chips
  navCompactWidth: 52, // icon-only arrows
  otherPinnedWidth: 68, // expand + close + divider
  moreWidth: 32,
  actionsWidth: 90,
  openInTabWidth: 28,
  safety: 16,
};

const FULL = {
  foldActions: false,
  foldOpenInTab: false,
  navCompact: false,
};

describe("planPeekHeaderLayout", () => {
  it("keeps everything when the title has room", () => {
    expect(planPeekHeaderLayout({ ...base, headerWidth: 760 })).toEqual(FULL);
  });

  it("reduces in order as the peek narrows: actions, then nav", () => {
    // Wide-ish: only the actions fold.
    const a = planPeekHeaderLayout({ ...base, headerWidth: 560 });
    expect(a.foldActions).toBe(true);
    expect(a.navCompact).toBe(false);
    expect(a.foldOpenInTab).toBe(false);

    // Narrower: actions folded + nav compact, open-in-tab still inline.
    const b = planPeekHeaderLayout({ ...base, headerWidth: 500 });
    expect(b.foldActions).toBe(true);
    expect(b.navCompact).toBe(true);
    expect(b.foldOpenInTab).toBe(false);
  });

  it("folds open-in-tab last, when very tight", () => {
    const plan = planPeekHeaderLayout({ ...base, headerWidth: 320 });
    expect(plan.foldActions).toBe(true);
    expect(plan.navCompact).toBe(true);
    expect(plan.foldOpenInTab).toBe(true);
  });

  it("never folds units that aren't present, but still compacts the nav", () => {
    const plan = planPeekHeaderLayout({
      ...base,
      actionsWidth: undefined,
      openInTabWidth: undefined,
      headerWidth: 300,
    });
    expect(plan.foldActions).toBe(false);
    expect(plan.foldOpenInTab).toBe(false);
    expect(plan.navCompact).toBe(true);
  });
});
