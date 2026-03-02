import {
  TRACE_TO_OBSERVATIONS_INTERVAL,
  orderByToClickhouseSql,
  type DateTimeFilter,
  convertClickhouseTracesListToDomain,
  type TraceRecordReadType,
  measureAndReturn,
  deriveFilters,
  createPublicApiTracesColumnMapping,
  tracesTableUiColumnDefinitions,
  shouldSkipObservationsFinal,
} from "@langfuse/shared/src/server";
import {
  DatabaseAdapterFactory,
  convertFilterParamsToPositional,
  convertDateToDateTime,
} from "@langfuse/shared/src/server";
import { AGGREGATABLE_SCORE_TYPES, type OrderByState } from "@langfuse/shared";
import {
  TRACE_FIELD_GROUPS,
  type TraceFieldGroup,
} from "@/src/features/public-api/types/traces";
import { env } from "@/src/env.mjs";

import type { FilterState } from "@langfuse/shared";
import snakeCase from "lodash/snakeCase";

export type TraceQueryType = {
  page: number;
  limit: number;
  projectId: string;
  traceId?: string;
  userId?: string;
  name?: string;
  type?: string;
  sessionId?: string;
  version?: string;
  release?: string;
  tags?: string | string[];
  environment?: string | string[];
  fromTimestamp?: string;
  toTimestamp?: string;
  fields?: TraceFieldGroup[];
  useEventsTable?: boolean | null;
};

async function buildTracesBaseQuery(
  props: TraceQueryType,
  select:
    | {
        includeObservations: boolean;
        includeIO: boolean;
        includeMetrics: boolean;
        includeScores: boolean;
        count: false;
      }
    | {
        includeObservations: false;
        includeIO: false;
        includeMetrics: false;
        includeScores: false;
        count: true;
      },
  advancedFilters?: FilterState,
  orderBy?: OrderByState,
): Promise<{
  query: string;
  params: Record<string, any>;
  fromTimeFilter?: DateTimeFilter | undefined;
}> {
  // ClickHouse query optimizations for List Traces API
  const disableObservationsFinal = await shouldSkipObservationsFinal(
    props.projectId,
  );
  const propagateObservationsTimeBounds =
    env.LANGFUSE_API_CLICKHOUSE_PROPAGATE_OBSERVATIONS_TIME_BOUNDS === "true";

  let filter = deriveFilters(
    props,
    filterParams,
    advancedFilters,
    tracesTableUiColumnDefinitions,
  );
  const appliedFilter = filter.apply();

  const fromTimeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;
  const toTimeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === "<=" || f.operator === "<"),
  ) as DateTimeFilter | undefined;

  // We need to drop the clickhousePrefix here to make the filter work for the observations and scores tables.
  const environmentFilter = filter
    .filter((f) => f.field === "environment")
    .map((f) => {
      f.tablePrefix = undefined;
      return f;
    });
  const appliedEnvironmentFilter = environmentFilter.apply();

  // This _must_ be updated if we add a new skip index column to the traces table.
  // Otherwise, we will ignore it in most cases due to `FINAL`.
  const shouldUseSkipIndexes = filter.some(
    (f) =>
      f.clickhouseTable === "traces" &&
      ["user_id", "session_id", "metadata"].some((skipIndexCol) =>
        f.field.includes(skipIndexCol),
      ),
  );

  // Check if any filters reference the observations or scores tables
  const filtersNeedObservations = filter.some(
    (f) => f.clickhouseTable === "observations",
  );
  const filtersNeedScores = filter.some((f) => f.clickhouseTable === "scores");

  // Build CTEs conditionally based on requested fields OR filters (OceanBase/MySQL)
  const ctes: string[] = [];

  if (
    select.includeObservations ||
    select.includeMetrics ||
    filtersNeedObservations
  ) {
    const includeMetricsInCTE =
      select.includeMetrics || filtersNeedObservations;
    const envFilterObs =
      environmentFilter.length() > 0
        ? appliedEnvironmentFilter.query.replace(
            /\benvironment\b/g,
            "o.environment",
          )
        : "";
    ctes.push(`
    obs_dedup AS (
      SELECT o.*, ROW_NUMBER() OVER (PARTITION BY o.id, o.project_id ORDER BY o.start_time DESC) as rn
      FROM observations o
      WHERE o.project_id = {projectId: String}
      ${fromTimeFilter ? `AND o.start_time >= DATE_SUB({cteFromTimeFilter: String}, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
      ${toTimeFilter && propagateObservationsTimeBounds ? `AND o.start_time <= DATE_ADD({cteToTimeFilter: String}, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
      ${toTimeFilter && propagateObservationsTimeBounds ? `AND COALESCE(o.end_time, o.start_time) <= DATE_ADD({cteToTimeFilter: String}, ${TRACE_TO_OBSERVATIONS_INTERVAL})` : ""}
      ${envFilterObs ? `AND ${envFilterObs}` : ""}
    ),
    observation_stats AS (
      SELECT
        trace_id,
        project_id,
        ${includeMetricsInCTE ? "SUM(total_cost) as total_cost, TIMESTAMPDIFF(MICROSECOND, LEAST(MIN(start_time), MIN(COALESCE(end_time, start_time))), GREATEST(MAX(start_time), MAX(COALESCE(end_time, start_time)))) / 1000 as latency_milliseconds," : ""}
        CASE WHEN SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) > 0 THEN 'ERROR' WHEN SUM(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) > 0 THEN 'WARNING' WHEN SUM(CASE WHEN level = 'DEFAULT' THEN 1 ELSE 0 END) > 0 THEN 'DEFAULT' ELSE 'DEBUG' END AS aggregated_level,
        SUM(CASE WHEN level = 'WARNING' THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN level = 'ERROR' THEN 1 ELSE 0 END) as error_count,
        SUM(CASE WHEN level = 'DEFAULT' THEN 1 ELSE 0 END) as default_count,
        SUM(CASE WHEN level = 'DEBUG' THEN 1 ELSE 0 END) as debug_count,
        GROUP_CONCAT(id) as observation_ids
      FROM obs_dedup
      WHERE rn = 1
      GROUP BY project_id, trace_id
    )`);
  }

  if (select.includeScores || filtersNeedScores) {
    const scoreEnvFilter =
      environmentFilter.length() > 0
        ? appliedEnvironmentFilter.query.replace(/\bs\./g, "s_inner.")
        : "";
    ctes.push(`
    score_dedup AS (
      SELECT s_inner.*, ROW_NUMBER() OVER (PARTITION BY s_inner.id, s_inner.project_id ORDER BY s_inner.timestamp DESC) as rn
      FROM scores s_inner
      WHERE s_inner.project_id = {projectId: String}
      AND s_inner.session_id IS NULL
      AND s_inner.dataset_run_id IS NULL
      AND s_inner.data_type IN ({dataTypes: Array(String)})
      ${fromTimeFilter ? `AND s_inner.timestamp >= {cteFromTimeFilter: String}` : ""}
      ${scoreEnvFilter ? `AND ${scoreEnvFilter}` : ""}
    ),
    score_stats AS (
      SELECT trace_id, project_id, GROUP_CONCAT(DISTINCT id) as score_ids
      FROM score_dedup
      WHERE rn = 1
      GROUP BY project_id, trace_id
    )`);
  }

  const withClause = ctes.length > 0 ? `WITH ${ctes.join(", ")}` : "";

  // If user provides an order we prefer it or fallback to timestamp as the default.
  // In both cases we append a t.event_ts desc order to pick the latest event in case of duplicates
  // if we want to use a skip index.
  // This may still return stale information if the orderBy key was updated between traces or if a filter
  // applies only to a stale value.
  const chOrderBy =
    (orderByToClickhouseSql(orderBy || [], orderByColumns) ||
      "ORDER BY t.timestamp DESC") +
    (shouldUseSkipIndexes ? ", t.event_ts DESC" : "");

  // OceanBase: use subquery with ROW_NUMBER() for dedup when skip indexes would require LIMIT 1 BY in CH
  const tracesFrom = shouldUseSkipIndexes
    ? `(SELECT t_inner.*, ROW_NUMBER() OVER (PARTITION BY t_inner.id, t_inner.project_id ORDER BY t_inner.event_ts DESC) as rn FROM traces t_inner) t
  ${select.includeObservations || select.includeMetrics || filtersNeedObservations ? "LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
  ${select.includeScores || filtersNeedScores ? "LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
  WHERE t.rn = 1 AND t.project_id = {projectId: String}
  ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}`
    : `traces t
  ${select.includeObservations || select.includeMetrics || filtersNeedObservations ? "LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
  ${select.includeScores || filtersNeedScores ? "LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
  WHERE t.project_id = {projectId: String}
  ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}`;

  const queryMiddle = `
  FROM ${tracesFrom}
  `;

  const query = select.count
    ? `${withClause}
  	SELECT COUNT(*) as count
   	${queryMiddle}
  `
    : `
    ${withClause}
    SELECT
      t.id as id,
      CONCAT('/project/', t.project_id, '/traces/', t.id) as htmlPath,
      t.project_id as project_id,
      t.timestamp as timestamp,
      t.name as name,
      t.environment as environment,
      t.session_id as session_id,
      t.user_id as user_id,
      t.release as release,
      t.version as version,
      t.bookmarked as bookmarked,
      t.public as public,
      t.tags as tags,
      t.created_at as created_at,
      t.updated_at as updated_at
      ${select.includeIO ? ", t.input as input, t.output as output, t.metadata as metadata" : ""}
      ${select.includeScores ? ", s.score_ids as scores" : ""}
      ${select.includeObservations ? ", o.observation_ids as observations" : ""}
      ${select.includeMetrics ? ", COALESCE(o.latency_milliseconds / 1000, 0) as latency, COALESCE(o.total_cost, 0) as totalCost" : ""}
    ${queryMiddle}
    ${chOrderBy}
    ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const params = {
    ...appliedEnvironmentFilter.params,
    ...appliedFilter.params,
    projectId: props.projectId,
    dataTypes: AGGREGATABLE_SCORE_TYPES,
    ...(props.limit !== undefined ? { limit: props.limit } : {}),
    ...(props.page !== undefined
      ? { offset: (props.page - 1) * props.limit }
      : {}),
    ...(fromTimeFilter
      ? { cteFromTimeFilter: convertDateToDateTime(fromTimeFilter.value) }
      : {}),
    ...(toTimeFilter && propagateObservationsTimeBounds
      ? { cteToTimeFilter: convertDateToDateTime(toTimeFilter.value) }
      : {}),
  };

  return { query, params, fromTimeFilter };
}

export const generateTracesForPublicApi = async ({
  props,
  advancedFilters,
  orderBy,
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
  orderBy: OrderByState;
}) => {
  const requestedFields = props.fields ?? TRACE_FIELD_GROUPS;
  const includeIO = requestedFields.includes("io");
  const includeScores = requestedFields.includes("scores");
  const includeObservations = requestedFields.includes("observations");
  const includeMetrics = requestedFields.includes("metrics");

  const { query, params, fromTimeFilter } = await buildTracesBaseQuery(
    props,
    {
      includeIO,
      includeObservations,
      includeMetrics,
      includeScores,
      count: false,
    },
    advancedFilters,
    orderBy,
  );
  const adapter = DatabaseAdapterFactory.getInstance();
  const result = await measureAndReturn({
    operationName: "getTracesForPublicApi",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "public-api",
        projectId: props.projectId,
        operation_name: "getTracesForPublicApi",
      },
      fromTimestamp: fromTimeFilter?.value ?? undefined,
    },
    fn: async (input) => {
      const { query: obQuery, params: obParams } =
        convertFilterParamsToPositional(query, input.params);
      const rows = await adapter.queryWithOptions<
        TraceRecordReadType & {
          observations?: string[] | string;
          scores?: string[] | string;
          totalCost?: number;
          latency?: number;
          htmlPath: string;
        }
      >({
        query: obQuery,
        params: obParams,
        tags: input.tags,
      });
      // Normalize GROUP_CONCAT results (comma-separated string) to array for converter
      return rows.map((row) => ({
        ...row,
        observations:
          typeof row.observations === "string"
            ? row.observations
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : (row.observations ?? []),
        scores:
          typeof row.scores === "string"
            ? row.scores
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
            : (row.scores ?? []),
      }));
    },
  });

  return convertClickhouseTracesListToDomain(result, {
    metrics: includeMetrics,
    scores: includeScores,
    observations: includeObservations,
  });
};

export const getTracesCountForPublicApi = async ({
  props,
  advancedFilters,
}: {
  props: TraceQueryType;
  advancedFilters?: FilterState;
}) => {
  let filter = deriveFilters(
    props,
    filterParams,
    advancedFilters,
    tracesTableUiColumnDefinitions,
  );
  const appliedFilter = filter.apply();

  let query = `
    SELECT COUNT(*) as count
    FROM traces t
    WHERE t.project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  let params: Record<string, unknown> = {
    ...appliedFilter.params,
    projectId: props.projectId,
  };

  if (advancedFilters !== undefined && advancedFilters.length > 0) {
    ({ query, params } = await buildTracesBaseQuery(
      props,
      {
        includeObservations: false,
        includeIO: false,
        includeMetrics: false,
        includeScores: false,
        count: true,
      },
      advancedFilters,
    ));
  }

  const timestamp = props.fromTimestamp
    ? new Date(props.fromTimestamp)
    : undefined;

  const adapter = DatabaseAdapterFactory.getInstance();
  return measureAndReturn({
    operationName: "getTracesCountForPublicApi",
    projectId: props.projectId,
    input: {
      params,
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "count",
        projectId: props.projectId,
        operation_name: "getTracesCountForPublicApi",
      },
      timestamp,
    },
    fn: async (input) => {
      const { query: obQuery, params: obParams } =
        convertFilterParamsToPositional(query, input.params);
      const records = await adapter.queryWithOptions<{
        count: string | number;
      }>({
        query: obQuery,
        params: obParams,
        tags: input.tags,
      });
      const val = records[0]?.count;
      return val != null ? Number(val) : undefined;
    },
  });
};

const orderByColumns = [
  "id",
  "timestamp",
  "name",
  "userId",
  "release",
  "version",
  "public",
  "bookmarked",
  "sessionId",
].map((name) => ({
  uiTableName: name,
  uiTableId: name,
  clickhouseTableName: "traces",
  clickhouseSelect: snakeCase(name),
  queryPrefix: "t",
}));

// Use factory functions to create column mappings (eliminates duplication with events table)
const filterParams = createPublicApiTracesColumnMapping("traces", "t");
