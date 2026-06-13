import { type ScoreSourceType } from "../../domain";
import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import {
  FilterList,
  CTEQueryBuilder,
  EventsAggQueryBuilder,
  StringFilter,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  eventsExperimentsRootSpans,
  eventsScoresAggregation,
  eventsTracesScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import {
  getExperimentDatasetIdsGreptime,
  getExperimentNamesGreptime,
  getExperimentMetricsGreptime,
  getExperimentItemScoreOptionsGreptime,
  getExperimentRunScoreOptionsGreptime,
  getExperimentItemsBatchIORowsGreptime,
  getExperimentsListGreptime,
  getExperimentsListCountGreptime,
} from "./greptime/experiments";
import { experimentItemsTableNativeUiColumnDefinitions } from "../tableMappings/mapExperimentItemsTable";

export type ExperimentEventsDataReturnType = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string;
  start_time: string;
  item_count: number;
  error_count: number;
  prompts: Array<[string, number | null]>; // List of unique (prompt_name, prompt_version) tuples
  experiment_metadata: Record<string, string>; // Experiment metadata as key-value map
};

export type ExperimentMetricsReturnType = {
  experiment_id: string;
  total_cost: number | null;
  latency_avg: number | null;
};

/**
 * Distinct dataset ids that have experiment (dataset-run) data, for the experiments filter-options UI.
 * Replaces the experiments use of `getEventsGroupedByExperimentDatasetId` (events table) with a
 * dedicated `dataset_run_items` reader; the shared events function stays for the v4 events
 * filter-options path. Accepts the Start Time filter the router already passes.
 */
export const getExperimentDatasetIds = (
  projectId: string,
  startTimeFilter?: FilterState,
) => getExperimentDatasetIdsGreptime(projectId, startTimeFilter);

export const getExperimentsCountFromEvents = (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) =>
  getExperimentsListCountGreptime({
    projectId: props.projectId,
    filter: props.filter,
  });

export const getExperimentsFromEvents = (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) =>
  getExperimentsListGreptime({
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy ?? null,
    limit: props.limit,
    page: props.page,
  });

export const getExperimentMetricsFromEvents = (props: {
  projectId: string;
  experimentIds: string[];
}) => getExperimentMetricsGreptime(props);

// ============================================================================
// Experiment Items Queries
// ============================================================================

/**
 * Return type for experiment item rows from ClickHouse.
 */
export type ExperimentItemEventsDataReturnType = {
  item_id: string;
  experiment_id: string;
  level: string;
  start_time: string;
  total_cost: number | null;
  latency_ms: number | null;
  observation_id: string;
  trace_id: string;
};

/**
 * Data for a single experiment within an item.
 */
export type ExperimentItemData = {
  experimentId: string;
  level: string;
  startTime: Date;
  totalCost: number | null;
  latencyMs: number | null;
  observationId: string;
  traceId: string;
};

/**
 * Grouped experiment item with data from all experiments.
 */
export type GroupedExperimentItem = {
  itemId: string;
  experiments: ExperimentItemData[];
};

/**
 * Return type for experiment item metrics from ClickHouse.
 */
export type ExperimentItemMetricsReturnType = {
  experiment_item_id: string;
  trace_id: string;
  total_cost: number | null;
  latency_milliseconds: number | null;
};

type ExperimentItemInput = {
  projectId: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  baseExperimentId?: string;
  config?: {
    /**
     * Whether to require the baseline experiment to be present in the results.
     * If true, the results will only include items that are present in the baseline experiment.
     * If false, the results will include items that are present in the baseline experiment OR any comparison experiment.
     * If not provided, defaults to false.
     */
    requireBaselinePresence?: boolean;
  };
};

/**
 * Get experiment items count for pagination with intersection filtering.
 * Counts items that match the intersection criteria across experiments.
 */
export const getExperimentItemsCountFromEvents = async (
  props: ExperimentItemInput,
): Promise<number> => {
  const { projectId, config } = props;

  const qualifiedItems = getExperimentItemsFromEventsGeneric({
    ...props,
    config,
    select: "count",
  });

  const queryBuilder = new CTEQueryBuilder()
    .withCTE("qualified_items", {
      ...qualifiedItems,
      schema: ["item_id"],
    })
    .from("qualified_items", "qi")
    .select("count() AS count");

  const { query, params } = queryBuilder.buildWithParams();

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params,
    tags: {
      feature: "experiments",
      type: "experiment-items-count",
      projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

type ExperimentItemsFilterOptionsInput = {
  projectId: string;
  experimentIds: string[];
};

type ExperimentScoreOptionsInput = ExperimentItemsFilterOptionsInput;

// Whitelist of score data types to include
type ExperimentChartableScoreDataType = "NUMERIC" | "CATEGORICAL" | "BOOLEAN";

type ScoreFilterOptionsRow = {
  name: string;
  source: ScoreSourceType;
  data_type: ExperimentChartableScoreDataType;
  values: string[];
};

export type ScoreColumnDefinition = {
  name: string;
  dataType: "NUMERIC" | "BOOLEAN" | "CATEGORICAL";
  source: string;
};

type ProcessedScoreFilterOptions = {
  numeric: string[];
  categorical: Array<{ label: string; values: string[] }>;
  scoreColumns: ScoreColumnDefinition[];
};

const processScoreFilterOptionsResults = (
  rows: ScoreFilterOptionsRow[],
): ProcessedScoreFilterOptions => {
  const numeric = new Set<string>();
  const categorical = new Map<string, Set<string>>();
  const scoreColumns: ScoreColumnDefinition[] = [];

  for (const row of rows) {
    // Always add to scoreColumns (unique by name+source+data_type combination)
    scoreColumns.push({
      name: row.name,
      dataType: row.data_type as "NUMERIC" | "BOOLEAN" | "CATEGORICAL",
      source: row.source,
    });

    if (row.data_type === "NUMERIC" || row.data_type === "BOOLEAN") {
      numeric.add(row.name);
    } else if (row.data_type === "CATEGORICAL") {
      const existingValues = categorical.get(row.name) ?? new Set<string>();
      row.values.forEach((value) => existingValues.add(value));
      categorical.set(row.name, existingValues);
    }
  }

  return {
    numeric: Array.from(numeric),
    categorical: Array.from(categorical.entries()).map(([label, values]) => ({
      label,
      values: Array.from(values),
    })),
    scoreColumns,
  };
};

const emptyScoreFilterOptions = (): ProcessedScoreFilterOptions => ({
  numeric: [],
  categorical: [],
  scoreColumns: [],
});

type ExperimentItemScoreOptionsByLevel = {
  observation: ProcessedScoreFilterOptions;
  trace: ProcessedScoreFilterOptions;
};

type ExperimentScoreOptionsByLevel = {
  observation: ProcessedScoreFilterOptions;
  experiment: ProcessedScoreFilterOptions;
};

const getExperimentItemScoreOptionsByLevel = async ({
  projectId,
  experimentIds,
}: ExperimentItemsFilterOptionsInput): Promise<ExperimentItemScoreOptionsByLevel> => {
  const uniqueExperimentIds = Array.from(new Set(experimentIds));

  if (uniqueExperimentIds.length === 0) {
    return {
      observation: emptyScoreFilterOptions(),
      trace: emptyScoreFilterOptions(),
    };
  }

  const [traceResults, obsResults] = await Promise.all([
    getExperimentItemScoreOptionsGreptime({
      projectId,
      experimentIds: uniqueExperimentIds,
      level: "trace",
    }),
    getExperimentItemScoreOptionsGreptime({
      projectId,
      experimentIds: uniqueExperimentIds,
      level: "observation",
    }),
  ]);

  return {
    observation: processScoreFilterOptionsResults(obsResults),
    trace: processScoreFilterOptionsResults(traceResults),
  };
};

export const getExperimentItemsFilterOptions = async (
  props: ExperimentItemsFilterOptionsInput,
): Promise<{
  obs_scores_avg: string[];
  obs_score_categories: Array<{ label: string; values: string[] }>;
  obs_score_columns: ScoreColumnDefinition[];
  trace_scores_avg: string[];
  trace_score_categories: Array<{ label: string; values: string[] }>;
  trace_score_columns: ScoreColumnDefinition[];
}> => {
  const { observation, trace } =
    await getExperimentItemScoreOptionsByLevel(props);

  return {
    obs_scores_avg: observation.numeric,
    obs_score_categories: observation.categorical,
    obs_score_columns: observation.scoreColumns,
    trace_scores_avg: trace.numeric,
    trace_score_categories: trace.categorical,
    trace_score_columns: trace.scoreColumns,
  };
};

const getExperimentScoreOptionsByLevel = async ({
  projectId,
  experimentIds,
}: ExperimentScoreOptionsInput): Promise<ExperimentScoreOptionsByLevel> => {
  const uniqueExperimentIds = Array.from(new Set(experimentIds));

  if (uniqueExperimentIds.length === 0) {
    return {
      observation: emptyScoreFilterOptions(),
      experiment: emptyScoreFilterOptions(),
    };
  }

  const [obsResults, runResults] = await Promise.all([
    getExperimentItemScoreOptionsGreptime({
      projectId,
      experimentIds: uniqueExperimentIds,
      level: "observation",
    }),
    getExperimentRunScoreOptionsGreptime({
      projectId,
      experimentIds: uniqueExperimentIds,
    }),
  ]);

  return {
    observation: processScoreFilterOptionsResults(obsResults),
    experiment: processScoreFilterOptionsResults(runResults),
  };
};

export const getExperimentScoreOptions = async (
  props: ExperimentScoreOptionsInput,
): Promise<{
  obs_scores_avg: string[];
  obs_score_categories: Array<{ label: string; values: string[] }>;
  obs_score_columns: ScoreColumnDefinition[];
  experiment_scores_avg: string[];
  experiment_score_categories: Array<{ label: string; values: string[] }>;
  experiment_score_columns: ScoreColumnDefinition[];
}> => {
  const { observation, experiment } =
    await getExperimentScoreOptionsByLevel(props);

  return {
    obs_scores_avg: observation.numeric,
    obs_score_categories: observation.categorical,
    obs_score_columns: observation.scoreColumns,
    experiment_scores_avg: experiment.numeric,
    experiment_score_categories: experiment.categorical,
    experiment_score_columns: experiment.scoreColumns,
  };
};

type FilterByExperiment = {
  experimentId: string;
  filters: FilterState;
};

type BuildQualificationPlanInput = {
  compExperimentIds: string[];
  filterByExperiment: FilterByExperiment[];
  baseExperimentId?: string;
  config?: {
    requireBaselinePresence?: boolean;
  };
};

type QualificationPlan = {
  where: { query: string; params: Record<string, any> };
  having: { query: string; params: Record<string, any> } | null;
  orderBy: string | null;
  hasScoreFilters: boolean;
  hasTraceScoreFilters: boolean;
};

function combineConditions(
  conditions: { query: string; params: Record<string, any> }[],
  operator: "AND" | "OR" = "OR",
): { query: string; params: Record<string, any> } {
  const valid = conditions.filter((c) => c.query.trim().length > 0);
  if (valid.length === 0) return { query: "", params: {} };

  return {
    query: `(${valid.map((c) => `(${c.query})`).join(` ${operator} `)})`,
    params: Object.assign({}, ...valid.map((c) => c.params ?? {})),
  };
}

function compileExperimentFilter(params: {
  experimentId: string;
  filterState: FilterState;
}): { query: string; params: Record<string, any> } {
  // 1) force experiment constraint
  const experimentFilter = new StringFilter({
    clickhouseTable: "events_proto",
    field: "e.experiment_id",
    operator: "=",
    value: params.experimentId,
  });

  // 2) translate UI filters to CH filters with existing mapping
  const translated = createFilterFromFilterState(
    params.filterState,
    experimentItemsTableNativeUiColumnDefinitions,
  );

  // 3) compile as AND
  const compiled = new FilterList([experimentFilter, ...translated]).apply();

  return {
    query: compiled.query,
    params: compiled.params ?? {},
  };
}

/**
 * Build filter conditions for the qualification query.
 * Returns OR conditions and params for each experiment that needs filtering.
 */
const buildQualificationPlan = (
  params: BuildQualificationPlanInput,
): QualificationPlan => {
  const { baseExperimentId, compExperimentIds, filterByExperiment, config } =
    params;

  const { requireBaselinePresence = false } = config ?? {};
  const isBaselineEnforced =
    requireBaselinePresence && Boolean(baseExperimentId);

  // Map experimentId -> filters for quick lookup
  const filtersByExperiment = new Map(
    filterByExperiment.map((f) => [f.experimentId, f.filters]),
  );

  const filteredCompExperimentIds = compExperimentIds.filter((expId) => {
    const hasFilters = (filtersByExperiment.get(expId) ?? []).length > 0;
    return hasFilters;
  });

  const filters = filterByExperiment.flatMap((f) => f.filters);
  const hasScoreFilters = filters.some((f) =>
    ["obs_scores_avg", "obs_score_categories"].includes(f.column),
  );
  const hasTraceScoreFilters = filters.some((f) =>
    ["trace_scores_avg", "trace_score_categories"].includes(f.column),
  );

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...(isBaselineEnforced ? filteredCompExperimentIds : compExperimentIds),
  ];

  const compiledFiltersByExperiment = allExperimentIds.map((experimentId) =>
    compileExperimentFilter({
      experimentId,
      filterState: filtersByExperiment.get(experimentId) ?? [],
    }),
  );

  return {
    where: combineConditions(compiledFiltersByExperiment, "OR"),
    having: isBaselineEnforced
      ? filteredCompExperimentIds.length > 0
        ? {
            query: `
          countIf(e.experiment_id = {baseExperimentId: String}) > 0
          AND countIf(e.experiment_id IN ({filteredCompExperimentIds: Array(String)})) > 0
        `,
            params: {
              baseExperimentId,
              filteredCompExperimentIds,
            },
          }
        : {
            query: `countIf(e.experiment_id = {baseExperimentId: String}) > 0`,
            params: {
              baseExperimentId,
            },
          }
      : null,
    orderBy: `ORDER BY e.experiment_item_id ASC`,
    hasScoreFilters,
    hasTraceScoreFilters,
  };
};

const getExperimentItemsFromEventsGeneric = (params: {
  select: "count" | "rows";
  projectId: string;
  baseExperimentId?: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  config?: {
    requireBaselinePresence?: boolean;
  };
  limit?: number;
  offset?: number;
}) => {
  const {
    select,
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    config,
    limit,
    offset,
  } = params;

  const { where, having, orderBy, hasScoreFilters, hasTraceScoreFilters } =
    buildQualificationPlan({
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      config,
    });

  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_item_id",
    selectExpression: "e.experiment_item_id as item_id",
  })
    .whereRaw("e.span_id = e.experiment_item_root_span_id")
    .when(hasScoreFilters, (b) =>
      b.withCTE(
        "scores_agg",
        // Optionally add timestamp >= oldest_selected_experiment_start as a coarse partition prune
        eventsScoresAggregation({
          projectId,
        }),
      ),
    )
    .when(hasScoreFilters, (b) =>
      b.leftJoin("scores_agg AS s", "ON s.observation_id = e.span_id"),
    )
    .when(hasTraceScoreFilters, (b) =>
      b.withCTE(
        "trace_scores_agg",
        // Optionally add timestamp >= oldest_selected_experiment_start as a coarse partition prune
        eventsTracesScoresAggregation({
          projectId,
          hasScoreAggregationFilters: true,
        }),
      ),
    )
    .when(hasTraceScoreFilters, (b) =>
      b.leftJoin(
        "trace_scores_agg AS ts",
        "ON ts.trace_id = e.trace_id AND ts.project_id = e.project_id",
      ),
    )
    .where(where)
    .when(having !== null, (b) => b.having(having!));

  if (select === "rows") {
    queryBuilder
      .when(orderBy !== null, (b) => b.orderBy(orderBy!))
      .limit(limit ?? 50, offset ?? 0);
  }

  return queryBuilder.buildWithParams();
};

/**
 * Get experiment items with intersection filtering across experiments.
 * Returns items grouped by item_id with data from ALL experiments.
 *
 * Query 1: Get filtered item_ids using intersection logic
 * Query 2: Fetch data for those items across ALL experiments
 */
export const getExperimentItemsFromEvents = async (
  props: ExperimentItemInput & {
    limit?: number;
    offset?: number;
  },
): Promise<GroupedExperimentItem[]> => {
  const {
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    limit,
    offset,
    config,
  } = props;

  // ========== QUERY 1: Get filtered item_ids using intersection logic ==========
  const { query: itemIdsQuery, params: itemIdsParams } =
    getExperimentItemsFromEventsGeneric({
      select: "rows",
      projectId,
      baseExperimentId,
      compExperimentIds,
      filterByExperiment,
      config,
      limit,
      offset,
    });

  const itemIdsResult = await queryClickhouse<{ item_id: string }>({
    query: itemIdsQuery,
    params: itemIdsParams,
    tags: {
      feature: "experiments",
      type: "experiment-items-filter",
      projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  const itemIds = itemIdsResult.map((r) => r.item_id);

  if (itemIds.length === 0) {
    return [];
  }

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...compExperimentIds,
  ];

  // ========== QUERY 2: Fetch data for ALL experiments ==========
  const queryBuilderData = eventsExperimentsRootSpans({
    projectId,
    experimentItemIds: itemIds,
    experimentIds: allExperimentIds,
  })
    .selectRaw(
      "e.experiment_item_id as item_id",
      "e.experiment_id as experiment_id",
      "e.level as level",
      "e.start_time as start_time",
      "e.total_cost as total_cost",
      "if(isNull(e.end_time), NULL, date_diff('millisecond', e.start_time, e.end_time)) as latency_ms",
      "e.span_id as observation_id",
      "e.trace_id as trace_id",
    )
    // We must deterministically return the latest row for each experiment_item_id, experiment_id pair until we model repetitions (LFE-8965)
    .orderByColumns([{ column: "e.start_time", direction: "DESC" }])
    .limitBy("e.experiment_item_id, e.experiment_id");

  const { query: dataQuery, params: dataParams } =
    queryBuilderData.buildWithParams();

  const rows = await queryClickhouse<ExperimentItemEventsDataReturnType>({
    query: dataQuery,
    params: dataParams,
    tags: {
      feature: "experiments",
      type: "experiment-items-data",
      projectId,
    },
    preferredClickhouseService: "EventsReadOnly",
  });

  // Group by item_id, preserving pagination order
  const itemMap = new Map<string, ExperimentItemData[]>();
  for (const row of rows) {
    const data: ExperimentItemData = {
      experimentId: row.experiment_id,
      level: row.level,
      startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
      totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
      latencyMs: row.latency_ms !== null ? Number(row.latency_ms) : null,
      observationId: row.observation_id,
      traceId: row.trace_id,
    };
    if (!itemMap.has(row.item_id)) {
      itemMap.set(row.item_id, []);
    }
    itemMap.get(row.item_id)!.push(data);
  }

  // Return in pagination order from itemIds
  return itemIds.map((itemId) => ({
    itemId,
    experiments: itemMap.get(itemId) ?? [],
  }));
};

// ============================================================================
// Batch IO Queries
// ============================================================================

/**
 * Output data for a single experiment.
 */
export type ExperimentOutputData = {
  experimentId: string;
  output: string | null;
};

/**
 * Batch IO data for an experiment item.
 */
export type ExperimentItemBatchIO = {
  itemId: string;
  input: string | null; // From base experiment only
  expectedOutput: string | null; // From base experiment only
  outputs: ExperimentOutputData[]; // From ALL experiments
};

/**
 * Get batch IO data for experiment items.
 * Returns input/expectedOutput from base experiment, and output from all experiments.
 * All text fields are truncated to IO_TRUNCATE_LENGTH characters.
 */
export const getExperimentItemsBatchIO = async (props: {
  projectId: string;
  itemIds: string[];
  baseExperimentId?: string;
  compExperimentIds: string[];
}): Promise<ExperimentItemBatchIO[]> => {
  const { projectId, itemIds, baseExperimentId, compExperimentIds } = props;

  if (itemIds.length === 0) {
    return [];
  }

  const allExperimentIds = [
    ...(baseExperimentId ? [baseExperimentId] : []),
    ...compExperimentIds,
  ];

  const rows = await getExperimentItemsBatchIORowsGreptime({
    projectId,
    itemIds,
    experimentIds: allExperimentIds,
  });

  // Group by item_id
  // Extract input/expectedOutput from base experiment row
  // Collect outputs from all rows
  const itemMap = new Map<
    string,
    {
      input: string | null;
      expectedOutput: string | null;
      outputs: ExperimentOutputData[];
    }
  >();

  for (const row of rows) {
    if (!itemMap.has(row.item_id)) {
      itemMap.set(row.item_id, {
        input: null,
        expectedOutput: null,
        outputs: [],
      });
    }

    const item = itemMap.get(row.item_id)!;
    const isBaseline =
      baseExperimentId && row.experiment_id === baseExperimentId;

    // Use baseline value if available, otherwise first non-null
    if (row.input !== null && (isBaseline || item.input === null)) {
      item.input = row.input;
    }
    if (
      row.expected_output !== null &&
      (isBaseline || item.expectedOutput === null)
    ) {
      item.expectedOutput = row.expected_output;
    }

    // Collect output from all experiments
    item.outputs.push({
      experimentId: row.experiment_id,
      output: row.output,
    });
  }

  // Return in the same order as itemIds
  return itemIds.map((itemId) => {
    const item = itemMap.get(itemId);
    return {
      itemId,
      input: item?.input ?? null,
      expectedOutput: item?.expectedOutput ?? null,
      outputs: item?.outputs ?? [],
    };
  });
};

export const getExperimentNamesFromEvents = (props: { projectId: string }) =>
  getExperimentNamesGreptime(props);
