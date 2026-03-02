/**
 * Logic mirrors services/traces-ui-table-service.ts (ClickHouse); syntax adapted for OceanBase.
 * - shouldSkipObservationsFinal: same as CH (skip observations dedup for OTel projects).
 * - FINAL / LIMIT 1 BY → ROW_NUMBER() OVER (...) WHERE rn = 1; sumMap/groupArrayIf → JSON aggregation.
 */
import { OrderByState } from "../../interfaces/orderBy";
import { tracesTableUiColumnDefinitions } from "../tableMappings";
import { FilterState } from "../../types";
import {
  StringFilter,
  StringOptionsFilter,
  DateTimeFilter,
} from "../queries/oceanbase-sql/oceanbase-filter";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/oceanbase-sql/factory";
import { orderByToOceanbaseSql } from "../queries/oceanbase-sql/orderby-factory";
import { oceanbaseSearchCondition } from "../queries/oceanbase-sql/search";
import { shouldSkipObservationsFinal } from "../queries/clickhouse-sql/query-options";
import { TraceRecordReadType } from "../repositories/definitions";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  reduceUsageOrCostDetails,
} from "../repositories";
import { measureAndReturn } from "../oceanbase/measureAndReturn";
import { TracingSearchType } from "../../interfaces/search";
import { ObservationLevelType, TraceDomain } from "../../domain";
import { DatabaseAdapterFactory } from "../database";
import { convertFilterParamsToPositional } from "../database/oceanbase-filter-helper";
import { convertDateToDateTime } from "../database";

export type TracesTableReturnType = Pick<
  TraceRecordReadType,
  | "project_id"
  | "id"
  | "name"
  | "timestamp"
  | "bookmarked"
  | "release"
  | "version"
  | "user_id"
  | "session_id"
  | "environment"
  | "tags"
  | "public"
>;

export type TracesTableUiReturnType = Pick<
  TraceDomain,
  | "id"
  | "projectId"
  | "timestamp"
  | "tags"
  | "bookmarked"
  | "name"
  | "release"
  | "version"
  | "userId"
  | "environment"
  | "sessionId"
  | "public"
>;

export type TracesMetricsUiReturnType = {
  id: string;
  projectId: string;
  promptTokens: bigint;
  completionTokens: bigint;
  totalTokens: bigint;
  latency: number | null;
  level: ObservationLevelType;
  observationCount: bigint;
  calculatedTotalCost: Decimal | null;
  calculatedInputCost: Decimal | null;
  calculatedOutputCost: Decimal | null;
  scores: ScoreAggregate;
  usageDetails: Record<string, number>;
  costDetails: Record<string, number>;
  errorCount: bigint;
  warningCount: bigint;
  defaultCount: bigint;
  debugCount: bigint;
};

export const convertToUiTableRows = (
  row: TracesTableReturnType,
): TracesTableUiReturnType => {
  const adapter = DatabaseAdapterFactory.getInstance();
  return {
    id: row.id,
    projectId: row.project_id,
    timestamp: adapter.parseUTCDateTimeFormat(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    name: row.name ?? null,
    release: row.release ?? null,
    version: row.version ?? null,
    userId: row.user_id ?? null,
    environment: row.environment ?? null,
    sessionId: row.session_id ?? null,
    public: row.public,
  };
};

export const convertToUITableMetrics = (
  row: TracesTableMetricsClickhouseReturnType,
): Omit<TracesMetricsUiReturnType, "scores"> => {
  const usageDetails = reduceUsageOrCostDetails(row.usage_details);

  return {
    id: row.id,
    projectId: row.project_id,
    latency: Number(row.latency),
    promptTokens: BigInt(usageDetails.input ?? 0),
    completionTokens: BigInt(usageDetails.output ?? 0),
    totalTokens: BigInt(usageDetails.total ?? 0),
    usageDetails: Object.fromEntries(
      Object.entries(row.usage_details ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    costDetails: Object.fromEntries(
      Object.entries(row.cost_details ?? {}).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ),
    observationCount: BigInt(row.observation_count ?? 0),
    calculatedTotalCost: row.cost_details?.total
      ? new Decimal(row.cost_details.total)
      : null,
    calculatedInputCost: row.cost_details?.input
      ? new Decimal(row.cost_details.input)
      : null,
    calculatedOutputCost: row.cost_details?.output
      ? new Decimal(row.cost_details.output)
      : null,
    level: row.level,
    debugCount: BigInt(row.debug_count ?? 0),
    warningCount: BigInt(row.warning_count ?? 0),
    errorCount: BigInt(row.error_count ?? 0),
    defaultCount: BigInt(row.default_count ?? 0),
  };
};

export type TracesTableMetricsClickhouseReturnType = {
  id: string;
  project_id: string;
  timestamp: Date;
  level: ObservationLevelType;
  observation_count: number | null;
  latency: string | null;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
  error_count: number | null;
  warning_count: number | null;
  default_count: number | null;
  debug_count: number | null;
};

export type FetchTracesTableProps = {
  select: "count" | "rows" | "metrics" | "identifiers";
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
};

// Define return type mapping for better type safety
type SelectReturnTypeMap = {
  count: { count: string };
  metrics: TracesTableMetricsClickhouseReturnType;
  rows: TracesTableReturnType;
  identifiers: { id: string; projectId: string; timestamp: string };
};

// Function overloads for type-safe select-specific returns
async function getTracesTableGeneric(
  props: FetchTracesTableProps & { select: "count" },
): Promise<Array<SelectReturnTypeMap["count"]>>;

async function getTracesTableGeneric(
  props: FetchTracesTableProps & { select: "metrics" },
): Promise<Array<SelectReturnTypeMap["metrics"]>>;

async function getTracesTableGeneric(
  props: FetchTracesTableProps & { select: "rows" },
): Promise<Array<SelectReturnTypeMap["rows"]>>;

async function getTracesTableGeneric(
  props: FetchTracesTableProps & { select: "identifiers" },
): Promise<Array<SelectReturnTypeMap["identifiers"]>>;

// Implementation with union type for internal use
async function getTracesTableGeneric(
  props: FetchTracesTableProps,
): Promise<Array<SelectReturnTypeMap[keyof SelectReturnTypeMap]>>;

async function getTracesTableGeneric(props: FetchTracesTableProps) {
  const {
    select,
    projectId,
    filter,
    orderBy,
    limit,
    page,
    searchQuery,
    searchType,
  } = props;

  // OTel projects use immutable spans - no need for deduplication (mirror CH)
  const skipObservationsDedup = await shouldSkipObservationsFinal(projectId);

  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  const rawFilters = createFilterFromFilterState(
    filter,
    tracesTableUiColumnDefinitions,
  );
  // 过滤掉空数组值的过滤器，避免生成无效的 IN () SQL
  const validFilters = rawFilters.filter(
    (f) => !("values" in f && Array.isArray(f.values) && f.values.length === 0),
  );

  tracesFilter.push(...validFilters);

  const traceIdFilter = tracesFilter.find(
    (f) => f.clickhouseTable === "traces" && f.field === "id",
  ) as StringFilter | StringOptionsFilter | undefined;

  traceIdFilter
    ? scoresFilter.push(
        new StringOptionsFilter({
          clickhouseTable: "scores",
          field: "trace_id",
          operator: "any of",
          values:
            traceIdFilter instanceof StringFilter
              ? [traceIdFilter.value]
              : traceIdFilter.values,
        }),
      )
    : null;
  traceIdFilter
    ? observationsFilter.push(
        new StringOptionsFilter({
          clickhouseTable: "observations",
          field: "trace_id",
          operator: "any of",
          values:
            traceIdFilter instanceof StringFilter
              ? [traceIdFilter.value]
              : traceIdFilter.values,
        }),
      )
    : null;

  // for query optimisation, we have to add the timeseries filter to observations + scores as well
  // stats show, that 98% of all observations have their start_time larger than trace.timestamp - 5 min
  const timeStampFilter = tracesFilter.find(
    (f) =>
      f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const requiresScoresJoin =
    tracesFilter.find((f) => f.clickhouseTable === "scores") !== undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

  const requiresObservationsJoin =
    tracesFilter.find((f) => f.clickhouseTable === "observations") !==
      undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "observations";

  const tracesFilterRes = tracesFilter.apply();
  const scoresFilterRes = scoresFilter.apply();
  const observationFilterRes = observationsFilter.apply();

  // Convert filter params for OceanBase
  let tracesFilterQuery = tracesFilterRes?.query || "";
  let tracesFilterParams: unknown[] = [];
  let scoresFilterQuery = scoresFilterRes?.query || "";
  let scoresFilterParams: unknown[] = [];
  let observationFilterQuery = observationFilterRes?.query || "";
  let observationFilterParams: unknown[] = [];

  if (tracesFilterRes?.query && tracesFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      tracesFilterRes.query,
      tracesFilterRes.params,
    );
    tracesFilterQuery = converted.query;
    tracesFilterParams = converted.params;
  }
  if (scoresFilterRes?.query && scoresFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      scoresFilterRes.query,
      scoresFilterRes.params,
    );
    // Ensure table alias is added for scores filter
    // Replace project_id = ? with s.project_id = ?
    // Also handle project_id IN (?) pattern
    scoresFilterQuery = converted.query.replace(
      /\bproject_id\s*(=|IN\s*\(|NOT\s+IN\s*\()/gi,
      "s.project_id $1",
    );
    scoresFilterParams = converted.params;
  }
  if (observationFilterRes?.query && observationFilterRes?.params) {
    const converted = convertFilterParamsToPositional(
      observationFilterRes.query,
      observationFilterRes.params,
    );
    // Ensure table alias is added for observations filter
    // Replace project_id = ? with o.project_id = ?
    // Also handle project_id IN (?) pattern
    observationFilterQuery = converted.query.replace(
      /\bproject_id\s*(=|IN\s*\(|NOT\s+IN\s*\()/gi,
      "o.project_id $1",
    );
    observationFilterParams = converted.params;
  }

  // Convert orderBy for OceanBase
  const convertOrderBy = (orderByStr: string) => {
    if (!orderByStr) return "";
    // Remove ORDER BY prefix
    let result = orderByStr.replace(/ORDER BY\s+/i, "");
    // Convert double quotes to backticks
    result = result.replace(/"([^"]+)"/g, "`$1`");
    // For OceanBase, DATE() function in ORDER BY might cause "Invalid use of group function" error
    // The solution is to use the column alias from SELECT instead of the function expression
    // Replace DATE(t.timestamp) with timestamp_to_date (the alias we added to SELECT)
    result = result.replace(
      /DATE\s*\(\s*t\.timestamp\s*\)/gi,
      "timestamp_to_date",
    );
    // Also handle DATE(timestamp) without table alias
    result = result.replace(
      /DATE\s*\(\s*timestamp\s*\)/gi,
      "timestamp_to_date",
    );
    // Split by comma and process each part
    const parts = result.split(/,/).map((p) => p.trim());
    // Remove duplicates
    const seen = new Set<string>();
    const uniqueParts = parts.filter((part) => {
      const normalized = part.toLowerCase();
      if (seen.has(normalized)) {
        return false;
      }
      seen.add(normalized);
      return true;
    });
    return uniqueParts.join(", ");
  };

  // OceanBase/MySQL compatible CTEs (when !skipObservationsDedup use ROW_NUMBER dedup to mirror CH FINAL)
  const observationsAndScoresCTE = `
    WITH ranked_observations AS (
      SELECT 
        o.*
        ${skipObservationsDedup ? "" : ",\n        ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.event_ts DESC) as rn"}
      FROM observations o
      WHERE ${observationFilterQuery || "o.project_id = ?"}
        ${timeStampFilter ? `AND o.start_time >= DATE_SUB(?, ${OBSERVATIONS_TO_TRACE_INTERVAL})` : ""}
    ),
    deduplicated_observations AS (
      SELECT * 
      FROM ranked_observations
      ${skipObservationsDedup ? "" : "WHERE rn = 1"}
    ),
    observations_usage_keys AS (
      SELECT 
        o.trace_id,
        o.project_id,
        o.start_time,
        o.end_time,
        o.level,
        o.total_cost,
        o.usage_details,
        JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']'))) AS usage_key
      FROM deduplicated_observations o
      CROSS JOIN (
        SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
        UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
        UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
      ) n
      WHERE JSON_EXTRACT(JSON_KEYS(o.usage_details), CONCAT('$[', n.n, ']')) IS NOT NULL
    ),
    observations_usage_expanded AS (
      SELECT 
        trace_id,
        project_id,
        start_time,
        end_time,
        level,
        total_cost,
        usage_key,
        CAST(JSON_UNQUOTE(JSON_EXTRACT(usage_details, CONCAT('$.', usage_key))) AS UNSIGNED) AS usage_value
      FROM observations_usage_keys
    ),
    observations_cost_keys AS (
      SELECT 
        o.trace_id,
        o.cost_details,
        JSON_UNQUOTE(JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']'))) AS cost_key
      FROM deduplicated_observations o
      CROSS JOIN (
        SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 
        UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9
        UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14
        UNION SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
      ) n
      WHERE JSON_EXTRACT(JSON_KEYS(o.cost_details), CONCAT('$[', n.n, ']')) IS NOT NULL
    ),
    observations_cost_expanded AS (
      SELECT 
        trace_id,
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
        JSON_OBJECTAGG(usage_key, usage_value) as usage_details
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
        JSON_OBJECTAGG(cost_key, cost_value) as cost_details
      FROM observations_cost_summed
      GROUP BY trace_id
    ),
    observations_levels AS (
      SELECT 
        trace_id,
        JSON_ARRAYAGG(level) as levels
      FROM deduplicated_observations
      GROUP BY trace_id
    ),
    observations_stats AS (
      SELECT
        o.trace_id,
        o.project_id,
        COUNT(*) AS observation_count,
        COALESCE(ua.usage_details, CAST('{}' AS JSON)) as usage_details,
        SUM(o.total_cost) AS total_cost,
        TIMESTAMPDIFF(MICROSECOND, 
          MIN(LEAST(o.start_time, COALESCE(o.end_time, o.start_time))), 
          MAX(GREATEST(o.start_time, COALESCE(o.end_time, o.start_time)))
        ) / 1000 as latency_milliseconds,
        SUM(CASE WHEN o.level = 'ERROR' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN o.level = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN o.level = 'DEFAULT' THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN o.level = 'DEBUG' THEN 1 ELSE 0 END) as debug_count,
        CASE 
          WHEN ol.levels IS NOT NULL AND JSON_SEARCH(ol.levels, 'one', 'ERROR') IS NOT NULL THEN 'ERROR'
          WHEN ol.levels IS NOT NULL AND JSON_SEARCH(ol.levels, 'one', 'WARNING') IS NOT NULL THEN 'WARNING'
          WHEN ol.levels IS NOT NULL AND JSON_SEARCH(ol.levels, 'one', 'DEFAULT') IS NOT NULL THEN 'DEFAULT'
          ELSE 'DEBUG'
        END AS aggregated_level,
        COALESCE(ca.cost_details, CAST('{}' AS JSON)) as cost_details
      FROM deduplicated_observations o
      LEFT JOIN observations_usage_agg ua ON o.trace_id = ua.trace_id
      LEFT JOIN observations_cost_agg ca ON o.trace_id = ca.trace_id
      LEFT JOIN observations_levels ol ON o.trace_id = ol.trace_id
      GROUP BY o.trace_id, o.project_id
    ),
    ranked_scores AS (
      SELECT 
        s.*,
        ROW_NUMBER() OVER (PARTITION BY s.id, s.project_id ORDER BY s.event_ts DESC) as rn
      FROM scores s
      WHERE ${scoresFilterQuery || "s.project_id = ?"}
        ${timeStampFilter ? `AND s.timestamp >= DATE_SUB(?, ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL})` : ""}
    ),
    deduplicated_scores AS (
      SELECT * 
      FROM ranked_scores
      WHERE rn = 1
    ),
    scores_avg AS (
      SELECT
        project_id,
        trace_id,
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
          trace_id,
          name,
          data_type,
          string_value,
          AVG(value) as avg_value
        FROM deduplicated_scores
        GROUP BY
          project_id,
          trace_id,
          name,
          data_type,
          string_value
      ) tmp
      GROUP BY project_id, trace_id
    ),
  `;

  return measureAndReturn({
    operationName: "getTracesTableGeneric",
    projectId: props.projectId,
    input: props,
    fn: async (props: FetchTracesTableProps) => {
      let sqlSelect: string;
      switch (select) {
        case "count":
          // Using COUNT(DISTINCT) for OceanBase
          sqlSelect = "COUNT(DISTINCT t.id) as count";
          break;
        case "metrics":
          sqlSelect = `
            t.id as id,
            t.project_id as project_id,
            t.timestamp as timestamp,
            o.latency_milliseconds / 1000 as latency,
            o.cost_details as cost_details,
            o.usage_details as usage_details,
            o.aggregated_level as level,
            o.error_count as error_count,
            o.warning_count as warning_count,
            o.default_count as default_count,
            o.debug_count as debug_count,
            o.observation_count as observation_count,
            s.scores_avg as scores_avg,
            s.score_categories as score_categories,
            t.public as public`;
          break;
        case "rows":
          sqlSelect = `
            t.id as id,
            t.project_id as project_id,
            t.timestamp as timestamp,
            DATE(t.timestamp) as timestamp_to_date,
            t.tags as tags,
            t.bookmarked as bookmarked,
            t.name as name,
            t.release_col as \`release\`,
            t.version as version,
            t.user_id as user_id,
            t.environment as environment,
            t.session_id as session_id,
            t.public as public`;
          break;
        case "identifiers":
          sqlSelect = `
            t.id as id,
            t.project_id as projectId,
            DATE(t.timestamp) as timestamp_to_date,
            t.timestamp as timestamp`;
          break;
        default:
          throw new Error(`Unknown select type: ${select}`);
      }

      const search = oceanbaseSearchCondition(searchQuery, searchType, "t");

      // Convert search params for OceanBase
      let searchQueryStr = search.query || "";
      let searchParams: unknown[] = [];
      if (search.params) {
        const converted = convertFilterParamsToPositional(
          search.query || "",
          search.params,
        );
        searchQueryStr = converted.query;
        searchParams = converted.params;
      }

      const defaultOrder = orderBy?.order && orderBy?.column === "timestamp";
      const orderByCols = [
        ...tracesTableUiColumnDefinitions,
        {
          clickhouseSelect: "DATE(t.timestamp)",
          uiTableName: "timestamp_to_date",
          uiTableId: "timestamp_to_date",
          clickhouseTableName: "traces",
        },
        {
          clickhouseSelect: "t.event_ts",
          uiTableName: "event_ts",
          uiTableId: "event_ts",
          clickhouseTableName: "traces",
        },
      ];
      const chOrderBy = orderByToOceanbaseSql(
        [
          defaultOrder
            ? [
                {
                  column: "timestamp_to_date",
                  order: orderBy.order,
                },
                { column: "timestamp", order: orderBy.order },
                { column: "event_ts", order: "DESC" as "DESC" },
              ]
            : null,
          orderBy ?? null,
        ].flat(),
        orderByCols,
      );
      const orderByClause = convertOrderBy(chOrderBy);

      // OceanBase/MySQL compatible query (observationsAndScoresCTE already ends with a comma)
      const query = `
        ${observationsAndScoresCTE}
        ranked_traces AS (
          SELECT 
            t.id,
            t.timestamp,
            t.name,
            t.user_id,
            t.metadata,
            t.\`release\` as release_col,
            t.version,
            t.project_id,
            t.environment,
            t.public,
            t.bookmarked,
            t.tags,
            t.input,
            t.output,
            t.session_id,
            t.created_at,
            t.updated_at,
            t.event_ts,
            t.is_deleted,
            ROW_NUMBER() OVER (PARTITION BY t.id, t.project_id ORDER BY t.event_ts DESC) as rn
          FROM traces t
          WHERE t.project_id = ?
        ),
        deduplicated_traces AS (
          SELECT 
            id,
            timestamp,
            name,
            user_id,
            metadata,
            release_col,
            version,
            project_id,
            environment,
            public,
            bookmarked,
            tags,
            input,
            output,
            session_id,
            created_at,
            updated_at,
            event_ts,
            is_deleted,
            rn
          FROM ranked_traces
          WHERE ${defaultOrder && ["metrics", "rows", "identifiers"].includes(select) ? "rn = 1" : "1=1"}
        )
        SELECT ${sqlSelect}
        FROM deduplicated_traces t
        ${select === "metrics" || requiresObservationsJoin ? `LEFT JOIN observations_stats o ON o.project_id = t.project_id AND o.trace_id = t.id` : ""}
        ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_avg s ON s.project_id = t.project_id AND s.trace_id = t.id` : ""}
        WHERE ${tracesFilterQuery || "t.project_id = ?"}
        ${searchQueryStr}
        ${orderByClause ? `ORDER BY ${orderByClause}` : ""}
        ${limit !== undefined && page !== undefined ? `LIMIT ? OFFSET ?` : ""}
      `;

      // Build positional parameters array for OceanBase
      const params: unknown[] = [];

      // observationsAndScoresCTE params
      if (observationFilterQuery) {
        // observationFilterQuery already includes project_id filter
        params.push(...observationFilterParams);
        if (timeStampFilter) {
          params.push(convertDateToDateTime(timeStampFilter.value));
        }
      } else {
        // No filter query, need to add project_id manually
        params.push(projectId);
        if (timeStampFilter) {
          params.push(convertDateToDateTime(timeStampFilter.value));
        }
      }

      // scores ranked_scores params
      if (scoresFilterQuery) {
        // scoresFilterQuery already includes project_id filter
        params.push(...scoresFilterParams);
        if (timeStampFilter) {
          params.push(convertDateToDateTime(timeStampFilter.value));
        }
      } else {
        // No filter query, need to add project_id manually
        params.push(projectId);
        if (timeStampFilter) {
          params.push(convertDateToDateTime(timeStampFilter.value));
        }
      }

      // ranked_traces params
      params.push(projectId);

      // Final query params
      if (tracesFilterQuery) {
        // tracesFilterQuery already includes project_id filter
        params.push(...tracesFilterParams);
        params.push(...searchParams);
      } else {
        // No filter query, need to add project_id manually
        params.push(projectId);
        params.push(...searchParams);
      }
      if (limit !== undefined && page !== undefined) {
        params.push(limit, limit * page);
      }

      const adapter = DatabaseAdapterFactory.getInstance();
      const res = await adapter.queryWithOptions<
        SelectReturnTypeMap[keyof SelectReturnTypeMap]
      >({
        query: query,
        params,
        tags: {
          ...(props.tags ?? {}),
          feature: "tracing",
          type: "traces-table",
          projectId,
          operation_name: "getTracesTableGeneric",
        },
      });

      return res;
    },
  });
}

export const getTracesTableCount = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const countRows = await getTracesTableGeneric({
    select: "count",
    tags: { kind: "count" },
    ...props,
  });

  const converted = countRows.map((row) => ({
    count: Number(row.count),
  }));

  return converted.length > 0 ? converted[0].count : 0;
};

export const getTracesTableMetrics = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}): Promise<Array<Omit<TracesMetricsUiReturnType, "scores">>> => {
  const countRows = await getTracesTableGeneric({
    select: "metrics",
    tags: { kind: "analytic" },
    ...props,
  });

  return countRows.map(convertToUITableMetrics);
};

export const getTracesTable = async (p: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const { projectId, filter, searchQuery, searchType, orderBy, limit, page } =
    p;
  const rows = await getTracesTableGeneric({
    select: "rows",
    tags: { kind: "list" },
    projectId,
    filter,
    searchQuery,
    searchType,
    orderBy,
    limit,
    page,
  });

  return rows.map(convertToUiTableRows);
};

export const getTraceIdentifiers = async (props: {
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const adapter = DatabaseAdapterFactory.getInstance();
  const { projectId, filter, searchQuery, searchType, orderBy, limit, page } =
    props;
  const identifiers = await getTracesTableGeneric({
    select: "identifiers",
    tags: { kind: "list" },
    projectId,
    filter,
    searchQuery,
    searchType,
    orderBy,
    limit,
    page,
  });

  return identifiers.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    timestamp: adapter.parseUTCDateTimeFormat(row.timestamp),
  }));
};
