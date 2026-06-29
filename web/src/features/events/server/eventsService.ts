import { type z } from "zod";
import {
  type FilterCondition,
  LISTABLE_SCORE_TYPES,
  filterAndValidateDbScoreList,
} from "@langfuse/shared";
import {
  getObservationsCountFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getCategoricalScoresGroupedByName,
  getEventsGroupedByModel,
  getEventsGroupedByModelId,
  getEventsGroupedByName,
  getEventsGroupedByTraceName,
  getEventsGroupedByTraceTags,
  getEventsGroupedByPromptName,
  getEventsGroupedByType,
  getEventsGroupedByUserId,
  getEventsGroupedByVersion,
  getEventsGroupedBySessionId,
  getEventsGroupedByLevel,
  getEventsGroupedByEnvironment,
  getEventsGroupedByExperimentDatasetId,
  getEventsGroupedByExperimentId,
  getEventsGroupedByExperimentName,
  getEventsGroupedByHasParentObservation,
  getEventsGroupedByToolName,
  getEventsGroupedByCalledToolName,
  getNumericScoresGroupedByName,
  getScoresGroupedByNameSourceType,
  getObservationsBatchIOFromEventsTable,
  getScoresForObservations,
  getScoresForTraces,
  traceException,
} from "@langfuse/shared/src/server";
import { type timeFilter, type FilterState } from "@langfuse/shared";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";

type TimeFilter = z.infer<typeof timeFilter>;

const TRACE_SCORE_SCOPE_FILTER: FilterCondition[] = [
  {
    type: "null",
    column: "traceId",
    operator: "is not null",
    value: "",
  },
  {
    type: "null",
    column: "observationId",
    operator: "is null",
    value: "",
  },
];

interface GetObservationsListParams {
  projectId: string;
  filter: any[];
  searchQuery?: string;
  searchType: any[];
  orderBy: any;
  page: number;
  limit: number;
}

interface GetObservationsCountParams {
  projectId: string;
  filter: any[];
  searchQuery?: string;
  searchType: any[];
  orderBy: any;
}

interface GetObservationsFilterOptionsParams {
  projectId: string;
  startTimeFilter?: TimeFilter[];
  hasParentObservation?: boolean;
}

/**
 * Get paginated list of events
 */
export async function getEventList(params: GetObservationsListParams) {
  const queryOpts = {
    projectId: params.projectId,
    filter: params.filter,
    searchQuery: params.searchQuery,
    searchType: params.searchType,
    orderBy: params.orderBy,
    limit: params.limit,
    offset: (params.page - 1) * params.limit, // Page is 1-indexed (page 1 = offset 0)
    selectIOAndMetadata: false, // Exclude I/O for performance - fetched separately via batchIO endpoint
    renderingProps: { truncated: true, shouldJsonParse: false },
  };

  const observations =
    await getObservationsWithModelDataFromEventsTable(queryOpts);

  if (observations.length === 0) {
    return { observations };
  }

  const traceIds = Array.from(
    new Set(
      observations
        .map((observation) => observation.traceId)
        .filter((traceId): traceId is string => Boolean(traceId)),
    ),
  );

  // Earliest observation startTime on this page — used as a partition-pruning
  // lower bound for observation-level scores.  Safe because
  // score.timestamp >= observation.start_time - 1 hour
  // (SCORE_TO_TRACE_OBSERVATIONS_INTERVAL).
  const minStartTime = observations.reduce(
    (min, obs) => (obs.startTime < min ? obs.startTime : min),
    observations[0].startTime,
  );

  // For trace-level scores the bound must account for the fact that
  // trace.timestamp can be up to 2 days before observation.start_time
  // (OBSERVATIONS_TO_TRACE_INTERVAL).  The events table does not carry
  // trace timestamps, so we derive a safe lower bound:
  //   minStartTime - 2 days  (earliest possible trace.timestamp)
  // getScoresForTraces then applies its own 1-hour buffer, giving:
  //   s.timestamp >= (minStartTime - 2 days) - 1 hour
  const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;
  const minTraceTimestamp = new Date(minStartTime.getTime() - TWO_DAYS_MS);

  const [scores, traceScores] = await Promise.all([
    getScoresForObservations({
      projectId: params.projectId,
      observationIds: observations.map((observation) => observation.id),
      minTimestamp: minStartTime,
      excludeMetadata: true,
      includeHasMetadata: true,
    }),
    traceIds.length > 0
      ? getScoresForTraces({
          projectId: params.projectId,
          traceIds,
          timestamp: minTraceTimestamp,
          excludeMetadata: true,
          includeHasMetadata: true,
        })
      : Promise.resolve([]),
  ]);

  const validatedScores = filterAndValidateDbScoreList({
    scores,
    dataTypes: LISTABLE_SCORE_TYPES,
    includeHasMetadata: true,
    onParseError: traceException,
  });
  const validatedTraceScores = filterAndValidateDbScoreList({
    scores: traceScores,
    dataTypes: LISTABLE_SCORE_TYPES,
    includeHasMetadata: true,
    onParseError: traceException,
  });

  const scoresByObservationId = new Map<
    string,
    Array<(typeof validatedScores)[number]>
  >();
  for (const score of validatedScores) {
    if (!score.observationId) continue;
    const existingScores = scoresByObservationId.get(score.observationId);
    if (existingScores) {
      existingScores.push(score);
    } else {
      scoresByObservationId.set(score.observationId, [score]);
    }
  }

  const scoresByTraceId = new Map<
    string,
    Array<(typeof validatedTraceScores)[number]>
  >();
  for (const score of validatedTraceScores) {
    // Trace-level scores have traceId set and no observationId
    if (!score.traceId || score.observationId) continue;
    const existingScores = scoresByTraceId.get(score.traceId);
    if (existingScores) {
      existingScores.push(score);
    } else {
      scoresByTraceId.set(score.traceId, [score]);
    }
  }

  const observationsWithScores = observations.map((observation) => ({
    ...observation,
    scores: aggregateScores(scoresByObservationId.get(observation.id) ?? []),
    traceScores: observation.traceId
      ? aggregateScores(scoresByTraceId.get(observation.traceId) ?? [])
      : {},
  }));

  return { observations: observationsWithScores };
}

/**
 * Get total count of events matching filters
 */
export async function getEventCount(params: GetObservationsCountParams) {
  const queryOpts = {
    projectId: params.projectId,
    filter: params.filter,
    searchQuery: params.searchQuery,
    searchType: params.searchType,
    orderBy: params.orderBy,
    limit: 1,
    offset: 0,
  };

  const totalCount = await getObservationsCountFromEventsTable(queryOpts);

  return { totalCount };
}

/**
 * Get all available filter options for events table
 */
export async function getEventFilterOptions(
  params: GetObservationsFilterOptionsParams,
) {
  const { projectId, startTimeFilter, hasParentObservation } = params;

  // Build filter with optional hasParentObservation for scoping filter options
  const eventsFilter: FilterState = [
    ...(startTimeFilter ?? []),
    ...(hasParentObservation !== undefined
      ? [
          {
            column: "hasParentObservation" as const,
            type: "boolean" as const,
            operator: "=" as const,
            value: hasParentObservation,
          },
        ]
      : []),
  ];

  // Map startTimeFilter to Timestamp column for trace queries
  const traceTimestampFilters =
    startTimeFilter && startTimeFilter.length > 0
      ? startTimeFilter.map((f) => ({
          column: "Timestamp" as const,
          operator: f.operator,
          value: f.value,
          type: "datetime" as const,
        }))
      : [];
  const traceScoreTimestampFilters: FilterCondition[] =
    startTimeFilter && startTimeFilter.length > 0
      ? startTimeFilter.map((f) => ({
          column: "timestamp",
          operator: f.operator,
          value: f.value,
          type: "datetime",
        }))
      : [];

  const [
    numericScoreNames,
    categoricalScoreNames,
    traceScoreColumns,
    providedModelName,
    name,
    promptNames,
    traceTags,
    traceNames,
    modelId,
    types,
    userIds,
    versions,
    sessionIds,
    levels,
    environments,
    experimentDatasetIds,
    experimentIds,
    experimentNames,
    hasParentObservationResults,
    toolNames,
    calledToolNames,
  ] = await Promise.all([
    getNumericScoresGroupedByName(projectId, traceTimestampFilters),
    getCategoricalScoresGroupedByName(projectId, traceTimestampFilters),
    getScoresGroupedByNameSourceType({
      projectId,
      filter: [...TRACE_SCORE_SCOPE_FILTER, ...traceScoreTimestampFilters],
    }),
    getEventsGroupedByModel(projectId, eventsFilter),
    getEventsGroupedByName(projectId, eventsFilter),
    getEventsGroupedByPromptName(projectId, eventsFilter),
    getEventsGroupedByTraceTags(projectId, eventsFilter),
    getEventsGroupedByTraceName(projectId, eventsFilter),
    getEventsGroupedByModelId(projectId, eventsFilter),
    getEventsGroupedByType(projectId, eventsFilter),
    getEventsGroupedByUserId(projectId, eventsFilter),
    getEventsGroupedByVersion(projectId, eventsFilter),
    getEventsGroupedBySessionId(projectId, eventsFilter),
    getEventsGroupedByLevel(projectId, eventsFilter),
    getEventsGroupedByEnvironment(projectId, eventsFilter),
    getEventsGroupedByExperimentDatasetId(projectId, eventsFilter),
    getEventsGroupedByExperimentId(projectId, eventsFilter),
    getEventsGroupedByExperimentName(projectId, eventsFilter),
    getEventsGroupedByHasParentObservation(projectId, eventsFilter),
    getEventsGroupedByToolName(projectId, eventsFilter),
    getEventsGroupedByCalledToolName(projectId, eventsFilter),
  ]);
  const traceNumericScoreNames = Array.from(
    new Set(
      traceScoreColumns
        .filter(
          (score) =>
            score.dataType === "NUMERIC" || score.dataType === "BOOLEAN",
        )
        .map((score) => score.name),
    ),
  );
  const traceCategoricalScoreNames = new Set(
    traceScoreColumns
      .filter((score) => score.dataType === "CATEGORICAL")
      .map((score) => score.name),
  );

  return {
    providedModelName: providedModelName
      .filter((i) => i.model !== null)
      .map((i) => ({ value: i.model as string, count: i.count })),
    modelId: modelId
      .filter((i) => i.modelId !== null)
      .map((i) => ({
        value: i.modelId as string,
        count: i.count,
      })),
    name: name
      .filter((i) => i.name !== null)
      .map((i) => ({ value: i.name as string, count: i.count })),
    scores_avg: numericScoreNames.map((score) => score.name),
    score_categories: categoricalScoreNames,
    trace_scores_avg: traceNumericScoreNames,
    trace_score_categories: categoricalScoreNames.filter((score) =>
      traceCategoricalScoreNames.has(score.label),
    ),
    promptName: promptNames
      .filter((i) => i.promptName !== null)
      .map((i) => ({
        value: i.promptName as string,
        count: i.count,
      })),
    traceTags: traceTags
      .filter((i) => i.tag !== null)
      .map((i) => ({
        value: i.tag as string,
      })),
    traceName: traceNames
      .filter((i) => i.traceName !== null)
      .map((i) => ({
        value: i.traceName as string,
        count: i.count,
      })),
    type: types
      .filter((i) => i.type !== null)
      .map((i) => ({
        value: i.type as string,
        count: i.count,
      })),
    userId: userIds
      .filter((i) => i.userId !== null)
      .map((i) => ({
        value: i.userId as string,
        count: i.count,
      })),
    version: versions
      .filter((i) => i.version !== null)
      .map((i) => ({
        value: i.version as string,
        count: i.count,
      })),
    sessionId: sessionIds
      .filter((i) => i.sessionId !== null)
      .map((i) => ({
        value: i.sessionId as string,
        count: i.count,
      })),
    level: levels
      .filter((i) => i.level !== null)
      .map((i) => ({
        value: i.level as string,
        count: i.count,
      })),
    environment: environments
      .filter((i) => i.environment !== null)
      .map((i) => ({
        value: i.environment as string,
        count: i.count,
      })),
    experimentDatasetId: experimentDatasetIds
      .filter((i) => i.experimentDatasetId !== null)
      .map((i) => ({
        value: i.experimentDatasetId as string,
        count: i.count,
      })),
    experimentId: experimentIds
      .filter((i) => i.experimentId !== null)
      .map((i) => ({
        value: i.experimentId as string,
        count: i.count,
      })),
    experimentName: experimentNames
      .filter((i) => i.experimentName !== null)
      .map((i) => ({
        value: i.experimentName as string,
        count: i.count,
      })),
    hasParentObservation: hasParentObservationResults.map((i) => ({
      // ClickHouse returns UInt8 (0/1) for computed boolean; normalize to "true"/"false"
      value: i.hasParentObservation ? "true" : "false",
      count: i.count,
    })),
    toolNames: toolNames
      .filter((i) => i.toolName !== null)
      .map((i) => ({ value: i.toolName as string })),
    calledToolNames: calledToolNames
      .filter((i) => i.calledToolName !== null)
      .map((i) => ({ value: i.calledToolName as string })),
  };
}

interface GetEventBatchIOParams {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean;
}

/**
 * Batch fetch input/output and metadata for multiple observations
 */
export async function getEventBatchIO(params: GetEventBatchIOParams) {
  return getObservationsBatchIOFromEventsTable({
    projectId: params.projectId,
    observations: params.observations,
    minStartTime: params.minStartTime,
    maxStartTime: params.maxStartTime,
    truncated: params.truncated,
  });
}
