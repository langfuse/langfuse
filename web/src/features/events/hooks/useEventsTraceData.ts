import { useMemo } from "react";
import { api } from "@/src/utils/api";
import {
  adaptEventsToTraceFormat,
  type AdaptedTraceData,
} from "@/src/features/events/lib/eventsToTraceAdapter";
import {
  filterAndValidateDbScoreList,
  AGGREGATABLE_SCORE_TYPES,
  ScoreDataTypeEnum,
  type ScoreDomain,
} from "@langfuse/shared";
import {
  type WithStringifiedMetadata,
  toDomainArrayWithStringifiedMetadata,
} from "@/src/utils/clientSideDomainTypes";
import { partition } from "lodash";

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

  // Step 1: Fetch all observations for this trace (without I/O for performance)
  // TODO: paginationZod caps limit at 100 - for traces with >100 observations,
  // implement pagination or create a dedicated byTraceId endpoint with higher limit
  const eventsQuery = api.events.all.useQuery(
    {
      projectId,
      filter: [
        { column: "traceId", operator: "=", value: traceId, type: "string" },
      ],
      searchQuery: null,
      searchType: [],
      orderBy: { column: "startTime", order: "ASC" },
      page: 1,
      limit: 100,
    },
    {
      enabled: enabled && !!traceId,
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
      staleTime: 60 * 1000, // 1 minute
    },
  );

  // Step 2: Find root observation and calculate time range for batchIO
  const rootObservation = useMemo(() => {
    if (!eventsQuery.data?.observations?.length) return null;
    return eventsQuery.data.observations.find((o) => !o.parentObservationId);
  }, [eventsQuery.data]);

  const timeRange = useMemo(() => {
    if (!eventsQuery.data?.observations?.length) return null;
    const times = eventsQuery.data.observations.map((o) =>
      o.startTime.getTime(),
    );
    return {
      min: new Date(Math.min(...times)),
      max: new Date(Math.max(...times)),
    };
  }, [eventsQuery.data]);

  // Step 3: Fetch I/O for root observation (for trace-level I/O display)
  const rootIOQuery = api.events.batchIO.useQuery(
    {
      projectId,
      observations: rootObservation
        ? [{ id: rootObservation.id, traceId }]
        : [],
      minStartTime: timeRange?.min ?? new Date(),
      maxStartTime: timeRange?.max ?? new Date(),
    },
    {
      enabled:
        enabled && !!rootObservation && !!timeRange && !!eventsQuery.data,
      staleTime: 60 * 1000,
    },
  );

  // Step 4: Fetch scores for the trace
  const scoresQuery = api.events.scoresForTrace.useQuery(
    { traceId, projectId },
    {
      enabled: enabled && !!traceId,
      staleTime: 60 * 1000,
    },
  );

  // Step 5: Transform and merge data
  const transformed = useMemo(() => {
    if (!eventsQuery.data?.observations?.length) return null;

    // Validate and partition scores
    const validatedScores = filterAndValidateDbScoreList({
      scores: scoresQuery.data ?? [],
      dataTypes: [...AGGREGATABLE_SCORE_TYPES, ScoreDataTypeEnum.CORRECTION],
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
      events: eventsQuery.data.observations,
      traceId,
      rootIO: rootIO
        ? { input: rootIO.input, output: rootIO.output }
        : undefined,
    });

    return {
      ...adapted.trace,
      observations: adapted.observations,
      scores: scoresDomain,
      corrections,
    };
  }, [eventsQuery.data, traceId, rootIOQuery.data, scoresQuery.data]);

  return {
    data: transformed ?? undefined,
    isLoading: eventsQuery.isLoading || scoresQuery.isLoading,
    error: eventsQuery.error || scoresQuery.error,
  };
}
