import { useState, type ComponentProps, type ReactNode } from "react";
import { type TranscriptMessageGroup } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/groupTranscriptMessages";
import { getSessionTranscriptRows } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptRows";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";
import { SessionTimelineToolRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineToolRow/SessionTimelineToolRow";
import { Wrench } from "lucide-react";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type SessionTraceTranscriptState } from "@/src/features/sessions/hooks/useSessionTraceTranscripts";
import { SessionTimelineContentMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";
import { SessionTimelineCollapsibleRow } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/components/SessionConversationTimelineTrace/components/SessionTranscriptContent/components/SessionTimelineCollapsibleRow/SessionTimelineCollapsibleRow";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { groupConsecutiveTools } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/fns/groupConsecutiveTools";

export function SessionTranscriptContent({
  result,
  onOpenObservation,
  scrollTarget,
  threadIndex: selectedThreadIndex,
}: {
  threadIndex?: number;
  result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  const rows = getSessionTranscriptRows(result.transcript).filter(
    ({ threadIndex }) =>
      selectedThreadIndex === undefined || threadIndex === selectedThreadIndex,
  );
  const { visibleThreads } = getSessionTranscriptThreads(result.transcript);
  return (
    <div className="ph-no-capture space-y-4">
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No transcript messages.</p>
      )}
      {visibleThreads
        .filter(
          ({ threadIndex }) =>
            selectedThreadIndex === undefined ||
            threadIndex === selectedThreadIndex,
        )
        .map(({ threadIndex }) => (
          <div
            key={threadIndex}
            className="space-y-4 [&>[data-session-system-row]:has(+[data-session-system-row])]:mb-1 [&>[data-session-tool-row]:has(+[data-session-tool-row])]:mb-1"
          >
            {selectedThreadIndex === undefined && visibleThreads.length > 1 && (
              <h3 className="text-muted-foreground text-xs font-bold">
                Thread {threadIndex + 1}
              </h3>
            )}
            <SessionTranscriptThread
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
};

function SessionTranscriptThread({
  rows,
  onOpenObservation,
  scrollTarget,
}: {
  rows: ReturnType<typeof getSessionTranscriptRows>;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
}) {
  const groups = groupConsecutiveTools(rows, {
    isTool: ({ row }) => row.type === "tool",
    getBoundary: ({ threadIndex }) => threadIndex,
    getToolName: ({ row }) =>
      row.type === "tool"
        ? (row.call?.toolName ?? row.result?.toolName)
        : undefined,
    summaryBudget: 72,
  });
  return groups.map((group) => {
    if (group.type === "tools") {
      return (
        <SessionTranscriptToolGroup
          key={group.rows[0]!.id}
          summary={group.summary}
          title={group.title}
          rows={group.rows}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
        />
      );
    }
    return (
      <SessionTranscriptRow
        key={group.row.id}
        item={group.row}
        onOpenObservation={onOpenObservation}
        scrollTarget={scrollTarget}
      />
    );
  });
}

function SessionTranscriptRow({
  item,
  onOpenObservation,
  scrollTarget,
}: {
  item: ReturnType<typeof getSessionTranscriptRows>[number];
} & Omit<ComponentProps<typeof SessionTranscriptThread>, "rows">) {
  const { row, id } = item;
  const timing = row.message.timing;
  const isTool = row.type === "tool";
  const isSystem = row.message.role === "system";
  const metadata = (isTool || isSystem) &&
    (timing || row.message.observationId) && (
      <div className="text-muted-foreground invisible flex items-center gap-3 font-mono text-xs group-focus-within/collapsible-row:visible group-hover/collapsible-row:visible group-data-[expanded=true]/collapsible-row:visible">
        {row.message.observationId && (
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
      data-session-observation-id={row.message.observationId ?? undefined}
      data-session-transcript-row-id={id}
      data-scroll-request-id={
        (
          scrollTarget?.rowId
            ? scrollTarget.rowId === id
            : scrollTarget?.observationId === row.message.observationId
        )
          ? scrollTarget?.requestId
          : undefined
      }
    >
      {row.type === "tool" ? (
        <SessionTranscriptTool row={row} trailingContent={metadata} />
      ) : (
        <SessionTranscriptMessage
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
  return (
    <SessionTimelineCollapsibleRow
      label={summary}
      labelTitle={title}
      showHoverDivider={false}
      labelActionName={`${isOpen ? "Hide" : "Show"} tools: ${title}`}
      icon={<Wrench className="icon-base text-observation-tool shrink-0" />}
      isExpanded={isOpen}
      onExpandedChange={(isExpanded) =>
        setExpansion({
          isExpanded,
          requestId: props.scrollTarget?.requestId,
        })
      }
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
  return (
    <SessionTimelineToolRow
      name={row.call?.toolName ?? row.result?.toolName ?? "Tool"}
      input={row.call?.input}
      output={row.result?.output}
      isError={row.result?.isError}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      trailingContent={trailingContent}
    />
  );
}

function SessionTranscriptMessage({
  message,
  trailingContent,
  onOpenObservation,
}: {
  message: DisplayMessage;
  trailingContent: ReactNode;
  onOpenObservation: (observationId: string) => void;
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
      role={message.role}
      parts={message.parts}
      senderName={message.senderName}
      timestamp={message.timing?.startTime ?? null}
      onOpenObservation={
        message.observationId
          ? () => onOpenObservation(message.observationId!)
          : undefined
      }
    />
  );
}
