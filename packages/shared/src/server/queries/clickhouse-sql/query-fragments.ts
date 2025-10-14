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
	      any(name) AS name,
	      min(start_time) as timestamp,
	      any(environment) AS environment,
	      any(version) AS version,
	      any(session_id) AS session_id,
	      any(user_id) AS user_id,
	      any(input) AS input,
	      any(output) AS output,
	      any(metadata) AS metadata,
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
