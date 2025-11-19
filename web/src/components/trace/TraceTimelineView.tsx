import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  isPresent,
  type ScoreDomain,
  type TraceDomain,
  ObservationLevel,
  type ObservationLevelType,
} from "@langfuse/shared";
import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useLayoutEffect,
} from "react";
import { TreeItem } from "@mui/x-tree-view";
import type Decimal from "decimal.js";
import { type TreeNode } from "./lib/types";
import { InfoIcon, ChevronRight } from "lucide-react";
import {
  heatMapTextColor,
  nestObservations,
  unnestObservation,
} from "@/src/components/trace/lib/helpers";
import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import type { ObservationType } from "@langfuse/shared";
import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";
import { getNumberFromMap, castToNumberMap } from "@/src/utils/map-utils";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { useVirtualizer } from "@tanstack/react-virtual";

// Fixed widths for styling for v1
const SCALE_WIDTH = 900;
const STEP_SIZE = 100;
const TREE_INDENTATION = 12; // default in MUI X TreeView

const PREDEFINED_STEP_SIZES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25,
  35, 40, 45, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
];

// Virtualized timeline data structure
type FlatTimelineItem = {
  observation:
    | NestedObservation
    | {
        id: string;
        name: string;
        type: "TRACE";
        startTime: Date;
        children: NestedObservation[];
      };
  depth: number;
  treeLines: boolean[];
  isLastSibling: boolean;
  // Pre-computed timeline metrics
  startOffset: number;
  itemWidth: number;
  firstTokenTimeOffset?: number;
  latency?: number;
  isTraceRoot?: boolean;
  // Pre-computed cost for this observation + all descendants
  totalCost?: Decimal;
};

/**
 * Build a map of observation ID to pre-computed totalCost from the TreeNode structure
 */
function buildCostMap(tree: TreeNode): Map<string, Decimal> {
  const costMap = new Map<string, Decimal>();

  const traverse = (node: TreeNode) => {
    if (node.totalCost) {
      costMap.set(node.id, node.totalCost);
    }
    node.children.forEach(traverse);
  };

  traverse(tree);
  return costMap;
}

/**
 * Flatten nested observations into a flat array with pre-computed timeline metrics.
 * Only includes expanded nodes based on expandedItems.
 * This enables virtualization by converting the tree to a flat list.
 */
function flattenTimelineTree(
  observations: NestedObservation[],
  expandedItems: string[],
  traceStartTime: Date,
  totalScaleSpan: number,
  costMap?: Map<string, Decimal>,
): FlatTimelineItem[] {
  const result: FlatTimelineItem[] = [];

  const flatten = (
    obs: NestedObservation,
    depth: number,
    treeLines: boolean[],
    isLastSibling: boolean,
  ) => {
    // Calculate timeline metrics ONCE during flattening
    const latency = obs.endTime
      ? (obs.endTime.getTime() - obs.startTime.getTime()) / 1000
      : undefined;
    const startOffset =
      ((obs.startTime.getTime() - traceStartTime.getTime()) /
        totalScaleSpan /
        1000) *
      SCALE_WIDTH;
    const itemWidth = ((latency ?? 0) / totalScaleSpan) * SCALE_WIDTH;
    const firstTokenTimeOffset = obs.completionStartTime
      ? ((obs.completionStartTime.getTime() - traceStartTime.getTime()) /
          totalScaleSpan /
          1000) *
        SCALE_WIDTH
      : undefined;

    // Get pre-computed cost from the cost map
    const totalCost = costMap?.get(obs.id);

    result.push({
      observation: obs,
      depth,
      treeLines,
      isLastSibling,
      startOffset,
      itemWidth,
      firstTokenTimeOffset,
      latency,
      totalCost,
    });

    // Only include children if this observation is expanded
    const observationId = `observation-${obs.id}`;
    if (obs.children.length > 0 && expandedItems.includes(observationId)) {
      obs.children.forEach((child, index) => {
        const isChildLast = index === obs.children.length - 1;
        flatten(child, depth + 1, [...treeLines, !isChildLast], isChildLast);
      });
    }
  };

  observations.forEach((obs, index) => {
    flatten(obs, 0, [], index === observations.length - 1);
  });

  return result;
}

const calculateStepSize = (latency: number, scaleWidth: number) => {
  const calculatedStepSize = latency / (scaleWidth / STEP_SIZE);
  return (
    PREDEFINED_STEP_SIZES.find((step) => step >= calculatedStepSize) ||
    PREDEFINED_STEP_SIZES[PREDEFINED_STEP_SIZES.length - 1]
  );
};

function TreeItemInner({
  latency,
  totalScaleSpan,
  type,
  startOffset = 0,
  firstTokenTimeOffset,
  name,
  hasChildren,
  isSelected,
  showDuration = true,
  showCostTokens = true,
  showScores = true,
  showComments = true,
  colorCodeMetrics = false,
  scores,
  commentCount,
  parentTotalDuration,
  totalCost,
  parentTotalCost,
}: {
  latency?: number;
  totalScaleSpan: number;
  type: ObservationType | "TRACE";
  startOffset?: number;
  firstTokenTimeOffset?: number;
  name?: string | null;
  hasChildren: boolean;
  isSelected: boolean;
  showDuration?: boolean;
  showCostTokens?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
  scores?: WithStringifiedMetadata<ScoreDomain>[];
  commentCount?: number;
  parentTotalDuration?: number;
  totalCost?: Decimal;
  parentTotalCost?: Decimal;
}) {
  const itemWidth = ((latency ?? 0) / totalScaleSpan) * SCALE_WIDTH;
  const duration = latency ? latency * 1000 : undefined;

  return (
    <div
      className={cn("group my-0.5 flex w-full min-w-fit flex-row items-center")}
    >
      <div className="flex items-center" style={{ width: `${SCALE_WIDTH}px` }}>
        <div
          className={`relative flex flex-row`}
          style={{ width: `${SCALE_WIDTH}px` }}
        >
          {firstTokenTimeOffset ? (
            <div
              className={cn(
                "flex rounded-sm border border-border",
                isSelected
                  ? "ring ring-primary-accent"
                  : "group-hover:ring group-hover:ring-tertiary",
              )}
              style={{ marginLeft: `${startOffset}px` }}
            >
              <div
                className={cn(
                  "flex h-8 items-center justify-start rounded-l-sm border-r border-gray-400 bg-muted opacity-60",
                  itemWidth ? "" : "border border-dashed",
                )}
                style={{
                  width: `${firstTokenTimeOffset - startOffset}px`,
                }}
              ></div>
              <div
                className={cn(
                  "flex h-8 items-center justify-start rounded-r-sm bg-muted",
                  itemWidth ? "" : "border border-dashed",
                )}
                style={{
                  width: `${itemWidth - (firstTokenTimeOffset - startOffset)}px`,
                }}
              >
                <div
                  className={cn(
                    "-ml-8 flex flex-row items-center justify-start gap-2 text-xs text-muted-foreground",
                  )}
                >
                  <span className="text-xxs text-primary">First token</span>
                  <ItemBadge type={type} isSmall />
                  <span className="whitespace-nowrap text-sm font-medium text-primary">
                    {name}
                  </span>
                  {showComments && commentCount ? (
                    <CommentCountIcon count={commentCount} />
                  ) : null}
                  {showDuration && isPresent(latency) && (
                    <span
                      className={cn(
                        "text-xs text-muted-foreground",
                        parentTotalDuration &&
                          colorCodeMetrics &&
                          duration &&
                          heatMapTextColor({
                            max: parentTotalDuration,
                            value: duration,
                          }),
                      )}
                    >
                      {formatIntervalSeconds(latency)}
                    </span>
                  )}
                  {showCostTokens && totalCost && (
                    <span
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
                      {usdFormatter(totalCost.toNumber())}
                    </span>
                  )}
                  {showScores && scores && scores.length > 0 && (
                    <div className="flex max-h-8 gap-1">
                      <GroupedScoreBadges scores={scores} maxVisible={3} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div
              className="relative"
              style={{ marginLeft: `${startOffset}px` }}
            >
              <div
                className={cn(
                  "flex h-8 items-center justify-start rounded-sm border border-border bg-muted",
                  itemWidth ? "" : "border-dashed",
                  isSelected
                    ? "ring ring-primary-accent"
                    : "group-hover:ring group-hover:ring-tertiary",
                )}
                style={{
                  width: `${itemWidth || 10}px`,
                }}
              >
                <div
                  className={cn(
                    "flex flex-row items-center justify-start gap-2 text-xs text-muted-foreground",
                    hasChildren ? "ml-6" : "ml-1",
                  )}
                >
                  <ItemBadge type={type} isSmall />
                  <span className="whitespace-nowrap text-sm font-medium text-primary">
                    {name}
                  </span>
                  {showComments && commentCount ? (
                    <CommentCountIcon count={commentCount} />
                  ) : null}
                  {showDuration && isPresent(latency) && (
                    <span
                      className={cn(
                        "text-xs text-muted-foreground",
                        parentTotalDuration &&
                          colorCodeMetrics &&
                          duration &&
                          heatMapTextColor({
                            max: parentTotalDuration,
                            value: duration,
                          }),
                      )}
                    >
                      {formatIntervalSeconds(latency)}
                    </span>
                  )}
                  {showCostTokens && totalCost && (
                    <span
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
                      {usdFormatter(totalCost.toNumber())}
                    </span>
                  )}
                  {showScores && scores && scores.length > 0 && (
                    <div className="flex max-h-8 gap-1">
                      <GroupedScoreBadges scores={scores} maxVisible={3} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Virtualized timeline row component - replaces recursive TraceTreeItem.
 * Renders a single timeline item with tree lines, expand/collapse button, and Gantt bar.
 */
function VirtualizedTimelineRow({
  item,
  totalScaleSpan,
  isSelected,
  onClick,
  onToggleExpand,
  hasChildren,
  isExpanded,
  scores,
  commentCount,
  parentTotalCost,
  parentTotalDuration,
  showDuration = true,
  showCostTokens = true,
  showScores = true,
  showComments = true,
  colorCodeMetrics = false,
}: {
  item: FlatTimelineItem;
  totalScaleSpan: number;
  isSelected: boolean;
  onClick: () => void;
  onToggleExpand: () => void;
  hasChildren: boolean;
  isExpanded: boolean;
  scores?: WithStringifiedMetadata<ScoreDomain>[];
  commentCount?: number;
  parentTotalCost?: Decimal;
  parentTotalDuration?: number;
  showDuration?: boolean;
  showCostTokens?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
}) {
  const {
    observation,
    depth,
    treeLines,
    isLastSibling,
    startOffset,
    firstTokenTimeOffset,
    latency,
    isTraceRoot,
  } = item;

  // Use pre-computed cost from the item (computed during tree building)
  // For trace root, use the parent total cost passed from props
  const totalCost = isTraceRoot ? parentTotalCost : item.totalCost;

  return (
    <div
      className={cn(
        "group my-0.5 flex w-full min-w-fit cursor-pointer flex-row items-center",
      )}
      onClick={onClick}
    >
      {/* Tree lines for ancestor levels (depth - 1) */}
      {depth > 0 && (
        <div className="flex flex-shrink-0">
          {Array.from({ length: depth - 1 }, (_, i) => (
            <div
              key={i}
              className="relative"
              style={{ width: `${TREE_INDENTATION}px` }}
            >
              {treeLines[i] && (
                <div className="absolute bottom-0 left-1.5 top-0 w-px bg-border" />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Current level tree connector */}
      {depth > 0 && (
        <div
          className="relative flex-shrink-0"
          style={{ width: `${TREE_INDENTATION}px` }}
        >
          {/* Vertical line up */}
          <div
            className={cn(
              "absolute left-1.5 top-0 w-px bg-border",
              isLastSibling ? "h-3" : "bottom-0",
            )}
          />
          {/* Horizontal line to content */}
          <div className="absolute left-1.5 top-3 h-px w-2 bg-border" />
        </div>
      )}

      {/* Expand/collapse button (if has children) */}
      {hasChildren && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          className="absolute z-10 rounded hover:bg-muted"
          style={{
            left: `${depth * TREE_INDENTATION + (startOffset > 0 ? startOffset + 4 : 4)}px`,
            top: "50%",
            transform: "translateY(-50%)",
          }}
        >
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform duration-200",
              isExpanded && "rotate-90",
            )}
          />
        </button>
      )}

      {/* Reuse existing TreeItemInner component */}
      <TreeItemInner
        latency={latency}
        type={observation.type}
        name={observation.name}
        startOffset={startOffset}
        firstTokenTimeOffset={firstTokenTimeOffset}
        totalScaleSpan={totalScaleSpan}
        hasChildren={hasChildren}
        isSelected={isSelected}
        showDuration={showDuration}
        showCostTokens={showCostTokens}
        showScores={showScores}
        showComments={showComments}
        colorCodeMetrics={colorCodeMetrics}
        scores={scores}
        commentCount={commentCount}
        parentTotalDuration={parentTotalDuration}
        totalCost={totalCost}
        parentTotalCost={parentTotalCost}
      />
    </div>
  );
}

function TraceTreeItem({
  observation,
  level = 0,
  traceStartTime,
  totalScaleSpan,
  projectId,
  scores,
  observations,
  cardWidth,
  commentCounts,
  currentObservationId,
  setCurrentObservationId,
  showDuration,
  showCostTokens,
  showScores,
  showComments,
  colorCodeMetrics,
  parentTotalDuration,
  parentTotalCost,
}: {
  observation: NestedObservation;
  level: number;
  traceStartTime: Date;
  totalScaleSpan: number;
  projectId: string;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  observations: Array<ObservationReturnTypeWithMetadata>;
  cardWidth: number;
  commentCounts?: Map<string, number>;
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
  showDuration?: boolean;
  showCostTokens?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
  parentTotalDuration?: number;
  parentTotalCost?: Decimal;
}) {
  const { startTime, completionStartTime, endTime } = observation || {};

  const latency = endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000
    : undefined;
  const startOffset =
    ((startTime.getTime() - traceStartTime.getTime()) / totalScaleSpan / 1000) *
    SCALE_WIDTH;
  const firstTokenTimeOffset = completionStartTime
    ? ((completionStartTime.getTime() - traceStartTime.getTime()) /
        totalScaleSpan /
        1000) *
      SCALE_WIDTH
    : undefined;

  const observationScores = scores.filter(
    (s) => s.observationId === observation.id,
  );

  // Calculate total cost for this observation and its children
  const unnestedObservations = unnestObservation(observation);
  const totalCost = calculateDisplayTotalCost({
    allObservations: unnestedObservations,
  });

  return (
    <TreeItem
      key={`observation-${observation.id}`}
      itemId={`observation-${observation.id}`}
      onClick={(e) => {
        e.stopPropagation();
        const isIconClick = (e.target as HTMLElement).closest(
          "svg.MuiSvgIcon-root",
        );
        if (!isIconClick) {
          setCurrentObservationId(observation.id);
        }
      }}
      classes={{
        content: `!rounded-none !min-w-fit !px-0 hover:!bg-background ${
          observation.id === currentObservationId ? "!bg-background" : ""
        }`,
        selected: "!bg-background !important",
        label: "!min-w-fit",
        iconContainer: `absolute top-1/2 z-10 -translate-y-1/2`,
      }}
      sx={{
        "& .MuiTreeItem-iconContainer": {
          left: startOffset > 0 ? `${startOffset + 4}px` : "4px",
        },
      }}
      label={
        <TreeItemInner
          latency={latency}
          type={observation.type}
          name={observation.name}
          startOffset={startOffset}
          firstTokenTimeOffset={firstTokenTimeOffset}
          totalScaleSpan={totalScaleSpan}
          hasChildren={!!observation.children?.length}
          isSelected={observation.id === currentObservationId}
          showDuration={showDuration}
          showCostTokens={showCostTokens}
          showScores={showScores}
          showComments={showComments}
          colorCodeMetrics={colorCodeMetrics}
          scores={observationScores}
          commentCount={commentCounts?.get(observation.id)}
          parentTotalDuration={parentTotalDuration}
          totalCost={totalCost}
          parentTotalCost={parentTotalCost}
        />
      }
    >
      {Array.isArray(observation.children)
        ? observation.children.map((child) => (
            <TraceTreeItem
              key={`observation-${child.id}`}
              observation={child}
              level={level + 1}
              traceStartTime={traceStartTime}
              totalScaleSpan={totalScaleSpan}
              projectId={projectId}
              scores={scores}
              observations={observations}
              cardWidth={cardWidth}
              commentCounts={commentCounts}
              currentObservationId={currentObservationId}
              setCurrentObservationId={setCurrentObservationId}
              showDuration={showDuration}
              showCostTokens={showCostTokens}
              showScores={showScores}
              showComments={showComments}
              colorCodeMetrics={colorCodeMetrics}
              parentTotalDuration={parentTotalDuration}
              parentTotalCost={parentTotalCost}
            />
          ))
        : null}
    </TreeItem>
  );
}

export function TraceTimelineView({
  trace,
  observations,
  projectId,
  // Note: displayScores are merged with client-side score cache; handling optimistic updates
  displayScores: scores,
  currentObservationId,
  setCurrentObservationId,
  expandedItems,
  setExpandedItems,
  showDuration = true,
  showCostTokens = true,
  showScores = true,
  showComments = true,
  colorCodeMetrics = true,
  minLevel,
  setMinLevel,
  containerWidth,
  tree,
}: {
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  observations: Array<ObservationReturnTypeWithMetadata>;
  projectId: string;
  displayScores: WithStringifiedMetadata<ScoreDomain>[];
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
  expandedItems: string[];
  setExpandedItems: (items: string[]) => void;
  showDuration?: boolean;
  showCostTokens?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
  minLevel?: ObservationLevelType;
  setMinLevel?: React.Dispatch<React.SetStateAction<ObservationLevelType>>;
  containerWidth?: number;
  tree: TreeNode;
}) {
  const { latency } = trace;

  const { nestedObservations, hiddenObservationsCount } = useMemo(
    () => nestObservations(observations, minLevel),
    [observations, minLevel],
  );

  // Build cost map from tree
  const costMap = useMemo(() => buildCostMap(tree), [tree]);

  // Use containerWidth from parent or fallback to ResizeObserver if not provided
  const [cardWidth, setCardWidth] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);

  // Use pre-computed cost from tree, or calculate if not available
  const totalCost = useMemo(
    () =>
      tree?.totalCost ??
      calculateDisplayTotalCost({
        allObservations: observations,
      }),
    [tree?.totalCost, observations],
  );

  useEffect(() => {
    if (containerWidth) {
      // Use passed container width from parent
      setCardWidth(containerWidth);
    } else {
      // Fallback to ResizeObserver if containerWidth not provided
      const handleResize = () => {
        if (parentRef.current) {
          const availableWidth = parentRef.current.offsetWidth;
          setCardWidth(availableWidth);
        }
      };

      handleResize();

      if (parentRef.current) {
        const resizeObserver = new ResizeObserver(() => {
          handleResize();
        });

        resizeObserver.observe(parentRef.current);

        return () => {
          resizeObserver.disconnect();
        };
      }
    }
  }, [containerWidth]);

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);

  const observationCommentCounts = api.comments.getCountByObjectType.useQuery(
    {
      projectId: trace.projectId,
      objectType: "OBSERVATION",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
      enabled: isAuthenticatedAndProjectMember && showComments,
    },
  );

  const traceCommentCounts = api.comments.getCountByObjectId.useQuery(
    {
      projectId: trace.projectId,
      objectId: trace.id,
      objectType: "TRACE",
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false, // prevents refetching loops
      enabled: isAuthenticatedAndProjectMember && showComments,
    },
  );

  const timeIndexRef = useRef<HTMLDivElement>(null);
  const timelineContentRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);

  const [contentWidth, setContentWidth] = useState(SCALE_WIDTH);

  // Use a useLayoutEffect to measure the actual content width after rendering
  useLayoutEffect(() => {
    if (!timelineContentRef.current) return;

    // Use scrollWidth which accounts for all content, including overflow
    const scrollWidth = timelineContentRef.current.scrollWidth;

    // Add 20px to account for scrollbar padding
    const newWidth = Math.max(SCALE_WIDTH, scrollWidth);
    if (newWidth !== contentWidth) {
      setContentWidth(newWidth);
    }
  }, [observations, expandedItems, contentWidth]);

  // Calculate step size and scale span
  const stepSize = latency ? calculateStepSize(latency, SCALE_WIDTH) : 1;
  const totalScaleSpan = stepSize * (SCALE_WIDTH / STEP_SIZE);

  const traceScores = scores.filter((s) => s.observationId === null);
  const totalDuration = latency ? latency * 1000 : 0; // Convert to milliseconds for consistency

  // Flatten the tree for virtualization
  const flattenedItems = useMemo(() => {
    if (!latency) return [];

    const traceStartTime = nestedObservations[0]?.startTime ?? trace.timestamp;

    // Create trace root item
    const traceRootItem: FlatTimelineItem = {
      observation: {
        id: trace.id,
        name: trace.name ?? "",
        type: "TRACE",
        startTime: trace.timestamp,
        children: nestedObservations,
      },
      depth: 0,
      treeLines: [],
      isLastSibling: true,
      startOffset: 0,
      itemWidth: (latency / totalScaleSpan) * SCALE_WIDTH,
      latency,
      isTraceRoot: true,
    };

    // Flatten all observations with pre-computed costs
    const flatObservations = flattenTimelineTree(
      nestedObservations,
      expandedItems,
      traceStartTime,
      totalScaleSpan,
      costMap,
    );

    return [traceRootItem, ...flatObservations];
  }, [
    nestedObservations,
    expandedItems,
    totalScaleSpan,
    trace,
    latency,
    costMap,
  ]);

  // Calculate dynamic content width from flattened items
  const dynamicContentWidth = useMemo(() => {
    const maxEndOffset = flattenedItems.reduce((max, item) => {
      const endOffset = item.startOffset + item.itemWidth;
      return Math.max(max, endOffset);
    }, SCALE_WIDTH);

    return Math.max(SCALE_WIDTH, maxEndOffset + 100); // +100px padding
  }, [flattenedItems]);

  // Use dynamic content width instead of measured scrollWidth
  const finalContentWidth = dynamicContentWidth;

  // Set up virtualizer
  const rowVirtualizer = useVirtualizer({
    count: flattenedItems.length,
    getScrollElement: () => timelineContentRef.current,
    estimateSize: () => 42, // Approximate row height
    overscan: 50,
  });

  // Early return after all hooks
  if (!latency) return null;

  return (
    <div ref={parentRef} className="h-full w-full px-3">
      <div className="relative flex h-full flex-col">
        {/* Sticky time index section - positioned absolutely at the top */}
        <div className="sticky top-0 z-20 bg-background">
          <div
            ref={timeIndexRef}
            className="overflow-x-auto"
            style={{
              width: cardWidth,
              scrollbarWidth: "none" /* Firefox */,
              msOverflowStyle: "none" /* IE and Edge */,
              WebkitOverflowScrolling: "touch",
            }}
            onScroll={(e) => {
              if (outerContainerRef.current) {
                outerContainerRef.current.scrollLeft =
                  e.currentTarget.scrollLeft;
              }
            }}
          >
            <div style={{ width: `${finalContentWidth}px` }}>
              <div className="mb-2 ml-2">
                <div
                  className="relative mr-2 h-8"
                  style={{ width: `${SCALE_WIDTH}px` }}
                >
                  {Array.from({
                    length: Math.ceil(SCALE_WIDTH / STEP_SIZE) + 1,
                  }).map((_, index) => {
                    const step = stepSize * index;

                    return (
                      <div
                        key={index}
                        className="absolute h-full border border-l text-xs"
                        style={{ left: `${index * STEP_SIZE}px` }}
                      >
                        <span
                          className="absolute left-2 text-xs text-muted-foreground"
                          title={`${step.toFixed(2)}s`}
                        >
                          {step.toFixed(2)}s
                        </span>
                      </div>
                    );
                  })}

                  {/* Add end marker if content exceeds scale */}
                  {contentWidth > SCALE_WIDTH && (
                    <div
                      className="absolute h-full border-r border-dashed"
                      style={{ left: `${SCALE_WIDTH}px` }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main content with scrolling */}
        <div
          ref={outerContainerRef}
          className="flex-1 overflow-x-auto"
          style={{ width: cardWidth }}
          onScroll={(e) => {
            if (timeIndexRef.current) {
              timeIndexRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
        >
          <div className="h-full" style={{ width: `${finalContentWidth}px` }}>
            {/* Main timeline content - virtualized */}
            <div
              ref={timelineContentRef}
              className="h-full overflow-y-auto"
              style={{ width: `${finalContentWidth}px` }}
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
                  const observationId =
                    item.observation.type === "TRACE"
                      ? `trace-${item.observation.id}`
                      : `observation-${item.observation.id}`;
                  const isExpanded = expandedItems.includes(observationId);
                  const isSelected =
                    item.observation.type === "TRACE"
                      ? currentObservationId === null
                      : item.observation.id === currentObservationId;

                  // Get scores for this observation
                  const itemScores =
                    item.observation.type === "TRACE"
                      ? traceScores
                      : scores.filter(
                          (s) => s.observationId === item.observation.id,
                        );

                  // Get comment count
                  const commentCount =
                    item.observation.type === "TRACE"
                      ? getNumberFromMap(
                          traceCommentCounts.data,
                          item.observation.id,
                        )
                      : castToNumberMap(observationCommentCounts.data)?.get(
                          item.observation.id,
                        );

                  return (
                    <div
                      key={item.observation.id}
                      data-index={virtualRow.index}
                      style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: "100%",
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <VirtualizedTimelineRow
                        item={item}
                        totalScaleSpan={totalScaleSpan}
                        isSelected={isSelected}
                        onClick={() => {
                          if (item.observation.type === "TRACE") {
                            setCurrentObservationId(null);
                          } else {
                            setCurrentObservationId(item.observation.id);
                          }
                        }}
                        onToggleExpand={() => {
                          const newItems = expandedItems.includes(observationId)
                            ? expandedItems.filter((id) => id !== observationId)
                            : [...expandedItems, observationId];
                          setExpandedItems(newItems);
                        }}
                        hasChildren={item.observation.children?.length > 0}
                        isExpanded={isExpanded}
                        scores={itemScores}
                        commentCount={commentCount}
                        parentTotalCost={totalCost}
                        parentTotalDuration={totalDuration}
                        showDuration={showDuration}
                        showCostTokens={showCostTokens}
                        showScores={showScores}
                        showComments={showComments}
                        colorCodeMetrics={colorCodeMetrics}
                      />
                    </div>
                  );
                })}
              </div>

              {minLevel && hiddenObservationsCount > 0 ? (
                <div className="flex items-center gap-1 p-2 py-4">
                  <InfoIcon className="h-4 w-4 text-muted-foreground" />
                  <span className="flex flex-row gap-1 text-sm text-muted-foreground">
                    <p>
                      {hiddenObservationsCount} observations below {minLevel}
                      level are hidden.
                    </p>
                    {setMinLevel && (
                      <p
                        className="cursor-pointer underline"
                        onClick={() => setMinLevel(ObservationLevel.DEBUG)}
                      >
                        Show all
                      </p>
                    )}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
