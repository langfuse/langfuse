/**
 * The v2 score views (`scores-numeric`, `scores-categorical`,
 * `scores-boolean` and the internal `scores-listable-count` in
 * `../dataModel.ts`) as query-AST expressions: every dimension and measure,
 * keyed by the views' names, and how a dashboard filter compares each
 * dimension. Server-only; names, labels, relations and the other view
 * metadata stay in `dataModel.ts`, which the client imports. One registry
 * serves the four views: they differ only in their segment and in which
 * value dimension and measures they declare, and the query builder looks up
 * only what a view declares.
 *
 * Entries read the score as `scores` (unaliased) and the view's two
 * relations under the names the query joins them as:
 * - `e`: the score's observation, an `events` row; the entries reuse the v2
 *   observations view's expressions (`EVENTS_OBSERVATIONS_DIMENSIONS`);
 * - `events_traces`: the score's trace attributes aggregated over its spans
 *   (`eventsTraceAttributes`); each entry names the column it reads, so the
 *   subquery selects only those.
 *
 * Filters lower through `lowerFieldCondition` to the templates `FilterList`
 * renders for the same columns: plain columns compare `null` with NULL
 * alone (`nullableString`), `nullIf(col, '')` dimensions filter `col` with
 * `''` and NULL as one value.
 */
import {
  expressionBuilder,
  type AliasableExpression,
  type Expression,
  type ExpressionBuilder,
} from "kysely";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import { QueryCompileError } from "../../../server/query-ast/errors";
import {
  formatDateTime,
  literal,
  mapValue,
  nullIf,
  toBool,
} from "../../../server/query-ast/extensions";
import type { ClickHouseDatabase } from "../../../server/query-ast/schema";
import type {
  FieldLowering,
  ScalarFieldLowering,
} from "../../../server/repositories/events-predicate-fields";
import { EvalExecutionMetadataKey } from "../../evals/evalExecutionMetadata";
import {
  aggregationSlot,
  EVENTS_OBSERVATIONS_DIMENSIONS,
  type DimensionEntry,
  type QueryLevel,
} from "./eventsObservationsRegistry";
import type { TraceAttributeColumn } from "./eventsTraceAttributes";
import { entryOf } from "./registryEntry";

/** A row of the `events_traces` subquery (`eventsTraceAttributes`). */
type TraceAttributesRow = {
  id: string;
  project_id: string;
  name: string | null;
  user_id: string;
  release: string;
  version: string;
  tags: string[];
};

/** The relations a v2 score query can read, by the names it reads them as. */
type ScoresDb = {
  scores: ClickHouseDatabase["scores"];
  e: ClickHouseDatabase["events"];
  events_traces: TraceAttributesRow;
};

/**
 * Builder of the entries: it admits every relation of {@link ScoresDb}; the
 * query joins the relation an entry's dimension declares in `dataModel.ts`
 * (`relationTable`) before it reads the entry.
 */
export type ScoresBuilder = ExpressionBuilder<ScoresDb, keyof ScoresDb>;

/**
 * {@link ScoresBuilder} for the entries, detached from the query: the query
 * adds its joins conditionally, so its own builder is typed over `scores`
 * alone.
 */
export const scoresExpressionBuilder = (): ScoresBuilder =>
  expressionBuilder<ScoresDb, keyof ScoresDb>();

/** An entry's value of type `T`, built with {@link ScoresBuilder}. */
type Read<T> = (eb: ScoresBuilder) => AliasableExpression<T>;

/** A dimension of the score views. */
type ScoreDimension = {
  expression: Read<unknown>;
  filter: ScalarFieldLowering<ScoresBuilder>;
  /** For an `events_traces` dimension: the subquery column it reads. */
  traceColumn?: TraceAttributeColumn;
};

const nullIfEmpty = (value: Expression<string | null>) =>
  nullIf(value, literal(""));

/** A column filtered as it is; `null` conditions compare it with NULL. */
const plainDimension = (value: Read<string | null>): ScoreDimension => ({
  expression: value,
  filter: { kind: "nullableString", value },
});

/** `nullIf(column, '')`, filtered on `column` with `''` and NULL as one value. */
const nullIfEmptyDimension = (column: Read<string | null>): ScoreDimension => ({
  expression: (eb) => nullIfEmpty(column(eb)),
  filter: { kind: "nullableString", value: column, emptyEqualsNull: true },
});

/** A number or boolean dimension, filtered as it is. */
const scalarDimension = (value: Read<unknown>): ScoreDimension => ({
  expression: value,
  filter: { kind: "scalar", value },
});

/** A trace attribute of the `events_traces` subquery. */
const traceDimension = (
  traceColumn: TraceAttributeColumn,
  dimension: ScoreDimension,
): ScoreDimension => ({ ...dimension, traceColumn });

/**
 * An observation dimension of the v2 observations view, read from the
 * joined `e`. Its filter drops that view's index facts, so a score filter on
 * the joined relation adds no index prefilter, and compares `null` with
 * NULL alone unless the dimension is `nullIf(col, '')`.
 */
const observationDimension = ({
  expression,
  filter,
}: DimensionEntry): ScoreDimension => {
  if (!filter || filter.kind === "array") {
    throw new QueryCompileError(
      "Score views read only scalar observation dimensions.",
    );
  }
  if (filter.kind !== "string") return { expression, filter };
  return {
    expression,
    filter: filter.emptyEqualsNull
      ? { kind: "string", value: filter.value, emptyEqualsNull: true }
      : { kind: "nullableString", value: filter.value },
  };
};

/**
 * `metadata['evaluator_test'] = 'true'` as a boolean: the score belongs to an
 * evaluator test run.
 */
const isEvaluatorTest = (eb: ScoresBuilder) =>
  toBool(
    eb(
      mapValue<string>(
        eb.ref("scores.metadata"),
        literal(EvalExecutionMetadataKey.EVALUATOR_TEST),
      ),
      "=",
      literal("true"),
    ),
  );

/**
 * Dimensions of the v2 score views, keyed by name: the shared ones in
 * `scoresV2BaseDimensions` and `createScoreSpecificDimensions` order, then
 * each view's own value dimension.
 */
const SCORE_DIMENSIONS = {
  sessionId: plainDimension((eb) => eb.ref("scores.session_id")),
  datasetRunId: nullIfEmptyDimension((eb) => eb.ref("scores.dataset_run_id")),
  traceName: traceDimension(
    "name",
    plainDimension((eb) => eb.ref("events_traces.name")),
  ),
  userId: traceDimension(
    "user_id",
    nullIfEmptyDimension((eb) => eb.ref("events_traces.user_id")),
  ),
  tags: traceDimension("tags", {
    expression: (eb) => eb.ref("events_traces.tags"),
    filter: { kind: "array", value: (eb) => eb.ref("events_traces.tags") },
  }),
  traceRelease: traceDimension(
    "release",
    nullIfEmptyDimension((eb) => eb.ref("events_traces.release")),
  ),
  traceVersion: traceDimension(
    "version",
    nullIfEmptyDimension((eb) => eb.ref("events_traces.version")),
  ),
  observationName: observationDimension(EVENTS_OBSERVATIONS_DIMENSIONS.name),
  observationModelName: observationDimension(
    EVENTS_OBSERVATIONS_DIMENSIONS.providedModelName,
  ),
  observationPromptName: observationDimension(
    EVENTS_OBSERVATIONS_DIMENSIONS.promptName,
  ),
  observationPromptVersion: observationDimension(
    EVENTS_OBSERVATIONS_DIMENSIONS.promptVersion,
  ),
  experimentName: observationDimension(
    EVENTS_OBSERVATIONS_DIMENSIONS.experimentName,
  ),
  experimentId: observationDimension(
    EVENTS_OBSERVATIONS_DIMENSIONS.experimentId,
  ),
  id: plainDimension((eb) => eb.ref("scores.id")),
  environment: plainDimension((eb) => eb.ref("scores.environment")),
  name: plainDimension((eb) => eb.ref("scores.name")),
  evaluatorId: plainDimension((eb) => eb.ref("scores.evaluator_id")),
  ruleId: plainDimension((eb) => eb.ref("scores.evaluation_rule_id")),
  isEvaluatorTest: scalarDimension(isEvaluatorTest),
  source: plainDimension((eb) => eb.ref("scores.source")),
  dataType: plainDimension((eb) => eb.ref("scores.data_type")),
  traceId: plainDimension((eb) => eb.ref("scores.trace_id")),
  configId: plainDimension((eb) => eb.ref("scores.config_id")),
  timestampMonth: plainDimension((eb) =>
    formatDateTime(eb.ref("scores.timestamp"), literal("%Y-%m")),
  ),
  timestampDay: plainDimension((eb) =>
    formatDateTime(eb.ref("scores.timestamp"), literal("%Y-%m-%d")),
  ),
  observationId: plainDimension((eb) => eb.ref("scores.observation_id")),
  // scores-numeric
  value: scalarDimension((eb) => eb.ref("scores.value")),
  // scores-categorical
  stringValue: plainDimension((eb) => eb.ref("scores.string_value")),
  // scores-boolean
  booleanValue: scalarDimension((eb) => toBool(eb.ref("scores.value"))),
} satisfies Record<string, ScoreDimension>;

/** The dimension `name`; the caller has checked the view declares it. */
export function scoreDimension(name: string): ScoreDimension {
  return entryOf<ScoreDimension>(
    SCORE_DIMENSIONS,
    name,
    "Dimension",
    "SCORE_DIMENSIONS",
  );
}

/** The `timestamp` time dimension, filtered as it is. */
const TIMESTAMP_FILTER: ScalarFieldLowering<ScoresBuilder> = {
  kind: "scalar",
  value: (eb) => eb.ref("scores.timestamp"),
};

/** The keyed `metadata` map. */
const METADATA_FILTER: FieldLowering<ScoresBuilder> = {
  kind: "mapMetadata",
  map: (eb) => eb.ref("scores.metadata"),
};

/**
 * What a dashboard filter on `column` compares: the
 * {@link ScoreDimension.filter} of `dimension`, the view dimension the
 * caller resolved `column` to, else the time dimension `timestamp` or the
 * keyed `metadata`. Throws `InvalidRequestError` for any other column,
 * listing `dimensions` (the view's declared dimensions). A `null` filter on
 * the array dimension `tags` tests emptiness, since ClickHouse arrays are
 * never NULL.
 */
export function scoreFilterLowering(
  column: string,
  dimension: string | undefined,
  dimensions: Readonly<Record<string, unknown>>,
): FieldLowering<ScoresBuilder> {
  if (dimension !== undefined) return scoreDimension(dimension).filter;
  if (column === "timestamp") return TIMESTAMP_FILTER;
  if (column === "metadata") return METADATA_FILTER;
  throw new InvalidRequestError(
    `Invalid filter column ${column}. Must be one of ${Object.keys(dimensions)} or timestamp`,
  );
}

/** The `data_type` column a view's segment compares. */
export const SEGMENT_FILTER: ScalarFieldLowering<ScoresBuilder> = {
  kind: "nullableString",
  value: (eb) => eb.ref("scores.data_type"),
};

/**
 * Measures of the v2 score views at a query level: `count` counts scores,
 * `value` reads the score's value. Each has one `@@AGG1@@` slot in the
 * view's string ({@link aggregationSlot}). The strings read `value`
 * unqualified; the entry qualifies it, since the compiler rejects a bare
 * column in a SELECT that also joins a relation.
 */
const SCORE_MEASURES = {
  count: (_eb: ScoresBuilder, level: QueryLevel) =>
    aggregationSlot({ agg1: "count" }, level)("agg1", literal(1)),
  value: (eb: ScoresBuilder, level: QueryLevel) =>
    aggregationSlot({ agg1: "any" }, level)("agg1", eb.ref("scores.value")),
} satisfies Record<
  string,
  (eb: ScoresBuilder, level: QueryLevel) => AliasableExpression<unknown>
>;

/** The measure `name` at `level`; the caller has checked the view declares it. */
export function scoreMeasure(
  eb: ScoresBuilder,
  name: string,
  level: QueryLevel,
): AliasableExpression<unknown> {
  const measure = entryOf<
    (eb: ScoresBuilder, level: QueryLevel) => AliasableExpression<unknown>
  >(SCORE_MEASURES, name, "Measure", "SCORE_MEASURES");
  return measure(eb, level);
}
