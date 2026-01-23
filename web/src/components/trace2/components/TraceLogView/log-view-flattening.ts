/**
 * Log view flattening utilities for virtualized rendering.
 *
 * Provides two flattening modes:
 * - Chronological: Sorted by startTime (execution order)
 * - Tree-order: DFS traversal preserving parent-child relationships
 *
 * Also provides search filtering functionality.
 */

import { type TreeNode } from "@/src/components/trace2/lib/types";
import { type FlatLogItem } from "./log-view-types";

/**
 * Collects all observation nodes from roots (excludes TRACE root if present).
 * Used internally by both flattening functions.
 */
function collectObservations(roots: TreeNode[]): TreeNode[] {
  if (roots.length === 0) return [];

  const observations: TreeNode[] = [];
  const stack: TreeNode[] = [...roots];

  while (stack.length > 0) {
    const node = stack.pop()!;

    // Only include observations, not the TRACE root
    if (node.type !== "TRACE") {
      observations.push(node);
    }

    // Add children to stack (reverse order for correct DFS)
    for (let i = node.children.length - 1; i >= 0; i--) {
      stack.push(node.children[i]);
    }
  }

  return observations;
}

/**
 * Flattens tree into chronological order (sorted by startTime).
 * All observations are at the same visual level (no indentation).
 *
 * @param roots - Root TreeNodes (supports multiple roots)
 * @returns Flat list of observations sorted by startTime
 */
export function flattenChronological(roots: TreeNode[]): FlatLogItem[] {
  const observations = collectObservations(roots);

  // Sort by startTime
  observations.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

  // Convert to FlatLogItem with no tree structure (chronological = flat)
  return observations.map((node, index) => ({
    node,
    treeLines: [],
    isLastSibling: index === observations.length - 1,
  }));
}

/**
 * Flattens tree in DFS order (parent → children → siblings).
 * Preserves tree structure with treeLines for visual indentation.
 *
 * Uses iterative approach to avoid stack overflow with deep trees.
 *
 * @param roots - Root TreeNodes (supports multiple roots)
 * @returns Flat list of observations in DFS order with tree metadata
 */
export function flattenTreeOrder(roots: TreeNode[]): FlatLogItem[] {
  if (roots.length === 0) return [];

  const flatList: FlatLogItem[] = [];

  // Stack entry type for iterative DFS
  interface StackEntry {
    node: TreeNode;
    depth: number;
    treeLines: boolean[];
    isLastSibling: boolean;
  }

  const stack: StackEntry[] = [];

  // For TRACE-rooted trees, start with root's children (skip TRACE node itself)
  // For multiple observation roots (events-based), use roots directly
  const isTraceRooted = roots.length === 1 && roots[0].type === "TRACE";

  if (isTraceRooted) {
    // Sort root children by startTime and push in reverse order
    const sortedRootChildren = [...roots[0].children].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    for (let i = sortedRootChildren.length - 1; i >= 0; i--) {
      stack.push({
        node: sortedRootChildren[i],
        depth: 0,
        treeLines: [],
        isLastSibling: i === sortedRootChildren.length - 1,
      });
    }
  } else {
    // Multiple observation roots - sort and push in reverse order
    const sortedRoots = [...roots].sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );

    for (let i = sortedRoots.length - 1; i >= 0; i--) {
      stack.push({
        node: sortedRoots[i],
        depth: 0,
        treeLines: [],
        isLastSibling: i === sortedRoots.length - 1,
      });
    }
  }

  // Process stack (LIFO - depth-first traversal)
  while (stack.length > 0) {
    const current = stack.pop()!;

    // Add current node to result
    flatList.push({
      node: current.node,
      treeLines: current.treeLines,
      isLastSibling: current.isLastSibling,
    });

    // If node has children, add them to stack
    if (current.node.children.length > 0) {
      // Sort children by startTime
      const sortedChildren = [...current.node.children].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      );

      // Push children in REVERSE order for correct DFS traversal
      for (let i = sortedChildren.length - 1; i >= 0; i--) {
        const child = sortedChildren[i];
        const isChildLast = i === sortedChildren.length - 1;

        stack.push({
          node: child,
          depth: current.depth + 1,
          treeLines: [...current.treeLines, !isChildLast],
          isLastSibling: isChildLast,
        });
      }
    }
  }

  return flatList;
}

/**
 * Filters log items by search query.
 * Matches against observation name and type (case-insensitive).
 *
 * @param items - List of FlatLogItem to filter
 * @param query - Search query string
 * @returns Filtered list of items matching the query
 */
export function filterBySearch(
  items: FlatLogItem[],
  query: string,
): FlatLogItem[] {
  if (!query.trim()) {
    return items;
  }

  const lowerQuery = query.toLowerCase().trim();

  return items.filter((item) => {
    const name = item.node.name?.toLowerCase() ?? "";
    const type = item.node.type.toLowerCase();
    const id = item.node.id.toLowerCase();

    return (
      name.includes(lowerQuery) ||
      type.includes(lowerQuery) ||
      id.includes(lowerQuery)
    );
  });
}
