import { useState, type ComponentProps } from "react";
import { StringParam, useQueryParam } from "use-query-params";
import { ErrorBoundary } from "@sentry/nextjs";
import { Banner } from "@/src/components/design-system/Banner/Banner";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import {
  useTraceData,
  useSingleTraceData,
} from "@/src/features/traces/contexts/TraceDataProvider";
import { useTraceMessagesNavigation } from "./hooks/useTraceMessagesNavigation";
import { useTraceMessagesTranscript } from "./hooks/useTraceMessagesTranscript";
// TODO: Before TraceMessagesView leaves internal preview, rename the components
// shared by session and trace views and move them to a common location.
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";
import { ConnectedSessionMessagesView } from "../ConnectedSessionMessagesView/ConnectedSessionMessagesView";

export function TraceMessagesView({
  onOpenObservation,
}: {
  onOpenObservation: (traceId: string, observationId: string) => void;
}) {
  const { projectId, scope, isPlaceholderData } = useTraceData();
  if (scope.type === "session") {
    return (
      <ConnectedSessionMessagesView
        key={`${projectId}:${scope.sessionId}`}
        projectId={projectId}
        sessionId={scope.sessionId}
        enabled={!isPlaceholderData}
      />
    );
  }
  return <SingleTraceMessagesView onOpenObservation={onOpenObservation} />;
}

function SingleTraceMessagesView({
  onOpenObservation,
}: Pick<ComponentProps<typeof TraceMessagesView>, "onOpenObservation">) {
  const { trace, isPlaceholderData } = useSingleTraceData();
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null);
  const { selectNode } = useSelection();
  const [, setTraceView] = useQueryParam("traceView", StringParam);
  const { messageTrace, navigation } = useTraceMessagesNavigation();
  const { data, state } = useTraceMessagesTranscript(
    {
      context: "other",
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
        onOpenObservation(messageTrace.id, observationId);
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
          <div className="shrink-0">
            <Banner
              actions={[
                {
                  text: "Show nested threads",
                  onClick: () => setExpandedTraceId(messageTrace.id),
                },
              ]}
            >
              {hiddenThreadCount} nested{" "}
              {hiddenThreadCount === 1 ? "thread is" : "threads are"} hidden.
            </Banner>
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
