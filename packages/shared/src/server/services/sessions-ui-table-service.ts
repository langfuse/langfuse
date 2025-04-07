import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { sessionCols } from "../../tableDefinitions/mapSessionTable";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { DateTimeFilter, FilterList, orderByToClickhouseSql } from "../queries";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/clickhouse-sql/factory";
import {
  TRACE_TO_OBSERVATIONS_INTERVAL,
  queryClickhouse,
} from "../repositories";

export type SessionDataReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  trace_environment?: string;
};

export type SessionWithMetricsReturnType = SessionDataReturnType & {
  total_observations: number;
  duration: number;
  session_usage_details: Record<string, number>;
  session_cost_details: Record<string, number>;
  session_input_cost: string;
  session_output_cost: string;
  session_total_cost: string;
  session_input_usage: string;
  session_output_usage: string;
  session_total_usage: string;
};

export const getSessionsTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableGeneric<{ count: string }>({
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

export const getSessionsTable = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableGeneric<SessionDataReturnType>({
    select: "rows",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    tags: { kind: "list" },
  });

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
  }));
};

export const getSessionsWithMetrics = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const rows = await getSessionsTableGeneric<SessionWithMetricsReturnType>({
    select: "metrics",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    clickhouseConfigs: props.clickhouseConfigs,
    tags: { kind: "analytic" },
  });

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
    total_observations: Number(row.total_observations),
  }));
};

export type FetchSessionsTableProps = {
  select: "count" | "rows" | "metrics";
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
};

const getSessionsTableGeneric = async <T>(props: FetchSessionsTableProps) => {
  const { select, projectId, filter, orderBy, limit, page, clickhouseConfigs } =
    props;

  let sqlSelect: string;
  switch (select) {
    case "count":
      sqlSelect = "count(session_id) as count";
      break;
    case "rows":
      sqlSelect = `
          session_id, 
          max_timestamp, 
          min_timestamp, 
          trace_ids, 
          user_ids, 
          trace_count, 
          trace_tags,
          trace_environment`;
      break;
    case "metrics":
      sqlSelect = `
        session_id, 
        max_timestamp, 
        min_timestamp, 
        trace_ids, 
        user_ids, 
        trace_count, 
        trace_tags,
        trace_environment,
        total_observations,
        duration,
        session_usage_details,
        session_cost_details,
        session_input_cost,
        session_output_cost,
        session_total_cost,
        session_input_usage,
        session_output_usage,
        session_total_usage`;
      break;
    default: {
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${exhaustiveCheckDefault}`);
    }
  }

  const { tracesFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "s",
  });

  tracesFilter.push(...createFilterFromFilterState(filter, sessionCols));

  const tracesFilterRes = tracesFilter
    .filter((f) => f.field !== "environment")
    .apply();

  const traceTimestampFilter: DateTimeFilter | undefined = tracesFilter.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const filters = [];
  if (traceTimestampFilter) {
    filters.push(
      new DateTimeFilter({
        clickhouseTable: "traces",
        field: "timestamp",
        operator: traceTimestampFilter.operator,
        value: traceTimestampFilter.value,
      }),
    );
  }

  const additionalSingleTraceFilter = tracesFilter.find(
    (f) =>
      f.field === "bookmarked" ||
      f.field === "session_id" ||
      f.field === "environment",
  );

  if (additionalSingleTraceFilter) {
    filters.push(additionalSingleTraceFilter);
  }

  const singleTraceFilter =
    filters.length > 0 ? new FilterList(filters).apply() : undefined;

  const hasMetricsFilter =
    tracesFilter.find((f) =>
      [
        "session_total_cost",
        "session_input_cost",
        "session_output_cost",
        "duration",
        "session_total_usage",
        "session_output_usage",
        "session_input_usage",
      ].includes(f.field),
    ) ||
    (orderBy &&
      [
        "totalCost",
        "inputCost",
        "outputCost",
        "sessionDuration",
        "totalTokens",
        "outputTokens",
        "inputTokens",
        "usage",
      ].includes(orderBy?.column));

  const selectMetrics = select === "metrics" || hasMetricsFilter;

  // We use deduplicated traces and observations CTEs instead of final to be able to use Skip indices in Clickhouse.
  const query = `
    WITH deduplicated_traces AS (
      SELECT * EXCEPT input, output, metadata
      FROM traces t
      WHERE t.session_id IS NOT NULL 
        AND t.project_id = {projectId: String}
        ${singleTraceFilter?.query ? ` AND ${singleTraceFilter.query}` : ""}
        ORDER BY event_ts DESC
        LIMIT 1 BY id, project_id
    ),
    deduplicated_observations AS (
        SELECT * 
        FROM observations o
        WHERE o.project_id = {projectId: String}
        ${traceTimestampFilter ? `AND o.start_time >= {observationsStartTime: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
        AND o.trace_id IN (
          SELECT id
          FROM deduplicated_traces
        )
        ORDER BY event_ts DESC
        LIMIT 1 BY id, project_id
    ),
    observations_agg AS (
      SELECT o.trace_id,
            count(*) as obs_count,
            min(o.start_time) as min_start_time,
            max(o.end_time) as max_end_time,
            sumMap(usage_details) as sum_usage_details,
            sumMap(cost_details) as sum_cost_details,
            anyLast(project_id) as project_id
      FROM deduplicated_observations o
      WHERE o.project_id = {projectId: String}
      ${traceTimestampFilter ? `AND o.start_time >= {observationsStartTime: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      GROUP BY o.trace_id
    ),
    session_data AS (
        SELECT
            t.session_id,
            anyLast(t.project_id) as project_id,
            max(t.timestamp) as max_timestamp,
            min(t.timestamp) as min_timestamp,
            groupArray(t.id) AS trace_ids,
            groupUniqArray(t.user_id) AS user_ids,
            count(*) as trace_count,
            groupUniqArrayArray(t.tags) as trace_tags,
            anyLast(t.environment) as trace_environment
            -- Aggregate observations data at session level
            ${
              selectMetrics
                ? `
            ,
            sum(o.obs_count) as total_observations,
            -- Use minIf, because ClickHouse fills 1970-01-01 on left joins. We assume that no
            -- LLM session started on that date so this behaviour should yield better results.
            date_diff('millisecond', minIf(min_start_time, min_start_time > '1970-01-01'), max(max_end_time)) as duration,
            sumMap(o.sum_usage_details) as session_usage_details,
            sumMap(o.sum_cost_details) as session_cost_details,
            arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sumMap(o.sum_cost_details)))) as session_input_cost,
            arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sumMap(o.sum_cost_details)))) as session_output_cost,
            sumMap(o.sum_cost_details)['total'] as session_total_cost,          
            arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sumMap(o.sum_usage_details)))) as session_input_usage,
            arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sumMap(o.sum_usage_details)))) as session_output_usage,
            sumMap(o.sum_usage_details)['total'] as session_total_usage`
                : ""
            }
        FROM deduplicated_traces t
        ${
          selectMetrics
            ? `LEFT JOIN observations_agg o
        ON t.id = o.trace_id AND t.project_id = o.project_id`
            : ""
        }
        WHERE t.session_id IS NOT NULL
            AND t.project_id = {projectId: String}
            ${singleTraceFilter?.query ? ` AND ${singleTraceFilter.query}` : ""}
        GROUP BY t.session_id
    )
    SELECT ${sqlSelect}
    FROM session_data s
    WHERE ${tracesFilterRes.query ? tracesFilterRes.query : ""}
    ${orderByToClickhouseSql(orderBy ?? null, sessionCols)}
    ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    `;

  const obsStartTimeValue = traceTimestampFilter
    ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
    : null;

  const res = await queryClickhouse<T>({
    query: query,
    params: {
      projectId,
      limit: limit,
      offset: limit && page ? limit * page : 0,
      ...tracesFilterRes.params,
      ...singleTraceFilter?.params,
      ...(obsStartTimeValue
        ? { observationsStartTime: obsStartTimeValue }
        : {}),
    },
    tags: {
      ...(props.tags ?? {}),
      feature: "tracing",
      type: "sessions-table",
      projectId,
    },
    clickhouseConfigs,
  });

  return res;
};
