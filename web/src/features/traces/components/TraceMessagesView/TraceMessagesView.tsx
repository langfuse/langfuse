/* eslint-disable boundaries/dependencies -- TODO: component privacy */
import { useState, type ComponentProps } from "react";
import { useRouter } from "next/router";
import { StringParam, useQueryParam } from "use-query-params";
import { ErrorBoundary } from "@sentry/nextjs";
import { GitBranch } from "@langfuse/icons";
import { Button } from "@/src/components/design-system/Button/Button";
import { useSelection } from "@/src/features/traces/contexts/SelectionProvider";
import {
  useTraceData,
  useSingleTraceData,
} from "@/src/features/traces/contexts/TraceDataProvider";
import {
  useTraceMessagesNavigation,
  type TraceMessagesNeighbor,
} from "./hooks/useTraceMessagesNavigation";
import { useTraceMessagesTranscript } from "./hooks/useTraceMessagesTranscript";
// TODO: Before TraceMessagesView leaves internal preview, rename the components
// shared by session and trace views and move them to a common location.
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";
import { getSessionTranscriptThreads } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionTranscriptThreads";
import { ConnectedSessionMessagesView } from "../ConnectedSessionMessagesView/ConnectedSessionMessagesView";
import { SessionTraceNavigationBar } from "./components/SessionTraceNavigationBar/SessionTraceNavigationBar";

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
  const router = useRouter();
  const { messageTrace, sessionNavigation } = useTraceMessagesNavigation();
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
        {sessionNavigation ? (
          <SessionTraceNavigationBar
            position={sessionNavigation.position}
            total={sessionNavigation.total}
            sessionHref={sessionNavigation.sessionHref}
            currentTraceId={sessionNavigation.currentTraceId}
            timeline={sessionNavigation.timeline}
            onSelectTrace={(traceId) => {
              const selected = sessionNavigation.timeline.find(
                (span) => span.id === traceId,
              );
              openNeighbor(router, selected?.link)?.();
            }}
            onPrevious={openNeighbor(router, sessionNavigation.previous)}
            onNext={openNeighbor(router, sessionNavigation.next)}
            previousHref={sessionNavigation.previous?.href}
            nextHref={sessionNavigation.next?.href}
            previousShallow={sessionNavigation.previous?.shallow}
            nextShallow={sessionNavigation.next?.shallow}
          />
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
          {state.type === "transcript" && hiddenThreadCount > 0 && (
            <HiddenThreadsDivider
              count={hiddenThreadCount}
              onShow={() => setExpandedTraceId(messageTrace.id)}
            />
          )}
          {data?.cutoff && (!data.transcript || entries.length <= 1) && (
            <div className="text-muted-foreground text-sm">
              This trace exceeds the observation cap. Later observations are not
              part of the transcript.
            </div>
          )}
          <SessionConversationTimeline
            traces={traces}
            controller={controller}
          />
        </div>
      </div>
    </ErrorBoundary>
  );
}

function openNeighbor(
  router: ReturnType<typeof useRouter>,
  neighbor: TraceMessagesNeighbor | undefined,
) {
  if (!neighbor) return undefined;
  return () => {
    router
      .push(neighbor.href, undefined, { shallow: neighbor.shallow })
      .catch(() => undefined);
  };
}

function HiddenThreadsDivider({
  count,
  onShow,
}: {
  count: number;
  onShow: () => void;
}) {
  const label = `${count} nested ${count === 1 ? "thread" : "threads"} hidden`;
  return (
    <div
      role="group"
      aria-label={label}
      className="text-muted-foreground flex shrink-0 items-center gap-3 pb-6 text-xs"
    >
      <div className="border-border min-w-0 flex-1 border-t border-dashed" />
      <span className="flex items-center gap-1.5">
        <GitBranch size="sm" aria-hidden="true" />
        {label}
      </span>
      <span aria-hidden="true">·</span>
      <Button variant="text" size="sm" text="Show" onClick={onShow} />
      <div className="border-border min-w-0 flex-1 border-t border-dashed" />
    </div>
  );
}
