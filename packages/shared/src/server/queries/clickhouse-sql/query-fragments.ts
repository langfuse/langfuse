/**
 * Reusable ClickHouse query fragments and CTEs
 */

import {
  EventsAggregationQueryBuilder,
  EventsQueryBuilder,
  EventsSessionAggregationQueryBuilder,
  ExperimentsAggregationFieldSetName,
  ExperimentsAggregationQueryBuilder,
  type CTEWithSchema,
} from "./event-query-builder";
import { AGGREGATABLE_SCORE_TYPES } from "../../../domain/scores";
import {
  OBSERVATIONS_TO_TRACE_INTERVAL,
  SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
} from "../../repositories/constants";

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

export const promptEventsForMetrics = (params: {
  projectId: string;
  promptIds: string[];
  fromTimestamp?: string;
  toTimestamp?: string;
}): CTEWithSchema => {
  const builder = new EventsQueryBuilder({ projectId: params.projectId })
    .selectRaw(
      "e.project_id AS project_id",
      "e.prompt_id AS prompt_id",
      "e.prompt_version AS prompt_version",
      "e.trace_id AS trace_id",
      "e.span_id AS span_id",
      "e.start_time AS start_time",
      "e.end_time AS end_time",
      "e.usage_details AS usage_details",
      "e.cost_details AS cost_details",
      "e.is_deleted AS is_deleted",
    )
    .whereRaw("e.type = 'GENERATION'")
    .whereRaw("e.prompt_id IN ({promptIds: Array(String)})", {
      promptIds: params.promptIds,
    })
    .when(Boolean(params.fromTimestamp), (b) =>
      b.whereRaw("e.start_time >= {fromTimestamp: DateTime64(6)}", {
        fromTimestamp: params.fromTimestamp,
      }),
    )
    .when(Boolean(params.toTimestamp), (b) =>
      b.whereRaw("e.start_time <= {toTimestamp: DateTime64(6)}", {
        toTimestamp: params.toTimestamp,
      }),
    )
    .orderByColumns([{ column: "e.event_ts", direction: "DESC" }])
    .limitBy("e.span_id", "e.project_id");

  return {
    ...builder.buildWithParams(),
    schema: [
      "project_id",
      "prompt_id",
      "prompt_version",
      "trace_id",
      "span_id",
      "start_time",
      "end_time",
      "usage_details",
      "cost_details",
      "is_deleted",
    ],
  };
};

interface EventsTracesAggregationParams {
  projectId: string;
  traceIds?: string[];
  startTimeFrom?: string | null;
  orderByTimestamp?: boolean;
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

  if (params.orderByTimestamp ?? true) {
    builder.orderByColumns([{ column: "timestamp", direction: "DESC" }]);
  }

  return builder;
};

/**
 * Aggregation expression producing a `score_booleans` array with entries
 * encoded as `<name>:true|false` (lowercased via lowerUTF8). This is the
 * producer half of a wire contract: `BooleanObjectFilter` and
 * `InMemoryFilterService` build the same strings via `encodeBooleanScoreEntry`
 * and do `has()` membership checks — every producer must use this fragment so
 * the encoding cannot drift. groupUniqArrayIf (not groupArrayIf) because
 * consumers only check existence, and dedup bounds the aggregation state to
 * 2 × distinct boolean score names even when the surrounding GROUP BY keeps
 * per-row columns like `id` or `comment`.
 */
export const scoreBooleansAggregation = (columnPrefix = ""): string =>
  `groupUniqArrayIf(concat(${columnPrefix}name, ':', lowerUTF8(${columnPrefix}string_value)), ${columnPrefix}data_type = 'BOOLEAN' AND notEmpty(${columnPrefix}string_value))`;

interface BaseScoresParams {
  projectId: string;
  startTimeFrom?: string | null;
  level: "observation" | "trace";
}

interface BaseScoresAggregationParams extends BaseScoresParams {
  hasScoreAggregationFilters?: boolean;
  startTimeLookbackIntervals: readonly string[];
  /**
   * When true, adds an extra `score_categories_tuples` column with
   * `tuple(name, string_value, data_type)` encoding alongside the default concat-encoded
   * `score_categories`. The tuple column is safe for programmatic parsing
   * (e.g. batch exports) when score names may contain colons.
   * The concat column is always present for hasAny filter compatibility.
   */
  includeTupleEncoding?: boolean;
}

const scoreTimestampLowerBound = (
  startTimeFrom: string | null | undefined,
  lookbackIntervals: readonly string[],
): string =>
  startTimeFrom
    ? `AND timestamp >= {startTimeFrom: DateTime64(3)}${lookbackIntervals.map((interval) => ` - ${interval}`).join("")}`
    : "";

/**
 * Unified score aggregation CTE builder for both observation-level and trace-level scores.
 *
 * @param level - 'observation' for observation scores, 'trace' for trace-level scores
 * @param hasScoreAggregationFilters - When true, uses nested subquery for proper avg() computation
 *
 * Observation level: Aggregates scores by (trace_id, observation_id), always uses nested structure
 * Trace level: Aggregates scores by (project_id, trace_id), filters observation_id IS NULL
 */
export const buildScoresAggregationCTE = (
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
        groupArrayIf(concat(name, ':', string_value), data_type IN ('CATEGORICAL', 'TEXT') AND notEmpty(string_value)) AS score_categories,
        -- BOOLEAN scores also stay in scores_avg for legacy numeric filters; true/false filters need raw-value existence instead of avg(value).
        ${scoreBooleansAggregation()} AS score_booleans${params.includeTupleEncoding ? `,\n        groupArrayIf(tuple(name, string_value, data_type), data_type IN ('CATEGORICAL', 'TEXT') AND notEmpty(string_value)) AS score_categories_tuples` : ""}
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
          ${scoreTimestampLowerBound(params.startTimeFrom, params.startTimeLookbackIntervals)}
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
  includeTupleEncoding?: boolean;
}

/**
 * Scores CTE for events table queries.
 * Aggregates numeric and categorical scores for observations.
 *
 * When hasScoreAggregationFilters is true, uses nested subquery structure
 * with pre-aggregation to enable proper array filtering on scores_avg/score_categories.
 *
 * Returns a query and params object that can be passed directly to withCTE.
 */
export const eventsScoresAggregation = (
  params: EventsScoresAggregationParams,
): { query: string; params: Record<string, any> } => {
  return buildScoresAggregationCTE({
    ...params,
    level: "observation",
    startTimeLookbackIntervals: [SCORE_TO_TRACE_OBSERVATIONS_INTERVAL],
  });
};

interface EventsTracesScoresAggregationParams {
  projectId: string;
  startTimeFrom?: string | null;
  hasScoreAggregationFilters?: boolean;
  // Note: includeTupleEncoding is intentionally omitted. This function is only used
  // in UI table queries where score_categories are used for filtering, not programmatic
  // parsing. If this is ever used in an export path, add includeTupleEncoding here and
  // pass it through to buildScoresAggregationCTE (see EventsScoresAggregationParams).
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
const buildEventsTracesScoresAggregation = (
  params: EventsTracesScoresAggregationParams,
  startTimeLookbackIntervals: readonly string[],
): { query: string; params: Record<string, any> } => {
  if (params.hasScoreAggregationFilters) {
    return buildScoresAggregationCTE({
      ...params,
      level: "trace",
      startTimeLookbackIntervals,
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
      ${scoreTimestampLowerBound(params.startTimeFrom, startTimeLookbackIntervals)}
    GROUP BY
      trace_id,
      project_id
  `.trim();

  return { query, params: queryParams };
};

export const eventsTracesScoresAggregation = (
  params: EventsTracesScoresAggregationParams,
): { query: string; params: Record<string, any> } =>
  buildEventsTracesScoresAggregation(params, [
    SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  ]);

/**
 * Trace-score aggregation for observation rows selected by event start time.
 * The lower bound covers trace-to-observation skew before the score lookback.
 */
export const eventsTracesScoresAggregationFromObservationStart = (
  params: EventsTracesScoresAggregationParams,
): { query: string; params: Record<string, any> } =>
  buildEventsTracesScoresAggregation(params, [
    OBSERVATIONS_TO_TRACE_INTERVAL,
    SCORE_TO_TRACE_OBSERVATIONS_INTERVAL,
  ]);

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
  includeMetadata?: boolean;
}): EventsSessionAggregationQueryBuilder => {
  return new EventsSessionAggregationQueryBuilder({
    projectId: params.projectId,
  })
    .selectFieldSet("base")
    .when(Boolean(params.includeMetadata), (builder) =>
      builder.selectFieldSet("metadata"),
    )
    .withSessionIds(params.sessionIds)
    .withStartTimeFrom(params.startTimeFrom)
    .whereRaw("session_id != ''");
};

export const eventsExperiments = (params: {
  projectId: string;
  experimentIds?: string[];
}): EventsQueryBuilder =>
  new EventsQueryBuilder({ projectId: params.projectId })
    .when(
      Boolean(params.experimentIds && params.experimentIds.length > 0),
      (b) =>
        b.whereRaw("e.experiment_id IN ({experimentIds: Array(String)})", {
          experimentIds: params.experimentIds,
        }),
    )
    .whereRaw("e.experiment_id != ''");

export const eventsExperimentsAggregation = (params: {
  projectId: string;
  fieldSet?: ExperimentsAggregationFieldSetName;
  experimentIds?: string[];
  startTimeFrom?: string | null;
}): ExperimentsAggregationQueryBuilder => {
  return new ExperimentsAggregationQueryBuilder({
    projectId: params.projectId,
  })
    .selectFieldSet(params.fieldSet ?? "base")
    .withExperimentIds(params.experimentIds)
    .withStartTimeFrom(params.startTimeFrom)
    .whereRaw("e.experiment_id != ''");
};

export const eventsExperimentsRootSpans = (params: {
  projectId: string;
  experimentIds?: string[];
  experimentItemIds?: string[];
}): EventsQueryBuilder =>
  eventsExperiments({
    projectId: params.projectId,
    experimentIds: params.experimentIds,
  })
    .whereRaw("e.experiment_item_root_span_id = e.span_id")
    .when(
      Boolean(params.experimentItemIds && params.experimentItemIds.length > 0),
      (b) =>
        b.whereRaw(
          "e.experiment_item_id IN ({experimentItemIds: Array(String)})",
          {
            experimentItemIds: params.experimentItemIds,
          },
        ),
    );

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
        data_type IN ('CATEGORICAL', 'TEXT') AND notEmpty(string_value)
      ) AS score_categories,
      ${scoreBooleansAggregation()} AS score_booleans
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
      "score_booleans",
    ],
  };
};

/**
 * Lightweight experiment-to-trace mapping for score queries.
 * Returns unique trace_ids that belong to experiments, with experiment_id for filtering.
 * Used as a CTE when scores need to be filtered by experiment.
 */
export const eventsExperimentTraceIds = (
  projectId: string,
): EventsQueryBuilder =>
  eventsExperiments({ projectId })
    .selectRaw("e.project_id", "e.experiment_id", "e.trace_id")
    .limitBy("e.trace_id");

export const buildScoreRowsCTE = (params: BaseScoresParams): CTEWithSchema => {
  const queryParams: Record<string, any> = {
    projectId: params.projectId,
    dataTypes: AGGREGATABLE_SCORE_TYPES,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  const isTraceLevel = params.level === "trace";
  const observationFilter = isTraceLevel
    ? "AND observation_id IS NULL"
    : "AND observation_id IS NOT NULL";

  const query = `
    SELECT
      project_id,
      trace_id,
      observation_id,
      name,
      source,
      data_type,
      string_value
    FROM scores s
    WHERE
      project_id = {projectId: String}
      AND trace_id != ''
      ${observationFilter}
      AND data_type IN ({dataTypes: Array(String)})
      ${params.startTimeFrom ? `AND timestamp >= {startTimeFrom: DateTime64(3)}` : ""}
  `.trim();

  return {
    query,
    params: queryParams,
    schema: [
      "project_id",
      "trace_id",
      "observation_id",
      "name",
      "source",
      "data_type",
      "string_value",
    ],
  };
};

export const buildScoresCTE = (params: BaseScoresParams): CTEWithSchema => {
  const queryParams: Record<string, any> = {
    projectId: params.projectId,
  };

  if (params.startTimeFrom) {
    queryParams.startTimeFrom = params.startTimeFrom;
  }

  const isTraceLevel = params.level === "trace";
  const observationFilter = isTraceLevel
    ? "AND observation_id IS NULL"
    : "AND observation_id IS NOT NULL";

  const query = `
    SELECT
      project_id,
      trace_id,
      observation_id,
      name,
      data_type,
      string_value,
      avg(value) avg_value
    FROM scores s FINAL
    WHERE
      project_id = {projectId: String}
      ${observationFilter}
      ${params.startTimeFrom ? `AND timestamp >= {startTimeFrom: DateTime64(3)}` : ""}
    GROUP BY
      project_id,
      trace_id,
      observation_id,
      name,
      data_type,
      string_value
  `.trim();

  return {
    query,
    params: queryParams,
    schema: [
      "project_id",
      "trace_id",
      "observation_id",
      "name",
      "data_type",
      "string_value",
      "avg_value",
    ],
  };
};
