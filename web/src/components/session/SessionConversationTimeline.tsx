import { useMemo } from "react";
import {
  normalizeSpanIO,
  type NormalizedMessage,
} from "@langfuse/shared/src/utils/normalized-io";

import { ItemBadge } from "@/src/components/ItemBadge";
import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { Button } from "@/src/components/ui/button";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { type RouterOutputs } from "@/src/utils/api";

type SessionObservation =
  RouterOutputs["sessions"]["observationsForTraceFromEvents"][number];

type SessionConversationTimelineState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty"; message: string }
  | {
      type: "loaded";
      observations: readonly SessionObservation[];
      hasMoreObservations: boolean;
    };

const toPreviewText = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, undefined, 2);

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

function TruncatedObservation({
  observation,
  onOpenInTraceView,
}: {
  observation: SessionObservation;
  onOpenInTraceView: () => void;
}) {
  return (
    <div className="border-border bg-muted/20 flex flex-col gap-3 rounded-lg border border-dashed p-4">
      <p className="text-muted-foreground text-xs">
        This observation is too large to parse in the session timeline.
      </p>
      {hasPreviewValue(observation.input) ? (
        <pre className="bg-background max-h-32 overflow-hidden rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {toPreviewText(observation.input)}
        </pre>
      ) : null}
      {hasPreviewValue(observation.output) ? (
        <pre className="bg-background max-h-32 overflow-hidden rounded-md border p-2 font-mono text-xs break-all whitespace-pre-wrap">
          {toPreviewText(observation.output)}
        </pre>
      ) : null}
      <Button
        variant="outline"
        size="sm"
        className="w-fit"
        onClick={onOpenInTraceView}
      >
        Open in trace view
      </Button>
    </div>
  );
}

function SessionTimelineObservation({
  observation,
  showSystemPrompt,
  onOpenInTraceView,
}: {
  observation: SessionObservation;
  showSystemPrompt: boolean;
  onOpenInTraceView: () => void;
}) {
  const isTruncated = observation.inputTruncated || observation.outputTruncated;

  const parsed = useMemo<
    { type: "loaded"; messages: NormalizedMessage[] } | { type: "error" }
  >(() => {
    try {
      return {
        type: "loaded",
        messages: normalizeSpanIO({
          input: observation.input,
          output: observation.output,
          metadata: observation.metadataTruncated
            ? undefined
            : observation.metadata,
        }).messages,
      };
    } catch {
      return { type: "error" };
    }
  }, [
    observation.input,
    observation.output,
    observation.metadata,
    observation.metadataTruncated,
  ]);

  const visibleMessages =
    parsed.type === "loaded"
      ? parsed.messages.filter(
          (message) => showSystemPrompt || message.role !== "system",
        )
      : [];

  return (
    <section
      data-session-observation-id={observation.id}
      className="grid scroll-mt-16 gap-3 md:grid-cols-[8rem_minmax(0,1fr)]"
    >
      <button
        type="button"
        onClick={onOpenInTraceView}
        className="group flex min-w-0 items-start gap-2 text-left md:flex-col md:gap-1"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ItemBadge type={observation.type ?? "EVENT"} isSmall />
          <span
            className="truncate text-xs font-bold group-hover:underline"
            title={observation.name ?? "Observation"}
          >
            {observation.name ?? "Observation"}
          </span>
        </span>
        <time className="text-muted-foreground shrink-0 font-mono text-[10px]">
          {observation.startTime.toLocaleTimeString()}
        </time>
      </button>
      <div className="flex min-w-0 flex-col gap-2">
        {observation.metadataTruncated && !isTruncated ? (
          <p className="text-muted-foreground text-xs">
            Metadata was omitted because it is too large. Messages are parsed
            from input and output only.
          </p>
        ) : null}
        {isTruncated ? (
          <TruncatedObservation
            observation={observation}
            onOpenInTraceView={onOpenInTraceView}
          />
        ) : parsed.type === "error" ? (
          <div className="border-destructive/40 bg-destructive/5 flex items-center justify-between gap-3 rounded-lg border p-3">
            <span className="text-destructive text-xs">
              This observation could not be parsed.
            </span>
            <Button variant="outline" size="sm" onClick={onOpenInTraceView}>
              Open trace
            </Button>
          </div>
        ) : visibleMessages.length === 0 ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            No conversational content
          </div>
        ) : (
          visibleMessages.map((message, index) => (
            <SessionTimelineMessage
              key={message.id ?? `${message.source}-${message.role}-${index}`}
              message={message}
            />
          ))
        )}
      </div>
    </section>
  );
}

export function SessionConversationTimeline({
  trace,
  state,
  showSystemPrompt,
  onOpenTrace,
  onOpenObservation,
}: {
  trace: EventSessionTrace;
  state: SessionConversationTimelineState;
  showSystemPrompt: boolean;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
}) {
  return (
    <div className="px-4 pb-12 sm:px-6 lg:px-10">
      <div className="bg-card/95 sticky top-0 z-10 -mx-4 mb-5 flex items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
        <button
          type="button"
          className="group flex min-w-0 items-center gap-2 text-left"
          onClick={onOpenTrace}
        >
          <ItemBadge type="TRACE" isSmall />
          <span
            className="truncate text-sm font-bold group-hover:underline"
            title={trace.name ?? "Trace"}
          >
            {trace.name ?? "Trace"}
          </span>
          <span
            className="text-muted-foreground hidden truncate font-mono text-[10px] xl:inline"
            title={trace.id}
          >
            {trace.id}
          </span>
        </button>
        <time className="text-muted-foreground shrink-0 text-xs">
          {trace.timestamp.toLocaleString()}
        </time>
      </div>

      {state.type === "loading" ? (
        <JsonSkeleton className="h-64 w-full" numRows={8} />
      ) : state.type === "error" ? (
        <div className="border-destructive/40 bg-destructive/5 text-foreground rounded-lg border p-4 text-xs">
          Failed to load observations.
        </div>
      ) : state.type === "empty" ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
          {state.message}
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {state.observations.map((observation) => (
            <SessionTimelineObservation
              key={observation.id}
              observation={observation}
              showSystemPrompt={showSystemPrompt}
              onOpenInTraceView={() => onOpenObservation(observation.id)}
            />
          ))}
          {state.hasMoreObservations ? (
            <button
              type="button"
              className="text-primary self-start text-xs underline underline-offset-2"
              onClick={onOpenTrace}
            >
              Open the trace to see remaining observations
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
