import { useState } from "react";
import { VirtualizedTree } from "./VirtualizedTree";
import {
  VirtualizedTreeNodeWrapper,
  type TreeNodeMetadata,
} from "./VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { type TreeNode } from "../types/treeNode";
import {
  metricEmphasisFor,
  type MetricEmphasisContext,
} from "@/src/features/traces/fns/metricEmphasis";

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

export function TraceTree({ isLoading = false }: { isLoading?: boolean }) {
  if (isLoading) return <TraceTreeLoading />;
  return <LoadedTraceTree />;
}

/** A small tree's rows, so the placeholder has the shape of a trace. */
const LOADING_ROWS = [
  { depth: 0, hasChildren: true, isLastSibling: true, treeLines: [] },
  { depth: 1, hasChildren: false, isLastSibling: false, treeLines: [] },
  { depth: 1, hasChildren: true, isLastSibling: false, treeLines: [] },
  { depth: 2, hasChildren: false, isLastSibling: false, treeLines: [true] },
  { depth: 2, hasChildren: false, isLastSibling: true, treeLines: [true] },
  { depth: 1, hasChildren: true, isLastSibling: true, treeLines: [] },
  { depth: 2, hasChildren: false, isLastSibling: false, treeLines: [false] },
  { depth: 2, hasChildren: false, isLastSibling: true, treeLines: [false] },
];

function TraceTreeLoading() {
  return (
    <div className="h-full overflow-y-auto">
      {LOADING_ROWS.map(({ hasChildren, ...metadata }, index) => (
        <VirtualizedTreeNodeWrapper
          key={index}
          isLoading
          metadata={metadata}
          hasChildren={hasChildren}
        >
          <SpanContent isLoading />
        </VirtualizedTreeNodeWrapper>
      ))}
    </div>
  );
}

function LoadedTraceTree() {
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
      renderNode={({ node, ...row }) => {
        const typedNode = node as TreeNode;
        return (
          <TraceTreeRow
            {...row}
            node={typedNode}
            emphasis={metricEmphasisFor(typedNode, metricEmphasis)}
            commentCount={comments.get(typedNode.id)}
            onHover={() => handleHover(typedNode)}
          />
        );
      }}
    />
  );
}

/** One row; tracks hover so the content's chips flip with the row surface. */
function TraceTreeRow({
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
  emphasis: MetricEmphasisContext | undefined;
  commentCount: number | undefined;
  onHover: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <VirtualizedTreeNodeWrapper
      metadata={treeMetadata}
      nodeType={node.type}
      hasChildren={node.children.length > 0}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isSelected={isSelected}
      onSelect={onSelect}
      onHoverChange={setIsHovered}
    >
      <SpanContent
        node={node}
        emphasis={emphasis}
        commentCount={commentCount}
        onSelect={onSelect}
        onHover={onHover}
        surface={isSelected || isHovered ? "muted" : "default"}
      />
    </VirtualizedTreeNodeWrapper>
  );
}
