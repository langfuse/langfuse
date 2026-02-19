import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  orderByToClickhouseSql,
  type DateTimeFilter,
  convertClickhouseTracesListToDomainAsync,
  type TraceRecordReadType,
  measureAndReturn,
  deriveFilters,
  createPublicApiTracesColumnMapping,
  tracesTableUiColumnDefinitions,
  shouldSkipObservationsFinal,
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

  // Check if filters specifically reference score aggregation columns
  const hasScoreAggregationFilters = filter.some(
    (f) => f.field === "s.scores_avg" || f.field === "s.score_categories",
  );

  // Build CTEs conditionally based on requested fields OR filters
  const ctes = [];

  if (
    select.includeObservations ||
    select.includeMetrics ||
    filtersNeedObservations
  ) {
    // Conditionally add FINAL based on env var and whether metrics are requested
    const shouldUseFinal =
      (select.includeMetrics || filtersNeedObservations) &&
      !disableObservationsFinal;

    // Include metrics in CTE if requested OR if filters need them
    const includeMetricsInCTE =
      select.includeMetrics || filtersNeedObservations;

    ctes.push(`
    observation_stats AS (
      SELECT
        trace_id,
        project_id,
        ${includeMetricsInCTE ? "sum(total_cost) as total_cost, date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds, " : ""}
        sumMap(usage_details) as usage_details,
        sumMap(cost_details) as cost_details,
        multiIf(arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR', arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING', arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT', 'DEBUG') AS aggregated_level,
        countIf(level = 'WARNING') as warning_count,
        countIf(level = 'ERROR') as error_count,
        countIf(level = 'DEFAULT') as default_count,
        countIf(level = 'DEBUG') as debug_count,
        groupUniqArray(id) as observation_ids
      FROM observations ${shouldUseFinal ? "FINAL" : ""}
      WHERE project_id = {projectId: String}
      ${fromTimeFilter ? `AND start_time >= {cteFromTimeFilter: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      ${toTimeFilter && propagateObservationsTimeBounds ? `AND start_time <= {cteToTimeFilter: DateTime64(3)} + ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      ${toTimeFilter && propagateObservationsTimeBounds ? `AND end_time <= {cteToTimeFilter: DateTime64(3)} + ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      ${environmentFilter.length() > 0 ? `AND ${appliedEnvironmentFilter.query}` : ""}
      GROUP BY project_id, trace_id
    )`);
  }

  if (select.includeScores || filtersNeedScores) {
    // Use nested structure with pre-aggregation when score filters are present
    // This ensures proper avg() computation and enables array filtering
    if (hasScoreAggregationFilters) {
      ctes.push(`
    score_stats AS (
      SELECT
        trace_id,
        project_id,
        groupUniqArray(id) as score_ids,
        groupArrayIf(tuple(name, avg_value), data_type IN ('NUMERIC', 'BOOLEAN')) AS scores_avg,
        groupArrayIf(concat(name, ':', string_value), data_type = 'CATEGORICAL' AND notEmpty(string_value)) AS score_categories
      FROM (
        SELECT
          project_id,
          trace_id,
          id,
          name,
          data_type,
          string_value,
          avg(value) as avg_value
        FROM scores FINAL
        WHERE project_id = {projectId: String}
        AND session_id IS NULL
        AND dataset_run_id IS NULL
        AND data_type IN ({dataTypes: Array(String)})
        ${fromTimeFilter ? `AND timestamp >= {cteFromTimeFilter: DateTime64(3)}` : ""}
        ${environmentFilter.length() > 0 ? `AND ${appliedEnvironmentFilter.query}` : ""}
        GROUP BY
          project_id,
          trace_id,
          id,
          name,
          data_type,
          string_value
      ) tmp
      GROUP BY project_id, trace_id
    )`);
    } else {
      // Use flat structure when no score filters present (backward compatible, better performance)
      ctes.push(`
    score_stats AS (
      SELECT
        trace_id,
        project_id,
        groupUniqArray(id) as score_ids,
        groupArrayIf(tuple(name, value), data_type IN ('NUMERIC', 'BOOLEAN')) as scores_avg,
        groupArrayIf(concat(name, ':', string_value), data_type = 'CATEGORICAL') as score_categories
      FROM scores
      WHERE project_id = {projectId: String}
      AND session_id IS NULL
      AND dataset_run_id IS NULL
      AND data_type IN ({dataTypes: Array(String)})
      ${fromTimeFilter ? `AND timestamp >= {cteFromTimeFilter: DateTime64(3)}` : ""}
      ${environmentFilter.length() > 0 ? `AND ${appliedEnvironmentFilter.query}` : ""}
      GROUP BY project_id, trace_id
    )`);
    }
  }

  const withClause = ctes.length > 0 ? `WITH ${ctes.join(", ")}` : "";

  // If user provides an order we prefer it or fallback to timestamp as the default.
  // In both cases we append a t.event_ts desc order to pick the latest event in case of duplicates
  // if we want to use a skip index.
  // This may still return stale information if the orderBy key was updated between traces or if a filter
  // applies only to a stale value.
  const chOrderBy =
    (orderByToClickhouseSql(orderBy || [], orderByColumns) ||
      "ORDER BY t.timestamp desc") +
    (shouldUseSkipIndexes ? ", t.event_ts desc" : "");

  const queryMiddle = `
  FROM traces t ${shouldUseSkipIndexes ? "" : "FINAL"}
  ${select.includeObservations || select.includeMetrics || filtersNeedObservations ? "LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
  ${select.includeScores || filtersNeedScores ? "LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
  WHERE t.project_id = {projectId: String}
  ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  const query = select.count
    ? `${withClause}
  	SELECT count() as count
   	${queryMiddle}
  `
    : `
    ${withClause}

    SELECT
      -- Core fields (always included)
      t.id as id,
      CONCAT('/project/', t.project_id, '/traces/', t.id) as "htmlPath",
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
      -- IO fields (conditional)
      ${select.includeIO ? ", t.input as input, t.output as output, t.metadata as metadata" : ""}
      -- Scores (conditional)
      ${select.includeScores ? ", s.score_ids as scores" : ""}
      -- Observations (conditional)
      ${select.includeObservations ? ", o.observation_ids as observations" : ""}
      -- Metrics (conditional)
      ${select.includeMetrics ? ", COALESCE(o.latency_milliseconds / 1000, 0) as latency, COALESCE(o.total_cost, 0) as totalCost" : ""}
    ${queryMiddle}
    ${chOrderBy}
    ${shouldUseSkipIndexes ? "LIMIT 1 by t.id, t.project_id" : ""}
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
      ? {
          cteFromTimeFilter: convertDateToClickhouseDateTime(
            fromTimeFilter.value,
          ),
        }
      : {}),
    ...(toTimeFilter && propagateObservationsTimeBounds
      ? {
          cteToTimeFilter: convertDateToClickhouseDateTime(toTimeFilter.value),
        }
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
      preferredClickhouseService: "ReadOnly",
    },
    fn: (input) => {
      return queryClickhouse<
        TraceRecordReadType & {
          observations?: string[];
          scores?: string[];
          totalCost?: number;
          latency?: number;
          htmlPath: string;
        }
      >({
        query,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
    },
  });

  return convertClickhouseTracesListToDomainAsync(result, {
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
    SELECT count() as count
    FROM __TRACE_TABLE__ t
    WHERE project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  let params: Record<string, any> = {
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
      const records = await queryClickhouse<{ count: string }>({
        query: query.replace("__TRACE_TABLE__", "traces"),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return records.map((record) => Number(record.count)).shift();
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
