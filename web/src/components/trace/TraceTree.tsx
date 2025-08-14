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
          currentNodeId === node.id && "bg-muted",
          "after:hover:absolute after:hover:bottom-0 after:hover:left-0 after:hover:right-0 after:hover:h-[2px] after:hover:bg-background after:hover:content-['']",
          "before:hover:absolute before:hover:left-0 before:hover:right-0 before:hover:top-0 before:hover:h-[2px] before:hover:bg-background before:hover:content-['']",
          currentNodeId === node.id && [
            "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-background after:content-['']",
            "before:absolute before:left-0 before:right-0 before:top-0 before:h-[2px] before:bg-background before:content-['']",
          ],
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
          {/* Indentation guides */}
          {Array.from({ length: indentationLevel }, (_, i) => (
            <div className="w-6 flex-shrink-0 border-l border-border" key={i} />
          ))}

          {/* Node content */}
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-wrap items-center gap-2 -space-y-1 py-2",
            )}
            ref={currentNodeRef}
          >
            {/* Type badge and name */}
            <div className="flex min-w-0 items-center gap-2 overflow-hidden">
              <div className="flex-shrink-0">
                <ItemBadge type={node.type} isSmall className="scale-75" />
              </div>
              <span className="flex-shrink truncate text-sm font-medium">
                {node.name}
              </span>
            </div>

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
                      LevelColors[node.level as keyof typeof LevelColors]?.bg,
                      LevelColors[node.level as keyof typeof LevelColors]?.text,
                    )}
                  >
                    {node.level}
                  </span>
                </div>
              ) : null}
            </div>

            {/* Metrics on their own line */}
            {showMetrics && (
              <>
                {(node.inputUsage ||
                  node.outputUsage ||
                  node.totalUsage ||
                  duration ||
                  totalCost ||
                  node.latency) && (
                  <div className="flex w-full flex-wrap gap-2">
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
              </>
            )}

            {/* Scores on their own line */}
            {showScores && (
              <>
                {node.type === "TRACE" &&
                scores.find((s) => s.observationId === null) ? (
                  <div className="flex w-full flex-wrap gap-1">
                    <GroupedScoreBadges
                      scores={scores.filter((s) => s.observationId === null)}
                    />
                  </div>
                ) : scores.find((s) => s.observationId === node.id) ? (
                  <div className="flex w-full flex-wrap gap-1">
                    <GroupedScoreBadges
                      scores={scores.filter((s) => s.observationId === node.id)}
                    />
                  </div>
                ) : null}
              </>
            )}
          </div>

          {/* Expand/Collapse button */}
          {node.children.length > 0 && (
            <div className="flex items-center justify-end">
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
                className="h-full flex-shrink-0"
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
            .map((childNode) => (
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
              />
            ))}
        </div>
      )}
    </Fragment>
  );
};
