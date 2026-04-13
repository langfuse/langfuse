import { env } from "../../env";
import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  CTEQueryBuilder,
  CTEWithSchema,
  EventsAggQueryBuilder,
  StringFilter,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  buildScoresCTE,
  eventsExperimentsRootSpans,
  eventsExperiments,
  eventsExperimentsAggregation,
  eventsScoresAggregation,
  eventsTracesScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { extractTimeFilter, queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import { experimentItemsTableNativeUiColumnDefinitions } from "../tableMappings/mapExperimentItemsTable";
import {
  experimentPreAggCols,
  experimentScoreAggCols,
  experimentOrderByCols,
} from "../tableMappings/mapExperimentTable";

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

const experimentScoreCTE = (params: {
  projectId: string;
  startTimeFrom?: string | null;
  level: "observation" | "trace";
  eventKeysCTE: CTEWithSchema;
  filters: FilterList;
}) => {
  const prefix = params.level === "observation" ? "obs" : "trace";

  const joinedEventScores = new CTEQueryBuilder()
    .withCTE("event_keys", {
      ...params.eventKeysCTE,
    })
    .withCTE("unit_scores", {
      ...buildScoresCTE({
        projectId: params.projectId,
        startTimeFrom: params.startTimeFrom,
        level: params.level,
      }),
    })
    .from("event_keys", "ek")
    .innerJoin(
      "unit_scores",
      "us",
      "ON us.project_id = ek.project_id AND us.trace_id = ek.trace_id",
    )
    .select(
      "ek.project_id AS project_id",
      "ek.experiment_id AS experiment_id",
      "us.name AS name",
      "us.data_type AS data_type",
      "us.string_value AS string_value",
      "avg(us.avg_value) AS exp_avg",
    )
    .groupBy(
      "ek.project_id",
      "ek.experiment_id",
      "us.name",
      "us.data_type",
      "us.string_value",
    )
    .buildWithParams();

  return new CTEQueryBuilder()
    .withCTE("exp_scores", {
      ...joinedEventScores,
      schema: [
        "project_id",
        "experiment_id",
        "name",
        "data_type",
        "string_value",
        "exp_avg",
      ],
    })
    .from("exp_scores", "s")
    .select(
      "s.project_id AS project_id",
      "s.experiment_id AS experiment_id",
      `groupArrayIf(tuple(s.name, s.exp_avg, s.data_type, s.string_value), s.data_type IN ('NUMERIC', 'BOOLEAN')) AS ${prefix}_scores_avg`,
      `groupArrayIf(concat(s.name, ':', s.string_value), s.data_type = 'CATEGORICAL' AND notEmpty(s.string_value)) AS ${prefix}_score_categories`,
    )
    .groupBy("s.project_id", "s.experiment_id")
    .having(params.filters.apply())
    .buildWithParams();
};

export const getExperimentsCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getExperimentsFromEventsGeneric<{ count: string }>({
    select: "count",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    tags: { kind: "count" },
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getExperimentsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getExperimentsFromEventsGeneric<ExperimentEventsDataReturnType>({
      select: "rows",
      projectId: props.projectId,
      filter: props.filter,
      orderBy: props.orderBy,
      limit: props.limit,
      page: props.page,
      tags: { kind: "list" },
    });

  return rows.map((row) => ({
    id: row.experiment_id,
    name: row.experiment_name,
    description: row.experiment_description,
    datasetId: row.experiment_dataset_id,
    itemCount: Number(row.item_count),
    errorCount: Number(row.error_count),
    prompts: row.prompts || [],
    metadata: row.experiment_metadata || {},
    startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
  }));
};

export const getExperimentMetricsFromEvents = async (props: {
  projectId: string;
  experimentIds: string[];
}) => {
  if (props.experimentIds.length === 0) {
    return [];
  }

  // Use eventsExperimentsAggregation with "metrics" field set for simplified aggregation
  const queryBuilder = eventsExperimentsAggregation({
    projectId: props.projectId,
    fieldSet: "metrics",
    experimentIds: props.experimentIds,
  });

  const { query, params } = queryBuilder.buildWithParams();

  const res = await measureAndReturn({
    operationName: "getExperimentMetricsFromEvents",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "experiments",
        type: "experiments-table",
        projectId: props.projectId,
        operation_name: "getExperimentMetricsFromEvents",
      },
    },
    fn: async (input) => {
      return queryClickhouse<ExperimentMetricsReturnType>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });

  return res.map((row) => ({
    id: row.experiment_id,
    totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
    latencyAvg: row.latency_avg !== null ? Number(row.latency_avg) : null,
  }));
};

export type FetchExperimentsFromEventsProps = {
  select: "count" | "rows";
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
};

const getExperimentsFromEventsGeneric = async <T>(
  props: FetchExperimentsFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  // Split filters into pre-aggregation and post-aggregation
  const preAggFilterState = filter.filter((f) =>
    experimentPreAggCols.some((col) => col.uiTableId === f.column),
  );
  const scoreAggFilterState = filter.filter((f) =>
    experimentScoreAggCols.some((col) => col.uiTableId === f.column),
  );

  const preAggFilters = new FilterList(
    createFilterFromFilterState(preAggFilterState, experimentPreAggCols),
  );
  const scoreAggFilters = new FilterList(
    createFilterFromFilterState(scoreAggFilterState, experimentScoreAggCols),
  );

  // Extract experiment IDs for optimization
  const experimentIdFilter = preAggFilters.find(
    (f) => f instanceof StringOptionsFilter && f.field === "e.experiment_id",
  ) as StringOptionsFilter | undefined;

  // Extract time filter for score CTEs
  const startTimeFrom = extractTimeFilter(
    preAggFilters,
    "events_proto",
    "start_time",
    "e",
  );

  // Detect score filter presence to conditionally include score CTEs
  const hasTraceScoreFilter = scoreAggFilters.some((f) =>
    ["trace_scores_avg", "trace_score_categories"].includes(f.field),
  );
  const hasObsScoreFilter = scoreAggFilters.some((f) =>
    ["obs_scores_avg", "obs_score_categories"].includes(f.field),
  );

  const experimentIds = experimentIdFilter?.values;

  const eventKeys = eventsExperiments({ projectId })
    .applyFilters(preAggFilters)
    .selectRaw("e.project_id", "e.experiment_id", "e.trace_id")
    .limitBy("e.project_id", "e.experiment_id", "e.trace_id")
    .buildWithParams();

  const queryBuilder = eventsExperimentsAggregation({
    projectId,
    fieldSet: select === "count" ? "count" : "base",
    startTimeFrom,
    experimentIds,
  })
    .applyFilters(preAggFilters)
    .when(hasObsScoreFilter, (b) => {
      return b
        .withCTE(
          "matching_obs_experiments",
          experimentScoreCTE({
            projectId,
            startTimeFrom,
            eventKeysCTE: {
              ...eventKeys,
              schema: ["project_id", "experiment_id", "trace_id"],
            },
            filters: scoreAggFilters.filter((f) =>
              ["obs_scores_avg", "obs_score_categories"].includes(f.field),
            ),
            level: "observation",
          }),
        )
        .innerJoin(
          "matching_obs_experiments AS moe",
          "ON moe.project_id = e.project_id AND moe.experiment_id = e.experiment_id",
        );
    })
    .when(hasTraceScoreFilter, (b) => {
      return b
        .withCTE(
          "matching_ts_experiments",
          experimentScoreCTE({
            projectId,
            startTimeFrom,
            eventKeysCTE: {
              ...eventKeys,
              schema: ["project_id", "experiment_id", "trace_id"],
            },
            filters: scoreAggFilters.filter((f) =>
              ["trace_scores_avg", "trace_score_categories"].includes(f.field),
            ),
            level: "trace",
          }),
        )
        .innerJoin(
          "matching_ts_experiments AS mte",
          "ON mte.project_id = e.project_id AND mte.experiment_id = e.experiment_id",
        );
    });

  // Apply ordering
  const orderBySql = orderByToClickhouseSql(
    orderBy ?? null,
    experimentOrderByCols,
  );
  if (orderBySql) {
    queryBuilder.orderBy(orderBySql);
  }

  // Apply pagination
  if (limit !== undefined && page !== undefined) {
    queryBuilder.limit(limit, limit * page);
  }

  const built = queryBuilder.buildWithParams();

  const finalQuery =
    select === "count"
      ? `SELECT count() AS count FROM (${built.query}) matched_experiments`
      : built.query;

  const finalParams = built.params;

  return measureAndReturn({
    operationName: "getExperimentsFromEventsGeneric",
    projectId,
    input: {
      params: finalParams,
      tags: {
        ...(props.tags ?? {}),
        feature: "experiments",
        type: "experiments-table",
        projectId,
        operation_name: `getExperimentsFromEventsGeneric-${select}`,
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query: finalQuery,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};

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
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
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

const IO_TRUNCATE_LENGTH = 1000;

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

  const queryBuilder = eventsExperimentsRootSpans({
    projectId,
    experimentIds: allExperimentIds,
    experimentItemIds: itemIds,
  })
    .selectIO(true, env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT)
    .selectRaw(
      "leftUTF8(e.experiment_item_expected_output, {truncateLength: UInt32}) as expected_output",
      "e.experiment_item_id as item_id",
      "e.experiment_id as experiment_id",
    )
    // We must deterministically return the latest row for each experiment_item_id, experiment_id pair until we model repetitions (LFE-8965)
    .orderByColumns([{ column: "e.start_time", direction: "DESC" }])
    .limitBy("e.experiment_item_id, e.experiment_id");

  const { query, params } = queryBuilder.buildWithParams();

  const rows = await queryClickhouse<{
    item_id: string;
    experiment_id: string;
    input: string | null;
    output: string | null;
    expected_output: string | null;
  }>({
    query,
    params: {
      ...params,
      truncateLength: IO_TRUNCATE_LENGTH,
    },
    tags: {
      feature: "experiments",
      type: "experiment-items-batch-io",
      projectId,
    },
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

export const getExperimentNamesFromEvents = async (props: {
  projectId: string;
}) => {
  const queryBuilder = new EventsAggQueryBuilder({
    projectId: props.projectId,
    groupByColumn: "e.experiment_name",
    selectExpression:
      "e.experiment_name as experimentName, any(e.experiment_id) as experimentId",
  })
    .whereRaw("e.experiment_name IS NOT NULL AND length(e.experiment_name) > 0")
    .limit(1000, 0);

  const { query, params } = queryBuilder.buildWithParams();

  const res = await queryClickhouse<{
    experimentName: string;
    experimentId: string;
  }>({
    query,
    params,
    tags: {
      feature: "tracing",
      type: "events",
      kind: "analytic",
      projectId: props.projectId,
    },
  });

  return res;
};
