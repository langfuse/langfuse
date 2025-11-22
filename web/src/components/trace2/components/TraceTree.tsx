/**
 * TraceTree - Instantiation of VirtualizedTree for trace view.
 *
 * Connects:
 * - VirtualizedTree (generic virtualized renderer)
 * - SpanListItemView (node renderer)
 * - SelectionContext (collapsed state, selection state)
 * - TraceDataContext (tree data)
 */

import { VirtualizedTree } from "./_shared/VirtualizedTree";
import { SpanListItemView } from "./SpanListItemView";
import { useTraceData } from "../contexts/TraceDataContext";
import { useSelection } from "../contexts/SelectionContext";
import { type TreeNode } from "../lib/types";

export function TraceTree() {
  const { tree, comments } = useTraceData();
  const { selectedNodeId, setSelectedNodeId, collapsedNodes, toggleCollapsed } =
    useSelection();

  return (
    <VirtualizedTree
      tree={tree}
      collapsedNodes={collapsedNodes}
      selectedNodeId={selectedNodeId}
      onToggleCollapse={toggleCollapsed}
      onSelectNode={setSelectedNodeId}
      renderNode={({
        node,
        depth,
        treeLines,
        isLastSibling,
        isSelected,
        isCollapsed,
        onToggleCollapse,
        onSelect,
      }) => {
        const typedNode = node as TreeNode;

        return (
          <SpanListItemView
            node={typedNode}
            depth={depth}
            treeLines={treeLines}
            isLastSibling={isLastSibling}
            isSelected={isSelected}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            onSelect={onSelect}
            parentTotalCost={typedNode.totalCost}
            parentTotalDuration={
              typedNode.endTime && typedNode.startTime
                ? typedNode.endTime.getTime() - typedNode.startTime.getTime()
                : undefined
            }
            commentCount={comments.get(typedNode.id)}
          />
        );
      }}
    />
  );
}
