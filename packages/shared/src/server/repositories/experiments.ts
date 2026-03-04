import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  CTEWithSchema,
  DateTimeFilter,
  EventsAggQueryBuilder,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  eventsExperimentsAggregation,
  eventsExperimentsObservationScoresAggregation,
  eventsExperimentsTraceScoresAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { buildExperimentFilterState } from "../queries/clickhouse-sql/utils";
import { queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import {
  experimentTableUiColumnDefinitions,
  experimentPreAggCols,
  experimentCols,
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

  // Build FilterState using helper function
  const filterState = buildExperimentFilterState({
    experimentIds,
    startTimeFrom,
  });

  // Convert FilterState to Filter objects and apply
  const filters = new FilterList(
    createFilterFromFilterState(
      filterState,
      experimentTableUiColumnDefinitions,
    ),
  );
  const appliedFilters = filters.apply();

  const builder = new EventsAggQueryBuilder({
    projectId,
    groupByColumn: "e.project_id, e.experiment_id, e.trace_id",
    selectExpression: `
      e.project_id,
      e.experiment_id,
      e.trace_id,
      dateDiff('millisecond', min(e.start_time), greatest(max(e.start_time), max(e.end_time))) as latency_ms,
      sum(e.total_cost) as total_cost`,
  }).where(appliedFilters);

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

const getExperimentsFromEventsGeneric = async <T>(
  props: FetchExperimentsFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  // Build filters and extract conditional logic
  const experimentFilters = new FilterList(
    createFilterFromFilterState(filter, experimentCols),
  );

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

  // Detect observation-level scores filter (eos.*)
  const hasObsScoresFilter = experimentFilters.some((f) =>
    ["eos.obs_scores_avg", "eos.obs_score_categories"].includes(f.field),
  );

  // Detect trace-level scores filter (ets.*)
  const hasTraceScoresFilter = experimentFilters.some((f) =>
    ["ets.trace_scores_avg", "ets.trace_score_categories"].includes(f.field),
  );

  const selectMetrics = select === "metrics" || hasMetricsFilter;

  // Build main experiment_data CTE
  const experimentsBuilder = eventsExperimentsAggregation({
    projectId,
    experimentIds: experimentIdFilter?.values,
  }).selectFieldSet("all");

  // Apply pre-aggregation filters
  // Only include filters for columns defined in experimentPreAggCols (raw events table columns)
  const preAggFilterState = filter.filter((f) =>
    experimentPreAggCols.some((col) => col.uiTableId === f.column),
  );

  if (preAggFilterState.length > 0) {
    const preAggFilters = new FilterList(
      createFilterFromFilterState(preAggFilterState, experimentPreAggCols),
    );
    experimentsBuilder.applyFilters(preAggFilters);
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

  // Conditionally add observation scores CTE
  if (hasObsScoresFilter) {
    const obsScoresCte = eventsExperimentsObservationScoresAggregation({
      projectId,
      experimentIds: experimentIdFilter?.values,
      startTimeFrom: startTimeFilter
        ? convertDateToClickhouseDateTime(startTimeFilter.value)
        : null,
    });

    queryBuilder = queryBuilder
      .withCTE("experiment_obs_scores", obsScoresCte)
      .leftJoin(
        "experiment_obs_scores",
        "eos",
        "ON eos.experiment_id = e.experiment_id AND eos.project_id = e.project_id",
      );
  }

  // Conditionally add trace scores CTE
  if (hasTraceScoresFilter) {
    const traceScoresCte = eventsExperimentsTraceScoresAggregation({
      projectId,
      experimentIds: experimentIdFilter?.values,
      startTimeFrom: startTimeFilter
        ? convertDateToClickhouseDateTime(startTimeFilter.value)
        : null,
    });

    queryBuilder = queryBuilder
      .withCTE("experiment_trace_scores", traceScoresCte)
      .leftJoin(
        "experiment_trace_scores",
        "ets",
        "ON ets.experiment_id = e.experiment_id AND ets.project_id = e.project_id",
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
  queryBuilder.applyFilters(experimentFilters);

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
