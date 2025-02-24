import { Card } from "@/src/components/ui/card";
import {
  type ObservationReturnTypeWithMetadata,
  type ObservationReturnType,
} from "@/src/server/api/routers/traces";
import { isPresent, type APIScore, type Trace } from "@langfuse/shared";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";

import {
  MinusIcon,
  PlusIcon,
  PanelRightOpen,
  PlusSquareIcon,
  MinusSquare,
} from "lucide-react";
import { nestObservations } from "@/src/components/trace/lib/helpers";
import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import {
  type TreeItemType,
  treeItemColors,
} from "@/src/components/trace/lib/helpers";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { TracePreview } from "@/src/components/trace/TracePreview";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";
import useSessionStorage from "@/src/components/useSessionStorage";
import { api } from "@/src/utils/api";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { ItemBadge } from "@/src/components/ItemBadge";

// Fixed widths for styling for v1
const SCALE_WIDTH = 1070;
const STEP_SIZE = 100;
const CARD_PADDING = 60;
const LABEL_WIDTH = 35;
const MIN_LABEL_WIDTH = 10;
const TREE_INDENTATION = 12; // default in MUI X TreeView

const PREDEFINED_STEP_SIZES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25,
  35, 40, 45, 50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
];

const getNestedObservationKeys = (
  observations: NestedObservation[],
): string[] => {
  const keys: string[] = [];

  const collectKeys = (obs: NestedObservation[]) => {
    obs.forEach((observation) => {
      keys.push(`observation-${observation.id}`);
      if (observation.children) {
        collectKeys(observation.children);
      }
    });
  };

  collectKeys(observations);
  return keys;
};

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
  children,
  level = 0,
  cardWidth,
  hasChildren,
  isSelected,
}: {
  latency?: number;
  totalScaleSpan: number;
  type: TreeItemType;
  startOffset?: number;
  firstTokenTimeOffset?: number;
  name?: string | null;
  children?: React.ReactNode;
  level?: number;
  cardWidth: number;
  hasChildren: boolean;
  isSelected: boolean;
}) {
  const itemWidth = ((latency ?? 0) / totalScaleSpan) * SCALE_WIDTH;

  return (
    <div
      className={cn("group my-0.5 flex w-full min-w-fit flex-row items-center")}
    >
      <div className="flex items-center" style={{ width: `${SCALE_WIDTH}px` }}>
        <div className={`relative w-[${SCALE_WIDTH}px] flex flex-row`}>
          {firstTokenTimeOffset ? (
            <div
              className={cn(
                "flex rounded-sm",
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
                    "ml-1 flex flex-row items-center justify-start gap-2 text-xs text-muted-foreground",
                  )}
                >
                  <ItemBadge type={type} isSmall />
                  <span className="whitespace-nowrap text-sm font-medium text-primary">
                    {name}
                  </span>
                  {isPresent(latency) && `${latency.toFixed(2)}s`}
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
                  "flex h-8 items-center justify-start rounded-sm bg-muted",
                  itemWidth ? "" : "border border-dashed",
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
                  {isPresent(latency) && `${latency.toFixed(2)}s`}
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
}: {
  observation: NestedObservation;
  level: number;
  traceStartTime: Date;
  totalScaleSpan: number;
  projectId: string;
  scores: APIScore[];
  observations: Array<ObservationReturnTypeWithMetadata>;
  cardWidth: number;
  commentCounts?: Map<string, number>;
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
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
        iconContainer: "absolute left-1 top-1/2 z-10 -translate-y-1/2",
      }}
      label={
        <TreeItemInner
          latency={latency}
          type={observation.type}
          name={observation.name}
          startOffset={startOffset}
          firstTokenTimeOffset={firstTokenTimeOffset}
          totalScaleSpan={totalScaleSpan}
          level={level}
          cardWidth={cardWidth}
          hasChildren={!!observation.children?.length}
          isSelected={observation.id === currentObservationId}
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
}: {
  trace: Omit<Trace, "input" | "output"> & {
    latency?: number;
    input: string | undefined;
    output: string | undefined;
  };
  observations: Array<ObservationReturnTypeWithMetadata>;
  projectId: string;
  scores: APIScore[];
  currentObservationId: string | null;
  setCurrentObservationId: (id: string | null) => void;
  expandedItems: string[];
  setExpandedItems: (items: string[]) => void;
}) {
  const { latency, name, id } = trace;

  const { nestedObservations } = useMemo(
    () => nestObservations(observations),
    [observations],
  );

  const [cardWidth, setCardWidth] = useState(0);
  const parentRef = useRef<HTMLDivElement>(null);

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
  }, [parentRef]);

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
      enabled: isAuthenticatedAndProjectMember,
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
      enabled: isAuthenticatedAndProjectMember,
    },
  );

  if (!latency) return null;

  const stepSize = calculateStepSize(latency, SCALE_WIDTH);
  const totalScaleSpan = stepSize * (SCALE_WIDTH / STEP_SIZE);

  return (
    <div ref={parentRef} className="h-full w-full">
      <div
        className="flex max-h-full flex-col overflow-x-auto overflow-y-hidden"
        style={{ width: cardWidth }}
      >
        <div className="mb-2 grid w-full grid-cols-[1fr,auto] items-center">
          <div
            className="flex flex-row items-center gap-2"
            style={{
              maxWidth: `${MIN_LABEL_WIDTH}px`,
            }}
          ></div>
          <div
            className="relative mr-2 h-8"
            style={{ width: `${SCALE_WIDTH}px` }}
          >
            {Array.from({ length: SCALE_WIDTH / STEP_SIZE + 1 }).map(
              (_, index) => {
                const step = stepSize * index;
                const isLastStep = index === SCALE_WIDTH / STEP_SIZE;

                return isLastStep ? (
                  <span
                    className="absolute -right-2 text-xs text-muted-foreground"
                    key={index}
                  >
                    {step.toFixed(latency.toString().length >= 8 ? 0 : 2)}s
                  </span>
                ) : (
                  <div
                    key={index}
                    className="absolute h-full border border-l text-xs"
                    style={{ left: `${index * STEP_SIZE}px` }}
                  >
                    <span className="absolute left-2 text-xs text-muted-foreground">
                      {step.toFixed(2)}s
                    </span>
                  </div>
                );
              },
            )}
          </div>
        </div>
        <div className="min-w-fit overflow-y-auto">
          <SimpleTreeView
            expandedItems={expandedItems}
            onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
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
                iconContainer: "absolute left-3 top-1/2 z-10 -translate-y-1/2",
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
                  cardWidth={cardWidth}
                  hasChildren={!!nestedObservations.length}
                  isSelected={currentObservationId === null}
                ></TreeItemInner>
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
                    />
                  ))
                : null}
            </TreeItem>
          </SimpleTreeView>
        </div>
      </div>
    </div>
  );
}
