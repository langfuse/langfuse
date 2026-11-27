import { useLayoutEffect, useRef } from "react";
import { VirtualizedTree } from "./VirtualizedTree";
import {
  VirtualizedTreeNodeWrapper,
  type TreeNodeMetadata,
} from "./VirtualizedTreeNodeWrapper";
import { SpanContent } from "./SpanContent";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import { useHandlePrefetchObservation } from "@/src/features/traces/hooks/useHandlePrefetchObservation";
import { useTracePresentation } from "@/src/features/traces/contexts/TracePresentationProvider";
import { useSelectTraceNode } from "@/src/features/traces/hooks/useSelectTraceNode";
import { type TreeNode } from "../types/treeNode";
import { resolveTreeNodeId } from "../fns/resolveTreeNodeId";
import { getCollapsedAncestors } from "../fns/getCollapsedAncestors";
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

/** Rows the embedder does not let the user pick. */
const UNPICKABLE_ROW_CLASS_NAME = "opacity-50";

/** The sample row carries a dot at its left edge; the other rows that match are a step lighter. */
function evaluationSurfaceClassName({
  isSample,
  isMatch,
}: {
  isSample: boolean;
  isMatch: boolean;
}) {
  if (isSample)
    return "bg-light-blue text-foreground before:bg-category-blue-foreground before:absolute before:top-1/2 before:left-1 before:size-1.5 before:-translate-y-1/2 before:rounded-full";
  if (isMatch) return "bg-light-blue/50 text-foreground";
  return undefined;
}

function isEmbeddedObservation(node: TreeNode, observationId: string | null) {
  return (
    observationId != null &&
    node.type !== "TRACE" &&
    (node.observationId ?? node.id) === observationId
  );
}

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
  const {
    roots,
    comments,
    metricEmphasis,
    scope: traceScope,
    nodeMap,
    trace,
    isNavigationReady,
  } = useTraceData();
  const {
    selectedNodeId,
    selectionLocked,
    collapsedNodes,
    toggleCollapsed,
    collapseAll,
  } = useSelection();
  const { handleHover } = useHandlePrefetchObservation();
  const handleSelectNode = useSelectTraceNode("tree");
  const { presentation, selectableObservationIds, onSelectObservation } =
    useTracePresentation();
  const picksObservation =
    presentation === "observation" && selectableObservationIds != null;
  const scope = traceScope.type;
  const previousScope = useRef(scope);
  const selectedTreeNodeId = resolveTreeNodeId(
    nodeMap,
    selectedNodeId,
    trace?.id ?? "",
  );

  useLayoutEffect(() => {
    if (previousScope.current === scope) return;
    previousScope.current = scope;
    if (!selectedTreeNodeId || collapsedNodes.size === 0) return;

    const collapsedAncestors = getCollapsedAncestors(
      roots,
      selectedTreeNodeId,
      collapsedNodes,
    );
    if (collapsedAncestors.size === 0) return;
    collapseAll(
      [...collapsedNodes].filter((id) => !collapsedAncestors.has(id)),
    );
  }, [scope, roots, selectedTreeNodeId, collapsedNodes, collapseAll]);

  return (
    // Scope changes move rows without changing selection. Remount only the
    // virtualizer so its initial selected-row scroll runs against the new tree.
    <VirtualizedTree
      key={scope}
      roots={roots}
      collapsedNodes={collapsedNodes}
      selectedNodeId={selectedTreeNodeId}
      isScrollReady={isNavigationReady}
      onToggleCollapse={toggleCollapsed}
      onSelectNode={handleSelectNode}
      paddingStart={presentation === "observation" ? 0 : undefined}
      renderNode={({ node, ...row }) => {
        const typedNode = node as TreeNode;
        const observationId = typedNode.observationId ?? typedNode.id;
        const isPickable =
          picksObservation &&
          typedNode.type !== "TRACE" &&
          selectableObservationIds.has(observationId);
        const browse = selectionLocked ? undefined : row.onSelect;
        // Every row opens in the details pane; a match also becomes the sample.
        const pick = () => {
          row.onSelect();
          if (isPickable) onSelectObservation?.(observationId);
        };
        return (
          <TraceTreeRow
            {...row}
            onSelect={picksObservation ? pick : browse}
            node={typedNode}
            isDimmed={picksObservation && !isPickable}
            isEvaluationMatch={isPickable}
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
  isDimmed,
  isEvaluationMatch,
}: {
  node: TreeNode;
  treeMetadata: TreeNodeMetadata;
  isSelected: boolean;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  onSelect: (() => void) | undefined;
  emphasis: MetricEmphasisContext | undefined;
  commentCount: number | undefined;
  onHover: () => void;
  isDimmed: boolean;
  isEvaluationMatch: boolean;
}) {
  const { isEmbedded, preferredObservationId } = useTracePresentation();
  const isSelectedObservation =
    isEmbedded && isEmbeddedObservation(node, preferredObservationId);
  return (
    <VirtualizedTreeNodeWrapper
      metadata={treeMetadata}
      nodeType={node.type}
      hasChildren={node.children.length > 0}
      isCollapsed={isCollapsed}
      onToggleCollapse={onToggleCollapse}
      isSelected={isSelected}
      onSelect={onSelect}
      surfaceClassName={evaluationSurfaceClassName({
        isSample: isSelectedObservation,
        isMatch: isEvaluationMatch,
      })}
      className={isDimmed ? UNPICKABLE_ROW_CLASS_NAME : undefined}
    >
      <SpanContent
        node={node}
        isSelectedObservation={isSelectedObservation}
        emphasis={emphasis}
        commentCount={commentCount}
        onSelect={onSelect}
        onHover={onHover}
      />
    </VirtualizedTreeNodeWrapper>
  );
}
