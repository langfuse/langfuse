import { api } from "@/src/utils/api";
import { useEventsTraceData, useReadPath } from "@/src/features/events";
import { useSession } from "next-auth/react";
import {
  getTraceArrivalRetryDelayMs,
  shouldRetryTraceArrival,
} from "@/src/features/events/lib/traceArrivalRetry";

/**
 * Single source of truth for fetching a trace's detail data, beta-aware (events
 * table when the v4 preview is on, the traces table otherwise). Both the peek
 * and the standalone trace page use this so the fetch isn't forked — it exposes
 * the union of what each surface needs (the page's not-found / unauthorized
 * pages and the truncation flag; the peek just reads `data`/`isLoading`).
 *
 * A NOT_FOUND (or empty events result) is retried with exponential backoff so a
 * deep link opened during ingest lag does not immediately flash the error page.
 * See {@link shouldRetryTraceArrival}.
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
  const { isV4 } = useReadPath();
  const { status: sessionStatus } = useSession();
  const isUnauthenticated = sessionStatus === "unauthenticated";
  const traceReadConfig = api.public.traceReadConfig.useQuery(undefined, {
    enabled: isUnauthenticated,
    staleTime: Infinity,
  });
  const isTraceSourceLoading =
    sessionStatus === "loading" ||
    (isUnauthenticated && traceReadConfig.isLoading);
  const unauthenticatedEventsReadEnabled =
    traceReadConfig.data?.v4WriteMode === "dual" ||
    traceReadConfig.data?.v4WriteMode === "events_only";
  const useEventsTraceSource =
    isV4 || (isUnauthenticated && unauthenticatedEventsReadEnabled);

  // Old path: traces table (beta OFF).
  const tracesQuery = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId: traceId ?? "",
      projectId,
      timestamp,
    },
    {
      enabled:
        enabled &&
        !!traceId &&
        !!projectId &&
        !isTraceSourceLoading &&
        !useEventsTraceSource,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        // Deep links during ingest lag: retry NOT_FOUND with backoff instead of
        // failing on the first miss. Auth stays fail-fast.
        if (error.data?.code === "NOT_FOUND") {
          return shouldRetryTraceArrival(failureCount);
        }
        return failureCount < 3;
      },
      retryDelay: (failureCount, error) => {
        if (error.data?.code === "NOT_FOUND") {
          return getTraceArrivalRetryDelayMs(failureCount);
        }
        // TanStack default: min(1000 * 2^failureCount, 30000)
        return Math.min(1_000 * 2 ** failureCount, 30_000);
      },
      // The ErrorPage owns the settled miss UX — don't also toast 404s from the
      // global query cache (including the final exhausted attempt).
      meta: { silentHttpCodes: [404] },
      staleTime: 60 * 1000,
    },
  );

  // New path: events table (beta ON).
  const eventsData = useEventsTraceData({
    projectId,
    traceId: traceId ?? "",
    timestamp,
    enabled:
      enabled &&
      !!traceId &&
      !!projectId &&
      !isTraceSourceLoading &&
      useEventsTraceSource,
  });

  if (isTraceSourceLoading) {
    return {
      data: undefined,
      isLoading: true,
      error: null,
      isError: false,
      isNotFound: false,
      isUnauthorized: false,
      isWaitingForTrace: false,
      truncatedAtObservations: undefined,
    };
  }

  if (useEventsTraceSource) {
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
      // While empty-result backoff is still running, keep isNotFound false.
      isNotFound:
        !eventsData.isLoading &&
        !eventsData.data &&
        !eventsData.error &&
        !eventsData.isWaitingForTrace,
      isUnauthorized,
      isWaitingForTrace: eventsData.isWaitingForTrace,
      truncatedAtObservations: eventsData.truncatedAtObservations,
    };
  }

  const isUnauthorized = tracesQuery.error?.data?.code === "UNAUTHORIZED";
  const isNotFoundError = tracesQuery.error?.data?.code === "NOT_FOUND";
  // fetchFailureCount > 0 means at least one miss already happened and TanStack
  // is still in the retry/backoff window (isFetching stays true across delays).
  const isWaitingForTrace =
    !tracesQuery.data &&
    !isUnauthorized &&
    tracesQuery.isFetching &&
    tracesQuery.failureCount > 0 &&
    !tracesQuery.isError;

  return {
    data: tracesQuery.data,
    isLoading: tracesQuery.isLoading,
    error: tracesQuery.error,
    isError: tracesQuery.isError,
    // Settled NOT_FOUND only — during arrival retries isError is still false.
    isNotFound: isNotFoundError && tracesQuery.isError,
    isUnauthorized,
    isWaitingForTrace,
    // The traces-table read path has no row cap.
    truncatedAtObservations: undefined,
  };
}
