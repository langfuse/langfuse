import { type ObservationLevel, type FilterState } from "@langfuse/shared";
import { TraceClickhouseRecord } from "../clickhouse/schema";
import { queryClickhouse } from "./clickhouse";
import {
  createFilterFromFilterState,
  getProjectIdDefaultFilter,
} from "../queries/clickhouse-filter/factory";

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

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  limit?: number,
  offset?: number
) => {
  const { tracesFilter, scoresFilter, observationsFilter } =
    getProjectIdDefaultFilter(projectId, { tracesPrefix: "t" });

  const f = createFilterFromFilterState(filter, { tracesPrefix: "t" });

  tracesFilter.push(
    ...f.filter((filter) => filter.clickhouseTable === "traces")
  );
  scoresFilter.push(...f.filter((f) => f.clickhouseTable === "scores"));
  observationsFilter.push(
    ...f.filter((f) => f.clickhouseTable === "observations")
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
        t.public
      from traces t final
              left join observations_stats os on os.project_id = t.project_id and os.trace_id = t.id
              left join scores_avg s on s.project_id = t.project_id and s.trace_id = t.id

      WHERE ${tracesFilterRes.query}
      order by t.timestamp desc
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  const rows = await queryClickhouse<TracesTableReturnType>({
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
