import { useState } from "react";
import {
  ChevronDown,
  ChevronsUpDown,
  CircleAlert,
  FileWarning,
  Info,
  MessageSquareOff,
  MoreHorizontal,
  TriangleAlert,
} from "lucide-react";
import { renderFilterIcon } from "@/src/components/ItemBadge";
import {
  type ParsedSessionTimelineObservation,
  type PreparedSessionTimelineItem,
  type PreparedSessionTimelineMessages,
} from "@/src/features/sessions/SessionConversationTimeline/fns/prepareSessionTimelineObservations";
import { SessionTimelineContentMessage } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "@/src/features/sessions/SessionConversationTimeline/components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { type RouterOutputs } from "@/src/utils/api";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { cn } from "@/src/utils/tailwind";
import { getLevelColors } from "@/src/components/level-colors";

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

type SessionConversationTimelineTraceState =
  | { type: "loading" }
  | { type: "error" }
  | { type: "empty"; message: string }
  | {
      type: "loaded";
      observations: readonly SessionObservation[];
    };

export type PreparedSessionConversationTimelineTraceState =
  | Exclude<SessionConversationTimelineTraceState, { type: "loaded" }>
  | {
      type: "loaded";
      observations: readonly PreparedSessionTimelineItem<SessionObservation>[];
    };

export type SessionObservationActions = {
  onFilterByName: (name: string, operator: "any of" | "none of") => void;
};

function SessionTimelineStatusIndicator({
  observation,
}: {
  observation: SessionObservation;
}) {
  const Icon =
    observation.level === "ERROR"
      ? CircleAlert
      : observation.level === "WARNING"
        ? TriangleAlert
        : Info;
  const colors = getLevelColors(observation.level);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md",
            colors.bg,
            colors.text,
          )}
          role="img"
          aria-label={`${observation.level}: ${observation.statusMessage}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap">
        {observation.statusMessage}
      </TooltipContent>
    </Tooltip>
  );
}

const toPreviewText = (value: unknown) =>
  typeof value === "string"
    ? value
    : (JSON.stringify(value, undefined, 2) ?? String(value));

const hasPreviewValue = (value: unknown) =>
  value !== null && value !== undefined && value !== "";

function SessionObservationActionsMenuContent({
  observation,
  actions,
}: {
  observation: SessionObservation;
  actions: SessionObservationActions;
}) {
  return (
    <DropdownMenuContent align="end" sideOffset={0}>
      {observation.name ? (
        <DropdownMenuItem
          onSelect={() =>
            actions.onFilterByName(observation.name as string, "any of")
          }
        >
          Only show observations with the same name
        </DropdownMenuItem>
      ) : null}
      {observation.name ? (
        <DropdownMenuItem
          onSelect={() =>
            actions.onFilterByName(observation.name as string, "none of")
          }
        >
          Exclude observations with the same name
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuContent>
  );
}

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

function getNestedObservationSummary(
  observations: readonly PreparedSessionTimelineItem<SessionObservation>[],
) {
  const seenObservationIds = new Set<string>();
  const toolNames = new Set<string>();
  const counts: Record<string, number> = {};

  for (const item of observations) {
    if (item.type === "tool") {
      counts.TOOL = (counts.TOOL ?? 0) + 1;
      toolNames.add(item.toolCall.toolName);
      continue;
    }

    const observationKey = `${item.observation.traceId ?? ""}:${item.observation.id}`;
    if (seenObservationIds.has(observationKey)) continue;

    seenObservationIds.add(observationKey);
    const type = item.observation.type ?? "EVENT";
    counts[type] = (counts[type] ?? 0) + 1;
    if (type === "TOOL" && item.observation.name) {
      toolNames.add(item.observation.name);
    }
  }

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
    .map(([type, count]) => {
      if (type !== "TOOL") {
        return `${count} ${type.toLowerCase()}${count === 1 ? "" : "s"}`;
      }

      const names = count <= 3 ? Array.from(toolNames) : [];
      const namesSummary =
        names.length < 2
          ? (names[0] ?? "")
          : names.length === 2
            ? `${names[0]} and ${names[1]}`
            : `${names.slice(0, -1).join(", ")}, and ${names.at(-1)}`;
      if (names.length === count) return `tools: ${namesSummary}`;

      return `${count} tool${count === 1 ? "" : "s"}${namesSummary ? ` using ${namesSummary}` : ""}`;
    });

  if (labels.length < 2) return labels[0] ?? "nested observations";
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels.at(-1)}`;
}

function TruncatedObservation({
  observation,
  phase,
  showRailEnd,
}: {
  observation: SessionObservation;
  phase: "complete" | "start" | "end";
  showRailEnd: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {phase !== "end" && hasPreviewValue(observation.input) ? (
        <div className="relative">
          <SessionTimelineContentMessage
            role="user"
            parts={[{ type: "text", text: toPreviewText(observation.input) }]}
            senderName={undefined}
          />
          {showRailEnd &&
          phase === "complete" &&
          !hasPreviewValue(observation.output) ? (
            <SessionTimelineRailEnd />
          ) : null}
        </div>
      ) : null}
      {phase !== "start" && hasPreviewValue(observation.output) ? (
        <div className="relative">
          <SessionTimelineContentMessage
            role="assistant"
            parts={[{ type: "text", text: toPreviewText(observation.output) }]}
            senderName={undefined}
          />
          {showRailEnd ? <SessionTimelineRailEnd /> : null}
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
  isExpanded,
  showRailEnd,
  onExpandedChange,
  onOpenInTraceView,
  observation,
  actions,
}: {
  id: string;
  name: string;
  startTime: Date;
  latency: number | null;
  input: unknown;
  output: unknown;
  inputTruncated?: boolean;
  outputTruncated?: boolean;
  isExpanded: boolean;
  showRailEnd: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
  onOpenInTraceView: () => void;
  observation?: SessionObservation;
  actions?: SessionObservationActions;
}) {
  return (
    <section
      data-session-observation-id={id}
      className={cn("flex scroll-mt-16 flex-col py-1", isExpanded && "gap-2")}
    >
      <div className="flex w-full min-w-0 items-center gap-0.5">
        <button
          type="button"
          onClick={onOpenInTraceView}
          className="group flex min-w-0 items-center gap-2 rounded-sm text-left focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        >
          <span className="bg-background relative z-[1] flex shrink-0 rounded-full">
            {renderFilterIcon("TOOL")}
          </span>
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
          onClick={() => onExpandedChange(!isExpanded)}
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
          {observation?.statusMessage && observation.level !== "DEFAULT" ? (
            <SessionTimelineStatusIndicator observation={observation} />
          ) : null}
          {latency !== null ? (
            <span className="text-muted-foreground font-mono text-[11px]">
              {formatIntervalSeconds(latency)}
            </span>
          ) : null}
          <time className="text-muted-foreground font-mono text-[10px]">
            {startTime.toLocaleTimeString()}
          </time>
          {observation?.name && actions ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  className="text-muted-foreground hover:text-foreground shrink-0"
                  aria-label={`Actions for ${observation.name ?? observation.id}`}
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <SessionObservationActionsMenuContent
                observation={observation}
                actions={actions}
              />
            </DropdownMenu>
          ) : !observation ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="text-muted-foreground/50 flex h-6 w-6 shrink-0 items-center justify-center"
                  role="img"
                  aria-label="Actions available on parent observation"
                >
                  <MoreHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
              </TooltipTrigger>
              <TooltipContent side="top">
                Actions are available on the parent observation
              </TooltipContent>
            </Tooltip>
          ) : null}
        </span>
      </div>
      {isExpanded ? (
        <div className="flex min-w-0 flex-col gap-3 pl-[22px]">
          {hasPreviewValue(input) ? (
            <div className="relative flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Input{inputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(input)}
              </pre>
              {!hasPreviewValue(output) && showRailEnd ? (
                <SessionTimelineRailEnd />
              ) : null}
            </div>
          ) : null}
          {hasPreviewValue(output) ? (
            <div className="relative flex min-w-0 flex-col gap-1">
              <span className="text-muted-foreground font-mono text-[10px] font-bold uppercase">
                Output{outputTruncated ? " (truncated)" : ""}
              </span>
              <pre className="bg-muted/30 max-h-48 overflow-auto rounded-md border p-3 font-mono text-xs break-all whitespace-pre-wrap">
                {toPreviewText(output)}
              </pre>
              {showRailEnd ? <SessionTimelineRailEnd /> : null}
            </div>
          ) : null}
          {!hasPreviewValue(input) && !hasPreviewValue(output) ? (
            <div className="relative">
              <span className="text-muted-foreground text-xs">
                No input or output
              </span>
              {showRailEnd ? <SessionTimelineRailEnd /> : null}
            </div>
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
  showRailEnd,
  onOpenInTraceView,
  actions,
}: {
  observation: SessionObservation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: PreparedSessionTimelineMessages;
  phase: "complete" | "start" | "end";
  showRailEnd: boolean;
  onOpenInTraceView: () => void;
  actions?: SessionObservationActions;
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
    isTruncated || parsed?.type === "error" || visibleMessages.length > 0;
  const showHeader = phase !== "end";
  const showNonMessageBody = phase !== "end";

  return (
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
            <span className="bg-background relative z-[1] flex shrink-0 rounded-full">
              {renderFilterIcon(observation.type ?? "EVENT")}
            </span>
            <span
              className="min-w-0 truncate text-xs font-normal group-hover:underline"
              title={observation.name ?? observation.id}
            >
              {observation.name ?? observation.id}
            </span>
          </button>
          <span className="ml-auto flex shrink-0 items-center gap-2">
            {observation.statusMessage && observation.level !== "DEFAULT" ? (
              <SessionTimelineStatusIndicator observation={observation} />
            ) : null}
            {isTruncated ? (
              <span
                className="bg-muted text-muted-foreground shrink-0 rounded-md p-1"
                role="img"
                aria-label="Content truncated"
                title="Content truncated"
              >
                <FileWarning className="h-3 w-3" aria-hidden="true" />
              </span>
            ) : null}
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
            {observation.metadataTruncated ? (
              <span
                className="bg-muted text-muted-foreground shrink-0 rounded-md p-1"
                role="img"
                aria-label="Metadata omitted because it is too large"
                title="Metadata omitted because it is too large"
              >
                <FileWarning className="h-3 w-3" aria-hidden="true" />
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
            {actions ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:text-foreground shrink-0"
                    aria-label={`Actions for ${observation.name ?? observation.id}`}
                  >
                    <MoreHorizontal
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                  </Button>
                </DropdownMenuTrigger>
                <SessionObservationActionsMenuContent
                  observation={observation}
                  actions={actions}
                />
              </DropdownMenu>
            ) : null}
          </span>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-5 pl-[22px]">
        {isTruncated ? (
          <TruncatedObservation
            observation={observation}
            phase={phase}
            showRailEnd={showRailEnd}
          />
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
          visibleMessages.map((message, index) => {
            const messageContent =
              message.role === "system" ? (
                <SessionTimelineSystemMessage
                  parts={message.parts}
                  senderName={message.senderName}
                />
              ) : (
                <SessionTimelineContentMessage
                  role={message.role}
                  parts={message.parts}
                  senderName={message.senderName}
                />
              );

            return (
              <div
                key={`${message.id ?? `${message.source}-${message.role}`}-${index}`}
                className="relative"
              >
                {messageContent}
                {showRailEnd &&
                phase !== "start" &&
                index === visibleMessages.length - 1 ? (
                  <SessionTimelineRailEnd />
                ) : null}
              </div>
            );
          })
        ) : null}
      </div>
    </section>
  );
}

function SessionTimelineObservation({
  observation,
  parsed,
  processedMessages,
  phase,
  isToolExpanded,
  showRailEnd,
  onToolExpandedChange,
  onOpenInTraceView,
  actions,
}: {
  observation: SessionObservation;
  parsed: ParsedSessionTimelineObservation | null;
  processedMessages: PreparedSessionTimelineMessages;
  phase: "complete" | "start" | "end";
  isToolExpanded: boolean;
  showRailEnd: boolean;
  onToolExpandedChange: (isExpanded: boolean) => void;
  onOpenInTraceView: () => void;
  actions?: SessionObservationActions;
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
        isExpanded={isToolExpanded}
        showRailEnd={showRailEnd}
        onExpandedChange={onToolExpandedChange}
        onOpenInTraceView={onOpenInTraceView}
        observation={observation}
        actions={actions}
      />
    );
  }

  return (
    <SessionTimelineConversationObservation
      observation={observation}
      parsed={parsed}
      processedMessages={processedMessages}
      phase={phase}
      showRailEnd={showRailEnd}
      onOpenInTraceView={onOpenInTraceView}
      actions={actions}
    />
  );
}

function LoadedSessionConversationTimeline({
  observations,
  onOpenObservation,
  observationActions,
  scrollTarget,
}: {
  observations: readonly PreparedSessionTimelineItem<SessionObservation>[];
  onOpenObservation: (observationId: string) => void;
  observationActions?: SessionObservationActions;
  scrollTarget: { observationId: string; requestId: number } | null;
}) {
  const [collapseState, setCollapseState] = useState(() => ({
    scrollRequestId: null as number | null,
    observationIds: new Set(
      observations.flatMap(({ observation, phase, ancestorObservationIds }) => {
        if (phase !== "start") return [];
        if (ancestorObservationIds.length > 0) return [observation.id];
        if (
          hasPreviewValue(observation.input) ||
          hasPreviewValue(observation.output)
        ) {
          return [observation.id];
        }
        return [];
      }),
    ),
  }));
  const [expandedToolObservationIds, setExpandedToolObservationIds] = useState(
    () => new Set<string>(),
  );
  const [hoveredSubsectionId, setHoveredSubsectionId] = useState<string | null>(
    null,
  );
  const [focusedSubsectionId, setFocusedSubsectionId] = useState<string | null>(
    null,
  );
  const highlightedSubsectionId = hoveredSubsectionId ?? focusedSubsectionId;
  let collapsedObservationIds = collapseState.observationIds;
  if (
    scrollTarget &&
    scrollTarget.requestId !== collapseState.scrollRequestId
  ) {
    const target = observations.find(
      ({ observation }) => observation.id === scrollTarget.observationId,
    );
    const observationIds = new Set(collapseState.observationIds);
    target?.ancestorObservationIds.forEach((id) => observationIds.delete(id));
    collapsedObservationIds = observationIds;
    setCollapseState({
      scrollRequestId: scrollTarget.requestId,
      observationIds,
    });
  }

  const visibleObservations = observations.filter((item) => {
    if (
      item.ancestorObservationIds.some((ancestorId) =>
        collapsedObservationIds.has(ancestorId),
      )
    ) {
      return false;
    }
    if (item.type === "tool") return true;
    if (item.observation.type === "TOOL" && item.phase === "start") {
      return Object.keys(item.nestedObservationCounts).length > 0;
    }
    if (item.phase !== "end") return true;
    if (item.processedMessages.messages.length > 0) return true;
    return Boolean(
      item.observation.outputTruncated &&
      hasPreviewValue(item.observation.output),
    );
  });

  return (
    <TooltipProvider>
      <div className="flex flex-col gap-1">
        {visibleObservations.map((item, index) => {
          const {
            observation,
            parsed,
            processedMessages,
            phase,
            ancestorObservationIds,
            nestedObservationCounts,
          } = item;
          const isToolStart =
            item.type === "observation" &&
            observation.type === "TOOL" &&
            phase === "start";
          const isEmptyEnd =
            item.type === "observation" &&
            phase === "end" &&
            processedMessages.messages.length === 0 &&
            !(
              observation.outputTruncated && hasPreviewValue(observation.output)
            );
          const hasNestedObservations =
            Object.keys(nestedObservationCounts).length > 0;
          const nestedObservationSummary = hasNestedObservations
            ? getNestedObservationSummary(
                observations.filter(({ ancestorObservationIds }) =>
                  ancestorObservationIds.includes(observation.id),
                ),
              )
            : "";
          const isCollapsed = collapsedObservationIds.has(observation.id);
          const itemId = item.type === "tool" ? item.id : observation.id;
          const isToolExpanded = expandedToolObservationIds.has(itemId);
          const hasChatBubbles =
            item.type === "observation" &&
            observation.type !== "TOOL" &&
            (observation.inputTruncated || observation.outputTruncated
              ? (phase !== "end" && hasPreviewValue(observation.input)) ||
                (phase !== "start" && hasPreviewValue(observation.output))
              : processedMessages.messages.length > 0);
          const moveCollapseControlUp = !isCollapsed && hasChatBubbles;
          const isHighlightedSubsection =
            highlightedSubsectionId === observation.id && phase === "start";
          const isHighlightedDescendant = highlightedSubsectionId
            ? ancestorObservationIds.includes(highlightedSubsectionId)
            : false;

          const depth = ancestorObservationIds.length;

          return (
            <div
              key={
                item.type === "tool" ? item.id : `${observation.id}-${phase}`
              }
              data-session-observation-depth={depth}
              className="relative"
            >
              {ancestorObservationIds.length > 0 ? (
                <span
                  data-session-observation-rail-depth={depth - 1}
                  className={cn(
                    "pointer-events-none absolute -top-1 -bottom-1 left-[7px] w-px transition-colors",
                    isHighlightedDescendant ? "bg-primary/60" : "bg-border",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {depth === 0 &&
              ((phase === "start" && !isToolStart) ||
                (phase === "complete" &&
                  (hasChatBubbles || isToolExpanded))) ? (
                <span
                  data-session-observation-rail-depth={depth}
                  className={cn(
                    "pointer-events-none absolute top-[22px] left-[7px] w-px transition-colors",
                    "bg-border",
                    phase === "start" ? "-bottom-1" : "bottom-0",
                  )}
                  aria-hidden="true"
                />
              ) : null}
              {depth === 0 && phase === "end" ? (
                <span
                  data-session-observation-rail-depth={depth}
                  className="bg-border pointer-events-none absolute -top-1 bottom-0 left-[7px] w-px"
                  aria-hidden="true"
                />
              ) : null}
              {item.type === "tool" ? (
                <SessionTimelineToolRow
                  id={item.id}
                  name={item.toolCall.toolName}
                  startTime={observation.startTime}
                  latency={null}
                  input={item.toolCall.input}
                  output={undefined}
                  isExpanded={isToolExpanded}
                  showRailEnd={false}
                  onExpandedChange={(isExpanded) =>
                    setExpandedToolObservationIds((current) => {
                      const next = new Set(current);
                      if (isExpanded) next.add(itemId);
                      else next.delete(itemId);
                      return next;
                    })
                  }
                  onOpenInTraceView={() => onOpenObservation(observation.id)}
                />
              ) : !isToolStart && !isEmptyEnd ? (
                <SessionTimelineObservation
                  observation={observation}
                  parsed={parsed}
                  processedMessages={processedMessages}
                  phase={phase}
                  isToolExpanded={isToolExpanded}
                  showRailEnd={
                    depth === 0 &&
                    (observation.type !== "TOOL" ||
                      index === visibleObservations.length - 1)
                  }
                  onToolExpandedChange={(isExpanded) =>
                    setExpandedToolObservationIds((current) => {
                      const next = new Set(current);
                      if (isExpanded) next.add(itemId);
                      else next.delete(itemId);
                      return next;
                    })
                  }
                  onOpenInTraceView={() => onOpenObservation(observation.id)}
                  actions={observationActions}
                />
              ) : null}
              {phase === "start" && hasNestedObservations ? (
                <div
                  className={cn(
                    "relative",
                    moveCollapseControlUp ? "h-0" : "h-7",
                  )}
                >
                  {isHighlightedSubsection ? (
                    <span
                      data-session-collapse-rail-highlight
                      className={cn(
                        "bg-primary/60 pointer-events-none absolute -bottom-1 left-[7px] w-px",
                        moveCollapseControlUp ? "-top-2" : "top-5",
                      )}
                      aria-hidden="true"
                    />
                  ) : null}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    className={cn(
                      "bg-background text-muted-foreground hover:text-foreground absolute z-[1] -translate-x-1/2 -translate-y-1/2 rounded-full",
                      moveCollapseControlUp ? "-top-2" : "top-5",
                    )}
                    style={{ left: "7.5px" }}
                    aria-expanded={!isCollapsed}
                    aria-label={`${isCollapsed ? "Show" : "Hide"} ${nestedObservationSummary}`}
                    onMouseEnter={() => {
                      if (!isCollapsed) {
                        setHoveredSubsectionId(observation.id);
                      }
                    }}
                    onMouseLeave={() => setHoveredSubsectionId(null)}
                    onFocus={() => {
                      if (!isCollapsed) {
                        setFocusedSubsectionId(observation.id);
                      }
                    }}
                    onBlur={() => setFocusedSubsectionId(null)}
                    onClick={() => {
                      setHoveredSubsectionId(null);
                      setFocusedSubsectionId(null);
                      setCollapseState((current) => {
                        const observationIds = new Set(current.observationIds);
                        if (isCollapsed) {
                          observationIds.delete(observation.id);
                        } else observationIds.add(observation.id);
                        return { ...current, observationIds };
                      });
                    }}
                  >
                    {isCollapsed ? (
                      <ChevronsUpDown className="h-3 w-3" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3" aria-hidden="true" />
                    )}
                  </Button>
                  {isCollapsed ? (
                    <span className="text-muted-foreground absolute top-5 left-5 -translate-y-1/2 text-xs">
                      {nestedObservationSummary}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export function SessionConversationTimelineTrace({
  trace,
  turnNumber,
  state,
  onOpenTrace,
  onOpenObservation,
  observationActions,
  scrollTarget,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  state: PreparedSessionConversationTimelineTraceState;
  onOpenTrace: () => void;
  onOpenObservation: (observationId: string) => void;
  observationActions?: SessionObservationActions;
  scrollTarget: { observationId: string; requestId: number } | null;
}) {
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
          observationActions={observationActions}
          scrollTarget={scrollTarget}
        />
      )}
    </div>
  );
}
