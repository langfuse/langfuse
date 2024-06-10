import { Card } from "@/src/components/ui/card";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { type Score, type Trace } from "@langfuse/shared";

import React, { useState } from "react";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";

import { MinusIcon, PlusIcon, Search } from "lucide-react";
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
import useLocalStorage from "@/src/components/useLocalStorage";

const SCALE_WIDTH = 800; // in pixels
const LABEL_WIDTH = 35;
const TREE_INDENTATION = 12;

const PREDEFINED_STEP_SIZES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10,
];

const calculateStepSize = (latency: number, scaleWidth: number) => {
  const calculatedStepSize = latency / (scaleWidth / 100);
  return (
    PREDEFINED_STEP_SIZES.find((step) => step >= calculatedStepSize) ||
    PREDEFINED_STEP_SIZES[PREDEFINED_STEP_SIZES.length - 1]
  );
};

function TraceTreeItem({
  observation,
  level = 0,
  traceStartTime,
  totalScaleSpan,
  projectId,
  scores,
  observations,
}: {
  observation: NestedObservation;
  level: number;
  traceStartTime: Date;
  totalScaleSpan: number;
  projectId: string;
  scores: Score[];
  observations: Array<ObservationReturnType>;
}) {
  const { startTime, endTime } = observation || {};
  const [backgroundColor, setBackgroundColor] = useState("");

  const latency = endTime
    ? (endTime.getTime() - startTime.getTime()) / 1000
    : 0;
  const startOffset =
    ((startTime.getTime() - traceStartTime.getTime()) / totalScaleSpan / 1000) *
    SCALE_WIDTH;

  return (
    <TreeItem
      classes={{
        content: `border-l border-dashed !rounded-xs ${backgroundColor} !min-w-fit`,
        selected: "!bg-background !important hover:!bg-muted",
        label: "!min-w-fit",
      }}
      key={observation.id}
      itemId={observation.id}
      label={
        <TreeItemInner
          latency={latency}
          type={observation.type}
          name={observation.name}
          startOffset={startOffset}
          totalScaleSpan={totalScaleSpan}
          setBackgroundColor={setBackgroundColor}
          level={level}
        >
          <div className="p-8">
            <h3 className="mb-6 text-2xl font-semibold tracking-tight">
              Detail view
            </h3>
            <ObservationPreview
              observations={observations}
              scores={scores}
              projectId={projectId}
              currentObservationId={observation.id}
              traceId={observation.traceId}
            />
          </div>
        </TreeItemInner>
      }
    >
      {Array.isArray(observation.children)
        ? observation.children.map((child) => (
            <TraceTreeItem
              key={child.id}
              observation={child}
              level={level + 1}
              traceStartTime={traceStartTime}
              totalScaleSpan={totalScaleSpan}
              projectId={projectId}
              scores={scores}
              observations={observations}
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
}: {
  trace: Trace & { latency?: number };
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: Score[];
}) {
  const { latency, name, id } = trace;
  const [backgroundColor, setBackgroundColor] = useState("");
  const [expandedItems, setExpandedItems] = useLocalStorage<string[]>(
    `${trace.id}-expanded`,
    [trace.id],
  );

  if (!latency) return null;

  const nestedObservations = nestObservations(observations);
  const stepSize = calculateStepSize(latency, SCALE_WIDTH);
  const totalScaleSpan = stepSize * (SCALE_WIDTH / 100);

  return (
    <Card className="flex max-h-[calc(100dvh-24rem)] flex-col overflow-x-auto overflow-y-hidden">
      <div className="grid w-full grid-cols-[1fr,auto] items-center p-2">
        <h3 className="w-[248px] p-2 text-2xl font-semibold tracking-tight">
          Trace Timeline
        </h3>
        <div
          className="relative mr-2 h-4"
          style={{ width: `${SCALE_WIDTH}px` }}
        >
          {Array.from({ length: SCALE_WIDTH / 100 + 1 }).map((_, index) => {
            const step = stepSize * index;
            const isLastStep = index === SCALE_WIDTH / 100;

            return isLastStep ? (
              <span
                className="absolute -right-2 text-xs text-muted-foreground"
                key={index}
              >
                {step.toFixed(2)}s
              </span>
            ) : (
              <div
                key={index}
                className="absolute h-full border border-l text-xs"
                style={{ left: `${index * 100}px` }}
              >
                <span className="absolute left-2 text-xs text-muted-foreground">
                  {step.toFixed(2)}s
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="min-w-fit overflow-y-auto p-2">
        <SimpleTreeView
          slots={{
            expandIcon: PlusIcon,
            collapseIcon: MinusIcon,
          }}
          expandedItems={expandedItems}
          onExpandedItemsChange={(_, itemIds) => setExpandedItems(itemIds)}
        >
          <TreeItem
            key={id}
            itemId={id}
            classes={{
              content: `${backgroundColor} !min-w-fit`,
              selected: "!bg-background !important hover:!bg-muted",
              label: "!min-w-fit",
            }}
            label={
              <TreeItemInner
                name={name}
                latency={latency}
                totalScaleSpan={totalScaleSpan}
                setBackgroundColor={setBackgroundColor}
                type="TRACE"
              >
                <div className="p-8">
                  <h3 className="mb-6 text-2xl font-semibold tracking-tight">
                    Detail view
                  </h3>
                  <TracePreview
                    trace={trace}
                    observations={observations}
                    scores={scores}
                  />
                </div>
              </TreeItemInner>
            }
          >
            {nestedObservations.map((observation) => (
              <TraceTreeItem
                key={observation.id}
                observation={observation}
                level={1}
                traceStartTime={nestedObservations[0].startTime}
                totalScaleSpan={totalScaleSpan}
                projectId={projectId}
                scores={scores}
                observations={observations}
              />
            ))}
          </TreeItem>
        </SimpleTreeView>
      </div>
    </Card>
  );
}

function TreeItemInner({
  latency,
  totalScaleSpan,
  type,
  startOffset = 0,
  name,
  children,
  setBackgroundColor,
  level = 0,
  customLabelWidth = 212,
}: {
  latency: number;
  totalScaleSpan: number;
  type: TreeItemType;
  startOffset?: number;
  name?: string | null;
  children?: React.ReactNode;
  setBackgroundColor: (color: string) => void;
  level?: number;
  customLabelWidth?: number;
}) {
  const itemWidth = (latency / totalScaleSpan) * SCALE_WIDTH;
  const itemOffsetLabelWidth = itemWidth + startOffset + LABEL_WIDTH;

  return (
    <div className="group my-1 grid w-full min-w-fit grid-cols-[1fr,auto] items-center">
      <div
        className="grid grid-cols-[auto,max-content,1fr] items-center gap-2"
        style={{ width: customLabelWidth - level * TREE_INDENTATION }}
      >
        <span
          className={cn("rounded-sm p-1 text-xs", treeItemColors.get(type))}
        >
          {type}
        </span>
        <span className="break-all text-sm">{name}</span>
        <div
          onClick={(event) => {
            event.stopPropagation();
          }}
        >
          <Drawer
            onOpenChange={(open) => setBackgroundColor(open ? "!bg-muted" : "")}
          >
            <DrawerTrigger asChild>
              <Button
                className="focus:none active:none hidden justify-start hover:!bg-transparent group-hover:block"
                type="button"
                size="xs"
                variant="ghost"
              >
                <Search className="h-4 w-4"></Search>
              </Button>
            </DrawerTrigger>
            <DrawerContent className="h-1/3 w-full overflow-y-auto md:w-3/5 lg:w-3/5 xl:w-3/5 2xl:w-3/5">
              {children}
            </DrawerContent>
          </Drawer>
        </div>
      </div>
      <div className="flex items-center" style={{ width: `${SCALE_WIDTH}px` }}>
        <div className={`relative w-[${SCALE_WIDTH}px]`}>
          <div className="ml-4 mr-4 h-full border-r-2"></div>
          <div
            className={cn(
              "flex h-5 items-center justify-end rounded-sm",
              treeItemColors.get(type),
            )}
            style={{
              width: `${itemWidth}px`,
              marginLeft: `${startOffset}px`,
            }}
          >
            {!!latency && (
              <span
                className={cn(
                  "hidden justify-end text-xs text-muted-foreground group-hover:block",
                  itemOffsetLabelWidth > SCALE_WIDTH ? "mr-1" : "-mr-9",
                )}
              >
                {latency.toFixed(2)}s
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
