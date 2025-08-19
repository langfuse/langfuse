import { type TreeNode } from "./lib/types";
import { cn } from "@/src/utils/tailwind";
import {
  type APIScoreV2,
  ObservationLevel,
  type ObservationLevelType,
} from "@langfuse/shared";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { Fragment, useMemo, useRef, useEffect } from "react";
import { LevelColors } from "@/src/components/level-colors";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { InfoIcon, ChevronRight } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  calculateDisplayTotalCost,
  heatMapTextColor,
  unnestObservation,
} from "@/src/components/trace/lib/helpers";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { usdFormatter } from "@/src/utils/numbers";
import type Decimal from "decimal.js";
import { CommandItem } from "@/src/components/ui/command";
import { ItemBadge } from "@/src/components/ItemBadge";

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
      <div className="pb-3">
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
    </div>
  );
};

const TreeNodeComponent = ({
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
}: {
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
}) => {
  const capture = usePostHogClientCapture();
  const collapsed = collapsedNodes.includes(node.id);

  // Convert TreeNode back to observation format for cost calculation
  const convertTreeNodeToObservation = (treeNode: TreeNode): any => ({
    ...treeNode,
    children: treeNode.children.map(convertTreeNodeToObservation),
  });

  const totalCost = calculateDisplayTotalCost({
    allObservations:
      node.children.length > 0
        ? node.children.flatMap((child) =>
            unnestObservation(convertTreeNodeToObservation(child)),
          )
        : [convertTreeNodeToObservation(node)],
  });

  const duration =
    node.endTime && node.startTime
      ? node.endTime.getTime() - node.startTime.getTime()
      : node.latency
        ? node.latency * 1000
        : undefined;

  const currentNodeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (currentNodeId && currentNodeRef.current && currentNodeId === node.id) {
      currentNodeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentNodeId, node.id]);

  return (
    <Fragment>
      <CommandItem
        value={`${node.name} ${node.type} ${node.id}`}
        className={cn(
          "relative flex w-full rounded-md px-0 hover:rounded-lg",
          currentNodeId === node.id && "bg-muted/60 hover:bg-muted/60",
        )}
        style={{
          paddingTop: 0,
          paddingBottom: 0,
          cursor: "pointer",
          borderRadius: "0.5rem",
        }}
        onSelect={() =>
          setCurrentNodeId(node.type === "TRACE" ? undefined : node.id)
        }
      >
        <div className="flex w-full">
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
                  className="absolute left-3 z-10 w-px bg-border"
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

          {/* Downward connector for root nodes with children */}
          {indentationLevel === 0 && node.children.length > 0 && !collapsed && (
            <div
              className="absolute w-px bg-border"
              style={{ left: "20px", top: "18px", bottom: 0 }}
            />
          )}

          {/* Node content */}
          <div
            className={cn(
              "flex min-w-0 flex-1 items-start gap-2 py-1",
              currentNodeId !== node.id && "rounded-md hover:bg-muted/40",
            )}
            ref={currentNodeRef}
          >
            {/* Icon */}
            <div className="relative z-20 flex-shrink-0">
              <ItemBadge type={node.type} isSmall className="scale-75" />
            </div>

            {/* Content that can wrap */}
            <div className="flex min-w-0 flex-1 flex-col">
              {/* First line: name, comments, level */}
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <span
                  className="flex-shrink truncate text-xs"
                  title={node.name}
                >
                  {node.name}
                </span>

                {/* Comments and Level */}
                <div className="flex items-center gap-2">
                  {comments && showComments ? (
                    <CommentCountIcon count={comments.get(node.id)} />
                  ) : null}
                  {/* Level badge (only for non-trace nodes) */}
                  {node.type !== "TRACE" &&
                  node.level &&
                  node.level !== "DEFAULT" ? (
                    <div className="flex">
                      <span
                        className={cn(
                          "rounded-sm p-0.5 text-xs",
                          LevelColors[node.level as keyof typeof LevelColors]
                            ?.bg,
                          LevelColors[node.level as keyof typeof LevelColors]
                            ?.text,
                        )}
                      >
                        {node.level}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Metrics line */}
              {showMetrics &&
                (node.inputUsage ||
                  node.outputUsage ||
                  node.totalUsage ||
                  duration ||
                  totalCost ||
                  node.latency) && (
                  <div className="flex flex-wrap gap-2">
                    {duration || node.latency ? (
                      <span
                        title={
                          node.children.length > 0 || node.type === "TRACE"
                            ? "Aggregated duration of all child observations"
                            : undefined
                        }
                        className={cn(
                          "text-xs text-muted-foreground",
                          parentTotalDuration &&
                            colorCodeMetrics &&
                            heatMapTextColor({
                              max: parentTotalDuration,
                              value:
                                duration ||
                                (node.latency ? node.latency * 1000 : 0),
                            }),
                        )}
                      >
                        {formatIntervalSeconds(
                          (duration ||
                            (node.latency ? node.latency * 1000 : 0)) / 1000,
                        )}
                      </span>
                    ) : null}
                    {node.inputUsage || node.outputUsage || node.totalUsage ? (
                      <span className="text-xs text-muted-foreground">
                        {node.inputUsage} → {node.outputUsage} (∑{" "}
                        {node.totalUsage})
                      </span>
                    ) : null}
                    {totalCost ? (
                      <span
                        title={
                          node.children.length > 0 || node.type === "TRACE"
                            ? "Aggregated cost of all child observations"
                            : undefined
                        }
                        className={cn(
                          "text-xs text-muted-foreground",
                          parentTotalCost &&
                            colorCodeMetrics &&
                            heatMapTextColor({
                              max: parentTotalCost,
                              value: totalCost,
                            }),
                        )}
                      >
                        {node.children.length > 0 || node.type === "TRACE"
                          ? "∑ "
                          : ""}
                        {usdFormatter(totalCost.toNumber())}
                      </span>
                    ) : null}
                  </div>
                )}

              {/* Scores line */}
              {showScores &&
                ((node.type === "TRACE" &&
                  scores.find((s) => s.observationId === null)) ||
                  scores.find((s) => s.observationId === node.id)) && (
                  <div className="flex flex-wrap gap-1">
                    <GroupedScoreBadges
                      scores={
                        node.type === "TRACE"
                          ? scores.filter((s) => s.observationId === null)
                          : scores.filter((s) => s.observationId === node.id)
                      }
                    />
                  </div>
                )}
            </div>
          </div>

          {/* Expand/Collapse button */}
          {node.children.length > 0 && (
            <div className="flex items-center justify-end py-1">
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
                <ChevronRight
                  className={cn(
                    "h-4 w-4 transition-transform duration-200",
                    !collapsed && "rotate-90",
                  )}
                />
              </Button>
            </div>
          )}
        </div>
      </CommandItem>

      {/* Render children */}
      {!collapsed && node.children.length > 0 && (
        <div className="flex w-full flex-col">
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
