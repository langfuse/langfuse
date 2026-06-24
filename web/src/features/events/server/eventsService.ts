import { type z } from "zod";
import {
  type FilterCondition,
  LISTABLE_SCORE_TYPES,
  type NumericEventsTableColumnId,
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
  getEventsNumericStatsByFilterColumn,
  getEventsGroupedBySessionId,
  getEventsGroupedByLevel,
  getEventsGroupedByEnvironment,
  getEventsGroupedByExperimentDatasetId,
  getEventsGroupedByExperimentId,
  getEventsGroupedByExperimentName,
  getEventsGroupedByHasParentObservation,
  getEventsGroupedByIsRootObservation,
  getEventsGroupedByToolName,
  getEventsGroupedByCalledToolName,
  getNumericScoresGroupedByName,
  getScoresGroupedByNameSourceType,
  getObservationsBatchIOFromEventsTable,
  getScoresForObservations,
  getScoresForTraces,
  logger,
  traceException,
} from "@langfuse/shared/src/server";
import { type timeFilter, type FilterState } from "@langfuse/shared";
import {
  monitorEvaluationOffsetMs,
  type MonitorWindow,
  windowToMs,
} from "@langfuse/shared/monitors";
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
  monitorWindow?: MonitorWindow;
  isRootObservation?: boolean;
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

const OBSERVATIONS_TO_TRACE_INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS = 60 * 60 * 1000;
const EVENT_FILTER_OPTIONS_SCORE_LOOKBACK_BUFFER_MS =
  OBSERVATIONS_TO_TRACE_INTERVAL_MS + SCORE_TO_TRACE_OBSERVATIONS_INTERVAL_MS;
const EVENT_FILTER_OPTIONS_DEFAULT_LOOKBACK_DAYS = 30;
const EVENT_FILTER_OPTIONS_DEFAULT_LOOKBACK_MS =
  EVENT_FILTER_OPTIONS_DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

const isEventFilterOptionsLowerBoundStartTimeFilter = (filter: TimeFilter) =>
  (filter.column === "startTime" || filter.column === "Start Time") &&
  (filter.operator === ">=" || filter.operator === ">");

const hasEventFilterOptionsLowerBoundStartTimeFilter = (
  filters?: TimeFilter[],
) => filters?.some(isEventFilterOptionsLowerBoundStartTimeFilter) ?? false;

const getDefaultEventFilterOptionsStartTimeFilter = (): TimeFilter[] => [
  {
    column: "startTime",
    type: "datetime",
    operator: ">=",
    value: new Date(Date.now() - EVENT_FILTER_OPTIONS_DEFAULT_LOOKBACK_MS),
  },
];

const getMonitorWindowStartTimeFilter = (
  monitorWindow: MonitorWindow,
): TimeFilter[] => {
  const windowMs = Number(windowToMs(monitorWindow));
  const to = new Date(Date.now() - monitorEvaluationOffsetMs);
  const from = new Date(to.getTime() - windowMs);

  return [
    {
      column: "startTime",
      type: "datetime",
      operator: ">=",
      value: from,
    },
    {
      column: "startTime",
      type: "datetime",
      operator: "<=",
      value: to,
    },
  ];
};

const ensureStartTimeFilterForEventFilterOptions = <
  TParams extends GetObservationsFilterOptionsParams,
>(
  params: TParams,
): TParams => {
  if (hasEventFilterOptionsLowerBoundStartTimeFilter(params.startTimeFilter)) {
    return params;
  }

  if (params.monitorWindow) {
    return {
      ...params,
      startTimeFilter: [
        ...getMonitorWindowStartTimeFilter(params.monitorWindow),
        ...(params.startTimeFilter ?? []),
      ],
    };
  }

  logger.warn(
    "events.filterOptions called without lower startTimeFilter; applying default lookback",
    {
      projectId: params.projectId,
      defaultLookbackDays: EVENT_FILTER_OPTIONS_DEFAULT_LOOKBACK_DAYS,
    },
  );

  return {
    ...params,
    startTimeFilter: [
      ...getDefaultEventFilterOptionsStartTimeFilter(),
      // Preserve upper-only bounds while adding the missing lower bound.
      ...(params.startTimeFilter ?? []),
    ],
  } as TParams;
};

const toScoreTimestampFilters = (
  startTimeFilter: TimeFilter[] | undefined,
  column: "Timestamp" | "timestamp",
): FilterCondition[] => {
  return (startTimeFilter ?? []).flatMap((filter) => {
    if (!isEventFilterOptionsLowerBoundStartTimeFilter(filter)) return [];

    return [
      {
        column,
        operator: filter.operator,
        value: new Date(
          filter.value.getTime() -
            EVENT_FILTER_OPTIONS_SCORE_LOOKBACK_BUFFER_MS,
        ),
        type: "datetime",
      },
    ];
  });
};

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
    limit: params.limit + 1,
    offset: (params.page - 1) * params.limit, // Page is 1-indexed (page 1 = offset 0)
    selectIOAndMetadata: false, // Exclude I/O for performance - fetched separately via batchIO endpoint
    renderingProps: { truncated: true, shouldJsonParse: false },
  };

  const fetchedObservations =
    await getObservationsWithModelDataFromEventsTable(queryOpts);
  const hasMore = fetchedObservations.length > params.limit;
  const observations = hasMore
    ? fetchedObservations.slice(0, params.limit)
    : fetchedObservations;

  if (observations.length === 0) {
    return { observations, hasMore };
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

  return { observations: observationsWithScores, hasMore };
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
  const {
    startTimeFilter,
    isRootObservation,
    hasParentObservation,
    observationType,
  } = params;

  // Build filter with optional scoping for filter options.
  const eventsFilter: FilterState = [
    ...(startTimeFilter ?? []),
    ...(isRootObservation !== undefined
      ? [
          {
            column: "isRootObservation" as const,
            type: "boolean" as const,
            operator: "=" as const,
            value: isRootObservation,
          },
        ]
      : []),
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

  // Derive score-table timestamp filters from observation startTime filters.
  // This is not a 1:1 remap: score loading allows trace/score timestamp skew,
  // and upper observation bounds would hide backfilled scores data queries use.
  const traceTimestampFilters = toScoreTimestampFilters(
    startTimeFilter,
    "Timestamp",
  );
  const traceScoreTimestampFilters = toScoreTimestampFilters(
    startTimeFilter,
    "timestamp",
  );

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
  const scopedParams = ensureStartTimeFilterForEventFilterOptions(params);
  const { projectId, column, limit, offset } = scopedParams;
  const { eventsFilter } = getEventFilterOptionsScope(scopedParams);
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

export async function getEventFilterNumericRange(
  params: GetObservationsFilterOptionsParams & {
    column: Exclude<
      NumericEventsTableColumnId,
      "inputTokens" | "outputTokens" | "inputCost" | "outputCost"
    >;
  },
) {
  const scopedParams = ensureStartTimeFilterForEventFilterOptions(params);
  const { projectId, column } = scopedParams;
  const { eventsFilter } = getEventFilterOptionsScope(scopedParams);

  return getEventsNumericStatsByFilterColumn(projectId, eventsFilter, column);
}

/**
 * Get all available filter options for events table
 */
export async function getEventFilterOptions(
  params: GetObservationsFilterOptionsParams,
) {
  const scopedParams = ensureStartTimeFilterForEventFilterOptions(params);
  const { projectId } = scopedParams;
  const { eventsFilter, traceTimestampFilters, traceScoreTimestampFilters } =
    getEventFilterOptionsScope(scopedParams);

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
    isRootObservationResults,
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
    getEventsGroupedByIsRootObservation(projectId, eventsFilter),
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
    isRootObservation: isRootObservationResults.map((i) => ({
      // ClickHouse returns UInt8 (0/1) for computed boolean; normalize to "true"/"false"
      value: i.isRootObservation ? "true" : "false",
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

interface GetEventBatchIOParams<TIncludeExperiment extends boolean = false> {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean;
  includeExperimentFields?: TIncludeExperiment;
}

type EventBatchIOStringOutput = Awaited<
  ReturnType<typeof getObservationsBatchIOFromEventsTable>
>[number];

type EventBatchIOWithExperimentOutput = EventBatchIOStringOutput & {
  experimentItemExpectedOutput: string | null;
  experimentItemMetadata: unknown;
};

/**
 * Batch fetch input/output and metadata for multiple observations
 */
export async function getEventBatchIO<
  TIncludeExperiment extends boolean = false,
>(
  params: GetEventBatchIOParams<TIncludeExperiment>,
): Promise<
  Array<
    TIncludeExperiment extends true
      ? EventBatchIOWithExperimentOutput
      : EventBatchIOStringOutput
  >
> {
  return getObservationsBatchIOFromEventsTable({
    projectId: params.projectId,
    observations: params.observations,
    minStartTime: params.minStartTime,
    maxStartTime: params.maxStartTime,
    truncated: params.truncated,
    includeExperimentFields: params.includeExperimentFields,
  } as Parameters<typeof getObservationsBatchIOFromEventsTable>[0] & {
    includeExperimentFields?: TIncludeExperiment;
  }) as Promise<
    Array<
      TIncludeExperiment extends true
        ? EventBatchIOWithExperimentOutput
        : EventBatchIOStringOutput
    >
  >;
}
