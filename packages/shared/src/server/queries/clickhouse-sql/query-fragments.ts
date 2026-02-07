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
      // we always use this as CTE, no need to be smart here.
      // ClickHouse will optimize unused columns away.
      .selectFieldSet("all")
      .withTraceIds(params.traceIds)
      .withStartTimeFrom(params.startTimeFrom)
      .orderByColumns([{ column: "timestamp", direction: "DESC" }])
  );
};

interface BaseScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
  level: "observation" | "trace";
  hasScoreAggregationFilters?: boolean;
}

/**
 * Unified score aggregation CTE builder for both observation-level and trace-level scores.
 *
 * @param level - 'observation' for observation scores, 'trace' for trace-level scores
 * @param hasScoreAggregationFilters - When true, uses nested subquery for proper avg() computation
 *
 * Observation level: Aggregates scores by (trace_id, observation_id), always uses nested structure
 * Trace level: Aggregates scores by (project_id, trace_id), filters observation_id IS NULL
 */
const buildScoresAggregationCTE = (
  params: BaseScoresAggregationParams,
): { query: string; params: Record<string, any> } => {
  const queryParams: Record<string, any> = {
    projectId: params.projectId,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  const isTraceLevel = params.level === "trace";

  // Observation level: trace_id + observation_id
  // Trace level: project_id + trace_id
  const primaryKey = isTraceLevel ? "project_id" : "observation_id";
  const additionalInnerCols = isTraceLevel ? ["id"] : ["comment"];
  const additionalOuterCols = isTraceLevel
    ? ["groupUniqArray(id) as score_ids"]
    : [];
  const observationFilter = isTraceLevel ? "AND observation_id IS NULL" : "";
  const orderBy = isTraceLevel ? "" : "ORDER BY trace_id";

  const query = `
      SELECT
        trace_id,
        ${primaryKey},
        ${additionalOuterCols.length > 0 ? additionalOuterCols.join(",\n        ") + "," : ""}
        groupArrayIf(tuple(name, avg_value, data_type, string_value), data_type IN ('NUMERIC', 'BOOLEAN')) AS scores_avg,
        groupArrayIf(concat(name, ':', string_value), data_type = 'CATEGORICAL' AND notEmpty(string_value)) AS score_categories
      FROM (
        SELECT
          ${primaryKey},
          trace_id,
          ${additionalInnerCols.join(",\n          ")},
          name,
          data_type,
          string_value,
          avg(value) as avg_value
        FROM scores FINAL
        WHERE project_id = {projectId: String}
          ${observationFilter}
          ${params.startTimeFrom ? `AND timestamp >= {startTimeFrom: DateTime64(3)}` : ""}
        GROUP BY
          ${primaryKey},
          trace_id,
          ${additionalInnerCols.join(",\n          ")},
          name,
          data_type,
          string_value
        ${orderBy}
      ) tmp
      GROUP BY ${primaryKey}, trace_id
    `.trim();

  return { query, params: queryParams };
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
  return buildScoresAggregationCTE({
    ...params,
    level: "observation",
  });
};

interface EventsTracesScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
  hasScoreAggregationFilters?: boolean;
}

/**
 * Scores CTE for trace-level queries.
 * Aggregates scores that belong to traces (not observations).
 *
 * When hasScoreAggregationFilters is true, uses nested subquery structure
 * with pre-aggregation to enable proper array filtering on scores_avg/score_categories.
 *
 * Returns a query and params object that can be passed directly to withCTE.
 */
export const eventsTracesScoresAggregation = (
  params: EventsTracesScoresAggregationParams,
): { query: string; params: Record<string, any> } => {
  if (params.hasScoreAggregationFilters) {
    return buildScoresAggregationCTE({
      ...params,
      level: "trace",
    });
  }

  const queryParams: Record<string, any> = {
    projectId: params.projectId,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  // Flat structure (trace-level only, when no score filters present)
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
