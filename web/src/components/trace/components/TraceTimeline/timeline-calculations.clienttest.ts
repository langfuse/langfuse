// @vitest-environment jsdom

import {
  calculateTimelineOffset,
  calculateTimelineWidth,
  calculateStepSize,
  calculateTraceDuration,
  computeSelectionScrollTarget,
  findEarliestStartTime,
  getPredefinedStepSizes,
  REVEAL_LEFT_FRACTION,
  REVEAL_MARGIN_PX,
  SCALE_WIDTH,
  PREDEFINED_STEP_SIZES,
} from "./timeline-calculations";
import { type TreeNode } from "../../lib/types";

// Minimal TreeNode factory for origin/duration tests (only the fields the
// helpers read). `opts` lets a test set endTime / latency / children.
function makeNode(
  id: string,
  startTime: string,
  opts: {
    children?: TreeNode[];
    endTime?: string | null;
    latency?: number;
  } = {},
): TreeNode {
  const { children = [], endTime = null, latency } = opts;
  return {
    id,
    type: "SPAN",
    name: id,
    startTime: new Date(startTime),
    endTime: endTime === null ? null : new Date(endTime),
    latency,
    children,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
    depth: 0,
    childrenDepth: 0,
  } as TreeNode;
}

describe("timeline-calculations", () => {
  describe("calculateTimelineOffset", () => {
    it("should return 0 for node starting at trace start", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const totalDuration = 10; // 10 seconds

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(0);
    });

    it("should return SCALE_WIDTH for node starting at trace end", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:10Z"); // 10 seconds later
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH);
    });

    it("should return half SCALE_WIDTH for node starting at trace midpoint", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:05Z"); // 5 seconds later
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH / 2);
    });

    it("should handle custom scale width", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:05Z");
      const totalDuration = 10;
      const customWidth = 1800;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
        customWidth,
      );

      expect(offset).toBe(customWidth / 2);
    });

    it("should handle fractional seconds", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00.500Z"); // 0.5 seconds later
      const totalDuration = 1;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );

      expect(offset).toBe(SCALE_WIDTH / 2);
    });
  });

  describe("calculateTimelineWidth", () => {
    it("should return 0 for zero duration", () => {
      const width = calculateTimelineWidth(0, 10);
      expect(width).toBe(0);
    });

    it("should return SCALE_WIDTH for duration equal to total span", () => {
      const width = calculateTimelineWidth(10, 10);
      expect(width).toBe(SCALE_WIDTH);
    });

    it("should return half SCALE_WIDTH for duration half of total span", () => {
      const width = calculateTimelineWidth(5, 10);
      expect(width).toBe(SCALE_WIDTH / 2);
    });

    it("should handle custom scale width", () => {
      const customWidth = 1800;
      const width = calculateTimelineWidth(5, 10, customWidth);
      expect(width).toBe(customWidth / 2);
    });

    it("should handle fractional durations", () => {
      const width = calculateTimelineWidth(0.5, 1);
      expect(width).toBe(SCALE_WIDTH / 2);
    });

    it("should handle very small durations", () => {
      const width = calculateTimelineWidth(0.001, 10);
      expect(width).toBe(SCALE_WIDTH * 0.0001);
    });
  });

  describe("calculateStepSize", () => {
    it("should select appropriate step size for short traces", () => {
      // 1 second trace should use small step size
      const stepSize = calculateStepSize(1);
      expect(stepSize).toBeLessThanOrEqual(1);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should select appropriate step size for medium traces", () => {
      // 50 second trace
      const stepSize = calculateStepSize(50);
      expect(stepSize).toBeGreaterThan(1);
      expect(stepSize).toBeLessThanOrEqual(50);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should select appropriate step size for long traces", () => {
      // 500 second trace
      const stepSize = calculateStepSize(500);
      expect(stepSize).toBeGreaterThan(10);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should return largest step size for very long traces", () => {
      // 10000 second trace
      const stepSize = calculateStepSize(10000);
      expect(stepSize).toBe(
        PREDEFINED_STEP_SIZES[PREDEFINED_STEP_SIZES.length - 1],
      );
    });

    it("should return smallest applicable step size", () => {
      // For a 2 second trace, should select a step size >= calculated
      const stepSize = calculateStepSize(2);
      const calculatedStepSize = 2 / (SCALE_WIDTH / 100);
      expect(stepSize).toBeGreaterThanOrEqual(calculatedStepSize);
    });

    it("should handle custom scale width", () => {
      const customWidth = 1800;
      const stepSize = calculateStepSize(50, customWidth);
      expect(PREDEFINED_STEP_SIZES).toContain(stepSize);
    });

    it("should be consistent for same input", () => {
      const duration = 25;
      const stepSize1 = calculateStepSize(duration);
      const stepSize2 = calculateStepSize(duration);
      expect(stepSize1).toBe(stepSize2);
    });
  });

  describe("getPredefinedStepSizes", () => {
    it("should return array of step sizes", () => {
      const stepSizes = getPredefinedStepSizes();
      expect(Array.isArray(stepSizes)).toBe(true);
      expect(stepSizes.length).toBeGreaterThan(0);
    });

    it("should return a copy (not mutate original)", () => {
      const stepSizes = getPredefinedStepSizes();
      const originalLength = stepSizes.length;
      stepSizes.push(999);

      const stepSizes2 = getPredefinedStepSizes();
      expect(stepSizes2.length).toBe(originalLength);
      expect(stepSizes2).not.toContain(999);
    });

    it("should be in ascending order", () => {
      const stepSizes = getPredefinedStepSizes();
      for (let i = 1; i < stepSizes.length; i++) {
        expect(stepSizes[i]).toBeGreaterThan(stepSizes[i - 1]);
      }
    });

    it("should contain expected range of values", () => {
      const stepSizes = getPredefinedStepSizes();
      expect(stepSizes[0]).toBeLessThanOrEqual(1); // Has sub-second steps
      expect(stepSizes[stepSizes.length - 1]).toBeGreaterThanOrEqual(100); // Has large steps
    });
  });

  describe("Integration: offset + width should fit within trace", () => {
    it("should place a mid-trace observation correctly", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:03Z"); // starts at 3s
      const duration = 2; // lasts 2 seconds
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );
      const width = calculateTimelineWidth(duration, totalDuration);

      // Should start at 30% of scale width
      expect(offset).toBe(SCALE_WIDTH * 0.3);
      // Should be 20% of scale width
      expect(width).toBe(SCALE_WIDTH * 0.2);
      // Should end at 50% of scale width
      expect(offset + width).toBe(SCALE_WIDTH * 0.5);
    });

    it("should handle observation at trace boundary", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const duration = 10;
      const totalDuration = 10;

      const offset = calculateTimelineOffset(
        nodeStart,
        traceStart,
        totalDuration,
      );
      const width = calculateTimelineWidth(duration, totalDuration);

      expect(offset).toBe(0);
      expect(width).toBe(SCALE_WIDTH);
      expect(offset + width).toBe(SCALE_WIDTH);
    });
  });

  describe("Edge cases", () => {
    it("calculateTimelineOffset should handle zero duration trace", () => {
      const traceStart = new Date("2024-01-01T00:00:00Z");
      const nodeStart = new Date("2024-01-01T00:00:00Z");
      const totalDuration = 0;

      // Should not throw, but result is undefined (division by zero)
      expect(() => {
        calculateTimelineOffset(nodeStart, traceStart, totalDuration);
      }).not.toThrow();
    });

    it("calculateStepSize should handle very small durations", () => {
      const stepSize = calculateStepSize(0.1);
      expect(stepSize).toBe(PREDEFINED_STEP_SIZES[0]); // Should use smallest step
    });

    it("calculateTimelineWidth should handle duration larger than total span", () => {
      // This shouldn't happen in practice, but handle gracefully
      const width = calculateTimelineWidth(20, 10);
      expect(width).toBe(SCALE_WIDTH * 2); // Just calculates proportionally
    });
  });

  describe("findEarliestStartTime (timeline origin)", () => {
    it("returns null for an empty tree", () => {
      expect(findEarliestStartTime([])).toBeNull();
    });

    it("returns the root start time when the root starts first", () => {
      const root = makeNode("root", "2024-01-01T00:00:00Z", {
        children: [makeNode("child", "2024-01-01T00:00:02Z")],
      });
      expect(findEarliestStartTime([root])?.toISOString()).toBe(
        "2024-01-01T00:00:00.000Z",
      );
    });

    it("anchors to a child that starts BEFORE the root (the origin bug)", () => {
      // The root (TRACE wrapper) starts at the trace timestamp, but an early
      // observation began before it. The origin must be the child's start.
      const root = makeNode("root", "2024-01-01T00:00:05Z", {
        children: [
          makeNode("early-child", "2024-01-01T00:00:01Z"),
          makeNode("late-child", "2024-01-01T00:00:07Z"),
        ],
      });

      const origin = findEarliestStartTime([root]);
      expect(origin?.toISOString()).toBe("2024-01-01T00:00:01.000Z");

      // And the offset of that early child against the corrected origin is 0,
      // not negative as it would be when anchoring to the root.
      const offset = calculateTimelineOffset(
        new Date("2024-01-01T00:00:01Z"),
        origin!,
        10,
      );
      expect(offset).toBe(0);
    });

    it("descends into deeply nested children to find the minimum", () => {
      const root = makeNode("root", "2024-01-01T00:00:10Z", {
        children: [
          makeNode("a", "2024-01-01T00:00:08Z", {
            children: [
              makeNode("b", "2024-01-01T00:00:03Z", {
                children: [makeNode("c", "2024-01-01T00:00:02Z")],
              }),
            ],
          }),
        ],
      });
      expect(findEarliestStartTime([root])?.toISOString()).toBe(
        "2024-01-01T00:00:02.000Z",
      );
    });

    it("considers all roots when there are multiple", () => {
      const roots = [
        makeNode("r1", "2024-01-01T00:00:04Z"),
        makeNode("r2", "2024-01-01T00:00:01Z"),
        makeNode("r3", "2024-01-01T00:00:06Z"),
      ];
      expect(findEarliestStartTime(roots)?.toISOString()).toBe(
        "2024-01-01T00:00:01.000Z",
      );
    });
  });

  describe("calculateTraceDuration (timeline scale span)", () => {
    it("returns 0 for an empty tree", () => {
      expect(calculateTraceDuration([], new Date())).toBe(0);
    });

    it("spans from the origin to the latest end when end times exist", () => {
      // Root T0..T+10, child T+2..T+12 → latest end is T+12.
      const origin = new Date("2024-01-01T00:00:00Z");
      const root = makeNode("root", "2024-01-01T00:00:00Z", {
        endTime: "2024-01-01T00:00:10Z",
        children: [
          makeNode("child", "2024-01-01T00:00:02Z", {
            endTime: "2024-01-01T00:00:12Z",
          }),
        ],
      });
      expect(calculateTraceDuration([root], origin)).toBe(12);
    });

    it("measures the latest end relative to an origin BEFORE the root start", () => {
      // Early child anchors the origin at T+0; root runs T+5..T+9. The span
      // must reach the child's end (T+11), not just the root's end.
      const origin = new Date("2024-01-01T00:00:00Z");
      const root = makeNode("root", "2024-01-01T00:00:05Z", {
        endTime: "2024-01-01T00:00:09Z",
        children: [
          makeNode("early-child", "2024-01-01T00:00:00Z", {
            endTime: "2024-01-01T00:00:11Z",
          }),
        ],
      });
      expect(calculateTraceDuration([root], origin)).toBe(11);
    });

    it("offset-aware latency fallback covers a root that starts after the origin (the P2 bug)", () => {
      // No node has an end time, so `endTime ?? startTime` collapses
      // spanFromEnds to the start gap only. An early child anchors the origin
      // at T+0; the root starts at T+3 with latency 10. The root's bar reaches
      // T+13, so the scale MUST be 13 — not the naive max(spanFromEnds=3,
      // latency=10) = 10, which would let the bar overrun the axis.
      const origin = new Date("2024-01-01T00:00:00Z");
      const root = makeNode("root", "2024-01-01T00:00:03Z", {
        latency: 10,
        children: [makeNode("early-child", "2024-01-01T00:00:00Z")],
      });

      const span = calculateTraceDuration([root], origin);
      expect(span).toBe(13);

      // The root bar (offset from origin + width) fits exactly within the axis
      // (modulo floating-point rounding). With the pre-fix scale of 10 it would
      // have reached 1.3 * SCALE_WIDTH and overrun the last tick.
      const offset = calculateTimelineOffset(root.startTime, origin, span);
      const width = calculateTimelineWidth(root.latency!, span);
      expect(offset + width).toBeCloseTo(SCALE_WIDTH, 6);
    });

    it("uses the larger of end-based span and offset-aware latency", () => {
      // Root starts at the origin with latency 10 but a child ends at T+12 →
      // the end-based span (12) wins over the latency span (10).
      const origin = new Date("2024-01-01T00:00:00Z");
      const root = makeNode("root", "2024-01-01T00:00:00Z", {
        latency: 10,
        children: [
          makeNode("child", "2024-01-01T00:00:02Z", {
            endTime: "2024-01-01T00:00:12Z",
          }),
        ],
      });
      expect(calculateTraceDuration([root], origin)).toBe(12);
    });
  });
});

describe("computeSelectionScrollTarget", () => {
  // A 10-row viewport (260px at 26px rows), 400px wide, scrolled to (0, 0).
  const base = {
    index: 0,
    rowHeight: 26,
    scrollTop: 0,
    scrollLeft: 0,
    clientHeight: 260,
    clientWidth: 400,
    barStart: null,
    isInitial: false,
  };

  it("centers the row on initial load", () => {
    const { top } = computeSelectionScrollTarget({
      ...base,
      index: 100,
      isInitial: true,
    });
    // rowTop 2600, centered: 2600 - (260 - 26) / 2 = 2483
    expect(top).toBe(2483);
  });

  it("clamps the initial center to 0 for rows near the top", () => {
    const { top } = computeSelectionScrollTarget({
      ...base,
      index: 1,
      isInitial: true,
    });
    expect(top).toBe(0);
  });

  it("aligns a row above the fold to the top", () => {
    const { top } = computeSelectionScrollTarget({
      ...base,
      index: 2, // rowTop 52
      scrollTop: 500,
    });
    expect(top).toBe(52);
  });

  it("aligns a row below the fold to the bottom", () => {
    const { top } = computeSelectionScrollTarget({
      ...base,
      index: 50, // rowTop 1300, viewport [0, 260)
    });
    expect(top).toBe(1300 - 260 + 26);
  });

  it("keeps scrollTop for an already-visible row", () => {
    const { top } = computeSelectionScrollTarget({
      ...base,
      index: 5, // rowTop 130, fully inside [0, 260)
    });
    expect(top).toBe(0);
  });

  it("keeps scrollLeft while the bar start sits inside the comfort band", () => {
    const { left } = computeSelectionScrollTarget({
      ...base,
      scrollLeft: 100,
      barStart: 100 + REVEAL_MARGIN_PX, // exactly at the band edge → visible
    });
    expect(left).toBe(100);
  });

  it("reveals an off-screen-right bar a fraction from the left edge", () => {
    const { left } = computeSelectionScrollTarget({
      ...base,
      barStart: 900, // beyond viewRight 400
    });
    expect(left).toBe(900 - 400 * REVEAL_LEFT_FRACTION);
  });

  it("clamps an off-screen-left reveal at 0", () => {
    const { left } = computeSelectionScrollTarget({
      ...base,
      scrollLeft: 600,
      barStart: 10, // far left of the viewport
    });
    expect(left).toBe(0);
  });

  it("keeps scrollLeft when there is no bar (barStart null)", () => {
    const { left } = computeSelectionScrollTarget({
      ...base,
      scrollLeft: 250,
      barStart: null,
    });
    expect(left).toBe(250);
  });
});
