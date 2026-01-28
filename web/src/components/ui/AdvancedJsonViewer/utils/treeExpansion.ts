/**
 * Tree expansion utilities for efficient expand/collapse
 *
 * Key optimization: Only recompute childOffsets for changed subtrees.
 * When toggling a node, we only need to update:
 * 1. The toggled node itself (isExpanded, childOffsets, visibleDescendantCount)
 * 2. All ancestors (childOffsets, visibleDescendantCount)
 *
 * This is O(log n) instead of O(n) full tree traversal.
 */

import type { TreeNode, TreeState } from "./treeStructure";
import type { ExpansionState } from "../types";
import { debugTime, debugTimeEnd } from "./debug";

/**
 * Toggle expansion state of a node
 *
 * This is the KEY operation that must be fast.
 * Only updates the toggled node and its ancestors (O(log n)).
 *
 * @param tree - Current tree state
 * @param nodeId - ID of node to toggle
 * @returns Updated tree state (mutates in place for performance)
 */
export function toggleNodeExpansion(
  tree: TreeState,
  nodeId: string,
): TreeState {
  const node = tree.nodeMap.get(nodeId);
  if (!node || !node.isExpandable) {
    return tree; // Can't toggle non-expandable nodes
  }

  // Toggle the node
  const newExpanded = !node.isExpanded;
  node.isExpanded = newExpanded;
  node.userExpand = newExpanded;

  // Recompute childOffsets for this node
  if (newExpanded) {
    recomputeNodeOffsets(node);
  } else {
    node.childOffsets = [];
    node.visibleDescendantCount = 0;
  }

  // Propagate changes up the tree (recompute all ancestors)
  propagateOffsetsUpward(node.parentNode);

  return tree;
}

/**
 * Recompute childOffsets and visibleDescendantCount for a single node
 *
 * Assumes children already have correct offsets.
 *
 * @param node - Node to recompute
 */
function recomputeNodeOffsets(node: TreeNode): void {
  if (!node.isExpanded || node.children.length === 0) {
    node.childOffsets = [];
    node.visibleDescendantCount = 0;
    return;
  }

  const offsets: number[] = [];
  let cumulative = 0;

  node.children.forEach((child) => {
    cumulative += 1 + child.visibleDescendantCount;
    offsets.push(cumulative);
  });

  node.childOffsets = offsets;
  node.visibleDescendantCount = cumulative;
}

/**
 * Propagate offset changes up the tree
 *
 * When a node's visibleDescendantCount changes, all ancestors need to update their offsets.
 * This is O(depth) = O(log n) for balanced trees.
 *
 * @param node - Starting node (usually parent of changed node)
 */
function propagateOffsetsUpward(node: TreeNode | null): void {
  let current = node;

  while (current !== null) {
    recomputeNodeOffsets(current);
    current = current.parentNode;
  }
}

/**
 * Expand all descendants of a node
 *
 * Uses iterative traversal to expand entire subtree.
 *
 * @param tree - Current tree state
 * @param nodeId - ID of node whose descendants to expand
 * @returns Updated tree state
 */
export function expandAllDescendants(
  tree: TreeState,
  nodeId: string,
): TreeState {
  debugTime("[expandAllDescendants]");

  const node = tree.nodeMap.get(nodeId);
  if (!node) {
    debugTimeEnd("[expandAllDescendants]");
    return tree;
  }

  // Iterative traversal to expand all descendants
  const stack: TreeNode[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.isExpandable) {
      current.isExpanded = true;
      current.userExpand = true;

      // Recompute offsets for this node
      recomputeNodeOffsets(current);

      // Add children to stack
      current.children.forEach((child) => stack.push(child));
    }
  }

  // Propagate changes up the tree
  propagateOffsetsUpward(node.parentNode);

  debugTimeEnd("[expandAllDescendants]");
  return tree;
}

/**
 * Collapse all descendants of a node
 *
 * Uses iterative traversal to collapse entire subtree.
 *
 * @param tree - Current tree state
 * @param nodeId - ID of node whose descendants to collapse
 * @returns Updated tree state
 */
export function collapseAllDescendants(
  tree: TreeState,
  nodeId: string,
): TreeState {
  debugTime("[collapseAllDescendants]");

  const node = tree.nodeMap.get(nodeId);
  if (!node) {
    debugTimeEnd("[collapseAllDescendants]");
    return tree;
  }

  // Iterative traversal to collapse all descendants
  const stack: TreeNode[] = [node];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.isExpandable) {
      current.isExpanded = false;
      current.userExpand = false;
      current.childOffsets = [];
      current.visibleDescendantCount = 0;

      // Add children to stack
      current.children.forEach((child) => stack.push(child));
    }
  }

  // Propagate changes up the tree
  propagateOffsetsUpward(node.parentNode);

  debugTimeEnd("[collapseAllDescendants]");
  return tree;
}

/**
 * Expand path to a specific node
 *
 * Expands all ancestors so the node becomes visible.
 * Useful for search results.
 *
 * @param tree - Current tree state
 * @param nodeId - ID of node to reveal
 * @returns Updated tree state
 */
export function expandToNode(tree: TreeState, nodeId: string): TreeState {
  const node = tree.nodeMap.get(nodeId);
  if (!node) return tree;

  // Walk up the tree and expand all ancestors
  let current = node.parentNode;
  const ancestorsToExpand: TreeNode[] = [];

  while (current !== null) {
    if (current.isExpandable && !current.isExpanded) {
      ancestorsToExpand.push(current);
    }
    current = current.parentNode;
  }

  // Expand ancestors (bottom-up, so offsets propagate correctly)
  ancestorsToExpand.reverse().forEach((ancestor) => {
    ancestor.isExpanded = true;
    ancestor.userExpand = true;
    recomputeNodeOffsets(ancestor);
  });

  // Propagate to topmost ancestor
  if (ancestorsToExpand.length > 0) {
    const topmost = ancestorsToExpand[0];
    propagateOffsetsUpward(topmost?.parentNode ?? null);
  }

  return tree;
}

/**
 * Export current expansion state from tree
 *
 * Converts tree's isExpanded/userExpand to ExpansionState object.
 * Used for syncing back to context.
 *
 * @param tree - Current tree state
 * @returns ExpansionState object
 */
export function exportExpansionState(tree: TreeState): Record<string, boolean> {
  const expansionState: Record<string, boolean> = {};

  // Iterate through all nodes
  tree.allNodes.forEach((node) => {
    if (node.isExpandable && node.userExpand !== undefined) {
      expansionState[node.id] = node.userExpand;
    }
  });

  return expansionState;
}

/**
 * Apply expansion state to tree
 *
 * Updates tree based on new expansion state from context.
 * Only called during initialization or manual sync.
 *
 * Uses prefix matching: If a stored path doesn't exist exactly, expands
 * ancestor nodes as far as possible. For example, if "input.messages.0.text"
 * was expanded, navigating to an observation with only "input.messages.0"
 * will expand "input" and "input.messages" and "input.messages.0".
 *
 * @param tree - Current tree state
 * @param expansionState - New expansion state
 * @returns Updated tree state
 */
export function applyExpansionState(
  tree: TreeState,
  expansionState: ExpansionState,
): TreeState {
  debugTime("[applyExpansionState]");

  // Convert to collapsed/expanded paths sets
  const collapsedPaths = new Set<string>();
  const expandedPaths = new Set<string>();

  if (typeof expansionState === "boolean") {
    if (!expansionState) {
      collapsedPaths.add("*");
    }
  } else {
    Object.entries(expansionState).forEach(([path, isExpanded]) => {
      if (!isExpanded) {
        collapsedPaths.add(path);
      } else {
        expandedPaths.add(path);
      }
    });
  }

  // Pre-compute ancestors of all expanded paths for O(1) lookup per node
  // This is O(expandedPaths × avgDepth) instead of O(nodes × expandedPaths)
  const expandedAncestors = new Set<string>();
  expandedPaths.forEach((path) => {
    const parts = path.split(".");
    for (let i = 1; i < parts.length; i++) {
      expandedAncestors.add(parts.slice(0, i).join("."));
    }
  });

  // Apply to all nodes (bottom-up for correct offset computation)
  const postOrder: TreeNode[] = [];
  const stack: { node: TreeNode; visited: boolean }[] = [
    { node: tree.rootNode, visited: false },
  ];

  // Collect nodes in post-order
  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.visited) {
      postOrder.push(current.node);
    } else {
      stack.push({ node: current.node, visited: true });

      for (let i = current.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: current.node.children[i]!, visited: false });
      }
    }
  }

  // Apply expansion state to each node
  postOrder.forEach((node) => {
    if (!node.isExpandable) return;

    let shouldExpand = true;

    if (collapsedPaths.has("*")) {
      shouldExpand = false;
    } else if (typeof expansionState === "boolean") {
      shouldExpand = expansionState;
    } else if (collapsedPaths.has(node.id)) {
      // Exact match: explicitly collapsed
      shouldExpand = false;
    } else if (expandedPaths.has(node.id)) {
      // Exact match: explicitly expanded
      shouldExpand = true;
    } else if (expandedAncestors.has(node.id)) {
      // Prefix matching: This node is an ancestor of an expanded path
      // e.g., if "messages.0.content.text" is expanded, expand "messages", "messages.0", etc.
      shouldExpand = true;
    }
    // No match: keep default (shouldExpand = true)
    // This ensures nodes not explicitly in stored state stay expanded

    node.isExpanded = shouldExpand;
    // Set userExpand for:
    // - Exact matches from expansionState
    // - Ancestor nodes expanded via prefix matching (so they're tracked for export)
    if (typeof expansionState === "boolean") {
      node.userExpand = undefined;
    } else if (expansionState[node.id] !== undefined) {
      node.userExpand = expansionState[node.id];
    } else if (expandedAncestors.has(node.id)) {
      // Ancestors expanded via prefix matching should be tracked
      node.userExpand = true;
    } else {
      node.userExpand = undefined;
    }

    // Recompute offsets
    recomputeNodeOffsets(node);
  });

  debugTimeEnd("[applyExpansionState]");
  return tree;
}

/**
 * Expand to a specific depth
 *
 * @param tree - Current tree state
 * @param depth - Maximum depth to expand to
 * @returns Updated tree state
 */
export function expandToDepth(tree: TreeState, depth: number): TreeState {
  debugTime("[expandToDepth]");

  // Iterate through all nodes (bottom-up for offset computation)
  const postOrder: TreeNode[] = [];
  const stack: { node: TreeNode; visited: boolean }[] = [
    { node: tree.rootNode, visited: false },
  ];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current.visited) {
      postOrder.push(current.node);
    } else {
      stack.push({ node: current.node, visited: true });

      for (let i = current.node.children.length - 1; i >= 0; i--) {
        stack.push({ node: current.node.children[i]!, visited: false });
      }
    }
  }

  // Apply expansion based on depth
  postOrder.forEach((node) => {
    if (!node.isExpandable) return;

    const shouldExpand = node.depth < depth;
    node.isExpanded = shouldExpand;
    node.userExpand = shouldExpand;

    recomputeNodeOffsets(node);
  });

  debugTimeEnd("[expandToDepth]");
  return tree;
}

/**
 * Get statistics about current expansion state
 *
 * @param tree - Current tree state
 * @returns Stats object
 */
export interface ExpansionStats {
  totalExpandable: number;
  totalExpanded: number;
  totalCollapsed: number;
  visibleNodes: number;
  maxVisibleDepth: number;
}

export function getExpansionStats(tree: TreeState): ExpansionStats {
  let totalExpandable = 0;
  let totalExpanded = 0;
  let maxVisibleDepth = 0;

  // Iterate through all nodes to count expandable/expanded
  tree.allNodes.forEach((node) => {
    if (node.isExpandable) {
      totalExpandable++;
      if (node.isExpanded) {
        totalExpanded++;
      }
    }
  });

  // Count visible nodes (root + visible descendants)
  const visibleNodes = 1 + tree.rootNode.visibleDescendantCount;

  // Find max visible depth
  const stack: TreeNode[] = [tree.rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.depth > maxVisibleDepth) {
      maxVisibleDepth = node.depth;
    }

    if (node.isExpanded) {
      node.children.forEach((child) => stack.push(child));
    }
  }

  return {
    totalExpandable,
    totalExpanded,
    totalCollapsed: totalExpandable - totalExpanded,
    visibleNodes,
    maxVisibleDepth,
  };
}
