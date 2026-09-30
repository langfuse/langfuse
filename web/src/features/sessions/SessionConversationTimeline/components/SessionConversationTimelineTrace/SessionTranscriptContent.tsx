import { useState } from "react";
import { type RouterOutputs } from "@/src/utils/api";
import {
  groupTranscriptMessages,
  type TranscriptMessageGroup,
} from "../../fns/groupTranscriptMessages";
import {
  SessionTimelineToolRow,
  SessionObservationActionsMenuContent,
  type SessionObservationActions,
} from "./SessionConversationTimelineTrace";
import {
  DropdownMenu,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { Button } from "@/src/components/ui/button";
import { MoreHorizontal } from "lucide-react";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type SessionTraceTranscriptState } from "../../useSessionTraceTranscripts";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { SessionTimelineContentMessage } from "./components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "./components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";

export function SessionTranscriptContent({
  result,
  observations,
  filtered,
  observationActions,
  onOpenObservation,
  scrollTarget,
}: {
  result: Extract<SessionTraceTranscriptState, { state: "loaded" }>;
  observations: RouterOutputs["events"]["sessionAll"]["observations"];
  filtered: boolean;
  observationActions?: SessionObservationActions;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: { observationId: string; requestId: number } | null;
}) {
  return (
    <div className="ph-no-capture space-y-4">
      {result.cutoff && (
        <p role="status" className="text-muted-foreground text-sm">
          This transcript may be incomplete because the observation limit was
          reached.
        </p>
      )}
      {!result.transcript?.threads.some((thread) =>
        thread.currentTurn.messages.some(
          (message) =>
            !filtered ||
            observations.some(
              (observation) => observation.id === message.observationId,
            ),
        ),
      ) && (
        <p className="text-muted-foreground text-sm">No transcript messages.</p>
      )}
      {result.transcript?.threads.map((thread, threadIndex) => (
        <div key={threadIndex} className="space-y-4">
          {(result.transcript?.threads.length ?? 0) > 1 && (
            <h3 className="text-muted-foreground text-xs font-bold">
              Thread {threadIndex + 1}
            </h3>
          )}
          <SessionTranscriptThread
            thread={thread}
            onOpenObservation={onOpenObservation}
            observations={observations}
            observationActions={observationActions}
            scrollTarget={scrollTarget}
            allowedObservationIds={
              filtered
                ? new Set(observations.map((observation) => observation.id))
                : null
            }
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

type Thread = NonNullable<
  RouterOutputs["events"]["transcriptByTraceId"]["transcript"]
>["threads"][number];

function SessionTranscriptThread({
  thread,
  onOpenObservation,
  scrollTarget,
  allowedObservationIds,
  observations,
  observationActions,
}: {
  thread: Thread;
  onOpenObservation: (observationId: string) => void;
  scrollTarget: { observationId: string; requestId: number } | null;
  allowedObservationIds: ReadonlySet<string> | null;
  observations: RouterOutputs["events"]["sessionAll"]["observations"];
  observationActions?: SessionObservationActions;
}) {
  const messages: DisplayMessage[] = [
    ...(allowedObservationIds ? [] : thread.conversationHistory).map(
      (message) => ({
        ...message,
        timing: null,
        observationId: null,
      }),
    ),
    ...thread.currentTurn.messages
      .filter(
        (message) =>
          !allowedObservationIds ||
          allowedObservationIds.has(message.observationId),
      )
      .map((message) => ({
        ...message,
        timing: { startTime: message.startTime, endTime: message.endTime },
        observationId: message.observationId,
      })),
  ];
  const rows = groupTranscriptMessages(messages);
  return rows.map((row, index) => {
    const timing = row.message.timing;
    const observation = observations.find(
      (item) => item.id === row.message.observationId,
    );
    const showSection =
      index === 0 ||
      Boolean(timing) !== Boolean(rows[index - 1]?.message.timing);
    return (
      <div
        key={index}
        className="space-y-1"
        data-session-observation-id={row.message.observationId ?? undefined}
        data-scroll-request-id={
          scrollTarget?.observationId === row.message.observationId
            ? scrollTarget.requestId
            : undefined
        }
      >
        {showSection && thread.conversationHistory.length > 0 && (
          <div className="text-muted-foreground mb-3 text-xs">
            {timing ? "Current turn" : "Conversation history"}
          </div>
        )}
        {timing && (
          <div
            className="text-muted-foreground flex items-center gap-2 font-mono text-xs"
            title="Source observation timing"
          >
            {row.message.observationId && (
              <button
                type="button"
                className="hover:text-foreground underline"
                onClick={() => onOpenObservation(row.message.observationId!)}
              >
                Open observation
              </button>
            )}
            {observationActions && observation?.traceId && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Actions for ${observation.name ?? observation.id}`}
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <SessionObservationActionsMenuContent
                  observation={{
                    id: observation.id,
                    traceId: observation.traceId,
                    name: observation.name,
                    startTime: observation.startTime,
                    environment: observation.environment,
                  }}
                  actions={observationActions}
                />
              </DropdownMenu>
            )}
            <time dateTime={timing.startTime.toISOString()}>
              {timing.startTime.toLocaleTimeString()}
            </time>
            {timing.endTime !== null && (
              <>
                <span>–</span>
                <time dateTime={timing.endTime.toISOString()}>
                  {timing.endTime.toLocaleTimeString()}
                </time>
                <span>
                  {formatIntervalSeconds(
                    (timing.endTime.getTime() - timing.startTime.getTime()) /
                      1000,
                  )}
                </span>
              </>
            )}
          </div>
        )}
        {row.type === "tool" ? (
          <SessionTranscriptTool row={row} />
        ) : (
          <SessionTranscriptMessage message={row.message} />
        )}
      </div>
    );
  });
}

function SessionTranscriptTool({
  row,
}: {
  row: Extract<TranscriptMessageGroup<DisplayMessage>, { type: "tool" }>;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <SessionTimelineToolRow
      name={row.call.toolName ?? row.result.toolName ?? "Tool"}
      input={row.call.input}
      output={row.result.output}
      isError={row.result.isError}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
    />
  );
}

function SessionTranscriptMessage({ message }: { message: NormalizedMessage }) {
  if (message.role === "system") {
    return (
      <SessionTimelineSystemMessage
        parts={message.parts}
        senderName={message.senderName}
      />
    );
  }
  return (
    <SessionTimelineContentMessage
      role={message.role}
      parts={message.parts}
      senderName={message.senderName}
    />
  );
}
