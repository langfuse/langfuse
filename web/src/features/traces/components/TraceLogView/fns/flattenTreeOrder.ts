import type { TreeNode } from "@/src/features/traces/fns/types";
import type { FlatLogItem } from "@/src/features/traces/components/TraceLogView/log-view-types";

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
