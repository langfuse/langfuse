import { type TreeNode } from "./lib/types";
import { cn } from "@/src/utils/tailwind";
import {
  type APIScoreV2,
  ObservationLevel,
  type ObservationLevelType,
} from "@langfuse/shared";
import { Fragment, useMemo, useRef, useEffect } from "react";
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

export const TraceTree = ({
  tree,
  collapsedNodes,
  toggleCollapsedNode,
  displayScores: scores,
  currentNodeId,
  setCurrentNodeId,
  showMetrics,
  showScores,
  colorCodeMetrics,
  nodeCommentCounts,
  className,
  showComments,
  hiddenObservationsCount,
  minLevel,
  setMinLevel,
}: {
  tree: TreeNode;
  collapsedNodes: string[];
  toggleCollapsedNode: (id: string) => void;
  // Note: displayScores are merged with client-side score cache; handling optimistic updates
  displayScores: APIScoreV2[];
  currentNodeId: string | undefined;
  setCurrentNodeId: (id: string | undefined) => void;
  showMetrics: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  nodeCommentCounts?: Map<string, number>;
  className?: string;
  showComments: boolean;
  hiddenObservationsCount?: number;
  minLevel?: ObservationLevelType;
  setMinLevel?: React.Dispatch<React.SetStateAction<ObservationLevelType>>;
}) => {
  const totalCost = useMemo(() => {
    // For unified tree, we need to calculate total cost differently
    // Convert TreeNode back to observation format for cost calculation
    const convertTreeNodeToObservation = (node: TreeNode): any => ({
      ...node,
      children: node.children.map(convertTreeNodeToObservation),
    });

    if (tree.type === "TRACE") {
      // For trace root, calculate from all children
      const allObservations = tree.children.flatMap((child) =>
        unnestObservation(convertTreeNodeToObservation(child)),
      );
      return calculateDisplayTotalCost({ allObservations });
    }

    return calculateDisplayTotalCost({
      allObservations: [convertTreeNodeToObservation(tree)],
    });
  }, [tree]);

  return (
    <div className={className}>
      <TreeNodeComponent
        node={tree}
        collapsedNodes={collapsedNodes}
        toggleCollapsedNode={toggleCollapsedNode}
        scores={scores}
        comments={nodeCommentCounts}
        indentationLevel={0}
        currentNodeId={currentNodeId}
        setCurrentNodeId={setCurrentNodeId}
        showMetrics={showMetrics}
        showScores={showScores}
        colorCodeMetrics={colorCodeMetrics}
        parentTotalCost={totalCost}
        parentTotalDuration={tree.latency ? tree.latency * 1000 : undefined}
        showComments={showComments}
        treeLines={[]}
        isLastSibling={true}
      />

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

type TreeNodeComponentProps = {
  node: TreeNode;
  collapsedNodes: string[];
  toggleCollapsedNode: (id: string) => void;
  scores: APIScoreV2[];
  comments?: Map<string, number>;
  indentationLevel: number;
  currentNodeId: string | undefined;
  setCurrentNodeId: (id: string | undefined) => void;
  showMetrics: boolean;
  showScores: boolean;
  colorCodeMetrics: boolean;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  showComments: boolean;
  treeLines: boolean[]; // Track which levels need vertical lines
  isLastSibling: boolean;
};

const UnmemoizedTreeNodeComponent = ({
  node,
  collapsedNodes,
  toggleCollapsedNode,
  scores,
  comments,
  indentationLevel,
  currentNodeId,
  setCurrentNodeId,
  showMetrics,
  showScores,
  colorCodeMetrics,
  parentTotalCost,
  parentTotalDuration,
  showComments,
  treeLines,
  isLastSibling,
}: TreeNodeComponentProps) => {
  const capture = usePostHogClientCapture();
  const collapsed = collapsedNodes.includes(node.id);

  // Convert TreeNode back to observation format for cost calculation (only for root parent totals outside)

  const currentNodeRef = useRef<HTMLButtonElement>(null);

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
    <Fragment>
      <div
        className={cn(
          "relative flex w-full cursor-pointer rounded-md px-0 hover:rounded-lg",
          isSelected ? "bg-muted" : "hover:bg-muted/50",
        )}
        style={{
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: "0.5rem",
        }}
        onClick={(e) => {
          // Only handle clicks that aren't on the expand/collapse button
          if (!e.currentTarget?.closest("[data-expand-button]")) {
            setCurrentNodeId(node.type === "TRACE" ? undefined : node.id);
          }
        }}
      >
        <div className="flex w-full pl-2">
          {/* 1. Indents: ancestor level indicators */}
          {indentationLevel > 0 && (
            <div className="flex flex-shrink-0">
              {Array.from({ length: indentationLevel - 1 }, (_, i) => (
                <div key={i} className="relative w-5">
                  {treeLines[i] && (
                    <div className="absolute bottom-0 left-3 top-0 w-px bg-border" />
                  )}
                </div>
              ))}
            </div>
          )}

          {/* 2. Current element bars: up/down/horizontal connectors */}
          {indentationLevel > 0 && (
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
            {indentationLevel === 0 &&
              node.children.length > 0 &&
              !collapsed && (
                <div className="absolute bottom-0 left-1/2 top-3 w-px bg-border" />
              )}
          </div>

          {/* 4. Content button: just the text/metrics content */}
          {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
          <button
            type="button"
            aria-selected={isSelected}
            onClick={(e) => {
              e.stopPropagation();
              setCurrentNodeId(node.type === "TRACE" ? undefined : node.id);
            }}
            className={cn(
              "peer relative flex min-w-0 flex-1 items-start rounded-md py-1.5 pl-2 pr-2 text-left",
            )}
            ref={currentNodeRef}
          >
            <SpanItem
              node={node}
              scores={scores}
              comments={comments}
              showMetrics={showMetrics}
              showScores={showScores}
              colorCodeMetrics={colorCodeMetrics}
              parentTotalCost={parentTotalCost}
              parentTotalDuration={parentTotalDuration}
              showComments={showComments}
            />
          </button>

          {/* 5. Expand/Collapse button */}
          {node.children.length > 0 && (
            <div className="flex items-center justify-end py-1 pr-2">
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

      {/* Render children */}
      {node.children.length > 0 && (
        <div className={cn("flex w-full flex-col", collapsed && "hidden")}>
          {node.children
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime())
            .map((childNode, index) => {
              const isChildLastSibling = index === node.children.length - 1;
              // Add to treeLines: whether there are more children after this one (determines if vertical line should continue)
              const childTreeLines = [...treeLines, !isChildLastSibling];

              return (
                <TreeNodeComponent
                  key={childNode.id}
                  node={childNode}
                  collapsedNodes={collapsedNodes}
                  toggleCollapsedNode={toggleCollapsedNode}
                  scores={scores}
                  comments={comments}
                  indentationLevel={indentationLevel + 1}
                  currentNodeId={currentNodeId}
                  setCurrentNodeId={setCurrentNodeId}
                  showMetrics={showMetrics}
                  showScores={showScores}
                  colorCodeMetrics={colorCodeMetrics}
                  parentTotalCost={parentTotalCost}
                  parentTotalDuration={parentTotalDuration}
                  showComments={showComments}
                  treeLines={childTreeLines}
                  isLastSibling={isChildLastSibling}
                />
              );
            })}
        </div>
      )}
    </Fragment>
  );
};

const TreeNodeComponent = UnmemoizedTreeNodeComponent;
