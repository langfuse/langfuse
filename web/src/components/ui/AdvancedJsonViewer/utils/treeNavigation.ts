/**
 * Tree navigation utilities for JIT rendering
 *
 * Core function: getNodeByIndex(index) - O(log n) lookup via binary search
 * This replaces the O(n) flattenJSON approach with on-demand row computation.
 *
 * How it works:
 * 1. Start at root
 * 2. If index === 0, return current node
 * 3. If index > 0, binary search childOffsets to find which child's subtree contains this index
 * 4. Recurse into that child with adjusted index
 * 5. Repeat until index === 0
 *
 * Example:
 *   Root has 3 children with childOffsets = [1, 11, 16, 24]
 *   getNodeByIndex(12) → 12 > 11, 12 < 16 → child 1 → recurse with index 12 - 11 = 1
 */

import type { TreeNode } from "./treeStructure";
import type { FlatJSONRow } from "../types";

/**
 * Get node at a specific index in the visible tree
 *
 * Uses iterative binary search to navigate the tree in O(log n) time.
 * This is the KEY optimization that replaces O(n) flattenJSON.
 *
 * @param rootNode - Root of the tree
 * @param index - 0-based index in visible rows
 * @returns TreeNode at that index, or null if out of bounds
 */
export function getNodeByIndex(
  rootNode: TreeNode,
  index: number,
): TreeNode | null {
  if (index < 0) return null;

  let currentNode = rootNode;
  let remainingIndex = index;

  // Iterative traversal (no recursion)
  while (remainingIndex > 0) {
    // If current node is not expanded, we can't go deeper
    if (!currentNode.isExpanded || currentNode.childOffsets.length === 0) {
      // ERROR: Requested index is out of bounds
      console.error("[getNodeByIndex] ERROR: Index out of bounds", {
        requestedIndex: index,
        currentNode: currentNode.id,
        remainingIndex,
        isExpanded: currentNode.isExpanded,
        childOffsets: currentNode.childOffsets,
      });
      return null;
    }

    const { childOffsets, children } = currentNode;

    // Binary search to find which child's subtree contains this index
    let childIndex = -1;

    // Special case: if remainingIndex is within first child's offset, it's child 0
    if (remainingIndex <= childOffsets[0]!) {
      childIndex = 0;
    } else {
      // Binary search
      let left = 0;
      let right = childOffsets.length - 1;

      while (left < right) {
        const mid = Math.floor((left + right) / 2);

        if (remainingIndex <= childOffsets[mid]!) {
          right = mid;
        } else {
          left = mid + 1;
        }
      }

      childIndex = left;
    }

    // Navigate into child
    const child = children[childIndex];
    if (!child) {
      // ERROR: Child not found (should never happen)
      console.error("[getNodeByIndex] ERROR: Child not found", {
        requestedIndex: index,
        childIndex,
        childrenLength: children.length,
        parentNode: currentNode.id,
      });
      return null;
    }

    // Adjust remaining index
    const previousOffset = childIndex > 0 ? childOffsets[childIndex - 1]! : 0;
    remainingIndex = remainingIndex - previousOffset - 1;

    currentNode = child;
  }

  return currentNode;
}

/**
 * Get total visible row count in tree
 *
 * @param rootNode - Root of the tree
 * @returns Total number of visible rows (including root)
 */
export function getVisibleRowCount(rootNode: TreeNode): number {
  return 1 + rootNode.visibleDescendantCount;
}

/**
 * Convert TreeNode to FlatJSONRow
 *
 * Used for compatibility with existing components that expect FlatJSONRow.
 * Eventually we can update components to work directly with TreeNode.
 *
 * @param node - TreeNode to convert
 * @param index - Index in visible rows (for rowIndex)
 * @returns FlatJSONRow
 */
export function treeNodeToFlatRow(node: TreeNode, _index: number): FlatJSONRow {
  return {
    id: node.id,
    depth: node.depth,
    key: node.key,
    value: node.value,
    type: node.type,
    isExpandable: node.isExpandable,
    isExpanded: node.isExpanded,
    parentId: node.parentNode?.id ?? null,
    childCount: node.childCount,
    indexInParent: node.indexInParent,
    isLastChild: node.isLastChild,
    pathArray: node.pathArray,
    absoluteLineNumber: node.absoluteLineNumber,
  };
}

/**
 * Find index of a node in the visible tree
 *
 * Useful for scrolling to a specific node (e.g., search results).
 * Uses iterative traversal to find the index.
 *
 * @param rootNode - Root of the tree
 * @param targetId - ID of the node to find
 * @returns 0-based index in visible rows, or -1 if not found/not visible
 */
export function findNodeIndex(rootNode: TreeNode, targetId: string): number {
  // Iterative pre-order traversal
  const stack: Array<{ node: TreeNode; index: number }> = [
    { node: rootNode, index: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { node, index } = current;

    // Check if this is the target
    if (node.id === targetId) {
      return index;
    }

    // If expanded, traverse children
    if (node.isExpanded && node.children.length > 0) {
      // Push children in REVERSE order (LIFO stack)
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i]!;
        const previousChildOffset = i > 0 ? node.childOffsets[i - 1]! : 0;

        stack.push({
          node: child,
          index: index + (i === 0 ? 1 : previousChildOffset + 1),
        });
      }
    }
  }

  return -1; // Not found
}

/**
 * Find index of section header node by sectionKey
 *
 * Searches for a node with nodeType === "section-header" and matching sectionKey.
 * Used for scroll-to-section functionality in multi-section viewers.
 *
 * @param rootNode - Root of the tree (typically meta-root)
 * @param sectionKey - Section key to find (e.g., "input", "output")
 * @returns 0-based index in visible rows, or -1 if not found/not visible
 */
export function findSectionHeaderIndex(
  rootNode: TreeNode,
  sectionKey: string,
): number {
  // Iterative pre-order traversal
  const stack: Array<{ node: TreeNode; index: number }> = [
    { node: rootNode, index: 0 },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { node, index } = current;

    // Check if this is a section header with matching key
    if (node.nodeType === "section-header" && node.sectionKey === sectionKey) {
      return index;
    }

    // If expanded, traverse children
    if (node.isExpanded && node.children.length > 0) {
      // Push children in REVERSE order (LIFO stack)
      for (let i = node.children.length - 1; i >= 0; i--) {
        const child = node.children[i]!;
        const previousChildOffset = i > 0 ? node.childOffsets[i - 1]! : 0;

        stack.push({
          node: child,
          index: index + (i === 0 ? 1 : previousChildOffset + 1),
        });
      }
    }
  }

  return -1; // Not found
}

/**
 * Get all visible nodes in tree (for debugging/testing)
 *
 * This is what the virtualizer would call getNodeByIndex for.
 * Not used in production, but useful for validation.
 *
 * @param rootNode - Root of the tree
 * @returns Array of all visible nodes
 */
export function getAllVisibleNodes(rootNode: TreeNode): TreeNode[] {
  const nodes: TreeNode[] = [];
  const stack: TreeNode[] = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop()!;
    nodes.push(node);

    // If expanded, add children in reverse order (LIFO)
    if (node.isExpanded && node.children.length > 0) {
      for (let i = node.children.length - 1; i >= 0; i--) {
        stack.push(node.children[i]!);
      }
    }
  }

  return nodes;
}

/**
 * Validate tree structure and offsets (for debugging)
 *
 * Checks that childOffsets are computed correctly.
 *
 * @param rootNode - Root of the tree
 * @returns True if valid, throws error if invalid
 */
export function validateTreeOffsets(rootNode: TreeNode): boolean {
  const stack: TreeNode[] = [rootNode];

  while (stack.length > 0) {
    const node = stack.pop()!;

    if (node.isExpanded && node.children.length > 0) {
      // Validate childOffsets
      const { children, childOffsets } = node;

      if (childOffsets.length !== children.length) {
        throw new Error(
          `[validateTreeOffsets] Node ${node.id}: childOffsets.length (${childOffsets.length}) !== children.length (${children.length})`,
        );
      }

      // Check cumulative offsets
      let expectedCumulative = 0;
      for (let i = 0; i < children.length; i++) {
        const child = children[i]!;
        expectedCumulative += 1 + child.visibleDescendantCount;

        if (childOffsets[i] !== expectedCumulative) {
          throw new Error(
            `[validateTreeOffsets] Node ${node.id}: childOffsets[${i}] is ${childOffsets[i]}, expected ${expectedCumulative}`,
          );
        }
      }

      // Push children for validation
      children.forEach((child) => stack.push(child));
    }
  }

  return true;
}

/**
 * Get path from root to node
 *
 * @param node - Target node
 * @returns Array of nodes from root to target (inclusive)
 */
export function getPathToNode(node: TreeNode): TreeNode[] {
  const path: TreeNode[] = [];
  let current: TreeNode | null = node;

  while (current !== null) {
    path.unshift(current);
    current = current.parentNode;
  }

  return path;
}

/**
 * Check if node is visible (all ancestors are expanded)
 *
 * @param node - Node to check
 * @returns True if visible in tree
 */
export function isNodeVisible(node: TreeNode): boolean {
  let current = node.parentNode;

  while (current !== null) {
    if (!current.isExpanded) {
      return false; // Ancestor is collapsed, so node is hidden
    }
    current = current.parentNode;
  }

  return true;
}

/**
 * Get depth range of visible nodes (min and max depth)
 *
 * @param rootNode - Root of the tree
 * @returns [minDepth, maxDepth]
 */
export function getVisibleDepthRange(rootNode: TreeNode): [number, number] {
  const visibleNodes = getAllVisibleNodes(rootNode);

  if (visibleNodes.length === 0) return [0, 0];

  let minDepth = Infinity;
  let maxDepth = -Infinity;

  visibleNodes.forEach((node) => {
    if (node.depth < minDepth) minDepth = node.depth;
    if (node.depth > maxDepth) maxDepth = node.depth;
  });

  return [minDepth, maxDepth];
}

/**
 * Validate getNodeByIndex for all visible indices
 *
 * Compares getNodeByIndex results with getAllVisibleNodes to ensure consistency.
 * Throws detailed error if any mismatch is found.
 *
 * @param rootNode - Root of the tree
 * @returns True if validation passes
 * @throws Error with detailed context if validation fails
 */
export function validateGetNodeByIndex(rootNode: TreeNode): boolean {
  const expectedNodes = getAllVisibleNodes(rootNode);
  const totalVisibleRows = expectedNodes.length;

  for (let i = 0; i < totalVisibleRows; i++) {
    const expectedNode = expectedNodes[i]!;
    const actualNode = getNodeByIndex(rootNode, i);

    if (!actualNode) {
      const error = {
        message: "getNodeByIndex returned null",
        index: i,
        expectedNode: {
          id: expectedNode.id,
          key: expectedNode.key,
          depth: expectedNode.depth,
          isExpanded: expectedNode.isExpanded,
        },
        totalVisibleRows,
      };
      console.error("[validateGetNodeByIndex] VALIDATION FAILED:", error);
      throw new Error(
        `getNodeByIndex(${i}) returned null, expected node ${expectedNode.id}`,
      );
    }

    if (actualNode.id !== expectedNode.id) {
      const error = {
        message: "Node ID mismatch",
        index: i,
        expectedNode: {
          id: expectedNode.id,
          key: expectedNode.key,
          depth: expectedNode.depth,
          isExpanded: expectedNode.isExpanded,
          pathArray: expectedNode.pathArray,
        },
        actualNode: {
          id: actualNode.id,
          key: actualNode.key,
          depth: actualNode.depth,
          isExpanded: actualNode.isExpanded,
          pathArray: actualNode.pathArray,
        },
        totalVisibleRows,
      };
      console.error("[validateGetNodeByIndex] VALIDATION FAILED:", error);
      throw new Error(
        `Node mismatch at index ${i}: expected ${expectedNode.id}, got ${actualNode.id}`,
      );
    }
  }

  return true;
}
