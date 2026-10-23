import { useState, type ComponentProps } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { ErrorBoundary } from "@sentry/nextjs";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useTraceMessagesNavigation } from "./hooks/useTraceMessagesNavigation";
import { useTraceMessagesTranscript } from "./hooks/useTraceMessagesTranscript";
// TODO: Before TraceMessagesView leaves internal preview, rename the components
// shared by session and trace views and move them to a common location.
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";

export function TraceMessagesView() {
  const { trace, isPlaceholderData } = useTraceData();
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const { selectNode, setSelectedTab } = useSelection();
  const [, setTraceView] = useQueryParam("traceView", StringParam);
  const { messageTrace, navigation } = useTraceMessagesNavigation();
  const { data, state } = useTraceMessagesTranscript(
    {
      projectId: trace.projectId,
      traceId: messageTrace.id,
      timestamp: messageTrace.timestamp,
    },
    isPlaceholderData,
  );
  const includeNestedThreads = expandedTraceId === messageTrace.id;
  const { hiddenThreadCount } = getSessionTranscriptThreads(
    data?.transcript ?? null,
    includeNestedThreads,
  );
  const entries = getSessionConversationEntries(
    [{ trace: messageTrace, transcript: data?.transcript }],
    includeNestedThreads,
  );
  const traces: ComponentProps<typeof SessionConversationTimeline>["traces"] =
    entries.map((entry) => ({
      ...entry,
      trace: messageTrace,
      turnNumber: 1,
      variant: "single-trace",
      includeNestedThreads,
      state,
      onOpenTrace: () => {
        setTraceView(undefined, "pushIn");
        selectNode(null);
      },
      onOpenObservation: (observationId) => {
        setTraceView(undefined, "pushIn");
        setSelectedTab("preview");
        selectNode(observationId);
      },
      scrollTarget: null,
    }));
  const controller = useSessionConversationTimelineController(traces);

  return (
    <ErrorBoundary
      key={trace.id}
      fallback={
        <div className="text-muted-foreground p-3 text-sm">
          Unprocessable content.
        </div>
      }
    >
      <div className="flex h-full min-h-0 w-full flex-col">
        {state.type === "transcript" && hiddenThreadCount > 0 && (
          <div
            role="status"
            className="text-muted-foreground flex shrink-0 items-center justify-between gap-3 rounded-md border p-3 text-sm"
          >
            <span>
              {hiddenThreadCount} nested{" "}
              {hiddenThreadCount === 1 ? "thread is" : "threads are"} hidden.
            </span>
            <button
              type="button"
              className="text-foreground shrink-0 underline underline-offset-4"
              onClick={() => setExpandedTraceId(messageTrace.id)}
            >
              Show nested threads
            </button>
          </div>
        )}
        {data?.cutoff && (!data.transcript || entries.length <= 1) && (
          <div className="text-muted-foreground p-3 text-sm">
            This trace exceeds the observation cap. Later observations are not
            part of the transcript.
          </div>
        )}
        <SessionConversationTimeline
          traces={traces}
          controller={controller}
          navigation={navigation}
        />
      </div>
    </ErrorBoundary>
  );
}
