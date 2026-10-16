import { type ComponentProps } from "react";
import { useRouter } from "next/router";
import { ErrorBoundary } from "@sentry/nextjs";
import { api } from "@/src/utils/api";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

export function TraceMessagesView() {
  const { trace } = useTraceData();
  const { selectNode } = useSelection();
  const router = useRouter();
  const { isPeekMode } = useViewPreferences();
  const { data: sessionTraces } = api.sessions.tracesFromEvents.useQuery(
    { projectId: trace.projectId, sessionId: trace.sessionId ?? "" },
    {
      enabled: Boolean(trace.sessionId),
      staleTime: (query) => {
        const latestTrace = query.state.data?.at(-1);
        if (!latestTrace) return 30 * 1_000;
        const sessionInactive =
          Date.now() - latestTrace.timestamp.getTime() >= 30 * 60 * 1_000;
        return sessionInactive ? 10 * 60 * 1_000 : 30 * 1_000;
      },
      gcTime: 10 * 60 * 1_000,
      refetchOnWindowFocus: false,
    },
  );
  const traceIndex =
    sessionTraces?.findIndex(({ id }) => id === trace.id) ?? -1;
  const previousTrace =
    traceIndex > 0 ? sessionTraces?.[traceIndex - 1] : undefined;
  const nextTrace =
    traceIndex >= 0 ? sessionTraces?.[traceIndex + 1] : undefined;
  const [previousTraceLink, nextTraceLink] = [previousTrace, nextTrace].map(
    (target, directionIndex) => {
      if (!target) return undefined;
      const count =
        directionIndex === 0
          ? traceIndex
          : (sessionTraces?.length ?? 0) - traceIndex - 1;
      if (isPeekMode) {
        const query = { ...router.query };
        delete query.observation;
        delete query.traceId;
        return {
          count,
          href: {
            pathname: router.pathname,
            query: {
              ...query,
              peek: target.id,
              timestamp: target.timestamp.toISOString(),
              traceView: "messages",
            },
          },
          shallow: true,
        };
      }
      return {
        count,
        href: {
          pathname: `/project/${trace.projectId}/traces/${target.id}`,
          query: {
            timestamp: target.timestamp.toISOString(),
            traceView: "messages",
          },
        },
      };
    },
  );
  const { data, isLoading, error } = api.events.transcriptByTraceId.useQuery({
    projectId: trace.projectId,
    traceId: trace.id,
    timestamp: trace.timestamp,
  });
  const entries = getSessionConversationEntries([
    { trace, transcript: data?.transcript },
  ]);
  const state: ComponentProps<
    typeof SessionConversationTimeline
  >["traces"][number]["state"] = (() => {
    if (isLoading) return { type: "loading" };
    if (error) return { type: "error" };
    if (!data?.transcript) return { type: "empty" };
    return { type: "transcript", result: { state: "loaded", ...data } };
  })();
  const traces: ComponentProps<typeof SessionConversationTimeline>["traces"] =
    entries.map((entry) => ({
      ...entry,
      trace,
      turnNumber: 1,
      variant: "single-trace",
      state,
      onOpenTrace: () => selectNode(trace.id),
      onOpenObservation: (observationId) => selectNode(observationId),
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
        {data?.cutoff && (!data.transcript || entries.length <= 1) && (
          <div className="text-muted-foreground p-3 text-sm">
            This trace exceeds the observation cap. Later observations are not
            part of the transcript.
          </div>
        )}
        <SessionConversationTimeline
          traces={traces}
          controller={controller}
          navigation={{
            previousTrace: previousTraceLink,
            nextTrace: nextTraceLink,
          }}
        />
      </div>
    </ErrorBoundary>
  );
}
