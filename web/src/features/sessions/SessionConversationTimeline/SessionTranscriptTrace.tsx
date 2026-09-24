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
              {thread.conversationHistory.length > 0 && (
                <div className="space-y-3">
                  <div className="text-muted-foreground text-xs">
                    Conversation history
                  </div>
                  {thread.conversationHistory.map((message, index) => (
                    <SessionTranscriptMessage key={index} message={message} />
                  ))}
                </div>
              )}
              {thread.conversationHistory.length > 0 &&
                thread.currentTurn.messages.length > 0 && (
                  <div className="text-muted-foreground text-xs">
                    Current turn
                  </div>
                )}
              {thread.currentTurn.messages.map((message, index) => (
                <div key={index} className="space-y-1">
                  <div
                    className="text-muted-foreground flex items-center gap-2 font-mono text-xs"
                    title="Source observation timing"
                  >
                    <time dateTime={message.startTime.toISOString()}>
                      {message.startTime.toLocaleTimeString()}
                    </time>
                    {message.endTime !== null && (
                      <>
                        <span>–</span>
                        <time dateTime={message.endTime.toISOString()}>
                          {message.endTime.toLocaleTimeString()}
                        </time>
                        <span>
                          {formatIntervalSeconds(
                            (message.endTime.getTime() -
                              message.startTime.getTime()) /
                              1000,
                          )}
                        </span>
                      </>
                    )}
                  </div>
                  <SessionTranscriptMessage message={message} />
                </div>
              ))}
            </div>
          ))}
        </>
      )}
    </section>
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
