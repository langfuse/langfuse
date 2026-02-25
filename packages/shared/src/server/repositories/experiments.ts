import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  DateTimeFilter,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsExperimentsAggregation } from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import {
  experimentCols,
  experimentEventsFilterCols,
} from "../tableMappings/mapExperimentTable";

export type ExperimentEventsDataReturnType = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string;
  created_at: string;
  updated_at: string;
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
    createdAt: parseClickhouseUTCDateTimeFormat(row.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(row.updated_at),
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
  const hasMetricsFilter = experimentFilters.some((f) =>
    ["totalCost", "latencyAvg", "errorCount"].includes(f.field),
  );

  const selectMetrics = select === "metrics" || hasMetricsFilter;

  // Build main experiment_data CTE
  const experimentsBuilder = eventsExperimentsAggregation({
    projectId,
    experimentIds: experimentIdFilter?.values,
  }).selectFieldSet("all");

  // Apply pre-aggregation filters from experimentEventsFilterCols
  if (filter.length > 0) {
    const preAggFilters = new FilterList(
      createFilterFromFilterState(filter, experimentEventsFilterCols),
    );
    const preAggFiltersRes = preAggFilters.apply();
    if (preAggFiltersRes.query) {
      experimentsBuilder.whereRaw(
        preAggFiltersRes.query,
        preAggFiltersRes.params,
      );
    }
  }

  // Initialize CTEQueryBuilder
  let queryBuilder = new CTEQueryBuilder()
    .withCTEFromBuilder("experiment_data", experimentsBuilder)
    .from("experiment_data", "e");

  // Conditionally add trace_metrics + experiment_metrics CTEs for cost/latency
  if (selectMetrics) {
    // Build trace-level metrics CTE (Stage 1)
    const traceMetricsCte = {
      query: `
        SELECT
          e.project_id,
          e.experiment_id,
          e.trace_id,
          dateDiff('millisecond', min(e.start_time), greatest(max(e.start_time), max(e.end_time))) as latency_ms,
          sum(e.total_cost) as total_cost
        FROM events_core e
        WHERE e.project_id = {projectId: String}
          AND e.experiment_id IS NOT NULL
          AND e.experiment_id != ''
          AND e.is_deleted = 0
          ${startTimeFilter ? `AND e.start_time >= {startTimeFrom: DateTime64(3)}` : ""}
          ${experimentIdFilter?.values ? `AND e.experiment_id IN ({experimentIds: Array(String)})` : ""}
        GROUP BY e.project_id, e.experiment_id, e.trace_id
      `.trim(),
      params: {
        ...(startTimeFilter
          ? {
              startTimeFrom: convertDateToClickhouseDateTime(
                startTimeFilter.value,
              ),
            }
          : {}),
        ...(experimentIdFilter?.values
          ? { experimentIds: experimentIdFilter.values }
          : {}),
      },
      schema: [
        "project_id",
        "experiment_id",
        "trace_id",
        "latency_ms",
        "total_cost",
      ],
    };

    // Build experiment-level metrics CTE (Stage 2)
    const experimentMetricsCte = {
      query: `
        SELECT
          project_id,
          experiment_id,
          sum(total_cost) as total_cost,
          avg(latency_ms) as latency_avg
        FROM trace_metrics
        GROUP BY project_id, experiment_id
      `.trim(),
      params: {},
      schema: ["project_id", "experiment_id", "total_cost", "latency_avg"],
    };

    queryBuilder = queryBuilder
      .withCTE("trace_metrics", traceMetricsCte)
      .withCTE("experiment_metrics", experimentMetricsCte)
      .leftJoin(
        "experiment_metrics",
        "em",
        "ON em.experiment_id = e.experiment_id AND em.project_id = e.project_id",
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
        "e.created_at",
        "e.updated_at",
        "e.item_count",
        "e.error_count",
        "e.prompts",
        "e.experiment_metadata",
        "e.project_id",
      );
      break;
    case "metrics":
      queryBuilder.selectColumns("e.experiment_id", "e.project_id");
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
