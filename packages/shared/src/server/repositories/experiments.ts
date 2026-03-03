import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  CTEWithSchema,
  DateTimeFilter,
  EventsQueryBuilder,
  EventsAggQueryBuilder,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  EventsAggregationQueryBuilder,
  orderByToEntries,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  eventsExperimentsAggregation,
  eventsTracesAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import { experimentItemsTableNativeUiColumnDefinitions } from "../tableMappings/mapExperimentItemsTable";
import {
  experimentCols,
  experimentPreAggCols,
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
  total_cost: number | null; // Total cost summed across traces
  latency_avg: number | null; // Average latency in milliseconds across traces
};

export type ExperimentMetricsReturnType = {
  experiment_id: string;
  total_cost: number | null;
  latency_avg: number | null;
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
  filter?: FilterState;
}) => {
  if (props.experimentIds.length === 0) {
    return [];
  }

  const rows =
    await getExperimentsFromEventsGeneric<ExperimentMetricsReturnType>({
      select: "metrics",
      projectId: props.projectId,
      filter: [
        ...(props.filter ?? []),
        {
          column: "id",
          type: "stringOptions",
          operator: "any of",
          value: props.experimentIds,
        },
      ],
      tags: { kind: "metrics" },
    });

  return rows.map((row) => ({
    id: row.experiment_id,
    totalCost: row.total_cost !== null ? Number(row.total_cost) : null,
    latencyAvg: row.latency_avg !== null ? Number(row.latency_avg) : null,
  }));
};

export type FetchExperimentsFromEventsProps = {
  select: "count" | "rows" | "metrics";
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
};

/**
 * Helper function to build trace-level metrics CTE for experiments.
 * Groups events by (project_id, experiment_id, trace_id) and computes:
 * - latency_ms: Time difference between min start_time and max end_time
 * - total_cost: Sum of costs across all events in the trace
 *
 * This is Stage 1 of the two-stage aggregation required for experiment metrics.
 */
const buildExperimentTraceMetricsCTE = (params: {
  projectId: string;
  experimentIds?: string[];
  startTimeFrom?: string | null;
}): CTEWithSchema => {
  const { projectId, experimentIds, startTimeFrom } = params;

  const builder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.project_id, e.experiment_id, e.trace_id",
    selectExpression: `
      e.project_id,
      e.experiment_id,
      e.trace_id,
      dateDiff('millisecond', min(e.start_time), greatest(max(e.start_time), max(e.end_time))) as latency_ms,
      sum(e.total_cost) as total_cost`,
  })
    .whereRaw("e.experiment_id != ''")
    .when(Boolean(experimentIds?.length), (b) =>
      b.whereRaw("e.experiment_id IN ({experimentIds: Array(String)})", {
        experimentIds,
      }),
    )
    .when(Boolean(startTimeFrom), (b) =>
      b.whereRaw("e.start_time >= {startTimeFrom: DateTime64(3)}", {
        startTimeFrom,
      }),
    );

  return {
    ...builder.buildWithParams(),
    schema: [
      "project_id",
      "experiment_id",
      "trace_id",
      "latency_ms",
      "total_cost",
    ],
  };
};

/**
 * Helper function to build experiment-level metrics CTE.
 * Aggregates trace-level metrics (from trace_metrics CTE) to experiment level:
 * - total_cost: SUM of trace costs (experiment total)
 * - latency_avg: AVG of trace latencies (average latency)
 *
 * This is Stage 2 of the two-stage aggregation required for experiment metrics.
 */
const buildExperimentMetricsCTE = (): CTEWithSchema => {
  const query = `
    SELECT
      project_id,
      experiment_id,
      sum(total_cost) as total_cost,
      avg(latency_ms) as latency_avg
    FROM trace_metrics
    GROUP BY project_id, experiment_id
  `.trim();

  return {
    query,
    params: {},
    schema: ["project_id", "experiment_id", "total_cost", "latency_avg"],
  };
};

/**
 * Helper function to build scores aggregation CTE for experiments.
 * Aggregates scores by (project_id, experiment_id):
 * - scores_avg: Array of tuples (score_name, experiment_level_avg) for numeric/boolean scores
 * - score_categories: Array of "name:value" strings for categorical scores
 *
 * Note: scores_avg contains ONE tuple per score name with the EXPERIMENT-LEVEL average
 * (not per-trace averages), enabling correct filtering by average score thresholds.
 */
const buildExperimentScoresCTE = (params: {
  projectId: string;
  experimentIds?: string[];
  startTimeFrom?: string | null;
}): CTEWithSchema => {
  // Build the WHERE conditions for reuse in both UNION branches
  const baseConditions = `
    e.project_id = {projectId: String}
    AND e.experiment_id IS NOT NULL
    AND e.experiment_id != ''
    AND e.is_deleted = 0
    ${params.startTimeFrom ? `AND e.start_time >= {startTimeFrom: DateTime64(3)}` : ""}
    ${params.experimentIds ? `AND e.experiment_id IN ({experimentIds: Array(String)})` : ""}
  `.trim();

  const query = `
    SELECT
      project_id,
      experiment_id,
      -- Filter out empty names from the array
      arrayFilter(x -> x.1 != '', groupArray(tuple(name, avg_value))) AS scores_avg,
      -- Flatten and filter empty strings from categorical scores
      arrayFilter(x -> x != '', arrayFlatten(groupArray(category_values))) AS score_categories
    FROM (
      -- Numeric/Boolean scores: compute EXPERIMENT-LEVEL average per score name
      SELECT
        e.project_id as project_id,
        e.experiment_id as experiment_id,
        s.name as name,
        avg(s.value) as avg_value,
        [] as category_values
      FROM events_core e
      INNER JOIN scores s FINAL ON s.project_id = e.project_id AND s.trace_id = e.trace_id
      WHERE ${baseConditions}
        AND s.data_type IN ('NUMERIC', 'BOOLEAN')
      GROUP BY e.project_id, e.experiment_id, s.name

      UNION ALL

      -- Categorical scores: collect all distinct name:value pairs per experiment
      SELECT
        e.project_id as project_id,
        e.experiment_id as experiment_id,
        '' as name,
        0 as avg_value,
        groupArray(DISTINCT concat(s.name, ':', s.string_value)) as category_values
      FROM events_core e
      INNER JOIN scores s FINAL ON s.project_id = e.project_id AND s.trace_id = e.trace_id
      WHERE ${baseConditions}
        AND s.data_type = 'CATEGORICAL'
        AND notEmpty(s.string_value)
      GROUP BY e.project_id, e.experiment_id
    ) sub
    GROUP BY project_id, experiment_id
  `.trim();

  const cteParams: Record<string, string | string[]> = {};

  if (params.startTimeFrom) {
    cteParams.startTimeFrom = params.startTimeFrom;
  }

  if (params.experimentIds) {
    cteParams.experimentIds = params.experimentIds;
  }

  return {
    query,
    params: cteParams,
    schema: ["project_id", "experiment_id", "scores_avg", "score_categories"],
  };
};

const getExperimentsFromEventsGeneric = async <T>(
  props: FetchExperimentsFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  // Build filters and extract conditional logic
  const experimentFilters = new FilterList(
    createFilterFromFilterState(filter, experimentCols),
  );
  const filtersRes = experimentFilters.apply();

  // Extract specific filters for conditional CTE building
  const startTimeFilter = experimentFilters.find(
    (f) =>
      f.field === "createdAt" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const experimentIdFilter = experimentFilters.find(
    (f) => f instanceof StringOptionsFilter && f.field === "id",
  ) as StringOptionsFilter | undefined;

  // Determine if metrics CTEs are needed
  // Note: f.field contains the clickhouseSelect value (e.g., "em.total_cost", "es.scores_avg")
  const hasMetricsFilter = experimentFilters.some((f) =>
    ["em.total_cost", "em.latency_avg"].includes(f.field),
  );

  const hasScoresFilter = experimentFilters.some((f) =>
    ["es.scores_avg", "es.score_categories"].includes(f.field),
  );

  const selectMetrics = select === "metrics" || hasMetricsFilter;
  const selectScores = hasScoresFilter;

  // Build main experiment_data CTE
  const experimentsBuilder = eventsExperimentsAggregation({
    projectId,
    experimentIds: experimentIdFilter?.values,
  }).selectFieldSet("all");

  // Apply pre-aggregation filters
  // Only include filters for columns defined in experimentPreAggCols (raw events table columns)
  if (filter.length > 0) {
    const preAggFilterState = filter.filter((f) =>
      experimentPreAggCols.some((col) => col.uiTableId === f.column),
    );

    if (preAggFilterState.length > 0) {
      const preAggFilters = new FilterList(
        createFilterFromFilterState(preAggFilterState, experimentPreAggCols),
      );
      const preAggFiltersRes = preAggFilters.apply();
      if (preAggFiltersRes.query) {
        experimentsBuilder.whereRaw(
          preAggFiltersRes.query,
          preAggFiltersRes.params,
        );
      }
    }
  }

  // Initialize CTEQueryBuilder
  let queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("experiment_data", experimentsBuilder)
    .from("experiment_data", "e");

  // Conditionally add trace_metrics + experiment_metrics CTEs for cost/latency
  if (selectMetrics) {
    const traceMetricsCte = buildExperimentTraceMetricsCTE({
      projectId,
      experimentIds: experimentIdFilter?.values,
      startTimeFrom: startTimeFilter
        ? convertDateToClickhouseDateTime(startTimeFilter.value)
        : null,
    });

    const experimentMetricsCte = buildExperimentMetricsCTE();

    queryBuilder = queryBuilder
      .withCTE("trace_metrics", traceMetricsCte)
      .withCTE("experiment_metrics", experimentMetricsCte)
      .leftJoin(
        "experiment_metrics",
        "em",
        "ON em.experiment_id = e.experiment_id AND em.project_id = e.project_id",
      );
  }

  // Conditionally add scores CTE for score aggregations
  if (selectScores) {
    const scoresCte = buildExperimentScoresCTE({
      projectId,
      experimentIds: experimentIdFilter?.values,
      startTimeFrom: startTimeFilter
        ? convertDateToClickhouseDateTime(startTimeFilter.value)
        : null,
    });

    queryBuilder = queryBuilder
      .withCTE("experiment_scores", scoresCte)
      .leftJoin(
        "experiment_scores",
        "es",
        "ON es.experiment_id = e.experiment_id AND es.project_id = e.project_id",
      );
  }

  // Add SELECT based on operation type
  switch (select) {
    case "count":
      queryBuilder.select("count(e.experiment_id) as count");
      break;
    case "rows":
      queryBuilder.selectColumns(
        "e.experiment_id",
        "e.experiment_name",
        "e.experiment_description",
        "e.experiment_dataset_id",
        "e.start_time",
        "e.item_count",
        "e.error_count",
        "e.prompts",
        "e.experiment_metadata",
        "e.metadata_names",
        "e.metadata_values",
        "e.project_id",
      );
      break;
    case "metrics":
      // Use explicit aliases to avoid column name conflicts with joined CTEs
      queryBuilder.select(
        "e.experiment_id as experiment_id",
        "e.project_id as project_id",
      );
      if (selectMetrics) {
        queryBuilder.select("em.total_cost", "em.latency_avg");
      }
      break;
    default: {
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${exhaustiveCheckDefault}`);
    }
  }

  // Apply post-aggregation filters
  if (filtersRes.query) {
    queryBuilder.whereRaw(filtersRes.query, filtersRes.params);
  }

  // Apply ordering
  const orderBySql = orderByToClickhouseSql(orderBy ?? null, experimentCols);
  if (orderBySql) {
    queryBuilder.orderBy(orderBySql);
  }

  // Apply pagination
  if (limit !== undefined && page !== undefined) {
    queryBuilder.limit(limit, limit * page);
  }

  const { query, params } = queryBuilder.buildWithParams();

  return measureAndReturn({
    operationName: "getExperimentsFromEventsGeneric",
    projectId,
    input: {
      params: {
        ...params,
        projectId,
      },
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
        query,
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
  id: string; // span_id
  trace_id: string;
  input: string | null;
  output: string | null;
  start_time: string;
  level: string;

  experiment_id: string;
  experiment_name: string;
  experiment_dataset_id: string;

  experiment_item_id: string;
  experiment_item_root_span_id: string;
  experiment_item_version: string | null;
  experiment_item_expected_output: string | null;
  experiment_item_metadata: Record<string, string>;
};

/**
 * Return type for experiment item metrics from ClickHouse.
 */
export type ExperimentItemMetricsReturnType = {
  experiment_item_id: string;
  trace_id: string;
  total_cost: number | null;
  latency_ms: number | null;
};

/**
 * Get experiment items count for pagination.
 * Counts only the root spans for each experiment item (where span_id = experiment_item_root_span_id).
 */
export const getExperimentItemsCountFromEvents = async (props: {
  projectId: string;
  experimentId: string;
  filter: FilterState;
}) => {
  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      props.filter,
      experimentItemsTableNativeUiColumnDefinitions,
    ),
  );

  const { query, params } = new EventsQueryBuilder({
    projectId: props.projectId,
  })
    .selectRaw("count(*) as count")
    .whereRaw("e.experiment_item_id != ''")
    .whereRaw("e.experiment_id = {experimentId: String}", {
      experimentId: props.experimentId,
    })
    .whereRaw("e.span_id = e.experiment_item_root_span_id")
    .applyFilters(eventsFilter)
    .buildWithParams();

  const rows = await queryClickhouse<{ count: string }>({
    query,
    params,
    tags: {
      feature: "experiments",
      type: "experiment-items-count",
      projectId: props.projectId,
    },
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

/**
 * Get experiment items for a single experiment.
 * Returns only the root span for each experiment item (where span_id = experiment_item_root_span_id).
 */
export const getExperimentItemsFromEvents = async (props: {
  projectId: string;
  experimentId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
}) => {
  const { projectId, experimentId, filter, orderBy, limit, offset } = props;

  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      filter,
      experimentItemsTableNativeUiColumnDefinitions,
    ),
  );

  const orderByEntries = orderByToEntries(
    [orderBy ?? null],
    experimentItemsTableNativeUiColumnDefinitions,
  );

  const builder = new EventsQueryBuilder({ projectId })
    .selectFieldSet("experimentItems")
    .whereRaw("e.experiment_item_id != ''")
    .whereRaw("e.experiment_id = {experimentId: String}", { experimentId })
    .whereRaw("e.span_id = e.experiment_item_root_span_id")
    .applyFilters(eventsFilter)
    .when(orderByEntries.length > 0, (b) => b.orderByColumns(orderByEntries));

  if (limit !== undefined && offset !== undefined) {
    builder.limit(limit, limit * offset);
  }

  const { query, params } = builder.buildWithParams();

  const rows = await queryClickhouse<ExperimentItemEventsDataReturnType>({
    query,
    params,
    tags: {
      feature: "experiments",
      type: "experiment-items-list",
      projectId,
    },
  });

  return rows.map((row) => ({
    id: row.experiment_item_id,
    observationId: row.id, // span_id
    traceId: row.trace_id,
    input: row.input,
    output: row.output,
    expectedOutput: row.experiment_item_expected_output,
    level: row.level,
    startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
    experimentId: row.experiment_id,
    experimentName: row.experiment_name,
    datasetId: row.experiment_dataset_id,
    rootSpanId: row.experiment_item_root_span_id,
    datasetItemVersion: row.experiment_item_version,
    metadata: row.experiment_item_metadata || {},
  }));
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
    latencyMs: row.latency_ms !== null ? Number(row.latency_ms) : null,
  }));
};
