/**
 * Reusable ClickHouse query fragments and CTEs
 */

import { EventsAggregationQueryBuilder } from "./event-query-builder";

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
 */
export const eventsTracesAggregation = (
  params: EventsTracesAggregationParams,
): EventsAggregationQueryBuilder => {
  return (
    new EventsAggregationQueryBuilder({ projectId: params.projectId })
      // we always use this as CTE, no need to be smart here. i
      // ClickHouse will optimize unused columns away.
      .selectFieldSet("all")
      .withTraceIds(params.traceIds)
      .withStartTimeFrom(params.startTimeFrom)
      .orderBy("ORDER BY timestamp DESC")
  );
};

interface EventsScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
}

/**
 * Scores CTE for events table queries.
 * Aggregates numeric and categorical scores for observations.
 *
 * Returns a query and params object that can be passed directly to withCTE.
 */
export const eventsScoresAggregation = (
  params: EventsScoresAggregationParams,
): { query: string; params: Record<string, any> } => {
  const queryParams: Record<string, any> = {
    projectId: params.projectId,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  const query = `
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

  return { query, params: queryParams };
};

interface EventsTracesScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
}

/**
 * Scores CTE for trace-level queries.
 * Aggregates scores that belong to traces (not observations).
 *
 * Returns a query and params object that can be passed directly to withCTE.
 */
export const eventsTracesScoresAggregation = (
  params: EventsTracesScoresAggregationParams,
): { query: string; params: Record<string, any> } => {
  const queryParams: Record<string, any> = {
    projectId: params.projectId,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  const query = `
    SELECT
      trace_id,
      project_id,
      groupUniqArray(id) as score_ids
    FROM scores
    WHERE project_id = {projectId: String}
      AND observation_id IS NULL
      ${params.startTimeFrom ? `AND timestamp >= {startTimeFrom: DateTime64(3)}` : ""}
    GROUP BY
      trace_id,
      project_id
  `.trim();

  return { query, params: queryParams };
};
