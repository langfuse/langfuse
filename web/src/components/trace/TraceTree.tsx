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
  scores,
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
  scores: APIScoreV2[];
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
          "relative flex w-full rounded-md px-0 hover:rounded-lg",
          isSelected ? "bg-muted" : "hover:bg-muted/50",
        )}
        style={{
          paddingTop: 0,
          paddingBottom: 0,
          borderRadius: "0.5rem",
        }}
      >
        <div className="flex w-full pl-2">
          {/* Tree structure indicators */}
          {indentationLevel > 0 && (
            <div className="flex flex-shrink-0">
              {/* Vertical lines for ancestor levels */}
              {Array.from({ length: indentationLevel - 1 }, (_, i) => (
                <div key={i} className="relative w-6">
                  {treeLines[i] && (
                    <div className="absolute bottom-0 left-3 top-0 w-px bg-border" />
                  )}
                </div>
              ))}
              {/* Branch indicator for current level */}
              <div className="relative w-6">
                <div
                  className="absolute left-3 w-px bg-border"
                  style={{
                    top: 0,
                    bottom: isLastSibling ? "calc(100% - 12px)" : "12px",
                  }}
                />
                <div className="absolute left-3 top-3 h-px w-3 bg-border" />
                {!isLastSibling && (
                  <div className="absolute bottom-0 left-3 top-3 w-px bg-border" />
                )}
                {/* Downward connector for nodes with children */}
                {node.children.length > 0 && !collapsed && (
                  <div
                    className="absolute w-px bg-border"
                    style={{ left: "36px", top: "18px", bottom: 0 }}
                  />
                )}
              </div>
            </div>
          )}

          {/* Downward connector placeholder for root */}
          {indentationLevel === 0 ? (
            <div
              className={cn(
                "absolute w-px",
                node.children.length > 0 && !collapsed
                  ? "bg-border"
                  : "bg-transparent",
              )}
              style={{ left: "20px", top: "18px", bottom: 0 }}
            />
          ) : null}

          {/* Node content button */}
          {/* eslint-disable-next-line jsx-a11y/role-supports-aria-props */}
          <button
            type="button"
            aria-selected={isSelected}
            onClick={() =>
              setCurrentNodeId(node.type === "TRACE" ? undefined : node.id)
            }
            className={cn(
              "peer relative flex min-w-0 flex-1 items-center rounded-md py-1.5 pl-0 pr-2 text-left",
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

          {/* Expand/Collapse button */}
          {node.children.length > 0 && (
            <div className="flex items-center justify-end py-1 pr-2">
              <Button
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

          {/* Background handled by container hover/selected classes */}
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
