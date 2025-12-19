/**
 * Tests for treeExpansion.ts utilities
 *
 * Critical functionality: O(log n) toggle performance, ancestor expansion
 */

import {
  toggleNodeExpansion,
  expandToNode,
  expandAllDescendants,
  collapseAllDescendants,
  exportExpansionState,
  applyExpansionState,
} from "./treeExpansion";
import { buildTreeFromJSON } from "./treeStructure";

describe("treeExpansion", () => {
  describe("toggleNodeExpansion", () => {
    it("should toggle node expansion state", () => {
      const tree = buildTreeFromJSON(
        { user: { name: "Alice", age: 25 } },
        { rootKey: "root", initialExpansion: true },
      );

      const userNode = tree.rootNode.children[0];
      expect(userNode).toBeDefined();
      expect(userNode!.isExpanded).toBe(true);

      // Toggle to collapsed
      toggleNodeExpansion(tree, userNode!.id);
      expect(userNode!.isExpanded).toBe(false);
      expect(userNode!.childOffsets).toEqual([]);

      // Toggle back to expanded
      toggleNodeExpansion(tree, userNode!.id);
      expect(userNode!.isExpanded).toBe(true);
      expect(userNode!.childOffsets.length).toBeGreaterThan(0);
    });

    it("should update childOffsets in ancestors after toggle", () => {
      const tree = buildTreeFromJSON(
        {
          level1: {
            level2: {
              level3: "value",
            },
          },
        },
        { rootKey: "root", initialExpansion: true },
      );

      const level1Node = tree.rootNode.children[0];
      const level2Node = level1Node?.children[0];
      expect(level2Node).toBeDefined();

      const initialRootDescendants = tree.rootNode.visibleDescendantCount;

      // Collapse level2
      toggleNodeExpansion(tree, level2Node!.id);

      // Root should have fewer visible descendants now
      expect(tree.rootNode.visibleDescendantCount).toBeLessThan(
        initialRootDescendants,
      );

      // Level1 should have updated childOffsets
      expect(level1Node!.visibleDescendantCount).toBeLessThan(2);
    });

    it("should not toggle non-expandable nodes", () => {
      const tree = buildTreeFromJSON(
        { name: "Alice", age: 25 },
        { rootKey: "root", initialExpansion: true },
      );

      const nameNode = tree.rootNode.children[0]; // Leaf node
      expect(nameNode).toBeDefined();
      expect(nameNode!.isExpandable).toBe(false);

      const initialExpanded = nameNode!.isExpanded;
      toggleNodeExpansion(tree, nameNode!.id);

      // Should not change
      expect(nameNode!.isExpanded).toBe(initialExpanded);
    });
  });

  describe("expandToNode", () => {
    it("should expand all ancestors to make node visible", () => {
      const tree = buildTreeFromJSON(
        {
          level1: {
            level2: {
              level3: "target",
            },
          },
        },
        { rootKey: "root", initialExpansion: false },
      );

      // All nodes should be collapsed initially
      const level1Node = tree.rootNode.children[0];
      expect(level1Node!.isExpanded).toBe(false);

      // Find level3 node
      const level2Node = level1Node!.children[0];
      const level3Node = level2Node!.children[0];
      expect(level3Node).toBeDefined();

      // Expand to level3
      expandToNode(tree, level3Node!.id);

      // All ancestors should now be expanded
      expect(tree.rootNode.isExpanded).toBe(true);
      expect(level1Node!.isExpanded).toBe(true);
      expect(level2Node!.isExpanded).toBe(true);
    });

    it("should handle already expanded ancestors", () => {
      const tree = buildTreeFromJSON(
        { level1: { level2: "value" } },
        { rootKey: "root", initialExpansion: true },
      );

      const level1Node = tree.rootNode.children[0];
      const level2Node = level1Node!.children[0];

      // Already expanded, should not throw
      expandToNode(tree, level2Node!.id);

      expect(level1Node!.isExpanded).toBe(true);
    });
  });

  describe("expandAllDescendants", () => {
    it("should expand all descendants of a node", () => {
      const tree = buildTreeFromJSON(
        {
          parent: {
            child1: { grandchild1: "value" },
            child2: { grandchild2: "value" },
          },
        },
        { rootKey: "root", initialExpansion: false },
      );

      const parentNode = tree.rootNode.children[0];
      expect(parentNode).toBeDefined();

      // Initially collapsed
      expect(parentNode!.isExpanded).toBe(false);

      // Expand all descendants
      expandAllDescendants(tree, parentNode!.id);

      // Parent and all children should be expanded
      expect(parentNode!.isExpanded).toBe(true);
      parentNode!.children.forEach((child) => {
        if (child.isExpandable) {
          expect(child.isExpanded).toBe(true);
        }
      });
    });

    it("should update visibleDescendantCount correctly", () => {
      const tree = buildTreeFromJSON(
        {
          parent: {
            child1: "value1",
            child2: "value2",
          },
        },
        { rootKey: "root", initialExpansion: false },
      );

      const parentNode = tree.rootNode.children[0];
      expect(parentNode!.visibleDescendantCount).toBe(0);

      expandAllDescendants(tree, parentNode!.id);

      // Should have visible descendants now
      expect(parentNode!.visibleDescendantCount).toBeGreaterThan(0);
    });
  });

  describe("collapseAllDescendants", () => {
    it("should collapse all descendants of a node", () => {
      const tree = buildTreeFromJSON(
        {
          parent: {
            child1: { grandchild1: "value" },
            child2: { grandchild2: "value" },
          },
        },
        { rootKey: "root", initialExpansion: true },
      );

      const parentNode = tree.rootNode.children[0];
      expect(parentNode).toBeDefined();

      // Initially expanded
      expect(parentNode!.isExpanded).toBe(true);

      // Collapse all descendants
      collapseAllDescendants(tree, parentNode!.id);

      // Parent and all children should be collapsed
      expect(parentNode!.isExpanded).toBe(false);
      expect(parentNode!.visibleDescendantCount).toBe(0);
      parentNode!.children.forEach((child) => {
        if (child.isExpandable) {
          expect(child.isExpanded).toBe(false);
        }
      });
    });
  });

  describe("exportExpansionState and applyExpansionState", () => {
    it("should round-trip expansion state correctly", () => {
      const tree = buildTreeFromJSON(
        {
          user: { name: "Alice", settings: { theme: "dark" } },
          config: { timeout: 5000 },
        },
        { rootKey: "root", initialExpansion: true },
      );

      // Collapse specific nodes
      const userNode = tree.rootNode.children[0];
      toggleNodeExpansion(tree, userNode!.id);

      // Export state
      const exportedState = exportExpansionState(tree);

      // Build new tree
      const tree2 = buildTreeFromJSON(
        {
          user: { name: "Alice", settings: { theme: "dark" } },
          config: { timeout: 5000 },
        },
        { rootKey: "root", initialExpansion: true },
      );

      // Apply state
      applyExpansionState(tree2, exportedState);

      // Should match original tree expansion
      const userNode2 = tree2.rootNode.children[0];
      expect(userNode2!.isExpanded).toBe(userNode!.isExpanded);
    });

    it("should handle boolean expansion state", () => {
      const tree = buildTreeFromJSON(
        { user: { name: "Alice" } },
        { rootKey: "root", initialExpansion: true },
      );

      // Apply false (collapse all)
      applyExpansionState(tree, false);

      expect(tree.rootNode.children[0]!.isExpanded).toBe(false);

      // Apply true (expand all)
      applyExpansionState(tree, true);

      expect(tree.rootNode.children[0]!.isExpanded).toBe(true);
    });
  });
});
