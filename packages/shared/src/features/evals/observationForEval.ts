import { z } from "zod";
import { DEFAULT_TRACE_ENVIRONMENT } from "../../server/ingestion/types";
import { type EventRecordBaseType } from "../../server/repositories/definitions";
import { ObservationLevel } from "../../domain";
import { metadataArraysToRecord } from "../../server/utils/metadata_conversion";
import { parseJsonIfString } from "../../utils/json";

const flexibleUsageCostSchema = z.record(
  z.string(),
  z.coerce.number().nullable(),
);

export const observationForEvalSchema = z.object({
  // Identifiers
  span_id: z.string(),
  trace_id: z.string(),
  project_id: z.string(),
  parent_span_id: z.string().nullish(),

  // Core properties
  type: z.string(),
  name: z.string(),
  environment: z.string().default(DEFAULT_TRACE_ENVIRONMENT),
  version: z.string().nullish(),
  level: z.string().default(ObservationLevel.DEFAULT),
  status_message: z.string().nullish(),

  // Trace-level properties
  trace_name: z.string().nullish(),
  user_id: z.string().nullish(),
  session_id: z.string().nullish(),
  is_app_root: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  release: z.string().nullish(),

  // Model
  provided_model_name: z.string().nullish(),
  model_parameters: z.unknown().nullish(),

  // Prompt
  prompt_id: z.string().nullish(),
  prompt_name: z.string().nullish(),
  // Accepts string, number, or any other type from ingestion
  prompt_version: z.union([z.string().nullish(), z.number().nullish()]),

  // Usage & Cost - accepts number values directly from ingestion
  provided_usage_details: flexibleUsageCostSchema,
  provided_cost_details: flexibleUsageCostSchema,
  usage_details: flexibleUsageCostSchema,
  cost_details: flexibleUsageCostSchema,

  // Tool calls
  tool_definitions: z.record(z.string(), z.unknown()).default({}),
  tool_calls: z.array(z.unknown()).default([]),
  tool_call_names: z.array(z.string()).default([]),
  tool_call_count: z.number().default(0),

  // Experiment
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_expected_output: z.string().nullish(),
  experiment_item_metadata: z.record(z.string(), z.unknown()).nullish(),
  experiment_item_root_span_id: z.string().nullish(),

  // Data - accepts any type (string, array, object) from different OTEL SDKs
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type ObservationForEval = z.infer<typeof observationForEvalSchema>;

/**
 * Self-contained tool call shape handed to evaluators. Rebuilt from the
 * ClickHouse storage layout, which keeps names in a parallel array
 * (`tool_call_names`) so ClickHouse can filter without JSON parsing.
 */
export const toolCallForEvalSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.unknown(),
  type: z.string(),
  index: z.number(),
});

export type ToolCallForEval = z.infer<typeof toolCallForEvalSchema>;

/**
 * zipObservationToolCalls for camelCase records with loosely typed arrays
 * (tRPC/domain shapes: events batchIO, legacy observations.byId). Malformed
 * names map to "" instead of being dropped — filtering would shift the zip
 * and misattribute every later call's name.
 */
export function zipToolCallsFromRecord(record: object): ToolCallForEval[] {
  const { toolCalls, toolCallNames } = record as {
    toolCalls?: unknown;
    toolCallNames?: unknown;
  };

  return zipObservationToolCalls({
    tool_calls: Array.isArray(toolCalls) ? toolCalls : [],
    tool_call_names: Array.isArray(toolCallNames)
      ? toolCallNames.map((name) => (typeof name === "string" ? name : ""))
      : [],
  });
}

/**
 * Zips the parallel arrays back into named tool call objects.
 * `tool_call_names` is authoritative for count and order: ingestion writes
 * both arrays in lockstep (`convertCallsToArrays`), and stored entries carry
 * no name. `arguments` arrives double-encoded (a JSON string inside the entry
 * JSON) and is parsed to an object; unparsable values stay raw strings.
 */
export function zipObservationToolCalls(
  observation: Pick<ObservationForEval, "tool_calls" | "tool_call_names">,
): ToolCallForEval[] {
  return observation.tool_call_names.map((name, i) => {
    const parsed = parseJsonIfString(observation.tool_calls[i]);
    const entry =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};

    return {
      id: typeof entry.id === "string" ? entry.id : "",
      name,
      arguments: parseJsonIfString(entry.arguments) ?? {},
      type: typeof entry.type === "string" ? entry.type : "",
      index: typeof entry.index === "number" ? entry.index : 0,
    };
  });
}

/**
 * Zips parallel name/value arrays into a plain object, first occurrence wins.
 * Collects into a `Map` so that keys shared with `Object.prototype` (`toString`,
 * `constructor`, `__proto__`, ...) are treated as ordinary metadata keys.
 */
function zipFirstOccurrenceWins<T>(
  names: string[],
  values: T[],
): Record<string, T> {
  const entries = new Map<string, T>();
  names.forEach((name, i) => {
    if (!entries.has(name)) {
      entries.set(name, values[i]);
    }
  });

  return Object.fromEntries(entries);
}

export function convertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval {
  const metadata = metadataArraysToRecord(
    record.metadata_names,
    record.metadata_values,
  );
  const experimentItemMetadata =
    record.experiment_item_metadata_names.length > 0
      ? zipFirstOccurrenceWins(
          record.experiment_item_metadata_names,
          record.experiment_item_metadata_values,
        )
      : undefined;

  const toolCallNames = record.tool_call_names ?? [];
  return observationForEvalSchema.parse({
    ...record,
    metadata,
    experiment_item_metadata: experimentItemMetadata,
    tool_call_count: toolCallNames.length,
  });
}

export type ObservationEvalMappingColumnInternal = keyof Pick<
  ObservationForEval,
  | "input"
  | "output"
  | "metadata"
  | "tool_calls"
  | "experiment_item_expected_output"
  | "experiment_item_metadata"
>;

export interface ObservationEvalVariableColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: string;
  /** Display name for UI */
  name: string;
  /** Description for UI tooltips */
  description: string;
  /** Optional type hint for special handling (e.g., stringObject for metadata) */
  type?: "stringObject";
  internal: ObservationEvalMappingColumnInternal;
}

/**
 * Canonical variable set for code evaluators — one entry per experiment
 * target column below (the id annotation on the column arrays pins them to
 * this list). Web synthesizes rule mappings from it
 * (getCodeEvalVariableMapping) and buildCodeEvalPayload (codeEvalExecution)
 * places each variable in the evaluator payload — see the
 * CODE_EVAL_PAYLOAD_SECTION_BY_VARIABLE tripwire in codeEvalDispatcherTypes.
 */
export const CODE_EVAL_TEMPLATE_VARIABLES = [
  "input",
  "output",
  "metadata",
  "toolCalls",
  "experimentItemExpectedOutput",
  "experimentItemMetadata",
] as const;

export type CodeEvalTemplateVariable =
  (typeof CODE_EVAL_TEMPLATE_VARIABLES)[number];

export function getCodeEvalVariableMapping() {
  return CODE_EVAL_TEMPLATE_VARIABLES.map((variable) => ({
    templateVariable: variable,
    selectedColumnId: variable,
    jsonSelector: null,
  }));
}

export const eventTargetEvalVariableColumns: (ObservationEvalVariableColumn & {
  id: CodeEvalTemplateVariable;
})[] = [
  {
    id: "input",
    name: "Input",
    description: "Observation input data",
    internal: "input",
  },
  {
    id: "output",
    name: "Output",
    description: "Observation output data",
    internal: "output",
  },
  {
    id: "metadata",
    name: "Metadata",
    description: "Observation metadata",
    type: "stringObject",
    internal: "metadata",
  },
  {
    id: "toolCalls",
    name: "Tool Calls",
    description:
      "Tool calls recorded on the observation ({id, name, arguments, type, index})",
    internal: "tool_calls",
  },
];

export const experimentTargetEvalVariableColumns: (ObservationEvalVariableColumn & {
  id: CodeEvalTemplateVariable;
})[] = [
  ...eventTargetEvalVariableColumns,
  {
    id: "experimentItemExpectedOutput",
    name: "Expected Output",
    description: "Expected output from experiment item",
    internal: "experiment_item_expected_output",
  },
  {
    id: "experimentItemMetadata",
    name: "Experiment Item Metadata",
    description: "Metadata from experiment item",
    type: "stringObject",
    internal: "experiment_item_metadata",
  },
];

/**
 * Columns available for variable extraction in observation-based evals.
 * These are the fields that can be mapped to template variables.
 *
 * When configuring an eval, users can map these columns to template
 * variables like {{input}}, {{output}}, {{expected_output}}, etc.
 */
export const observationEvalVariableColumns: ObservationEvalVariableColumn[] = [
  ...experimentTargetEvalVariableColumns,
];

export {
  mapEventEvalFilterColumnIdToField,
  type ObservationEvalFilterColumnInternal,
} from "./filterFields";
export {
  observationEvalFilterColumns,
  eventsEvalFilterColumns,
  observationEvalFilterColsWithOptions,
  type ObservationEvalOptions,
} from "./spanFilters";
export {
  experimentEvalFilterColumns,
  experimentEvalFilterColsWithOptions,
  type ExperimentEvalOptions,
} from "./experimentFilters";
