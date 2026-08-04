// @vitest-environment jsdom

import { type TreeNode } from "@/src/features/traces/fns/types";
import { flattenChronological } from "@/src/features/traces/components/TraceLogView/fns/flattenChronological";
import {
  createNode,
  createTraceRoot,
} from "@/src/features/traces/components/TraceLogView/__tests__/treeNode.fixtures";

describe("flattenChronological", () => {
  it("should return empty array for trace with no observations", () => {
    const root = createTraceRoot([]);
    const result = flattenChronological([root]);
    expect(result).toHaveLength(0);
  });

  it("should sort observations by startTime", () => {
    const obs1 = createNode({
      id: "obs-1",
      type: "GENERATION",
      name: "first",
      startTime: new Date("2024-01-01T00:00:03Z"),
      depth: 0,
    });
    const obs2 = createNode({
      id: "obs-2",
      type: "SPAN",
      name: "second",
      startTime: new Date("2024-01-01T00:00:01Z"),
      depth: 0,
    });
    const obs3 = createNode({
      id: "obs-3",
      type: "EVENT",
      name: "third",
      startTime: new Date("2024-01-01T00:00:02Z"),
      depth: 0,
    });
    const root = createTraceRoot([obs1, obs2, obs3]);

    const result = flattenChronological([root]);

    expect(result).toHaveLength(3);
    expect(result[0].node.id).toBe("obs-2"); // earliest
    expect(result[1].node.id).toBe("obs-3");
    expect(result[2].node.id).toBe("obs-1"); // latest
  });

  it("should flatten nested children chronologically", () => {
    const child = createNode({
      id: "child",
      type: "GENERATION",
      name: "child",
      startTime: new Date("2024-01-01T00:00:01Z"),
      depth: 1,
    });
    const parent = createNode({
      id: "parent",
      type: "SPAN",
      name: "parent",
      startTime: new Date("2024-01-01T00:00:02Z"),
      children: [child],
      depth: 0,
    });
    const root = createTraceRoot([parent]);

    const result = flattenChronological([root]);

    expect(result).toHaveLength(2);
    // Child started before parent, so comes first chronologically
    expect(result[0].node.id).toBe("child");
    expect(result[1].node.id).toBe("parent");
  });

  it("should have no treeLines in chronological mode", () => {
    const child = createNode({
      id: "child",
      type: "GENERATION",
      startTime: new Date("2024-01-01T00:00:02Z"),
      depth: 1,
    });
    const parent = createNode({
      id: "parent",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:01Z"),
      children: [child],
      depth: 0,
    });
    const root = createTraceRoot([parent]);

    const result = flattenChronological([root]);

    // All items should have empty treeLines (flat view)
    result.forEach((item) => {
      expect(item.treeLines).toEqual([]);
    });
  });

  describe.skip("performance", () => {
    it("should handle 1000 observations efficiently", () => {
      const observations: TreeNode[] = [];
      for (let i = 0; i < 1000; i++) {
        observations.push(
          createNode({
            id: `obs-${i}`,
            type: "GENERATION",
            name: `observation-${i}`,
            startTime: new Date(Date.now() + i * 1000),
            depth: 0,
          }),
        );
      }
      const root = createTraceRoot(observations);

      const start = performance.now();
      const result = flattenChronological([root]);
      const duration = performance.now() - start;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });
  });
});
