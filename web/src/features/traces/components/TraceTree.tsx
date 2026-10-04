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

import { VirtualizedTree } from "./VirtualizedTree";
import { VirtualizedTreeNodeWrapper } from "./VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { type TreeNode } from "../types/treeNode";
import { metricEmphasisFor } from "@/src/features/traces/fns/metricEmphasis";

export function TraceTree() {
  const { roots, comments, metricEmphasis } = useTraceData();
  const { selectedNodeId, collapsedNodes, toggleCollapsed } = useSelection();
  const { handleHover } = useHandlePrefetchObservation();
  const handleSelectNode = useSelectTraceNode("tree");

  return (
    <VirtualizedTree
      roots={roots}
      collapsedNodes={collapsedNodes}
      selectedNodeId={selectedNodeId}
      onToggleCollapse={toggleCollapsed}
      onSelectNode={handleSelectNode}
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
          <VirtualizedTreeNodeWrapper
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
              emphasis={metricEmphasisFor(typedNode, metricEmphasis)}
              commentCount={comments.get(typedNode.id)}
              onSelect={onSelect}
              onHover={() => handleHover(typedNode)}
            />
          </VirtualizedTreeNodeWrapper>
        );
      }}
    />
  );
}
