/**
 * Logic mirrors services/sessions-ui-table-events-service.ts (ClickHouse); syntax adapted for OceanBase.
 * Sessions table built from events table (eventsTracesAggregation) instead of traces table.
 * Only OceanBase logic - no ClickHouse imports or code paths.
 */
import { OrderByState } from "../../interfaces/orderBy";
import { FilterState } from "../../types";
import { convertDateToDateTime } from "../database";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { DateTimeFilter, FilterList, orderByToClickhouseSql } from "../queries";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/oceanbase-sql/factory";
import type { Filter } from "../queries/oceanbase-sql/oceanbase-filter";
import { eventsTracesAggregation } from "../queries/oceanbase-sql/query-fragments";
import { DatabaseAdapterFactory } from "../database";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";
import { sessionCols } from "../tableMappings/mapSessionTable";
import { parseOceanBaseUTCDateTimeFormat } from "./oceanbase";

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
    .whereRaw("e.session_id = ?", [props.sessionId])
    .whereRaw("e.is_deleted = 0")
    .orderByColumns([{ column: "timestamp", direction: "ASC" }]);

  const { query: convertedQuery, params } = tracesBuilder.buildWithParams();

  const rows = await measureAndReturn({
    operationName: "getSessionTracesFromEvents",
    projectId: props.projectId,
    input: {
      params: { projectId: props.projectId, sessionId: props.sessionId },
      tags: {
        feature: "tracing",
        type: "sessions-traces",
        projectId: props.projectId,
        operation_name: "getSessionTracesFromEvents",
      },
    },
    fn: async () => {
      const adapter = DatabaseAdapterFactory.getInstance();
      return adapter.queryWithOptions<{
        id: string;
        name: string | null;
        timestamp: string;
        environment: string | null;
        user_id: string | null;
      }>({
        query: convertedQuery,
        params,
        tags: {
          feature: "tracing",
          type: "sessions-traces",
          projectId: props.projectId,
          operation_name: "getSessionTracesFromEvents",
        },
      });
    },
  });

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    timestamp: parseOceanBaseUTCDateTimeFormat(row.timestamp),
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
};

const getSessionsTableFromEventsGeneric = async <T>(
  props: FetchSessionsTableFromEventsProps,
): Promise<T[]> => {
  const { select, projectId, filter, orderBy, limit, page } = props;

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

  const { tracesFilter, scoresFilter } = getProjectIdDefaultFilter(projectId, {
    tracesPrefix: "t",
  });

  tracesFilter.push(...createFilterFromFilterState(filter, sessionCols));

  const tracesFilterRes = tracesFilter
    .filter((f) => f.field !== "environment")
    .apply();

  const scoresFilterRes = scoresFilter.apply();

  const traceTimestampFilter: DateTimeFilter | undefined = tracesFilter.find(
    (f) =>
      f.field === "min_timestamp" &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const filters: Filter[] = [];
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

  tracesFilter
    .filter(
      (f) =>
        f.field === "bookmarked" ||
        f.field === "session_id" ||
        f.field === "environment",
    )
    .forEach((f) => filters.push(f));

  const singleTraceFilter =
    filters.length > 0 ? new FilterList(filters).apply() : undefined;

  const requiresScoresJoin =
    tracesFilter.find((f) => f.clickhouseTable === "scores") !== undefined ||
    sessionCols.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

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

  // Convert filter params for OceanBase
  let tracesFilterQuery = tracesFilterRes?.query || "";
  let tracesFilterParams: unknown[] = [];
  let singleTraceFilterQuery = singleTraceFilter?.query || "";
  let singleTraceFilterParams: unknown[] = [];
  let scoresFilterQuery = scoresFilterRes?.query || "";
  let scoresFilterParams: unknown[] = [];

  const convertDatesInParams = (params: unknown[]): unknown[] => {
    return params.map((param) => {
      if (param instanceof Date) {
        return convertDateToDateTime(param);
      }
      if (Array.isArray(param)) {
        return param.map((item) =>
          item instanceof Date ? convertDateToDateTime(item) : item,
        );
      }
      return param;
    });
  };

  if (tracesFilterRes?.query && tracesFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      tracesFilterRes.query,
      tracesFilterRes.params,
    );
    tracesFilterQuery = converted.query;
    tracesFilterParams = convertDatesInParams(converted.params);
  }
  if (singleTraceFilter?.query && singleTraceFilter?.params) {
    const converted = convertFilterParamsToPositional(
      singleTraceFilter.query,
      singleTraceFilter.params,
    );
    singleTraceFilterQuery = converted.query;
    singleTraceFilterParams = convertDatesInParams(converted.params);
  }
  if (scoresFilterRes?.query && scoresFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      scoresFilterRes.query,
      scoresFilterRes.params,
    );
    scoresFilterQuery = converted.query;
    scoresFilterParams = convertDatesInParams(converted.params);
  }

  // Convert orderBy for OceanBase
  const chOrderBy = orderByToClickhouseSql(orderBy ?? null, sessionCols);
  const orderByClause = chOrderBy
    .replace(/ORDER BY\s+/i, "")
    .replace(/"([^"]+)"/g, "`$1`");

  // Traces CTE from events aggregation (OceanBase)
  const tracesBuilder = eventsTracesAggregation({
    projectId,
    startTimeFrom: traceTimestampFilter
      ? convertDateToDateTime(traceTimestampFilter.value)
      : null,
  });

  const tracesPositional = tracesBuilder.buildWithParams();

  // Scores CTE for OceanBase (trace-level: session_id)
  const scoresCte =
    select === "metrics" || requiresScoresJoin
      ? `scores_agg AS (
    SELECT
      project_id,
      session_id AS score_session_id,
      JSON_ARRAYAGG(
        CASE 
          WHEN data_type IN ('NUMERIC', 'BOOLEAN') 
          THEN JSON_OBJECT('name', name, 'value', avg_value)
          ELSE NULL
        END
      ) AS scores_avg,
      JSON_ARRAYAGG(
        CASE 
          WHEN data_type = 'CATEGORICAL' AND string_value IS NOT NULL AND string_value != ''
          THEN CONCAT(name, ':', string_value)
          ELSE NULL
        END
      ) AS score_categories
    FROM (
      SELECT
        project_id,
        session_id,
        name,
        data_type,
        string_value,
        AVG(value) avg_value
      FROM (
        SELECT *,
          ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
        FROM scores s
      ) s
      WHERE s.rn = 1
        AND project_id = ?
        ${scoresFilterQuery ? `AND ${scoresFilterQuery}` : ""}
      GROUP BY
        project_id,
        session_id,
        name,
        data_type,
        string_value
      ) tmp
    GROUP BY
      project_id, session_id
  )`
      : "";

  // Expand usage_details and cost_details from traces (events aggregation outputs JSON per trace)
  const tracesUsageCostExpansion = selectMetrics
    ? `,
        traces_usage_keys AS (
          SELECT
            t.id AS trace_id,
            t.session_id,
            t.project_id,
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(t.usage_details), CONCAT('$[', n.n, ']'))) AS usage_key
          FROM traces t
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          WHERE t.session_id IS NOT NULL
            AND JSON_EXTRACT(JSON_KEYS(t.usage_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ),
        traces_usage_expanded AS (
          SELECT
            uk.session_id,
            uk.usage_key,
            SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.usage_details, CONCAT('$.', uk.usage_key))) AS UNSIGNED)) AS usage_value
          FROM traces_usage_keys uk
          JOIN traces t ON uk.trace_id = t.id AND uk.project_id = t.project_id
          GROUP BY uk.session_id, uk.usage_key
        ),
        traces_usage_agg AS (
          SELECT
            session_id,
            JSON_OBJECTAGG(usage_key, usage_value) AS session_usage_details
          FROM traces_usage_expanded
          GROUP BY session_id
        ),
        traces_cost_keys AS (
          SELECT
            t.id AS trace_id,
            t.session_id,
            t.project_id,
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(t.cost_details), CONCAT('$[', n.n, ']'))) AS cost_key
          FROM traces t
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          WHERE t.session_id IS NOT NULL
            AND JSON_EXTRACT(JSON_KEYS(t.cost_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ),
        traces_cost_expanded AS (
          SELECT
            ck.session_id,
            ck.cost_key,
            SUM(CAST(JSON_UNQUOTE(JSON_EXTRACT(t.cost_details, CONCAT('$.', ck.cost_key))) AS DECIMAL(10, 4))) AS cost_value
          FROM traces_cost_keys ck
          JOIN traces t ON ck.trace_id = t.id AND ck.project_id = t.project_id
          GROUP BY ck.session_id, ck.cost_key
        ),
        traces_cost_agg AS (
          SELECT
            session_id,
            JSON_OBJECTAGG(cost_key, cost_value) AS session_cost_details
          FROM traces_cost_expanded
          GROUP BY session_id
        )`
    : "";

  // session_data: aggregate from traces (events) by session_id
  const sessionDataSelect = selectMetrics
    ? `t.session_id,
                MAX(t.project_id) as project_id,
                MAX(t.timestamp) as max_timestamp,
                MIN(t.timestamp) as min_timestamp,
                JSON_ARRAYAGG(t.id) AS trace_ids,
                JSON_ARRAYAGG(t.user_id) AS user_ids,
                COUNT(*) as trace_count,
                MAX(COALESCE(tta.trace_tags, CAST('[]' AS JSON))) AS trace_tags,
                MAX(t.environment) as environment,
                SUM(CASE
                  WHEN t.observation_ids IS NOT NULL AND t.observation_ids != ''
                  THEN (LENGTH(t.observation_ids) - LENGTH(REPLACE(t.observation_ids, ',', '')) + 1)
                  ELSE 0
                END) as total_observations,
                TIMESTAMPDIFF(SECOND, MIN(t.timestamp), MAX(t.timestamp)) as duration,
                MAX(COALESCE(ua.session_usage_details, CAST('{}' AS JSON))) as session_usage_details,
                MAX(COALESCE(ca.session_cost_details, CAST('{}' AS JSON))) as session_cost_details,
                ${select === "metrics" || requiresScoresJoin ? `MAX(s.scores_avg) as scores_avg, MAX(s.score_categories) as score_categories,` : ""}
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ca.session_cost_details, '$.input')) AS DECIMAL(10, 4))), 0) as session_input_cost,
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ca.session_cost_details, '$.output')) AS DECIMAL(10, 4))), 0) as session_output_cost,
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ca.session_cost_details, '$.total')) AS DECIMAL(10, 4))), 0) as session_total_cost,
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ua.session_usage_details, '$.input')) AS UNSIGNED)), 0) as session_input_usage,
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ua.session_usage_details, '$.output')) AS UNSIGNED)), 0) as session_output_usage,
                COALESCE(MAX(CAST(JSON_UNQUOTE(JSON_EXTRACT(ua.session_usage_details, '$.total')) AS UNSIGNED)), 0) as session_total_usage`
    : `t.session_id,
                MAX(t.project_id) as project_id,
                MAX(t.timestamp) as max_timestamp,
                MIN(t.timestamp) as min_timestamp,
                JSON_ARRAYAGG(t.id) AS trace_ids,
                JSON_ARRAYAGG(t.user_id) AS user_ids,
                COUNT(*) as trace_count,
                MAX(COALESCE(tta.trace_tags, CAST('[]' AS JSON))) AS trace_tags,
                MAX(t.environment) as environment`;

  const traceTagsCte = `trace_tags_expanded AS (
          SELECT
            t.session_id,
            JSON_UNQUOTE(JSON_EXTRACT(t.tags, CONCAT('$[', idx.idx, ']'))) AS tag_value
          FROM traces t
          CROSS JOIN (
            SELECT 0 as idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
          ) idx
          WHERE JSON_EXTRACT(t.tags, CONCAT('$[', idx.idx, ']')) IS NOT NULL
            AND t.session_id IS NOT NULL
        ),
        trace_tags_agg AS (
          SELECT
            session_id,
            JSON_ARRAYAGG(tag_value) AS trace_tags
          FROM trace_tags_expanded
          GROUP BY session_id
        )`;

  const sessionDataCte = `session_data AS (
            SELECT
                ${sessionDataSelect}
            FROM traces t
            LEFT JOIN trace_tags_agg tta ON t.session_id = tta.session_id
            ${selectMetrics ? `LEFT JOIN traces_usage_agg ua ON t.session_id = ua.session_id` : ""}
            ${selectMetrics ? `LEFT JOIN traces_cost_agg ca ON t.session_id = ca.session_id` : ""}
            ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_agg s ON s.project_id = t.project_id AND t.session_id = s.score_session_id` : ""}
            WHERE t.session_id IS NOT NULL
                AND t.session_id != ''
                AND t.project_id = ?
                ${singleTraceFilterQuery ? `AND ${singleTraceFilterQuery}` : ""}
            GROUP BY t.session_id
        )`;

  const query = `
        WITH traces AS (${tracesPositional.query}),
        ${traceTagsCte},
        ${select === "metrics" || requiresScoresJoin ? `${scoresCte},` : ""}
        ${selectMetrics ? tracesUsageCostExpansion + "," : ""}
        ${sessionDataCte}
        SELECT ${sqlSelect}
        FROM session_data s
        WHERE 1=1
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
        ${orderByClause ? `ORDER BY ${orderByClause}` : ""}
        ${limit !== undefined && page !== undefined ? `LIMIT ? OFFSET ?` : ""}
        `.trim();

  return measureAndReturn({
    operationName: "getSessionsTableFromEventsGeneric",
    projectId,
    input: {
      params: {
        projectId,
        limit: limit,
        offset: limit && page ? limit * page : 0,
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
      const adapter = DatabaseAdapterFactory.getInstance();
      const params: unknown[] = [];

      // traces CTE params
      params.push(...tracesPositional.params);

      // scores_agg params (if needed)
      if (select === "metrics" || requiresScoresJoin) {
        params.push(projectId, ...scoresFilterParams);
      }

      // session_data params
      params.push(projectId);
      if (singleTraceFilterQuery) {
        params.push(...singleTraceFilterParams);
      }

      // Final WHERE params
      params.push(...tracesFilterParams);

      if (limit !== undefined && page !== undefined) {
        params.push(limit, limit * page);
      }

      return adapter.queryWithOptions<T>({
        query,
        params,
        tags: input.tags,
      });
    },
  });
};
