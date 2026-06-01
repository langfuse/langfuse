import { flattenTreeWithTimelineMetrics } from "./timeline-flattening";
import { SCALE_WIDTH } from "./timeline-calculations";
import type { TreeNode } from "../../lib/types";

const baseNode = (overrides: Partial<TreeNode> & { id: string }): TreeNode => ({
  id: overrides.id,
  type: "SPAN",
  name: overrides.id,
  startTime: new Date("2024-01-01T00:00:00Z"),
  endTime: new Date("2024-01-01T00:00:10Z"),
  startTimeSinceTrace: 0,
  startTimeSinceParentStart: null,
  depth: 0,
  childrenDepth: 0,
  children: [],
  ...overrides,
});

const traceStart = new Date("2024-01-01T00:00:00Z");
const totalDuration = 10; // 10 seconds

describe("flattenTreeWithTimelineMetrics", () => {
  describe("timeToFirstToken computation", () => {
    it("is undefined when node has no completionStartTime", () => {
      const node = baseNode({ id: "n1" });
      const result = flattenTreeWithTimelineMetrics(
        [node],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.timeToFirstToken).toBeUndefined();
      expect(result[0]?.metrics.firstTokenTimeOffset).toBeUndefined();
    });

    it("is undefined when completionStartTime is null", () => {
      const node = {
        ...baseNode({ id: "n1" }),
        completionStartTime: null,
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.timeToFirstToken).toBeUndefined();
    });

    it("computes TTFT in seconds from completionStartTime", () => {
      const node = {
        ...baseNode({ id: "n1" }),
        completionStartTime: new Date("2024-01-01T00:00:02Z"), // 2s after start
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.timeToFirstToken).toBe(2);
    });

    it("computes TTFT correctly for sub-second precision", () => {
      const node = {
        ...baseNode({ id: "n1" }),
        completionStartTime: new Date("2024-01-01T00:00:00.500Z"), // 500ms
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.timeToFirstToken).toBe(0.5);
    });

    it("computes TTFT relative to the node's own startTime, not trace start", () => {
      // Node starts at 3s into trace, first token at 5s — TTFT should be 2s
      const nodeStart = new Date("2024-01-01T00:00:03Z");
      const node = {
        ...baseNode({ id: "n1", startTime: nodeStart }),
        completionStartTime: new Date("2024-01-01T00:00:05Z"),
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.timeToFirstToken).toBe(2);
    });
  });

  describe("firstTokenTimeOffset computation", () => {
    it("matches expected pixel offset for completionStartTime at trace midpoint", () => {
      const node = {
        ...baseNode({ id: "n1" }),
        completionStartTime: new Date("2024-01-01T00:00:05Z"), // 5s = 50%
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.firstTokenTimeOffset).toBe(SCALE_WIDTH / 2);
    });

    it("firstTokenTimeOffset and timeToFirstToken are consistent", () => {
      // firstTokenOffset - startOffset should correspond to timeToFirstToken
      const nodeStart = new Date("2024-01-01T00:00:02Z");
      const completionStart = new Date("2024-01-01T00:00:04Z");
      const node = {
        ...baseNode({ id: "n1", startTime: nodeStart }),
        completionStartTime: completionStart,
      };
      const result = flattenTreeWithTimelineMetrics(
        [node as unknown as TreeNode],
        new Set(),
        traceStart,
        totalDuration,
      );

      const metrics = result[0]?.metrics;
      expect(metrics).toBeDefined();

      const firstTokenWidth =
        metrics!.firstTokenTimeOffset! - metrics!.startOffset;
      // firstTokenWidth in pixels / SCALE_WIDTH * totalDuration = timeToFirstToken
      const derivedTTFT = (firstTokenWidth / SCALE_WIDTH) * totalDuration;
      expect(derivedTTFT).toBeCloseTo(metrics!.timeToFirstToken!, 10);
    });
  });

  describe("existing behaviour is not broken", () => {
    it("returns empty array for empty roots", () => {
      const result = flattenTreeWithTimelineMetrics(
        [],
        new Set(),
        traceStart,
        totalDuration,
      );
      expect(result).toEqual([]);
    });

    it("computes startOffset and itemWidth correctly for a plain node", () => {
      const node = baseNode({
        id: "n1",
        startTime: new Date("2024-01-01T00:00:00Z"),
        endTime: new Date("2024-01-01T00:00:10Z"),
      });
      const result = flattenTreeWithTimelineMetrics(
        [node],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.startOffset).toBe(0);
      expect(result[0]?.metrics.itemWidth).toBe(SCALE_WIDTH);
    });

    it("hides children of collapsed nodes", () => {
      const child = baseNode({ id: "child" });
      const parent = baseNode({ id: "parent", children: [child] });
      const result = flattenTreeWithTimelineMetrics(
        [parent],
        new Set(["parent"]),
        traceStart,
        totalDuration,
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.node.id).toBe("parent");
    });

    it("preserves latency from node endTime - startTime", () => {
      const node = baseNode({
        id: "n1",
        startTime: new Date("2024-01-01T00:00:00Z"),
        endTime: new Date("2024-01-01T00:00:04Z"),
      });
      const result = flattenTreeWithTimelineMetrics(
        [node],
        new Set(),
        traceStart,
        totalDuration,
      );

      expect(result[0]?.metrics.latency).toBeCloseTo(4, 5);
    });
  });
});
