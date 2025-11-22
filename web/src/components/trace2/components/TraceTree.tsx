/**
 * TraceTree - Composition of VirtualizedTree + TreeNodeWrapper + SpanContent.
 *
 * Connects three layers:
 * - VirtualizedTree (virtualization)
 * - TreeNodeWrapper (tree structure rendering)
 * - SpanContent (span-specific content)
 *
 * This composition pattern allows each component to have a single responsibility.
 */

import { VirtualizedTree } from "./_shared/VirtualizedTree";
import { TreeNodeWrapper } from "./_shared/TreeNodeWrapper";
import { SpanContent } from "./SpanContent";
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
        treeMetadata,
        isSelected,
        isCollapsed,
        onToggleCollapse,
        onSelect,
      }) => {
        const typedNode = node as TreeNode;

        return (
          <TreeNodeWrapper
            metadata={treeMetadata}
            nodeType={typedNode.type}
            hasChildren={typedNode.children.length > 0}
            isCollapsed={isCollapsed}
            onToggleCollapse={onToggleCollapse}
            isSelected={isSelected}
            onSelect={onSelect}
          >
            <SpanContent
              node={typedNode}
              parentTotalCost={typedNode.totalCost}
              parentTotalDuration={
                typedNode.endTime && typedNode.startTime
                  ? typedNode.endTime.getTime() - typedNode.startTime.getTime()
                  : undefined
              }
              commentCount={comments.get(typedNode.id)}
              onSelect={onSelect}
            />
          </TreeNodeWrapper>
        );
      }}
    />
  );
}
