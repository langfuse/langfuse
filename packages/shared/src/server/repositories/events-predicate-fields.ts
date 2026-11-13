/**
 * Server half of the events predicate source (`eventsPredicateSource` in
 * `src/query-ast/sources.ts` is the semantic half): for each field id, the
 * typed expression a condition compares, the facts its conditions compile
 * from. Which events table a condition reads is the routing pass's verdict
 * on the compiled query, not a fact here. Every column is qualified `e.`, so
 * a same-named SELECT alias cannot capture it. `eventsTableUiColumnDefinitions`
 * renders its column SQL from these expressions; the row-selection goldens
 * (`events.golden.test.ts`) pin that SQL with a filter per column kind, and
 * `events-predicate.golden.test.ts` checks the condition wiring against
 * `FilterList` per field, condition type and operator.
 */
import { expressionBuilder, type Expression, type SqlBool } from "kysely";

import { renderClickhouseExpression } from "../query-ast/compile";
import { QueryCompileError } from "../query-ast/errors";
import type { ClickHouseDatabase } from "../query-ast/schema";
import {
  arrayConcat,
  arrayLength,
  arrayMap,
  arraySum,
  concat,
  dateDiff,
  ifElse,
  literal,
  mapExists,
  mapFilter,
  mapKeys,
  mapValue,
  mapValues,
  positionCaseInsensitive,
  sumMapValuesWhereKeyContains,
  toStringValue,
  tupleElement,
} from "../query-ast/extensions";
import {
  eventsIsRootObservation,
  eventsTraceName,
  secondsSinceStart,
  type EventsExpressionBuilder,
} from "./events-selects";

/** Facts every field compared through one expression carries. */
type ScalarFacts = {
  /** Bind type of a `number` condition's value; `Decimal64(12)` if unset. */
  numberBindType?: string;
  /** `''` and NULL count as one value. */
  emptyEqualsNull?: true;
};

/** Index facts of a string column. */
type StringIndexFacts = {
  /**
   * `events_full` keeps an ngram skip index on `lower(<col>)`, so string and
   * option conditions add a `lower(...)` conjunct it can prune with.
   */
  ngramIndexed?: true;
  /**
   * `events_full` keeps a text index on `lower(<col>)`: `=` adds a token
   * conjunct for it, and `matches` searches it.
   */
  textIndexed?: true;
};

type Lowered<T> = (eb: EventsExpressionBuilder) => Expression<T>;

type EventsDb = { e: ClickHouseDatabase["events"] };

/**
 * A field compared through one expression, kinded by its value so each
 * condition type reads the value type it needs: `string` and
 * `nullableString` take string conditions, `array` array conditions, every
 * kind option, number, date, boolean and `null` conditions. Only `string`
 * carries index facts, which read its non-null value.
 */
export type ScalarFieldLowering =
  | (ScalarFacts &
      StringIndexFacts & { kind: "string"; value: Lowered<string> })
  | KindedLowering<"nullableString">
  | KindedLowering<"array">
  | KindedLowering<"scalar">;

/** Value type of each kind without index facts. */
type ValueOfKind = {
  nullableString: string | null;
  // Elements may be NULL: tuple fields of `Array(Tuple(…))` columns can be
  // `Nullable(String)`.
  array: Array<string | null>;
  scalar: unknown;
};

type KindedLowering<K extends keyof ValueOfKind> = ScalarFacts & {
  kind: K;
  value: Lowered<ValueOfKind[K]>;
};

/** The keyed metadata field, stored as `e.metadata_names` / `e.metadata_values`. */
type MetadataFieldLowering = { kind: "metadata" };

export type EventsFieldLowering = ScalarFieldLowering | MetadataFieldLowering;

// Token counts: `usage_details` holds UInt64 counts, which a Decimal64 bind
// overflows above ~9.2e15.
const TOKEN_COUNT_BIND_TYPE = "Float64";
// Seconds: Decimal64(12) overflows past ~40 minutes.
const SECONDS_BIND_TYPE = "Decimal64(3)";

const text = (
  value: Lowered<string>,
  opts: ScalarFacts & StringIndexFacts = {},
): ScalarFieldLowering => ({ kind: "string", value, ...opts });

const lowering =
  <K extends keyof ValueOfKind>(kind: K) =>
  (
    value: Lowered<ValueOfKind[K]>,
    opts: ScalarFacts = {},
  ): KindedLowering<K> => ({ kind, value, ...opts });

const nullableText = lowering("nullableString");
const array = lowering("array");
const scalar = lowering("scalar");

/** `if(mapExists((k, v) -> (k = 'total'), map), map['total'], NULL)` */
const totalOf = (
  eb: EventsExpressionBuilder,
  map: Expression<Record<string, number>>,
) =>
  ifElse(
    mapExists((key) => eb.parens(key, "=", literal("total")), map),
    mapValue(map, literal("total")),
    literal(null),
  );

/**
 * A usage or cost key that counts LLM prompt-cache reads
 * (`input_cached_tokens`, `cache_read_input_tokens`), as
 * `cachedInputMetricSql` in `eventsTable.ts` matches it:
 * `positionCaseInsensitive(k, 'cached') > 0 OR … 'cache_read' …`, in parens.
 */
const isCachedInputKey = (
  eb: EventsExpressionBuilder,
  key: Expression<string>,
): Expression<SqlBool> =>
  eb.or([
    eb(positionCaseInsensitive(key, literal("cached")), ">", literal(0)),
    eb(positionCaseInsensitive(key, literal("cache_read")), ">", literal(0)),
  ]);

/**
 * The sum of `map`'s cached-input entries, NULL when it has none:
 * `if(mapExists((k, v) -> <cached k>, map), arraySum(mapValues(mapFilter(x -> <cached x.1>, map))), NULL)`.
 */
const cachedInputOf = (
  eb: EventsExpressionBuilder,
  map: Expression<Record<string, number>>,
) =>
  ifElse(
    mapExists((key) => isCachedInputKey(eb, key), map),
    arraySum(
      mapValues(
        mapFilter(
          (entry) => isCachedInputKey(eb, tupleElement(entry, "1")),
          map,
        ),
      ),
    ),
    literal(null),
  );

/** `arrayMap(skill -> concat(skill.skillName, '@', toString(skill.skillVersion)), skills)` */
const skillVersions = (skills: Expression<unknown[]>) =>
  arrayMap(
    (skill) =>
      concat(
        tupleElement(skill, "skillName"),
        literal("@"),
        toStringValue(tupleElement(skill, "skillVersion")),
      ),
    skills,
    "skill",
  );

/** `e.<skills>.skillName` */
const skillNames = (
  eb: EventsExpressionBuilder,
  skills: "e.skills_resource_loaded" | "e.skills_available",
) => tupleElement<string[]>(eb.ref(skills), "skillName");

/**
 * Lowering per field id of `eventsPredicateSource`. Score and comment fields
 * are absent: they need a join or aggregation the host query owns, which a
 * WHERE-only condition cannot express.
 */
export const EVENTS_FIELD_LOWERINGS: Readonly<
  Record<string, EventsFieldLowering>
> = {
  id: text((eb) => eb.ref("e.span_id")),
  traceId: text((eb) => eb.ref("e.trace_id")),
  startTime: scalar((eb) => eb.ref("e.start_time")),
  endTime: scalar((eb) => eb.ref("e.end_time")),
  name: text((eb) => eb.ref("e.name"), { ngramIndexed: true }),
  type: text((eb) => eb.ref("e.type")),
  environment: text((eb) => eb.ref("e.environment")),
  ingestionApiKey: text((eb) => eb.ref("e.ingestion_api_key")),
  ingestionSdkName: text((eb) => eb.ref("e.ingestion_sdk_name")),
  ingestionSdkVersion: text((eb) => eb.ref("e.ingestion_sdk_version")),
  ingestionSource: text((eb) => eb.ref("e.source")),
  version: text((eb) => eb.ref("e.version")),
  release: text((eb) => eb.ref("e.release"), { emptyEqualsNull: true }),
  userId: text((eb) => eb.ref("e.user_id"), { ngramIndexed: true }),
  sessionId: text((eb) => eb.ref("e.session_id"), { ngramIndexed: true }),
  traceName: nullableText((eb) => eventsTraceName(eb)),
  level: text((eb) => eb.ref("e.level")),
  statusMessage: text((eb) => eb.ref("e.status_message")),
  promptName: text((eb) => eb.ref("e.prompt_name")),
  promptVersion: scalar((eb) => eb.ref("e.prompt_version")),
  modelId: text((eb) => eb.ref("e.model_id")),
  providedModelName: text((eb) => eb.ref("e.provided_model_name")),
  totalCost: scalar((eb) => totalOf(eb, eb.ref("e.cost_details"))),
  inputTokens: scalar(
    (eb) =>
      sumMapValuesWhereKeyContains(eb.ref("e.usage_details"), literal("input")),
    { numberBindType: TOKEN_COUNT_BIND_TYPE },
  ),
  cachedInputTokens: scalar(
    (eb) => cachedInputOf(eb, eb.ref("e.usage_details")),
    { numberBindType: TOKEN_COUNT_BIND_TYPE },
  ),
  outputTokens: scalar(
    (eb) =>
      sumMapValuesWhereKeyContains(
        eb.ref("e.usage_details"),
        literal("output"),
      ),
    { numberBindType: TOKEN_COUNT_BIND_TYPE },
  ),
  totalTokens: scalar((eb) => totalOf(eb, eb.ref("e.usage_details")), {
    numberBindType: TOKEN_COUNT_BIND_TYPE,
  }),
  inputCost: scalar((eb) =>
    sumMapValuesWhereKeyContains(eb.ref("e.cost_details"), literal("input")),
  ),
  cachedInputCost: scalar((eb) => cachedInputOf(eb, eb.ref("e.cost_details"))),
  outputCost: scalar((eb) =>
    sumMapValuesWhereKeyContains(eb.ref("e.cost_details"), literal("output")),
  ),
  latency: scalar((eb) => secondsSinceStart(eb, "e.end_time"), {
    numberBindType: SECONDS_BIND_TYPE,
  }),
  timeToFirstToken: scalar(
    (eb) => secondsSinceStart(eb, "e.completion_start_time"),
    { numberBindType: SECONDS_BIND_TYPE },
  ),
  tokensPerSecond: scalar((eb) =>
    eb.parens(
      sumMapValuesWhereKeyContains(
        eb.ref("e.usage_details"),
        literal("output"),
      ),
      "/",
      eb.parens(
        dateDiff("millisecond", eb.ref("e.start_time"), eb.ref("e.end_time")),
        "/",
        literal(1000),
      ),
    ),
  ),
  input: text((eb) => eb.ref("e.input"), { textIndexed: true }),
  output: text((eb) => eb.ref("e.output"), { textIndexed: true }),
  metadata: { kind: "metadata" },
  evaluatorId: text((eb) => eb.ref("e.evaluator_id")),
  ruleId: text((eb) => eb.ref("e.evaluation_rule_id")),
  traceTags: array((eb) => eb.ref("e.tags")),
  hasParentObservation: scalar((eb) =>
    eb("e.parent_span_id", "!=", literal("")),
  ),
  isRootObservation: scalar((eb) => eventsIsRootObservation(eb)),
  // `!= ''` reads the same on the truncated copy, so routing keeps these on
  // events_core.
  hasInput: scalar((eb) => eb("e.input", "!=", literal(""))),
  hasOutput: scalar((eb) => eb("e.output", "!=", literal(""))),
  experimentDatasetId: text((eb) => eb.ref("e.experiment_dataset_id")),
  experimentId: text((eb) => eb.ref("e.experiment_id"), {
    emptyEqualsNull: true,
  }),
  experimentName: text((eb) => eb.ref("e.experiment_name")),
  skillsNamesLoaded: array((eb) => skillNames(eb, "e.skills_resource_loaded")),
  skillsVersionsLoaded: array((eb) =>
    skillVersions(eb.ref("e.skills_resource_loaded")),
  ),
  skillNamesAvailable: array((eb) => skillNames(eb, "e.skills_available")),
  skillVersionsAvailable: array((eb) =>
    skillVersions(eb.ref("e.skills_available")),
  ),
  skillNames: array((eb) =>
    arrayConcat(
      skillNames(eb, "e.skills_resource_loaded"),
      skillNames(eb, "e.skills_available"),
    ),
  ),
  skillVersions: array((eb) =>
    arrayConcat(
      skillVersions(eb.ref("e.skills_resource_loaded")),
      skillVersions(eb.ref("e.skills_available")),
    ),
  ),
  // Paired with the skill version id, so a match stays within one loaded
  // resource.
  skillFilesLoaded: array((eb) =>
    arrayMap(
      (skill) =>
        concat(
          tupleElement(skill, "langfuseSkillId"),
          literal("/"),
          tupleElement(skill, "filePath"),
        ),
      eb.ref("e.skills_resource_loaded"),
      "skill",
    ),
  ),
  parentObservationId: text((eb) => eb.ref("e.parent_span_id"), {
    emptyEqualsNull: true,
  }),
  toolNames: array((eb) => mapKeys(eb.ref("e.tool_definitions"))),
  calledToolNames: array((eb) => eb.ref("e.tool_call_names")),
  toolDefinitions: scalar((eb) =>
    arrayLength(mapKeys(eb.ref("e.tool_definitions"))),
  ),
  toolCalls: scalar((eb) => arrayLength(eb.ref("e.tool_calls"))),
  isExperimentItemRootSpan: scalar((eb) =>
    eb("e.experiment_item_root_span_id", "=", eb.ref("e.span_id")),
  ),
};

/**
 * SQL text of field `id`'s expression, for the raw-SQL column mappings:
 * `e.span_id` for `id`. Throws `QueryCompileError` for a field without one
 * (metadata, scores, comments).
 */
export function eventsFieldSql(id: string): string {
  const lowering = EVENTS_FIELD_LOWERINGS[id];
  if (!lowering || lowering.kind === "metadata") {
    throw new QueryCompileError(
      `'${id}' has no single-expression lowering in EVENTS_FIELD_LOWERINGS.`,
    );
  }
  return renderClickhouseExpression(
    lowering.value(expressionBuilder<EventsDb, "e">()),
  );
}
