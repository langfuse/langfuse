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
import { VirtualizedTree } from "./_shared/VirtualizedTree";
import { VirtualizedTreeNodeWrapper } from "./_shared/VirtualizedTreeNodeWrapper";
import { type TreeNodeMetadata } from "./_shared/VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "../contexts/TraceDataContext";
import { useSelection } from "../contexts/SelectionContext";
import { useIsObservationActive } from "../contexts/PlayheadContext";
import { useHandlePrefetchObservation } from "../hooks/useHandlePrefetchObservation";
import { useDesktopLayoutContextOptional } from "./_layout/TraceLayoutDesktop";
import { useMobileLayoutContextOptional } from "./_layout/TraceLayoutMobile";
import { type TreeNode } from "../lib/types";
import { cn } from "@/src/utils/tailwind";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useTraceAnalyticsDimensions } from "../hooks/useTraceAnalyticsDimensions";

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
  commentCount,
  onHover,
}: {
  node: TreeNode;
  treeMetadata: TreeNodeMetadata;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: () => void;
  commentCount?: number;
  onHover: (node: TreeNode) => void;
}) {
  const isActive = useIsObservationActive(node.id);

  return (
    <div
      className={cn(
        "transition-colors duration-150",
        isActive && "bg-brand/15",
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
  const { selectedNodeId, setSelectedNodeId, collapsedNodes, toggleCollapsed } =
    useSelection();
  const { handleHover } = useHandlePrefetchObservation();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  // Optional (null on mobile): reopen the detail panel on select, including
  // re-selecting the already-selected node.
  const layout = useDesktopLayoutContextOptional();
  // Optional (null on desktop): jump to the Info tab on select, including
  // re-selecting the already-selected node (URL param unchanged → the tab
  // effect wouldn't fire).
  const mobileLayout = useMobileLayoutContextOptional();
  const handleSelectNode = (id: string | null) => {
    if (id) {
      capture("trace_detail:node_selected", {
        source: "tree",
        ...analyticsDimensions,
      });
    }
    setSelectedNodeId(id);
    layout?.expandDetailPanel();
    if (id) mobileLayout?.switchToInfoTab();
  };

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
          commentCount={comments.get(node.id)}
          onHover={handleHover}
        />
      )}
    />
  );
}
