import { useMemo } from "react";
import { api, sendAsPostOption } from "@/src/utils/api";
import {
  adaptEventsToTraceFormat,
  type AdaptedTraceData,
  type EventsTraceObservation,
} from "@/src/features/events/lib/eventsToTraceAdapter";
import {
  filterAndValidateDbScoreList,
  ScoreDataTypeArray,
  ScoreDataTypeEnum,
  type ScoreDomain,
} from "@langfuse/shared";
import {
  type WithStringifiedMetadata,
  toDomainArrayWithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import { partition } from "lodash";
import { getTraceArrivalEmptyRefetchIntervalMs } from "@/src/features/events/lib/traceArrivalRetry";

interface UseEventsTraceDataProps {
  projectId: string;
  traceId: string;
  timestamp?: Date;
  enabled?: boolean;
}

interface UseEventsTraceDataResult {
  data:
    | (AdaptedTraceData["trace"] & {
        observations: AdaptedTraceData["observations"];
        scores: WithStringifiedMetadata<ScoreDomain>[];
        corrections: ScoreDomain[];
      })
    | undefined;
  isLoading: boolean;
  error: unknown;
  /**
   * True while an empty events result is still being retried — the trace may
   * still be ingesting. Distinct from `isLoading` (first paint).
   */
  isWaitingForTrace: boolean;
  /**
   * The observation cap this trace was loaded under, set ONLY when the trace hit
   * it (so the list is missing its chronological tail). The number comes from the
   * server response — never a client-side copy of the constant.
   */
  truncatedAtObservations: number | undefined;
}

/**
 * Hook to fetch trace data from the events table instead of traces table.
 * Used when v4 beta mode is enabled.
 *
 * Data flow:
 * 1. Fetch all observations for the trace via events.all (without I/O)
 * 2. Find root observation (no parentObservationId)
 * 3. Fetch root observation's I/O via events.batchIO
 * 4. Fetch scores via getScoresAndCorrectionsForTraces
 * 5. Synthesize trace object from observations
 */
export function useEventsTraceData(
  props: UseEventsTraceDataProps,
): UseEventsTraceDataResult {
  const { projectId, traceId, enabled = true } = props;

  // Step 1: Fetch all observations for this trace (without I/O for performance).
  // A missing trace usually returns an empty observation list (success), not a
  // NOT_FOUND error — so arrival lag is handled via refetchInterval backoff
  // rather than `retry`.
  const eventsQuery = api.events.byTraceId.useQuery(
    {
      projectId,
      traceId,
      timestamp: props.timestamp,
    },
    {
      enabled: enabled && !!traceId,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
      refetchInterval: (query) => {
        const observations = query.state.data?.observations;
        if (!query.state.data) return false;
        if (observations && observations.length > 0) return false;
        return getTraceArrivalEmptyRefetchIntervalMs(
          query.state.dataUpdateCount,
        );
      },
      refetchIntervalInBackground: false,
      staleTime: 60 * 1000, // 1 minute
    },
  );

  // Step 2: Find root observation and calculate time range for batchIO
  const observations = eventsQuery.data?.observations as
    | EventsTraceObservation[]
    | undefined;

  const rootObservation = useMemo(() => {
    if (!observations?.length) return null;
    return observations.find((o) => !o.parentObservationId);
  }, [observations]);

  // Prefer the root observation when present, otherwise fall back to the earliest one.
  const primaryObservation = useMemo(() => {
    if (!observations?.length) return null;
    if (rootObservation) return rootObservation;
    // Fallback to earliest observation
    return (
      [...observations].sort(
        (a, b) => a.startTime.getTime() - b.startTime.getTime(),
      )[0] ?? null
    );
  }, [observations, rootObservation]);

  const timeRange = useMemo(() => {
    if (!observations?.length) return null;
    const times = observations.map((o) => o.startTime.getTime());
    return {
      min: new Date(Math.min(...times)),
      max: new Date(Math.max(...times)),
    };
  }, [observations]);

  // Step 3: Fetch I/O for the primary trace observation.
  const rootIOQuery = api.events.batchIO.useQuery(
    {
      projectId,
      traceId,
      observations: primaryObservation
        ? [{ id: primaryObservation.id, traceId }]
        : [],
      minStartTime: timeRange?.min ?? new Date(),
      maxStartTime: timeRange?.max ?? new Date(),
      truncated: false,
    },
    {
      ...sendAsPostOption,
      enabled:
        enabled && !!primaryObservation && !!timeRange && !!eventsQuery.data,
      staleTime: 60 * 1000,
    },
  );

  // Step 4: Fetch scores for the trace
  const scoresQuery = api.events.scoresForTrace.useQuery(
    { traceId, projectId, timestamp: props.timestamp },
    {
      enabled: enabled && !!traceId,
      staleTime: 60 * 1000,
    },
  );

  // Step 5: Transform and merge data
  const transformed = useMemo(() => {
    if (!observations?.length) return null;

    // Validate and partition scores
    const validatedScores = filterAndValidateDbScoreList({
      scores: scoresQuery.data ?? [],
      dataTypes: [...ScoreDataTypeArray],
      onParseError: (e) => {
        console.error("[useEventsTraceData] Score validation error:", e);
      },
    });

    const [corrections, scores] = partition(
      validatedScores,
      (s) => s.dataType === ScoreDataTypeEnum.CORRECTION,
    );

    const scoresDomain = toDomainArrayWithStringifiedMetadata(scores);

    const rootIO = rootIOQuery.data?.[0];

    // Adapt events to trace format
    const adapted = adaptEventsToTraceFormat({
      events: observations,
      traceId,
      rootIO: rootIO
        ? {
            input: rootIO.input,
            output: rootIO.output,
            metadata: rootIO.metadata,
          }
        : undefined,
    });

    return {
      ...adapted.trace,
      observations: adapted.observations,
      scores: scoresDomain,
      corrections,
    };
  }, [observations, traceId, rootIOQuery.data, scoresQuery.data]);

  const observationsEmpty =
    !!eventsQuery.data &&
    ((eventsQuery.data.observations as EventsTraceObservation[] | undefined)
      ?.length ?? 0) === 0;
  // Still inside the empty-result backoff window (same 4 retries as the traces
  // path). Between interval ticks isFetching is false, so key off the count.
  const isWaitingForTrace =
    observationsEmpty &&
    getTraceArrivalEmptyRefetchIntervalMs(eventsQuery.dataUpdateCount) !==
      false;

  return {
    data: transformed ?? undefined,
    isLoading: eventsQuery.isLoading || scoresQuery.isLoading,
    error: eventsQuery.error || scoresQuery.error,
    isWaitingForTrace,
    truncatedAtObservations: eventsQuery.data?.cutoffObservationsAfterMaxCount
      ? eventsQuery.data.maxObservationsPerTrace
      : undefined,
  };
}
