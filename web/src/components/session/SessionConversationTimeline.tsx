import { useMemo } from "react";
import {
  normalizeSpanIO,
  type NormalizedMessage,
} from "@langfuse/shared/src/utils/normalized-io";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import { Button } from "@/src/components/ui/button";
import { JsonSkeleton } from "@/src/components/ui/CodeJsonViewer";
import { type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";

type EventObservation = RouterOutputs["events"]["all"]["observations"][number];
type EventObservationIO = RouterOutputs["events"]["batchIO"][number];
type SessionObservation = Omit<
  EventObservation,
  "input" | "output" | "metadata"
> &
  Pick<EventObservationIO, "input" | "output" | "metadata"> & {
    inputTruncated?: boolean;
    outputTruncated?: boolean;
    metadataTruncated?: boolean;
  };

type SessionConversationTimelineState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty"; message: string }
  | {
      type: "loaded";
      observations: readonly SessionObservation[];
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
          (message) =>
            (showSystemPrompt || message.role !== "system") &&
            message.parts.some((part) => part.type !== "tool-result"),
        )
      : [];
  const hasTimelineContent =
    parsed.type === "loaded" &&
    parsed.messages.some((message) =>
      message.parts.some((part) => part.type !== "tool-result"),
    );

  return (
    <section
      data-session-observation-id={observation.id}
      className="flex scroll-mt-16 flex-col gap-3"
    >
      <button
        type="button"
        onClick={onOpenInTraceView}
        className="group -ml-1 flex min-w-0 items-center gap-2 self-start rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        {renderFilterIcon(observation.type ?? "EVENT")}
        <span
          className="min-w-0 truncate text-xs font-bold group-hover:underline"
          title={observation.name ?? observation.id}
        >
          {observation.name ?? observation.id}
        </span>
        {observation.latency !== null && observation.type !== "EVENT" ? (
          <span className="text-muted-foreground shrink-0 font-mono text-[11px]">
            {formatIntervalSeconds(observation.latency)}
          </span>
        ) : null}
        <time className="text-muted-foreground shrink-0 font-mono text-[10px]">
          {observation.startTime.toLocaleTimeString()}
        </time>
      </button>
      <div className="flex min-w-0 flex-col gap-3">
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
        ) : visibleMessages.length > 0 ? (
          visibleMessages.map((message, index) => (
            <SessionTimelineMessage
              key={message.id ?? `${message.source}-${message.role}-${index}`}
              message={message}
            />
          ))
        ) : parsed.messages.length === 0 || hasTimelineContent ? (
          <div className="text-muted-foreground rounded-lg border border-dashed p-3 text-xs">
            No conversational content
          </div>
        ) : null}
      </div>
    </section>
  );
}

export function SessionConversationTimeline({
  trace,
  turnNumber,
  state,
  showSystemPrompt,
  onOpenTrace,
  onOpenObservation,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  state: SessionConversationTimelineState;
  showSystemPrompt: boolean;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
}) {
  return (
    <div className="px-4 pb-14 sm:px-6 lg:px-10">
      <div className="mb-6 flex items-center gap-4 pt-5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ph-no-capture shrink-0 font-mono text-xs transition-colors"
          onClick={onOpenTrace}
          title={`${trace.name ?? "Trace"} (${trace.id})`}
        >
          turn {turnNumber} · {trace.id}
        </button>
        <div className="border-border min-w-0 flex-1 border-t border-dashed" />
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
        <div className="flex flex-col gap-5">
          {state.observations.map((observation) => (
            <SessionTimelineObservation
              key={observation.id}
              observation={observation}
              showSystemPrompt={showSystemPrompt}
              onOpenInTraceView={() => onOpenObservation(observation.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
