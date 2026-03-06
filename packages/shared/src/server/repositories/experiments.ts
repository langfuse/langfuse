import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import {
  CTEQueryBuilder,
  CTEWithSchema,
  EventsQueryBuilder,
  FilterList,
  StringOptionsFilter,
  orderByToClickhouseSql,
  orderByToEntries,
} from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import {
  buildScoresCTE,
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
  metadata: Record<string, string>;
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

  console.log("rows", rows);

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
    datasetItemVersion: row.experiment_item_version
      ? parseClickhouseUTCDateTimeFormat(row.experiment_item_version)
      : null,
    itemMetadata: row.experiment_item_metadata || {},
    eventMetadata: row.metadata || {},
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
    latencyMs:
      row.latency_milliseconds !== null
        ? Number(row.latency_milliseconds)
        : null,
  }));
};
