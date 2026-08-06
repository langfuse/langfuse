// @vitest-environment jsdom

import { type TreeNode } from "@/src/features/traces/fns/types";
import { flattenTreeOrder } from "@/src/features/traces/components/TraceLogView/fns/flattenTreeOrder";
import {
  createNode,
  createTraceRoot,
} from "@/src/features/traces/components/TraceLogView/__tests__/treeNode.fixtures";

describe("flattenTreeOrder", () => {
  it("should return empty array for trace with no observations", () => {
    const root = createTraceRoot([]);
    const result = flattenTreeOrder([root]);
    expect(result).toHaveLength(0);
  });

  it("should preserve parent-child order (DFS)", () => {
    const grandchild = createNode({
      id: "grandchild",
      type: "EVENT",
      startTime: new Date("2024-01-01T00:00:03Z"),
      depth: 2,
    });
    const child = createNode({
      id: "child",
      type: "GENERATION",
      startTime: new Date("2024-01-01T00:00:02Z"),
      children: [grandchild],
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

    const result = flattenTreeOrder([root]);

    expect(result).toHaveLength(3);
    expect(result[0].node.id).toBe("parent");
    expect(result[1].node.id).toBe("child");
    expect(result[2].node.id).toBe("grandchild");
  });

  it("should sort siblings by startTime", () => {
    const child1 = createNode({
      id: "child-1",
      type: "GENERATION",
      startTime: new Date("2024-01-01T00:00:03Z"),
      depth: 1,
    });
    const child2 = createNode({
      id: "child-2",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:01Z"),
      depth: 1,
    });
    const parent = createNode({
      id: "parent",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:00Z"),
      children: [child1, child2],
      depth: 0,
    });
    const root = createTraceRoot([parent]);

    const result = flattenTreeOrder([root]);

    expect(result).toHaveLength(3);
    expect(result[0].node.id).toBe("parent");
    expect(result[1].node.id).toBe("child-2"); // earlier startTime
    expect(result[2].node.id).toBe("child-1"); // later startTime
  });

  it("should calculate treeLines correctly", () => {
    const child1 = createNode({
      id: "child-1",
      type: "GENERATION",
      startTime: new Date("2024-01-01T00:00:01Z"),
      depth: 1,
    });
    const child2 = createNode({
      id: "child-2",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:02Z"),
      depth: 1,
    });
    const parent = createNode({
      id: "parent",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:00Z"),
      children: [child1, child2],
      depth: 0,
    });
    const root = createTraceRoot([parent]);

    const result = flattenTreeOrder([root]);

    expect(result[0].treeLines).toEqual([]); // parent - no ancestors
    expect(result[0].isLastSibling).toBe(true); // only root child

    expect(result[1].treeLines).toEqual([true]); // child-1: has sibling below (child-2)
    expect(result[1].isLastSibling).toBe(false); // not last child

    expect(result[2].treeLines).toEqual([false]); // child-2: no siblings below
    expect(result[2].isLastSibling).toBe(true); // last child
  });

  it("should handle multiple root observations", () => {
    const obs1 = createNode({
      id: "obs-1",
      type: "GENERATION",
      startTime: new Date("2024-01-01T00:00:02Z"),
      depth: 0,
    });
    const obs2 = createNode({
      id: "obs-2",
      type: "SPAN",
      startTime: new Date("2024-01-01T00:00:01Z"),
      depth: 0,
    });
    const root = createTraceRoot([obs1, obs2]);

    const result = flattenTreeOrder([root]);

    expect(result).toHaveLength(2);
    expect(result[0].node.id).toBe("obs-2"); // earlier
    expect(result[0].isLastSibling).toBe(false);
    expect(result[1].node.id).toBe("obs-1"); // later
    expect(result[1].isLastSibling).toBe(true);
  });

  it("should handle deeply nested structure", () => {
    // Create a chain: level0 -> level1 -> level2 -> level3
    const level3 = createNode({
      id: "level-3",
      type: "EVENT",
      depth: 3,
    });
    const level2 = createNode({
      id: "level-2",
      type: "GENERATION",
      children: [level3],
      depth: 2,
    });
    const level1 = createNode({
      id: "level-1",
      type: "SPAN",
      children: [level2],
      depth: 1,
    });
    const level0 = createNode({
      id: "level-0",
      type: "SPAN",
      children: [level1],
      depth: 0,
    });
    const root = createTraceRoot([level0]);

    const result = flattenTreeOrder([root]);

    expect(result).toHaveLength(4);
    expect(result.map((r) => r.node.id)).toEqual([
      "level-0",
      "level-1",
      "level-2",
      "level-3",
    ]);

    // All are only children, so all are last siblings
    result.forEach((item) => {
      expect(item.isLastSibling).toBe(true);
    });
  });

  describe.skip("performance", () => {
    it("should handle deeply nested tree (100 levels) without stack overflow", () => {
      // Build a chain of 100 nested nodes
      let current: TreeNode | null = null;
      for (let i = 99; i >= 0; i--) {
        current = createNode({
          id: `level-${i}`,
          type: "SPAN",
          children: current ? [current] : [],
          depth: i,
        });
      }
      const root = createTraceRoot([current!]);

      // Should not throw (stack overflow)
      const result = flattenTreeOrder([root]);
      expect(result).toHaveLength(100);
    });
  });
});
