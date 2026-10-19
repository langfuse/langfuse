import { expressionBuilder, sql, type SelectExpression } from "kysely";

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

/** One row of the session aggregation (`SESSION_AGGREGATION_SELECTS`). */
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

const eb = expressionBuilder<EventsDb, "e">();

const eventsMetadataMap = metadataMap(
  eb.ref("e.metadata_names"),
  eb.ref("e.metadata_values"),
);

/** The event is a root observation: no parent span, or an app root. */
export const eventsIsRootObservation = eb.or([
  eb("e.parent_span_id", "=", literal("")),
  eb("e.is_app_root", "=", literal(true)),
]);

/**
 * An event's trace name: the stored `trace_name`, else the name of a root
 * observation, else NULL.
 */
export const eventsTraceName = eb.fn.coalesce(
  nullIf(eb.ref("e.trace_name"), literal("")),
  ifElse(
    eventsIsRootObservation,
    nullIf(eb.ref("e.name"), literal("")),
    literal(null),
  ),
);

/**
 * {@link eventsTraceName} as a non-null String, '' when the event has no trace
 * name. Projected under `trace_name`, the nullable form would clash with the
 * physical String column of the same name once a query also filters and sorts
 * on it (ClickHouse AMBIGUOUS_COLUMN_NAME).
 */
export const eventsTraceNameOrEmpty = ifNull(eventsTraceName, literal(""));

const traceNameSelect = eventsTraceNameOrEmpty.as("trace_name");

/** The latest non-empty value of `column` across a trace's events. */
const latestNonEmpty = (column: StringColumn) =>
  argMaxIf(eb.ref(column), eb.ref("event_ts"), eb(column, "<>", literal("")));

/** `column` of the trace's root observation. */
const ofRootSpan = <C extends EventsColumn>(column: C) =>
  argMaxIf(
    eb.ref(column),
    eb.ref("event_ts"),
    eb("parent_span_id", "=", literal("")),
  );

const countLevel = (level: string) => countIf(eb("level", "=", literal(level)));

/**
 * One row per trace, aggregated from its events. Grouped by
 * `trace_id, project_id`.
 */
export const TRACE_AGGREGATION_SELECTS = [
  eb.ref("trace_id").as("id"),
  "project_id",
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
          eb.and([eventsIsRootObservation, eb("e.name", "<>", literal(""))]),
        ),
        literal(""),
      ),
    )
    .as("name"),
  eb.fn.min("start_time").as("timestamp"),
  latestNonEmpty("environment").as("environment"),
  latestNonEmpty("version").as("version"),
  traceSessionId().as("session_id"),
  latestNonEmpty("user_id").as("user_id"),
  ofRootSpan("input").as("input"),
  ofRootSpan("output").as("output"),
  argMaxIf(
    eventsMetadataMap,
    eb.ref("event_ts"),
    eb("parent_span_id", "=", literal("")),
  ).as("metadata"),
  eb.fn.min("created_at").as("created_at"),
  eb.fn.max("updated_at").as("updated_at"),
  eb.fn.sum("total_cost").as("total_cost"),
  ifElse(
    eb(eb.fn.max("end_time"), "is", null),
    literal(null),
    dateDiff(
      "millisecond",
      eb.fn.min("start_time"),
      greatest(eb.fn.max("start_time"), eb.fn.max("end_time")),
    ),
  ).as("latency_milliseconds"),
  groupUniqArrayIf(eb.ref("span_id"), eb("span_id", "<>", literal(""))).as(
    "observation_ids",
  ),
  arrayLength(
    groupUniqArrayIf(
      eb.ref("span_id"),
      eb.and([
        eb("span_id", "<>", literal("")),
        eb("span_id", "<>", concat(literal("t-"), eb.ref("trace_id"))),
      ]),
    ),
  ).as("observation_count"),
  ofRootSpan("bookmarked").as("bookmarked"),
  eb.fn.max("public").as("public"),
  latestNonEmpty("experiment_item_id").as("experiment_item_id"),
  sumMap(eb.ref("usage_details")).as("usage_details"),
  sumMap(eb.ref("cost_details")).as("cost_details"),
  multiIf(
    ["ERROR", "WARNING", "DEFAULT"].map(
      (level) =>
        [
          arrayExists(
            (x) => eb(x, "=", literal(level)),
            groupArray(eb.ref("level")),
          ),
          literal(level),
        ] as const,
    ),
    literal("DEBUG"),
  ).as("aggregated_level"),
  countLevel("WARNING").as("warning_count"),
  countLevel("ERROR").as("error_count"),
  countLevel("DEFAULT").as("default_count"),
  countLevel("DEBUG").as("debug_count"),
  argMaxIf(eb.ref("tags"), eb.ref("event_ts"), notEmpty(eb.ref("tags"))).as(
    "tags",
  ),
  latestNonEmpty("release").as("release"),
  latestNonEmpty("evaluator_id").as("evaluator_id"),
  latestNonEmpty("evaluation_rule_id").as("evaluation_rule_id"),
  anyValue(eb.ref("experiment_id")).as("experiment_id"),
] satisfies EventsSelection[];

/** Session-level aggregates over events, keyed by field. Grouped by `session_id`. */
export const SESSION_AGGREGATION_SELECTS = {
  session_id: "session_id",
  max_timestamp: eb.fn.max("start_time").as("max_timestamp"),
  min_timestamp: eb.fn.min("start_time").as("min_timestamp"),
  trace_ids: groupUniqArray(eb.ref("trace_id")).as("trace_ids"),
  user_ids: groupUniqArrayIf(
    eb.ref("user_id"),
    eb.and([eb("user_id", "is not", null), eb("user_id", "!=", literal(""))]),
  ).as("user_ids"),
  trace_count: uniq(eb.ref("trace_id")).as("trace_count"),
  trace_tags: groupUniqArrayArrayIf(
    eb.ref("tags"),
    notEmpty(eb.ref("tags")),
  ).as("trace_tags"),
  environment: latestNonEmpty("environment").as("environment"),
  total_observations: uniqIf(
    eb.ref("span_id"),
    eb("parent_span_id", "!=", literal("")),
  ).as("total_observations"),
  duration: dateDiff(
    "second",
    eb.fn.min("start_time"),
    eb.fn.max(
      ifElse(
        isNull(eb.ref("end_time")),
        eb.ref("start_time"),
        eb.ref("end_time"),
      ),
    ),
  ).as("duration"),
  session_usage_details: sumMap(eb.ref("usage_details")).as(
    "session_usage_details",
  ),
  session_cost_details: sumMap(eb.ref("cost_details")).as(
    "session_cost_details",
  ),
  session_input_cost: sumMapValuesWhereKeyContains(
    sumMap(eb.ref("cost_details")),
    "input",
  ).as("session_input_cost"),
  session_output_cost: sumMapValuesWhereKeyContains(
    sumMap(eb.ref("cost_details")),
    "output",
  ).as("session_output_cost"),
  session_total_cost: mapValue(
    sumMap(eb.ref("cost_details")),
    literal("total"),
  ).as("session_total_cost"),
  session_input_usage: sumMapValuesWhereKeyContains(
    sumMap(eb.ref("usage_details")),
    "input",
  ).as("session_input_usage"),
  session_output_usage: sumMapValuesWhereKeyContains(
    sumMap(eb.ref("usage_details")),
    "output",
  ).as("session_output_usage"),
  session_total_usage: mapValue(
    sumMap(eb.ref("usage_details")),
    literal("total"),
  ).as("session_total_usage"),
} satisfies Record<SessionEventsField, EventsSelection>;

/** One observation's fields, without input/output. */
export const OBSERVATION_BY_ID_SELECTS = [
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
  traceNameSelect,
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
  eventsMetadataMap.as("metadata"),
  "e.tags as tags",
  "e.release as release",
] satisfies EventsSelection[];

/** Milliseconds from an event's start to `end`, NULL while `end` is unset. */
export const millisecondsSinceStart = (
  end: "e.end_time" | "e.completion_start_time",
) =>
  ifElse(
    isNull(eb.ref(end)),
    literal(null),
    dateDiff("millisecond", eb.ref("e.start_time"), eb.ref(end)),
  );

/** {@link millisecondsSinceStart} in seconds. */
const secondsSinceStart = (end: "e.end_time" | "e.completion_start_time") =>
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
 * Row-level event fields, keyed like the legacy builder's field sets. Select
 * them in `eventsFieldSetKeys` order: clustered reads align result blocks by
 * column position.
 */
export const EVENTS_ROW_FIELD_SELECTS = {
  id: "e.span_id as id",
  traceId: "e.trace_id as trace_id",
  projectId: "e.project_id as project_id",
  environment: "e.environment as environment",
  type: "e.type as type",
  parentObservationId: "e.parent_span_id as parent_observation_id",
  isRootObservation: toBool(eventsIsRootObservation).as("is_root_observation"),
  name: "e.name as name",
  level: "e.level as level",
  statusMessage: "e.status_message as status_message",
  version: "e.version as version",
  bookmarked: "e.bookmarked as bookmarked",
  public: "e.public as public",
  userId: "e.user_id as user_id",
  sessionId: "e.session_id as session_id",
  traceName: traceNameSelect,
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
  usagePricingTierName: "e.usage_pricing_tier_name as usage_pricing_tier_name",
  metadata: eventsMetadataMap.as("metadata"),
  tags: "e.tags as tags",
  release: "e.release as release",
  modelId: "e.model_id as model_id",
  latency: millisecondsSinceStart("e.end_time").as("latency"),
  timeToFirstToken: millisecondsSinceStart("e.completion_start_time").as(
    "time_to_first_token",
  ),
} satisfies Record<FieldSetFieldKey<RowFieldSet>, EventsSelection>;

/** The `metrics` field set with latencies in seconds instead of milliseconds. */
export const EVENTS_METRICS_SECONDS_SELECTS = [
  secondsSinceStart("e.end_time").as("latency"),
  secondsSinceStart("e.completion_start_time").as("time_to_first_token"),
] satisfies EventsSelection[];
