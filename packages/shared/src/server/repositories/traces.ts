import {
  type ObservationLevel,
  type FilterState,
  stringFilter,
} from "@langfuse/shared";
import { TraceClickhouseRecord } from "../clickhouse/schema";
import { queryClickhouse } from "./clickhouse";
import { FilterList, StringFilter } from "../queries/filter/factory";
import { logger } from "../logger";

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
> & {
  level: ObservationLevel;
  observation_count: number | null;
  latency: number;
  usage_details: Record<string, number>;
  cost_details: Record<string, number>;
  scores_avg: Array<{ name: string; avg_value: number }>;
};

export const convertToReturnType = (row: TracesTableReturnType) => {
  return {
    id: row.id,
    name: row.name,
    timestamp: new Date(row.timestamp),
    tags: row.tags,
    bookmarked: row.bookmarked,
    release: row.release,
    version: row.version,
    projectId: row.project_id,
    userId: row.user_id,
    sessionId: row.session_id,
    latency: row.latency,
    usageDetails: row.usage_details,
    costDetails: row.cost_details,
    level: row.level as ObservationLevel,
    observationCount: row.observation_count
      ? BigInt(row.observation_count)
      : undefined,
  };
};

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  limit?: number,
  offset?: number
) => {
  console.log("getTracesTable");

  const strFilter = new StringFilter({
    clickhouseTable: "traces",
    field: "project_id",
    operator: "=",
    value: projectId,
    tablePrefix: "t",
  });

  const tracesFilter = new FilterList([strFilter]);
  const res = tracesFilter.apply();

  const observationsStatsFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "observations",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const observationsStatsRes = observationsStatsFilter.apply();

  const scoresAvgFilter = new FilterList([
    new StringFilter({
      clickhouseTable: "scores",
      field: "project_id",
      operator: "=",
      value: projectId,
    }),
  ]);

  const scoresAvgFilterRes = scoresAvgFilter.apply();

  const query = `
  WITH observations_stats AS (
  SELECT
    COUNT(*) AS observation_count,
      sumMap(usage_details) as usage_details,
      SUM(total_cost) AS calculated_output_cost,
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
                                  FROM scores
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
        s.scores_avg as scores_avg
      from traces t final
              left join observations_stats os on os.project_id = t.project_id and os.trace_id = t.id
              left join scores_avg s on s.project_id = t.project_id and s.trace_id = t.id

      WHERE ${res.query}
      order by t.timestamp desc
      ${limit && offset ? `limit {limit: Int32} offset {offset: Int32}` : ""}
    `;

  logger.error("hello", JSON.stringify(res.params));

  const rows = await queryClickhouse<TracesTableReturnType>({
    query: query,
    params: {
      limit: limit,
      offset: offset,
      ...res.params,
      ...observationsStatsRes.params,
      ...scoresAvgFilterRes.params,
    },
  });

  return rows.map(convertToReturnType);
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
