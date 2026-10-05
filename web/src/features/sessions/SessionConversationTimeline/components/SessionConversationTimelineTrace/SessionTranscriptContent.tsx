import { useState, type ComponentProps, type ReactNode } from "react";
import { type RouterOutputs } from "@/src/utils/api";
import { type TranscriptMessageGroup } from "../../fns/groupTranscriptMessages";
import { getSessionTranscriptRows } from "../../fns/getSessionTranscriptRows";
import {
  SessionTimelineToolRow,
  SessionObservationActionsMenu,
} from "./SessionConversationTimelineTrace";
import { ChevronDown, Wrench } from "lucide-react";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type SessionTraceTranscriptState } from "../../useSessionTraceTranscripts";
import { SessionTimelineContentMessage } from "./components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "./components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";
import { cn } from "@/src/utils/tailwind";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { groupConsecutiveTools } from "../../../fns/groupConsecutiveTools";

type ObservationActionProps = Pick<
  ComponentProps<typeof SessionObservationActionsMenu>,
  | "onAnnotateObservation"
  | "onCommentObservation"
  | "onAddObservationToDataset"
  | "annotateDisabled"
  | "commentDisabled"
  | "addToDatasetDisabled"
>;

export function SessionTranscriptContent({
  result,
  observations,
  onOpenObservation,
  scrollTarget,
  ...observationActionProps
}: {
  result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
  observations: RouterOutputs["events"]["sessionAll"]["observations"];
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
} & ObservationActionProps) {
  const rows = getSessionTranscriptRows(result.transcript);
  return (
    <div className="ph-no-capture space-y-4">
      {rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No transcript messages.</p>
      )}
      {result.transcript?.threads.map((thread, threadIndex) => (
        <div
          key={threadIndex}
          className="space-y-4 [&>[data-session-system-row]:has(+[data-session-system-row])]:mb-1 [&>[data-session-tool-row]:has(+[data-session-tool-row])]:mb-1"
        >
          {(result.transcript?.threads.length ?? 0) > 1 && (
            <h3 className="text-muted-foreground text-xs font-bold">
              Thread {threadIndex + 1}
            </h3>
          )}
          <SessionTranscriptThread
            rows={rows.filter((row) => row.threadIndex === threadIndex)}
            onOpenObservation={onOpenObservation}
            observations={observations}
            {...observationActionProps}
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
  observations,
  ...observationActionProps
}: {
  rows: ReturnType<typeof getSessionTranscriptRows>;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: {
    observationId: string;
    rowId?: string;
    requestId: number;
  } | null;
  observations: RouterOutputs["events"]["sessionAll"]["observations"];
} & ObservationActionProps) {
  const groups = groupConsecutiveTools(rows, {
    isTool: ({ row }) => row.type === "tool",
    getName: ({ row }) =>
      row.type === "tool"
        ? (row.call?.toolName ?? row.result?.toolName ?? "Tool")
        : "",
    getBoundary: ({ threadIndex }) => threadIndex,
  });
  return groups.map((group) => {
    if (group.type === "tools") {
      return (
        <SessionTranscriptToolGroup
          key={group.rows[0]!.id}
          summary={group.summary}
          rows={group.rows}
          onOpenObservation={onOpenObservation}
          scrollTarget={scrollTarget}
          observations={observations}
          {...observationActionProps}
        />
      );
    }
    return (
      <SessionTranscriptRow
        key={group.row.id}
        item={group.row}
        onOpenObservation={onOpenObservation}
        scrollTarget={scrollTarget}
        observations={observations}
        {...observationActionProps}
      />
    );
  });
}

function SessionTranscriptRow({
  item,
  onOpenObservation,
  scrollTarget,
  observations,
  ...observationActionProps
}: {
  item: ReturnType<typeof getSessionTranscriptRows>[number];
} & Omit<ComponentProps<typeof SessionTranscriptThread>, "rows">) {
  const { row, id } = item;
  const timing = row.message.timing;
  const isTool = row.type === "tool";
  const isSystem = row.message.role === "system";
  const observation = observations.find(
    (item) => item.id === row.message.observationId,
  );
  const actionsMenu = observation?.traceId && (
    <SessionObservationActionsMenu
      observation={{
        id: observation.id,
        traceId: observation.traceId,
        name: observation.name,
        startTime: observation.startTime,
        environment: observation.environment,
      }}
      {...observationActionProps}
    >
      {({ getTriggerProps }) => {
        return (
          <button
            type="button"
            aria-label={`Actions for ${observation.name ?? observation.id}`}
            className="hover:text-foreground inline-flex items-center gap-0.5 hover:underline"
            data-session-actions-trigger=""
            {...getTriggerProps()}
          >
            Actions
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          </button>
        );
      }}
    </SessionObservationActionsMenu>
  );
  const metadata = (isTool || isSystem) && (timing || actionsMenu) && (
    <div className="text-muted-foreground invisible flex items-center gap-3 font-mono text-xs group-focus-within/collapsible-row:visible group-hover/collapsible-row:visible group-has-[[data-session-actions-trigger][aria-expanded=true]]/collapsible-row:visible group-data-[expanded=true]/collapsible-row:visible">
      {!isTool &&
        row.message.role === "system" &&
        row.message.observationId && (
          <button
            type="button"
            className="hover:text-foreground underline"
            onClick={() => onOpenObservation(row.message.observationId!)}
          >
            Open observation
          </button>
        )}
      {actionsMenu}
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
        <SessionTranscriptTool
          row={row}
          trailingContent={metadata}
          onOpenObservation={onOpenObservation}
        />
      ) : (
        <SessionTranscriptMessage
          message={row.message}
          trailingContent={isSystem ? metadata : actionsMenu}
          onOpenObservation={onOpenObservation}
        />
      )}
    </div>
  );
}

function SessionTranscriptToolGroup({
  summary,
  rows,
  ...props
}: {
  summary: string;
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
    <div className="space-y-1">
      <button
        type="button"
        aria-label={`${isOpen ? "Hide" : "Show"} tools: ${summary}`}
        aria-expanded={isOpen}
        onClick={() =>
          setExpansion({
            isExpanded: !isOpen,
            requestId: props.scrollTarget?.requestId,
          })
        }
        className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 text-left text-sm"
      >
        <Wrench className="h-3.5 w-3.5 shrink-0" />
        <span>{summary}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 shrink-0", !isOpen && "-rotate-90")}
        />
      </button>
      {isOpen && (
        <div className="space-y-1 pl-3">
          {rows.map((item) => (
            <SessionTranscriptRow key={item.id} {...props} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}

function SessionTranscriptTool({
  row,
  trailingContent,
  onOpenObservation,
}: {
  row: Extract<TranscriptMessageGroup<DisplayMessage>, { type: "tool" }>;
  trailingContent: ReactNode;
  onOpenObservation: (observationId: string) => void;
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
      onOpenObservation={
        row.message.observationId
          ? () => onOpenObservation(row.message.observationId!)
          : undefined
      }
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
      trailingContent={trailingContent}
      onOpenObservation={
        message.observationId
          ? () => onOpenObservation(message.observationId!)
          : undefined
      }
    />
  );
}
