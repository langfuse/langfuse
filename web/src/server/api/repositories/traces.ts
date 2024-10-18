import { NumberComparisonFilter } from "@/src/utils/tanstack";
import { type FilterState } from "@langfuse/shared";
import { clickhouseClient } from "@langfuse/shared/src/server";

export type TracesTableReturnType = {
  projectId: string;
  id: string;
  name: string;
  timestamp: string;
  bookmarked: boolean;
  level: string;
  observationCount: number;
  release: string;
  version: string;
  userId: string;
  sessionId: string;
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
  select 
      t.id as id,
      t.project_id as projectId, 
      t.trace_timestamp as timestamp,
      argMax(t.trace_tags, t.event_ts) as tags,
      argMax(t.trace_bookmarked, t.event_ts) as bookmarked,
      argMax(t.trace_name, t.event_ts) as name,
      'DEBUG' as level,
      argMax(t.trace_release, t.event_ts) as release,
      argMax(t.trace_version, t.event_ts) as version,
      argMax(t.trace_user_id, t.event_ts) as userId,
      argMax(t.trace_session_id, t.event_ts) as sessionId,
        COUNT(*) AS "observationCount",
      SUM(input_usage_units) AS "promptTokens",
      SUM(output_usage_units) AS "completionTokens",
      SUM(total_usage_units) AS "totalTokens",
      SUM(input_cost) AS "inputCost",
      SUM(output_cost) AS "outputCost",
      SUM(total_cost) AS "totalCost",
      int(date_diff('milliseconds', least(min(start_time), min(end_time)), greatest(max(start_time), max(end_time)))) as latency
from traces_wide t final
WHERE t.project_id = {projectId: String}
group by id, t.project_id, t.trace_timestamp
order by t.trace_timestamp desc
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

  return res.map((row) => ({
    ...row,
    timestamp: new Date(row.timestamp),
  }));
};
