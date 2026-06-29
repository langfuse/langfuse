/**
 * Tests for tree-flattening utilities.
 *
 * Tests the flattenTree function which converts hierarchical tree structures
 * into flat lists for virtualized rendering.
 *
 * Run with: pnpm test-client --testPathPattern="tree-flattening"
 */

import { flattenTree } from "./tree-flattening";

// Test node type
interface TestNode {
  id: string;
  name: string;
  children: TestNode[];
  startTime?: Date;
}

describe("flattenTree", () => {
  describe("basic flattening", () => {
    it("should return empty array for empty roots", () => {
      const result = flattenTree([], new Set());
      expect(result).toEqual([]);
    });

    it("should flatten single node with no children", () => {
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [],
      };

      const result = flattenTree([tree], new Set());

      expect(result).toEqual([
        {
          node: tree,
          depth: 0,
          treeLines: [],
          isLastSibling: true,
        },
      ]);
    });

    it("should flatten node with single child", () => {
      const child: TestNode = { id: "child", name: "Child", children: [] };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child],
      };

      const result = flattenTree([tree], new Set());

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        node: tree,
        depth: 0,
        treeLines: [],
        isLastSibling: true,
      });
      expect(result[1]).toEqual({
        node: child,
        depth: 1,
        treeLines: [false], // Last sibling gets false in treeLines
        isLastSibling: true,
      });
    });

    it("should flatten node with multiple children", () => {
      const child1: TestNode = { id: "child1", name: "Child 1", children: [] };
      const child2: TestNode = { id: "child2", name: "Child 2", children: [] };
      const child3: TestNode = { id: "child3", name: "Child 3", children: [] };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2, child3],
      };

      const result = flattenTree([tree], new Set());

      expect(result).toHaveLength(4);

      // Root
      expect(result[0]?.node.id).toBe("root");
      expect(result[0]?.depth).toBe(0);
      expect(result[0]?.isLastSibling).toBe(true);

      // First child - not last sibling
      expect(result[1]?.node.id).toBe("child1");
      expect(result[1]?.depth).toBe(1);
      expect(result[1]?.isLastSibling).toBe(false);
      expect(result[1]?.treeLines).toEqual([true]); // Has line for siblings below

      // Second child - not last sibling
      expect(result[2]?.node.id).toBe("child2");
      expect(result[2]?.depth).toBe(1);
      expect(result[2]?.isLastSibling).toBe(false);
      expect(result[2]?.treeLines).toEqual([true]); // Has line for siblings below

      // Third child - last sibling
      expect(result[3]?.node.id).toBe("child3");
      expect(result[3]?.depth).toBe(1);
      expect(result[3]?.isLastSibling).toBe(true);
      expect(result[3]?.treeLines).toEqual([false]); // Last sibling gets false
    });

    it("should flatten deeply nested tree", () => {
      const grandchild: TestNode = {
        id: "grandchild",
        name: "Grandchild",
        children: [],
      };
      const child: TestNode = {
        id: "child",
        name: "Child",
        children: [grandchild],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child],
      };

      const result = flattenTree([tree], new Set());

      expect(result).toHaveLength(3);

      // Root
      expect(result[0]?.node.id).toBe("root");
      expect(result[0]?.depth).toBe(0);

      // Child
      expect(result[1]?.node.id).toBe("child");
      expect(result[1]?.depth).toBe(1);

      // Grandchild
      expect(result[2]?.node.id).toBe("grandchild");
      expect(result[2]?.depth).toBe(2);
    });
  });

  describe("multiple root nodes", () => {
    it("flattens multiple roots with children, sorted by startTime", () => {
      //   root2 (09:00)    root1 (10:00)    root3 (11:00, last)
      //        |               |
      //     child2          child1
      //                        |
      //                    grandchild

      const grandchild: TestNode = { id: "grandchild", name: "", children: [] };
      const child1: TestNode = {
        id: "child1",
        name: "",
        children: [grandchild],
      };
      const child2: TestNode = { id: "child2", name: "", children: [] };
      const root1: TestNode = {
        id: "root1",
        name: "",
        children: [child1],
        startTime: new Date("2024-01-01T10:00Z"),
      };
      const root2: TestNode = {
        id: "root2",
        name: "",
        children: [child2],
        startTime: new Date("2024-01-01T09:00Z"),
      };
      const root3: TestNode = {
        id: "root3",
        name: "",
        children: [],
        startTime: new Date("2024-01-01T11:00Z"),
      };

      const result = flattenTree([root1, root2, root3], new Set());

      // Verify DFS order with sorting: root2 first (earliest), then root1, then root3 (latest)
      expect(result).toMatchObject([
        {
          node: { id: "root2" },
          depth: 0,
          isLastSibling: false,
          treeLines: [],
        },
        {
          node: { id: "child2" },
          depth: 1,
          isLastSibling: true,
          treeLines: [false],
        },
        {
          node: { id: "root1" },
          depth: 0,
          isLastSibling: false,
          treeLines: [],
        },
        {
          node: { id: "child1" },
          depth: 1,
          isLastSibling: true,
          treeLines: [false],
        },
        {
          node: { id: "grandchild" },
          depth: 2,
          isLastSibling: true,
          treeLines: [false, false],
        },
        { node: { id: "root3" }, depth: 0, isLastSibling: true, treeLines: [] },
      ]);
    });
  });

  describe("collapsed nodes", () => {
    it("should not include children of collapsed node", () => {
      const child1: TestNode = { id: "child1", name: "Child 1", children: [] };
      const child2: TestNode = { id: "child2", name: "Child 2", children: [] };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const collapsed = new Set(["root"]);
      const result = flattenTree([tree], collapsed);

      // Only root should be in the result, children hidden
      expect(result).toHaveLength(1);
      expect(result[0]?.node.id).toBe("root");
    });

    it("should not include grandchildren of collapsed node", () => {
      const grandchild: TestNode = {
        id: "grandchild",
        name: "Grandchild",
        children: [],
      };
      const child: TestNode = {
        id: "child",
        name: "Child",
        children: [grandchild],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child],
      };

      const collapsed = new Set(["child"]);
      const result = flattenTree([tree], collapsed);

      // Root and child, but not grandchild
      expect(result).toHaveLength(2);
      expect(result[0]?.node.id).toBe("root");
      expect(result[1]?.node.id).toBe("child");
    });

    it("should handle multiple collapsed nodes", () => {
      const grandchild1: TestNode = {
        id: "grandchild1",
        name: "Grandchild 1",
        children: [],
      };
      const grandchild2: TestNode = {
        id: "grandchild2",
        name: "Grandchild 2",
        children: [],
      };
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [grandchild1],
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [grandchild2],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const collapsed = new Set(["child1", "child2"]);
      const result = flattenTree([tree], collapsed);

      // Root and two children, no grandchildren
      expect(result).toHaveLength(3);
      expect(result[0]?.node.id).toBe("root");
      expect(result[1]?.node.id).toBe("child1");
      expect(result[2]?.node.id).toBe("child2");
    });

    it("should handle collapsed root in multiple roots scenario", () => {
      const child1: TestNode = { id: "child1", name: "Child 1", children: [] };
      const child2: TestNode = { id: "child2", name: "Child 2", children: [] };
      const root1: TestNode = {
        id: "root1",
        name: "Root 1",
        children: [child1],
      };
      const root2: TestNode = {
        id: "root2",
        name: "Root 2",
        children: [child2],
      };

      const collapsed = new Set(["root1"]);
      const result = flattenTree([root1, root2], collapsed);

      // root1 collapsed (no child1), root2 expanded (with child2)
      expect(result).toHaveLength(3);
      expect(result[0]?.node.id).toBe("root1");
      expect(result[1]?.node.id).toBe("root2");
      expect(result[2]?.node.id).toBe("child2");
    });
  });

  describe("tree lines calculation", () => {
    it("should calculate tree lines for complex structure", () => {
      //        root
      //       /    \
      //    child1  child2 (last)
      //      |
      //   grandchild (last)

      const grandchild: TestNode = {
        id: "grandchild",
        name: "Grandchild",
        children: [],
      };
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [grandchild],
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const result = flattenTree([tree], new Set());

      // child1 should have tree line (not last sibling)
      const child1Result = result.find((n) => n.node.id === "child1");
      expect(child1Result?.treeLines).toEqual([true]);

      // child2 should have false tree line (last sibling)
      const child2Result = result.find((n) => n.node.id === "child2");
      expect(child2Result?.treeLines).toEqual([false]);

      // grandchild should have tree line at depth 1 (parent is not last)
      // and is itself last at depth 2
      const grandchildResult = result.find((n) => n.node.id === "grandchild");
      expect(grandchildResult?.treeLines).toEqual([true, false]);
      expect(grandchildResult?.isLastSibling).toBe(true);
    });

    it("should calculate tree lines for deep nesting with siblings", () => {
      //          root
      //         /    \
      //     child1   child2 (last)
      //       |
      //     gc1
      //       |
      //     ggc1 (last)

      const ggc1: TestNode = {
        id: "ggc1",
        name: "Great-grandchild 1",
        children: [],
      };
      const gc1: TestNode = {
        id: "gc1",
        name: "Grandchild 1",
        children: [ggc1],
      };
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [gc1],
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const result = flattenTree([tree], new Set());

      // ggc1 should have tree lines showing:
      // - depth 0: true (child1 is not last at level 1)
      // - depth 1: false (gc1 IS last at level 2)
      // - depth 2: false (ggc1 IS last at level 3)
      const ggc1Result = result.find((n) => n.node.id === "ggc1");
      expect(ggc1Result?.depth).toBe(3);
      expect(ggc1Result?.treeLines).toEqual([true, false, false]); // Mixed lines based on ancestry
    });
  });

  describe("sorting by startTime", () => {
    it("should sort children by startTime", () => {
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [],
        startTime: new Date("2024-01-01T10:00:00Z"),
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [],
        startTime: new Date("2024-01-01T09:00:00Z"), // Earlier
      };
      const child3: TestNode = {
        id: "child3",
        name: "Child 3",
        children: [],
        startTime: new Date("2024-01-01T11:00:00Z"), // Latest
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2, child3], // Unsorted
      };

      const result = flattenTree([tree], new Set());

      // Should be sorted by startTime
      expect(result[1]?.node.id).toBe("child2"); // 09:00
      expect(result[2]?.node.id).toBe("child1"); // 10:00
      expect(result[3]?.node.id).toBe("child3"); // 11:00
    });

    it("should handle nodes without startTime", () => {
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [],
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [],
        startTime: new Date("2024-01-01T10:00:00Z"),
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const result = flattenTree([tree], new Set());

      // Should not throw, nodes without startTime get 0
      expect(result).toHaveLength(3);
      expect(result[1]?.node.id).toBe("child1"); // No startTime (0)
      expect(result[2]?.node.id).toBe("child2"); // Has startTime
    });
  });

  describe("edge cases", () => {
    it("should handle empty children array", () => {
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [],
      };

      const result = flattenTree([tree], new Set());

      expect(result).toHaveLength(1);
      expect(result[0]?.node.id).toBe("root");
    });

    it("should handle very deep nesting", () => {
      // Create a chain of 10 nodes
      let current: TestNode = {
        id: "node9",
        name: "Node 9",
        children: [],
      };

      for (let i = 8; i >= 0; i--) {
        current = {
          id: `node${i}`,
          name: `Node ${i}`,
          children: [current],
        };
      }

      const result = flattenTree([current], new Set());

      expect(result).toHaveLength(10);
      expect(result[0]?.depth).toBe(0);
      expect(result[9]?.depth).toBe(9);
    });

    it("should preserve original tree structure (immutability)", () => {
      const child: TestNode = { id: "child", name: "Child", children: [] };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child],
      };

      const originalChildren = tree.children;
      flattenTree([tree], new Set());

      // Original tree should not be modified
      expect(tree.children).toBe(originalChildren);
      expect(tree.children).toHaveLength(1);
    });

    it("should preserve original roots array (immutability)", () => {
      const root1: TestNode = { id: "root1", name: "Root 1", children: [] };
      const root2: TestNode = { id: "root2", name: "Root 2", children: [] };
      const roots = [root1, root2];
      const originalLength = roots.length;

      flattenTree(roots, new Set());

      // Original roots array should not be modified
      expect(roots.length).toBe(originalLength);
      expect(roots[0]).toBe(root1);
      expect(roots[1]).toBe(root2);
    });
  });

  describe("complex real-world scenarios", () => {
    it("should handle mixed collapsed and expanded nodes", () => {
      //          root
      //         /    \
      //     child1   child2
      //    /     \      |
      //  gc1     gc2   gc3
      //
      // Collapse child1, keep child2 expanded

      const gc1: TestNode = { id: "gc1", name: "GC1", children: [] };
      const gc2: TestNode = { id: "gc2", name: "GC2", children: [] };
      const gc3: TestNode = { id: "gc3", name: "GC3", children: [] };
      const child1: TestNode = {
        id: "child1",
        name: "Child 1",
        children: [gc1, gc2],
      };
      const child2: TestNode = {
        id: "child2",
        name: "Child 2",
        children: [gc3],
      };
      const tree: TestNode = {
        id: "root",
        name: "Root",
        children: [child1, child2],
      };

      const collapsed = new Set(["child1"]);
      const result = flattenTree([tree], collapsed);

      // root, child1 (collapsed), child2, gc3
      expect(result).toHaveLength(4);
      expect(result.map((n) => n.node.id)).toEqual([
        "root",
        "child1",
        "child2",
        "gc3",
      ]);
    });

    it("should handle wide tree (many siblings)", () => {
      const children = Array.from({ length: 100 }, (_, i) => ({
        id: `child${i}`,
        name: `Child ${i}`,
        children: [],
      }));

      const tree: TestNode = {
        id: "root",
        name: "Root",
        children,
      };

      const result = flattenTree([tree], new Set());

      expect(result).toHaveLength(101); // root + 100 children

      // First child should not be last
      expect(result[1]?.isLastSibling).toBe(false);
      expect(result[1]?.treeLines).toEqual([true]);

      // Last child should be last
      expect(result[100]?.isLastSibling).toBe(true);
      expect(result[100]?.treeLines).toEqual([false]); // Last sibling gets false
    });
  });

  describe.skip("Performance Tests", () => {
    // Helper to generate tree structures at scale
    const generateTree = (
      count: number,
      structure: "flat" | "deep" | "balanced" | "realistic",
    ): TestNode => {
      if (structure === "flat") {
        // All nodes at root level
        const children: TestNode[] = [];
        for (let i = 0; i < count; i++) {
          children.push({
            id: `node-${i}`,
            name: `Node ${i}`,
            children: [],
            startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
          });
        }
        return {
          id: "root",
          name: "Root",
          children,
          startTime: new Date("2024-01-01T00:00:00.000Z"),
        };
      } else if (structure === "deep") {
        // Single linear chain (worst case)
        let current: TestNode = {
          id: `node-${count - 1}`,
          name: `Node ${count - 1}`,
          children: [],
          startTime: new Date(
            `2024-01-01T00:00:${(count - 1) % 60}.${(count - 1) % 1000}Z`,
          ),
        };

        for (let i = count - 2; i >= 0; i--) {
          current = {
            id: `node-${i}`,
            name: `Node ${i}`,
            children: [current],
            startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
          };
        }

        return current;
      } else if (structure === "balanced") {
        // Binary tree structure
        const nodes: TestNode[] = [];

        // Create all nodes first
        for (let i = 0; i < count; i++) {
          nodes.push({
            id: `node-${i}`,
            name: `Node ${i}`,
            children: [],
            startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
          });
        }

        // Build tree structure (parent at i, children at 2i+1 and 2i+2)
        for (let i = 0; i < count; i++) {
          const leftChildIndex = 2 * i + 1;
          const rightChildIndex = 2 * i + 2;

          if (leftChildIndex < count) {
            nodes[i].children.push(nodes[leftChildIndex]);
          }
          if (rightChildIndex < count) {
            nodes[i].children.push(nodes[rightChildIndex]);
          }
        }

        return nodes[0];
      } else {
        // Realistic: ~20% intermediate nodes, ~80% leaf nodes, max depth ~5
        const intermediateNodeCount = Math.floor(count * 0.2);
        const leafNodeCount = count - intermediateNodeCount;

        const allNodes: TestNode[] = [];

        // Create all nodes first
        for (let i = 0; i < count; i++) {
          allNodes.push({
            id: `node-${i}`,
            name: `Node ${i}`,
            children: [],
            startTime: new Date(`2024-01-01T00:00:${i % 60}.${i % 1000}Z`),
          });
        }

        // Build realistic hierarchy
        // Root nodes (10% of intermediate nodes)
        const rootCount = Math.max(1, Math.floor(intermediateNodeCount * 0.1));
        const roots: TestNode[] = allNodes.slice(0, rootCount);

        // Remaining intermediate nodes attach to previous nodes
        for (let i = rootCount; i < intermediateNodeCount; i++) {
          const parentIndex = Math.floor(Math.random() * i);
          allNodes[parentIndex].children.push(allNodes[i]);
        }

        // Leaf nodes attach to any intermediate node
        for (let i = 0; i < leafNodeCount; i++) {
          const nodeIndex = intermediateNodeCount + i;
          const parentIndex = Math.floor(Math.random() * intermediateNodeCount);
          allNodes[parentIndex].children.push(allNodes[nodeIndex]);
        }

        // Create root with all root-level nodes as children
        return {
          id: "root",
          name: "Root",
          children: roots,
          startTime: new Date("2024-01-01T00:00:00.000Z"),
        };
      }
    };

    const runPerformanceTest = (
      scale: number,
      structure: "flat" | "deep" | "balanced" | "realistic",
      collapsedPercent: number,
      threshold: number,
    ) => {
      const tree = generateTree(scale, structure);

      // Collapse a percentage of nodes
      const collapsedNodes = new Set<string>();
      if (collapsedPercent > 0) {
        // Collect all node IDs via flattening first
        const allFlattened = flattenTree([tree], new Set());
        const collapseCount = Math.floor(
          allFlattened.length * (collapsedPercent / 100),
        );
        for (let i = 0; i < collapseCount; i++) {
          const nodeIndex = Math.floor(Math.random() * allFlattened.length);
          collapsedNodes.add(allFlattened[nodeIndex].node.id);
        }
      }

      const start = Date.now();
      const result = flattenTree([tree], collapsedNodes);
      const duration = Date.now() - start;

      // Verify result is valid
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].node.id).toBeDefined();

      // Log performance metrics
      const collapsedSuffix =
        collapsedPercent > 0 ? `, ${collapsedPercent}% collapsed` : "";
      console.log(
        `${scale.toLocaleString()} nodes (${structure}${collapsedSuffix}): ${duration}ms`,
      );

      // Assert threshold
      expect(duration).toBeLessThan(threshold);

      return duration;
    };

    describe("1k nodes", () => {
      const scale = 1_000;
      const threshold = 100; // 100ms

      it("flattens flat structure", () => {
        runPerformanceTest(scale, "flat", 0, threshold);
      });

      it("flattens deep chain", () => {
        runPerformanceTest(scale, "deep", 0, threshold);
      });

      it("flattens balanced tree", () => {
        runPerformanceTest(scale, "balanced", 0, threshold);
      });

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("10k nodes", () => {
      const scale = 10_000;
      const threshold = 750; // 750ms

      it("flattens flat structure", () => {
        runPerformanceTest(scale, "flat", 0, threshold);
      });

      it("flattens deep chain", () => {
        runPerformanceTest(scale, "deep", 0, threshold);
      });

      it("flattens balanced tree", () => {
        runPerformanceTest(scale, "balanced", 0, threshold);
      });

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("25k nodes", () => {
      const scale = 25_000;
      const threshold = 2_000; // 2s

      it("flattens flat structure", () => {
        runPerformanceTest(scale, "flat", 0, threshold);
      });

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("50k nodes", () => {
      const scale = 50_000;
      const threshold = 5_000; // 5s

      it("flattens flat structure", () => {
        runPerformanceTest(scale, "flat", 0, threshold);
      });

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("100k nodes", () => {
      const scale = 100_000;
      const threshold = 15_000; // 15s

      it("flattens flat structure", () => {
        runPerformanceTest(scale, "flat", 0, threshold);
      });

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("500k nodes (extreme - manual only)", () => {
      const scale = 500_000;
      const threshold = 60_000; // 60s

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });

    describe("1M nodes (extreme - manual only)", () => {
      const scale = 1_000_000;
      const threshold = 180_000; // 3 minutes

      it("flattens realistic structure", () => {
        runPerformanceTest(scale, "realistic", 0, threshold);
      });

      it("flattens with 30% collapsed nodes", () => {
        runPerformanceTest(scale, "realistic", 30, threshold);
      });
    });
  });
});
