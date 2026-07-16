import { type z } from "zod";
import {
  type FilterCondition,
  LISTABLE_SCORE_TYPES,
  type NumericEventsTableColumnId,
  filterAndValidateDbScoreList,
} from "@langfuse/shared";
import {
  getObservationsCountsFromEventsTable,
  getObservationsWithModelDataFromEventsTable,
  getCategoricalScoresGroupedByName,
  getEventsFilterOptionsForColumns,
  getEventsFilterOptionValuesPage,
  getEventsNumericStatsByFilterColumn,
  getNumericScoresGroupedByName,
  getBooleanScoresGroupedByName,
  getScoresGroupedByNameSourceType,
  getObservationsBatchIOFromEventsTable,
  getScoresForObservations,
  getScoresForTraces,
  logger,
  traceException,
  type EventBatchIOResult,
  type EventFilterOptionColumn,
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

const OBSERVATION_SCORE_SCOPE_FILTER: FilterCondition[] = [
  {
    type: "null",
    column: "traceId",
    operator: "is not null",
    value: "",
  },
  {
    type: "null",
    column: "observationId",
    operator: "is not null",
    value: "",
  },
];

// The level-agnostic "Scores" groups (`scores_avg` / `score_categories`) match a
// score whether it sits at observation or trace level, but only if it rolls up
// into a trace — i.e. `trace_id IS NOT NULL`. Session-level and dataset-run
// scores (`trace_id IS NULL`) can never match the events union, so scope
// discovery to trace-attached scores to keep offered-set == matchable-set
// (LFE-10596). Mirrors `scoreFilters.forTraceScopedAggregates`.
const TRACE_SCOPED_SCORE_FILTER: FilterCondition[] = [
  {
    type: "null",
    column: "traceId",
    operator: "is not null",
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
  isRootObservation?: boolean;
  hasParentObservation?: boolean;
  observationType?: string;
  columns?: readonly EventFilterOptionsColumn[];
}

type EventFilterValueOption = {
  value: string;
  count?: number;
};

// Subset of event filter option columns returned by the bulk filter-options response.
const EVENT_FILTER_OPTION_COLUMNS = [
  "providedModelName",
  "modelId",
  "name",
  "promptName",
  "traceTags",
  "traceName",
  "type",
  "userId",
  "version",
  "sessionId",
  "level",
  "environment",
  "experimentDatasetId",
  "experimentId",
  "experimentName",
  "isRootObservation",
  "toolNames",
  "calledToolNames",
] as const satisfies readonly EventFilterOptionColumn[];

const EVENT_SCORE_FILTER_OPTION_COLUMNS = [
  "scores_avg",
  "score_categories",
  "score_booleans",
  "trace_scores_avg",
  "trace_score_categories",
  "trace_score_booleans",
] as const;

export const EVENT_FILTER_OPTIONS_COLUMNS = [
  ...EVENT_FILTER_OPTION_COLUMNS,
  ...EVENT_SCORE_FILTER_OPTION_COLUMNS,
] as const;

type EventFilterOptionsColumn = (typeof EVENT_FILTER_OPTIONS_COLUMNS)[number];

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

const ensureStartTimeFilterForEventFilterOptions = <
  TParams extends GetObservationsFilterOptionsParams,
>(
  params: TParams,
): TParams => {
  if (hasEventFilterOptionsLowerBoundStartTimeFilter(params.startTimeFilter)) {
    return params;
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

  const observationsWithScores = observations.map((observation) => {
    const observationScores = scoresByObservationId.get(observation.id) ?? [];
    const traceScores = observation.traceId
      ? (scoresByTraceId.get(observation.traceId) ?? [])
      : [];
    return {
      ...observation,
      // Level-agnostic "Scores": roll up this observation's scores together with
      // the trace's trace-level scores into a single aggregate, so a trace-level
      // score (e.g. CSAT) shows in the one "Scores" column — matching the
      // level-agnostic score filter (LFE-10596). aggregateScores groups by
      // name/source/dataType, so a score present at both levels merges cleanly.
      scores: aggregateScores([...observationScores, ...traceScores]),
      // Trace-only aggregate, retained for callers that need the breakdown.
      traceScores: aggregateScores(traceScores),
    };
  });

  return { observations: observationsWithScores, hasMore };
}

/**
 * Get total count of events matching filters, plus the approximate number of
 * unique traces they span (single ClickHouse pass).
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

  const { totalCount, uniqueTraceCount } =
    await getObservationsCountsFromEventsTable(queryOpts);

  return { totalCount, uniqueTraceCount };
}

type EventFilterOptionRow = Awaited<
  ReturnType<typeof getEventsFilterOptionsForColumns>
>[number];

const toFilterValueOptions = (
  items: EventFilterOptionRow[],
  column: EventFilterOptionColumn,
): EventFilterValueOption[] =>
  items
    .filter((item) => item.column === column)
    .map((item) => ({ value: item.value, count: item.count }));

const EVENT_FILTER_VALUE_ONLY_COLUMNS = new Set<EventFilterOptionColumn>([
  "traceTags",
  "toolNames",
  "calledToolNames",
]);

type EventFilterOptionsByColumn = Record<
  (typeof EVENT_FILTER_OPTION_COLUMNS)[number],
  EventFilterValueOption[]
>;

const toEventFilterValueOptions = (
  items: EventFilterOptionRow[],
  column: EventFilterOptionColumn,
): EventFilterValueOption[] => {
  const options = toFilterValueOptions(items, column);

  return EVENT_FILTER_VALUE_ONLY_COLUMNS.has(column)
    ? options.map(({ value }) => ({ value }))
    : options;
};

// Only emit the columns that were actually requested. Returning every column
// (with `[]` for the unrequested ones) would make a lazily-loaded facet
// indistinguishable from a loaded-but-empty one on the client, defeating
// on-demand loading — the FE keys "needs loading" on a column key being absent.
const toEventFilterOptionsByColumn = (
  items: EventFilterOptionRow[],
  columns: readonly (keyof EventFilterOptionsByColumn)[],
): Partial<EventFilterOptionsByColumn> =>
  columns.reduce((acc, column) => {
    acc[column] = toEventFilterValueOptions(items, column);
    return acc;
  }, {} as Partial<EventFilterOptionsByColumn>);

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

  const rows = await getEventsFilterOptionValuesPage({
    projectId,
    filter: eventsFilter,
    column,
    limit: queryLimit,
    offset,
  });

  const values = rows.map((row) =>
    column === "traceTags"
      ? ({ value: row.value } satisfies EventFilterValueOption)
      : ({
          value: row.value,
          count: row.count,
        } satisfies EventFilterValueOption),
  );

  return {
    values: values.slice(0, limit),
    nextOffset: values.length > limit ? offset + limit : undefined,
  };
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
  const { projectId, columns = EVENT_FILTER_OPTIONS_COLUMNS } = scopedParams;
  const { eventsFilter, traceTimestampFilters, traceScoreTimestampFilters } =
    getEventFilterOptionsScope(scopedParams);
  const requestedColumns = new Set<EventFilterOptionsColumn>(columns);
  const eventColumns = EVENT_FILTER_OPTION_COLUMNS.filter((column) =>
    requestedColumns.has(column),
  );
  const shouldLoadScoresAvg = requestedColumns.has("scores_avg");
  const shouldLoadScoreCategories = requestedColumns.has("score_categories");
  const shouldLoadScoreBooleans = requestedColumns.has("score_booleans");
  const shouldLoadTraceScores = requestedColumns.has("trace_scores_avg");
  const shouldLoadTraceScoreCategories = requestedColumns.has(
    "trace_score_categories",
  );
  const shouldLoadTraceScoreBooleans = requestedColumns.has(
    "trace_score_booleans",
  );
  // Level provenance for the level-agnostic "Scores" groups: which level(s)
  // each offered score name exists at, so the UI can tag every score option
  // with its level (ScoreTag, LFE-10596). Loaded with the agnostic groups.
  const shouldLoadScoreNameLevels =
    shouldLoadScoresAvg || shouldLoadScoreCategories || shouldLoadScoreBooleans;

  // The `scores_avg` / `score_categories` / `score_booleans` groups are
  // level-agnostic (their filter matches observation- OR trace-level scores;
  // see `toLevelAgnosticScoreFilter` in events-observation-row-selection.ts),
  // so they offer every score that rolls up into a trace — matchable-set ==
  // offered-set (LFE-10596). Scoping to trace-attached scores (`trace_id IS
  // NOT NULL`) excludes session-/dataset-run scores the union can never match.
  // The trace-scoped discovery below stays trace-only to back the search bar's
  // `traceScores.` escape hatch.
  const [
    numericScoreNames,
    booleanScoreNames,
    categoricalScoreNames,
    traceScoreColumns,
    traceCategoricalScoreColumns,
    traceBooleanScoreColumns,
    observationLevelScoreNames,
    traceLevelScoreNames,
    eventFilterOptions,
  ] = await Promise.all([
    shouldLoadScoresAvg
      ? getNumericScoresGroupedByName(projectId, [
          ...TRACE_SCOPED_SCORE_FILTER,
          ...traceTimestampFilters,
        ])
      : Promise.resolve([]),
    shouldLoadScoreBooleans
      ? getBooleanScoresGroupedByName(projectId, [
          ...TRACE_SCOPED_SCORE_FILTER,
          ...traceTimestampFilters,
        ])
      : Promise.resolve([]),
    shouldLoadScoreCategories
      ? getCategoricalScoresGroupedByName(projectId, [
          ...TRACE_SCOPED_SCORE_FILTER,
          ...traceTimestampFilters,
        ])
      : Promise.resolve([]),
    shouldLoadTraceScores
      ? getScoresGroupedByNameSourceType({
          projectId,
          filter: [...TRACE_SCORE_SCOPE_FILTER, ...traceScoreTimestampFilters],
        })
      : Promise.resolve([]),
    shouldLoadTraceScoreCategories
      ? getCategoricalScoresGroupedByName(projectId, [
          ...TRACE_SCORE_SCOPE_FILTER,
          ...traceTimestampFilters,
        ])
      : Promise.resolve([]),
    shouldLoadTraceScoreBooleans
      ? getBooleanScoresGroupedByName(projectId, [
          ...TRACE_SCORE_SCOPE_FILTER,
          ...traceTimestampFilters,
        ])
      : Promise.resolve([]),
    shouldLoadScoreNameLevels
      ? getScoresGroupedByNameSourceType({
          projectId,
          filter: [
            ...OBSERVATION_SCORE_SCOPE_FILTER,
            ...traceScoreTimestampFilters,
          ],
        })
      : Promise.resolve([]),
    shouldLoadScoreNameLevels
      ? getScoresGroupedByNameSourceType({
          projectId,
          filter: [...TRACE_SCORE_SCOPE_FILTER, ...traceScoreTimestampFilters],
        })
      : Promise.resolve([]),
    eventColumns.length > 0
      ? getEventsFilterOptionsForColumns({
          projectId,
          filter: eventsFilter,
          columns: eventColumns,
        })
      : Promise.resolve([]),
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
  const eventFilterOptionsByColumn = toEventFilterOptionsByColumn(
    eventFilterOptions,
    eventColumns,
  );

  // name → the level(s) the name actually exists at. Discovery rows are
  // grouped by (name, source, dataType), so names repeat — dedupe per level.
  const scoreNameLevels: Record<string, ("observation" | "trace")[]> = {};
  const addScoreNameLevel = (
    name: string,
    level: "observation" | "trace",
  ): void => {
    const levels = (scoreNameLevels[name] ??= []);
    if (!levels.includes(level)) levels.push(level);
  };
  observationLevelScoreNames.forEach((score) =>
    addScoreNameLevel(score.name, "observation"),
  );
  traceLevelScoreNames.forEach((score) =>
    addScoreNameLevel(score.name, "trace"),
  );

  // Only include a score key when its column was requested, so an unrequested
  // (lazily-loadable) score facet stays absent from the payload rather than
  // arriving as an empty list (which the client cannot tell from "loaded, no
  // values"). When everything is requested (the default), all keys are present.
  // Score names come from the observation-/trace-scoped discovery above so each
  // column only offers names its filter can match (LFE-10596).
  return {
    ...eventFilterOptionsByColumn,
    ...(shouldLoadScoresAvg
      ? { scores_avg: numericScoreNames.map((score) => score.name) }
      : {}),
    ...(shouldLoadScoreCategories
      ? { score_categories: categoricalScoreNames }
      : {}),
    ...(shouldLoadScoreBooleans
      ? { score_booleans: booleanScoreNames.map((score) => score.name) }
      : {}),
    ...(shouldLoadTraceScores
      ? { trace_scores_avg: traceNumericScoreNames }
      : {}),
    ...(shouldLoadTraceScoreCategories
      ? { trace_score_categories: traceCategoricalScoreColumns }
      : {}),
    ...(shouldLoadTraceScoreBooleans
      ? {
          trace_score_booleans: traceBooleanScoreColumns.map(
            (score) => score.name,
          ),
        }
      : {}),
    ...(shouldLoadScoreNameLevels
      ? { score_name_levels: scoreNameLevels }
      : {}),
  };
}

interface GetEventBatchIOParams<
  TIncludeExperiment extends boolean = false,
  TIncludeToolCalls extends boolean = false,
> {
  projectId: string;
  observations: Array<{
    id: string;
    traceId: string;
  }>;
  minStartTime: Date;
  maxStartTime: Date;
  truncated?: boolean;
  includeExperimentFields?: TIncludeExperiment;
  /** Opt-in: tool-call arrays can be large; only eval consumers need them. */
  includeToolCallFields?: TIncludeToolCalls;
}

/**
 * Batch fetch input/output and metadata for multiple observations
 */
export async function getEventBatchIO<
  TIncludeExperiment extends boolean = false,
  TIncludeToolCalls extends boolean = false,
>(
  params: GetEventBatchIOParams<TIncludeExperiment, TIncludeToolCalls>,
): Promise<Array<EventBatchIOResult<TIncludeExperiment, TIncludeToolCalls>>> {
  return getObservationsBatchIOFromEventsTable({
    projectId: params.projectId,
    observations: params.observations,
    minStartTime: params.minStartTime,
    maxStartTime: params.maxStartTime,
    truncated: params.truncated,
    includeExperimentFields: params.includeExperimentFields,
    includeToolCallFields: params.includeToolCallFields,
  });
}
