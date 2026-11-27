import { type TreeNode } from "../types/treeNode";

export function resolveTreeNodeId(
  nodeMap: ReadonlyMap<string, TreeNode>,
  selectedNodeId: string | null,
  traceId: string,
) {
  if (!selectedNodeId || nodeMap.has(selectedNodeId)) return selectedNodeId;
  return (
    [...nodeMap.values()].find(
      (node) =>
        node.observationId === selectedNodeId && node.traceId === traceId,
    )?.id ?? selectedNodeId
  );
}
