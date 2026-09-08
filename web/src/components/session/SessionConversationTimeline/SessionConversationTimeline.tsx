import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  MessageSquareOff,
} from "lucide-react";
import { type ToolCallPart } from "@langfuse/shared/src/utils/normalized-io";

import { renderFilterIcon } from "@/src/components/ItemBadge";
import {
  prepareSessionTimelineObservations,
  type ParsedSessionTimelineObservation,
  type PreparedSessionTimelineObservation,
  type ProcessedSessionTimelineMessages,
} from "@/src/components/session/SessionConversationTimeline/fns/prepareSessionTimelineObservations";
import { SessionTimelineMessage } from "@/src/components/session/SessionTimelineMessage/SessionTimelineMessage";
import { type EventSessionTrace } from "@/src/components/session/sessionDetailPageTypes";
import {
  formatIdleGap,
  IDLE_GAP_THRESHOLD_SECONDS,
} from "@/src/components/session/sessionIdleGap";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";

type EventObservation = RouterOutputs["events"]["all"]["observations"][number];
type EventObservationIO = RouterOutputs["events"]["batchIO"][number];
export type SessionObservation = Omit<
  EventObservation,
  "input" | "output" | "metadata"
> &
  Pick<EventObservationIO, "input" | "output" | "metadata"> & {
    inputTruncated?: boolean;
    outputTruncated?: boolean;
    metadataTruncated?: boolean;
  };

export type SessionConversationTimelineState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty"; message: string }
  | {
      type: "loaded";
      observations: readonly SessionObservation[];
    };

export type PreparedSessionConversationTimelineState =
  | Exclude<SessionConversationTimelineState, { type: "loaded" }>
  | {
      type: "loaded";
      observations: readonly PreparedSessionTimelineObservation<SessionObservation>[];
    };

const toPreviewText = (value: unknown) =>
  typeof value === "string"
    ? value
    : (JSON.stringify(value, undefined, 2) ?? String(value));

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

function SessionTimelineRailEnd() {
  return (
    <>
      <span
        className="bg-background pointer-events-none absolute top-1/2 -bottom-2 left-[-15px] w-px"
        aria-hidden="true"
      />
      <span
        data-session-observation-rail-end
        className="bg-border pointer-events-none absolute top-1/2 left-[-18px] h-1.5 w-1.5 -translate-y-1/2 rounded-full"
        aria-hidden="true"
      />
    </>
  );
}

const NESTED_OBSERVATION_TYPE_ORDER = ["GENERATION", "TOOL"];

const formatNestedObservationCounts = (
  counts: Readonly<Record<string, number>>,
) => {
  const labels = Object.entries(counts)
    .filter(([, count]) => count > 0)
    .sort(([left], [right]) => {
      const leftIndex = NESTED_OBSERVATION_TYPE_ORDER.indexOf(left);
      const rightIndex = NESTED_OBSERVATION_TYPE_ORDER.indexOf(right);
      if (leftIndex !== -1 && rightIndex !== -1) return leftIndex - rightIndex;
      if (leftIndex !== -1) return -1;
      if (rightIndex !== -1) return 1;
      return left.localeCompare(right);
    })
    .map(
      ([type, count]) =>
        `${count} ${type.toLowerCase()}${count === 1 ? "" : "s"}`,
    );

  if (labels.length < 2) return labels[0] ?? "nested observations";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
};

function TruncatedObservation({
  observation,
  phase,
}: {
  observation: SessionObservation;
  phase: "complete" | "start" | "end";
}) {
  return (
    <div className="flex flex-col gap-5">
      {phase !== "end" && hasPreviewValue(observation.input) ? (
        <div className="relative">
          <SessionTimelineMessage
            isTruncated={observation.inputTruncated}
            message={{
              role: "user",
              source: "input",
              parts: [{ type: "text", text: toPreviewText(observation.input) }],
            }}
          />
          {phase === "complete" && !hasPreviewValue(observation.output) ? (
            <SessionTimelineRailEnd />
          ) : null}
        </div>
      ) : null}
      {phase !== "start" && hasPreviewValue(observation.output) ? (
        <div className="relative">
          <SessionTimelineMessage
            isTruncated={observation.outputTruncated}
            message={{
              role: "assistant",
              source: "output",
              parts: [
                { type: "text", text: toPreviewText(observation.output) },
              ],
            }}
          />
          <SessionTimelineRailEnd />
        </div>
      ) : null}
    </div>
  );
}

function SessionTimelineToolRow({
  id,
  name,
  startTime,
  latency,
  input,
  output,
  inputTruncated,
  outputTruncated,
  onOpenInTraceView,
}: {
  id: string;
  name: string;
  startTime: Date;
  latency: number | null;
  input: unknown;
  output: unknown;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  onOpenInTraceView: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <section
      data-session-observation-id={id}
      className={cn("flex scroll-mt-16 flex-col py-1", isExpanded && "gap-4")}
    >
      <div className="flex w-full min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenInTraceView}
          className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          {renderFilterIcon("TOOL")}
          <span
            className="min-w-0 truncate text-xs font-normal group-hover:underline"
            title={name}
          >
            {name}
          </span>
        </button>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground shrink-0 rounded-sm p-0.5 transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${name}`}
          onClick={() => setIsExpanded((current) => !current)}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              !isExpanded && "-rotate-90",
            )}
            aria-hidden="true"
          />
        </button>
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {latency !== null ? (
            <span className="text-muted-foreground font-mono text-[11px]">
              {formatIntervalSeconds(latency)}
            </span>
          ) : null}
          <time className="text-muted-foreground font-mono text-[10px]">
            {startTime.toLocaleTimeString()}
          </time>
        </span>
      </div>
      {isExpanded ? (
        <div className="border-border ml-3 flex min-w-0 flex-col gap-3 border-l py-1 pl-5">
          {hasPreviewValue(input) ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Input{inputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(input)}
              </pre>
            </div>
          ) : null}
          {hasPreviewValue(output) ? (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Output{outputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(output)}
              </pre>
            </div>
          ) : null}
          {!hasPreviewValue(input) && !hasPreviewValue(output) ? (
            <span className="text-muted-foreground text-xs">
              No input or output
            </span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function SessionTimelineConversationObservation({
  observation,
  parsed,
  processedMessages,
  phase,
  onOpenInTraceView,
}: {
  observation: SessionObservation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: ProcessedSessionTimelineMessages;
  phase: "complete" | "start" | "end";
  onOpenInTraceView: () => void;
}) {
  const isTruncated = observation.inputTruncated || observation.outputTruncated;
  const visibleMessages = processedMessages.messages;
  const hasTimelineContent =
    parsed?.type === "loaded" &&
    parsed.messages.some((message) =>
      message.parts.some((part) => part.type !== "tool-result"),
    );
  const hasNoConversationalContent =
    !isTruncated &&
    parsed?.type === "loaded" &&
    visibleMessages.length === 0 &&
    (parsed.messages.length === 0 || hasTimelineContent);
  const hasObservationBody =
    isTruncated ||
    parsed?.type === "error" ||
    visibleMessages.length > 0 ||
    observation.metadataTruncated;
  const showHeader = phase !== "end";
  const showNonMessageBody = phase !== "end";

  return (
    <>
      <section
        data-session-observation-id={showHeader ? observation.id : undefined}
        className={cn(
          "flex scroll-mt-16 flex-col",
          hasObservationBody ? "gap-4 py-2" : "py-1",
        )}
      >
        {showHeader ? (
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
            <span className="ml-auto flex shrink-0 items-center gap-2">
              {hasNoConversationalContent ? (
                <span
                  className="bg-muted text-muted-foreground shrink-0 rounded-md p-1"
                  role="img"
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
        ) : null}
        <div className="flex min-w-0 flex-col gap-5 pl-[22px]">
          {showNonMessageBody &&
          observation.metadataTruncated &&
          !isTruncated ? (
            <p className="text-muted-foreground text-xs">
              Metadata was omitted because it is too large. Messages are parsed
              from input and output only.
            </p>
          ) : null}
          {isTruncated ? (
            <TruncatedObservation observation={observation} phase={phase} />
          ) : showNonMessageBody && parsed?.type === "error" ? (
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
              <div
                key={`${message.id ?? `${message.source}-${message.role}`}-${index}`}
                className="relative"
              >
                <SessionTimelineMessage message={message} />
                {phase !== "start" && index === visibleMessages.length - 1 ? (
                  <SessionTimelineRailEnd />
                ) : null}
              </div>
            ))
          ) : null}
        </div>
      </section>
      {processedMessages.rolledUpToolCalls.map((toolCall, index) => (
        <RolledUpToolRow
          key={toolCall.toolCallId ?? `${toolCall.toolName}-${index}`}
          observation={observation}
          toolCall={toolCall}
          index={index}
          onOpenInTraceView={onOpenInTraceView}
        />
      ))}
    </>
  );
}

function RolledUpToolRow({
  observation,
  toolCall,
  index,
  onOpenInTraceView,
}: {
  observation: SessionObservation;
  toolCall: ToolCallPart;
  index: number;
  onOpenInTraceView: () => void;
}) {
  return (
    <SessionTimelineToolRow
      id={`${observation.id}-tool-call-${toolCall.toolCallId ?? index}`}
      name={toolCall.toolName}
      startTime={observation.startTime}
      latency={null}
      input={toolCall.input}
      output={undefined}
      onOpenInTraceView={onOpenInTraceView}
    />
  );
}

function SessionTimelineObservation({
  observation,
  parsed,
  processedMessages,
  phase,
  onOpenInTraceView,
}: {
  observation: SessionObservation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: ProcessedSessionTimelineMessages;
  phase: "complete" | "start" | "end";
  onOpenInTraceView: () => void;
}) {
  if (observation.type === "TOOL") {
    return (
      <SessionTimelineToolRow
        id={observation.id}
        name={observation.name ?? observation.id}
        startTime={observation.startTime}
        latency={observation.latency}
        input={observation.input}
        output={observation.output}
        inputTruncated={observation.inputTruncated}
        outputTruncated={observation.outputTruncated}
        onOpenInTraceView={onOpenInTraceView}
      />
    );
  }

  return (
    <SessionTimelineConversationObservation
      observation={observation}
      parsed={parsed}
      processedMessages={processedMessages}
      phase={phase}
      onOpenInTraceView={onOpenInTraceView}
    />
  );
}

function LoadedSessionConversationTimeline({
  observations,
  onOpenObservation,
}: {
  observations: readonly PreparedSessionTimelineObservation<SessionObservation>[];
  onOpenObservation: (observationId: string) => void;
}) {
  const [collapsedObservationIds, setCollapsedObservationIds] = useState(
    () =>
      new Set(
        observations.flatMap(
          ({ observation, phase, ancestorObservationIds }) =>
            phase === "start" && ancestorObservationIds.length === 0
              ? [observation.id]
              : [],
        ),
      ),
  );

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1">
        {observations.map(
          ({
            observation,
            parsed,
            processedMessages,
            phase,
            ancestorObservationIds,
            nestedObservationCounts,
          }) => {
            if (
              ancestorObservationIds.some((ancestorId) =>
                collapsedObservationIds.has(ancestorId),
              )
            ) {
              return null;
            }

            const isToolStart =
              observation.type === "TOOL" && phase === "start";
            const isEmptyEnd =
              phase === "end" &&
              processedMessages.messages.length === 0 &&
              processedMessages.rolledUpToolCalls.length === 0 &&
              !(
                observation.outputTruncated &&
                hasPreviewValue(observation.output)
              );
            const hasNestedObservations =
              Object.keys(nestedObservationCounts).length > 0;
            const isCollapsed = collapsedObservationIds.has(observation.id);
            const hasChatBubbles =
              observation.type !== "TOOL" &&
              (observation.inputTruncated || observation.outputTruncated
                ? (phase !== "end" && hasPreviewValue(observation.input)) ||
                  (phase !== "start" && hasPreviewValue(observation.output))
                : processedMessages.messages.length > 0);

            const depth = ancestorObservationIds.length;

            return (
              <div
                key={`${observation.id}-${phase}`}
                data-session-observation-depth={depth}
                className="relative"
                style={{ paddingLeft: `${depth * 24}px` }}
              >
                {ancestorObservationIds.map((ancestorId, ancestorDepth) => (
                  <span
                    key={ancestorId}
                    data-session-observation-rail-depth={ancestorDepth}
                    className="bg-border pointer-events-none absolute -top-1 -bottom-1 w-px"
                    style={{ left: `${ancestorDepth * 24 + 7}px` }}
                    aria-hidden="true"
                  />
                ))}
                {(phase === "start" && !isToolStart) ||
                (phase === "complete" && hasChatBubbles) ? (
                  <span
                    data-session-observation-rail-depth={depth}
                    className="bg-border pointer-events-none absolute top-[22px] -bottom-1 w-px"
                    style={{ left: `${depth * 24 + 7}px` }}
                    aria-hidden="true"
                  />
                ) : null}
                {phase === "end" ? (
                  <span
                    data-session-observation-rail-depth={depth}
                    className="bg-border pointer-events-none absolute -top-1 bottom-0 w-px"
                    style={{ left: `${depth * 24 + 7}px` }}
                    aria-hidden="true"
                  />
                ) : null}
                {!isToolStart && !isEmptyEnd ? (
                  <SessionTimelineObservation
                    observation={observation}
                    parsed={parsed}
                    processedMessages={processedMessages}
                    phase={phase}
                    onOpenInTraceView={() => onOpenObservation(observation.id)}
                  />
                ) : null}
                {phase === "start" && hasNestedObservations ? (
                  <div className={cn("relative", isCollapsed ? "h-7" : "h-0")}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-xs"
                          className={cn(
                            "bg-background text-muted-foreground hover:text-foreground absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full",
                            isCollapsed ? "top-1/2" : "top-[16px]",
                          )}
                          style={{ left: "7.5px" }}
                          aria-expanded={!isCollapsed}
                          aria-label={`${isCollapsed ? "Show" : "Hide"} ${formatNestedObservationCounts(nestedObservationCounts)}`}
                          onClick={() =>
                            setCollapsedObservationIds((current) => {
                              const next = new Set(current);
                              if (isCollapsed) next.delete(observation.id);
                              else next.add(observation.id);
                              return next;
                            })
                          }
                        >
                          {isCollapsed ? (
                            <ChevronsUpDown
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          ) : (
                            <ChevronsDownUp
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">
                        {isCollapsed ? "Show" : "Hide"}{" "}
                        {formatNestedObservationCounts(nestedObservationCounts)}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                ) : null}
              </div>
            );
          },
        )}
      </div>
    </TooltipProvider>
  );
}

export function SessionConversationTimeline({
  trace,
  turnNumber,
  idleGapSeconds,
  state,
  onOpenTrace,
  onOpenObservation,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  state: SessionConversationTimelineState;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
}) {
  const preparedState = useMemo<PreparedSessionConversationTimelineState>(
    () =>
      state.type === "loaded"
        ? {
            type: "loaded",
            observations: prepareSessionTimelineObservations(
              state.observations,
            ),
          }
        : state,
    [state],
  );

  return (
    <PreparedSessionConversationTimeline
      trace={trace}
      turnNumber={turnNumber}
      idleGapSeconds={idleGapSeconds}
      state={preparedState}
      onOpenTrace={onOpenTrace}
      onOpenObservation={onOpenObservation}
    />
  );
}

export function PreparedSessionConversationTimeline({
  trace,
  turnNumber,
  idleGapSeconds,
  state,
  onOpenTrace,
  onOpenObservation,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  idleGapSeconds: number | null;
  state: PreparedSessionConversationTimelineState;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
}) {
  const showIdleGap =
    idleGapSeconds !== null && idleGapSeconds >= IDLE_GAP_THRESHOLD_SECONDS;

  return (
    <div
      className="px-4 pb-14 sm:px-6 lg:px-10"
      data-session-trace-id={trace.id}
    >
      <div className="mb-6 flex items-center gap-4 pt-5">
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground ph-no-capture flex shrink-0 items-center gap-2 font-mono text-xs transition-colors"
          onClick={onOpenTrace}
          title={`${trace.name ?? "Trace"} (${trace.id})`}
        >
          <span className="border-border bg-tertiary text-foreground flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border font-mono text-[10px]">
            {turnNumber}
          </span>
          <span>trace · {trace.id}</span>
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
        <LoadedSessionConversationTimeline
          key={state.observations
            .map(({ observation, phase }) => `${observation.id}:${phase}`)
            .join("\0")}
          observations={state.observations}
          onOpenObservation={onOpenObservation}
        />
      )}
    </div>
  );
}
