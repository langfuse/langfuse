/**
 * Reusable ClickHouse query fragments and CTEs
 */

import {
  EventsAggregationQueryBuilder,
  EventsQueryBuilder,
  EventsSessionAggregationQueryBuilder,
  type CTEWithSchema,
} from "./event-query-builder";

/**
 * Lightweight trace metadata query: one row per trace with name, user_id, tags.
 * Picks a row with non-empty trace_name via LIMIT 1 BY trace_id.
 */
export const eventsTraceMetadata = (projectId: string): EventsQueryBuilder =>
  new EventsQueryBuilder({ projectId })
    .selectRaw(
      "e.trace_id AS id",
      "e.trace_name AS name",
      "e.user_id AS user_id",
      "e.tags AS tags",
    )
    .whereRaw("e.trace_name <> ''")
    .whereRaw("e.is_deleted = 0")
    .limitBy("e.trace_id");

interface EventsTracesAggregationParams {
  projectId: string;
  traceIds?: string[];
  startTimeFrom?: string | null;
  /**
   * Whether to use truncated I/O (events_core) or full I/O (events_full).
   * Default is false (full) for better compatibility.
   */
  truncated?: boolean;
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
  const builder = new EventsAggregationQueryBuilder({
    projectId: params.projectId,
  })
    // we always use this as CTE, no need to be smart here.
    // ClickHouse will optimize unused columns away.
    .selectFieldSet("all")
    .withTraceIds(params.traceIds)
    .withStartTimeFrom(params.startTimeFrom)
    .withTruncated(params.truncated ?? false);

  builder.orderByColumns([{ column: "timestamp", direction: "DESC" }]);

  return builder;
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

/**
 * Aggregates events directly by session_id in a single step.
 * Mirrors eventsTracesAggregation but groups by session_id instead of trace_id.
 *
 * Use this for session-level queries instead of the two-step
 * eventsTracesAggregation → re-aggregate by session_id approach.
 */
export const eventsSessionsAggregation = (params: {
  projectId: string;
  sessionIds?: string[];
  startTimeFrom?: string | null;
}): EventsSessionAggregationQueryBuilder => {
  return new EventsSessionAggregationQueryBuilder({
    projectId: params.projectId,
  })
    .selectFieldSet("all")
    .withSessionIds(params.sessionIds)
    .withStartTimeFrom(params.startTimeFrom)
    .whereRaw("session_id != ''");
};

/**
 * Session-level scores aggregation CTE.
 * Groups scores by (project_id, session_id), computing numeric/boolean averages
 * and categorical value lists.
 *
 * Returns a query and params object suitable for CTEQueryBuilder.withCTE().
 */
export const eventsSessionScoresAggregation = (params: {
  projectId: string;
}): CTEWithSchema => {
  const query = `
    SELECT
      project_id,
      session_id AS score_session_id,
      groupArrayIf(
        tuple(name, avg_value),
        data_type IN ('NUMERIC', 'BOOLEAN')
      ) AS scores_avg,
      groupArrayIf(
        concat(name, ':', string_value),
        data_type = 'CATEGORICAL' AND notEmpty(string_value)
      ) AS score_categories
    FROM (
      SELECT
        project_id,
        session_id,
        name,
        data_type,
        string_value,
        avg(value) avg_value
      FROM scores s FINAL
      WHERE
        project_id = {projectId: String}
      GROUP BY
        project_id,
        session_id,
        name,
        data_type,
        string_value
    ) tmp
    GROUP BY
      project_id, session_id
  `.trim();

  return {
    query,
    params: { projectId: params.projectId },
    schema: [
      "project_id",
      "score_session_id",
      "scores_avg",
      "score_categories",
    ],
  };
};
