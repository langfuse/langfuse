import { convertApiProvidedFilterToClickhouseFilter } from "@/src/features/public-api/server/filter-builder";
import {
  convertDateToClickhouseDateTime,
  queryClickhouse,
  TRACE_TO_OBSERVATIONS_INTERVAL,
  orderByToClickhouseSql,
  type DateTimeFilter,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouseStream,
} from "@langfuse/shared/src/server";
import {
  convertRecordToJsonSchema,
  type OrderByState,
  type Trace,
} from "@langfuse/shared";
import { snakeCase } from "lodash";
import { type JsonValue } from "@prisma/client/runtime/binary";

type QueryType = {
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
  fromTimestamp?: string;
  toTimestamp?: string;
};

export const generateTracesForPublicApi = async (
  props: QueryType,
  orderBy: OrderByState,
) => {
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

  const chOrderBy = orderBy
    ? orderByToClickhouseSql(orderBy, orderByColumns)
    : "ORDER BY t.timestamp desc";

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
      GROUP BY project_id, trace_id
    ), score_stats AS (
      SELECT
        trace_id,
        project_id,
        groupArray(id) as score_ids
      FROM scores FINAL
      WHERE project_id = {projectId: String}
      ${timeFilter ? `AND timestamp >= {cteTimeFilter: DateTime64(3)}` : ""}
      GROUP BY project_id, trace_id
    )

    SELECT
      t.id as id,
      CONCAT('/project/', t.project_id, '/traces/', t.id) as "htmlPath",
      t.project_id as projectId,
      t.timestamp as timestamp,
      t.name as name,
      t.input as input,
      t.output as output,
      null as externalId,
      t.session_id as sessionId,
      t.metadata as metadata,
      t.user_id as userId,
      t.release as release,
      t.version as version,
      t.bookmarked as bookmarked,
      t.public as public,
      t.tags as tags,
      t.created_at as createdAt,
      t.updated_at as updatedAt,
      s.score_ids as scores,
      o.observation_ids as observations,
      COALESCE(o.latency_milliseconds / 1000, 0) as latency,
      COALESCE(o.total_cost, 0) as totalCost
    FROM traces t
    LEFT JOIN score_stats s ON t.id = s.trace_id AND t.project_id = s.project_id
    LEFT JOIN observation_stats o ON t.id = o.trace_id AND t.project_id = o.project_id
    WHERE t.project_id = {projectId: String}
    ${filter.length() > 0 ? `AND ${appliedFilter.query}` : ""}
    ${chOrderBy}
    LIMIT 1 by t.id, t.project_id
    ${props.limit !== undefined && props.page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
  `;

  const asyncGenerator = queryClickhouseStream<
    Trace & {
      observations: string[];
      scores: string[];
      totalCost: number;
      latency: number;
      htmlPath: string;
    }
  >({
    query,
    params: {
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

  const result: Array<
    Trace & {
      observations: string[];
      scores: string[];
      totalCost: number;
      latency: number;
      htmlPath: string;
    }
  > = [];
  for await (const row of asyncGenerator) {
    result.push(row);
  }

  return result.map((trace) => ({
    ...trace,
    timestamp: parseClickhouseUTCDateTimeFormat(trace.timestamp.toString()),
    createdAt: parseClickhouseUTCDateTimeFormat(trace.createdAt.toString()),
    updatedAt: parseClickhouseUTCDateTimeFormat(trace.updatedAt.toString()),
    // Parse metadata values to JSON and make TypeScript happy
    metadata: convertRecordToJsonSchema(
      (trace.metadata as Record<string, string>) || {},
    ) as JsonValue,
  }));
};

export const getTracesCountForPublicApi = async (props: QueryType) => {
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
