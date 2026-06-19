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

import type { CompareOp } from "./ast";
import { quoteIfNeeded, unquote } from "./quoting";

export type FieldKind = "text" | "number" | "datetime" | "boolean";
export type SyncMode = "exactOption" | "arrayOption" | "textSearch";

export type FieldDef = {
  /** Canonical field id; also the filter `column` sent to the API. */
  id: string;
  /** Lowercase aliases accepted by the grammar (canonical id always works too). */
  aliases: string[];
  kind: FieldKind;
  syncMode: SyncMode;
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
};

// prettier-ignore
export const FIELDS: FieldDef[] = [
  { id: "id", aliases: ["spanid", "span_id", "observationid", "observation_id"], kind: "text", syncMode: "textSearch", suggestObservedValues: true, description: "Observation/span identifier" },
  { id: "traceId", aliases: ["traceid", "trace_id"], kind: "text", syncMode: "textSearch", description: "Trace identifier" },
  { id: "name", aliases: [], kind: "text", syncMode: "textSearch", suggestObservedValues: true, description: "Observation name", nullable: true },
  { id: "traceName", aliases: ["tracename", "trace_name"], kind: "text", syncMode: "exactOption", description: "Trace name", nullable: true },
  { id: "type", aliases: [], kind: "text", syncMode: "exactOption", description: "Observation type" },
  { id: "environment", aliases: ["env"], kind: "text", syncMode: "exactOption", description: "Environment", nullable: true },
  { id: "userId", aliases: ["userid", "user_id", "user"], kind: "text", syncMode: "exactOption", description: "Trace user id", nullable: true },
  { id: "sessionId", aliases: ["sessionid", "session_id", "session"], kind: "text", syncMode: "exactOption", description: "Trace session id", nullable: true },
  { id: "level", aliases: [], kind: "text", syncMode: "exactOption", description: "Observation level" },
  { id: "statusMessage", aliases: ["statusmessage", "status_message", "status"], kind: "text", syncMode: "textSearch", description: "Status message", nullable: true },
  { id: "modelId", aliases: ["modelid", "model_id"], kind: "text", syncMode: "exactOption", description: "Internal model id", nullable: true },
  { id: "providedModelName", aliases: ["providedmodelname", "provided_model_name", "model"], kind: "text", syncMode: "exactOption", description: "Provided model name", nullable: true },
  { id: "promptName", aliases: ["promptname", "prompt_name", "prompt"], kind: "text", syncMode: "exactOption", description: "Prompt name", nullable: true },
  { id: "promptVersion", aliases: ["promptversion", "prompt_version"], kind: "number", syncMode: "textSearch", description: "Prompt version", nullable: true },
  { id: "startTime", aliases: ["starttime", "start_time"], kind: "datetime", syncMode: "textSearch", description: "Observation start time" },
  { id: "endTime", aliases: ["endtime", "end_time"], kind: "datetime", syncMode: "textSearch", description: "Observation end time", nullable: true },
  { id: "latency", aliases: [], kind: "number", syncMode: "textSearch", description: "Observation latency in seconds", unit: "s", nullable: true },
  { id: "timeToFirstToken", aliases: ["timetofirsttoken", "time_to_first_token", "ttft"], kind: "number", syncMode: "textSearch", description: "Time to first token in seconds", unit: "s", nullable: true },
  { id: "tokensPerSecond", aliases: ["tokenspersecond", "tokens_per_second", "tps"], kind: "number", syncMode: "textSearch", description: "Output tokens per second", unit: "tok/s", nullable: true },
  { id: "inputTokens", aliases: ["inputtokens", "input_tokens"], kind: "number", syncMode: "textSearch", description: "Input token count", nullable: true },
  { id: "outputTokens", aliases: ["outputtokens", "output_tokens"], kind: "number", syncMode: "textSearch", description: "Output token count", nullable: true },
  { id: "totalTokens", aliases: ["totaltokens", "total_tokens", "tokens"], kind: "number", syncMode: "textSearch", description: "Total token count", nullable: true },
  { id: "inputCost", aliases: ["inputcost", "input_cost"], kind: "number", syncMode: "textSearch", description: "Input cost in USD", unit: "$", nullable: true },
  { id: "outputCost", aliases: ["outputcost", "output_cost"], kind: "number", syncMode: "textSearch", description: "Output cost in USD", unit: "$", nullable: true },
  { id: "totalCost", aliases: ["totalcost", "total_cost", "cost"], kind: "number", syncMode: "textSearch", description: "Total cost in USD", unit: "$", nullable: true },
  { id: "version", aliases: [], kind: "text", syncMode: "exactOption", description: "Version tag", nullable: true },
  { id: "traceTags", aliases: ["tracetags", "trace_tags", "tags", "tag"], kind: "text", syncMode: "arrayOption", description: "Trace tags" },
  { id: "isRootObservation", aliases: ["isrootobservation", "is_root_observation", "root"], kind: "boolean", syncMode: "textSearch", description: "Whether the observation is a trace root" },
  { id: "hasParentObservation", aliases: ["hasparentobservation", "has_parent_observation"], kind: "boolean", syncMode: "textSearch", description: "Whether the observation has a parent (inverse of root)" },
  { id: "toolNames", aliases: ["toolnames", "tool_names"], kind: "text", syncMode: "arrayOption", description: "Available tool names", nullable: true },
  { id: "calledToolNames", aliases: ["calledtoolnames", "called_tool_names", "calledtools", "called_tools"], kind: "text", syncMode: "arrayOption", description: "Called tool names", nullable: true },
  { id: "toolDefinitions", aliases: ["tooldefinitions", "tool_definitions"], kind: "number", syncMode: "textSearch", description: "Available tool count", nullable: true },
  { id: "toolCalls", aliases: ["toolcalls", "tool_calls"], kind: "number", syncMode: "textSearch", description: "Tool call count", nullable: true },
  { id: "commentCount", aliases: ["commentcount", "comment_count"], kind: "number", syncMode: "textSearch", description: "Comment count" },
  { id: "commentContent", aliases: ["commentcontent", "comment_content", "comment"], kind: "text", syncMode: "textSearch", description: "Comment text", nullable: true },
  { id: "experimentDatasetId", aliases: ["experimentdatasetid", "experiment_dataset_id", "dataset"], kind: "text", syncMode: "exactOption", description: "Experiment dataset identifier", nullable: true },
  { id: "experimentId", aliases: ["experimentid", "experiment_id"], kind: "text", syncMode: "exactOption", description: "Experiment identifier", nullable: true },
  { id: "experimentName", aliases: ["experimentname", "experiment_name", "experiment"], kind: "text", syncMode: "exactOption", description: "Experiment name", nullable: true },
  { id: "input", aliases: [], kind: "text", syncMode: "textSearch", description: "Observation input", nullable: true },
  { id: "output", aliases: [], kind: "text", syncMode: "textSearch", description: "Observation output", nullable: true },
];

const byName = new Map<string, FieldDef>();
for (const f of FIELDS) {
  byName.set(f.id.toLowerCase(), f);
  for (const a of f.aliases) byName.set(a, f);
}

export const METADATA_PREFIX = "metadata.";

// Score dot-paths. Lowercased prefixes accepted by the grammar; the
// canonical spellings are `scores.<name>` and `traceScores.<name>`.
const SCORE_PREFIXES = ["scores.", "score."];
const TRACE_SCORE_PREFIXES = ["tracescores.", "trace_scores.", "tracescore."];

// Pseudo-fields: not columns — `has:<field>` lowers to a null filter. (The
// former `content:` pseudo-field has been removed: a bare query now searches
// input + output by default, and `input:`/`output:` narrow to one column.)
export const HAS_KEY = "has";

/** Langfuse score filter columns (filter by score NAME via key-value ops). */
export const SCORE_COLUMNS = {
  observation: { numeric: "scores_avg", categorical: "score_categories" },
  trace: {
    numeric: "trace_scores_avg",
    categorical: "trace_score_categories",
  },
} as const;

export type FieldRef =
  | { type: "field"; field: FieldDef }
  | { type: "metadata"; key: string }
  | { type: "scores"; key: string; level: "observation" | "trace" }
  | { type: "pseudo"; id: typeof HAS_KEY };

/**
 * Resolve a user-typed key (case-insensitive, alias-aware) to a field, a
 * metadata/score dot path (the key keeps its case), or a pseudo-field.
 * Null = unknown key.
 */
export function resolveField(name: string): FieldRef | null {
  const lower = name.toLowerCase();
  // The segment after a dot-path prefix may be quoted to carry spaces/grammar
  // chars (`scores."Rouge Score"`, `metadata."my key"`); unquote it to the real
  // key. refName re-quotes it on the way back out.
  if (lower.startsWith(METADATA_PREFIX)) {
    const key = unquote(name.slice(METADATA_PREFIX.length)).value;
    return key.length > 0 ? { type: "metadata", key } : null;
  }
  for (const prefix of TRACE_SCORE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const key = unquote(name.slice(prefix.length)).value;
      return key.length > 0 ? { type: "scores", key, level: "trace" } : null;
    }
  }
  for (const prefix of SCORE_PREFIXES) {
    if (lower.startsWith(prefix)) {
      const key = unquote(name.slice(prefix.length)).value;
      return key.length > 0
        ? { type: "scores", key, level: "observation" }
        : null;
    }
  }
  if (lower === HAS_KEY) return { type: "pseudo", id: lower };
  const field = byName.get(lower);
  return field ? { type: "field", field } : null;
}

/**
 * A dot-path prefix typed/picked with no key after the dot (`metadata.`,
 * `scores.`, `traceScores.` and accepted aliases). These parse as free text
 * (no colon), so without this guard committing one would silently set the
 * full-text searchQuery to the bare prefix.
 */
export function isDanglingDotPrefix(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower === METADATA_PREFIX ||
    SCORE_PREFIXES.includes(lower) ||
    TRACE_SCORE_PREFIXES.includes(lower)
  );
}

/** Fields that can be unset — the value domain of `has:` / `-has:`. */
export function nullableFields(): FieldDef[] {
  return FIELDS.filter((f) => f.nullable === true);
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

export function refName(ref: FieldRef): string {
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
