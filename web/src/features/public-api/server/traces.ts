import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  orderByToClickhouseSql,
  type DateTimeFilter,
  convertClickhouseToDomain,
  type TraceRecordReadType,
} from "@langfuse/shared/src/server";
import { type OrderByState } from "@langfuse/shared";
import { snakeCase } from "lodash";

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
};

export const generateTracesForPublicApi = async ({
  props,
  orderBy,
}: {
  props: TraceQueryType;
  orderBy: OrderByState;
}) => {
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
    WITH observation_stats AS (
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
    ), score_stats AS (
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
    )

    SELECT
      t.id as id,
      CONCAT('/project/', t.project_id, '/traces/', t.id) as "htmlPath",
      t.project_id as project_id,
      t.timestamp as timestamp,
      t.name as name,
      t.environment as environment,
      t.input as input,
      t.output as output,
      t.session_id as session_id,
      t.metadata as metadata,
      t.user_id as user_id,
      t.release as release,
      t.version as version,
      t.bookmarked as bookmarked,
      t.public as public,
      t.tags as tags,
      t.created_at as created_at,
      t.updated_at as updated_at,
      s.score_ids as scores,
      o.observation_ids as observations,
      COALESCE(o.latency_milliseconds / 1000, 0) as latency,
      COALESCE(o.total_cost, 0) as totalCost
    FROM traces t ${shouldUseSkipIndexes ? "" : "FINAL"}
    LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id
    LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id
    WHERE t.project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
    ${chOrderBy}
    ${shouldUseSkipIndexes ? "LIMIT 1 by t.id, t.project_id" : ""}
    ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const result = await queryClickhouse<
    TraceRecordReadType & {
      observations: string[];
      scores: string[];
      totalCost: number;
      latency: number;
      htmlPath: string;
    }
  >({
    query,
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
  });

  return result.map((trace) => ({
    ...convertClickhouseToDomain(trace),
    observations: trace.observations,
    scores: trace.scores,
    totalCost: trace.totalCost,
    latency: trace.latency,
    htmlPath: trace.htmlPath,
  }));
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
