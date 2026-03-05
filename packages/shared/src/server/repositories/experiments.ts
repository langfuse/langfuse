import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  eventScoresCTE,
  eventTraceScoresCTE,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  CTEQueryBuilder,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  eventsExperimentsAggregation,
  eventsTracesAggregation,
} from "../queries/clickhouse-sql/query-fragments";
import { extractTimeFilter, queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import {
  experimentPreAggCols,
  experimentPostAggCols,
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
  const postAggFilterState = filter.filter((f) =>
    experimentPostAggCols.some((col) => col.uiTableId === f.column),
  );

  const preAggFilters = new FilterList(
    createFilterFromFilterState(preAggFilterState, experimentPreAggCols),
  );
  const postAggFilters = new FilterList(
    createFilterFromFilterState(postAggFilterState, experimentPostAggCols),
  );

  // Extract experiment IDs for optimization
  const experimentIdFilter = preAggFilters.find(
    (f) => f instanceof StringOptionsFilter && f.field === "e.experiment_id",
  ) as StringOptionsFilter | undefined;

  // Extract time filter for score CTEs
  const startTimeFrom = extractTimeFilter(preAggFilters);

  // Detect score filter presence to conditionally include score CTEs
  const hasTraceScoreFilter = postAggFilters.some((f) =>
    ["trace_scores_avg", "trace_score_categories"].includes(f.field),
  );
  const hasObsScoreFilter = postAggFilters.some((f) =>
    ["obs_scores_avg", "obs_score_categories"].includes(f.field),
  );

  // Build query using explicit CTE composition
  const queryBuilder = eventsExperimentsAggregation({
    projectId,
    fieldSet: select === "count" ? "count" : "base",
    startTimeFrom,
    experimentIds: experimentIdFilter?.values,
  })
    .when(hasTraceScoreFilter, (b) =>
      b
        .withCTE(
          "trace_scores",
          eventTraceScoresCTE({ projectId, startTimeFrom }),
        )
        .leftJoin(
          "trace_scores AS ts",
          "ON ts.project_id = e.project_id AND ts.trace_id = e.trace_id",
        )
        .selectRaw(
          "groupArrayIf(tuple(ts.name, ts.avg_value, ts.data_type, ts.string_value), ts.data_type IN ('NUMERIC', 'BOOLEAN')) AS trace_scores_avg",
          "groupArrayIf(concat(ts.name, ':', ts.string_value), ts.data_type = 'CATEGORICAL' AND notEmpty(ts.string_value)) AS trace_score_categories",
        ),
    )
    // Conditionally include observation-level scores
    .when(hasObsScoreFilter, (b) =>
      b
        .withCTE("obs_scores", eventScoresCTE({ projectId, startTimeFrom }))
        .leftJoin(
          "obs_scores AS os",
          "ON os.project_id = e.project_id AND os.trace_id = e.trace_id AND os.observation_id = e.span_id",
        )
        .selectRaw(
          "groupArrayIf(tuple(os.name, os.avg_value, os.data_type, os.string_value), os.data_type IN ('NUMERIC', 'BOOLEAN')) AS obs_scores_avg",
          "groupArrayIf(concat(os.name, ':', os.string_value), os.data_type = 'CATEGORICAL' AND notEmpty(os.string_value)) AS obs_score_categories",
        ),
    )
    .applyFilters(preAggFilters)
    .having(postAggFilters.apply());

  // Apply ordering
  const orderBySql = orderByToClickhouseSql(
    orderBy ?? null,
    experimentPostAggCols,
  );
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
      params,
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
