import type {
  Expression,
  ExpressionBuilder,
  SelectCallback,
  SelectExpression,
} from "kysely";

import { renderClickhouseSelections } from "../query-ast/compile";
import { getClickhouseKysely } from "../query-ast/dialect";
import {
  anyIf,
  argMax,
  argMaxIf,
  anyValue,
  arrayExists,
  arrayLength,
  arraySort,
  concat,
  countIf,
  dateDiff,
  greatest,
  groupArray,
  groupUniqArray,
  groupUniqArrayArray,
  groupUniqArrayArrayIf,
  groupUniqArrayIf,
  ifElse,
  ifNull,
  isNull,
  latestNonEmpty,
  literal,
  mapFromArrays,
  mapKeys,
  mapValue,
  metadataValue,
  metadataMap,
  multiIf,
  notEmpty,
  nullIf,
  sumMap,
  sumMapValuesWhereKeyContains,
  toBool,
  tuple,
  uniq,
  uniqIf,
} from "../query-ast/extensions";
import type { ClickHouseDatabase } from "../query-ast/schema";
import {
  orderedFieldKeys,
  type EventsFieldKey,
  type FieldSetFieldKey,
} from "./events-field-sets";

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

/** Session aggregates that only filters and sorts read, never a result row. */
type SessionFilterField =
  | "tool_names"
  | "called_tool_names"
  | "tool_calls_count"
  | "metadata_names"
  | "metadata_values";

type SessionAggregationField = SessionEventsField | SessionFilterField;

type EventsDb = { e: ClickHouseDatabase["events"] };
type EventsRow = ClickHouseDatabase["events"];
type EventsColumn = keyof EventsRow & string;
type StringColumn = {
  [K in EventsColumn]: EventsRow[K] extends string ? K : never;
}[EventsColumn];
type EventsSelection = SelectExpression<EventsDb, "e">;

type EventsExpressionBuilder = ExpressionBuilder<EventsDb, "e">;

const OBSERVATION_BY_ID_FIELDS = orderedFieldKeys([
  "id",
  "traceId",
  "projectId",
  "environment",
  "type",
  "parentObservationId",
  "name",
  "level",
  "statusMessage",
  "version",
  "bookmarked",
  "public",
  "userId",
  "sessionId",
  "traceName",
  "startTime",
  "endTime",
  "completionStartTime",
  "createdAt",
  "updatedAt",
  "eventTs",
  "providedModelName",
  "internalModelId",
  "modelParameters",
  "providedUsageDetails",
  "usageDetails",
  "providedCostDetails",
  "costDetails",
  "totalCost",
  "promptId",
  "promptName",
  "promptVersion",
  "skillsAvailable",
  "skillsResourceLoaded",
  "toolDefinitions",
  "toolCalls",
  "toolCallNames",
  "usagePricingTierId",
  "usagePricingTierName",
  "metadata",
  "tags",
  "release",
] as const satisfies readonly EventsFieldKey[]);

/** Every trace aggregate, in the column order full trace reads select them. */
export const TRACE_AGGREGATION_FIELDS = [
  "id",
  "project_id",
  "name",
  "timestamp",
  "environment",
  "version",
  "session_id",
  "user_id",
  "input",
  "output",
  "metadata",
  "created_at",
  "updated_at",
  "total_cost",
  "latency_milliseconds",
  "observation_ids",
  "observation_count",
  "bookmarked",
  "public",
  "experiment_item_id",
  "usage_details",
  "cost_details",
  "aggregated_level",
  "warning_count",
  "error_count",
  "default_count",
  "debug_count",
  "tags",
  "release",
  "evaluator_id",
  "evaluation_rule_id",
  "experiment_id",
] as const;

const eventsMetadataMap = (eb: EventsExpressionBuilder) =>
  metadataMap(eb.ref("e.metadata_names"), eb.ref("e.metadata_values"));

/**
 * The event's metadata value for `key`; the last entry of a duplicated key
 * wins. Keys follow `mapValue`: a string is bound, a `literal(...)` is inlined.
 */
export const eventsMetadataValue = scopedToEvents(
  (eb, key: string | Expression<string>) =>
    metadataValue(eb.ref("e.metadata_names"), eb.ref("e.metadata_values"), key),
);

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
const latestNonEmptyOf = (
  eb: EventsExpressionBuilder,
  column: `e.${StringColumn}`,
) => latestNonEmpty(eb.ref(column), eb.ref("e.event_ts"));

/** `column` of the trace's root observation. */
const ofRootSpan = (eb: EventsExpressionBuilder, column: `e.${EventsColumn}`) =>
  argMaxIf(
    eb.ref(column),
    eb.ref("e.event_ts"),
    eb("e.parent_span_id", "=", literal("")),
  );

const countLevel = (eb: EventsExpressionBuilder, level: string) =>
  countIf(eb("e.level", "=", literal(level)));

type TraceAggregationField = (typeof TRACE_AGGREGATION_FIELDS)[number];

/**
 * Trace-level aggregates over events for `fields`, in that order: one row per
 * trace. Grouped by `trace_id, project_id`.
 */
export const traceAggregationSelects = pickSelects(traceAggregationSelectMap);

/** Trace-level aggregates, keyed by field. */
function traceAggregationSelectMap(eb: EventsExpressionBuilder) {
  return {
    id: eb.ref("e.trace_id").as("id"),
    project_id: "e.project_id as project_id",
    name: eb.fn
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
    timestamp: eb.fn.min("e.start_time").as("timestamp"),
    environment: latestNonEmptyOf(eb, "e.environment").as("environment"),
    version: latestNonEmptyOf(eb, "e.version").as("version"),
    session_id: latestNonEmptyOf(eb, "e.session_id").as("session_id"),
    user_id: latestNonEmptyOf(eb, "e.user_id").as("user_id"),
    input: ofRootSpan(eb, "e.input").as("input"),
    output: ofRootSpan(eb, "e.output").as("output"),
    metadata: argMaxIf(
      eventsMetadataMap(eb),
      eb.ref("e.event_ts"),
      eb("e.parent_span_id", "=", literal("")),
    ).as("metadata"),
    created_at: eb.fn.min("e.created_at").as("created_at"),
    updated_at: eb.fn.max("e.updated_at").as("updated_at"),
    total_cost: eb.fn.sum("e.total_cost").as("total_cost"),
    latency_milliseconds: ifElse(
      eb(eb.fn.max("e.end_time"), "is", null),
      literal(null),
      dateDiff(
        "millisecond",
        eb.fn.min("e.start_time"),
        greatest(eb.fn.max("e.start_time"), eb.fn.max("e.end_time")),
      ),
    ).as("latency_milliseconds"),
    observation_ids: groupUniqArrayIf(
      eb.ref("e.span_id"),
      eb("e.span_id", "<>", literal("")),
    ).as("observation_ids"),
    observation_count: arrayLength(
      groupUniqArrayIf(
        eb.ref("e.span_id"),
        eb.and([
          eb("e.span_id", "<>", literal("")),
          eb("e.span_id", "<>", concat(literal("t-"), eb.ref("e.trace_id"))),
        ]),
      ),
    ).as("observation_count"),
    bookmarked: ofRootSpan(eb, "e.bookmarked").as("bookmarked"),
    public: eb.fn.max("e.public").as("public"),
    experiment_item_id: latestNonEmptyOf(eb, "e.experiment_item_id").as(
      "experiment_item_id",
    ),
    usage_details: sumMap(eb.ref("e.usage_details")).as("usage_details"),
    cost_details: sumMap(eb.ref("e.cost_details")).as("cost_details"),
    aggregated_level: multiIf(
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
    warning_count: countLevel(eb, "WARNING").as("warning_count"),
    error_count: countLevel(eb, "ERROR").as("error_count"),
    default_count: countLevel(eb, "DEFAULT").as("default_count"),
    debug_count: countLevel(eb, "DEBUG").as("debug_count"),
    tags: arraySort(
      groupUniqArrayArrayIf(eb.ref("e.tags"), notEmpty(eb.ref("e.tags"))),
    ).as("tags"),
    release: latestNonEmptyOf(eb, "e.release").as("release"),
    // Evaluator execution fields are stamped on every internal evaluation span.
    evaluator_id: latestNonEmptyOf(eb, "e.evaluator_id").as("evaluator_id"),
    evaluation_rule_id: latestNonEmptyOf(eb, "e.evaluation_rule_id").as(
      "evaluation_rule_id",
    ),
    experiment_id: anyValue(eb.ref("e.experiment_id")).as("experiment_id"),
  } satisfies Record<TraceAggregationField, EventsSelection>;
}

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
    tool_names: groupUniqArrayArray(mapKeys(eb.ref("e.tool_definitions"))).as(
      "tool_names",
    ),
    called_tool_names: groupUniqArrayArray(eb.ref("e.tool_call_names")).as(
      "called_tool_names",
    ),
    tool_calls_count: eb.fn
      .sum(arrayLength(eb.ref("e.tool_calls")))
      .as("tool_calls_count"),
    environment: latestNonEmptyOf(eb, "e.environment").as("environment"),
    metadata_names: argMax(eb.ref("e.metadata_names"), latestSpanOrder(eb)).as(
      "metadata_names",
    ),
    metadata_values: argMax(
      eb.ref("e.metadata_values"),
      latestSpanOrder(eb),
    ).as("metadata_values"),
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
      literal("input"),
    ).as("session_input_cost"),
    session_output_cost: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.cost_details")),
      literal("output"),
    ).as("session_output_cost"),
    session_total_cost: mapValue(
      sumMap(eb.ref("e.cost_details")),
      literal("total"),
    ).as("session_total_cost"),
    session_input_usage: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.usage_details")),
      literal("input"),
    ).as("session_input_usage"),
    session_output_usage: sumMapValuesWhereKeyContains(
      sumMap(eb.ref("e.usage_details")),
      literal("output"),
    ).as("session_output_usage"),
    session_total_usage: mapValue(
      sumMap(eb.ref("e.usage_details")),
      literal("total"),
    ).as("session_total_usage"),
  } satisfies Record<SessionAggregationField, EventsSelection>;
}

/** Orders a session's events by start, then write time, then span id. */
const latestSpanOrder = (eb: EventsExpressionBuilder) =>
  tuple(eb.ref("e.start_time"), eb.ref("e.event_ts"), eb.ref("e.span_id"));

/**
 * One row per experiment, aggregated from its events. Grouped by
 * `project_id, experiment_id`.
 */
const experimentAggregationSelects = scopedToEvents(
  (eb) =>
    [
      "e.experiment_id as experiment_id",
      anyValue(eb.ref("e.experiment_name")).as("experiment_name"),
      anyIf(
        eb.ref("e.experiment_description"),
        eb("e.span_id", "=", eb.ref("e.experiment_item_root_span_id")),
      ).as("experiment_description"),
      nullIf(anyValue(eb.ref("e.experiment_dataset_id")), literal("")).as(
        "experiment_dataset_id",
      ),
      eb.fn.min("e.start_time").as("start_time"),
      uniq(eb.ref("e.experiment_item_id")).as("item_count"),
      // Distinct items that carry any ERROR event, so the number matches the
      // items-view Status=ERROR list the badge opens.
      uniqIf(
        eb.ref("e.experiment_item_id"),
        eb("e.level", "=", literal("ERROR")),
      ).as("error_count"),
      groupUniqArrayIf(
        tuple(eb.ref("e.prompt_name"), eb.ref("e.prompt_version")),
        eb("e.prompt_name", "!=", literal("")),
      ).as("prompts"),
      anyValue(
        mapFromArrays(
          eb.ref("e.experiment_metadata_names"),
          eb.ref("e.experiment_metadata_values"),
        ),
      ).as("experiment_metadata"),
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

type RowFieldKey =
  | FieldSetFieldKey<RowFieldSet>
  | (typeof OBSERVATION_BY_ID_FIELDS)[number];

/**
 * Row-level event fields for `keys`, in that order. Pass keys in
 * `eventsFieldSetKeys` order: clustered reads align result blocks by column
 * position.
 */
export const eventsRowFieldSelects = pickSelects(rowFieldSelectMap);

/** One observation's fields, without input/output. */
export const observationByIdSelects = eventsRowFieldSelects(
  OBSERVATION_BY_ID_FIELDS,
);

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
    eventTs: "e.event_ts",
    providedModelName: "e.provided_model_name as provided_model_name",
    internalModelId: "e.model_id as internal_model_id",
    modelParameters: "e.model_parameters as model_parameters",
    providedUsageDetails: "e.provided_usage_details as provided_usage_details",
    usageDetails: "e.usage_details as usage_details",
    providedCostDetails: "e.provided_cost_details as provided_cost_details",
    costDetails: "e.cost_details as cost_details",
    totalCost: "e.total_cost as total_cost",
    promptId: "e.prompt_id as prompt_id",
    promptName: "e.prompt_name as prompt_name",
    promptVersion: "e.prompt_version as prompt_version",
    skillsAvailable: "e.skills_available as skills_available",
    skillsResourceLoaded: "e.skills_resource_loaded as skills_resource_loaded",
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
  } satisfies Record<RowFieldKey, EventsSelection>;
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

/** {@link traceAggregationSelects} as SQL text, keyed by output name. */
export const TRACE_AGGREGATION_SQL = renderEventsSelects((eb) =>
  traceAggregationSelects(TRACE_AGGREGATION_FIELDS)(eb),
);

/** Every session aggregate as SQL text, keyed by field. */
export const SESSION_AGGREGATION_SQL = renderEventsSelects((eb) =>
  Object.values(sessionAggregationSelectMap(eb)),
);

/** {@link experimentAggregationSelects} as SQL text, keyed by output name. */
export const EXPERIMENT_AGGREGATION_SQL = renderEventsSelects((eb) =>
  experimentAggregationSelects(eb),
);

/**
 * SQL text of each of `selects`, keyed by output name, for the raw-SQL builders
 * that read events as `e`.
 */
function renderEventsSelects<S extends SelectCallback<EventsDb, "e">>(
  selects: S,
) {
  return renderClickhouseSelections(
    getClickhouseKysely().selectFrom("events as e").select(selects),
  );
}

/**
 * Makes `build` callable with the calling query's expression builder, which
 * must satisfy {@link ReadsEvents}. Every expression export of this module
 * goes through it, and so must any helper that composes them: called with the
 * query's own builder, using one outside a query that reads only events as `e`
 * is a type error. Never pass a query's own builder to a helper typed
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
 * join (no caller joins; with one, an unqualified column added here later
 * would silently read the other table), or an `e` missing an events column
 * (`observations as e`, a narrower subquery). `ExpressionBuilder` alone would
 * accept the narrower `e`, because it is contravariant in `DB`.
 */
type ReadsEvents<DB, TB extends keyof DB> = ExpressionBuilder<DB, TB> &
  ([DB] extends [EventsDb]
    ? [TB] extends ["e"]
      ? ["e"] extends [TB]
        ? unknown
        : never
      : never
    : never);
