import {
  type ViewVersion,
  type ViewDeclarationType,
  type DimensionsDeclarationType,
  type views,
} from "./types";
import { z } from "zod";
import { InvalidRequestError } from "../../errors";

/**
 * GreptimeDB dashboard view declarations (04-read-path.md, P3).
 *
 * The ClickHouse dashboard engine has two view families: v1 (normalized `traces`/`observations`/
 * `scores` tables, read with FINAL) and v2 (`events_core` aggregation, read with argMaxIf/sumMap).
 * On GreptimeDB both collapse onto the same merged `last_non_null` projection: the projection IS the
 * merged current state that v1-FINAL and v2-events both produce, and v2's argMaxIf trace metadata is
 * just a plain projection column. So there is a SINGLE GreptimeDB view per logical view, version-
 * agnostic, exposing the UNION of the v1+v2 surface so any widget (built as v1 or v2) resolves.
 *
 * SQL conventions (consumed by `server/greptimeQueryBuilder.ts`):
 * - Table aliases: traces `t`, observations `o`, scores `s`. No FINAL; the builder adds
 *   `AND <alias>.is_deleted = false` to the base table and every relation join.
 * - A LEAF measure (no `relationTable`) carries a per-row scalar expression in `sql`; the builder
 *   applies the user aggregation directly (`avg(<sql>)`, `greptimeQuantile(p, <sql>)`, ...).
 * - A RELATION-backed measure (`relationTable` set) carries an INNER aggregate over the joined
 *   relation in `sql` (e.g. `sum(...)`, `count(*)`); the builder emits a two-level query (inner
 *   groups the relation per base entity, outer applies the user aggregation).
 * - `count` measures use `sql: "*"` -> the builder emits `count(*)`.
 * - Token/cost known-key sums use `json_get_float` over the JSON usage/cost columns (per-row for
 *   leaf, wrapped in `sum()` for relation). Dynamic-key by-type (costByType/usageByType) is NOT a
 *   SQL measure: it carries the `byType` marker and is expanded app-side in the executor.
 * - Tags/metadata filtering routes through the `*_tags` / `*_metadata` EAV tables via the filter
 *   factory, never a column predicate; tags is not a normal breakdown dimension.
 *
 * Experiment / dataset-run dimensions (v2-only) are NOT supported yet (they depend on the P4
 * dataset-run-items read migration). They are listed in `GREPTIME_UNSUPPORTED`; referencing one as a
 * dimension, measure, filter, entityDimension, or orderBy throws a clear error at validation time.
 */

/**
 * Per-row (leaf) known-key JSON accessor, defaulting a missing key to 0 (matches CH sumMap default).
 * usage_details / cost_details are native JSON columns, so json_get_float reads them directly (no
 * parse_json, which only accepts a String argument).
 */
const knownKey = (prefix: string, jsonCol: string, key: string): string =>
  `coalesce(json_get_float(${prefix}.${jsonCol}, '${key}'), 0)`;

/** Per-row latency in milliseconds (leaf observations): end - start. */
const ROW_LATENCY_MS =
  "CAST((to_unixtime(o.end_time) - to_unixtime(o.start_time)) * 1000 AS BIGINT)";

/** by-type marker: the builder/executor expand the JSON map's dynamic keys app-side. */
export const BYTYPE_SQL = "__BYTYPE__";

/**
 * Experiment / dataset-run dimensions are supported as of P4: `datasetRunId` reads the scores
 * projection column directly; `experimentName` / `experimentId` / `experimentDatasetId` join the
 * `dataset_run_items` projection (experiment = dataset run). Nothing is deferred anymore, so the set
 * is empty (kept for the `assertGreptimeSupportedField` / `validateQuery` call sites).
 */
export const GREPTIME_UNSUPPORTED: ReadonlySet<string> = new Set<string>();

/**
 * The experiment relation join source: a DISTINCT projection of `dataset_run_items` exposing the
 * per-trace experiment identity. Experiment enrichment is TRACE-LEVEL (every observation/score of a
 * trace shares the run's experiment), so both observations and scores correlate by `trace_id`. The
 * DISTINCT collapses a trace's many run items to one row per (trace, run), so a single-run trace
 * never fans out; a trace in multiple runs contributes once per experiment group (correct multi-
 * membership). `is_deleted = false` is baked in (the builder skips the usual relation `notDeleted`).
 */
const DATASET_RUN_ITEMS_RELATION_QUERY =
  "SELECT DISTINCT project_id, trace_id, " +
  "dataset_run_id AS experiment_id, dataset_run_name AS experiment_name, " +
  "dataset_id AS experiment_dataset_id FROM dataset_run_items WHERE is_deleted = false";

const datasetRunItemsRelation = (joinConditionSql: string) => ({
  name: "dataset_run_items",
  joinConditionSql,
  timeDimension: "dataset_run_created_at",
  baseQuery: DATASET_RUN_ITEMS_RELATION_QUERY,
  skipTimeBound: true,
});

// ---------------------------------------------------------------------------
// traces view (alias `t`) — relation-backed measures join observations (`o`) / scores (`sc`)
// ---------------------------------------------------------------------------

const tracesView: ViewDeclarationType = {
  name: "traces",
  description:
    "Traces represent a group of observations and typically represent a single request or operation.",
  dimensions: {
    id: { sql: "t.id", alias: "id", type: "string" },
    name: { sql: "t.name", alias: "name", type: "string" },
    tags: { sql: "t.tags", alias: "tags", type: "string[]" },
    userId: { sql: "t.user_id", alias: "userId", type: "string" },
    sessionId: { sql: "t.session_id", alias: "sessionId", type: "string" },
    release: { sql: "t.release", alias: "release", type: "string" },
    version: { sql: "t.version", alias: "version", type: "string" },
    environment: {
      sql: "t.environment",
      alias: "environment",
      type: "string",
    },
    timestampMonth: {
      sql: "date_format(t.timestamp, '%Y-%m')",
      alias: "timestampMonth",
      type: "string",
    },
  },
  measures: {
    count: { sql: "*", alias: "count", type: "integer", unit: "traces" },
    observationsCount: {
      sql: "count(*)",
      alias: "observationsCount",
      type: "integer",
      relationTable: "observations",
      unit: "observations",
    },
    scoresCount: {
      sql: "count(*)",
      alias: "scoresCount",
      type: "integer",
      relationTable: "scores",
      unit: "scores",
    },
    // Raw id columns + `string` type so only count/uniq are valid (matching the CH v2 contract: sum
    // is rejected, uniq counts distinct). The builder applies the aggregation, so the sql must NOT
    // already aggregate — otherwise `uniq` would nest as count(distinct count(distinct ...)).
    uniqueUserIds: {
      sql: "t.user_id",
      alias: "uniqueUserIds",
      type: "string",
      unit: "users",
    },
    uniqueSessionIds: {
      sql: "t.session_id",
      alias: "uniqueSessionIds",
      type: "string",
      unit: "sessions",
    },
    latency: {
      sql: "CAST((to_unixtime(max(o.end_time)) - to_unixtime(min(o.start_time))) * 1000 AS BIGINT)",
      alias: "latency",
      type: "integer",
      relationTable: "observations",
      unit: "millisecond",
    },
    totalTokens: {
      sql: `sum(${knownKey("o", "usage_details", "total")})`,
      alias: "totalTokens",
      type: "integer",
      relationTable: "observations",
      unit: "tokens",
    },
    totalCost: {
      sql: "sum(o.total_cost)",
      alias: "totalCost",
      type: "decimal",
      relationTable: "observations",
      unit: "USD",
    },
  },
  tableRelations: {
    observations: {
      name: "observations",
      joinConditionSql: "ON t.id = o.trace_id AND t.project_id = o.project_id",
      timeDimension: "start_time",
    },
    scores: {
      name: "scores",
      joinConditionSql:
        "ON t.id = sc.trace_id AND t.project_id = sc.project_id",
      timeDimension: "timestamp",
    },
  },
  segments: [],
  timeDimension: "timestamp",
  baseCte: "traces",
};

// ---------------------------------------------------------------------------
// observations view (alias `o`) — leaf; trace-joined dims via `t`, scores via `sc`
// ---------------------------------------------------------------------------

const observationsView: ViewDeclarationType = {
  name: "observations",
  description:
    "Observations represent individual requests or operations within a trace. They are grouped into Spans, Generations, and Events.",
  dimensions: {
    id: { sql: "o.id", alias: "id", type: "string" },
    traceId: { sql: "o.trace_id", alias: "traceId", type: "string" },
    type: { sql: "o.type", alias: "type", type: "string" },
    name: { sql: "o.name", alias: "name", type: "string" },
    level: { sql: "o.level", alias: "level", type: "string" },
    version: { sql: "o.version", alias: "version", type: "string" },
    parentObservationId: {
      sql: "o.parent_observation_id",
      alias: "parentObservationId",
      type: "string",
    },
    environment: {
      sql: "o.environment",
      alias: "environment",
      type: "string",
    },
    providedModelName: {
      sql: "o.provided_model_name",
      alias: "providedModelName",
      type: "string",
    },
    promptName: {
      sql: "o.prompt_name",
      alias: "promptName",
      type: "string",
    },
    promptVersion: {
      sql: "o.prompt_version",
      alias: "promptVersion",
      type: "string",
    },
    startTimeMonth: {
      sql: "date_format(o.start_time, '%Y-%m')",
      alias: "startTimeMonth",
      type: "string",
    },
    // trace-joined dimensions (relation `traces`, alias `t`)
    traceName: {
      sql: "t.name",
      alias: "traceName",
      type: "string",
      relationTable: "traces",
    },
    userId: {
      sql: "t.user_id",
      alias: "userId",
      type: "string",
      relationTable: "traces",
    },
    sessionId: {
      sql: "t.session_id",
      alias: "sessionId",
      type: "string",
      relationTable: "traces",
    },
    tags: {
      sql: "t.tags",
      alias: "tags",
      type: "string[]",
      relationTable: "traces",
    },
    traceRelease: {
      sql: "t.release",
      alias: "traceRelease",
      type: "string",
      relationTable: "traces",
    },
    traceVersion: {
      sql: "t.version",
      alias: "traceVersion",
      type: "string",
      relationTable: "traces",
    },
    // by-type key dimensions (app-side dynamic expansion)
    costType: {
      sql: BYTYPE_SQL,
      alias: "costType",
      type: "string",
      pairExpand: { valuesSql: "o.cost_details", valueAlias: "cost_value" },
    },
    usageType: {
      sql: BYTYPE_SQL,
      alias: "usageType",
      type: "string",
      pairExpand: { valuesSql: "o.usage_details", valueAlias: "usage_value" },
    },
    // experiment dimensions (relation `dataset_run_items`, alias `dri`); experiment = dataset run.
    experimentName: {
      sql: "dri.experiment_name",
      alias: "experimentName",
      type: "string",
      relationTable: "dataset_run_items",
    },
    experimentId: {
      sql: "dri.experiment_id",
      alias: "experimentId",
      type: "string",
      relationTable: "dataset_run_items",
    },
    experimentDatasetId: {
      sql: "dri.experiment_dataset_id",
      alias: "experimentDatasetId",
      type: "string",
      relationTable: "dataset_run_items",
    },
  },
  measures: {
    count: { sql: "*", alias: "count", type: "integer", unit: "observations" },
    latency: {
      sql: ROW_LATENCY_MS,
      alias: "latency",
      type: "integer",
      unit: "millisecond",
    },
    streamingLatency: {
      sql: "CASE WHEN o.completion_start_time IS NULL THEN NULL ELSE CAST((to_unixtime(o.end_time) - to_unixtime(o.completion_start_time)) * 1000 AS BIGINT) END",
      alias: "streamingLatency",
      type: "integer",
      unit: "millisecond",
    },
    timeToFirstToken: {
      sql: "CASE WHEN o.completion_start_time IS NULL THEN NULL ELSE CAST((to_unixtime(o.completion_start_time) - to_unixtime(o.start_time)) * 1000 AS BIGINT) END",
      alias: "timeToFirstToken",
      type: "integer",
      unit: "millisecond",
    },
    inputTokens: {
      sql: knownKey("o", "usage_details", "input"),
      alias: "inputTokens",
      type: "integer",
      unit: "tokens",
    },
    outputTokens: {
      sql: knownKey("o", "usage_details", "output"),
      alias: "outputTokens",
      type: "integer",
      unit: "tokens",
    },
    totalTokens: {
      sql: knownKey("o", "usage_details", "total"),
      alias: "totalTokens",
      type: "integer",
      unit: "tokens",
    },
    inputCost: {
      sql: knownKey("o", "cost_details", "input"),
      alias: "inputCost",
      type: "decimal",
      unit: "USD",
    },
    outputCost: {
      sql: knownKey("o", "cost_details", "output"),
      alias: "outputCost",
      type: "decimal",
      unit: "USD",
    },
    totalCost: {
      sql: "o.total_cost",
      alias: "totalCost",
      type: "decimal",
      unit: "USD",
    },
    countScores: {
      sql: "count(*)",
      alias: "countScores",
      type: "integer",
      relationTable: "scores",
      unit: "scores",
    },
    // by-type value measures (require the matching key dimension; expanded app-side)
    costByType: {
      sql: BYTYPE_SQL,
      alias: "costByType",
      type: "decimal",
      unit: "USD",
      requiresDimension: "costType",
    },
    usageByType: {
      sql: BYTYPE_SQL,
      alias: "usageByType",
      type: "integer",
      unit: "tokens",
      requiresDimension: "usageType",
    },
  },
  tableRelations: {
    traces: {
      name: "traces",
      joinConditionSql: "ON o.trace_id = t.id AND o.project_id = t.project_id",
      timeDimension: "timestamp",
    },
    scores: {
      name: "scores",
      joinConditionSql:
        "ON o.id = sc.observation_id AND o.project_id = sc.project_id",
      timeDimension: "timestamp",
    },
    dataset_run_items: datasetRunItemsRelation(
      "ON o.project_id = dri.project_id AND o.trace_id = dri.trace_id",
    ),
  },
  segments: [],
  timeDimension: "start_time",
  baseCte: "observations",
};

// ---------------------------------------------------------------------------
// scores views (alias `s`) — leaf; trace/observation-joined dims collapse to plain projection joins
// ---------------------------------------------------------------------------

const scoreSharedDimensions: DimensionsDeclarationType = {
  id: { sql: "s.id", alias: "id", type: "string" },
  environment: { sql: "s.environment", alias: "environment", type: "string" },
  name: { sql: "s.name", alias: "name", type: "string" },
  source: { sql: "s.source", alias: "source", type: "string" },
  dataType: { sql: "s.data_type", alias: "dataType", type: "string" },
  traceId: { sql: "s.trace_id", alias: "traceId", type: "string" },
  sessionId: { sql: "s.session_id", alias: "sessionId", type: "string" },
  observationId: {
    sql: "s.observation_id",
    alias: "observationId",
    type: "string",
  },
  configId: { sql: "s.config_id", alias: "configId", type: "string" },
  timestampMonth: {
    sql: "date_format(s.timestamp, '%Y-%m')",
    alias: "timestampMonth",
    type: "string",
  },
  timestampDay: {
    sql: "date_format(s.timestamp, '%Y-%m-%d')",
    alias: "timestampDay",
    type: "string",
  },
  // trace/observation-joined dimensions collapse onto the merged projection
  traceName: {
    sql: "t.name",
    alias: "traceName",
    type: "string",
    relationTable: "traces",
  },
  userId: {
    sql: "t.user_id",
    alias: "userId",
    type: "string",
    relationTable: "traces",
  },
  tags: {
    sql: "t.tags",
    alias: "tags",
    type: "string[]",
    relationTable: "traces",
  },
  traceRelease: {
    sql: "t.release",
    alias: "traceRelease",
    type: "string",
    relationTable: "traces",
  },
  traceVersion: {
    sql: "t.version",
    alias: "traceVersion",
    type: "string",
    relationTable: "traces",
  },
  observationName: {
    sql: "o.name",
    alias: "observationName",
    type: "string",
    relationTable: "observations",
  },
  observationModelName: {
    sql: "o.provided_model_name",
    alias: "observationModelName",
    type: "string",
    relationTable: "observations",
  },
  observationPromptName: {
    sql: "o.prompt_name",
    alias: "observationPromptName",
    type: "string",
    relationTable: "observations",
  },
  observationPromptVersion: {
    sql: "o.prompt_version",
    alias: "observationPromptVersion",
    type: "string",
    relationTable: "observations",
  },
  // Run-level scores carry `dataset_run_id` on the projection directly (experiment = dataset run).
  datasetRunId: {
    sql: "s.dataset_run_id",
    alias: "datasetRunId",
    type: "string",
  },
  // Observation-attached experiment identity, correlated by trace through `dataset_run_items`.
  experimentName: {
    sql: "dri.experiment_name",
    alias: "experimentName",
    type: "string",
    relationTable: "dataset_run_items",
  },
  experimentId: {
    sql: "dri.experiment_id",
    alias: "experimentId",
    type: "string",
    relationTable: "dataset_run_items",
  },
};

const scoreRelations: ViewDeclarationType["tableRelations"] = {
  traces: {
    name: "traces",
    joinConditionSql: "ON s.trace_id = t.id AND s.project_id = t.project_id",
    timeDimension: "timestamp",
  },
  observations: {
    name: "observations",
    joinConditionSql:
      "ON s.observation_id = o.id AND s.project_id = o.project_id",
    timeDimension: "start_time",
  },
  dataset_run_items: datasetRunItemsRelation(
    "ON s.project_id = dri.project_id AND s.trace_id = dri.trace_id",
  ),
};

const scoresNumericView: ViewDeclarationType = {
  name: "scores_numeric",
  description:
    "Scores are flexible objects used for evaluations. This view contains numeric and boolean scores.",
  dimensions: {
    ...scoreSharedDimensions,
    value: { sql: "s.value", alias: "value", type: "number" },
  },
  measures: {
    count: { sql: "*", alias: "count", type: "integer", unit: "scores" },
    value: { sql: "s.value", alias: "value", type: "number" },
  },
  tableRelations: scoreRelations,
  segments: [
    {
      column: "data_type",
      operator: "any of",
      value: ["NUMERIC", "BOOLEAN"],
      type: "stringOptions",
    },
  ],
  timeDimension: "timestamp",
  baseCte: "scores",
};

const scoresCategoricalView: ViewDeclarationType = {
  name: "scores_categorical",
  description:
    "Scores are flexible objects used for evaluations. This view contains categorical scores.",
  dimensions: {
    ...scoreSharedDimensions,
    stringValue: {
      sql: "s.string_value",
      alias: "stringValue",
      type: "string",
    },
  },
  measures: {
    count: { sql: "*", alias: "count", type: "integer", unit: "scores" },
  },
  tableRelations: scoreRelations,
  segments: [
    {
      column: "data_type",
      operator: "=",
      value: "CATEGORICAL",
      type: "string",
    },
  ],
  timeDimension: "timestamp",
  baseCte: "scores",
};

const greptimeViewDeclarations: {
  readonly [K in z.infer<typeof views>]: ViewDeclarationType;
} = {
  traces: tracesView,
  observations: observationsView,
  "scores-numeric": scoresNumericView,
  "scores-categorical": scoresCategoricalView,
};

// High-cardinality identity dimensions: grouping by these without a bound (timeDimension /
// entityDimension / row_limit) produces unbounded result sets. `validateQuery` enforces the same
// bounding rules the ClickHouse engine did; flag them on the single GreptimeDB model so validation
// and execution agree (mirrors the CH v2 highCardinality set, minus deferred experiment fields).
const HIGH_CARDINALITY_FIELDS = [
  "id",
  "traceId",
  "observationId",
  "userId",
  "sessionId",
  "parentObservationId",
  "datasetRunId",
  "experimentId",
  "experimentName",
  "experimentDatasetId",
];
for (const view of Object.values(greptimeViewDeclarations)) {
  for (const field of HIGH_CARDINALITY_FIELDS) {
    const dim = view.dimensions[field];
    if (dim) dim.highCardinality = true;
  }
}

/**
 * Resolve a GreptimeDB dashboard view declaration. Version-agnostic: both CH v1 and v2 collapse onto
 * the same merged projection view.
 */
export function getGreptimeViewDeclaration(
  viewName: z.infer<typeof views>,
): ViewDeclarationType {
  const view = greptimeViewDeclarations[viewName];
  if (!view) {
    throw new InvalidRequestError(
      `View '${viewName}' is not supported on GreptimeDB. Supported views: ${Object.keys(greptimeViewDeclarations).join(", ")}`,
    );
  }
  return view;
}

/**
 * Runtime view resolver used by BOTH execution (greptimeQueryBuilder) and validation
 * (validateQuery / monitors isValidQuery), so accepted metrics/dimensions match what actually runs
 * on GreptimeDB (no validation/execution split-brain). The `version` argument is accepted for call
 * compatibility and ignored — GreptimeDB collapses v1/v2.
 */
export function getRuntimeViewDeclaration(
  viewName: z.infer<typeof views>,
  _version: ViewVersion = "v1",
): ViewDeclarationType {
  return getGreptimeViewDeclaration(viewName);
}

/** Throws if a field is a GreptimeDB-unsupported (P4-deferred) experiment/dataset-run field. */
export function assertGreptimeSupportedField(field: string): void {
  if (GREPTIME_UNSUPPORTED.has(field)) {
    throw new InvalidRequestError(
      `Field '${field}' is not supported on GreptimeDB yet (experiment / dataset-run dimensions are deferred to P4).`,
    );
  }
}
