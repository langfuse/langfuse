import { useEffect } from "react";
import { type LinkProps } from "next/link";
import { useRouter } from "next/router";
import { type ParsedUrlQuery } from "querystring";
import { api } from "@/src/utils/api";
import { useSingleTraceData } from "@/src/features/traces/contexts/TraceDataProvider";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesProvider";

export type TraceMessagesNeighbor = Pick<LinkProps, "href" | "shallow">;

export function useTraceMessagesNavigation() {
  const { trace, isPlaceholderData } = useSingleTraceData();
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
          context: "other",
          projectId: trace.projectId,
          traceId: neighbor.id,
          timestamp: neighbor.timestamp,
        },
        { staleTime: 60 * 1_000 },
      );
    }
  }, [isPlaceholderData, previousTrace, nextTrace, trace.projectId, utils]);
  const sessionNavigation =
    !trace.sessionId || isAnnotationMode || !sessionTraces || traceIndex < 0
      ? null
      : {
          position: traceIndex + 1,
          total: sessionTraces.length,
          sessionHref: `/project/${trace.projectId}/sessions/${encodeURIComponent(trace.sessionId)}`,
          previous: neighborLink({
            target: previousTrace,
            isPeekMode,
            pathname: router.pathname,
            query: router.query,
            projectId: trace.projectId,
          }),
          next: neighborLink({
            target: nextTrace,
            isPeekMode,
            pathname: router.pathname,
            query: router.query,
            projectId: trace.projectId,
          }),
          currentTraceId: messageTrace.id,
          timeline: sessionTraces.map((sessionTrace) => ({
            id: sessionTrace.id,
            name: sessionTrace.name,
            startMs: sessionTrace.timestamp.getTime(),
            endMs:
              sessionTrace.timestamp.getTime() + (sessionTrace.latencyMs ?? 0),
            link: neighborLink({
              target: sessionTrace,
              isPeekMode,
              pathname: router.pathname,
              query: router.query,
              projectId: trace.projectId,
            }),
          })),
        };

  return { messageTrace, sessionNavigation };
}

function neighborLink({
  target,
  isPeekMode,
  pathname,
  query,
  projectId,
}: {
  target: { id: string; timestamp: Date } | undefined;
  isPeekMode: boolean;
  pathname: string;
  query: ParsedUrlQuery;
  projectId: string;
}): TraceMessagesNeighbor | undefined {
  if (!target) return undefined;
  if (isPeekMode) {
    const nextQuery = { ...query };
    delete nextQuery.observation;
    return {
      href: {
        pathname,
        query: {
          ...nextQuery,
          traceId: target.id,
          timestamp: target.timestamp.toISOString(),
          traceView: "messages",
        },
      },
      shallow: true,
    };
  }
  return {
    href: {
      pathname: `/project/${projectId}/traces/${target.id}`,
      query: {
        timestamp: target.timestamp.toISOString(),
        traceView: "messages",
      },
    },
  };
}
