import { useEffect, type ComponentProps } from "react";
import { useRouter } from "next/router";
import { StringParam, useQueryParam } from "use-query-params";
import { ErrorBoundary } from "@sentry/nextjs";
import { api } from "@/src/utils/api";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
// TODO: Before TraceMessagesView leaves internal preview, rename the components
// shared by session and trace views and move them to a common location.
import { SessionConversationTimeline } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/components/SessionConversationalView/components/SessionConversationTimeline/SessionConversationTimeline";
import { getSessionConversationEntries } from "@/src/features/sessions/components/ConnectedModernSessionBodyTimeline/components/ConnectedSessionConversationTimeline/fns/getSessionConversationEntries";
import { useSessionConversationTimelineController } from "@/src/features/sessions/hooks/useSessionConversationTimelineController";

export function TraceMessagesView() {
  const { trace, isPlaceholderData } = useTraceData();
  const utils = api.useUtils();
  const { selectNode, setSelectedTab } = useSelection();
  const [, setTraceView] = useQueryParam("traceView", StringParam);
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
  const requestedTraceId = isPeekMode
    ? (router.query.traceId ?? router.query.peek)
    : router.query.traceId;
  const messageTrace = isPlaceholderData
    ? (sessionTraces?.find(({ id }) => id === requestedTraceId) ?? trace)
    : trace;
  const traceIndex =
    sessionTraces?.findIndex(({ id }) => id === messageTrace.id) ?? -1;
  const previousTrace =
    traceIndex > 0 ? sessionTraces?.[traceIndex - 1] : undefined;
  const nextTrace =
    traceIndex >= 0 ? sessionTraces?.[traceIndex + 1] : undefined;
  useEffect(() => {
    if (isPlaceholderData) return;
    for (const neighbor of [previousTrace, nextTrace]) {
      if (!neighbor) continue;
      utils.events.transcriptByTraceId.prefetch(
        {
          projectId: trace.projectId,
          traceId: neighbor.id,
          timestamp: neighbor.timestamp,
        },
        { staleTime: 60 * 1_000 },
      );
    }
  }, [isPlaceholderData, previousTrace, nextTrace, trace.projectId, utils]);
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
  const { data, isLoading, error } = api.events.transcriptByTraceId.useQuery(
    {
      projectId: trace.projectId,
      traceId: messageTrace.id,
      timestamp: messageTrace.timestamp,
    },
    { staleTime: 60 * 1_000 },
  );
  const entries = getSessionConversationEntries([
    { trace: messageTrace, transcript: data?.transcript },
  ]);
  const state: ComponentProps<
    typeof SessionConversationTimeline
  >["traces"][number]["state"] = (() => {
    if (isLoading || isPlaceholderData) return { type: "loading" };
    if (error) return { type: "error" };
    if (!data?.transcript) return { type: "empty" };
    return { type: "transcript", result: { state: "loaded", ...data } };
  })();
  const traces: ComponentProps<typeof SessionConversationTimeline>["traces"] =
    entries.map((entry) => ({
      ...entry,
      trace: messageTrace,
      turnNumber: 1,
      variant: "single-trace",
      state,
      onOpenTrace: () => {
        setTraceView(undefined, "pushIn");
        selectNode(trace.id);
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
