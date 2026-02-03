import { z } from "zod/v4";
import { DEFAULT_TRACE_ENVIRONMENT } from "../../server/ingestion/types";
import { type EventRecordBaseType } from "../../server/repositories/definitions";
import { ObservationLevel } from "../../domain";

const flexibleUsageCostSchema = z.record(z.string(), z.number().nullable());

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

  // Experiment
  experiment_id: z.string().nullish(),
  experiment_name: z.string().nullish(),
  experiment_description: z.string().nullish(),
  experiment_dataset_id: z.string().nullish(),
  experiment_item_id: z.string().nullish(),
  experiment_item_expected_output: z.string().nullish(),
  experiment_item_root_span_id: z.string().nullish(),

  // Data - accepts any type (string, array, object) from different OTEL SDKs
  input: z.unknown().nullish(),
  output: z.unknown().nullish(),
  metadata: z.record(z.string(), z.unknown()).nullish(),
});

export type ObservationForEval = z.infer<typeof observationForEvalSchema>;

export function convertEventRecordToObservationForEval(
  record: EventRecordBaseType,
): ObservationForEval {
  return observationForEvalSchema.parse(record);
}

export interface ObservationEvalFilterColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: keyof Pick<
    ObservationForEval,
    | "type"
    | "name"
    | "environment"
    | "level"
    | "version"
    | "release"
    | "trace_name"
    | "user_id"
    | "session_id"
    | "tags"
    | "experiment_dataset_id"
    | "metadata"
  >;
  /** Display name for UI */
  name: string;
  /** Filter type for UI rendering */
  type: "string" | "stringOptions" | "stringObject" | "arrayOptions" | "number";
}

/**
 * Columns available for filtering in observation-based evals.
 * Maps to InMemoryFilterService column mapper.
 *
 * These columns can be used in filter conditions to determine
 * which observations should be evaluated.
 */
export const observationEvalFilterColumns: ObservationEvalFilterColumn[] = [
  // Observation properties
  { id: "type", name: "Type", type: "stringOptions" },
  { id: "name", name: "Name", type: "string" },
  { id: "environment", name: "Environment", type: "stringOptions" },
  { id: "level", name: "Level", type: "stringOptions" },
  { id: "version", name: "Version", type: "string" },
  { id: "release", name: "Release", type: "string" },
  { id: "trace_name", name: "Trace Name", type: "string" },
  { id: "user_id", name: "User ID", type: "string" },
  { id: "session_id", name: "Session ID", type: "string" },
  { id: "tags", name: "Tags", type: "arrayOptions" },
  { id: "experiment_dataset_id", name: "Dataset", type: "stringOptions" },
  { id: "metadata", name: "Metadata", type: "stringObject" },
];

export interface ObservationEvalVariableColumn {
  /** Column identifier (must match an ObservationForEval field name) */
  id: keyof Pick<
    ObservationForEval,
    "input" | "output" | "metadata" | "experiment_item_expected_output"
  >;
  /** Display name for UI */
  name: string;
  /** Description for UI tooltips */
  description: string;
  /** Optional type hint for special handling (e.g., stringObject for metadata) */
  type?: "stringObject";
}

/**
 * Columns available for variable extraction in observation-based evals.
 * These are the fields that can be mapped to template variables.
 *
 * When configuring an eval, users can map these columns to template
 * variables like {{input}}, {{output}}, {{expected_output}}, etc.
 */
export const observationEvalVariableColumns: ObservationEvalVariableColumn[] = [
  {
    id: "input",
    name: "Input",
    description: "Observation input data",
  },
  {
    id: "output",
    name: "Output",
    description: "Observation output data",
  },
  {
    id: "metadata",
    name: "Metadata",
    description: "Observation metadata",
    type: "stringObject",
  },

  {
    id: "experiment_item_expected_output",
    name: "Experiment Item Expected Output",
    description: "Expected output from experiment item",
  },
];
