/**
 * Reusable OceanBase query fragments and CTEs
 *
 * This is the OceanBase-adapted version of query-fragments.ts.
 * Key differences from ClickHouse:
 * - Uses GROUP_CONCAT instead of groupUniqArray
 * - Uses JSON_ARRAYAGG instead of groupArrayIf
 * - Uses AVG() with GROUP BY instead of avg()
 * - Uses standard MySQL/OceanBase SQL syntax
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
      // OceanBase will optimize unused columns away.
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
): { query: string; params: unknown[] } => {
  const positionalParams: unknown[] = [params.projectId];

  const isTraceLevel = params.level === "trace";

  const primaryKey = isTraceLevel ? "project_id" : "observation_id";
  const additionalInnerCols = isTraceLevel ? ["id"] : ["comment"];
  const additionalOuterCols = isTraceLevel
    ? ["GROUP_CONCAT(DISTINCT id) as score_ids"]
    : [];
  const observationFilter = isTraceLevel ? "AND observation_id IS NULL" : "";
  const orderBy = isTraceLevel ? "" : "ORDER BY trace_id";

  let startTimeClause = "";
  if (params.startTimeFrom) {
    startTimeClause = `AND timestamp >= ?`;
    positionalParams.push(params.startTimeFrom);
  }

  const query = `
      SELECT
        trace_id,
        ${primaryKey},
        ${additionalOuterCols.length > 0 ? additionalOuterCols.join(",\n        ") + "," : ""}
        JSON_ARRAYAGG(
          CASE 
            WHEN data_type IN ('NUMERIC', 'BOOLEAN') 
            THEN JSON_OBJECT('name', name, 'avg_value', avg_value)
            ELSE NULL
          END
        ) AS scores_avg,
        GROUP_CONCAT(
          DISTINCT CASE 
            WHEN data_type = 'CATEGORICAL' AND string_value IS NOT NULL AND string_value != ''
            THEN CONCAT(name, ':', string_value)
            ELSE NULL
          END
        ) AS score_categories
      FROM (
        SELECT
          ${primaryKey},
          trace_id,
          ${additionalInnerCols.join(",\n          ")},
          name,
          data_type,
          string_value,
          AVG(value) as avg_value
        FROM scores
        WHERE project_id = ?
          ${observationFilter}
          ${startTimeClause}
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

  return { query, params: positionalParams };
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
): { query: string; params: unknown[] } => {
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
): { query: string; params: unknown[] } => {
  if (params.hasScoreAggregationFilters) {
    return buildScoresAggregationCTE({
      ...params,
      level: "trace",
    });
  }

  const positionalParams: unknown[] = [params.projectId];

  let startTimeClause = "";
  if (params.startTimeFrom) {
    startTimeClause = `AND timestamp >= ?`;
    positionalParams.push(params.startTimeFrom);
  }

  const query = `
    SELECT
      trace_id,
      project_id,
      GROUP_CONCAT(DISTINCT id) as score_ids
    FROM scores
    WHERE project_id = ?
      AND observation_id IS NULL
      ${startTimeClause}
    GROUP BY
      trace_id,
      project_id
  `.trim();

  return { query, params: positionalParams };
};
