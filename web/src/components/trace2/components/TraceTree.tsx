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
import { VirtualizedTreeNodeWrapper } from "./_shared/VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "../contexts/TraceDataContext";
import { useSelection } from "../contexts/SelectionContext";
import { useHandlePrefetchObservation } from "../hooks/useHandlePrefetchObservation";
import { type TreeNode } from "../lib/types";

export function TraceTree() {
  const { roots, comments } = useTraceData();
  const { selectedNodeId, setSelectedNodeId, collapsedNodes, toggleCollapsed } =
    useSelection();
  const { handleHover } = useHandlePrefetchObservation();

  // TODO: Extract aggregation logic to shared utility - duplicated in tree-building.ts and TraceTimeline/index.tsx
  // Calculate aggregated totals across all roots for heatmap color scaling
  const rootTotalCost = roots.reduce(
    (acc, r) => {
      if (!r.totalCost) return acc;
      return acc ? acc.plus(r.totalCost) : r.totalCost;
    },
    undefined as (typeof roots)[0]["totalCost"],
  );

  const rootTotalDuration =
    roots.length > 0
      ? Math.max(
          ...roots.map((r) => (r.latency != null ? r.latency * 1000 : 0)),
        )
      : undefined;

  return (
    <VirtualizedTree
      roots={roots}
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
              parentTotalCost={rootTotalCost}
              parentTotalDuration={rootTotalDuration}
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
