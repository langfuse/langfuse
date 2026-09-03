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

interface UseEventsTraceDataProps {
  projectId: string;
  traceId: string;
  timestamp?: Date;
  enabled?: boolean;
  scopeToSession: boolean;
}

interface UseEventsTraceDataResult {
  data:
    | (AdaptedTraceData["trace"] & {
        observations: AdaptedTraceData["observations"];
        scores: WithStringifiedMetadata<ScoreDomain>[];
        corrections: ScoreDomain[];
        sessionTraceEntries?: Array<{
          trace: AdaptedTraceData["trace"];
          observations: AdaptedTraceData["observations"];
          scores: WithStringifiedMetadata<ScoreDomain>[];
          corrections: ScoreDomain[];
        }>;
      })
    | undefined;
  isLoading: boolean;
  error: unknown;
  isSessionScopeUnavailable: boolean;
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
  const { projectId, traceId, enabled = true, scopeToSession } = props;

  // Step 1: Fetch all observations for this trace (without I/O for performance)
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

  const sessionId = transformed?.sessionId ?? "";
  const sessionQueryEnabled = enabled && scopeToSession && !!sessionId;
  const sessionTraceSummariesQuery = api.sessions.tracesFromEvents.useQuery(
    { projectId, sessionId, includeScores: false },
    { enabled: sessionQueryEnabled, staleTime: 60 * 1000 },
  );
  const sessionObservationsQuery =
    api.sessions.observationsForSessionFromEvents.useQuery(
      { projectId, sessionId },
      { enabled: sessionQueryEnabled, staleTime: 60 * 1000 },
    );

  const sessionScopedData = useMemo(() => {
    if (
      !transformed ||
      !sessionId ||
      !sessionTraceSummariesQuery.data ||
      !sessionObservationsQuery.data
    ) {
      return undefined;
    }

    const sessionObservations = sessionObservationsQuery.data
      .observations as EventsTraceObservation[];
    const observationsByTraceId = new Map<string, EventsTraceObservation[]>();
    for (const observation of sessionObservations) {
      if (!observation.traceId) continue;
      const traceObservations = observationsByTraceId.get(observation.traceId);
      if (traceObservations) traceObservations.push(observation);
      else observationsByTraceId.set(observation.traceId, [observation]);
    }

    const sessionTraceEntries = sessionTraceSummariesQuery.data.map(
      (traceSummary) => {
        const traceObservations =
          observationsByTraceId.get(traceSummary.id) ?? [];
        const adapted = traceObservations.length
          ? adaptEventsToTraceFormat({
              events: traceObservations,
              traceId: traceSummary.id,
            })
          : {
              trace: {
                id: traceSummary.id,
                projectId,
                name: traceSummary.name,
                timestamp: traceSummary.timestamp,
                input: null,
                output: null,
                metadata: "{}",
                tags: [],
                bookmarked: false,
                public: false,
                release: null,
                version: null,
                userId: traceSummary.userId,
                sessionId,
                environment: traceSummary.environment ?? "default",
                latency:
                  traceSummary.latencyMs === null
                    ? undefined
                    : traceSummary.latencyMs / 1000,
                createdAt: traceSummary.timestamp,
                updatedAt: traceSummary.timestamp,
              },
              observations: [],
            };

        if (traceSummary.id === transformed.id) {
          return {
            trace: transformed,
            observations: adapted.observations,
            scores: transformed.scores,
            corrections: transformed.corrections,
          };
        }

        return {
          trace: {
            ...adapted.trace,
            name: traceSummary.name,
            timestamp: traceSummary.timestamp,
            userId: traceSummary.userId,
            environment: traceSummary.environment ?? adapted.trace.environment,
            latency:
              traceSummary.latencyMs === null
                ? adapted.trace.latency
                : traceSummary.latencyMs / 1000,
          },
          observations: adapted.observations,
          scores: [],
          corrections: [],
        };
      },
    );

    return {
      ...transformed,
      observations: sessionTraceEntries.flatMap((entry) => entry.observations),
      sessionTraceEntries,
    };
  }, [
    projectId,
    sessionId,
    sessionObservationsQuery.data,
    sessionTraceSummariesQuery.data,
    transformed,
  ]);

  const isSessionScopeUnavailable =
    scopeToSession && !!transformed && !transformed.sessionId;
  const isSessionLoading =
    scopeToSession &&
    !!transformed &&
    !!transformed.sessionId &&
    (sessionTraceSummariesQuery.isLoading ||
      sessionObservationsQuery.isLoading);

  return {
    data: scopeToSession ? sessionScopedData : (transformed ?? undefined),
    isLoading:
      eventsQuery.isLoading || scoresQuery.isLoading || isSessionLoading,
    error:
      eventsQuery.error ||
      scoresQuery.error ||
      sessionTraceSummariesQuery.error ||
      sessionObservationsQuery.error,
    isSessionScopeUnavailable,
    truncatedAtObservations: scopeToSession
      ? sessionObservationsQuery.data?.cutoffObservationsAfterMaxCount
        ? sessionObservationsQuery.data.maxObservationsPerSession
        : undefined
      : eventsQuery.data?.cutoffObservationsAfterMaxCount
        ? eventsQuery.data.maxObservationsPerTrace
        : undefined,
  };
}
