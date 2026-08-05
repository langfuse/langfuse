import type { TreeNode } from "@/src/features/traces/fns/types";
import type { FlatLogItem } from "@/src/features/traces/components/TraceLogView/log-view-types";

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
