/**
 * Tree flattening utilities for virtualized rendering.
 *
 * Converts hierarchical tree structure into flat list for virtualization,
 * while tracking depth, tree lines, and sibling relationships for visual rendering.
 */

export interface FlatNode<T> {
  node: T;
  depth: number;
  treeLines: boolean[]; // Which ancestor levels have vertical lines
  isLastSibling: boolean;
}

/**
 * Flattens tree into list for virtualized rendering using iterative approach.
 * Respects collapsed state - collapsed nodes don't include children.
 *
 * Uses an explicit stack instead of recursion to avoid stack overflow
 * with deeply nested trees (10k+ levels).
 *
 * @param roots - Root nodes to flatten (supports multiple roots)
 * @param collapsedNodes - Set of node IDs that are collapsed
 * @returns Flat list of nodes with rendering metadata
 */
export function flattenTree<
  T extends { id: string; children: T[]; startTime?: Date },
>(roots: T[], collapsedNodes: Set<string>): FlatNode<T>[] {
  if (roots.length === 0) return [];

  const flatList: FlatNode<T>[] = [];

  // Sort roots by startTime for consistent ordering
  const sortedRoots = [...roots].sort((a, b) => {
    const aStart = a.startTime?.getTime() ?? 0;
    const bStart = b.startTime?.getTime() ?? 0;
    return aStart - bStart;
  });

  // Initialize stack with all roots at depth 0
  // Push in REVERSE order to maintain left-to-right DFS traversal
  const stack: Array<{
    node: T;
    depth: number;
    treeLines: boolean[];
    isLastSibling: boolean;
  }> = [];

  for (let i = sortedRoots.length - 1; i >= 0; i--) {
    stack.push({
      node: sortedRoots[i]!,
      depth: 0,
      treeLines: [],
      isLastSibling: i === sortedRoots.length - 1,
    });
  }

  // Process stack (LIFO - depth-first traversal)
  while (stack.length > 0) {
    const current = stack.pop()!;

    // Add current node to result
    flatList.push({
      node: current.node,
      depth: current.depth,
      treeLines: current.treeLines,
      isLastSibling: current.isLastSibling,
    });

    // If node has children and is not collapsed, add children to stack
    if (
      current.node.children.length > 0 &&
      !collapsedNodes.has(current.node.id)
    ) {
      // Sort children by startTime for consistent ordering
      const sortedChildren = [...current.node.children].sort((a, b) => {
        const aStart = a.startTime?.getTime() ?? 0;
        const bStart = b.startTime?.getTime() ?? 0;
        return aStart - bStart;
      });

      // Push children in REVERSE order to maintain left-to-right DFS traversal
      // (stack is LIFO, so last pushed = first popped)
      for (let i = sortedChildren.length - 1; i >= 0; i--) {
        const child = sortedChildren[i];
        const isChildLast = i === sortedChildren.length - 1;

        // treeLines[i] = does the node at depth i+1 have siblings below?
        // We add !isChildLast to indicate whether this child has siblings.
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
