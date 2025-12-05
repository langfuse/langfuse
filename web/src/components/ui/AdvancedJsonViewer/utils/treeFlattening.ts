/**
 * Tree flattening utilities for virtualized rendering.
 *
 * COPIED FROM: web/src/components/trace2/components/_shared/tree-flattening.ts
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
 * @param node - Root node to flatten
 * @param collapsedNodes - Set of node IDs that are collapsed
 * @param depth - Current depth (0 for root)
 * @param treeLines - Which ancestor levels have vertical lines
 * @param isLastSibling - Whether this node is the last child of its parent
 * @returns Flat list of nodes with rendering metadata
 */
export function flattenTree<T extends { id: string; children: T[] }>(
  node: T,
  collapsedNodes: Set<string>,
  depth = 0,
  treeLines: boolean[] = [],
  isLastSibling = true,
): FlatNode<T>[] {
  const flatList: FlatNode<T>[] = [];

  // Initialize stack with root node
  const stack: Array<{
    node: T;
    depth: number;
    treeLines: boolean[];
    isLastSibling: boolean;
  }> = [{ node, depth, treeLines, isLastSibling }];

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
      // Sort children by startTime if available (assumes TreeNode structure)
      const sortedChildren = [...current.node.children].sort((a, b) => {
        // Safe type assertion - TreeNode has startTime
        const aStart = (a as any).startTime?.getTime?.() ?? 0;
        const bStart = (b as any).startTime?.getTime?.() ?? 0;
        return aStart - bStart;
      });

      // Push children in REVERSE order to maintain left-to-right DFS traversal
      // (stack is LIFO, so last pushed = first popped)
      for (let i = sortedChildren.length - 1; i >= 0; i--) {
        const child = sortedChildren[i];
        const isChildLast = i === sortedChildren.length - 1;

        stack.push({
          node: child,
          depth: current.depth + 1,
          treeLines: [...current.treeLines, !isChildLast], // Add line if not last child
          isLastSibling: isChildLast,
        });
      }
    }
  }

  return flatList;
}
