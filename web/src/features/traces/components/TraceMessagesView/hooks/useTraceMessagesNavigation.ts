import { useEffect } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";

export function useTraceMessagesNavigation() {
  const { trace, isPlaceholderData } = useTraceData();
  const { isPeekMode, isAnnotationMode } = useViewPreferences();
  const router = useRouter();
  const utils = api.useUtils();
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
      if (isAnnotationMode || !target) return undefined;
      const count =
        directionIndex === 0
          ? traceIndex
          : (sessionTraces?.length ?? 0) - traceIndex - 1;
      if (isPeekMode) {
        const query = { ...router.query };
        delete query.observation;
        return {
          count,
          href: {
            pathname: router.pathname,
            query: {
              ...query,
              traceId: target.id,
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

  return {
    messageTrace,
    navigation: {
      previousTrace: previousTraceLink,
      nextTrace: nextTraceLink,
    },
  };
}
