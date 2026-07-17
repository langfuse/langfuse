// @vitest-environment jsdom

import {
  computeMaxVisualDepth,
  GUTTER_VISUAL_DEPTH,
  TREE_VISUAL_DEPTH,
  type VisualDepthConfig,
} from "./visual-depth";

describe("computeMaxVisualDepth", () => {
  const config: VisualDepthConfig = {
    indentPx: 20,
    reservedPx: 200,
    minDepth: 8,
    maxDepth: 32,
  };

  it("derives the cap from the width left after the content reserve", () => {
    // 600px - 200px reserve = 400px of indent budget = 20 levels at 20px
    expect(computeMaxVisualDepth(600, config)).toBe(20);
  });

  it("never caps below minDepth in narrow containers", () => {
    expect(computeMaxVisualDepth(240, config)).toBe(8);
    expect(computeMaxVisualDepth(1, config)).toBe(8);
  });

  it("never indents past maxDepth in wide containers", () => {
    expect(computeMaxVisualDepth(5000, config)).toBe(32);
  });

  it("stays bounded (maxDepth) for unmeasured containers", () => {
    expect(computeMaxVisualDepth(0, config)).toBe(32);
    expect(computeMaxVisualDepth(-1, config)).toBe(32);
  });

  it("keeps shallow traces unaffected at the default pane widths", () => {
    // Typical tree pane (~400px) and default timeline gutter (200px): the cap
    // must sit at or above the views' minDepth so everyday traces (depth < 8)
    // render exactly as before.
    expect(
      computeMaxVisualDepth(400, TREE_VISUAL_DEPTH),
    ).toBeGreaterThanOrEqual(TREE_VISUAL_DEPTH.minDepth);
    expect(
      computeMaxVisualDepth(200, GUTTER_VISUAL_DEPTH),
    ).toBeGreaterThanOrEqual(GUTTER_VISUAL_DEPTH.minDepth);
  });
});
