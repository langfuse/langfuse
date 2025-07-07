import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  orderByToClickhouseSql,
  type DateTimeFilter,
  convertClickhouseToDomain,
  type TraceRecordReadType,
  getTimeframesTracesAMT,
  measureAndReturn,
} from "@langfuse/shared/src/server";
import { type OrderByState } from "@langfuse/shared";
import { snakeCase } from "lodash";
import {
  TRACE_FIELD_GROUPS,
  type TraceFieldGroup,
} from "@/src/features/public-api/types/traces";

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
};

export const generateTracesForPublicApi = async ({
  props,
  orderBy,
}: {
  props: TraceQueryType;
  orderBy: OrderByState;
}) => {
  const requestedFields = props.fields ?? TRACE_FIELD_GROUPS;
  const includeIO = requestedFields.includes("io");
  const includeScores = requestedFields.includes("scores");
  const includeObservations = requestedFields.includes("observations");
  const includeMetrics = requestedFields.includes("metrics");

  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  const appliedFilter = filter.apply();

  const timeFilter = filter.find(
    (f) =>
      f.clickhouseTable === "traces" &&
      f.field.includes("timestamp") &&
      (f.operator === ">=" || f.operator === ">"),
  ) as DateTimeFilter | undefined;

  const environmentFilter = filter.filter((f) => f.field === "environment");
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

  // Build CTEs conditionally based on requested fields
  const ctes = [];

  if (includeObservations || includeMetrics) {
    ctes.push(`
    observation_stats AS (
      SELECT
        trace_id,
        project_id,
        sum(total_cost) as total_cost,
        date_diff('millisecond', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latency_milliseconds,
        groupArray(id) as observation_ids
      FROM observations FINAL
      WHERE project_id = {projectId: String}
      ${timeFilter ? `AND start_time >= {cteTimeFilter: DateTime64(3)} - ${TRACE_TO_OBSERVATIONS_INTERVAL}` : ""}
      ${environmentFilter.length() > 0 ? `AND ${appliedEnvironmentFilter.query}` : ""}
      GROUP BY project_id, trace_id
    )`);
  }

  if (includeScores) {
    ctes.push(`
    score_stats AS (
      SELECT
        trace_id,
        project_id,
        groupUniqArray(id) as score_ids
      FROM scores
      WHERE project_id = {projectId: String}
      AND session_id IS NULL
      AND dataset_run_id IS NULL
      ${timeFilter ? `AND timestamp >= {cteTimeFilter: DateTime64(3)}` : ""}
      ${environmentFilter.length() > 0 ? `AND ${appliedEnvironmentFilter.query}` : ""}
      GROUP BY project_id, trace_id
    )`);
  }

  const withClause = ctes.length > 0 ? `WITH ${ctes.join(", ")}` : "";

  const result = await measureAndReturn({
    operationName: "getTracesForPublicApi",
    projectId: props.projectId,
    input: {
      params: {
        ...appliedEnvironmentFilter.params,
        ...appliedFilter.params,
        projectId: props.projectId,
        ...(props.limit !== undefined ? { limit: props.limit } : {}),
        ...(props.page !== undefined
          ? { offset: (props.page - 1) * props.limit }
          : {}),
        ...(timeFilter
          ? {
              cteTimeFilter: convertDateToClickhouseDateTime(timeFilter.value),
            }
          : {}),
      },
      tags: {
        feature: "tracing",
        type: "trace",
        kind: "public-api",
        projectId: props.projectId,
      },
      fromTimestamp: timeFilter?.value ?? undefined,
    },
    existingExecution: (input) => {
      // If user provides an order we prefer it or fallback to timestamp as the default.
      // In both cases we append a t.event_ts desc order to pick the latest event in case of duplicates
      // if we want to use a skip index.
      // This may still return stale information if the orderBy key was updated between traces or if a filter
      // applies only to a stale value.
      const chOrderBy =
        (orderByToClickhouseSql(orderBy || [], orderByColumns) ||
          "ORDER BY t.timestamp desc") +
        (shouldUseSkipIndexes ? ", t.event_ts desc" : "");

      const query = `
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
          ${includeIO ? ", t.input as input, t.output as output, t.metadata as metadata" : ""}
          -- Scores (conditional)
          ${includeScores ? ", s.score_ids as scores" : ""}
          -- Observations (conditional)
          ${includeObservations ? ", o.observation_ids as observations" : ""}
          -- Metrics (conditional)
          ${includeMetrics ? ", COALESCE(o.latency_milliseconds / 1000, 0) as latency, COALESCE(o.total_cost, 0) as totalCost" : ""}
        FROM traces t ${shouldUseSkipIndexes ? "" : "FINAL"}
        ${includeObservations || includeMetrics ? "LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
        ${includeScores ? "LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
        WHERE t.project_id = {projectId: String}
        ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
        ${chOrderBy}
        ${shouldUseSkipIndexes ? "LIMIT 1 by t.id, t.project_id" : ""}
        ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

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
      });
    },
    newExecution: (input) => {
      const tracesAmt = getTimeframesTracesAMT(input.fromTimestamp);

      // If user provides an order we prefer it or fallback to timestamp as the default.
      const chOrderBy =
        orderByToClickhouseSql(orderBy || [], orderByColumns) ||
        "ORDER BY t.start_time desc";

      const query = `
        ${withClause}
        
        SELECT
          -- Core fields (always included)
          t.id as id,
          CONCAT('/project/', t.project_id, '/traces/', t.id) as "htmlPath",
          t.project_id as project_id,
          t.start_time as timestamp,
          t.name as name,
          t.environment as environment,
          t.session_id as session_id,
          t.user_id as user_id,
          t.release as release,
          t.version as version,
          finalizeAggregation(t.bookmarked) as bookmarked,
          finalizeAggregation(t.public) as public,
          t.tags as tags,
          t.created_at as created_at,
          t.updated_at as updated_at
          -- IO fields (conditional)
          ${includeIO ? ", finalizeAggregation(t.input) as input, finalizeAggregation(t.output) as output, t.metadata as metadata" : ""}
          -- Scores (conditional)
          ${includeScores ? ", s.score_ids as scores" : ""}
          -- Observations (conditional)
          ${includeObservations ? ", o.observation_ids as observations" : ""}
          -- Metrics (conditional)
          ${includeMetrics ? ", COALESCE(o.latency_milliseconds / 1000, 0) as latency, COALESCE(o.total_cost, 0) as totalCost" : ""}
        FROM ${tracesAmt} t
        ${includeObservations || includeMetrics ? "LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id" : ""}
        ${includeScores ? "LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id" : ""}
        WHERE t.project_id = {projectId: String}
        ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
        ${chOrderBy}
        ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
      `;

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
      });
    },
  });

  return result.map((trace) => {
    return {
      ...convertClickhouseToDomain(trace),
      // Conditionally include additional fields based on request
      ...(includeObservations && { observations: trace.observations ?? null }),
      ...(includeScores && { scores: trace.scores ?? null }),
      ...(includeMetrics && {
        totalCost: trace.totalCost ?? null,
        latency: trace.latency ?? null,
      }),
      htmlPath: trace.htmlPath,
    };
  });
};

export const getTracesCountForPublicApi = async ({
  props,
}: {
  props: TraceQueryType;
}) => {
  const filter = convertApiProvidedFilterToClickhouseFilter(
    props,
    filterParams,
  );
  const appliedFilter = filter.apply();

  const query = `
    SELECT count() as count
    FROM traces t
    WHERE project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { ...appliedFilter.params, projectId: props.projectId },
  });
  return records.map((record) => Number(record.count)).shift();
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

const filterParams = [
  {
    id: "userId",
    clickhouseSelect: "user_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "name",
    clickhouseSelect: "name",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "tags",
    clickhouseSelect: "tags",
    filterType: "ArrayOptionsFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "sessionId",
    clickhouseSelect: "session_id",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "version",
    clickhouseSelect: "version",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "release",
    clickhouseSelect: "release",
    filterType: "StringFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "environment",
    clickhouseSelect: "environment",
    filterType: "StringOptionsFilter",
    clickhouseTable: "traces",
    // Skip the clickhousePrefix as this makes it work for all tables.
    // Risk: If there is a conflict we may have to start using separate filters for each table.
  },
  {
    id: "fromTimestamp",
    clickhouseSelect: "timestamp",
    operator: ">=" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
  {
    id: "toTimestamp",
    clickhouseSelect: "timestamp",
    operator: "<" as const,
    filterType: "DateTimeFilter",
    clickhouseTable: "traces",
    clickhousePrefix: "t",
  },
];
