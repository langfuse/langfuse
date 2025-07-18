import { ClickHouseClientConfigOptions } from "@clickhouse/client";
import { OrderByState } from "../../interfaces/orderBy";
import { sessionCols, sessionColsForDoris } from "../../tableDefinitions/mapSessionTable";
import { FilterState } from "../../types";
import { convertDateToClickhouseDateTime } from "../clickhouse/client";
import { FilterList, orderByToClickhouseSql } from "../queries";
import { DateTimeFilter } from "../queries/clickhouse-sql/clickhouse-filter";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/clickhouse-sql/factory";
import {
  TRACE_TO_OBSERVATIONS_INTERVAL,
  queryClickhouse,
} from "../repositories";
// Doris imports
import {
  isDorisBackend,
  convertDateToAnalyticsDateTime,
} from "../repositories/analytics";
import { queryDoris } from "../repositories/doris";
import {
  createDorisFilterFromFilterState,
  getDorisProjectIdDefaultFilter,
} from "../queries/doris-sql/factory";
import {
  DateTimeFilter as DorisDateTimeFilter,
} from "../queries/doris-sql/doris-filter";
import { orderByToDorisSQL } from "../queries/doris-sql/orderby-factory";

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

  // Doris implementation
  if (isDorisBackend()) {
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

    const { tracesFilter } = getDorisProjectIdDefaultFilter(projectId, {
      tracesPrefix: "s",
    });

    tracesFilter.push(...createDorisFilterFromFilterState(filter, sessionColsForDoris));

    const tracesFilterRes = tracesFilter
      .filter((f) => f.field !== "environment")
      .apply();

    const traceTimestampFilter: DorisDateTimeFilter | undefined = tracesFilter.find(
      (f) =>
        f.field === "min_timestamp" &&
        (f.operator === ">=" || f.operator === ">"),
    ) as DorisDateTimeFilter | undefined;

    const filters = [];
    if (traceTimestampFilter) {
      filters.push(
        new DorisDateTimeFilter({
          table: "traces",
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

    const dorisOrderBy = orderByToDorisSQL(
      orderBy ? [orderBy] : null,
      sessionColsForDoris,
    );

          // Doris version with database-specific adaptations
      const query = `
        WITH deduplicated_traces AS (
          SELECT id, session_id, project_id, bookmarked, timestamp, user_id, tags, environment, event_ts,
                 ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
          FROM traces t
          WHERE t.session_id IS NOT NULL 
            AND t.project_id = {projectId: String}
            ${singleTraceFilter?.query ? ` AND ${singleTraceFilter.query}` : ""}
        ),
        filtered_traces AS (
          SELECT id, session_id, project_id, bookmarked, timestamp, user_id, tags, environment, event_ts
          FROM deduplicated_traces
          WHERE rn = 1
        ),
        ${selectMetrics ? `deduplicated_observations AS (
            SELECT id, trace_id, project_id, start_time, end_time, usage_details, cost_details, event_ts,
                   ROW_NUMBER() OVER (PARTITION BY id, project_id ORDER BY event_ts DESC) as rn
            FROM observations o
            WHERE o.project_id = {projectId: String}
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB({observationsStartTime: DateTime}, INTERVAL 2 DAY)` : ""}
            AND o.trace_id IN (
              SELECT id
              FROM filtered_traces
            )
          ),
          filtered_observations AS (
            SELECT id, trace_id, project_id, start_time, end_time, usage_details, cost_details, event_ts
            FROM deduplicated_observations
            WHERE rn = 1
          ),
          observations_agg AS (
            SELECT o.trace_id,
                  count(*) as obs_count,
                  min(o.start_time) as min_start_time,
                  max(o.end_time) as max_end_time,
                  -- Doris doesn't have sumMap, so we manually aggregate usage and cost
                  sum(CASE WHEN MAP_CONTAINS_KEY(usage_details,'input') THEN usage_details['input'] ELSE 0 END) as sum_input_usage,
                  sum(CASE WHEN MAP_CONTAINS_KEY(usage_details,'output') THEN usage_details['output'] ELSE 0 END) as sum_output_usage,
                  sum(CASE WHEN MAP_CONTAINS_KEY(usage_details,'total') THEN usage_details['total'] ELSE 0 END) as sum_total_usage,
                  sum(CASE WHEN MAP_CONTAINS_KEY(cost_details,'input') THEN cost_details['input'] ELSE 0 END) as sum_input_cost,
                  sum(CASE WHEN MAP_CONTAINS_KEY(cost_details,'output') THEN cost_details['output'] ELSE 0 END) as sum_output_cost,
                  sum(CASE WHEN MAP_CONTAINS_KEY(cost_details,'total') THEN cost_details['total'] ELSE 0 END) as sum_total_cost,
                  any_value(project_id) as project_id
            FROM filtered_observations o
            WHERE o.project_id = {projectId: String}
            ${traceTimestampFilter ? `AND o.start_time >= DATE_SUB({observationsStartTime: DateTime}, INTERVAL 2 DAY)` : ""}
            GROUP BY o.trace_id
          ),` : ""}
        traces_with_tags AS (
          SELECT 
            t.session_id,
            t.project_id,
            t.timestamp,
            t.id,
            t.user_id,
            t.environment,
            COALESCE(tag_exploded.tag, '') as individual_tag
          FROM filtered_traces t
          LATERAL VIEW EXPLODE_OUTER(t.tags) tag_exploded AS tag
        ),
        session_data AS (
            SELECT
                tt.session_id,
                any_value(tt.project_id) as project_id,
                max(tt.timestamp) as max_timestamp,
                min(tt.timestamp) as min_timestamp,
                collect_list(DISTINCT tt.id) AS trace_ids,
                collect_set(CASE WHEN tt.user_id IS NOT NULL AND tt.user_id != '' THEN tt.user_id ELSE NULL END) AS user_ids,
                count(DISTINCT tt.id) as trace_count,
                -- Always aggregate trace tags (like ClickHouse)
                collect_set(
                  CASE 
                    WHEN tt.individual_tag IS NOT NULL AND tt.individual_tag != '' 
                    THEN tt.individual_tag 
                    ELSE NULL 
                  END
                ) as trace_tags,
                any_value(tt.environment) as trace_environment
                ${
                  selectMetrics
                    ? `
                ,
                sum(o.obs_count) as total_observations,
                -- Use milliseconds_diff for duration calculation in Doris
                milliseconds_diff(
                  max(o.max_end_time),
                  CASE WHEN min(o.min_start_time) > '1970-01-01' THEN min(o.min_start_time) ELSE NULL END
                ) as duration,
                -- JSON string representation for usage details
                CONCAT('{"input":', CAST(sum(o.sum_input_usage) AS STRING), ',"output":', CAST(sum(o.sum_output_usage) AS STRING), ',"total":', CAST(sum(o.sum_total_usage) AS STRING), '}') as session_usage_details,
                -- JSON string representation for cost details
                CONCAT('{"input":', CAST(sum(o.sum_input_cost) AS STRING), ',"output":', CAST(sum(o.sum_output_cost) AS STRING), ',"total":', CAST(sum(o.sum_total_cost) AS STRING), '}') as session_cost_details,
                sum(o.sum_input_cost) as session_input_cost,
                sum(o.sum_output_cost) as session_output_cost,
                sum(o.sum_total_cost) as session_total_cost,
                sum(o.sum_input_usage) as session_input_usage,
                sum(o.sum_output_usage) as session_output_usage,
                sum(o.sum_total_usage) as session_total_usage`
                    : ""
                }
            FROM traces_with_tags tt
            ${
              selectMetrics
                ? `LEFT JOIN observations_agg o
            ON tt.id = o.trace_id AND tt.project_id = o.project_id`
                : ""
            }
            WHERE tt.session_id IS NOT NULL
                AND tt.project_id = {projectId: String}
                ${singleTraceFilter?.query ? ` AND ${singleTraceFilter.query}` : ""}
            GROUP BY tt.session_id
        )
                  SELECT ${sqlSelect}
        FROM session_data s
        WHERE ${tracesFilterRes.query ? tracesFilterRes.query : "1=1"}
        ${dorisOrderBy}
        ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
          `;

    const obsStartTimeValue = traceTimestampFilter
      ? convertDateToAnalyticsDateTime(traceTimestampFilter.value)
      : null;

    const res = await queryDoris<T>({
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
    });

    // Post-process Doris results to match ClickHouse format
    if (select === "metrics") {
      const processedRes = (res as Array<SessionWithMetricsReturnType & {
        session_usage_details: string | Record<string, number>;
        session_cost_details: string | Record<string, number>;
      }>).map(row => {
        // Helper function to parse details fields (session_usage_details, session_cost_details)
        const parseDetails = (details: string | Record<string, number>): Record<string, number> => {
          if (!details) {
            return {};
          }
          
          // If already an object (ClickHouse format), return as is
          if (typeof details === 'object' && !Array.isArray(details)) {
            return details;
          }
          
          // If it's a string (Doris format), parse it
          if (typeof details === 'string') {
            const trimmed = details.trim();
            
            // Handle common null/empty cases
            if (!trimmed || trimmed === 'null' || trimmed === 'NULL') {
              return {};
            }
            
            // Handle empty object/array cases
            if (trimmed === '{}' || trimmed === '[]') {
              return {};
            }
            
            try {
              const parsed = JSON.parse(trimmed);
              if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                // Convert values to numbers
                const result: Record<string, number> = {};
                for (const [key, value] of Object.entries(parsed)) {
                  result[key] = Number(value) || 0;
                }
                return result;
              }
              return {};
            } catch (error) {
              return {};
            }
          }
          
          return {};
        };

        // Return row with ClickHouse-compatible format
        return {
          ...row,
          session_usage_details: parseDetails(row.session_usage_details),
          session_cost_details: parseDetails(row.session_cost_details),
          // Ensure trace_tags is always an array and filter out null values
          trace_tags: Array.isArray(row.trace_tags) 
            ? row.trace_tags.filter(tag => tag !== null && tag !== '')
            : []
        } as SessionWithMetricsReturnType;
      });

      return processedRes as T[];
    }

    // Post-process Doris results for rows to ensure trace_tags field is properly formatted as array
    if (select === "rows") {
      const processedRes = (res as Array<SessionDataReturnType & {
        trace_tags: string[] | string | null;
      }>).map(row => {
        // Ensure trace_tags is always an array
        let processedTraceTags: string[] = [];
        
        if (Array.isArray(row.trace_tags)) {
          processedTraceTags = row.trace_tags.filter(tag => tag !== null && tag !== '');
        } else if (typeof row.trace_tags === 'string') {
          try {
            // Try to parse as JSON array
            const parsed = JSON.parse(row.trace_tags);
            processedTraceTags = Array.isArray(parsed) ? parsed.filter(tag => tag !== null && tag !== '') : [row.trace_tags];
          } catch {
            // If parsing fails, treat as single tag
            processedTraceTags = row.trace_tags ? [row.trace_tags] : [];
          }
        } else if (row.trace_tags == null) {
          processedTraceTags = [];
        } else {
          // Convert any other type to empty array
          processedTraceTags = [];
        }
        
        return {
          ...row,
          trace_tags: processedTraceTags
        } as SessionDataReturnType;
      });

      return processedRes as T[];
    }

    return res;
  }

  // ClickHouse implementation
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
