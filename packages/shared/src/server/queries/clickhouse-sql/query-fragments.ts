/**
 * Reusable ClickHouse query fragments and CTEs
 */

import { OBSERVATIONS_TO_TRACE_INTERVAL } from "../../repositories";

interface EventsTracesAggregationParams {
  projectId: string;
  traceIds?: string[];
  startTimeFrom?: string | null;
}

/**
 * Rebuilds traces from events table by aggregating events with the same trace_id.
 * Groups events by trace_id and project_id, selecting representative fields
 * and aggregating timestamps.
 *
 * Note: This is a temporary solution until we fully migrate to using only the events table.
 *       Some legacy fields are still included for compatibility and should be removed in the future.
 *
 * Parameters are not injected directly, but used to conditionally include parts of the query.
 * They still need to be passed to the query execution function.
 */
export const eventsTracesAggregation = (
  params: EventsTracesAggregationParams,
) => {
  return `
	  SELECT
	      trace_id AS id,
	      project_id,
	      argMax(name, event_ts) AS name,
	      min(start_time) as timestamp,
	      argMax(environment, event_ts) AS environment,
	      argMax(version, event_ts) AS version,
	      argMax(session_id, event_ts) AS session_id,
	      argMax(user_id, event_ts) AS user_id,
	      argMax(input, event_ts) AS input,
	      argMax(output, event_ts) AS output,
	      argMax(metadata, event_ts) AS metadata,
	      min(created_at) AS created_at,
	      max(updated_at) AS updated_at,
	      -- TODO remove legacy fields
	      array() AS tags,
	      false AS bookmarked,
	      false AS public,
	      '' AS release
	  FROM events
    WHERE project_id = {projectId: String}
    ${params.traceIds ? `AND trace_id IN ({traceIds: Array(String)})` : ""}
    ${params.startTimeFrom ? `AND start_time >= {startTimeFrom: DateTime64(3)} - ${OBSERVATIONS_TO_TRACE_INTERVAL}` : ""}
    GROUP BY trace_id, project_id
    ORDER BY timestamp DESC
  `.trim();
};

interface EventsScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
}

/**
 * Scores CTE for events table queries.
 * Aggregates numeric and categorical scores for observations.
 *
 * Parameters are not injected directly, but used to conditionally include parts of the query.
 * They still need to be passed to the query execution function.
 */
export const eventsScoresAggregation = (
  params: EventsScoresAggregationParams,
) => {
  return `
    SELECT
      trace_id,
      observation_id,
      -- For numeric scores, use tuples of (name, avg_value)
      groupArrayIf(
        tuple(name, avg_value),
        data_type IN ('NUMERIC', 'BOOLEAN')
      ) AS scores_avg,
      -- For categorical scores, use name:value format for improved query performance
      groupArrayIf(
        concat(name, ':', string_value),
        data_type = 'CATEGORICAL' AND notEmpty(string_value)
      ) AS score_categories
    FROM (
      SELECT
        trace_id,
        observation_id,
        name,
        avg(value) avg_value,
        string_value,
        data_type,
        comment
      FROM
        scores FINAL
      WHERE project_id = {projectId: String}
      ${params.startTimeFrom ? `AND timestamp >= {startTimeFrom: DateTime64(3)}` : ""}
      GROUP BY
        trace_id,
        observation_id,
        name,
        string_value,
        data_type,
        comment
      ORDER BY
        trace_id
      ) tmp
    GROUP BY
      trace_id,
      observation_id
  `.trim();
};
