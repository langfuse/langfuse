import { type z } from "zod";
import {
  type FilterCondition,
  type MetadataDomain,
  eventsTableCols,
  LISTABLE_SCORE_TYPES,
  filterAndValidateDbScoreList,
} from "@langfuse/shared";
import {
  createFilterFromFilterState,
  EventsQueryBuilder,
  eventsTableUiColumnDefinitions,
  FilterList,
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
  parseMetadataCHRecordToDomain,
  queryClickhouse,
  getScoresForObservations,
  getScoresForTraces,
  traceException,
} from "@langfuse/shared/src/server";
import { type timeFilter, type FilterState } from "@langfuse/shared";
import { aggregateScores } from "@/src/features/scores/lib/aggregateScores";
import { assertUnreachable } from "@/src/utils/types";

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
  observationType?: string;
}

type EventFilterValueOption = {
  value: string;
  count?: number;
};

type GroupedEventsFilterOptions = {
  extraWhereRaw?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
};

type ExperimentEvalPreviewObservation = {
  id: string;
  traceId: string;
  input: string | null;
  output: string | null;
  metadata: MetadataDomain;
  experimentItemExpectedOutput: string | null;
  experimentItemMetadata: MetadataDomain;
};

const experimentRootObservationFilter = {
  type: "boolean",
  column: "isExperimentItemRootSpan",
  operator: "=",
  value: true,
} satisfies FilterCondition;

export async function getExperimentEvalPreviewObservation(params: {
  projectId: string;
  filter: FilterState;
  traceId?: string;
  observationId?: string;
}): Promise<ExperimentEvalPreviewObservation | null> {
  const filter = new FilterList(
    createFilterFromFilterState(
      [...params.filter, experimentRootObservationFilter],
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const queryBuilder = new EventsQueryBuilder({ projectId: params.projectId })
    .selectRaw(
      "e.span_id AS id",
      'e.trace_id AS "traceId"',
      "e.input AS input",
      "e.output AS output",
      "mapFromArrays(arrayReverse(e.metadata_names), arrayReverse(e.metadata_values)) AS metadata",
      'e.experiment_item_expected_output AS "experimentItemExpectedOutput"',
      'mapFromArrays(e.experiment_item_metadata_names, e.experiment_item_metadata_values) AS "experimentItemMetadata"',
    )
    .forceFullTable()
    .applyFilters(filter)
    .whereRaw("e.is_deleted = 0")
    .when(Boolean(params.observationId), (b) =>
      b.whereRaw("e.span_id = {observationId: String}", {
        observationId: params.observationId!,
      }),
    )
    .when(Boolean(params.traceId), (b) =>
      b.whereRaw("e.trace_id = {traceId: String}", {
        traceId: params.traceId!,
      }),
    )
    .orderByDefault()
    .limit(1, 0);

  const { query, params: queryParams } = queryBuilder.buildWithParams();
  const rows = await queryClickhouse<{
    id: string;
    traceId: string;
    input: string | null;
    output: string | null;
    metadata: Record<string, string>;
    experimentItemExpectedOutput: string | null;
    experimentItemMetadata: Record<string, string>;
  }>({
    query,
    params: queryParams,
    tags: {
      feature: "evals",
      type: "events",
      kind: "experiment-preview",
      projectId: params.projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  const row = rows[0];
  if (!row) return null;

  return {
    ...row,
    metadata: parseMetadataCHRecordToDomain(row.metadata ?? {}),
    experimentItemMetadata: parseMetadataCHRecordToDomain(
      row.experimentItemMetadata ?? {},
    ),
  };
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

const toFilterValueOptions = <
  TKey extends string,
  TItem extends Record<TKey, string | null> & { count: number },
>(
  items: TItem[],
  key: TKey,
) =>
  items.flatMap((item) => {
    const value = item[key];
    return value === null ? [] : [{ value, count: item.count }];
  });

const getEventFilterOptionsScope = (
  params: GetObservationsFilterOptionsParams,
) => {
  const { startTimeFilter, hasParentObservation, observationType } = params;

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
    ...(observationType
      ? [
          {
            column: "type" as const,
            type: "string" as const,
            operator: "=" as const,
            value: observationType,
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

  return {
    eventsFilter,
    traceTimestampFilters,
    traceScoreTimestampFilters,
  };
};

export async function getEventFilterValuePage(
  params: GetObservationsFilterOptionsParams & {
    column:
      | "traceTags"
      | "hasParentObservation"
      | "providedModelName"
      | "modelId"
      | "name"
      | "traceName"
      | "type"
      | "userId"
      | "version"
      | "sessionId"
      | "level"
      | "environment"
      | "promptName";
    limit: number;
    offset: number;
  },
) {
  const { projectId, column, limit, offset } = params;
  const { eventsFilter } = getEventFilterOptionsScope(params);
  const queryLimit = limit + 1;

  const createResultFromGroupedQuery = async <T>(
    query: (
      projectId: string,
      filter: FilterState,
      opts?: GroupedEventsFilterOptions,
    ) => Promise<Array<T & { count?: number }>>,
    valueGetter: (item: T) => string,
  ) => {
    const values = await query(projectId, eventsFilter, {
      limit: queryLimit,
      offset,
    }).then((items) =>
      items.map(
        (item) =>
          ({
            value: valueGetter(item),
            count: item.count,
          }) satisfies EventFilterValueOption,
      ),
    );

    return {
      values: values.slice(0, limit),
      nextOffset: values.length > limit ? offset + limit : undefined,
    };
  };

  if (column === "hasParentObservation") {
    return createResultFromGroupedQuery(
      getEventsGroupedByHasParentObservation,
      (item) => (item.hasParentObservation ? "true" : "false"),
    );
  }

  if (column === "traceTags") {
    // Trace tags do not support counting right now
    return createResultFromGroupedQuery(
      getEventsGroupedByTraceTags,
      (item) => item.tag,
    );
  }

  if (column === "providedModelName") {
    return createResultFromGroupedQuery(
      getEventsGroupedByModel,
      (item) => item.model,
    );
  }

  if (column === "modelId") {
    return createResultFromGroupedQuery(
      getEventsGroupedByModelId,
      (item) => item.modelId,
    );
  }

  if (column === "name") {
    return createResultFromGroupedQuery(
      getEventsGroupedByName,
      (item) => item.name,
    );
  }

  if (column === "traceName") {
    return createResultFromGroupedQuery(
      getEventsGroupedByTraceName,
      (item) => item.traceName,
    );
  }

  if (column === "type") {
    return createResultFromGroupedQuery(
      getEventsGroupedByType,
      (item) => item.type,
    );
  }

  if (column === "userId") {
    return createResultFromGroupedQuery(
      getEventsGroupedByUserId,
      (item) => item.userId,
    );
  }

  if (column === "version") {
    return createResultFromGroupedQuery(
      getEventsGroupedByVersion,
      (item) => item.version,
    );
  }

  if (column === "sessionId") {
    return createResultFromGroupedQuery(
      getEventsGroupedBySessionId,
      (item) => item.sessionId,
    );
  }

  if (column === "level") {
    return createResultFromGroupedQuery(
      getEventsGroupedByLevel,
      (item) => item.level,
    );
  }

  if (column === "environment") {
    return createResultFromGroupedQuery(
      getEventsGroupedByEnvironment,
      (item) => item.environment,
    );
  }

  if (column === "promptName") {
    return createResultFromGroupedQuery(
      getEventsGroupedByPromptName,
      (item) => item.promptName,
    );
  }

  return assertUnreachable(column);
}

/**
 * Get all available filter options for events table
 */
export async function getEventFilterOptions(
  params: GetObservationsFilterOptionsParams,
) {
  const { projectId } = params;
  const { eventsFilter, traceTimestampFilters, traceScoreTimestampFilters } =
    getEventFilterOptionsScope(params);

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
    providedModelName: toFilterValueOptions(providedModelName, "model"),
    modelId: toFilterValueOptions(modelId, "modelId"),
    name: toFilterValueOptions(name, "name"),
    scores_avg: numericScoreNames.map((score) => score.name),
    score_categories: categoricalScoreNames,
    trace_scores_avg: traceNumericScoreNames,
    trace_score_categories: categoricalScoreNames.filter((score) =>
      traceCategoricalScoreNames.has(score.label),
    ),
    promptName: toFilterValueOptions(promptNames, "promptName"),
    traceTags: traceTags
      .filter((i) => i.tag !== null)
      .map((i) => ({
        value: i.tag,
      })),
    traceName: toFilterValueOptions(traceNames, "traceName"),
    type: toFilterValueOptions(types, "type"),
    userId: toFilterValueOptions(userIds, "userId"),
    version: toFilterValueOptions(versions, "version"),
    sessionId: toFilterValueOptions(sessionIds, "sessionId"),
    level: toFilterValueOptions(levels, "level"),
    environment: toFilterValueOptions(environments, "environment"),
    experimentDatasetId: toFilterValueOptions(
      experimentDatasetIds,
      "experimentDatasetId",
    ),
    experimentId: toFilterValueOptions(experimentIds, "experimentId"),
    experimentName: toFilterValueOptions(experimentNames, "experimentName"),
    hasParentObservation: hasParentObservationResults.map((i) => ({
      // ClickHouse returns UInt8 (0/1) for computed boolean; normalize to "true"/"false"
      value: i.hasParentObservation ? "true" : "false",
      count: i.count,
    })),
    toolNames: toolNames
      .filter((i) => i.toolName !== null)
      .map((i) => ({ value: i.toolName })),
    calledToolNames: calledToolNames
      .filter((i) => i.calledToolName !== null)
      .map((i) => ({ value: i.calledToolName })),
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
