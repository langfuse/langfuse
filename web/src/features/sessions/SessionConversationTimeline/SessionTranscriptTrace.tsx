import { useState } from "react";
import { type Thread } from "@langfuse/shared/src/server/transcript/types";
import {
  groupTranscriptMessages,
  type TranscriptMessageGroup,
} from "./fns/groupTranscriptMessages";
import { SessionTimelineToolRow } from "./components/SessionConversationTimelineTrace/SessionConversationTimelineTrace";
import { type NormalizedMessage } from "@langfuse/shared/src/utils/normalized-io";
import { type SessionTraceTranscriptState } from "./useSessionTraceTranscripts";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { type EventSessionTrace } from "@/src/features/sessions/sessionDetailPageTypes";
import { InternalFeatureBadge } from "@/src/features/feature-flags";
import { SessionTimelineContentMessage } from "./components/SessionConversationTimelineTrace/components/SessionTimelineContentMessage/SessionTimelineContentMessage";
import { SessionTimelineSystemMessage } from "./components/SessionConversationTimelineTrace/components/SessionTimelineSystemMessage/SessionTimelineSystemMessage";

export function SessionTranscriptTrace({
  trace,
  turnNumber,
  result,
}: {
  trace: EventSessionTrace;
  turnNumber: number;
  result: SessionTraceTranscriptState;
}) {
  return (
    <section
      data-session-trace-id={trace.id}
      className="ph-no-capture space-y-4 p-4"
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-bold">
          {turnNumber}. {trace.name ?? "Trace"}
        </span>
        <InternalFeatureBadge />
      </div>
      {result.state === "loading" && (
        <p className="text-muted-foreground text-sm">Loading transcript…</p>
      )}
      {result.state === "error" && (
        <p role="alert" className="text-destructive text-sm">
          Could not load transcript.
        </p>
      )}
      {result.state === "loaded" && (
        <>
          {result.cutoff && (
            <p role="status" className="text-muted-foreground text-sm">
              This transcript may be incomplete because the observation limit
              was reached.
            </p>
          )}
          {!result.transcript?.threads.length && (
            <p className="text-muted-foreground text-sm">
              No transcript messages.
            </p>
          )}
          {result.transcript?.threads.map((thread, threadIndex) => (
            <div key={threadIndex} className="space-y-4">
              {(result.transcript?.threads.length ?? 0) > 1 && (
                <h3 className="text-muted-foreground text-xs font-bold">
                  Thread {threadIndex + 1}
                </h3>
              )}
              <SessionTranscriptThread thread={thread} />
            </div>
          ))}
        </>
      )}
    </section>
  );
}

type DisplayMessage = NormalizedMessage & {
  timing: { startTime: Date; endTime: Date | null } | null;
};

function SessionTranscriptThread({ thread }: { thread: Thread }) {
  const messages: DisplayMessage[] = [
    ...thread.conversationHistory.map((message) => ({
      ...message,
      timing: null,
    })),
    ...thread.currentTurn.messages.map((message) => ({
      ...message,
      timing: { startTime: message.startTime, endTime: message.endTime },
    })),
  ];
  const rows = groupTranscriptMessages(messages);
  return rows.map((row, index) => {
    const timing = row.message.timing;
    const showSection =
      index === 0 ||
      Boolean(timing) !== Boolean(rows[index - 1]?.message.timing);
    return (
      <div key={index} className="space-y-1">
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
      id={undefined}
      name={row.call.toolName ?? row.result.toolName ?? "Tool"}
      input={row.call.input}
      output={row.result.output}
      isError={row.result.isError}
      startTime={null}
      latency={null}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      showRailEnd={false}
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
