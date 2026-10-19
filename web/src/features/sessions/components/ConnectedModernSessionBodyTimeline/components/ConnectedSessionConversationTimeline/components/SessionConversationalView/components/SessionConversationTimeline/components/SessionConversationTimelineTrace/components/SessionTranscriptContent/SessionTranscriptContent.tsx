import { SessionTimelinePart } from "./components/SessionTimelinePart/SessionTimelinePart";
import { Codeblock } from "@/src/components/design-system/Codeblock/Codeblock";
import { assertUnreachable } from "@langfuse/shared";
import { useState, type ComponentProps, type ReactNode } from "react";
import { type TranscriptMessageGroup } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/groupTranscriptMessages";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";
import { SessionTimelineToolRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineToolRow/SessionTimelineToolRow";
import { Wrench } from "@langfuse/icons";
import { getSessionToolOutputPreview } from "./components/SessionTimelineToolRow/getSessionToolOutputPreview";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { SessionTimelineContentMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { groupConsecutiveTools } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/fns/groupConsecutiveTools";
import { cn } from "@/src/utils/tailwind";
import { SessionToolTooltip } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionToolTooltip/SessionToolTooltip";
import { getSessionToolStatus } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/fns/getSessionToolStatus";
import { SessionToolStatusCountBadge } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionToolStatusCountBadge/SessionToolStatusCountBadge";

export function SessionTranscriptContent({
  result,
  onOpenObservation,
  scrollTarget,
  threadIndex: selectedThreadIndex,
  variant,
  includeNestedThreads = false,
}: {
  includeNestedThreads?: boolean;
  variant?: ComponentProps<typeof SessionTimelineContentMessage>["variant"];
  threadIndex?: number;
  result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
  onOpenObservation?: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  const rows = getSessionTranscriptRows(
    result.transcript,
    includeNestedThreads,
  ).filter(
    ({ threadIndex }) =>
      selectedThreadIndex === undefined || threadIndex === selectedThreadIndex,
  );
  const { visibleThreads } = getSessionTranscriptThreads(
    result.transcript,
    includeNestedThreads,
  );
  return (
    <div className="ph-no-capture space-y-4">
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No messages.</p>
      )}
      {visibleThreads
        .filter(
          ({ threadIndex }) =>
            selectedThreadIndex === undefined ||
            threadIndex === selectedThreadIndex,
        )
        .map(({ threadIndex }) => (
          <div key={threadIndex}>
            {selectedThreadIndex === undefined && visibleThreads.length > 1 && (
              <h3 className="text-muted-foreground mb-4 text-xs font-bold">
                Thread {threadIndex + 1}
              </h3>
            )}
            <SessionTranscriptThread
              variant={variant}
              rows={rows.filter((row) => row.threadIndex === threadIndex)}
              onOpenObservation={onOpenObservation}
              scrollTarget={scrollTarget}
            />
          </div>
        ))}
    </div>
  );
}

type DisplayMessage = NormalizedMessage & {
  timing: { startTime: Date; endTime: Date | null } | null;
  observationId: string | null;
  level?: NonNullable<
    Extract<SessionTraceTranscriptState, { state: "loaded" }>["transcript"]
  >["threads"][number]["currentTurn"]["messages"][number]["level"];
  statusMessage?: string | null;
};

function SessionTranscriptThread({
  rows,
  variant,
  onOpenObservation,
  scrollTarget,
}: {
  rows: ReturnType<typeof getSessionTranscriptRows>;
  variant?: ComponentProps<typeof SessionTimelineContentMessage>["variant"];
  onOpenObservation?: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  const groups = groupConsecutiveTools(rows, {
    minGroupSize: 2,
    isTool: ({ row }) => row.type === "tool",
    getBoundary: ({ threadIndex }) => threadIndex,
    getToolName: ({ row }) =>
      row.type === "tool"
        ? (row.call?.toolName ?? row.result?.toolName)
        : undefined,
    summaryBudget: 72,
  });
  const displayGroups = groups.map((group) => {
    if (group.type === "tools") return { group, isCompact: true };
    const { row } = group.row;
    if (row.type === "tool" || row.message.role === "system") {
      return { group, isCompact: true };
    }
    return {
      group,
      isCompact: row.message.parts.every((part) => part.type === "reasoning"),
    };
  });
  return displayGroups.map(({ group, isCompact }, index) => (
    <div
      key={group.type === "tools" ? group.rows[0]!.id : group.row.id}
      data-session-compact-row={isCompact ? "" : undefined}
      data-session-tool-group-id={
        group.type === "tools" ? group.rows[0]!.id : undefined
      }
      className={cn(
        index > 0 &&
          (() => {
            const previousIsCompact = displayGroups[index - 1]!.isCompact;
            if (isCompact && previousIsCompact) return "mt-1";
            if (!isCompact && !previousIsCompact) return "mt-4";
            return "mt-6";
          })(),
      )}
    >
      {group.type === "tools" ? (
        <SessionTranscriptToolGroup
          variant={variant}
          summary={group.summary}
          title={group.title}
          rows={group.rows}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
        />
      ) : (
        <SessionTranscriptRow
          variant={variant}
          item={group.row}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
        />
      )}
    </div>
  ));
}

function SessionTranscriptRow({
  item,
  variant,
  onOpenObservation,
  scrollTarget,
}: {
  item: ReturnType<typeof getSessionTranscriptRows>[number];
} & Omit<ComponentProps<typeof SessionTranscriptThread>, "rows">) {
  const { row, id } = item;
  const scrollRequestId = (
    scrollTarget?.rowId
      ? scrollTarget.rowId === id
      : scrollTarget?.observationId === row.message.observationId
  )
    ? scrollTarget?.requestId
    : undefined;
  const timing = row.message.timing;
  const isTool = row.type === "tool";
  const isSystem = row.message.role === "system";
  const metadata = (isTool || isSystem) &&
    (timing || row.message.observationId) && (
      <div className="text-muted-foreground flex items-center gap-3 font-mono text-xs opacity-0 group-hover/collapsible-row:opacity-100 group-has-[:focus-visible]/collapsible-row:opacity-100 group-data-[expanded=true]/collapsible-row:opacity-100">
        {row.message.observationId && onOpenObservation && (
          <button
            type="button"
            className="hover:text-foreground hover:underline"
            onClick={() => onOpenObservation(row.message.observationId!)}
          >
            Open observation
          </button>
        )}
        {isTool && timing && timing.endTime !== null && (
          <span>
            {formatIntervalSeconds(
              (timing.endTime.getTime() - timing.startTime.getTime()) / 1000,
            )}
          </span>
        )}
        {timing && (isTool || isSystem) && (
          <time dateTime={timing.startTime.toISOString()}>
            {timing.startTime.toLocaleTimeString()}
          </time>
        )}
      </div>
    );
  return (
    <div
      key={id}
      className="group space-y-1"
      data-session-tool-row={isTool ? "" : undefined}
      data-session-system-row={isSystem ? "" : undefined}
      data-session-message-row={!isTool && !isSystem ? "" : undefined}
      data-session-observation-id={row.message.observationId ?? undefined}
      data-session-transcript-row-id={id}
      data-scroll-request-id={scrollRequestId}
    >
      {row.type === "tool" ? (
        <SessionTranscriptTool row={row} trailingContent={metadata} />
      ) : (
        <SessionTranscriptMessage
          variant={variant}
          expandRequestId={scrollRequestId}
          message={row.message}
          trailingContent={isSystem ? metadata : null}
          onOpenObservation={onOpenObservation}
        />
      )}
    </div>
  );
}

function SessionTranscriptToolGroup({
  summary,
  title,
  rows,
  ...props
}: {
  summary: string;
  title: string;
} & ComponentProps<typeof SessionTranscriptThread>) {
  const [expansion, setExpansion] = useState<{
    isExpanded: boolean;
    requestId: number | undefined;
  }>({ isExpanded: false, requestId: undefined });
  const containsTarget = rows.some(({ id, row }) =>
    props.scrollTarget?.rowId
      ? props.scrollTarget.rowId === id
      : props.scrollTarget?.observationId === row.message.observationId,
  );
  const isOpen =
    expansion.isExpanded ||
    (containsTarget && props.scrollTarget?.requestId !== expansion.requestId);
  if (rows.length < 4) {
    return (
      <div className="space-y-1">
        {rows.map((item) => (
          <SessionTranscriptRow key={item.id} {...props} item={item} />
        ))}
      </div>
    );
  }
  const errors: Array<
    Extract<
      ComponentProps<typeof SessionToolTooltip>["content"],
      { type: "group" }
    >["errors"][number]
  > = [];
  const warnings: typeof errors = [];
  for (const { row } of rows) {
    if (row.type !== "tool") continue;
    const name = row.call?.toolName ?? row.result?.toolName ?? "Tool";
    const status = getSessionToolStatus({
      level: row.message.level,
      statusMessage: row.message.statusMessage,
      isError: row.result?.isError,
    });
    if (status.level === "ERROR") {
      errors.push({
        name,
        message: status.statusMessage || "Tool failed",
      });
    } else if (status.level === "WARNING") {
      warnings.push({
        name,
        message: status.statusMessage || "Tool reported a warning",
      });
    }
  }
  return (
    <SessionTimelineCollapsibleRow
      label={summary}
      labelTitle={title}
      showHoverDivider={false}
      labelActionName={`${isOpen ? "Hide" : "Show"} tools: ${title}`}
      icon={<Wrench size="base" __rawClassName="text-observation-tool" />}
      isExpanded={isOpen}
      onExpandedChange={(isExpanded) =>
        setExpansion({
          isExpanded,
          requestId: props.scrollTarget?.requestId,
        })
      }
      trailingContent={[
        {
          tools: errors,
          label: "error" as const,
        },
        {
          tools: warnings,
          label: "warning" as const,
        },
      ].map(({ tools, label }) => {
        if (tools.length === 0) return null;
        const summary = `${tools.length} ${label}${tools.length === 1 ? "" : "s"}`;
        return (
          <SessionToolTooltip
            key={label}
            variant="timeline"
            content={{
              type: "group",
              title,
              errors: label === "error" ? tools : [],
              warnings: label === "warning" ? tools : [],
            }}
          >
            {({ getTriggerProps }) => (
              <SessionToolStatusCountBadge
                {...getTriggerProps()}
                tabIndex={0}
                aria-label={`Tool group: ${summary}`}
                count={tools.length}
                severity={label}
                variant="timeline"
              />
            )}
          </SessionToolTooltip>
        );
      })}
    >
      <div className="space-y-1">
        {rows.map((item) => (
          <SessionTranscriptRow key={item.id} {...props} item={item} />
        ))}
      </div>
    </SessionTimelineCollapsibleRow>
  );
}

function SessionTranscriptTool({
  row,
  trailingContent,
}: {
  row: Extract<TranscriptMessageGroup<DisplayMessage>, { type: "tool" }>;
  trailingContent: ReactNode;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const preview = row.result
    ? getSessionToolOutputPreview(row.result.output)
    : undefined;
  const status = getSessionToolStatus({
    level: row.message.level,
    statusMessage: row.message.statusMessage,
    isError: row.result?.isError,
  });
  return (
    <SessionTimelineToolRow
      name={row.call?.toolName ?? row.result?.toolName ?? "Tool"}
      input={row.call?.input}
      output={preview?.value}
      outputContent={
        row.result?.output.type === "content" &&
        row.result.output.value.length > 0
          ? row.result.output.value.map((part, index) => {
              if (part.type === "file") {
                return (
                  <SessionTimelinePart
                    key={index}
                    part={part}
                    mediaVariant="tool-output"
                  />
                );
              }
              const value = (() => {
                if (part.type === "text") return part.text;
                if (part.type === "reasoning") return part.content;
                if (part.type === "data" || part.type === "custom")
                  return part.value;
                return assertUnreachable(part);
              })();
              return (
                <div key={index} className="flex max-h-96 min-w-0 flex-col">
                  <Codeblock
                    label="Tool output"
                    value={value}
                    allowFormatting
                  />
                </div>
              );
            })
          : undefined
      }
      {...status}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      trailingContent={trailingContent}
    />
  );
}

function SessionTranscriptMessage({
  message,
  variant,
  trailingContent,
  onOpenObservation,
  expandRequestId,
}: {
  message: DisplayMessage;
  variant?: ComponentProps<typeof SessionTimelineContentMessage>["variant"];
  trailingContent: ReactNode;
  onOpenObservation?: (observationId: string) => void;
  expandRequestId?: number;
}) {
  if (message.role === "system") {
    return (
      <SessionTimelineSystemMessage
        parts={message.parts}
        senderName={message.senderName}
        trailingContent={trailingContent}
      />
    );
  }
  return (
    <SessionTimelineContentMessage
      variant={variant}
      expandRequestId={expandRequestId}
      role={message.role}
      parts={message.parts}
      senderName={message.senderName}
      timestamp={message.timing?.startTime ?? null}
      onOpenObservation={
        message.observationId && onOpenObservation
          ? () => onOpenObservation(message.observationId!)
          : undefined
      }
    />
  );
}
