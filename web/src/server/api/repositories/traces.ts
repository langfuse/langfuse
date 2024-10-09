import { clickhouseClient } from "@langfuse/shared/src/server";
import { z } from "zod";

export const TracesTableSchema = z.object({
  projectId: z.string(),
  id: z.string(),
  name: z.string().nullable(),
  timestamp: z.string(),
  bookmarked: z.boolean(),
  level: z.string(),
  observationCount: z.number(),
  release: z.string().nullable(),
  version: z.string().nullable(),
  userId: z.string().nullable(),
  sessionId: z.string().nullable(),
  latency: z.number(),
  tags: z.array(z.string()),
  promptTokens: z.number(),
  completionTokens: z.number(),
  totalTokens: z.number(),
  inputCost: z.number(),
  outputCost: z.number(),
  totalCost: z.number(),
});

export const getTracesTable = async (projectId: string) => {
  console.log("getTracesTable");

  const query = `
  WITH scores_avg AS (
        SELECT
          trace_id,
          observation_id,
          groupArray(
                    tuple(name, avg_value)
                )
             AS "scores_avg"
        FROM (
          SELECT
            trace_id,
            observation_id,
            name,
            avg(value) avg_value,
            comment
          FROM
            scores
          WHERE
            project_id = '${projectId}'
          GROUP BY
            trace_id,
            observation_id,
            name,
            comment
          ORDER BY
            trace_id
          ) tmp
        GROUP BY
          trace_id,
          observation_id
      )
    SELECT
        o.trace_id as id,
        o.project_id as projectId,
        argMax(o.trace_timestamp, event_ts) as timestamp,
        argMax(o.trace_bookmarked, event_ts) as bookmarked,
        argMax(o.trace_name, event_ts) as name,
        argMax(o.level, event_ts) as level,
        0 as observationCount,
        argMax(o.trace_release, event_ts) as release,
        argMax(o.trace_version, event_ts) as version,
        argMax(o.trace_user_id, event_ts) as userId,
        argMax(o.trace_session_id, event_ts) as sessionId,
        0 as latency,
        argMax(o.trace_tags, event_ts) as tags,
        sum(o.input_usage_units) as promptTokens,
        sum(o.output_usage_units) as completionTokens,
        sum(o.total_usage_units) as totalTokens,
        sum(o.input_cost) as inputCost,
        sum(o.output_cost) as outputCost,
        sum(o.total_cost) as totalCost
        
      FROM observations_wide o FINAL
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = o.trace_id and s_avg.observation_id = o.id
      WHERE
        o.project_id = '${projectId}'
        AND o.type = 'GENERATION'
      AND o.start_time > '2024-09-02'
      GROUP BY o.trace_id, o.project_id
      LIMIT 50
    Offset 0;
    `;

  const rows = await clickhouseClient.query({
    query: query,
    format: "JSONEachRow",
  });

  const final = await rows.json();

  return final.map((row) => {
    return TracesTableSchema.parse(row);
  });
};
