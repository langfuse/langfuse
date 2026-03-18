import { env } from "../../env";
import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  CTEWithSchema,
  EventsAggQueryBuilder,
  EventsQueryBuilder,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  orderByToEntries,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  buildScoresCTE,
  eventsExperimentItemRoots,
  eventsExperimentItemsByIds,
  eventsExperiments,
  eventsExperimentsAggregation,
  eventsTracesAggregation,
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
      "ek.project_id, ek.experiment_id, us.name, us.data_type, us.string_value",
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
    .groupBy("s.project_id, s.experiment_id")
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

  const tracesBuilder = eventsTracesAggregation({
    projectId: props.projectId,
  }).whereRaw("e.experiment_id IN ({experimentIds: Array(String)})", {
    experimentIds: props.experimentIds,
  });

  // Build the final query
  const queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("traces_agg", tracesBuilder)
    .from("traces_agg", "ta")
    .select(
      "ta.experiment_id AS experiment_id",
      "SUM(ta.total_cost) AS total_cost",
      "AVG(ta.latency_milliseconds) AS latency_avg",
    )
    .groupBy("ta.project_id, ta.experiment_id");

  const { query, params } = queryBuilder.buildWithParams();

  const res = await measureAndReturn({
    operationName: "getExperimentsFromEventsGeneric",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "experiments",
        type: "experiments-table",
        projectId: props.projectId,
        operation_name: `getExperimentMetricsFromEvents`,
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
  observation_id: string;
  trace_id: string;
  experiment_root_id: string;
};

/**
 * Data for a single experiment within an item.
 */
export type ExperimentItemData = {
  experimentId: string;
  level: string;
  startTime: Date;
  observationId: string;
  traceId: string;
  experimentRootId: string;
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

/**
 * Get experiment items count for pagination with intersection filtering.
 * Counts items that match the intersection criteria across experiments.
 */
export const getExperimentItemsCountFromEvents = async (props: {
  projectId: string;
  baseExperimentId: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
}): Promise<number> => {
  const { projectId, baseExperimentId, compExperimentIds, filterByExperiment } =
    props;

  // Build filter conditions (reuse the same logic as getExperimentItemsFromEvents)
  const { orConditions, filterParams } = buildExperimentFilterConditions({
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
  });

  // numExperiments = number of OR conditions (base + comparison experiments with filters)
  const numExperiments = orConditions.length;

  const queryBuilder = eventsExperimentItemRoots({ projectId });

  const countQuery = `
    SELECT count() as count
    FROM (
      SELECT e.experiment_item_id as item_id
      FROM events_core e
      WHERE e.project_id = {projectId: String}
        AND e.experiment_item_id != ''
        AND e.span_id = e.experiment_item_root_span_id
        AND (${orConditions.join("\n          OR ")})
      GROUP BY e.experiment_item_id
      HAVING uniq(e.experiment_id) = {numExperiments: UInt32}
    )
  `;

  const rows = await queryClickhouse<{ count: string }>({
    query: countQuery,
    params: {
      projectId,
      ...filterParams,
      numExperiments,
    },
    tags: {
      feature: "experiments",
      type: "experiment-items-count",
      projectId,
    },
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

/**
 * Build filter conditions for the intersection query.
 * Returns OR conditions and params for each experiment that needs filtering.
 */
const buildExperimentFilterConditions = (params: {
  baseExperimentId: string;
  compExperimentIds: string[];
  filterByExperiment: { experimentId: string; filters: FilterState }[];
}): { orConditions: string[]; filterParams: Record<string, unknown> } => {
  const { baseExperimentId, compExperimentIds, filterByExperiment } = params;

  // Map experimentId -> filters for quick lookup
  const filtersByExperiment = new Map(
    filterByExperiment.map((f) => [f.experimentId, f.filters]),
  );

  const orConditions: string[] = [];
  const filterParams: Record<string, unknown> = {};
  let conditionIndex = 0;

  // 1. Base experiment - ALWAYS included
  const baseParamName = `expId_${conditionIndex++}`;
  filterParams[baseParamName] = baseExperimentId;

  const baseFilters = filtersByExperiment.get(baseExperimentId);
  if (baseFilters && baseFilters.length > 0) {
    const filterList = new FilterList(
      createFilterFromFilterState(
        baseFilters,
        experimentItemsTableNativeUiColumnDefinitions,
      ),
    );
    const filterResult = filterList.apply();
    const filterSql = filterResult.query.trim().replace(/^AND\s+/i, "");
    // Merge filter params directly - they already have unique random suffixes
    Object.assign(filterParams, filterResult.params || {});
    orConditions.push(
      `(e.experiment_id = {${baseParamName}: String} AND ${filterSql})`,
    );
  } else {
    orConditions.push(`e.experiment_id = {${baseParamName}: String}`);
  }

  // 2. Comparison experiments - ONLY if they have filters
  for (const compId of compExperimentIds) {
    const compFilters = filtersByExperiment.get(compId);
    if (compFilters && compFilters.length > 0) {
      const paramName = `expId_${conditionIndex++}`;
      filterParams[paramName] = compId;

      const filterList = new FilterList(
        createFilterFromFilterState(
          compFilters,
          experimentItemsTableNativeUiColumnDefinitions,
        ),
      );
      const filterResult = filterList.apply();
      const filterSql = filterResult.query.trim().replace(/^AND\s+/i, "");
      // Merge filter params directly - they already have unique random suffixes
      Object.assign(filterParams, filterResult.params || {});
      orConditions.push(
        `(e.experiment_id = {${paramName}: String} AND ${filterSql})`,
      );
    }
    // If no filters for this comparison experiment, don't add an OR condition
  }

  return { orConditions, filterParams };
};

/**
 * Get experiment items with intersection filtering across experiments.
 * Returns items grouped by item_id with data from ALL experiments.
 *
 * Query 1: Get filtered item_ids using intersection logic
 * Query 2: Fetch data for those items across ALL experiments
 */
export const getExperimentItemsFromEvents = async (props: {
  projectId: string;
  baseExperimentId: string;
  compExperimentIds: string[];
  filterByExperiment: {
    experimentId: string;
    filters: FilterState;
  }[];
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
}): Promise<GroupedExperimentItem[]> => {
  const {
    projectId,
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
    limit,
    offset,
  } = props;

  // All experiments (for the second query)
  const allExperimentIds = [baseExperimentId, ...compExperimentIds];

  // Build filter conditions
  const { orConditions, filterParams } = buildExperimentFilterConditions({
    baseExperimentId,
    compExperimentIds,
    filterByExperiment,
  });

  // numExperiments = number of OR conditions (base + comparison experiments with filters)
  const numExperiments = orConditions.length;

  // ========== QUERY 1: Get filtered item_ids ==========
  const queryBuilder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.experiment_item_id",
    selectExpression: "e.experiment_item_id as item_id",
  })
    .whereRaw("e.span_id = e.experiment_item_root_span_id")
    .orderBy("e.start_time desc, e.experiment_item_id desc")
    .limit(limit ?? 50, offset ?? 0);

  // const queryBuilderIds = eventsExperimentItemRoots({ projectId })
  //   .groupByRaw("e.experiment_item_id")
  //   .orderBy("e.start_time desc, e.experiment_item_id desc");
  // apply filters or conditions
  // group by experiment_item_id
  // having uniq(experiment_id) = numExperiments
  // order by start_time desc, experiment_item_id desc (due to repetitions)
  // limit limit offset offset

  const itemIdsQuery = `
    WHERE (${orConditions.join("\n        OR ")})
    HAVING uniq(e.experiment_id) = {numExperiments: UInt32}
  `;

  const itemIdsResult = await queryClickhouse<{ item_id: string }>({
    query: itemIdsQuery,
    params: {
      projectId,
      ...filterParams,
      numExperiments,
      limit: limit ?? 50,
      offset: offset ?? 0,
    },
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

  // ========== QUERY 2: Fetch data for ALL experiments ==========
  const queryBuilderData = eventsExperimentItemsByIds({
    projectId,
    experimentItemIds: itemIds,
    experimentIds: allExperimentIds,
  }).selectRaw(
    "e.experiment_item_id as item_id",
    "e.experiment_id as experiment_id",
    "e.level as level",
    "e.start_time as start_time",
    "e.span_id as observation_id",
    "e.trace_id as trace_id",
    "e.span_id as observation_id",
  );

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
      observationId: row.observation_id,
      traceId: row.trace_id,
      experimentRootId: row.experiment_root_id,
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
  baseExperimentId: string;
  compExperimentIds: string[];
}): Promise<ExperimentItemBatchIO[]> => {
  const { projectId, itemIds, baseExperimentId, compExperimentIds } = props;

  if (itemIds.length === 0) {
    return [];
  }

  const allExperimentIds = [baseExperimentId, ...compExperimentIds];

  const queryBuilder = eventsExperimentItemsByIds({
    projectId,
    experimentIds: allExperimentIds,
    experimentItemIds: itemIds,
  })
    .selectIO(true, env.LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT)
    .selectRaw(
      "leftUTF8(e.experiment_item_expected_output, {truncateLength: UInt32}) as expected_output",
      "e.experiment_item_id as item_id",
      "e.experiment_id as experiment_id",
    );

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

    // Extract input and expectedOutput from base experiment
    if (row.experiment_id === baseExperimentId) {
      item.input = row.input;
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

/**
 * Get metrics for specific experiment items.
 */
export const getExperimentItemMetricsFromEvents = async (props: {
  projectId: string;
  experimentId: string;
  experimentItemIds: string[];
}) => {
  if (props.experimentItemIds.length === 0) {
    return [];
  }

  const tracesBuilder = eventsTracesAggregation({
    projectId: props.projectId,
  })
    .whereRaw("e.experiment_id = {experimentId: String}", {
      experimentId: props.experimentId,
    })
    .whereRaw("e.experiment_item_id IN ({experimentItemIds: Array(String)})", {
      experimentItemIds: props.experimentItemIds,
    })
    .whereRaw("e.is_deleted = 0");

  const { query, params } = tracesBuilder.buildWithParams();

  const rows = await queryClickhouse<ExperimentItemMetricsReturnType>({
    query,
    params: {
      ...params,
      projectId: props.projectId,
    },
    tags: {
      feature: "experiments",
      type: "experiment-items-metrics",
      projectId: props.projectId,
    },
  });

  return rows.map((row) => ({
    id: row.experiment_item_id,
    totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
    latencyMs:
      row.latency_milliseconds !== null
        ? Number(row.latency_milliseconds)
        : null,
  }));
};
