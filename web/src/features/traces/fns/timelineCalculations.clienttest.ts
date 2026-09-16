// @vitest-environment jsdom

import {
  calculateTraceDuration,
  computeSelectionScrollTarget,
  findEarliestStartTime,
} from "./timelineCalculations";
import { type TreeNode } from "@/src/features/traces/types/treeNode";

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

      expect(calculateTraceDuration([root], origin)).toBe(13);
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
  // A 10-row viewport (260px at 26px rows), scrolled to the top.
  const base = {
    index: 0,
    rowHeight: 26,
    scrollTop: 0,
    clientHeight: 260,
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
});
