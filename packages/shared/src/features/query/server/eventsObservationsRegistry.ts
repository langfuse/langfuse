/**
 * The v2 observations view (`eventsObservationsView` in `../dataModel.ts`) as
 * query-AST expressions: every dimension, measure, pair-expanded value list and
 * the scores join condition, keyed by the view's names. Server-only; names,
 * labels and the other view metadata stay in `dataModel.ts`, which the client
 * imports. Each entry renders the same SQL as the view's `sql` string
 * (`eventsObservationsRegistry.golden.test.ts`), up to the relation alias.
 *
 * Entries read the view's base relation as `e`, so they share the `e`-scoped
 * expressions of `repositories/events-selects.ts`; the legacy strings call it
 * `events_observations`. Entries pick no table: the query that uses them
 * does, and reads `events_truncated` (always `events_core`) to match the
 * view's `baseCte`.
 */
import {
  ExpressionWrapper,
  sql,
  type AliasableExpression,
  type Expression,
  type ExpressionBuilder,
} from "kysely";

import {
  arrayDistinct,
  arrayElement,
  arrayLength,
  countEqual,
  dateDiff,
  formatDateTime,
  ifElse,
  indexOf,
  isNull,
  literal,
  mapKeys,
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
import {
  eventsIsRootObservation,
  eventsTraceName,
} from "../../../server/repositories/events-selects";
import {
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "../../ai-gateway/constants";

type ObservationsDb = {
  e: ClickHouseDatabase["events"];
  scores: ClickHouseDatabase["scores"];
};

/** Builder of a query that reads the view's base relation as `e`. */
type ObservationsBuilder = ExpressionBuilder<ObservationsDb, "e">;

/** {@link ObservationsBuilder} with the `scores` relation joined. */
type ObservationsWithScoresBuilder = ExpressionBuilder<
  ObservationsDb,
  "e" | "scores"
>;

/** Level of a dashboard query: `two` has an inner aggregating select. */
type QueryLevel = "single" | "two";

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

type DimensionEntry = {
  expression: (eb: ObservationsBuilder) => AliasableExpression<unknown>;
  /**
   * For a dimension over map keys (`costType` = `mapKeys(cost_details)`): the
   * matching values (`mapValues(cost_details)`). The query ARRAY JOINs both
   * arrays side by side, one row per key, with its value as `valueAlias`
   * (`cost_value`) for the measures that name this dimension.
   */
  pairExpand?: {
    values: (eb: ObservationsBuilder) => AliasableExpression<unknown[]>;
    valueAlias: string;
  };
};

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
type MeasureEntry =
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
 * the slot's aggregate from `aggs` in the inner select. Mirrors the `@@AGGn@@` stripping and
 * substitution in `queryBuilder.ts`.
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

/** Dimensions of the v2 observations view, keyed by name, in view order. */
export const EVENTS_OBSERVATIONS_DIMENSIONS = {
  id: { expression: (eb) => eb.ref("e.span_id") },
  evaluatorId: {
    expression: (eb) =>
      eb.fn.coalesce(
        nullIfEmpty(eb.ref("e.evaluator_id")),
        eb.ref("e.evaluation_rule_id"),
      ),
  },
  isEvaluatorTest: {
    expression: (eb) => eb.ref("e.evaluator_execution_is_test"),
  },
  traceId: { expression: (eb) => eb.ref("e.trace_id") },
  environment: {
    expression: (eb) => nullIfEmpty(eb.ref("e.environment")),
  },
  parentObservationId: {
    expression: (eb) => nullIfEmpty(eb.ref("e.parent_span_id")),
  },
  isRootObservation: {
    expression: (eb) => toBool(eventsIsRootObservation(eb)),
  },
  type: { expression: (eb) => eb.ref("e.type") },
  name: { expression: (eb) => eb.ref("e.name") },
  level: { expression: (eb) => eb.ref("e.level") },
  version: {
    expression: (eb) => nullIfEmpty(eb.ref("e.version")),
  },
  userId: {
    expression: (eb) => nullIfEmpty(eb.ref("e.user_id")),
  },
  sessionId: {
    expression: (eb) => nullIfEmpty(eb.ref("e.session_id")),
  },
  aiGatewayKeyId: {
    // Ingestion only writes the gateway service name on uploads the gateway
    // authenticated, and then sets ingestion_api_key to the gateway key id.
    expression: (eb) =>
      ifElse(
        viaAiGateway(eb),
        nullIfEmpty(eb.ref("e.ingestion_api_key")),
        literal(null),
      ),
  },
  aiGatewayKeyOwnerUserId: {
    // The span's user_id is not used: a key without an owner lets its caller
    // set any user ID. The owner ID comes from metadata the gateway writes,
    // so it outlives the key's deletion. The first entry of the key wins.
    expression: (eb) =>
      ifElse(
        viaAiGateway(eb),
        nullIfEmpty(
          arrayElement(
            eb.ref("e.metadata_values"),
            indexOf(
              eb.ref("e.metadata_names"),
              literal(AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY),
            ),
          ),
        ),
        literal(null),
      ),
  },
  tags: { expression: (eb) => eb.ref("e.tags") },
  release: {
    expression: (eb) => nullIfEmpty(eb.ref("e.release")),
  },
  traceName: { expression: (eb) => eventsTraceName(eb) },
  traceRelease: {
    expression: (eb) => nullIfEmpty(eb.ref("e.release")),
  },
  traceVersion: {
    expression: (eb) => nullIfEmpty(eb.ref("e.version")),
  },
  providedModelName: {
    expression: (eb) => nullIfEmpty(eb.ref("e.provided_model_name")),
  },
  promptName: {
    expression: (eb) => nullIfEmpty(eb.ref("e.prompt_name")),
  },
  promptVersion: {
    expression: (eb) => eb.ref("e.prompt_version"),
  },
  startTimeMonth: {
    expression: (eb) =>
      formatDateTime(eb.ref("e.start_time"), literal("%Y-%m")),
  },
  skillNamesAvailable: {
    expression: (eb) =>
      arrayDistinct(tupleArrayField(eb.ref("e.skills_available"), "skillName")),
  },
  skillsNamesLoaded: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(eb.ref("e.skills_resource_loaded"), "skillName"),
      ),
  },
  skillIdsAvailable: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(eb.ref("e.skills_available"), "langfuseSkillId"),
      ),
  },
  skillIdsLoaded: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(eb.ref("e.skills_resource_loaded"), "langfuseSkillId"),
      ),
  },
  loadedFilePaths: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(eb.ref("e.skills_resource_loaded"), "filePath"),
      ),
  },
  toolNames: {
    expression: (eb) => mapKeys(eb.ref("e.tool_definitions")),
  },
  calledToolNames: {
    expression: (eb) => arrayDistinct(eb.ref("e.tool_call_names")),
  },
  costType: {
    expression: (eb) => mapKeys(eb.ref("e.cost_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("e.cost_details")),
      valueAlias: "cost_value",
    },
  },
  usageType: {
    expression: (eb) => mapKeys(eb.ref("e.usage_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("e.usage_details")),
      valueAlias: "usage_value",
    },
  },
  experimentName: {
    expression: (eb) => nullIfEmpty(eb.ref("e.experiment_name")),
  },
  experimentDatasetId: {
    expression: (eb) => nullIfEmpty(eb.ref("e.experiment_dataset_id")),
  },
  experimentId: {
    expression: (eb) => nullIfEmpty(eb.ref("e.experiment_id")),
  },
} satisfies Record<string, DimensionEntry>;

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

/** Join condition of the view's `scores` relation. */
export const eventsObservationsScoresJoin = (
  eb: ObservationsWithScoresBuilder,
) =>
  eb.and([
    eb("e.span_id", "=", eb.ref("scores.observation_id")),
    eb("e.project_id", "=", eb.ref("scores.project_id")),
  ]);
