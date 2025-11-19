import { type TreeNode } from "./lib/types";
import { cn } from "@/src/utils/tailwind";
import {
  type ScoreDomain,
  ObservationLevel,
  type ObservationLevelType,
} from "@langfuse/shared";
import { Fragment, useMemo, useRef, useEffect, useCallback } from "react";
import { InfoIcon, ChevronRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { ItemBadge } from "@/src/components/ItemBadge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  calculateDisplayTotalCost,
  unnestObservation,
} from "@/src/components/trace/lib/helpers";
import type Decimal from "decimal.js";
import { SpanItem } from "@/src/components/trace/SpanItem";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { api } from "@/src/utils/api";
import { useVirtualizer } from "@tanstack/react-virtual";

type FlatNode = {
  node: TreeNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
};

const flattenTree = (
  node: TreeNode,
  collapsedNodes: string[],
  depth = 0,
  treeLines: boolean[] = [],
  isLastSibling = true,
): FlatNode[] => {
  const flatList: FlatNode[] = [{ node, depth, treeLines, isLastSibling }];

  if (node.children.length > 0 && !collapsedNodes.includes(node.id)) {
    const sortedChildren = node.children.sort(
      (a, b) => a.startTime.getTime() - b.startTime.getTime(),
    );
    sortedChildren.forEach((child, index) => {
      const isChildLast = index === sortedChildren.length - 1;
      // The vertical line at depth `depth` is drawn if the current node is NOT the last sibling.
      // This state is passed down to children so they can draw the line for this level.
      const nextTreeLines = [...treeLines, !isLastSibling];

      // Wait, looking at the original recursive logic:
      // const childTreeLines = [...treeLines, !isChildLastSibling];
      // It seems the line for the *current* level depends on if *this child* is the last sibling?
      // No, let's re-read the original component carefully.
      // Indentation level 0: No lines.
      // Indentation level 1:
      //   Array.from({ length: 0 }) -> empty.
      //   But it draws "Vertical bar connecting upwards" and "downwards".

      // The `treeLines` prop in original component was used for the ANCESTOR lines (far left lines).
      // In the map loop: `const childTreeLines = [...treeLines, !isChildLastSibling];`
      // This means: for the children of the current node, the line at `currentLevel` should be present
      // if the current child is NOT the last sibling.

      // So if I am Child 1 of 3. `isChildLastSibling` is false. `!isChildLastSibling` is true.
      // My children will inherit `[..., true]`. They will draw a vertical line at my level.
      // If I am Child 3 of 3. `isChildLastSibling` is true. `!isChildLastSibling` is false.
      // My children will inherit `[..., false]`. They will NOT draw a vertical line at my level.

      // So my flatten logic:
      // `treeLines` passed to `flattenTree` corresponds to the lines for levels 0 to depth-1.
      // When recursing to children (depth+1), we append the status of the current child.

      flatList.push(
        ...flattenTree(
          child,
          collapsedNodes,
          depth + 1,
          [...treeLines, !isChildLast], // This matches the original logic
          isChildLast,
        ),
      );
    });
  }
  return flatList;
};

export const TraceTree = ({
  tree,
  collapsedNodes,
  toggleCollapsedNode,
  displayScores: scores,
  currentNodeId,
  setCurrentNodeId,
  showDuration,
  showCostTokens,
  showScores,
  colorCodeMetrics,
  nodeCommentCounts,
  className,
  showComments,
  hiddenObservationsCount,
  minLevel,
  setMinLevel,
  projectId,
  traceId,
}: {
  tree: TreeNode;
  collapsedNodes: string[];
  toggleCollapsedNode: (id: string) => void;
  displayScores: WithStringifiedMetadata<ScoreDomain>[];
  currentNodeId: string | undefined;
  setCurrentNodeId: (id: string | undefined) => void;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  nodeCommentCounts?: Map<string, number>;
  className?: string;
  showComments: boolean;
  hiddenObservationsCount?: number;
  minLevel?: ObservationLevelType;
  setMinLevel?: React.Dispatch<React.SetStateAction<ObservationLevelType>>;
  projectId: string;
  traceId: string;
}) => {
  const utils = api.useUtils();
  const parentRef = useRef<HTMLDivElement>(null);

  const handleObservationHover = useCallback(
    (node: TreeNode) => {
      if (node.type !== "TRACE") {
        void utils.observations.byId.prefetch(
          {
            observationId: node.id,
            startTime: node.startTime,
            traceId,
            projectId,
          },
          {
            staleTime: 5 * 60 * 1000,
          },
        );
      }
    },
    [utils, traceId, projectId],
  );

  const totalCost = useMemo(() => {
    const convertTreeNodeToObservation = (node: TreeNode): any => ({
      ...node,
      children: node.children.map(convertTreeNodeToObservation),
    });

    if (tree.type === "TRACE") {
      const allObservations = tree.children.flatMap((child) =>
        unnestObservation(convertTreeNodeToObservation(child)),
      );
      return calculateDisplayTotalCost({ allObservations });
    }

    return calculateDisplayTotalCost({
      allObservations: [convertTreeNodeToObservation(tree)],
    });
  }, [tree]);

  const flattenedItems = useMemo(() => {
    // The root node has depth 0, empty treeLines, and isLastSibling=true (it's the only root)
    return flattenTree(tree, collapsedNodes, 0, [], true);
  }, [tree, collapsedNodes]);

  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 37, // Approximate height of a row
    overscan: 100,
  });

  return (
    <div
      ref={parentRef}
      className={cn("h-full overflow-y-auto", className)}
      id="trace-tree"
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualRow) => {
          const item = flattenedItems[virtualRow.index];
          return (
            <div
              key={item.node.id}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <TraceTreeRow
                node={item.node}
                depth={item.depth}
                treeLines={item.treeLines}
                isLastSibling={item.isLastSibling}
                collapsedNodes={collapsedNodes}
                toggleCollapsedNode={toggleCollapsedNode}
                scores={scores}
                comments={nodeCommentCounts}
                currentNodeId={currentNodeId}
                setCurrentNodeId={setCurrentNodeId}
                showDuration={showDuration}
                showCostTokens={showCostTokens}
                showScores={showScores}
                colorCodeMetrics={colorCodeMetrics}
                parentTotalCost={totalCost}
                parentTotalDuration={
                  tree.latency ? tree.latency * 1000 : undefined
                }
                showComments={showComments}
                onObservationHover={handleObservationHover}
              />
            </div>
          );
        })}
      </div>

      {minLevel && hiddenObservationsCount && hiddenObservationsCount > 0 ? (
        <span className="flex items-center gap-1 p-2 py-4">
          <InfoIcon className="h-4 w-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            <span>
              {hiddenObservationsCount}{" "}
              {hiddenObservationsCount === 1 ? "observation" : "observations"}{" "}
              below {minLevel} level are hidden.{" "}
            </span>
            <span
              className="cursor-pointer underline"
              onClick={() => setMinLevel?.(ObservationLevel.DEBUG)}
            >
              Show all
            </span>
          </p>
        </span>
      ) : null}
    </div>
  );
};

type TraceTreeRowProps = {
  node: TreeNode;
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  collapsedNodes: string[];
  toggleCollapsedNode: (id: string) => void;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  comments?: Map<string, number>;
  currentNodeId: string | undefined;
  setCurrentNodeId: (id: string | undefined) => void;
  showDuration: boolean;
  showCostTokens: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  showComments: boolean;
  onObservationHover: (node: TreeNode) => void;
};

const TraceTreeRow = ({
  node,
  depth,
  treeLines,
  isLastSibling,
  collapsedNodes,
  toggleCollapsedNode,
  scores,
  comments,
  currentNodeId,
  setCurrentNodeId,
  showDuration,
  showCostTokens,
  showScores,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  showComments,
  onObservationHover,
}: TraceTreeRowProps) => {
  const capture = usePostHogClientCapture();
  const collapsed = collapsedNodes.includes(node.id);
  const currentNodeRef = useRef<HTMLButtonElement>(null);

  // Scroll to selected node logic
  // Note: In a virtual list, scrolling to an item requires using the virtualizer's scrollToIndex.
  // However, since we only have the row component here, we can't easily access the virtualizer.
  // For now, we'll rely on the user scrolling or implement a more complex context-based scroll later if needed.
  // The original scrollIntoView might not work if the item is not rendered.
  // But if it IS rendered, this will work.
  useEffect(() => {
    if (currentNodeId && currentNodeRef.current && currentNodeId === node.id) {
      currentNodeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentNodeId, node.id]);

  const isSelected =
    currentNodeId === node.id || (!currentNodeId && node.type === "TRACE");

  return (
    <div
      className={cn(
        "relative flex w-full cursor-pointer rounded-md px-0",
        isSelected ? "bg-muted" : "hover:bg-muted/50",
      )}
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        borderRadius: "0.5rem",
      }}
      onClick={(e) => {
        if (!e.currentTarget?.closest("[data-expand-button]")) {
          setCurrentNodeId(node.type === "TRACE" ? undefined : node.id);
        }
      }}
    >
      <div className="flex w-full pl-2">
        {/* 1. Indents: ancestor level indicators */}
        {depth > 0 && (
          <div className="flex flex-shrink-0">
            {Array.from({ length: depth - 1 }, (_, i) => (
              <div key={i} className="relative w-5">
                {treeLines[i] && (
                  <div className="absolute bottom-0 left-3 top-0 w-px bg-border" />
                )}
              </div>
            ))}
          </div>
        )}

        {/* 2. Current element bars: up/down/horizontal connectors */}
        {depth > 0 && (
          <div className="relative w-5 flex-shrink-0">
            <>
              {/* Vertical bar connecting upwards */}
              <div
                className={cn(
                  "absolute left-3 top-0 w-px bg-border",
                  isLastSibling ? "h-3" : "bottom-3",
                )}
              />
              {/* Vertical bar connecting downwards if not last sibling */}
              {!isLastSibling && (
                <div className="absolute bottom-0 left-3 top-3 w-px bg-border" />
              )}
              {/* Horizontal bar connecting to icon */}
              <div className="absolute left-3 top-3 h-px w-2 bg-border" />
            </>
          </div>
        )}

        {/* 3. Icon + child connector: fixed width container */}
        <div className="relative flex w-6 flex-shrink-0 flex-col py-1.5">
          <div className="relative z-10 flex h-4 items-center justify-center">
            <ItemBadge type={node.type} isSmall className="!size-3" />
          </div>
          {/* Vertical bar downwards if there are expanded children */}
          {node.children.length > 0 && !collapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
          {/* Root node downward connector */}
          {depth === 0 && node.children.length > 0 && !collapsed && (
            <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
          )}
        </div>

        {/* 4. Content button: just the text/metrics content */}
        <button
          type="button"
          aria-selected={isSelected}
          onClick={(e) => {
            e.stopPropagation();
            setCurrentNodeId(node.type === "TRACE" ? undefined : node.id);
          }}
          onMouseEnter={() => onObservationHover(node)}
          title={node.name}
          className={cn(
            "peer relative flex min-w-0 flex-1 items-start rounded-md py-0.5 pl-1 pr-2 text-left",
          )}
          ref={currentNodeRef}
        >
          <SpanItem
            node={node}
            scores={scores}
            comments={comments}
            showDuration={showDuration}
            showCostTokens={showCostTokens}
            showScores={showScores}
            colorCodeMetrics={colorCodeMetrics}
            parentTotalCost={parentTotalCost}
            parentTotalDuration={parentTotalDuration}
            showComments={showComments}
          />
        </button>

        {/* 5. Expand/Collapse button */}
        {node.children.length > 0 && (
          <div className="flex items-center justify-end py-1 pr-1">
            <Button
              data-expand-button
              size="icon"
              variant="ghost"
              onClick={(ev) => {
                ev.stopPropagation();
                toggleCollapsedNode(node.id);
                capture(
                  collapsed
                    ? "trace_detail:observation_tree_expand"
                    : "trace_detail:observation_tree_collapse",
                  { type: "single", nodeType: node.type },
                );
              }}
              className="h-6 w-6 flex-shrink-0 hover:bg-primary/10"
            >
              <span
                className={cn(
                  "inline-block h-4 w-4 transform transition-transform duration-200 ease-in-out",
                  collapsed ? "rotate-0" : "rotate-90",
                )}
              >
                <ChevronRight className="h-4 w-4" />
              </span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
