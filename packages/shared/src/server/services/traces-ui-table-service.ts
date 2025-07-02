import { OrderByState } from "../../interfaces/orderBy";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  StringFilter,
  StringOptionsFilter,
  DateTimeFilter,
} from "../queries/clickhouse-sql/clickhouse-filter";
import {
  getProjectIdDefaultFilter,
  createFilterFromFilterState,
} from "../queries/clickhouse-sql/factory";
import { orderByToClickhouseSql } from "../queries/clickhouse-sql/orderby-factory";
import { clickhouseSearchCondition } from "../queries/clickhouse-sql/search";
import { TraceRecordReadType } from "../repositories/definitions";
import Decimal from "decimal.js";
import { ScoreAggregate } from "../../features/scores";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  reduceUsageOrCostDetails,
} from "../repositories";
import { TracingSearchType } from "../../interfaces/search";
import { ObservationLevelType, TraceDomain } from "../../domain";
import { ClickHouseClientConfigOptions } from "@clickhouse/client";
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
  StringFilter as DorisStringFilter,
  StringOptionsFilter as DorisStringOptionsFilter,
  DateTimeFilter as DorisDateTimeFilter,
} from "../queries/doris-sql/doris-filter";
import { orderByToDorisSQL } from "../queries/doris-sql/orderby-factory";
import { dorisSearchCondition, DorisSearchContext } from "../queries/doris-sql/search";
import { logger } from "../logger";

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
  // Handle timestamp format differences between ClickHouse (string) and Doris (Date object)
  // Use type assertion since TypeScript doesn't know the runtime type can be Date | string
  const timestampValue = row.timestamp as unknown;
  const timestamp = timestampValue instanceof Date 
    ? timestampValue as Date
    : parseClickhouseUTCDateTimeFormat(row.timestamp as string);

  return {
    id: row.id,
    projectId: row.project_id,
    timestamp: timestamp,
    tags: row.tags ?? [], // Ensure tags is always an array, never null
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
  score_categories: Array<string>;
  error_count: number | null;
  warning_count: number | null;
  default_count: number | null;
  debug_count: number | null;
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
    usageDetails: row.usage_details ? Object.fromEntries(
      Object.entries(row.usage_details).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ) : {},
    costDetails: row.cost_details ? Object.fromEntries(
      Object.entries(row.cost_details).map(([key, value]) => [
        key,
        Number(value),
      ]),
    ) : {},
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

export type FetchTracesTableProps = {
  select: "count" | "rows" | "metrics" | "identifiers";
  projectId: string;
  filter: FilterState;
  searchQuery?: string;
  searchType?: TracingSearchType[];
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
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
  // eslint-disable-next-line no-unused-vars
  props: FetchTracesTableProps & { select: "count" },
): Promise<Array<SelectReturnTypeMap["count"]>>;

async function getTracesTableGeneric(
  // eslint-disable-next-line no-unused-vars
  props: FetchTracesTableProps & { select: "metrics" },
): Promise<Array<SelectReturnTypeMap["metrics"]>>;

async function getTracesTableGeneric(
  // eslint-disable-next-line no-unused-vars
  props: FetchTracesTableProps & { select: "rows" },
): Promise<Array<SelectReturnTypeMap["rows"]>>;

async function getTracesTableGeneric(
  // eslint-disable-next-line no-unused-vars
  props: FetchTracesTableProps & { select: "identifiers" },
): Promise<Array<SelectReturnTypeMap["identifiers"]>>;

// Implementation with union type for internal use
async function getTracesTableGeneric(
  // eslint-disable-next-line no-unused-vars
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
    clickhouseConfigs,
  } = props;

  // 共用的 SELECT 语句生成逻辑
  let sqlSelect: string;
  switch (select) {
    case "count":
      sqlSelect = "count(*) as count";
      break;
    case "metrics":
      sqlSelect = `
        t.id as id,
        t.project_id as project_id,
        t.timestamp as timestamp,
        os.latency_milliseconds / 1000 as latency,
        os.cost_details as cost_details,
        os.usage_details as usage_details,
        os.aggregated_level as level,
        os.error_count as error_count,
        os.warning_count as warning_count,
        os.default_count as default_count,
        os.debug_count as debug_count,
        os.observation_count as observation_count,
        s.scores_avg as scores_avg,
        s.score_categories as score_categories,
        t.\`public\` as \`public\``;
      break;
    case "rows":
      sqlSelect = `
        t.id as id,
        t.project_id as project_id,
        t.timestamp as timestamp,
        t.tags as tags,
        t.bookmarked as bookmarked,
        t.name as name,
        t.\`release\` as \`release\`,
        t.version as version,
        t.user_id as user_id,
        t.environment as environment,
        t.session_id as session_id,
        t.\`public\` as \`public\``;
      break;
    case "identifiers":
      sqlSelect = `
        t.id as id,
        t.project_id as projectId,
        t.timestamp as timestamp`;
      break;
    default:
      throw new Error(`Unknown select type: ${select}`);
  }

  if (isDorisBackend()) {
    const { tracesFilter, scoresFilter, observationsFilter } =
      getDorisProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

    tracesFilter.push(
      ...createDorisFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
    );

    const traceIdFilter = tracesFilter.find(
      (f) => f.table === "traces" && f.field === "id",
    ) as DorisStringFilter | DorisStringOptionsFilter | undefined;

    traceIdFilter
      ? scoresFilter.push(
          new DorisStringOptionsFilter({
            clickhouseTable: "scores",
            field: "trace_id",
            operator: "any of",
            values:
              traceIdFilter instanceof DorisStringFilter
                ? [traceIdFilter.value]
                : traceIdFilter.values,
          }),
        )
      : null;
    traceIdFilter
      ? observationsFilter.push(
          new DorisStringOptionsFilter({
            clickhouseTable: "observations",
            field: "trace_id",
            operator: "any of",
            values:
              traceIdFilter instanceof DorisStringFilter
                ? [traceIdFilter.value]
                : traceIdFilter.values,
          }),
        )
      : null;

    const timeStampFilter = tracesFilter.find(
      (f) =>
        f.field === "timestamp" && (f.operator === ">=" || f.operator === ">"),
    ) as DorisDateTimeFilter | undefined;

    const requiresScoresJoin =
      tracesFilter.find((f) => f.table === "scores") !== undefined ||
      tracesTableUiColumnDefinitions.find(
        (c) =>
          c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
      )?.clickhouseTableName === "scores";

    const requiresObservationsJoin =
      tracesFilter.find((f) => f.table === "observations") !== undefined ||
      tracesTableUiColumnDefinitions.find(
        (c) =>
          c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
      )?.clickhouseTableName === "observations";

    const tracesFilterRes = tracesFilter.apply();
    const scoresFilterRes = scoresFilter.apply();
    const observationFilterRes = observationsFilter.apply();

    const search = dorisSearchCondition(searchQuery, searchType, {
      type: "traces",
    });

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
    const dorisOrderBy = orderByToDorisSQL(
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

    // Doris version of the complex query
    const observations_stats_cte = select === "metrics" || requiresObservationsJoin ? `
      observations_stats AS (
        SELECT
          agg.trace_id,
          agg.project_id,
          agg.observation_count,
          agg.total_cost,
          agg.latency_milliseconds,
          agg.error_count,
          agg.warning_count,
          agg.default_count,
          agg.debug_count,
          agg.aggregated_level,
          maps.usage_details,
          maps.cost_details
        FROM (
          SELECT
            trace_id,
            project_id,
            COUNT(*) AS observation_count,
            SUM(total_cost) AS total_cost,
            -- Doris 中计算毫秒差值 - 使用 CASE WHEN 替代 least/greatest
            milliseconds_diff(
            CASE WHEN max(start_time) > max(end_time) THEN max(start_time) ELSE max(end_time) END,
            CASE WHEN min(start_time) < min(end_time) THEN min(start_time) ELSE min(end_time) END
            ) as latency_milliseconds,
            -- 条件计数
            sum(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as error_count,
            sum(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
            sum(CASE WHEN level = 'DEFAULT' THEN 1 ELSE 0 END) as default_count,
            sum(CASE WHEN level = 'DEBUG' THEN 1 ELSE 0 END) as debug_count,
            -- 级别聚合
            CASE 
              WHEN ARRAY_CONTAINS(collect_list(level), 'ERROR') THEN 'ERROR'
              WHEN ARRAY_CONTAINS(collect_list(level), 'WARNING') THEN 'WARNING'
              WHEN ARRAY_CONTAINS(collect_list(level), 'DEFAULT') THEN 'DEFAULT'
              ELSE 'DEBUG'
            END AS aggregated_level
          FROM (
            SELECT
              trace_id,
              project_id,
              level,
              start_time,
              end_time,
              total_cost
            FROM observations o
            WHERE project_id = {projectId: String}
            ${timeStampFilter ? `AND start_time >= DATE_SUB({traceTimestamp: DateTime}, INTERVAL 2 DAY)` : ""}
            ${observationFilterRes ? `AND ${observationFilterRes.query}` : ""}
          ) obs
          GROUP BY trace_id, project_id
        ) agg
        LEFT JOIN (
          SELECT
            trace_id,
            project_id,
            -- 在这个独立查询中重建 map
            map_agg(usage_key, usage_sum) as usage_details,
            map_agg(cost_key, cost_sum) as cost_details
          FROM (
            SELECT
              o.trace_id,
              o.project_id,
              usage_key,
              sum(usage_value) as usage_sum,
              cost_key,
              sum(cost_value) as cost_sum
            FROM observations o
            LATERAL VIEW explode_map(usage_details) usage_exploded AS usage_key, usage_value
            LATERAL VIEW explode_map(cost_details) cost_exploded AS cost_key, cost_value
            WHERE o.project_id = {projectId: String}
            ${timeStampFilter ? `AND o.start_time >= DATE_SUB({traceTimestamp: DateTime}, INTERVAL 2 DAY)` : ""}
            ${observationFilterRes ? `AND ${observationFilterRes.query}` : ""}
            AND usage_details IS NOT NULL
            AND cost_details IS NOT NULL
            GROUP BY 
              o.trace_id,
              o.project_id,
              usage_key,
              cost_key
          ) kv_pairs
          GROUP BY trace_id, project_id
        ) maps ON agg.trace_id = maps.trace_id AND agg.project_id = maps.project_id
      )` : "";

    const scores_avg_cte = select === "metrics" || requiresScoresJoin ? `
      scores_avg AS (
        SELECT
          project_id,
          trace_id,
          -- 数值分数：使用字符串拼接 'name:avg_value' 格式（因为 collect_list 不支持 struct）
          -- 过滤 NULL 值以与 ClickHouse 的 groupArrayIf 行为保持一致
          array_except(
            collect_list(
              CASE WHEN data_type IN ('NUMERIC', 'BOOLEAN') THEN 
                CONCAT(name, ':', CAST(avg_value AS STRING))
              ELSE NULL END
            ), 
            [NULL]
          ) AS scores_avg,
          -- 分类分数：构建 name:value 格式字符串数组（与 ClickHouse 保持一致）
          -- 过滤 NULL 值以与 ClickHouse 的 groupArrayIf 行为保持一致
          array_except(
            collect_list(
              CASE WHEN data_type = 'CATEGORICAL' AND string_value IS NOT NULL AND string_value != '' THEN 
                CONCAT(name, ':', string_value)
              ELSE NULL END
            ),
            [NULL]
          ) AS score_categories
        FROM (
          SELECT 
            project_id,
            trace_id,
            name,
            data_type,
            string_value,
            avg(value) as avg_value
          FROM scores s 
          WHERE 
            project_id = {projectId: String}
            ${timeStampFilter ? `AND s.timestamp >= DATE_SUB({traceTimestamp: DateTime}, INTERVAL 1 HOUR)` : ""}
            ${scoresFilterRes ? `AND ${scoresFilterRes.query}` : ""}
          GROUP BY 
            project_id,
            trace_id,
            name,
            data_type,
            string_value
        ) tmp
        GROUP BY project_id, trace_id
      )` : "";

    const withClause = [observations_stats_cte, scores_avg_cte]
      .filter(Boolean)
      .join(",\n");

    const query = `
      ${withClause ? `WITH ${withClause}` : ""}
      SELECT ${sqlSelect}
      FROM traces t
      ${select === "metrics" || requiresObservationsJoin ? `LEFT JOIN observations_stats os on os.project_id = t.project_id and os.trace_id = t.id` : ""}
      ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_avg s on s.project_id = t.project_id and s.trace_id = t.id` : ""}
      WHERE t.project_id = {projectId: String}
      ${tracesFilterRes ? `AND ${tracesFilterRes.query}` : ""}
      ${search.query}
      ${dorisOrderBy}
      ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    `;

    // Define Doris-specific return type for metrics
    type DorisMetricsReturnType = Omit<TracesTableMetricsClickhouseReturnType, 'scores_avg' | 'score_categories' | 'usage_details' | 'cost_details'> & {
      scores_avg: string | Array<string>; // Doris format: JSON string or array
      score_categories: string | Array<string>; // JSON string or array
      usage_details: string | Record<string, number> | null; // Doris returns string, ClickHouse returns object
      cost_details: string | Record<string, number> | null; // Doris returns string, ClickHouse returns object
    };

    const res = await queryDoris<
      SelectReturnTypeMap[keyof SelectReturnTypeMap]
    >({
      query: query,
      params: {
        limit: limit,
        offset: limit && page ? limit * page : 0,
        ...(timeStampFilter
          ? { traceTimestamp: convertDateToAnalyticsDateTime(timeStampFilter.value) }
          : {}),
        projectId: projectId,
        ...tracesFilterRes.params,
        ...observationFilterRes.params,
        ...scoresFilterRes.params,
        ...search.params,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "tracing",
        type: "traces-table",
        projectId,
      },
    });

    // Post-process Doris results to match ClickHouse format
    if (select === "metrics") {
      const processedRes = (res as unknown as DorisMetricsReturnType[]).map(row => {
        // Helper function to parse details fields (usage_details, cost_details)
        const parseDetails = (details: string | Record<string, number> | null): Record<string, number> => {
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
              logger.warn('Failed to parse details JSON:', { error, rawValue: trimmed.substring(0, 100) });
              return {};
            }
          }
          
          return {};
        };

        // Convert Doris string array format to ClickHouse object array format
        const parsedScoresAvg: Array<{ name: string; avg_value: number }> = [];
        
        // Handle scores_avg - could be string or array
        let scoresAvgArray: string[] = [];
        if (typeof row.scores_avg === 'string') {
          try {
            scoresAvgArray = JSON.parse(row.scores_avg);
          } catch {
            scoresAvgArray = [];
          }
        } else if (Array.isArray(row.scores_avg)) {
          scoresAvgArray = row.scores_avg;
        }
        
        scoresAvgArray
          .filter(s => s && s.includes(':'))
          .forEach(scoreStr => {
            const [name, value] = scoreStr.split(':');
            if (name && value) {
              parsedScoresAvg.push({
                name: name,
                avg_value: parseFloat(value) || 0
              });
            }
          });

        // Handle score_categories - could be string or array
        let scoreCategoriesArray: string[] = [];
        if (typeof row.score_categories === 'string') {
          try {
            scoreCategoriesArray = JSON.parse(row.score_categories);
          } catch {
            scoreCategoriesArray = [];
          }
        } else if (Array.isArray(row.score_categories)) {
          scoreCategoriesArray = row.score_categories;
        }

        // Return row with ClickHouse-compatible format
        return {
          ...row,
          scores_avg: parsedScoresAvg,
          score_categories: scoreCategoriesArray,
          usage_details: parseDetails(row.usage_details),
          cost_details: parseDetails(row.cost_details)
        } as TracesTableMetricsClickhouseReturnType;
      });

      return processedRes as Array<SelectReturnTypeMap[keyof SelectReturnTypeMap]>;
    }

    // Post-process Doris results for rows to ensure tags field is properly formatted as array
    if (select === "rows") {
      const processedRes = (res as unknown as TracesTableReturnType[]).map(row => {
        // Ensure tags is always an array
        let processedTags: string[] = [];
        
        if (Array.isArray(row.tags)) {
          processedTags = row.tags;
        } else if (typeof row.tags === 'string') {
          try {
            // Try to parse as JSON array
            const parsed = JSON.parse(row.tags);
            processedTags = Array.isArray(parsed) ? parsed : [row.tags];
          } catch {
            // If parsing fails, treat as single tag
            processedTags = row.tags ? [row.tags] : [];
          }
        } else if (row.tags == null) {
          processedTags = [];
        } else {
          // Convert any other type to empty array
          processedTags = [];
        }
        
        return {
          ...row,
          tags: processedTags
        } as TracesTableReturnType;
      });

      return processedRes as Array<SelectReturnTypeMap[keyof SelectReturnTypeMap]>;
    }

    return res;
  }

  // Original ClickHouse implementation continues below...
  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const traceIdFilter = tracesFilter.find(
    (f) => f.table === "traces" && f.field === "id",
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
    tracesFilter.find((f) => f.table === "scores") !== undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "scores";

  const requiresObservationsJoin =
    tracesFilter.find((f) => f.table === "observations") !==
      undefined ||
    tracesTableUiColumnDefinitions.find(
      (c) =>
        c.uiTableName === orderBy?.column || c.uiTableId === orderBy?.column,
    )?.clickhouseTableName === "observations";

  const tracesFilterRes = tracesFilter.apply();
  const scoresFilterRes = scoresFilter.apply();
  const observationFilterRes = observationsFilter.apply();

  const search = clickhouseSearchCondition(searchQuery, searchType);

  const defaultOrder = orderBy?.order && orderBy?.column === "timestamp";
  const orderByCols = [
    ...tracesTableUiColumnDefinitions,
    {
      clickhouseSelect: "toDate(t.timestamp)",
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
  const chOrderBy = orderByToClickhouseSql(
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

  // complex query ahead:
  // - we only join scores and observations if we really need them to speed up default views
  // - we use FINAL on traces only in case we not need to order by something different than time. Otherwise we cannot guarantee correct reads.
  // - we filter the observations and scores as much as possible before joining them to traces.
  // - we order by todate(timestamp), event_ts desc per default and do not use FINAL.
  //   In this case, CH is able to read the data only from the latest date from disk and filtering them in memory. No need to read all data e.g. for 1 month from disk.

  const query = `
    WITH observations_stats AS (
      SELECT
        COUNT(*) AS observation_count,
          sumMap(usage_details) as usage_details,
          SUM(total_cost) AS total_cost,
          date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
          countIf(level = 'ERROR') as error_count,
          countIf(level = 'WARNING') as warning_count,
          countIf(level = 'DEFAULT') as default_count,
          countIf(level = 'DEBUG') as debug_count,
          multiIf(
            arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
            arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
            arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
            'DEBUG'
          ) AS aggregated_level,
          sumMap(cost_details) as cost_details,
          trace_id,
          project_id
      FROM observations o FINAL 
      WHERE o.project_id = {projectId: String}
      ${timeStampFilter ? `AND o.start_time >= {traceTimestamp: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
      ${observationsFilter ? `AND ${observationFilterRes.query}` : ""}
      GROUP BY trace_id, project_id
    ),
    scores_avg AS (
      SELECT
        project_id,
        trace_id,
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
          trace_id,
          name,
          data_type,
          string_value,
          avg(value) as avg_value
        FROM scores s FINAL 
        WHERE 
          project_id = {projectId: String}
          ${timeStampFilter ? `AND s.timestamp >= {traceTimestamp: DateTime64(3)} - ${SCORE_TO_TRACE_OBSERVATIONS_INTERVAL}` : ""}
          ${scoresFilterRes ? `AND ${scoresFilterRes.query}` : ""}
        GROUP BY 
          project_id,
          trace_id,
          name,
          data_type,
          string_value
      ) tmp
      GROUP BY project_id, trace_id
    )
    SELECT ${sqlSelect}
    -- FINAL is used for non default ordering and count.
    FROM traces t  ${["metrics", "rows", "identifiers"].includes(select) && defaultOrder ? "" : "FINAL"}
    ${select === "metrics" || requiresObservationsJoin ? `LEFT JOIN observations_stats os on os.project_id = t.project_id and os.trace_id = t.id` : ""}
    ${select === "metrics" || requiresScoresJoin ? `LEFT JOIN scores_avg s on s.project_id = t.project_id and s.trace_id = t.id` : ""}
    WHERE t.project_id = {projectId: String}
    ${tracesFilterRes ? `AND ${tracesFilterRes.query}` : ""}
    ${search.query}
    ${chOrderBy}
    -- This is used for metrics and row queries. Count has only one result.
    -- This is only used for default ordering. Otherwise, we use final.
    ${["metrics", "rows", "identifiers"].includes(select) && defaultOrder ? "LIMIT 1 BY id, project_id" : ""}
    ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const res = await queryClickhouse<
    SelectReturnTypeMap[keyof SelectReturnTypeMap]
  >({
    query: query,
    params: {
      limit: limit,
      offset: limit && page ? limit * page : 0,
      traceTimestamp: timeStampFilter?.value.getTime(),
      projectId: projectId,
      ...tracesFilterRes.params,
      ...observationFilterRes.params,
      ...scoresFilterRes.params,
      ...search.params,
    },
    tags: {
      ...(props.tags ?? {}),
      feature: "tracing",
      type: "traces-table",
      projectId,
    },
    clickhouseConfigs,
  });

  return res;
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
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
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
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const {
    projectId,
    filter,
    searchQuery,
    searchType,
    orderBy,
    limit,
    page,
    clickhouseConfigs,
  } = p;
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
    clickhouseConfigs,
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
  clickhouseConfigs?: ClickHouseClientConfigOptions | undefined;
}) => {
  const {
    projectId,
    filter,
    searchQuery,
    searchType,
    orderBy,
    limit,
    page,
    clickhouseConfigs,
  } = props;
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
    clickhouseConfigs,
  });

  return identifiers.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    // Handle timestamp format differences between ClickHouse (string) and Doris (Date object)
    // Use type assertion since TypeScript doesn't know the runtime type can be Date | string
    timestamp: (row.timestamp as unknown) instanceof Date 
      ? (row.timestamp as unknown as Date)
      : parseClickhouseUTCDateTimeFormat(row.timestamp),
  }));
};
