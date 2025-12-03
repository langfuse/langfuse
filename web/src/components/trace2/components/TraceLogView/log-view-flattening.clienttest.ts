/**
 * Tests for log-view-flattening.ts
 *
 * @jest-environment jsdom
 */

import {
  flattenChronological,
  flattenTreeOrder,
  filterBySearch,
} from "./log-view-flattening";
import { type TreeNode } from "@/src/components/trace2/lib/types";

// Helper to create a minimal TreeNode for testing
function createNode(
  overrides: Partial<TreeNode> & { id: string; type: TreeNode["type"] },
): TreeNode {
  return {
    name: overrides.name ?? overrides.id,
    startTime: overrides.startTime ?? new Date("2024-01-01T00:00:00Z"),
    endTime: overrides.endTime ?? null,
    children: overrides.children ?? [],
    startTimeSinceTrace: overrides.startTimeSinceTrace ?? 0,
    startTimeSinceParentStart: overrides.startTimeSinceParentStart ?? null,
    depth: overrides.depth ?? 0,
    childrenDepth: overrides.childrenDepth ?? 0,
    ...overrides,
  };
}

// Helper to create a TRACE root node
function createTraceRoot(children: TreeNode[]): TreeNode {
  return createNode({
    id: "trace-root",
    type: "TRACE",
    name: "Test Trace",
    startTime: new Date("2024-01-01T00:00:00Z"),
    children,
    depth: -1,
    startTimeSinceTrace: 0,
    startTimeSinceParentStart: null,
  });
}

describe("log-view-flattening", () => {
  describe("flattenChronological", () => {
    it("should return empty array for trace with no observations", () => {
      const root = createTraceRoot([]);
      const result = flattenChronological(root);
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

      const result = flattenChronological(root);

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

      const result = flattenChronological(root);

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

      const result = flattenChronological(root);

      // All items should have empty treeLines (flat view)
      result.forEach((item) => {
        expect(item.treeLines).toEqual([]);
      });
    });
  });

  describe("flattenTreeOrder", () => {
    it("should return empty array for trace with no observations", () => {
      const root = createTraceRoot([]);
      const result = flattenTreeOrder(root);
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

      const result = flattenTreeOrder(root);

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

      const result = flattenTreeOrder(root);

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

      const result = flattenTreeOrder(root);

      expect(result[0].treeLines).toEqual([]); // parent - no ancestors
      expect(result[0].isLastSibling).toBe(true); // only root child

      expect(result[1].treeLines).toEqual([false]); // child-1: parent is last sibling, so no line
      expect(result[1].isLastSibling).toBe(false); // not last child

      expect(result[2].treeLines).toEqual([false]); // child-2: parent is last sibling
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

      const result = flattenTreeOrder(root);

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

      const result = flattenTreeOrder(root);

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
  });

  describe("filterBySearch", () => {
    const createTestItems = (): ReturnType<typeof flattenChronological> => {
      const obs1 = createNode({
        id: "gen-123",
        type: "GENERATION",
        name: "chat-completion",
        depth: 0,
      });
      const obs2 = createNode({
        id: "span-456",
        type: "SPAN",
        name: "process-request",
        depth: 0,
      });
      const obs3 = createNode({
        id: "event-789",
        type: "EVENT",
        name: "user-click",
        depth: 0,
      });
      const root = createTraceRoot([obs1, obs2, obs3]);
      return flattenChronological(root);
    };

    it("should return all items for empty query", () => {
      const items = createTestItems();
      const result = filterBySearch(items, "");
      expect(result).toHaveLength(3);
    });

    it("should return all items for whitespace query", () => {
      const items = createTestItems();
      const result = filterBySearch(items, "   ");
      expect(result).toHaveLength(3);
    });

    it("should filter by name (case-insensitive)", () => {
      const items = createTestItems();

      const result1 = filterBySearch(items, "chat");
      expect(result1).toHaveLength(1);
      expect(result1[0].node.name).toBe("chat-completion");

      const result2 = filterBySearch(items, "CHAT");
      expect(result2).toHaveLength(1);
      expect(result2[0].node.name).toBe("chat-completion");
    });

    it("should filter by type", () => {
      const items = createTestItems();

      const result = filterBySearch(items, "generation");
      expect(result).toHaveLength(1);
      expect(result[0].node.type).toBe("GENERATION");
    });

    it("should filter by id", () => {
      const items = createTestItems();

      const result = filterBySearch(items, "456");
      expect(result).toHaveLength(1);
      expect(result[0].node.id).toBe("span-456");
    });

    it("should match partial strings", () => {
      const items = createTestItems();

      const result = filterBySearch(items, "request");
      expect(result).toHaveLength(1);
      expect(result[0].node.name).toBe("process-request");
    });

    it("should return empty array when no matches", () => {
      const items = createTestItems();
      const result = filterBySearch(items, "nonexistent");
      expect(result).toHaveLength(0);
    });

    it("should match multiple items", () => {
      const items = createTestItems();

      // Both "span" type and observation names contain hyphen-separated words
      const result = filterBySearch(items, "-");
      expect(result).toHaveLength(3); // all have hyphens in name or id
    });

    it("should handle null name gracefully", () => {
      const obs = createNode({
        id: "obs-1",
        type: "GENERATION",
        name: undefined as unknown as string,
        depth: 0,
      });
      const root = createTraceRoot([obs]);
      const items = flattenChronological(root);

      // Should not throw
      const result = filterBySearch(items, "GENERATION");
      expect(result).toHaveLength(1);
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
      const result = flattenChronological(root);
      const duration = performance.now() - start;

      expect(result).toHaveLength(1000);
      expect(duration).toBeLessThan(100); // Should complete in < 100ms
    });

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
      const result = flattenTreeOrder(root);
      expect(result).toHaveLength(100);
    });
  });
});
