/**
 * Comprehensive test suite for tree building functionality
 *
 * Tests cover:
 * 1. Basic tree structure building
 * 2. Child ordering (critical for line number correctness)
 * 3. Absolute line numbers
 * 4. Tree navigation metadata
 * 5. Edge cases
 */

import { buildTreeFromJSON, type TreeNode } from "./treeStructure";
import { getAllVisibleNodes, getNodeByIndex } from "./treeNavigation";

describe("Tree Structure Building", () => {
  describe("Basic Structure", () => {
    it("should handle null", () => {
      const tree = buildTreeFromJSON(null, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree).toBeDefined();
      expect(tree.rootNode.value).toBeNull();
      expect(tree.rootNode.type).toBe("null");
      expect(tree.rootNode.isExpandable).toBe(false);
      expect(tree.totalNodeCount).toBe(1);
    });

    it("should handle undefined", () => {
      const tree = buildTreeFromJSON(undefined, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree).toBeDefined();
      expect(tree.rootNode.value).toBeUndefined();
      expect(tree.rootNode.type).toBe("undefined");
      expect(tree.rootNode.isExpandable).toBe(false);
      expect(tree.totalNodeCount).toBe(1);
    });

    it("should handle primitives", () => {
      const testCases = [
        { value: "hello", type: "string" },
        { value: 42, type: "number" },
        { value: true, type: "boolean" },
        { value: false, type: "boolean" },
      ];

      testCases.forEach(({ value, type }) => {
        const tree = buildTreeFromJSON(value, {
          rootKey: "root",
          initialExpansion: true,
        });

        expect(tree.rootNode.value).toBe(value);
        expect(tree.rootNode.type).toBe(type);
        expect(tree.rootNode.isExpandable).toBe(false);
        expect(tree.rootNode.children).toHaveLength(0);
        expect(tree.totalNodeCount).toBe(1);
      });
    });

    it("should handle empty object", () => {
      const tree = buildTreeFromJSON(
        {},
        { rootKey: "root", initialExpansion: true },
      );

      expect(tree.rootNode.type).toBe("object");
      expect(tree.rootNode.isExpandable).toBe(true);
      expect(tree.rootNode.children).toHaveLength(0);
      expect(tree.rootNode.childCount).toBe(0);
      expect(tree.totalNodeCount).toBe(1);
    });

    it("should handle empty array", () => {
      const tree = buildTreeFromJSON([], {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.rootNode.type).toBe("array");
      expect(tree.rootNode.isExpandable).toBe(true);
      expect(tree.rootNode.children).toHaveLength(0);
      expect(tree.rootNode.childCount).toBe(0);
      expect(tree.totalNodeCount).toBe(1);
    });

    it("should handle simple object with primitives", () => {
      const data = { a: 1, b: "hello", c: true };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.rootNode.type).toBe("object");
      expect(tree.rootNode.children).toHaveLength(3);
      expect(tree.rootNode.childCount).toBe(3);
      expect(tree.totalNodeCount).toBe(4); // root + 3 children

      // Check children
      expect(tree.rootNode.children[0]?.key).toBe("a");
      expect(tree.rootNode.children[0]?.value).toBe(1);
      expect(tree.rootNode.children[1]?.key).toBe("b");
      expect(tree.rootNode.children[1]?.value).toBe("hello");
      expect(tree.rootNode.children[2]?.key).toBe("c");
      expect(tree.rootNode.children[2]?.value).toBe(true);
    });

    it("should handle simple array with primitives", () => {
      const data = [1, "hello", true];
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.rootNode.type).toBe("array");
      expect(tree.rootNode.children).toHaveLength(3);
      expect(tree.rootNode.childCount).toBe(3);
      expect(tree.totalNodeCount).toBe(4); // root + 3 children

      // Check children
      expect(tree.rootNode.children[0]?.key).toBe(0);
      expect(tree.rootNode.children[0]?.value).toBe(1);
      expect(tree.rootNode.children[1]?.key).toBe(1);
      expect(tree.rootNode.children[1]?.value).toBe("hello");
      expect(tree.rootNode.children[2]?.key).toBe(2);
      expect(tree.rootNode.children[2]?.value).toBe(true);
    });
  });

  describe("Child Ordering (Critical)", () => {
    it("should maintain correct array index order in children array", () => {
      const data = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Verify children array order matches array indices
      tree.rootNode.children.forEach((child, index) => {
        expect(child.key).toBe(index);
        expect(child.value).toBe(index);
        expect(child.indexInParent).toBe(index);
      });
    });

    it("should maintain correct object key order in children array", () => {
      const data = { a: 1, b: 2, c: 3, d: 4, e: 5 };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      const expectedKeys = Object.keys(data);
      tree.rootNode.children.forEach((child, index) => {
        expect(child.key).toBe(expectedKeys[index]);
        expect(child.indexInParent).toBe(index);
      });
    });

    it("should have indexInParent match position in parent.children array", () => {
      const data = {
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
          { id: 3, name: "Charlie" },
        ],
        metadata: { version: "1.0" },
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Check all nodes recursively
      const checkNode = (node: TreeNode) => {
        node.children.forEach((child, index) => {
          expect(child.indexInParent).toBe(index);
          expect(node.children[index]).toBe(child);
          checkNode(child);
        });
      };

      checkNode(tree.rootNode);
    });

    it("should maintain nested array ordering", () => {
      const data = {
        matrix: [
          [1, 2, 3],
          [4, 5, 6],
          [7, 8, 9],
        ],
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      const matrixNode = tree.rootNode.children[0]!;
      expect(matrixNode.key).toBe("matrix");
      expect(matrixNode.children).toHaveLength(3);

      // Check first row
      const row0 = matrixNode.children[0]!;
      expect(row0.key).toBe(0);
      expect(row0.children[0]?.value).toBe(1);
      expect(row0.children[1]?.value).toBe(2);
      expect(row0.children[2]?.value).toBe(3);

      // Check second row
      const row1 = matrixNode.children[1]!;
      expect(row1.key).toBe(1);
      expect(row1.children[0]?.value).toBe(4);
      expect(row1.children[1]?.value).toBe(5);
      expect(row1.children[2]?.value).toBe(6);
    });
  });

  describe("Absolute Line Numbers", () => {
    it("should assign root as line 1", () => {
      const tree = buildTreeFromJSON(
        { a: 1 },
        { rootKey: "root", initialExpansion: true },
      );
      expect(tree.rootNode.absoluteLineNumber).toBe(1);
    });

    it("should assign sequential line numbers in pre-order", () => {
      const data = {
        a: 1,
        b: 2,
        c: 3,
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Pre-order: root(1), a(2), b(3), c(4)
      expect(tree.rootNode.absoluteLineNumber).toBe(1);
      expect(tree.rootNode.children[0]?.absoluteLineNumber).toBe(2);
      expect(tree.rootNode.children[1]?.absoluteLineNumber).toBe(3);
      expect(tree.rootNode.children[2]?.absoluteLineNumber).toBe(4);
    });

    it("should assign line numbers correctly for nested structures", () => {
      const data = {
        user: {
          name: "Alice",
          age: 30,
        },
        settings: {
          theme: "dark",
        },
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Pre-order: root(1), user(2), name(3), age(4), settings(5), theme(6)
      expect(tree.rootNode.absoluteLineNumber).toBe(1);

      const userNode = tree.rootNode.children[0]!;
      expect(userNode.key).toBe("user");
      expect(userNode.absoluteLineNumber).toBe(2);
      expect(userNode.children[0]?.absoluteLineNumber).toBe(3);
      expect(userNode.children[1]?.absoluteLineNumber).toBe(4);

      const settingsNode = tree.rootNode.children[1]!;
      expect(settingsNode.key).toBe("settings");
      expect(settingsNode.absoluteLineNumber).toBe(5);
      expect(settingsNode.children[0]?.absoluteLineNumber).toBe(6);
    });

    it("should have monotonically increasing line numbers in allNodes array", () => {
      const data = {
        a: { b: { c: 1 } },
        d: [1, 2, 3],
        e: "hello",
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Check that allNodes array has increasing line numbers
      for (let i = 1; i < tree.allNodes.length; i++) {
        expect(tree.allNodes[i]!.absoluteLineNumber).toBeGreaterThan(
          tree.allNodes[i - 1]!.absoluteLineNumber,
        );
      }
    });

    it("should assign line numbers correctly for array structures", () => {
      const data = [
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ];

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Pre-order: root(1), [0](2), id(3), name(4), [1](5), id(6), name(7)
      expect(tree.rootNode.absoluteLineNumber).toBe(1);
      expect(tree.rootNode.children[0]?.absoluteLineNumber).toBe(2);
      expect(tree.rootNode.children[0]?.children[0]?.absoluteLineNumber).toBe(
        3,
      );
      expect(tree.rootNode.children[0]?.children[1]?.absoluteLineNumber).toBe(
        4,
      );
      expect(tree.rootNode.children[1]?.absoluteLineNumber).toBe(5);
      expect(tree.rootNode.children[1]?.children[0]?.absoluteLineNumber).toBe(
        6,
      );
      expect(tree.rootNode.children[1]?.children[1]?.absoluteLineNumber).toBe(
        7,
      );
    });
  });

  describe("Line Number vs Traversal Order Consistency", () => {
    it("should have getAllVisibleNodes return nodes with increasing line numbers", () => {
      const data = {
        a: 1,
        b: { c: 2, d: 3 },
        e: [4, 5, 6],
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });
      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // Verify line numbers increase monotonically
      for (let i = 1; i < visibleNodes.length; i++) {
        const prevLine = visibleNodes[i - 1]!.absoluteLineNumber;
        const currLine = visibleNodes[i]!.absoluteLineNumber;
        expect(currLine).toBeGreaterThan(prevLine);
      }
    });

    it("should have getNodeByIndex return nodes in same order as absoluteLineNumber", () => {
      const data = {
        users: [
          { id: 1, name: "Alice" },
          { id: 2, name: "Bob" },
        ],
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Get all nodes via getNodeByIndex
      const nodesByIndex: TreeNode[] = [];
      for (let i = 0; i < tree.totalNodeCount; i++) {
        const node = getNodeByIndex(tree.rootNode, i);
        if (node) nodesByIndex.push(node);
      }

      // Verify line numbers increase
      for (let i = 1; i < nodesByIndex.length; i++) {
        expect(nodesByIndex[i]!.absoluteLineNumber).toBeGreaterThan(
          nodesByIndex[i - 1]!.absoluteLineNumber,
        );
      }
    });
  });

  describe("Tree Navigation Metadata", () => {
    it("should compute childOffsets correctly for expanded nodes", () => {
      const data = {
        a: 1,
        b: { c: 2, d: 3 },
        e: 4,
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Root has 3 children: a(1 node), b(3 nodes: b + c + d), e(1 node)
      // childOffsets should be cumulative: [1, 4, 5]
      expect(tree.rootNode.childOffsets).toEqual([1, 4, 5]);
    });

    it("should compute visibleDescendantCount correctly", () => {
      const data = {
        a: 1,
        b: { c: 2, d: 3 },
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Root has 5 total descendants when all expanded: a, b, c, d (primitives not counted further)
      // Visible descendants: a(1) + b(1) + c(1) + d(1) = 4
      expect(tree.rootNode.visibleDescendantCount).toBe(4);

      // Node 'b' has 2 visible descendants: c, d
      const bNode = tree.rootNode.children[1]!;
      expect(bNode.visibleDescendantCount).toBe(2);
    });

    it("should set parent-child relationships correctly", () => {
      const data = { a: { b: { c: 1 } } };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      const aNode = tree.rootNode.children[0]!;
      const bNode = aNode.children[0]!;
      const cNode = bNode.children[0]!;

      expect(aNode.parentNode).toBe(tree.rootNode);
      expect(bNode.parentNode).toBe(aNode);
      expect(cNode.parentNode).toBe(bNode);
      expect(tree.rootNode.parentNode).toBeNull();
    });
  });

  describe("Edge Cases", () => {
    it("should handle deeply nested structures", () => {
      let data: any = { value: 0 };
      let current = data;

      // Create 20 levels deep
      for (let i = 1; i < 20; i++) {
        current.nested = { value: i };
        current = current.nested;
      }

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.totalNodeCount).toBe(40); // 20 objects + 20 values

      // Check max depth
      let maxDepth = 0;
      tree.allNodes.forEach((node) => {
        if (node.depth > maxDepth) maxDepth = node.depth;
      });
      expect(maxDepth).toBe(20);
    });

    it("should handle wide structures", () => {
      const data: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        data[`key${i}`] = i;
      }

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.rootNode.children).toHaveLength(100);
      expect(tree.totalNodeCount).toBe(101); // root + 100 children

      // Verify order
      tree.rootNode.children.forEach((child, index) => {
        expect(child.key).toBe(`key${index}`);
        expect(child.value).toBe(index);
      });
    });

    it("should handle mixed nested structures", () => {
      const data = {
        users: [
          { id: 1, tags: ["admin", "user"] },
          { id: 2, tags: ["user"] },
        ],
        config: {
          settings: {
            theme: "dark",
            features: ["f1", "f2"],
          },
        },
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      // Verify structure is built correctly
      expect(tree.rootNode.type).toBe("object");
      expect(tree.rootNode.children).toHaveLength(2);

      const usersNode = tree.rootNode.children[0]!;
      expect(usersNode.key).toBe("users");
      expect(usersNode.children).toHaveLength(2);

      const configNode = tree.rootNode.children[1]!;
      expect(configNode.key).toBe("config");
    });

    it("should handle special values", () => {
      const data = {
        infinity: Infinity,
        negInfinity: -Infinity,
        nan: NaN,
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.rootNode.children).toHaveLength(3);
      expect(tree.rootNode.children[0]?.value).toBe(Infinity);
      expect(tree.rootNode.children[1]?.value).toBe(-Infinity);
      expect(tree.rootNode.children[2]?.value).toBeNaN();
    });
  });

  describe("Node Map", () => {
    it("should build nodeMap with all nodes", () => {
      const data = { a: 1, b: { c: 2 } };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.nodeMap.size).toBe(tree.totalNodeCount);

      // Verify all nodes are accessible
      expect(tree.nodeMap.get("root")).toBe(tree.rootNode);
      expect(tree.nodeMap.get("root.a")).toBeDefined();
      expect(tree.nodeMap.get("root.b")).toBeDefined();
      expect(tree.nodeMap.get("root.b.c")).toBeDefined();
    });

    it("should handle array indices in node IDs", () => {
      const data = { items: [1, 2, 3] };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      expect(tree.nodeMap.get("root.items.0")).toBeDefined();
      expect(tree.nodeMap.get("root.items.1")).toBeDefined();
      expect(tree.nodeMap.get("root.items.2")).toBeDefined();
    });
  });

  describe("Expansion State", () => {
    it("should respect initialExpansion boolean", () => {
      const data = { a: { b: 1 } };

      const treeExpanded = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });
      expect(treeExpanded.rootNode.isExpanded).toBe(true);
      expect(treeExpanded.rootNode.children[0]?.isExpanded).toBe(true);

      const treeCollapsed = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: false,
      });
      expect(treeCollapsed.rootNode.isExpanded).toBe(false);
      expect(treeCollapsed.rootNode.children[0]?.isExpanded).toBe(false);
    });

    it("should respect expandDepth parameter", () => {
      const data = { a: { b: { c: 1 } } };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
        expandDepth: 2,
      });

      // Depth 0: root (expanded)
      expect(tree.rootNode.isExpanded).toBe(true);
      // Depth 1: a (expanded)
      expect(tree.rootNode.children[0]?.isExpanded).toBe(true);
      // Depth 2: b (collapsed - exceeds expandDepth)
      expect(tree.rootNode.children[0]?.children[0]?.isExpanded).toBe(false);
    });
  });

  describe("Performance Benchmarks", () => {
    it("should build tree for 1000 nodes in reasonable time", () => {
      // Create large structure
      const data: any[] = [];
      for (let i = 0; i < 100; i++) {
        data.push({
          id: i,
          name: `Item ${i}`,
          tags: ["tag1", "tag2", "tag3"],
          meta: { created: Date.now() },
        });
      }

      const startTime = performance.now();
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });
      const buildTime = performance.now() - startTime;

      // Should complete in under 100ms for ~1000 nodes
      expect(buildTime).toBeLessThan(100);
      expect(tree.totalNodeCount).toBeGreaterThan(500);
    });
  });
});
