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
 * Flattens tree into list for virtualized rendering.
 * Respects collapsed state - collapsed nodes don't include children.
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
  const flatList: FlatNode<T>[] = [{ node, depth, treeLines, isLastSibling }];

  // If node has children and is not collapsed, recursively flatten children
  if (node.children.length > 0 && !collapsedNodes.has(node.id)) {
    // Sort children by startTime if available (assumes TreeNode structure)
    const sortedChildren = [...node.children].sort((a, b) => {
      // Safe type assertion - TreeNode has startTime
      const aStart = (a as any).startTime?.getTime?.() ?? 0;
      const bStart = (b as any).startTime?.getTime?.() ?? 0;
      return aStart - bStart;
    });

    sortedChildren.forEach((child, index) => {
      const isChildLast = index === sortedChildren.length - 1;
      flatList.push(
        ...flattenTree(
          child,
          collapsedNodes,
          depth + 1,
          [...treeLines, !isChildLast], // Add line if not last child
          isChildLast,
        ),
      );
    });
  }

  return flatList;
}
