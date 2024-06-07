import { Card } from "@/src/components/ui/card";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { $Enums, type Trace } from "@langfuse/shared";

import React from "react";
import { SimpleTreeView } from "@mui/x-tree-view/SimpleTreeView";
import { TreeItem } from "@mui/x-tree-view/TreeItem";

import { MinusIcon, PlusIcon } from "lucide-react";
import { nestObservations } from "@/src/components/trace/ObservationTree";
import { type NestedObservation } from "@/src/utils/types";
import { cn } from "@/src/utils/tailwind";
import Link from "next/link";

const colors: Map<$Enums.ObservationType, string> = new Map([
  [$Enums.ObservationType.SPAN, "bg-muted-blue"],
  [$Enums.ObservationType.GENERATION, "bg-muted-orange"],
  [$Enums.ObservationType.EVENT, "bg-muted-green"],
]);

const predefinedStepSizes = [
  0.25, 0.5, 0.75, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024,
];

const calculateStepSize = (latency: number, scaleWidth: number) => {
  const calculatedStepSize = latency / (scaleWidth / 100);
  return predefinedStepSizes.reduce((prev, curr) =>
    Math.abs(curr - calculatedStepSize) < Math.abs(prev - calculatedStepSize)
      ? curr
      : prev,
  );
};

const ColorCodedObservationType = (props: {
  observationType: $Enums.ObservationType;
  projectId: string;
  observationId: string;
  traceId: string;
}) => {
  return (
    <Link
      href={`/project/${props.projectId}/traces/${props.traceId}?observation=${props.observationId}`}
    >
      <span
        className={cn(
          "inline-block self-start rounded-sm p-1 text-xs hover:underline hover:underline-offset-2 group-hover:block",
          colors.get(props.observationType),
        )}
      >
        {props.observationType}
      </span>
    </Link>
  );
};

const scaleWidth = 800;

const renderTree = (
  observation: NestedObservation,
  level: number = 0,
  traceStartTime: Date,
  traceLatency: number,
  projectId: string,
) => {
  const { startTime, endTime } = observation || {};
  const latency =
    startTime && endTime ? endTime.getTime() - startTime.getTime() : undefined;
  const startOffset = startTime
    ? ((startTime.getTime() - traceStartTime.getTime()) / traceLatency / 1000) *
      scaleWidth
    : 0;
  console.log("startOffset", startOffset);
  console.log("latency", latency);
  console.log("traceLatency", traceLatency);

  return (
    <TreeItem
      classes={{
        content: "border-l border-dashed !rounded-none",
      }}
      key={observation.id}
      itemId={observation.id}
      label={
        <div
          className="my-1 grid w-full grid-cols-[1fr,auto,auto]"
          title={`Click ${observation.type} to view details`}
        >
          <div className="flex min-w-[200px] items-center gap-2">
            <ColorCodedObservationType
              observationType={observation.type}
              projectId={projectId}
              observationId={observation.id}
              traceId={observation.traceId}
            />
            <span className="flex-1 break-all text-sm">{observation.name}</span>
          </div>
          {latency && (
            <div className="group flex w-full items-center overflow-x-auto">
              <div
                className={`relative grid w-[${scaleWidth}px] grid-cols-[auto,1fr] items-center gap-2`}
              >
                <div
                  className={cn(colors.get(observation.type))}
                  style={{
                    marginLeft: `${startOffset}px`,
                    width: `${(latency / 1000 / traceLatency) * scaleWidth}px`,
                    height: "18px",
                    borderRadius: 2,
                  }}
                ></div>
                <span className="hidden text-xs text-muted-foreground group-hover:block">
                  {(latency / 1000).toFixed(2)}s
                </span>
              </div>
            </div>
          )}
        </div>
      }
    >
      {Array.isArray(observation.children)
        ? observation.children.map((child) =>
            renderTree(
              child,
              level + 1,
              traceStartTime,
              traceLatency,
              projectId,
            ),
          )
        : null}
    </TreeItem>
  );
};

export function TraceTimelineChart({
  trace,
  observations,
  projectId,
}: {
  trace: Trace & { latency?: number };
  observations: Array<ObservationReturnType>;
  projectId: string;
}) {
  if (!trace.latency) return null;
  const nestedObservations = nestObservations(observations);
  const stepSize = calculateStepSize(trace.latency, scaleWidth);
  const totalScaleSpan = stepSize * (scaleWidth / 100);

  return (
    <Card className="flex flex-col">
      <div className="grid w-full grid-cols-[1fr,auto] items-center p-2">
        <h3 className="p-2 text-2xl font-semibold tracking-tight">
          Trace Timeline
        </h3>
        <div className={`relative mr-2 h-4 w-[${scaleWidth}px]`}>
          {Array.from({ length: scaleWidth / 100 + 1 }).map((_, index) => {
            const step = stepSize * index;
            if (index === scaleWidth / 100)
              return (
                <span
                  className="absolute -right-2 text-xs text-muted-foreground"
                  key={index}
                >
                  {step.toFixed(2)}s
                </span>
              );
            return (
              <div
                key={index}
                className="absolute border border-l text-xs"
                style={{
                  left: `${index * 100}px`,
                  height: "100%",
                }}
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
          defaultExpandedItems={[trace.id]}
        >
          <TreeItem
            key={trace.id}
            itemId={trace.id}
            label={
              <div
                className="my-1 grid w-full grid-cols-[1fr,auto] items-center"
                title="Click TRACE to view details"
              >
                <div className="group flex min-w-[200px] items-center gap-2">
                  <Link
                    className="rounded-sm bg-input p-1 text-xs hover:underline hover:underline-offset-2 group-hover:block"
                    href={`/project/${projectId}/traces/${trace.id}`}
                  >
                    TRACE
                  </Link>
                  <span className="flex-1 break-all text-sm">{trace.name}</span>
                </div>
                <div className="flex w-full items-center overflow-x-auto">
                  <div className={`relative w-[${scaleWidth}px]`}>
                    <div className="ml-4 mr-4 h-full border-r-2"></div>
                    <div
                      className="bg-input"
                      style={{
                        width: `${(trace.latency / totalScaleSpan) * scaleWidth}px`,
                        height: "18px",
                        borderRadius: 2,
                      }}
                    ></div>
                  </div>
                </div>
              </div>
            }
          >
            {nestedObservations.map((observation) =>
              renderTree(
                observation,
                0,
                nestedObservations[0].startTime,
                trace.latency ?? 1000,
                projectId,
              ),
            )}
          </TreeItem>
        </SimpleTreeView>
      </div>
    </Card>
  );
}
