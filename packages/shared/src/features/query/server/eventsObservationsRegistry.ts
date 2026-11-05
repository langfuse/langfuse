/**
 * The v2 observations view (`eventsObservationsView` in `../dataModel.ts`) as
 * query-AST expressions: every dimension, measure, pair-expanded value list and
 * the scores join condition, keyed by the view's names. Server-only; names,
 * labels and the other view metadata stay in `dataModel.ts`, which the client
 * imports. Each entry renders the same SQL as the view's `sql` string
 * (`eventsObservationsRegistry.golden.test.ts`).
 *
 * Entries read the view's base relation as `events_observations`, like the
 * legacy strings. The query reads it from `events_truncated`, which always
 * compiles to `events_core`, the view's `baseCte`.
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
  AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY,
  AI_GATEWAY_SERVICE_NAME,
} from "../../ai-gateway/constants";

type ObservationsDb = {
  events_observations: ClickHouseDatabase["events_truncated"];
  scores: ClickHouseDatabase["scores"];
};

/** Builder of a query that reads the view's base relation as `events_observations`. */
type ObservationsBuilder = ExpressionBuilder<
  ObservationsDb,
  "events_observations"
>;

/** {@link ObservationsBuilder} with the `scores` relation joined. */
type ObservationsWithScoresBuilder = ExpressionBuilder<
  ObservationsDb,
  "events_observations" | "scores"
>;

/** Level of a dashboard query: `two` has an inner aggregating select. */
type QueryLevel = "single" | "two";

/**
 * A measure's aggregation slot: the legacy `@@AGGn@@` marker. It wraps a row
 * value; which aggregate it applies, if any, depends on the query level
 * ({@link aggregationSlot}), so the result is the row value's type or the
 * aggregate's.
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
  /** The values ARRAY JOINed beside the dimension's keys, as `valueAlias`. */
  pairExpand?: {
    values: (eb: ObservationsBuilder) => AliasableExpression<unknown[]>;
    valueAlias: string;
  };
};

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
 * A measure with aggregation slots; `A` checks each slot against `aggs` and
 * types its result.
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
 * value (the requested aggregation wraps the whole expression), `two` applies
 * the slot's aggregate from `aggs`. Mirrors the `@@AGGn@@` stripping and
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

// Copies of `eventsIsRootObservation` / `eventsTraceName`
// (`repositories/events-selects.ts`) over the `events_observations` alias.
// Keep them in sync.

/** The observation is a root: no parent span, or an app root. */
const isRootObservation = (eb: ObservationsBuilder) =>
  eb.or([
    eb("events_observations.parent_span_id", "=", literal("")),
    eb("events_observations.is_app_root", "=", literal(true)),
  ]);

/** The stored trace name, else the name of a root observation, else NULL. */
const traceName = (eb: ObservationsBuilder) =>
  eb.fn.coalesce(
    nullIfEmpty(eb.ref("events_observations.trace_name")),
    ifElse(
      isRootObservation(eb),
      nullIfEmpty(eb.ref("events_observations.name")),
      literal(null),
    ),
  );

/** The span came through the AI Gateway. */
const viaAiGateway = (eb: ObservationsBuilder) =>
  eb("events_observations.service_name", "=", literal(AI_GATEWAY_SERVICE_NAME));

/**
 * `start` to `end` in `unit`, both read through `agg`:
 * `date_diff(unit, agg(start), agg(end))`.
 */
const aggregatedDiff = <A extends Record<string, TemplateAggregate>>(
  eb: ObservationsBuilder,
  agg: AggregationSlot<A>,
  slot: keyof A & string,
  unit: "millisecond" | "second",
  start: "start_time" | "completion_start_time",
  end: "end_time" | "completion_start_time",
) =>
  dateDiff(
    unit,
    agg(slot, eb.ref(`events_observations.${start}`)),
    agg(slot, eb.ref(`events_observations.${end}`)),
  );

/**
 * NULL while the completion start is unset, else `start` to `end` in
 * milliseconds.
 */
const sinceCompletionStart = (
  eb: ObservationsBuilder,
  agg: AggregationSlot<{ agg1: "any" }>,
  start: "start_time" | "completion_start_time",
  end: "end_time" | "completion_start_time",
) =>
  ifElse(
    isNull(agg("agg1", eb.ref("events_observations.completion_start_time"))),
    typedNull("Nullable(Int64)"),
    aggregatedDiff(eb, agg, "agg1", "millisecond", start, end),
  );

/** Dimensions of the v2 observations view, keyed by name, in view order. */
export const EVENTS_OBSERVATIONS_DIMENSIONS = {
  id: { expression: (eb) => eb.ref("events_observations.span_id") },
  evaluatorId: {
    expression: (eb) =>
      eb.fn.coalesce(
        nullIfEmpty(eb.ref("events_observations.evaluator_id")),
        eb.ref("events_observations.evaluation_rule_id"),
      ),
  },
  isEvaluatorTest: {
    expression: (eb) =>
      eb.ref("events_observations.evaluator_execution_is_test"),
  },
  traceId: { expression: (eb) => eb.ref("events_observations.trace_id") },
  environment: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.environment")),
  },
  parentObservationId: {
    expression: (eb) =>
      nullIfEmpty(eb.ref("events_observations.parent_span_id")),
  },
  isRootObservation: { expression: (eb) => toBool(isRootObservation(eb)) },
  type: { expression: (eb) => eb.ref("events_observations.type") },
  name: { expression: (eb) => eb.ref("events_observations.name") },
  level: { expression: (eb) => eb.ref("events_observations.level") },
  version: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.version")),
  },
  userId: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.user_id")),
  },
  sessionId: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.session_id")),
  },
  aiGatewayKeyId: {
    // Ingestion only writes the gateway service name on uploads the gateway
    // authenticated, and then sets ingestion_api_key to the gateway key id.
    expression: (eb) =>
      ifElse(
        viaAiGateway(eb),
        nullIfEmpty(eb.ref("events_observations.ingestion_api_key")),
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
            eb.ref("events_observations.metadata_values"),
            indexOf(
              eb.ref("events_observations.metadata_names"),
              literal(AI_GATEWAY_KEY_OWNER_USER_ID_METADATA_KEY),
            ),
          ),
        ),
        literal(null),
      ),
  },
  tags: { expression: (eb) => eb.ref("events_observations.tags") },
  release: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.release")),
  },
  traceName: { expression: (eb) => traceName(eb) },
  traceRelease: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.release")),
  },
  traceVersion: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.version")),
  },
  providedModelName: {
    expression: (eb) =>
      nullIfEmpty(eb.ref("events_observations.provided_model_name")),
  },
  promptName: {
    expression: (eb) => nullIfEmpty(eb.ref("events_observations.prompt_name")),
  },
  promptVersion: {
    expression: (eb) => eb.ref("events_observations.prompt_version"),
  },
  startTimeMonth: {
    expression: (eb) =>
      formatDateTime(
        eb.ref("events_observations.start_time"),
        literal("%Y-%m"),
      ),
  },
  skillNamesAvailable: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(
          eb.ref("events_observations.skills_available"),
          "skillName",
        ),
      ),
  },
  skillsNamesLoaded: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(
          eb.ref("events_observations.skills_resource_loaded"),
          "skillName",
        ),
      ),
  },
  skillIdsAvailable: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(
          eb.ref("events_observations.skills_available"),
          "langfuseSkillId",
        ),
      ),
  },
  skillIdsLoaded: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(
          eb.ref("events_observations.skills_resource_loaded"),
          "langfuseSkillId",
        ),
      ),
  },
  loadedFilePaths: {
    expression: (eb) =>
      arrayDistinct(
        tupleArrayField(
          eb.ref("events_observations.skills_resource_loaded"),
          "filePath",
        ),
      ),
  },
  toolNames: {
    expression: (eb) => mapKeys(eb.ref("events_observations.tool_definitions")),
  },
  calledToolNames: {
    expression: (eb) =>
      arrayDistinct(eb.ref("events_observations.tool_call_names")),
  },
  costType: {
    expression: (eb) => mapKeys(eb.ref("events_observations.cost_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("events_observations.cost_details")),
      valueAlias: "cost_value",
    },
  },
  usageType: {
    expression: (eb) => mapKeys(eb.ref("events_observations.usage_details")),
    pairExpand: {
      values: (eb) => mapValues(eb.ref("events_observations.usage_details")),
      valueAlias: "usage_value",
    },
  },
  experimentName: {
    expression: (eb) =>
      nullIfEmpty(eb.ref("events_observations.experiment_name")),
  },
  experimentDatasetId: {
    expression: (eb) =>
      nullIfEmpty(eb.ref("events_observations.experiment_dataset_id")),
  },
  experimentId: {
    expression: (eb) =>
      nullIfEmpty(eb.ref("events_observations.experiment_id")),
  },
} satisfies Record<string, DimensionEntry>;

/**
 * Measures of the v2 observations view, keyed by name, in view order. The
 * unqualified `usage_details`, `cost_details` and `total_cost` reads match the
 * view's strings.
 */
export const EVENTS_OBSERVATIONS_MEASURES = {
  count: templateMeasure({
    aggs: { agg: "count" },
    expression: (_eb, agg) => agg("agg", literal(1)),
  }),
  traceId: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) => agg("agg", eb.ref("events_observations.trace_id")),
  }),
  uniqueUserIds: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) =>
      agg("agg", nullIfEmpty(eb.ref("events_observations.user_id"))),
  }),
  uniqueSessionIds: templateMeasure({
    aggs: { agg: "any" },
    expression: (eb, agg) =>
      agg("agg", nullIfEmpty(eb.ref("events_observations.session_id"))),
  }),
  latency: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      aggregatedDiff(eb, agg, "agg1", "millisecond", "start_time", "end_time"),
  }),
  streamingLatency: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sinceCompletionStart(eb, agg, "completion_start_time", "end_time"),
  }),
  inputTokens: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("usage_details")),
        literal("input"),
      ),
  }),
  outputTokens: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("usage_details")),
        literal("output"),
      ),
  }),
  totalTokens: templateMeasure({
    aggs: { agg1: "sumMap" },
    expression: (eb, agg) =>
      mapValue(agg("agg1", eb.ref("usage_details")), literal("total")),
  }),
  outputTokensPerSecond: templateMeasure({
    aggs: { agg1: "any" },
    // output tokens / nullIf(seconds from completion start to end, 0)
    expression: (eb, agg) =>
      eb(
        sumMapValuesWhereKeyContains(
          agg("agg1", eb.ref("usage_details")),
          literal("output"),
        ),
        "/",
        nullIf(
          aggregatedDiff(
            eb,
            agg,
            "agg1",
            "second",
            "completion_start_time",
            "end_time",
          ),
          literal(0),
        ),
      ),
  }),
  tokensPerSecond: templateMeasure({
    aggs: { agg1: "sumMap", agg2: "any" },
    // total tokens / nullIf(seconds from start to end, 0)
    expression: (eb, agg) =>
      eb(
        mapValue(agg("agg1", eb.ref("usage_details")), literal("total")),
        "/",
        nullIf(
          aggregatedDiff(eb, agg, "agg2", "second", "start_time", "end_time"),
          literal(0),
        ),
      ),
  }),
  inputCost: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("cost_details")),
        literal("input"),
      ),
  }),
  outputCost: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sumMapValuesWhereKeyContains(
        agg("agg1", eb.ref("cost_details")),
        literal("output"),
      ),
  }),
  totalCost: templateMeasure({
    aggs: { agg1: "sum" },
    expression: (eb, agg) => agg("agg1", toNullable(eb.ref("total_cost"))),
  }),
  timeToFirstToken: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      sinceCompletionStart(eb, agg, "start_time", "completion_start_time"),
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
        arrayLength(
          mapKeys(agg("agg1", eb.ref("events_observations.tool_definitions"))),
        ),
        literal(0),
      ),
  }),
  toolCalls: templateMeasure({
    aggs: { agg1: "any" },
    expression: (eb, agg) =>
      nullIf(
        arrayLength(agg("agg1", eb.ref("events_observations.tool_calls"))),
        literal(0),
      ),
  }),
  toolCallInvocations: templateMeasure({
    aggs: { agg1: "any" },
    requiresDimension: "calledToolNames",
    // Counts the select alias `calledToolNames`, the ARRAY JOINed tool name.
    expression: (eb, agg) =>
      countEqual(
        agg("agg1", eb.ref("events_observations.tool_call_names")),
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
    eb("events_observations.span_id", "=", eb.ref("scores.observation_id")),
    eb("events_observations.project_id", "=", eb.ref("scores.project_id")),
  ]);
