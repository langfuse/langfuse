import { sql, type ExpressionBuilder, type SelectExpression } from "kysely";

import type {
  SkillsAvailable,
  SkillsResourceLoaded,
} from "../../features/skills/trace";

import {
  argMaxIf,
  anyValue,
  arrayExists,
  arrayLength,
  concat,
  countIf,
  dateDiff,
  greatest,
  groupArray,
  groupUniqArray,
  groupUniqArrayArrayIf,
  groupUniqArrayIf,
  ifElse,
  ifNull,
  isNull,
  literal,
  mapValue,
  metadataMap,
  multiIf,
  notEmpty,
  nullIf,
  sumMap,
  sumMapValuesWhereKeyContains,
  toBool,
  traceSessionId,
  uniq,
  uniqIf,
} from "../query-ast/extensions";
import type { ClickHouseDatabase } from "../query-ast/schema";
import type { FieldSetFieldKey } from "./events-field-sets";

/** One row of the session aggregation (`sessionAggregationSelects`). */
export type SessionEventsMetricsRow = {
  session_id: string;
  max_timestamp: string;
  min_timestamp: string;
  trace_ids: string[];
  user_ids: string[];
  trace_count: number;
  trace_tags: string[];
  environment?: string;
  total_observations: number;
  duration: number;
  session_usage_details: Record<string, number>;
  session_cost_details: Record<string, number>;
  session_input_cost: string;
  session_output_cost: string;
  session_total_cost: string;
  session_input_usage: string;
  session_output_usage: string;
  session_total_usage: string;
};

export type SessionEventsField = keyof SessionEventsMetricsRow;

type EventsDb = { e: ClickHouseDatabase["events_core"] };
type EventsRow = ClickHouseDatabase["events_core"];
type EventsColumn = keyof EventsRow & string;
type StringColumn = {
  [K in EventsColumn]: EventsRow[K] extends string ? K : never;
}[EventsColumn];
type EventsSelection = SelectExpression<EventsDb, "e">;

type EventsExpressionBuilder = ExpressionBuilder<EventsDb, "e">;

const eventsMetadataMap = (eb: EventsExpressionBuilder) =>
  metadataMap(eb.ref("e.metadata_names"), eb.ref("e.metadata_values"));

/** The event is a root observation: no parent span, or an app root. */
export const eventsIsRootObservation = scopedToEvents((eb) =>
  eb.or([
    eb("e.parent_span_id", "=", literal("")),
    eb("e.is_app_root", "=", literal(true)),
  ]),
);

/**
 * An event's trace name: the stored `trace_name`, else the name of a root
 * observation, else NULL.
 */
export const eventsTraceName = scopedToEvents((eb) =>
  eb.fn.coalesce(
    nullIf(eb.ref("e.trace_name"), literal("")),
    ifElse(
      eventsIsRootObservation(eb),
      nullIf(eb.ref("e.name"), literal("")),
      literal(null),
    ),
  ),
);

/**
 * {@link eventsTraceName} as a non-null String, '' when the event has no trace
 * name. Projected under `trace_name`, the nullable form would clash with the
 * physical String column of the same name once a query also filters and sorts
 * on it (ClickHouse AMBIGUOUS_COLUMN_NAME).
 */
export const eventsTraceNameOrEmpty = scopedToEvents((eb) =>
  ifNull(eventsTraceName(eb), literal("")),
);

const traceNameSelect = (eb: EventsExpressionBuilder) =>
  eventsTraceNameOrEmpty(eb).as("trace_name");

/** The latest non-empty value of `column` across a trace's events. */
const latestNonEmpty = (
  eb: EventsExpressionBuilder,
  column: `e.${StringColumn}`,
) =>
  argMaxIf(eb.ref(column), eb.ref("e.event_ts"), eb(column, "<>", literal("")));

/** `column` of the trace's root observation. */
const ofRootSpan = (eb: EventsExpressionBuilder, column: `e.${EventsColumn}`) =>
  argMaxIf(
    eb.ref(column),
    eb.ref("e.event_ts"),
    eb("e.parent_span_id", "=", literal("")),
  );

const countLevel = (eb: EventsExpressionBuilder, level: string) =>
  countIf(eb("e.level", "=", literal(level)));

/**
 * One row per trace, aggregated from its events. Grouped by
 * `trace_id, project_id`.
 */
export const traceAggregationSelects = scopedToEvents(
  (eb) =>
    [
      eb.ref("e.trace_id").as("id"),
      "e.project_id as project_id",
      eb.fn
        .coalesce(
          nullIf(
            argMaxIf(
              eb.ref("e.trace_name"),
              eb.ref("e.event_ts"),
              eb("e.trace_name", "<>", literal("")),
            ),
            literal(""),
          ),
          nullIf(
            argMaxIf(
              eb.ref("e.name"),
              eb.ref("e.event_ts"),
              eb.and([
                eventsIsRootObservation(eb),
                eb("e.name", "<>", literal("")),
              ]),
            ),
            literal(""),
          ),
        )
        .as("name"),
      eb.fn.min("e.start_time").as("timestamp"),
      latestNonEmpty(eb, "e.environment").as("environment"),
      latestNonEmpty(eb, "e.version").as("version"),
      traceSessionId(eb.ref("e.session_id"), eb.ref("e.event_ts")).as(
        "session_id",
      ),
      latestNonEmpty(eb, "e.user_id").as("user_id"),
      ofRootSpan(eb, "e.input").as("input"),
      ofRootSpan(eb, "e.output").as("output"),
      argMaxIf(
        eventsMetadataMap(eb),
        eb.ref("e.event_ts"),
        eb("e.parent_span_id", "=", literal("")),
      ).as("metadata"),
      eb.fn.min("e.created_at").as("created_at"),
      eb.fn.max("e.updated_at").as("updated_at"),
      eb.fn.sum("e.total_cost").as("total_cost"),
      ifElse(
        eb(eb.fn.max("e.end_time"), "is", null),
        literal(null),
        dateDiff(
          "millisecond",
          eb.fn.min("e.start_time"),
          greatest(eb.fn.max("e.start_time"), eb.fn.max("e.end_time")),
        ),
      ).as("latency_milliseconds"),
      groupUniqArrayIf(
        eb.ref("e.span_id"),
        eb("e.span_id", "<>", literal("")),
      ).as("observation_ids"),
      arrayLength(
        groupUniqArrayIf(
          eb.ref("e.span_id"),
          eb.and([
            eb("e.span_id", "<>", literal("")),
            eb("e.span_id", "<>", concat(literal("t-"), eb.ref("e.trace_id"))),
          ]),
        ),
      ).as("observation_count"),
      ofRootSpan(eb, "e.bookmarked").as("bookmarked"),
      eb.fn.max("e.public").as("public"),
      latestNonEmpty(eb, "e.experiment_item_id").as("experiment_item_id"),
      sumMap(eb.ref("e.usage_details")).as("usage_details"),
      sumMap(eb.ref("e.cost_details")).as("cost_details"),
      multiIf(
        ["ERROR", "WARNING", "DEFAULT"].map(
          (level) =>
            [
              arrayExists(
                (x) => eb(x, "=", literal(level)),
                groupArray(eb.ref("e.level")),
              ),
              literal(level),
            ] as const,
        ),
        literal("DEBUG"),
      ).as("aggregated_level"),
      countLevel(eb, "WARNING").as("warning_count"),
      countLevel(eb, "ERROR").as("error_count"),
      countLevel(eb, "DEFAULT").as("default_count"),
      countLevel(eb, "DEBUG").as("debug_count"),
      argMaxIf(
        eb.ref("e.tags"),
        eb.ref("e.event_ts"),
        notEmpty(eb.ref("e.tags")),
      ).as("tags"),
      latestNonEmpty(eb, "e.release").as("release"),
      latestNonEmpty(eb, "e.evaluator_id").as("evaluator_id"),
      latestNonEmpty(eb, "e.evaluation_rule_id").as("evaluation_rule_id"),
      anyValue(eb.ref("e.experiment_id")).as("experiment_id"),
    ] satisfies EventsSelection[],
);

/**
 * Session-level aggregates over events for `fields`, in that order. Grouped by
 * `session_id`.
 */
export const sessionAggregationSelects = pickSelects(
  sessionAggregationSelectMap,
);

/** Session-level aggregates, keyed by field. */
function sessionAggregationSelectMap(eb: EventsExpressionBuilder) {
  return {
    session_id: "e.session_id as session_id",
    max_timestamp: eb.fn.max("e.start_time").as("max_timestamp"),
    min_timestamp: eb.fn.min("e.start_time").as("min_timestamp"),
    trace_ids: groupUniqArray(eb.ref("e.trace_id")).as("trace_ids"),
    user_ids: groupUniqArrayIf(
      eb.ref("e.user_id"),
      eb.and([
        eb("e.user_id", "is not", null),
        eb("e.user_id", "!=", literal("")),
      ]),
    ).as("user_ids"),
    trace_count: uniq(eb.ref("e.trace_id")).as("trace_count"),
    trace_tags: groupUniqArrayArrayIf(
      eb.ref("e.tags"),
      notEmpty(eb.ref("e.tags")),
    ).as("trace_tags"),
    environment: latestNonEmpty(eb, "e.environment").as("environment"),
    total_observations: uniqIf(
      eb.ref("e.span_id"),
      eb("e.parent_span_id", "!=", literal("")),
    ).as("total_observations"),
    duration: dateDiff(
      "second",
      eb.fn.min("e.start_time"),
      eb.fn.max(
        ifElse(
          isNull(eb.ref("e.end_time")),
          eb.ref("e.start_time"),
          eb.ref("e.end_time"),
        ),
      ),
    ).as("duration"),
    session_usage_details: sumMap(eb.ref("e.usage_details")).as(
      "session_usage_details",
    ),
    session_cost_details: sumMap(eb.ref("e.cost_details")).as(
      "session_cost_details",
    ),
    session_input_cost: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.cost_details")),
      "input",
    ).as("session_input_cost"),
    session_output_cost: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.cost_details")),
      "output",
    ).as("session_output_cost"),
    session_total_cost: mapValue(
      sumMap(eb.ref("e.cost_details")),
      literal("total"),
    ).as("session_total_cost"),
    session_input_usage: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.usage_details")),
      "input",
    ).as("session_input_usage"),
    session_output_usage: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.usage_details")),
      "output",
    ).as("session_output_usage"),
    session_total_usage: mapValue(
      sumMap(eb.ref("e.usage_details")),
      literal("total"),
    ).as("session_total_usage"),
  } satisfies Record<SessionEventsField, EventsSelection>;
}

/** One observation's fields, without input/output. */
export const observationByIdSelects = scopedToEvents(
  (eb) =>
    [
      "e.span_id as id",
      "e.trace_id as trace_id",
      "e.project_id as project_id",
      "e.environment as environment",
      "e.type as type",
      "e.parent_span_id as parent_observation_id",
      "e.name as name",
      "e.level as level",
      "e.status_message as status_message",
      "e.version as version",
      "e.bookmarked as bookmarked",
      "e.public as public",
      "e.user_id as user_id",
      "e.session_id as session_id",
      traceNameSelect(eb),
      "e.start_time as start_time",
      "e.end_time as end_time",
      "e.completion_start_time as completion_start_time",
      "e.created_at as created_at",
      "e.updated_at as updated_at",
      "e.event_ts",
      "e.provided_model_name as provided_model_name",
      "e.model_id as internal_model_id",
      "e.model_parameters as model_parameters",
      "e.provided_usage_details as provided_usage_details",
      "e.usage_details as usage_details",
      "e.provided_cost_details as provided_cost_details",
      "e.cost_details as cost_details",
      "e.total_cost as total_cost",
      "e.prompt_id as prompt_id",
      "e.prompt_name as prompt_name",
      "e.prompt_version as prompt_version",
      sql.ref<SkillsAvailable>("e.skills_available").as("skills_available"),
      sql
        .ref<SkillsResourceLoaded>("e.skills_resource_loaded")
        .as("skills_resource_loaded"),
      "e.tool_definitions as tool_definitions",
      "e.tool_calls as tool_calls",
      "e.tool_call_names as tool_call_names",
      "e.usage_pricing_tier_id as usage_pricing_tier_id",
      "e.usage_pricing_tier_name as usage_pricing_tier_name",
      eventsMetadataMap(eb).as("metadata"),
      "e.tags as tags",
      "e.release as release",
    ] satisfies EventsSelection[],
);

/** Milliseconds from an event's start to `end`, NULL while `end` is unset. */
export const millisecondsSinceStart = scopedToEvents(
  (
    eb: EventsExpressionBuilder,
    end: "e.end_time" | "e.completion_start_time",
  ) =>
    ifElse(
      isNull(eb.ref(end)),
      literal(null),
      dateDiff("millisecond", eb.ref("e.start_time"), eb.ref(end)),
    ),
);

/** {@link millisecondsSinceStart} in seconds. */
const secondsSinceStart = (
  eb: EventsExpressionBuilder,
  end: "e.end_time" | "e.completion_start_time",
) =>
  ifElse(
    isNull(eb.ref(end)),
    literal(null),
    eb(
      dateDiff("millisecond", eb.ref("e.start_time"), eb.ref(end)),
      "/",
      literal(1000),
    ),
  );

type RowFieldSet =
  | "core"
  | "basic"
  | "time"
  | "metadata"
  | "model_export"
  | "usage"
  | "prompt"
  | "metrics"
  | "trace_context"
  | "tools"
  | "export";

/**
 * Row-level event fields for `keys`, in that order. Pass keys in
 * `eventsFieldSetKeys` order: clustered reads align result blocks by column
 * position.
 */
export const eventsRowFieldSelects = pickSelects(rowFieldSelectMap);

/**
 * Row-level event fields, keyed like the legacy builder's field sets. Select
 * them in `eventsFieldSetKeys` order: clustered reads align result blocks by
 * column position.
 */
function rowFieldSelectMap(eb: EventsExpressionBuilder) {
  return {
    id: "e.span_id as id",
    traceId: "e.trace_id as trace_id",
    projectId: "e.project_id as project_id",
    environment: "e.environment as environment",
    type: "e.type as type",
    parentObservationId: "e.parent_span_id as parent_observation_id",
    isRootObservation: toBool(eventsIsRootObservation(eb)).as(
      "is_root_observation",
    ),
    name: "e.name as name",
    level: "e.level as level",
    statusMessage: "e.status_message as status_message",
    version: "e.version as version",
    bookmarked: "e.bookmarked as bookmarked",
    public: "e.public as public",
    userId: "e.user_id as user_id",
    sessionId: "e.session_id as session_id",
    traceName: traceNameSelect(eb),
    startTime: "e.start_time as start_time",
    endTime: "e.end_time as end_time",
    completionStartTime: "e.completion_start_time as completion_start_time",
    createdAt: "e.created_at as created_at",
    updatedAt: "e.updated_at as updated_at",
    providedModelName: "e.provided_model_name as provided_model_name",
    modelParameters: "e.model_parameters as model_parameters",
    usageDetails: "e.usage_details as usage_details",
    costDetails: "e.cost_details as cost_details",
    totalCost: "e.total_cost as total_cost",
    promptId: "e.prompt_id as prompt_id",
    promptName: "e.prompt_name as prompt_name",
    promptVersion: "e.prompt_version as prompt_version",
    toolDefinitions: "e.tool_definitions as tool_definitions",
    toolCalls: "e.tool_calls as tool_calls",
    toolCallNames: "e.tool_call_names as tool_call_names",
    usagePricingTierId: "e.usage_pricing_tier_id as usage_pricing_tier_id",
    usagePricingTierName:
      "e.usage_pricing_tier_name as usage_pricing_tier_name",
    metadata: eventsMetadataMap(eb).as("metadata"),
    tags: "e.tags as tags",
    release: "e.release as release",
    modelId: "e.model_id as model_id",
    latency: millisecondsSinceStart(eb, "e.end_time").as("latency"),
    timeToFirstToken: millisecondsSinceStart(eb, "e.completion_start_time").as(
      "time_to_first_token",
    ),
  } satisfies Record<FieldSetFieldKey<RowFieldSet>, EventsSelection>;
}

/** The `metrics` field set with latencies in seconds instead of milliseconds. */
export const eventsMetricsSecondsSelects = scopedToEvents(
  (eb) =>
    [
      secondsSinceStart(eb, "e.end_time").as("latency"),
      secondsSinceStart(eb, "e.completion_start_time").as(
        "time_to_first_token",
      ),
    ] satisfies EventsSelection[],
);

/**
 * Makes `build` callable with the calling query's expression builder, which
 * must satisfy {@link ReadsEvents}. Every export of this module goes through
 * it, and so must any helper that composes them: called with the query's own
 * builder, using one outside a query that reads only events as `e` is a type
 * error. Never pass a query's own builder to a helper typed
 * `ExpressionBuilder<{ e: … }, "e">`: that accepts any query's builder and the
 * check is lost. Wrap the helper in `scopedToEvents` instead.
 */
export function scopedToEvents<A extends unknown[], R>(
  build: (eb: EventsExpressionBuilder, ...args: A) => R,
) {
  return <DB, TB extends keyof DB>(eb: ReadsEvents<DB, TB>, ...args: A): R =>
    // Sound when `eb` is the query's own builder: `ReadsEvents` then proves the
    // query reads only a full events row as `e`.
    build(eb as unknown as EventsExpressionBuilder, ...args);
}

/** For a keyed select map: the selects of the given keys, in their order. */
function pickSelects<M extends Record<string, EventsSelection>>(
  map: (eb: EventsExpressionBuilder) => M,
) {
  return (keys: ReadonlyArray<keyof M>) =>
    scopedToEvents((eb) => {
      const selects = map(eb);
      return keys.map((key) => selects[key]);
    });
}

/**
 * The expression builder of a query that reads only a full events row, as
 * `e`. Anything else resolves to `never`: no `e`, no FROM (`selectNoFrom`), a
 * join (the selects use unqualified columns, which ClickHouse would resolve to
 * the other table), or an `e` missing an events column (`observations as e`, a
 * narrower subquery). `ExpressionBuilder` alone would accept the narrower `e`,
 * because it is contravariant in `DB`.
 */
type ReadsEvents<DB, TB extends keyof DB> = ExpressionBuilder<DB, TB> &
  ([DB] extends [EventsDb]
    ? [TB] extends ["e"]
      ? ["e"] extends [TB]
        ? unknown
        : never
      : never
    : never);
