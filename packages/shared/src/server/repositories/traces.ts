import {
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
} from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";
import { ObservationLevel, Trace } from "@prisma/client";
import { FilterState } from "../../types";
import { logger } from "../logger";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";
import { TraceRecordReadType } from "./definitions";
import { tracesTableUiColumnDefinitions } from "../../tableDefinitions/mapTracesTable";
import { TableCount } from "./types";

const convertClickhouseToDomain = (record: TraceRecordReadType): Trace => {
  return {
    id: record.id,
    projectId: record.project_id,
    name: record.name ?? null,
    timestamp: parseClickhouseUTCDateTimeFormat(record.timestamp),
    tags: record.tags,
    bookmarked: record.bookmarked,
    release: record.release ?? null,
    version: record.version ?? null,
    userId: record.user_id ?? null,
    sessionId: record.session_id ?? null,
    public: record.public,
    input: record.input ?? null,
    output: record.output ?? null,
    metadata: record.metadata,
    createdAt: parseClickhouseUTCDateTimeFormat(record.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(record.updated_at),
    externalId: null,
  };
};

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
  | "tags"
  | "metadata"
  | "public"
> & {
  level: ObservationLevel;
  observation_count: number | null;
  latency: string | null;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
};

export const getTracesTableCount = async (
  projectId: string,
  filter: FilterState,
  limit?: number,
  offset?: number,
) =>
  getTracesTableGeneric<TableCount>(
    "count(*) as count",
    projectId,
    filter,
    undefined,
    limit,
    offset,
  );

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  limit?: number,
  offset?: number,
) => {
  const rows = await getTracesTableGeneric<TracesTableReturnType>(
    `
    t.id, 
    t.project_id, 
    t.timestamp, 
    t.tags, 
    t.bookmarked, 
    t.name, 
    t.release, 
    t.version, 
    t.user_id, 
    t.session_id,
    os.latencyMs as latency,
    os.cost_details as cost_details,
    os.usage_details as usage_details,
    os.level as level,
    os.observation_count as observation_count,
    s.scores_avg as scores_avg,
    t.metadata,
    t.public`,
    projectId,
    filter,
    "ORDER BY t.timestamp desc",
    limit,
    offset,
  );

  return rows;
};

const getTracesTableGeneric = async <T>(
  select: string,
  projectId: string,
  filter: FilterState,
  orderBy?: string,
  limit?: number,
  offset?: number,
) => {
  logger.info(`input filter ${JSON.stringify(filter)}`);
  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  tracesFilter.push(
    ...createFilterFromFilterState(filter, tracesTableUiColumnDefinitions),
  );

  const tracesFilterRes = tracesFilter.apply();
  const scoresAvgFilterRes = scoresFilter.apply();
  const observationsStatsRes = observationsFilter.apply();

  const query = `
  WITH observations_stats AS (
  SELECT
    COUNT(*) AS observation_count,
      sumMap(usage_details) as usage_details,
      SUM(total_cost) AS total_cost,
      date_diff('seconds', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time))) as latencyMs,
      multiIf(
        arrayExists(x -> x = 'ERROR', groupArray(level)), 'ERROR',
        arrayExists(x -> x = 'WARNING', groupArray(level)), 'WARNING',
        arrayExists(x -> x = 'DEFAULT', groupArray(level)), 'DEFAULT',
        'DEBUG'
      ) AS level,
      sumMap(cost_details) as cost_details,
      trace_id,
      project_id
    FROM
        observations final
    WHERE ${observationsStatsRes.query}
    group by trace_id, project_id
),

         scores_avg AS (SELECT project_id,
                                trace_id,
                                groupArray(tuple(name, avg_value)) AS "scores_avg"
                          FROM (
                                  SELECT project_id,
                                          trace_id,
                                          name,
                                          avg(value) avg_value
                                  FROM scores final
                                  WHERE ${scoresAvgFilterRes.query}
                                  GROUP BY project_id,
                                            trace_id,
                                            name
                                  ) tmp
                          GROUP BY project_id,
                                  trace_id)
      select 
       ${select}
      from traces t final
              left join observations_stats os on os.project_id = t.project_id and os.trace_id = t.id
              left join scores_avg s on s.project_id = t.project_id and s.trace_id = t.id

      WHERE ${tracesFilterRes.query}
      ${orderBy ? orderBy : ""}
      ${limit !== undefined && offset !== undefined ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  return await queryClickhouse<T>({
    query: query,
    params: {
      limit: limit,
      offset: offset,
      ...tracesFilterRes.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
    },
  });
};

export const getTraceByIdOrThrow = async (
  traceId: string,
  projectId: string,
) => {
  const query = `SELECT * FROM traces where id = {traceId: String} and project_id = {projectId: String} order by event_ts desc LIMIT 1 by id, project_id`;
  const records = await queryClickhouse<TraceRecordReadType>({
    query,
    params: { traceId, projectId },
  });

  const res = records.map(convertClickhouseToDomain);

  if (res.length !== 1) {
    const errorMessage = `Trace not found or multiple traces found for traceId: ${traceId}, projectId: ${projectId}`;
    logger.error(errorMessage);
    throw new Error(errorMessage);
  }
  return res[0] as Trace;
};

export const getTracesGroupedByName = async (
  projectId: string,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(
        timestampFilter,
        tracesTableUiColumnDefinitions,
      )
    : undefined;

  const timestampFilterRes = chFilter
    ? new FilterList(chFilter).apply()
    : undefined;

  const query = `
      select 
        name as value
      from traces t final
      WHERE t.project_id = {projectId: String}
      ${timestampFilterRes ? `AND ${timestampFilterRes.query}` : ""}
      GROUP BY name
      ORDER BY name desc
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    value: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
  });

  return rows;
};

export const getTracesGroupedByTags = async (
  projectId: string,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(
        timestampFilter,
        tracesTableUiColumnDefinitions,
      )
    : undefined;

  const timestampFilterRes = chFilter
    ? new FilterList(chFilter).apply()
    : undefined;

  const query = `
      select 
        distinct(arrayJoin(tags)) as value
      from traces t final
      WHERE t.project_id = {projectId: String}
      ${timestampFilterRes ? `AND ${timestampFilterRes.query}` : ""}
      LIMIT 1000;
    `;

  const rows = await queryClickhouse<{
    value: string;
  }>({
    query: query,
    params: {
      projectId: projectId,
      ...(timestampFilterRes ? timestampFilterRes.params : {}),
    },
  });

  return rows;
};
