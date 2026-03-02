/**
 * Logic mirrors services/sessions-ui-table-service.ts (ClickHouse); syntax adapted for OceanBase.
 * - FINAL / LIMIT 1 BY → ROW_NUMBER() OVER (...) WHERE rn = 1; sumMap/groupArray → JSON aggregation.
 */
import { OrderByState } from "../../interfaces/orderBy";
import { sessionCols } from "../tableMappings/mapSessionTable";
import { FilterState } from "../../types";
import { convertDateToDateTime } from "../database";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { DateTimeFilter, FilterList, orderByToClickhouseSql } from "../queries";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/oceanbase-sql/factory";
import { TRACE_TO_OBSERVATIONS_INTERVAL } from "../repositories";
import { DatabaseAdapterFactory } from "../database";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";

export type SessionDataReturnType = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  trace_environment?: string;
  scores_avg?: Array<Array<[string, number]>>;
  score_categories?: Array<Array<string>>;
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
}) => {
  const rows = await getSessionsTableGeneric<SessionWithMetricsReturnType>({
    select: "metrics",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
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
};

const getSessionsTableGeneric = async <T>(
  props: FetchSessionsTableProps,
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
    tracesPrefix: "s",
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

  // Helper function to convert Date objects to datetime strings for OceanBase
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
  let orderByClause = chOrderBy
    .replace(/ORDER BY\s+/i, "")
    .replace(/"([^"]+)"/g, "`$1`");

  // OceanBase/MySQL compatible SQL
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

  // We use deduplicated traces and observations CTEs with ROW_NUMBER for OceanBase

  const query =
    select === "count"
      ? `
        WITH ranked_traces AS (
          SELECT 
            t.id,
            t.project_id,
            t.session_id,
            t.timestamp,
            t.user_id,
            t.environment,
            t.tags,
            t.name,
            t.\`release\` as release_col,
            t.version,
            t.bookmarked,
            t.public,
            t.event_ts,
            ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.event_ts DESC) as rn
          FROM __TRACE_TABLE__ t
          WHERE t.session_id IS NOT NULL 
            AND t.project_id = ?
            ${singleTraceFilterQuery ? ` AND ${singleTraceFilterQuery}` : ""}
        ),
        deduplicated_traces AS (
          SELECT 
            id, project_id, session_id, timestamp, user_id, environment, tags, name, release_col, version, bookmarked, public, event_ts
          FROM ranked_traces
          WHERE rn = 1
        ),
        trace_tags_expanded AS (
          SELECT
            t.session_id,
            JSON_UNQUOTE(JSON_EXTRACT(t.tags, CONCAT('$[', idx.idx, ']'))) AS tag_value
          FROM deduplicated_traces t
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
        ),
        session_data AS (
            SELECT
                t.session_id,
                MAX(t.project_id) as project_id,
                MAX(t.timestamp) as max_timestamp,
                MIN(t.timestamp) as min_timestamp,
                JSON_ARRAYAGG(t.id) AS trace_ids,
                JSON_ARRAYAGG(t.user_id) AS user_ids,
                COUNT(*) as trace_count,
                COALESCE(tta.trace_tags, CAST('[]' AS JSON)) AS trace_tags,
                MAX(t.environment) as trace_environment
            FROM deduplicated_traces t
            LEFT JOIN trace_tags_agg tta ON t.session_id = tta.session_id
            WHERE t.session_id IS NOT NULL
                AND t.project_id = ?
                ${singleTraceFilterQuery ? ` AND ${singleTraceFilterQuery}` : ""}
            GROUP BY t.session_id
        )
        SELECT ${sqlSelect}
        FROM session_data s
        WHERE 1=1
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
      `
      : `
        WITH ${select === "metrics" || requiresScoresJoin ? `${scoresCte},` : ""}
        ranked_traces AS (
          SELECT 
            t.id,
            t.project_id,
            t.session_id,
            t.timestamp,
            t.user_id,
            t.environment,
            t.tags,
            t.name,
            t.\`release\` as release_col,
            t.version,
            t.bookmarked,
            t.public,
            t.event_ts,
            ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.event_ts DESC) as rn
          FROM __TRACE_TABLE__ t
          WHERE t.session_id IS NOT NULL 
            AND t.project_id = ?
            ${singleTraceFilterQuery ? ` AND ${singleTraceFilterQuery}` : ""}
        ),
        deduplicated_traces AS (
          SELECT 
            id, project_id, session_id, timestamp, user_id, environment, tags, name, release_col, version, bookmarked, public, event_ts
          FROM ranked_traces
          WHERE rn = 1
        ),
        ranked_observations AS (
          SELECT 
            o.*,
            ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.event_ts DESC) as rn
          FROM observations o
          WHERE o.project_id = ?
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
            AND o.trace_id IN (
              SELECT id
              FROM deduplicated_traces
            )
        ),
        deduplicated_observations AS (
          SELECT * 
          FROM ranked_observations
          WHERE rn = 1
        ),
        observations_usage_keys AS (
          SELECT 
            o.trace_id,
            o.project_id,
            o.start_time,
            o.end_time,
            o.usage_details,
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']'))) AS usage_key
          FROM deduplicated_observations o
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          WHERE o.project_id = ?
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
            AND JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ),
        observations_usage_expanded AS (
          SELECT 
            trace_id,
            project_id,
            start_time,
            end_time,
            usage_key,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(usage_details, CONCAT('$.', usage_key))) AS UNSIGNED) AS usage_value
          FROM observations_usage_keys
        ),
        observations_cost_keys AS (
          SELECT 
            o.trace_id,
            o.project_id,
            o.cost_details,
            JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']'))) AS cost_key
          FROM deduplicated_observations o
          CROSS JOIN (
            SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
            UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
            UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
            UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
          ) n
          WHERE o.project_id = ?
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
            AND JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']')) IS NOT NULL
        ),
        observations_cost_expanded AS (
          SELECT 
            trace_id,
            project_id,
            cost_key,
            CAST(JSON_UNQUOTE(JSON_EXTRACT(cost_details, CONCAT('$.', cost_key))) AS DECIMAL(10, 4)) AS cost_value
          FROM observations_cost_keys
        ),
        observations_usage_summed AS (
          SELECT 
            trace_id,
            usage_key,
            SUM(usage_value) as usage_value
          FROM observations_usage_expanded
          GROUP BY trace_id, usage_key
        ),
        observations_usage_agg AS (
          SELECT 
            trace_id,
            JSON_OBJECTAGG(usage_key, usage_value) as sum_usage_details
          FROM observations_usage_summed
          GROUP BY trace_id
        ),
        observations_cost_summed AS (
          SELECT 
            trace_id,
            cost_key,
            SUM(cost_value) as cost_value
          FROM observations_cost_expanded
          GROUP BY trace_id, cost_key
        ),
        observations_cost_agg AS (
          SELECT 
            trace_id,
            JSON_OBJECTAGG(cost_key, cost_value) as sum_cost_details
          FROM observations_cost_summed
          GROUP BY trace_id
        ),
        observations_agg AS (
          SELECT 
            o.trace_id,
            o.project_id,
            COUNT(*) as obs_count,
            MIN(o.start_time) as min_start_time,
            MAX(o.end_time) as max_end_time,
            COALESCE(ua.sum_usage_details, CAST('{}' AS JSON)) as sum_usage_details,
            COALESCE(ca.sum_cost_details, CAST('{}' AS JSON)) as sum_cost_details
          FROM deduplicated_observations o
          LEFT JOIN observations_usage_agg ua ON o.trace_id = ua.trace_id
          LEFT JOIN observations_cost_agg ca ON o.trace_id = ca.trace_id
          WHERE o.project_id = ?
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB(?, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
          GROUP BY o.trace_id, o.project_id
        ),
        observations_usage_by_session_summed AS (
          SELECT
            dt.session_id,
            dt.project_id,
            ue.usage_key,
            SUM(ue.usage_value) as usage_value
          FROM observations_usage_expanded ue
          JOIN deduplicated_traces dt ON ue.trace_id = dt.id AND ue.project_id = dt.project_id
          WHERE dt.session_id IS NOT NULL
          GROUP BY dt.session_id, dt.project_id, ue.usage_key
        ),
        observations_usage_by_session_agg AS (
          SELECT
            session_id,
            project_id,
            JSON_OBJECTAGG(usage_key, usage_value) as session_usage_details
          FROM observations_usage_by_session_summed
          GROUP BY session_id, project_id
        ),
        observations_cost_by_session_summed AS (
          SELECT
            dt.session_id,
            dt.project_id,
            ce.cost_key,
            SUM(ce.cost_value) as cost_value
          FROM observations_cost_expanded ce
          JOIN deduplicated_traces dt ON ce.trace_id = dt.id AND ce.project_id = dt.project_id
          WHERE dt.session_id IS NOT NULL
          GROUP BY dt.session_id, dt.project_id, ce.cost_key
        ),
        observations_cost_by_session_agg AS (
          SELECT
            session_id,
            project_id,
            JSON_OBJECTAGG(cost_key, cost_value) as session_cost_details
          FROM observations_cost_by_session_summed
          GROUP BY session_id, project_id
        ),
        observations_by_session AS (
          SELECT
            t.session_id,
            t.project_id,
            SUM(o.obs_count) as total_observations,
            MIN(CASE WHEN o.min_start_time > '1970-01-01' THEN o.min_start_time ELSE NULL END) as min_start_time,
            MAX(o.max_end_time) as max_end_time,
            COALESCE(ua.session_usage_details, CAST('{}' AS JSON)) as session_usage_details,
            COALESCE(ca.session_cost_details, CAST('{}' AS JSON)) as session_cost_details
          FROM deduplicated_traces t
          LEFT JOIN observations_agg o ON t.id = o.trace_id AND t.project_id = o.project_id
          LEFT JOIN observations_usage_by_session_agg ua ON t.session_id = ua.session_id AND t.project_id = ua.project_id
          LEFT JOIN observations_cost_by_session_agg ca ON t.session_id = ca.session_id AND t.project_id = ca.project_id
          WHERE t.session_id IS NOT NULL
            AND t.project_id = ?
            ${singleTraceFilterQuery ? ` AND ${singleTraceFilterQuery}` : ""}
          GROUP BY t.session_id, t.project_id
        ),
        trace_tags_expanded AS (
          SELECT
            t.session_id,
            JSON_UNQUOTE(JSON_EXTRACT(t.tags, CONCAT('$[', idx.idx, ']'))) AS tag_value
          FROM deduplicated_traces t
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
        ),
        session_data AS (
            SELECT
                t.session_id,
                MAX(t.project_id) as project_id,
                MAX(t.timestamp) as max_timestamp,
                MIN(t.timestamp) as min_timestamp,
                JSON_ARRAYAGG(t.id) AS trace_ids,
                JSON_ARRAYAGG(t.user_id) AS user_ids,
                COUNT(*) as trace_count,
                COALESCE(tta.trace_tags, CAST('[]' AS JSON)) AS trace_tags,
                MAX(t.environment) as trace_environment
                ${
                  selectMetrics
                    ? `,
                      COALESCE(obs.total_observations, 0) as total_observations,
                      TIMESTAMPDIFF(SECOND, 
                        obs.min_start_time, 
                        obs.max_end_time
                      ) as duration,
                      COALESCE(obs.session_usage_details, CAST('{}' AS JSON)) as session_usage_details,
                      COALESCE(obs.session_cost_details, CAST('{}' AS JSON)) as session_cost_details,
                      ${
                        select === "metrics" || requiresScoresJoin
                          ? `s.scores_avg,
                      s.score_categories,`
                          : ""
                      }
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_cost_details, '$.input')) AS DECIMAL(10, 4)), 0) as session_input_cost,
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_cost_details, '$.output')) AS DECIMAL(10, 4)), 0) as session_output_cost,
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_cost_details, '$.total')) AS DECIMAL(10, 4)), 0) as session_total_cost,
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_usage_details, '$.input')) AS UNSIGNED), 0) as session_input_usage,
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_usage_details, '$.output')) AS UNSIGNED), 0) as session_output_usage,
                      COALESCE(CAST(JSON_UNQUOTE(JSON_EXTRACT(obs.session_usage_details, '$.total')) AS UNSIGNED), 0) as session_total_usage`
                    : ""
                }
            FROM deduplicated_traces t
            LEFT JOIN trace_tags_agg tta ON t.session_id = tta.session_id
            ${
              selectMetrics
                ? `LEFT JOIN observations_by_session obs
                   ON t.session_id = obs.session_id AND t.project_id = obs.project_id`
                : ""
            }
           ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_agg s ON s.project_id = t.project_id AND t.session_id = s.score_session_id` : ""}
            WHERE t.session_id IS NOT NULL
                AND t.project_id = ?
                ${singleTraceFilterQuery ? ` AND ${singleTraceFilterQuery}` : ""}
            GROUP BY t.session_id
        )
        SELECT ${sqlSelect}
        FROM session_data s
        WHERE 1=1
        ${tracesFilterQuery ? `AND ${tracesFilterQuery}` : ""}
        ${orderByClause ? `ORDER BY ${orderByClause}` : ""}
        ${limit !== undefined && page !== undefined ? `LIMIT ? OFFSET ?` : ""}
        `;

  return measureAndReturn({
    operationName: "getSessionsTableGeneric",
    projectId,
    input: {
      params: {
        projectId,
        limit: limit,
        offset: limit && page ? limit * page : 0,
        ...tracesFilterRes.params,
        ...singleTraceFilter?.params,
        ...scoresFilterRes.params,
        ...(traceTimestampFilter
          ? {
              observationsStartTime: convertDateToDateTime(
                traceTimestampFilter.value,
              ),
            }
          : {}),
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "sessions-table",
        projectId,
        operation_name: `getSessionsTableGeneric-${select}`,
      },
    },
    fn: async (input) => {
      const adapter = DatabaseAdapterFactory.getInstance();
      // Build positional parameters array for OceanBase
      const params: unknown[] = [];

      // For count queries, use same structure as other queries but without observations
      if (select === "count") {
        // ranked_traces params
        params.push(projectId, ...singleTraceFilterParams);

        // session_data params
        params.push(projectId);
        if (singleTraceFilterQuery) {
          params.push(...singleTraceFilterParams);
        }

        // Final query WHERE params
        params.push(...tracesFilterParams);
      } else {
        // scores_agg params (if needed)
        if (select === "metrics" || requiresScoresJoin) {
          params.push(projectId, ...scoresFilterParams);
        }

        // ranked_traces params
        params.push(projectId, ...singleTraceFilterParams);

        // ranked_observations params
        params.push(projectId);
        if (traceTimestampFilter) {
          params.push(convertDateToDateTime(traceTimestampFilter.value));
        }

        // observations_usage_keys params
        params.push(projectId);
        if (traceTimestampFilter) {
          params.push(convertDateToDateTime(traceTimestampFilter.value));
        }

        // observations_cost_keys params
        params.push(projectId);
        if (traceTimestampFilter) {
          params.push(convertDateToDateTime(traceTimestampFilter.value));
        }

        // observations_agg params
        params.push(projectId);
        if (traceTimestampFilter) {
          params.push(convertDateToDateTime(traceTimestampFilter.value));
        }

        // observations_by_session params
        params.push(projectId);
        if (singleTraceFilterQuery) {
          params.push(...singleTraceFilterParams);
        }

        // session_data params
        params.push(projectId);
        if (singleTraceFilterQuery) {
          params.push(...singleTraceFilterParams);
        }

        // Final query params (only for non-count queries)
        params.push(...tracesFilterParams);
      }

      // For count queries, final query params are already pushed above
      // For non-count queries, final query params are already pushed above
      if (
        limit !== undefined &&
        page !== undefined &&
        props.select !== "count"
      ) {
        params.push(limit, limit * page);
      }

      const res = adapter.queryWithOptions<T>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params,
        tags: input.tags,
      });
      return res;
    },
  });
};
