import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { DateTimeFilter, FilterList, orderByToClickhouseSql } from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsTracesAggregation } from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { sessionCols } from "../tableMappings/mapSessionTable";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";

export type SessionEventsDataReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  environment?: string;
  scores_avg?: Array<Array<[string, number]>>;
  score_categories?: Array<Array<string>>;
};

export type SessionEventsWithMetricsReturnType = SessionEventsDataReturnType & {
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

export type SessionTraceFromEvents = {
  id: string;
  name: string | null;
  timestamp: Date;
  environment: string | null;
  userId: string | null;
};

export const getSessionTracesFromEvents = async (props: {
  projectId: string;
  sessionId: string;
}) => {
  const tracesBuilder = eventsTracesAggregation({
    projectId: props.projectId,
  })
    .whereRaw("e.session_id = {sessionId: String}", {
      sessionId: props.sessionId,
    })
    .whereRaw("e.is_deleted = 0")
    .orderByColumns([{ column: "timestamp", direction: "ASC" }]);

  const tracesCte = tracesBuilder.buildWithParams();

  const query = `
    ${tracesCte.query}
  `;

  const rows = await measureAndReturn({
    operationName: "getSessionTracesFromEvents",
    projectId: props.projectId,
    input: {
      params: {
        ...tracesCte.params,
        projectId: props.projectId,
        sessionId: props.sessionId,
      },
      tags: {
        feature: "tracing",
        type: "sessions-traces",
        projectId: props.projectId,
        operation_name: "getSessionTracesFromEvents",
      },
    },
    fn: async (input) => {
      return queryClickhouse<{
        id: string;
        name: string | null;
        timestamp: string;
        environment: string | null;
        user_id: string | null;
      }>({
        query,
        params: input.params,
        tags: input.tags,
      });
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    timestamp: parseClickhouseUTCDateTimeFormat(row.timestamp),
    environment: row.environment,
    userId: row.user_id,
  }));
};

export const getSessionsTableCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getSessionsTableFromEventsGeneric<{ count: string }>({
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

export const getSessionsTableFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getSessionsTableFromEventsGeneric<SessionEventsDataReturnType>({
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

export const getSessionsWithMetricsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const rows =
    await getSessionsTableFromEventsGeneric<SessionEventsWithMetricsReturnType>(
      {
        select: "metrics",
        projectId: props.projectId,
        filter: props.filter,
        orderBy: props.orderBy,
        limit: props.limit,
        page: props.page,
        clickhouseConfigs: props.clickhouseConfigs,
        tags: { kind: "analytic" },
      },
    );

  return rows.map((row) => ({
    ...row,
    trace_count: Number(row.trace_count),
    total_observations: Number(row.total_observations),
  }));
};

export type FetchSessionsTableFromEventsProps = {
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

const getSessionsTableFromEventsGeneric = async <T>(
  props: FetchSessionsTableFromEventsProps,
) => {
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
          environment`;
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
        environment,
        total_observations,
        duration,
        session_usage_details,
        session_cost_details,
        session_input_cost,
        session_output_cost,
        session_total_cost,
        session_input_usage,
        session_output_usage,
        session_total_usage,
        scores_avg,
        score_categories`;
      break;
    default: {
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${exhaustiveCheckDefault}`);
    }
  }

  const sessionFilters = new FilterList(
    createFilterFromFilterState(filter, sessionCols),
  );
  const sessionsFilterRes = sessionFilters.apply();

  const traceTimestampFilter = sessionFilters.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const requiresScoresJoin =
    sessionFilters.some((f) => f.clickhouseTable === "scores") ||
    sessionCols.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

  const hasMetricsFilter =
    sessionFilters.some((f) =>
      [
        "session_total_cost",
        "session_input_cost",
        "session_output_cost",
        "duration",
        "session_total_usage",
        "session_output_usage",
        "session_input_usage",
        "scores_avg",
        "score_categories",
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

  const scoresCte = `scores_agg AS (
    SELECT
      project_id,
      session_id AS score_session_id,
      -- For numeric scores, use tuples of (name, avg_value)
      groupArrayIf(
        tuple(name, avg_value),
        data_type IN ('NUMERIC', 'BOOLEAN')
      ) AS scores_avg,
      -- For categorical scores, use name:value format for improved query performance
      groupArrayIf(
        concat(name, ':', string_value),
        data_type = 'CATEGORICAL' AND notEmpty(string_value)
      ) AS score_categories
    FROM (
      SELECT
        project_id,
        session_id,
        name,
        data_type,
        string_value,
        avg(value) avg_value
      FROM scores s FINAL
      WHERE
        project_id = {projectId: String}
      GROUP BY
        project_id,
        session_id,
        name,
        data_type,
        string_value
      ) tmp
    GROUP BY
      project_id, session_id
  )`;

  const tracesBuilder = eventsTracesAggregation({
    projectId,
    startTimeFrom: traceTimestampFilter
      ? convertDateToClickhouseDateTime(traceTimestampFilter.value)
      : null,
  });

  const tracesCte = tracesBuilder.buildWithParams();

  const query = `
        WITH ${select === "metrics" || requiresScoresJoin ? `${scoresCte},` : ""}
        traces AS (${tracesCte.query}),
        session_data AS (
            SELECT
                t.session_id as session_id,
                anyLast(t.project_id) as project_id,
                max(t.timestamp) as max_timestamp,
                min(t.timestamp) as min_timestamp,
                groupArray(t.id) AS trace_ids,
                groupUniqArrayIf(t.user_id, t.user_id IS NOT NULL AND t.user_id != '') AS user_ids,
                count(*) as trace_count,
                groupUniqArrayArray(t.tags) as trace_tags,
                anyLast(t.environment) as environment
                -- Aggregate observations data at session level
                ${
                  selectMetrics
                    ? `,
                      sum(length(t.observation_ids)) as total_observations,
                      date_diff(
                        'second',
                        min(t.timestamp),
                        max(t.timestamp + toIntervalMillisecond(ifNull(t.latency_milliseconds, 0)))
                      ) as duration,
                      sumMap(t.usage_details) as session_usage_details,
                      sumMap(t.cost_details) as session_cost_details,
                      ${
                        select === "metrics" || requiresScoresJoin
                          ? `groupUniqArrayArray(s.scores_avg) as scores_avg,
                      groupUniqArrayArray(s.score_categories) as score_categories,`
                          : ""
                      }
                      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sumMap(t.cost_details)))) as session_input_cost,
                      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sumMap(t.cost_details)))) as session_output_cost,
                      sumMap(t.cost_details)['total'] as session_total_cost,
                      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'input') > 0, sumMap(t.usage_details)))) as session_input_usage,
                      arraySum(mapValues(mapFilter(x -> positionCaseInsensitive(x.1, 'output') > 0, sumMap(t.usage_details)))) as session_output_usage,
                      sumMap(t.usage_details)['total'] as session_total_usage`
                    : ""
                }
            FROM traces t
           ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_agg s on s.project_id = t.project_id and t.session_id = s.score_session_id` : ""}
            WHERE t.session_id IS NOT NULL
                AND t.session_id != ''
                AND t.project_id = {projectId: String}
            GROUP BY t.session_id
        )
        SELECT ${sqlSelect}
        FROM session_data s
        ${sessionsFilterRes.query ? `WHERE ${sessionsFilterRes.query}` : ""}
        ${orderByToClickhouseSql(orderBy ?? null, sessionCols)}
        ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
        `;

  return measureAndReturn({
    operationName: "getSessionsTableFromEventsGeneric",
    projectId,
    input: {
      params: {
        projectId,
        limit: limit,
        offset: limit && page ? limit * page : 0,
        ...tracesCte.params,
        ...sessionsFilterRes.params,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "sessions-table",
        projectId,
        operation_name: `getSessionsTableFromEventsGeneric-${select}`,
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query,
        params: input.params,
        tags: input.tags,
        clickhouseConfigs,
      });
    },
  });
};
