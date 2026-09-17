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

import { memo } from "react";
import { VirtualizedTree } from "./VirtualizedTree";
import {
  VirtualizedTreeNodeWrapper,
  type TreeNodeMetadata,
} from "./VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useIsObservationActive } from "@/src/features/traces/contexts/PlayheadContext";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { type TreeNode } from "../types/treeNode";
import { cn } from "@/src/utils/tailwind";
import {
  resolveMetricEmphasisContext,
  type MetricEmphasisContext,
} from "@/src/features/traces/fns/metricEmphasis";

/**
 * Feature-scoped row container: subscribes to the row's OWN playback-active
 * flag so the playhead glow lights tree rows up exactly like timeline rows —
 * and a boundary crossing re-renders only the rows whose flag flipped. Lives
 * here (not in the shared VirtualizedTree) so the shared component stays
 * context-free.
 */
const TraceTreeRow = memo(function TraceTreeRow({
  node,
  treeMetadata,
  isSelected,
  isCollapsed,
  onToggleCollapse,
  onSelect,
  emphasis,
  commentCount,
  onHover,
}: {
  node: TreeNode;
  treeMetadata: TreeNodeMetadata;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  emphasis?: MetricEmphasisContext;
  commentCount?: number;
  onHover: (node: TreeNode) => void;
}) {
  const isActive = useIsObservationActive(node.id);

  return (
    <div
      className={cn(
        "transition-colors duration-150",
        isActive && "bg-primary-accent/15",
      )}
    >
      <VirtualizedTreeNodeWrapper
        metadata={treeMetadata}
        nodeType={node.type}
        hasChildren={node.children.length > 0}
        isCollapsed={isCollapsed}
        onToggleCollapse={onToggleCollapse}
        isSelected={isSelected}
        onSelect={onSelect}
      >
        <SpanContent
          node={node}
          emphasis={emphasis}
          commentCount={commentCount}
          onSelect={onSelect}
          onHover={() => onHover(node)}
        />
      </VirtualizedTreeNodeWrapper>
    </div>
  );
});

export function TraceTree() {
  const { roots, comments } = useTraceData();
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
      }) => (
        <TraceTreeRow
          node={node as TreeNode}
          treeMetadata={treeMetadata}
          isSelected={isSelected}
          isCollapsed={isCollapsed}
          onToggleCollapse={onToggleCollapse}
          onSelect={onSelect}
          emphasis={resolveMetricEmphasisContext(node as TreeNode, roots)}
          commentCount={comments.get(node.id)}
          onHover={handleHover}
        />
      )}
    />
  );
}
