import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import {
  isPresent,
  type APIScoreV2,
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
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";
import type Decimal from "decimal.js";
import { InfoIcon } from "lucide-react";
import {
  heatMapTextColor,
  nestObservations,
  unnestObservation,
} from "@/src/components/trace/lib/helpers";
import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import {
  type TreeItemType,
  calculateDisplayTotalCost,
} from "@/src/components/trace/lib/helpers";
import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { ItemBadge } from "@/src/components/ItemBadge";
import { CommentCountIcon } from "@/src/features/comments/CommentCountIcon";
import { GroupedScoreBadges } from "@/src/components/grouped-score-badge";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { usdFormatter } from "@/src/utils/numbers";

// Fixed widths for styling for v1
const SCALE_WIDTH = 900;
const STEP_SIZE = 100;
const TREE_INDENTATION = 12; // default in MUI X TreeView

const PREDEFINED_STEP_SIZES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25,
  35, 40, 45, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
];

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
  showMetrics = true,
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
  type: TreeItemType;
  startOffset?: number;
  firstTokenTimeOffset?: number;
  name?: string | null;
  hasChildren: boolean;
  isSelected: boolean;
  showMetrics?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
  scores?: APIScoreV2[];
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
                  {showMetrics && isPresent(latency) && (
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
                  {showMetrics && totalCost && (
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
                  {showMetrics && isPresent(latency) && (
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
                  {showMetrics && totalCost && (
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
  showMetrics,
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
  scores: APIScoreV2[];
  observations: Array<ObservationReturnTypeWithMetadata>;
  cardWidth: number;
  commentCounts?: Map<string, number>;
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
  showMetrics?: boolean;
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
          showMetrics={showMetrics}
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
              showMetrics={showMetrics}
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
  scores,
  currentObservationId,
  setCurrentObservationId,
  expandedItems,
  setExpandedItems,
  showMetrics = true,
  showScores = true,
  showComments = true,
  colorCodeMetrics = true,
  minLevel,
  setMinLevel,
}: {
  trace: Omit<TraceDomain, "input" | "output" | "metadata"> & {
    latency?: number;
    input: string | null;
    output: string | null;
    metadata: string | null;
  };
  observations: Array<ObservationReturnTypeWithMetadata>;
  projectId: string;
  scores: APIScoreV2[];
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
  expandedItems: string[];
  setExpandedItems: (items: string[]) => void;
  showMetrics?: boolean;
  showScores?: boolean;
  showComments?: boolean;
  colorCodeMetrics?: boolean;
  minLevel?: ObservationLevelType;
  setMinLevel?: React.Dispatch<React.SetStateAction<ObservationLevelType>>;
}) {
  const { latency, name, id } = trace;

  const { nestedObservations, hiddenObservationsCount } = useMemo(
    () => nestObservations(observations, minLevel),
    [observations, minLevel],
  );

  const [cardWidth, setCardWidth] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);

  // Calculate total cost for all observations
  const totalCost = useMemo(
    () =>
      calculateDisplayTotalCost({
        allObservations: observations,
      }),
    [observations],
  );

  useEffect(() => {
    const handleResize = () => {
      if (parentRef.current) {
        const availableWidth = parentRef.current.offsetWidth;
        setCardWidth(availableWidth);
      }
    };

    handleResize();
    window.addEventListener("resize", handleResize); // Recalculate on window resize

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

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

  if (!latency) return null;
  const stepSize = calculateStepSize(latency, SCALE_WIDTH);
  const totalScaleSpan = stepSize * (SCALE_WIDTH / STEP_SIZE);

  const traceScores = scores.filter((s) => s.observationId === null);
  const totalDuration = latency * 1000; // Convert to milliseconds for consistency

  return (
    <div ref={parentRef} className="h-full w-full px-3">
      <div className="relative flex max-h-full flex-col">
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
            <div style={{ width: `${contentWidth}px` }}>
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
          className="overflow-x-auto"
          style={{ width: cardWidth }}
          onScroll={(e) => {
            if (timeIndexRef.current) {
              timeIndexRef.current.scrollLeft = e.currentTarget.scrollLeft;
            }
          }}
        >
          <div style={{ width: `${contentWidth}px` }}>
            {/* Main timeline content */}
            <div
              ref={timelineContentRef}
              className="overflow-y-auto"
              style={{ width: `${contentWidth}px` }}
            >
              <SimpleTreeView
                expandedItems={expandedItems}
                onExpandedItemsChange={(_, itemIds) =>
                  setExpandedItems(itemIds)
                }
                itemChildrenIndentation={TREE_INDENTATION}
                expansionTrigger="iconContainer"
              >
                <TreeItem
                  key={`trace-${id}`}
                  itemId={`trace-${id}`}
                  classes={{
                    content: `!min-w-fit hover:!bg-background`,
                    selected: "!bg-background !important",
                    label: "!min-w-fit",
                    iconContainer:
                      "absolute left-3 top-1/2 z-10 -translate-y-1/2",
                  }}
                  onClick={(e) => {
                    const isIconClick = (e.target as HTMLElement).closest(
                      "svg.MuiSvgIcon-root",
                    );
                    if (!isIconClick) {
                      setCurrentObservationId(null);
                    }
                  }}
                  label={
                    <TreeItemInner
                      name={name}
                      latency={latency}
                      totalScaleSpan={totalScaleSpan}
                      type="TRACE"
                      hasChildren={!!nestedObservations.length}
                      isSelected={currentObservationId === null}
                      showMetrics={showMetrics}
                      showScores={showScores}
                      showComments={showComments}
                      colorCodeMetrics={colorCodeMetrics}
                      scores={traceScores}
                      commentCount={traceCommentCounts.data?.get(id)}
                      totalCost={totalCost}
                    />
                  }
                >
                  {Boolean(nestedObservations.length)
                    ? nestedObservations.map((observation) => (
                        <TraceTreeItem
                          key={`observation-${observation.id}`}
                          observation={observation}
                          level={1}
                          traceStartTime={nestedObservations[0].startTime}
                          totalScaleSpan={totalScaleSpan}
                          projectId={projectId}
                          scores={scores}
                          observations={observations}
                          cardWidth={cardWidth}
                          commentCounts={observationCommentCounts.data}
                          currentObservationId={currentObservationId}
                          setCurrentObservationId={setCurrentObservationId}
                          showMetrics={showMetrics}
                          showScores={showScores}
                          showComments={showComments}
                          colorCodeMetrics={colorCodeMetrics}
                          parentTotalDuration={totalDuration}
                          parentTotalCost={totalCost}
                        />
                      ))
                    : null}
                </TreeItem>
              </SimpleTreeView>

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
