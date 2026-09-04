import { useMemo, useState } from "react";
import { ChevronDown, MessageSquareOff } from "lucide-react";
import {
  normalizeSpanIO,
  type NormalizedMessage,
} from "@langfuse/shared/src/utils/normalized-io";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import {
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/components/session/sessionIdleGap";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import { type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

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
  typeof value === "string"
    ? value
    : (JSON.stringify(value, undefined, 2) ?? String(value));

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

function TruncatedObservation({
  observation,
}: {
  observation: SessionObservation;
}) {
  return (
    <div className="flex flex-col gap-5">
      {hasPreviewValue(observation.input) ? (
        <SessionTimelineMessage
          isTruncated={observation.inputTruncated}
          message={{
            role: "user",
            source: "input",
            parts: [{ type: "text", text: toPreviewText(observation.input) }],
          }}
        />
      ) : null}
      {hasPreviewValue(observation.output) ? (
        <SessionTimelineMessage
          isTruncated={observation.outputTruncated}
          message={{
            role: "assistant",
            source: "output",
            parts: [{ type: "text", text: toPreviewText(observation.output) }],
          }}
        />
      ) : null}
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
  const [isToolExpanded, setIsToolExpanded] = useState(false);
  const isTool = observation.type === "TOOL";
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
  const hasNoConversationalContent =
    !isTool &&
    !isTruncated &&
    parsed.type === "loaded" &&
    visibleMessages.length === 0 &&
    (parsed.messages.length === 0 || hasTimelineContent);
  const hasObservationBody =
    (isTool && isToolExpanded) ||
    (!isTool &&
      (isTruncated ||
        parsed.type === "error" ||
        visibleMessages.length > 0 ||
        observation.metadataTruncated));

  return (
    <section
      data-session-observation-id={observation.id}
      className={cn(
        "flex scroll-mt-16 flex-col",
        isTool
          ? cn("py-1", isToolExpanded && "gap-4")
          : hasObservationBody
            ? "gap-4 py-2"
            : "py-1",
      )}
    >
      <div className="flex w-full min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenInTraceView}
          className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {renderFilterIcon(observation.type ?? "EVENT")}
          <span
            className="min-w-0 truncate text-xs font-normal group-hover:underline"
            title={observation.name ?? observation.id}
          >
            {observation.name ?? observation.id}
          </span>
        </button>
        {isTool ? (
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
            aria-expanded={isToolExpanded}
            aria-label={`${isToolExpanded ? "Collapse" : "Expand"} ${observation.name ?? observation.id}`}
            onClick={() => setIsToolExpanded((current) => !current)}
          >
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                !isToolExpanded && "-rotate-90",
              )}
              aria-hidden="true"
            />
          </button>
        ) : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {hasNoConversationalContent ? (
            <span
              className="bg-muted text-muted-foreground shrink-0 rounded-md p-1"
              aria-label="No conversational content"
              title="No conversational content"
            >
              <MessageSquareOff className="h-3 w-3" aria-hidden="true" />
            </span>
          ) : null}
          {observation.latency !== null && observation.type !== "EVENT" ? (
            <span className="text-muted-foreground font-mono text-[11px]">
              {formatIntervalSeconds(observation.latency)}
            </span>
          ) : null}
          <time className="text-muted-foreground font-mono text-[10px]">
            {observation.startTime.toLocaleTimeString()}
          </time>
        </span>
      </div>
      {isTool && isToolExpanded ? (
        <div className="border-border ml-3 flex min-w-0 flex-col gap-3 border-l py-1 pl-5">
          {hasPreviewValue(observation.input) ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Input{observation.inputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(observation.input)}
              </pre>
            </div>
          ) : null}
          {hasPreviewValue(observation.output) ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Output{observation.outputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(observation.output)}
              </pre>
            </div>
          ) : null}
          {!hasPreviewValue(observation.input) &&
          !hasPreviewValue(observation.output) ? (
            <span className="text-muted-foreground text-xs">
              No input or output
            </span>
          ) : null}
        </div>
      ) : !isTool ? (
        <div className="flex min-w-0 flex-col gap-5">
          {observation.metadataTruncated && !isTruncated ? (
            <p className="text-muted-foreground text-xs">
              Metadata was omitted because it is too large. Messages are parsed
              from input and output only.
            </p>
          ) : null}
          {isTruncated ? (
            <TruncatedObservation observation={observation} />
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function SessionConversationTimeline({
  trace,
  turnNumber,
  idleGapSeconds,
  state,
  showSystemPrompt,
  onOpenTrace,
  onOpenObservation,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  state: SessionConversationTimelineState;
  showSystemPrompt: boolean;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
}) {
  const showIdleGap =
    idleGapSeconds !== null && idleGapSeconds >= IDLE_GAP_THRESHOLD_SECONDS;

  return (
    <div className="px-4 pb-14 sm:px-6 lg:px-10">
      <div className="mb-6 flex items-center gap-4 pt-5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ph-no-capture shrink-0 font-mono text-xs transition-colors"
          onClick={onOpenTrace}
          title={`${trace.name ?? "Trace"} (${trace.id})`}
        >
          trace {turnNumber} · {trace.id}
        </button>
        <div className="border-border min-w-0 flex-1 border-t border-dashed" />
        {showIdleGap ? (
          <Badge
            variant="secondary"
            size="sm"
            className="shrink-0 font-mono font-normal"
          >
            +{formatIdleGap(idleGapSeconds)} idle
          </Badge>
        ) : null}
      </div>

      {state.type === "loading" ? (
        <div
          role="status"
          aria-label="Loading conversation"
          className="flex flex-col gap-1"
        >
          {[
            {
              nameWidth: "w-36",
              messages: [
                { alignment: "end", height: "h-16", width: "w-3/5" },
                { alignment: "start", height: "h-24", width: "w-4/5" },
              ],
            },
            { nameWidth: "w-24", messages: [] },
            {
              nameWidth: "w-44",
              messages: [
                { alignment: "start", height: "h-20", width: "w-2/3" },
              ],
            },
          ].map((observation, observationIndex) => (
            <div
              key={observationIndex}
              className={cn(
                "flex flex-col py-2",
                observation.messages.length > 0 && "gap-4",
              )}
            >
              <div className="flex w-full min-w-0 items-center gap-2">
                <Skeleton className="h-4 w-4 shrink-0 rounded-sm" />
                <Skeleton className={cn("h-3", observation.nameWidth)} />
                <span className="ml-auto flex shrink-0 items-center gap-2">
                  <Skeleton className="h-3 w-9" />
                  <Skeleton className="h-3 w-16" />
                </span>
              </div>
              {observation.messages.length > 0 ? (
                <div className="flex flex-col gap-5">
                  {observation.messages.map((message, messageIndex) => (
                    <div
                      key={messageIndex}
                      className={cn(
                        "flex w-full",
                        message.alignment === "end"
                          ? "justify-end"
                          : "justify-start",
                      )}
                    >
                      <Skeleton
                        className={cn(
                          "max-w-[min(85%,48rem)] rounded-2xl",
                          message.height,
                          message.width,
                        )}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : state.type === "error" ? (
        <div className="border-destructive/40 bg-destructive/5 text-foreground rounded-lg border p-4 text-xs">
          Failed to load observations.
        </div>
      ) : state.type === "empty" ? (
        <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-xs">
          {state.message}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
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
