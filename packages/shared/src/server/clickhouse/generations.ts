import { type FilterState } from "@langfuse/shared";
import { clickhouseClient } from "@langfuse/shared/src/server";
import Decimal from "decimal.js";

export type GenerationsReturnType = {
  projectId: string;
  id: string;
  name: string | null;
  model: string | null;
  level: string;
  version: string | null;
  statusMessage: string | null;
  startTime: string;
  endTime: string;
  traceId: string;
  traceName: string | null;
  completionStartTime: string | null;
  timeToFirstToken: number | null;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputPrice: number;
  outputPrice: number;
  totalPrice: number;
  calculatedInputCost: number;
  calculatedOutputCost: number;
  calculatedTotalCost: number;
  latency: number;
  promptId: string | null;
  promptName: string | null;
  promptVersion: string | null;
  traceTags: string[];
};

export const getGenerationsTable = async (
  projectId: string,
  filter: FilterState,
  limit: number,
  offset: number
) => {
  console.log("getGenerationsTable");

  const query = `
  WITH scores_avg AS (SELECT project_id,
                           trace_id,
                           observation_id,
                           groupArray(
                                   tuple(name, avg_value)
                           ) AS "scores_avg"
                    FROM (
                             SELECT project_id,
                                    trace_id,
                                    observation_id,
                                    name,
                                    avg(value) avg_value
                             FROM scores
                             WHERE project_id = {projectId: String}
                             GROUP BY project_id,
                                      trace_id,
                                      observation_id,
                                      name
                             ) tmp
                    GROUP BY project_id,
                             trace_id,
                             observation_id)
select 
  o.id as id, 
  o.project_id as projectId, 
  o.name as name,
  o.provided_model_name as model,
  o.model_parameters as modelParameters,
  o.start_time as startTime, 
  o.end_time as endTime,
  o.input as input,
  o.output as output,
  o.metadata as metadata,
  o.trace_id as traceId,
  o.trace_id as "traceId",
  o.trace_name as "traceName",
  o.completion_start_time as "completionStartTime",
  toInt16(dateDiff('milliseconds', o.start_time, o.completion_start_time)) as "timeToFirstToken",
  o.input_usage_units as "promptTokens",
  o.output_usage_units as "completionTokens",
  o.total_usage_units as "totalTokens",
  o.unit,
  o.level,
  o.status_message as "statusMessage",
  o.version,
  o.internal_model_id as "modelId",
  0 as "inputPrice",
  0 as "outputPrice",
  0 as "totalPrice",
  o.input_cost as "calculatedInputCost",
  o.output_cost as "calculatedOutputCost",
  o.total_cost as "calculatedTotalCost",
  toInt16(dateDiff('milliseconds', o.start_time, o.end_time)) as "latency",
  o.prompt_id as "promptId",
  o.trace_tags as "traceTags"
from observations_wide o final
         left join scores_avg s on s.project_id = o.project_id and s.observation_id = o.id and s.trace_id = o.trace_id
WHERE o.project_id = {projectId: String}
order by o.start_time desc
limit {limit: Int32} offset {offset: Int32};
    `;

  const rows = await clickhouseClient.query({
    query: query,
    query_params: {
      projectId: projectId,
      limit: limit,
      offset: offset,
    },
    format: "JSONEachRow",
  });

  const res = await rows.json<GenerationsReturnType>();

  console.log("res", res);
  return res.map((row) => ({
    ...row,
    startTime: new Date(row.startTime),
    endTime: new Date(row.endTime),
    completionStartTime: row.completionStartTime
      ? new Date(row.completionStartTime)
      : null,
    inputPrice: new Decimal(row.inputPrice),
    outputPrice: new Decimal(row.outputPrice),
    totalPrice: new Decimal(row.totalPrice),
    calculatedInputCost: new Decimal(row.calculatedInputCost),
    calculatedOutputCost: new Decimal(row.calculatedOutputCost),
    calculatedTotalCost: new Decimal(row.calculatedTotalCost),
    scores: [],
  }));
};
