import { clickhouseClient } from "@langfuse/shared/src/server";

export const getTracesTable = async (projectId: string) => {
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
            project_id = ${projectId}
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
        o.id,
        o.name,
        o.provided_model_name,
        o.internal_model_id,
        o."model_parameters",
        o.start_time as "startTime",
        o.end_time as "endTime",
        o.trace_id as "traceId",
        t.name as "traceName",
        o.completion_start_time as "completionStartTime",
        o.input_usage_units as "promptTokens",
        o.input_usage_units as "completionTokens",
        o.total_usage_units as "totalTokens",
        o.unit,
        o.level,
        o.status_message as "statusMessage",
        o.version,
        o.input_cost as "calculatedInputCost",
        o.output_cost as "calculatedOutputCost",
        o.total_cost as "calculatedTotalCost",
        o.prompt_id as "promptId",
        t.tags as "traceTags",
        scores_avg.scores_avg
      FROM observations_wide o
      LEFT JOIN scores_avg AS s_avg ON s_avg.trace_id = t.id and s_avg.observation_id = o.id
      WHERE
        o.project_id = ${projectId}
        AND o.type = 'GENERATION'
      AND o.start_time > '2024-09-02'
      AND o.tra > '2024-09-01'
      AND s_avg.timestamp > '2024-09-01'
      LIMIT 50
    Offset 0;
    `;

  const rows = await clickhouseClient.query({
    query: query,
    format: "JSONEachRow",
  });

  const final = await rows.json();

  console.log(final);
  return final;
};
