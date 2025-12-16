/**
 * @jest-environment jsdom
 */

import { buildTreeFromJSON } from "./treeStructure";
import {
  getAllVisibleNodes,
  getNodeByIndex,
  findNodeIndex,
  getVisibleRowCount,
  isNodeVisible,
} from "./treeNavigation";
import type { ExpansionState } from "../types";

describe("getAllVisibleNodes - Integration Tests", () => {
  describe("Root expansion behavior", () => {
    it("should return only root when root is collapsed (expansionState = false)", () => {
      const data = { a: 1, b: 2, c: 3 };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: false, // Collapse all
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      expect(visibleNodes).toHaveLength(1);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[0]?.isExpanded).toBe(false);
    });

    it("should return all nodes when fully expanded (expansionState = true)", () => {
      const data = { a: 1, b: 2, c: 3 };
      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true, // Expand all
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // root + a + b + c = 4 nodes
      expect(visibleNodes).toHaveLength(4);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[0]?.isExpanded).toBe(true);
      expect(visibleNodes[1]?.id).toBe("root.a");
      expect(visibleNodes[2]?.id).toBe("root.b");
      expect(visibleNodes[3]?.id).toBe("root.c");
    });

    it("should respect partial expansion state", () => {
      const data = { a: 1, b: { c: 2, d: 3 }, e: 4 };

      // Expand root and e, but collapse b
      const expansionState: ExpansionState = {
        root: true,
        "root.b": false,
        "root.e": true,
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: expansionState,
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // root + a + b (collapsed, no children) + e = 4 nodes
      expect(visibleNodes).toHaveLength(4);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[1]?.id).toBe("root.a");
      expect(visibleNodes[2]?.id).toBe("root.b");
      expect(visibleNodes[2]?.isExpanded).toBe(false);
      expect(visibleNodes[3]?.id).toBe("root.e");
    });

    it("should handle deep nesting with mixed expansion", () => {
      const data = {
        level1: {
          level2: {
            level3: {
              value: 42,
            },
          },
        },
      };

      // Expand root and level1, collapse level2
      const expansionState: ExpansionState = {
        root: true,
        "root.level1": true,
        "root.level1.level2": false,
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: expansionState,
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // root + level1 + level2 (collapsed, no level3) = 3 nodes
      expect(visibleNodes).toHaveLength(3);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[1]?.id).toBe("root.level1");
      expect(visibleNodes[2]?.id).toBe("root.level1.level2");
      expect(visibleNodes[2]?.isExpanded).toBe(false);
    });
  });

  describe("Array expansion", () => {
    it("should handle collapsed arrays", () => {
      const data = { items: [1, 2, 3] };

      const expansionState: ExpansionState = {
        root: true,
        "root.items": false, // Collapse array
      };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: expansionState,
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // root + items (collapsed, no children) = 2 nodes
      expect(visibleNodes).toHaveLength(2);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[1]?.id).toBe("root.items");
      expect(visibleNodes[1]?.isExpanded).toBe(false);
    });

    it("should handle expanded arrays", () => {
      const data = { items: [1, 2, 3] };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true, // Expand all
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);

      // root + items + 0 + 1 + 2 = 5 nodes
      expect(visibleNodes).toHaveLength(5);
      expect(visibleNodes[0]?.id).toBe("root");
      expect(visibleNodes[1]?.id).toBe("root.items");
      expect(visibleNodes[2]?.id).toBe("root.items.0");
      expect(visibleNodes[3]?.id).toBe("root.items.1");
      expect(visibleNodes[4]?.id).toBe("root.items.2");
    });
  });

  describe("Consistency with visibleDescendantCount", () => {
    it("should return count matching root.visibleDescendantCount + 1", () => {
      const data = { a: 1, b: { c: 2, d: 3 }, e: 4 };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);
      const expectedCount = 1 + tree.rootNode.visibleDescendantCount;

      expect(visibleNodes.length).toBe(expectedCount);
    });

    it("should match getVisibleRowCount utility", () => {
      const data = { a: 1, b: { c: 2, d: 3 }, e: 4 };

      const tree = buildTreeFromJSON(data, {
        rootKey: "root",
        initialExpansion: true,
      });

      const visibleNodes = getAllVisibleNodes(tree.rootNode);
      const rowCount = getVisibleRowCount(tree.rootNode);

      expect(visibleNodes.length).toBe(rowCount);
    });
  });
});

describe("getNodeByIndex - Integration Tests", () => {
  it("should return root at index 0", () => {
    const data = { a: 1, b: 2 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const node = getNodeByIndex(tree.rootNode, 0);

    expect(node?.id).toBe("root");
  });

  it("should return null for out-of-bounds index", () => {
    const data = { a: 1, b: 2 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleCount = getVisibleRowCount(tree.rootNode);
    const node = getNodeByIndex(tree.rootNode, visibleCount + 10);

    expect(node).toBeNull();
  });

  it("should navigate to collapsed node children (return null)", () => {
    const data = { a: { b: 1 } };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: {
        root: true,
        "root.a": false, // Collapse a
      },
    });

    // root (0), a (1) - collapsed, so index 2 would be a.b but it's hidden
    const node = getNodeByIndex(tree.rootNode, 2);

    expect(node).toBeNull(); // Out of bounds since a is collapsed
  });

  it("should find all visible nodes by index", () => {
    const data = { a: 1, b: 2, c: 3 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleNodes = getAllVisibleNodes(tree.rootNode);

    for (let i = 0; i < visibleNodes.length; i++) {
      const nodeViaIndex = getNodeByIndex(tree.rootNode, i);
      expect(nodeViaIndex?.id).toBe(visibleNodes[i]?.id);
    }
  });
});

describe("findNodeIndex - Integration Tests", () => {
  it("should find root at index 0", () => {
    const data = { a: 1, b: 2 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const index = findNodeIndex(tree.rootNode, "root");

    expect(index).toBe(0);
  });

  it("should find child node at correct index", () => {
    const data = { a: 1, b: 2, c: 3 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const indexB = findNodeIndex(tree.rootNode, "root.b");

    // root(0), a(1), b(2), c(3)
    expect(indexB).toBe(2);
  });

  it("should return -1 for collapsed (hidden) node", () => {
    const data = { a: { b: 1 } };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: {
        root: true,
        "root.a": false, // Collapse a, so a.b is hidden
      },
    });

    const index = findNodeIndex(tree.rootNode, "root.a.b");

    expect(index).toBe(-1); // Not visible
  });

  it("should return -1 for non-existent node", () => {
    const data = { a: 1 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const index = findNodeIndex(tree.rootNode, "root.nonexistent");

    expect(index).toBe(-1);
  });
});

describe("isNodeVisible - Integration Tests", () => {
  it("should return true for root node", () => {
    const data = { a: 1 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: false,
    });

    const visible = isNodeVisible(tree.rootNode);

    expect(visible).toBe(true); // Root is always visible
  });

  it("should return true for child when parent is expanded", () => {
    const data = { a: 1 };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const childA = tree.nodeMap.get("root.a");
    expect(childA).toBeDefined();

    const visible = isNodeVisible(childA!);

    expect(visible).toBe(true);
  });

  it("should return false for child when parent is collapsed", () => {
    const data = { a: { b: 1 } };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: {
        root: true,
        "root.a": false, // Collapse a
      },
    });

    const childB = tree.nodeMap.get("root.a.b");
    expect(childB).toBeDefined();

    const visible = isNodeVisible(childB!);

    expect(visible).toBe(false); // Parent a is collapsed
  });

  it("should return false when any ancestor is collapsed", () => {
    const data = {
      level1: {
        level2: {
          level3: {
            value: 42,
          },
        },
      },
    };

    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: {
        root: true,
        "root.level1": false, // Collapse level1
        "root.level1.level2": true, // level2 expanded (but hidden by level1)
      },
    });

    const level3 = tree.nodeMap.get("root.level1.level2.level3");
    expect(level3).toBeDefined();

    const visible = isNodeVisible(level3!);

    expect(visible).toBe(false); // level1 is collapsed
  });
});

describe("getNodeByIndex after expansion changes", () => {
  it("CRITICAL: should return valid nodes for ALL indexes after collapse", () => {
    // This test catches the bug where getNodeByIndex returns null for valid indexes
    const data = {
      items: [
        { id: 0, name: "Item 0" },
        { id: 1, name: "Item 1" },
        { id: 2, name: "Item 2" },
        { id: 3, name: "Item 3" },
        { id: 4, name: "Item 4" },
      ],
    };

    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    // Get initial row count
    const initialRowCount = 1 + tree.rootNode.visibleDescendantCount;

    // Verify all indexes are valid initially
    for (let i = 0; i < initialRowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      expect(node).not.toBeNull();
    }

    // Now collapse one of the items (e.g., items[1])
    const item1Node = tree.nodeMap.get("root.items.1");
    expect(item1Node).toBeDefined();

    // Import toggleNodeExpansion
    const { toggleNodeExpansion } = require("./treeExpansion");
    toggleNodeExpansion(tree, item1Node!.id);

    // Get new row count after collapse
    const newRowCount = 1 + tree.rootNode.visibleDescendantCount;

    // CRITICAL TEST: All indexes from 0 to newRowCount-1 MUST return valid nodes
    const failedIndexes: number[] = [];
    for (let i = 0; i < newRowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) {
        failedIndexes.push(i);
      }
    }

    // This is the CRITICAL assertion that will catch the bug
    expect(failedIndexes).toEqual([]);
    expect(failedIndexes.length).toBe(0);
  });

  it("CRITICAL: should handle multiple sequential collapses correctly", () => {
    const data = [
      { type: "A", items: [1, 2, 3] },
      { type: "B", items: [4, 5, 6] },
      { type: "C", items: [7, 8, 9] },
    ];

    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const { toggleNodeExpansion } = require("./treeExpansion");

    // Collapse root.0
    toggleNodeExpansion(tree, "root.0");

    let rowCount = 1 + tree.rootNode.visibleDescendantCount;
    let failedIndexes: number[] = [];

    for (let i = 0; i < rowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) failedIndexes.push(i);
    }

    expect(failedIndexes).toEqual([]);

    // Collapse root.1
    toggleNodeExpansion(tree, "root.1");

    rowCount = 1 + tree.rootNode.visibleDescendantCount;
    failedIndexes = [];

    for (let i = 0; i < rowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) failedIndexes.push(i);
    }

    expect(failedIndexes).toEqual([]);

    // Collapse root.2
    toggleNodeExpansion(tree, "root.2");

    rowCount = 1 + tree.rootNode.visibleDescendantCount;
    failedIndexes = [];

    for (let i = 0; i < rowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) failedIndexes.push(i);
    }

    expect(failedIndexes).toEqual([]);
  });

  it("CRITICAL: should handle expand after collapse correctly", () => {
    const data = { a: [1, 2, 3], b: [4, 5, 6] };

    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const { toggleNodeExpansion } = require("./treeExpansion");

    // Collapse a
    toggleNodeExpansion(tree, "root.a");

    let rowCount = 1 + tree.rootNode.visibleDescendantCount;
    let failedIndexes: number[] = [];

    for (let i = 0; i < rowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) failedIndexes.push(i);
    }

    expect(failedIndexes).toEqual([]);

    // Expand a again
    toggleNodeExpansion(tree, "root.a");

    rowCount = 1 + tree.rootNode.visibleDescendantCount;
    failedIndexes = [];

    for (let i = 0; i < rowCount; i++) {
      const node = getNodeByIndex(tree.rootNode, i);
      if (node === null) failedIndexes.push(i);
    }

    expect(failedIndexes).toEqual([]);
  });
});

describe("Edge Cases", () => {
  it("should handle empty object", () => {
    const data = {};
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleNodes = getAllVisibleNodes(tree.rootNode);

    expect(visibleNodes).toHaveLength(1); // Only root
    expect(visibleNodes[0]?.id).toBe("root");
  });

  it("should handle empty array", () => {
    const data = { items: [] };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleNodes = getAllVisibleNodes(tree.rootNode);

    expect(visibleNodes).toHaveLength(2); // root + items
    expect(visibleNodes[0]?.id).toBe("root");
    expect(visibleNodes[1]?.id).toBe("root.items");
  });

  it("should handle null values", () => {
    const data = { value: null };
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleNodes = getAllVisibleNodes(tree.rootNode);

    expect(visibleNodes).toHaveLength(2); // root + value
    expect(visibleNodes[1]?.value).toBeNull();
  });

  it("should handle primitives at root", () => {
    const data = 42;
    const tree = buildTreeFromJSON(data, {
      rootKey: "root",
      initialExpansion: true,
    });

    const visibleNodes = getAllVisibleNodes(tree.rootNode);

    expect(visibleNodes).toHaveLength(1); // Only root
    expect(visibleNodes[0]?.value).toBe(42);
    expect(visibleNodes[0]?.isExpandable).toBe(false);
  });
});
