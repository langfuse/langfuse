// Field registry — the single source of truth for autocomplete, validation,
// operator choice, and lowering into the flat Langfuse `FilterState`.
//
// Field ids/kinds mirror the v4 events table column definitions
// (packages/shared/src/eventsTable.ts) and the observations-events filter
// config (web/src/features/events/config/filter-config.ts). The registry only
// expresses what the existing events tRPC contract accepts today — the
// adapter never emits a filter shape the sidebar could not produce.
//
// Sync modes:
//   exactOption — option-backed column; '=' lowers to stringOptions any-of
//   arrayOption — array column (traceTags, toolNames); supports all-of
//   textSearch  — plain text/number/datetime column; '=' lowers to contains
//
// `syncMode` drives the LOWERING shape; `suggestObservedValues` drives the
// AUTOCOMPLETE picker independently — `id`/`name` are textSearch (so `id:abc`
// is a substring search) yet keep their observed-value picker.

import {
  eventsTableCols,
  type ColumnDefinition,
  type SingleValueOption,
} from "@langfuse/shared";

import type { CompareOp } from "./ast";
import { quoteIfNeeded, unquote } from "./quoting";

type FieldKind = "text" | "number" | "datetime" | "boolean";
type SyncMode = "exactOption" | "arrayOption" | "textSearch";

export type FieldDef = {
  /** Canonical query field id; defaults to the FilterState column unless
   * `filterColumn` maps a display-oriented field to canonical storage. */
  id: string;
  /** Lowercase aliases accepted by the grammar (canonical id always works too). */
  aliases: string[];
  kind: FieldKind;
  syncMode: SyncMode;
  /** Human name, used as the subject of a token's explanation ("Total cost is
   *  above $0.5") — the canonical id is camelCase and does not read as prose.
   *  On a `boolean` field this is the whole affirmative phrase instead ("Is
   *  root observation"), since such a token is a yes/no statement, not a
   *  subject with a value. */
  label: string;
  /** Boolean fields only: the phrase for the false case ("Is not root
   *  observation") — English negates these irregularly (is not / has no). */
  negatedLabel?: string;
  description: string;
  /** Display unit for numeric suggestion labels (filter-config units). */
  unit?: string;
  /** Column can be unset in the dataset — `has:`/`-has:` (null checks) apply. */
  nullable?: boolean;
  /**
   * Offer the observed-value picker in autocomplete even when `syncMode` is
   * `textSearch` (which otherwise has no value list). Lets `id`/`name` search
   * as substring while still suggesting existing values. Implied for
   * `exactOption`; only set this on `textSearch` fields that should suggest.
   */
  suggestObservedValues?: boolean;
  /** Canonical FilterState column emitted for this display-oriented field. */
  filterColumn?: string;
  /** Display/query value → canonical FilterState value for labeled options. */
  filterValueByDisplayValue?: ReadonlyMap<string, string>;
  /** Canonical FilterState value → display/query value for labeled options. */
  displayValueByFilterValue?: ReadonlyMap<string, string>;
  /** Nullable-only columns participate in `has:` but are not direct filters. */
  directFilter?: boolean;
};

export type FieldRegistry = {
  id:
    | "events"
    | "evaluationRules"
    | "evaluatorSamples"
    | "ruleSamples"
    | "sessions"
    | "experiments";
  fields: readonly FieldDef[];
  columns: readonly ColumnDefinition[];
  allowFreeText: boolean;
  metadata: boolean;
  scores: boolean;
  /** Trace-level `traceScores.<name>` paths. Views whose backend has no
   *  trace-score columns (sessions) keep observation scores without them. */
  traceScores: boolean;
  /** Field a bare word searches on a view with no full-text lane. Sessions has
   *  no searchQuery, but `id contains` is its most-applied filter by far, so a
   *  bare word means that instead of being rejected. Null = reject. */
  defaultTextField: string | null;
  /** Placeholder examples. Written per view, never derived from field ids: the
   *  events examples advertise `latency:`/`level:` on a view that has neither. */
  searchExamples: readonly string[];
  /**
   * Offer the project's recent searches on the empty bar. Off by default: the
   * store is per PROJECT, not per view, so a view opts in and only the recents
   * that are valid against its own registry are offered.
   */
  recentSearches: boolean;
  /**
   * Whether this view has its OWN branch in `buildFilterSystemPrompt`. False
   * hides Ask AI: the fallback prompt is the events one — events prose, events
   * worked examples — so a view without its own branch would be handed a
   * correct field catalog wrapped in instructions steering the model at columns
   * it does not have. Write the branch, then flip this.
   */
  aiFilterPrompt: boolean;
  aiContextFields: readonly AIContextField[];
  resolveField: (name: string) => FieldRef | null;
  nullableFields: () => readonly FieldDef[];
  /** Ids of `nullableFields`, precomputed for per-keystroke validation. */
  nullableFieldIds: ReadonlySet<string>;
  isDanglingDotPrefix: (value: string) => boolean;
  columnIdOf: (column: string) => string | null;
};

export type AIContextField = {
  /** Key in the observed filter-options payload. */
  observedOptionsKey: string;
  /** Human-readable field description rendered into the AI prompt context. */
  promptLabel: string;
};

export type FieldOverlay = Partial<
  Omit<FieldDef, "id" | "kind" | "syncMode" | "label" | "description">
> & {
  label?: string;
  description?: string;
};

export function fieldRegistryFromColumns(
  columns: readonly ColumnDefinition[],
  overlay: {
    id: FieldRegistry["id"];
    fields?: Readonly<Record<string, FieldOverlay>>;
    metadata?: boolean;
    scores?: boolean;
    /** Defaults to `scores`. */
    traceScores?: boolean;
    allowFreeText?: boolean;
    defaultTextField?: string;
    searchExamples?: readonly string[];
    recentSearches?: boolean;
    aiFilterPrompt?: boolean;
    aiContextFields?: readonly AIContextField[];
  },
): FieldRegistry {
  const scores = overlay.scores ?? false;
  const fields = columns
    // `*Object` columns and the categorical score column are keyed dot-paths
    // (`metadata.<key>`, `scores.<name>`), never plain fields — a derived
    // `score_categories` field would lower to a keyless categoryOptions filter
    // the backend cannot answer. That holds whether or not this view exposes
    // the `scores.` namespace: a view whose sidebar owns score filters still
    // has the column in its facets, and it is sidebar-only, not a bare field.
    // They stay in `columns` so the reverse adapter still resolves them.
    .filter(
      (column) =>
        !column.type.endsWith("Object") && !isKeyedScoreColumn(column.id),
    )
    .map((column): FieldDef => {
      const fieldOverlay = overlay.fields?.[column.id];
      const kind: FieldKind =
        column.type === "number" ||
        column.type === "datetime" ||
        column.type === "boolean"
          ? column.type
          : "text";
      const syncMode: SyncMode =
        column.type === "stringOptions" || column.type === "categoryOptions"
          ? "exactOption"
          : column.type === "arrayOptions"
            ? "arrayOption"
            : "textSearch";
      return {
        id: column.id,
        aliases: fieldOverlay?.aliases ?? column.aliases ?? [],
        kind,
        syncMode,
        label: fieldOverlay?.label ?? column.name,
        description: fieldOverlay?.description ?? column.name,
        nullable: column.nullable,
        directFilter: column.type !== "null",
        suggestObservedValues: fieldOverlay?.suggestObservedValues,
        filterColumn: fieldOverlay?.filterColumn,
        filterValueByDisplayValue: fieldOverlay?.filterValueByDisplayValue,
        displayValueByFilterValue: fieldOverlay?.displayValueByFilterValue,
        unit: fieldOverlay?.unit,
        negatedLabel: fieldOverlay?.negatedLabel,
      };
    });

  return createFieldRegistry({
    id: overlay.id,
    fields,
    columns,
    metadata: overlay.metadata ?? false,
    scores,
    traceScores: overlay.traceScores ?? scores,
    allowFreeText: overlay.allowFreeText ?? true,
    defaultTextField: overlay.defaultTextField ?? null,
    searchExamples: overlay.searchExamples ?? [],
    recentSearches: overlay.recentSearches ?? false,
    aiFilterPrompt: overlay.aiFilterPrompt ?? false,
    aiContextFields: overlay.aiContextFields ?? [],
  });
}

export function extendFieldRegistryWithColumns(
  registry: FieldRegistry,
  columns: readonly ColumnDefinition[],
  fieldOverlays?: Readonly<Record<string, FieldOverlay>>,
): FieldRegistry {
  const addedFields = fieldRegistryFromColumns(columns, {
    id: registry.id,
    fields: fieldOverlays,
  }).fields;

  return createFieldRegistry({
    id: registry.id,
    fields: [...registry.fields, ...addedFields],
    columns: [...registry.columns, ...columns],
    metadata: registry.metadata,
    scores: registry.scores,
    traceScores: registry.traceScores,
    allowFreeText: registry.allowFreeText,
    defaultTextField: registry.defaultTextField,
    searchExamples: registry.searchExamples,
    recentSearches: registry.recentSearches,
    aiFilterPrompt: registry.aiFilterPrompt,
    aiContextFields: registry.aiContextFields,
  });
}

export function withFieldOptions(
  registry: FieldRegistry,
  fieldId: string,
  options: readonly SingleValueOption[],
): FieldRegistry {
  const filterValueByDisplayValue = new Map(
    options.map((option) => [
      option.displayValue ?? option.value,
      option.value,
    ]),
  );
  const displayValueByFilterValue = new Map(
    options.map((option) => [
      option.value,
      option.displayValue ?? option.value,
    ]),
  );
  return createFieldRegistry({
    id: registry.id,
    fields: registry.fields.map((field) =>
      field.id === fieldId
        ? {
            ...field,
            filterValueByDisplayValue,
            displayValueByFilterValue,
          }
        : field,
    ),
    columns: registry.columns,
    metadata: registry.metadata,
    scores: registry.scores,
    traceScores: registry.traceScores,
    allowFreeText: registry.allowFreeText,
    defaultTextField: registry.defaultTextField,
    searchExamples: registry.searchExamples,
    recentSearches: registry.recentSearches,
    aiFilterPrompt: registry.aiFilterPrompt,
    aiContextFields: registry.aiContextFields,
  });
}

// prettier-ignore
export const FIELDS: FieldDef[] = [
  { id: "id", aliases: ["spanid", "span_id", "observationid", "observation_id"], kind: "text", syncMode: "textSearch", suggestObservedValues: true, label: "Observation ID", description: "Observation/span identifier" },
  { id: "traceId", aliases: ["traceid", "trace_id"], kind: "text", syncMode: "textSearch", label: "Trace ID", description: "Trace identifier" },
  { id: "name", aliases: [], kind: "text", syncMode: "textSearch", suggestObservedValues: true, label: "Name", description: "Observation name", nullable: true },
  { id: "traceName", aliases: ["tracename", "trace_name"], kind: "text", syncMode: "exactOption", label: "Trace name", description: "Trace name", nullable: true },
  { id: "type", aliases: [], kind: "text", syncMode: "exactOption", label: "Type", description: "Observation type" },
  { id: "environment", aliases: ["env"], kind: "text", syncMode: "exactOption", label: "Environment", description: "Environment", nullable: true },
  { id: "ingestionApiKey", aliases: ["ingestionapikey", "ingestion_api_key", "apikey", "api_key", "publickey", "public_key"], kind: "text", syncMode: "exactOption", label: "Ingestion API key", description: "Public ingestion API key" },
  { id: "ingestionSdkName", aliases: ["ingestionsdkname", "ingestion_sdk_name", "sdkname", "sdk_name"], kind: "text", syncMode: "exactOption", label: "Ingestion SDK name", description: "Ingestion SDK name" },
  { id: "ingestionSdkVersion", aliases: ["ingestionsdkversion", "ingestion_sdk_version", "sdkversion", "sdk_version"], kind: "text", syncMode: "exactOption", label: "Ingestion SDK version", description: "Ingestion SDK version" },
  { id: "ingestionSource", aliases: ["ingestionsource", "ingestion_source", "source"], kind: "text", syncMode: "exactOption", label: "Ingestion source", description: "Ingestion source (API or OTel path)" },
  { id: "userId", aliases: ["userid", "user_id", "user"], kind: "text", syncMode: "exactOption", label: "User ID", description: "Trace user id", nullable: true },
  { id: "sessionId", aliases: ["sessionid", "session_id", "session"], kind: "text", syncMode: "exactOption", label: "Session ID", description: "Trace session id", nullable: true },
  { id: "level", aliases: [], kind: "text", syncMode: "exactOption", label: "Status", description: "Observation status" },
  { id: "statusMessage", aliases: ["statusmessage", "status_message", "status"], kind: "text", syncMode: "textSearch", label: "Status message", description: "Status message", nullable: true },
  { id: "modelId", aliases: ["modelid", "model_id"], kind: "text", syncMode: "exactOption", label: "Model ID", description: "Internal model id", nullable: true },
  { id: "providedModelName", aliases: ["providedmodelname", "provided_model_name", "model"], kind: "text", syncMode: "exactOption", label: "Model name", description: "Provided model name", nullable: true },
  { id: "promptName", aliases: ["promptname", "prompt_name", "prompt"], kind: "text", syncMode: "exactOption", label: "Prompt name", description: "Prompt name", nullable: true },
  { id: "promptVersion", aliases: ["promptversion", "prompt_version"], kind: "number", syncMode: "textSearch", label: "Prompt version", description: "Prompt version", nullable: true },
  { id: "startTime", aliases: ["starttime", "start_time"], kind: "datetime", syncMode: "textSearch", label: "Start time", description: "Observation start time" },
  { id: "endTime", aliases: ["endtime", "end_time"], kind: "datetime", syncMode: "textSearch", label: "End time", description: "Observation end time", nullable: true },
  { id: "latency", aliases: [], kind: "number", syncMode: "textSearch", label: "Latency", description: "Observation latency in seconds", unit: "s", nullable: true },
  { id: "timeToFirstToken", aliases: ["timetofirsttoken", "time_to_first_token", "ttft"], kind: "number", syncMode: "textSearch", label: "Time to first token", description: "Time to first token in seconds", unit: "s", nullable: true },
  { id: "tokensPerSecond", aliases: ["tokenspersecond", "tokens_per_second", "tps"], kind: "number", syncMode: "textSearch", label: "Tokens per second", description: "Output tokens per second", unit: "tok/s", nullable: true },
  { id: "inputTokens", aliases: ["inputtokens", "input_tokens"], kind: "number", syncMode: "textSearch", label: "Input token count", description: "Input token count", nullable: true },
  { id: "cachedInputTokens", aliases: ["cachedinputtokens", "cached_input_tokens", "cachedtokens", "cached_tokens"], kind: "number", syncMode: "textSearch", label: "Cached input token count", description: "Cache-read input token count", nullable: true },
  { id: "outputTokens", aliases: ["outputtokens", "output_tokens"], kind: "number", syncMode: "textSearch", label: "Output token count", description: "Output token count", nullable: true },
  { id: "totalTokens", aliases: ["totaltokens", "total_tokens", "tokens"], kind: "number", syncMode: "textSearch", label: "Total token count", description: "Total token count", nullable: true },
  { id: "inputCost", aliases: ["inputcost", "input_cost"], kind: "number", syncMode: "textSearch", label: "Input cost", description: "Input cost in USD", unit: "$", nullable: true },
  { id: "cachedInputCost", aliases: ["cachedinputcost", "cached_input_cost", "cachedcost", "cached_cost"], kind: "number", syncMode: "textSearch", label: "Cached input cost", description: "Cache-read input cost in USD", unit: "$", nullable: true },
  { id: "outputCost", aliases: ["outputcost", "output_cost"], kind: "number", syncMode: "textSearch", label: "Output cost", description: "Output cost in USD", unit: "$", nullable: true },
  { id: "totalCost", aliases: ["totalcost", "total_cost", "cost"], kind: "number", syncMode: "textSearch", label: "Total cost", description: "Total cost in USD", unit: "$", nullable: true },
  { id: "version", aliases: [], kind: "text", syncMode: "exactOption", label: "Version", description: "Version tag", nullable: true },
  { id: "release", aliases: [], kind: "text", syncMode: "exactOption", label: "Release", description: "Release tag", nullable: true },
  { id: "traceTags", aliases: ["tracetags", "trace_tags", "tags", "tag"], kind: "text", syncMode: "arrayOption", label: "Trace tags", description: "Trace tags" },
  { id: "isRootObservation", aliases: ["isrootobservation", "is_root_observation", "root"], kind: "boolean", syncMode: "textSearch", label: "Is root observation", negatedLabel: "Is not root observation", description: "Whether the observation is a trace root" },
  { id: "hasParentObservation", aliases: ["hasparentobservation", "has_parent_observation"], kind: "boolean", syncMode: "textSearch", label: "Has a parent observation", negatedLabel: "Has no parent observation", description: "Whether the observation has a parent (inverse of root)" },
  { id: "hasInput", aliases: ["hasinput", "has_input"], kind: "boolean", syncMode: "textSearch", label: "Has input", negatedLabel: "Has no input", description: "Whether the observation has input" },
  { id: "hasOutput", aliases: ["hasoutput", "has_output"], kind: "boolean", syncMode: "textSearch", label: "Has output", negatedLabel: "Has no output", description: "Whether the observation has output" },
  { id: "toolNames", aliases: ["toolnames", "tool_names"], kind: "text", syncMode: "arrayOption", label: "Available tools", description: "Available tool names", nullable: true },
  { id: "calledToolNames", aliases: ["calledtoolnames", "called_tool_names", "calledtools", "called_tools"], kind: "text", syncMode: "arrayOption", label: "Called tools", description: "Called tool names", nullable: true },
  { id: "toolDefinitions", aliases: ["tooldefinitions", "tool_definitions"], kind: "number", syncMode: "textSearch", label: "Available tool count", description: "Available tool count", nullable: true },
  { id: "toolCalls", aliases: ["toolcalls", "tool_calls"], kind: "number", syncMode: "textSearch", label: "Tool call count", description: "Tool call count", nullable: true },
  { id: "commentCount", aliases: ["commentcount", "comment_count"], kind: "number", syncMode: "textSearch", label: "Comment count", description: "Comment count" },
  { id: "commentContent", aliases: ["commentcontent", "comment_content", "comment"], kind: "text", syncMode: "textSearch", label: "Comment text", description: "Comment text", nullable: true },
  { id: "experimentDatasetId", aliases: ["experimentdatasetid", "experiment_dataset_id", "dataset"], kind: "text", syncMode: "exactOption", label: "Experiment dataset ID", description: "Experiment dataset identifier", nullable: true },
  { id: "experimentId", aliases: ["experimentid", "experiment_id"], kind: "text", syncMode: "exactOption", label: "Experiment ID", description: "Experiment identifier", nullable: true },
  { id: "isExperimentItemRootSpan", aliases: ["isexperimentitemrootspan", "is_experiment_item_root_span", "experimentroot"], kind: "boolean", syncMode: "textSearch", label: "Is experiment item root span", negatedLabel: "Is not experiment item root span", description: "Whether the observation is the root span for an experiment item" },
  { id: "experimentName", aliases: ["experimentname", "experiment_name", "experiment"], kind: "text", syncMode: "exactOption", label: "Experiment name", description: "Experiment name", nullable: true },
  { id: "input", aliases: [], kind: "text", syncMode: "textSearch", label: "Input", description: "Observation input", nullable: true },
  { id: "output", aliases: [], kind: "text", syncMode: "textSearch", label: "Output", description: "Observation output", nullable: true },
];

const METADATA_PREFIX = "metadata.";

// Score dot-paths. Lowercased prefixes accepted by the grammar; the
// canonical spellings are `scores.<name>` and `traceScores.<name>`.
const SCORE_PREFIXES = ["scores.", "score."];
const TRACE_SCORE_PREFIXES = ["tracescores.", "trace_scores.", "tracescore."];

// Pseudo-fields: not columns — `has:<field>` lowers to a null filter. (The
// former `content:` pseudo-field has been removed: a bare query now searches
// input + output by default, and `input:`/`output:` narrow to one column.)
const HAS_KEY = "has";

/** Langfuse score filter columns (filter by score NAME via key-value ops). */
export const SCORE_COLUMNS = {
  observation: {
    numeric: "scores_avg",
    categorical: "score_categories",
    boolean: "score_booleans",
  },
  trace: {
    numeric: "trace_scores_avg",
    categorical: "trace_score_categories",
    boolean: "trace_score_booleans",
  },
} as const;

const KEYED_SCORE_COLUMNS: ReadonlySet<string> = new Set([
  ...Object.values(SCORE_COLUMNS.observation),
  ...Object.values(SCORE_COLUMNS.trace),
]);

function isKeyedScoreColumn(column: string): boolean {
  return KEYED_SCORE_COLUMNS.has(column);
}

export type FieldRef =
  | { type: "field"; field: FieldDef }
  | { type: "metadata"; key: string }
  | { type: "scores"; key: string; level: "observation" | "trace" }
  | { type: "pseudo"; id: typeof HAS_KEY };

function createFieldRegistry({
  id,
  fields,
  columns,
  metadata,
  scores,
  traceScores,
  allowFreeText,
  defaultTextField,
  searchExamples,
  recentSearches,
  aiFilterPrompt,
  aiContextFields,
}: {
  id: FieldRegistry["id"];
  fields: readonly FieldDef[];
  columns: readonly ColumnDefinition[];
  metadata: boolean;
  scores: boolean;
  traceScores: boolean;
  allowFreeText: boolean;
  defaultTextField: string | null;
  searchExamples: readonly string[];
  recentSearches: boolean;
  aiFilterPrompt: boolean;
  aiContextFields: readonly AIContextField[];
}): FieldRegistry {
  const byName = new Map<string, FieldDef>();
  for (const field of fields) {
    byName.set(field.id.toLowerCase(), field);
    for (const alias of field.aliases) byName.set(alias.toLowerCase(), field);
  }
  const nullable = fields.filter((field) => field.nullable === true);
  const columnIds = new Map<string, string>();
  for (const column of columns) {
    columnIds.set(column.id.toLowerCase(), column.id);
    columnIds.set(column.name.toLowerCase(), column.id);
    for (const alias of column.aliases ?? []) {
      columnIds.set(alias.toLowerCase(), column.id);
    }
  }
  for (const field of fields) {
    if (field.filterColumn) {
      columnIds.set(field.filterColumn.toLowerCase(), field.id);
    }
  }

  const registry: FieldRegistry = {
    id,
    fields,
    columns,
    allowFreeText,
    metadata,
    scores,
    traceScores,
    defaultTextField,
    searchExamples,
    recentSearches,
    aiFilterPrompt,
    aiContextFields,
    resolveField: (name) => resolveFromRegistry(name, registry, byName),
    nullableFields: () => nullable,
    nullableFieldIds: new Set(nullable.map((field) => field.id)),
    isDanglingDotPrefix: (value) => {
      const lower = value.toLowerCase();
      return (
        (metadata && lower === METADATA_PREFIX) ||
        (scores && SCORE_PREFIXES.includes(lower)) ||
        (traceScores && TRACE_SCORE_PREFIXES.includes(lower))
      );
    },
    columnIdOf: (column) => columnIds.get(column.toLowerCase()) ?? null,
  };
  return registry;
}

export const EVENTS_FIELD_REGISTRY = createFieldRegistry({
  id: "events",
  fields: FIELDS,
  columns: eventsTableCols,
  metadata: true,
  scores: true,
  traceScores: true,
  allowFreeText: true,
  defaultTextField: null,
  searchExamples: [
    "level:ERROR",
    "-env:dev",
    "latency:>2",
    "scores.accuracy:>0.8",
  ],
  recentSearches: true,
  aiFilterPrompt: true,
  aiContextFields: [
    { observedOptionsKey: "type", promptLabel: "type" },
    { observedOptionsKey: "level", promptLabel: "level" },
    { observedOptionsKey: "environment", promptLabel: "environment" },
    { observedOptionsKey: "traceName", promptLabel: "traceName" },
    { observedOptionsKey: "name", promptLabel: "name" },
    { observedOptionsKey: "traceTags", promptLabel: "traceTags (tags)" },
    {
      observedOptionsKey: "providedModelName",
      promptLabel: "providedModelName (model)",
    },
    { observedOptionsKey: "promptName", promptLabel: "promptName" },
    {
      observedOptionsKey: SCORE_COLUMNS.observation.numeric,
      promptLabel: "scores.<name> (numeric)",
    },
    {
      observedOptionsKey: SCORE_COLUMNS.observation.categorical,
      promptLabel: "scores.<name> (categorical)",
    },
    {
      observedOptionsKey: SCORE_COLUMNS.observation.boolean,
      promptLabel: "scores.<name> (boolean)",
    },
    {
      observedOptionsKey: SCORE_COLUMNS.trace.numeric,
      promptLabel: "traceScores.<name> (numeric)",
    },
    {
      observedOptionsKey: SCORE_COLUMNS.trace.categorical,
      promptLabel: "traceScores.<name> (categorical)",
    },
    {
      observedOptionsKey: SCORE_COLUMNS.trace.boolean,
      promptLabel: "traceScores.<name> (boolean)",
    },
  ],
});

function resolveFromRegistry(
  name: string,
  registry: FieldRegistry,
  byName: ReadonlyMap<string, FieldDef>,
): FieldRef | null {
  const lower = name.toLowerCase();
  if (registry.metadata && lower.startsWith(METADATA_PREFIX)) {
    const key = unquote(name.slice(METADATA_PREFIX.length)).value;
    return key.length > 0 ? { type: "metadata", key } : null;
  }
  if (registry.traceScores) {
    for (const prefix of TRACE_SCORE_PREFIXES) {
      if (lower.startsWith(prefix)) {
        const key = unquote(name.slice(prefix.length)).value;
        return key.length > 0 ? { type: "scores", key, level: "trace" } : null;
      }
    }
  }
  if (registry.scores) {
    for (const prefix of SCORE_PREFIXES) {
      if (lower.startsWith(prefix)) {
        const key = unquote(name.slice(prefix.length)).value;
        return key.length > 0
          ? { type: "scores", key, level: "observation" }
          : null;
      }
    }
  }
  if (lower === HAS_KEY) return { type: "pseudo", id: lower };
  const field = byName.get(lower);
  return field ? { type: "field", field } : null;
}

/**
 * Resolve a user-typed key (case-insensitive, alias-aware) to a field, a
 * metadata/score dot path (the key keeps its case), or a pseudo-field.
 * Null = unknown key.
 */
export function resolveField(
  name: string,
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): FieldRef | null {
  return registry.resolveField(name);
}

/**
 * A dot-path prefix typed/picked with no key after the dot (`metadata.`,
 * `scores.`, `traceScores.` and accepted aliases). These parse as free text
 * (no colon), so without this guard committing one would silently set the
 * full-text searchQuery to the bare prefix.
 */
export function isDanglingDotPrefix(
  value: string,
  registry: FieldRegistry = EVENTS_FIELD_REGISTRY,
): boolean {
  return registry.isDanglingDotPrefix(value);
}

// ---- operator validity ----
//
// One table consulted by the parser (span diagnostics), the validator (commit
// gate), and the adapter (lowering guard), so the three layers cannot drift.
// Everything allowed here lowers to a filter shape the events tRPC contract
// accepts today (filterTypeCompatibility.ts in @langfuse/shared).

const COMPARISONS: ReadonlySet<CompareOp> = new Set([">", "<", ">=", "<="]);
const STRING_OPS: ReadonlySet<CompareOp> = new Set(["exact", "~", "^", "$"]);

const OP_LABEL: Record<string, string> = {
  "~": "contains (*term*)",
  "^": "starts-with (term*)",
  $: "ends-with (*term)",
  exact: "exact match (=)",
};

function label(op: CompareOp): string {
  return OP_LABEL[op] ?? op;
}

/**
 * Is `op` (with `valueOp` grouping) usable on the field `ref` points at?
 * Returns the error message, or null when valid. Value-level checks (numeric
 * parse, ISO dates, true/false, has:/in: domains, flat-contract limits) live
 * in validate.ts.
 */
export function operatorIssue(
  ref: FieldRef,
  op: CompareOp,
  valueOp: "or" | "and" = "or",
): string | null {
  if (valueOp === "and") {
    const isArray =
      ref.type === "field" && ref.field.syncMode === "arrayOption";
    if (!isArray) {
      const name = refName(ref);
      return `AND grouping (all of) only applies to array fields like traceTags — "${name}" is not an array`;
    }
    if (op !== "=")
      return `AND grouping only works with plain values, not ${label(op)}`;
  }

  switch (ref.type) {
    case "pseudo":
      // `has` is the only pseudo-field.
      if (op !== "=") {
        return `has: lists fields that have a value — it does not support ${label(op)}`;
      }
      return null;
    case "metadata":
      // stringObject filters support string ops only; there is no numeric
      // metadata filter in the current contract.
      if (COMPARISONS.has(op)) {
        return `metadata filters match text — ${op} comparisons are not supported`;
      }
      return null;
    case "scores":
      if (STRING_OPS.has(op) && op !== "exact") {
        return `score filters compare numbers (${refName(ref)}:>0.8) or match categories (${refName(ref)}:positive) — ${label(op)} is not supported`;
      }
      return null;
    case "field": {
      const f = ref.field;
      if (f.directFilter === false) {
        return `"${f.id}" only supports presence checks (has:${f.id} or -has:${f.id})`;
      }
      if (f.filterColumn && (op === "~" || op === "^" || op === "$")) {
        return `"${f.id}" maps labeled options to exact stored values and does not support ${label(op)}`;
      }
      if (f.kind === "number") {
        if (op === "~" || op === "^" || op === "$") {
          return `"${f.id}" is a number field and does not support ${label(op)}`;
        }
        return null;
      }
      if (f.kind === "datetime") {
        if (op === "=" || op === "exact") {
          return `"${f.id}" is a datetime field — use a comparison (e.g. ${f.id}:>2026-06-01)`;
        }
        if (!COMPARISONS.has(op)) {
          return `"${f.id}" is a datetime field and does not support ${label(op)}`;
        }
        return null;
      }
      if (f.kind === "boolean") {
        if (op !== "=" && op !== "exact") {
          return `"${f.id}" is a boolean field and does not support ${label(op)}`;
        }
        return null;
      }
      // text
      if (COMPARISONS.has(op)) {
        return `"${f.id}" is a text field and does not support ${op}`;
      }
      if (f.syncMode === "arrayOption" && STRING_OPS.has(op)) {
        return `"${f.id}" is an array field — use values (${f.id}:a), any-of groups (${f.id}:(a OR b)), or all-of groups (${f.id}:(a AND b))`;
      }
      return null;
    }
  }
}

/**
 * Negation gaps: operations whose negative form has no counterpart in the
 * flat Langfuse filter contract.
 */
export function negationIssue(
  ref: FieldRef,
  op: CompareOp,
  valueOp: "or" | "and" = "or",
): string | null {
  if (valueOp === "and") {
    // NOT(all of) would mean "missing at least one" — no such array operator.
    return `negated all-of groups on "${refName(ref)}" are not representable — negate single values instead`;
  }
  if (ref.type === "pseudo") {
    return null; // `has` is the only pseudo; -has: is valid (missing value)
  }
  if (op === "^" || op === "$") {
    return `negation of ${label(op)} is not representable in the Langfuse filter contract`;
  }
  if (op === "exact" || op === "=") {
    if (ref.type === "metadata") {
      // stringObject has no "does not equal" — only does-not-contain.
      return op === "exact"
        ? `negated exact match on metadata is not representable — use -${refName(ref)}:*value* (does not contain)`
        : null; // '=' on metadata negates via categoryOptions? No — handled below.
    }
    if (ref.type === "scores") {
      // Numeric scores have no != ; categorical scores negate via none-of.
      return null; // checked per-value in validate.ts (numeric vs categorical)
    }
    if (ref.type === "field") {
      const f = ref.field;
      if (f.kind === "number") {
        return `negated equality on "${f.id}" is not representable — use comparisons (${f.id}:<n or ${f.id}:>n)`;
      }
      if (f.kind === "boolean") return null; // inverts the value
      // Negated exact on a textSearch field (`-name:=abc`) IS representable: it
      // is exact-inequality, which lowers to a stringOptions `none of` (there is
      // no `string !=`, but the option-set form covers it — and it is the shape
      // the facet emits when one value is unchecked). So no negation gap here.
      return null;
    }
  }
  return null;
}

function refName(ref: FieldRef): string {
  switch (ref.type) {
    case "field":
      return ref.field.id;
    case "metadata":
      return `metadata.${quoteIfNeeded(ref.key)}`;
    case "scores":
      return ref.level === "trace"
        ? `traceScores.${quoteIfNeeded(ref.key)}`
        : `scores.${quoteIfNeeded(ref.key)}`;
    case "pseudo":
      return ref.id;
  }
}

/** Canonical query-text key for a resolved field reference. */
export function canonicalKey(ref: FieldRef): string {
  return refName(ref);
}
