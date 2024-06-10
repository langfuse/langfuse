import { Card } from "@/src/components/ui/card";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { $Enums, type Score, type Trace } from "@langfuse/shared";

import React from "react";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";

import { MinusIcon, PlusIcon, Search } from "lucide-react";
import { nestObservations } from "@/src/components/trace/ObservationTree";
import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import { Button } from "@/src/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from "@/src/components/ui/drawer";
import { TracePreview } from "@/src/components/trace/TracePreview";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";

const scaleWidth = 800; // in pixels
const labelWidth = 35;

type TreeItemType = $Enums.ObservationType | "TRACE";

const colors: Map<TreeItemType, string> = new Map([
  [$Enums.ObservationType.SPAN, "bg-muted-blue"],
  [$Enums.ObservationType.GENERATION, "bg-muted-orange"],
  [$Enums.ObservationType.EVENT, "bg-muted-green"],
  ["TRACE", "bg-input"],
]);

const predefinedStepSizes = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8, 9, 10,
];

const calculateStepSize = (latency: number, scaleWidth: number) => {
  const calculatedStepSize = latency / (scaleWidth / 100);
  return (
    predefinedStepSizes.find((step) => step >= calculatedStepSize) ||
    predefinedStepSizes[predefinedStepSizes.length - 1]
  );
};

const renderTree = ({
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
}) => {
  const { startTime, endTime } = observation || {};

  if (!endTime) return null;

  const latency = (endTime.getTime() - startTime.getTime()) / 1000;
  const startOffset =
    ((startTime.getTime() - traceStartTime.getTime()) / totalScaleSpan / 1000) *
    scaleWidth;

  return (
    <TreeItem
      classes={{
        content: "border-l border-dashed !rounded-none",
      }}
      key={observation.id}
      itemId={observation.id}
      label={
        <TreeItemInner
          latency={latency}
          type={observation.type}
          startOffset={startOffset}
          totalScaleSpan={totalScaleSpan}
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
        ? observation.children.map((child) =>
            renderTree({
              observation: child,
              level: level + 1,
              traceStartTime,
              totalScaleSpan,
              projectId,
              scores,
              observations,
            }),
          )
        : null}
    </TreeItem>
  );
};

export function TraceTimelineChart({
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
  if (!latency) return null;
  const nestedObservations = nestObservations(observations);
  const stepSize = calculateStepSize(latency, scaleWidth);
  const totalScaleSpan = stepSize * (scaleWidth / 100);

  return (
    <Card className="flex flex-col">
      <div className="grid w-full grid-cols-[1fr,auto] items-center p-2">
        <h3 className="p-2 text-2xl font-semibold tracking-tight">
          Trace Timeline
        </h3>
        <div className="relative mr-2 h-4" style={{ width: `${scaleWidth}px` }}>
          {Array.from({ length: scaleWidth / 100 + 1 }).map((_, index) => {
            const step = stepSize * index;
            const isLastStep = index === scaleWidth / 100;

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
      <div className="p-2">
        <SimpleTreeView
          slots={{
            expandIcon: PlusIcon,
            collapseIcon: MinusIcon,
          }}
          defaultExpandedItems={[id]}
        >
          <TreeItem
            key={id}
            itemId={id}
            label={
              <TreeItemInner
                name={name}
                latency={latency}
                totalScaleSpan={totalScaleSpan}
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
            {nestedObservations.map((observation) =>
              renderTree({
                observation,
                level: 0,
                traceStartTime: nestedObservations[0].startTime,
                totalScaleSpan,
                projectId,
                scores,
                observations,
              }),
            )}
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
}: {
  latency: number;
  totalScaleSpan: number;
  type: TreeItemType;
  startOffset?: number;
  name?: string | null;
  children?: React.ReactNode;
}) {
  const itemWidth = (latency / totalScaleSpan) * scaleWidth;
  const itemOffsetLabelWidth = itemWidth + startOffset + labelWidth;

  return (
    <div className="group my-1 grid w-full grid-cols-[1fr,auto] items-center">
      <div className="grid min-w-[200px] grid-cols-[auto,max-content,1fr] items-center gap-2">
        <span className={cn("rounded-sm p-1 text-xs", colors.get(type))}>
          {type}
        </span>
        <span className="break-all text-sm">{name}</span>
        <Drawer>
          <DrawerTrigger asChild>
            <Button
              className="focus:none active:none hidden justify-start hover:!bg-transparent group-hover:block"
              type="button"
              size="xs"
              variant="ghost"
              onClick={(event) => {
                event.stopPropagation();
              }}
            >
              <Search className="h-4 w-4"></Search>
            </Button>
          </DrawerTrigger>
          <DrawerContent
            className="h-1/3 w-3/5 lg:w-3/5 xl:w-3/5 2xl:w-3/5"
            onClick={(event) => {
              event.stopPropagation();
            }}
          >
            {children}
          </DrawerContent>
        </Drawer>
      </div>
      <div className="flex items-center" style={{ width: `${scaleWidth}px` }}>
        <div className={`relative w-[${scaleWidth}px]`}>
          <div className="ml-4 mr-4 h-full border-r-2"></div>
          <div
            className={cn(
              "flex h-5 items-center justify-end rounded-sm",
              colors.get(type),
            )}
            style={{
              width: `${itemWidth}px`,
              marginLeft: `${startOffset}px`,
            }}
          >
            <span
              className={cn(
                "justify-end text-xs text-muted-foreground ",
                itemOffsetLabelWidth > scaleWidth ? "mr-1" : "-mr-9",
              )}
            >
              {latency.toFixed(2)}s
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
