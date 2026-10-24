import { filterOperators, FTS_MATCH_OPERATOR } from "../interfaces/filters";
import type { TracingSearchType } from "../interfaces/search";
import type { ColumnDefinition } from "../tableDefinitions/types";
import type { ConditionType, PredicateOperator } from "./predicate";

/**
 * Semantic half of the source registry: what a predicate over a source may
 * reference. The SQL lowering per field lives server-side.
 */

export type PredicateSourceFieldType = ColumnDefinition["type"];

export type PredicateSourceField = {
  id: string;
  label: string;
  /** Legacy column spellings that still resolve to this field. */
  aliases: readonly string[];
  type: PredicateSourceFieldType;
  /** Condition variants accepted on this field, each with its operators. */
  operators: Partial<Record<ConditionType, readonly PredicateOperator[]>>;
  /** A row can match several values, e.g. one per comment. */
  multiValued?: boolean;
};

export type PredicateSource = {
  id: string;
  fields: readonly PredicateSourceField[];
  /** Physical columns matched by free-text search, per scope. */
  searchScopes: Record<TracingSearchType, readonly string[]>;
};

const CONDITION_TYPES_BY_FIELD_TYPE: Record<
  PredicateSourceFieldType,
  readonly ConditionType[]
> = {
  string: ["string", "stringOptions"],
  stringOptions: ["string", "stringOptions"],
  arrayOptions: ["arrayOptions", "stringOptions"],
  categoryOptions: ["categoryOptions", "stringOptions"],
  datetime: ["datetime"],
  number: ["number"],
  boolean: ["boolean"],
  stringObject: ["stringObject"],
  numberObject: ["numberObject"],
  booleanObject: ["booleanObject"],
  null: [],
  positionInTrace: [],
};

const field = (
  id: string,
  label: string,
  type: PredicateSourceFieldType,
  opts: {
    aliases?: readonly string[];
    matches?: boolean;
    multiValued?: boolean;
  } = {},
): PredicateSourceField => ({
  id,
  label,
  aliases: opts.aliases ?? [],
  type,
  ...(opts.multiValued ? { multiValued: true } : {}),
  operators: Object.fromEntries(
    CONDITION_TYPES_BY_FIELD_TYPE[type].map((conditionType) => [
      conditionType,
      opts.matches &&
      (conditionType === "string" || conditionType === "stringObject")
        ? [...filterOperators[conditionType], FTS_MATCH_OPERATOR]
        : filterOperators[conditionType],
    ]),
  ),
});

export const eventsPredicateSource: PredicateSource = {
  id: "events",
  fields: [
    field("id", "ID", "stringOptions"),
    field("traceId", "Trace ID", "string"),
    field("startTime", "Start Time", "datetime"),
    field("endTime", "End Time", "datetime"),
    field("name", "Name", "stringOptions"),
    field("type", "Type", "stringOptions"),
    field("environment", "Environment", "stringOptions", {
      aliases: ["traceEnvironment", "Trace Environment"],
    }),
    field("ingestionApiKey", "API Key", "stringOptions"),
    field("ingestionSdkName", "SDK Name", "stringOptions"),
    field("ingestionSdkVersion", "SDK Version", "stringOptions"),
    field("ingestionSource", "Ingestion Source", "stringOptions"),
    field("version", "Version", "string"),
    field("release", "Release", "string"),
    field("userId", "User ID", "string"),
    field("sessionId", "Session ID", "string"),
    field("traceName", "Trace Name", "stringOptions"),
    field("level", "Status", "stringOptions", { aliases: ["Level"] }),
    field("statusMessage", "Status Message", "string"),
    field("promptName", "Prompt Name", "stringOptions"),
    field("promptVersion", "Prompt Version", "number"),
    field("modelId", "Model ID", "stringOptions"),
    field("providedModelName", "Provided Model Name", "stringOptions", {
      aliases: ["model", "Model"],
    }),
    field("totalCost", "Cost ($)", "number", {
      aliases: ["Total Cost ($)"],
    }),
    field("inputTokens", "Input Tokens", "number"),
    field("cachedInputTokens", "Cached Input Tokens", "number"),
    field("outputTokens", "Output Tokens", "number"),
    field("totalTokens", "Total Tokens", "number", {
      aliases: ["tokens", "Tokens"],
    }),
    field("inputCost", "Input Cost ($)", "number"),
    field("cachedInputCost", "Cached Input Cost ($)", "number"),
    field("outputCost", "Output Cost ($)", "number"),
    field("latency", "Latency (s)", "number"),
    field("timeToFirstToken", "Time To First Token (s)", "number"),
    field("tokensPerSecond", "Tokens per second", "number"),
    field("input", "Input", "string", { matches: true }),
    field("output", "Output", "string", { matches: true }),
    field("metadata", "Metadata", "stringObject", { matches: true }),
    field("evaluatorId", "Evaluator ID", "stringOptions"),
    field("ruleId", "Rule ID", "stringOptions"),
    field("traceTags", "Trace Tags", "arrayOptions", {
      aliases: ["tags", "Tags"],
    }),
    field("scores_avg", "Scores (numeric)", "numberObject"),
    field("score_categories", "Scores (categorical)", "categoryOptions"),
    field("score_booleans", "Scores (boolean)", "booleanObject"),
    field("trace_scores_avg", "Trace Scores (numeric)", "numberObject"),
    field(
      "trace_score_categories",
      "Trace Scores (categorical)",
      "categoryOptions",
    ),
    field("trace_score_booleans", "Trace Scores (boolean)", "booleanObject"),
    field("commentCount", "Comment Count", "number"),
    field("commentContent", "Comment Content", "string", {
      multiValued: true,
    }),
    field("hasParentObservation", "Has Parent Observation", "boolean"),
    field("isRootObservation", "Is Root Observation", "boolean"),
    field("hasInput", "Has Input", "boolean"),
    field("hasOutput", "Has Output", "boolean"),
    field("experimentDatasetId", "Experiment Dataset ID", "stringOptions"),
    field("experimentId", "Experiment ID", "stringOptions"),
    field("experimentName", "Experiment Name", "stringOptions"),
    field("skillsNamesLoaded", "Loaded Skill Names", "arrayOptions"),
    field("skillsVersionsLoaded", "Loaded Skill Versions", "arrayOptions"),
    field("skillNamesAvailable", "Available Skill Names", "arrayOptions"),
    field("skillVersionsAvailable", "Available Skill Versions", "arrayOptions"),
    field("toolNames", "Available Tool Names", "arrayOptions", {
      aliases: ["Tool Names"],
    }),
    field("calledToolNames", "Called Tool Names", "arrayOptions"),
    field("toolDefinitions", "Available Tools", "number"),
    field("toolCalls", "Tool Calls", "number"),
    field(
      "isExperimentItemRootSpan",
      "Is Experiment Item Root Span",
      "boolean",
    ),
  ],
  searchScopes: {
    id: ["span_id", "name", "trace_name", "user_id", "session_id", "trace_id"],
    content: ["input", "output"],
    input: ["input"],
    output: ["output"],
  },
};

/** Resolves a column spelling (id, label, or legacy alias) to its field. */
export const resolvePredicateSourceField = (
  source: PredicateSource,
  column: string,
): PredicateSourceField | undefined =>
  source.fields.find((f) => f.id === column) ??
  source.fields.find((f) => f.label === column || f.aliases.includes(column));
