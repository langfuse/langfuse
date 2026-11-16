/**
 * The v2 observations view (`eventsObservationsView` in `../dataModel.ts`) as
 * query-AST expressions: every dimension, measure, pair-expanded value list and
 * the scores join condition, keyed by the view's names, and how a dashboard
 * filter compares each dimension. Server-only; names, labels and the other
 * view metadata stay in `dataModel.ts`, which the client imports. Each entry
 * renders the same SQL as the view's `sql` string
 * (`eventsObservationsRegistry.golden.test.ts`), up to the relation alias.
 *
 * Entries read the view's base relation as `e`, so they share the `e`-scoped
 * expressions of `repositories/events-selects.ts`; the legacy strings call it
 * `events_observations`. Entries pick no table: the query that uses them
 * reads `events_truncated`, and routing picks `events_core` or
 * `events_full` from its filters.
 */
import {
  ExpressionWrapper,
  sql,
  type AliasableExpression,
  type Expression,
  type ExpressionBuilder,
} from "kysely";

import { InvalidRequestError } from "../../../errors/InvalidRequestError";
import {
  arrayDistinct,
  countEqual,
  arrayLength,
  dateDiff,
  formatDateTime,
  ifElse,
  isNull,
  literal,
  mapKeys,
  firstMetadataValue,
  mapValue,
  mapValues,
  nullIf,
  sumMapValuesWhereKeyContains,
  templateAggregate,
  toBool,
  toNullable,
  tupleArrayField,
  typedNull,
  uniq,
  type TemplateAggregate,
  type TemplateAggregateResult,
} from "../../../server/query-ast/extensions";
import { QueryCompileError } from "../../../server/query-ast/errors";
import type { ClickHouseDatabase } from "../../../server/query-ast/schema";
import type {
  EventsFieldLowering,
  ScalarFieldLowering,
} from "../../../server/repositories/events-predicate-fields";
import {
  eventsIsRootObservation,
  eventsTraceName,
} from "../../../server/repositories/events-selects";
import {
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "../../ai-gateway/constants";

/** The relations a v2 observations query reads: events as `e`, and `scores`. */
export type ObservationsDb = {
  e: ClickHouseDatabase["events"];
  scores: ClickHouseDatabase["scores"];
};

/** Builder of a query that reads the view's base relation as `e`. */
export type ObservationsBuilder = ExpressionBuilder<ObservationsDb, "e">;

/** {@link ObservationsBuilder} with the `scores` relation joined. */
type ObservationsWithScoresBuilder = ExpressionBuilder<
  ObservationsDb,
  "e" | "scores"
>;

/** Level of a dashboard query: `two` has an inner aggregating select. */
export type QueryLevel = "single" | "two";

/**
 * What a template measure calls where the legacy SQL has a `@@AGGn@@`
 * marker: `agg("agg1", v)` stands for `@@AGG1@@(v)`.
 *
 * - `A`: the measure's `aggs` (`{ agg1: "sumMap"; agg2: "any" }`), fixed once
 *   per measure by {@link templateMeasure}.
 * - `K`: the slot named at the call; a name outside `A` is a type error.
 * - `T`: the type of `v`, inferred per call, so one measure can read columns
 *   of different types.
 * - Result: `T` at level `single` (marker stripped), else
 *   {@link TemplateAggregateResult} of `A[K]` (`count`/`sum` give `number`,
 *   `any`/`sumMap` keep `T`). The level is known only at run time
 *   ({@link aggregationSlot}), so the type is the union.
 */
type AggregationSlot<A extends Record<string, TemplateAggregate>> = <
  K extends keyof A & string,
  T,
>(
  slot: K,
  value: Expression<T>,
) => AliasableExpression<T | TemplateAggregateResult<A[K], T>>;

/** A dimension's row value over `e`. */
type Read<T> = (eb: ObservationsBuilder) => AliasableExpression<T>;

/** An array dimension's value; a tuple field of an `Array(Tuple(…))` column can be NULL. */
type StringArray = Array<string | null>;

/**
 * What a dashboard filter on a dimension compares, as the events predicate
 * lowering takes it: the expression, or for a `nullIf(col, '')` dimension the
 * column `col` with `''` and NULL as one value, so an index on `col` still
 * prunes.
 */
type DimensionFilter = ScalarFieldLowering;

/**
 * A dimension with a non-array value, e.g. `environment`:
 * `SELECT nullIf(e.environment, '') AS environment`.
 */
type ScalarDimension = {
  array?: undefined;
  expression: Read<unknown>;
  filter: DimensionFilter;
};

/**
 * A dimension with a `String` array value, which a query can explode into one
 * row per element, e.g. `toolNames`:
 * `SELECT arrayJoin(mapKeys(e.tool_definitions)) AS toolNames`.
 */
type ArrayDimension = {
  array: true;
  expression: Read<StringArray>;
  /** Absent where the view rejects filters (the pair-expanded dimensions). */
  filter?: DimensionFilter;
  /**
   * For a dimension over map keys (`costType` = `mapKeys(cost_details)`): the
   * matching values (`mapValues(cost_details)`). The query ARRAY JOINs both
   * arrays side by side, one row per key, with its value as `valueAlias`
   * (`cost_value`) for the measures that name this dimension:
   * `FROM events_core AS e ARRAY JOIN mapKeys(e.cost_details) AS costType, mapValues(e.cost_details) AS cost_value`;
   * the SELECT reads `costType`, and the `costByType` measure reads `sum(cost_value)`.
   */
  pairExpand?: {
    values: Read<unknown[]>;
    valueAlias: string;
  };
};

/** A dimension of the view, told apart by `array`. */
export type DimensionEntry = ScalarDimension | ArrayDimension;

/**
 * The view's three measure shapes:
 * - template: has `@@AGGn@@` slots, so it is built per query level
 *   ({@link templateMeasure});
 * - relation: reads the joined `scores` relation, so its builder has `scores`
 *   in scope. Only `countScores` has it, and its `uniq(scores.id)` has no slot
 *   and reads no dimension alias;
 * - alias: reads only a select alias a dimension brings into scope
 *   (`cost_value`), so it has no slot either.
 *
 * Each shape needs a different `expression` signature (with a level, with
 * `scores` in scope, or neither), so one object type can't hold all three.
 * Consumers tell them apart with `"aggs" in entry` and
 * `"relationTable" in entry`.
 */
export type MeasureEntry =
  | {
      /** Aggregates the slots apply in the inner select of a two-level query. */
      aggs: Record<string, TemplateAggregate>;
      /** Reads a select alias the named dimension brings into scope. */
      requiresDimension?: string;
      expression: (
        eb: ObservationsBuilder,
        level: QueryLevel,
      ) => AliasableExpression<unknown>;
    }
  | {
      /** The view relation the query joins when it selects this measure. */
      relationTable: "scores";
      expression: (
        eb: ObservationsWithScoresBuilder,
      ) => AliasableExpression<unknown>;
    }
  | {
      /** Reads a select alias the named dimension brings into scope. */
      requiresDimension: string;
      expression: (eb: ObservationsBuilder) => AliasableExpression<unknown>;
    };

/**
 * A template measure. Infers `A` from `aggs`, checks every `agg(...)` in
 * `expression` against it ({@link AggregationSlot}), then drops it: the entry
 * is `(eb, level) => …`, so a consumer passes only the query level.
 */
function templateMeasure<A extends Record<string, TemplateAggregate>>(entry: {
  aggs: A;
  requiresDimension?: string;
  expression: (
    eb: ObservationsBuilder,
    agg: AggregationSlot<A>,
  ) => AliasableExpression<unknown>;
}): MeasureEntry {
  return {
    ...entry,
    expression: (eb, level) =>
      entry.expression(eb, aggregationSlot(entry.aggs, level)),
  };
}

/**
 * The slot function of a measure for a query level: `single` returns the row
 * value, and the caller wraps the whole measure in the requested aggregation
 * (`QueryBuilder.translateAggregation` for the string version); `two` applies
 * the slot's aggregate from `aggs` in the inner select.
 */
export function aggregationSlot<A extends Record<string, TemplateAggregate>>(
  aggs: A,
  level: QueryLevel,
): AggregationSlot<A> {
  if (level === "single")
    return (_slot, value) => new ExpressionWrapper(value.toOperationNode());
  return (slot, value) => {
    const fn = aggs[slot];
    if (fn === undefined) {
      throw new QueryCompileError(`Measure has no aggregation slot "${slot}".`);
    }
    return templateAggregate(fn, value);
  };
}

const nullIfEmpty = (value: Expression<string>) => nullIf(value, literal(""));

/** The span came through the AI Gateway. */
const viaAiGateway = (eb: ObservationsBuilder) =>
  eb("e.service_name", "=", literal(AI_GATEWAY_SERVICE_NAME));

/**
 * The time spans the view measures, as `[start, end]` columns.
 * `completion_start_time` (first token) ends one span and starts another.
 */
type Interval =
  | readonly ["start_time", "end_time"] // latency
  | readonly ["start_time", "completion_start_time"] // time to first token
  | readonly ["completion_start_time", "end_time"]; // streaming

/**
 * `start` to `end` in `unit`, both read through `agg`:
 * `date_diff(unit, agg(start), agg(end))`.
 */
const aggregatedDiff = <A extends Record<string, TemplateAggregate>>(
  eb: ObservationsBuilder,
  agg: AggregationSlot<A>,
  slot: keyof A & string,
  unit: "millisecond" | "second",
  [start, end]: Interval,
) =>
  dateDiff(
    unit,
    agg(slot, eb.ref(`e.${start}`)),
    agg(slot, eb.ref(`e.${end}`)),
  );

/**
 * NULL while the completion start is unset, else `start` to `end` in
 * milliseconds.
 */
const sinceCompletionStart = (
  eb: ObservationsBuilder,
  agg: AggregationSlot<{ agg1: "any" }>,
  interval: Interval,
) =>
  ifElse(
    isNull(agg("agg1", eb.ref("e.completion_start_time"))),
    typedNull("Nullable(Int64)"),
    aggregatedDiff(eb, agg, "agg1", "millisecond", interval),
  );

/**
 * A string dimension, filtered as it is. `ngramIndexed`: `events_full`
 * keeps an ngram index on `lower(<col>)`, so string filters add a `lower()`
 * conjunct it prunes with.
 */
const stringDimension = (
  value: Read<string>,
  facts: { ngramIndexed?: true } = {},
): ScalarDimension => ({
  expression: value,
  filter: { kind: "string", value, ...facts },
});

/** `nullIf(column, '')`, filtered on `column` with `''` and NULL as one value. */
const nullIfEmptyDimension = (
  column: Read<string>,
  facts: { ngramIndexed?: true } = {},
): ScalarDimension => ({
  expression: (eb) => nullIfEmpty(column(eb)),
  filter: { kind: "string", value: column, emptyEqualsNull: true, ...facts },
});

/** A string dimension that can be NULL, filtered as it is. */
const nullableStringDimension = (
  value: Read<string | null>,
): ScalarDimension => ({
  expression: value,
  filter: { kind: "nullableString", value },
});

/** An array dimension, filtered by `arrayOptions`. */
const arrayDimension = (value: Read<StringArray>): ArrayDimension => ({
  array: true,
  expression: value,
  filter: { kind: "array", value },
});

/** A number or boolean dimension, filtered as it is. */
const scalarDimension = (value: Read<unknown>): ScalarDimension => ({
  expression: value,
  filter: { kind: "scalar", value },
});

/** Dimensions of the v2 observations view, keyed by name, in view order. */
export const EVENTS_OBSERVATIONS_DIMENSIONS = {
  id: stringDimension((eb) => eb.ref("e.span_id")),
  evaluatorId: nullableStringDimension((eb) =>
    eb.fn.coalesce(
      nullIfEmpty(eb.ref("e.evaluator_id")),
      eb.ref("e.evaluation_rule_id"),
    ),
  ),
  isEvaluatorTest: scalarDimension((eb) =>
    eb.ref("e.evaluator_execution_is_test"),
  ),
  traceId: stringDimension((eb) => eb.ref("e.trace_id")),
  environment: nullIfEmptyDimension((eb) => eb.ref("e.environment")),
  parentObservationId: nullIfEmptyDimension((eb) => eb.ref("e.parent_span_id")),
  isRootObservation: scalarDimension((eb) =>
    toBool(eventsIsRootObservation(eb)),
  ),
  type: stringDimension((eb) => eb.ref("e.type")),
  name: stringDimension((eb) => eb.ref("e.name"), { ngramIndexed: true }),
  level: stringDimension((eb) => eb.ref("e.level")),
  version: nullIfEmptyDimension((eb) => eb.ref("e.version")),
  userId: nullIfEmptyDimension((eb) => eb.ref("e.user_id"), {
    ngramIndexed: true,
  }),
  sessionId: nullIfEmptyDimension((eb) => eb.ref("e.session_id"), {
    ngramIndexed: true,
  }),
  // Ingestion only writes the gateway service name on uploads the gateway
  // authenticated, and then sets ingestion_api_key to the gateway key id.
  aiGatewayKeyId: nullableStringDimension((eb) =>
    ifElse(
      viaAiGateway(eb),
      nullIfEmpty(eb.ref("e.ingestion_api_key")),
      literal(null),
    ),
  ),
  // The span's user_id is not used: a key without an owner lets its caller
  // set any user ID. The owner ID comes from metadata the gateway writes,
  // so it outlives the key's deletion. The first entry of the key wins.
  // Routing keeps its `=`, `any of`, `starts with` and `is [not] null`
  // filters on events_core for short values: every owner-scoped gateway
  // analytics query carries one.
  aiGatewayKeyOwnerUserId: nullableStringDimension((eb) =>
    ifElse(
      viaAiGateway(eb),
      nullIfEmpty(
        firstMetadataValue(
          eb.ref("e.metadata_names"),
          eb.ref("e.metadata_values"),
          literal(AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY),
        ),
      ),
      literal(null),
    ),
  ),
  tags: arrayDimension((eb) => eb.ref("e.tags")),
  release: nullIfEmptyDimension((eb) => eb.ref("e.release")),
  traceName: nullableStringDimension((eb) => eventsTraceName(eb)),
  traceRelease: nullIfEmptyDimension((eb) => eb.ref("e.release")),
  traceVersion: nullIfEmptyDimension((eb) => eb.ref("e.version")),
  providedModelName: nullIfEmptyDimension((eb) =>
    eb.ref("e.provided_model_name"),
  ),
  promptName: nullIfEmptyDimension((eb) => eb.ref("e.prompt_name")),
  promptVersion: scalarDimension((eb) => eb.ref("e.prompt_version")),
  startTimeMonth: stringDimension((eb) =>
    formatDateTime(eb.ref("e.start_time"), literal("%Y-%m")),
  ),
  skillNamesAvailable: arrayDimension((eb) =>
    arrayDistinct(tupleArrayField(eb.ref("e.skills_available"), "skillName")),
  ),
  skillsNamesLoaded: arrayDimension((eb) =>
    arrayDistinct(
      tupleArrayField(eb.ref("e.skills_resource_loaded"), "skillName"),
    ),
  ),
  skillIdsAvailable: arrayDimension((eb) =>
    arrayDistinct(
      tupleArrayField(eb.ref("e.skills_available"), "langfuseSkillId"),
    ),
  ),
  skillIdsLoaded: arrayDimension((eb) =>
    arrayDistinct(
      tupleArrayField(eb.ref("e.skills_resource_loaded"), "langfuseSkillId"),
    ),
  ),
  loadedFilePaths: arrayDimension((eb) =>
    arrayDistinct(
      tupleArrayField(eb.ref("e.skills_resource_loaded"), "filePath"),
    ),
  ),
  toolNames: arrayDimension((eb) => mapKeys(eb.ref("e.tool_definitions"))),
  calledToolNames: arrayDimension((eb) =>
    arrayDistinct(eb.ref("e.tool_call_names")),
  ),
  costType: {
    array: true,
    expression: (eb) => mapKeys(eb.ref("e.cost_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("e.cost_details")),
      valueAlias: "cost_value",
    },
  },
  usageType: {
    array: true,
    expression: (eb) => mapKeys(eb.ref("e.usage_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("e.usage_details")),
      valueAlias: "usage_value",
    },
  },
  experimentName: nullIfEmptyDimension((eb) => eb.ref("e.experiment_name")),
  experimentDatasetId: nullIfEmptyDimension((eb) =>
    eb.ref("e.experiment_dataset_id"),
  ),
  experimentId: nullIfEmptyDimension((eb) => eb.ref("e.experiment_id")),
} satisfies Record<string, DimensionEntry>;

/** {@link EVENTS_OBSERVATIONS_DIMENSIONS} keyed by any string. */
const DIMENSIONS_BY_NAME: Readonly<Partial<Record<string, DimensionEntry>>> =
  EVENTS_OBSERVATIONS_DIMENSIONS;

const isDimension = (name: string) =>
  Object.hasOwn(EVENTS_OBSERVATIONS_DIMENSIONS, name);

/** The dimension `name`; the caller has checked the view declares it. */
export function eventsObservationsDimension(name: string): DimensionEntry {
  const entry = isDimension(name) ? DIMENSIONS_BY_NAME[name] : undefined;
  if (!entry) {
    throw new QueryCompileError(
      `Dimension "${name}" has no entry in EVENTS_OBSERVATIONS_DIMENSIONS.`,
    );
  }
  return entry;
}

/** An {@link ArrayDimension} with its `pairExpand` values. */
type PairExpandedDimension = ArrayDimension & {
  pairExpand: NonNullable<ArrayDimension["pairExpand"]>;
};

/**
 * The array dimension `name`, which a query explodes (`explode`) or ARRAY
 * JOINs with its values (`pairExpand`); the caller has checked the view
 * declares it so. Throws `QueryCompileError` if the entry disagrees.
 */
export function eventsObservationsArrayDimension(
  name: string,
  use: "explode",
): ArrayDimension;
export function eventsObservationsArrayDimension(
  name: string,
  use: "pairExpand",
): PairExpandedDimension;
export function eventsObservationsArrayDimension(
  name: string,
  use: "explode" | "pairExpand",
): ArrayDimension {
  const entry = eventsObservationsDimension(name);
  if (!entry.array || (use === "pairExpand" && !entry.pairExpand)) {
    throw new QueryCompileError(
      `Dimension "${name}" has no ${use === "pairExpand" ? "pairExpand values" : "array value"} in EVENTS_OBSERVATIONS_DIMENSIONS.`,
    );
  }
  return entry;
}

/**
 * What a dashboard filter on `column` compares: a dimension's
 * {@link DimensionEntry.filter}, `name`'s for another `…Name` column (a
 * score filter sent to this view keeps working), the view's time dimension
 * `start_time`, or the keyed `metadata`. Throws `InvalidRequestError` for any
 * other column, and `QueryCompileError` for a dimension without a filter
 * lowering (the view rejects filters on those before SQL is built).
 */
export function eventsObservationsFilterLowering(
  column: string,
): EventsFieldLowering {
  if (column === "start_time") {
    return { kind: "scalar", value: (eb) => eb.ref("e.start_time") };
  }
  if (column === "metadata") return { kind: "metadata" };
  const name =
    isDimension(column) || !column.endsWith("Name") ? column : "name";
  if (!isDimension(name)) {
    throw new InvalidRequestError(
      `Invalid filter column ${column}. Must be one of ${Object.keys(EVENTS_OBSERVATIONS_DIMENSIONS)} or start_time`,
    );
  }
  const { filter } = eventsObservationsDimension(name);
  if (!filter) {
    throw new QueryCompileError(
      `Dimension "${name}" has no filter lowering in EVENTS_OBSERVATIONS_DIMENSIONS.`,
    );
  }
  return filter;
}

/**
 * Measures of the v2 observations view, keyed by name, in view order. The
 * view's strings read `usage_details`, `cost_details` and `total_cost`
 * unqualified; the entries qualify them with `e`, since the compiler rejects
 * a bare column in a SELECT that also joins `scores`.
 */
export const EVENTS_OBSERVATIONS_MEASURES = {
  count: templateMeasure({
    aggs: { agg: "count" },
    expression: (_eb, agg) => agg("agg", literal(1)),
  }),
  traceId: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) => agg("agg", eb.ref("e.trace_id")),
  }),
  uniqueUserIds: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) => agg("agg", nullIfEmpty(eb.ref("e.user_id"))),
  }),
  uniqueSessionIds: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) => agg("agg", nullIfEmpty(eb.ref("e.session_id"))),
  }),
  latency: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      aggregatedDiff(eb, agg, "agg1", "millisecond", [
        "start_time",
        "end_time",
      ]),
  }),
  streamingLatency: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sinceCompletionStart(eb, agg, ["completion_start_time", "end_time"]),
  }),
  inputTokens: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("e.usage_details")),
        literal("input"),
      ),
  }),
  outputTokens: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("e.usage_details")),
        literal("output"),
      ),
  }),
  totalTokens: templateMeasure({
    aggs: { agg1: "sumMap" },
    expression: (eb, agg) =>
      mapValue(agg("agg1", eb.ref("e.usage_details")), literal("total")),
  }),
  outputTokensPerSecond: templateMeasure({
    aggs: { agg1: "any" },
    // output tokens / nullIf(seconds from completion start to end, 0)
    expression: (eb, agg) =>
      eb(
        sumMapValuesWhereKeyContains(
          agg("agg1", eb.ref("e.usage_details")),
          literal("output"),
        ),
        "/",
        nullIf(
          aggregatedDiff(eb, agg, "agg1", "second", [
            "completion_start_time",
            "end_time",
          ]),
          literal(0),
        ),
      ),
  }),
  tokensPerSecond: templateMeasure({
    aggs: { agg1: "sumMap", agg2: "any" },
    // total tokens / nullIf(seconds from start to end, 0)
    expression: (eb, agg) =>
      eb(
        mapValue(agg("agg1", eb.ref("e.usage_details")), literal("total")),
        "/",
        nullIf(
          aggregatedDiff(eb, agg, "agg2", "second", ["start_time", "end_time"]),
          literal(0),
        ),
      ),
  }),
  inputCost: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("e.cost_details")),
        literal("input"),
      ),
  }),
  outputCost: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("e.cost_details")),
        literal("output"),
      ),
  }),
  totalCost: templateMeasure({
    aggs: { agg1: "sum" },
    expression: (eb, agg) => agg("agg1", toNullable(eb.ref("e.total_cost"))),
  }),
  timeToFirstToken: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sinceCompletionStart(eb, agg, ["start_time", "completion_start_time"]),
  }),
  countScores: {
    relationTable: "scores",
    expression: (eb: ObservationsWithScoresBuilder) =>
      uniq(eb.ref("scores.id")),
  },
  toolDefinitions: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      nullIf(
        arrayLength(mapKeys(agg("agg1", eb.ref("e.tool_definitions")))),
        literal(0),
      ),
  }),
  toolCalls: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      nullIf(arrayLength(agg("agg1", eb.ref("e.tool_calls"))), literal(0)),
  }),
  toolCallInvocations: templateMeasure({
    aggs: { agg1: "any" },
    requiresDimension: "calledToolNames",
    // Counts the select alias `calledToolNames`, the ARRAY JOINed tool name.
    expression: (eb, agg) =>
      countEqual(
        agg("agg1", eb.ref("e.tool_call_names")),
        sql.ref<string>("calledToolNames"),
      ),
  }),
  costByType: {
    requiresDimension: "costType",
    expression: () => sql.ref<number>("cost_value"),
  },
  usageByType: {
    requiresDimension: "usageType",
    expression: () => sql.ref<number>("usage_value"),
  },
} satisfies Record<string, MeasureEntry>;

/** {@link EVENTS_OBSERVATIONS_MEASURES} keyed by any string. */
const MEASURES_BY_NAME: Readonly<Partial<Record<string, MeasureEntry>>> =
  EVENTS_OBSERVATIONS_MEASURES;

/** The measure `name`; the caller has checked the view declares it. */
export function eventsObservationsMeasure(name: string): MeasureEntry {
  const entry = Object.hasOwn(EVENTS_OBSERVATIONS_MEASURES, name)
    ? MEASURES_BY_NAME[name]
    : undefined;
  if (!entry) {
    throw new QueryCompileError(
      `Measure "${name}" has no entry in EVENTS_OBSERVATIONS_MEASURES.`,
    );
  }
  return entry;
}

/**
 * Join condition of the view's `scores` relation. `liveScoresOnly` also drops
 * score tombstones (`scores.is_deleted = 0`), for a join without `FINAL`:
 * unmerged older live versions of a deleted score still match, and
 * projects that skip score dedup never rewrite scores.
 */
export const eventsObservationsScoresJoin = (
  eb: ObservationsWithScoresBuilder,
  { liveScoresOnly = false }: { liveScoresOnly?: boolean } = {},
) =>
  eb.and([
    eb("e.span_id", "=", eb.ref("scores.observation_id")),
    eb("e.project_id", "=", eb.ref("scores.project_id")),
    ...(liveScoresOnly ? [eb("scores.is_deleted", "=", literal(0))] : []),
  ]);
