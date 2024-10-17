import { NumberComparisonFilter } from "@/src/utils/tanstack";
import { type FilterState } from "@langfuse/shared";
import { clickhouseClient } from "@langfuse/shared/src/server";

export type TracesTableReturnType = {
  projectId: string;
  id: string;
  name: string | null;
  timestamp: string;
  bookmarked: boolean;
  level: string;
  observationCount: number;
  release: string | null;
  version: string | null;
  userId: string | null;
  sessionId: string | null;
  latency: number;
  tags: string[];
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  inputCost: number;
  outputCost: number;
  totalCost: number;
};

export const getTracesTable = async (
  projectId: string,
  filter: FilterState,
  limit: number,
  offset: number,
) => {
  console.log("getTracesTable");

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
select o.id, o.project_id, o.start_time, scores_avg.scores_avg
from observations_wide o final
         left join scores_avg s on s.project_id = o.project_id and s.observation_id = o.id and s.trace_id = o.trace_id
WHERE o.project_id = {projectId: String}
order by o.start_time desc
limit {limit: Int32}offset {offset: Int32};
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

  const res = await rows.json<TracesTableReturnType>();

  console.log("res", res);
  return res;
};
