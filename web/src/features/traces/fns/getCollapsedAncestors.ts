import { type TreeNode } from "../types/treeNode";

export function getCollapsedAncestors(
  roots: readonly TreeNode[],
  nodeId: string,
  collapsedNodes: ReadonlySet<string>,
) {
  const parentById = new Map<string, string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const node = pending.pop()!;
    for (const child of node.children) {
      parentById.set(child.id, node.id);
      pending.push(child);
    }
  }

  const collapsedAncestors = new Set<string>();
  let parentId = parentById.get(nodeId);
  while (parentId) {
    if (collapsedNodes.has(parentId)) collapsedAncestors.add(parentId);
    parentId = parentById.get(parentId);
  }
  return collapsedAncestors;
}
