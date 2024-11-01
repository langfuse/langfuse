import { TraceClickhouseRecord } from "../clickhouse/schema";
import { queryClickhouse } from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";
import { ObservationLevel } from "@prisma/client";
import { FilterState } from "../../types";
import { logger } from "../logger";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";

export type TracesTableReturnType = Pick<
  TraceClickhouseRecord,
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
  latency: number;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
};

export type TableCount = {
  count: number;
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
) =>
  getTracesTableGeneric<TracesTableReturnType>(
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

  tracesFilter.push(...createFilterFromFilterState(filter));

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
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<T>({
    query: query,
    params: {
      limit: limit,
      offset: offset,
      ...tracesFilterRes.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
    },
  });

  return rows;
};

export const getTraceById = async (traceId: string, projectId: string) => {
  const query = `SELECT * FROM traces where id = {traceId: String} and project_id = {projectId: String} order by event_ts desc LIMIT 1 by id, project_id`;
  const records = await queryClickhouse<TraceClickhouseRecord>({
    query,
    params: { traceId, projectId },
  });

  const res = records.map((record) => {
    return {
      id: record.id,
      projectId: record.project_id,
      name: record.name,
      timestamp: new Date(record.timestamp),
      tags: record.tags,
      bookmarked: record.bookmarked,
      release: record.release,
      version: record.version,
      userId: record.user_id,
      sessionId: record.session_id,
      public: record.public,
      input: record.input,
      output: record.output,
      metadata: record.metadata,
    };
  });

  return res.length ? res[0] : undefined;
};

export const getTracesGroupedByName = async (
  projectId: string,
  timestampFilter?: FilterState,
) => {
  const chFilter = timestampFilter
    ? createFilterFromFilterState(timestampFilter)
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
    ? createFilterFromFilterState(timestampFilter)
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
