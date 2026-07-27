import { api } from "@/src/utils/api";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import { useEventsTraceData } from "@/src/features/events/hooks/useEventsTraceData";

/**
 * Single source of truth for fetching a trace's detail data, beta-aware (events
 * table when the v4 preview is on, the traces table otherwise). Both the peek
 * and the standalone trace page use this so the fetch isn't forked — it exposes
 * the union of what each surface needs (the page's not-found / unauthorized
 * pages and the truncation flag; the peek just reads `data`/`isLoading`).
 */
export function useTraceDetailData({
  projectId,
  traceId,
  timestamp,
  enabled = true,
}: {
  projectId: string;
  traceId?: string;
  timestamp?: Date;
  enabled?: boolean;
}) {
  const { isBetaEnabled } = useV4Beta();

  // Old path: traces table (beta OFF).
  const tracesQuery = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: traceId ?? "",
      projectId,
      timestamp,
    },
    {
      enabled: enabled && !!traceId && !isBetaEnabled,
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
      staleTime: 60 * 1000,
    },
  );

  // New path: events table (beta ON).
  const eventsData = useEventsTraceData({
    projectId,
    traceId: traceId ?? "",
    timestamp,
    enabled: enabled && !!traceId && isBetaEnabled,
  });

  if (isBetaEnabled) {
    // useEventsTraceData types its error as `unknown`; narrow to the trpc shape
    // to read the code (the non-beta branch gets this for free from the typed
    // tracesQuery.error).
    const eventsErrorCode = (
      eventsData.error as { data?: { code?: string } } | null | undefined
    )?.data?.code;
    const isUnauthorized = eventsErrorCode === "UNAUTHORIZED";
    return {
      data: eventsData.data,
      isLoading: eventsData.isLoading,
      error: eventsData.error,
      isError: !!eventsData.error,
      // The events path surfaces "missing" as no-data after loading rather than
      // a NOT_FOUND error code. Any error (UNAUTHORIZED, a 500, a network blip)
      // also lands as no-data, so "not found" must mean no-data AND no-error —
      // else a transient failure is mislabeled as a deleted/missing trace.
      isNotFound:
        !eventsData.isLoading && !eventsData.data && !eventsData.error,
      isUnauthorized,
      cutoffObservationsAfterMaxCount:
        eventsData.cutoffObservationsAfterMaxCount,
    };
  }

  return {
    data: tracesQuery.data,
    isLoading: tracesQuery.isLoading,
    error: tracesQuery.error,
    isError: tracesQuery.isError,
    isNotFound: tracesQuery.error?.data?.code === "NOT_FOUND",
    isUnauthorized: tracesQuery.error?.data?.code === "UNAUTHORIZED",
    cutoffObservationsAfterMaxCount: false,
  };
}
